import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { ASTRA_TIMEOUT_MS, parseExamAstraRequest, requestExamAstra, toOpenAISchema } from './examAstra';
import { isLocalExamRequest } from './examAstraProxy';

const citation = { type: 'OBJECT', properties: { evidenceId: { type: 'STRING', enum: ['evidence-1', 'evidence-2'] } }, required: ['evidenceId'] };
const schema = { type: 'OBJECT', properties: {
  answer: { type: 'STRING' }, sources: { type: 'ARRAY', items: citation, minItems: '1', maxItems: '4' },
  optionalNote: { type: 'STRING' },
}, required: ['answer', 'sources'] };
const request = () => ({ instructions: 'Use the selected material only.', input: '{"selectedContext":{}}', schema, maxOutputTokens: 4096, language: 'zh' as const });
const successfulResponse = () => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"answer":"Ready","sources":[{"evidenceId":"evidence-1"}],"optionalNote":null}' }] },
] }), { status: 200 });
afterEach(() => vi.useRealTimers());

describe('Astra strict output adaptation', () => {
  it('keeps source IDs exact, closes every object and makes optional fields nullable', () => {
    const original = structuredClone(schema);
    expect(toOpenAISchema(schema)).toEqual({ type: 'object', properties: {
      answer: { type: 'string' },
      sources: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object',
        properties: { evidenceId: { $ref: '#/$defs/evidence_id' } }, required: ['evidenceId'], additionalProperties: false } },
      optionalNote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    }, required: ['answer', 'sources', 'optionalNote'], additionalProperties: false,
    $defs: { evidence_id: { type: 'string', enum: ['evidence-1', 'evidence-2'] } } });
    expect(schema).toEqual(original);
  });
  it('does not multiply evidence enums when several rubrics share the same catalogue', () => {
    const output = JSON.stringify(toOpenAISchema({ type: 'OBJECT', properties: { first: citation, second: citation } }));
    expect(output.match(/evidence-1/g)).toHaveLength(1);
    expect(output.match(/#\/\$defs\/evidence_id/g)).toHaveLength(2);
  });
  it('preserves numeric and choice constraints', () => {
    expect(toOpenAISchema({ type: 'OBJECT', properties: { cue: { type: 'INTEGER', minimum: 1, maximum: 4 },
      action: { type: 'STRING', enum: ['continue', 'clarify'] } } }).properties).toEqual({
      cue: { type: 'integer', minimum: 1, maximum: 4 }, action: { type: 'string', enum: ['continue', 'clarify'] },
    });
  });
  it.each([null, { type: 'UNKNOWN' }, { type: 'ARRAY', items: citation },
    { type: 'OBJECT', properties: { item: { type: 'ARRAY', items: citation, maxItems: 'bad' } } },
    { type: 'OBJECT', properties: {}, required: ['missing'] },
    { type: 'OBJECT', properties: { evidenceId: { type: 'STRING' } } },
  ])('rejects an invalid schema before a paid request: %j', value => expect(() => toOpenAISchema(value)).toThrow());
});

describe('Astra server transport', () => {
  it('uses the fixed Responses model and strict format, without exposing the key in the result', async () => {
    const fetcher = vi.fn().mockResolvedValue(successfulResponse());
    const result = await requestExamAstra('test-secret-server-only', request(), { fetch: fetcher });
    expect(result).toEqual({ text: '{"answer":"Ready","sources":[{"evidenceId":"evidence-1"}],"optionalNote":null}' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer test-secret-server-only');
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({ model: 'gpt-6-astra', reasoning: { effort: 'medium' }, store: false,
      max_output_tokens: 12288, text: { format: { type: 'json_schema', strict: true, name: 'exam_round' } } });
    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('tools');
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it('never contacts OpenAI when credentials are missing', async () => {
    const fetcher = vi.fn();
    await expect(requestExamAstra('', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ model: 'other-model' }, { url: 'https://example.com' }, { maxOutputTokens: 8193 }, { language: 'invalid' }])('rejects endpoint/model/budget overrides: %j', extra => {
    expect(() => parseExamAstraRequest({ ...request(), ...extra })).toThrow();
  });
  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [429, 'rate_limit'], [504, 'timeout'], [400, 'invalid_request'], [404, 'invalid_request'], [500, 'unavailable']])('sanitizes upstream %i', async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private key, prompts and private rubric must not escape', { status: Number(status) }));
    const error = await requestExamAstra('secret', request(), { fetch: fetcher }).catch(cause => cause);
    expect(error.code).toBe(code);
    expect(error.message).not.toMatch(/private|secret|rubric/);
  });
  it.each([
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{truncated' }] }] },
  ])('rejects incomplete output instead of passing it to grading', async body => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(requestExamAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'incomplete' });
  });
  it('does not treat refusal text as an exercise', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private reason' }] }] })));
    await expect(requestExamAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'refused' });
  });
  it('bounds a stalled upstream even if it ignores cancellation', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const fetcher = vi.fn().mockImplementation((_url, init) => { signal = init.signal; return new Promise(() => {}); });
    const pending = requestExamAstra('secret', request(), { fetch: fetcher });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(ASTRA_TIMEOUT_MS);
    await assertion;
    expect(signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('propagates the browser disconnect to the provider request', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = requestExamAstra('secret', request(), { fetch: fetcher, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('local-only trial endpoint', () => {
  const local = (headers: Record<string, string> = {}, address = '127.0.0.1') => ({
    headers: { host: 'localhost:3008', ...headers }, socket: { remoteAddress: address },
  } as IncomingMessage);
  it('accepts same-origin loopback requests', () => {
    expect(isLocalExamRequest(local({ origin: 'http://localhost:3008' }))).toBe(true);
    expect(isLocalExamRequest(local())).toBe(true);
  });
  it('rejects cross-site origins, rebinding hosts and non-loopback clients', () => {
    expect(isLocalExamRequest(local({ origin: 'https://example.com' }))).toBe(false);
    expect(isLocalExamRequest(local({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isLocalExamRequest(local({ host: 'example.com:3008' }))).toBe(false);
    expect(isLocalExamRequest(local({}, '192.168.1.2'))).toBe(false);
  });
});
