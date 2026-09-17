import type {
  RoundAttempt, RoundBlueprint, RoundCitation, RoundEvaluation, RoundEvidenceRow, RoundExposure,
  RoundHelpEvent, RoundHelpKind, RoundHistorySummary, RoundKnowledgeTarget, RoundObjective, RoundQuestion,
  RoundRecordStore, RoundReport, RoundScope, RoundSupport, StudyRound,
} from './roundTypes';
import { buildConditionEvidence, buildPracticeEvidence, getAttemptConditions, snapshotAnswerConditions, type ConditionEvidence } from './conditionEvidence';
import { feedbackContractValid } from './feedbackContract';

/** Scheduling interval only; passing this interval does not establish durable learning. */
export const RECHECK_DELAY_MS = 24 * 60 * 60 * 1000;
const helpKinds: RoundHelpKind[] = ['source', 'hint', 'explanation', 'feedback'];
type StoredPageExposure = NonNullable<RoundRecordStore['scopeExposures']>[number];
const normalizeText = (value: string) => value.replace(/\s+/gu, ' ').trim();
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const time = (now: number) => {
  assert(Number.isFinite(now) && now >= 0, '记录时间无效。');
  return now;
};
const pageKeys = (sources: RoundCitation[]) => [...new Set(sources.map(source => JSON.stringify([source.materialId, source.page])))].sort();
const knowledgePages = (target: RoundKnowledgeTarget) => [...new Set(target.pages.map(page => JSON.stringify([target.materialId, page])))].sort();
const knowledgeIdentity = (target: RoundKnowledgeTarget) => JSON.stringify([
  target.id, target.kcId, target.atomId, target.materialId, target.contentKey,
]);

/** Extracted targets survive question wording changes; legacy goals keep their exact source-based identity. */
export function getRoundTargetKey(objective: RoundObjective): string {
  if (objective.knowledgeTarget) return JSON.stringify({
    knowledgeTarget: knowledgeIdentity(objective.knowledgeTarget),
    pages: knowledgePages(objective.knowledgeTarget),
  });
  return JSON.stringify({
    label: normalizeText(objective.label),
    sources: [...new Set(objective.sources.map(source => JSON.stringify([
      source.materialId, source.page, normalizeText(source.quote),
    ])))].sort(),
    pages: pageKeys(objective.sources),
  });
}

