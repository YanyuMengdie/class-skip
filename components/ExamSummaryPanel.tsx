import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, FileText, RefreshCw } from 'lucide-react';
import { generateExamSummary } from '../services/geminiService';

interface ExamSummaryPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  /** 已缓存的速览内容（有则直接展示，不重新生成） */
  initialMarkdown?: string | null;
  /** 生成完成后回调，用于父组件保存 */
  onGenerated?: (markdown: string) => void;
}

export const ExamSummaryPanel: React.FC<ExamSummaryPanelProps> = ({
  onClose,
  pdfContent,
  initialMarkdown,
  onGenerated
}) => {
  const [markdown, setMarkdown] = useState<string | null>(initialMarkdown ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfContent?.trim()) {
      setMarkdown(null);
      setError('暂无内容');
      return;
    }
    if (initialMarkdown != null && initialMarkdown !== '') {
      setMarkdown(initialMarkdown);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    generateExamSummary(pdfContent)
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
  }, [pdfContent, initialMarkdown]);

  const handleRegenerate = () => {
    setMarkdown(null);
    setLoading(true);
    setError(null);
    if (!pdfContent?.trim()) return;
    generateExamSummary(pdfContent)
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
            <FileText className="w-5 h-5 text-emerald-500" />
            考前速览
          </h2>
          <div className="flex items-center gap-2">
            {markdown && !loading && (
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                title="重新生成"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重新生成
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-indigo-500">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-bold">正在生成核心要点、易错点与高频考点...</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-16 text-rose-600 text-sm">{error}</div>
          )}
          {markdown && !loading && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              className="text-slate-700"
            >
              {markdown}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};
