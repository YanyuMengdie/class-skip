import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, ChevronLeft, ChevronRight, FileText, Clock, Play, Pause, Maximize, Minimize, LayoutTemplate, AlignLeft, AlignRight, Columns, Rocket, Layers, Gamepad2, Cloud, CloudOff, LogOut, User as UserIcon, Menu, Coffee, Star, Sun, Mic, BookOpen, Swords, X, Timer, MoreHorizontal, LayoutDashboard } from 'lucide-react';
import { MusicPlayer } from '@/components/MusicPlayer';
import { ViewMode } from '@/types';
import { User } from 'firebase/auth'; 

interface HeaderProps {
  fileName: string | null;
  currentPage: number;
  totalPages: number;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
  onPrev: () => void;
  isProcessing: boolean;
  
  // Timer props
  studyTime: number;
  isTimerRunning: boolean;
  onToggleTimer: () => void;

  // Progress props
  progressPercentage: number;

  // Audio props
  isPlayingAudio: boolean;
  currentTrackName: string | null;
  volume: number;
  onAudioPlayPause: () => void;
  onAudioTrackChange: (url: string, name: string) => void;
  onAudioVolumeChange: (val: number) => void;
  
  // Video props
  onVideoSelect?: (type: 'bilibili' | 'youtube', id: string) => void;

  // Immersive Mode
  isImmersive: boolean;
  onToggleImmersive: () => void;
  onLayoutPreset?: (ratio: number) => void;

  // Skim Mode
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  hasStudyMap: boolean;

  // History
  onOpenHistory: () => void;

  // Galgame Mode
  onEnterGalgameMode: () => void;
  
  // Firebase Auth
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isSyncing: boolean;
  
  // Sidebar
  onToggleSidebar: () => void;

  // Energy Mode
  onEnterEnergyMode: () => void;

  // Page Mark
  onOpenMarkPanel?: () => void;
  hasMarkOnCurrentPage?: boolean;

  /** 白噪音面板受控 */
  musicPanelOpen?: boolean;
  onMusicPanelOpenChange?: (open: boolean) => void;

  // 上课录音文本（有记录时显示入口）
  hasLectureHistory?: boolean;
  onOpenLectureTranscript?: () => void;

  // 上课模式（录音+转写）
  isClassroomMode?: boolean;
  onStartClass?: () => void;
  isTranscriptionSupported?: boolean;

  // 独立复习入口（选 1 个或多个 PDF 进行复习）
  onOpenReview?: () => void;

  /** P0：备考工作台（全屏一级工作区）；考试中心请从备考工作台内「考试中心」进入 */
  onOpenExamWorkspace?: () => void;

  /** 只学 5 分钟（学习兴致低时的快捷入口） */
  onOpenFiveMin?: () => void;

  // 海龟汤
  onOpenTurtleSoup?: () => void;

  // 番茄钟（与「我学完一段」打通）
  pomodoroSegmentSeconds?: number;
  pomodoroBreakSeconds?: number;
  onPomodoroSegmentChange?: (seconds: number) => void;
  onPomodoroBreakChange?: (seconds: number) => void;
  pomodoroPhase?: 'idle' | 'study' | 'break';
  pomodoroRemainingSeconds?: number;
  completedSegmentsCount?: number;
  onPomodoroStart?: () => void;
  onPomodoroStop?: () => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Header: React.FC<HeaderProps> = ({
  fileName,
  currentPage,
  totalPages,
  onUpload,
  onNext,
  onPrev,
  isProcessing,
  studyTime,
  isTimerRunning,
  onToggleTimer,
  progressPercentage,
  isPlayingAudio,
  currentTrackName,
  volume,
  onAudioPlayPause,
  onAudioTrackChange,
  onAudioVolumeChange,
  onVideoSelect,
  isImmersive,
  onToggleImmersive,
  onLayoutPreset,
  viewMode,
  onToggleViewMode,
  hasStudyMap,
  onOpenHistory,
  onEnterGalgameMode,
  user,
  onLogin,
  onLogout,
  isSyncing,
  onToggleSidebar,
  onEnterEnergyMode,
  onOpenMarkPanel,
  hasMarkOnCurrentPage,
  musicPanelOpen,
  onMusicPanelOpenChange,
  hasLectureHistory,
  onOpenLectureTranscript,
  isClassroomMode,
  onStartClass,
  isTranscriptionSupported,
  onOpenReview,
  onOpenExamWorkspace,
  onOpenFiveMin,
  onOpenTurtleSoup,
  pomodoroSegmentSeconds = 25 * 60,
  pomodoroBreakSeconds = 5 * 60,
  onPomodoroSegmentChange,
  onPomodoroBreakChange,
  pomodoroPhase = 'idle',
  pomodoroRemainingSeconds = 25 * 60,
  completedSegmentsCount = 0,
  onPomodoroStart,
  onPomodoroStop
}) => {
  const [timerPopoverOpen, setTimerPopoverOpen] = useState(false);
  const timerPopoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!timerPopoverOpen) return;
    const close = (e: MouseEvent) => {
      if (timerPopoverRef.current && !timerPopoverRef.current.contains(e.target as Node)) setTimerPopoverOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [timerPopoverOpen]);

