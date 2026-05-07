/**
 * 递进阅读模式 — 题目交互组件(铁律 8/9 落地)。
 *
 * 视觉行为(6 个场景):
 * - 场景 1(question === null && !isGenerating):"📝 答题" 按钮 → 触发 onGenerate
 * - 场景 2(isGenerating === true):"AI 正在出题..." loader
 * - 场景 3(question 存在 && status === 'unanswered'):
 *     题目文本 + 输入框 + "📝 提交答案" / "⏭ 跳过看答案" 两按钮
 * - 场景 4(isGrading === true):"AI 正在批改..." loader
 * - 场景 5(status === 'answered'):
 *     用户答案 + AI 反馈(2 维度星星 + 一句话)+ 参考答案 + "✏️ 重新答题" 按钮
 * - 场景 6(status === 'skipped'):
 *     "⏭ 已跳过" + 参考答案 + "✏️ 现在答题" 按钮(回到场景 3)
 *
 * 软门槛(铁律 8):
 * - 任何状态都不阻塞外层"展开到 Round X →"按钮(由 Tree 控制,本组件不知道也不管)
 * - 题目数据存 layeredReadingState.questions(铁律 8 不进 globalChatHistory)
 *
 * 视觉:朴素 Tailwind 默认样式;视觉精修留待后续。
 */

import React, { useCallback, useState } from 'react';
import { ClipboardList, Loader2, Send, SkipForward, Star, RotateCcw } from 'lucide-react';
import type {
  LayeredReadingQuestion,
  LayeredReadingQuestionType,
} from '@/types';

export interface LayeredReadingQuestionBoxProps {
  /** 题型(决定按钮文案 + 维度对应) */
  questionType: LayeredReadingQuestionType;
  /** 题目数据;null = 还未生成(场景 1) */
  question: LayeredReadingQuestion | null;
  /** 正在调 AI 出题(场景 2) */
  isGenerating: boolean;
  /** 正在调 AI 批改(场景 4) */
  isGrading: boolean;
  /** AI 出题失败信息(可选) */
  generateError?: string | null;
  /** AI 批改失败信息(可选) */
  gradeError?: string | null;
  /** 用户点"📝 答题"按钮触发 */
  onGenerate: () => void;
  /** 用户提交答案触发(传入答案文本,会更新 question.userAnswer + status='answered',然后调 AI 批改) */
  onSubmit: (userAnswer: string) => void;
  /** 用户点"⏭ 跳过"触发(更新 status='skipped',直接显示参考答案) */
  onSkip: () => void;
  /** 用户点"✏️ 重新答题"触发(清空 userAnswer + aiGrade,回到 'unanswered') */
  onResetAnswer: () => void;
}

const TYPE_LABELS: Record<LayeredReadingQuestionType, string> = {
  story: '故事题',
  structure: '结构题',
  application: '细节应用题',
};

