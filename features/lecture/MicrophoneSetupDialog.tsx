import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Loader2, Mic, RefreshCw, X } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

interface MicrophoneSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (deviceId?: string) => Promise<boolean>;
}

const PREFERRED_MICROPHONE_KEY = 'classSkip_preferredMicrophoneId_v1';

const microphoneConstraints = (deviceId?: string): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
});

export const MicrophoneSetupDialog: React.FC<MicrophoneSetupDialogProps> = ({ open, onClose, onStart }) => {
  const { text } = useAppLanguage();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const selectedDeviceIdRef = useRef('');
  const openRef = useRef(open);
  const startingRef = useRef(false);
  openRef.current = open;
  startingRef.current = starting;

  const stopPreview = useCallback(() => {
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
    audioContextRef.current = null;
    setPreviewReady(false);
    setAudioLevel(0);
  }, []);

  const startPreview = useCallback(async (deviceId?: string) => {
    stopPreview();
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: microphoneConstraints(deviceId),
      });
      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let lastUpdate = 0;
      const measure = (now: number) => {
        if (streamRef.current !== stream) return;
        analyser.getFloatTimeDomainData(samples);
        if (now - lastUpdate >= 100) {
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 8));
          lastUpdate = now;
        }
        meterFrameRef.current = requestAnimationFrame(measure);
      };
      meterFrameRef.current = requestAnimationFrame(measure);
      setPreviewReady(true);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? text('没有麦克风权限。请在浏览器地址栏允许使用麦克风后重试。', 'Microphone access is blocked. Allow microphone access in the browser address bar, then try again.')
        : cause instanceof DOMException && cause.name === 'OverconstrainedError'
          ? text('所选麦克风已经不可用，请重新选择。', 'The selected microphone is no longer available. Choose another input.')
          : cause instanceof Error
            ? cause.message
            : text('无法打开麦克风。', 'Could not open the microphone.');
      setError(message);
      setPreviewReady(false);
    }
  }, [stopPreview, text]);

  const loadDevices = useCallback(async (requestPermission: boolean) => {
    setLoading(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(text('当前浏览器不支持选择麦克风。', 'This browser does not support microphone selection.'));
      }
      if (requestPermission) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        permissionStream.getTracks().forEach((track) => track.stop());
      }
      const rows = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')
        .filter((device, index, all) => all.findIndex((candidate) => candidate.deviceId === device.deviceId) === index);
      if (!openRef.current) return;
      setDevices(rows);

      const saved = (() => {
        try { return window.localStorage.getItem(PREFERRED_MICROPHONE_KEY) || ''; } catch { return ''; }
      })();
      const current = selectedDeviceIdRef.current;
      const next = rows.some((device) => device.deviceId === current)
        ? current
        : rows.some((device) => device.deviceId === saved)
          ? saved
          : '';
      selectedDeviceIdRef.current = next;
      setSelectedDeviceId(next);
      await startPreview(next || undefined);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? text('没有麦克风权限。请在浏览器地址栏允许使用麦克风后重试。', 'Microphone access is blocked. Allow microphone access in the browser address bar, then try again.')
        : cause instanceof Error
          ? cause.message
          : text('无法读取麦克风列表。', 'Could not load the microphone list.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [startPreview, text]);

  useEffect(() => {
    if (!open) {
      stopPreview();
      return;
    }
    void loadDevices(true);
    const handleDeviceChange = () => void loadDevices(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !startingRef.current) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      window.removeEventListener('keydown', handleKeyDown);
      stopPreview();
    };
  }, [loadDevices, onClose, open, stopPreview]);

  if (!open) return null;

  const handleDeviceChange = (deviceId: string) => {
    selectedDeviceIdRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    void startPreview(deviceId || undefined);
  };

  const handleStart = async () => {
    if (!previewReady || starting) return;
    setStarting(true);
    startingRef.current = true;
    setError('');
    stopPreview();
    try {
      if (rememberDevice && selectedDeviceId) window.localStorage.setItem(PREFERRED_MICROPHONE_KEY, selectedDeviceId);
      else window.localStorage.removeItem(PREFERRED_MICROPHONE_KEY);
    } catch {
      // The selected input still works when local preference storage is unavailable.
    }
    const started = await onStart(selectedDeviceId || undefined);
    setStarting(false);
    startingRef.current = false;
    if (started) onClose();
    else await startPreview(selectedDeviceId || undefined);
  };

  const activeBars = Math.max(1, Math.round(audioLevel * 8));

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-[#202822]/35 p-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" onClick={starting ? undefined : onClose} aria-label={text('关闭麦克风设置', 'Close microphone setup')} />
      <section className="relative w-full max-w-lg overflow-hidden rounded-md border border-[#DCD9CF] bg-[#FBFAF6] shadow-[0_24px_70px_rgba(32,40,34,0.2)]" role="dialog" aria-modal="true" aria-labelledby="microphone-setup-title">
        <header className="flex items-start justify-between gap-4 border-b border-[#DCD9CF] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6F756F]">Audio input</p>
            <h2 id="microphone-setup-title" className="mt-2 font-serif text-2xl font-normal text-[#202822]">{text('上课前检查收音', 'Check audio before class')}</h2>
            <p className="mt-2 text-sm leading-6 text-[#6F756F]">{text('原始录音和实时字幕会使用同一个输入设备。', 'The original recording and live captions will use the same input device.')}</p>
          </div>
          <button type="button" onClick={onClose} disabled={starting} className="rounded-sm p-2 text-[#6F756F] hover:bg-[#E4EBE5] hover:text-[#202822] disabled:opacity-40" aria-label={text('关闭', 'Close')}><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 px-6 py-6">
          <label className="block">
            <span className="text-sm font-semibold text-[#202822]">{text('录音输入', 'Recording input')}</span>
            <div className="mt-2 flex gap-2">
              <select value={selectedDeviceId} onChange={(event) => handleDeviceChange(event.target.value)} disabled={loading || starting} className="min-w-0 flex-1 rounded-sm border border-[#D0CEC5] bg-white px-3.5 py-3 text-sm text-[#202822] outline-none focus:border-[#789583] disabled:opacity-50">
                <option value="">{text('系统默认麦克风', 'System default microphone')}</option>
                {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || text(`麦克风 ${index + 1}`, `Microphone ${index + 1}`)}</option>)}
              </select>
              <button type="button" onClick={() => void loadDevices(true)} disabled={loading || starting} className="grid w-12 shrink-0 place-items-center rounded-sm border border-[#D0CEC5] bg-white text-[#3F6653] hover:bg-[#E4EBE5] disabled:opacity-40" title={text('重新读取麦克风', 'Reload microphones')}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </label>

          <div className="rounded-sm border border-[#DCD9CF] bg-[#F3F0E8] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#202822]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#3F6653]" /> : previewReady ? <Check className="h-4 w-4 text-[#3F6653]" /> : <Mic className="h-4 w-4 text-[#A55B3D]" />}
                {loading ? text('正在读取设备', 'Loading inputs') : previewReady ? text('麦克风已连接', 'Microphone connected') : text('等待麦克风', 'Waiting for microphone')}
              </div>
              <span className="text-xs text-[#6F756F]">{text('说句话试试看', 'Say something to test it')}</span>
            </div>
            <div className="mt-4 flex h-10 items-end gap-1" aria-label={text('实时收音强度', 'Live input level')}>
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className={`w-full rounded-[2px] transition-colors duration-100 ${index < activeBars && previewReady ? 'bg-[#3F6653]' : 'bg-[#D7D9D2]'}`} style={{ height: `${28 + index * 9}%` }} />
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[#6F756F]">{text('看到音量条跟着声音变化，就说明选择正确。', 'If the level moves with your voice, the correct input is selected.')}</p>
          </div>

          {error && <p className="rounded-sm border border-[#D9BCAA] bg-[#F6ECE5] px-4 py-3 text-sm leading-6 text-[#8D4D34]">{error}</p>}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#505851]">
            <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="h-4 w-4 accent-[#3F6653]" />
            {text('下次优先使用这个麦克风', 'Prefer this microphone next time')}
          </label>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[#DCD9CF] bg-[#F3F0E8] px-6 py-4">
          <button type="button" onClick={onClose} disabled={starting} className="rounded-sm border border-[#D0CEC5] bg-[#FBFAF6] px-4 py-2.5 text-sm font-semibold text-[#505851] hover:border-[#9DA39D] disabled:opacity-40">{text('取消', 'Cancel')}</button>
          <button type="button" onClick={() => void handleStart()} disabled={!previewReady || loading || starting} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-sm bg-[#294B3B] px-5 py-2.5 text-sm font-semibold text-[#FBFAF6] hover:bg-[#202822] disabled:cursor-not-allowed disabled:opacity-45">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
            {starting ? text('正在开始', 'Starting') : text('开始上课', 'Start class')}
          </button>
        </footer>
      </section>
    </div>
  );
};
