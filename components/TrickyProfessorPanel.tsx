import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Loader2, GraduationCap } from 'lucide-react';
import { generateTrickyQuestions } from '../services/geminiService';

interface TrickyProfessorPanelProps {
  onClose: () => void;
  pdfContent: string | null;
}

export const TrickyProfessorPanel: React.FC<TrickyProfessorPanelProps> = ({ onClose, pdfContent }) => {
  const [weakPoints, setWeakPoints] = useState('');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    if (!pdfContent?.trim()) {
      setError('暂无内容');
      return;
    }
    setError(null);
    setLoading(true);
    generateTrickyQuestions(pdfContent, weakPoints || undefined)
      .then((text) => {
        setMarkdown(text);
      })
      .catch(() => {
        setError('生成失败，请重试');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-orange-500" />
            刁钻教授
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {!markdown ? (
            <>
              <p className="text-slate-600 text-sm">可选：描述你的薄弱点或易错章节，教授会针对这些地方出刁钻题。</p>
              <textarea
                value={weakPoints}
                onChange={(e) => setWeakPoints(e.target.value)}
                placeholder="例如：二次型、矩阵相似、第 3 章概念容易混..."
                className="w-full min-h-[80px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y"
              />
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <button
                onClick={handleGenerate}
                disabled={!pdfContent || loading}
                className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GraduationCap className="w-5 h-5" />}
                {loading ? '正在出题...' : '生成刁钻题'}
              </button>
            </>
          ) : (
            <>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-slate-700">
                  {markdown}
                </ReactMarkdown>
              </div>
              <button
                onClick={() => { setMarkdown(null); setError(null); }}
                className="self-start py-2 px-4 rounded-xl bg-stone-100 text-slate-600 text-sm font-bold hover:bg-stone-200"
              >
                再出一套
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