function exposurePages(exposure: RoundExposure): string[] {
  try {
    const parsed = JSON.parse(exposure.targetKey);
    return Array.isArray(parsed.pages) ? parsed.pages.filter((item: unknown) => typeof item === 'string') : [];
  } catch { return []; }
}
function exposureMaterials(exposure: RoundExposure): string[] {
  try {
    const parsed = JSON.parse(exposure.targetKey);
    return Array.isArray(parsed.materialIds) ? parsed.materialIds.filter((item: unknown) => typeof item === 'string') : [];
  } catch { return []; }
}
function touches(exposure: RoundExposure, objective: RoundObjective): boolean {
  const pages = new Set([...pageKeys(objective.sources), ...(objective.knowledgeTarget ? knowledgePages(objective.knowledgeTarget) : [])]);
  return exposure.targetKey === getRoundTargetKey(objective) || exposurePages(exposure).some(page => pages.has(page))
    || exposureMaterials(exposure).some(materialId => objective.sources.some(source => source.materialId === materialId));
}
function exposureTouchesScope(exposure: RoundExposure, scope: RoundScope): boolean {
  const pages = new Set(scope.materials.flatMap(material => material.pages.map(page => JSON.stringify([material.materialId, page]))));
  return exposurePages(exposure).some(page => pages.has(page))
    || exposureMaterials(exposure).some(materialId => scope.materials.some(material => material.materialId === materialId));
}
function citationValid(source: RoundCitation, scope: RoundScope): boolean {
  return Boolean(source && typeof source.quote === 'string' && source.quote.trim()
    && Number.isSafeInteger(source.page) && source.page > 0
    && scope.materials.some(material => material.materialId === source.materialId && material.pages.includes(source.page)));
}
function knowledgeTargetValid(target: RoundKnowledgeTarget, scope: RoundScope): boolean {
  return Boolean(target && [target.id, target.kcId, target.atomId, target.kcLabel, target.label, target.materialId, target.contentKey]
    .every(value => typeof value === 'string' && value.trim()) && typeof target.description === 'string'
    && Array.isArray(target.pages) && target.pages.length > 0
    && target.pages.every(page => Number.isSafeInteger(page) && page > 0
      && scope.materials.some(material => material.materialId === target.materialId && material.pages.includes(page))));
}
function validateScope(scope: RoundScope): void {
  assert(scope?.id && Array.isArray(scope.materials) && scope.materials.length, '本轮材料范围无效。');
  assert(scope.materials.every(material => material.materialId && Array.isArray(material.pages) && material.pages.length
    && material.pages.every(page => Number.isSafeInteger(page) && page > 0)), '本轮资料页码无效。');
  if (scope.knowledgeTargets !== undefined) {
    assert(Array.isArray(scope.knowledgeTargets) && scope.knowledgeTargets.every(target => knowledgeTargetValid(target, scope))
      && new Set(scope.knowledgeTargets.map(target => target.id)).size === scope.knowledgeTargets.length,
    '本轮知识点或逻辑原子的来源无效。');
  }
}
function questionValid(question: RoundQuestion, blueprint: RoundBlueprint): boolean {
  if (!question?.id || !question.prompt?.trim() || !question.objectiveIds?.length || !question.criteria?.length) return false;
  const objectives = new Set(blueprint.objectives.map(objective => objective.id));
  const criterionIds = new Set(question.criteria.map(criterion => criterion.id));
  return criterionIds.size === question.criteria.length
    && Array.isArray(question.responseRequirements) && question.responseRequirements.every(item => typeof item === 'string')
    && ['initial', 'diagnostic', 'recheck', 'transfer', 'delayed', 'integrated'].includes(question.kind)
    && [1, 2, 3, 4].includes(question.cueLevel) && ['original', 'rephrased', 'new'].includes(question.novelty)
    && new Set(question.objectiveIds).size === question.objectiveIds.length
    && question.objectiveIds.every(id => objectives.has(id))
    && question.objectiveIds.every(id => question.criteria.some(criterion => criterion.objectiveId === id))
    && question.criteria.every(criterion => {
      const target = blueprint.objectives.find(objective => objective.id === criterion.objectiveId)?.knowledgeTarget;
      return Boolean(criterion.id && criterion.requirement?.trim() && criterion.expected?.trim()
        && question.objectiveIds.includes(criterion.objectiveId) && criterion.sources?.length
        && criterion.sources.every(source => citationValid(source, blueprint.scope)
          && (!target || (source.materialId === target.materialId && target.pages.includes(source.page)))));
    });
}
function validateBlueprint(blueprint: RoundBlueprint): void {
  assert(blueprint && typeof blueprint.id === 'string' && blueprint.id.trim(), '本轮计划缺少编号。');
  validateScope(blueprint.scope);
  assert(Number.isSafeInteger(blueprint.maxAttempts) && blueprint.maxAttempts > 0, '本轮题量上限必须是正整数。');
  assert(blueprint.answerTimeLimitSeconds === undefined || (Number.isSafeInteger(blueprint.answerTimeLimitSeconds)
    && blueprint.answerTimeLimitSeconds > 0), '每题软时间上限必须是正整数秒数。');
  assert(Array.isArray(blueprint.objectives) && blueprint.objectives.length, '本轮缺少验证目标。');
  assert(new Set(blueprint.objectives.map(objective => objective.id)).size === blueprint.objectives.length, '验证目标编号重复。');
  assert(blueprint.objectives.every(objective => objective.id && objective.label?.trim() && objective.sources?.length
    && objective.sources.every(source => citationValid(source, blueprint.scope))), '验证目标没有可核对的范围内来源。');
  assert(blueprint.objectives.every(objective => !objective.knowledgeTarget ? !blueprint.scope.knowledgeTargets?.length : (
    knowledgeTargetValid(objective.knowledgeTarget, blueprint.scope)
    && (!blueprint.scope.knowledgeTargets || blueprint.scope.knowledgeTargets.some(target =>
      knowledgeIdentity(target) === knowledgeIdentity(objective.knowledgeTarget!)
      && JSON.stringify(knowledgePages(target)) === JSON.stringify(knowledgePages(objective.knowledgeTarget!))))
    && objective.sources.every(source => source.materialId === objective.knowledgeTarget!.materialId
      && objective.knowledgeTarget!.pages.includes(source.page))
  )), '验证目标没有对应当前提取的知识点与原文。');
  assert(Array.isArray(blueprint.questions) && blueprint.questions.length > 0
    && blueprint.questions.length <= blueprint.maxAttempts, '预排题量超出本轮预算，或没有可开始的问题。');
  assert(new Set(blueprint.questions.map(question => question.id)).size === blueprint.questions.length, '题目编号重复。');
  assert(blueprint.questions.every(question => questionValid(question, blueprint)), '题目目标或评分依据不在当前材料范围内。');
}
const currentQuestion = (round: StudyRound): RoundQuestion => {
  const question = round.questions.find(item => item.id === round.currentQuestionId);
  assert(question, '当前没有可作答的题目。');
  return question;
};
const findAttempt = (round: StudyRound, attemptId: string): RoundAttempt => {
  const attempt = round.attempts.find(item => item.id === attemptId);
  assert(attempt, '没有找到这次作答。');
  return attempt;
};
const uniqueExposures = (exposures: RoundExposure[]) => [...new Map(exposures.map(exposure => [
  `${exposure.targetKey}:${exposure.kind}:${exposure.at}`, exposure,
])).values()];
function scopeExposureEvents(scope: RoundScope, kind: RoundHelpKind, now: number): RoundExposure[] {
  validateScope(scope);
  assert(helpKinds.includes(kind), '帮助记录类型无效。');
  const at = time(now);
  return scope.materials.flatMap(material => material.pages.map(page => ({
    objectiveId: `${scope.id}:page:${material.materialId}:${page}`,
    targetKey: JSON.stringify({ pages: [JSON.stringify([material.materialId, page])] }), kind, at,
  })));
}

const uniquePageExposures = (exposures: StoredPageExposure[]) => [...new Map(exposures.flatMap(exposure =>
  exposure.allPages ? [{ ...exposure, pages: [] }] : exposure.pages.map(page => ({ ...exposure, pages: [page] }))).map(exposure => [
  JSON.stringify([exposure.materialId, exposure.allPages ? '*' : exposure.pages[0], exposure.kind, exposure.at]), exposure,
])).values()];
const asRoundExposures = (exposures: StoredPageExposure[]): RoundExposure[] => exposures.map(exposure => ({
  objectiveId: `page:${exposure.materialId}:${exposure.allPages ? '*' : exposure.pages.join(',')}`,
  targetKey: JSON.stringify(exposure.allPages ? { materialIds: [exposure.materialId] }
    : { pages: exposure.pages.map(page => JSON.stringify([exposure.materialId, page])) }),
  kind: exposure.kind, at: exposure.at,
}));

