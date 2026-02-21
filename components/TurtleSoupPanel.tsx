import React, { useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { TurtleSoupState } from '../types';
import { generateTurtleSoupPuzzle, answerTurtleSoupQuestion, generateTurtleSoupHint } from '../services/geminiService';

interface TurtleSoupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: TurtleSoupState | null;
  onUpdateState: (state: TurtleSoupState) => void;
}

const QUESTIONS_PER_ROUND = 5;

export const TurtleSoupPanel: React.FC<TurtleSoupPanelProps> = ({
  isOpen,
  onClose,
  state,
  onUpdateState
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);

  const ensurePuzzle = useCallback(async (): Promise<void> => {
    if (state?.situation) return;
    setLoading(true);
    try {
      const puzzle = await generateTurtleSoupPuzzle();
      const newState: TurtleSoupState = {
        situation: puzzle.situation,
        hiddenStory: puzzle.hiddenStory,
        hints: [],
        questionsLeft: QUESTIONS_PER_ROUND,
        solved: false,
        questionHistory: []
      };
      onUpdateState(newState);
    } finally {
      setLoading(false);
    }
  }, [state?.situation, onUpdateState]);

  React.useEffect(() => {
    if (isOpen && !state?.situation && !loading) {
      ensurePuzzle();
    }
  }, [isOpen, state?.situation, loading, ensurePuzzle]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!q || !state || state.questionsLeft <= 0 || state.solved) return;
    setQuestionInput('');
    setLoading(true);
    try {
      const a = await answerTurtleSoupQuestion(
        { situation: state.situation, hiddenStory: state.hiddenStory },
        q,
        state.questionHistory
      );
      const history = [...(state.questionHistory || []), { q, a }];
      onUpdateState({
        ...state,
        questionsLeft: state.questionsLeft - 1,
        questionHistory: history
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSection = async () => {
    if (!state || state.solved) return;
    setHintLoading(true);
    try {
      const hint = await generateTurtleSoupHint(state.hiddenStory, state.hints);
      onUpdateState({
        ...state,
        hints: [...state.hints, hint],
        questionsLeft: QUESTIONS_PER_ROUND
      });
    } finally {
      setHintLoading(false);
    }
  };

  const handleReveal = () => {
    if (state) onUpdateState({ ...state, solved: true });
  };

  const handleNewGame = () => {
    onUpdateState({
      situation: '',
      hiddenStory: '',
      hints: [],
      questionsLeft: QUESTIONS_PER_ROUND,
      solved: false,
      questionHistory: []
    });
  };

  if (!isOpen) return null;

  const hasPuzzle = !!state?.situation;
  const questionsLeft = state?.questionsLeft ?? 0;
  const canAsk = questionsLeft > 0 && !state?.solved && !loading;
  const showFinishPrompt = hasPuzzle && questionsLeft === 0 && !state?.solved;
  const canFinishSection = hasPuzzle && !state?.solved && (questionsLeft < QUESTIONS_PER_ROUND || (state?.hints?.length ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-stone-900 text-stone-100 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-stone-700">
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <h2 className="text-lg font-bold">海龟汤</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {(loading || (state && !state.situation)) && !hasPuzzle && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            </div>
          )}

          {hasPuzzle && state && (
            <>
              <p className="text-xs text-stone-500">每回合 5 次是非题，学完一段得 1 条提示并再问 5 次。</p>

              <div className="bg-stone-800 rounded-lg p-3 text-sm">
                <p className="text-amber-200 font-medium mb-1">汤面</p>
                <p className="text-stone-200 whitespace-pre-wrap">{state.situation}</p>
              </div>

              {state.hints.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-stone-500">已获得提示</p>
                  {state.hints.map((h, i) => (
                    <div key={i} className="bg-stone-800/80 rounded-lg px-3 py-2 text-sm text-stone-300">
                      {i + 1}. {h}
                    </div>
                  ))}
                </div>
              )}

              {(state.questionHistory?.length ?? 0) > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  <p className="text-xs text-stone-500">问答记录</p>
                  {state.questionHistory!.map((h, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-stone-400">Q: </span>
                      <span className="text-stone-300">{h.q}</span>
                      <br />
                      <span className="text-amber-300/90">A: {h.a}</span>
                    </div>
                  ))}
                </div>
              )}

              {!state.solved && (
                <form onSubmit={handleAsk} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      placeholder="输入是非题..."
                      disabled={!canAsk}
                      className="flex-1 px-3 py-2 bg-stone-800 border border-stone-600 rounded-lg text-white placeholder-stone-500 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!canAsk}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-sm font-medium"
                    >
                      提问
                    </button>
                  </div>
                  <p className="text-xs text-stone-500">剩余提问次数：{questionsLeft} / {QUESTIONS_PER_ROUND}</p>
                </form>
              )}

              {showFinishPrompt && (
                <p className="text-amber-200/90 text-sm">本回合次数已用尽，点「我学完一段」可获得新提示并再问 5 次。</p>
              )}

              {!state.solved && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleFinishSection}
                    disabled={hintLoading || !canFinishSection}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl text-stone-900 font-bold text-base shadow-lg flex items-center justify-center gap-2"
                  >
                    {hintLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    我学完一段
                  </button>
                  <button
                    onClick={handleReveal}
                    className="w-full py-2 border border-stone-600 rounded-xl text-stone-400 hover:bg-stone-800 text-sm"
                  >
                    揭晓汤底
                  </button>
                </div>
              )}

              {state.solved && (
                <>
                  <div className="bg-stone-800 rounded-lg p-4 border border-amber-500/50">
                    <p className="text-amber-200 font-medium mb-1">汤底</p>
                    <p className="text-stone-200 whitespace-pre-wrap">{state.hiddenStory}</p>
                  </div>
                  <button
                    onClick={handleNewGame}
                    className="w-full py-2 border border-stone-600 rounded-xl text-stone-400 hover:bg-stone-800 text-sm"
                  >
                    再玩一局
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
