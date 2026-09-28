import { authenticatedApiFetch, ApiPayloadSizeError } from '@/services/authenticatedApi';
import type { GenerateContentParameters } from '@google/genai';
import type { AppLanguage } from '@/types';
import { getAIOutputLanguageInstruction, getCurrentAppLanguage } from '@/shared/i18n/appLanguage';

type ReadingPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type ReadingMessage = { role: 'user' | 'assistant'; parts: ReadingPart[] };
export const READING_ASTRA_TIMEOUT_MS = 180_000;
export class ReadingAstraClientError extends Error {
  diagnostics?: { stage: string; elapsedMs: number; upstreamStatus?: number; providerStatus?: string; networkCode?: string };
  constructor(message: string, readonly code: string = 'unavailable') { super(message); }
}
export const readingFailureMessage = (error: unknown, fallback: string): string => error instanceof ReadingAstraClientError ? error.message : fallback;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalidInput = () => new ReadingAstraClientError('材料格式无法识别，请重新打开资料后再试。', 'invalid_request');

function partsFrom(value: unknown): ReadingPart[] {
  if (Array.isArray(value)) return value.flatMap(partsFrom);
  if (typeof value === 'string') return value ? [{ text: value }] : [];
  if (!record(value)) throw invalidInput();
  const parts: ReadingPart[] = [];
  if (typeof value.text === 'string' && value.text) parts.push({ text: value.text });
  if (value.inlineData !== undefined) {
    if (!record(value.inlineData) || typeof value.inlineData.mimeType !== 'string' || typeof value.inlineData.data !== 'string'
      || !value.inlineData.data) throw invalidInput();
    parts.push({ inlineData: { mimeType: value.inlineData.mimeType, data: value.inlineData.data } });
  }
  if (!parts.length && value.text !== '') throw invalidInput();
  return parts;
}

