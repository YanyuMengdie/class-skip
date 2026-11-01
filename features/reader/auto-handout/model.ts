import type { AnnotationCache, AppLanguage, Slide, SlideAnnotation } from '@/types';

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
  sections: { heading: string; explanation: string; sourceEvidence: string }[];
  uncertainties: string[];
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
export interface HandoutJob {
  version: 1;
  revision: number;
  id: string;
  owner: string;
  source: string;
  language: AppLanguage;
  depth: HandoutDepth;
  pageNumbers: number[];
  plan?: HandoutPlan;
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
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start >= 60) throw new Error('每批请选择连续的 1–60 页。 / Select 1–60 consecutive pages per batch.');
  const available = new Set(slides.map(s => s.pageNumber));
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
    return { heading: str(s.heading, 200), explanation: str(s.explanation, 6000), sourceEvidence: str(s.sourceEvidence, 1200) };
  });
  const draft = { title: str(v.title, 250), sections, uncertainties: texts(v.uncertainties, 12) };
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
export function annotationForPage(page: HandoutPage, language: AppLanguage, includeUnverified: boolean): SlideAnnotation {
  const en = language === 'en';
  const checked = page.status === 'checked' && page.draft && page.audit && auditPassed(page.draft, page.audit);
  const label = checked ? (en ? 'AI source check completed' : '已完成 AI 原文核查') : page.status === 'edited' ? (en ? 'Edited · not rechecked' : '已手动修改 · 未重新核查') : (en ? 'Needs checking / incomplete' : '待核查／尚未完成');
  const show = page.draft && (checked || includeUnverified);
  let html = `<h3>${en ? 'AI page explanation' : 'AI 逐页解析'} · ${escape(label)}</h3>`;
  if (show) {
    html += `<h3>${escape(page.draft!.title)}</h3>` + page.draft!.sections.map(s => `<h4>${escape(s.heading)}</h4><p>${escape(s.explanation)}</p><p>${en ? 'Source basis' : '原文依据'}：${escape(s.sourceEvidence)}</p>`).join('');
    const issues = [...page.draft!.uncertainties, ...(page.audit?.issues || [])];
    if (issues.length) html += `<h4>${en ? 'Unresolved' : '待核对的地方'}</h4><ul>${issues.map(s => `<li>${escape(s)}</li>`).join('')}</ul>`;
  } else html += `<p>${en ? 'No checked explanation is attached for this source page. Existing notes are retained.' : '本页尚无通过核查的解析，未自动附入解析正文；已有标签与注释保留。'}</p>`;
  html += `<p>${en ? 'AI checks do not guarantee correctness. Verify important claims against the original slide.' : '自动核查不能保证无误，重要结论请结合上方原文判断。'}</p>`;
  return { id: `auto-handout-export-${page.page}`, text: html, x: 0, y: 100, fontSize: 14 };
}
/** A fresh export-only layer: never mutate or replace the learner's existing notes. */
export function exportAnnotations(job: HandoutJob, slides: Slide[], existing: AnnotationCache, includeUnverified = false): AnnotationCache {
  const result = { ...existing };
  for (const slide of slides) if (job.pageNumbers.includes(slide.pageNumber)) {
    result[slide.id] = [...(existing[slide.id] || []), annotationForPage(job.pages[slide.pageNumber] || { page: slide.pageNumber, status: 'pending', updatedAt: 0 }, job.language, includeUnverified)];
  }
  return result;
}
