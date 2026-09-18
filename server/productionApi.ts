import { gunzipSync } from 'node:zlib';
import { consumeStoredPayload } from './storedPayload';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { ExamAstraError } from './examAstra';
import { CanvasProxyError, requestCanvasApi, requestCanvasDownload } from './canvasProxy';
import { ProductionAuthError, requireProductionUser } from './productionAuth';

type Request = IncomingMessage & { body?: unknown };
function headers(response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}
// Streaming also handles Canvas PDFs larger than Vercel's buffered response limit.
export async function sendBytes(response: ServerResponse, bytes: Uint8Array) {
  for (let offset = 0; offset < bytes.length && !response.destroyed; offset += 64 * 1024) {
    if (!response.write(bytes.subarray(offset, offset + 64 * 1024))) {
      const controller = new AbortController(); const close = () => controller.abort();
      response.once('close', close);
      try { await once(response, 'drain', { signal: controller.signal }); }
      catch { if (response.destroyed) return; throw new Error('Response interrupted'); }
      finally { response.off('close', close); }
    }
  }
  if (!response.destroyed) response.end();
}
async function json(response: ServerResponse, status: number, value: unknown) {
  if (response.destroyed) return;
  headers(response); response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8');
  await sendBytes(response, Buffer.from(JSON.stringify(value)));
}
function body(request: Request, maxBytes: number): unknown {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new ExamAstraError('invalid_request', 415, '请使用 JSON 请求。');
  const value = request.body;
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  if (!encoded || Buffer.byteLength(encoded) > maxBytes) throw new ExamAstraError('invalid_request', 413, '请求内容过大，请缩小所选资料范围。');
  try { return JSON.parse(encoded); } catch { throw new ExamAstraError('invalid_request', 400, '无法识别请求内容。'); }
}
function failure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ProductionAuthError) return { status: error.status, code: 'unauthorized', message: error.message };
  if (error instanceof ExamAstraError || error instanceof CanvasProxyError) return error;
  return { status: 502, code: 'unavailable', message: '服务暂时不可用，请稍后重试。' };
}
export function modelHandler(options: { key: string; maxBytes: number; request: (key: string, raw: unknown, options: { signal: AbortSignal }) => Promise<unknown> }) {
  return async (request: Request, response: ServerResponse) => {
    headers(response);
    if (request.method !== 'POST') return json(response, 405, { error: { code: 'invalid_request', message: 'Use POST.' } });
    const controller = new AbortController(); const abort = () => controller.abort();
    response.once('close', abort); request.once('aborted', abort);
    try {
      const envelope = body(request, Math.min(options.maxBytes, 4_000_000));
      const stored = await readRequestPayload(request, envelope, options.maxBytes, controller.signal);
      let input: unknown = envelope;
      if (stored) {
        try { input = JSON.parse(stored.toString('utf8')); }
        catch { throw new ExamAstraError('invalid_request', 400, '无法识别暂存资料。'); }
      }
      const result = await options.request(process.env[options.key] || '', input, { signal: controller.signal });
      await json(response, 200, result);
    } catch (error) {
      const safe = failure(error);
      await json(response, safe.status, { error: { code: safe.code, message: safe.message,
        ...(error instanceof ExamAstraError && error.diagnostics ? { diagnostics: error.diagnostics } : {}) } });
    } finally { response.off('close', abort); request.off('aborted', abort); }
  };
}
export function modelStatusHandler(model: string, key: string) {
  return async (request: Request, response: ServerResponse) => {
    if (request.method !== 'GET') return json(response, 405, { error: { code: 'invalid_request', message: 'Use GET.' } });
    try { await json(response, 200, { configured: !!process.env[key]?.trim(), model }); }
    catch (error) { const safe = failure(error); await json(response, safe.status, { error: { code: safe.code, message: safe.message } }); }
  };
}
export function canvasHandler(operation: 'request' | 'download') {
  return async (request: Request, response: ServerResponse) => {
    headers(response);
    if (request.method !== 'POST') return json(response, 405, { error: '请使用 POST 请求。', code: 'invalid_request' });
    const controller = new AbortController(); const abort = () => controller.abort();
    response.once('close', abort); request.once('aborted', abort);
    try {
      const input = body(request, 20_000) as Record<string, unknown>;
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CanvasProxyError('invalid_request', 400, '请求格式不正确。');
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
      if (!/^Bearer\s+/i.test(request.headers.authorization || '')) throw new CanvasProxyError('unauthorized', 401, '缺少 Canvas 令牌。');
      if (operation === 'request') await json(response, 200, await requestCanvasApi(input.canvasUrl, input.path, token, { signal: controller.signal }));
      else {
        const result = await requestCanvasDownload(input.canvasUrl, input.fileId, token, { signal: controller.signal });
        response.statusCode = 200; response.setHeader('Content-Type', result.contentType);
        response.setHeader('X-Canvas-File-Name', encodeURIComponent(result.name)); response.setHeader('Content-Disposition', 'attachment');
        await sendBytes(response, result.body);
      }
    } catch (error) {
      const safe = failure(error); await json(response, safe.status, { error: safe.message, code: safe.code, incomplete: safe.code === 'incomplete' });
    } finally { response.off('close', abort); request.off('aborted', abort); }
  };
}

/** Public inline bodies never authorize access to account-owned stored files. */
export async function readRequestPayload(request: Request, envelope: unknown, maxBytes: number, signal?: AbortSignal): Promise<Buffer | undefined> {
  if (!envelope || typeof envelope !== 'object') return undefined;
  if ('__classSkipCompressed' in envelope) {
    const encoded = (envelope as { __classSkipCompressed: unknown }).__classSkipCompressed;
    if (typeof encoded !== 'string' || encoded.length > 4_000_000) throw new ExamAstraError('invalid_request', 413, '传输资料过大。');
    try { return gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: maxBytes }); }
    catch { throw new ExamAstraError('invalid_request', 400, '无法解压资料，或资料超过处理上限。'); }
  }
  if ('__classSkipPayload' in envelope) {
    const uid = await requireProductionUser(request);
    return consumeStoredPayload(envelope, String(request.headers['x-classskip-token']), uid, maxBytes, signal);
  }
  return undefined;
}
