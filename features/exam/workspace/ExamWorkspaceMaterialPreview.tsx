/**
 * P0/P2：备考台讲义预览 — 手动选材料 + 页码，单页 canvas；切换材料时恢复该材料上次浏览页（IndexedDB 式内存，仅会话内）。
 * P1 链钮跳转指定页后，用户仍可用上一页/下一页浏览相邻页。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CornerUpLeft, Loader2, X, ZoomIn } from 'lucide-react';
import type { ExamMaterialLink } from '@/types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfDocumentFromFile, renderPdfPageToCanvas } from '@/utils/pdfUtils';
import { computeQuoteHighlightRects } from '@/utils/pdfQuoteHighlight';

const THUMB_TARGET_WIDTH = 120;
const THUMB_CONCURRENCY = 2;
const PREFETCH_AROUND_CURRENT = 5;
const INITIAL_BATCH = 18;

/**
 * 弹窗内 PDF 缩放：按视口宽度适配（约 92vw 与 1200px 取小作为目标宽度），相对 scale=1 的页宽计算 scale，
 * 并夹在 [2.2, 3] 之间，保证比侧栏 1.35 明显更清晰且不超过 pdf.js 合理上限。
 */
async function computeModalPdfScale(pdf: PDFDocumentProxy, pageNumber1Based: number): Promise<number> {
  const page = await pdf.getPage(pageNumber1Based);
  const vp1 = page.getViewport({ scale: 1 });
  const pageW = vp1.width;
  if (typeof window === 'undefined' || pageW <= 0) return 2.5;
  const maxW = Math.min(window.innerWidth * 0.92, 1200);
  let scale = maxW / pageW;
  return Math.min(3, Math.max(2.2, scale));
}

export interface ExamWorkspaceMaterialPreviewProps {
  materials: ExamMaterialLink[];
  /** 与 App 内 getDocContentForExamLink 同源：拿到可喂给 pdfjs 的 File，否则 null */
  resolveExamMaterialPdf: (link: ExamMaterialLink) => Promise<File | null>;
  className?: string;
  /** 画布区域最大高度（Tailwind 类），默认侧栏高度；移动端 Sheet 可传更大或 `flex-1 min-h-0` */
  canvasScrollClassName?: string;
  /**
   * P1：外部驱动选中材料 + 页码（如 AI 引用链钮）。`requestId` 每次递增以重复跳同一页。
   */
  previewJumpRequest?: {
    linkId: string;
    page: number;
    requestId: number;
    quote?: string;
    paragraphIndex?: number;
  } | null;
  /** P3 C：回到对话中对应段落 */
  onBackToParagraph?: () => void;
}

