import { ExamAstraError } from './examAstra';
import { localAstraProxy } from './examAstraProxy';

// Image generation is separate: Gemini 3.8 Flash only outputs text.
const IMAGE_ORCHESTRATOR_MODEL = 'gpt-6-astra';
export const ASTRA_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const IMAGES_ASTRA_TIMEOUT_MS = 240_000;
const MAX_IMAGE_BASE64 = 32 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export interface ImagesAstraRequest { kind: 'avatar' | 'background'; prompt: string }
export interface ImagesAstraResult { data: string; mimeType: 'image/png' }

export function parseImagesAstraRequest(value: unknown): ImagesAstraRequest {
  if (!record(value) || Object.keys(value).some(key => key !== 'kind' && key !== 'prompt')
    || !['avatar', 'background'].includes(value.kind as string) || typeof value.prompt !== 'string'
    || !value.prompt.trim() || value.prompt.length > 12_000) {
    throw new ExamAstraError('invalid_request', 400, 'Provide an image description of at most 12000 characters.');
  }
  return { kind: value.kind as ImagesAstraRequest['kind'], prompt: value.prompt.trim() };
}

function imageInstructions(kind: ImagesAstraRequest['kind']): string {
  const style = kind === 'avatar'
    ? 'Create a high-quality Japanese anime character portrait for a visual novel. Upper body or bust shot, facing forward or slightly to the side and looking at the viewer. Vibrant colors. Use a solid pure white (#FFFFFF) background, with no transparency or checkerboard. No text or speech bubbles.'
    : 'Create high-quality anime background art for a visual novel. Makoto Shinkai style: vibrant lighting, detailed clouds, nature or interiors, atmospheric scenery. Use a 16:9 landscape composition. No characters, just scenery. No text or speech bubbles.';
  return `Generate exactly one image using the image generation tool. ${style}`;
}

async function upstreamError(response: Response): Promise<never> {
  // Only inspect a known stable error code; provider messages can contain private request content.
  let blocked = false;
  try {
    const body: unknown = await response.json();
    blocked = record(body) && record(body.error) && body.error.code === 'moderation_blocked';
  } catch { /* Never expose a provider's body. */ }
  if (blocked) throw new ExamAstraError('refused', 422, 'This image description could not be generated.');
  if ([401, 403].includes(response.status)) throw new ExamAstraError('unauthorized', response.status, 'OpenAI rejected the key or image model access.');
  if (response.status === 429) throw new ExamAstraError('rate_limit', 429, 'OpenAI quota or rate limit reached.');
  if ([408, 504].includes(response.status)) throw new ExamAstraError('timeout', 504, 'Image generation timed out.');
  if ([400, 404, 422].includes(response.status)) throw new ExamAstraError('invalid_request', 400, 'OpenAI did not accept the image request.');
  throw new ExamAstraError('unavailable', 502, 'Image generation is temporarily unavailable.');
}

export async function requestImagesAstra(apiKey: string, raw: unknown, options: { signal?: AbortSignal; fetch?: typeof fetch } = {}): Promise<ImagesAstraResult> {
  if (!apiKey.trim()) throw new ExamAstraError('not_configured', 503, 'OpenAI API key is not configured.');
  const data = parseImagesAstraRequest(raw);
  if (options.signal?.aborted) throw new ExamAstraError('cancelled', 499, 'Request cancelled.');
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let cancel: ((error: ExamAstraError) => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => { cancel = reject; });
  const abort = () => { controller.abort(); cancel?.(new ExamAstraError('cancelled', 499, 'Request cancelled.')); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true; controller.abort();
        reject(new ExamAstraError('timeout', 504, 'Image generation timed out.'));
      }, IMAGES_ASTRA_TIMEOUT_MS);
    });
    const work = async (): Promise<ImagesAstraResult> => {
      const response = await (options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: IMAGE_ORCHESTRATOR_MODEL, instructions: imageInstructions(data.kind), input: data.prompt,
          store: false, reasoning: { effort: 'medium' }, max_output_tokens: 8192,
          tools: [{ type: 'image_generation', model: ASTRA_IMAGE_MODEL, action: 'generate',
            size: data.kind === 'avatar' ? '1024x1024' : '1536x864', quality: 'high',
            background: 'opaque', output_format: 'png' }],
          tool_choice: 'required', max_tool_calls: 1, parallel_tool_calls: false,
        }),
      });
      if (!response.ok) return upstreamError(response);
      const body: unknown = await response.json();
      if (!record(body) || body.status !== 'completed' || !Array.isArray(body.output)) {
        throw new ExamAstraError('incomplete', 502, 'OpenAI did not complete the image.');
      }
      if (body.output.some(item => record(item) && item.type === 'message' && Array.isArray(item.content)
        && item.content.some(part => record(part) && part.type === 'refusal'))) {
        throw new ExamAstraError('refused', 422, 'This image description could not be generated.');
      }
      const image = body.output.find(item => record(item) && item.type === 'image_generation_call' && item.status === 'completed');
      const base64 = record(image) ? image.result : null;
      if (typeof base64 !== 'string' || !base64 || base64.length > MAX_IMAGE_BASE64
        || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
        || !Buffer.from(base64.slice(0, 12), 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new ExamAstraError('incomplete', 502, 'OpenAI did not return a usable PNG image.');
      }
      return { data: base64, mimeType: 'image/png' };
    };
    return await Promise.race([work(), deadline, cancellation]);
  } catch (error) {
    if (error instanceof ExamAstraError) throw error;
    if (timedOut) throw new ExamAstraError('timeout', 504, 'Image generation timed out.');
    if (controller.signal.aborted) throw new ExamAstraError('cancelled', 499, 'Request cancelled.');
    throw new ExamAstraError('unavailable', 502, 'Unable to connect to image generation.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function imagesAstraProxy(readKey: () => string) {
  return localAstraProxy({ name: 'class-skip-images-astra', path: '/api/images/astra',
    model: ASTRA_IMAGE_MODEL, maxBodyBytes: 100_000, readKey, request: requestImagesAstra });
}
