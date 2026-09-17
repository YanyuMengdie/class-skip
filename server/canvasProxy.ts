import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { isLocalExamRequest } from './examAstraProxy';
import { canvasFileAccessProblem } from '../shared/canvasFileAccess';

export const CANVAS_MAX_PAGES = 100;
export const CANVAS_API_MAX_BYTES = 20 * 1024 * 1024;
export const CANVAS_DOWNLOAD_MAX_BYTES = 64 * 1024 * 1024;
export const CANVAS_TIMEOUT_MS = 120_000;
// Canvas rejects requests without an identifying User-Agent before checking the token.
export const CANVAS_USER_AGENT = 'ClassSkip/1.0 (Canvas course reader)';
const MAX_REDIRECTS = 5;

export class CanvasProxyError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name = 'CanvasProxyError'; }
}
const invalid = () => new CanvasProxyError('invalid_request', 400, '请输入学校的 HTTPS Canvas 地址及有效的读取路径。');
const incomplete = () => new CanvasProxyError('incomplete', 502, 'Canvas 内容未读取完整，请重试；本次不会作为完整同步结果。');
const unavailable = () => new CanvasProxyError('unavailable', 502, '暂时无法读取 Canvas，请稍后重试。');

/** Only globally routable addresses may receive a request, including after redirects. */
export function isPublicCanvasAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  // Allow native global unicast only; exclude documentation, Teredo, 6to4 and benchmark ranges.
  return /^[23][0-9a-f]{3}:/.test(normalized) && !/^2002:/.test(normalized) &&
    !/^2001:(?:db8|0|2|10|20)(?::|$)/.test(normalized) && !/^2001::/.test(normalized);
}

function publicHttpsUrl(value: unknown, base?: URL): URL {
  try {
    if (typeof value !== 'string' || !value || value.length > 16000 || /[\x00-\x20\\]/.test(value)) throw invalid();
    const url = new URL(value, base);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password ||
      !hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
      hostname.endsWith('.internal') || hostname.endsWith('.test') || hostname.endsWith('.invalid') ||
      (!hostname.includes('.') && !isIP(hostname)) || (isIP(hostname) && !isPublicCanvasAddress(hostname))) throw invalid();
    url.hash = '';
    return url;
  } catch { throw invalid(); }
}

export function canvasBaseUrl(value: unknown): URL {
  const url = publicHttpsUrl(value);
  url.pathname = '/'; url.search = ''; return url;
}
function canvasApiUrl(value: unknown, base: URL): URL {
  const url = publicHttpsUrl(value, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/v1/')) throw invalid();
  let decodedPath = url.pathname;
  for (let step = 0; step < 3; step += 1) {
    try { decodedPath = decodeURIComponent(decodedPath); } catch { throw invalid(); }
    if (decodedPath.includes('\\') || decodedPath.split('/').some(part => part === '.' || part === '..')) throw invalid();
  }
  if ([...url.searchParams.keys()].some(key => ['access_token', '_method'].includes(key.toLowerCase()))) throw invalid();
  return url;
}
function validToken(value: string): string {
  const token = value.trim();
  if (!token || token.length > 4096 || /[\x00-\x20\x7f]/.test(token)) throw new CanvasProxyError('unauthorized', 401, '缺少有效的 Canvas 访问令牌。');
  return token;
}

type Address = { address: string; family: number };
export interface CanvasHttpReply { status: number; headers: Record<string, string | undefined>; body: Uint8Array }
export interface CanvasTransportOptions { headers: Record<string, string>; address: Address; signal: AbortSignal; maxBytes: number }
export interface CanvasProxyOptions {
  signal?: AbortSignal;
  resolve?: (hostname: string) => Promise<Address[]>;
  transport?: (url: URL, options: CanvasTransportOptions) => Promise<CanvasHttpReply>;
}

/** The socket lookup uses the validated address, closing the DNS-rebinding check/use gap. */
export const canvasHttpsTransport = (url: URL, options: CanvasTransportOptions): Promise<CanvasHttpReply> => new Promise((resolve, reject) => {
  const request = httpsRequest(url, {
    method: 'GET', headers: { ...options.headers, 'User-Agent': CANVAS_USER_AGENT, 'Accept-Encoding': 'identity' }, signal: options.signal,
    lookup: ((_hostname: string, _lookupOptions: unknown, callback: (...args: unknown[]) => void) => {
      if (typeof _lookupOptions === 'object' && _lookupOptions !== null && 'all' in _lookupOptions && _lookupOptions.all) {
        callback(null, [options.address]);
      } else callback(null, options.address.address, options.address.family);
    }) as never,
  }, response => {
    const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
    const size = Number(headers['content-length']);
    if (size > options.maxBytes || (headers['content-encoding'] && headers['content-encoding'] !== 'identity')) {
      response.destroy(); request.destroy(); reject(new CanvasProxyError('too_large', 413, 'Canvas 内容过大或格式无法完整读取。')); return;
    }
    const chunks: Buffer[] = []; let bytes = 0;
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > options.maxBytes) { response.destroy(); request.destroy(); reject(new CanvasProxyError('too_large', 413, 'Canvas 内容超出读取大小限制。')); return; }
      chunks.push(chunk);
    });
    response.on('end', () => resolve({ status: response.statusCode ?? 502, headers, body: Buffer.concat(chunks) }));
    response.on('error', () => reject(unavailable()));
    response.on('aborted', () => reject(incomplete()));
  });
  request.on('error', () => reject(unavailable()));
  request.end();
});

