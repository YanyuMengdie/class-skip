import { CloudRecordError } from './chunks';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);

export function sameStudyValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameStudyValue(value, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameStudyValue(a[key], b[key]));
}

const itemKey = (value: unknown): string | null => {
  if (!record(value)) return null;
  if (typeof value.id === 'string' && value.id) return `id:${value.id}`;
  // Older reading messages did not have IDs. Never match them by array position.
  if ((value.role === 'user' || value.role === 'model') && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp))
    return `message:${value.role}:${value.timestamp}`;
  return null;
};
const keyed = (values: unknown[]) => {
  const map = new Map<string, unknown>();
  for (const value of values) {
    const key = itemKey(value);
    if (!key || map.has(key)) return null;
    map.set(key, value);
  }
  return map;
};

// These are navigation/layout preferences, never answers, knowledge or completion status.
const localPreference = (path: string[]) =>
  (path.length === 1 && ['currentIndex', 'viewMode', 'activeSkimIndex', 'skimTopHeight', 'skimFocusMode'].includes(path[0])) ||
  (path[0] === 'skimSessions' && path.length === 3 && ['topHeight', 'focusMode', 'continuousLastPage'].includes(path[2])) ||
  (path[0] === 'skimSessions' && path.length === 4 && path[2] === 'recordDeck' && ['view', 'activeCardId', 'selectedModuleIndex'].includes(path[3])) ||
  (path[0] === 'skimSessions' && path.length === 6 && path[2] === 'recordDeck' && path[3] === 'cards' && ['lastPage', 'lastOpenedAt'].includes(path[5]));

function merge(base: unknown, local: unknown, remote: unknown, path: string[]): unknown {
  if (sameStudyValue(local, base)) return remote;
  if (sameStudyValue(remote, base) || sameStudyValue(local, remote)) return local;
  if (localPreference(path)) return local;
  if ((record(base) || base === undefined) && record(local) && record(remote)) {
    const result: JsonRecord = {};
    for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(remote), ...Object.keys(local)])) {
      const value = merge(base?.[key], local[key], remote[key], [...path, key]);
      if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const before = keyed(base), here = keyed(local), there = keyed(remote);
    if (before && here && there) {
      // Preserve existing order. Concurrent reorderings require explicit resolution.
      const order = [...before.keys()];
      const preservesOrder = (map: Map<string, unknown>) => {
        const retained = [...map.keys()].filter(key => before.has(key));
        const expected = order.filter(old => map.has(old));
        let appended = false;
        for (const key of map.keys()) {
          if (!before.has(key)) appended = true;
          else if (appended) return false;
        }
        return retained.every((key, index) => key === expected[index]);
      };
      if (preservesOrder(here) && preservesOrder(there)) {
        const result: unknown[] = [];
        for (const key of new Set([...order, ...there.keys(), ...here.keys()])) {
          const value = merge(before.get(key), here.get(key), there.get(key), [...path, key]);
          if (value !== undefined) result.push(value);
        }
        return result;
      }
    }
  }
  throw new CloudRecordError('conflict', '同一处学习内容出现了不同修改，无法安全自动合并。本机与云端记录均已保留；可将本页进度另存为副本后继续。');
}

/** Apply only local changes relative to the displayed baseline; retain unrelated cloud changes. */
export function reconcileStudy(base: JsonRecord, local: JsonRecord, remote: JsonRecord): JsonRecord {
  return structuredClone(merge(base, local, remote, []) as JsonRecord);
}
