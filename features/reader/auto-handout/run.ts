import type { HandoutAI } from './ai';
import { auditPassed, type HandoutJob, type HandoutPage, type HandoutPlan } from './model';

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
  const wanted = options.pages || job.pageNumbers;
  if (wanted.some(page => !job.pageNumbers.includes(page))) throw new Error('Page outside selected scope.');
  const missingPlans = wanted.filter(page => !job.plan?.pages.some(item => item.page === page));
  if (missingPlans.length) {
    options.onProgress('planning');
    let planned: HandoutPlan | undefined;
    let failure: unknown;
    try { planned = await options.ai.plan(missingPlans); }
    catch (e) {
      check(); failure = e;
      if (e && typeof e === 'object' && 'partialHandoutPlan' in e) planned = e.partialHandoutPlan as HandoutPlan;
    }
    if (planned) {
      const accepted = new Set(planned.pages.map(page => page.page));
      const issues = { ...job.plan?.issues, ...planned.issues };
      for (const page of accepted) delete issues[page];
      job.plan = { overview: job.plan?.overview || planned.overview,
        pages: [...(job.plan?.pages.filter(page => !accepted.has(page.page)) || []), ...planned.pages].sort((a, b) => a.page - b.page), issues };
    }
    for (const number of missingPlans) if (!job.plan?.pages.some(page => page.page === number)) {
      job.pages[number] = { ...job.pages[number], status: 'failed', updatedAt: Date.now(),
        error: job.plan?.issues?.[number] || `原文第 ${number} 页规划失败 / Source page ${number} planning failed: ${failure instanceof Error ? failure.message : '自动修复后仍有格式异常，可单页重试。 / Format still invalid after repair; retry this page.'}` };
    }
    await commit();
    if (failure) throw failure;
  }
  for (const number of wanted) {
    check();
    if (!job.pageNumbers.includes(number)) throw new Error('Page outside selected scope.');
    const before = job.pages[number];
    if (!options.pages && (before.status === 'checked' || before.status === 'needs_review' || before.status === 'edited')) continue;
    const page = job.plan?.pages.find(p => p.page === number);
    // A failed plan has an explicit page-level error. Continue every valid page.
    if (!page || !job.plan) continue;
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
