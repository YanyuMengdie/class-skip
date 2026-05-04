import React from 'react';

interface MoodDialogProps {
  open: boolean;
  onSelectLowEnergy: () => void;
  onSelectHighEnergy: () => void;
}

export const MoodDialog: React.FC<MoodDialogProps> = ({
  open,
  onSelectLowEnergy,
  onSelectHighEnergy
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] bg-black/30 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-slate-800 mb-3 text-center">
          现在有学习兴致吗？
        </h3>
        <p className="text-sm text-slate-500 mb-5 text-center">
          不管今天状态如何，我们都可以先试一小会儿。
        </p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onSelectLowEnergy}
            className="w-full py-3 px-4 rounded-xl bg-stone-100 text-slate-800 font-bold text-sm hover:bg-stone-200 transition-colors"
          >
            我不想学 😭（先混个 5 分钟脸熟）
          </button>
          <button
            type="button"
            onClick={onSelectHighEnergy}
            className="w-full py-3 px-4 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition-colors"
          >
            我很有兴致！！！！💪
          </button>
        </div>
        <p className="mt-4 text-[11px] text-center text-slate-400">
          只需一次小小的开始，随时可以结束或再学一会儿。
        </p>
      </div>
    </div>
  );
};

