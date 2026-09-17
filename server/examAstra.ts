/** Gemini transport. Legacy export names are retained for existing callers. Credentials stay on the server. */
export const GEMINI_MODEL = 'gemini-3.8-flash';
export const ASTRA_MODEL = GEMINI_MODEL; // Legacy configuration export; not an Gemini route.
export const ASTRA_TIMEOUT_MS = 150_000;

export class ExamAstraError extends Error {
  diagnostics?: { stage: 'waiting_for_response' | 'reading_response' | 'parsing_response'; elapsedMs: number };
  constructor(public code: string, public status: number, message: string) { super(message); }
}
const invalid = (message = 'Invalid exam model request.'): never => { throw new ExamAstraError('invalid_request', 400, message); };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Convert the existing Google response contract, without changing the exam's knowledge contract. */
export function toOpenAISchema(input: unknown, options: { hoistEvidenceIds?: boolean } = {}): Record<string, unknown> {
  let evidence: Record<string, unknown> | undefined;
  const convert = (value: unknown, depth = 0): Record<string, unknown> => {
    if (!record(value) || depth > 30) return invalid('Invalid response schema.');
    const type = typeof value.type === 'string' ? value.type.toLowerCase() : '';
    if (!['object', 'array', 'string', 'integer', 'number', 'boolean'].includes(type)) return invalid('Unsupported response schema type.');
    const output: Record<string, unknown> = { type };
    if (typeof value.description === 'string') output.description = value.description;
    if (value.enum !== undefined) {
      if (!Array.isArray(value.enum) || !value.enum.length || value.enum.length > 1000
        || value.enum.some(item => !['string', 'number', 'boolean'].includes(typeof item))) return invalid('Invalid response schema choices.');
      output.enum = [...value.enum];
    }
    for (const name of ['minItems', 'maxItems', 'minimum', 'maximum'] as const) {
      if (value[name] === undefined) continue;
      const number = Number(value[name]);
      if (!Number.isFinite(number) || (name.endsWith('Items') && (!Number.isInteger(number) || number < 0))) return invalid('Invalid response schema bound.');
      output[name] = number;
    }
    if (type === 'object') {
      if (!record(value.properties)) return invalid('Missing response schema fields.');
      const fields = value.properties;
      const required = value.required === undefined ? Object.keys(fields) : value.required;
      if (!Array.isArray(required) || required.some(key => typeof key !== 'string' || !(key in fields))) return invalid('Invalid required fields.');
      const properties: Record<string, unknown> = Object.create(null);
      for (const [key, child] of Object.entries(value.properties)) {
        let converted = convert(child, depth + 1);
        // The same source catalogue appears in several nested rubrics. Refer to it once so
        // strict-output enum limits do not count every duplicate copy of the catalogue.
        if (key === 'evidenceId' && options.hoistEvidenceIds !== false) {
          if (!Array.isArray(converted.enum) || converted.type !== 'string') return invalid('Missing evidence catalogue.');
          if (evidence && JSON.stringify(evidence) !== JSON.stringify(converted)) return invalid('Conflicting evidence catalogues.');
          evidence = converted;
          converted = { $ref: '#/$defs/evidence_id' };
        }
        properties[key] = required.includes(key) ? converted : { anyOf: [converted, { type: 'null' }] };
      }
      output.properties = properties;
      output.required = Object.keys(properties);
      output.additionalProperties = false;
    }
    if (type === 'array') output.items = convert(value.items, depth + 1);
    return value.nullable === true ? { anyOf: [output, { type: 'null' }] } : output;
  };
  const result = convert(input);
  if (result.type !== 'object') return invalid('The response schema must be an object.');
  if (evidence) result.$defs = { evidence_id: evidence };
  return result;
}

export interface ExamAstraRequest { instructions: string; input: string; schema: unknown; maxOutputTokens: number; language: 'zh' | 'en' }
export function parseExamAstraRequest(value: unknown): ExamAstraRequest {
  if (!record(value) || Object.keys(value).some(key => !['instructions', 'input', 'schema', 'maxOutputTokens', 'language'].includes(key))
    || typeof value.instructions !== 'string' || !value.instructions.trim() || value.instructions.length > 60_000
    || typeof value.input !== 'string' || !value.input.trim() || value.input.length > 1_500_000
    || !Number.isInteger(value.maxOutputTokens) || Number(value.maxOutputTokens) < 1 || Number(value.maxOutputTokens) > 8192
    || !['zh', 'en'].includes(value.language as string)) return invalid();
  return value as unknown as ExamAstraRequest;
}

function upstreamFailure(status: number): never {
  if (status === 401 || status === 403) throw new ExamAstraError('unauthorized', status, 'Gemini rejected the key or model access.');
  if (status === 429) throw new ExamAstraError('rate_limit', 429, 'Gemini quota or rate limit reached.');
  if (status === 408 || status === 504) throw new ExamAstraError('timeout', 504, 'Gemini request timed out.');
  if (status === 400 || status === 404 || status === 422) throw new ExamAstraError('invalid_request', 400, 'Gemini did not accept the model request.');
  throw new ExamAstraError('unavailable', 502, 'Gemini is temporarily unavailable.');
}

