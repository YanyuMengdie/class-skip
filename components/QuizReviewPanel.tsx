import React, { useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Lightbulb, RotateCcw, PlusCircle, Loader2, BookOpen } from 'lucide-react';
import { QuizData, QuizRound } from '../types';
import { generateQuizSet } from '../services/geminiService';

type Step = 'choose' | 'generating' | 'doing' | 'done' | 'review';

interface QuizReviewPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  existingRounds: QuizRound[];
  onSaveRounds: (rounds: QuizRound[]) => void;
}

const COUNT_OPTIONS = [5, 10, 15, 20];

export const QuizReviewPanel: React.FC<QuizReviewPanelProps> = ({
  onClose,
  pdfContent,
  existingRounds,
  onSaveRounds
}) => {
  const [step, setStep] = useState<Step>(existingRounds.length === 0 ? 'choose' : 'choose');
  const [count, setCount] = useState(10);
  const [currentRoundItems, setCurrentRoundItems] = useState<QuizData[]>([]);
  const [currentRoundAnswers, setCurrentRoundAnswers] = useState<(number | null)[]>([]);
  const [currentRoundSubmitted, setCurrentRoundSubmitted] = useState<boolean[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allItems = useMemo(() => {
    const fromRounds = existingRounds.flatMap(r => r.items);
    return currentRoundItems.length > 0 ? [...fromRounds, ...currentRoundItems] : fromRounds;
  }, [existingRounds, currentRoundItems]);

  const startNewRound = async () => {
    if (!pdfContent || count < 1) return;
    setError(null);
    setIsGenerating(true);
    setStep('generating');
    const existingTexts = allItems.map(q => q.question);
    const items = await generateQuizSet(pdfContent, { count, existingQuestionTexts: existingTexts.length ? existingTexts : undefined });
    setIsGenerating(false);
    if (items.length === 0) {
      setError('生成题目失败，请重试');
      setStep('choose');
      return;
    }
    setCurrentRoundItems(items);
    setCurrentRoundAnswers(items.map(() => null));
    setCurrentRoundSubmitted(items.map(() => false));
    setCurrentIndex(0);
    setStep('doing');
  };

  const submitCurrentAnswer = () => {
    if (currentRoundAnswers[currentIndex] === null) return;
    setCurrentRoundSubmitted(prev => {
      const next = [...prev];
      next[currentIndex] = true;
      return next;
    });
  };

  const goNext = () => {
    if (currentIndex < currentRoundItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setStep('done');
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const finishRoundAndSave = () => {
    const newRound: QuizRound = {
      id: `round-${Date.now()}`,
      items: currentRoundItems,
      createdAt: Date.now()
    };
    onSaveRounds([...existingRounds, newRound]);
    setCurrentRoundItems([]);
    setStep('choose');
  };

  const enterReview = () => {
    setStep('review');
  };

  const exitReview = () => {
    setStep('choose');
  };

  const currentQ = currentRoundItems[currentIndex];
  const selected = currentRoundAnswers[currentIndex];
  const submitted = currentRoundSubmitted[currentIndex];
  const isCorrect = currentQ && selected !== null && selected === currentQ.correctIndex;

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-500" />
            测验 (Quiz)
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'choose' && (
            <div className="space-y-6">
              <p className="text-slate-600">根据当前 PDF 出题，做完后可回顾或继续出更多题（不会重复）。</p>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">出题数量</label>
                <div className="flex flex-wrap gap-2">
                  {COUNT_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${count === n ? 'bg-violet-600 text-white' : 'bg-stone-100 text-slate-600 hover:bg-stone-200'}`}
                    >
                      {n} 道
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={startNewRound}
                  disabled={!pdfContent}
                  className="flex items-center gap-2 px-5 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 transition-all"
                >
                  <PlusCircle className="w-4 h-4" /> 出 {count} 道题
                </button>
                {allItems.length > 0 && (
                  <button
                    onClick={enterReview}
                    className="flex items-center gap-2 px-5 py-3 bg-stone-100 text-slate-700 rounded-xl font-bold hover:bg-stone-200 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" /> 回顾全部 ({allItems.length} 题)
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 text-violet-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-bold">正在生成题目...</p>
            </div>
          )}

          {step === 'doing' && currentQ && (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>第 {currentIndex + 1} / {currentRoundItems.length} 题</span>
                <button onClick={goPrev} disabled={currentIndex === 0} className="p-1 rounded hover:bg-stone-100 disabled:opacity-30">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-slate-800 text-white p-5 rounded-2xl">
                <p className="font-bold text-lg">{currentQ.question}</p>
              </div>
              <div className="space-y-2">
                {currentQ.options.map((opt, idx) => {
                  let btnClass = 'border-stone-200 hover:border-violet-300 hover:bg-violet-50 text-slate-600';
                  if (selected === idx) btnClass = 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500';
                  if (submitted) {
                    if (idx === currentQ.correctIndex) btnClass = 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500';
                    else if (selected === idx) btnClass = 'border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500 opacity-60';
                    else btnClass = 'border-stone-100 text-stone-300 opacity-50';
                  }
                  return (
                    <button
                      key={idx}
                      disabled={submitted}
                      onClick={() => !submitted && setCurrentRoundAnswers(prev => { const n = [...prev]; n[currentIndex] = idx; return n; })}
                      className={`w-full text-left p-4 rounded-xl border transition-all text-sm font-medium flex items-center justify-between ${btnClass}`}
                    >
                      <span>{opt}</span>
                      {submitted && idx === currentQ.correctIndex && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                      {submitted && selected === idx && selected !== currentQ.correctIndex && <AlertCircle className="w-5 h-5 text-rose-500" />}
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <div className={`p-4 rounded-xl text-sm ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                  <div className="font-bold mb-1 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    {isCorrect ? '回答正确' : '解析'}
                  </div>
                  <p className="leading-relaxed">{currentQ.explanation}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                {!submitted ? (
                  <button
                    onClick={submitCurrentAnswer}
                    disabled={selected === null}
                    className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold disabled:opacity-50"
                  >
                    提交
                  </button>
                ) : (
                  <button onClick={goNext} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1">
                    {currentIndex < currentRoundItems.length - 1 ? '下一题' : '完成'} <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-6 text-center py-4">
              <p className="text-lg font-bold text-slate-800">本轮测验已完成</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={finishRoundAndSave}
                  className="flex items-center gap-2 px-5 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700"
                >
                  保存并返回
                </button>
                <button
                  onClick={enterReview}
                  className="flex items-center gap-2 px-5 py-3 bg-stone-100 text-slate-700 rounded-xl font-bold hover:bg-stone-200"
                >
                  <RotateCcw className="w-4 h-4" /> 回顾本轮 + 历史题
                </button>
                <button
                  onClick={() => { finishRoundAndSave(); setStep('choose'); }}
                  className="flex items-center gap-2 px-5 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold hover:bg-amber-100"
                >
                  <PlusCircle className="w-4 h-4" /> 继续出题（不重复）
                </button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-800">全部题目回顾（共 {allItems.length} 题）</p>
                <button onClick={exitReview} className="text-sm text-violet-600 hover:underline">返回</button>
              </div>
              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                {allItems.map((q, i) => (
                  <div key={i} className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
                    <p className="font-bold text-slate-800 mb-2">{i + 1}. {q.question}</p>
                    <ul className="list-disc list-inside text-sm text-slate-600 mb-2">
                      {q.options.map((o, j) => (
                        <li key={j} className={j === q.correctIndex ? 'text-emerald-600 font-medium' : ''}>
                          {o} {j === q.correctIndex ? '✓' : ''}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-slate-500 border-t border-stone-200 pt-2 mt-2">
                      <span className="font-bold">解析：</span> {q.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
