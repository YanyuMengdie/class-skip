import React, { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, FileText, RefreshCw, MessageSquare, Send } from 'lucide-react';
import { generateExamSummary, updateExamSummary } from '@/services/geminiService';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-emerald-200 first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-lg font-bold text-emerald-800 mt-8 mb-3 first:mt-0 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-base font-bold text-slate-700 mt-4 mb-2" {...props} />
  ),
  p: ({ node, ...props }) => <p className="mb-4 leading-7 text-slate-700" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-emerald-900 bg-emerald-50/80 px-1 rounded" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-4 border-emerald-300 pl-4 py-2 my-4 bg-emerald-50/60 text-slate-600 rounded-r-lg text-sm leading-6" {...props} />
  ),
  code: ({ node, ...props }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
};

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
  const [userRequest, setUserRequest] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

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
    setUserRequest('');
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

  const handleApplyUserRequest = () => {
    if (!userRequest.trim() || !markdown || !pdfContent?.trim()) return;
    setIsUpdating(true);
    setError(null);
    updateExamSummary(pdfContent, markdown, userRequest)
      .then((text) => {
        if (text.startsWith('修改失败')) {
          setError(text);
          return;
        }
        setMarkdown(text);
        onGenerated?.(text);
        setUserRequest('');
      })
      .catch(() => setError('修改失败，请重试'))
      .finally(() => setIsUpdating(false));
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
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-emerald-600">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-bold">正在生成核心要点、易错点与高频考点...</p>
            </div>
          )}
          {error && !loading && !isUpdating && (
            <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
          )}
          {markdown && !loading && (
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
              <div className="border-t border-stone-200 pt-4 mt-2 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-bold text-slate-700">根据你的想法修改这份速览</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">例如：加入某块不熟悉的知识、删减某部分、或强调某些考点。其他内容会尽量保留。</p>
                <textarea
                  value={userRequest}
                  onChange={(e) => setUserRequest(e.target.value)}
                  placeholder="例如：想加入「有效种群大小 Ne」的推导；易错点里少写一点；多强调遗传漂变和近交的区别..."
                  className="w-full min-h-[72px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                  disabled={isUpdating}
                />
                {error && isUpdating === false && userRequest.trim() && (
                  <p className="text-rose-600 text-xs mt-1">{error}</p>
                )}
                <button
                  onClick={handleApplyUserRequest}
                  disabled={!userRequest.trim() || isUpdating}
                  className="mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isUpdating ? '正在修改...' : '根据我的要求修改'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
