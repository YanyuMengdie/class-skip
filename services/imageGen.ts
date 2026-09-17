import { getCurrentAppLanguage } from '@/shared/i18n/appLanguage';

export const IMAGE_GENERATION_TIMEOUT_MS = 270_000;
export class ImageGenerationError extends Error {}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const failure = (code: string) => {
  const en = getCurrentAppLanguage() === 'en';
  const messages: Record<string, [string, string]> = {
    not_configured: ['还没有配置 OpenAI API 密钥。', 'The OpenAI API key is not configured.'],
    unauthorized: ['OpenAI 密钥或图片模型权限不可用。', 'The OpenAI key or image model access is unavailable.'],
    rate_limit: ['OpenAI 额度不足或请求过于频繁，请检查账户后再试。', 'OpenAI quota or rate limits were reached. Check your account and try again.'],
    refused: ['这段描述暂时无法生成图片，换个描述再试。', 'This image could not be generated. Try a different description.'],
    invalid_request: ['图片描述或请求格式有误，请修改后再试。', 'The image description or request is invalid. Please revise it.'],
    timeout: ['图片生成耗时较长，这次已停止等待，请稍后再试。', 'Image generation timed out. Please try again later.'],
    cancelled: ['已取消图片生成。', 'Image generation was cancelled.'],
    incomplete: ['这次没有收到完整图片，请重试。', 'No complete image was returned. Please try again.'],
    unavailable: ['暂时无法连接图片生成服务，请稍后再试。', 'Image generation is unavailable. Please try again later.'],
  };
  const message = messages[code] ?? messages.unavailable;
  return new ImageGenerationError(message[en ? 1 : 0]);
};

async function generateImage(kind: 'avatar' | 'background', prompt: string, options: { signal?: AbortSignal } = {}): Promise<Blob> {
  if (!prompt.trim() || prompt.length > 12_000) throw failure('invalid_request');
  if (options.signal?.aborted) throw failure('cancelled');
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: ((error: Error) => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => { cancel = reject; });
  const abort = () => { controller.abort(); cancel?.(failure('cancelled')); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { timedOut = true; controller.abort(); reject(failure('timeout')); }, IMAGE_GENERATION_TIMEOUT_MS);
    });
    const work = async () => {
      const response = await fetch('/api/images/astra', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, prompt: prompt.trim() }), signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = record(body) && record(body.error) && typeof body.error.code === 'string' ? body.error.code : 'unavailable';
        throw failure(code);
      }
      if (!record(body) || body.mimeType !== 'image/png' || typeof body.data !== 'string' || !body.data
        || body.data.length > 32 * 1024 * 1024 || body.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw failure('incomplete');
      let decoded: string;
      try { decoded = atob(body.data); } catch { throw failure('incomplete'); }
      const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (signature.some((byte, index) => bytes[index] !== byte)) throw failure('incomplete');
      return new Blob([bytes], { type: 'image/png' });
    };
    return await Promise.race([work(), deadline, cancellation]);
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error;
    if (timedOut) throw failure('timeout');
    if (controller.signal.aborted) throw failure('cancelled');
    throw failure('unavailable');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Preserve the Blob contract used by avatar uploads; Astra delegates drawing to GPT Image. */
export const generateCharacterAvatar = (prompt: string, options?: { signal?: AbortSignal }): Promise<Blob> => generateImage('avatar', prompt, options);
/** The generated background stays a 16:9 image and uses the existing Firebase upload flow. */
export const generateGalgameBackground = (prompt: string, options?: { signal?: AbortSignal }): Promise<Blob> => generateImage('background', prompt, options);
