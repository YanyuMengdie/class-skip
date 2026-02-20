/**
 * 地牢学习游戏工具函数
 * D20 骰子概率计算：学习时间越长，高点数（15-20）概率越高
 */

/**
 * 根据学习时间（分钟）计算 D20 骰子概率分布
 * 学习时间越长，15-20 的概率越高
 * 
 * @param studyMinutes 累计学习时间（分钟）
 * @returns 返回 1-20 的概率数组（总和为 1）
 */
export function calculateD20Probability(studyMinutes: number): number[] {
  const prob = new Array(20).fill(0);
  
  // 基础概率：均匀分布
  const baseProb = 1 / 20;
  
  // 高点数（15-20）的加成系数
  // 学习时间越长，加成越高（最高到 0.7，即 15-20 占 70%）
  const highBonus = Math.min(0.3 + (studyMinutes / 120) * 0.4, 0.7);
  
  // 低点数（1-10）的惩罚系数
  const lowPenalty = Math.max(0.3 - (studyMinutes / 120) * 0.2, 0.1);
  
  // 中点数（11-14）保持相对稳定
  const midProb = (1 - highBonus * 6 - lowPenalty * 10) / 4;
  
  // 分配概率
  for (let i = 0; i < 20; i++) {
    if (i < 10) {
      // 1-10: 低点数，概率降低
      prob[i] = (lowPenalty * 10) / 10;
    } else if (i < 14) {
      // 11-14: 中点数
      prob[i] = midProb;
    } else {
      // 15-20: 高点数，概率提高
      prob[i] = highBonus / 6;
    }
  }
  
  // 归一化确保总和为 1
  const sum = prob.reduce((a, b) => a + b, 0);
  return prob.map(p => p / sum);
}

/**
 * 投掷 D20 骰子
 * 
 * @param studyMinutes 累计学习时间（分钟）
 * @returns 1-20 的随机结果
 */
export function rollD20(studyMinutes: number): number {
  const probabilities = calculateD20Probability(studyMinutes);
  const rand = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < 20; i++) {
    cumulative += probabilities[i];
    if (rand <= cumulative) {
      return i + 1;
    }
  }
  
  return 20; // Fallback
}

/**
 * 根据学习时间计算获得骰子的数量
 * 例如：每 25 分钟学习获得 1 个 D20
 * 
 * @param studyMinutes 学习时间（分钟）
 * @returns 获得的骰子数量
 */
export function calculateDiceEarned(studyMinutes: number): number {
  // 每 25 分钟获得 1 个 D20
  return Math.floor(studyMinutes / 25);
}

/**
 * 格式化学习时间显示
 */
export function formatStudyTime(minutes: number): string {
  if (minutes < 60) {
    return `${Math.floor(minutes)} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours} 小时 ${mins > 0 ? mins + ' 分钟' : ''}`;
}
