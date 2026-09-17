import { ExamAstraError, requestAstraResponse, toOpenAISchema } from './examAstra';
import { localAstraProxy } from './examAstraProxy';

export const READING_ASTRA_BODY_LIMIT = 48 * 1024 * 1024;
export const READING_ASTRA_FILE_LIMIT = 32 * 1024 * 1024;
const MAX_TEXT = 1_500_000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (message: string, status = 400): never => { throw new ExamAstraError('invalid_request', status, message); };
const knownKeys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export type ReadingAstraPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface ReadingAstraRequest {
  instructions: string;
  messages: Array<{ role: 'user' | 'assistant'; parts: ReadingAstraPart[] }>;
  schema?: unknown;
  maxOutputTokens: number;
  profile?: 'course-brief';
}

export function parseReadingAstraRequest(value: unknown): ReadingAstraRequest {
  if (!record(value) || !knownKeys(value, ['instructions', 'messages', 'schema', 'maxOutputTokens', 'profile'])
    || value.profile !== undefined && value.profile !== 'course-brief'
    || typeof value.instructions !== 'string' || !value.instructions.trim() || value.instructions.length > 60_000
    || !Number.isInteger(value.maxOutputTokens) || Number(value.maxOutputTokens) < 1 || Number(value.maxOutputTokens) > 24_000
    || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 1000) return invalid('Invalid reading model request.');
  let textSize = value.instructions.length;
  let fileSize = 0;
  let partCount = 0;
  for (const message of value.messages) {
    if (!record(message) || !knownKeys(message, ['role', 'parts']) || !['user', 'assistant'].includes(message.role as string)
      || !Array.isArray(message.parts) || !message.parts.length) return invalid('Invalid reading history.');
    for (const part of message.parts) {
      if (++partCount > 2048 || !record(part)) return invalid('Too many reading message parts.');
      if (knownKeys(part, ['text']) && typeof part.text === 'string' && part.text.trim()) {
        textSize += part.text.length;
        if (textSize > MAX_TEXT) return invalid('Reading text is too large.', 413);
        continue;
      }
      if (!knownKeys(part, ['inlineData']) || !record(part.inlineData)
        || !knownKeys(part.inlineData, ['mimeType', 'data'])) return invalid('Unsupported reading message part.');
      const { mimeType, data } = part.inlineData;
      if (message.role !== 'user') return invalid('Reading assistant history must contain text only.');
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType as string)) {
        return invalid('Reading supports PDF, PNG, JPEG, WebP and GIF attachments only.');
      }
      if (typeof data !== 'string' || !data.length || data.length > Math.ceil(READING_ASTRA_FILE_LIMIT / 3) * 4) {
        return invalid('Reading attachment is empty or too large.', 413);
      }
      if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return invalid('Invalid attachment base64.');
      fileSize += data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      if (fileSize > READING_ASTRA_FILE_LIMIT) return invalid('Reading attachments exceed 32 MB.', 413);
    }
  }
  if (!value.messages.some(message => message.role === 'user')) return invalid('Reading requires a user message.');
  if (value.profile === 'course-brief' && (textSize > 48_000 || fileSize > 0 || Number(value.maxOutputTokens) > 8000)) return invalid('Course brief request exceeds its size budget.', 413);
  return value as unknown as ReadingAstraRequest;
}

/** The existing planner returns an array; strict output wraps it without changing its caller. */
export function readingAstraFormat(schema: unknown): { name: string; schema: Record<string, unknown>; array: boolean } {
  let encoded: string;
  try { encoded = JSON.stringify(schema); } catch { return invalid('Invalid reading response schema.'); }
  if (!encoded || encoded.length > 250_000) return invalid('Reading response schema is missing or too large.');
  let nodes = 0;
  const validate = (node: unknown, depth = 0): void => {
    if (!record(node) || ++nodes > 1000 || depth > 20 || !knownKeys(node,
      ['type', 'properties', 'required', 'items', 'enum', 'description', 'nullable', 'minimum', 'maximum', 'minItems', 'maxItems'])) {
      return invalid('Unsupported reading response schema.');
    }
    if (node.description !== undefined && typeof node.description !== 'string') return invalid('Invalid schema description.');
    if (node.nullable !== undefined && typeof node.nullable !== 'boolean') return invalid('Invalid schema nullability.');
    if (node.properties !== undefined) {
      if (!record(node.properties)) return invalid('Invalid reading schema fields.');
      for (const child of Object.values(node.properties)) validate(child, depth + 1);
    }
    if (node.items !== undefined) validate(node.items, depth + 1);
  };
  validate(schema);
  if (!record(schema) || !['object', 'array'].includes(String(schema.type).toLowerCase()) || schema.nullable === true) {
    return invalid('Reading response schema must be an object or array.');
  }
  const array = String(schema.type).toLowerCase() === 'array';
  const wrapped = array ? { type: 'OBJECT', properties: { result: schema }, required: ['result'] } : schema;
  return { name: 'reading_guide', schema: toOpenAISchema(wrapped, { hoistEvidenceIds: false }), array };
}

export async function requestReadingAstra(apiKey: string, raw: unknown, options: { signal?: AbortSignal; fetch?: typeof fetch } = {}): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  if (!apiKey.trim()) throw new ExamAstraError('not_configured', 503, 'Gemini API key is not configured.');
  const data = parseReadingAstraRequest(raw);
  const format = data.schema === undefined ? undefined : readingAstraFormat(data.schema);
  const input = data.messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: message.parts,
  }));
  const result = await requestAstraResponse(apiKey, {
    instructions: data.instructions, input, maxOutputTokens: data.maxOutputTokens,
    briefProfile: data.profile === 'course-brief',
    ...(format ? { format: { name: format.name, schema: format.schema } } : {}),
  }, options);
  if (format) {
    const parsed: unknown = JSON.parse(result.text);
    if (!record(parsed) || (format.array && !Array.isArray(parsed.result))) {
      throw new ExamAstraError('incomplete', 502, 'Gemini returned an invalid reading response shape.');
    }
    if (format.array) return { ...result, text: JSON.stringify(parsed.result) };
  }
  return result;
}

export function readingAstraProxy(readKey: () => string) {
  return localAstraProxy({ name: 'class-skip-reading-gemini', path: '/api/reading/gemini',
    maxBodyBytes: READING_ASTRA_BODY_LIMIT, readKey, request: requestReadingAstra });
}
