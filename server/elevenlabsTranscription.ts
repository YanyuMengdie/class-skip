const ELEVENLABS_TRANSCRIPTION_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const ELEVENLABS_REALTIME_TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const MAX_KEYTERMS = 1000;
const INVALID_KEYTERM_CHARACTERS = /[<>{}\[\]\\]/g;

export interface ElevenLabsTranscriptionRequest {
  apiKey: string;
  audio: Uint8Array;
  mimeType?: string;
  fileName?: string;
  languageCode?: string;
  numSpeakers?: number;
  keyterms?: string[];
}

export class ElevenLabsTranscriptionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ElevenLabsTranscriptionError';
    this.status = status;
  }
}

export const createElevenLabsRealtimeToken = async (apiKey: string): Promise<string> => {
  if (!apiKey?.trim()) {
    throw new ElevenLabsTranscriptionError('ElevenLabs API key is not configured.', 503);
  }

  const response = await fetch(ELEVENLABS_REALTIME_TOKEN_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey.trim(),
    },
  });

  if (!response.ok) {
    throw new ElevenLabsTranscriptionError(await readErrorMessage(response), response.status);
  }

  const payload = await response.json() as { token?: string };
  if (!payload.token) {
    throw new ElevenLabsTranscriptionError('ElevenLabs did not return a realtime token.', 502);
  }
  return payload.token;
};

const sanitizeFileName = (value?: string) => {
  const fallback = 'lecture-audio.webm';
  if (!value?.trim()) return fallback;
  return value.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 180) || fallback;
};

const sanitizeKeyterms = (values: string[] = []) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(INVALID_KEYTERM_CHARACTERS, '').trim().slice(0, 49))
    .filter((value) => {
      if (!value || value.split(/\s+/).length > 5) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_KEYTERMS);
};

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json() as {
      detail?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.detail === 'string') return payload.detail;
    if (payload.detail && typeof payload.detail.message === 'string') return payload.detail.message;
    if (typeof payload.message === 'string') return payload.message;
  } catch {
    // Keep a stable server-side fallback when the upstream response is not JSON.
  }
  return `ElevenLabs transcription failed (${response.status})`;
};

export const transcribeWithElevenLabs = async ({
  apiKey,
  audio,
  mimeType,
  fileName,
  languageCode,
  numSpeakers,
  keyterms,
}: ElevenLabsTranscriptionRequest): Promise<unknown> => {
  if (!apiKey?.trim()) {
    throw new ElevenLabsTranscriptionError('ElevenLabs API key is not configured.', 503);
  }
  if (!audio.byteLength) {
    throw new ElevenLabsTranscriptionError('The uploaded audio is empty.', 400);
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([audio], { type: mimeType || 'application/octet-stream' }),
    sanitizeFileName(fileName)
  );
  form.append('model_id', 'scribe_v2');
  form.append('diarize', 'true');
  form.append('tag_audio_events', 'true');
  form.append('timestamps_granularity', 'word');

  if (languageCode && languageCode !== 'auto') {
    form.append('language_code', languageCode);
  }
  if (numSpeakers && numSpeakers >= 1 && numSpeakers <= 32) {
    form.append('num_speakers', String(Math.round(numSpeakers)));
  }
  sanitizeKeyterms(keyterms).forEach((term) => form.append('keyterms', term));

  const response = await fetch(ELEVENLABS_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey.trim(),
    },
    body: form,
  });

  if (!response.ok) {
    throw new ElevenLabsTranscriptionError(await readErrorMessage(response), response.status);
  }
  return response.json();
};
