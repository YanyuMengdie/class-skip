import React, { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, MessageCircle, BookOpen, HelpCircle, Send, RefreshCw, ListChecks, BookMarked } from 'lucide-react';
import {
  generateFeynmanExplanation,
  generateFeynmanExplanationForTopics,
  generateFeynmanQuestion,
  evaluateFeynmanAnswer,
  FeynmanQuestionResult,
  FeynmanAnswerFeedback
} from '@/services/geminiService';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-sky-200 first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-lg font-bold text-sky-800 mt-8 mb-3 first:mt-0 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-100" {...props} />
  ),
  h3: ({ node, ...props }) => <h3 className="text-base font-bold text-slate-700 mt-4 mb-2" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-7 text-slate-700" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-2 my-4 text-slate-700 pl-1" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-sky-900 bg-sky-50/80 px-1 rounded" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-4 border-sky-300 pl-4 py-2 my-4 bg-sky-50/60 text-slate-600 rounded-r-lg text-sm leading-6" {...props} />
  ),
  code: ({ node, ...props }) => <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
};

type FeynmanMode = 'explain' | 'quiz';
type QuizDifficulty = 'easy' | 'medium' | 'hard';

interface WrongItem {
  question: string;
  referenceAnswer: string;
  userAnswer: string;
  feedback: string;
}

