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
  // anxious templates
  {
    scenarioKey: 'never_seen_d1_2_anxious',
    title: '急迫且焦虑 · 先稳住再冲刺',
    steps: [
      S(1, '稳定呼吸', '先缓解焦虑，避免空转', 'rest', 'break', 3, false, '情绪先稳定，效率才会上来'),
      S(2, '5 分钟启动', '先做最小任务', 'open_panel', 'fiveMin', 5, false, '降低启动阻力'),
      S(3, '考前预测摸底', '先找最薄弱点', 'lsap_session', 'examPrediction', 12, false, '焦虑时优先抓最关键缺口'),
      S(4, '陷阱清单', '补易错点', 'open_panel', 'trapList', 8, true, '快速减少考试失误'),
    ],
  },
  {
    scenarioKey: 'never_seen_d3_7_anxious',
    title: '焦虑过载 · 温和推进',
    steps: [
      S(1, '进入能量站', '先把心态拉稳', 'rest', 'break', 5, false, '降低紧张感，恢复可执行状态'),
      S(2, '学习指南', '确定今日一小段目标', 'open_panel', 'studyGuide', 10, false, '避免任务过大导致回避'),
      S(3, '略读一遍', '建立材料全景', 'slide_skim', 'skim', 10, false, '先整体，后细节'),
      S(4, '闪卡预热', '巩固最核心概念', 'open_panel', 'flashcard', 8, true, '让大脑获得“我做得到”的反馈'),
    ],
  },
  {
    scenarioKey: 'never_seen_d8_plus_anxious',
    title: '焦虑但不紧迫 · 低压开局',
    steps: [
      S(1, '进入能量站', '先调整情绪', 'rest', 'break', 5, false, '优先恢复稳定感'),
      S(2, '5 分钟启动', '小步开始', 'open_panel', 'fiveMin', 5, false, '通过小胜利建立行动惯性'),
      S(3, '学习指南', '拆分后续学习路径', 'open_panel', 'studyGuide', 12, false, '把未知变成可执行清单'),
    ],
  },
  // tired templates
  {
    scenarioKey: 'never_seen_d1_2_tired',
    title: '临近考试且疲惫 · 保命节奏',
    steps: [
      S(1, '能量补给', '短暂恢复', 'rest', 'break', 5, false, '疲惫状态先恢复再学习更划算'),
      S(2, '闪卡速刷', '低负担记忆', 'open_panel', 'flashcard', 8, false, '短回合更适合疲惫期'),
      S(3, '考前预测', '只做关键探测', 'lsap_session', 'examPrediction', 10, false, '把有限精力给高价值任务'),
    ],
  },
  {
    scenarioKey: 'never_seen_d3_7_tired',
    title: '疲惫期稳步推进',
    steps: [
      S(1, '5 分钟启动', '快速进入学习状态', 'open_panel', 'fiveMin', 5, false, '把门槛降到最低'),
      S(2, '学习指南', '只定一个小目标', 'open_panel', 'studyGuide', 8, false, '减少决策消耗'),
      S(3, '精读一小段', '聚焦一个概念', 'slide_skim', 'deep', 10, true, '小段高质量比长时低效率更好'),
    ],
  },
  {
    scenarioKey: 'never_seen_d8_plus_tired',
    title: '疲惫但不紧迫 · 轻量保温',
    steps: [
      S(1, '能量补给', '先恢复体力', 'rest', 'break', 5, false, '优先恢复'),
      S(2, '闪卡', '轻负担复习', 'open_panel', 'flashcard', 8, true, '保持手感'),
      S(3, '休息结束后再开新内容', '今天不强推重任务', 'rest', 'break', 3, true, '避免过度消耗'),
    ],
  },
  // P1：LearnerMood 扩展（先呼吸/减量 → 再预测或速览）
  {
    scenarioKey: 'never_seen_d8_plus_dont_want',
    title: '不想学 · 远考 · 先稳住再微量推进',
    steps: [
      S(1, '1 分钟呼吸', '只做放松，不评判自己', 'rest', 'break', 1, false, '降低启动阻力，避免空转'),
      S(2, '5 分钟超小步', '打开材料即可', 'open_panel', 'fiveMin', 5, true, '微量行动建立惯性'),
      S(3, '略读半章', '只看标题与图', 'slide_skim', 'skim', 8, true, '减量输入，避免过载'),
      S(4, '考前速览（可选）', '若还有余力再看提要', 'open_panel', 'examSummary', 8, true, '远考阶段以建立印象为主'),
    ],
  },
  {
    scenarioKey: 'never_seen_d1_2_want_anxious',
    title: '焦虑 · 临考 · 小步可控',
    steps: [
      S(1, '稳定呼吸', '先缓解紧张', 'rest', 'break', 2, false, '情绪稳定后记忆更有效'),
      S(2, '考前预测快测', '只抓最高频薄弱点', 'lsap_session', 'examPrediction', 12, false, '把时间给高价值缺口'),
      S(3, '考前速览', '最后一眼结构', 'open_panel', 'examSummary', 6, true, '把点串成线，增强可控感'),
      S(4, '陷阱清单', '防低级失误', 'open_panel', 'trapList', 6, true, '减少「会但错」的遗憾'),
    ],
  },
  {
    scenarioKey: 'reviewed_before_d3_7_dont_want',
    title: '不想学 · 已较熟 · 保温即可',
    steps: [
      S(1, '短休息/喝水', '身体优先', 'rest', 'break', 2, true, '不想学时先恢复一点能量'),
      S(2, '闪卡轻量过', '只刷最熟的一小叠', 'open_panel', 'flashcard', 6, false, '减量保持手感'),
      S(3, '刁钻教授（可选）', '一问一答唤醒', 'open_panel', 'trickyProfessor', 8, true, '轻挑战即可，不必加码'),
    ],
  },
];

