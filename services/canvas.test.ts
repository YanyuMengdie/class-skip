import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasRequestError, downloadCanvasFile, requestCanvas, type CanvasFile } from './canvas';
const connection = { canvasUrl: 'https://canvas.university.edu', accessToken: 'private-token' };
afterEach(() => vi.unstubAllGlobals());
describe('Canvas client completeness and cancellation', () => {
  it('sends requests only to the local proxy with cancellation and no redirects', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([{ id: 1 }]))); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await requestCanvas(connection, '/api/v1/courses', { signal: controller.signal })).toEqual([{ id: 1 }]);
    expect(fetcher).toHaveBeenCalledWith('/api/canvas/request', expect.objectContaining({ method: 'POST', signal: controller.signal, redirect: 'error', credentials: 'same-origin' }));
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({ canvasUrl: connection.canvasUrl, path: '/api/v1/courses' });
  });
  it('preserves incomplete errors so the sync retains the previous good brief', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '同步不完整', code: 'incomplete' }), { status: 502 })));
    await expect(requestCanvas(connection, '/api/v1/courses')).rejects.toMatchObject({ name: 'CanvasRequestError', code: 'incomplete', status: 502 });
  });
  it('does not treat malformed successful JSON as a complete result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('truncated')));
    await expect(requestCanvas(connection, '/api/v1/courses')).rejects.toBeInstanceOf(CanvasRequestError);
  });
  it('converts network failures to a safe actionable client error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private upstream diagnostics'); }));
    const error = await requestCanvas(connection, '/api/v1/courses').catch(error => error) as CanvasRequestError;
    expect(error.code).toBe('unavailable'); expect(error.message).not.toContain('private');
  });
  it('forwards the cancellation signal while downloading a file', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'cancelled', code: 'cancelled' }), { status: 499 })); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await expect(downloadCanvasFile(connection, { id: 4 } as CanvasFile, { signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).toHaveBeenCalledWith('/api/canvas/download', expect.objectContaining({ signal: controller.signal, redirect: 'error' }));
  });
});
