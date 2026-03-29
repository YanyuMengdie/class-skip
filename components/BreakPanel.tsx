import React, { useState, useEffect } from 'react';
import { X, Timer } from 'lucide-react';

interface BreakPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BreakPanel: React.FC<BreakPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [restMinutes, setRestMinutes] = useState(5);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);

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
        aria-label="休息"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-stone-100">
          <h2 className="text-lg font-bold text-slate-800">休息</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
