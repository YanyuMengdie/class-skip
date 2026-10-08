export interface RecoverySource { userId: string; fileName: string; fileUrl: string; parentId?: string | null }
export interface RecoveryBackend {
  owner(): string | undefined;
  source(id: string): Promise<RecoverySource | null>;
  create(id: string, sourceId: string, source: RecoverySource): Promise<void>;
  save(id: string, data: Record<string, unknown>): Promise<void>;
}

/** Reuse the same target on retry. No original metadata, file or study record is written. */
export async function saveRecoveryCopy(backend: RecoveryBackend, sourceId: string, copyId: string, data: Record<string, unknown>) {
  const owner = backend.owner();
  if (!owner || sourceId === copyId || !/^recovery-[a-f0-9-]{36}$/.test(copyId)) throw new Error('无法创建进度副本。');
  const snapshot = structuredClone(data);
  const source = await backend.source(sourceId);
  if (!source || source.userId !== owner || !source.fileUrl) throw new Error('原资料已不可用或账号无权读取。');
  const guard = () => { if (backend.owner() !== owner) throw new Error('账号已切换，副本保存已停止。'); };
  guard(); await backend.create(copyId, sourceId, source);
  guard(); await backend.save(copyId, snapshot);
}
