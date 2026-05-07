/**
 * 递进阅读模式（layered reading）—— 阶段 1 空壳
 *
 * 设计原则（来自 docs/inquiries/LAYERED_READING_INQUIRY.md / LAYERED_READING_PLAN.md）：
 * - 与 SkimPanel 数据完全独立（铁律 2）：本组件**绝不**读取 / 写入 FilePersistedState.studyMap
 * - 与 chatWithSkimAdaptiveTutor / chatWithAdaptiveTutor 完全隔离（铁律 1）：阶段 2 起会用独立的 chatWithLayeredReadingTutor
 * - 阶段 1 不调任何 AI、不渲染树状 UI、不出题——仅占位空壳
 *
 * 阶段 1 验收：用户切到 viewMode === 'layered' 能看到本组件渲染；切回 'deep' 或 'skim' 行为正常。
 */

import React from 'react';
import type { LayeredReadingState } from '@/types';

export interface LayeredReadingPanelProps {
  /** 本场 PDF 全文（阶段 2 起用于 module 生成 prompt） */
  fullText: string | null;
  /** PDF dataURL（阶段 2 起按需）。当前不消费 */
  pdfDataUrl: string | null;
  /** 文件名（阶段 2 起用于 UI 显示） */
  fileName: string | null;
  /** 本模式独立持久化状态（与 studyMap 无关，铁律 2） */
  layeredReadingState: LayeredReadingState | null;
  /** 状态写入回调，由 App.tsx 注入；阶段 1 不调用 */
  setLayeredReadingState: React.Dispatch<React.SetStateAction<LayeredReadingState | null>>;
}

export const LayeredReadingPanel: React.FC<LayeredReadingPanelProps> = (_props) => {
  return (
    <div className="h-full flex flex-col items-center justify-center text-stone-400 bg-white">
      <h2 className="text-base font-bold text-slate-600">递进阅读模式</h2>
      <p className="text-xs mt-2">阶段 2 实施后会显示 Round 1 故事树</p>
    </div>
  );
};
