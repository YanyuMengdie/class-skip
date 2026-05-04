import type { ScaffoldingPhase, TutorScaffoldingContext } from '@/types';

/** A 档：固定写入 system，约束回合节奏与篇幅（与 P2 教学法叠加） */
export function getScaffoldingSystemAddendum(): string {
  return `

【支架式动态辅导·全局规则】
- 除非下方「本轮辅导元指令」明确要求进入结构化讲解，否则单条回复优先控制在约 900 字以内（中文），避免百科全书式长文。
- 默认节奏：先澄清或追问 1～2 问 → 等学生再答 → 再决定是否给予支架；不要首条回复就长篇讲义。
- 给支架时：先线索、子问题，后结论；禁止直接粘贴「标准答案全文」。
- 始终锚定用户提供的课程材料；无依据处明确说明。`;
}

function phaseDirectives(phase: ScaffoldingPhase): string[] {
  switch (phase) {
    case 'socratic_probe':
      return [
        '只提 1～2 个追问或澄清问题，帮助学生把思路说清楚。',
        '本回合禁止展开知识点长讲解（零大段讲义）。',
      ];
    case 'light_hint':
      return [
        '最多给出 2 条关键词或线索，每条不超过约 40 字。',
        '仍须先追问一句，再给出线索；禁止直接给完整答案。',
      ];
    case 'sub_questions':
      return [
        '列出 2 个非常具体、可回答的小问题，引导学生逐步思考。',
        '不要求长文；不要代替学生完成推理。',
      ];
    case 'structured_explain':
      return [
        '可用小标题 + 最多 5 条要点，必须引用材料中的概念名；仍要简短。',
        '讲解后末尾加 1 个追问，检验学生是否跟上。',
      ];
    default:
      return ['按苏格拉底与支架原则灵活回应。'];
  }
}

/** 附在用户消息末尾的隐形元指令（模型可见；勿向学生朗读本段标题） */
export function buildScaffoldingTurnDirective(ctx: TutorScaffoldingContext): string {
  const lines = [
    '【本轮辅导元指令·勿向学生复述本段】',
    `- 学生表述质量：${ctx.quality}`,
    `- 连续薄弱轮次：${ctx.consecutiveWeakStreak}`,
    `- 本轮策略：${ctx.phase}`,
    `- 累计用户轮次：${ctx.totalUserTurns}`,
    '- 你必须：',
    ...phaseDirectives(ctx.phase).map((x) => `  · ${x}`),
  ];
  return lines.join('\n');
}