export async function requestExamAstra(apiKey: string, raw: unknown, options: { signal?: AbortSignal; fetch?: typeof fetch } = {}): Promise<{ text: string }> {
  if (!apiKey.trim()) throw new ExamAstraError('not_configured', 503, 'Gemini API key is not configured.');
  const data = parseExamAstraRequest(raw);
  const schema = toOpenAISchema(data.schema, { hoistEvidenceIds: false });
  return requestAstraResponse(apiKey, {
    instructions: data.instructions, input: data.input, maxOutputTokens: data.maxOutputTokens,
    format: { name: 'exam_round', schema },
  }, options);
}

/** Shared server transport; route adapters validate input before reaching this fixed provider. */
export async function requestAstraResponse(apiKey: string, data: {
  instructions: string; input: unknown; maxOutputTokens: number;
  format?: { name: string; schema: Record<string, unknown> };
  briefProfile?: boolean;
}, options: { signal?: AbortSignal; fetch?: typeof fetch } = {}): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  if (!apiKey.trim()) throw new ExamAstraError('not_configured', 503, 'Gemini API key is not configured.');
  if (options.signal?.aborted) throw new ExamAstraError('cancelled', 499, 'Request cancelled.');
  const controller = new AbortController();
  let timedOut = false;
  const started = Date.now();
  let stage: 'waiting_for_response' | 'reading_response' | 'parsing_response' = 'waiting_for_response';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: ((error: ExamAstraError) => void) | undefined;
  const cancellation = new Promise<never>((_, reject) => { cancel = reject; });
  const abort = () => {
    controller.abort();
    cancel?.(new ExamAstraError('cancelled', 499, 'Request cancelled.'));
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ExamAstraError('timeout', 504, 'Gemini request timed out.'));
      }, data.briefProfile ? 60_000 : ASTRA_TIMEOUT_MS);
    });
    const work = async () => {
      const response = await (options.fetch ?? fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'x-goog-api-key': apiKey.trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: data.instructions }] },
          contents: typeof data.input === 'string'
            ? [{ role: 'user', parts: [{ text: data.input }] }] : data.input,
          generationConfig: {
            candidateCount: 1,
            thinkingConfig: { thinkingLevel: data.briefProfile ? 'LOW' : 'MEDIUM', includeThoughts: false },
            // Keep the existing total output ceiling, including thinking tokens.
            maxOutputTokens: data.briefProfile ? Math.min(data.maxOutputTokens, 8000) : data.maxOutputTokens + 8192,
            ...(data.format ? { responseMimeType: 'application/json', responseJsonSchema: data.format.schema } : {}),
          },
        }),
      });
      if (!response.ok) upstreamFailure(response.status);
      stage = 'reading_response';
      const result: unknown = await response.json();
      stage = 'parsing_response';
      if (!record(result)) throw new ExamAstraError('incomplete', 502, 'Gemini returned an invalid response.');
      if (record(result.promptFeedback) && result.promptFeedback.blockReason) {
        throw new ExamAstraError('refused', 422, 'Gemini could not produce this response.');
      }
      const candidate = Array.isArray(result.candidates) ? result.candidates[0] : undefined;
      if (!record(candidate)) throw new ExamAstraError('incomplete', 502, 'Gemini returned no answer.');
      if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(String(candidate.finishReason))) {
        throw new ExamAstraError('refused', 422, 'Gemini could not produce this response.');
      }
      if (candidate.finishReason !== 'STOP' || !record(candidate.content) || !Array.isArray(candidate.content.parts)) {
        throw new ExamAstraError('incomplete', 502, 'Gemini did not finish the answer.');
      }
      const text = candidate.content.parts.filter(part => record(part) && part.thought !== true && typeof part.text === 'string')
        .map(part => (part as { text: string }).text).join('');
      if (!text.trim()) throw new ExamAstraError('incomplete', 502, 'Gemini did not return content.');
      if (data.format) {
        try { JSON.parse(text); } catch { throw new ExamAstraError('incomplete', 502, 'Gemini returned invalid structured content.'); }
      }
      const metadata = record(result.usageMetadata) ? result.usageMetadata : undefined;
      const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
      // totalTokenCount includes thinking; never report only visible answer tokens as the billed output.
      const usage = metadata && tokenCount(metadata.promptTokenCount) && tokenCount(metadata.totalTokenCount)
        && metadata.totalTokenCount >= metadata.promptTokenCount
        ? { inputTokens: metadata.promptTokenCount, outputTokens: metadata.totalTokenCount - metadata.promptTokenCount } : undefined;
      return { text, ...(usage ? { usage } : {}) };
    };
    return await Promise.race([work(), deadline, cancellation]);
  } catch (error) {
    const failure = error instanceof ExamAstraError ? error
      : timedOut ? new ExamAstraError('timeout', 504, 'Gemini request timed out.')
      : controller.signal.aborted ? new ExamAstraError('cancelled', 499, 'Request cancelled.')
      : new ExamAstraError('unavailable', 502, 'Unable to connect to Gemini.');
    if (data.briefProfile) failure.diagnostics = { stage, elapsedMs: Date.now() - started };
    throw failure;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
