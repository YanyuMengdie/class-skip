import type { BriefSyllabusSelection } from './types';

const PREFIX = 'class-skip:brief-syllabi:v1:';
const MAX_DOCUMENT_TEXT = 900_000;
const MAX_SAVED_TEXT = 3_500_000;

export const syllabusScopeKey = (ownerId: string, canvasOrigin: string, canvasUserId: number): string =>
  `${PREFIX}${encodeURIComponent(JSON.stringify([ownerId, canvasOrigin, canvasUserId]))}`;

const validSelection = (value: unknown): value is BriefSyllabusSelection => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as BriefSyllabusSelection;
  if (!Number.isSafeInteger(entry.courseId) || entry.courseId <= 0 || typeof entry.title !== 'string') return false;
  if (entry.kind === 'canvas') return Number.isSafeInteger(entry.fileId) && entry.fileId > 0;
  return entry.kind === 'upload' && typeof entry.documentId === 'string' && typeof entry.selectedAt === 'string'
    && Array.isArray(entry.pages) && entry.pages.length > 0 && entry.pages.length <= 300
    && entry.pages.every((page) => typeof page === 'string')
    && entry.pages.reduce((total, page) => total + page.length, 0) <= MAX_DOCUMENT_TEXT;
};

export const readSyllabusSelections = (scopeKey: string): BriefSyllabusSelection[] => {
  const raw = localStorage.getItem(scopeKey);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  return Array.isArray(data) ? data.filter(validSelection) : [];
};

export const saveSyllabusSelections = (scopeKey: string, selections: BriefSyllabusSelection[]): void => {
  const payload = JSON.stringify(selections);
  if (payload.length > MAX_SAVED_TEXT) {
    localStorage.removeItem(scopeKey);
    throw new Error('Syllabus storage limit');
  }
  try { localStorage.setItem(scopeKey, payload); }
  catch (error) {
    // Do not silently restore an older choice after a failed replacement.
    try { localStorage.removeItem(scopeKey); } catch { /* Current-page selections remain usable. */ }
    throw error;
  }
};
