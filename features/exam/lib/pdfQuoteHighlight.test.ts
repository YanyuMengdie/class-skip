import { describe, expect, it } from 'vitest';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { computeQuoteHighlightRects } from './pdfQuoteHighlight';

const text = (str: string, x = 10, y = 20, width = 20, transform = [10, 0, 0, 10, x, y]) => ({ str, transform, width, fontName: 'font' });
function page(items: ReturnType<typeof text>[], styles: Record<string, unknown> = {}) {
  return { getTextContent: async () => ({ items, styles }) } as unknown as PDFPageProxy;
}
function viewport(matrix = [1, 0, 0, -1, 0, 100], width = 100, height = 100) {
  return { width, height, convertToViewportPoint: (x: number, y: number) => [
    matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5],
  ] } as unknown as PageViewport;
}

describe('PDF quote highlighting', () => {
  it('places a fallback-font highlight above and below the baseline with correct viewport scale', async () => {
    const result = await computeQuoteHighlightRects(page([text('Baseline')]), viewport([2, 0, 0, -2, 0, 200], 200, 200), 'Baseline');
    expect(result).toEqual({ kind: 'rects', rects: [{ left: 20, top: 144, width: 40, height: 20 }] });
  });

  it('uses the PDF font ascent and descent rather than shifting a full em below the baseline', async () => {
    const result = await computeQuoteHighlightRects(page([text('Font metrics')], { font: { ascent: 0.75, descent: -0.25 } }), viewport(), 'Font metrics');
    expect(result).toEqual({ kind: 'rects', rects: [{ left: 10, top: 72.5, width: 20, height: 10 }] });
  });

  it('keeps normalized item ranges correct across extra spaces, line breaks and multiple PDF items', async () => {
    const result = await computeQuoteHighlightRects(page([
      text('  Unrelated   material \n', 0, 90, 30), text('TAR  ', 20, 50, 20), text('\n GET', 40, 50, 30),
    ]), viewport(), ' TAR\n\tGET ');
    expect(result).toEqual({ kind: 'rects', rects: [
      { left: 20, top: 42, width: 20, height: 10 }, { left: 40, top: 42, width: 30, height: 10 },
    ] });
  });

  it('matches NFKC compatibility forms and split combining characters without losing item ownership', async () => {
    const compatibility = await computeQuoteHighlightRects(page([text('  ﬁ   ', 5), text('ＡＢＣ', 30)]), viewport(), 'fiABC');
    expect(compatibility.kind).toBe('rects');
    if (compatibility.kind === 'rects') expect(compatibility.rects.map(rect => rect.left)).toEqual([5, 30]);
    const splitAccent = await computeQuoteHighlightRects(page([text('e', 10), text('\u0301', 11)]), viewport(), 'é');
    expect(splitAccent.kind).toBe('rects');
    if (splitAccent.kind === 'rects') expect(splitAccent.rects).toHaveLength(2);
  });

  it('requires the entire quotation and never accepts only a matching prefix', async () => {
    const prefix = 'A sufficiently long introduction that shares many words with another sentence. ';
    const long = 'This first part is intentionally repeated. '.repeat(4);
    expect(await computeQuoteHighlightRects(page([text(prefix + 'The actual conclusion is different.')]), viewport(), prefix + 'A missing conclusion.')).toEqual({ kind: 'none' });
    expect(await computeQuoteHighlightRects(page([text(long + 'Actual ending.')]), viewport(), long + 'Missing ending.')).toEqual({ kind: 'none' });
  });

  it('supports a rotated viewport and rotated text transforms, clipping rectangles to real page boundaries', async () => {
    const rotatedPage = await computeQuoteHighlightRects(page([text('Rotated page')]), viewport([0, 1, 1, 0, 0, 0]), 'Rotated page');
    expect(rotatedPage).toEqual({ kind: 'rects', rects: [{ left: 18, top: 10, width: 10, height: 20 }] });
    const rotatedText = await computeQuoteHighlightRects(page([text('Rotated text', 50, 20, 20, [0, 10, -10, 0, 50, 20])]), viewport(), 'Rotated text');
    expect(rotatedText).toEqual({ kind: 'rects', rects: [{ left: 42, top: 60, width: 10, height: 20 }] });
    const clipped = await computeQuoteHighlightRects(page([text('Page edge', -5, 95)]), viewport(), 'Page edge');
    expect(clipped).toEqual({ kind: 'rects', rects: [{ left: 0, top: 0, width: 15, height: 7 }] });
  });

  it('returns scan for an empty text layer and none rather than a partial or invalid highlight', async () => {
    expect(await computeQuoteHighlightRects(page([]), viewport(), 'Something')).toEqual({ kind: 'scan' });
    expect(await computeQuoteHighlightRects(page([text('   \n')]), viewport(), 'Something')).toEqual({ kind: 'scan' });
    expect(await computeQuoteHighlightRects(page([text('First'), text('second', 10, 20, 0)]), viewport(), 'First second')).toEqual({ kind: 'none' });
    expect(await computeQuoteHighlightRects(page([text('Vertical')], { font: { vertical: true } }), viewport(), 'Vertical')).toEqual({ kind: 'none' });
    expect(await computeQuoteHighlightRects(page([text('Elsewhere')]), viewport(), 'Unknown')).toEqual({ kind: 'none' });
  });
});
