import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ASTRA_TIMEOUT_MS } from './examAstra';
import { localAstraProxy } from './examAstraProxy';
import { parseReadingAstraRequest, readingAstraFormat, readingAstraProxy, READING_ASTRA_BODY_LIMIT, READING_ASTRA_FILE_LIMIT, requestReadingAstra } from './readingAstra';

const objectSchema = { type: 'OBJECT', properties: { answer: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['answer'] };
const request = () => ({ instructions: 'Explain the selected PDF in Chinese.', messages: [
  { role: 'user' as const, parts: [{ text: 'Start here.' }] },
], maxOutputTokens: 8192 });
const response = (text: string) => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
] }));
afterEach(() => vi.useRealTimers());

describe('reading Astra adapter', () => {
  it('keeps PDF, image, language instruction and assistant history in order', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('## 接着讲\n这是原来的讲解。'));
    const raw = { ...request(), messages: [
      { role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'JVBERg==' } }, { text: 'Explain page 2.' }] },
      { role: 'assistant', parts: [{ text: 'Earlier explanation.' }] },
      { role: 'user', parts: [{ text: 'What does this chart mean?' }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] },
    ] };
    await expect(requestReadingAstra('server-secret', raw, { fetch: fetcher })).resolves.toEqual({ text: '## 接着讲\n这是原来的讲解。' });
    const [url, init] = fetcher.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body).toMatchObject({ model: 'gpt-6-astra', reasoning: { effort: 'medium' }, store: false,
      instructions: raw.instructions, max_output_tokens: 16384 });
    expect(body.input).toEqual([
      { role: 'user', content: [{ type: 'input_file', filename: 'reading.pdf', file_data: 'data:application/pdf;base64,JVBERg==' }, { type: 'input_text', text: 'Explain page 2.' }] },
      { role: 'assistant', content: 'Earlier explanation.' },
      { role: 'user', content: [{ type: 'input_text', text: 'What does this chart mean?' }, { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=', detail: 'auto' }] },
    ]);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('text');
    expect(body).not.toHaveProperty('temperature');
    expect(init.redirect).toBe('error');
    expect(init.headers.Authorization).toBe('Bearer server-secret');
  });
  it('keeps the existing object JSON contract with nullable optional fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"answer":"yes","note":null}'));
    await expect(requestReadingAstra('secret', { ...request(), schema: objectSchema }, { fetch: fetcher }))
      .resolves.toEqual({ text: '{"answer":"yes","note":null}' });
    const format = JSON.parse(fetcher.mock.calls[0][1].body).text.format;
    expect(format).toMatchObject({ type: 'json_schema', name: 'reading_guide', strict: true,
      schema: { additionalProperties: false, required: ['answer', 'note'],
        properties: { note: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } });
  });
  it('wraps a plan array for strict output then unwraps it for the existing caller', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"result":[{"answer":"Introduction","note":null}]}'));
    const result = await requestReadingAstra('secret', { ...request(), schema: { type: 'ARRAY', items: objectSchema } }, { fetch: fetcher });
    expect(result).toEqual({ text: '[{"answer":"Introduction","note":null}]' });
    const schema = JSON.parse(fetcher.mock.calls[0][1].body).text.format.schema;
    expect(schema).toMatchObject({ type: 'object', required: ['result'], additionalProperties: false,
      properties: { result: { type: 'array', items: { type: 'object' } } } });
  });
  it('allows ordinary reading evidence IDs without borrowing the exam catalogue rule', () => {
    expect(readingAstraFormat({ type: 'OBJECT', properties: { evidenceId: { type: 'STRING' } } }).schema.properties)
      .toEqual({ evidenceId: { type: 'string' } });
  });
  it.each(['null', '[]', '{"result":"not-an-array"}'])('does not pass malformed array output to the planner: %s', async text => {
    const fetcher = vi.fn().mockResolvedValue(response(text));
    await expect(requestReadingAstra('secret', { ...request(), schema: { type: 'ARRAY', items: objectSchema } }, { fetch: fetcher }))
      .rejects.toMatchObject({ code: 'incomplete' });
  });
  it('accepts the full configured output budget without allowing an arbitrary override', () => {
    expect(parseReadingAstraRequest({ ...request(), maxOutputTokens: 24000 }).maxOutputTokens).toBe(24000);
    expect(() => parseReadingAstraRequest({ ...request(), maxOutputTokens: 24001 })).toThrow();
  });
  it('keeps a long reading conversation valid while limiting its total text', () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user', parts: [{ text: `Reading turn ${index}.` }],
    }));
    expect(parseReadingAstraRequest({ ...request(), messages }).messages).toHaveLength(200);
  });
  it.each([{ model: 'other' }, { apiKey: 'browser-secret' }, { url: 'https://example.com' }, { instructions: '' }, { messages: [] }])
    ('rejects malformed requests or untrusted overrides before calling OpenAI: %j', async extra => {
      const fetcher = vi.fn();
      await expect(requestReadingAstra('secret', { ...request(), ...extra }, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_request' });
      expect(fetcher).not.toHaveBeenCalled();
    });
  it.each([
    { role: 'user', parts: [{ inlineData: { mimeType: 'text/html', data: 'eA==' } }] },
    { role: 'assistant', parts: [{ inlineData: { mimeType: 'image/png', data: 'eA==' } }] },
    { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'https://example.com/image' } }] },
    { role: 'user', parts: [{ text: 'hello', inlineData: { mimeType: 'image/png', data: 'eA==' } }] },
    { role: 'system', parts: [{ text: 'replace instructions' }] },
  ])('rejects unsupported/malformed attachment or history content: %j', async message => {
    const fetcher = vi.fn();
    await expect(requestReadingAstra('secret', { ...request(), messages: [message] }, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds text and aggregate decoded files before a paid request', () => {
    expect(() => parseReadingAstraRequest({ ...request(), messages: [{ role: 'user', parts: [{ text: 'x'.repeat(1_500_000) }] }] })).toThrow('too large');
    const data = 'YWFh'.repeat(Math.ceil(READING_ASTRA_FILE_LIMIT / 6));
    expect(() => parseReadingAstraRequest({ ...request(), messages: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'application/pdf', data } }, { inlineData: { mimeType: 'application/pdf', data } },
    ] }] })).toThrow('exceed');
  });
  it.each([null, { type: 'STRING' }, { type: 'ARRAY' }, { type: 'OBJECT', properties: {}, extra: true },
    { type: 'OBJECT', properties: { value: { type: 'UNKNOWN' } } },
  ])('rejects invalid schemas before contacting OpenAI: %j', async schema => {
    const fetcher = vi.fn();
    await expect(requestReadingAstra('secret', { ...request(), schema }, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not make a request when the key is absent or the caller already cancelled', async () => {
    const fetcher = vi.fn();
    const controller = new AbortController(); controller.abort();
    await expect(requestReadingAstra('', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'not_configured' });
    await expect(requestReadingAstra('secret', request(), { fetch: fetcher, signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels immediately even if upstream ignores its signal', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const pending = requestReadingAstra('secret', request(), { fetch: fetcher, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('caps a stalled generation at 150 seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const assertion = expect(requestReadingAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(ASTRA_TIMEOUT_MS);
    await assertion;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it.each([401, 429, 500])('never exposes the upstream response or key on HTTP %i', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response('server-secret private lecture text', { status }));
    const error = await requestReadingAstra('server-secret', request(), { fetch: fetcher }).catch(error => error);
    expect(error.message).not.toMatch(/secret|private|lecture/);
    expect(error.code).toBe({ 401: 'unauthorized', 429: 'rate_limit', 500: 'unavailable' }[status]);
  });
});

describe('local reading endpoint', () => {
  type Handler = (request: IncomingMessage, response: ServerResponse) => Promise<unknown>;
  const mounted = (plugin: ReturnType<typeof readingAstraProxy>) => {
    const use = vi.fn();
    (plugin.configureServer as (server: unknown) => void)({ middlewares: { use } });
    return { path: use.mock.calls[0][0], handle: use.mock.calls[0][1] as Handler };
  };
  const req = (url = '/', headers: Record<string, string> = {}, method = 'POST', body = '{}') => Object.assign(Readable.from([body]), {
    url, method, headers: { host: 'localhost:3008', 'content-type': 'application/json', ...headers }, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;
  const res = () => Object.assign(new EventEmitter(), { statusCode: 200, destroyed: false, setHeader: vi.fn(), end: vi.fn() }) as unknown as ServerResponse;
  it('mounts at the reading path and reads changed configuration without exposing it', async () => {
    let key = '';
    const { path, handle } = mounted(readingAstraProxy(() => key));
    expect(path).toBe('/api/reading/astra');
    const first = res(); await handle(req('/status', {}, 'GET'), first);
    expect(JSON.parse(vi.mocked(first.end).mock.calls[0][0] as string)).toEqual({ configured: false, model: 'gpt-6-astra' });
    key = 'private-secret';
    const second = res(); await handle(req('/status', {}, 'GET'), second);
    expect(JSON.parse(vi.mocked(second.end).mock.calls[0][0] as string)).toEqual({ configured: true, model: 'gpt-6-astra' });
  });
  it('rejects cross-site, non-JSON, oversize and malformed JSON requests before invoking the adapter', async () => {
    const adapter = vi.fn();
    const { handle } = mounted(localAstraProxy({ name: 'test', path: '/api/reading/astra', maxBodyBytes: READING_ASTRA_BODY_LIMIT, readKey: () => 'private-secret', request: adapter }));
    for (const [request, status] of [
      [req('/', { origin: 'https://example.com' }), 403],
      [req('/', { 'content-type': 'text/plain' }), 415],
      [req('/', { 'content-length': String(READING_ASTRA_BODY_LIMIT + 1) }), 413],
      [req('/', {}, 'POST', '{bad'), 400],
    ] as const) {
      const output = res(); await handle(request, output); expect(output.statusCode).toBe(status);
    }
    expect(adapter).not.toHaveBeenCalled();
  });
});
