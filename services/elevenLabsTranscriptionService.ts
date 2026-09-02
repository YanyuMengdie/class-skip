import type {
  LectureAudioQuality,
  LectureTranscriptSegment,
} from '@/types';

export interface LectureTranscriptionOptions {
  languageCode: 'auto' | 'en' | 'zh';
  numSpeakers?: number;
  keyterms: string[];
  fileName?: string;
}

interface ElevenLabsWord {
  text?: string;
  start?: number;
  end?: number;
  type?: 'word' | 'spacing' | 'audio_event' | string;
  speaker_id?: string | null;
  logprob?: number;
}

interface ElevenLabsTranscript {
  text?: string;
  language_code?: string;
  language_probability?: number;
  words?: ElevenLabsWord[];
}

export interface LectureTranscriptionResult {
  text: string;
  languageCode?: string;
  languageProbability?: number;
  segments: LectureTranscriptSegment[];
  legacyTranscript: { text: string; timestamp: number }[];
  quality: LectureAudioQuality;
  speakerCount: number;
}

const parseResponseError = async (response: Response) => {
  if (response.status === 401 || response.status === 403 || response.status === 503) {
    return '高精度转写服务尚未正确连接，请检查 ElevenLabs 配置后重试。';
  }
  if (response.status === 429) {
    return 'ElevenLabs 当前额度或请求频率已达上限，请稍后重试。';
  }
  if (response.status === 413) {
    return '这份录音太大，暂时无法一次转写。';
  }
  return '高精度转写失败，请稍后重试。';
};

const parseKeyterms = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/[<>{}\[\]\\]/g, '').trim().slice(0, 49))
    .filter((value) => {
      if (!value || value.split(/\s+/).length > 5) return false;
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 1000);
};

