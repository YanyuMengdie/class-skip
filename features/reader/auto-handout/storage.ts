import { parseDraft, parsePlan, parseModulePlan, type HandoutModulePlan, type HandoutJob } from './model';

export class HandoutConflictError extends Error {}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('classskip-auto-handout-v1', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('jobs')) request.result.createObjectStore('jobs', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('modulePlans')) request.result.createObjectStore('modulePlans', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
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
            // Legacy audit metadata no longer gates loading or exporting explanations.
          }
          if (v.plan) {
            // Interrupted planning may retain a validated subset. Missing pages are
            // retried on resume; previously completed explanations remain intact.
            const planned = v.plan.pages.map(page => page.page);
            if (planned.some(page => !v.pageNumbers.includes(page))) throw new Error('Plan outside job scope');
            parsePlan(v.plan, planned, [...new Set([...v.pageNumbers, ...v.plan.pages.flatMap(p => p.linkedPages)])]);
            if (v.plan.issues && Object.entries(v.plan.issues).some(([page, issue]) => !v.pageNumbers.includes(Number(page)) || typeof issue !== 'string')) throw new Error('Invalid planning issues');
          }
          if (v.modulePlan) {
            const total = v.modulePlan.totalPages;
            if (!Number.isSafeInteger(total) || total < 1 || total > 100000 || v.pageNumbers.some(page => page > total)) throw new Error('Invalid module source');
            parseModulePlan(v.modulePlan, Array.from({ length: total }, (_, i) => i + 1));
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

/** One directory per source/language, shared across page ranges and explanation depths. */
export async function sharedModulePlan(owner: string, source: string, language: string, sourcePages: number[], generate: () => Promise<HandoutModulePlan>, signal: AbortSignal): Promise<HandoutModulePlan> {
  const id = JSON.stringify(['module-plan-1', owner, source, language]);
  const check = () => { if (signal.aborted) throw new DOMException('Paused', 'AbortError'); };
  const work = async () => {
    check();
    const db = await openDatabase();
    try {
      const cached = await new Promise<HandoutModulePlan | undefined>((resolve, reject) => {
        const tx = db.transaction('modulePlans', 'readonly');
        const req = tx.objectStore('modulePlans').get(id);
        req.onsuccess = () => {
          try { resolve(req.result ? parseModulePlan(req.result.plan, sourcePages) : undefined); }
          catch { reject(new Error('已保存的模块目录格式异常，请保留草稿后重试。 / Saved module directory is invalid.')); }
        };
        req.onerror = () => reject(req.error);
      });
      check();
      if (cached) return cached;
      const plan = parseModulePlan(await generate(), sourcePages);
      check();
      // Read again inside the write transaction: tabs without Web Locks still
      // converge on one stable directory instead of replacing each other's plan.
      return await new Promise<HandoutModulePlan>((resolve, reject) => {
        const tx = db.transaction('modulePlans', 'readwrite');
        const store = tx.objectStore('modulePlans');
        const req = store.get(id);
        let selected = plan;
        req.onsuccess = () => {
          if (req.result) {
            try { selected = parseModulePlan(req.result.plan, sourcePages); }
            catch { tx.abort(); }
          } else store.put({ id, plan });
        };
        tx.oncomplete = () => resolve(selected);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Module directory was not saved.'));
      });
    } finally { db.close(); }
  };
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`auto-handout-modules:${id}`, { signal }, work);
  return work();
}