async function withSession<T>(options: CanvasProxyOptions, work: (get: (url: URL, headers: Record<string, string>, maxBytes: number) => Promise<CanvasHttpReply>) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let timedOut = false;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => reject(new CanvasProxyError(timedOut ? 'timeout' : 'cancelled', timedOut ? 504 : 499,
      timedOut ? 'Canvas 读取超时，本次同步未完成。' : 'Canvas 读取已取消。'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, CANVAS_TIMEOUT_MS);
  });
  const get = async (url: URL, headers: Record<string, string>, maxBytes: number) => {
    if (controller.signal.aborted) throw new CanvasProxyError('cancelled', 499, 'Canvas 读取已取消。');
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await (options.resolve ?? (name => lookup(name, { all: true })))(hostname);
    if (!addresses.length || addresses.some(entry => !isPublicCanvasAddress(entry.address))) throw new CanvasProxyError('unsafe_address', 400, 'Canvas 地址必须指向学校的公网 HTTPS 服务。');
    const reply = await (options.transport ?? canvasHttpsTransport)(url, { headers, address: addresses.find(entry => entry.family === 4) ?? addresses[0], signal: controller.signal, maxBytes });
    if (reply.body.byteLength > maxBytes) throw new CanvasProxyError('too_large', 413, 'Canvas 内容超出读取大小限制。');
    return reply;
  };
  try { return await Promise.race([work(get), stopped]); }
  catch (error) { throw error instanceof CanvasProxyError ? error : unavailable(); }
  finally {
    if (timer) clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}
function requireSuccess(reply: CanvasHttpReply): void {
  if (reply.status >= 200 && reply.status < 300) return;
  if (reply.status === 401 || reply.status === 403) {
    // Edge rejection pages must not be blamed on the user's credentials. Never echo their HTML.
    const body = Buffer.from(reply.body).subarray(0, 32_768).toString('utf8');
    if (/not (?:provided|providing) a valid user[ -]agent|missing.{0,30}user[ -]agent/i.test(body)) {
      throw new CanvasProxyError('request_rejected', 502, 'Canvas 拒绝了应用的请求标识。这是连接配置问题，不代表你的令牌无效；请更新或重启本地服务后重试。');
    }
    let isJson = false;
    try { const parsed: unknown = JSON.parse(body); isJson = !!parsed && typeof parsed === 'object'; } catch { /* Often a gateway error page. */ }
    if (!isJson) throw new CanvasProxyError('connection_rejected', 502, '学校的连接入口拒绝了请求，尚未确认令牌是否有效。请检查连接服务，或稍后重试。');
    if (reply.status === 401) throw new CanvasProxyError('unauthorized', 401, 'Canvas 未接受这个访问令牌（401）。请核对令牌是否属于当前学校，以及是否仍在有效期内。');
    throw new CanvasProxyError('forbidden', 403, 'Canvas 拒绝读取这项内容（403）。请核对账号的课程访问权限；这不等于令牌已失效。');
  }
  if (reply.status === 404) throw new CanvasProxyError('not_found', 404, 'Canvas 未找到这项内容，可能已删除或尚未开放。');
  if (reply.status === 429) throw new CanvasProxyError('rate_limit', 429, 'Canvas 请求过于频繁，请稍后重新同步。');
  throw unavailable();
}
function parseJson(reply: CanvasHttpReply): unknown {
  requireSuccess(reply);
  try { return JSON.parse(Buffer.from(reply.body).toString('utf8')); } catch { throw incomplete(); }
}
function nextPageLink(header: string | undefined): string | null {
  if (!header) return null;
  // URLs in Canvas Link headers are opaque: preserve the exact query and cursor.
  for (const match of header.matchAll(/<([^>]+)>\s*((?:;[^,<]*)*)/g)) {
    const relation = match[2].match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s,]+))/i);
    if ((relation?.[1] ?? relation?.[2] ?? '').split(/\s+/).includes('next')) return match[1];
  }
  if (/\bnext\b/i.test(header)) throw incomplete();
  return null;
}

