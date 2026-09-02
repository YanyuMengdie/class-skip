import {
  CommitStrategy,
  RealtimeEvents,
  Scribe,
  type RealtimeConnection,
} from '@elevenlabs/client';

export type LectureRealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';

export interface ElevenLabsRealtimeHandlers {
  onStatus: (status: LectureRealtimeStatus, message?: string) => void;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
}

let connection: RealtimeConnection | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeGeneration = 0;
let manuallyStopped = true;
let reconnectAttempt = 0;
let activeHandlers: ElevenLabsRealtimeHandlers | null = null;
let lastCommitted = '';
let lastCommittedAt = 0;

const fetchRealtimeToken = async (): Promise<string> => {
  const response = await fetch('/api/elevenlabs/realtime-token', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as { token?: string; error?: string };
  if (!response.ok || !payload.token) {
    throw new Error(payload.error || '无法连接 ElevenLabs 实时转写');
  }
  return payload.token;
};

const clearReconnectTimer = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const connect = async (generation: number, reconnecting: boolean) => {
  const handlers = activeHandlers;
  if (!handlers || manuallyStopped || generation !== activeGeneration) return;

  handlers.onStatus(reconnecting ? 'reconnecting' : 'connecting');
  try {
    const token = await fetchRealtimeToken();
    if (manuallyStopped || generation !== activeGeneration) return;

    const nextConnection = Scribe.connect({
      token,
      modelId: 'scribe_v2_realtime',
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: 0.8,
      vadThreshold: 0.4,
      minSpeechDurationMs: 120,
      minSilenceDurationMs: 450,
      includeLanguageDetection: true,
      noVerbatim: false,
    });
    connection = nextConnection;

    nextConnection.on(RealtimeEvents.OPEN, () => {
      if (generation !== activeGeneration || manuallyStopped) return;
      reconnectAttempt = 0;
      handlers.onStatus('connected');
    });
    nextConnection.on(RealtimeEvents.SESSION_STARTED, () => {
      if (generation !== activeGeneration || manuallyStopped) return;
      handlers.onStatus('connected');
    });
    nextConnection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (message) => {
      if (generation !== activeGeneration || manuallyStopped) return;
      handlers.onPartial(message.text || '');
    });
    nextConnection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (message) => {
      if (generation !== activeGeneration || manuallyStopped) return;
      const text = (message.text || '').trim();
      const now = Date.now();
      if (!text || (text === lastCommitted && now - lastCommittedAt < 4_000)) return;
      lastCommitted = text;
      lastCommittedAt = now;
      handlers.onPartial('');
      handlers.onCommitted(text);
    });
    nextConnection.on(RealtimeEvents.ERROR, (message) => {
      if (generation !== activeGeneration || manuallyStopped) return;
      handlers.onStatus('error', message.error || 'ElevenLabs 实时转写暂时不可用');
    });
    nextConnection.on(RealtimeEvents.CLOSE, () => {
      if (generation !== activeGeneration || manuallyStopped) return;
      connection = null;
      handlers.onPartial('');
      handlers.onStatus('offline', '实时连接中断，原始录音仍在保存');
      reconnectAttempt += 1;
      const delay = Math.min(8_000, 1_200 * Math.max(1, reconnectAttempt));
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => void connect(generation, true), delay);
    });
  } catch (error) {
    if (generation !== activeGeneration || manuallyStopped) return;
    const message = error instanceof Error ? error.message : 'ElevenLabs 实时转写暂时不可用';
    handlers.onStatus('error', message);
    reconnectAttempt += 1;
    const delay = Math.min(8_000, 1_200 * Math.max(1, reconnectAttempt));
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => void connect(generation, true), delay);
  }
};

export const startElevenLabsRealtimeTranscription = async (
  handlers: ElevenLabsRealtimeHandlers
) => {
  stopElevenLabsRealtimeTranscription();
  activeGeneration += 1;
  manuallyStopped = false;
  reconnectAttempt = 0;
  activeHandlers = handlers;
  lastCommitted = '';
  lastCommittedAt = 0;
  await connect(activeGeneration, false);
};

export const retryElevenLabsRealtimeTranscription = async () => {
  if (!activeHandlers) return;
  const handlers = activeHandlers;
  stopElevenLabsRealtimeTranscription();
  await startElevenLabsRealtimeTranscription(handlers);
};

export const stopElevenLabsRealtimeTranscription = () => {
  manuallyStopped = true;
  activeGeneration += 1;
  clearReconnectTimer();
  if (connection) {
    try {
      connection.close();
    } catch {
      // The socket may already have closed; microphone cleanup still runs in the SDK.
    }
  }
  connection = null;
};
