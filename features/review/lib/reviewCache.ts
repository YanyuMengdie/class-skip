import type { FlashCard, QuizRound, SavedArtifact } from '@/types';
export interface ReviewCache { key: string; artifacts: SavedArtifact[]; cards: FlashCard[]; rounds: QuizRound[] }
const DATABASE = 'ClassSkipReviewResults';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('results', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadReviewCache(key: string): Promise<ReviewCache | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('results');
    const request = tx.objectStore('results').get(key);
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function writeReviewCache(value: ReviewCache): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function allReviewCaches(owner: string): Promise<ReviewCache[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('results');
    const request = tx.objectStore('results').getAll();
    tx.oncomplete = () => { db.close(); resolve((request.result as ReviewCache[]).filter(v => v.key.startsWith(`${owner}:`))); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

let pendingWrite: Promise<void> = Promise.resolve();
export function saveReviewCache(value: ReviewCache): Promise<void> {
  const write = pendingWrite.catch(() => undefined).then(() => writeReviewCache(value));
  pendingWrite = write;
  return write;
}
