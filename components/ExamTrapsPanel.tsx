import React, { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { generateExamTraps } from '../services/geminiService';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-rose-200 first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-lg font-bold text-rose-800 mt-8 mb-3 first:mt-0 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100" {...props} />
  ),
  h3: ({ node, ...props }) => <h3 className="text-base font-bold text-slate-700 mt-4 mb-2" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-7 text-slate-700" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-rose-900 bg-rose-50/80 px-1 rounded" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-4 border-rose-300 pl-4 py-2 my-4 bg-amber-50/60 text-slate-600 rounded-r-lg text-sm leading-6" {...props} />
  ),
  code: ({ node, ...props }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
};

interface ExamTrapsPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  onGenerated?: (markdown: string) => void;
}

export const ExamTrapsPanel: React.FC<ExamTrapsPanelProps> = ({ onClose, pdfContent, onGenerated }) => {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfContent?.trim()) {
      setMarkdown(null);
      setError('暂无内容');
      return;
    }
    setLoading(true);
    setError(null);
    generateExamTraps(pdfContent)
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
  }, [pdfContent, onGenerated]);

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            考点与陷阱
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-rose-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-bold">正在生成考点与陷阱...</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-16 text-rose-600 text-sm">{error}</div>
          )}
          {markdown && !loading && (
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
          )}
        </div>
      </div>
    </div>
  );
};
