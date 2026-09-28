import React, { useEffect, useId, useRef, useState } from 'react';
import { Music, Play, Pause, Volume2, VolumeX, X, Check, Loader2 } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { BACKGROUND_TRACKS } from '@/features/background-audio/useBackgroundAudio';
import type { BackgroundAudioStatus, BackgroundAudioError } from '@/features/background-audio/useBackgroundAudio';
import './MusicPlayer.css';

interface MusicPlayerProps {
  isPlaying: boolean;
  currentTrack: string | null;
  status?: BackgroundAudioStatus;
  error?: BackgroundAudioError | null;
  volume: number;
  onPlayPause: () => void;
  onRetry?: () => void;
  onTrackChange: (url: string, name: string) => void;
  onVolumeChange: (val: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  isPlaying, currentTrack, status, error, volume, onPlayPause, onRetry,
  onTrackChange, onVolumeChange, open: controlledOpen, onOpenChange,
}) => {
  const { language } = useAppLanguage();
  const text = (zh: string, en: string) => language === 'en' ? en : zh;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const selected = BACKGROUND_TRACKS.find(track => track.name === currentTrack) ?? null;
  const playbackStatus = status ?? (isPlaying ? 'playing' : selected ? 'paused' : 'idle');
  const active = playbackStatus === 'playing' || playbackStatus === 'loading';
  const selectedName = selected ? text(selected.name, selected.english) : text('未选择声音', 'No sound selected');
  const statusLabel = {
    idle: selected ? text('待播放', 'Ready to play') : text('先选一种声音', 'Choose a sound to start'),
    loading: text('正在加载…', 'Loading…'),
    playing: volume === 0 ? text('正在播放 · 已静音', 'Playing · Muted') : text('正在播放', 'Playing'),
    paused: text('已暂停', 'Paused'),
    error: text('播放失败', 'Playback failed'),
  }[playbackStatus];
  const errorMessage = {
    network: text('音源暂时无法连接，请重试或换一种声音。', 'Cannot connect to this sound. Retry or choose another.'),
    unsupported: text('浏览器无法播放这个音源，可能是音源不可用或格式不受支持。可以换一种声音。', 'This sound is unavailable or its format is unsupported. Try another sound.'),
    blocked: text('浏览器阻止了播放，请点击重试。', 'Your browser blocked playback. Click Retry to start.'),
    timeout: text('等待音源超过 20 秒，已停止加载。可以重试或换一种声音。', 'Loading stopped after 20 seconds. Retry or choose another sound.'),
    unknown: text('这次未能播放，请重试或换一种声音。', 'Playback could not start. Retry or choose another sound.'),
  }[error ?? 'unknown'];
  const playLabel = playbackStatus === 'loading' ? text('取消加载', 'Cancel loading')
    : active ? text('暂停背景音', 'Pause ambient sound') : text('播放背景音', 'Play ambient sound');

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenRef.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpenRef.current(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [isOpen]);

  return (
    <div className="background-audio" ref={rootRef} data-preserve-language="true">
      <button type="button" ref={triggerRef} onClick={() => setOpen(!isOpen)}
        className={`background-audio-trigger ${active ? 'is-active' : ''}`}
        aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined}
        aria-label={text('背景音', 'Ambient sound')} title={text('背景音', 'Ambient sound')}>
        <Music size={18} aria-hidden="true" />
        <span>{active ? selectedName : text('背景音', 'Ambient sound')}</span>
      </button>
      {isOpen && (
        <div id={panelId} className="background-audio-panel" role="region" aria-label={text('背景音播放器', 'Ambient sound player')}>
          <div className="background-audio-heading">
            <h3><Volume2 size={18} aria-hidden="true" />{text('背景音', 'Ambient sound')}</h3>
            <button type="button" ref={closeRef} className="background-audio-close"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label={text('关闭背景音面板', 'Close ambient sound panel')}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="background-audio-intro">{text('选一种声音，陪你读一会儿。', 'Choose a sound to read along with.')}</p>
          <div className="background-audio-tracks" aria-label={text('选择声音', 'Choose a sound')}>
            {BACKGROUND_TRACKS.map(track => (
              <button type="button" key={track.id} aria-pressed={selected?.id === track.id}
                className={`background-audio-track ${selected?.id === track.id ? 'is-selected' : ''}`}
                onClick={() => onTrackChange(track.url, track.name)}>
                <span>{text(track.name, track.english)}</span>
                {selected?.id === track.id && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="background-audio-status" role="status" aria-live="polite" aria-atomic="true">
            <strong>{selectedName}</strong>
            <span>{playbackStatus === 'loading' && <Loader2 size={14} className="background-audio-spinner" aria-hidden="true" />}{statusLabel}</span>
          </div>
          {playbackStatus === 'error' && (
            <div className="background-audio-error" role="alert">
              <p>{errorMessage}</p>
              <button type="button" onClick={onRetry ?? onPlayPause}>{text('重试', 'Retry')}</button>
            </div>
          )}
          <div className="background-audio-controls">
            <button type="button" className="background-audio-play" onClick={onPlayPause} disabled={!selected}
              aria-label={playLabel} title={!selected ? text('请先选择一种声音', 'Choose a sound first') : playLabel}>
              {active ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
            </button>
            <label className="background-audio-volume">
              <span>{volume === 0 ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
                {text('音量', 'Volume')}<output>{Math.round(volume * 100)}%</output>
              </span>
              <input type="range" min="0" max="1" step="0.01" value={volume}
                aria-label={text('背景音音量', 'Ambient sound volume')} aria-valuetext={`${Math.round(volume * 100)}%`}
                onChange={event => onVolumeChange(Number(event.target.value))} />
            </label>
          </div>
          <p className="background-audio-note">{text('记住声音和音量，下次由你点击播放。关闭面板不会停止播放。', 'Your sound and volume are saved. Playback starts when you choose; closing this panel keeps it playing.')}</p>
        </div>
      )}
    </div>
  );
};
