import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { JigsawState } from '../types';
import { getRandomJigsawImageUrl } from '../data/jigsawImages';
import { sliceImageIntoPieces } from '../utils/jigsawCanvas';

interface JigsawPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: JigsawState | null;
  onUpdateState: (state: JigsawState) => void;
}

export const JigsawPanel: React.FC<JigsawPanelProps> = ({
  isOpen,
  onClose,
  state,
  onUpdateState
}) => {
  const [studyMinutes, setStudyMinutes] = useState(state?.studyDurationMinutes ?? 25);
  const [restCount, setRestCount] = useState(state?.restCount ?? 3);
  const [loading, setLoading] = useState(false);
  const [configMode, setConfigMode] = useState(!state?.pieceImages?.length);

  const startGame = async () => {
    const n = Math.max(1, Math.min(12, restCount));
    setLoading(true);
    try {
      const imageUrl = getRandomJigsawImageUrl();
      const { pieceImages, rotations } = await sliceImageIntoPieces(imageUrl, n);
      const newState: JigsawState = {
        imageUrl,
        pieces: n,
        pieceRevealed: 0,
        pieceImages,
        rotations,
        assembled: false,
        studyDurationMinutes: studyMinutes,
        restCount: n,
        startedAt: Date.now()
      };
      onUpdateState(newState);
      setConfigMode(false);
    } catch (e) {
      console.error('Jigsaw start failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSection = () => {
    if (!state) return;
    const next = Math.min(state.pieceRevealed + 1, state.pieces);
    const assembled = next >= state.pieces;
    onUpdateState({
      ...state,
      pieceRevealed: next,
      assembled
    });
  };

  if (!isOpen) return null;

  const showConfig = configMode || !state?.pieceImages?.length;
  const canAdvance = state && state.pieceRevealed < state.pieces && !state.assembled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-stone-900 text-stone-100 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-stone-700">
        <div className="flex items-center justify-between p-4 border-b border-stone-700">
          <h2 className="text-lg font-bold">猎奇盲盒</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {showConfig && (
            <>
              <p className="text-sm text-stone-400">选学习时长和休息次数（拼图块数），每学完一段揭开一块，揭完看整图。</p>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-sm">
                  学习时长（分钟）
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={studyMinutes}
                    onChange={(e) => setStudyMinutes(Number(e.target.value) || 25)}
                    className="mt-1 w-full px-3 py-2 bg-stone-800 border border-stone-600 rounded-lg"
                  />
                </label>
                <label className="text-sm">
                  休息次数（拼图块数）
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={restCount}
                    onChange={(e) => setRestCount(Number(e.target.value) || 3)}
                    className="mt-1 w-full px-3 py-2 bg-stone-800 border border-stone-600 rounded-lg"
                  />
                </label>
              </div>
              <button
                onClick={startGame}
                disabled={loading}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-white font-bold flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                开始
              </button>
            </>
          )}

          {!showConfig && state && (
            <>
              <p className="text-sm text-stone-400">
                已揭开 {state.pieceRevealed} / {state.pieces} 块
              </p>
              <div
                className="grid gap-1.5 rounded-lg overflow-hidden bg-stone-800 p-2 justify-items-center"
                style={{
                  gridTemplateColumns: `repeat(${state.pieces <= 3 ? state.pieces : Math.ceil(Math.sqrt(state.pieces))}, 1fr)`
                }}
              >
                {state.pieceImages.map((src, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-stone-700 rounded flex items-center justify-center overflow-hidden"
                  >
                    {i < state.pieceRevealed ? (
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{
                          transform: `rotate(${state.rotations[i] ?? 0}deg)`
                        }}
                      />
                    ) : (
                      <span className="text-stone-500 text-xs">?</span>
                    )}
                  </div>
                ))}
              </div>

              {state.assembled && (
                <div className="rounded-lg overflow-hidden border-2 border-violet-500/60 bg-stone-800/50">
                  <p className="text-center text-violet-300 text-sm py-1.5">揭晓～</p>
                  <img
                    src={state.imageUrl}
                    alt="揭晓"
                    className="w-full h-auto object-contain max-h-72 rounded-b-lg"
                  />
                </div>
              )}

              {canAdvance && (
                <button
                  onClick={handleFinishSection}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-bold"
                >
                  我学完一段
                </button>
              )}

              {state.assembled && (
                <button
                  onClick={() => {
                    setConfigMode(true);
                    onUpdateState({
                      ...state,
                      pieceImages: [],
                      pieceRevealed: 0,
                      rotations: [],
                      assembled: false
                    });
                  }}
                  className="w-full py-2 border border-stone-600 rounded-xl text-stone-400 hover:bg-stone-800 text-sm"
                >
                  再玩一局
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
