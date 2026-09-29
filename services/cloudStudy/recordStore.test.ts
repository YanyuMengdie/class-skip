import { describe, expect, it } from 'vitest';
import { byteLength, CHUNK_BYTES, CloudRecordError, decodeFields, encodeFields, splitText, type Chunk, type Manifest } from './chunks';
import { CloudStudyRecord, type RecordBackend, type StudyDraft } from './recordStore';
import { studySaveFailure, studySaveLabel } from './saveStatus';

function fixture(legacy: Record<string, unknown> = {}) {
  let head: Manifest | null = null;
  const chunks = new Map<string, Chunk>();
  const drafts = new Map<string, StudyDraft>();
  const revisions: Manifest[] = [];
  let writes = 0;
  let fail: 'chunks' | 'commit' | 'backup' | 'head' | 'after-commit' | undefined;
  const backend: RecordBackend = {
    async readHead() { if (fail === 'head') throw new Error('offline'); return structuredClone(head); },
    async readLegacy() { return structuredClone(legacy); },
    async readChunk(hash) { return structuredClone(chunks.get(hash)); },
    async writeChunks(nodes) {
      for (const [hash, chunk] of nodes) { chunks.set(hash, structuredClone(chunk)); writes++; if (fail === 'chunks') throw new Error('connection lost'); }
    },
    async commit(next, expected) {
      if (fail === 'commit') throw new Error('connection lost');
      if ((head?.revision ?? null) !== expected) throw new CloudRecordError('conflict', 'newer cloud version');
      head = structuredClone(next); revisions.push(structuredClone(next));
      if (fail === 'after-commit') throw new Error('lost acknowledgement');
    },
    async drafts() { return structuredClone([...drafts.values()]); },
    async backup(draft) { if (fail === 'backup') throw new Error('quota'); drafts.set(draft.id, structuredClone(draft)); },
  };
  return { backend, chunks, drafts, revisions, get head() { return head; }, get writes() { return writes; },
    setFailure: (value: typeof fail) => { fail = value; } };
}

