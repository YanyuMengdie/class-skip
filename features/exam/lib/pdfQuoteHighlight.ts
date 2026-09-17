/** Exact normalized quote matching, with conservative whole-text-item rectangles in viewport coordinates. */
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

export type QuoteHighlightRectsResult =
  | { kind: 'rects'; rects: { left: number; top: number; width: number; height: number }[] }
  | { kind: 'none' }
  | { kind: 'scan' };

interface TextSpan { str: string; transform: number[]; width?: number; fontName?: string }
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '');

/** Item ranges must use the same normalized coordinates as quote matching. */
function normalizedSpans(items: TextSpan[]) {
  let raw = '';
  const owners: number[] = [];
  items.forEach((item, index) => {
    raw += item.str;
    for (let offset = 0; offset < item.str.length; offset++) owners.push(index);
  });
  let full = '';
  const ranges = items.map(() => ({ start: Infinity, end: -1 }));
  // A base character and combining mark can be split across PDF items.
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(raw)) {
    const normalized = compact(part.segment);
    if (!normalized) continue;
    const start = full.length;
    full += normalized;
    for (let offset = part.index; offset < part.index + part.segment.length; offset++) {
      const range = ranges[owners[offset]];
      range.start = Math.min(range.start, start);
      range.end = full.length;
    }
  }
  return { full, ranges };
}

/** viewport must be the same viewport used to render the PDF canvas. */
export async function computeQuoteHighlightRects(
  page: PDFPageProxy,
  viewport: PageViewport,
  quote: string
): Promise<QuoteHighlightRectsResult> {
  const target = compact(quote);
  if (!target) return { kind: 'none' };
  const content = await page.getTextContent();
  const items = content.items.filter((item): item is typeof content.items[number] & TextSpan =>
    'str' in item && typeof item.str === 'string');
  const { full, ranges } = normalizedSpans(items);
  if (!full) return { kind: 'scan' };
  const from = full.indexOf(target);
  // A prefix match cannot establish that this is the quoted sentence.
  if (from < 0) return { kind: 'none' };
  const to = from + target.length;
  const rects: Extract<QuoteHighlightRectsResult, { kind: 'rects' }>['rects'] = [];
  for (let index = 0; index < items.length; index++) {
    if (ranges[index].end <= from || ranges[index].start >= to) continue;
    const item = items[index];
    const matrix = item.transform;
    if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(Number.isFinite)
      || !Number.isFinite(item.width) || item.width! <= 0) return { kind: 'none' };
    const [a, b, c, d, x, y] = matrix;
    const baselineScale = Math.hypot(a, b);
    const fontHeight = Math.hypot(c, d);
    if (!baselineScale || !fontHeight) return { kind: 'none' };
    const style = item.fontName ? content.styles?.[item.fontName] : undefined;
    // Vertical writing requires different advance metrics; avoid guessing a horizontal rectangle.
    if (style?.vertical) return { kind: 'none' };
    const ascent = Number.isFinite(style?.ascent) && style!.ascent! > 0 ? style!.ascent! : 0.8;
    const descent = Number.isFinite(style?.descent) && style!.descent! <= 0 ? style!.descent! : -0.2;
    const advanceX = a / baselineScale * item.width!;
    const advanceY = b / baselineScale * item.width!;
    // In PDF space ascenders extend upward from the baseline, not below it.
    const corners = [
      [x + c * descent, y + d * descent],
      [x + c * ascent, y + d * ascent],
      [x + advanceX + c * descent, y + advanceY + d * descent],
      [x + advanceX + c * ascent, y + advanceY + d * ascent],
    ];
    try {
      const points = corners.map(([px, py]) => viewport.convertToViewportPoint(px, py));
      if (!points.every(point => point.length === 2 && point.every(Number.isFinite))) return { kind: 'none' };
      const left = Math.max(0, Math.min(...points.map(point => point[0])));
      const top = Math.max(0, Math.min(...points.map(point => point[1])));
      const right = Math.min(viewport.width, Math.max(...points.map(point => point[0])));
      const bottom = Math.min(viewport.height, Math.max(...points.map(point => point[1])));
      if (right - left <= 0.5 || bottom - top <= 0.5) return { kind: 'none' };
      rects.push({ left, top, width: right - left, height: bottom - top });
    } catch { return { kind: 'none' }; }
  }
  return rects.length ? { kind: 'rects', rects } : { kind: 'none' };
}
