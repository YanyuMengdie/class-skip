import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Layers, RotateCcw, PlusCircle } from 'lucide-react';
import { FlashCard } from '../types';
import { estimateFlashCardCount, generateFlashCards } from '../services/geminiService';

type Step = 'estimate' | 'estimating' | 'ready' | 'generating' | 'flipping' | 'empty';

interface FlashCardReviewPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  existingCards: FlashCard[];
  savedEstimate: number | undefined;
  onSaveCards: (cards: FlashCard[]) => void;
  onSaveEstimate: (n: number) => void;
}

export const FlashCardReviewPanel: React.FC<FlashCardReviewPanelProps> = ({
  onClose,
  pdfContent,
  existingCards,
  savedEstimate,
  onSaveCards,
  onSaveEstimate
}) => {
  const [step, setStep] = useState<Step>(existingCards.length > 0 ? 'ready' : (savedEstimate != null ? 'ready' : 'estimate'));
  const [estimate, setEstimate] = useState<number | null>(savedEstimate ?? null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cards, setCards] = useState<FlashCard[]>(existingCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'estimate' && pdfContent && estimate === null && !isEstimating) {
      setIsEstimating(true);
      setStep('estimating');
      estimateFlashCardCount(pdfContent)
        .then(n => {
          setEstimate(n);
          onSaveEstimate(n);
          setStep('ready');
        })
        .catch(() => {
          setEstimate(20);
          setStep('ready');
        })
        .finally(() => setIsEstimating(false));
    }
  }, [pdfContent, step, estimate, isEstimating, onSaveEstimate]);

  const handleGenerate = async () => {
    if (!pdfContent || generateCount < 1) return;
    setError(null);
    setIsGenerating(true);
    setStep('generating');
    const existingFronts = cards.map(c => c.front);
    const newOnes = await generateFlashCards(pdfContent, {
      count: generateCount,
      existingFronts: existingFronts.length ? existingFronts : undefined
    });
    setIsGenerating(false);
    if (newOnes.length === 0) {
      setError('生成闪卡失败，请重试');
      setStep(cards.length > 0 ? 'flipping' : 'ready');
      return;
    }
    const newCards: FlashCard[] = newOnes.map((c, i) => ({
      id: `fc-${Date.now()}-${i}`,
      front: c.front,
      back: c.back,
      createdAt: Date.now()
    }));
    const merged = [...cards, ...newCards];
    setCards(merged);
    onSaveCards(merged);
    setCurrentIndex(cards.length);
    setIsFlipped(false);
    setStep('flipping');
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const goNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-500" />
            Flash Card
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {(step === 'estimating' || step === 'estimate') && (
            <div className="flex flex-col items-center justify-center py-16 text-amber-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-bold">正在估算可整理闪卡数量...</p>
            </div>
          )}

          {step === 'ready' && (
            <div className="space-y-6">
              {estimate != null && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="font-bold text-amber-800">根据当前 PDF，大约可整理出 <span className="text-xl">{estimate}</span> 张闪卡。</p>
                  <p className="text-sm text-amber-700 mt-1">您可以先生成一批，之后随时「再生成更多」补充（不会重复）。</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">本次生成数量</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={generateCount}
                    onChange={e => setGenerateCount(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
                    className="w-20 px-3 py-2 border border-stone-200 rounded-xl text-center font-bold"
                  />
                  <span className="text-slate-500 text-sm">张</span>
                </div>
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={!pdfContent}
                  className="flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  <PlusCircle className="w-4 h-4" /> 生成 {generateCount} 张闪卡
                </button>
                {cards.length > 0 && (
                  <button
                    onClick={() => { setCurrentIndex(0); setIsFlipped(false); setStep('flipping'); }}
                    className="flex items-center gap-2 px-5 py-3 bg-stone-100 text-slate-700 rounded-xl font-bold hover:bg-stone-200"
                  >
                    <RotateCcw className="w-4 h-4" /> 开始复习 ({cards.length} 张)
                  </button>
                )}
              </div>
              {cards.length > 0 && (
                <p className="text-sm text-slate-500">当前已有 {cards.length} 张，新生成的将追加到牌组。</p>
              )}
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 text-amber-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="font-bold">正在生成闪卡...</p>
            </div>
          )}

          {step === 'flipping' && currentCard && (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>{currentIndex + 1} / {cards.length}</span>
                <div className="flex gap-1">
                  <button onClick={goPrev} disabled={currentIndex === 0} className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={goNext} disabled={currentIndex === cards.length - 1} className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => setIsFlipped(prev => !prev)}
                className="w-full min-h-[220px] bg-stone-50 border-2 border-stone-200 rounded-2xl p-6 text-left hover:border-amber-300 transition-all flex items-center justify-center"
              >
                <div className="w-full">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">{isFlipped ? '背面' : '正面'}</p>
                  <p className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                    {isFlipped ? currentCard.back : currentCard.front}
                  </p>
                </div>
              </button>
              <p className="text-center text-xs text-stone-400">点击卡片翻转</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={!pdfContent}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-100"
                >
                  <PlusCircle className="w-4 h-4" /> 再生成更多闪卡
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
