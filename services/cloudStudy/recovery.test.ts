import { expect, it } from 'vitest';
import { saveRecoveryCopy, type RecoveryBackend } from './recovery';

const copyId = 'recovery-12345678-1234-1234-1234-123456789012';
function fixture() {
  let owner: string | undefined = 'owner', fail = true;
  const source = { userId: 'owner', fileName: 'lecture.pdf', fileUrl: 'original-pdf', parentId: 'folder' };
  const copies = new Map<string, unknown>(), writes: string[] = [];
  const backend: RecoveryBackend = {
    owner: () => owner,
    source: async () => structuredClone(source),
    create: async (id, origin, original) => { copies.set(id, { origin, original: structuredClone(original) }); writes.push(id); },
    save: async (id, data) => { if (fail) throw new Error('offline'); copies.set(id, structuredClone(data)); writes.push(id); },
  };
  return { backend, source, copies, writes, setOwner: (value: typeof owner) => owner = value, allowSave: () => fail = false };
}
it('retries the same copy while keeping original metadata, PDF and content untouched', async () => {
  const f = fixture(), original = structuredClone(f.source), data = { notes: ['local'], unknownField: ['keep'] };
  await expect(saveRecoveryCopy(f.backend, 'source', copyId, data)).rejects.toThrow('offline');
  f.allowSave(); await saveRecoveryCopy(f.backend, 'source', copyId, data);
  expect([...f.copies.keys()]).toEqual([copyId]);
  expect(f.copies.get(copyId)).toEqual(data);
  expect(f.source).toEqual(original);
  expect(f.writes.every(id => id === copyId)).toBe(true);
});
it('does not create a copy for a different owner or after an account switch', async () => {
  const f = fixture(); f.setOwner('other');
  await expect(saveRecoveryCopy(f.backend, 'source', copyId, {})).rejects.toThrow('无权');
  expect(f.writes).toEqual([]);
  f.setOwner('owner'); f.backend.source = async () => { f.setOwner('other'); return f.source; };
  await expect(saveRecoveryCopy(f.backend, 'source', copyId, {})).rejects.toThrow('账号已切换');
  expect(f.writes).toEqual([]);
});
it('snapshots the local content before waiting for network calls', async () => {
  const f = fixture(); f.allowSave();
  const data = { notes: ['local'] };
  f.backend.source = async () => { data.notes.push('later edit'); return f.source; };
  await saveRecoveryCopy(f.backend, 'source', copyId, data);
  expect(f.copies.get(copyId)).toEqual({ notes: ['local'] });
});
