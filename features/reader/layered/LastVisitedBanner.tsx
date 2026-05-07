/**
 * 递进阅读模式 — 学习状态记忆 banner(铁律 8 / 用户拍板交互维度 g)。
 *
 * 触发逻辑(由 Panel 计算 visible 后传入):
 * - 用户每次切换/展开树节点 / 答题完成时 onUpdateLastVisited 由 Tree/Panel 内部维护
 * - 进入 panel 时(距上次时间 > 1 小时):banner 显示
 * - 本次会话 useState 标记关闭后不再显示;切走再切回会重新评估
 *
 * 视觉行为:
 * - 显示「📍 上次你看到 module X「storyTitle」的 Round Y[ branch Z]」
 * - 两按钮:「继续阅读」(自动展开到对应位置)/「从头开始」(关闭 banner,状态不变)
 *
 * 实现细节:
 * - branchId 仅在 round=2/3 时有意义;round=1 时文案不带 branch
 * - 视觉:朴素 Tailwind 默认样式
 */

import React from 'react';
import { MapPin, X } from 'lucide-react';
import type {
  LayeredReadingLastVisited,
  LayeredReadingModule,
} from '@/types';

export interface LastVisitedBannerProps {
  lastVisited: LayeredReadingLastVisited;
  modules: LayeredReadingModule[];
  /** 用户点"继续阅读" → 调用方据 lastVisited 自动展开 + scroll */
  onContinue: () => void;
  /** 用户点"从头开始" / "关闭" → 关闭 banner,状态不变 */
  onDismiss: () => void;
}

export const LastVisitedBanner: React.FC<LastVisitedBannerProps> = ({
  lastVisited,
  modules,
  onContinue,
  onDismiss,
}) => {
  const moduleIdx = modules.findIndex((m) => m.id === lastVisited.moduleId);
  if (moduleIdx < 0) {
    // 防御:如果 module 已被删/重生成,不显示 banner
    return null;
  }
  const moduleNum = moduleIdx + 1;
  const moduleStoryTitle = modules[moduleIdx].storyTitle;

  // 文案分两种:round=1 无 branch / round=2/3 有 branch(澄清 E)
  const branchPart =
    lastVisited.round !== 1 && lastVisited.branchId
      ? ` 的 branch ${lastVisited.branchId.replace(`${lastVisited.moduleId}.`, '')}`
      : '';
  const text = `上次你看到 module ${moduleNum}「${moduleStoryTitle}」的 Round ${lastVisited.round}${branchPart}`;

  return (
    <div className="shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
      <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      <p className="text-xs text-amber-900 flex-1 min-w-0 truncate">{text}</p>
      <button
        type="button"
        onClick={onContinue}
        className="text-[11px] px-2 py-0.5 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 shrink-0"
      >
        继续阅读
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[11px] px-2 py-0.5 rounded border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 shrink-0"
      >
        从头开始
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-stone-400 hover:text-stone-600 shrink-0"
        aria-label="关闭"
        title="关闭"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