/** Actual PDF page views also occur outside a round or in another selected block. */
export function recordStoreExposure(store: RoundRecordStore, materials: { materialId: string; pages: number[]; allPages?: true }[], kind: RoundHelpKind = 'source', now = Date.now()): RoundRecordStore {
  assert(helpKinds.includes(kind), '帮助记录类型无效。');
  const at = time(now);
  assert(materials.length > 0 && materials.every(material => typeof material.materialId === 'string' && material.materialId.trim()
    && (material.allPages === undefined || material.allPages === true) && Array.isArray(material.pages)
    && (material.allPages === true || material.pages.length > 0)
    && material.pages.every(page => Number.isSafeInteger(page) && page > 0)), '看到原文的资料或页码无效。');
  const events = materials.map(material => ({ ...material, kind, at }));
  return { ...store, scopeExposures: uniquePageExposures([...(store.scopeExposures ?? []), ...events]) };
}

/** Preparation-page exposure has no round yet, so it belongs to the exam store itself. */
export function recordStoreScopeExposure(store: RoundRecordStore, scope: RoundScope, kind: RoundHelpKind = 'source', now = Date.now()): RoundRecordStore {
  validateScope(scope);
  return recordStoreExposure(store, scope.materials, kind, now);
}

/** Import external page views without changing their age or the independence of already submitted answers. */
export function hydrateRoundExposures(round: StudyRound, scopeExposures: StoredPageExposure[] = []): StudyRound {
  const incoming = asRoundExposures(scopeExposures).filter(exposure => exposureTouchesScope(exposure, round.blueprint.scope));
  return { ...round, exposures: uniqueExposures([...round.exposures, ...incoming]) };
}

export function createRound(blueprint: RoundBlueprint, history?: RoundHistorySummary, now = Date.now()): StudyRound {
  validateBlueprint(blueprint);
  time(now);
  return {
    version: 1, id: `${blueprint.id}:${now}`, blueprint, questions: [...blueprint.questions],
    currentQuestionId: blueprint.questions[0].id, phase: 'answering', draft: '', currentHelp: [], supports: [], attempts: [],
    exposures: uniqueExposures(history?.exposures ?? []), answerStartedAt: now, answerElapsedMs: 0, startedAt: now, updatedAt: now,
  };
}

/** Describes the answer conditions only. A soft time limit never changes answer validity or independence. */
export function getAnswerElapsedMs(round: StudyRound, now = Date.now()): number {
  const at = time(now);
  const accumulated = round.answerElapsedMs ?? 0;
  return accumulated + (round.phase === 'answering' && round.answerStartedAt !== undefined
    ? Math.max(0, at - round.answerStartedAt) : 0);
}

export function updateDraft(round: StudyRound, draft: string, now = Date.now()): StudyRound {
  assert(round.phase === 'answering' || (round.phase === 'paused' && round.resumePhase === 'answering'), '这一题已提交，不能改写原答。');
  return { ...round, draft, updatedAt: time(now) };
}

export function recordHelp(round: StudyRound, kind: RoundHelpKind, now = Date.now()): StudyRound {
  assert(round.phase === 'answering' || round.phase === 'feedback', '请先恢复本轮，再查看帮助。');
  assert(helpKinds.includes(kind), '帮助记录类型无效。');
  const question = currentQuestion(round);
  const at = time(now);
  const event: RoundHelpEvent = {
    id: `${round.id}:help:${round.currentHelp.length}:${at}`, kind, questionId: question.id,
    objectiveIds: [...question.objectiveIds], at,
  };
  const exposures = round.blueprint.objectives.filter(objective => question.objectiveIds.includes(objective.id))
    .map(objective => ({ objectiveId: objective.id, targetKey: getRoundTargetKey(objective), kind, at }));
  return { ...round, currentHelp: [...round.currentHelp, event], exposures: uniqueExposures([...round.exposures, ...exposures]), updatedAt: at };
}

/** Reading the source panel exposes the full selected page range, including objectives not yet generated. */
export function recordScopeExposure(round: StudyRound, kind: RoundHelpKind = 'source', now = Date.now()): StudyRound {
  const at = time(now);
  const exposures = scopeExposureEvents(round.blueprint.scope, kind, at);
  const question = round.questions.find(item => item.id === round.currentQuestionId);
  const event: RoundHelpEvent | undefined = question ? {
    id: `${round.id}:scope-help:${round.currentHelp.length}:${at}`, kind, questionId: question.id,
    objectiveIds: [...question.objectiveIds], at,
  } : undefined;
  return { ...round, currentHelp: event ? [...round.currentHelp, event] : round.currentHelp,
    exposures: uniqueExposures([...round.exposures, ...exposures]), updatedAt: at };
}

export function submitRoundAnswer(round: StudyRound, answer: string, now = Date.now()): StudyRound {
  assert(round.phase === 'answering', '当前作答已经提交；评价失败时请重试评价，不要重复提交。');
  assert(answer.trim(), '请先写下你的回答。');
  assert(round.attempts.length < round.blueprint.maxAttempts, '本轮作答预算已用完。');
  const question = currentQuestion(round);
  assert(!round.attempts.some(attempt => attempt.question.id === question.id), '这道题已提交，请保留原答并进入下一题。');
  const at = time(now);
  const objectives = round.blueprint.objectives.filter(objective => question.objectiveIds.includes(objective.id));
  const recent = round.exposures.filter(exposure => at - exposure.at < RECHECK_DELAY_MS && objectives.some(objective => touches(exposure, objective)));
  const helpEvents = [...round.currentHelp];
  recent.forEach((exposure, index) => {
    if (helpEvents.some(event => event.kind === exposure.kind && event.at === exposure.at)) return;
    helpEvents.push({ id: `${round.id}:prior-help:${index}:${exposure.at}`, kind: exposure.kind,
      questionId: question.id, objectiveIds: objectives.filter(objective => touches(exposure, objective)).map(objective => objective.id), at: exposure.at });
  });
  const attempt: RoundAttempt = {
    id: `${round.id}:attempt:${round.attempts.length + 1}`, question: structuredClone(question), answer: answer.trim(), submittedAt: at,
    elapsedMs: getAnswerElapsedMs(round, at),
    ...(round.blueprint.answerTimeLimitSeconds !== undefined ? { timeLimitSeconds: round.blueprint.answerTimeLimitSeconds } : {}),
    helpEvents: helpEvents.map(event => ({ ...event, objectiveIds: [...event.objectiveIds] })), independent: helpEvents.length === 0,
    conditions: snapshotAnswerConditions(question, helpEvents),
  };
  const next: StudyRound = { ...round, attempts: [...round.attempts, attempt], phase: 'feedback', draft: '', answerElapsedMs: attempt.elapsedMs, updatedAt: at };
  delete next.answerStartedAt;
  return next;
}

