import React, { useState } from 'react';
import { Music, Play, Pause, Volume2, X } from 'lucide-react';

interface MusicPlayerProps {
  isPlaying: boolean;
  currentTrack: string | null;
  volume: number;
  onPlayPause: () => void;
  onTrackChange: (url: string, name: string) => void;
  onVolumeChange: (val: number) => void;
  onVideoSelect?: (type: 'bilibili' | 'youtube', id: string) => void;
  /** 受控：外部可打开/关闭白噪音面板（如小憩区「打开白噪音」） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// 使用 Google Actions Sound Library 官方直链，与雨声/咖啡馆同源
const PRESETS = [
  { name: '雨声 (Rain)', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' },
  { name: '咖啡馆 (Cafe)', url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg' },
  { name: '轻雨 (Light Rain)', url: 'https://actions.google.com/sounds/v1/weather/light_rain.ogg' },
  { name: '炉火 (Fire)', url: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg' },
  { name: '夏夜虫鸣 (Crickets)', url: 'https://actions.google.com/sounds/v1/ambiences/crickets_with_distant_traffic.ogg' },
  { name: '微风 (Breeze)', url: 'https://actions.google.com/sounds/v1/weather/light_breeze.ogg' },
  { name: '室内雨声 (Rain Interior)', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_quiet_interior.ogg' },
  { name: '夏日森林 (Summer Forest)', url: 'https://actions.google.com/sounds/v1/ambiences/summer_forest.ogg' },
];

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  isPlaying,
  currentTrack,
  volume,
  onPlayPause,
  onTrackChange,
  onVolumeChange,
  onVideoSelect,
  open: controlledOpen,
  onOpenChange
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled && onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [trackName, setTrackName] = useState<string>('选择背景音');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!isOpen)}
        className={`p-2 rounded-lg flex items-center space-x-2 transition-colors ${
          isPlaying ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-600'
        }`}
        title="背景音乐"
      >
        <Music className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium hidden md:inline">{isPlaying ? trackName : '背景音'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center">
              <Volume2 className="w-4 h-4 mr-2" />
              白噪音播放器
            </h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  onTrackChange(preset.url, preset.name);
                  setTrackName(preset.name);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex justify-between items-center transition-colors ${
                  trackName === preset.name && isPlaying
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span>{preset.name}</span>
                {trackName === preset.name && isPlaying && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3 pt-2 border-t border-gray-100">
             <button 
              onClick={onPlayPause}
              className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition-transform active:scale-95"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};