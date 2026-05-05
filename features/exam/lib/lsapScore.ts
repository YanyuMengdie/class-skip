import type { LSAPBKTState, LSAPContentMap } from '@/types';

/**
 * 与 `ExamPredictionPanel` 一致的加权 BKT 预测分（0–100）。
 * 单一实现源，避免两处公式漂移。
 */
export function computePredictedScore(contentMap: LSAPContentMap, bktState: LSAPBKTState): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const kc of contentMap.kcs) {
    const p = bktState[kc.id] ?? 0;
    const w = kc.examWeight || 1;
    weightedSum += p * w;
    totalWeight += w;
  }
  if (totalWeight <= 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}
