import { HandoutResponseFormatError, type HandoutAI, type ModuleDraftResult } from './ai';
import { parseModulePlan, teachingContext, type HandoutJob, type HandoutPage, type HandoutModule, type PageDraft } from './model';
import type { AppLanguage } from '@/types';

export interface HandoutProgress {
  stage: 'planning' | 'writing';
  moduleCount: number;
  active: { title: string; pages: number[] }[];
}
export function handoutProgressText(progress: HandoutProgress, language: AppLanguage): string {
  if (progress.stage === 'planning') return language === 'en' ? 'Reading the full PDF and preparing its module directory…' : '正在通读整份 PDF，准备模块目录…';
  const active = progress.active.map(item => `${item.title} · ${language === 'en' ? 'pages' : '第'} ${item.pages.join(', ')}${language === 'en' ? '' : ' 页'}`).join(' ｜ ');
  return language === 'en' ? `${progress.moduleCount} modules · ${active || 'Saving explanations…'}` : `共 ${progress.moduleCount} 个模块 · ${active || '正在保存讲解…'}`;
}
const cancelled = () => Object.assign(new Error('已暂停，已完成内容保留。 / Paused; completed work retained.'), { name: 'AbortError' });
const fatalRequest = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && ['billing_required', 'rate_limit', 'unauthorized', 'not_configured', 'invalid_request'].includes(String(e.code));
/** Two modules run concurrently. Parts within a module stay ordered; saves are serialized. */
export async function runHandout(options: {
  job: HandoutJob; ai: HandoutAI; signal: AbortSignal; pages?: number[];
  save: (job: HandoutJob) => Promise<HandoutJob | void>;
  onProgress: (progress: HandoutProgress) => void;
}): Promise<HandoutJob> {
  let job = structuredClone(options.job);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  let fatal: unknown;
  const check = () => { if (fatal) throw fatal; if (controller.signal.aborted) throw cancelled(); };
  const stop = (error: unknown) => { fatal ||= error; controller.abort(); };
  let saves: Promise<void> = Promise.resolve();
  // Merge changes at execution time, not at request start: concurrent modules
  // cannot overwrite another module's pages or reuse an old storage revision.
  const commit = (pages: HandoutPage[] = [], plan?: HandoutJob['modulePlan']) => {
    const saved = saves.then(async () => {
      check();
      const next = structuredClone(job);
      for (const page of pages) next.pages[page.page] = page;
      if (plan) next.modulePlan = plan;
      next.updatedAt = Date.now();
      job = await options.save(next) || next;
      check();
    });
    saves = saved.catch(error => { if (!options.signal.aborted) stop(error); });
    return saved;
  };
  try {
    check();
    const wanted = options.pages || job.pageNumbers;
    if (wanted.some(page => !job.pageNumbers.includes(page) || !options.ai.sourcePages.includes(page))) throw new Error('Page outside selected scope.');
    const pending = wanted.filter(page => options.pages || !job.pages[page]?.draft);
    if (!pending.length) return job;
    let plan = job.modulePlan ? parseModulePlan(job.modulePlan, options.ai.sourcePages) : undefined;
    if (!plan) {
      options.onProgress({ stage: 'planning', moduleCount: 0, active: [] });
      plan = parseModulePlan(await options.ai.planModules(controller.signal), options.ai.sourcePages);
      await commit([], plan);
    }
    const modulePlan = plan;
    const modules = plan.modules.filter(module => pending.some(page => page >= module.startPage && page <= module.endPage));
    const active = new Map<string, { title: string; pages: number[] }>();
    const report = () => options.onProgress({ stage: 'writing', moduleCount: modulePlan.modules.length, active: [...active.values()] });
    async function generate(module: HandoutModule, pages: number[]): Promise<void> {
      check(); active.set(module.id, { title: module.title, pages }); report();
      const previous: Record<number, PageDraft> = {};
      for (const page of pages) if (job.pages[page]?.draft) previous[page] = job.pages[page].draft!;
      let result: ModuleDraftResult;
      try { result = await options.ai.draftModule(modulePlan, module, pages, previous, controller.signal, teachingContext(job, module, pages)); }
      catch (error) {
        check();
        if (error instanceof HandoutResponseFormatError) result = { drafts: {}, issues: Object.fromEntries(pages.map(page => [page, error.message])) };
        else {
          await commit(pages.map(page => ({ ...job.pages[page], status: 'failed', error: error instanceof Error ? error.message : 'Generation failed', updatedAt: Date.now() })));
          if (fatalRequest(error)) { stop(error); throw error; }
          return;
        }
      }
      check();
      await commit(pages.map(page => result.drafts[page]
        ? { page, draft: result.drafts[page], status: 'draft', updatedAt: Date.now() }
        : { ...job.pages[page], status: 'failed', error: result.issues[page] || '本页未完整返回 / Page output incomplete', updatedAt: Date.now() }));
      // Keep valid siblings. If a multi-page output was cut short, retry just its
      // missing pages individually, once each, with the same full module input.
      if (pages.length > 1) for (const page of pages) if (!result.drafts[page]) await generate(module, [page]);
    }
    let nextModule = 0;
    async function worker() {
      while (nextModule < modules.length) {
        check();
        const module = modules[nextModule++];
        const pages = pending.filter(page => page >= module.startPage && page <= module.endPage);
        try {
          for (let offset = 0; offset < pages.length; offset += 3) await generate(module, pages.slice(offset, offset + 3));
        } finally { active.delete(module.id); report(); }
      }
    }
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, modules.length) }, () => worker().catch(error => { if (!options.signal.aborted) stop(error); throw error; })));
    await saves;
    check();
    const rejected = workers.find(result => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
    return job;
  } finally { options.signal.removeEventListener('abort', abort); }
}
