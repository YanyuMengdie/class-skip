import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { TrapItem } from '../types';

interface TrapListPanelProps {
  onClose: () => void;
  items: TrapItem[];
  onRemove: (id: string) => void;
}

export const TrapListPanel: React.FC<TrapListPanelProps> = ({ onClose, items, onRemove }) => {
  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            我的陷阱清单
            {items.length > 0 && <span className="text-slate-400 font-normal text-sm">({items.length})</span>}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无记录。在测验中答错题目时可点击「记入陷阱清单」添加到这里。</p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="border border-amber-100 rounded-xl p-4 bg-amber-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800 flex-1">{item.question}</p>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-100 text-stone-400 hover:text-rose-600 shrink-0"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="mt-2 text-sm text-slate-600 list-disc list-inside">
                    {item.options.map((opt, j) => (
                      <li
                        key={j}
                        className={
                          j === item.correctIndex
                            ? 'text-emerald-600 font-medium'
                            : j === item.userSelectedIndex
                            ? 'text-rose-600'
                            : ''
                        }
                      >
                        {opt}
                        {j === item.correctIndex ? ' ✓' : j === item.userSelectedIndex ? ' (你选的)' : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500 border-t border-amber-100 pt-2">解析：{item.explanation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
