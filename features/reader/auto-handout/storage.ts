import { parseAudit, parseDraft, parsePlan, type HandoutJob } from './model';

export class HandoutConflictError extends Error {}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('classskip-auto-handout-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('jobs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他试验页面后重试保存。 / Close other trial tabs and retry.'));
  });
}
export async function loadHandoutJob(id: string, owner: string, source: string): Promise<HandoutJob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('jobs', 'readonly');
      const request = tx.objectStore('jobs').get(id);
      let result: HandoutJob | undefined;
      request.onsuccess = () => {
        const v = request.result as HandoutJob | undefined;
        if (!v || v.owner !== owner || v.source !== source) return;
        try {
          if (v.version !== 1 || v.id !== id || !Number.isInteger(v.revision) || !Array.isArray(v.pageNumbers) || !v.pages) throw new Error('Invalid draft');
          for (const page of v.pageNumbers) {
            const item = v.pages[page];
            if (!item || item.page !== page || !['pending', 'draft', 'checked', 'needs_review', 'edited', 'failed'].includes(item.status)) throw new Error('Invalid page');
            if (item.draft) parseDraft(item.draft);
            if (item.audit) parseAudit(item.audit);
          }
          if (v.plan) {
            // Interrupted planning may retain a validated subset. Missing pages are
            // retried on resume; previously completed explanations remain intact.
            const planned = v.plan.pages.map(page => page.page);
            if (planned.some(page => !v.pageNumbers.includes(page))) throw new Error('Plan outside job scope');
            parsePlan(v.plan, planned, [...new Set([...v.pageNumbers, ...v.plan.pages.flatMap(p => p.linkedPages)])]);
            if (v.plan.issues && Object.entries(v.plan.issues).some(([page, issue]) => !v.pageNumbers.includes(Number(page)) || typeof issue !== 'string')) throw new Error('Invalid planning issues');
          }
          result = v;
        } catch { reject(new Error('本机试验草稿格式异常，未覆盖原记录。 / Invalid local draft; existing data retained.')); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function saveHandoutJob(job: HandoutJob): Promise<HandoutJob> {
  const db = await openDatabase();
  try {
    return await new Promise<HandoutJob>((resolve, reject) => {
      const tx = db.transaction('jobs', 'readwrite');
      const store = tx.objectStore('jobs');
      const request = store.get(job.id);
      let conflict = false;
      const saved = { ...job, revision: job.revision + 1 };
      request.onsuccess = () => {
        const previous = request.result as HandoutJob | undefined;
        if ((previous?.revision ?? 0) !== job.revision || previous && (previous.owner !== job.owner || previous.source !== job.source)) {
          conflict = true; tx.abort(); return;
        }
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ? new HandoutConflictError('试验草稿已在其他页面更新，未覆盖已保存的内容。 / This trial draft changed in another tab; saved work was not overwritten.') : tx.error);
    });
  } finally { db.close(); }
}
