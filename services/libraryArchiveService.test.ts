import { beforeEach, describe, it, expect, vi } from 'vitest';
const memory = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), writes: [] as { id: string; fields: Record<string, unknown> }[], uid: 'alice' }));
vi.mock('./firebase', () => ({ db: {}, auth: { get currentUser() { return { uid: memory.uid }; } }, getUserSessions: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_: unknown, collection: string, id: string) => { expect(collection).toBe('sessions'); return id; },
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(),
  runTransaction: async (_: unknown, run: (tx: unknown) => Promise<unknown>) => {
    const writes: typeof memory.writes = [];
    const result = await run({
      get: async (id: string) => ({ exists: () => memory.rows.has(id), data: () => structuredClone(memory.rows.get(id)) }),
      update: (id: string, fields: Record<string, unknown>) => writes.push({ id, fields }),
    });
    for (const write of writes) memory.rows.set(write.id, { ...memory.rows.get(write.id), ...write.fields });
    memory.writes.push(...writes); return result;
  },
}));
import { changeSessionArchive, undoSessionArchive } from './libraryArchiveService';
const user = { uid: 'alice' } as any;
beforeEach(() => {
  memory.rows.clear(); memory.writes = []; memory.uid = 'alice';
  memory.rows.set('course', { userId: 'alice', type: 'folder', parentId: null });
  memory.rows.set('pdf', { userId: 'alice', type: 'file', parentId: 'course', fileUrl: 'same-url', currentIndex: 7, skimMessages: [{ content: 'saved explanation' }], studyVersion: 42 });
});
describe('archive metadata persistence', () => {
  it('writes only root archive fields and does not touch descendants or legacy study records', async () => {
    const before = structuredClone(memory.rows.get('pdf'));
    const changes = await changeSessionArchive(user, 'course', true);
    expect(changes.map(c => c.id)).toEqual(['course']);
    expect(memory.rows.get('pdf')).toEqual(before);
    expect(memory.writes).toHaveLength(1);
    expect(Object.keys(memory.writes[0].fields).sort()).toEqual(['archiveRevision', 'archived']);
  });
  it('restores an inherited archive at its original location and retains separately archived siblings', async () => {
    memory.rows.get('course')!.archived = true;
    memory.rows.set('sibling', { userId: 'alice', parentId: 'course', type: 'file', archived: true });
    const changes = await changeSessionArchive(user, 'pdf', false);
    expect(changes.map(c => c.id)).toEqual(['course']);
    expect(memory.rows.get('sibling')!.archived).toBe(true);
    expect(memory.rows.get('pdf')!.parentId).toBe('course');
  });
  it('undo preserves learning saved after archive and refuses to overwrite a newer archive action', async () => {
    const [change] = await changeSessionArchive(user, 'pdf', true);
    memory.rows.get('pdf')!.currentIndex = 12;
    memory.rows.get('pdf')!.studyVersion = 43;
    await undoSessionArchive(user, change);
    expect(memory.rows.get('pdf')).toMatchObject({ archived: false, currentIndex: 12, studyVersion: 43, fileUrl: 'same-url' });
    const [next] = await changeSessionArchive(user, 'pdf', true);
    await changeSessionArchive(user, 'pdf', false);
    await expect(undoSessionArchive(user, next)).rejects.toThrow('Archive status has changed');
    expect(memory.rows.get('pdf')!.archived).toBe(false);
  });
  it('checks owner and account before writing', async () => {
    memory.rows.get('pdf')!.userId = 'bob';
    await expect(changeSessionArchive(user, 'pdf', true)).rejects.toThrow();
    expect(memory.writes).toHaveLength(0);
    memory.uid = 'bob';
    await expect(changeSessionArchive(user, 'course', true)).rejects.toThrow('Account changed');
  });
});
