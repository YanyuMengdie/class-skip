/**
 * 上课模式 - 录音 + 实时转写（Web Speech API，不接外部 API）
 */

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition);

let recognition: InstanceType<NonNullable<typeof SpeechRecognition>> | null = null;

export function isTranscriptionSupported(): boolean {
  return !!SpeechRecognition;
}

export type OnTranscriptResult = (text: string, isFinal: boolean) => void;

export function startRecording(onResult: OnTranscriptResult): Promise<void> {
  if (!SpeechRecognition) {
    return Promise.reject(new Error('当前浏览器不支持语音识别，建议使用 Chrome'));
  }
  return new Promise((resolve, reject) => {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        if (final) onResult(final, true);
        if (interim) onResult(interim, false);
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed') {
          reject(new Error('请允许使用麦克风'));
        } else {
          reject(new Error(event.error || '语音识别出错'));
        }
      };
      recognition.start();
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function stopRecording(): Promise<void> {
  return new Promise((resolve) => {
    if (recognition) {
      try {
        recognition.stop();
      } catch (_) {}
      recognition = null;
    }
    resolve();
  });
}
