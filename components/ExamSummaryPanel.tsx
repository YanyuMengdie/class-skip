import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Loader2, FileText } from 'lucide-react';
import { generateExamSummary } from '../services/geminiService';

interface ExamSummaryPanelProps {
  onClose: () => void;
  pdfContent: string | null;
}

export const ExamSummaryPanel: React.FC<ExamSummaryPanelProps> = ({ onClose, pdfContent }) => {
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
    generateExamSummary(pdfContent)
      .then((text) => {
        setMarkdown(text);
      })
      .catch(() => {
        setError('生成失败，请重试');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [pdfContent]);

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            考前速览
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
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
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="text-slate-700">
              {markdown}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};