interface FeynmanPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  onSaveToStudio?: (markdown: string, title?: string) => void;
}
export const FeynmanPanel: React.FC<FeynmanPanelProps> = ({ onClose, pdfContent, onSaveToStudio }) => {
  const [mode, setMode] = useState<FeynmanMode>('explain');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用大白话讲
  const [userTopics, setUserTopics] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);

  // 出题考我
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [currentQuestion, setCurrentQuestion] = useState<FeynmanQuestionResult | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [quizLoading, setQuizLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeynmanAnswerFeedback | null>(null);
  const [wrongList, setWrongList] = useState<WrongItem[]>([]);
  const [showWrongList, setShowWrongList] = useState(false);

  useEffect(() => {
    if (!pdfContent?.trim()) {
      setMarkdown(null);
      setError('暂无内容');
    } else {
      setError(null);
    }
  }, [pdfContent]);

  const handleFullExplain = () => {
    if (!pdfContent?.trim()) return;
    setLoading(true);
    setError(null);
    generateFeynmanExplanation(pdfContent)
      .then((text) => setMarkdown(text))
      .catch(() => setError('生成失败，请重试'))
      .finally(() => setLoading(false));
  };

  const handleExplainTopics = () => {
    if (!userTopics.trim() || !pdfContent?.trim()) return;
    setExplainLoading(true);
    setError(null);
    generateFeynmanExplanationForTopics(pdfContent, userTopics)
      .then((text) => setMarkdown(text))
      .catch(() => setError('生成失败，请重试'))
      .finally(() => setExplainLoading(false));
  };

  const handleGetQuestion = () => {
    if (!pdfContent?.trim()) return;
    setQuizLoading(true);
    setError(null);
    setCurrentQuestion(null);
    setUserAnswer('');
    setFeedback(null);
    generateFeynmanQuestion(pdfContent, difficulty)
      .then((res) => {
        if (res) setCurrentQuestion(res);
        else setError('出题失败，请重试');
      })
      .catch(() => setError('出题失败，请重试'))
      .finally(() => setQuizLoading(false));
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion || !userAnswer.trim()) return;
    setSubmitLoading(true);
    setError(null);
    evaluateFeynmanAnswer(currentQuestion.question, currentQuestion.referenceAnswer, userAnswer)
      .then((res) => {
        setFeedback(res);
        if (!res.correct) {
          setWrongList((prev) => [
            ...prev,
            {
              question: currentQuestion.question,
              referenceAnswer: currentQuestion.referenceAnswer,
              userAnswer: userAnswer.trim(),
              feedback: res.feedback
            }
          ]);
        }
      })
      .catch(() => setError('评判失败，请重试'))
      .finally(() => setSubmitLoading(false));
  };

  const handleNextQuestion = () => {
    setFeedback(null);
    setUserAnswer('');
    setCurrentQuestion(null);
    handleGetQuestion();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-sky-500" />
            费曼检验 · 用大白话讲
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 模式切换 */}
        <div className="flex border-b border-stone-100 shrink-0">
          <button
            onClick={() => { setMode('explain'); setError(null); setFeedback(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${mode === 'explain' ? 'bg-sky-100 text-sky-800 border-b-2 border-sky-500' : 'text-slate-500 hover:bg-stone-50'}`}
          >
            <BookOpen className="w-4 h-4" />
            用大白话讲给我听
          </button>
          <button
            onClick={() => { setMode('quiz'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${mode === 'quiz' ? 'bg-sky-100 text-sky-800 border-b-2 border-sky-500' : 'text-slate-500 hover:bg-stone-50'}`}
          >
            <HelpCircle className="w-4 h-4" />
            出题考我
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 min-h-0">
          {mode === 'explain' && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-slate-600">输入你不懂的知识点，用大白话单独讲清楚；或先看整份文档的大白话版。</p>
                <textarea
                  value={userTopics}
                  onChange={(e) => setUserTopics(e.target.value)}
                  placeholder="例如：补体系统怎么工作、细胞因子和发烧的关系、巨噬细胞和中性粒细胞的区别..."
                  className="w-full min-h-[72px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
                  disabled={loading || explainLoading}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExplainTopics}
                    disabled={!userTopics.trim() || explainLoading || loading}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600 disabled:opacity-50"
                  >
                    {explainLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {explainLoading ? '正在讲...' : '用大白话讲给我听'}
                  </button>
                  <button
                    onClick={handleFullExplain}
                    disabled={loading || explainLoading}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-stone-100 text-slate-700 text-sm font-bold hover:bg-stone-200 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {loading ? '生成中...' : '先看整份大白话'}
                  </button>
                </div>
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              {markdown && !loading && !explainLoading && (
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
                  {onSaveToStudio && (
                    <button
                      type="button"
                      onClick={() => onSaveToStudio(markdown, '费曼大白话')}
                      className="flex items-center gap-2 mt-3 py-2 px-4 rounded-xl bg-sky-100 text-sky-800 text-sm font-bold hover:bg-sky-200 transition-colors"
                    >
                      <BookMarked className="w-4 h-4" /> 保存到 Studio
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {mode === 'quiz' && (
            <>
              {showWrongList ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">错题本</h3>
                    <button onClick={() => setShowWrongList(false)} className="text-sm text-sky-600 hover:underline">返回答题</button>
                  </div>
                  {wrongList.length === 0 ? (
                    <p className="text-slate-500 text-sm">暂无错题，继续加油。</p>
                  ) : (
                    <ul className="space-y-4">
                      {wrongList.map((item, i) => (
                        <li key={i} className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-sm">
                          <p className="font-bold text-slate-800 mb-1">题目：</p>
                          <p className="text-slate-700 mb-2">{item.question}</p>
                          <p className="font-bold text-slate-700 mb-1">你的答案：</p>
                          <p className="text-slate-600 mb-2">{item.userAnswer}</p>
                          <p className="font-bold text-emerald-700 mb-1">参考答案要点：</p>
                          <p className="text-slate-700 mb-2">{item.referenceAnswer}</p>
                          <p className="font-bold text-sky-700 mb-1">评语：</p>
                          <p className="text-slate-600">{item.feedback}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-600">难度：</span>
                    {(['easy', 'medium', 'hard'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${difficulty === d ? 'bg-sky-500 text-white' : 'bg-stone-100 text-slate-600 hover:bg-stone-200'}`}
                      >
                        {d === 'easy' ? '简单' : d === 'medium' ? '中等' : '难'}
                      </button>
                    ))}
                    {wrongList.length > 0 && (
                      <button
                        onClick={() => setShowWrongList(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200"
                      >
                        <ListChecks className="w-3.5 h-3.5" /> 看错题 ({wrongList.length})
                      </button>
                    )}
                  </div>
                  {!currentQuestion && !quizLoading && (
                    <button
                      onClick={handleGetQuestion}
                      disabled={!pdfContent?.trim()}
                      className="self-start flex items-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600 disabled:opacity-50"
                    >
                      <HelpCircle className="w-4 h-4" /> 出一道题
                    </button>
                  )}
                  {quizLoading && (
                    <div className="flex items-center gap-2 text-sky-600 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> 正在出题...
                    </div>
                  )}
                  {error && <p className="text-rose-600 text-sm">{error}</p>}
                  {currentQuestion && !quizLoading && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-sky-50 border border-sky-100">
                        <p className="text-xs font-bold text-sky-700 mb-1">题目</p>
                        <p className="text-slate-800">{currentQuestion.question}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">用大白话或课堂概念回答（Short Answer）</label>
                        <textarea
                          value={userAnswer}
                          onChange={(e) => setUserAnswer(e.target.value)}
                          placeholder="输入你的答案..."
                          className="w-full min-h-[100px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y focus:border-sky-400"
                          disabled={!!feedback || submitLoading}
                        />
                      </div>
                      {!feedback ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSubmitAnswer}
                            disabled={!userAnswer.trim() || submitLoading}
                            className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {submitLoading ? '评判中...' : '提交答案'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className={`p-4 rounded-xl border ${feedback.correct ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                            <p className="text-sm font-bold mb-1">{feedback.correct ? '回答正确' : '需要再巩固'}</p>
                            <p className="text-slate-700 text-sm">{feedback.feedback}</p>
                          </div>
                          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-sm">
                            <p className="font-bold text-slate-700 mb-1">参考答案要点</p>
                            <p className="text-slate-600">{currentQuestion.referenceAnswer}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleNextQuestion}
                              className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600"
                            >
                              <RefreshCw className="w-4 h-4" /> 继续出题
                            </button>
                            {wrongList.length > 0 && (
                              <button
                                onClick={() => setShowWrongList(true)}
                                className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-rose-100 text-rose-800 text-sm font-bold hover:bg-rose-200"
                              >
                                <ListChecks className="w-4 h-4" /> 看错题
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
