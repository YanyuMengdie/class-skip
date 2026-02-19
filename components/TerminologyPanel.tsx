import React, { useState, useEffect } from 'react';
import { X, Loader2, BookMarked, ChevronDown, ChevronUp } from 'lucide-react';
import { extractTerminology, TerminologyItem } from '../services/geminiService';

interface TerminologyPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  onGenerateFlashCards?: (terms: TerminologyItem[]) => void;
}

export const TerminologyPanel: React.FC<TerminologyPanelProps> = ({
  onClose,
  pdfContent,
  onGenerateFlashCards
}) => {
  const [items, setItems] = useState<TerminologyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfContent?.trim()) {
      setItems([]);
      setError('暂无内容');
      return;
    }
    setLoading(true);
    setError(null);
    extractTerminology(pdfContent)
      .then((list) => {
        setItems(list);
      })
      .catch(() => {
        setError('生成失败，请重试');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [pdfContent]);

  const toggle = (term: string) => {
    setExpandedId((id) => (id === term ? null : term));
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-cyan-500" />
            术语精确定义
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-cyan-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-bold">正在抽取术语...</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-16 text-rose-600 text-sm">{error}</div>
          )}
          {items.length > 0 && !loading && (
            <div className="space-y-3">
              {items.map((item, idx) => {
                const isOpen = expandedId === item.term;
                return (
                  <div
                    key={`${item.term}-${idx}`}
                    className="border border-stone-200 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggle(item.term)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-stone-50 transition-colors"
                    >
                      <span className="font-bold text-slate-800">{item.term}</span>
                      {isOpen ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-0 text-slate-600 text-sm border-t border-stone-100">
                        <p className="mb-2">{item.definition}</p>
                        {item.keyWords && item.keyWords.length > 0 && (
                          <p className="text-cyan-600 text-xs">关键词：{item.keyWords.join('、')}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {onGenerateFlashCards && items.length > 0 && (
                <button
                  onClick={() => { onGenerateFlashCards(items); onClose(); }}
                  className="w-full mt-4 py-3 rounded-xl bg-cyan-100 text-cyan-800 font-bold text-sm hover:bg-cyan-200 transition-colors"
                >
                  生成术语闪卡
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
