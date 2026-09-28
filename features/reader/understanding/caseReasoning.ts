import type { UnderstandingAction, UnderstandingPhase, UnderstandingSession } from './readingUnderstanding';

/** Local to the selected passage; diagnostic evidence is never a mastery score. */
export interface CaseReasoningState {
  centralQuestion: string;
  situation: string;
  move: 'predict' | 'justify' | 'compare' | 'revise' | 'transfer' | 'reveal' | 'summarize';
  question: string;
  diagnosis: {
    status: 'unknown' | 'gap' | 'supported';
    learnerQuote: string;
    gapKind: 'unknown' | 'term' | 'relationship' | 'condition' | 'evidence' | 'none';
    detail: string;
  };
}

export const isCaseUnderstanding = (session: UnderstandingSession) =>
  session.teachingFlow === 'guided-step-v1' || session.teachingFlow === 'case-reasoning-v2';

export const CASE_REASONING_RULES = `
【当前片段的案件推理辅导：本流程优先于通用讲解建议】
目标是通过用户自己的判断和理由暴露具体理解断点，再帮助用户跨过它；不是把领读换种说法重讲，也不是背定义或考试评分。
范围仍只限 sourceText / focusQuestion。whole 也只指点击的那条消息：先选其中一个核心关系作为贯穿问题，不展开整个 Module，不逐个盘问全部标题。
“案件”是可推理的具体情境、实验、现象、两种解释或现实困境，不要求侦探包装、人物扮演或戏剧。优先用所选材料已有案例；自拟情境明确标为假设，不编造真实实验、新闻或数据，不把假设预测说成实际证据。
连续推进：必要背景与情境 → 用户判断并说明理由 → 对照理由找到断点 → 一条有针对性的线索/对比证据 → 用户修正或补全推理 → 接回原知识。保留同一个贯穿问题，只有检验迁移时换一个最小变化的情境。
第一轮只给足以尝试的前提（通常 2–4 句）、一个情境和一个能区分理解的预测/判断问题。背景只解释场景和问题中的词是什么意思，绝不能提前介绍正在探查的核心规则、两者可分离的结论、正确分类或完整因果链。例如若探查“注意是否等于眼动”，开场不能先讲“注意可以在眼睛不动时转移”，也不能先并列讲外显/内隐的区别再问眼睛是否动了。不要先解释待推导的结论或替用户示范完推理；不要先用整轮讲背景再等用户点“带我想一步”。
一次只交出一个认知动作。可以请用户对这个判断给一个理由，但不要捆绑比较、解释、迁移等多个任务。问题要能暴露术语含义、因果关系、适用条件或证据推断上的区别，不问“懂了吗”。
词汇、命名或记忆事实不适合靠猜：直接补一句必要含义，再围绕其应用/区分提出可尝试的问题，不让用户猜老师定义。

【根据回答推进，不按固定轮数跑题】
start：背景 + 情境，立即交出一个判断，phase=question。还没有回答，diagnosis.status=unknown，不预判错误。
answer：先回应实际理由，认可成立的部分；信息不够时只追问最关键的理由/区分，status=unknown，不擅自诊断。
- 部分正确或理由有误：用用户原话定位一个具体断点（术语/关系/条件/证据），在 messageMarkdown 中用一句自然语言指出用户推理卡在哪个假设或跳步，例如“你这一步把 A 当成了 B 的必要条件，我们检验这一点。”不要只在内部 diagnosis 记录断点，界面上却只继续讲知识。不要把用户错误的“一定”改述成“很多时候”再笼统夸奖。随后只给一个能引起比较的观察、反例事实或改变一个条件，让用户自己说出其意义；phase=question。线索不能是先宣布正确规则，再问“既然这样，你说是不是”；不要在用户尚未推导时把正确因果关系与正式概念完整解释完。不要把整段答案讲完，不重复已经正确的部分。
- 结论正确却只有选项/没有理由：只追问理由，不能算想通。
- 理由成立：接回原知识；若尚未检验迁移，可给一个最小变化情境，phase=check；若用户正在回答上一轮 check 且理由成立，phase=complete，简短收束、不再加题，不宣称长期掌握。
- 用户问必要背景：只回答与当前判断有关的一点，再把一个可尝试的小步骤交给他，不重启整个案件。
- 用户说不知道：不要把“不知道”当成某种已证实的误解。补最少前提、示范半步或做一个具体对比，降低下一步难度；不能原样或换词重复原问题，也不能直接把整条推理讲完。
hint：立即给当前问题的一条有用线索，再保留一个可尝试的小步骤；phase=question。
foundation：补这个断点需要的一句定义/一个对比例子，再问更小、更具体的一步；phase=question。不是回到长篇背景讲解。
reason：继续当前情境与已给线索，交出下一步判断，phase=question；已经成立的理由不重新考问。
revisit：用一个最小变化情境检查同一个关系，phase=check，不重新讲背景。
explain：用户主动要求直接讲给他，才揭晓当前推理和知识的对应，move=reveal，phase=explanation，question 为空，不强迫继续回答。之后由用户主动选择继续推理。
随时可以返回领读或暂存疑惑。没有固定题数，不机械拉长流程，不要求得到 complete 才能离开。
输出前检查（不要展示）：问题的答案是否已经在本轮讲解里直接给出？若是，把那段结论删掉，只保留理解情境所需的前提或一条观察线索；用户应当还有真正需要判断的一步。一次只探查一个断点；迁移也只问一个问题，不同时要求判断、理由和设计新实验。

【连续状态与可核对的诊断】
每轮返回 reasoning，沿用 centralQuestion 和 situation；不要因为用户回答错或要提示就重新开一个无关情境。
reasoning.move：predict（预测）、justify（理由）、compare（区分）、revise（据线索修正）、transfer（迁移）、reveal（主动要答案）、summarize（收束）。
reasoning.question：本轮唯一交给用户的问题，完整写在这里；不要在 messageMarkdown 中重复问题。question/check 时不能为空；explanation/complete 时为空。
messageMarkdown：只写陈述句，给情境、回应理由、必要线索或收束。不要在正文提问或以问号结束；所有提问仅放在 reasoning.question，界面会单独显示。不要把同一个问题换种说法在正文问一遍。不要写内部阶段、诊断标签或 JSON 字段，不提前泄露要用户推导的答案。
reasoning.diagnosis：status=unknown/gap/supported；learnerQuote 必须逐字摘录本次真实用户回答或此前真实作答，不引用按钮文案、模型回答或材料作为用户认知证据。没有依据就 unknown 且 learnerQuote 为空。
只有有真实理由支持时才标 gap（具体断点）或 supported（当前理由成立），自称懂了/只选 A/不知道都不是这样的证据。gapKind 只能是 unknown/term/relationship/condition/evidence/none；detail 只解释本轮证据支持的断点或正确关系，unknown 时可写尚待区分的两个可能，不能当作已确诊。
`.trim();

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function normalizeCaseReasoning(raw: unknown, input: {
  session: UnderstandingSession; action: UnderstandingAction; userText: string; phase: UnderstandingPhase;
  hasAttempt: (value: string) => boolean;
}): CaseReasoningState {
  const invalid = () => new Error('这一轮没有接上推理步骤，请重试。');
  if (!record(raw) || !record(raw.diagnosis)) throw invalid();
  const centralQuestion = text(raw.centralQuestion), situation = text(raw.situation), question = text(raw.question);
  const moves = ['predict', 'justify', 'compare', 'revise', 'transfer', 'reveal', 'summarize'];
  if (!centralQuestion || !situation || !moves.includes(String(raw.move))) throw invalid();
  const asking = input.phase === 'question' || input.phase === 'check';
  if (asking !== Boolean(question)) throw invalid();
  if (input.action === 'explain') {
    if (input.phase !== 'explanation' || raw.move !== 'reveal') throw invalid();
  } else if (input.phase === 'explanation' || raw.move === 'reveal') throw invalid();
  if (input.action === 'start' && input.phase !== 'question') throw invalid();
  if ((input.phase === 'check') !== (raw.move === 'transfer')) throw invalid();
  if ((input.phase === 'complete') !== (raw.move === 'summarize')) throw invalid();
  const diagnosis = raw.diagnosis;
  if (!['unknown', 'gap', 'supported'].includes(String(diagnosis.status))
    || !['unknown', 'term', 'relationship', 'condition', 'evidence', 'none'].includes(String(diagnosis.gapKind))) throw invalid();
  const learnerQuote = text(diagnosis.learnerQuote), detail = text(diagnosis.detail);
  const attempts = input.session.turns.filter(turn => turn.role === 'user' && (!turn.action || turn.action === 'answer'))
    .map(turn => turn.text).filter(input.hasAttempt);
  if (input.action === 'answer' && input.hasAttempt(input.userText)) attempts.push(input.userText);
  // Only an actual reasoning attempt can support a diagnosis, never AI text or a help button.
  if (learnerQuote && !attempts.some(answer => answer.includes(learnerQuote))) throw invalid();
  if (input.action === 'answer' && diagnosis.status !== 'unknown' && !input.userText.includes(learnerQuote)) throw invalid();
  if (diagnosis.status !== 'unknown' && (!learnerQuote || !input.hasAttempt(learnerQuote) || !detail)) throw invalid();
  if (diagnosis.status === 'gap' && !['term', 'relationship', 'condition', 'evidence'].includes(String(diagnosis.gapKind))) throw invalid();
  if (diagnosis.status === 'supported' && diagnosis.gapKind !== 'none') throw invalid();
  if (input.action === 'start' && diagnosis.status !== 'unknown') throw invalid();
  if (input.phase === 'complete' && (diagnosis.status !== 'supported' || !input.userText.includes(learnerQuote))) throw invalid();
  return { centralQuestion, situation, question, move: raw.move as CaseReasoningState['move'],
    diagnosis: { status: diagnosis.status as CaseReasoningState['diagnosis']['status'], learnerQuote,
      gapKind: diagnosis.gapKind as CaseReasoningState['diagnosis']['gapKind'], detail } };
}
