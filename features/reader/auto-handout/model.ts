import type { AnnotationCache, AppLanguage, Slide, SlideAnnotation } from '@/types';
import { explanationHtml } from './explanationFormat';

export const HANDOUT_VERSION = 1;
export type HandoutDepth = 'quick' | 'thorough';
export interface PagePlan {
  page: number;
  title: string;
  kind: 'cover' | 'outline' | 'concept' | 'method' | 'figure' | 'formula' | 'transition' | 'other';
  role: string;
  focus: string[];
  linkedPages: number[];
}
export interface HandoutPlan { overview: string; pages: PagePlan[]; issues?: Record<number, string> }
export interface PageDraft {
  title: string;
  sections: { heading: string; explanation: string; sourceEvidence?: string }[];
  uncertainties: string[];
  teachingMemory?: TeachingMemory;
}
export interface TeachingMemory {
  covered: string;
  terminology: string;
  example: string;
  bridge: string;
}
export interface TeachingContextEntry { page: number; title: string; memory: TeachingMemory }

// Optional metadata must never discard an otherwise usable explanation.
export function parseTeachingMemory(value: unknown): TeachingMemory | undefined {
  if (!record(value)) return undefined;
  const brief = (key: string) => typeof value[key] === 'string' ? value[key].trim().slice(0, 240) : '';
  const memory = { covered: brief('covered'), terminology: brief('terminology'), example: brief('example'), bridge: brief('bridge') };
  return Object.values(memory).some(Boolean) ? memory : undefined;
}
export interface PageAudit {
  coverage: boolean;
  source: boolean;
  visuals: boolean;
  context: boolean;
  teaching: boolean;
  issues: string[];
}
export interface HandoutPage {
  page: number;
  status: 'pending' | 'draft' | 'checked' | 'needs_review' | 'edited' | 'failed';
  draft?: PageDraft;
  audit?: PageAudit;
  error?: string;
  updatedAt: number;
}
export interface HandoutModule {
  id: string;
  title: string;
  role: string;
  startPage: number;
  endPage: number;
  linkedPages: number[];
}
export interface HandoutModulePlan {
  version: 1;
  totalPages: number;
  overview: string;
  modules: HandoutModule[];
}
export interface HandoutJob {
  version: 1;
  revision: number;
  id: string;
  owner: string;
  source: string;
  language: AppLanguage;
  depth: HandoutDepth;
  pageNumbers: number[];
  plan?: HandoutPlan; // Legacy page planning; retained for existing drafts.
  modulePlan?: HandoutModulePlan;
  pages: Record<number, HandoutPage>;
  updatedAt: number;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function str(v: unknown, max = 6000): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('AI 返回的内容不完整或过长，请重试。 / Incomplete or oversized AI response.');
  return v.trim();
}
function texts(v: unknown, max: number): string[] {
  if (!Array.isArray(v) || v.length > max) throw new Error('AI 返回的列表格式不完整。 / Invalid AI list.');
  return v.map(s => str(s, 1200));
}
export function pageRange(start: number, end: number, slides: Slide[]): number[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || start < 1) throw new Error('请选择有效的连续页码。 / Select a valid consecutive page range.');
  const available = new Set(slides.map(s => s.pageNumber));
  if (!available.has(start) || !available.has(end)) throw new Error('所选页码不在讲义中。 / Page range outside this PDF.');
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  if (pages.some(p => !available.has(p))) throw new Error('所选范围包含无法读取的原文页。 / Source page missing from this range.');
  return pages;
}
export function parsePlan(v: unknown, selected: number[], allPages: number[]): HandoutPlan {
  if (!record(v) || !Array.isArray(v.pages) || v.pages.length !== selected.length) throw new Error('页码规划不完整，请重试；不会跳过缺失页。 / Incomplete page plan.');
  const seen = new Set<number>();
  const kinds = ['cover', 'outline', 'concept', 'method', 'figure', 'formula', 'transition', 'other'];
  const pages = v.pages.map(item => {
    if (!record(item) || typeof item.page !== 'number' || !selected.includes(item.page)) throw new Error('规划包含所选范围以外的页码。 / Plan includes a page outside the selected range.');
    const at = `原文第 ${item.page} 页 / Source page ${item.page}: `;
    if (seen.has(item.page)) throw new Error(at + '返回了重复页码。 / Duplicate page.');
    if (!kinds.includes(String(item.kind))) throw new Error(at + '页面类型格式不正确。 / Invalid page type.');
    if (!Array.isArray(item.linkedPages)) throw new Error(at + '关联页格式不正确。 / Invalid linked-page list.');
    if (item.linkedPages.length > 4) throw new Error(at + '关联页超过 4 页，需要重新规划。 / More than four linked pages.');
    const invalid = item.linkedPages.find(p => typeof p !== 'number' || !allPages.includes(p));
    if (item.linkedPages.some(p => typeof p !== 'number' || !allPages.includes(p))) throw new Error(at + `关联页 ${String(invalid).slice(0, 30)} 不在原文中。 / Linked page is absent from the source.`);
    seen.add(item.page);
    return { page: item.page, title: str(item.title, 250), kind: item.kind as PagePlan['kind'], role: str(item.role, 1200), focus: texts(item.focus, 10), linkedPages: [...new Set(item.linkedPages as number[])] };
  });
  return { overview: str(v.overview, 5000), pages: pages.sort((a, b) => a.page - b.page) };
}
export function parseDraft(v: unknown): PageDraft {
  if (!record(v) || !Array.isArray(v.sections) || !v.sections.length || v.sections.length > 10) throw new Error('解析缺少正文，请重试。 / Missing explanation.');
  const sections = v.sections.map(s => {
    if (!record(s)) throw new Error('解析段落格式不完整。 / Invalid section.');
    return { heading: str(s.heading, 200), explanation: str(s.explanation, 6000), ...(s.sourceEvidence ? { sourceEvidence: str(s.sourceEvidence, 1200) } : {}) };
  });
  const teachingMemory = parseTeachingMemory(v.teachingMemory);
  const draft = { title: str(v.title, 250), sections, uncertainties: texts(v.uncertainties ?? [], 12), ...(teachingMemory ? { teachingMemory } : {}) };
  if (JSON.stringify(draft).length > 24000) throw new Error('本页解析过长，请缩短后重试。 / Page explanation too large.');
  return draft;
}
export function parseAudit(v: unknown): PageAudit {
  const keys = ['coverage', 'source', 'visuals', 'context', 'teaching'] as const;
  if (!record(v) || keys.some(k => typeof v[k] !== 'boolean')) throw new Error('核查未完整返回，解析草稿已保留。 / Audit incomplete; draft retained.');
  return { coverage: v.coverage as boolean, source: v.source as boolean, visuals: v.visuals as boolean, context: v.context as boolean, teaching: v.teaching as boolean, issues: texts(v.issues, 15) };
}
export function auditPassed(draft: PageDraft, audit: PageAudit): boolean {
  return audit.coverage && audit.source && audit.visuals && audit.context && audit.teaching && !audit.issues.length && !draft.uncertainties.length;
}
export function newJob(owner: string, source: string, language: AppLanguage, depth: HandoutDepth, pages: number[]): HandoutJob {
  // Source is the existing content hash, never a filename. Settings have separate drafts.
  const id = JSON.stringify([HANDOUT_VERSION, owner, source, language, depth, pages]);
  return { version: 1, revision: 0, id, owner, source, language, depth, pageNumbers: pages, pages: Object.fromEntries(pages.map(page => [page, { page, status: 'pending', updatedAt: Date.now() }])), updatedAt: Date.now() };
}
export function sourceImagePages(plan: PagePlan, slides: Slide[]): number[] {
  const all = new Set(slides.map(s => s.pageNumber));
  return [...new Set([plan.page, ...plan.linkedPages, plan.page - 1, plan.page + 1])].filter(p => all.has(p)).slice(0, 7);
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br />');
export function annotationForPage(page: HandoutPage, language: AppLanguage): SlideAnnotation {
  let html = '';
  if (page.draft) {
    html = `<h3>${escape(page.draft.title)}</h3>` + page.draft.sections.map(s => `<h4>${escape(s.heading)}</h4>${explanationHtml(s.explanation)}`).join('');
    // Preserve meaningful caveats from older drafts, without their audit metadata.
    if (page.draft.uncertainties.length) html += page.draft.uncertainties.map(s => `<p>${escape(s)}</p>`).join('');
  } else html = `<p>${language === 'en' ? 'Explanation not yet generated for this page.' : '本页解析尚未生成。'}</p>`;
  return { id: `auto-handout-export-${page.page}`, text: html, x: 0, y: 100, fontSize: 14 };
}
/** A fresh export-only layer: never mutate or replace the learner's existing notes. */
export function exportAnnotations(job: HandoutJob, slides: Slide[], existing: AnnotationCache): AnnotationCache {
  const result = { ...existing };
  for (const slide of slides) if (job.pageNumbers.includes(slide.pageNumber)) {
    result[slide.id] = [...(existing[slide.id] || []), annotationForPage(job.pages[slide.pageNumber] || { page: slide.pageNumber, status: 'pending', updatedAt: 0 }, job.language)];
  }
  return result;
}

/** Validate coverage mechanically; this is not an AI content audit. Never invent missing modules. */
export function parseModulePlan(value: unknown, sourcePages: number[]): HandoutModulePlan {
  if (!sourcePages.length || sourcePages.some((page, i) => page !== i + 1)) throw new Error('原文页码不完整。 / Source pages are incomplete.');
  if (!record(value) || !Array.isArray(value.modules) || !value.modules.length || value.modules.length > sourcePages.length) throw new Error('模块目录不完整。 / Module directory is incomplete.');
  let nextPage = 1;
  const modules = value.modules.map((item, index): HandoutModule => {
    if (!record(item) || !Number.isInteger(item.startPage) || !Number.isInteger(item.endPage)
      || item.startPage !== nextPage || Number(item.endPage) < nextPage || Number(item.endPage) > sourcePages.length) {
      throw new Error(`模块 ${index + 1} 的页码存在遗漏、重叠或乱序（应从第 ${nextPage} 页开始）。 / Invalid module page coverage.`);
    }
    if (!Array.isArray(item.linkedPages) || item.linkedPages.some(page => typeof page !== 'number' || !sourcePages.includes(page))) throw new Error('模块关联页不在原文中。 / Invalid module references.');
    nextPage = Number(item.endPage) + 1;
    return { id: `module-${index + 1}`, title: str(item.title, 250), role: str(item.role, 1200), startPage: Number(item.startPage), endPage: Number(item.endPage), linkedPages: [...new Set(item.linkedPages as number[])].sort((a, b) => a - b) };
  });
  if (nextPage !== sourcePages.length + 1) throw new Error(`模块目录未覆盖第 ${nextPage} 页之后的内容。 / Module directory does not cover the complete PDF.`);
  return { version: 1, totalPages: sourcePages.length, overview: str(value.overview, 5000), modules };
}
export function moduleSourcePages(module: HandoutModule, sourcePages: number[]): number[] {
  // Every page in the module and every explicit dependency stays in every part.
  return sourcePages.filter(page => (page >= module.startPage && page <= module.endPage)
    || module.linkedPages.includes(page) || page === module.startPage - 1 || page === module.endPage + 1);
}

/** Only earlier, saved pages in this module; no future pages from parallel workers.
 * Reconstructing from drafts also works after pause/reload without another AI call. */
export function teachingContext(job: HandoutJob, module: HandoutModule, requestedPages: number[]): TeachingContextEntry[] {
  const first = Math.min(...requestedPages);
  return Object.values(job.pages)
    .filter(page => page.draft && page.page >= module.startPage && page.page <= module.endPage && page.page < first)
    .sort((a, b) => a.page - b.page).slice(-6)
    .map(page => {
      const draft = page.draft!;
      // Edited/legacy explanations have no trustworthy generated memory: use
      // bounded excerpts of the actual saved text, not stale metadata.
      const memory = page.status !== 'edited' ? parseTeachingMemory(draft.teachingMemory) : undefined;
      return { page: page.page, title: draft.title.slice(0, 120), memory: memory || {
        covered: draft.sections.map(s => s.heading).join('；').slice(0, 240),
        terminology: '', example: '',
        bridge: draft.sections.at(-1)?.explanation.slice(-240) || '',
      } };
    });
}