/** 渲染 ★1-5 评分(实心星 + 空心星) */
const StarRating: React.FC<{ stars: 1 | 2 | 3 | 4 | 5 }> = ({ stars }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${stars} 星`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`w-3 h-3 ${n <= stars ? 'text-amber-500 fill-amber-500' : 'text-stone-300'}`}
        aria-hidden
      />
    ))}
  </span>
);

export const LayeredReadingQuestionBox: React.FC<LayeredReadingQuestionBoxProps> = ({
  questionType,
  question,
  isGenerating,
  isGrading,
  generateError,
  gradeError,
  onGenerate,
  onSubmit,
  onSkip,
  onResetAnswer,
}) => {
  const [draft, setDraft] = useState('');

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text || isGrading) return;
    onSubmit(text);
    setDraft('');
  }, [draft, isGrading, onSubmit]);

  // ─── 场景 1:还未生成 ───
  if (!question && !isGenerating) {
    return (
      <div className="mt-3 border border-stone-200 rounded-md bg-stone-50/50 p-2.5">
        <button
          type="button"
          onClick={onGenerate}
          className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-stone-50 inline-flex items-center gap-1.5"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          📝 答题({TYPE_LABELS[questionType]})
        </button>
        {generateError && (
          <p className="text-[11px] text-rose-600 mt-1.5">{generateError}</p>
        )}
      </div>
    );
  }

  // ─── 场景 2:生成中 ───
  if (isGenerating) {
    return (
      <div className="mt-3 border border-stone-200 rounded-md bg-stone-50/50 p-2.5">
        <div className="text-xs text-stone-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI 正在出{TYPE_LABELS[questionType]}…
        </div>
      </div>
    );
  }

  if (!question) return null; // TS 兜底:此分支理论上不到达

  // ─── 场景 3 / 4 / 5 / 6:有 question,按 status 分支 ───
  return (
    <div className="mt-3 border border-stone-200 rounded-md bg-amber-50/30 p-2.5 space-y-2">
      {/* 题型标签 + 题目 */}
      <div>
        <div className="text-[10px] font-bold text-amber-800 mb-1 inline-flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {TYPE_LABELS[questionType]}
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">{question.questionText}</p>
      </div>

      {/* 状态分支 */}
      {question.status === 'unanswered' && !isGrading && (
        // 场景 3:待答
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="用自己的话答…(Ctrl/Cmd+Enter 提交)"
            rows={3}
            className="w-full text-xs px-2 py-1.5 border border-stone-200 rounded bg-white resize-y min-h-[60px]"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!draft.trim()}
              className="text-[11px] px-2.5 py-1 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              提交答案
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="text-[11px] px-2.5 py-1 rounded border border-stone-300 bg-white text-slate-600 hover:bg-stone-50 inline-flex items-center gap-1"
            >
              <SkipForward className="w-3 h-3" />
              跳过看答案
            </button>
          </div>
        </div>
      )}

      {isGrading && (
        // 场景 4:批改中
        <div className="text-xs text-stone-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI 正在批改…
        </div>
      )}

      {question.status === 'answered' && !isGrading && (
        // 场景 5:已答 + 批改完
        <div className="space-y-2">
          {/* 用户答案 */}
          <div className="bg-white rounded border border-stone-200 p-2">
            <div className="text-[10px] font-bold text-slate-500 mb-1">你的答案</div>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {question.userAnswer}
            </p>
          </div>

          {/* AI 批改维度 */}
          {question.aiGrade && (
            <div className="bg-white rounded border border-stone-200 p-2 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500">AI 批改</div>
              {question.aiGrade.dimensions.map((d, i) => (
                <div key={i} className="text-xs text-slate-700 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{d.label}</span>
                    <StarRating stars={d.stars} />
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-1">{d.comment}</p>
                </div>
              ))}
            </div>
          )}

          {gradeError && (
            <p className="text-[11px] text-rose-600">{gradeError}</p>
          )}

          {/* 参考答案 */}
          <div className="bg-white rounded border border-stone-200 p-2">
            <div className="text-[10px] font-bold text-slate-500 mb-1">参考答案</div>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {question.referenceAnswer}
            </p>
          </div>

          {/* 重答按钮(铁律 8 软门槛) */}
          <button
            type="button"
            onClick={onResetAnswer}
            className="text-[11px] px-2 py-0.5 rounded border border-stone-300 bg-white text-slate-600 hover:bg-stone-50 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            重新答题
          </button>
        </div>
      )}

      {question.status === 'skipped' && !isGrading && (
        // 场景 6:已跳过(参考答案 + 现在答题按钮)
        <div className="space-y-2">
          <div className="text-[11px] text-stone-500 inline-flex items-center gap-1">
            <SkipForward className="w-3 h-3" />
            已跳过
          </div>
          <div className="bg-white rounded border border-stone-200 p-2">
            <div className="text-[10px] font-bold text-slate-500 mb-1">参考答案</div>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {question.referenceAnswer}
            </p>
          </div>
          <button
            type="button"
            onClick={onResetAnswer}
            className="text-[11px] px-2 py-0.5 rounded border border-stone-300 bg-white text-slate-600 hover:bg-stone-50 inline-flex items-center gap-1"
          >
            <ClipboardList className="w-3 h-3" />
            现在答题
          </button>
        </div>
      )}
    </div>
  );
};
