/**
 * P3 B 档：在 PDF 单页上根据 quote 近似匹配文本层并生成视口坐标矩形（用于半透明覆盖层）。
 * 扫描版/无文本层时返回 scan；无法匹配时返回 none（由 UI 降级为提示条）。
 */
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

export type QuoteHighlightRectsResult =
  | { kind: 'rects'; rects: { left: number; top: number; width: number; height: number }[] }
  | { kind: 'none' }
  | { kind: 'scan' };

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param viewport 须与 canvas 渲染同一 scale（如 renderPdfPageToCanvas 所用）
 */
export async function computeQuoteHighlightRects(
  page: PDFPageProxy,
  viewport: PageViewport,
  quote: string
): Promise<QuoteHighlightRectsResult> {
  const q = norm(quote).slice(0, 120);
  if (!q) return { kind: 'none' };

  const tc = await page.getTextContent();
  const items = tc.items as Array<{
    str: string;
    transform: number[];
    width?: number;
    height?: number;
  }>;

  if (items.length === 0) return { kind: 'scan' };

  let merged = '';
  const spanRanges: { start: number; end: number; i: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i].str || '';
    const start = merged.length;
    merged += s;
    spanRanges.push({ start, end: merged.length, i });
    merged += ' ';
  }

  const full = norm(merged);
  const qn = norm(q);
  let from = full.indexOf(qn);
  if (from < 0 && qn.length > 12) {
    const prefix = qn.slice(0, Math.min(48, qn.length));
    from = full.indexOf(prefix);
  }
  if (from < 0) return { kind: 'none' };

  const matchLen = from === full.indexOf(qn) ? qn.length : Math.min(48, qn.length);
  const to = Math.min(from + matchLen, full.length);

  const rects: { left: number; top: number; width: number; height: number }[] = [];

  for (const span of spanRanges) {
    if (span.end <= from || span.start >= to) continue;
    const item = items[span.i];
    const m = item.transform;
    const x = m[4];
    const y = m[5];
    const fontH = Math.sqrt(m[2] * m[2] + m[3] * m[3]) || Math.abs(m[3]) || 12;
    const w = item.width ?? 0;
    const rectPdf = [x, y - fontH, x + w, y] as [number, number, number, number];
    try {
      const vp = viewport.convertToViewportRectangle(rectPdf);
      const left = Math.min(vp[0], vp[2]);
      const top = Math.min(vp[1], vp[3]);
      const width = Math.abs(vp[2] - vp[0]);
      const height = Math.abs(vp[3] - vp[1]);
      if (width > 0.5 && height > 0.5) {
        rects.push({ left, top, width, height });
      }
    } catch {
      /* 单条跳过 */
    }
  }

  if (rects.length === 0) {
    const totalChars = items.reduce((a, it) => a + (it.str?.length ?? 0), 0);
    if (totalChars < 8) return { kind: 'scan' };
    return { kind: 'none' };
  }

  return { kind: 'rects', rects };
}
