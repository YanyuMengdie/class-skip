import type { LSAPContentMap, ExamMaterialLink } from '@/types';
import { computeExamWorkspaceLsapKey, loadWorkspaceLsapBundle } from '@/features/exam/lib/examWorkspaceLsapKey';
import type { CramSession, CramTopic } from './cramState';
import { cramId } from './cramState';

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('classskip-cram-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'id' });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Storage is busy in another tab.')); };
  });
  return database;
}
export async function loadCramSessions(userId: string): Promise<CramSession[]> {
  const db = await openDatabase();
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const r = db.transaction('sessions').objectStore('sessions').getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  return rows.filter((r): r is CramSession => !!r && typeof r === 'object' && (r as CramSession).userId === userId)
    .map(r => {
      if (r.version !== 1 || !Array.isArray(r.topics) || !Array.isArray(r.sources) || !Array.isArray(r.attempts)
        || !Array.isArray(r.visits) || !Array.isArray(r.requests)) throw new Error('Saved review data is not readable.');
      return r;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveCramSession(session: CramSession): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

/** Delete only this user's sprint snapshot, never its library PDFs or shared review caches. */
export async function deleteCramSession(userId: string, sessionId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    let denied = false;
    const request = store.get(sessionId);
    request.onsuccess = () => {
      // Missing records are already deleted, including a deletion in another tab.
      if (!request.result) return;
      if (request.result.userId !== userId) { denied = true; tx.abort(); return; }
      store.delete(sessionId);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(denied ? new Error('Cannot delete another user’s sprint.') : tx.error);
  });
}
/** Read known user-scoped cache keys only. Do not scan other users' storage or match by filename. */
export function reusableCramTopics(userId: string, material: ExamMaterialLink, maps: LSAPContentMap[]): CramTopic[] {
  const key = computeExamWorkspaceLsapKey(userId, material.examId, [material]);
  const local = loadWorkspaceLsapBundle(key)?.contentMap;
  const candidates = [...(local ? [local] : []), ...maps];
  const seen = new Set<string>();
  return candidates.flatMap(map => map.kcs.filter(k => k.sourceLinkId === material.id).flatMap(k => {
    const signature = `${k.concept}:${k.sourcePages.join(',')}`;
    if (seen.has(signature)) return []; seen.add(signature);
    return [{ id: cramId(), materialId: material.id, title: k.conceptZh || k.concept,
      summary: k.definitionZh || k.definition, pages: k.anchorPages?.length ? k.anchorPages : k.sourcePages,
      quote: k.sourceExcerpt || '', origin: 'cached' as const, included: true, familiarity: 'unknown' as const,
      group: 'quick' as const, status: 'unchecked' as const, priorityNote: '', note: '',
      order: seen.size, attempts: 0, independentPasses: 0 }];
  }));
}
