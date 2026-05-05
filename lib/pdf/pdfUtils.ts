
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

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
