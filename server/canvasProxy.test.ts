import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { CANVAS_MAX_PAGES, CANVAS_TIMEOUT_MS, CANVAS_DOWNLOAD_MAX_BYTES, canvasApiProxy, isPublicCanvasAddress, requestCanvasApi, requestCanvasDownload, type CanvasHttpReply } from './canvasProxy';

const school = 'https://canvas.university.edu';
const resolve = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
const reply = (body: unknown, headers: Record<string, string> = {}, status = 200): CanvasHttpReply => ({ status, headers, body: Buffer.from(JSON.stringify(body)) });
const connection = [school, '/api/v1/courses?per_page=100', 'secret'] as const;
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Canvas network boundary', () => {
  it.each(['127.0.0.1', '0.0.0.0', '10.4.5.6', '172.16.5.4', '192.168.1.4', '169.254.169.254', '100.64.0.1', '224.0.0.1', '198.18.0.1', '192.0.0.1', '::1', '::', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2002:a00:1::1', '2001:db8::1'])('rejects nonpublic address %s', address => {
    expect(isPublicCanvasAddress(address)).toBe(false);
  });
  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])('accepts globally routable address %s', address => expect(isPublicCanvasAddress(address)).toBe(true));
  it.each(['http://canvas.university.edu', 'https://canvas.university.edu:8443', 'https://user:password@canvas.university.edu', 'https://localhost', 'https://192.168.1.2', 'https://2130706433', 'https://[::1]', 'https://canvas.local'])('rejects unsafe base %s before sending credentials', async base => {
    const transport = vi.fn();
    await expect(requestCanvasApi(base, connection[1], 'secret', { resolve, transport })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('supports other schools and pins the validated DNS answer passed to the transport', async () => {
    const transport = vi.fn(async () => reply({ name: 'school' }));
    expect(await requestCanvasApi(...connection, { resolve, transport })).toEqual({ name: 'school' });
    expect(transport).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ address: { address: '93.184.216.34', family: 4 }, headers: { Authorization: 'Bearer secret', Accept: 'application/json' } }));
  });
  it('rejects a hostname resolving to any private address, even if another answer is public', async () => {
    const transport = vi.fn();
    await expect(requestCanvasApi(...connection, { transport, resolve: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] })).rejects.toMatchObject({ code: 'unsafe_address' });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['/api/v1/../admin', '/api/v1/%252e%252e/admin', '/api/v1/courses?_method=DELETE', '/api/v1/courses?access_token=x', '//other.school.edu/api/v1/courses', '/profile'])('rejects unsafe API path %s', async path => {
    const transport = vi.fn();
    await expect(requestCanvasApi(school, path, 'secret', { resolve, transport })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('refuses API redirects without forwarding the bearer to a different host', async () => {
    const transport = vi.fn(async () => reply({}, { location: 'https://other.school.edu/api/v1/courses' }, 302));
    await expect(requestCanvasApi(...connection, { resolve, transport })).rejects.toMatchObject({ code: 'unavailable' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('sanitizes errors rather than returning upstream HTML or tokens', async () => {
    const transport = vi.fn(async () => reply({ error: 'secret accessToken private data' }, {}, 401));
    const error = await requestCanvasApi(...connection, { resolve, transport }).catch(error => error) as Error & { code: string; status: number };
    expect(error).toMatchObject({ code: 'unauthorized', status: 401 }); expect(error.message).not.toMatch(/secret|private|accessToken/);
  });
});

describe('complete Canvas pagination', () => {
  it('collects all pages, preserving the opaque next link', async () => {
    const transport = vi.fn().mockResolvedValueOnce(reply([{ id: 1 }], { link: `<${school}/api/v1/courses?cursor=abc%2Bdef&per_page=100>; rel="next"` })).mockResolvedValueOnce(reply([{ id: 2 }]));
    expect(await requestCanvasApi(...connection, { resolve, transport })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(transport.mock.calls[1][0].href).toBe(`${school}/api/v1/courses?cursor=abc%2Bdef&per_page=100`);
  });
  it.each([reply({}, {}, 503), reply({ unexpected: true }), { ...reply({}), body: Buffer.from('truncated') }])('rejects a failed or malformed later page instead of returning the first page', async later => {
    const transport = vi.fn().mockResolvedValueOnce(reply([{ id: 1 }], { link: `<${school}/api/v1/courses?page=2>; rel="next"` })).mockResolvedValueOnce(later);
    await expect(requestCanvasApi(...connection, { resolve, transport })).rejects.toMatchObject({ code: 'incomplete' });
  });
  it('rejects cross-origin next links before forwarding credentials', async () => {
    const transport = vi.fn(async () => reply([{ id: 1 }], { link: '<https://other.school.edu/api/v1/courses?page=2>; rel="next"' }));
    await expect(requestCanvasApi(...connection, { resolve, transport })).rejects.toMatchObject({ code: 'incomplete' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects repeated pages rather than looping or claiming completion', async () => {
    const transport = vi.fn(async () => reply([], { link: `<${school}${connection[1]}>; rel="next"` }));
    await expect(requestCanvasApi(...connection, { resolve, transport })).rejects.toMatchObject({ code: 'incomplete' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects hitting the page limit while a next page still exists', async () => {
    let page = 0;
    const transport = vi.fn(async () => reply([{ id: ++page }], { link: `<${school}/api/v1/courses?page=${page + 1}>; rel=next` }));
    await expect(requestCanvasApi(...connection, { resolve, transport })).rejects.toMatchObject({ code: 'incomplete' });
    expect(transport).toHaveBeenCalledTimes(CANVAS_MAX_PAGES);
  });
  it('allows exactly the page limit if the last page has no next link', async () => {
    let page = 0;
    const transport = vi.fn(async () => reply([{ id: ++page }], page < CANVAS_MAX_PAGES ? { link: `<${school}/api/v1/courses?page=${page + 1}>; rel="next"` } : {}));
    const result = await requestCanvasApi(...connection, { resolve, transport });
    expect(result).toHaveLength(CANVAS_MAX_PAGES);
  });
  it('bounds transport and DNS time even if a dependency ignores cancellation', async () => {
    vi.useFakeTimers();
    const assertion = expect(requestCanvasApi(...connection, { resolve: () => new Promise(() => {}) })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(CANVAS_TIMEOUT_MS); await assertion;
  });
  it('cancels in-flight operations without waiting for the upstream', async () => {
    const controller = new AbortController();
    const pending = requestCanvasApi(...connection, { resolve, transport: () => new Promise(() => {}), signal: controller.signal });
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('Canvas file redirects', () => {
  it('follows a signed public download without exposing the bearer to the CDN', async () => {
    const transport = vi.fn().mockResolvedValueOnce(reply({ url: `${school}/files/5/download`, display_name: 'Syllabus.pdf' }))
      .mockResolvedValueOnce(reply({}, { location: 'https://cdn.university.edu/signed-file?signature=opaque' }, 302))
      .mockResolvedValueOnce({ body: Buffer.from('%PDF-1.7'), headers: { 'content-type': 'application/pdf' }, status: 200 });
    const result = await requestCanvasDownload(school, 5, 'secret', { resolve, transport });
    expect(result.name).toBe('Syllabus.pdf'); expect(Buffer.from(result.body).toString()).toBe('%PDF-1.7');
    expect(transport.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    expect(transport.mock.calls[1][1].headers.Authorization).toBe('Bearer secret');
    expect(transport.mock.calls[2][1].headers).not.toHaveProperty('Authorization');
  });
  it.each(['http://cdn.university.edu/file', 'https://127.0.0.1/file', 'https://user:pass@cdn.university.edu/file'])('rejects unsafe download destination %s', async destination => {
    const transport = vi.fn(async () => reply({ url: destination }));
    await expect(requestCanvasDownload(school, 5, 'secret', { resolve, transport })).rejects.toMatchObject({ code: 'invalid_request' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('revalidates DNS on the redirected host and rejects a private answer', async () => {
    const transport = vi.fn().mockResolvedValueOnce(reply({ url: 'https://cdn.university.edu/file' }));
    const resolver = vi.fn().mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(requestCanvasDownload(school, 5, 'secret', { resolve: resolver, transport })).rejects.toMatchObject({ code: 'unsafe_address' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('caps downloaded file size', async () => {
    const transport = vi.fn().mockResolvedValueOnce(reply({ url: `${school}/files/5/download` }))
      .mockResolvedValueOnce({ body: { byteLength: CANVAS_DOWNLOAD_MAX_BYTES + 1 }, headers: {}, status: 200 });
    await expect(requestCanvasDownload(school, 5, 'secret', { resolve, transport })).rejects.toMatchObject({ code: 'too_large' });
  });
  it('does not download a locked file', async () => {
    const transport = vi.fn(async () => reply({ url: `${school}/files/5/download`, locked_for_user: true }));
    await expect(requestCanvasDownload(school, 5, 'secret', { resolve, transport })).rejects.toMatchObject({ code: 'unauthorized' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('local-only Canvas routes', () => {
  it('registers the existing client endpoints', () => {
    const use = vi.fn(); (canvasApiProxy().configureServer as (server: unknown) => void)({ middlewares: { use } });
    expect(use.mock.calls.map(call => call[0])).toEqual(['/api/canvas/request', '/api/canvas/download']);
  });
  it('expires an unfinished request body rather than waiting indefinitely', async () => {
    vi.useFakeTimers();
    const use = vi.fn(); (canvasApiProxy().configureServer as (server: unknown) => void)({ middlewares: { use } });
    const request = Object.assign(new PassThrough(), { method: 'POST', url: '/', headers: { host: 'localhost:3008', origin: 'http://localhost:3008', authorization: 'Bearer secret', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } });
    const response = Object.assign(new EventEmitter(), { setHeader: vi.fn(), end: vi.fn(), destroyed: false, statusCode: 0 });
    const pending = use.mock.calls[0][1](request, response);
    request.write('{');
    await vi.advanceTimersByTimeAsync(15000); await pending;
    expect(response.statusCode).toBe(408);
    expect(response.end).toHaveBeenCalledTimes(1);
  });
  it.each([
    { remote: '192.168.1.2', origin: 'http://localhost:3008' },
    { remote: '127.0.0.1', origin: 'https://malicious.example' },
  ])('rejects requests outside the local origin', async ({ remote, origin }) => {
    const use = vi.fn(); (canvasApiProxy().configureServer as (server: unknown) => void)({ middlewares: { use } });
    const request = Object.assign(new PassThrough(), { method: 'POST', url: '/', headers: { host: 'localhost:3008', origin, 'content-type': 'application/json' }, socket: { remoteAddress: remote } });
    const response = Object.assign(new EventEmitter(), { setHeader: vi.fn(), end: vi.fn(), destroyed: false, statusCode: 0 });
    await use.mock.calls[0][1](request, response);
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.end.mock.calls[0][0]).code).toBe('unauthorized');
  });
});
