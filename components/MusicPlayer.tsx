import React, { useState } from 'react';
import { Music, Play, Pause, Volume2, X, HelpCircle } from 'lucide-react';

interface MusicPlayerProps {
  isPlaying: boolean;
  currentTrack: string | null;
  volume: number;
  onPlayPause: () => void;
  onTrackChange: (url: string, name: string) => void;
  onVolumeChange: (val: number) => void;
  onVideoSelect?: (type: 'bilibili' | 'youtube', id: string) => void;
}

// 使用 Google Actions Sound Library 和 Wikimedia Commons 的稳定资源
const PRESETS = [
  { name: '雨声 (Rain)', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' },
  { name: '森林 (Forest)', url: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' },
  { name: '咖啡馆 (Cafe)', url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg' },
  { name: '舒缓钢琴 (Piano)', url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c4/Gymnopedie_No_1.ogg/Gymnopedie_No_1.ogg.mp3' }
];

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  isPlaying,
  currentTrack,
  volume,
  onPlayPause,
  onTrackChange,
  onVolumeChange,
  onVideoSelect
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [trackName, setTrackName] = useState<string>('选择背景音');

  const handleCustomPlay = () => {
    if (customUrl) {
      onTrackChange(customUrl, '自定义音乐');
      setTrackName('自定义音乐');
      setCustomUrl('');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
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
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
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

          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">自定义音频链接 (MP3/OGG)</label>
            <div className="flex space-x-2">
              <input 
                type="text" 
                placeholder="输入音频 URL..." 
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
              />
              <button 
                onClick={handleCustomPlay}
                className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-800"
              >
                播放
              </button>
            </div>
            <div className="flex items-start mt-2 text-[10px] text-gray-400 bg-gray-50 p-2 rounded">
                <HelpCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                <span>
                    注意：并非所有 URL 都能播放。如果链接有跨域限制 (CORS) 或防盗链，将无法播放。建议使用直链。
                </span>
            </div>
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