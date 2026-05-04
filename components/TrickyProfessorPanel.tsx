import React, { useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, GraduationCap } from 'lucide-react';
import { generateTrickyQuestions } from '@/services/geminiService';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-orange-100" {...props} />,
  h2: ({ node, ...props }) => (
    <h2 className="text-lg font-bold text-orange-800 mt-8 mb-3 first:mt-0 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-100" {...props} />
  ),
  h3: ({ node, ...props }) => <h3 className="text-base font-bold text-slate-700 mt-4 mb-2" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-7 text-slate-700" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-orange-900 bg-orange-50/80 px-1 rounded" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-4 border-orange-300 pl-4 py-2 my-4 bg-amber-50/60 text-slate-600 rounded-r-lg text-sm leading-6" {...props} />
  ),
  code: ({ node, ...props }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
};

interface TrickyProfessorPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  onGenerated?: (markdown: string) => void;
}

export const TrickyProfessorPanel: React.FC<TrickyProfessorPanelProps> = ({ onClose, pdfContent, onGenerated }) => {
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
        onGenerated?.(text);
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
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 min-h-0">
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
              <div className="prose prose-sm max-w-none prose-p:my-3 prose-headings:font-quicksand prose-li:my-1.5 prose-ul:my-3 prose-ol:my-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={MarkdownComponents}
                  className="text-slate-700"
                >
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
