/**
 * 备考 chunk 索引持久化：独立 IndexedDB，键为 computeExamWorkspaceLsapKey 的 workspaceKey。
 */
import type { ExamMaterialTextChunk } from '../types';

const DB_NAME = 'ExamChunkIndexDB';
const DB_VERSION = 1;
const STORE_NAME = 'workspaceChunkIndex';

interface WorkspaceChunkRow {
  workspaceKey: string;
  chunks: ExamMaterialTextChunk[];
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'workspaceKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveExamMaterialChunkIndex(workspaceKey: string, chunks: ExamMaterialTextChunk[]): Promise<void> {
  const db = await openDb();
  const row: WorkspaceChunkRow = { workspaceKey, chunks, savedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const r = store.put(row);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

export async function loadExamMaterialChunkIndex(workspaceKey: string): Promise<ExamMaterialTextChunk[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const r = store.get(workspaceKey);
    r.onsuccess = () => {
      const row = r.result as WorkspaceChunkRow | undefined;
      resolve(row?.chunks ?? null);
    };
    r.onerror = () => reject(r.error);
  });
}

/** 1-4：调试与降级判断 — 本场 workspace 下已持久化的 chunk 总量与涉及材料数（多材料时按 materialLinkId 去重） */
export async function getExamChunkIndexStats(workspaceKey: string): Promise<{
  totalChunks: number;
  distinctMaterialLinkIds: string[];
} | null> {
  const chunks = await loadExamMaterialChunkIndex(workspaceKey);
  if (!chunks) return null;
  const distinctMaterialLinkIds = [...new Set(chunks.map((c) => c.materialLinkId))];
  return { totalChunks: chunks.length, distinctMaterialLinkIds };
}
