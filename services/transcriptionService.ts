/**
 * Classroom audio capture:
 * - MediaRecorder continuously saves the original microphone audio to IndexedDB.
 * - Realtime text is handled exclusively by ElevenLabs in elevenLabsRealtimeService.
 * - A lightweight analyser reports input level without changing the stored audio.
 */

import { lectureAudioStorage } from '@/services/lectureAudioStorage';
import type { LectureAudioRecording } from '@/types';

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meterFrame: number | null = null;
let activeRecordingId: string | null = null;
let activeStartedAt = 0;
let activePausedAt = 0;
let activePausedDurationMs = 0;
let chunkSequence = 0;
let chunkSaveQueue: Promise<unknown> = Promise.resolve();
let activeProgressCallback: ((recording: LectureAudioRecording) => void) | undefined;
let activeAudioLevelCallback: ((level: number) => void) | undefined;

export function isLectureRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';
}

const chooseMimeType = (): string => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
};

const stopAudioMeter = () => {
  if (meterFrame !== null) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  analyser = null;
  if (audioContext) void audioContext.close().catch(() => undefined);
  audioContext = null;
};

const startAudioMeter = (
  stream: MediaStream,
  onAudioLevel?: (level: number) => void
) => {
  if (!onAudioLevel) return;
  try {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;

    const measure = (now: number) => {
      if (!analyser) return;
      analyser.getFloatTimeDomainData(samples);
      if (now - lastUpdate >= 120) {
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        onAudioLevel(Math.min(1, rms * 8));
        lastUpdate = now;
      }
      meterFrame = requestAnimationFrame(measure);
    };
    meterFrame = requestAnimationFrame(measure);
  } catch {
    stopAudioMeter();
    onAudioLevel(0);
  }
};

export async function startRecording(
  recordingId: string,
  onAudioProgress?: (recording: LectureAudioRecording) => void,
  onAudioLevel?: (level: number) => void
): Promise<LectureAudioRecording> {
  if (!isLectureRecordingSupported()) {
    throw new Error('当前浏览器无法保存课堂录音，建议使用最新版 Chrome 或 Safari');
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    throw new Error('已经有一堂课正在录音');
  }

  const startedAt = Date.now();
  const mimeType = chooseMimeType();
  const initialRecording: LectureAudioRecording = {
    id: recordingId,
    source: 'microphone',
    createdAt: startedAt,
    mimeType: mimeType || 'audio/webm',
    sizeBytes: 0,
    chunkCount: 0,
    status: 'recording',
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    await lectureAudioStorage.createRecording(initialRecording);

    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);
    activeRecordingId = recordingId;
    activeStartedAt = startedAt;
    activePausedAt = 0;
    activePausedDurationMs = 0;
    chunkSequence = 0;
    chunkSaveQueue = Promise.resolve();
    activeProgressCallback = onAudioProgress;
    activeAudioLevelCallback = onAudioLevel;

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (!activeRecordingId || !event.data || event.data.size === 0) return;
      const id = activeRecordingId;
      const sequence = chunkSequence++;
      chunkSaveQueue = chunkSaveQueue
        .then(() => lectureAudioStorage.appendChunk(id, sequence, event.data))
        .then((updated) => activeProgressCallback?.(updated as LectureAudioRecording))
        .catch(async () => {
          await lectureAudioStorage.updateRecording(id, { status: 'error' }).catch(() => undefined);
        });
    };
    mediaRecorder.start(15_000);
    startAudioMeter(mediaStream, onAudioLevel);
    return initialRecording;
  } catch (error) {
    stopAudioMeter();
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    mediaRecorder = null;
    activeRecordingId = null;
    activeStartedAt = 0;
    activePausedAt = 0;
    activePausedDurationMs = 0;
    activeProgressCallback = undefined;
    activeAudioLevelCallback = undefined;
    await lectureAudioStorage.updateRecording(recordingId, {
      status: 'error',
      endedAt: Date.now(),
    }).catch(() => undefined);
    throw error;
  }
}

export async function pauseRecording(): Promise<void> {
  const recorder = mediaRecorder;
  if (!recorder || recorder.state !== 'recording') {
    throw new Error('当前没有可以暂停的课堂录音');
  }

  try {
    recorder.requestData();
  } catch {
    // Some browsers flush the current chunk automatically when pausing.
  }

  await new Promise<void>((resolve) => {
    recorder.addEventListener('pause', () => resolve(), { once: true });
    recorder.pause();
  });
  activePausedAt = Date.now();
  stopAudioMeter();
  activeAudioLevelCallback?.(0);
}

export async function resumeRecording(): Promise<void> {
  const recorder = mediaRecorder;
  if (!recorder || recorder.state !== 'paused') {
    throw new Error('当前没有已暂停的课堂录音');
  }

  await new Promise<void>((resolve) => {
    recorder.addEventListener('resume', () => resolve(), { once: true });
    recorder.resume();
  });
  if (activePausedAt > 0) {
    activePausedDurationMs += Math.max(0, Date.now() - activePausedAt);
    activePausedAt = 0;
  }
  if (mediaStream) startAudioMeter(mediaStream, activeAudioLevelCallback);
}

export async function stopRecording(): Promise<LectureAudioRecording | null> {
  const recorder = mediaRecorder;
  const recordingId = activeRecordingId;
  if (!recorder || !recordingId) {
    stopAudioMeter();
    return null;
  }

  if (activePausedAt > 0) {
    activePausedDurationMs += Math.max(0, Date.now() - activePausedAt);
    activePausedAt = 0;
  }

  if (recorder.state !== 'inactive') {
    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.stop();
    });
  }
  await chunkSaveQueue;

  const endedAt = Date.now();
  const completed = await lectureAudioStorage.updateRecording(recordingId, {
    status: 'ready',
    endedAt,
    durationMs: Math.max(0, endedAt - activeStartedAt - activePausedDurationMs),
  });

  stopAudioMeter();
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  mediaRecorder = null;
  activeRecordingId = null;
  activeStartedAt = 0;
  activePausedAt = 0;
  activePausedDurationMs = 0;
  activeProgressCallback = undefined;
  activeAudioLevelCallback = undefined;
  return completed;
}
