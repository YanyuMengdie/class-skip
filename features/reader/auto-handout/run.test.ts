import { describe, expect, it, vi } from 'vitest';
import { newJob, type HandoutJob, type HandoutPlan, type PageAudit, type PageDraft } from './model';
import { runHandout } from './run';
import type { HandoutAI } from './ai';
const draft: PageDraft = { title: '概念', sections: [{ heading: '关系', explanation: '概念之间的关系', sourceEvidence: '第 1 页定义' }], uncertainties: [] };
const audit: PageAudit = { coverage: true, source: true, visuals: true, context: true, teaching: true, issues: [] };
const plan: HandoutPlan = { overview: '讲义上下文', pages: [1, 2, 3].map(page => ({ page, title: `${page}`, kind: 'concept', role: '知识讲解', focus: ['概念'], linkedPages: [] })) };
function setup() {
  const ai: HandoutAI = { plan: vi.fn(async () => plan), draft: vi.fn(async () => draft), audit: vi.fn(async () => audit) };
  const controller = new AbortController();
  const snapshots: HandoutJob[] = [];
  const save = vi.fn(async (value: HandoutJob) => { snapshots.push(structuredClone(value)); });
  return { job: newJob('alice', 'hash', 'zh-CN', 'thorough', [1, 2, 3]), ai, signal: controller.signal, controller, save, snapshots, onProgress: vi.fn() };
}
describe('resumable source-check pipeline', () => {
  it('plans once and persists each draft before its independent check', async () => {
    const s = setup();
    const result = await runHandout(s);
    expect(s.ai.plan).toHaveBeenCalledTimes(1);
    expect(s.ai.draft).toHaveBeenCalledTimes(3);
    expect(s.ai.audit).toHaveBeenCalledTimes(3);
    expect(s.snapshots.map(j => j.pages[1].status).slice(0, 3)).toEqual(['pending', 'draft', 'checked']);
    expect(Object.values(result.pages).every(p => p.status === 'checked')).toBe(true);
    expect(s.job.plan).toBeUndefined(); // caller's input is never mutated
  });
  it('continues other pages after one model failure and retains the failed audit draft', async () => {
    const s = setup();
    vi.mocked(s.ai.audit).mockRejectedValueOnce(new Error('timeout'));
    const result = await runHandout(s);
    expect(result.pages[1].status).toBe('failed');
    expect(result.pages[1].draft).toEqual(draft);
    expect(result.pages[3].status).toBe('checked');
    const again = setup();
    const resumed = await runHandout({ ...again, job: result });
    expect(again.ai.plan).not.toHaveBeenCalled();
    expect(again.ai.draft).not.toHaveBeenCalled();
    expect(again.ai.audit).toHaveBeenCalledTimes(1);
    expect(resumed.pages[1].status).toBe('checked');
  });
  it('does not silently re-generate checked, flagged or manually edited pages on resume', async () => {
    const s = setup(); s.job.plan = plan;
    s.job.pages[1] = { page: 1, draft, audit, status: 'checked', updatedAt: 1 };
    s.job.pages[2] = { page: 2, draft, audit: { ...audit, visuals: false }, status: 'needs_review', updatedAt: 1 };
    s.job.pages[3] = { page: 3, draft, status: 'edited', updatedAt: 1 };
    const result = await runHandout(s);
    expect(s.ai.draft).not.toHaveBeenCalled(); expect(s.ai.audit).not.toHaveBeenCalled();
    expect(result.pages).toEqual(s.job.pages);
  });
  it('allows a targeted rewrite and recheck without touching other pages', async () => {
    const s = setup(); s.job.plan = plan;
    s.job.pages[2] = { page: 2, draft, audit: { ...audit, issues: ['图例读错'] }, status: 'needs_review', updatedAt: 1 };
    const result = await runHandout({ ...s, pages: [2] });
    expect(s.ai.draft).toHaveBeenCalledWith(plan, plan.pages[1], draft, ['图例读错']);
    expect(result.pages[1].status).toBe('pending'); expect(result.pages[3].status).toBe('pending');
    expect(result.pages[2].status).toBe('checked');
  });
  it('keeps uncertain source content flagged even if the checker returns all true', async () => {
    const s = setup();
    vi.mocked(s.ai.draft).mockResolvedValue({ ...draft, uncertainties: ['坐标无法确认'] });
    const result = await runHandout(s);
    expect(result.pages[1].status).toBe('needs_review');
  });
  it('stops on storage failure instead of making more requests or losing a draft', async () => {
    const s = setup(); s.job.plan = plan;
    s.save.mockRejectedValueOnce(new Error('quota'));
    await expect(runHandout(s)).rejects.toThrow('quota');
    expect(s.ai.draft).toHaveBeenCalledTimes(1); expect(s.ai.audit).not.toHaveBeenCalled();
  });
  it('cancellation retains the saved draft and prevents the next request', async () => {
    const s = setup(); s.job.plan = plan;
    s.save.mockImplementation(async value => { s.snapshots.push(value); s.controller.abort(); });
    await expect(runHandout(s)).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.snapshots.at(-1)?.pages[1].status).toBe('draft');
    expect(s.ai.audit).not.toHaveBeenCalled();
  });
  it('rechecks an edited page without rewriting the learner edit', async () => {
    const s = setup(); s.job.plan = plan; s.job.pages[1] = { page: 1, draft, status: 'edited', updatedAt: 1 };
    const result = await runHandout({ ...s, pages: [1], recheckOnly: true });
    expect(s.ai.draft).not.toHaveBeenCalled(); expect(s.ai.audit).toHaveBeenCalledTimes(1);
    expect(result.pages[1].status).toBe('checked');
  });
  it('stops on exhausted credits and preserves the generated draft before checking failed', async () => {
    const s = setup();
    const exhausted = Object.assign(new Error('credits exhausted'), { code: 'billing_required' });
    vi.mocked(s.ai.audit).mockRejectedValueOnce(exhausted);
    await expect(runHandout(s)).rejects.toThrow('credits exhausted');
    expect(s.ai.draft).toHaveBeenCalledTimes(1);
    expect(s.snapshots.at(-1)?.pages[1].draft).toEqual(draft);
    expect(s.snapshots.at(-1)?.pages[2].status).toBe('pending');
  });
});
