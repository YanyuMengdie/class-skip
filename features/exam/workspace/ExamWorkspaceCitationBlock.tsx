/**
 * P2：备考台助手气泡内讲义引用 — 聚合链钮、+N、桌面 Tooltip、移动端 ActionSheet
 * PR 说明：采用方案 1 — 首条主链钮 + `+N` 角标；桌面 Hover/聚焦浮层内可逐条点击；移动端无 Hover 时点击打开底部菜单选条。
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import type { ExamMaterialLink } from '@/types';
import type { ExamWorkspaceCitation } from '@/utils/examWorkspaceCitations';

function useMaxWidth1023(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setM(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

function fileLabel(materials: ExamMaterialLink[], materialId: string): string {
  return materials.find((x) => x.id === materialId)?.fileName?.trim() || materialId;
}

export type OpenMaterialPageOptions = { quote?: string; paragraphIndex?: number };

export interface ExamWorkspaceCitationBlockProps {
  citations: ExamWorkspaceCitation[];
  materials: ExamMaterialLink[];
  onOpenMaterialPage: (materialId: string, page: number, opts?: OpenMaterialPageOptions) => void;
  /** P3：与段落并排时使用更小链钮，移动端可仅显示图标+p */
  compact?: boolean;
  /** 默认 true；与段落并排时设为 false，避免重复顶部分隔线 */
  showTopBorder?: boolean;
}

function citationOpts(c: ExamWorkspaceCitation): OpenMaterialPageOptions | undefined {
  const o: OpenMaterialPageOptions = {};
  if (c.quote != null) o.quote = c.quote;
  if (c.paragraphIndex != null) o.paragraphIndex = c.paragraphIndex;
  return Object.keys(o).length ? o : undefined;
}

