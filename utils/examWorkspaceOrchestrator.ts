/**
 * M3：备考台苏格拉底探测编排（纯函数）
 *
 * 与 P4 `computeScaffoldingPhase` 协同：本模块产出 probeMode / bloomTarget 作为「内容意图」，
 * 实际执行节奏仍以 `ScaffoldingPhase`（传入的 phase）为准；若与 phase 冲突，以 P4 phase 为执行层。
 *
 * 默认策略概要：
 * - 首轮（prev 缺省由调用方设为 direct + bloom=1）偏正面探测。
 * - strong 且连续薄弱轮次低：提升 bloom（上限 3）；若 bloom≥2 且本 KC 尚未做过 stress，则切 stress 一次。
 * - weak/empty：remediate 意图；structured_explain 时更偏补漏。
 * - stress 由调用方在回复后标记「本 KC 已完成 stress」，编排器不再重复触发。
 */

import type { LearnerTurnQuality, ScaffoldingPhase, SocraticProbeMode } from '@/types';

export interface OrchestratorInput {
  prevProbeMode: SocraticProbeMode;
  prevBloomTarget: 1 | 2 | 3;
  quality: LearnerTurnQuality;
  /** 本轮更新后的连续薄弱轮（strong 已归零） */
  consecutiveWeakStreak: number;
  covered: number;
  total: number;
  /** 本 KC 是否已跑过 stress 轮 */
  stressDoneForKc: boolean;
  /** P4 本轮相位（执行层权威） */
  phase: ScaffoldingPhase;
}

export interface OrchestratorOutput {
  probeMode: SocraticProbeMode;
  bloomTarget: 1 | 2 | 3;
}

function clampBloom(n: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Math.round(n))) as 1 | 2 | 3;
}

export function computeNextProbeState(input: OrchestratorInput): OrchestratorOutput {
  const {
    prevProbeMode,
    prevBloomTarget,
    quality,
    consecutiveWeakStreak: streak,
    stressDoneForKc,
    phase,
  } = input;

  const lowStreak = streak < 2;

  // P4 协同：若已进入结构化讲解且学生仍空/弱，内容意图以补漏为主
  if (phase === 'structured_explain' && (quality === 'weak' || quality === 'empty')) {
    return {
      probeMode: 'remediate',
      bloomTarget: clampBloom(Math.max(1, prevBloomTarget - 1)),
    };
  }

  if (quality === 'weak' || quality === 'empty') {
    return {
      probeMode: 'remediate',
      bloomTarget: clampBloom(Math.max(1, prevBloomTarget - 1)),
    };
  }

  if (quality === 'partial' && streak >= 2) {
    return { probeMode: 'remediate', bloomTarget: prevBloomTarget };
  }

  if (quality === 'neutral') {
    return { probeMode: 'direct', bloomTarget: prevBloomTarget };
  }

  // strong：抬升 bloom，并有机会进入 stress（每 KC 一次）
  if (quality === 'strong' && lowStreak) {
    const nextBloom = clampBloom(prevBloomTarget + 1);
    if (nextBloom >= 2 && !stressDoneForKc && prevProbeMode !== 'stress') {
      return { probeMode: 'stress', bloomTarget: nextBloom };
    }
    return { probeMode: 'direct', bloomTarget: nextBloom };
  }

  if (quality === 'strong') {
    return { probeMode: 'direct', bloomTarget: prevBloomTarget };
  }

  // partial 且 streak 低
  return { probeMode: 'direct', bloomTarget: prevBloomTarget };
}
