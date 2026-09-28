/** Retained history is readable; no new plans, detection or turns may be generated. */
export function assertLectureCaseGenerationEnabled(): void {
  throw new Error('案例式领读已停止生成，已有记录仍可回看。请在领读中使用“陪我想通这个”。');
}