export const ExamWorkspaceCitationBlock: React.FC<ExamWorkspaceCitationBlockProps> = ({
  citations,
  materials,
  onOpenMaterialPage,
  compact = false,
  showTopBorder = true,
}) => {
  const isMobile = useMaxWidth1023();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const listId = useId();

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current != null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!sheetOpen && !desktopOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheetOpen(false);
        setDesktopOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, desktopOpen]);

  const first = citations[0];
  const extra = citations.length - 1;
  const fn0 = fileLabel(materials, first.materialId);
  const short0 = fn0.length > 18 ? `${fn0.slice(0, 16)}…` : fn0;

  const openFirst = useCallback(() => {
    onOpenMaterialPage(first.materialId, first.page, citationOpts(first));
  }, [first, onOpenMaterialPage]);

  const onMainClick = () => {
    if (isMobile) {
      if (citations.length > 1) setSheetOpen(true);
      else openFirst();
    } else {
      openFirst();
    }
  };

  const onMainEnter = () => {
    if (isMobile) return;
    clearLeaveTimer();
    setDesktopOpen(true);
  };

  const onMainLeave = () => {
    if (isMobile) return;
    leaveTimerRef.current = window.setTimeout(() => setDesktopOpen(false), 120);
  };

  const mainAria =
    citations.length === 1
      ? `打开 ${fn0} 第 ${first.page} 页`
      : `讲义引用共 ${citations.length} 条，打开第一项：${fn0} 第 ${first.page} 页`;

  const titleFallback = `${fn0} · 第 ${first.page} 页`;

  return (
    <div
      className={`flex flex-wrap items-start gap-1.5 ${
        showTopBorder && !compact ? 'mt-2 pt-2 border-t border-stone-200/90' : ''
      } ${compact ? 'max-sm:justify-end' : ''}`}
    >
      <div
        className="relative inline-flex"
        onMouseEnter={onMainEnter}
        onMouseLeave={onMainLeave}
        onFocusCapture={onMainEnter}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            onMainLeave();
          }
        }}
      >
        <button
          type="button"
          aria-label={mainAria}
          title={titleFallback}
          aria-expanded={!isMobile ? desktopOpen : undefined}
          aria-controls={!isMobile ? listId : undefined}
          onClick={onMainClick}
          className={`relative inline-flex items-center gap-1 max-w-full rounded-lg border border-indigo-200 bg-white font-semibold text-indigo-800 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 ${
            compact
              ? 'pl-1.5 pr-1.5 py-0.5 text-[10px] max-sm:gap-0.5'
              : 'pl-2 pr-2 py-1 text-[11px]'
          }`}
        >
          <Link2 className={`shrink-0 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} aria-hidden />
          <span className={`truncate max-w-[140px] sm:max-w-[180px] ${compact ? 'max-sm:hidden max-sm:w-0' : ''}`}>
            {short0}
          </span>
          <span className="shrink-0 tabular-nums text-indigo-600">p.{first.page}</span>
          {extra > 0 && (
            <span
              className="absolute -top-1.5 -right-1 min-w-[1.1rem] h-4 px-0.5 rounded bg-slate-600 text-white text-[10px] font-bold leading-4 text-center shadow-sm"
              aria-hidden
            >
              +{extra}
            </span>
          )}
        </button>

        {/* 桌面：浮层在按钮上方，减少遮挡气泡内正文；单条为摘要，多条为可点击列表 */}
        {!isMobile && citations.length === 1 && (
          <div
            id={listId}
            role="tooltip"
            className={`absolute left-0 bottom-full mb-1 z-[60] w-max max-w-[min(100vw-2rem,280px)] rounded-lg border border-stone-200 bg-white px-2.5 py-2 shadow-lg transition-opacity duration-150 ${
              desktopOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onMouseEnter={() => {
              clearLeaveTimer();
              setDesktopOpen(true);
            }}
            onMouseLeave={() => {
              leaveTimerRef.current = window.setTimeout(() => setDesktopOpen(false), 120);
            }}
          >
            <p className="text-xs font-medium text-slate-900 truncate" title={fn0}>
              {fn0}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">第 {first.page} 页</p>
          </div>
        )}
        {!isMobile && citations.length > 1 && (
          <div
            id={listId}
            role="tooltip"
            className={`absolute left-0 bottom-full mb-1 z-[60] min-w-[220px] max-w-[min(100vw-2rem,320px)] rounded-xl border border-stone-200 bg-white py-2 px-2 shadow-lg transition-opacity duration-150 ${
              desktopOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            onMouseEnter={() => {
              clearLeaveTimer();
              setDesktopOpen(true);
            }}
            onMouseLeave={() => {
              leaveTimerRef.current = window.setTimeout(() => setDesktopOpen(false), 120);
            }}
          >
            <p className="text-[10px] font-bold text-slate-500 px-1 pb-1">讲义引用（{citations.length}）</p>
            <ul className="space-y-1 max-h-[min(40vh,240px)] overflow-y-auto">
              {citations.map((c, idx) => {
                const fn = fileLabel(materials, c.materialId);
                const st = fn.length > 36 ? `${fn.slice(0, 34)}…` : fn;
                return (
                  <li key={`${c.materialId}-${c.page}-${idx}`}>
                    <button
                      type="button"
                      className="w-full text-left rounded-lg px-2 py-1.5 text-[11px] text-slate-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
                      aria-label={`打开 ${fn} 第 ${c.page} 页`}
                      onClick={() => {
                        onOpenMaterialPage(c.materialId, c.page, citationOpts(c));
                        setDesktopOpen(false);
                      }}
                    >
                      <span className="block truncate font-medium text-slate-900">{st}</span>
                      <span className="text-[10px] text-slate-500">第 {c.page} 页</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* 移动端：多条引用 — 底部 ActionSheet */}
      {isMobile && sheetOpen && citations.length > 1 && (
        <div
          className="fixed inset-0 z-[120] flex flex-col justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="选择讲义引用"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="关闭"
            onClick={() => setSheetOpen(false)}
          />
          <div className="relative rounded-t-2xl bg-white shadow-2xl border-t border-stone-200 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <span className="text-sm font-bold text-slate-800">讲义引用（{citations.length}）</span>
              <button
                type="button"
                className="p-2 rounded-lg text-slate-500 hover:bg-stone-100"
                aria-label="关闭"
                onClick={() => setSheetOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="overflow-y-auto p-2 space-y-1 pb-6">
              {citations.map((c, idx) => {
                const fn = fileLabel(materials, c.materialId);
                return (
                  <li key={`${c.materialId}-${c.page}-${idx}`}>
                    <button
                      type="button"
                      className="w-full text-left rounded-xl px-3 py-3 text-sm text-slate-800 bg-stone-50 hover:bg-indigo-50 border border-stone-100"
                      onClick={() => {
                        onOpenMaterialPage(c.materialId, c.page, citationOpts(c));
                        setSheetOpen(false);
                      }}
                    >
                      <span className="font-semibold block truncate">{fn}</span>
                      <span className="text-xs text-slate-500">第 {c.page} 页</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
