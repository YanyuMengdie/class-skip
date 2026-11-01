import type { HandoutAI } from './ai';
import { auditPassed, type HandoutJob, type HandoutPage } from './model';

const cancelled = () => Object.assign(new Error('已暂停，已完成内容保留。 / Paused; completed work retained.'), { name: 'AbortError' });
const accountFailure = (e: unknown) => !!e && typeof e === 'object' && 'code' in e && ['billing_required', 'rate_limit', 'unauthorized', 'not_configured'].includes(String(e.code));
/** Serial requests keep cost bounded; every completed stage is durably saved before continuing. */
export async function runHandout(options: {
  job: HandoutJob; ai: HandoutAI; signal: AbortSignal; pages?: number[]; recheckOnly?: boolean;
  save: (job: HandoutJob) => Promise<HandoutJob | void>;
  onProgress: (stage: 'planning' | 'writing' | 'checking', page?: number) => void;
}): Promise<HandoutJob> {
  let job = structuredClone(options.job);
  const check = () => { if (options.signal.aborted) throw cancelled(); };
  const commit = async (page?: HandoutPage) => {
    check();
    job = { ...job, ...(page ? { pages: { ...job.pages, [page.page]: page } } : {}), updatedAt: Date.now() };
    // A storage failure stops the run. It must never be mislabeled as a page's AI failure.
    const saved = await options.save(structuredClone(job));
    if (saved) job = saved;
    check();
  };
  check();
  if (!job.plan) {
    options.onProgress('planning');
    job.plan = await options.ai.plan(job.pageNumbers);
    await commit();
  }
  for (const number of options.pages || job.pageNumbers) {
    check();
    if (!job.pageNumbers.includes(number)) throw new Error('Page outside selected scope.');
    const before = job.pages[number];
    if (!options.pages && (before.status === 'checked' || before.status === 'needs_review' || before.status === 'edited')) continue;
    const page = job.plan.pages.find(p => p.page === number);
    if (!page) throw new Error(`Missing page plan: ${number}`);
    let current: HandoutPage = { ...before, updatedAt: Date.now() };
    if (!options.recheckOnly && (options.pages || !current.draft)) {
      options.onProgress('writing', number);
      try {
        const draft = await options.ai.draft(job.plan, page, current.draft, current.audit?.issues);
        check();
        current = { page: number, draft, status: 'draft', updatedAt: Date.now() };
      } catch (e) {
        check();
        await commit({ ...current, status: 'failed', error: e instanceof Error ? e.message : '生成失败 / Generation failed', updatedAt: Date.now() });
        if (accountFailure(e)) throw e;
        continue;
      }
      await commit(current);
    }
    if (!current.draft) throw new Error('No explanation to check.');
    options.onProgress('checking', number);
    let fatal: unknown;
    try {
      const audit = await options.ai.audit(job.plan, page, current.draft);
      check();
      current = { ...current, audit, error: undefined, status: auditPassed(current.draft, audit) ? 'checked' : 'needs_review', updatedAt: Date.now() };
    } catch (e) {
      check();
      current = { ...current, status: 'failed', error: e instanceof Error ? e.message : '核查失败 / Source check failed', updatedAt: Date.now() };
      if (accountFailure(e)) fatal = e;
    }
    await commit(current);
    if (fatal) throw fatal;
  }
  return job;
}
