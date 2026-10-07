import { byteLength, CloudRecordError, decodeFields, encodeFields, validateManifest, type Chunk, type Manifest } from './chunks';

export interface StudyDraft {
  id: string;
  updatedAt: number;
  baseRevision: string | null;
  targetRevision: string;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
  pending: boolean;
}
export interface RecordBackend {
  readHead(): Promise<unknown | null>;
  readLegacy(): Promise<Record<string, unknown>>;
  readChunk(hash: string): Promise<unknown>;
  writeChunks(nodes: Map<string, Chunk>): Promise<void>;
  commit(manifest: Manifest, expectedRevision: string | null, meta: Record<string, unknown>): Promise<void>;
  drafts(): Promise<StudyDraft[]>;
  backup(draft: StudyDraft): Promise<void>;
}

/** One instance per account/document. Queues saves and only publishes a complete immutable revision. */
export class CloudStudyRecord {
  private loaded?: { data: Record<string, unknown>; revision: string | null; fields?: Manifest['fields'] };
  private tail: Promise<unknown> = Promise.resolve();
  private confirmedChunks = new Set<string>();
  private writerId = crypto.randomUUID();
  private consumedDrafts = new Set<string>();
  private lastCommitAttempt?: StudyDraft;
  constructor(private backend: RecordBackend) {}
  private async restore(): Promise<Record<string, unknown>> {
    const drafts = await this.backend.drafts();
    const pending = drafts.filter(d => d.pending).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    let head: Manifest | null;
    try {
      const raw = await this.backend.readHead(); head = raw === null ? null : validateManifest(raw);
    } catch (error) {
      if (!pending || error instanceof CloudRecordError) throw error;
      this.consumedDrafts.add(pending.targetRevision);
      this.loaded = { data: pending.data, revision: pending.baseRevision };
      return structuredClone(pending.data);
    }
    // A lost response after commit must not turn a successfully saved draft into a conflict.
    if (pending && head?.revision !== pending.targetRevision) {
      if ((head?.revision ?? null) !== pending.baseRevision) throw new CloudRecordError('conflict', '本机有未同步进度，云端也有不同的新版本。两份记录均已保留，已停止自动覆盖。');
      this.consumedDrafts.add(pending.targetRevision);
      this.loaded = { data: pending.data, revision: pending.baseRevision };
      return structuredClone(pending.data);
    }
    const data = head ? await decodeFields(head.fields, hash => this.backend.readChunk(hash)) : await this.backend.readLegacy();
    this.loaded = { data, revision: head?.revision ?? null, fields: head?.fields };
    if (pending && head?.revision === pending.targetRevision) await this.backend.backup({ ...pending, pending: false });
    return structuredClone(data);
  }
  read(): Promise<Record<string, unknown>> {
    return this.enqueue(() => this.restore());
  }
  get revision(): string | null | undefined { return this.loaded?.revision; }
  /** Serialize a revision check with this page's saves so its own commit cannot look remote. */
  withCurrentRevision<T>(operation: (revision: string | null) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      if (!this.loaded) await this.restore();
      return operation(this.loaded!.revision);
    });
  }
  /** Observe another device only while the caller still has the last saved snapshot. */
  refreshIfClean(canApply: () => boolean): Promise<Record<string, unknown> | null> {
    return this.enqueue(async () => {
      if (!this.loaded || !canApply()) return null;
      const raw = await this.backend.readHead();
      const head = raw == null ? null : validateManifest(raw);
      if ((head?.revision ?? null) === this.loaded.revision) return null;
      if ((await this.backend.drafts()).some(draft => draft.pending)) return null;
      const data = head ? await decodeFields(head.fields, hash => this.backend.readChunk(hash)) : await this.backend.readLegacy();
      if (!canApply()) return null;
      this.loaded = { data, revision: head?.revision ?? null, fields: head?.fields };
      return structuredClone(data);
    });
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => {}).then(operation);
    this.tail = result; return result;
  }
  save(patch: Record<string, unknown>, meta: Record<string, unknown> = {}): Promise<void> {
    // Snapshot now: callers can mutate their own state while this write waits in the queue.
    const clean = JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
    const cleanMeta = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
    return this.enqueue(async () => {
      if (!this.loaded) await this.restore();
      const previous = this.loaded!;
      const data = { ...previous.data, ...clean };
      const draft: StudyDraft = { id: this.writerId, updatedAt: Date.now(), baseRevision: previous.revision,
        targetRevision: crypto.randomUUID(), data, meta: cleanMeta, pending: true };
      try { await this.backend.backup(draft); }
      catch { throw new CloudRecordError('local-backup', '本机备份未完成，已暂停云端更新。请保留当前页面并检查浏览器存储空间。'); }
      // Keep failed changes in memory too. A later partial patch must not discard them.
      this.loaded = { ...previous, data };
      const { fields, nodes } = await encodeFields(data);
      const rawHead = await this.backend.readHead();
      const head = rawHead === null ? null : validateManifest(rawHead);
      if (head && head.revision === this.lastCommitAttempt?.targetRevision
        && previous.revision === this.lastCommitAttempt.baseRevision) {
        // The server committed but its response was lost. Continue from our own complete revision.
        previous.revision = head.revision;
        draft.baseRevision = head.revision;
        this.loaded = { data, revision: head.revision, fields: head.fields };
        await this.backend.backup(draft);
      }
      if ((head?.revision ?? null) !== previous.revision) {
        throw new CloudRecordError('conflict', '云端有另一个页面或设备保存的新进度。本机副本已保留，已暂停覆盖，请先处理版本冲突。');
      }
      const unchanged = head && Object.keys(head.fields).length === Object.keys(fields).length
        && Object.entries(fields).every(([key, value]) => head.fields[key]?.hash === value.hash);
      if (unchanged && !Object.keys(cleanMeta).length) {
        await this.acknowledge(draft, head.revision); return;
      }
      const manifest: Manifest = { format: 2, revision: draft.targetRevision, previousRevision: previous.revision, fields };
      if (byteLength(JSON.stringify(manifest)) > 240 * 1024) throw new CloudRecordError('incomplete', '资料索引过大，已保留本机副本并停止更新云端原记录。');
      const missing = new Map([...nodes].filter(([hash]) => !this.confirmedChunks.has(hash)));
      await this.backend.writeChunks(missing);
      for (const hash of missing.keys()) this.confirmedChunks.add(hash);
      // All chunk writes are acknowledged before the compare-and-swap. Old head is intact on any failure.
      this.lastCommitAttempt = draft;
      await this.backend.commit(manifest, previous.revision, cleanMeta);
      this.loaded = { data, revision: manifest.revision, fields };
      await this.acknowledge(draft, manifest.revision);
    });
  }
  private async acknowledge(draft: StudyDraft, revision: string) {
    // Retain backups, mark only drafts on this exact base which are contained in this save as synced.
    const drafts = await this.backend.drafts();
    for (const stored of drafts) {
      if (!stored.pending || stored.baseRevision !== draft.baseRevision || stored.updatedAt > draft.updatedAt) continue;
      if (stored.id !== draft.id && !this.consumedDrafts.has(stored.targetRevision)
        && JSON.stringify(stored.data) !== JSON.stringify(draft.data)) continue;
      await this.backend.backup({ ...stored, targetRevision: revision, pending: false });
    }
    await this.backend.backup({ ...draft, targetRevision: revision, pending: false });
  }
}
