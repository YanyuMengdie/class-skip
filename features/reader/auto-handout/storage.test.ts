import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newJob, parseModulePlan } from './model';
import { HandoutConflictError, loadHandoutJob, saveHandoutJob, sharedModulePlan } from './storage';
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
describe('isolated durable trial drafts', () => {
  it('reloads a partial source plan without dropping completed work or failed-page reasons', async () => {
    const job = newJob('alice', 'content-hash', 'en', 'quick', [1, 2]);
    job.plan = { overview: 'Document context', pages: [{ page: 1, kind: 'concept', title: 'One', role: 'Definition', focus: ['Meaning'], linkedPages: [] }], issues: { 2: 'Invalid linked page 99' } };
    job.pages[2] = { page: 2, status: 'failed', error: 'Invalid linked page 99', updatedAt: 2 };
    const stored = await saveHandoutJob(job);
    expect(await loadHandoutJob(job.id, job.owner, job.source)).toEqual(stored);
  });
  it('saves and reloads the exact owner and PDF without touching another workspace', async () => {
    const job = newJob('alice', 'content-hash', 'en', 'quick', [1, 2]);
    const stored = await saveHandoutJob(job);
    expect(stored.revision).toBe(1);
    expect((await loadHandoutJob(job.id, 'alice', 'content-hash'))?.revision).toBe(1);
    expect(await loadHandoutJob(job.id, 'bob', 'content-hash')).toBeUndefined();
    expect(await loadHandoutJob(job.id, 'alice', 'other-hash')).toBeUndefined();
  });
  it('rejects a stale tab atomically and preserves the newer draft', async () => {
    const seed = newJob('alice', 'content-hash', 'en', 'quick', [1]);
    const first = await saveHandoutJob(seed);
    const otherTab = structuredClone(first);
    const newer = await saveHandoutJob({ ...first, pages: { 1: { page: 1, status: 'failed', error: 'newer result', updatedAt: 2 } } });
    await expect(saveHandoutJob(otherTab)).rejects.toBeInstanceOf(HandoutConflictError);
    expect(await loadHandoutJob(seed.id, 'alice', 'content-hash')).toEqual(newer);
  });
  it('parallel first saves cannot overwrite one another', async () => {
    const seed = newJob('alice', 'content-hash', 'en', 'quick', [1]);
    const results = await Promise.allSettled([saveHandoutJob(seed), saveHandoutJob(seed)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('shared module directories', () => {
  it('reuses one directory across runs while isolating accounts and source files', async () => {
    const plan = parseModulePlan({ overview: 'Lecture', modules: [{ title: 'One', role: 'Experiment', startPage: 1, endPage: 2, linkedPages: [] }] }, [1, 2]);
    const generate = vi.fn(async () => plan);
    const signal = new AbortController().signal;
    await sharedModulePlan('alice', 'hash', 'en', [1, 2], generate, signal);
    expect(await sharedModulePlan('alice', 'hash', 'en', [1, 2], generate, signal)).toEqual(plan);
    expect(generate).toHaveBeenCalledTimes(1);
    await sharedModulePlan('bob', 'hash', 'en', [1, 2], generate, signal);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
