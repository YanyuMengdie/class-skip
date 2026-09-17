import * as pdfjsLib from 'pdfjs-dist';

// Use the same PDF.js version and embedded-browser worker convention as the reader.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MAX_PDF_BYTES = 25 * 1024 * 1024;
type TextItem = { str: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean; dir?: string };
type PositionedText = { text: string; x: number; y: number; width: number; height: number; order: number };
type TextLine = { y: number; height: number; items: PositionedText[] };

const isTextItem = (value: unknown): value is TextItem => !!value && typeof value === 'object'
  && 'str' in value && typeof value.str === 'string';
const median = (values: number[], fallback: number) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Coordinate failures preserve PDF content order and explicit line breaks. */
function originalText(items: TextItem[]): string {
  let result = '';
  for (const item of items) {
    if (item.str && result && !/\s$/.test(result) && !/^\s/.test(item.str)) result += ' ';
    result += item.str;
    if (item.hasEOL) result += '\n';
  }
  return result.trim();
}

/** Keep visual rows and column spacing; never infer missing table cells or dates. */
function layoutPage(items: TextItem[], viewportTransform: number[], pageWidth: number, pageHeight: number): string {
  const visible = items.filter(item => item.str.trim());
  if (!visible.length) return '';
  const positioned: PositionedText[] = [];
  for (const [order, item] of visible.entries()) {
    if (!Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite)
      || !Number.isFinite(item.width) || item.width! < 0 || item.dir === 'ttb' || item.dir === 'rtl') return originalText(items);
    const matrix = pdfjsLib.Util.transform(viewportTransform, item.transform);
    const [x, y] = [matrix[4], matrix[5]];
    const height = Math.hypot(matrix[2], matrix[3]);
    // Rotated/vertical text cannot safely be sorted as horizontal table rows.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(height) || height <= 0
      || Math.abs(matrix[1]) > Math.abs(matrix[0]) * 0.15
      || x < -pageWidth || x > pageWidth * 2 || y < -pageHeight || y > pageHeight * 2) return originalText(items);
    positioned.push({ text: item.str, x, y, width: item.width!, height, order });
  }
  positioned.sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order);
  const lines: TextLine[] = [];
  for (const item of positioned) {
    const line = lines[lines.length - 1];
    const tolerance = line ? Math.max(1.5, Math.min(4, Math.max(line.height, item.height) * 0.3)) : 0;
    if (line && Math.abs(item.y - line.y) <= tolerance) {
      line.items.push(item);
      line.height = Math.max(line.height, item.height);
    } else lines.push({ y: item.y, height: item.height, items: [item] });
  }
  const left = Math.min(...positioned.map(item => item.x));
  const fontHeight = median(positioned.map(item => item.height), 10);
  const columnUnit = Math.max(2, Math.min(12, median(positioned
    .filter(item => item.width > 0 && item.text.trim().length >= 2)
    .map(item => item.width / item.text.length), fontHeight * 0.45)));
  let previousLine: TextLine | undefined;
  return lines.map(line => {
    line.items.sort((a, b) => a.x - b.x || a.order - b.order);
    let rendered = '', previousItem: PositionedText | undefined;
    for (const item of line.items) {
      const column = Math.max(0, Math.round((item.x - left) / columnUnit));
      const gap = previousItem ? item.x - previousItem.x - previousItem.width : 0;
      if (!previousItem) rendered += ' '.repeat(Math.min(160, column));
      else if (gap > Math.max(columnUnit * 1.8, item.height * 0.75)) {
        rendered += ' '.repeat(Math.min(160, Math.max(2, column - rendered.length)));
      } else if (gap > columnUnit * 0.15 && !/\s$/.test(rendered) && !/^\s/.test(item.text)) rendered += ' ';
      rendered += item.text;
      previousItem = item;
    }
    const separated = previousLine && line.y - previousLine.y > Math.max(fontHeight, previousLine.height) * 1.8;
    previousLine = line;
    return `${separated ? '\n' : ''}${rendered.trimEnd()}`;
  }).join('\n').trimEnd();
}

/** Administrative PDFs only: callers classify/select the syllabus before invoking this reader. */
export async function readBriefPdf(file: File, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
  if (!file.size) throw new Error('这份 PDF 是空文件，请重新选择。');
  if (file.size > MAX_PDF_BYTES) throw new Error('课程安排 PDF 超过 25 MB，请选择较小的文件。');
  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder('ascii').decode(data.subarray(0, Math.min(1024, data.length)));
  if (!/%PDF-\d\.\d/.test(header)) throw new Error('这份文件不是可识别的 PDF，请选择原始 syllabus PDF。');
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const task = pdfjsLib.getDocument({ data, ...(isEmbedded ? { disableWorker: true as const } : {}) });
  const cancel = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
      try {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const textItems = (content.items as unknown[]).filter(isTextItem);
        pages.push(layoutPage(textItems, viewport.transform, viewport.width, viewport.height));
      } catch {
        if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
        // Preserve page numbering so a failed or scanned page cannot shift source citations.
        pages.push('');
      }
    }
    if (!pages.some(page => page.trim())) throw new Error('这份 PDF 没有可读取的文字，可能是扫描件；请提供含文字的 syllabus。');
    return pages;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('这份 PDF 需要密码，请提供可直接打开的 syllabus。');
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('这份 PDF 无法解析，请重新下载原始 syllabus 后再试。');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await task.destroy().catch(() => { /* Cleanup must not hide the original PDF error. */ });
  }
}
