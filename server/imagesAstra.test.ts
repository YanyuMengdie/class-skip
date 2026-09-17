import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASTRA_IMAGE_MODEL, IMAGES_ASTRA_TIMEOUT_MS, imagesAstraProxy, requestImagesAstra } from './imagesAstra';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const request = () => ({ kind: 'avatar', prompt: 'A friendly study companion.' });
const response = (output: unknown = [{ type: 'image_generation_call', status: 'completed', result: png }]) => new Response(JSON.stringify({ status: 'completed', output }));
afterEach(() => vi.useRealTimers());

describe('Astra image generation', () => {
  it.each([['avatar', '1024x1024'], ['background', '1536x864']])('keeps the %s image contract using a bounded GPT Image tool call', async (kind, size) => {
    const fetcher = vi.fn().mockResolvedValue(response());
    const result = await requestImagesAstra('server-secret', { ...request(), kind }, { fetch: fetcher });
    expect(result).toEqual({ data: png, mimeType: 'image/png' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer server-secret');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'gpt-6-astra', store: false, reasoning: { effort: 'medium' }, input: request().prompt,
      max_output_tokens: 8192, tool_choice: 'required', max_tool_calls: 1, parallel_tool_calls: false,
      tools: [{ type: 'image_generation', model: ASTRA_IMAGE_MODEL, action: 'generate', size, quality: 'high', background: 'opaque', output_format: 'png' }],
    });
    expect(body.tools).toHaveLength(1);
    expect(body.instructions).toContain(kind === 'avatar' ? 'pure white (#FFFFFF)' : '16:9 landscape');
    expect(body).not.toHaveProperty('temperature');
    expect(JSON.stringify(result)).not.toContain('server-secret');
  });
  it('rejects absent configuration without a provider call', async () => {
    const fetcher = vi.fn();
    await expect(requestImagesAstra('', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ kind: 'other' }, { prompt: ' ' }, { prompt: 'x'.repeat(12001) }, { model: 'other-model' }, { url: 'https://example.com' }, { apiKey: 'client-key' }, { size: '4096x4096' }])
    ('rejects malformed requests and untrusted provider controls', async extra => {
      const fetcher = vi.fn();
      await expect(requestImagesAstra('secret', { ...request(), ...extra }, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_request' });
      expect(fetcher).not.toHaveBeenCalled();
    });
  it.each([
    [], [{ type: 'message', content: [{ type: 'output_text', text: 'Here is a description instead of an image.' }] }],
    [{ type: 'image_generation_call', status: 'in_progress', result: png }],
    [{ type: 'image_generation_call', status: 'completed', result: 'https://example.com/image.png' }],
    [{ type: 'image_generation_call', status: 'completed', result: btoa('<html>not a PNG</html>') }],
  ].map(output => ({ output })))('rejects text-only, unfinished, remote URL or non-PNG results', async ({ output }) => {
    const fetcher = vi.fn().mockResolvedValue(response(output));
    await expect(requestImagesAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'incomplete' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not accept an incomplete response even if it contains a partial image', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'incomplete', output: [{ type: 'image_generation_call', status: 'completed', result: png }] })));
    await expect(requestImagesAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'incomplete' });
  });
  it('reports refusal without exposing the provider explanation', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ type: 'message', content: [{ type: 'refusal', refusal: 'private prompt content' }] }]));
    const error = await requestImagesAstra('secret', request(), { fetch: fetcher }).catch(error => error);
    expect(error.code).toBe('refused'); expect(error.message).not.toContain('private');
  });
  it('handles a blocked image request without retrying or leaking moderation details', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'moderation_blocked', message: 'private description', moderation_details: { categories: ['private'] } } }), { status: 400 }));
    const error = await requestImagesAstra('secret', request(), { fetch: fetcher }).catch(error => error);
    expect(error.code).toBe('refused'); expect(error.message).not.toContain('private');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [429, 'rate_limit'], [400, 'invalid_request'], [504, 'timeout'], [500, 'unavailable']])
    ('sanitizes upstream status %i', async (status, code) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('secret credential and private description', { status: Number(status) }));
      const error = await requestImagesAstra('secret', request(), { fetch: fetcher }).catch(error => error);
      expect(error.code).toBe(code); expect(error.message).not.toMatch(/secret|private|credential/);
    });
  it('sanitizes transport failures', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('secret request headers'));
    const error = await requestImagesAstra('secret', request(), { fetch: fetcher }).catch(error => error);
    expect(error.code).toBe('unavailable'); expect(error.message).not.toContain('secret');
  });
  it('skips a cancelled request and cancels an in-flight call immediately', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const pending = requestImagesAstra('secret', request(), { signal: controller.signal, fetch: fetcher });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await expect(requestImagesAstra('secret', request(), { signal: controller.signal, fetch: fetcher })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds slow generation even when upstream ignores cancellation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const assertion = expect(requestImagesAstra('secret', request(), { fetch: fetcher })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(IMAGES_ASTRA_TIMEOUT_MS);
    await assertion;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('registers the image route through the shared local-only proxy', () => {
    const use = vi.fn();
    const plugin = imagesAstraProxy(() => '');
    (plugin.configureServer as (server: unknown) => void)({ middlewares: { use } });
    expect(use.mock.calls[0][0]).toBe('/api/images/astra');
  });
});
