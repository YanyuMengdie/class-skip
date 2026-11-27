import { readLocalFile } from '@/services/localWorkspace';
import { fetchSessionDetails } from '@/services/firebase';
import { generateFileHash, loadPdfDocumentFromFile, readFileAsDataURL, renderPdfPageToCanvas } from '@/lib/pdf/pdfUtils';
import type { CloudSession, Slide } from '@/types';

export function checkHandoutAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Paused', 'AbortError');
}
/** Keep only one PDF's rendered pages in memory. Reading does not activate or save its study record. */
export async function prepareBatchHandout(session: CloudSession, signal: AbortSignal, onPage: (page: number, total: number) => void) {
  checkHandoutAbort(signal);
  let file: File;
  if (session.fileUrl.startsWith('classskip-local:')) file = await readLocalFile(session.fileUrl, session.fileName);
  else {
    const response = await fetch(session.fileUrl, { signal });
    if (!response.ok) throw new Error(`无法下载 PDF / PDF download failed (${response.status})`);
    file = new File([await response.blob()], session.fileName, { type: 'application/pdf' });
  }
  checkHandoutAbort(signal);
  const source = await generateFileHash(file);
  const pdf = await readFileAsDataURL(file);
  const details = await fetchSessionDetails(session.id);
  checkHandoutAbort(signal);
  const document = await loadPdfDocumentFromFile(file);
  const slides: Slide[] = [];
  try {
    for (let page = 1; page <= document.numPages; page++) {
      checkHandoutAbort(signal);
      onPage(page, document.numPages);
      const canvas = window.document.createElement('canvas');
      await renderPdfPageToCanvas(document, page, canvas, 2);
      slides.push({ id: `slide-${source}-${page - 1}`, pageNumber: page, imageUrl: canvas.toDataURL('image/png') });
      canvas.width = canvas.height = 0;
    }
  } finally { await document.destroy(); }
  checkHandoutAbort(signal);
  return { source, pdf, slides, annotations: details.annotations || session.annotations || {}, pageComments: details.pageComments || session.pageComments || {} };
}

export function handoutZipName(name: string, index: number): string {
  const safe = name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 120) || 'lecture';
  // Prefixes keep identically named lectures in different folders distinct.
  return `${String(index + 1).padStart(2, '0')}_${safe}_AI讲解.pdf`;
}
