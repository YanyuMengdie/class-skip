import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, Layers3 } from 'lucide-react';
import type { SkimRecordDeck, SkimRecordStatus } from '@/types';

interface SkimRecordShelfProps {
  deck: SkimRecordDeck;
  pageThumbnails: string[];
  onOpenRecord: (cardId: string) => void;
  onFocusRecord?: (cardId: string) => void;
}

const STATUS_LABELS: Record<SkimRecordStatus, string> = {
  not_started: '未开始',
  in_progress: '学习中',
  completed: '已学完',
};

const statusClass = (status: SkimRecordStatus) => {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'in_progress') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-white/90 text-slate-500 border-slate-200';
};

export const SkimRecordShelf: React.FC<SkimRecordShelfProps> = ({
  deck,
  pageThumbnails,
  onOpenRecord,
  onFocusRecord,
}) => {
  const cards = useMemo(
    () => deck.orderedCardIds.map((id) => deck.cards[id]).filter(Boolean),
    [deck.cards, deck.orderedCardIds]
  );
  const initialIndex = Math.max(0, cards.findIndex((card) => (
    card.id === deck.activeCardId || card.moduleIndex === deck.selectedModuleIndex
  )));
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [jumpPhase, setJumpPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [jumpDirection, setJumpDirection] = useState<-1 | 1>(1);
  const dragStart = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const jumpTimer = useRef<number | null>(null);
  const jumpFrame = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const modules = useMemo(() => Array.from(new Map(cards.map((card) => [
    card.moduleIndex,
    { index: card.moduleIndex, title: card.moduleTitle },
  ])).values()), [cards]);

  useEffect(() => {
    setFocusedIndex((current) => Math.min(current, Math.max(0, cards.length - 1)));
  }, [cards.length]);

  useEffect(() => () => {
    if (jumpTimer.current != null) window.clearTimeout(jumpTimer.current);
    if (jumpFrame.current != null) window.cancelAnimationFrame(jumpFrame.current);
  }, []);

  useEffect(() => {
    const focusedCard = cards[focusedIndex];
    if (!focusedCard || focusedCard.id === deck.activeCardId) return;
    onFocusRecord?.(focusedCard.id);
  }, [cards, deck.activeCardId, focusedIndex, onFocusRecord]);

  const move = useCallback((delta: number) => {
    if (jumpPhase !== 'idle') return;
    setDragOffset(0);
    setFocusedIndex((current) => Math.max(0, Math.min(cards.length - 1, current + delta)));
  }, [cards.length, jumpPhase]);

  const jumpToModule = (moduleIndex: number) => {
    const index = cards.findIndex((card) => card.moduleIndex === moduleIndex);
    if (index < 0 || index === focusedIndex || jumpPhase !== 'idle') return;

    const direction = index > focusedIndex ? 1 : -1;
    if (Math.abs(index - focusedIndex) === 1) {
      move(direction);
      return;
    }

    setJumpDirection(direction);
    setJumpPhase('out');
    jumpTimer.current = window.setTimeout(() => {
      setFocusedIndex(index);
      setJumpPhase('in');
      jumpFrame.current = window.requestAnimationFrame(() => {
        jumpFrame.current = window.requestAnimationFrame(() => setJumpPhase('idle'));
      });
    }, 150);
  };

  const endDrag = (clientX: number) => {
    if (dragStart.current == null) return;
    const distance = clientX - dragStart.current;
    dragStart.current = null;
    setIsDragging(false);
    setDragOffset(0);
    if (Math.abs(distance) > 55) move(distance < 0 ? 1 : -1);
  };

  if (cards.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f4f6f8] p-8 text-center">
        <p className="text-sm font-bold text-slate-500">这次没有生成可用唱片，请回到配置区重新规划。</p>
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f2f4f7]">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-black text-slate-900">
              <Layers3 className="h-5 w-5 text-indigo-600" />
              分段式学习
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">选一张唱片开始；顺序是建议，不是限制。</p>
          </div>
          <div className="shrink-0 text-xs font-bold text-slate-500">
            {cards.filter((card) => card.status === 'completed').length} / {cards.length} 已学完
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {modules.map((module) => {
            const active = cards[focusedIndex]?.moduleIndex === module.index;
            return (
              <button
                key={module.index}
                type="button"
                onClick={() => jumpToModule(module.index)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                }`}
              >
                Module {module.index}
              </button>
            );
          })}
        </div>
      </header>

      <div
        className="relative flex flex-1 min-h-0 touch-pan-y items-center justify-center overflow-hidden px-12 py-6 select-none"
        onWheel={(event) => {
          if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 12) {
            if (wheelLocked.current) return;
            wheelLocked.current = true;
            move(event.deltaX > 0 ? 1 : -1);
            window.setTimeout(() => { wheelLocked.current = false; }, 320);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
          dragStart.current = event.clientX;
          dragMoved.current = false;
          setIsDragging(true);
          setDragOffset(0);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragStart.current == null) return;
          const nextOffset = event.clientX - dragStart.current;
          if (Math.abs(nextOffset) > 6) dragMoved.current = true;
          const atStart = focusedIndex === 0 && nextOffset > 0;
          const atEnd = focusedIndex === cards.length - 1 && nextOffset < 0;
          setDragOffset(Math.max(-150, Math.min(150, nextOffset * (atStart || atEnd ? 0.28 : 1))));
        }}
        onPointerUp={(event) => endDrag(event.clientX)}
        onPointerCancel={() => {
          dragStart.current = null;
          setIsDragging(false);
          setDragOffset(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') move(-1);
          if (event.key === 'ArrowRight') move(1);
        }}
        tabIndex={0}
      >
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => move(-1)}
          disabled={focusedIndex === 0}
          aria-label="上一张唱片"
          className="absolute left-3 z-30 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-colors hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div
          className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] ${jumpPhase === 'out' ? 'duration-150 ease-in' : 'duration-200 ease-out'}`}
          style={{
            opacity: jumpPhase === 'idle' ? 1 : 0,
            transform: jumpPhase === 'out'
              ? `translate3d(${-jumpDirection * 24}px, 0, 0)`
              : jumpPhase === 'in'
                ? `translate3d(${jumpDirection * 24}px, 0, 0)`
                : 'translate3d(0, 0, 0)',
          }}
        >
          {cards.map((card, index) => {
            const distance = index - focusedIndex;
            if (Math.abs(distance) > 2) return null;
            const active = distance === 0;
            const thumbnail = pageThumbnails[card.pageStart - 1];
            const hasEarlierUnfinished = cards.slice(0, index).some((candidate) => candidate.status !== 'completed');
            return (
              <article
                key={card.id}
                className={`absolute flex w-[min(68vw,410px)] flex-col overflow-hidden rounded-lg border bg-white shadow-xl will-change-transform ${isDragging ? '' : 'transition-[transform,opacity,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'} ${active ? 'border-indigo-200' : 'cursor-pointer border-slate-200'}`}
                style={{
                  transform: `translate3d(calc(${distance * 84}% + ${dragOffset}px), 0, 0) scale(${active ? 1 : 0.9})`,
                  opacity: Math.abs(distance) === 2 ? 0.2 : active ? 1 : 0.66,
                  zIndex: 10 - Math.abs(distance),
                  pointerEvents: jumpPhase === 'idle' ? 'auto' : 'none',
                  boxShadow: active ? '0 24px 55px -28px rgba(15, 23, 42, 0.45)' : '0 12px 32px -28px rgba(15, 23, 42, 0.3)',
                }}
                onClick={() => {
                  if (dragMoved.current) {
                    dragMoved.current = false;
                    return;
                  }
                  if (!active) move(distance > 0 ? 1 : -1);
                }}
              >
              <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                {thumbnail ? (
                  <img src={thumbnail} alt="" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <div className="grid h-full place-items-center text-slate-300"><BookOpen className="h-12 w-12" /></div>
                )}
                <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusClass(card.status)}`}>
                  {card.status === 'completed' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                  {card.status === 'in_progress' && <Clock3 className="mr-1 inline h-3 w-3" />}
                  {STATUS_LABELS[card.status]}
                </span>
              </div>
              <div className="p-5">
                <p className="text-xs font-black uppercase text-indigo-600">
                  Module {card.moduleIndex}{card.partIndex ? ` · Part ${card.partIndex}` : ''}
                </p>
                <h2 className="mt-2 line-clamp-2 text-xl font-black text-slate-900">{card.title}</h2>
                <p className="mt-1 text-xs font-bold text-slate-400">第 {card.pageStart}-{card.pageEnd} 页</p>
                <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-600">{card.summary}</p>
                {hasEarlierUnfinished && (
                  <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    前面还有未学完的唱片，但你仍然可以自由打开这一张。
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onOpenRecord(card.id)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-indigo-600"
                >
                  {card.status === 'not_started' ? '开始这一段' : '继续这一段'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => move(1)}
          disabled={focusedIndex === cards.length - 1}
          aria-label="下一张唱片"
          className="absolute right-3 z-30 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-colors hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-3 text-center text-xs font-bold text-slate-400">
        {focusedIndex + 1} / {cards.length}
      </footer>
    </section>
  );
};
