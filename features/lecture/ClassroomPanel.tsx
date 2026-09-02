import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  AudioLines,
  BookOpen,
  Database,
  Languages,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Square,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  LectureRealtimeLine,
  LectureRealtimeStatus,
  LectureRecord,
} from '@/types';

interface ClassroomPanelProps {
  currentLecture: LectureRecord | null;
  onEndClass: () => void;
  isPaused: boolean;
  pausedAt: number | null;
  pausedDurationMs: number;
  onPauseClass: () => void;
  onResumeClass: () => void;
  onShowGuidedReading: () => void;
  onShowPageTools: () => void;
  transcriptLive: string;
  realtimeStatus: LectureRealtimeStatus;
  realtimeMessage?: string;
  liveLines: LectureRealtimeLine[];
  audioLevel: number;
  onRetryRealtime: () => void;
}

type TranscriptView = 'bilingual' | 'original';

const statusMeta: Record<LectureRealtimeStatus, {
  label: string;
  tone: string;
  icon: React.ReactNode;
}> = {
  idle: {
    label: '等待连接',
    tone: 'border-stone-200 bg-stone-50 text-stone-600',
    icon: <WifiOff className="h-3.5 w-3.5" />,
  },
  connecting: {
    label: '正在连接 ElevenLabs',
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  connected: {
    label: 'ElevenLabs 实时',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: <Wifi className="h-3.5 w-3.5" />,
  },
  reconnecting: {
    label: '正在重新连接',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  offline: {
    label: '实时字幕已离线',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: <WifiOff className="h-3.5 w-3.5" />,
  },
  error: {
    label: '实时字幕连接失败',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: <WifiOff className="h-3.5 w-3.5" />,
  },
};

const formatElapsed = (timestamp: number, startedAt?: number) => {
  const elapsedSeconds = Math.max(0, Math.floor((timestamp - (startedAt || timestamp)) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatDuration = (durationMs: number) => {
  const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getAudioQuality = (level: number) => {
  if (level < 0.045) return { label: '声音偏小', color: 'text-amber-700', active: 'bg-amber-400' };
  if (level > 0.84) return { label: '声音偏响', color: 'text-rose-700', active: 'bg-rose-400' };
  return { label: '收音正常', color: 'text-emerald-700', active: 'bg-emerald-400' };
};

export const ClassroomPanel: React.FC<ClassroomPanelProps> = ({
  currentLecture,
  onEndClass,
  isPaused,
  pausedAt,
  pausedDurationMs,
  onPauseClass,
  onResumeClass,
  onShowGuidedReading,
  onShowPageTools,
  transcriptLive,
  realtimeStatus,
  realtimeMessage,
  liveLines,
  audioLevel,
  onRetryRealtime,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastLineCountRef = useRef(liveLines.length);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>('bilingual');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [isFollowingLatest, setIsFollowingLatest] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const status = isPaused
    ? {
        label: '录音与字幕已暂停',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        icon: <Pause className="h-3.5 w-3.5" />,
      }
    : statusMeta[realtimeStatus];
  const audioQuality = isPaused
    ? { label: '收音已暂停', color: 'text-slate-500', active: 'bg-stone-300' }
    : getAudioQuality(audioLevel);
  const savedMegabytes = ((currentLecture?.audioSizeBytes || 0) / (1024 * 1024)).toFixed(1);
  const meterStrength = isPaused ? 0 : Math.max(0, Math.min(5, Math.ceil(audioLevel * 6)));
  const hasConnectionProblem = !isPaused && (realtimeStatus === 'offline' || realtimeStatus === 'error');

  const currentPauseDuration = pausedAt
    ? Math.max(0, clockNow - pausedAt)
    : 0;
  const recordingDuration = currentLecture
    ? formatDuration(clockNow - currentLecture.startedAt - pausedDurationMs - currentPauseDuration)
    : '00:00';

  useEffect(() => {
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [currentLecture?.id]);

  useEffect(() => {
    lastLineCountRef.current = liveLines.length;
    setIsFollowingLatest(true);
    setUnseenCount(0);
    window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [currentLecture?.id]);

  useEffect(() => {
    const newLineCount = Math.max(0, liveLines.length - lastLineCountRef.current);
    lastLineCountRef.current = liveLines.length;
    if (isFollowingLatest) {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setUnseenCount(0);
    } else if (newLineCount > 0) {
      setUnseenCount((count) => count + newLineCount);
    }
  }, [isFollowingLatest, liveLines.length, transcriptLive]);

  const handleTranscriptScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const isNearBottom = distanceFromBottom <= 56;
    setIsFollowingLatest(isNearBottom);
    if (isNearBottom) setUnseenCount(0);
  };

  const jumpToLatest = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    setIsFollowingLatest(true);
    setUnseenCount(0);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-stone-200 bg-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
            <Mic className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{isPaused ? '已暂停' : '上课中'}</span>
              <span className="text-xs tabular-nums text-slate-400">{recordingDuration}</span>
            </div>
            <p className="truncate text-[11px] text-slate-500">
              {isPaused ? '录音与实时字幕均已暂停' : '实时原文与中文翻译'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={isPaused ? onResumeClass : onPauseClass}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition-colors ${isPaused ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? '继续' : '暂停'}
          </button>
          <button
            type="button"
            onClick={onEndClass}
            className="flex h-9 items-center gap-2 rounded-lg bg-rose-500 px-3.5 text-sm font-bold text-white transition-colors hover:bg-rose-600"
          >
            <Square className="h-3.5 w-3.5" />
            下课
          </button>
        </div>
      </header>

      <nav className="grid shrink-0 grid-cols-3 gap-1.5 border-b border-stone-200 bg-stone-50 px-4 py-2" aria-label="右侧工作区">
        <button
          type="button"
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white text-[11px] font-bold text-rose-600 shadow-sm ring-1 ring-stone-200"
          aria-current="page"
        >
          <AudioLines className="h-3.5 w-3.5" />
          课堂字幕
        </button>
        <button
          type="button"
          onClick={onShowGuidedReading}
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
        >
          <BookOpen className="h-3.5 w-3.5" />
          领读
        </button>
        <button
          type="button"
          onClick={onShowPageTools}
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          页面工具
        </button>
      </nav>

      <section className="shrink-0 border-b border-stone-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${status.tone}`}>
            {status.icon}
            {status.label}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-5 items-end gap-0.5" aria-label={`麦克风${audioQuality.label}`}>
              {[1, 2, 3, 4, 5].map((bar) => (
                <span
                  key={bar}
                  className={`w-1 rounded-sm transition-colors ${bar <= meterStrength ? audioQuality.active : 'bg-stone-200'}`}
                  style={{ height: `${5 + bar * 2}px` }}
                />
              ))}
            </div>
            <span className={`text-[11px] font-semibold ${audioQuality.color}`}>{audioQuality.label}</span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <Database className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">原始录音独立保存，不受实时字幕连接影响</span>
          <span className="ml-auto shrink-0 tabular-nums text-slate-400">
            {currentLecture?.audioChunkCount || 0} 段 · {savedMegabytes} MB
          </span>
        </div>
      </section>

      <section className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Languages className="h-4 w-4 text-indigo-500" />
          实时字幕
        </div>
        <div className="flex h-8 items-center rounded-lg bg-stone-100 p-1" role="group" aria-label="字幕显示方式">
          <button
            type="button"
            onClick={() => setTranscriptView('bilingual')}
            className={`h-6 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${transcriptView === 'bilingual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            双语
          </button>
          <button
            type="button"
            onClick={() => setTranscriptView('original')}
            className={`h-6 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${transcriptView === 'original' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            仅原文
          </button>
        </div>
      </section>

      {hasConnectionProblem && (
        <section className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-amber-900">实时字幕暂时不可用</p>
              <p className="mt-1 text-[11px] leading-4 text-amber-800">
                {realtimeMessage || 'ElevenLabs 连接中断。原始录音仍在继续保存，下课后可以重新高精度转写。'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRetryRealtime}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        </section>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleTranscriptScroll}
          className="h-full overflow-y-auto px-4 py-4"
        >
        {liveLines.length === 0 && !transcriptLive ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
            {!isPaused && (realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting') ? (
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            ) : (
              isPaused
                ? <Pause className="h-7 w-7 text-amber-400" />
                : <AudioLines className="h-7 w-7 text-indigo-400" />
            )}
            <p className="mt-3 text-sm font-bold text-slate-700">
              {isPaused ? '课堂录音已暂停' : hasConnectionProblem ? '原始录音仍在继续' : '正在听老师讲话'}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
              {isPaused
                ? '点击“继续”后，录音和 ElevenLabs 实时字幕会从这里接着进行。'
                : hasConnectionProblem
                ? '恢复连接后，新的实时原文和翻译会继续出现在这里。'
                : 'ElevenLabs 确认一句后会显示原文，中文翻译随后跟上。'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {liveLines.map((line) => (
              <article key={line.id} className="border-b border-stone-100 pb-4 last:border-b-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-10 shrink-0 text-[10px] tabular-nums text-slate-400">
                    {formatElapsed(line.timestamp, currentLecture?.startedAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-slate-800">{line.text}</p>
                    {transcriptView === 'bilingual' && (
                      <div className="mt-2 border-l-2 border-indigo-200 pl-3">
                        {line.translationStatus === 'ready' ? (
                          <p className="text-sm leading-6 text-slate-600">{line.translation}</p>
                        ) : line.translationStatus === 'pending' ? (
                          <p className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            正在翻译
                          </p>
                        ) : (
                          <p className="text-xs text-amber-600">这句暂未翻译，原文已保留。</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {transcriptLive && (
              <div className="flex items-start gap-3 pb-3 opacity-70">
                <span className="mt-2 flex w-10 shrink-0 items-center justify-center">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
                </span>
                <p className="min-w-0 flex-1 text-sm italic leading-6 text-slate-500">{transcriptLive}</p>
              </div>
            )}
          </div>
        )}
        </div>
        {!isFollowingLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-4 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3.5 text-xs font-bold text-indigo-700 shadow-lg transition-colors hover:bg-indigo-50"
          >
            {unseenCount > 0 ? `${unseenCount} 条新字幕` : '回到最新'}
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
