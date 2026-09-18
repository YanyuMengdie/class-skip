import type { CloudSession } from '@/types';

const PREFIX = 'local:';
export const isLocalId = (id: string) => id.startsWith(PREFIX);
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('ClassSkipLocalWorkspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(new Error('无法打开本机存储，请允许浏览器保存网站数据。')); };
  });
  return opening;
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', mode);
    const request = run(tx.objectStore('records'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机保存失败，请检查浏览器存储空间。'));
  });
}
export async function localGet<T>(bucket: string, id: string): Promise<T | null> {
  return (await transaction('readonly', store => store.get(`${bucket}/${id}`))) ?? null;
}
export async function localPut<T>(bucket: string, id: string, value: T): Promise<void> {
  await transaction('readwrite', store => store.put(value, `${bucket}/${id}`));
}
export async function localDelete(bucket: string, id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(`${bucket}/${id}`));
}
export async function localList<T>(bucket: string): Promise<T[]> {
  return transaction('readonly', store => store.getAll(IDBKeyRange.bound(`${bucket}/`, `${bucket}/\uffff`)));
}
export async function localCreate<T extends object>(bucket: string, value: T): Promise<T & { id: string; userId: string }> {
  const row = { ...value, id: `${PREFIX}${crypto.randomUUID()}`, userId: 'local' };
  await localPut(bucket, row.id, row);
  return row;
}
export async function localPatch<T extends object>(bucket: string, id: string, partial: Partial<T>): Promise<void> {
  // Merge inside one read/write transaction so concurrent autosaves cannot discard fields.
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    const req = store.get(`${bucket}/${id}`);
    req.onsuccess = () => {
      if (!req.result) { tx.abort(); return; }
      store.put({ ...req.result, ...partial }, `${bucket}/${id}`);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机记录已不存在，无法更新。'));
  });
}
export async function saveLocalFile(file: Blob): Promise<string> {
  const id = `${PREFIX}${crypto.randomUUID()}`;
  await localPut('files', id, file);
  return `classskip-local:${id}`;
}
export async function readLocalFile(url: string, name: string): Promise<File> {
  const blob = await localGet<Blob>('files', url.slice('classskip-local:'.length));
  if (!blob) throw new Error('这份本机文件已不存在，请重新添加。');
  return new File([blob], name, { type: blob.type || 'application/pdf' });
}
export async function createLocalSession(fileName: string, fileUrl: string, parentId: string | null, type: 'file' | 'folder' = 'file'): Promise<string> {
  const now = Date.now();
  return (await localCreate('sessions', { fileName, fileUrl, parentId, type, createdAt: now, updatedAt: now, sortIndex: now })).id;
}
export async function deleteLocalFolder(folder: CloudSession): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite'); const store = tx.objectStore('records');
    const req = store.getAll(IDBKeyRange.bound('sessions/', 'sessions/\uffff'));
    req.onsuccess = () => {
      for (const row of req.result as CloudSession[]) if (row.parentId === folder.id)
        store.put({ ...row, parentId: folder.parentId ?? null }, `sessions/${row.id}`);
      store.delete(`sessions/${folder.id}`);
    };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