function messagesFrom(value: unknown): ReadingMessage[] {
  const messages: ReadingMessage[] = [];
  let pending: ReadingPart[] = [];
  const flush = () => { if (pending.length) { messages.push({ role: 'user', parts: pending }); pending = []; } };
  for (const item of Array.isArray(value) ? value : [value]) {
    if (record(item) && Array.isArray(item.parts)) {
      flush();
      if (item.role !== undefined && item.role !== 'user' && item.role !== 'model' && item.role !== 'assistant') throw invalidInput();
      const parts = partsFrom(item.parts);
      if (parts.length) messages.push({ role: item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user', parts });
    } else pending.push(...partsFrom(item));
  }
  flush();
  if (!messages.length) throw invalidInput();
  return messages;
}

function instructionText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(instructionText).filter(Boolean).join('\n\n');
  if (record(value) && Array.isArray(value.parts)) return instructionText(value.parts);
  if (record(value) && typeof value.text === 'string') return value.text;
  throw invalidInput();
}

/** Keep the existing teaching requests intact; credentials never enter this adapter. */
export function buildReadingAstraRequest(params: GenerateContentParameters) {
  return {
    instructions: instructionText(params.config?.systemInstruction),
    messages: messagesFrom(params.contents),
    ...(params.config?.responseSchema ? { schema: params.config.responseSchema } : {}),
    maxOutputTokens: params.config?.maxOutputTokens ?? 8192,
  };
}

const abortError = () => Object.assign(new Error('Reading request cancelled.'), { name: 'AbortError' });
function safeError(code: string, english: boolean): Error {
  const messages: Record<string, [string, string]> = {
    not_configured: ['尚未读取到 Gemini API 密钥，请检查副本配置。', 'The Gemini API key is not configured.'],
    unauthorized: ['Gemini 未接受当前密钥或模型权限，请检查 Gemini 账户配置。', 'Gemini did not accept the API key or model access.'],
    rate_limit: ['Gemini 的额度或请求频率受限，请检查 API 额度，或稍后重试。', 'Gemini quota or rate limit reached. Check API credits or try again later.'],
    billing_required: ['Google 报告 Gemini API 预付余额已耗尽，请检查当前密钥所属项目的账单。', 'Google reports depleted Gemini API prepaid credits. Check billing for the project that owns this key.'],
    provider_internal: ['Google 的 Gemini 接口返回内部错误（500）。本次未自动重试。', 'Google’s Gemini API returned an internal error (500). No automatic retry was made.'],
    provider_overloaded: ['Google 的 Gemini 服务过载或暂时不可用（503）。本次未自动重试。', 'Google’s Gemini service is overloaded or temporarily unavailable (503). No automatic retry was made.'],
    provider_connection: ['应用服务器连接 Google Gemini 失败，请检查服务器网络连接。', 'The app server could not connect to Google Gemini. Check the server’s network connection.'],
    provider_response: ['已连接 Google Gemini，但读取或解析响应失败。', 'Connected to Google Gemini, but could not read or parse its response.'],
    timeout: ['这次生成超时了，请重试。', 'Generation timed out. Please retry.'],
    invalid_request: ['请求未被接受，请确认资料大小和格式后重试。', 'The request was not accepted. Check the document size and format and retry.'],
    incomplete: ['这次内容没有完整生成，请重试。', 'Gemini did not finish the response. Please retry.'],
    refused: ['Gemini 未能生成这次内容，请调整问题后重试。', 'Gemini could not produce this response. Rephrase the request and retry.'],
    network_error: ['未能连接到逃课神器的 AI 接口，请检查网络后重试。', 'Could not reach the Class Skip AI endpoint. Check your connection and retry.'],
    server_error: ['逃课神器的 AI 接口返回了服务器错误，请稍后重试；若持续出现，需要检查线上部署日志。', 'The Class Skip AI endpoint returned a server error. Try again later; persistent failures require checking deployment logs.'],
    unavailable: ['AI 服务暂时不可用，请稍后重试。', 'The AI service is temporarily unavailable. Please try again later.'],
  };
  const knownCode = Object.hasOwn(messages, code) ? code : 'unavailable';
  return new ReadingAstraClientError(messages[knownCode][english ? 1 : 0], knownCode);
}

/** The local server handles PDFs, images, schemas and model access. No provider fallback. */
export async function generateReadingContent(params: GenerateContentParameters, options: { profile?: 'course-brief'; outputLanguage?: AppLanguage } = {}): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  const english = getCurrentAppLanguage() === 'en';
  const request = buildReadingAstraRequest(params);
  const body = { ...request, instructions: `${request.instructions}\n\n${getAIOutputLanguageInstruction(options.outputLanguage ?? getCurrentAppLanguage())}`, ...(options.profile ? { profile: options.profile } : {}) };
  const externalSignal = params.config?.abortSignal;
  if (externalSignal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.profile ? 65_000 : READING_ASTRA_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await authenticatedApiFetch('/api/reading/gemini', {
        method: 'POST', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof ApiPayloadSizeError) throw new ReadingAstraClientError(error.message, 'payload_too_large');
      if (externalSignal?.aborted) throw abortError();
      throw safeError(timedOut ? 'timeout' : 'network_error', english);
    }
    if (externalSignal?.aborted) throw abortError();
    let result: unknown;
    try { result = await response.json(); }
    catch {
      if (externalSignal?.aborted) throw abortError();
      // Platform failures may return HTML or plain text before our handler starts.
      throw safeError(timedOut ? 'timeout' : response.status >= 500 ? 'server_error' : response.ok ? 'incomplete' : 'unavailable', english);
    }
    if (externalSignal?.aborted) throw abortError();
    if (!response.ok) {
      const code = record(result) && record(result.error) && typeof result.error.code === 'string'
        ? result.error.code : response.status >= 500 ? 'server_error' : 'unavailable';
      if (code === 'cancelled') throw abortError();
      const failure = safeError(code, english);
      const diagnostics = record(result) && record(result.error) && record(result.error.diagnostics) ? result.error.diagnostics : undefined;
      if (failure instanceof ReadingAstraClientError && diagnostics
        && ['waiting_for_response', 'reading_response', 'parsing_response'].includes(String(diagnostics.stage))
        && typeof diagnostics.elapsedMs === 'number' && Number.isFinite(diagnostics.elapsedMs)) {
        failure.diagnostics = { stage: String(diagnostics.stage), elapsedMs: diagnostics.elapsedMs };
        const details: string[] = [];
        if (typeof diagnostics.upstreamStatus === 'number' && Number.isInteger(diagnostics.upstreamStatus)
          && diagnostics.upstreamStatus >= 100 && diagnostics.upstreamStatus <= 599) {
          failure.diagnostics.upstreamStatus = diagnostics.upstreamStatus;
          details.push(`Google HTTP ${diagnostics.upstreamStatus}`);
        }
        for (const field of ['providerStatus', 'networkCode'] as const) {
          const value = diagnostics[field];
          if (typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)) {
            failure.diagnostics[field] = value;
            details.push(value);
          }
        }
        if (details.length) failure.message += ` (${details.join(' · ')})`;
      }
      throw failure;
    }
    if (!record(result) || typeof result.text !== 'string' || !result.text.trim()) throw safeError('incomplete', english);
    const usage = record(result.usage) && typeof result.usage.inputTokens === 'number' && typeof result.usage.outputTokens === 'number'
      ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } : undefined;
    return { text: result.text, ...(usage ? { usage } : {}) };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
  }
}
