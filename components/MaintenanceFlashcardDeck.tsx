import React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { MaintenanceFlashCard } from '@/types';

interface Props {
  cards: MaintenanceFlashCard[];
  index: number;
  flipped: boolean;
  onPrev: () => void;
  onNext: () => void;
  onFlip: () => void;
}

export const MaintenanceFlashcardDeck: React.FC<Props> = ({
  cards,
  index,
  flipped,
  onPrev,
  onNext,
  onFlip,
}) => {
  const card = cards[index];
  if (!card) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>进度 {index + 1} / {cards.length}</span>
        <button
          type="button"
          onClick={onFlip}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-slate-700"
        >
          <RotateCcw className="w-3.5 h-3.5" /> {flipped ? '看正面' : '翻到背面'}
        </button>
      </div>
      <button
        type="button"
        onClick={onFlip}
        className="w-full min-h-[220px] p-4 rounded-2xl border border-stone-200 bg-white text-left hover:border-indigo-300 transition-colors"
      >
        <p className="text-[11px] text-slate-400 mb-2">{flipped ? '背面 / 答案' : '正面 / 提问'}</p>
        <p className="text-base font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
          {flipped ? card.back : card.front}
        </p>
      </button>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-stone-100 text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> 上一张
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={index >= cards.length - 1}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40"
        >
          下一张 <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
