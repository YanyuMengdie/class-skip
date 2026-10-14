import { activeLibraryItems, type ArchiveItem } from '../library/archive.js';
export type ReadingLanguage = 'zh-CN' | 'en';
export const READING_VERSION = 1;
export const INITIAL_ARTICLES = 3;
export const MAX_ARTICLES = 6;
export const LEASE_MS = 240_000;
export interface ArticleTopic { title: string; question: string; pages: number[]; angle: string; }
export interface LittleArticle {
  id: string; jobId: string; sourceSessionId: string; sourceName: string; language: ReadingLanguage;
  sequence: number; title: string; body: string; pages: number[]; nextTitle: string; createdAt: number;
}
export interface ReadingJob {
  id: string; sourceSessionId: string; sourceName: string; sourceUrl: string; language: ReadingLanguage;
  version: number; status: 'queued' | 'working' | 'ready' | 'failed' | 'unsupported' | 'paused';
  target: number; completed: number; plan: ArticleTopic[]; pageCount: number;
  draft: { title: string; body: string; pages: number[] } | null;
  lease: string; leaseUntil: number; attempts: number; error: string; createdAt: number; updatedAt: number;
}
export interface ReadingPosition { articleId: string; fraction: number; finished: boolean; updatedAt: number; }
export function recentPdfs<T extends ArchiveItem & { fileName: string; createdAt?: unknown }>(files: T[]): T[] {
  const time = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    const t = v as { toMillis?: () => number; seconds?: number } | undefined;
    return t?.toMillis?.() ?? (t?.seconds ?? 0) * 1000;
  };
  return activeLibraryItems(files).filter(f => f.type === 'file' && /\.pdf$/i.test(f.fileName)).sort((a,b) => time(b.createdAt)-time(a.createdAt)).slice(0,10);
}
export function selectArticle(articles: LittleArticle[], positions: Record<string, ReadingPosition>, currentId?: string,
  mode: 'resume' | 'next' | 'change' = 'resume'): LittleArticle | undefined {
  const sorted = [...articles].sort((a,b) => b.createdAt-a.createdAt || a.sequence-b.sequence || a.id.localeCompare(b.id));
  if (mode === 'resume' && currentId && sorted.some(a => a.id === currentId)) return sorted.find(a => a.id === currentId);
  const current = sorted.find(a => a.id === currentId);
  const candidates = sorted.filter(a => a.id !== currentId);
  const unread = candidates.filter(a => !positions[a.id]?.finished);
  if (mode === 'next' && current) {
    const following = unread.find(a => a.jobId === current.jobId && a.sequence === current.sequence+1);
    if (following) return following;
  }
  if (mode === 'change' && current) return unread.find(a => a.jobId !== current.jobId) ?? unread[0] ?? candidates[0];
  return unread[0] ?? candidates[0] ?? sorted[0];
}
export function validPages(value: unknown, pageCount: number): number[] {
  if (!Array.isArray(value)) throw new Error('Article references are missing.');
  const pages = [...new Set(value)].sort((a,b) => Number(a)-Number(b));
  if (!pages.length || pages.length > 24 || pages.some(p => !Number.isInteger(p) || Number(p)<1 || Number(p)>pageCount))
    throw new Error('Article references are outside this lecture.');
  return pages as number[];
}
export function parsePlan(raw: string, pageCount: number, language?: ReadingLanguage): ArticleTopic[] {
  const data = JSON.parse(raw);
  if (!Array.isArray(data.topics) || !data.topics.length || data.topics.length > MAX_ARTICLES) throw new Error('No suitable article topics.');
  const titles = new Set<string>();
  return data.topics.map((t: ArticleTopic) => {
    if (!t || ![t.title,t.question,t.angle].every(s => typeof s === 'string' && s.trim() && s.length <= 1200)
      || titles.has(t.title.trim())) throw new Error('Invalid or duplicate topic.');
    titles.add(t.title.trim());
    if(language==='en' && /\p{Script=Han}/u.test(t.title+t.question))throw new Error('Topic language does not match the account preference.');
    return { title:t.title.trim(), question:t.question.trim(), angle:t.angle.trim(), pages:validPages(t.pages,pageCount) };
  });
}
export function parseArticle(raw: string, pageCount: number, allowedPages: number[], language: ReadingLanguage) {
  const a = JSON.parse(raw);
  if (typeof a.title !== 'string' || !a.title.trim() || a.title.length > 180 || typeof a.body !== 'string'
    || a.body.trim().length < 500 || a.body.length > 18_000) throw new Error('Article is incomplete.');
  const pages = validPages(a.pages,pageCount);
  if (pages.some(p => !allowedPages.includes(p))) throw new Error('Article cites unread pages.');
  // Preserve English mode even if the source and previous generated text were Chinese.
  const han = (a.body.match(/\p{Script=Han}/gu) ?? []).length;
  if (language === 'en' && han > a.body.length * .08) throw new Error('Article language does not match the account preference.');
  if (language === 'zh-CN' && han < 100) throw new Error('Article language does not match the account preference.');
  return { title:a.title.trim(),body:a.body.trim(),pages };
}