function checkedEvaluation(round: StudyRound, attempt: RoundAttempt, evaluation: RoundEvaluation): RoundEvaluation {
  assert(evaluation && typeof evaluation.questionValid === 'boolean' && Array.isArray(evaluation.items)
    && typeof evaluation.summary === 'string', '评价内容格式无效，请重试这一轮。');
  const criteria = attempt.question.criteria;
  const ids = new Set(criteria.map(criterion => criterion.id));
  assert(feedbackContractValid(attempt.question, evaluation), '反馈中的必要补充、参考回答或来源与本题不一致，请重新整理。');
  // An invalid question has no defensible requirements to score; retain the reason without forcing fabricated scores.
  if (!evaluation.questionValid) return { ...evaluation, invalidReason: evaluation.invalidReason || '本题有效性需要核对。' };
  const matches = evaluation.items.length === criteria.length
    && new Set(evaluation.items.map(item => item.criterionId)).size === criteria.length
    && evaluation.items.every(item => ids.has(item.criterionId) && ['met', 'partial', 'missing', 'uncertain'].includes(item.status)
      && typeof item.answerQuote === 'string' && typeof item.feedback === 'string');
  assert(matches, '评价没有逐项对应本题要求，请重试这一轮。');
  const hasValidQuotes = evaluation.items.every(item => !(item.status === 'met' || evaluation.feedbackVersion === 1 && item.status === 'partial')
    || (typeof item.answerQuote === 'string' && normalizeText(item.answerQuote).length > 0
      && normalizeText(attempt.answer).includes(normalizeText(item.answerQuote))));
  if (!questionValid(attempt.question, round.blueprint) || !hasValidQuotes) {
    const invalid = { ...evaluation, questionValid: false, invalidReason: '评分来源或所引用的原答无法核对，本次结果待核对。' };
    if (evaluation.feedbackVersion === 1) { invalid.items = []; delete invalid.answerGuide; }
    return invalid;
  }
  if (evaluation.feedbackVersion === 1 && evaluation.items.every(item => item.status === 'met')) {
    const complete = { ...evaluation, nextAction: 'continue' as const };
    delete complete.followUpFocus;
    return complete;
  }
  return evaluation;
}

export function applyEvaluation(round: StudyRound, attemptId: string, evaluation: RoundEvaluation, now = Date.now()): StudyRound {
  const attempt = findAttempt(round, attemptId);
  const result = checkedEvaluation(round, attempt, evaluation);
  const at = time(now);
  const updated = { ...attempt, evaluation: structuredClone(result) };
  delete updated.evaluationError;
  const next: StudyRound = { ...round, attempts: round.attempts.map(item => item.id === attemptId ? updated : item), updatedAt: at };
  // Revealing scoring/reference points affects later answers, never the original submitted answer.
  const exposures = round.blueprint.objectives.filter(objective => attempt.question.objectiveIds.includes(objective.id))
    .map(objective => ({ objectiveId: objective.id, targetKey: getRoundTargetKey(objective), kind: 'feedback' as const, at }));
  return { ...next, exposures: uniqueExposures([...next.exposures, ...exposures]) };
}

export function recordEvaluationError(round: StudyRound, attemptId: string, message: string, now = Date.now()): StudyRound {
  findAttempt(round, attemptId);
  return { ...round, attempts: round.attempts.map(attempt => attempt.id === attemptId
    ? { ...attempt, evaluationError: message || '这次评价没有完成，请重试。' } : attempt), updatedAt: time(now) };
}

export function addSupport(round: StudyRound, support: RoundSupport, now = Date.now()): StudyRound {
  assert(support.questionId === round.currentQuestionId && support.text?.trim(), '这份帮助不属于当前题目。');
  assert(support.kind === 'hint' || support.kind === 'explanation', '帮助内容类型无效。');
  assert(support.sources?.every(source => citationValid(source, round.blueprint.scope)), '帮助引用不在当前材料范围内。');
  if (round.supports.some(item => item.questionId === support.questionId && item.kind === support.kind && item.at === support.at && item.text === support.text)) return round;
  const priorCount = round.supports.filter(item => item.questionId === support.questionId && item.kind === support.kind).length;
  const helpCount = round.currentHelp.filter(event => event.questionId === support.questionId && event.kind === support.kind).length;
  const preRecorded = helpCount > priorCount;
  const next = preRecorded ? round : recordHelp(round, support.kind, now);
  return { ...next, supports: [...next.supports, support], updatedAt: time(now) };
}

