import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateCharacterAvatar, generateGalgameBackground, IMAGE_GENERATION_TIMEOUT_MS } from './imageGen';
vi.mock('@/shared/i18n/appLanguage', () => ({ getCurrentAppLanguage: () => 'zh' }));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('image generation browser client', () => {
  it.each([['avatar', generateCharacterAvatar], ['background', generateGalgameBackground]] as const)('preserves the %s Blob upload contract without browser credentials', async (kind, generate) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: png, mimeType: 'image/png' })));
    vi.stubGlobal('fetch', fetcher);
    const image = await generate('  A sunny library.  ');
    expect(image).toBeInstanceOf(Blob); expect(image.type).toBe('image/png');
    expect(new Uint8Array(await image.arrayBuffer()).slice(0, 8)).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/images/astra');
    expect(JSON.parse(init.body)).toEqual({ kind, prompt: 'A sunny library.' });
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
  it.each([{ data: 'https://example.com/image.png', mimeType: 'image/png' }, { data: png, mimeType: 'text/html' }, { data: btoa('not a PNG'), mimeType: 'image/png' }, { text: 'description only' }])
    ('rejects unusable image results', async body => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
      await expect(generateCharacterAvatar('a portrait')).rejects.toThrow('完整图片');
    });
  it('maps safe codes and never displays untrusted remote error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rate_limit', message: 'private server key' } }), { status: 429 })));
    const error = await generateCharacterAvatar('a portrait').catch(error => error);
    expect(error.message).toContain('额度'); expect(error.message).not.toContain('private');
  });
  it('avoids requests for empty input or a cancelled action', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(generateCharacterAvatar(' ')).rejects.toThrow();
    await expect(generateCharacterAvatar('a portrait', { signal: controller.signal })).rejects.toThrow('取消');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('propagates cancellation even if the fetch implementation stalls', async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = generateGalgameBackground('a landscape', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('取消');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('stops waiting for a stalled image request without automatic retries', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher);
    const assertion = expect(generateGalgameBackground('a landscape')).rejects.toThrow('停止等待');
    await vi.advanceTimersByTimeAsync(IMAGE_GENERATION_TIMEOUT_MS); await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
