import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LayeredReadingRound3Unit } from '@/types';

/**
 * 阶段 5.2 新增:Round 3 结构化 7 块学习单元渲染组件。
 *
 * 渲染规则(对齐 INQUIRY §5.2):
 * - 7 块顺序固定不可重排,与 LayeredReadingRound3Unit 字段顺序一致
 * - figureGuide 缺失则整块不渲染(标题一起省)
 * - answerSkeleton 块视觉特殊(浅黄底强调),其余 6 块平视
 * - 每块标题带 emoji,emoji 是标题的一部分
 * - markdown 内容用 react-markdown + remark-gfm(项目内既有依赖,与
 *   ExplanationPanel / SkimPanel / SavedArtifactPreview 等 14+ 文件一致)。
 *   prompt 输出 ** 加粗 / - bullet / 1. 编号列表都被真渲染,不显示原始字符。
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

/** Block 内 markdown 元素映射;视觉风格与既有 layered text-[13px] 系列一致 */
const blockMarkdownComponents: Components = {
  p: ({ node, ...props }) => (
    <p className="text-[13px] text-stone-700 leading-relaxed mb-2 last:mb-0" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="list-disc list-outside ml-4 space-y-1.5 my-1 text-[13px] text-stone-700 leading-relaxed" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal list-outside ml-4 space-y-1.5 my-1 text-[13px] text-stone-700 leading-relaxed" {...props} />
  ),
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-slate-800" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  code: ({ node, ...props }) => (
    <code className="bg-stone-100 text-slate-700 px-1 py-0.5 rounded text-[12px] font-mono" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote className="border-l-2 border-stone-300 pl-2 my-1 text-stone-600" {...props} />
  ),
};

function Block({ title, content, highlight }: BlockProps) {
  return (
    <div
      className={
        highlight
          ? 'rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2'
          : 'px-1'
      }
    >
      <div className="text-[13px] font-semibold text-stone-700 mb-2">{title}</div>
      <div className="text-[13px] text-stone-700 leading-relaxed">
        <ReactMarkdown components={blockMarkdownComponents} remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const Round3UnitView: React.FC<Props> = ({ unit, onJumpToPage }) => {
  return (
    <div className="space-y-4 ml-2 border-l-2 border-stone-100 pl-2.5 mt-2">
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