export function advanceRound(round: StudyRound, extraQuestion?: RoundQuestion, now = Date.now()): StudyRound {
  assert(round.phase === 'feedback', '请先提交并查看当前题的评价。');
  const attempt = round.attempts.find(item => item.question.id === round.currentQuestionId);
  assert(attempt?.evaluation, '当前评价尚未完成，可以重试评价或结束本轮。');
  const at = time(now);
  if (round.attempts.length >= round.blueprint.maxAttempts) {
    assert(!extraQuestion, '本轮预算已用完，不能再加入追问或重测。');
    return { ...round, phase: 'ended', currentQuestionId: null, endedAt: at, updatedAt: at, endReason: 'budget' };
  }
  let questions = round.questions;
  if (extraQuestion) {
    assert(!questions.some(question => question.id === extraQuestion.id), '追问必须使用新的题目编号。');
    assert(questionValid(extraQuestion, round.blueprint), '追问的目标或来源超出了本轮范围。');
    questions = [...questions, extraQuestion];
  }
  const next = extraQuestion ?? questions.find(question => !round.attempts.some(item => item.question.id === question.id));
  if (!next) return { ...round, phase: 'ended', currentQuestionId: null, endedAt: at, updatedAt: at, endReason: 'completed' };
  return { ...round, questions, currentQuestionId: next.id, currentHelp: [], draft: '', phase: 'answering', answerElapsedMs: 0, answerStartedAt: at, updatedAt: at };
}

export function pauseRound(round: StudyRound, now = Date.now()): StudyRound {
  if (round.phase === 'paused' || round.phase === 'ended') return round;
  const next: StudyRound = { ...round, resumePhase: round.phase, phase: 'paused', answerElapsedMs: getAnswerElapsedMs(round, now), updatedAt: time(now) };
  delete next.answerStartedAt;
  return next;
}
export function resumeRound(round: StudyRound, now = Date.now()): StudyRound {
  assert(round.phase === 'paused', '这一轮当前没有暂停。');
  const next = { ...round, phase: round.resumePhase ?? 'answering', updatedAt: time(now) };
  if (next.phase === 'answering') next.answerStartedAt = now;
  delete next.resumePhase;
  return next;
}
export function endRound(round: StudyRound, now = Date.now()): StudyRound {
  if (round.phase === 'ended') return round;
  const next: StudyRound = { ...round, phase: 'ended', currentQuestionId: null, answerElapsedMs: getAnswerElapsedMs(round, now), endedAt: time(now), updatedAt: now, endReason: 'user' };
  delete next.resumePhase;
  delete next.answerStartedAt;
  return next;
}

export function disputeAttempt(round: StudyRound, attemptId: string, note: string, now = Date.now()): StudyRound {
  const attempt = findAttempt(round, attemptId);
  assert(attempt.evaluation, '请在评价完成后提出核对。');
  assert(note.trim(), '请留下需要核对的原因。');
  return { ...round, attempts: round.attempts.map(item => item.id === attemptId
    ? { ...item, dispute: { note: note.trim(), at: time(now) } } : item), updatedAt: now };
}
export function resolveDispute(round: StudyRound, attemptId: string, evaluation: RoundEvaluation, now = Date.now()): StudyRound {
  const attempt = findAttempt(round, attemptId);
  assert(attempt.dispute && attempt.dispute.resolvedAt === undefined, '这次作答没有待核对的争议。');
  const next = applyEvaluation(round, attemptId, evaluation, now);
  return { ...next, attempts: next.attempts.map(item => item.id === attemptId
    ? { ...item, dispute: { ...attempt.dispute!, resolvedAt: time(now) } } : item) };
}

function outcome(attempt: RoundAttempt, objectiveId: string, blueprint: RoundBlueprint): RoundEvidenceRow['status'] {
  const conditions = getAttemptConditions(attempt, objectiveId);
  if (conditions.presentation !== 'reviewed' || !attempt.evaluation || attempt.evaluationError || (attempt.dispute && attempt.dispute.resolvedAt === undefined)
    || !attempt.evaluation.questionValid || !feedbackContractValid(attempt.question, attempt.evaluation)
    || !questionValid(attempt.question, blueprint)) return 'uncertain';
  const allItems = attempt.evaluation.items;
  if (allItems.length !== attempt.question.criteria.length
    || new Set(allItems.map(item => item.criterionId)).size !== allItems.length
    || allItems.some(item => !attempt.question.criteria.some(criterion => criterion.id === item.criterionId)
      || !['met', 'partial', 'missing', 'uncertain'].includes(item.status))) return 'uncertain';
  const criteria = attempt.question.criteria.filter(criterion => criterion.objectiveId === objectiveId);
  const items = criteria.map(criterion => attempt.evaluation!.items.find(item => item.criterionId === criterion.id));
  if (!criteria.length || items.some(item => !item || item.status === 'uncertain')) return 'uncertain';
  if (items.some(item => item!.status === 'partial' || item!.status === 'missing')) return 'needs_work';
  if (items.some(item => !item!.answerQuote?.trim() || !normalizeText(attempt.answer).includes(normalizeText(item!.answerQuote)))) return 'uncertain';
  // This internal status describes extra help only, at the observed cue level. It is never low-cue mastery.
  return conditions.support === 'none_recorded' ? 'independent' : 'assisted';
}

export interface KnowledgeEvidenceRow {
  target: RoundKnowledgeTarget;
  status: 'unchecked' | 'needs_work' | 'assisted' | 'recheck' | 'independent' | 'uncertain';
  /** Original submissions, retaining criterion results, support conditions and disputes. */
  attempts: RoundAttempt[];
  /** Conditions are scoped to this atom even when a submitted answer tests other atoms too. */
  conditionEvidence: ConditionEvidence;
  practiceEvidence: ReturnType<typeof buildPracticeEvidence>;
  lastAt?: number;
}

