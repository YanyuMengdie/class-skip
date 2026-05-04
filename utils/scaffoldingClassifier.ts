/**
 * P4 支架式辅导：纯启发式质量分档 + 策略相位（无网络）
 *
 * 调参说明（可改阈值）：
 * - `weak` 与 `partial` 边界：默认以字符数 15 / 80 为界；中文「词数」用按空白与常见标点切分后的片段数近似。
 * - `partial`：中等长度但仍缺连接词时归 partial；有连接词且够长则倾向 strong。
 * - `consecutiveWeakStreak`：在 **本轮用户发送后** 更新——若本轮为 strong 则 **归零**；若为 weak/empty/partial 则 **+1**。
 */

import type { LearnerTurnQuality, ScaffoldingPhase } from '@/types';

const CONNECTORS =
  /因为|所以|如果|定义|区别|因此|意味着|但是|然而|虽然|由于|从而|即|换言之|例如|综上|首先|其次/i;

function approxWordishSegments(t: string): number {
  const parts = t.split(/[\s，。；、！？,.;]+/).filter((x) => x.length > 0);
  return parts.length;
}

function hasConnector(t: string): boolean {
  return CONNECTORS.test(t);
}

function sentenceLikeCount(t: string): number {
  return t.split(/[。！？.!?]+/).filter((s) => s.trim().length > 2).length;
}

/**
 * 启发式判断学生单轮输入质量（与 LLM 分类并存时，LLM 可覆盖除 neutral 外档位）
 */
export function heuristicQuality(text: string): LearnerTurnQuality {
  const t = text.trim();
  if (!t) return 'empty';

  const len = t.length;
  const segments = approxWordishSegments(t);
  const multiSentence = sentenceLikeCount(t) >= 2;

  if (len >= 80 || (multiSentence && hasConnector(t)) || (len >= 40 && hasConnector(t) && segments >= 6)) {
    return 'strong';
  }

  if (len < 15 || (segments <= 5 && !hasConnector(t) && len < 40)) {
    return 'weak';
  }

  if (len >= 15 && len <= 80 && !hasConnector(t) && segments < 8) {
    return 'partial';
  }

  if (len > 80) return 'strong';

  return hasConnector(t) ? 'strong' : 'partial';
}

export interface ComputeScaffoldingPhaseArgs {
  quality: LearnerTurnQuality;
  /** 包含本轮在内的连续薄弱轮数（本轮若为 strong 则调用方应先归零再传入） */
  consecutiveWeakStreak: number;
  totalUserTurns: number;
}

/**
 * 由质量与连续薄弱轮数决定本轮模型策略相位。
 * - `strong` 时 streak 应由调用方归零；此处对 strong 走「高阶追问」分支。
 */
export function computeScaffoldingPhase(args: ComputeScaffoldingPhaseArgs): ScaffoldingPhase {
  const { quality, consecutiveWeakStreak: s, totalUserTurns } = args;

  if (quality === 'neutral') return 'socratic_probe';

  if (quality === 'empty') return 'socratic_probe';

  if (quality === 'strong') {
    return totalUserTurns >= 4 ? 'sub_questions' : 'socratic_probe';
  }

  if ((quality === 'weak' || quality === 'partial') && s >= 4) {
    return 'structured_explain';
  }

  if (quality === 'weak' && s >= 2) {
    return 'light_hint';
  }

  if (quality === 'partial' && s >= 2) {
    return 'sub_questions';
  }

  return 'socratic_probe';
}
