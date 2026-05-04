import React, { useEffect, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { QuizData } from '@/types';
import { generateFiveMinGuide, extractTerminology, TerminologyItem, generateQuizSet } from '@/services/geminiService';

type Step = 'guide' | 'terms' | 'quiz' | 'done';

interface FiveMinFlowPanelProps {
  docContent: string;
  docLabel: string;
  onClose: () => void;
  onExtend?: () => void;
}

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-base font-bold text-slate-800 mt-3 mb-1" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-slate-700 mt-2 mb-1" {...props} />,
  p: ({ node, ...props }) => <p className="mb-2 leading-6 text-slate-700 text-sm" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-slate-800" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-stone-300 pl-3 py-1 my-2 text-slate-600 text-sm" {...props} />,
  code: ({ node, ...props }) => <code className="bg-stone-100 text-slate-700 px-1 py-0.5 rounded text-xs font-mono" {...props} />
};

export const FiveMinFlowPanel: React.FC<FiveMinFlowPanelProps> = ({
  docContent,
  docLabel,
  onClose,
  onExtend
}) => {
  const [step, setStep] = useState<Step>('guide');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guideMarkdown, setGuideMarkdown] = useState<string | null>(null);
  const [terms, setTerms] = useState<TerminologyItem[] | null>(null);
  const [quizItems, setQuizItems] = useState<QuizData[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const safeDocContent = (docContent || '').trim();

  // 自动按步骤加载所需内容
  useEffect(() => {
    const load = async () => {
      if (!safeDocContent) {
        setError('当前文档内容为空，暂时无法进入 5 分钟学习模式。');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        if (step === 'guide' && !guideMarkdown) {
          const markdown = await generateFiveMinGuide(safeDocContent);
          setGuideMarkdown(markdown);
        } else if (step === 'terms' && !terms) {
          const all = await extractTerminology(safeDocContent);
          setTerms(all.slice(0, 3));
        } else if (step === 'quiz' && quizItems.length === 0) {
          const items = await generateQuizSet(safeDocContent, { count: 2 });
          setQuizItems(items.slice(0, 2));
          setQuizIndex(0);
          setQuizSelected(null);
          setQuizSubmitted(false);
        }
      } catch (e) {
        setError('加载内容时遇到问题，请稍后重试，或直接结束 5 分钟模式。');
        console.error('FiveMinFlowPanel load error:', e);
      } finally {
        setLoading(false);
      }
    };

    if ((step === 'guide' && !guideMarkdown) || (step === 'terms' && !terms) || (step === 'quiz' && quizItems.length === 0)) {
      load();
    }
  }, [step, guideMarkdown, terms, quizItems.length, safeDocContent]);

  const goNextFromGuide = () => {
    setStep('terms');
  };

  const goNextFromTerms = () => {
    setStep('quiz');
  };

  const goNextFromQuiz = () => {
    if (quizItems.length === 0) {
      setStep('done');
      return;
    }
    if (quizIndex < quizItems.length - 1) {
      setQuizIndex((idx) => idx + 1);
      setQuizSelected(null);
      setQuizSubmitted(false);
    } else {
      setStep('done');
    }
  };

  const handleSubmitQuiz = () => {
    if (quizSelected === null) return;
    setQuizSubmitted(true);
  };

  const handleEnd = () => {
    onClose();
  };

  const handleExtend = () => {
    if (onExtend) onExtend();
    else onClose();
  };

  const renderGuideStep = () => (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">步骤 1 / 3 · 超简速览</p>
        <h2 className="text-base font-bold text-slate-800 mt-1">先混个脸熟：{docLabel}</h2>
        <p className="text-xs text-slate-500 mt-1">用 3–5 条一句话的要点，先知道这份材料大概在讲什么。</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/60 p-3">
        {loading && !guideMarkdown ? (
          <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在为你压缩出 5 分钟速览...
          </div>
        ) : guideMarkdown ? (
          <div className="prose prose-sm max-w-none text-slate-800">
            <ReactMarkdown components={MarkdownComponents} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {guideMarkdown}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-slate-500">暂时生成不了 5 分钟速览，可以直接进入下一步。</p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={goNextFromGuide}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
        >
          下一步：看几个关键术语
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderTermsStep = () => (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">步骤 2 / 3 · 关键术语</p>
        <h2 className="text-base font-bold text-slate-800 mt-1">先认认脸：这几个名词之后会常见到</h2>
        <p className="text-xs text-slate-500 mt-1">不用背，只要大概知道「谁是谁」即可。</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 space-y-3">
        {loading && !terms ? (
          <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在从文档里挑几个最关键的术语...
          </div>
        ) : terms && terms.length > 0 ? (
          terms.map((t, idx) => (
            <div key={idx} className="border border-stone-200 rounded-xl px-3 py-2 bg-stone-50">
              <p className="text-sm font-bold text-slate-800">{t.term}</p>
              <p className="text-xs text-slate-600 mt-1">{t.definition}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">这份文档暂时没抽取到合适的术语，可以直接进入下一步小测。</p>
        )}
      </div>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          onClick={() => setStep('guide')}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          返回上一部
        </button>
        <button
          type="button"
          onClick={goNextFromTerms}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
        >
          下一步：来 1–2 道超简单小题
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderQuizStep = () => {
    if (quizItems.length === 0) {
      return (
        <div className="flex flex-col h-full">
          <div className="mb-3">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">步骤 3 / 3 · 小测</p>
            <h2 className="text-base font-bold text-slate-800 mt-1">今天就到这，可以直接结束</h2>
          </div>
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            暂时没有生成小测题目，你也可以直接结束 5 分钟模式。
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep('done')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 transition-colors"
            >
              结束 5 分钟
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    const current = quizItems[quizIndex];

    return (
      <div className="flex flex-col h-full">
        <div className="mb-3">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">步骤 3 / 3 · 小测</p>
          <h2 className="text-base font-bold text-slate-800 mt-1">
            超简单小测（{quizIndex + 1}/{quizItems.length}）
          </h2>
          <p className="text-xs text-slate-500 mt-1">随便选一选，感受一下题目长什么样，不追求分数。</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-800 mb-3 whitespace-pre-wrap">{current.question}</p>
          <div className="space-y-2">
            {current.options.map((opt, idx) => {
              const isSelected = quizSelected === idx;
              const isCorrect = current.correctIndex === idx;
              const showCorrectness = quizSubmitted && (isSelected || isCorrect);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => !quizSubmitted && setQuizSelected(idx)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                  }`}
                >
                  <span className="mr-2 text-xs text-slate-400">{String.fromCharCode(65 + idx)}.</span>
                  <span className="align-middle">{opt}</span>
                  {showCorrectness && (
                    <span className={`ml-2 text-xs font-medium ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isCorrect ? '正确答案' : '你的选择'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {quizSubmitted && (
            <div className="mt-3 text-xs text-slate-600 border-t border-stone-200 pt-2">
              <span className="font-semibold text-slate-700">解析：</span>
              <span className="whitespace-pre-wrap">{current.explanation}</span>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep('terms')}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            返回术语
          </button>
          <div className="flex gap-2">
            {!quizSubmitted ? (
              <button
                type="button"
                onClick={handleSubmitQuiz}
                disabled={quizSelected === null}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                提交看看
              </button>
            ) : (
              <button
                type="button"
                onClick={goNextFromQuiz}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
              >
                {quizIndex < quizItems.length - 1 ? '下一题' : '结束 5 分钟'}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDoneStep = () => (
    <div className="flex flex-col h-full items-center justify-center text-center px-6">
      <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
      <h2 className="text-base font-bold text-slate-800 mb-2">5 分钟到啦，已经和这份材料打过招呼了。</h2>
      <p className="text-sm text-slate-600 mb-4">
        今天就到这里也没问题；如果还有一点点力气，也可以趁热打铁，多学一会儿。
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          type="button"
          onClick={handleEnd}
          className="px-4 py-2 rounded-xl border border-stone-300 bg-white text-sm font-medium text-slate-700 hover:bg-stone-50"
        >
          结束，回到文档
        </button>
        <button
          type="button"
          onClick={handleExtend}
          className="px-4 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600"
        >
          再学一会儿
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[230] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
              5 分钟模式 · 混个脸熟
            </p>
            <h1 className="text-sm font-bold text-slate-800 truncate mt-0.5">{docLabel}</h1>
          </div>
          <button
            type="button"
            onClick={handleEnd}
            className="text-xs text-slate-400 hover:text-slate-700"
          >
            结束
          </button>
        </header>

        {error && (
          <div className="px-5 py-2 text-xs text-rose-600 border-b border-rose-100 bg-rose-50/60">
            {error}
          </div>
        )}

        <main className="flex-1 min-h-0 p-5">
          {step === 'guide' && renderGuideStep()}
          {step === 'terms' && renderTermsStep()}
          {step === 'quiz' && renderQuizStep()}
          {step === 'done' && renderDoneStep()}
        </main>
      </div>
    </div>
  );
};

