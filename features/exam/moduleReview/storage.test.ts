import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  local: new Map<string, unknown>(),
  cloudData: {} as Record<string, unknown>,
  readError: false,
  saveError: false,
  writes: [] as unknown[],
}));
vi.mock('@/services/firebase', () => ({
  moduleReviewCloudRecord: () => ({
    read: async () => {
      if (f.readError) throw new Error('Unreadable');
      return structuredClone(f.cloudData);
    },
    save: async (p: unknown) => {
      if (f.saveError) throw new Error('Offline');
      f.writes.push(structuredClone(p));
      f.cloudData = { ...f.cloudData, ...(p as object) };
    },
  }),
}));
vi.mock('@/services/localWorkspace', () => ({
  isLocalId: (id: string) => id.startsWith('local:'),
  localGet: async (b: string, id: string) => f.local.get(`${b}/${id}`) ?? null,
  localPut: async (b: string, id: string, v: unknown) => {
    f.local.set(`${b}/${id}`, structuredClone(v));
  },
}));
import { reviewStorage } from './storage';
import type { ModuleReviewRecord } from './types';
const fresh = (): ModuleReviewRecord => ({
  version: 1,
  id: 'test',
  module: {
    id: 'm',
    routeId: 'r',
    sessionId: 's',
    sessionTitle: 'Reading',
    title: 'Module',
    summary: '',
    start: 1,
    end: 3,
  },
  sourceFingerprint: 'pdf',
  lessons: {},
  lessonRead: false,
  questionCount: 16,
  questions: [],
  draft: {},
  attempts: [],
  supplements: {},
  stage: 'prepare',
  showChinese: true,
  updatedAt: 1,
});
beforeEach(() => {
  f.local.clear();
  f.cloudData = {};
  f.readError = false;
  f.saveError = false;
  f.writes = [];
});
it('refuses writes before a successful read, including corrupt or unavailable records', async () => {
  const repo = reviewStorage('owner', 'cloud', 'test');
  await expect(repo.save(fresh())).rejects.toThrow('Load');
  f.readError = true;
  await expect(repo.load()).rejects.toThrow('Unreadable');
  await expect(repo.save(fresh())).rejects.toThrow('Load');
  expect(f.writes).toEqual([]);
  f.readError = false;
  f.cloudData = { review: { id: 'test', version: 99 } };
  await expect(repo.load()).rejects.toThrow();
  await expect(repo.save(fresh())).rejects.toThrow('Load');
});
it('saves snapshots in order, resumes local drafts, and isolates accounts and prior reading storage', async () => {
  f.local.set('sessions/old', { messages: ['old'] });
  const repo = reviewStorage('local', 'local:s', 'test');
  expect(repo.cloud).toBe(false);
  expect(await repo.load()).toBe(null);
  const r = fresh();
  r.draft.q1 = 'First';
  const write1 = repo.save(r);
  r.draft.q1 = 'Second';
  const write2 = repo.save(r);
  r.draft.q1 = 'Not saved';
  await Promise.all([write1, write2]);
  expect((await reviewStorage('local', 'local:s', 'test').load())?.draft.q1).toBe('Second');
  expect(await reviewStorage('another', undefined, 'test').load()).toBe(null);
  expect(f.local.get('sessions/old')).toEqual({ messages: ['old'] });
});
it('recovers the save queue after failure without replacing the current cloud record with partial data', async () => {
  const repo = reviewStorage('owner', 'cloud', 'test');
  await repo.load();
  f.saveError = true;
  await expect(repo.save(fresh())).rejects.toThrow('Offline');
  expect(f.cloudData).toEqual({});
  f.saveError = false;
  await repo.save({ ...fresh(), draft: { q7: '中文答案' } });
  expect(f.cloudData.review).toMatchObject({ draft: { q7: '中文答案' } });
});
