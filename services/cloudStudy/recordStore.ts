import { reconcileStudy, sameStudyValue } from './reconcile';
import { byteLength, CloudRecordError, decodeFields, encodeFields, validateManifest, type Chunk, type Manifest } from './chunks';

export interface StudyDraft {
  id: string;
  updatedAt: number;
  baseRevision: string | null;
  targetRevision: string;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
  pending: boolean;
  /** The exact displayed baseline, retained for safe recovery after reload. */
  baseData?: Record<string, unknown>;
  recoveredCopyId?: string;
}
export interface RecordBackend {
  readHead(): Promise<unknown | null>;
  readRevision?(revision: string): Promise<unknown | null>;
  readLegacy(): Promise<Record<string, unknown>>;
  readChunk(hash: string): Promise<unknown>;
  writeChunks(nodes: Map<string, Chunk>): Promise<void>;
  commit(manifest: Manifest, expectedRevision: string | null, meta: Record<string, unknown>): Promise<void>;
  drafts(): Promise<StudyDraft[]>;
  backup(draft: StudyDraft): Promise<void>;
}

/** One instance per account/document. Queues saves and only publishes a complete immutable revision. */
export class CloudStudyRecord {
  private loaded?: { data: Record<string, unknown>; localBase?: Record<string, unknown>; cloudData?: Record<string, unknown>; revision: string | null; fields?: Manifest['fields'] };
  private tail: Promise<unknown> = Promise.resolve();
  private confirmedChunks = new Set<string>();
  private writerId = crypto.randomUUID();
  private consumedDrafts = new Set<string>();
  private lastCommitAttempt?: StudyDraft;
  private lastCommitLocal?: Record<string, unknown>;
  private async baseline(revision: string | null): Promise<Record<string, unknown>> {
    if (revision === null) return this.backend.readLegacy();
    const raw = await this.backend.readRevision?.(revision);
    if (!raw) throw new CloudRecordError('conflict', '无法读取旧版本进行安全合并。两份记录均已保留；可将本页进度另存为副本后继续。');
    const manifest = validateManifest(raw);
    if (manifest.revision !== revision) throw new CloudRecordError('incomplete', '旧版本索引不匹配，已停止合并。');
    return decodeFields(manifest.fields, hash => this.backend.readChunk(hash));
  }
  constructor(private backend: RecordBackend) {}
  private async restore(activate = true): Promise<Record<string, unknown>> {
    const drafts = await this.backend.drafts();
    const pending = drafts.filter(d => d.pending).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    let head: Manifest | null;
    try {
      const raw = await this.backend.readHead(); head = raw === null ? null : validateManifest(raw);
    } catch (error) {
      if (!pending || error instanceof CloudRecordError) throw error;
      if (activate) this.consumedDrafts.add(pending.targetRevision);
      if (activate) this.loaded = { data: pending.data, localBase: pending.baseData, revision: pending.baseRevision };
      return structuredClone(pending.data);
    }
    const cloudData = head ? await decodeFields(head.fields, hash => this.backend.readChunk(hash)) : await this.backend.readLegacy();
    if (pending && head?.revision !== pending.targetRevision) {
      let base = pending.baseData;
      let data: Record<string, unknown>;
      try {
        base ??= (head?.revision ?? null) === pending.baseRevision ? cloudData : await this.baseline(pending.baseRevision);
        data = reconcileStudy(base, pending.data, cloudData);
      } catch (error) {
        if (activate && error instanceof CloudRecordError && error.code === 'conflict') {
          this.consumedDrafts.add(pending.targetRevision);
          this.loaded = { data: pending.data, localBase: base, revision: pending.baseRevision };
          Object.defineProperty(error, 'recoveryData', { value: structuredClone(pending.data), enumerable: false });
        }
        throw error;
      }
      if (activate) this.consumedDrafts.add(pending.targetRevision);
      if (activate) this.loaded = { data, localBase: cloudData, cloudData, revision: head?.revision ?? null, fields: head?.fields };
      return structuredClone(data);
    }
    if (activate) this.loaded = { data: cloudData, localBase: cloudData, cloudData, revision: head?.revision ?? null, fields: head?.fields };
    if (pending && head?.revision === pending.targetRevision) await this.backend.backup({ ...pending, pending: false });
    return structuredClone(cloudData);
  }
  read(): Promise<Record<string, unknown>> {
    return this.enqueue(() => this.restore());
  }
  /** Library/review lookups must not replace the baseline of an already open, edited reader. */
  inspect(): Promise<Record<string, unknown>> {
    return this.enqueue(() => this.restore(false));
  }
  localSnapshot(): Promise<Record<string, unknown>> {
    return this.enqueue(async () => {
      if (!this.loaded) await this.restore();
      return structuredClone(this.loaded!.data);
    });
  }
  markRecovered(copyId: string, snapshot: Record<string, unknown>): Promise<void> {
    return this.enqueue(async () => {
      if (!this.loaded || !sameStudyValue(this.loaded.data, snapshot)) return;
      for (const draft of await this.backend.drafts()) {
        if (draft.pending && (draft.id === this.writerId || this.consumedDrafts.has(draft.targetRevision)))
          await this.backend.backup({ ...draft, pending: false, recoveredCopyId: copyId });
      }
    });
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
      const sameRevision = (head?.revision ?? null) === this.loaded.revision;
      if (sameRevision && sameStudyValue(this.loaded.data, this.loaded.cloudData)) return null;
      if ((await this.backend.drafts()).some(draft => draft.pending)) return null;
      const data = sameRevision && this.loaded.cloudData ? this.loaded.cloudData
        : head ? await decodeFields(head.fields, hash => this.backend.readChunk(hash)) : await this.backend.readLegacy();
      if (!canApply()) return null;
      this.loaded = { data, localBase: data, cloudData: data, revision: head?.revision ?? null, fields: head?.fields };
      return structuredClone(data);
    });
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => {}).then(operation);
    this.tail = result; return result;
  }
  save(patch: Record<string, unknown>, meta: Record<string, unknown> = {}): Promise<{ reconciled: boolean }> {
    const clean = JSON.parse(JSON.stringify(patch)) as Record<string, unknown>;
    const cleanMeta = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
    return this.enqueue(async () => {
      if (!this.loaded) await this.restore();
      const previous = this.loaded!;
      const local = { ...previous.data, ...clean };
      const draft: StudyDraft = { id: this.writerId, updatedAt: Date.now(), baseRevision: previous.revision,
        targetRevision: crypto.randomUUID(), data: local, baseData: previous.localBase, meta: cleanMeta, pending: true };
      const backup = async () => {
        try { await this.backend.backup(draft); }
        catch { throw new CloudRecordError('local-backup', '本机备份未完成，已暂停云端更新。请保留当前页面并检查浏览器存储空间。'); }
      };
      await backup();
      this.loaded = { ...previous, data: local };
      // A transaction can race a different page after our read. Re-read and reconcile, never force-write.
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = await this.backend.readHead();
        const head = raw === null ? null : validateManifest(raw);
        if (head && head.revision === this.lastCommitAttempt?.targetRevision) {
          previous.revision = head.revision;
          previous.localBase = this.lastCommitLocal;
          previous.cloudData = this.lastCommitAttempt.data;
          this.loaded = { ...previous, data: local };
        }
        const remote = (head?.revision ?? null) === previous.revision && previous.cloudData ? previous.cloudData
          : head ? await decodeFields(head.fields, hash => this.backend.readChunk(hash)) : await this.backend.readLegacy();
        const base = previous.localBase ?? ((head?.revision ?? null) === previous.revision ? remote : await this.baseline(previous.revision));
        const data = reconcileStudy(base, local, remote);
        const reconciled = !sameStudyValue(local, data);
        // The backup itself becomes recoverable against this exact cloud base.
        draft.data = data; draft.baseData = remote; draft.baseRevision = head?.revision ?? null;
        await backup();
        const { fields, nodes } = await encodeFields(data);
        const unchanged = head && Object.keys(head.fields).length === Object.keys(fields).length
          && Object.entries(fields).every(([key, value]) => head.fields[key]?.hash === value.hash);
        if (unchanged && !Object.keys(cleanMeta).length) {
          this.loaded = { data: local, localBase: local, cloudData: data, revision: head.revision, fields: head.fields };
          await this.acknowledge(draft, head.revision); return { reconciled };
        }
        const manifest: Manifest = { format: 2, revision: draft.targetRevision, previousRevision: head?.revision ?? null, fields };
        if (byteLength(JSON.stringify(manifest)) > 240 * 1024) throw new CloudRecordError('incomplete', '资料索引过大，已保留本机副本并停止更新云端原记录。');
        const missing = new Map([...nodes].filter(([hash]) => !this.confirmedChunks.has(hash)));
        await this.backend.writeChunks(missing);
        for (const hash of missing.keys()) this.confirmedChunks.add(hash);
        this.lastCommitAttempt = structuredClone(draft); this.lastCommitLocal = structuredClone(local);
        try { await this.backend.commit(manifest, head?.revision ?? null, cleanMeta); }
        catch (error) {
          if (error instanceof CloudRecordError && error.code === 'conflict') {
            if (attempt < 2) continue;
            throw new CloudRecordError('conflict', '云端仍在连续更新，本机进度已保留。请重试同步，或将本页另存为副本后继续。');
          }
          throw error;
        }
        // Track the displayed baseline separately from the merged cloud version. Otherwise a later
        // whole-page autosave would erase remote messages the UI has not received yet.
        this.loaded = { data: local, localBase: local, cloudData: data, revision: manifest.revision, fields };
        await this.acknowledge(draft, manifest.revision);
        return { reconciled };
      }
      throw new CloudRecordError('conflict', '云端仍在连续更新，本机进度已保留。请重试同步，或将本页另存为副本后继续。');
    });
  }
  private async acknowledge(draft: StudyDraft, revision: string) {
    // Retain backups; acknowledge only this writer, explicitly consumed recoveries, or identical snapshots.
    const drafts = await this.backend.drafts();
    for (const stored of drafts) {
      if (!stored.pending || stored.updatedAt > draft.updatedAt) continue;
      if (stored.id !== draft.id && !this.consumedDrafts.has(stored.targetRevision)
        && !sameStudyValue(stored.data, draft.data)) continue;
      await this.backend.backup({ ...stored, targetRevision: revision, pending: false });
    }
    await this.backend.backup({ ...draft, targetRevision: revision, pending: false });
  }
}
