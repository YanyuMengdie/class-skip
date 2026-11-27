import { describe, expect, it, vi } from 'vitest';
import { newJob, parseModulePlan, type HandoutJob, type PageDraft } from './model';
import { runHandout } from './run';
import { HandoutResponseFormatError, type HandoutAI } from './ai';
const draft: PageDraft = { title: '概念', sections: [{ heading: '关系', explanation: '解释概念之间的关系' }], uncertainties: [] };
const sourcePages = [1, 2, 3, 4, 5, 6];
const plan = parseModulePlan({ overview: '整体脉络', modules: [
  { title: '实验', role: '背景、方法、结果', startPage: 1, endPage: 4, linkedPages: [6] },
  { title: '应用', role: '应用与总结', startPage: 5, endPage: 6, linkedPages: [1] },
] }, sourcePages);
function setup() {
  const ai: HandoutAI = {
    sourcePages,
    planModules: vi.fn(async () => plan),
    draftModule: vi.fn(async (_plan, _module, pages) => ({ drafts: Object.fromEntries(pages.map(page => [page, draft])), issues: {} })),
  };
  const controller = new AbortController();
  const snapshots: HandoutJob[] = [];
  let revision = 0;
  let saving = false;
  const save = vi.fn(async (value: HandoutJob) => {
    if (saving || value.revision !== revision) throw new Error('Overlapping or stale write');
    saving = true;
    await Promise.resolve();
    const next = { ...structuredClone(value), revision: ++revision };
    snapshots.push(next); saving = false; return next;
  });
  return { job: newJob('alice', 'hash', 'zh-CN', 'thorough', sourcePages), ai, signal: controller.signal, controller, snapshots, save, onProgress: vi.fn() };
}
describe('module generation with serialized persistence', () => {
  it('plans once, runs two modules concurrently and preserves every page through queued saves', async () => {
    const s = setup();
    const result = await runHandout(s);
    expect(s.ai.planModules).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(s.ai.draftModule).mock.calls;
    expect(calls.map(call => call[2])).toEqual([[1, 2, 3], [5, 6], [4]]);
    expect(calls[0][1]).toEqual(calls[2][1]); // parts retain the full module boundaries
    expect(Object.values(result.pages).every(page => page.draft && page.status === 'draft')).toBe(true);
    expect(result.revision).toBe(4); // directory + three outputs
    expect(s.job.modulePlan).toBeUndefined();
  });
  it('preserves a valid sibling and retries only the missing page with the same module', async () => {
    const s = setup();
    vi.mocked(s.ai.draftModule).mockImplementation(async (_plan, _module, pages) => ({ drafts: Object.fromEntries(pages.filter(page => pages.length === 1 || page !== 2).map(page => [page, draft])), issues: { 2: 'truncated' } }));
    const result = await runHandout(s);
    expect(vi.mocked(s.ai.draftModule).mock.calls.map(call => call[2])).toContainEqual([2]);
    expect(s.snapshots.some(snapshot => snapshot.pages[1].draft && !snapshot.pages[2].draft)).toBe(true);
    expect(result.pages[2].draft).toEqual(draft);
  });
  it('falls back to individual output pages after a truncated part without rebuilding its directory', async () => {
    const s = setup();
    vi.mocked(s.ai.draftModule).mockRejectedValueOnce(new HandoutResponseFormatError('truncated'));
    const result = await runHandout(s);
    expect(s.ai.planModules).toHaveBeenCalledTimes(1);
    expect(Object.values(result.pages).every(page => page.draft)).toBe(true);
  });
  it('reuses a stored directory and only generates missing pages', async () => {
    const s = setup(); s.job.modulePlan = plan;
    s.job.pages[1] = { page: 1, draft, status: 'needs_review', updatedAt: 1 };
    const result = await runHandout(s);
    expect(s.ai.planModules).not.toHaveBeenCalled();
    expect(vi.mocked(s.ai.draftModule).mock.calls.flatMap(call => call[2])).not.toContain(1);
    expect(result.pages[1]).toEqual(s.job.pages[1]);
  });
  it('targeted regeneration keeps the entire module context but changes only the requested page', async () => {
    const s = setup(); s.job.modulePlan = plan;
    s.job.pages[2] = { page: 2, draft, status: 'edited', updatedAt: 1 };
    const result = await runHandout({ ...s, pages: [2] });
    expect(s.ai.draftModule).toHaveBeenCalledWith(plan, plan.modules[0], [2], { 2: draft }, expect.any(AbortSignal), []);
    expect(result.pages[1].status).toBe('pending');
    expect(result.pages[2].status).toBe('draft');
  });
  it('does not spend requests on a module directory when every selected page already has a draft', async () => {
    const s = setup();
    for (const page of sourcePages) s.job.pages[page] = { page, draft, status: 'draft', updatedAt: 1 };
    await runHandout(s);
    expect(s.ai.planModules).not.toHaveBeenCalled(); expect(s.ai.draftModule).not.toHaveBeenCalled();
  });
  it('stops before generation if saving the directory fails', async () => {
    const s = setup(); s.save.mockRejectedValueOnce(new Error('quota'));
    await expect(runHandout(s)).rejects.toThrow('quota');
    expect(s.ai.draftModule).not.toHaveBeenCalled();
  });
  it('retains committed pages and cancels remaining work on pause', async () => {
    const s = setup();
    s.save.mockImplementation(async value => {
      const next = { ...value, revision: value.revision + 1 }; s.snapshots.push(next);
      if (Object.values(value.pages).some(page => page.draft)) s.controller.abort();
      return next;
    });
    await expect(runHandout(s)).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.snapshots.at(-1)?.pages[1].draft).toEqual(draft);
    expect(vi.mocked(s.ai.draftModule).mock.calls.some(call => call[2].includes(4))).toBe(false);
  });
});