/** No partial arrays: missing pages, loops and caps all invalidate this endpoint result. */
export async function requestCanvasApi(canvasUrl: unknown, path: unknown, accessToken: string, options: CanvasProxyOptions = {}): Promise<unknown> {
  const base = canvasBaseUrl(canvasUrl); const token = validToken(accessToken);
  if (typeof path !== 'string' || !path.startsWith('/api/v1/')) throw invalid();
  const initial = canvasApiUrl(path, base);
  return withSession(options, async get => {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let target = initial; let combined: unknown[] = []; let totalBytes = 0;
    const seen = new Set<string>();
    for (let page = 0; page < CANVAS_MAX_PAGES; page += 1) {
      if (seen.has(target.href)) throw incomplete();
      seen.add(target.href);
      let reply: CanvasHttpReply; let data: unknown;
      try {
        // API redirects are refused, rather than forwarding credentials to a login or another host.
        reply = await get(target, headers, CANVAS_API_MAX_BYTES - totalBytes);
        totalBytes += reply.body.byteLength;
        data = parseJson(reply);
      } catch (error) { if (page > 0) throw incomplete(); throw error; }
      const next = nextPageLink(reply.headers.link);
      if (!Array.isArray(data)) {
        if (page > 0 || next) throw incomplete();
        return data;
      }
      combined.push(...data);
      if (!next) return combined;
      try { target = canvasApiUrl(next, base); } catch { throw incomplete(); }
    }
    throw incomplete();
  });
}

export async function requestCanvasDownload(canvasUrl: unknown, fileId: unknown, accessToken: string, options: CanvasProxyOptions = {}): Promise<{ body: Uint8Array; name: string; contentType: string }> {
  const base = canvasBaseUrl(canvasUrl); const token = validToken(accessToken);
  if (!Number.isSafeInteger(fileId) || Number(fileId) <= 0) throw invalid();
  return withSession(options, async get => {
    const metadata = parseJson(await get(new URL(`/api/v1/files/${fileId}`, base), { Authorization: `Bearer ${token}`, Accept: 'application/json' }, CANVAS_API_MAX_BYTES)) as Record<string, unknown> | null;
    if (!metadata || typeof metadata !== 'object') throw incomplete();
    const accessProblem = canvasFileAccessProblem(metadata);
    if (accessProblem) throw new CanvasProxyError('file_locked', 403, accessProblem);
    if (typeof metadata.url !== 'string') throw incomplete();
    let target = publicHttpsUrl(metadata.url); const seen = new Set<string>();
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (seen.has(target.href)) throw incomplete();
      seen.add(target.href);
      // Canvas may redirect to signed CDN URLs. The token is only ever sent to the original origin.
      const headers: Record<string, string> = target.origin === base.origin ? { Authorization: `Bearer ${token}` } : {};
      const reply = await get(target, headers, CANVAS_DOWNLOAD_MAX_BYTES);
      if ([301, 302, 303, 307, 308].includes(reply.status)) {
        if (!reply.headers.location) throw incomplete();
        target = publicHttpsUrl(reply.headers.location, target); continue;
      }
      requireSuccess(reply);
      const name = typeof metadata.display_name === 'string' ? metadata.display_name : typeof metadata.filename === 'string' ? metadata.filename : `canvas-${fileId}.pdf`;
      const contentType = reply.headers['content-type'] || (typeof metadata['content-type'] === 'string' ? metadata['content-type'] : 'application/octet-stream');
      return { body: reply.body, name: name.slice(0, 1000), contentType: /^[\w.+-]+\/[\w.+-]+(?:;[^\r\n]*)?$/.test(contentType) ? contentType : 'application/octet-stream' };
    }
    throw incomplete();
  });
}