  const [restPopoverOpen, setRestPopoverOpen] = useState(false);
  const restPopoverRef = useRef<HTMLDivElement>(null);
  const [restMinutes, setRestMinutes] = useState(5);
  const [restCountdownSec, setRestCountdownSec] = useState<number | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [restSubmenuOpen, setRestSubmenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!restPopoverOpen) return;
    const close = (e: MouseEvent) => {
      if (restPopoverRef.current && !restPopoverRef.current.contains(e.target as Node)) setRestPopoverOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', close); };
  }, [restPopoverOpen]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
        setRestSubmenuOpen(false);
      }
    };
    if (moreMenuOpen) document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreMenuOpen]);
  useEffect(() => {
    if (restCountdownSec === null || restCountdownSec > 0) return;
    const t = window.setTimeout(() => {
      setRestCountdownSec(null);
      alert('该回去学啦～');
    }, 100);
    return () => clearTimeout(t);
  }, [restCountdownSec]);
  useEffect(() => {
    if (restCountdownSec === null || restCountdownSec <= 0) return;
    const interval = setInterval(() => setRestCountdownSec((s) => s! - 1), 1000);
    return () => clearInterval(interval);
  }, [restCountdownSec]);

  const isPomodoroActive = pomodoroPhase === 'study' || pomodoroPhase === 'break';
  const displayTime = isPomodoroActive ? (pomodoroRemainingSeconds ?? 0) : studyTime;
  return (
    <header className={`${isImmersive ? 'bg-white border-b border-stone-200' : 'bg-white/80 backdrop-blur-md border-b border-stone-100'} shadow-sm z-30 relative flex flex-col transition-all`}>
      {/* Top Bar */}
      <div className="h-16 flex items-center justify-between px-6">
        <div className="flex items-center space-x-3 min-w-[200px]">
          
          {/* Menu Toggle */}
          <button 
             onClick={onToggleSidebar}
             className="p-2 mr-1 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-800 transition-colors"
          >
             <Menu className="w-5 h-5" />
          </button>

          <div className="bg-gradient-to-br from-violet-400 to-fuchsia-400 p-2 rounded-xl shadow-md shadow-violet-200 transform hover:scale-105 transition-transform">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              逃课神器
            </h1>
            {fileName && <p className="text-[10px] text-slate-400 max-w-[150px] truncate font-medium">{fileName}</p>}
          </div>
        </div>

        {/* Center: Navigation */}
        <div className="flex items-center space-x-4">
             <div className="flex items-center bg-white shadow-sm shadow-stone-200 rounded-full p-1 border border-stone-100">
                <button
                    onClick={onPrev}
                    disabled={currentPage <= 1}
                    className="p-1.5 rounded-full hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                    aria-label="上一页"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="mx-4 text-sm font-bold text-slate-600 font-mono w-16 text-center">
                    {totalPages > 0 ? `${currentPage} / ${totalPages}` : "0 / 0"}
                </span>
                <button
                    onClick={onNext}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-full hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 disabled:hover:bg-transparent transition-all active:scale-95"
                    aria-label="下一页"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
             </div>

             {/* Mode Toggle Button */}
             {hasStudyMap && (
                 <button 
                    onClick={onToggleViewMode}
                    className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                        viewMode === 'skim' 
                        ? 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700' 
                        : 'bg-white text-slate-600 border border-stone-200 hover:bg-stone-50'
                    }`}
                 >
                    {viewMode === 'skim' ? <Layers className="w-3.5 h-3.5" /> : <Rocket className="w-3.5 h-3.5" />}
                    <span>{viewMode === 'skim' ? '返回精读' : '进入略读'}</span>
                 </button>
             )}

             {/* Immersive Layout Controls */}
             {isImmersive && onLayoutPreset && viewMode === 'deep' && (
                 <div className="flex items-center bg-stone-100 rounded-lg p-1 space-x-1">
                     <button onClick={() => onLayoutPreset(70)} className="p-1.5 hover:bg-white rounded text-stone-500 hover:text-stone-800 transition-all" title="左侧优先">
                         <AlignLeft className="w-4 h-4" />
                     </button>
                     <button onClick={() => onLayoutPreset(50)} className="p-1.5 hover:bg-white rounded text-stone-500 hover:text-stone-800 transition-all" title="均分">
                         <Columns className="w-4 h-4" />
                     </button>
                     <button onClick={() => onLayoutPreset(30)} className="p-1.5 hover:bg-white rounded text-stone-500 hover:text-stone-800 transition-all" title="右侧优先">
                         <AlignRight className="w-4 h-4" />
                     </button>
                 </div>
             )}
        </div>

        {/* Right: 与 3001 一致 = 学习工具、更多、上传、背景音（+ 账户）*/}
        <div className="flex items-center gap-x-2 min-w-[200px] justify-end">
          {/* 学习工具 */}
          {onOpenReview && (
            <button onClick={onOpenReview} className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-500 text-white hover:bg-indigo-600 rounded-xl text-xs font-bold shadow-sm" title="选择文档进行测验、闪卡、考前速览等" aria-label="学习工具">
              <BookOpen className="w-3.5 h-3.5" />
              <span>学习工具</span>
            </button>
          )}
          {onOpenExamWorkspace && (
            <button
              onClick={onOpenExamWorkspace}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-600 text-white hover:bg-teal-700 rounded-xl text-xs font-bold shadow-sm"
              title="备考工作台：选择当前考试、查看材料、进入考前预测"
              aria-label="考试复习"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">考试复习</span>
            </button>
          )}
          {/* 更多：上课、学累了/休息、重点标记、沉浸、上课录音文本、计时、背景音入口等 */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => { setMoreMenuOpen((o) => !o); setRestSubmenuOpen(false); }}
              className="flex items-center p-2 rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
              title="更多功能"
              aria-label="更多"
              aria-expanded={moreMenuOpen}
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-[100]">
                {onStartClass && !isClassroomMode && (
                  <button type="button" onClick={() => { onStartClass(); setMoreMenuOpen(false); }} disabled={isTranscriptionSupported === false} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50 disabled:opacity-50">
                    <Mic className="w-4 h-4 text-slate-500" /> 上课
                  </button>
                )}
                {isClassroomMode && (
                  <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> 上课中
                  </div>
                )}
                <div className="relative">
                  <button type="button" onClick={() => setRestSubmenuOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                    <span className="flex items-center gap-2"><Coffee className="w-4 h-4 text-amber-500" /> 学累了 / 休息</span>
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${restSubmenuOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {restSubmenuOpen && (
                    <div className="bg-amber-50/80 border-t border-amber-100 py-1">
                      <button type="button" onClick={() => { setTimerPopoverOpen(true); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Clock className="w-3.5 h-3.5" /> 番茄钟
                      </button>
                      <button type="button" onClick={() => { onMusicPanelOpenChange?.(true); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Play className="w-3.5 h-3.5" /> 白噪音
                      </button>
                      <button type="button" onClick={() => { onEnterEnergyMode(); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Coffee className="w-3.5 h-3.5" /> 能量补给
                      </button>
                      {onOpenTurtleSoup && <button type="button" onClick={() => { onOpenTurtleSoup(); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Swords className="w-3.5 h-3.5" /> 海龟汤
                      </button>}
                      {fileName && onOpenFiveMin && <button type="button" onClick={() => { onOpenFiveMin(); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Timer className="w-3.5 h-3.5" /> 只学 5 分钟
                      </button>}
                      <button type="button" onClick={() => { setRestPopoverOpen(true); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="w-full flex items-center gap-2 px-4 pl-8 py-2 text-left text-xs font-medium text-slate-700 hover:bg-amber-100/80">
                        <Timer className="w-3.5 h-3.5" /> 休息一下
                      </button>
                    </div>
                  )}
                </div>
                {onOpenMarkPanel && totalPages > 0 && (
                  <button type="button" onClick={() => { onOpenMarkPanel(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                    <Star className={`w-4 h-4 ${hasMarkOnCurrentPage ? 'fill-amber-500 text-amber-500' : 'text-slate-500'}`} /> 重点标记
                  </button>
                )}
                <button type="button" onClick={() => { onToggleImmersive(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                  {isImmersive ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />} {isImmersive ? '退出沉浸' : '沉浸模式'}
                </button>
                {onOpenLectureTranscript && (
                  <button type="button" onClick={() => { onOpenLectureTranscript(); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                    <Mic className="w-4 h-4 text-slate-500" /> 上课录音文本{!hasLectureHistory && <span className="text-[10px] text-slate-400">(暂无)</span>}
                  </button>
                )}
                <div className="border-t border-stone-100 mt-1 pt-1">
                  <button type="button" onClick={() => { setTimerPopoverOpen(true); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="font-mono">{formatTime(displayTime)}</span>
                    {isPomodoroActive && <span className="text-[10px] text-amber-600">番茄</span>}
                  </button>
                  <button type="button" onClick={() => { onMusicPanelOpenChange?.(!musicPanelOpen); setMoreMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-stone-50">
                    背景音
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 上传 */}
          <div className="relative">
            <input type="file" id="file-upload" className="hidden" accept=".pdf,image/*" multiple={false} onChange={onUpload} />
            <label htmlFor="file-upload" className={`flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-700 transition-all text-xs font-bold ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}`} aria-label={isProcessing ? '处理中' : '上传'}>
              {isProcessing ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isProcessing ? '处理中...' : '上传'}</span>
            </label>
          </div>

          {/* 背景音 */}
          <MusicPlayer
            isPlaying={isPlayingAudio}
            currentTrack={currentTrackName}
            volume={volume}
            onPlayPause={onAudioPlayPause}
            onVideoSelect={onVideoSelect}
            onVolumeChange={onAudioVolumeChange}
            onTrackChange={onAudioTrackChange}
            open={musicPanelOpen}
            onOpenChange={onMusicPanelOpenChange}
          />

          {/* 账户 */}
          {user ? (
            <div className="relative group">
              <button className="flex items-center space-x-1 p-1.5 pr-3 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors" title="已登录" aria-label="账户">
                {user.photoURL ? <img src={user.photoURL} className="w-6 h-6 rounded-full border border-white" alt="" /> : <UserIcon className="w-5 h-5" />}
                <span className="text-[10px] font-bold hidden xl:inline">{isSyncing ? '同步中' : '已同步'}</span>
              </button>
              <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-xl border border-stone-100 p-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50">
                <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg">
                  <LogOut className="w-3.5 h-3.5" /> 退出登录
                </button>
              </div>
            </div>
          ) : (
            <button onClick={onLogin} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="登录开启云同步" aria-label="登录">
              <CloudOff className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 计时器弹层（Portal 到 body，避免被裁切或误关） */}
      {timerPopoverOpen && createPortal(
        <div ref={timerPopoverRef} className="fixed w-72 bg-white rounded-xl shadow-xl border border-stone-200 p-3 z-[200]" style={{ top: '4.5rem', right: '1rem' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-600">计时</span>
              <button type="button" onClick={() => setTimerPopoverOpen(false)} className="p-1 hover:bg-stone-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            {!isPomodoroActive ? (
              <>
                <p className="text-xs text-stone-500 mb-2">普通计时：累计学习时长。</p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{formatTime(studyTime)}</span>
                  <button type="button" onClick={() => { onToggleTimer(); setTimerPopoverOpen(false); }} className="px-2 py-1 bg-stone-100 rounded text-xs font-bold">{isTimerRunning ? '暂停' : '开始'}</button>
                </div>
                <div className="border-t border-stone-100 mt-3 pt-3">
                  <p className="text-xs font-bold text-amber-700 mb-2">番茄钟（学完一段可玩海龟汤）</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label>一段（分钟）<input type="number" min={1} max={90} value={Math.round(pomodoroSegmentSeconds / 60)} onChange={(e) => onPomodoroSegmentChange?.(Math.max(1, Number(e.target.value) || 25) * 60)} className="w-full mt-0.5 px-2 py-1 border border-stone-200 rounded" /></label>
                    <label>休息（分钟）<input type="number" min={0} max={30} value={Math.round(pomodoroBreakSeconds / 60)} onChange={(e) => onPomodoroBreakChange?.(Math.max(0, Number(e.target.value) || 5) * 60)} className="w-full mt-0.5 px-2 py-1 border border-stone-200 rounded" /></label>
                  </div>
                  <button type="button" onClick={() => { onPomodoroStart?.(); setTimerPopoverOpen(false); }} className="mt-2 w-full py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600">开始番茄钟</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-stone-500 mb-1">{pomodoroPhase === 'study' ? '本段剩余' : '休息剩余'}</p>
                <p className="font-mono text-lg font-bold text-slate-700">{formatTime(pomodoroRemainingSeconds)}</p>
                <p className="text-xs text-amber-600 mt-1">已完成 {completedSegmentsCount} 段 · 海龟汤可用 {completedSegmentsCount} 次</p>
                <button type="button" onClick={() => { onPomodoroStop?.(); setTimerPopoverOpen(false); }} className="mt-2 w-full py-2 bg-stone-200 text-stone-700 rounded-lg text-xs font-bold hover:bg-stone-300">结束番茄钟</button>
              </>
            )}
        </div>,
        document.body
      )}

      {/* 休息一下弹层（Portal 到 body） */}
      {restPopoverOpen && createPortal(
        <div ref={restPopoverRef} className="fixed w-72 bg-white rounded-xl shadow-xl border border-stone-200 p-3 z-[200]" style={{ top: '4.5rem', right: '1rem' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-600">休息</span>
              <button type="button" onClick={() => setRestPopoverOpen(false)} className="p-1 hover:bg-stone-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-3">
              <p className="font-semibold text-slate-800 flex items-center gap-2 text-sm"><Timer className="w-4 h-4 text-emerald-600" />休息一下</p>
              {restCountdownSec === null ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">休息</span>
                    <select value={restMinutes} onChange={(e) => setRestMinutes(Number(e.target.value))} className="rounded-lg border border-stone-200 px-2 py-1 text-sm">
                      {[3, 5, 10, 15].map((m) => (<option key={m} value={m}>{m} 分钟</option>))}
                    </select>
                  </div>
                  <button type="button" onClick={() => setRestCountdownSec(restMinutes * 60)} className="w-full py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">开始休息</button>
                </>
              ) : (
                <div className="text-center py-2">
                  <p className="text-2xl font-mono font-bold text-emerald-700">{Math.floor(restCountdownSec / 60)}:{(restCountdownSec % 60).toString().padStart(2, '0')}</p>
                  <p className="text-xs text-slate-500 mt-1">到点提醒你回去学</p>
                  <button type="button" onClick={() => setRestCountdownSec(null)} className="mt-2 text-xs text-slate-500 hover:text-slate-700">取消</button>
                </div>
              )}
            </div>
        </div>,
        document.body
      )}

      {!isImmersive && (
        <div className="h-1 w-full bg-stone-100 relative group overflow-hidden">
            <div 
            className="h-full bg-gradient-to-r from-violet-300 via-fuchsia-300 to-rose-300 transition-all duration-700 ease-out relative rounded-r-full"
            style={{ width: `${progressPercentage}%` }}
            >
                <div className="absolute top-0 left-0 w-full h-full bg-white/30 animate-[shimmer_2s_infinite]"></div>
            </div>
        </div>
      )}
    </header>
  );
};