describe('chunked study records', () => {
  it('round trips more than 20 MiB of Chinese, emoji, quotes and nested histories without oversized documents', async () => {
    const text = '讲解🧠\\"\n'.repeat(1_800_000);
    expect(byteLength(JSON.stringify(text))).toBeGreaterThan(20 * 1024 * 1024);
    const original = { explanations: { '23': text }, skimSessions: [{ id: 'one', recordDeck: { cards: { module1: { messages: [{ role: 'assistant', text }] } } } }], pageMarks: { '23': ['重点'] }, unknownOldField: { a: null } };
    const { fields, nodes } = await encodeFields(original);
    for (const node of nodes.values()) {
      if (node.kind === 'text') expect(byteLength(node.text)).toBeLessThanOrEqual(CHUNK_BYTES);
      expect(byteLength(JSON.stringify(node))).toBeLessThan(600_000);
    }
    expect(await decodeFields(fields, async hash => nodes.get(hash))).toEqual(original);
  }, 20000);

  it('keeps split boundaries valid for multibyte characters and surrogate pairs', () => {
    const original = 'a'.repeat(CHUNK_BYTES - 1) + '🧠中文' + '\\"'.repeat(CHUNK_BYTES);
    const parts = splitText(original);
    expect(parts.join('')).toBe(original);
    parts.forEach(part => { expect(byteLength(part)).toBeLessThanOrEqual(CHUNK_BYTES); expect(part).not.toMatch(/[\ud800-\udbff]$/); });
  });

  it('reads legacy data unchanged and preserves every omitted/unknown field on first large save', async () => {
    const legacy = { explanations: { '1': '旧讲解' }, annotations: { '1': ['旧笔记'] }, skimSessions: [{ id: 'old', messages: ['旧对话'], archive: ['旧案件'] }], futureField: { leaveAlone: true } };
    const original = structuredClone(legacy);
    const f = fixture(legacy); const record = new CloudStudyRecord(f.backend);
    expect(await record.read()).toEqual(legacy);
    expect(f.revisions).toHaveLength(0);
    await record.save({ explanations: { '1': '旧讲解', '2': '新内容'.repeat(200_000) } });
    expect(legacy).toEqual(original);
    const restored = await new CloudStudyRecord(f.backend).read();
    expect(restored).toEqual({ ...legacy, explanations: { '1': '旧讲解', '2': '新内容'.repeat(200_000) } });
  });

  it.each(['chunks', 'commit'] as const)('keeps last committed version and legacy intact after %s failure; retries complete snapshot', async failure => {
    const legacy = { annotations: ['do not lose'] };
    const f = fixture(legacy); const record = new CloudStudyRecord(f.backend);
    await record.save({ explanations: 'first' });
    const before = structuredClone(f.head);
    f.setFailure(failure);
    await expect(record.save({ explanations: 'later'.repeat(100_000) })).rejects.toThrow();
    expect(f.head).toEqual(before);
    expect(await decodeFields(before!.fields, async hash => f.chunks.get(hash))).toEqual({ annotations: ['do not lose'], explanations: 'first' });
    expect([...f.drafts.values()].some(d => d.pending)).toBe(true);
    f.setFailure(undefined);
    await record.save({ currentIndex: 23 });
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ annotations: ['do not lose'], explanations: 'later'.repeat(100_000), currentIndex: 23 });
  });

  it('resumes pending local progress after reload and marks its ancestor resolved after further edits', async () => {
    const f = fixture({ annotations: ['old'] }); const record = new CloudStudyRecord(f.backend);
    await record.save({ currentIndex: 1 });
    f.setFailure('chunks'); await expect(record.save({ currentIndex: 2 })).rejects.toThrow();
    f.setFailure(undefined);
    const resumed = new CloudStudyRecord(f.backend);
    expect((await resumed.read()).currentIndex).toBe(2);
    await resumed.save({ currentIndex: 3 });
    expect([...f.drafts.values()].filter(d => d.pending)).toHaveLength(0);
    expect((await new CloudStudyRecord(f.backend).read()).currentIndex).toBe(3);
  });

  it('does not overwrite newer changes from another device or silently show an older draft on reopen', async () => {
    const f = fixture(); const first = new CloudStudyRecord(f.backend); const second = new CloudStudyRecord(f.backend);
    await first.read(); await second.read();
    await first.save({ annotations: ['device one'] });
    const before = structuredClone(f.head);
    await expect(second.save({ annotations: ['device two'] })).rejects.toMatchObject({ code: 'conflict' });
    expect(f.head).toEqual(before);
    expect([...f.drafts.values()].find(d => d.pending)?.data.annotations).toEqual(['device two']);
    await expect(new CloudStudyRecord(f.backend).read()).rejects.toMatchObject({ code: 'conflict' });
  });

  it('handles an acknowledged-by-server but interrupted client commit on reload', async () => {
    const f = fixture(); const record = new CloudStudyRecord(f.backend);
    f.setFailure('after-commit'); await expect(record.save({ currentIndex: 23 })).rejects.toThrow();
    f.setFailure(undefined);
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ currentIndex: 23 });
    expect([...f.drafts.values()].filter(d => d.pending)).toHaveLength(0);
  });

  it('fails closed on missing or corrupt chunks, never replaces them with legacy or empty data', async () => {
    const f = fixture({ explanations: 'legacy' }); const record = new CloudStudyRecord(f.backend);
    await record.save({ explanations: 'new version' });
    const hash = f.head!.fields.explanations.hash;
    f.chunks.delete(hash);
    await expect(new CloudStudyRecord(f.backend).read()).rejects.toMatchObject({ code: 'incomplete' });
    f.chunks.set(hash, { kind: 'text', text: 'tampered' });
    await expect(new CloudStudyRecord(f.backend).read()).rejects.toMatchObject({ code: 'incomplete' });
    expect(f.revisions).toHaveLength(1);
  });

  it('can retry after a lost commit response without requiring a reload or overwriting another revision', async () => {
    const f = fixture(); const record = new CloudStudyRecord(f.backend);
    f.setFailure('after-commit'); await expect(record.save({ notes: ['kept'] })).rejects.toThrow();
    f.setFailure(undefined); await record.save({ page: 24 });
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ notes: ['kept'], page: 24 });
  });

  it('stops before any cloud writes if durable local backup fails', async () => {
    const f = fixture(); const record = new CloudStudyRecord(f.backend);
    f.setFailure('backup'); await expect(record.save({ text: 'unsaved' })).rejects.toMatchObject({ code: 'local-backup' });
    expect(f.writes).toBe(0); expect(f.head).toBeNull();
  });

  it('queues rapid saves in order, snapshots caller data and avoids resending unchanged chunks', async () => {
    const f = fixture(); const record = new CloudStudyRecord(f.backend);
    const patch = { text: 'original' }; const first = record.save(patch); patch.text = 'mutated';
    await Promise.all([first, record.save({ page: 2 }), record.save({ page: 3 })]);
    const before = f.writes; const count = f.revisions.length;
    await record.save({ page: 3 });
    expect(f.writes).toBe(before); expect(f.revisions).toHaveLength(count);
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ text: 'original', page: 3 });
    expect(f.revisions[1].previousRevision).toBe(f.revisions[0].revision);
  });

  it('supports explicit empty arrays/null without resurrecting deleted legacy conversations', async () => {
    const legacy = { skimSessions: [{ id: 'old' }], quizData: { questions: ['old'] }, notebookData: ['keep'] };
    const f = fixture(legacy); await new CloudStudyRecord(f.backend).save({ skimSessions: [], quizData: null });
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ skimSessions: [], quizData: null, notebookData: ['keep'] });
    expect(legacy.skimSessions).toEqual([{ id: 'old' }]);
  });

  it('offline reopen can restore pending backup, but never fabricates empty data when no backup exists', async () => {
    const f = fixture(); const record = new CloudStudyRecord(f.backend);
    await record.read(); f.setFailure('head');
    await expect(record.save({ text: 'offline notes' })).rejects.toThrow();
    expect(await new CloudStudyRecord(f.backend).read()).toEqual({ text: 'offline notes' });
    f.drafts.clear(); await expect(new CloudStudyRecord(f.backend).read()).rejects.toThrow('offline');
  });

  it('never displays synced after an error and distinguishes size, conflict and permission failures', () => {
    expect(studySaveLabel(false, false, 'failed')).toBe('保存未完成');
    expect(studySaveLabel(false, true, '', true)).toBe('Saving');
    expect(studySaveLabel(false, false, '', true)).toBe('Synced');
    expect(studySaveFailure(new Error('exceeds the maximum allowed size'), false)).not.toContain('检查网络');
    expect(studySaveFailure({ code: 'permission-denied' }, false)).toContain('权限');
    expect(studySaveFailure(new CloudRecordError('conflict', '两份均保留'), false)).toBe('两份均保留');
  });
});
