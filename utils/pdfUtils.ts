
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    ...(isEmbedded ? { disableWorker: true } : {}),
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
    ...(isEmbedded ? { disableWorker: true } : {}),
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

export const generateFileHash = async (file: File): Promise<string> => {
  const slice = file.slice(0, 1024 * 1024); // First 1MB for speed
  const buffer = await slice.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `${file.name}-${file.size}-${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Fetches a file from a URL (Firebase Storage) and returns it as a File object.
 */
export const fetchFileFromUrl = async (url: string, filename: string): Promise<File> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'application/pdf' });
};
