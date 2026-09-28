import { useEffect, useRef, useState } from 'react';

export const BACKGROUND_TRACKS = [
  { id: 'rain', name: '雨声', english: 'Rain', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' },
  { id: 'cafe', name: '咖啡馆', english: 'Cafe', url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg' },
  { id: 'light-rain', name: '轻雨', english: 'Light rain', url: 'https://actions.google.com/sounds/v1/weather/light_rain.ogg' },
  { id: 'fire', name: '炉火', english: 'Fire', url: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg' },
  { id: 'crickets', name: '夏夜虫鸣', english: 'Crickets', url: 'https://actions.google.com/sounds/v1/ambiences/crickets_with_distant_traffic.ogg' },
  { id: 'breeze', name: '微风', english: 'Breeze', url: 'https://actions.google.com/sounds/v1/weather/light_breeze.ogg' },
  { id: 'interior-rain', name: '室内雨声', english: 'Indoor rain', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_quiet_interior.ogg' },
  { id: 'forest', name: '夏日森林', english: 'Summer forest', url: 'https://actions.google.com/sounds/v1/ambiences/summer_forest.ogg' },
] as const;
export type BackgroundAudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type BackgroundAudioError = 'network' | 'unsupported' | 'blocked' | 'timeout' | 'unknown';
const PREFERENCES_KEY = 'classskip.background-audio.v1';
const clampVolume = (value: number) => Math.max(0, Math.min(1, value));
const loadPreferences = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null');
    return {
      trackId: BACKGROUND_TRACKS.find(track => track.id === saved?.trackId)?.id ?? null,
      volume: typeof saved?.volume === 'number' && Number.isFinite(saved.volume) ? clampVolume(saved.volume) : 0.5,
    };
  } catch { return { trackId: null, volume: 0.5 }; }
};

/** Audio exists only after a user action. Preferences never resume playback. */
export function useBackgroundAudio() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [status, setStatus] = useState<BackgroundAudioStatus>('idle');
  const [error, setError] = useState<BackgroundAudioError | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentRef = useRef(false);
  const attemptRef = useRef(0);
  const track = BACKGROUND_TRACKS.find(item => item.id === preferences.trackId) ?? null;

  const clearWait = () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  const dispose = () => {
    attemptRef.current += 1;
    intentRef.current = false;
    clearWait();
    disposeRef.current?.();
    disposeRef.current = null;
    audioRef.current = null;
  };
  useEffect(() => () => dispose(), []);
  useEffect(() => {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Playback still works if storage is unavailable. */ }
    if (audioRef.current) audioRef.current.volume = preferences.volume;
  }, [preferences]);

  const play = (selected = track) => {
    if (!selected) return;
    dispose();
    const audio = new Audio();
    audioRef.current = audio;
    const attempt = attemptRef.current;
    intentRef.current = true;
    audio.loop = true;
    audio.volume = preferences.volume;
    audio.preload = 'none';
    setStatus('loading');
    setError(null);
    const current = () => audioRef.current === audio && attemptRef.current === attempt;
    const fail = (reason: BackgroundAudioError) => {
      if (!current() || !intentRef.current) return;
      dispose();
      setStatus('error');
      setError(reason);
    };
    const wait = () => {
      if (!current() || !intentRef.current) return;
      setStatus('loading');
      if (timeoutRef.current === null) timeoutRef.current = setTimeout(() => fail('timeout'), 20000);
    };
    const playing = () => {
      if (!current() || !intentRef.current) { audio.pause(); return; }
      clearWait();
      setError(null);
      setStatus('playing');
    };
    const paused = () => {
      if (!current() || !intentRef.current) return;
      intentRef.current = false;
      clearWait();
      setStatus('paused');
    };
    const stalled = () => { if (audio.readyState < 3) wait(); };
    const failed = () => fail(audio.error?.code === 2 ? 'network' : audio.error?.code === 3 || audio.error?.code === 4 ? 'unsupported' : 'unknown');
    audio.addEventListener('playing', playing);
    audio.addEventListener('pause', paused);
    audio.addEventListener('waiting', wait);
    audio.addEventListener('stalled', stalled);
    audio.addEventListener('error', failed);
    disposeRef.current = () => {
      audio.removeEventListener('playing', playing);
      audio.removeEventListener('pause', paused);
      audio.removeEventListener('waiting', wait);
      audio.removeEventListener('stalled', stalled);
      audio.removeEventListener('error', failed);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
    wait();
    try {
      audio.src = selected.url;
      void audio.play().catch(cause => {
        if (!current() || !intentRef.current) return;
        fail(cause?.name === 'NotAllowedError' ? 'blocked' : cause?.name === 'NotSupportedError' ? 'unsupported' : 'unknown');
      });
    } catch { fail('unknown'); }
  };
  const pause = () => {
    dispose();
    setStatus(track ? 'paused' : 'idle');
    setError(null);
  };
  const selectTrack = (url: string) => {
    const selected = BACKGROUND_TRACKS.find(item => item.url === url);
    if (!selected) return;
    if (selected.id === track?.id && intentRef.current) return;
    setPreferences(previous => ({ ...previous, trackId: selected.id }));
    play(selected);
  };
  const toggle = () => { if (intentRef.current) pause(); else play(); };
  const setVolume = (volume: number) => {
    if (Number.isFinite(volume)) setPreferences(previous => ({ ...previous, volume: clampVolume(volume) }));
  };
  return { track, status, error, volume: preferences.volume, setVolume, selectTrack, toggle, pause, retry: () => play() };
}
