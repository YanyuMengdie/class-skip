export class ApiPayloadSizeError extends Error {}

/** AI and Canvas work without an account; only Firebase temporary uploads use login. */
export async function authenticatedApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (import.meta.env.DEV) return fetch(path, init);
  if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const headers = new Headers(init.headers);
  const blob = typeof init.body === 'string' ? new Blob([init.body], { type: 'application/json' }) : init.body instanceof Blob ? init.body : undefined;
  if (!blob || blob.size <= 4_000_000) return fetch(path, { ...init, headers, credentials: 'same-origin', redirect: 'error' });
  const allowed = path === '/api/reading/gemini' || path === '/api/elevenlabs/transcribe';
  if (!allowed || blob.size > (path === '/api/reading/gemini' ? 48 : 128) * 1024 * 1024) {
    throw new ApiPayloadSizeError('这次资料超过单次处理大小，请减少所选页面或使用较小的文件。');
  }
  const { auth } = await import('./firebase');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    // Compress in transit without dropping PDF pages, images, or source text.
    const compressed = new Uint8Array(await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < compressed.length; offset += 32768) binary += String.fromCharCode(...compressed.subarray(offset, offset + 32768));
    const envelope = JSON.stringify({ __classSkipCompressed: btoa(binary) });
    if (new Blob([envelope]).size > 4_000_000) throw new ApiPayloadSizeError('这份资料超过线上单次传输大小，请减少所选页面；登录后可通过云端暂存传输较大资料。');
    headers.set('X-ClassSkip-Body-Type', headers.get('Content-Type') || blob.type || 'application/octet-stream');
    headers.set('Content-Type', 'application/json');
    return fetch(path, { ...init, headers, body: envelope, credentials: 'same-origin', redirect: 'error' });
  }
  const token = await user.getIdToken();
  headers.set('X-ClassSkip-Token', token);
  const objectPath = `users/${user.uid}/uploads/request-${crypto.randomUUID()}.bin`;
  const storageRoot = 'https://firebasestorage.googleapis.com/v0/b/ai-tutor-647fd.firebasestorage.app/o';
  const storageHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' };
  try {
    const upload = await fetch(`${storageRoot}?name=${encodeURIComponent(objectPath)}`, {
      method: 'POST', headers: storageHeaders, body: blob, signal: init.signal, redirect: 'error',
    });
    if (!upload.ok) throw new Error('较大资料暂存失败，请检查云端连接后再试。');
    headers.set('X-ClassSkip-Body-Type', headers.get('Content-Type') || blob.type || 'application/octet-stream');
    headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...init, headers, body: JSON.stringify({ __classSkipPayload: objectPath }), credentials: 'same-origin', redirect: 'error' });
    // Retain the temporary object until the function has consumed it, including streamed responses.
    const bytes = await response.arrayBuffer();
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    await fetch(`${storageRoot}/${encodeURIComponent(objectPath)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}