const appendToken = (current: string, token: string) => {
  if (!token) return current;
  if (!current) return token.trimStart();
  if (/^\s/.test(token)) return current + token;
  if (/^[,.;:!?，。！？；：、'’”)\]}]/.test(token)) return current + token;
  if (/[\u3400-\u9fff]$/.test(current) || /^[\u3400-\u9fff]/.test(token)) {
    return current + token;
  }
  return `${current} ${token}`;
};

const buildSegments = (payload: ElevenLabsTranscript): LectureTranscriptSegment[] => {
  const words = (payload.words || []).filter((word) => word.text);
  if (words.length === 0) {
    const fallback = payload.text?.trim();
    return fallback
      ? [{
          id: 'segment-0',
          speakerId: 'speaker_0',
          speakerLabel: '讲者 1',
          startMs: 0,
          endMs: 0,
          text: fallback,
        }]
      : [];
  }

  const speakerOrder = new Map<string, number>();
  const segments: LectureTranscriptSegment[] = [];
  let activeSpeaker = '';
  let activeText = '';
  let activeStart = 0;
  let activeEnd = 0;

  const speakerLabel = (speakerId: string) => {
    if (!speakerOrder.has(speakerId)) speakerOrder.set(speakerId, speakerOrder.size + 1);
    return `讲者 ${speakerOrder.get(speakerId)}`;
  };

  const flush = () => {
    const text = activeText.trim();
    if (!text) return;
    segments.push({
      id: `segment-${segments.length}`,
      speakerId: activeSpeaker || 'speaker_0',
      speakerLabel: speakerLabel(activeSpeaker || 'speaker_0'),
      startMs: Math.round(activeStart * 1000),
      endMs: Math.round(activeEnd * 1000),
      text,
    });
    activeText = '';
  };

  words.forEach((word) => {
    const speaker = word.speaker_id || activeSpeaker || 'speaker_0';
    const start = typeof word.start === 'number' ? word.start : activeEnd;
    const end = typeof word.end === 'number' ? word.end : start;
    const isSpeakerChange = Boolean(activeText) && speaker !== activeSpeaker;
    const hasLongPause = Boolean(activeText) && start - activeEnd > 1.8;
    const isLongSentence = activeText.length > 620 && /[.!?。！？]$/.test(activeText.trim());

    if (isSpeakerChange || hasLongPause || isLongSentence) flush();
    if (!activeText) {
      activeSpeaker = speaker;
      activeStart = start;
    }
    activeEnd = Math.max(activeEnd, end);
    activeText = appendToken(activeText, word.text || '');
  });
  flush();
  return segments;
};

const estimateAudioQuality = (
  payload: ElevenLabsTranscript,
  durationMs: number | undefined,
  speakerCount: number
): LectureAudioQuality => {
  const spokenWords = (payload.words || []).filter((word) => word.type === 'word' || !word.type);
  const logprobs = spokenWords
    .map((word) => word.logprob)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const averageLogprob = logprobs.length
    ? logprobs.reduce((sum, value) => sum + value, 0) / logprobs.length
    : undefined;
  const languageProbability = typeof payload.language_probability === 'number'
    ? payload.language_probability
    : undefined;
  const speechSeconds = spokenWords.reduce((sum, word) => {
    if (typeof word.start !== 'number' || typeof word.end !== 'number') return sum;
    return sum + Math.max(0, word.end - word.start);
  }, 0);
  const inferredDurationSeconds = Math.max(
    durationMs ? durationMs / 1000 : 0,
    ...spokenWords.map((word) => word.end || 0),
    0
  );
  const speechCoverage = inferredDurationSeconds > 0
    ? Math.min(1, speechSeconds / inferredDurationSeconds)
    : undefined;

  let score = 78;
  if (averageLogprob != null) {
    if (averageLogprob >= -0.3) score += 10;
    else if (averageLogprob < -0.8) score -= 25;
    else if (averageLogprob < -0.5) score -= 12;
  }
  if (languageProbability != null) {
    if (languageProbability >= 0.9) score += 5;
    else if (languageProbability < 0.6) score -= 15;
    else if (languageProbability < 0.8) score -= 6;
  }
  if (speechCoverage != null) {
    if (speechCoverage < 0.08) score -= 20;
    else if (speechCoverage < 0.2) score -= 8;
  }
  if ((payload.text?.trim().length || 0) < 20 && inferredDurationSeconds > 30) score -= 30;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const rating = score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor';
  const message = rating === 'good'
    ? '录音清晰，转写可信度较高。'
    : rating === 'fair'
      ? '部分片段可能受距离或环境噪声影响，建议对照音频检查专业术语。'
      : '当前音频质量欠佳，部分内容可能听不清，转写准确度可能较低。';

  return {
    rating,
    score,
    message,
    metrics: {
      averageLogprob,
      languageProbability,
      speechCoverage,
      speakerCount,
    },
  };
};

export const transcribeLectureAudio = async (
  audio: Blob,
  options: LectureTranscriptionOptions,
  durationMs?: number
): Promise<LectureTranscriptionResult> => {
  const keyterms = parseKeyterms(options.keyterms);
  const response = await fetch('/api/elevenlabs/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': audio.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(options.fileName || 'lecture-audio.webm'),
      'X-Language-Code': options.languageCode,
      'X-Num-Speakers': options.numSpeakers ? String(options.numSpeakers) : '',
      'X-Keyterms': JSON.stringify(keyterms),
    },
    body: audio,
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }
  const payload = await response.json() as ElevenLabsTranscript;
  const segments = buildSegments(payload);
  if (!payload.text?.trim() && segments.length === 0) {
    throw new Error('没有从录音中识别到清晰语音，请检查音频后重试。');
  }

  const speakerCount = new Set(segments.map((segment) => segment.speakerId)).size || 1;
  return {
    text: payload.text?.trim() || segments.map((segment) => segment.text).join('\n'),
    languageCode: payload.language_code,
    languageProbability: payload.language_probability,
    segments,
    legacyTranscript: segments.map((segment) => ({
      text: segment.text,
      timestamp: segment.startMs,
    })),
    quality: estimateAudioQuality(payload, durationMs, speakerCount),
    speakerCount,
  };
};
