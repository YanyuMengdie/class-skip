/**
 * 递进阅读 Round 2/3 内容 + 溯源跳转标签(铁律 6 落地)。
 *
 * 设计原则:
 * - 内容(content)与溯源标签视觉分离,标签仅在 sourcePage + sourceLocation 都存在时渲染
 * - 标签可点击 → 调 onJumpToPage(page1Based) → App.tsx 已有 setCurrentIndex 路径
 * - **不复用** SkimPanel 的任何代码(铁律 8);仅复用 App.tsx 的 setCurrentIndex 行为(标准 callback 注入)
 * - 朴素 Tailwind 默认样式;视觉精修留待后续
 */

import React from 'react';
import { ExternalLink } from 'lucide-react';

export interface RoundContentWithSourceProps {
  /** 内容文本(纯文本或简单 markdown,本组件不做 markdown 解析) */
  content: string;
  /** 溯源页码(1-based);未提供时不渲染标签 */
  sourcePage?: number;
  /** 位置描述;未提供时不渲染标签 */
  sourceLocation?: string;
  /** 点击溯源标签的回调;未提供时标签仅显示不可点击 */
  onJumpToPage?: (page1Based: number) => void;
}

export const RoundContentWithSource: React.FC<RoundContentWithSourceProps> = ({
  content,
  sourcePage,
  sourceLocation,
  onJumpToPage,
}) => {
  const hasSource =
    typeof sourcePage === 'number' &&
    Number.isFinite(sourcePage) &&
    sourcePage >= 1 &&
    typeof sourceLocation === 'string' &&
    sourceLocation.trim().length > 0;
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</div>
      {hasSource && (
        <button
          type="button"
          onClick={onJumpToPage ? () => onJumpToPage(sourcePage as number) : undefined}
          disabled={!onJumpToPage}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border ${
            onJumpToPage
              ? 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-800 cursor-pointer'
              : 'bg-stone-50 border-stone-200 text-stone-400 cursor-default'
          }`}
          title={onJumpToPage ? `跳转到第 ${sourcePage} 页` : '溯源标签'}
        >
          <ExternalLink className="w-3 h-3" />
          第 {sourcePage} 页 · {sourceLocation}
        </button>
      )}
    </div>
  );
};
