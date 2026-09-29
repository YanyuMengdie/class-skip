import { beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ documents: new Map<string, unknown>(), drafts: new Map<string, unknown>(), writes: [] as string[], batches: [] as number[] }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  getDocFromServer: async (path: string) => ({ exists: () => fake.documents.has(path), data: () => structuredClone(fake.documents.get(path)) }),
  writeBatch: () => {
    const writes = new Map<string, unknown>();
    return { set: (path: string, value: unknown) => writes.set(path, value), commit: async () => {
      fake.batches.push(writes.size);
      writes.forEach((value, path) => { fake.documents.set(path, structuredClone(value)); fake.writes.push(path); });
    } };
  },
  runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<void>) => {
    const writes = new Map<string, unknown>();
    await run({ get: async (path: string) => ({ exists: () => fake.documents.has(path), data: () => structuredClone(fake.documents.get(path)) }),
      set: (path: string, value: unknown) => writes.set(path, value),
      update: (path: string, value: object) => writes.set(path, { ...fake.documents.get(path) as object, ...value }) });
    writes.forEach((value, path) => { fake.documents.set(path, structuredClone(value)); fake.writes.push(path); });
  },
}));
vi.mock('../localWorkspace', () => ({
  localList: async (bucket: string) => [...fake.drafts].filter(([key]) => key.startsWith(bucket + '/')).map(([, value]) => structuredClone(value)),
  localPut: async (bucket: string, id: string, value: unknown) => { fake.drafts.set(`${bucket}/${id}`, structuredClone(value)); },
}));
import { createFirestoreStudyRecord } from './firestoreBackend';

beforeEach(() => { fake.documents.clear(); fake.drafts.clear(); fake.writes = []; fake.batches = []; });

it('uses already-authorized data paths; never changes legacy main, skim/card histories or other sessions', async () => {
  const oldMain = { explanations: { '23': '旧讲解' }, futureField: ['keep'], activeSkimIndex: 0 };
  const oldSkim = { id: 'reading1', messages: ['原对话'] };
  fake.documents.set('sessions/test', { userId: 'owner', fileName: 'lesson.pdf' });
  fake.documents.set('sessions/test/data/main', structuredClone(oldMain));
  fake.documents.set('sessions/test/skims/reading1', structuredClone(oldSkim));
  fake.documents.set('sessions/other/data/main', { doNotTouch: true });
  const legacy = async () => ({ ...structuredClone(oldMain), skimSessions: [structuredClone(oldSkim)] });
  const record = createFirestoreStudyRecord({} as never, 'owner', 'test', () => {}, legacy);
  await record.read();
  await record.save({ annotations: { '23': 'new '.repeat(400_000) } });
  expect(fake.documents.get('sessions/test/data/main')).toEqual(oldMain);
  expect(fake.documents.get('sessions/test/skims/reading1')).toEqual(oldSkim);
  expect(fake.documents.get('sessions/other/data/main')).toEqual({ doNotTouch: true });
  expect(fake.writes.every(path => /^sessions\/test\/data\/(chunk-|state-v2|revision-)/.test(path))).toBe(true);
  expect(fake.batches.every(size => size <= 8)).toBe(true);
  const restored = await createFirestoreStudyRecord({} as never, 'owner', 'test', () => {}, async () => { throw new Error('must not fall back'); }).read();
  expect(restored).toEqual({ ...oldMain, skimSessions: [oldSkim], annotations: { '23': 'new '.repeat(400_000) } });
});

it('requires the original owner and an existing parent at publish time', async () => {
  fake.documents.set('sessions/test', { userId: 'someone-else' });
  const record = createFirestoreStudyRecord({} as never, 'owner', 'test', () => {}, async () => ({}));
  await expect(record.save({ currentIndex: 23 })).rejects.toThrow('无权');
  expect(fake.documents.has('sessions/test/data/state-v2')).toBe(false);
  expect([...fake.drafts.values()].some(value => (value as { pending: boolean }).pending)).toBe(true);
});

it('does not silently discard an old reader failure or write an empty replacement', async () => {
  const record = createFirestoreStudyRecord({} as never, 'owner', 'test', () => {}, async () => { throw new Error('legacy read denied'); });
  await expect(record.save({ currentIndex: 23 })).rejects.toThrow('legacy read denied');
  expect(fake.writes).toEqual([]);
});

it('isolates device backups by owner as well as session', async () => {
  fake.documents.set('sessions/test', { userId: 'owner' });
  await createFirestoreStudyRecord({} as never, 'owner', 'test', () => {}, async () => ({})).save({ notes: ['private'] });
  expect([...fake.drafts.keys()].every(key => key.startsWith('cloudStudyDrafts/owner/test/'))).toBe(true);
});
