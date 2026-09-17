import { afterEach, describe, expect, it, vi } from 'vitest';
import { Type } from '@google/genai';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import { buildReadingAstraRequest, generateReadingContent, readingFailureMessage, READING_ASTRA_TIMEOUT_MS } from './readingAstraClient';

const request = () => ({ model: 'gpt-6-astra', contents: 'Explain this page.', config: { systemInstruction: 'Stay within the selected source.' } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); setCurrentAppLanguage('zh-CN'); });

describe('Astra reading client', () => {
  it('preserves document, auxiliary PDF, conversation images and role order without sending provider settings', () => {
    const pdf = { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } };
    const image = { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } };
    const body = buildReadingAstraRequest({
      model: 'old-provider-name',
      contents: [
        { role: 'user', parts: [{ text: 'Main PDF' }, pdf, { text: 'Auxiliary PDF' }, pdf] },
        { role: 'model', parts: [{ text: 'Previous explanation' }] },
        { role: 'user', parts: [{ text: 'A question about the diagram' }, image] },
      ],
      config: { systemInstruction: { parts: [{ text: 'Original rules' }, { text: 'English output' }] },
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }, responseMimeType: 'application/json' },
    });
    expect(body.messages.map(item => item.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[0].parts).toEqual([{ text: 'Main PDF' }, pdf, { text: 'Auxiliary PDF' }, pdf]);
    expect(body.messages[2].parts[1]).toEqual(image);
    expect(body.instructions).toBe('Original rules\n\nEnglish output');
    expect(body.schema).toEqual({ type: Type.ARRAY, items: { type: Type.STRING } });
    expect(body).not.toHaveProperty('model');
    expect(body).not.toHaveProperty('config');
  });

  it('supports plain text and grouped parts without dropping the system instructions', () => {
    const input = request();
    expect(buildReadingAstraRequest(input)).toEqual({ instructions: input.config.systemInstruction,
      messages: [{ role: 'user', parts: [{ text: input.contents }] }], maxOutputTokens: 8192 });
    expect(buildReadingAstraRequest({ ...input, contents: ['A', { text: 'B' }] }).messages)
      .toEqual([{ role: 'user', parts: [{ text: 'A' }, { text: 'B' }] }]);
  });

  it('uses only the local reading endpoint and returns successful Markdown unchanged', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '**A source-bound explanation.**' })));
    vi.stubGlobal('fetch', fetcher);
    expect(await generateReadingContent(request())).toEqual({ text: '**A source-bound explanation.**' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/reading/astra', expect.objectContaining({ method: 'POST', credentials: 'same-origin', redirect: 'error' }));
    expect(fetcher.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('does not turn quota errors into assistant text or expose upstream details', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rate_limit', message: 'PRIVATE_UPSTREAM_SENTINEL' } }), { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    const error = await generateReadingContent(request()).catch(error => error);
    expect(readingFailureMessage(error, 'Unknown')).toContain('额度');
    expect(error.code).toBe('rate_limit');
    expect(String(error)).not.toContain('PRIVATE_UPSTREAM_SENTINEL');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(readingFailureMessage(new Error('PRIVATE_UPSTREAM_SENTINEL'), 'Safe fallback')).toBe('Safe fallback');
  });

  it.each([{}, { text: '' }, { text: '   ' }])('rejects empty successful results %j', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(generateReadingContent(request())).rejects.toThrow('没有完整生成');
  });

  it('keeps an explicit cancellation identifiable and does not send already-cancelled work', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(generateReadingContent({ ...request(), config: { abortSignal: controller.signal } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels the local request when the learner stops', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const result = generateReadingContent({ ...request(), config: { abortSignal: controller.signal } });
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
  });

  it('reports timeout distinctly from user cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const assertion = expect(generateReadingContent(request())).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(READING_ASTRA_TIMEOUT_MS);
    await assertion;
  });

  it('localizes errors and never forwards raw network errors', async () => {
    setCurrentAppLanguage('en');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('PRIVATE_CONNECTION_SENTINEL')));
    await expect(generateReadingContent(request())).rejects.toThrow('Unable to connect to Astra');
  });
});