async function readBody(request: IncomingMessage, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (Number(request.headers['content-length']) > 20000) throw invalid();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0;
    const clean = () => {
      request.off('data', onData); request.off('end', onEnd); request.off('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = (error: CanvasProxyError) => { clean(); request.pause(); reject(error); };
    const onData = (chunk: Buffer) => {
      const buffer = Buffer.from(chunk); bytes += buffer.length;
      if (bytes > 20000) { fail(invalid()); return; }
      chunks.push(buffer);
    };
    const onEnd = () => {
      clean();
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
        resolve(body);
      } catch { reject(invalid()); }
    };
    const onError = () => fail(invalid());
    const onAbort = () => fail(new CanvasProxyError('timeout', 408, 'Canvas 读取请求已取消或超时。'));
    request.on('data', onData); request.once('end', onEnd); request.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export function canvasApiProxy(): Plugin {
  return { name: 'class-skip-canvas-api-proxy', configureServer(server) {
    for (const operation of ['request', 'download'] as const) {
      server.middlewares.use(`/api/canvas/${operation}`, async (request: IncomingMessage, response: ServerResponse) => {
        response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
        const sendError = (error: CanvasProxyError) => {
          if (response.destroyed) return;
          response.statusCode = error.status; response.setHeader('Connection', 'close'); response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: error.message, code: error.code, incomplete: error.code === 'incomplete' }));
        };
        if (!isLocalExamRequest(request)) return sendError(new CanvasProxyError('unauthorized', 403, '仅支持本机页面发起 Canvas 读取。'));
        if (!['', '/'].includes(request.url?.split('?')[0] ?? '/')) return sendError(new CanvasProxyError('not_found', 404, '未知的 Canvas 读取地址。'));
        if (request.method !== 'POST') return sendError(new CanvasProxyError('invalid_request', 405, '请使用 POST 发起读取。'));
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return sendError(invalid());
        const controller = new AbortController(); const abort = () => controller.abort();
        request.once('aborted', abort); response.once('close', abort);
        const bodyTimer = setTimeout(abort, 15000);
        try {
          const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization ?? '';
          if (!/^Bearer\s+/i.test(authorization)) throw new CanvasProxyError('unauthorized', 401, '缺少 Canvas 访问令牌。');
          const token = validToken(authorization.replace(/^Bearer\s+/i, ''));
          const body = await readBody(request, controller.signal); clearTimeout(bodyTimer);
          if (controller.signal.aborted) throw new CanvasProxyError('cancelled', 499, 'Canvas 读取已取消。');
          if (operation === 'request') {
            const result = await requestCanvasApi(body.canvasUrl, body.path, token, { signal: controller.signal });
            if (!response.destroyed) { response.statusCode = 200; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(result)); }
          } else {
            const result = await requestCanvasDownload(body.canvasUrl, body.fileId, token, { signal: controller.signal });
            if (!response.destroyed) {
              response.statusCode = 200; response.setHeader('Content-Type', result.contentType); response.setHeader('X-Canvas-File-Name', encodeURIComponent(result.name));
              response.setHeader('Content-Disposition', 'attachment'); response.end(Buffer.from(result.body));
            }
          }
        } catch (error) { sendError(error instanceof CanvasProxyError ? error : unavailable()); }
        finally { clearTimeout(bodyTimer); request.off('aborted', abort); response.off('close', abort); }
      });
    }
  } };
}