/** Accumulate factual atom-level evidence across blocks, without promoting legacy coverage or BKT estimates. */
export function buildKnowledgeEvidence(targets: RoundKnowledgeTarget[], rounds: StudyRound[], now = Date.now()): KnowledgeEvidenceRow[] {
  const at = time(now);
  const latestRounds = new Map<string, StudyRound>();
  rounds.forEach(round => {
    if ((latestRounds.get(round.id)?.updatedAt ?? -1) <= round.updatedAt) latestRounds.set(round.id, round);
  });
  return targets.map(target => {
    const records = [...latestRounds.values()].flatMap(round => {
      const objectives = round.blueprint.objectives.filter(objective => objective.knowledgeTarget
        && knowledgeIdentity(objective.knowledgeTarget) === knowledgeIdentity(target));
      if (!objectives.length) return [];
      return round.attempts.flatMap(attempt => {
        const matched = objectives.filter(objective => attempt.question.objectiveIds.includes(objective.id));
        if (!matched.length) return [];
        const statuses = matched.map(objective => outcome(attempt, objective.id, round.blueprint));
        // Multiple objective rows bound to one atom must all be supported; never cherry-pick a met criterion.
        const status: RoundEvidenceRow['status'] = statuses.includes('uncertain') ? 'uncertain' : statuses.includes('needs_work') ? 'needs_work'
          : statuses.includes('assisted') ? 'assisted' : 'independent';
        return [{ attempt, status, objectiveIds: matched.map(objective => objective.id) }];
      });
    }).sort((a, b) => a.attempt.submittedAt - b.attempt.submittedAt);
    const uniqueRecords = [...new Map(records.map(record => [record.attempt.id, record])).values()];
    let status: KnowledgeEvidenceRow['status'] = uniqueRecords.length ? 'uncertain' : 'unchecked';
    let independentAt: number | undefined;
    for (const record of uniqueRecords) {
      // Keep legacy answers visible, but they neither create nor overwrite reviewed evidence.
      if (getAttemptConditions(record.attempt).presentation !== 'reviewed') continue;
      if (record.status === 'independent') {
        status = 'independent';
        independentAt = record.attempt.submittedAt;
      } else if (record.status === 'assisted' && status === 'independent') {
        // Supported practice does not erase an earlier independent answer, or manufacture a new one.
      } else {
        status = record.status;
        independentAt = undefined;
      }
    }
    // This schedules another observation. It is not a decay formula or a claim that the student forgot.
    if (status === 'independent' && independentAt !== undefined && at - independentAt >= RECHECK_DELAY_MS) status = 'recheck';
    const attempts = uniqueRecords.map(record => record.attempt);
    const objectiveIdsByAttempt = new Map(uniqueRecords.map(record => [record.attempt.id, record.objectiveIds]));
    const usableAttempts = new Set(uniqueRecords.filter(record => record.status !== 'uncertain').map(record => record.attempt.id));
    return { target, status, attempts,
      conditionEvidence: buildConditionEvidence(attempts, attempt => objectiveIdsByAttempt.get(attempt.id) ?? [], attempt => usableAttempts.has(attempt.id)),
      practiceEvidence: buildPracticeEvidence(attempts, attempt => objectiveIdsByAttempt.get(attempt.id) ?? [], attempt => usableAttempts.has(attempt.id)),
      ...(uniqueRecords.length ? { lastAt: uniqueRecords.at(-1)!.attempt.submittedAt } : {}) };
  });
}

export function buildRoundReport(round: StudyRound, history: StudyRound[] = []): RoundReport {
  // Different source-content hashes (scope ids) must not inherit old success claims.
  const rounds = [...history.filter(item => item.id !== round.id && item.blueprint.scope.id === round.blueprint.scope.id), round];
  const rows: RoundEvidenceRow[] = round.blueprint.objectives.map(objective => {
    const allRecords = rounds.flatMap(item => {
      const match = item.blueprint.objectives.find(candidate => getRoundTargetKey(candidate) === getRoundTargetKey(objective));
      return match ? item.attempts.filter(attempt => attempt.question.objectiveIds.includes(match.id))
        .map(attempt => ({ attempt, roundId: item.id, status: outcome(attempt, match.id, item.blueprint) })) : [];
    }).sort((a, b) => a.attempt.submittedAt - b.attempt.submittedAt);
    const records = allRecords.filter(item => item.roundId === round.id);
    const reviewedRecords = records.filter(record => getAttemptConditions(record.attempt).presentation === 'reviewed');
    const latest = reviewedRecords.at(-1) ?? records.at(-1);
    let status = latest?.status ?? 'unchecked';
    // Later supported practice does not erase an earlier valid independent answer.
    if (status === 'assisted' && records.some(item => item.status === 'independent')) status = 'independent';
    const delayedCheck = records.some(record => {
      if (record.status !== 'independent' || record.attempt.question.novelty !== 'new') return false;
      const previous = allRecords.filter(item => item.attempt.submittedAt < record.attempt.submittedAt).map(item => item.attempt.submittedAt);
      const exposures = rounds.flatMap(item => item.exposures).filter(exposure => touches(exposure, objective)
        && exposure.at < record.attempt.submittedAt).map(exposure => exposure.at);
      const prior = [...previous, ...exposures];
      return prior.length > 0 && record.attempt.submittedAt - Math.max(...prior) >= RECHECK_DELAY_MS;
    });
    return { objective, status, attempts: records.map(item => item.attempt), latestAt: latest?.attempt.submittedAt, delayedCheck };
  });
  const byStatus = (status: RoundEvidenceRow['status']) => rows.filter(row => row.status === status);
  const report = { rows, independent: byStatus('independent'), assisted: byStatus('assisted'), needsWork: byStatus('needs_work'), unchecked: byStatus('unchecked'), uncertain: byStatus('uncertain') };
  const nextStep = report.uncertain.length ? '先核对题目条件、争议或尚未完成的评价，再决定下一步。'
    : report.needsWork.length ? '先核对这些题目条件下尚未满足的要求，之后换题复查。'
    : report.unchecked.length ? '本轮仍有未验证目标，可以暂停，之后安排另一轮。'
    : report.assisted.length ? '这些作答记录了额外帮助，可隔开一段时间后换题复查。'
    : '本轮已有在当前题目条件下、未记录额外帮助的完成记录。可查看具体线索条件，再安排其他条件下的复查。';
  return { ...report, nextStep };
}

