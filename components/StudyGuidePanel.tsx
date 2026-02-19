import React, { useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { X, FileText, Loader2, RefreshCw, Layers, List } from 'lucide-react';
import { StudyGuide, StudyGuideFormat, StudyGuideContent } from '../types';
import { generateStudyGuide } from '../services/geminiService';

interface StudyGuidePanelProps {
  onClose: () => void;
  pdfContent: string | null;
  fileName: string | null;
  existingGuide: StudyGuide | null;
  onSaveGuide: (guide: StudyGuide) => void;
}

const MarkdownComponents: Components = {
  h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-4 border-b border-slate-200 pb-2" {...props} />,
  h2: ({node, ...props}) => <h2 className="text-xl font-bold text-slate-800 mt-5 mb-3 border-b border-slate-100 pb-2" {...props} />,
  h3: ({node, ...props}) => <h3 className="text-lg font-bold text-indigo-700 mt-4 mb-2" {...props} />,
  h4: ({node, ...props}) => <h4 className="text-base font-bold text-slate-700 mt-3 mb-2" {...props} />,
  ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 space-y-2 my-3 text-slate-700" {...props} />,
  ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 space-y-2 my-3 text-slate-700" {...props} />,
  li: ({node, ...props}) => <li className="pl-2 leading-relaxed" {...props} />,
  p: ({node, ...props}) => <p className="mb-4 leading-7 text-slate-700" {...props} />,
  strong: ({node, ...props}) => <strong className="font-bold text-indigo-900" {...props} />,
  em: ({node, ...props}) => <em className="italic text-slate-600" {...props} />,
  code: ({node, ...props}) => <code className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-300 pl-4 py-2 my-4 bg-indigo-50 italic text-slate-600 rounded-r-lg" {...props} />,
  table: ({node, ...props}) => (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-stone-200 shadow-sm bg-white">
      <table className="w-full text-left text-sm text-stone-600" {...props} />
    </div>
  ),
  thead: ({node, ...props}) => (
    <thead className="bg-stone-100 text-stone-700 font-bold uppercase tracking-wider text-xs" {...props} />
  ),
  th: ({node, ...props}) => (
    <th className="px-4 py-3 border-b border-stone-200 whitespace-nowrap" {...props} />
  ),
  td: ({node, ...props}) => (
    <td className="px-4 py-3 border-b border-stone-100 last:border-0" {...props} />
  ),
  tr: ({node, ...props}) => (
    <tr className="hover:bg-stone-50/50 transition-colors" {...props} />
  ),
};

export const StudyGuidePanel: React.FC<StudyGuidePanelProps> = ({
  onClose,
  pdfContent,
  fileName,
  existingGuide,
  onSaveGuide
}) => {
  const [format, setFormat] = useState<StudyGuideFormat>(existingGuide?.format || 'outline');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<StudyGuide | null>(existingGuide);

  const handleGenerate = async () => {
    if (!pdfContent || !fileName) return;
    setError(null);
    setIsGenerating(true);
    
    try {
      const content = await generateStudyGuide(pdfContent, { format });
      if (!content) {
        setError('生成失败，请重试');
        setIsGenerating(false);
        return;
      }
      
      const newGuide: StudyGuide = {
        id: `guide-${Date.now()}`,
        fileName,
        format,
        content,
        createdAt: Date.now()
      };
      
      setGuide(newGuide);
      onSaveGuide(newGuide);
    } catch (e) {
      console.error(e);
      setError('生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('确定要重新生成吗？这将覆盖当前内容。')) return;
    await handleGenerate();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Study Guide / Outline
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* 格式选择 */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-600">格式：</span>
              <button
                onClick={() => setFormat('outline')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  format === 'outline'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                }`}
              >
                <List className="w-4 h-4" />
                大纲模式
              </button>
              <button
                onClick={() => setFormat('detailed')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  format === 'detailed'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                详细模式
              </button>
            </div>
            {guide && (
              <button
                onClick={handleRegenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-stone-200 disabled:opacity-50 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                重新生成
              </button>
            )}
          </div>

          {/* 生成按钮或内容展示 */}
          {!guide ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <div className="bg-indigo-50 p-6 rounded-full">
                <FileText className="w-12 h-12 text-indigo-500" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-slate-800">生成学习指南</h3>
                <p className="text-sm text-slate-500 max-w-md">
                  {format === 'outline' 
                    ? '将生成简洁的章节大纲和核心概念，便于快速浏览。'
                    : '将生成详细的学习指南，包含章节大纲、核心概念、学习路径、知识点树和复习建议。'}
                </p>
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <button
                onClick={handleGenerate}
                disabled={!pdfContent || isGenerating}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>正在生成...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    <span>生成 Study Guide</span>
                  </>
                )}
              </button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center justify-center py-16 text-indigo-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-bold">正在生成学习指南...</p>
              <p className="text-sm text-slate-400 mt-2">这可能需要一些时间，请稍候</p>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={MarkdownComponents}
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {guide.content.markdownContent || '内容为空'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
