import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { ASTRA_MODEL, ExamAstraError, requestExamAstra } from './examAstra';

const loopback = (value: string) => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(value.toLowerCase());
export function isLocalExamRequest(request: Pick<IncomingMessage, 'headers' | 'socket'>): boolean {
  try {
    if (!loopback(request.socket.remoteAddress ?? '')) return false;
    const host = new URL(`http://${request.headers.host ?? ''}`);
    if (!loopback(host.hostname) || request.headers['sec-fetch-site'] === 'cross-site') return false;
    if (request.headers.origin) {
      const origin = new URL(request.headers.origin);
      if (origin.host !== host.host || origin.protocol !== 'http:') return false;
    }
    return true;
  } catch { return false; }
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  if (Number(request.headers['content-length']) > maxBytes) throw new ExamAstraError('invalid_request', 413, 'Model request is too large.');
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new ExamAstraError('invalid_request', 413, 'Model request is too large.');
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ExamAstraError('invalid_request', 400, 'Invalid request JSON.'); }
}

/** Deliberately installed only in Vite's local development server, never a public billable endpoint. */
export function examAstraProxy(readKey: () => string): Plugin {
  return localAstraProxy({ name: 'class-skip-exam-gemini', path: '/api/exam/gemini',
    maxBodyBytes: 2_000_000, readKey, request: requestExamAstra });
}

/** Reuse the same loopback/origin and credential boundary for each local model feature. */
export function localAstraProxy(config: {
  name: string; path: string; model?: string; maxBodyBytes: number; readKey: () => string;
  request: (key: string, body: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
}): Plugin {
  return { name: config.name, configureServer(server) {
    server.middlewares.use(config.path, async (request: IncomingMessage, response: ServerResponse) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      const send = (status: number, body: unknown) => { if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(body)); } };
      if (!isLocalExamRequest(request)) return send(403, { error: { code: 'unauthorized', message: 'Local requests only.' } });
      const pathname = request.url?.split('?')[0] ?? '/';
      if (pathname === '/status' && request.method === 'GET') {
        return send(200, { configured: !!config.readKey().trim(), model: config.model ?? ASTRA_MODEL });
      }
      if (pathname !== '/' && pathname !== '') return send(404, { error: { code: 'invalid_request', message: 'Unknown endpoint.' } });
      if (request.method !== 'POST') return send(405, { error: { code: 'invalid_request', message: 'Use POST.' } });
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        return send(415, { error: { code: 'invalid_request', message: 'JSON requests only.' } });
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      request.once('aborted', abort);
      response.once('close', abort);
      try {
        // Missing credentials never trigger a provider request. No key is returned to the browser.
        const apiKey = config.readKey();
        if (!apiKey.trim()) throw new ExamAstraError('not_configured', 503, 'Model API key is not configured.');
        const result = await config.request(apiKey, await readBody(request, config.maxBodyBytes), { signal: controller.signal });
        send(200, result);
      } catch (error) {
        const safe = error instanceof ExamAstraError ? error : new ExamAstraError('unavailable', 500, 'Model service unavailable.');
        send(safe.status, { error: { code: safe.code, message: safe.message, ...(safe.diagnostics ? { diagnostics: safe.diagnostics } : {}) } });
      } finally {
        request.off('aborted', abort);
        response.off('close', abort);
      }
    });
  } };
}