export function buildRoundHistory(rounds: StudyRound[], scope: RoundScope, scopeExposures: StoredPageExposure[] = [], now = Date.now()): RoundHistorySummary {
  const sameScope = rounds.filter(round => round.blueprint.scope.id === scope.id);
  const latestRound = sameScope.reduce<StudyRound | undefined>((latest, candidate) =>
    !latest || candidate.startedAt > latest.startedAt || (candidate.startedAt === latest.startedAt && candidate.updatedAt > latest.updatedAt)
      ? candidate : latest, undefined);
  const exposures = uniqueExposures([...asRoundExposures(scopeExposures), ...rounds.flatMap(round => round.exposures)])
    .filter(exposure => exposureTouchesScope(exposure, scope));
  const latestTargets = new Map<string, RoundEvidenceRow>();
  sameScope.forEach(round => buildRoundReport(round).rows.forEach(row => {
    if (row.latestAt === undefined) return;
    const key = getRoundTargetKey(row.objective);
    if ((latestTargets.get(key)?.latestAt ?? -1) <= row.latestAt) latestTargets.set(key, row);
  }));
  const knowledgeEvidence = scope.knowledgeTargets?.length ? buildKnowledgeEvidence(scope.knowledgeTargets, rounds, now) : undefined;
  const targetIdentities = new Set(scope.knowledgeTargets?.map(knowledgeIdentity));
  const relevantQuestions = knowledgeEvidence ? rounds.flatMap(round => {
    const objectiveIds = new Set(round.blueprint.objectives.filter(objective => objective.knowledgeTarget
      && targetIdentities.has(knowledgeIdentity(objective.knowledgeTarget))).map(objective => objective.id));
    return round.attempts.filter(attempt => attempt.question.objectiveIds.some(id => objectiveIds.has(id))).map(attempt => attempt.question.prompt);
  }) : sameScope.flatMap(round => round.attempts.map(attempt => attempt.question.prompt));
  const knowledgePriorities = knowledgeEvidence?.map(row => ({
    targetId: row.target.id,
    // An unresolved evaluation offers no usable success/failure signal. Keep it out of weak-link claims.
    status: row.status === 'uncertain' ? 'unchecked' as const : row.status,
    ...(row.lastAt !== undefined ? { lastAt: row.lastAt } : {}),
  })).sort((a, b) => {
    const order = { unchecked: 0, needs_work: 1, assisted: 2, recheck: 3, independent: 4 };
    return order[a.status] - order[b.status] || (a.lastAt ?? -1) - (b.lastAt ?? -1);
  });
  return {
    previousQuestions: [...new Set(relevantQuestions)],
    weakTargets: [...new Set(knowledgeEvidence ? knowledgeEvidence.filter(row => row.status === 'needs_work').map(row => row.target.label)
      : [...latestTargets.values()].filter(row => row.status === 'needs_work').map(row => row.objective.label))],
    ...(latestRound ? { previousObjectives: latestRound.blueprint.objectives.map(objective => ({
      ...objective, sources: objective.sources.map(source => ({ ...source })),
      ...(objective.knowledgeTarget ? { knowledgeTarget: { ...objective.knowledgeTarget, pages: [...objective.knowledgeTarget.pages] } } : {}),
    })) } : {}),
    ...(knowledgePriorities ? { knowledgePriorities } : {}),
    exposures,
  };
}

