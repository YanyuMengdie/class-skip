/**
 * 贝叶斯知识追踪 (BKT) 单步更新
 * P(Lt|obs) 根据观测 correct/incorrect 更新掌握概率
 */

export interface BKTParams {
  /** 初始未掌握概率 */
  pL0?: number;
  /** 学习/转移概率 (guess 学会) */
  pT?: number;
  /** 猜对概率 */
  pG?: number;
  /** 滑脱概率 (本会但做错) */
  pS?: number;
}

const DEFAULT_PARAMS: Required<BKTParams> = {
  pL0: 0.5,
  pT: 0.3,
  pG: 0.2,
  pS: 0.1
};

/**
 * 单次观测后更新 pMastery
 * @param pMastery 当前掌握概率 (0-1)
 * @param observedCorrect 本次是否答对；partial 可传入 0.5 或先转为 boolean
 * @param params 可选 BKT 参数
 */
export function updateBKT(
  pMastery: number,
  observedCorrect: boolean,
  params?: BKTParams
): number {
  const { pL0, pT, pG, pS } = { ...DEFAULT_PARAMS, ...params };
  // P(correct | L=1) = 1 - pS; P(correct | L=0) = pG
  // P(incorrect | L=1) = pS; P(incorrect | L=0) = 1 - pG
  const pCorrectGivenMastered = 1 - pS;
  const pCorrectGivenNotMastered = pG;
  const pObs = observedCorrect
    ? pMastery * pCorrectGivenMastered + (1 - pMastery) * pCorrectGivenNotMastered
    : pMastery * pS + (1 - pMastery) * (1 - pCorrectGivenNotMastered);
  if (pObs <= 0) return pMastery;
  const pMasteredGivenObs = observedCorrect
    ? (pMastery * pCorrectGivenMastered) / pObs
    : (pMastery * pS) / pObs;
  // 学习：未掌握者以 pT 概率学会
  const afterLearning = pMasteredGivenObs + (1 - pMasteredGivenObs) * pT;
  return Math.max(0, Math.min(1, afterLearning));
}
