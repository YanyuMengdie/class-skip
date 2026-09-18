import { readRequestPayload } from '../../server/productionApi';
import { ExamAstraError } from '../../server/examAstra';
import { ProductionAuthError } from '../../server/productionAuth';
import {
  ElevenLabsTranscriptionError,
  transcribeWithElevenLabs,
} from '../../server/elevenlabsTranscription';

export const config = {
  api: {
    bodyParser: false,
  },
};

const readRawBody = async (request: any): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

const parseKeyterms = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    let audio = await readRawBody(request);
    if (request.headers['x-classskip-body-type']) {
      const envelope = JSON.parse(Buffer.from(audio).toString('utf8'));
      const stored = await readRequestPayload(request, envelope, 128 * 1024 * 1024);
      if (!stored) throw new ExamAstraError('invalid_request', 400, '无法识别暂存录音。');
      audio = stored;
    }
    const result = await transcribeWithElevenLabs({
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      audio,
      mimeType: request.headers['x-classskip-body-type'] || request.headers['content-type'],
      fileName: decodeURIComponent(request.headers['x-file-name'] || 'lecture-audio.webm'),
      languageCode: request.headers['x-language-code'],
      numSpeakers: Number(request.headers['x-num-speakers']) || undefined,
      keyterms: parseKeyterms(request.headers['x-keyterms']),
    });
    response.status(200).json(result);
  } catch (error) {
    const status = (error instanceof ElevenLabsTranscriptionError || error instanceof ProductionAuthError || error instanceof ExamAstraError) ? error.status : 500;
    response.status(status).json({
      error: error instanceof Error ? error.message : 'Transcription failed',
    });
  }
}
