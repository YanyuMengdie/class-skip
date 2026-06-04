
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

const getDocumentOptions = () => (isEmbedded ? { disableWorker: true as const } : {});

/** 从 PDF 文件加载文档（单例缓存由调用方按 link.id 管理） */
export const loadPdfDocumentFromFile = async (file: File): Promise<PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({
    data: arrayBuffer,
    ...getDocumentOptions(),
  }).promise;
};

/**
 * 将指定页（1-based）渲染到 canvas；会设置 canvas 宽高。
 * @param scale 视口缩放，默认 1.35（侧栏预览清晰度与性能平衡）
 */
export const renderPdfPageToCanvas = async (
  pdf: PDFDocumentProxy,
  pageNumber1Based: number,
  canvas: HTMLCanvasElement,
  scale = 1.35
): Promise<void> => {
  const page = await pdf.getPage(pageNumber1Based);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({
    canvasContext: context,
    viewport,
  } as any).promise;
};

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    ...getDocumentOptions(),
  }).promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;

    const imageUrl = canvas.toDataURL('image/png');
    images.push(imageUrl);
  }

  return images;
};

export const extractPdfText = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    ...getDocumentOptions(),
  }).promise;
  const numPages = pdf.numPages;
  const texts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      texts.push(pageText);
    } catch (e) {
      console.warn(`Failed to extract text from page ${i}`, e);
      texts.push(""); 
    }
  }

  return texts;
};

/**
 * 从一份 PDF（base64 data URL 或纯 base64 字符串）中抽出 1-based、**含两端**的页码范围，
 * 另存为一份新的小 PDF，返回与现有 `pdfDataUrl` **完全同格式**的
 * `data:application/pdf;base64,...`（下游 `getContentPart` 的 PDF 分支无需改动）。
 *
 * 边界处理（全部静默规整，不抛错，避免打断略读启动）：
 * - `startPage < 1` → 取 1；
 * - `endPage > 总页数` → 取总页数；
 * - `startPage > endPage` → **交换**两者（比抛错更宽容，用户填反了也能用）。
 *
 * @param input  PDF 的 base64 data URL（如 `pdfDataUrl`）或纯 base64 字符串
 * @param startPage 起始页（1-based，含）
 * @param endPage   结束页（1-based，含）
 */
export const extractPdfPageRange = async (
  input: string,
  startPage: number,
  endPage: number
): Promise<string> => {
  // 容忍 data URL 前缀，取出纯 base64
  const base64 = input.startsWith('data:') ? input.split(',')[1] ?? '' : input;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const srcDoc = await PDFDocument.load(bytes);
  const total = srcDoc.getPageCount();

  // 规整边界（与 JSDoc 描述一致）
  let start = Number.isFinite(startPage) ? Math.floor(startPage) : 1;
  let end = Number.isFinite(endPage) ? Math.floor(endPage) : total;
  if (start > end) [start, end] = [end, start]; // 填反则交换
  start = Math.max(1, start);
  end = Math.min(total, end);
  if (start > total) start = total; // 起点也越界则收敛到末页

  const outDoc = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = start; p <= end; p++) indices.push(p - 1); // pdf-lib 用 0-based
  const copied = await outDoc.copyPages(srcDoc, indices);
  copied.forEach((page) => outDoc.addPage(page));

  const outBytes = await outDoc.save();

  // Uint8Array → base64（分块避免超长 spread 触发调用栈上限）
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < outBytes.length; i += chunk) {
    bin += String.fromCharCode(...outBytes.subarray(i, i + chunk));
  }
  return `data:application/pdf;base64,${btoa(bin)}`;
};

export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/** 在无 crypto.subtle 时用简单哈希（如 HTTP 非 localhost 访问时 subtle 不可用） */
function simpleHash(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let h = 0;
  for (let i = 0; i < Math.min(bytes.length, 8192); i++) h = ((h << 5) - h + bytes[i]) | 0;
  return Math.abs(h).toString(16) + bytes.length.toString(16);
}

export const generateFileHash = async (file: File): Promise<string> => {
  const slice = file.slice(0, 1024 * 1024);
  const buffer = await slice.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return `${file.name}-${file.size}-${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
    } catch (_) {
      // 部分环境 digest 可能失败，回退到简单哈希
    }
  }
  const fallback = simpleHash(buffer);
  return `${file.name}-${file.size}-${fallback}`;
};

/**
 * Fetches a file from a URL (Firebase Storage) and returns it as a File object.
 */
export const fetchFileFromUrl = async (url: string, filename: string): Promise<File> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'application/pdf' });
};
