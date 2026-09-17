/** Cloud endpoints reuse Firebase login; local development keeps its loopback boundary. */
export async function authenticatedApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (import.meta.env.DEV) return fetch(path, init);
  const { auth } = await import('./firebase');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('请先登录逃课神器，再使用此功能。');
  if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('X-ClassSkip-Token', token);
  const blob = typeof init.body === 'string' ? new Blob([init.body], { type: 'application/json' }) : init.body instanceof Blob ? init.body : undefined;
  if (!blob || blob.size <= 4_000_000) return fetch(path, { ...init, headers, credentials: 'same-origin', redirect: 'error' });
  const allowed = path === '/api/reading/gemini' || path === '/api/elevenlabs/transcribe';
  if (!allowed || blob.size > (path === '/api/reading/gemini' ? 48 : 128) * 1024 * 1024) {
    throw new Error('这次资料超过单次处理大小，请减少所选页面或使用较小的文件。');
  }
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
