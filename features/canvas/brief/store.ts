import type { CourseBriefReport } from './types';

export interface BriefStore { selectedCourseIds: number[]; reports: CourseBriefReport[] }
const key = (ownerId: string) => `class-skip:canvas-brief:v1:${encodeURIComponent(ownerId)}`;
export function loadBriefStore(ownerId: string): BriefStore {
  const raw = localStorage.getItem(key(ownerId));
  if (!raw) return { selectedCourseIds: [], reports: [] };
  const parsed = JSON.parse(raw) as BriefStore;
  if (!parsed || !Array.isArray(parsed.selectedCourseIds) || !Array.isArray(parsed.reports)) throw new Error('本机简报暂时无法读取。');
  return {
    selectedCourseIds: parsed.selectedCourseIds.filter(id => Number.isSafeInteger(id) && id > 0),
    reports: parsed.reports.filter(report => report?.version === 1 && report.ownerId === ownerId && Number.isSafeInteger(report.canvasUserId)
      && Array.isArray(report.sources) && Array.isArray(report.items) && Array.isArray(report.coverage) && Array.isArray(report.courses)
      && Array.isArray(report.changes) && typeof report.canvasOrigin === 'string'),
  };
}
export function saveBriefStore(ownerId: string, store: BriefStore): void {
  // A single write either succeeds or leaves the previous snapshot intact. Credentials are never stored here.
  const reports = store.reports.filter(report => report.ownerId === ownerId).slice(0, 3);
  localStorage.setItem(key(ownerId), JSON.stringify({ selectedCourseIds: store.selectedCourseIds, reports }));
  window.dispatchEvent(new CustomEvent('canvas-brief-updated'));
}
