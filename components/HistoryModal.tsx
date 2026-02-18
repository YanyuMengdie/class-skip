
import React from 'react';
import { X, Clock, FileText, Trash2, ExternalLink } from 'lucide-react';
import { FileHistoryItem } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: FileHistoryItem[];
  onSelect: (item: FileHistoryItem) => void;
  onDelete: (hash: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onDelete
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">学习历史</h2>
              <p className="text-xs text-slate-400 font-medium">查看并恢复之前的阅读进度</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-stone-200 rounded-full text-stone-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-300">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold">暂无历史记录</p>
              <p className="text-sm">上传第一个课件开始学习吧</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.hash}
                className="group flex items-center justify-between p-4 rounded-2xl border border-stone-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all"
              >
                <div 
                  className="flex items-center space-x-4 cursor-pointer flex-1"
                  onClick={() => onSelect(item)}
                >
                  <div className="bg-white p-2.5 rounded-xl shadow-sm border border-stone-50 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-700 truncate max-w-[300px]">{item.name}</h3>
                    <p className="text-[10px] text-stone-400 flex items-center mt-0.5">
                      <Clock className="w-3 h-3 mr-1" />
                      最后学习于: {new Date(item.lastOpened).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => onSelect(item)}
                    className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                    title="重新加载"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onDelete(item.hash)}
                    className="p-2 text-rose-400 hover:bg-rose-100 rounded-lg transition-colors"
                    title="删除记录"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 text-center border-t border-stone-100">
          <p className="text-[10px] text-stone-400 font-medium">数据仅保存在您的本地浏览器中，清理浏览器缓存可能会导致记录丢失。</p>
        </div>
      </div>
    </div>
  );
};