export const ExamWorkspaceMaterialPreview: React.FC<ExamWorkspaceMaterialPreviewProps> = ({
  materials,
  resolveExamMaterialPdf,
  className = '',
  canvasScrollClassName = 'max-h-[min(60vh,520px)]',
  previewJumpRequest = null,
  onBackToParagraph,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbListRef = useRef<HTMLDivElement | null>(null);
  const thumbItemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pdfCacheRef = useRef<Map<string, PDFDocumentProxy>>(new Map());
  /** P1：程序化跳转时，在 PDF 加载完成后写入页码（优先于默认第 1 页） */
  const pendingJumpPageRef = useRef<number | null>(null);
  /** P2：按 link.id 记住上次浏览页，下拉切换材料时恢复（与 P1 跳转不冲突：跳转会更新此映射） */
  const lastPageByLinkIdRef = useRef<Map<string, number>>(new Map());
  const lastJumpRequestIdRef = useRef<number | null>(null);

  const [selectedId, setSelectedId] = useState<string>('');
  const [pageInput, setPageInput] = useState('1');
  const [pageClampedHint, setPageClampedHint] = useState<string | null>(null);

  const [loadingFile, setLoadingFile] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [thumbDataUrls, setThumbDataUrls] = useState<(string | null)[]>([]);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbBusyPages, setThumbBusyPages] = useState<Set<number>>(new Set());
  const [thumbFailedPages, setThumbFailedPages] = useState<Set<number>>(new Set());
  const thumbCacheRef = useRef<Map<string, (string | null)[]>>(new Map());
  const thumbQueueRef = useRef<number[]>([]);
  const thumbQueuedSetRef = useRef<Set<number>>(new Set());
  const thumbInFlightRef = useRef(0);
  const thumbBusyPagesRef = useRef<Set<number>>(new Set());
  const thumbFailedPagesRef = useRef<Set<number>>(new Set());
  const thumbSchedulerVersionRef = useRef(0);
  const thumbRequestPagesRef = useRef<(pages: number[]) => void>(() => {});
  const thumbAutoScrollTimerRef = useRef<number | null>(null);
  const thumbLastClickRef = useRef<{ page: number; ts: number } | null>(null);
  /** P2：从链钮/程序化跳转打开时短暂高亮页码区 */
  const [pageHighlight, setPageHighlight] = useState(false);
  /** P3 B：quote 在文本层上的高亮矩形（视口 px，与 canvas 对齐） */
  const [quoteHighlightRects, setQuoteHighlightRects] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  /** P3 B2：无法匹配时顶部提示摘录 */
  const [quoteFallbackBanner, setQuoteFallbackBanner] = useState<string | null>(null);
  /** P3 B3：扫描件提示（一次性） */
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [modalRenderBusy, setModalRenderBusy] = useState(false);

  const selectedLink = useMemo(
    () => materials.find((m) => m.id === selectedId) ?? null,
    [materials, selectedId]
  );

  /** 卸载时销毁缓存的 PDF 代理 */
  useEffect(() => {
    const cache = pdfCacheRef.current;
    return () => {
      cache.forEach((pdf) => {
        try {
          pdf.destroy();
        } catch {
          /* ignore */
        }
      });
      cache.clear();
    };
  }, []);

  /** 材料列表变化：若当前选中不在列表则清空 */
  useEffect(() => {
    if (!materials.length) {
      setSelectedId('');
      return;
    }
    if (selectedId && !materials.some((m) => m.id === selectedId)) {
      setSelectedId('');
    }
  }, [materials, selectedId]);

  /** P1：父级驱动跳转（选中材料 + 页码；已缓存 PDF 时直接翻页） */
  useEffect(() => {
    if (!previewJumpRequest) return;
    const { linkId, page } = previewJumpRequest;
    if (!materials.some((m) => m.id === linkId)) return;
    const targetPage = Math.max(1, Math.floor(page));
    const cached = pdfCacheRef.current.get(linkId);

    if (cached) {
      const clamped = Math.min(Math.max(1, targetPage), cached.numPages);
      pendingJumpPageRef.current = null;
      setSelectedId(linkId);
      setPageInput(String(clamped));
      return;
    }

    pendingJumpPageRef.current = targetPage;
    setSelectedId(linkId);
    setPageInput(String(targetPage));
  }, [previewJumpRequest, materials]);

  const parsedPage = useMemo(() => {
    const n = parseInt(pageInput.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }, [pageInput]);

  const effectivePage = useMemo(() => {
    if (numPages <= 0) return parsedPage;
    return Math.min(Math.max(1, parsedPage), numPages);
  }, [parsedPage, numPages]);

  /** P2：链钮打开预览时页码区 300ms 高亮 */
  useEffect(() => {
    if (!previewJumpRequest) return;
    const { requestId } = previewJumpRequest;
    if (lastJumpRequestIdRef.current === requestId) return;
    lastJumpRequestIdRef.current = requestId;
    setPageHighlight(true);
    const t = window.setTimeout(() => setPageHighlight(false), 300);
    return () => clearTimeout(t);
  }, [previewJumpRequest]);

  /** P2：会话内记住当前材料当前页码（加载中不写，避免换材料瞬间串页） */
  useEffect(() => {
    if (!selectedId || !numPages || loadingFile) return;
    lastPageByLinkIdRef.current.set(selectedId, effectivePage);
  }, [selectedId, numPages, effectivePage, loadingFile]);

  /** 选中材料后：拉 File → 缓存 PDFDocumentProxy */
  useEffect(() => {
    if (!selectedLink) {
      setNumPages(0);
      setError(null);
      setLoadingFile(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingFile(true);
      setNumPages(0);
      setError(null);
      setPageClampedHint(null);
      try {
        const file = await resolveExamMaterialPdf(selectedLink);
        if (cancelled) return;
        if (!file) {
          if (selectedLink.sourceType === 'sessionId') {
            setError('无法从云端拉取该 PDF，请检查网络或云端会话是否仍有效。');
          } else {
            setError(
              '本地关联的材料需先在主学习界面打开过该 PDF，才能在此预览页面（与合并讲义文本不同，预览需要原始文件）。'
            );
          }
          setNumPages(0);
          return;
        }

        let pdf = pdfCacheRef.current.get(selectedLink.id);
        if (!pdf) {
          pdf = await loadPdfDocumentFromFile(file);
          if (cancelled) {
            try {
              pdf.destroy();
            } catch {
              /* ignore */
            }
            return;
          }
          pdfCacheRef.current.set(selectedLink.id, pdf);
        }
        setNumPages(pdf.numPages);
        const pend = pendingJumpPageRef.current;
        if (pend != null) {
          pendingJumpPageRef.current = null;
          setPageInput(String(Math.max(1, Math.min(pend, pdf.numPages))));
        } else {
          setPageInput('1');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载 PDF 失败');
          setNumPages(0);
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLink, resolveExamMaterialPdf]);

  /** 页码或文档变化：渲染 canvas */
  useEffect(() => {
    if (!selectedLink || !numPages || loadingFile) return;
    const pdf = pdfCacheRef.current.get(selectedLink.id);
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    let page = parsedPage;
    if (page < 1) page = 1;
    if (page > numPages) page = numPages;
    if (page !== parsedPage) {
      setPageClampedHint(`已调整为第 ${page} 页（共 ${numPages} 页）`);
      setPageInput(String(page));
    } else {
      setPageClampedHint(null);
    }

    let cancelled = false;
    (async () => {
      setRenderBusy(true);
      try {
        await renderPdfPageToCanvas(pdf, page, canvas, 1.35);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '渲染失败');
      } finally {
        if (!cancelled) setRenderBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLink, numPages, parsedPage, loadingFile]);

  /** 缩略图阶段二：按需增量 + 并发受控 + 缓存复用 */
  useEffect(() => {
    const linkId = selectedLink?.id;
    if (!linkId || numPages <= 0 || loadingFile) {
      setThumbDataUrls([]);
      setThumbBusyPages(new Set());
      setThumbFailedPages(new Set());
      setThumbBusy(false);
      setThumbError(null);
      thumbQueueRef.current = [];
      thumbQueuedSetRef.current.clear();
      thumbInFlightRef.current = 0;
      thumbBusyPagesRef.current = new Set();
      thumbFailedPagesRef.current = new Set();
      thumbRequestPagesRef.current = () => {};
      return;
    }
    const pdf = pdfCacheRef.current.get(linkId);
    if (!pdf) {
      setThumbDataUrls([]);
      setThumbBusyPages(new Set());
      setThumbFailedPages(new Set());
      setThumbBusy(false);
      setThumbError(null);
      thumbQueueRef.current = [];
      thumbQueuedSetRef.current.clear();
      thumbInFlightRef.current = 0;
      thumbBusyPagesRef.current = new Set();
      thumbFailedPagesRef.current = new Set();
      thumbRequestPagesRef.current = () => {};
      return;
    }

    const cached = thumbCacheRef.current.get(linkId);
    const initial = Array.from({ length: numPages }, (_, idx) => cached?.[idx] ?? null);
    setThumbDataUrls(initial);
    setThumbBusyPages(new Set());
    setThumbFailedPages(new Set());
    setThumbError(null);
    setThumbBusy(false);
    thumbQueueRef.current = [];
    thumbQueuedSetRef.current.clear();
    thumbInFlightRef.current = 0;
    thumbBusyPagesRef.current = new Set();
    thumbFailedPagesRef.current = new Set();

    let cancelled = false;
    const version = ++thumbSchedulerVersionRef.current;

    const syncBusyFlag = () => {
      if (cancelled || thumbSchedulerVersionRef.current !== version) return;
      setThumbBusy(thumbInFlightRef.current > 0 || thumbQueueRef.current.length > 0);
    };

    const addBusyPage = (page: number) => {
      const next = new Set(thumbBusyPagesRef.current);
      next.add(page);
      thumbBusyPagesRef.current = next;
      setThumbBusyPages(next);
    };

    const removeBusyPage = (page: number) => {
      const next = new Set(thumbBusyPagesRef.current);
      next.delete(page);
      thumbBusyPagesRef.current = next;
      setThumbBusyPages(next);
    };

    const addFailedPage = (page: number) => {
      const next = new Set(thumbFailedPagesRef.current);
      next.add(page);
      thumbFailedPagesRef.current = next;
      setThumbFailedPages(next);
    };

    const renderOneThumb = async (pageNumber: number): Promise<string> => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || thumbSchedulerVersionRef.current !== version) return '';
      const vp1 = page.getViewport({ scale: 1 });
      const scale = vp1.width > 0 ? THUMB_TARGET_WIDTH / vp1.width : 1;
      const c = document.createElement('canvas');
      await renderPdfPageToCanvas(pdf, pageNumber, c, scale);
      try {
        return c.toDataURL('image/jpeg', 0.8);
      } catch {
        // 少数环境 jpeg 编码会失败，回退 png
        return c.toDataURL('image/png');
      }
    };

    const pumpThumbQueue = () => {
      if (cancelled || thumbSchedulerVersionRef.current !== version) return;
      while (thumbInFlightRef.current < THUMB_CONCURRENCY && thumbQueueRef.current.length > 0) {
        const page = thumbQueueRef.current.shift();
        if (page == null) break;
        thumbQueuedSetRef.current.delete(page);

        thumbInFlightRef.current += 1;
        addBusyPage(page);
        syncBusyFlag();

        renderOneThumb(page)
          .then((dataUrl) => {
            if (!dataUrl || cancelled || thumbSchedulerVersionRef.current !== version) return;
            setThumbDataUrls((prev) => {
              const idx = page - 1;
              if (idx < 0 || idx >= prev.length) return prev;
              if (prev[idx]) return prev;
              const next = prev.slice();
              next[idx] = dataUrl;
              thumbCacheRef.current.set(linkId, next.slice());
              return next;
            });
          })
          .catch(() => {
            if (!cancelled && thumbSchedulerVersionRef.current === version) {
              addFailedPage(page);
              setThumbError('部分缩略图生成失败，可点击重试');
            }
          })
          .finally(() => {
            if (cancelled || thumbSchedulerVersionRef.current !== version) return;
            thumbInFlightRef.current = Math.max(0, thumbInFlightRef.current - 1);
            removeBusyPage(page);
            syncBusyFlag();
            pumpThumbQueue();
          });
      }
      syncBusyFlag();
    };

    const requestThumbPages = (pages: number[]) => {
      if (cancelled || thumbSchedulerVersionRef.current !== version) return;
      if (!pages.length) return;
      const valid = new Set<number>();
      for (const p of pages) {
        if (!Number.isFinite(p)) continue;
        const page = Math.floor(p);
        if (page < 1 || page > numPages) continue;
        valid.add(page);
      }
      if (!valid.size) return;

      const loaded = thumbCacheRef.current.get(linkId) ?? [];
      for (const page of valid) {
        const idx = page - 1;
        if (loaded[idx]) continue;
        if (thumbBusyPagesRef.current.has(page)) continue;
        if (thumbQueuedSetRef.current.has(page)) continue;
        if (thumbFailedPagesRef.current.has(page)) continue;
        thumbQueueRef.current.push(page);
        thumbQueuedSetRef.current.add(page);
      }
      pumpThumbQueue();
    };

    thumbRequestPagesRef.current = requestThumbPages;
    const around = Array.from({ length: PREFETCH_AROUND_CURRENT * 2 + 1 }, (_, i) => effectivePage - PREFETCH_AROUND_CURRENT + i);
    const initialPages = [
      ...Array.from({ length: Math.min(INITIAL_BATCH, numPages) }, (_, i) => i + 1),
      ...around,
    ];
    requestThumbPages(initialPages);

    return () => {
      cancelled = true;
      thumbRequestPagesRef.current = () => {};
    };
  }, [selectedLink?.id, numPages, loadingFile]);

  /** 当前页变化时，预取附近缩略图 */
  useEffect(() => {
    if (!selectedLink?.id || !numPages || loadingFile) return;
    const pages = Array.from(
      { length: PREFETCH_AROUND_CURRENT * 2 + 1 },
      (_, i) => effectivePage - PREFETCH_AROUND_CURRENT + i
    );
    thumbRequestPagesRef.current(pages);
  }, [selectedLink?.id, numPages, loadingFile, effectivePage]);

  /** 滚动懒加载：可视区与邻近项进入视口时请求该页及附近页 */
  useEffect(() => {
    if (!selectedLink?.id || !numPages || loadingFile) return;
    const root = thumbListRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const pages: number[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const pageAttr = el.dataset.page;
          if (!pageAttr) continue;
          const p = Number(pageAttr);
          if (!Number.isFinite(p)) continue;
          pages.push(p - 1, p, p + 1);
        }
        if (pages.length) thumbRequestPagesRef.current(pages);
      },
      { root, rootMargin: '200px 0px' }
    );

    for (let p = 1; p <= numPages; p += 1) {
      const el = thumbItemRefs.current[p];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [selectedLink?.id, numPages, loadingFile]);

  /** 当前页变化时自动滚动缩略图到可视区中部附近（桌面交互增强） */
  useEffect(() => {
    if (!selectedLink?.id || !numPages || loadingFile) return;
    const container = thumbListRef.current;
    const el = thumbItemRefs.current[effectivePage];
    if (!container || !el) return;

    const isVisibleWithPadding = (target: HTMLElement, root: HTMLElement, padding = 28) => {
      const top = target.offsetTop;
      const bottom = top + target.offsetHeight;
      const viewTop = root.scrollTop + padding;
      const viewBottom = root.scrollTop + root.clientHeight - padding;
      return top >= viewTop && bottom <= viewBottom;
    };

    if (thumbAutoScrollTimerRef.current != null) {
      window.clearTimeout(thumbAutoScrollTimerRef.current);
    }
    thumbAutoScrollTimerRef.current = window.setTimeout(() => {
      const curContainer = thumbListRef.current;
      const curEl = thumbItemRefs.current[effectivePage];
      if (!curContainer || !curEl) return;
      if (!isVisibleWithPadding(curEl, curContainer)) {
        curEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 100);

    return () => {
      if (thumbAutoScrollTimerRef.current != null) {
        window.clearTimeout(thumbAutoScrollTimerRef.current);
        thumbAutoScrollTimerRef.current = null;
      }
    };
  }, [effectivePage, selectedLink?.id, numPages, loadingFile]);

  /** 放大弹窗：复用 pdfCacheRef，按 computeModalPdfScale 渲染当前 effectivePage；页码/材料变化时同步重绘 */
  useEffect(() => {
    if (!zoomModalOpen || !selectedLink || !numPages || loadingFile) return;
    const pdf = pdfCacheRef.current.get(selectedLink.id);
    const canvas = modalCanvasRef.current;
    if (!pdf || !canvas) {
      if (!pdf) setZoomModalOpen(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setModalRenderBusy(true);
      try {
        const scale = await computeModalPdfScale(pdf, effectivePage);
        if (cancelled) return;
        await renderPdfPageToCanvas(pdf, effectivePage, canvas, scale);
      } catch (e) {
        if (!cancelled) console.error('[ExamWorkspaceMaterialPreview] modal render', e);
      } finally {
        if (!cancelled) setModalRenderBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zoomModalOpen, selectedLink, numPages, effectivePage, loadingFile]);

  /** Esc 关闭弹窗；打开时注册，关闭时移除 */
  useEffect(() => {
    if (!zoomModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomModalOpen]);

  /** P3 B：链钮带 quote 且当前页/材料与跳转一致时尝试文本高亮；换页则清除 */
  useEffect(() => {
    let cancelled = false;
    setQuoteHighlightRects([]);
    setQuoteFallbackBanner(null);
    setScanNotice(null);

    const pj = previewJumpRequest;
    const q = pj?.quote?.trim();
    if (!pj || !q || !selectedId || selectedId !== pj.linkId || effectivePage !== pj.page || !numPages || loadingFile) {
      return;
    }

    const pdf = pdfCacheRef.current.get(selectedId);
    if (!pdf) return;

    (async () => {
      try {
        const page = await pdf.getPage(effectivePage);
        const viewport = page.getViewport({ scale: 1.35 });
        const res = await computeQuoteHighlightRects(page, viewport, q);
        if (cancelled) return;
        if (res.kind === 'rects' && res.rects.length > 0) {
          setQuoteHighlightRects(res.rects);
          setQuoteFallbackBanner(null);
        } else if (res.kind === 'scan') {
          setScanNotice('该页可能为扫描件，无法自动高亮文本。');
          window.setTimeout(() => setScanNotice(null), 4000);
        } else {
          setQuoteFallbackBanner(q);
        }
      } catch {
        if (!cancelled) setQuoteFallbackBanner(q);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    previewJumpRequest?.requestId,
    previewJumpRequest?.quote,
    previewJumpRequest?.page,
    previewJumpRequest?.linkId,
    selectedId,
    effectivePage,
    numPages,
    loadingFile,
  ]);

  const goPrev = useCallback(() => {
    if (numPages <= 0) return;
    const p = Math.max(1, effectivePage - 1);
    setPageInput(String(p));
  }, [effectivePage, numPages]);

  const goNext = useCallback(() => {
    if (numPages <= 0) return;
    const p = Math.min(numPages, effectivePage + 1);
    setPageInput(String(p));
  }, [effectivePage, numPages]);

  const closeZoomModal = useCallback(() => setZoomModalOpen(false), []);

  const onPageBlur = useCallback(() => {
    if (!numPages) return;
    const n = parseInt(pageInput.replace(/\D/g, ''), 10);
    let p = Number.isFinite(n) && n >= 1 ? n : 1;
    if (p > numPages) {
      setPageClampedHint(`已调整为第 ${numPages} 页（共 ${numPages} 页）`);
      p = numPages;
    } else if (p < 1) {
      setPageClampedHint(`已调整为第 1 页（共 ${numPages} 页）`);
      p = 1;
    } else {
      setPageClampedHint(null);
    }
    setPageInput(String(p));
  }, [pageInput, numPages]);

  const handleThumbnailClick = useCallback(
    (page: number) => {
      if (page === effectivePage) return;
      const now = Date.now();
      const last = thumbLastClickRef.current;
      if (last && last.page === page && now - last.ts < 100) return;
      thumbLastClickRef.current = { page, ts: now };
      setPageInput(String(page));
    },
    [effectivePage]
  );

  const getThumbItemClassName = useCallback(
    (page: number) => {
      const active = effectivePage === page;
      return (
        'w-full rounded-lg border p-1 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ' +
        (active
          ? 'border-indigo-500 ring-2 ring-indigo-300 bg-indigo-50 shadow-sm'
          : 'border-stone-200 bg-white hover:bg-stone-100 hover:border-stone-300 hover:shadow-sm')
      );
    },
    [effectivePage]
  );

  const renderThumbnailItem = useCallback(
    (page: number) => {
      const src = thumbDataUrls[page - 1] ?? null;
      const active = effectivePage === page;
      const pageBusy = thumbBusyPages.has(page);
      const pageFailed = thumbFailedPages.has(page);
      return (
        <div
          key={`${selectedId}-thumb-${page}`}
          data-page={page}
          ref={(el) => {
            thumbItemRefs.current[page] = el;
          }}
        >
          <button
            type="button"
            onClick={() => handleThumbnailClick(page)}
            disabled={loadingFile || numPages === 0}
            className={getThumbItemClassName(page)}
            title={`跳转到第 ${page} 页`}
            aria-label={`跳转到第 ${page} 页`}
            aria-current={active ? 'page' : undefined}
          >
            {src ? (
              <img
                src={src}
                alt={`第 ${page} 页缩略图`}
                className="w-full h-auto rounded border border-stone-100 bg-white"
              />
            ) : (
              <div className="w-full aspect-[3/4] rounded border border-stone-200 bg-gradient-to-b from-stone-100 to-stone-200/70 animate-pulse" />
            )}
            <span
              className={`mt-1 block text-center text-[10px] font-medium tabular-nums ${
                active ? 'text-indigo-700' : 'text-slate-600'
              }`}
            >
              {page}
              {pageBusy ? ' · 加载中' : ''}
            </span>
          </button>
          {pageFailed && (
            <button
              type="button"
              onClick={() => {
                setThumbFailedPages((prev) => {
                  const next = new Set(prev);
                  next.delete(page);
                  thumbFailedPagesRef.current = next;
                  return next;
                });
                thumbRequestPagesRef.current([page]);
              }}
              className="mt-1 w-full rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 hover:bg-rose-100"
            >
              重试第 {page} 页
            </button>
          )}
        </div>
      );
    },
    [
      thumbDataUrls,
      effectivePage,
      thumbBusyPages,
      thumbFailedPages,
      selectedId,
      loadingFile,
      numPages,
      getThumbItemClassName,
      handleThumbnailClick
    ]
  );

  if (!materials.length) {
    return (
      <div className={`rounded-2xl border border-stone-200 bg-white/90 p-4 text-sm text-slate-600 ${className}`}>
        <p className="font-bold text-slate-800 mb-1">讲义预览（P0 手动）</p>
        <p>请选择本场关联材料（考试中心关联 PDF 后刷新）。</p>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col rounded-2xl border border-stone-200 bg-white shadow-sm ${className}`}
    >
      <div className="shrink-0 border-b border-stone-100 px-3 py-2 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800">讲义预览（P0 手动）</p>
            <p className="text-[10px] text-slate-500 mt-0.5">可手动选页；助手引用可带段落对齐（P3）与文本高亮（文本型 PDF）。</p>
          </div>
          {onBackToParagraph && (
            <button
              type="button"
              onClick={onBackToParagraph}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 py-1 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100"
            >
              <CornerUpLeft className="w-3.5 h-3.5" />
              回到本段引用
            </button>
          )}
        </div>
        {scanNotice && (
          <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">{scanNotice}</p>
        )}
        {quoteFallbackBanner && (
          <p className="text-[10px] text-slate-700 bg-amber-50/90 border border-amber-200 rounded px-2 py-1.5 leading-snug">
            未能在文本层定位摘录，请在下方讲义中自行查找：
            <span className="font-medium block mt-0.5 break-words">{quoteFallbackBanner}</span>
          </p>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-2 p-3 border-b border-stone-100">
        <label className="text-[11px] font-bold text-slate-600">材料</label>
        <select
          value={selectedId}
          onChange={(e) => {
            pendingJumpPageRef.current = null;
            const id = e.target.value;
            if (id) {
              const mem = lastPageByLinkIdRef.current.get(id);
              if (mem != null && mem >= 1) {
                pendingJumpPageRef.current = mem;
              }
            }
            setSelectedId(id);
          }}
          className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-slate-800"
        >
          <option value="">— 选择本场材料 —</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fileName || '未命名'}
            </option>
          ))}
        </select>

        <div
          className={`flex flex-wrap items-end gap-2 rounded-lg transition-shadow duration-300 ${
            pageHighlight ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white' : ''
          }`}
        >
          <div className="flex-1 min-w-[100px]">
            <label className="text-[11px] font-bold text-slate-600 block mb-0.5">页码（从 1 开始）</label>
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={onPageBlur}
              disabled={!selectedLink || loadingFile || !numPages}
              aria-label={numPages > 0 ? `页码，第 ${effectivePage} 页，共 ${numPages} 页` : '页码'}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs tabular-nums disabled:opacity-50"
            />
          </div>
          <div className="flex gap-1 items-center">
            <button
              type="button"
              onClick={goPrev}
              disabled={!selectedLink || loadingFile || !numPages || effectivePage <= 1}
              aria-disabled={!selectedLink || loadingFile || !numPages || effectivePage <= 1}
              aria-label="上一页"
              className="inline-flex items-center justify-center rounded-lg border border-stone-200 p-1.5 hover:bg-stone-50 disabled:opacity-40"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!selectedLink || loadingFile || !numPages || effectivePage >= numPages}
              aria-disabled={!selectedLink || loadingFile || !numPages || effectivePage >= numPages}
              aria-label="下一页"
              className="inline-flex items-center justify-center rounded-lg border border-stone-200 p-1.5 hover:bg-stone-50 disabled:opacity-40"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {numPages > 0 && (
          <p className="text-[10px] text-slate-600 font-medium tabular-nums">
            第 {effectivePage} / {numPages} 页
            {pageClampedHint ? ` · ${pageClampedHint}` : ''}
          </p>
        )}
        {selectedId && numPages > 0 && (
          <p className="text-[10px] text-slate-500">可在左侧缩略图快速跳页。</p>
        )}
      </div>

      <div className="min-h-0 flex-1 border-t border-stone-100">
        <div className="flex h-full min-h-0">
          <aside className="w-[132px] shrink-0 border-r border-stone-200 bg-stone-50/80">
            <div ref={thumbListRef} className="h-full overflow-y-auto p-2 space-y-2">
              {!selectedId && (
                <p className="text-[10px] text-slate-500 leading-snug">请选择材料后生成缩略图。</p>
              )}
              {selectedId && loadingFile && (
                <p className="text-[10px] text-slate-500 leading-snug">正在加载 PDF…</p>
              )}
              {selectedId && !loadingFile && !error && numPages > 0 && thumbBusy && (
                <p className="text-[10px] text-slate-500 leading-snug">正在生成缩略图…</p>
              )}
              {selectedId && !loadingFile && !error && numPages > 0 && thumbError && (
                <p className="text-[10px] text-rose-600 leading-snug">{thumbError}</p>
              )}
              {selectedId &&
                !loadingFile &&
                !error &&
                numPages > 0 &&
                Array.from({ length: numPages }, (_, i) => renderThumbnailItem(i + 1))}
            </div>
          </aside>

          <div
            className={`relative min-h-0 flex-1 overflow-auto bg-stone-100/80 flex items-start justify-center p-2 ${canvasScrollClassName}`}
          >
            {!selectedId && (
              <p className="text-xs text-slate-500 py-8 px-4 text-center">请选择本场关联材料。</p>
            )}
            {selectedId && loadingFile && (
              <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-xs">正在加载 PDF…</span>
              </div>
            )}
            {selectedId && !loadingFile && error && (
              <p className="text-xs text-red-700 py-4 px-3 leading-relaxed">{error}</p>
            )}
            {selectedId && !loadingFile && !error && numPages > 0 && (
              <div ref={canvasWrapRef} className="relative inline-block max-w-full">
                <canvas ref={canvasRef} className="max-w-full h-auto shadow-md bg-white" />
                {quoteHighlightRects.map((r, hi) => (
                  <div
                    key={`${hi}-${r.left}-${r.top}`}
                    className="absolute pointer-events-none rounded-sm bg-amber-400/35 border border-amber-600/40 mix-blend-multiply"
                    style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                  />
                ))}
                {renderBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setZoomModalOpen(true)}
                  disabled={loadingFile || renderBusy || !selectedId || numPages <= 0}
                  aria-label="放大查看本页"
                  title="放大查看本页"
                  className="absolute bottom-2 right-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200/90 bg-white/95 text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        zoomModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-zoom-dialog-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="关闭预览"
              onClick={closeZoomModal}
            />
            <div
              className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
                <h2 id="pdf-zoom-dialog-title" className="text-sm font-bold text-slate-800">
                  放大预览 · 第 {effectivePage} / {numPages} 页
                  {selectedLink?.fileName ? (
                    <span className="ml-2 font-normal text-slate-500">· {selectedLink.fileName}</span>
                  ) : null}
                </h2>
                <button
                  type="button"
                  onClick={closeZoomModal}
                  className="rounded-lg p-2 text-slate-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative min-h-0 flex-1 overflow-auto bg-stone-100/90 p-3">
                {/* 弹窗内不复现 P3 quote 高亮，侧栏保留即可；若需对齐可后续接同一 rects + scale 映射 */}
                <div className="inline-block min-w-0">
                  <canvas ref={modalCanvasRef} className="h-auto max-w-full bg-white shadow-md" />
                </div>
                {modalRenderBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                    <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