export const STUDY_FLOW_BY_KEY: Record<string, StudyFlowTemplate> = Object.fromEntries(
  STUDY_FLOW_TEMPLATES.map((t) => [t.scenarioKey, t])
);

function tryMoodKeyToLegacy(key: string): string | null {
  const m = key.match(/_(normal|dont_want|want_anxious)$/);
  if (!m) return null;
  const legacy =
    m[1] === 'normal' ? 'good' : m[1] === 'dont_want' ? 'tired' : 'anxious';
  return key.replace(/_(normal|dont_want|want_anxious)$/, `_${legacy}`);
}

export function getTemplateForScenario(key: string): StudyFlowTemplate {
  if (STUDY_FLOW_BY_KEY[key]) return STUDY_FLOW_BY_KEY[key];
  const legacyFromMood = tryMoodKeyToLegacy(key);
  if (legacyFromMood && STUDY_FLOW_BY_KEY[legacyFromMood]) {
    return STUDY_FLOW_BY_KEY[legacyFromMood];
  }
  const affect = key.endsWith('_anxious') ? 'anxious' : key.endsWith('_tired') ? 'tired' : 'good';
  const noAffect = key.replace(/_(good|tired|anxious)$/, '');
  const sameFU = STUDY_FLOW_BY_KEY[`${noAffect}_good`];
  if (sameFU) return sameFU;
  const famPrefix = key.startsWith('never_seen_')
    ? 'never_seen_'
    : key.startsWith('learned_once_')
      ? 'learned_once_'
      : key.startsWith('reviewed_before_')
        ? 'reviewed_before_'
        : '';
  const sameF = STUDY_FLOW_TEMPLATES.find(
    (t) => (famPrefix ? t.scenarioKey.startsWith(famPrefix) : true) && t.scenarioKey.endsWith(`_${affect}`)
  );
  if (sameF) return sameF;
  return STUDY_FLOW_BY_KEY['learned_once_d3_7_good'] || STUDY_FLOW_TEMPLATES[0];
}
