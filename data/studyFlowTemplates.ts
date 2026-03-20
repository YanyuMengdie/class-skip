import type { StudyFlowTemplate, StudyFlowStep } from '../types';

let _stepSeq = 0;
const S = (
  order: number,
  label: string,
  description: string,
  action: StudyFlowStep['action'],
  target: StudyFlowStep['target'],
  estimatedMinutes: number,
  skippable: boolean,
  reasonForUser: string
): StudyFlowStep => ({
  id: `sf-${++_stepSeq}`,
  order,
  label,
  description,
  action,
  target,
  estimatedMinutes,
  skippable,
  reasonForUser,
});

/** 预置情境模板（MVP：熟悉度 × 紧迫度 × good） */
export const STUDY_FLOW_TEMPLATES: StudyFlowTemplate[] = [
  {
    scenarioKey: 'never_seen_d1_2_good',
    title: '冲刺 · 首次接触',
    steps: [
      S(1, '略读建立地图', '快速过一遍结构', 'slide_skim', 'skim', 10, false, '时间紧且材料新，先抓整体再深入'),
      S(2, '学习指南', '生成或阅读大纲', 'open_panel', 'studyGuide', 12, true, '用大纲把章节关系理清楚'),
      S(3, '考前预测摸底', '探测薄弱点', 'lsap_session', 'examPrediction', 15, false, '不知考什么时，用摸底找盲区'),
      S(4, '费曼一遍', '用自己的话讲清一个核心概念', 'open_panel', 'feynman', 10, true, '输出能暴露理解漏洞'),
      S(5, '陷阱清单', '扫一眼易错点', 'open_panel', 'trapList', 8, true, '临考前减少低级失误'),
    ],
  },
  {
    scenarioKey: 'never_seen_d3_7_good',
    title: '稳步 · 首次接触',
    steps: [
      S(1, '学习指南', '建立学习路径', 'open_panel', 'studyGuide', 15, false, '有几天缓冲，先规划再学'),
      S(2, '术语精确定义', '扫清概念障碍', 'open_panel', 'terminology', 12, true, '概念不清时先对齐定义'),
      S(3, '略读 + 精读交替', '按页推进', 'slide_skim', 'skim', 20, false, '新内容需要多看两遍幻灯'),
      S(4, '闪卡巩固', '记关键事实', 'open_panel', 'flashcard', 12, true, '碎片事实用闪卡最高效'),
      S(5, '思维导图', '串起章节', 'open_panel', 'mindMap', 10, true, '结构化能减轻记忆负担'),
    ],
  },
  {
    scenarioKey: 'never_seen_d8_plus_good',
    title: '从容 · 新手上路',
    steps: [
      S(1, '5 分钟启动', '低压力进入状态', 'open_panel', 'fiveMin', 5, false, '大范围考试，从极小块开始降低抵触'),
      S(2, '学习指南', '定长线计划', 'open_panel', 'studyGuide', 15, false, '时间充裕，先画路线图'),
      S(3, '略读', '先走完一遍', 'slide_skim', 'skim', 20, false, '第一遍只求有印象'),
      S(4, '考前速览', '建立信心提要', 'open_panel', 'examSummary', 10, true, '整理一份自己的提要'),
    ],
  },
  {
    scenarioKey: 'never_seen_no_exam_good',
    title: '无考试压力 · 新机探索',
    steps: [
      S(1, '5 分钟', '轻松开始', 'open_panel', 'fiveMin', 5, true, '没有截止日时，用短任务破冰'),
      S(2, '学习指南', '了解要讲什么', 'open_panel', 'studyGuide', 12, false, '先知道全貌再决定深度'),
      S(3, '精读当前页', '逐页 AI 讲解', 'slide_skim', 'deep', 15, false, '无考试时适合细嚼慢咽'),
    ],
  },
  {
    scenarioKey: 'learned_once_d1_2_good',
    title: '查漏补缺 · 学过一轮',
    steps: [
      S(1, '考前预测', '针对薄弱 KC', 'lsap_session', 'examPrediction', 18, false, 'BKT 偏低说明还有洞，先测再补'),
      S(2, '陷阱清单', '重看错题', 'open_panel', 'trapList', 10, false, '考试临近，错题优先级高'),
      S(3, '闪卡冲刺', '快速过一遍', 'open_panel', 'flashcard', 10, true, '巩固必须死记的点'),
      S(4, '考前速览', '最后一眼结构', 'open_panel', 'examSummary', 8, true, '把散点串成网'),
    ],
  },
  {
    scenarioKey: 'learned_once_d3_7_good',
    title: '巩固 · 学过一轮',
    steps: [
      S(1, '闪卡预热', '唤醒记忆', 'open_panel', 'flashcard', 8, true, '先用闪卡唤醒记忆'),
      S(2, '费曼', '挑一章讲给自己听', 'open_panel', 'feynman', 12, false, '能讲出来才算真懂'),
      S(3, '考前预测复习模式', '按单元过', 'lsap_session', 'examPrediction', 15, true, '按图谱查漏补缺'),
      S(4, '思维导图', '补全结构', 'open_panel', 'mindMap', 10, true, '可视化帮助长期记忆'),
    ],
  },
  {
    scenarioKey: 'reviewed_before_d1_2_good',
    title: '极速唤醒',
    steps: [
      S(1, '考前速览', '高频浓缩', 'open_panel', 'examSummary', 8, false, '已经较熟，用提要唤醒'),
      S(2, '陷阱清单', '防粗心', 'open_panel', 'trapList', 8, false, '高分往往输在细节'),
      S(3, '考前预测快测', '保持题感', 'lsap_session', 'examPrediction', 12, true, '少量探测维持状态'),
    ],
  },
  {
    scenarioKey: 'reviewed_before_no_exam_good',
    title: '保持手感',
    steps: [
      S(1, '闪卡', '轻量复习', 'open_panel', 'flashcard', 10, true, '无考试则维持即可'),
      S(2, '刁钻教授', '挑战性问答', 'open_panel', 'trickyProfessor', 10, true, '用刁钻问题检验深度'),
      S(3, '能量补给', '放松一下', 'rest', 'break', 5, true, '持续学习也要喘息'),
    ],
  },
  {
    scenarioKey: 'learned_once_no_exam_good',
    title: '无考 · 加深理解',
    steps: [
      S(1, '术语', '精细概念', 'open_panel', 'terminology', 10, true, '不赶进度时可以抠定义'),
      S(2, '费曼', '深度学习', 'open_panel', 'feynman', 15, false, '理解型学习适合费曼'),
      S(3, '思维导图', '输出结构', 'open_panel', 'mindMap', 12, true, '把脑中的网画出来'),
    ],
  },
  {
    scenarioKey: 'reviewed_before_d3_7_good',
    title: '熟练巩固',
    steps: [
      S(1, '考前预测', '看是否退步', 'lsap_session', 'examPrediction', 12, false, '掌握较好也需偶尔复测'),
      S(2, '闪卡', '维持细节', 'open_panel', 'flashcard', 8, true, '细节靠重复'),
      S(3, '考前速览', '换新角度', 'open_panel', 'examSummary', 8, true, '不同提要切换增强迁移'),
    ],
  },
];

export const STUDY_FLOW_BY_KEY: Record<string, StudyFlowTemplate> = Object.fromEntries(
  STUDY_FLOW_TEMPLATES.map((t) => [t.scenarioKey, t])
);

export function getTemplateForScenario(key: string): StudyFlowTemplate {
  return STUDY_FLOW_BY_KEY[key] || STUDY_FLOW_BY_KEY['learned_once_d3_7_good'] || STUDY_FLOW_TEMPLATES[0];
}
