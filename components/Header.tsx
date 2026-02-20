import React from 'react';
import { Upload, ChevronLeft, ChevronRight, FileText, Clock, Play, Pause, Maximize, Minimize, LayoutTemplate, AlignLeft, AlignRight, Columns, Rocket, Layers, Gamepad2, Cloud, CloudOff, LogOut, User as UserIcon, Menu, Coffee, Star, Sun, Mic, BookOpen, Swords } from 'lucide-react';
import { MusicPlayer } from './MusicPlayer';
import { ViewMode } from '../types';
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

  // 小憩区
  onToggleBreakPanel?: () => void;
  /** 白噪音面板受控打开（小憩区「打开白噪音」时设为 true） */
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

  // 地牢学习游戏入口
  onOpenDungeon?: () => void;
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
  onToggleBreakPanel,
  musicPanelOpen,
  onMusicPanelOpenChange,
  hasLectureHistory,
  onOpenLectureTranscript,
  isClassroomMode,
  onStartClass,
  isTranscriptionSupported,
  onOpenReview,
  onOpenDungeon
}) => {
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
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">逃课神器</h1>
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
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
             </div>

             {/* 重点标记按钮 */}
             {onOpenMarkPanel && totalPages > 0 && (
                <button
                    onClick={onOpenMarkPanel}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                        hasMarkOnCurrentPage
                            ? 'bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600'
                            : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                    }`}
                    title="标记重点"
                >
                    <Star className={`w-3.5 h-3.5 ${hasMarkOnCurrentPage ? 'fill-current' : ''}`} />
                    <span>重点</span>
                </button>
             )}
             
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

        {/* Right: Tools */}
        <div className="flex items-center space-x-3 min-w-[200px] justify-end">
          
           {/* 上课：仅未在上课时显示，点击开始录音+转写 */}
           {onStartClass && !isClassroomMode && (
              <button
                onClick={onStartClass}
                className="flex items-center space-x-1 px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl transition-colors text-xs font-bold shadow-sm border border-rose-200 disabled:opacity-50"
                title={isTranscriptionSupported === false ? '当前浏览器不支持语音识别，建议使用 Chrome' : '开始上课（录音+实时转写）'}
                disabled={isTranscriptionSupported === false}
              >
                <Mic className="w-3.5 h-3.5" />
                <span className="hidden md:inline">上课</span>
              </button>
           )}
           {isClassroomMode && (
              <span className="flex items-center space-x-1 px-3 py-1.5 bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="hidden md:inline">上课中</span>
              </span>
           )}

           {/* 上课录音文本 */}
           {hasLectureHistory && onOpenLectureTranscript && (
              <button
                onClick={onOpenLectureTranscript}
                className="flex items-center space-x-1 px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors text-xs font-bold shadow-sm border border-rose-100"
                title="查看上课转写与整理"
              >
                <Mic className="w-3.5 h-3.5" />
                <span className="hidden md:inline">上课录音文本</span>
              </button>
           )}

           {/* 标记重点 */}
           {onOpenMarkPanel && totalPages > 0 && (
             <button
               onClick={onOpenMarkPanel}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                 hasMarkOnCurrentPage
                   ? 'bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600'
                   : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
               }`}
               title="标记重点"
             >
               <Star className={`w-3.5 h-3.5 ${hasMarkOnCurrentPage ? 'fill-current' : ''}`} />
               <span className="hidden md:inline">重点</span>
             </button>
           )}

           {/* 小憩一下 */}
           {onToggleBreakPanel && (
              <button
                onClick={onToggleBreakPanel}
                className="flex items-center space-x-1 px-3 py-1.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-xl transition-colors text-xs font-bold shadow-sm border border-sky-100"
                title="分心也在这一页"
              >
                <Sun className="w-3.5 h-3.5" />
                <span className="hidden md:inline">小憩一下</span>
              </button>
           )}

           {/* 复习：独立页面，可选 1 个或多个 PDF（与学不动了并列显眼） */}
          {onOpenReview && (
              <button
                onClick={onOpenReview}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-500 text-white hover:bg-indigo-600 rounded-xl transition-colors text-xs font-bold shadow-sm border border-indigo-400"
                title="选择文档进行测验、闪卡、考前速览等"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>复习</span>
              </button>
            )}

          {onOpenDungeon && (
              <button
                onClick={onOpenDungeon}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition-colors text-xs font-bold shadow-sm border border-purple-500"
                title="探索地牢：学习获得 D20 骰子，探索房间获得奖励"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>探索地牢</span>
              </button>
            )}

           {/* Energy Mode Button */}
           <button
              onClick={onEnterEnergyMode}
              className="flex items-center space-x-1 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl transition-colors text-xs font-bold shadow-sm"
              title="进入休息模式"
           >
              <Coffee className="w-3.5 h-3.5" />
              <span className="hidden md:inline">学不动了</span>
           </button>

           {/* Galgame Mode Trigger - TEMPORARILY HIDDEN */}
           {false && fileName && (
              <button 
                onClick={onEnterGalgameMode}
                className="p-2 text-pink-400 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-all"
                title="进入沉浸式伴读模式"
              >
                <Gamepad2 className="w-5 h-5" />
              </button>
           )}

          {/* Cloud Sync Button */}
          {user ? (
             <div className="relative group">
                <button
                    className="flex items-center space-x-1 p-1.5 pr-3 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors"
                    title="已登录 - 数据自动同步中"
                >
                    {user.photoURL ? (
                        <img src={user.photoURL} className="w-6 h-6 rounded-full border border-white" alt="User" />
                    ) : (
                        <UserIcon className="w-5 h-5" />
                    )}
                    <span className="text-[10px] font-bold hidden xl:inline">{isSyncing ? '同步中...' : '已同步'}</span>
                </button>
                {/* Hover Logout Menu */}
                <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-xl border border-stone-100 p-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all z-50">
                    <button 
                        onClick={onLogout}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>退出登录</span>
                    </button>
                </div>
             </div>
          ) : (
             <button
                onClick={onLogin}
                className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                title="登录开启云同步"
             >
                <CloudOff className="w-5 h-5" />
             </button>
          )}

          {/* Immersive Toggle */}
          <button
            onClick={onToggleImmersive}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isImmersive 
                ? 'bg-slate-800 text-white shadow-md shadow-slate-200 hover:bg-slate-900' 
                : 'bg-stone-50 text-slate-500 hover:bg-stone-100'
            }`}
            title={isImmersive ? "退出沉浸模式" : "进入沉浸模式"}
          >
            {isImmersive ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden lg:inline">{isImmersive ? '退出沉浸' : '沉浸模式'}</span>
          </button>

          <div className="w-px h-6 bg-stone-200 mx-1"></div>

          {/* Timer */}
          <div className="flex items-center bg-white shadow-sm px-3 py-1.5 rounded-xl border border-stone-100">
            <Clock className={`w-3.5 h-3.5 mr-2 ${isTimerRunning ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`} />
            <span className="font-mono text-xs font-bold text-slate-600 w-14 text-center">{formatTime(studyTime)}</span>
            <div className="w-px h-3 bg-stone-200 mx-2"></div>
            <button 
              onClick={onToggleTimer}
              className="text-slate-400 hover:text-rose-500 transition-colors"
            >
              {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Music Player */}
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

          {/* Upload Button */}
          <div className="relative">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".pdf,image/*"
              multiple={false}
              onChange={onUpload}
            />
            <label
              htmlFor="file-upload"
              className={`flex items-center space-x-2 bg-slate-800 text-white px-4 py-2 rounded-xl cursor-pointer hover:bg-slate-700 hover:-translate-y-0.5 transition-all shadow-lg shadow-slate-200 text-xs font-bold ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{isProcessing ? '处理中...' : '上传'}</span>
            </label>
          </div>
        </div>
      </div>

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