import type { DisciplineBand } from '@/types';
import { getCorePedagogySnippet } from '@/data/pedagogyCore';

/** P1：四类学科教学法要点（保温闪卡 / Quiz；对话层见 buildDialogueTeachingSystemPrompt） */
export const DISCIPLINE_TEACHING_PROFILES: Record<
  DisciplineBand,
  { labelZh: string; aiInstruction: string }
> = {
  humanities_social: {
    labelZh: '文科与社会科学',
    aiInstruction: `教学法：论证逻辑、多维度观点、理论对比。闪卡与测验侧重「因果、前提—结论、反例、理论适用边界」；题干可偏追问式，避免纯背定义。`,
  },
  business_mgmt: {
    labelZh: '商业与管理',
    aiInstruction: `教学法：案例、计划自洽、实战。题干可包装成「投资者/质疑者」情境，挑战假设与商业逻辑是否自洽。`,
  },
  stem: {
    labelZh: 'STEM',
    aiInstruction: `教学法：机制、过程、推导链条。侧重「若…则下游如何变」的机制题与概念链；不要把重心放在纯数值计算结果。`,
  },
  arts_creative: {
    labelZh: '艺术与创意',
    aiInstruction: `教学法：意图、风格、批判性反思。作为反思引导者：问创作意图、形式选择理由；不评判美丑，评思考深度与表述清晰度。`,
  },
  unspecified: {
    labelZh: '通用',
    aiInstruction: `教学法：通用可提取记忆点，略偏高频术语与易混点；与未分学科时一致。`,
  },
};

export function getDisciplinePromptSnippet(band: DisciplineBand): string {
  return DISCIPLINE_TEACHING_PROFILES[band]?.aiInstruction ?? DISCIPLINE_TEACHING_PROFILES.unspecified.aiInstruction;
}

/**
 * P2：备考台 / 自适应导师对话用 system 片段 = 核心教学法 + 学科侧重 + 输出约束。
 * （与保温闪卡解耦；闪卡侧仅保留记忆向短提示。）
 */
export function buildDialogueTeachingSystemPrompt(disciplineBand: DisciplineBand): string {
  return [
    getCorePedagogySnippet(),
    '',
    '【学科对话侧重】',
    getDisciplinePromptSnippet(disciplineBand),
    '',
    '【输出约束】',
    '使用简体中文。数学公式用 LaTeX：行内 $...$，独立 $$...$$。可用 Markdown 标题与列表；避免无根据的页码引用。',
  ].join('\n');
}
