import React from 'react';
import type { LayeredReadingRound3Unit } from '@/types';

/**
 * 阶段 5.2 新增:Round 3 结构化 7 块学习单元渲染组件。
 *
 * 渲染规则(对齐 INQUIRY §5.2):
 * - 7 块顺序固定不可重排,与 LayeredReadingRound3Unit 字段顺序一致
 * - figureGuide 缺失则整块不渲染(标题一起省)
 * - answerSkeleton 块视觉特殊(浅黄底强调),其余 6 块平视
 * - 每块标题带 emoji,emoji 是标题的一部分
 * - markdown 内容用项目内既有渲染方式(whitespace-pre-wrap,与 RoundContentWithSource 一致)
 */

interface Props {
  unit: LayeredReadingRound3Unit;
  onJumpToPage?: (page: number) => void;
}

interface BlockProps {
  title: string;
  content: string;
  highlight?: boolean;
}

function Block({ title, content, highlight }: BlockProps) {
  return (
    <div
      className={
        highlight
          ? 'rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2'
          : 'px-1'
      }
    >
      <div className="text-[13px] font-semibold text-stone-700 mb-1">{title}</div>
      <div className="text-[13px] text-stone-700 leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

const Round3UnitView: React.FC<Props> = ({ unit, onJumpToPage }) => {
  return (
    <div className="space-y-3 ml-2 border-l-2 border-stone-100 pl-2.5 mt-2">
      <Block title="📍 这一节在回答什么问题?" content={unit.coreQuestion} />
      <Block title="⚙️ 机制链条" content={unit.mechanismChain} />
      <Block title="🏷️ 关键术语" content={unit.keyTerms} />
      {unit.figureGuide && (
        <Block title="📊 图/表/实验怎么读" content={unit.figureGuide} />
      )}
      <Block title="📝 考试最低答案骨架" content={unit.answerSkeleton} highlight />
      <Block title="⚠️ 易混点" content={unit.confusionPoints} />
      <Block title="✏️ 小题(细节应用)" content={unit.miniQuestion} />

      {/* 整份 unit 共享一个溯源 chip,对齐阶段 3 RoundContentWithSource pattern */}
      {unit.sourcePage > 0 && onJumpToPage && (
        <button
          type="button"
          onClick={() => onJumpToPage(unit.sourcePage)}
          className="text-[11px] text-stone-500 hover:text-stone-800 underline-offset-2 hover:underline"
        >
          📄 第 {unit.sourcePage} 页 · {unit.sourceLocation}
        </button>
      )}
    </div>
  );
};

export default Round3UnitView;
