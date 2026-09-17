import { ExamAstraError } from './examAstra';

const bucket = 'ai-tutor-647fd.firebasestorage.app';
/** Only the signed-in user's temporary request object can be read. Never accept arbitrary URLs. */
export async function consumeStoredPayload(value: unknown, token: string, uid: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer | undefined> {
  if (!value || typeof value !== 'object' || !('__classSkipPayload' in value)) return undefined;
  const path = (value as { __classSkipPayload?: unknown }).__classSkipPayload;
  const prefix = `users/${uid}/uploads/request-`;
  if (typeof path !== 'string' || !path.startsWith(prefix) || !/^[a-f0-9-]{36}\.bin$/.test(path.slice(prefix.length))) {
    throw new ExamAstraError('invalid_request', 400, '无法读取这次上传的资料。');
  }
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`;
  const authorization = { Authorization: `Bearer ${token}` };
  try {
    const response = await fetch(`${url}?alt=media`, { headers: authorization, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new ExamAstraError('invalid_request', 400, '暂存资料不可用，请重新选择资料。');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new ExamAstraError('invalid_request', 413, '所选资料超过单次处理上限。');
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > maxBytes) throw new ExamAstraError('invalid_request', 413, '所选资料超过单次处理上限。');
        chunks.push(chunk);
      }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  } finally {
    // The browser also cleans up on cancellation; no private document is published as a URL.
    await fetch(url, { method: 'DELETE', headers: authorization, redirect: 'error', signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
