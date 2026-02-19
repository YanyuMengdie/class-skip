import React, { useState, useEffect } from 'react';
import { X, Music, Coffee, Youtube, Tv, Timer, ExternalLink, ClipboardPaste } from 'lucide-react';

/** 从粘贴内容中解析 B站 BV 号（支持链接或纯 BV） */
function parseBilibiliId(input: string): string | null {
  const s = input.trim();
  const bvMatch = s.match(/BV[\w]+/i);
  return bvMatch ? bvMatch[0] : null;
}

/** 从粘贴内容中解析 YouTube 视频 ID */
function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  const vMatch = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return vMatch ? vMatch[1] : (/^[\w-]{11}$/.test(s) ? s : null);
}

interface BreakPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** 点击「打开白噪音」时调用，用于打开 Header 的白噪音面板 */
  onOpenMusicPlayer: () => void;
  /** 进入能量补给站（学不动了） */
  onEnterEnergyMode: () => void;
  /** 在本页小窗播放 B站/YouTube，分心也在这一页 */
  onVideoSelect?: (type: 'bilibili' | 'youtube', id: string) => void;
}

export const BreakPanel: React.FC<BreakPanelProps> = ({
  isOpen,
  onClose,
  onOpenMusicPlayer,
  onEnterEnergyMode,
  onVideoSelect
}) => {
  const [restMinutes, setRestMinutes] = useState(5);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [videoType, setVideoType] = useState<'bilibili' | 'youtube'>('bilibili');
  const [videoId, setVideoId] = useState('');

  useEffect(() => {
    if (countdownSec === null || countdownSec > 0) return;
    const t = window.setTimeout(() => {
      setCountdownSec(null);
      alert('该回去学啦～');
    }, 100);
    return () => clearTimeout(t);
  }, [countdownSec]);

  useEffect(() => {
    if (countdownSec === null || countdownSec <= 0) return;
    const interval = setInterval(() => setCountdownSec((s) => s! - 1), 1000);
    return () => clearInterval(interval);
  }, [countdownSec]);

  const startRest = () => {
    setCountdownSec(restMinutes * 60);
  };

  const handleOpenMusic = () => {
    onOpenMusicPlayer();
  };

  const resolveVideoId = (): string | null => {
    const raw = videoId.trim();
    if (!raw) return null;
    if (videoType === 'bilibili') return parseBilibiliId(raw) || (/^BV[\w]+$/i.test(raw) ? raw : null);
    return parseYoutubeId(raw) || (/^[\w-]{11}$/.test(raw) ? raw : null);
  };

  const handlePlayVideo = () => {
    const id = resolveVideoId();
    if (!id || !onVideoSelect) {
      if (videoType === 'bilibili') alert('请粘贴 B站链接或 BV 号');
      else alert('请粘贴 YouTube 链接或视频 ID');
      return;
    }
    onVideoSelect(videoType, id);
    setVideoId('');
  };

  const handlePasteAndPlay = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const bv = parseBilibiliId(text);
      const yt = parseYoutubeId(text);
      if (bv && onVideoSelect) {
        onVideoSelect('bilibili', bv);
        return;
      }
      if (yt && onVideoSelect) {
        onVideoSelect('youtube', yt);
        return;
      }
      setVideoId(text);
    } catch {
      alert('无法读取剪贴板，请手动粘贴到输入框');
    }
  };

  const openBilibiliInPopup = () => {
    window.open('https://www.bilibili.com', '_blank', 'width=960,height=700,noopener');
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[150] bg-black/20 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white shadow-2xl border-l border-stone-200 z-[151] flex flex-col animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="小憩一下"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-stone-100">
          <h2 className="text-lg font-bold text-slate-800">小憩一下</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 打开白噪音：快捷入口，实际仍在 Header */}
          <button
            type="button"
            onClick={handleOpenMusic}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-violet-200/50">
              <Music className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">打开白噪音</p>
              <p className="text-xs text-slate-500 mt-0.5">边学边听，在右上角调节</p>
            </div>
          </button>

          {/* 能量补给站 */}
          <button
            type="button"
            onClick={() => { onEnterEnergyMode(); onClose(); }}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-100 text-left transition-colors"
          >
            <div className="p-2 rounded-lg bg-amber-200/50">
              <Coffee className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">学不动了</p>
              <p className="text-xs text-slate-500 mt-0.5">任务拆解、倾诉、深呼吸</p>
            </div>
          </button>

          {/* 看个视频：先刷推荐，再粘贴在本页播 */}
          {onVideoSelect && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 space-y-4">
              <p className="font-semibold text-slate-800 flex items-center gap-2">
                <Tv className="w-4 h-4 text-rose-500" />
                看个视频
              </p>

              {/* 在本页刷 B站：小窗打开，不占主标签 */}
              <div className="space-y-2">
                <p className="text-xs text-slate-600">不知道看啥？先刷推荐，再复制链接回来播</p>
                <button
                  type="button"
                  onClick={openBilibiliInPopup}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  在小窗打开 B站（刷推荐）
                </button>
                <p className="text-[10px] text-slate-400">小窗里刷到想看的，复制链接回来粘贴即可在本页播</p>
              </div>

              {/* 粘贴链接或 BV，在本页播放 */}
              <div className="space-y-2">
                <p className="text-xs text-slate-600">粘贴 B站链接或 BV 号 / YouTube 链接</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVideoType('bilibili')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${videoType === 'bilibili' ? 'bg-rose-500 text-white' : 'bg-white border border-stone-200 text-slate-600'}`}
                  >
                    B站
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoType('youtube')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${videoType === 'youtube' ? 'bg-red-600 text-white' : 'bg-white border border-stone-200 text-slate-600'}`}
                  >
                    YouTube
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={videoType === 'bilibili' ? '粘贴 B站链接或 BV 号' : '粘贴 YouTube 链接或视频 ID'}
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  onPaste={(e) => {
                    const raw = (e.clipboardData?.getData('text') || '').trim();
                    if (videoType === 'bilibili' && parseBilibiliId(raw)) setVideoId(parseBilibiliId(raw)!);
                    else if (videoType === 'youtube' && parseYoutubeId(raw)) setVideoId(parseYoutubeId(raw)!);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePasteAndPlay}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-stone-200 text-slate-600 text-xs font-medium hover:bg-stone-100 transition-colors"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    从剪贴板粘贴并播放
                  </button>
                  <button
                    type="button"
                    onClick={handlePlayVideo}
                    disabled={!videoId.trim()}
                    className="flex-1 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Youtube className="w-4 h-4" />
                    在本页播放
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 休息倒计时 */}
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 space-y-3">
            <p className="font-semibold text-slate-800 flex items-center gap-2">
              <Timer className="w-4 h-4 text-emerald-600" />
              休息一下
            </p>
            {countdownSec === null ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">休息</span>
                  <select
                    value={restMinutes}
                    onChange={(e) => setRestMinutes(Number(e.target.value))}
                    className="rounded-lg border border-stone-200 px-2 py-1 text-sm"
                  >
                    {[3, 5, 10, 15].map((m) => (
                      <option key={m} value={m}>{m} 分钟</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={startRest}
                  className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                >
                  开始休息
                </button>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-2xl font-mono font-bold text-emerald-700">
                  {Math.floor(countdownSec / 60)}:{(countdownSec % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-xs text-slate-500 mt-1">到点提醒你回去学</p>
                <button
                  type="button"
                  onClick={() => setCountdownSec(null)}
                  className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
