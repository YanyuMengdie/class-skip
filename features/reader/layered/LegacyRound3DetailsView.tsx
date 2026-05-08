import React from 'react';
import type { LayeredReadingRound3Detail } from '@/types';
import { RoundContentWithSource } from '@/features/reader/layered/RoundContentWithSource';

/**
 * 阶段 5.2 新增:旧 round3Details 数据的 fallback 渲染组件。
 *
 * 这是从 LayeredReadingTree.tsx 中抽出的旧渲染逻辑,JSX 完全一致,
 * 只在 branch.round3Unit 不存在且 branch.round3Details 存在时渲染。
 *
 * 不要修改这个组件——任何修改都可能破坏旧数据用户的体验。
 * 旧 round3Details 类型 / KIND_LABELS / kind chip 视觉一字不改。
 */

const KIND_LABELS: Record<string, string> = {
  term: '术语',
  experiment: '实验',
  figure: '图表',
  evidence: '证据',
  comparison: '对比',
};

interface Props {
  details: LayeredReadingRound3Detail[];
  onJumpToPage?: (page1Based: number) => void;
}

const LegacyRound3DetailsView: React.FC<Props> = ({ details, onJumpToPage }) => {
  return (
    <div className="space-y-1.5 ml-2 border-l-2 border-stone-100 pl-2.5">
      {details.map((d: LayeredReadingRound3Detail) => (
        <div key={d.id} className="text-xs text-slate-700 space-y-1">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
              {KIND_LABELS[d.kind] ?? d.kind}
            </span>
            <span className="font-bold text-slate-800">{d.label}</span>
          </div>
          <RoundContentWithSource
            content={d.description}
            sourcePage={d.sourcePage}
            sourceLocation={d.sourceLocation}
            onJumpToPage={onJumpToPage}
          />
        </div>
      ))}
    </div>
  );
};

export default LegacyRound3DetailsView;
