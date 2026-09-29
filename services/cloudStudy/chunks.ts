/** Immutable, content-addressed JSON trees. Every Firestore document stays well below 1 MiB. */
export const CHUNK_BYTES = 240 * 1024;
const FANOUT = 128;
export type Chunk = { kind: 'text'; text: string } | { kind: 'index'; children: string[] };
export interface FieldRef { hash: string; bytes: number }
export interface Manifest {
  format: 2;
  revision: string;
  previousRevision: string | null;
  fields: Record<string, FieldRef>;
}
const encoder = new TextEncoder();
export const byteLength = (text: string) => encoder.encode(text).length;
export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function splitText(text: string): string[] {
  const result: string[] = [];
  let start = 0, bytes = 0;
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i)!;
    const length = cp > 0xffff ? 2 : 1;
    const size = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) { result.push(text.slice(start, i)); start = i; bytes = 0; }
    bytes += size; i += length;
  }
  result.push(text.slice(start));
  return result;
}
export async function encodeFields(data: Record<string, unknown>) {
  const nodes = new Map<string, Chunk>();
  const fields: Record<string, FieldRef> = {};
  const add = async (node: Chunk) => {
    const hash = await hashText(JSON.stringify(node)); nodes.set(hash, node); return hash;
  };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const json = JSON.stringify(value);
    let hashes = await Promise.all(splitText(json).map(text => add({ kind: 'text', text })));
    while (hashes.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < hashes.length; i += FANOUT) next.push(await add({ kind: 'index', children: hashes.slice(i, i + FANOUT) }));
      hashes = next;
    }
    fields[key] = { hash: hashes[0], bytes: byteLength(json) };
  }
  return { fields, nodes };
}
export class CloudRecordError extends Error {
  constructor(public readonly code: 'incomplete' | 'conflict' | 'local-backup', message: string) { super(message); }
}
export function validateManifest(raw: unknown): Manifest {
  const m = raw as Manifest;
  if (!m || m.format !== 2 || typeof m.revision !== 'string' || !m.revision || !m.fields || Array.isArray(m.fields)
    || typeof m.fields !== 'object' || !(m.previousRevision === null || typeof m.previousRevision === 'string')
    || Object.values(m.fields).some(ref => !ref || !/^[a-f0-9]{64}$/.test(ref.hash) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0)) {
    throw new CloudRecordError('incomplete', '云端记录格式不完整，已停止读取，避免覆盖原记录。');
  }
  return m;
}
export async function decodeFields(fields: Manifest['fields'], read: (hash: string) => Promise<unknown>) {
  const cache = new Map<string, Promise<string>>();
  const visit = (hash: string, depth = 0): Promise<string> => {
    if (depth > 16) throw new CloudRecordError('incomplete', '云端内容层级异常，原记录未改动。');
    const existing = cache.get(hash); if (existing) return existing;
    const promise = (async () => {
      const node = await read(hash) as Chunk;
      if (!node || await hashText(JSON.stringify(node)) !== hash) throw new CloudRecordError('incomplete', '云端内容缺失或校验失败，原记录未改动。');
      if (node.kind === 'text' && typeof node.text === 'string') return node.text;
      if (node.kind !== 'index' || !Array.isArray(node.children) || !node.children.length || node.children.length > FANOUT
        || node.children.some(child => !/^[a-f0-9]{64}$/.test(child) || child === hash)) throw new CloudRecordError('incomplete', '云端分块索引不完整。');
      // Sequential traversal bounds concurrent downloads and transient memory use.
      const parts: string[] = [];
      for (const child of node.children) parts.push(await visit(child, depth + 1));
      return parts.join('');
    })();
    cache.set(hash, promise); return promise;
  };
  const data: Record<string, unknown> = {};
  for (const [key, ref] of Object.entries(fields)) {
    const json = await visit(ref.hash);
    if (byteLength(json) !== ref.bytes) throw new CloudRecordError('incomplete', '云端内容长度不一致，原记录未改动。');
    try { Object.defineProperty(data, key, { value: JSON.parse(json), enumerable: true, configurable: true, writable: true }); }
    catch { throw new CloudRecordError('incomplete', '云端内容无法完整还原，原记录未改动。'); }
  }
  return data;
}