function validateStore(value: unknown): asserts value is RoundRecordStore {
  const store = value as RoundRecordStore;
  assert(store?.version === 1 && Array.isArray(store.rounds), '本地复习记录格式无效，原记录未被修改。');
  if (store.scopeExposures !== undefined) {
    assert(Array.isArray(store.scopeExposures) && store.scopeExposures.every(exposure => exposure
      && typeof exposure.materialId === 'string' && exposure.materialId.trim()
      && Number.isFinite(exposure.at) && exposure.at >= 0 && helpKinds.includes(exposure.kind)
      && (exposure.allPages === undefined || exposure.allPages === true) && Array.isArray(exposure.pages)
      && (exposure.allPages === true || exposure.pages.length > 0)
      && exposure.pages.every(page => Number.isSafeInteger(page) && page > 0)), '准备阶段的本地帮助记录无效，原记录未被修改。');
  }
  const ids = new Set<string>();
  for (const round of store.rounds) {
    assert(round?.version === 1 && typeof round.id === 'string' && !ids.has(round.id), '本地复习轮次编号无效或重复。');
    ids.add(round.id);
    validateBlueprint(round.blueprint);
    assert(Array.isArray(round.questions) && round.questions.every(question => questionValid(question, round.blueprint)), '本地题目记录损坏。');
    assert(new Set(round.questions.map(question => question.id)).size === round.questions.length, '本地题目编号重复。');
    assert(['answering', 'feedback', 'paused', 'ended'].includes(round.phase) && typeof round.draft === 'string', '本地复习状态无效。');
    assert(Array.isArray(round.attempts) && round.attempts.length <= round.blueprint.maxAttempts, '本地作答记录超出预算。');
    assert(new Set(round.attempts.map(attempt => attempt.id)).size === round.attempts.length
      && new Set(round.attempts.map(attempt => attempt.question.id)).size === round.attempts.length, '本地作答记录重复。');
    assert(round.attempts.every(attempt => typeof attempt.answer === 'string' && typeof attempt.independent === 'boolean'
      && Array.isArray(attempt.helpEvents) && (!attempt.independent || attempt.helpEvents.length === 0)
      && questionValid(attempt.question, round.blueprint)), '本地原答记录损坏。');
    assert(Array.isArray(round.currentHelp) && Array.isArray(round.supports) && Array.isArray(round.exposures), '本地帮助记录损坏。');
    assert(round.exposures.every(exposure => typeof exposure.targetKey === 'string' && Number.isFinite(exposure.at) && helpKinds.includes(exposure.kind)), '本地曝光记录无效。');
    for (const attempt of round.attempts) {
      time(attempt.submittedAt);
      if (attempt.conditions !== undefined) {
        const conditions = attempt.conditions;
        assert(conditions?.version === 1 && ['reviewed', 'legacy_unchecked'].includes(conditions.presentation)
          && (conditions.cueLevel === null || [1, 2, 3, 4].includes(conditions.cueLevel))
          && (conditions.cognitiveDemand === null || ['recall', 'explain', 'compare', 'apply'].includes(conditions.cognitiveDemand))
          && ['single', 'linked', 'unknown'].includes(conditions.connection)
          && ['original', 'rephrased', 'new'].includes(conditions.novelty)
          && ['none_recorded', 'recorded'].includes(conditions.support), '本地作答的题目条件格式无效。');
      }
      if (attempt.elapsedMs !== undefined) time(attempt.elapsedMs);
      assert(attempt.timeLimitSeconds === undefined || (Number.isSafeInteger(attempt.timeLimitSeconds)
        && attempt.timeLimitSeconds > 0), '本地作答的时间条件无效。');
      if (attempt.evaluation) checkedEvaluation(round, attempt, attempt.evaluation);
      if (attempt.dispute) {
        assert(typeof attempt.dispute.note === 'string', '本地核对原因无效。');
        time(attempt.dispute.at);
        if (attempt.dispute.resolvedAt !== undefined) time(attempt.dispute.resolvedAt);
      }
    }
    assert([...round.currentHelp, ...round.attempts.flatMap(attempt => attempt.helpEvents)].every(event =>
      typeof event.id === 'string' && typeof event.questionId === 'string' && Array.isArray(event.objectiveIds)
      && helpKinds.includes(event.kind) && Number.isFinite(event.at)), '本地帮助事件损坏。');
    assert(round.supports.every(support => round.questions.some(question => question.id === support.questionId)
      && ['hint', 'explanation'].includes(support.kind) && typeof support.text === 'string' && Number.isFinite(support.at)
      && Array.isArray(support.sources) && support.sources.every(source => citationValid(source, round.blueprint.scope))), '本地帮助内容损坏。');
    time(round.startedAt); time(round.updatedAt);
    if (round.answerStartedAt !== undefined) time(round.answerStartedAt);
    if (round.answerElapsedMs !== undefined) time(round.answerElapsedMs);
    if (round.phase !== 'ended') assert(round.questions.some(question => question.id === round.currentQuestionId), '本地当前题目不存在。');
    if (round.phase === 'paused') assert(round.resumePhase === 'answering' || round.resumePhase === 'feedback', '本地暂停状态缺少恢复位置。');
  }
}

export function loadRoundStore(key: string): RoundRecordStore {
  assert(key.trim(), '缺少本地复习记录位置。');
  try {
    assert(typeof localStorage !== 'undefined', '当前环境无法读取本地复习记录。');
    const raw = localStorage.getItem(key);
    if (raw === null) return { version: 1, rounds: [] };
    const store: unknown = JSON.parse(raw);
    validateStore(store);
    return store;
  } catch (error) {
    throw new Error(`无法读取本地复习记录，原记录未被修改。${error instanceof Error ? error.message : ''}`);
  }
}
export function saveRoundStore(key: string, store: RoundRecordStore): void {
  assert(key.trim(), '缺少本地复习记录位置。');
  validateStore(store);
  try {
    assert(typeof localStorage !== 'undefined', '当前环境无法保存本地复习记录。');
    localStorage.setItem(key, JSON.stringify(store));
  } catch (error) {
    throw new Error(`本地保存失败，请保留当前页面后重试。${error instanceof Error ? error.message : ''}`);
  }
}
export function upsertRound(store: RoundRecordStore, round: StudyRound): RoundRecordStore {
  const existing = store.rounds.find(item => item.id === round.id);
  if (existing && existing.updatedAt > round.updatedAt) return store;
  return { ...store, rounds: existing ? store.rounds.map(item => item.id === round.id ? round : item) : [...store.rounds, round] };
}

/** Merge independent readers of the per-exam store without deleting other blocks or their exposure events. */
export function mergeRoundStore(store: RoundRecordStore, incoming: RoundRecordStore): RoundRecordStore {
  const rounds = new Map(store.rounds.map(round => [round.id, round]));
  for (const candidate of incoming.rounds) {
    const previous = rounds.get(candidate.id);
    if (!previous) rounds.set(candidate.id, candidate);
    else {
      const latest = previous.updatedAt > candidate.updatedAt ? previous : candidate;
      rounds.set(candidate.id, { ...latest, exposures: uniqueExposures([...previous.exposures, ...candidate.exposures]) });
    }
  }
  const merged: RoundRecordStore = { version: 1, rounds: [...rounds.values()] };
  if (store.scopeExposures !== undefined || incoming.scopeExposures !== undefined) {
    merged.scopeExposures = uniquePageExposures([...(store.scopeExposures ?? []), ...(incoming.scopeExposures ?? [])]);
  }
  return merged;
}
