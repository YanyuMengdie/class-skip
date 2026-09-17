import { hasReviewedPresentation } from './questionPresentation';
import { feedbackContractValid } from './feedbackContract';
import type { RoundAnswerConditions, RoundAttempt, RoundHelpEvent, RoundLanguage, RoundQuestion } from './roundTypes';

type ObjectiveSelection = string | readonly string[];
const selectedIds = (selection?: ObjectiveSelection): readonly string[] | undefined => typeof selection === 'string' ? [selection] : selection;

/** Snapshot what was actually shown and the help recorded before this submission. */
export function snapshotAnswerConditions(question: RoundQuestion, helpEvents: RoundHelpEvent[]): RoundAnswerConditions {
  const reviewed = hasReviewedPresentation(question);
  return {
    version: 1, presentation: reviewed ? 'reviewed' : 'legacy_unchecked',
    cueLevel: reviewed ? question.audit!.cueLevel : null,
    cognitiveDemand: reviewed ? question.audit!.cognitiveDemand : null,
    connection: reviewed ? question.audit!.connection : 'unknown',
    novelty: question.novelty,
    support: helpEvents.length ? 'recorded' : 'none_recorded',
    ...(reviewed && question.practiceVersion === 1 && question.audit?.exercise ? {
      taskType: question.audit.exercise.taskType,
      applicationObjectiveIds: [...question.audit.exercise.applicationObjectiveIds],
    } : {}),
  };
}

/** Raw `independent` only reports absent extra help. It never validates the question's cue labels. */
export function getAttemptConditions(attempt: RoundAttempt, objectiveId?: ObjectiveSelection): RoundAnswerConditions {
  const expected = snapshotAnswerConditions(attempt.question, attempt.helpEvents);
  const stored = attempt.conditions;
  const reviewed = expected.presentation === 'reviewed' && stored?.version === 1 && stored.presentation === 'reviewed'
    && stored.cueLevel === expected.cueLevel && stored.cognitiveDemand === expected.cognitiveDemand
    && stored.connection === expected.connection && stored.novelty === expected.novelty
    && stored.taskType === expected.taskType
    && JSON.stringify(stored.applicationObjectiveIds) === JSON.stringify(expected.applicationObjectiveIds);
  const objectives = selectedIds(objectiveId);
  const relevantHelp = attempt.helpEvents.some(event => !objectives || !event.objectiveIds.length || event.objectiveIds.some(id => objectives.includes(id)));
  // A composite answer may have help for only one objective. An old false flag without events stays conservative.
  const support = relevantHelp || (!attempt.independent && attempt.helpEvents.length === 0) ? 'recorded' : 'none_recorded';
  return {
    ...expected, presentation: reviewed ? 'reviewed' : 'legacy_unchecked',
    cueLevel: reviewed ? expected.cueLevel : null,
    cognitiveDemand: reviewed ? expected.cognitiveDemand : null,
    connection: reviewed ? expected.connection : 'unknown', support,
  };
}

export interface ConditionObservation {
  attemptId: string;
  submittedAt: number;
  conditions: RoundAnswerConditions;
  result: 'met' | 'needs_work' | 'uncertain';
}

export interface ConditionEvidence {
  observations: ConditionObservation[];
  /** IDs link back to original answers; no score or inference about conditions absent from these records. */
  cueLevels: Array<{
    cueLevel: 1 | 2 | 3 | 4;
    completedWithoutSupport: string[];
    completedWithSupport: string[];
    needsWork: string[];
    uncertain: string[];
  }>;
  legacyUnchecked: string[];
}

function observedResult(attempt: RoundAttempt, objectiveId?: ObjectiveSelection): ConditionObservation['result'] {
  if (getAttemptConditions(attempt, objectiveId).presentation !== 'reviewed'
    || !attempt.evaluation?.questionValid || !feedbackContractValid(attempt.question, attempt.evaluation)
    || attempt.evaluationError || attempt.dispute && attempt.dispute.resolvedAt === undefined) return 'uncertain';
  const { criteria } = attempt.question;
  const { items } = attempt.evaluation;
  if (!criteria.length || new Set(criteria.map(criterion => criterion.id)).size !== criteria.length
    || items.length !== criteria.length || new Set(items.map(item => item.criterionId)).size !== items.length
    || items.some(item => !criteria.some(criterion => criterion.id === item.criterionId)
      || !['met', 'partial', 'missing', 'uncertain'].includes(item.status))) return 'uncertain';
  const objectives = selectedIds(objectiveId);
  const selected = criteria.filter(criterion => !objectives || objectives.includes(criterion.objectiveId));
  if (!selected.length || selected.some(criterion => !criterion.sources.length
    || criterion.sources.some(source => !source.materialId || !Number.isSafeInteger(source.page) || source.page < 1 || !source.quote.trim()))) return 'uncertain';
  const results = selected.map(criterion => items.find(item => item.criterionId === criterion.id)!);
  if (results.some(item => item.status === 'uncertain')) return 'uncertain';
  const compact = (text: string) => text.replace(/\s+/gu, ' ').trim();
  if (results.some(item => item.status === 'met' && (!item.answerQuote.trim() || !compact(attempt.answer).includes(compact(item.answerQuote))))) return 'uncertain';
  return results.some(item => item.status === 'partial' || item.status === 'missing') ? 'needs_work' : 'met';
}

/** Keep each observed condition intact instead of extrapolating across cue, demand or connection. */
export function buildConditionEvidence(
  attempts: RoundAttempt[], objectiveId?: ObjectiveSelection | ((attempt: RoundAttempt) => readonly string[]),
  /** Callers with a source scope can withhold records that fail its additional checks. */
  isUsable: (attempt: RoundAttempt) => boolean = () => true,
): ConditionEvidence {
  const forAttempt = (attempt: RoundAttempt) => selectedIds(typeof objectiveId === 'function' ? objectiveId(attempt) : objectiveId);
  const unique = [...new Map(attempts.filter(attempt => {
    const objectives = forAttempt(attempt);
    return !objectives || attempt.question.objectiveIds.some(id => objectives.includes(id));
  })
    .map(attempt => [attempt.id, attempt])).values()].sort((a, b) => a.submittedAt - b.submittedAt);
  const observations = unique.map(attempt => ({
    attemptId: attempt.id, submittedAt: attempt.submittedAt, conditions: getAttemptConditions(attempt, forAttempt(attempt)),
    result: isUsable(attempt) ? observedResult(attempt, forAttempt(attempt)) : 'uncertain' as const,
  }));
  const cueLevels: ConditionEvidence['cueLevels'] = ([1, 2, 3, 4] as const).map(cueLevel => ({
    cueLevel, completedWithoutSupport: [], completedWithSupport: [], needsWork: [], uncertain: [],
  }));
  const legacyUnchecked: string[] = [];
  for (const observation of observations) {
    if (observation.conditions.presentation !== 'reviewed' || observation.conditions.cueLevel === null) {
      legacyUnchecked.push(observation.attemptId);
      continue;
    }
    const bucket = cueLevels.find(bucket => bucket.cueLevel === observation.conditions.cueLevel)!;
    if (observation.result === 'met') {
      bucket[observation.conditions.support === 'recorded' ? 'completedWithSupport' : 'completedWithoutSupport'].push(observation.attemptId);
    } else bucket[observation.result === 'needs_work' ? 'needsWork' : 'uncertain'].push(observation.attemptId);
  }
  return { observations, cueLevels, legacyUnchecked };
}

export function summarizeQuestionConditions(attempt: RoundAttempt, language: RoundLanguage = 'zh', objectiveId?: string): string {
  return describeAnswerConditions(getAttemptConditions(attempt, objectiveId), language);
}

export interface PracticeEvidenceBucket {
  attempted: string[];
  independent: string[];
  assisted: string[];
  needsWork: string[];
}

/** Only the parts actually used in a case contribute application evidence. A case's other recall criteria do not. */
export function buildPracticeEvidence(
  attempts: RoundAttempt[],
  objectiveId?: ObjectiveSelection | ((attempt: RoundAttempt) => readonly string[]),
  isUsable: (attempt: RoundAttempt) => boolean = () => true,
): { basis: PracticeEvidenceBucket; application: PracticeEvidenceBucket; lowCueApplication: PracticeEvidenceBucket } {
  const bucket = (): PracticeEvidenceBucket => ({ attempted: [], independent: [], assisted: [], needsWork: [] });
  const evidence = { basis: bucket(), application: bucket(), lowCueApplication: bucket() };
  const add = (target: PracticeEvidenceBucket, attempt: RoundAttempt, ids: readonly string[]) => {
    const observation = buildConditionEvidence([attempt], ids, isUsable).observations[0];
    if (!observation || observation.result === 'uncertain') return;
    target.attempted.push(attempt.id);
    if (observation.result === 'needs_work') target.needsWork.push(attempt.id);
    else target[observation.conditions.support === 'none_recorded' ? 'independent' : 'assisted'].push(attempt.id);
  };
  for (const attempt of [...new Map(attempts.map(item => [item.id, item])).values()]) {
    const selection = selectedIds(typeof objectiveId === 'function' ? objectiveId(attempt) : objectiveId);
    const ids = attempt.question.objectiveIds.filter(id => !selection || selection.includes(id));
    if (!ids.length) continue;
    const conditions = getAttemptConditions(attempt, ids);
    if (conditions.presentation !== 'reviewed') continue;
    const appliedIds = ids.filter(id => conditions.applicationObjectiveIds?.includes(id));
    const basicIds = ids.filter(id => !appliedIds.includes(id));
    if (basicIds.length && (conditions.taskType !== undefined || conditions.cognitiveDemand !== 'apply')) {
      add(evidence.basis, attempt, basicIds);
    }
    if (appliedIds.length) {
      add(evidence.application, attempt, appliedIds);
      if (conditions.cueLevel !== null && conditions.cueLevel <= 2) add(evidence.lowCueApplication, attempt, appliedIds);
    }
  }
  return evidence;
}

export function describeAnswerConditions(conditions: RoundAnswerConditions, language: RoundLanguage = 'zh'): string {
  const support = language === 'en'
    ? conditions.support === 'recorded' ? 'Extra help recorded' : 'No extra help recorded'
    : conditions.support === 'recorded' ? '已记录额外帮助' : '未记录额外帮助';
  if (conditions.presentation !== 'reviewed') return `${language === 'en' ? 'Question conditions need review' : '题目条件待核对'} · ${support}`;
  const cues = language === 'en'
    ? { 1: 'Concept not named', 2: 'Situation cue', 3: 'Topic area named', 4: 'Concept named' }
    : { 1: '未点名概念', 2: '情境线索', 3: '范围提示', 4: '概念点名' };
  const demand = language === 'en'
    ? { recall: 'Recall', explain: 'Explain', compare: 'Compare', apply: 'Apply' }
    : { recall: '回忆', explain: '解释', compare: '比较', apply: '应用' };
  const novelty = language === 'en'
    ? { original: 'First wording', rephrased: 'Rephrased', new: 'New task' }
    : { original: '初次题面', rephrased: '换种表述', new: '新题' };
  const connection = language === 'en'
    ? conditions.connection === 'linked' ? 'Linked ideas' : 'Single idea'
    : conditions.connection === 'linked' ? '关联知识点' : '单一知识点';
  return [cues[conditions.cueLevel!], demand[conditions.cognitiveDemand!], connection, novelty[conditions.novelty], support].join(' · ');
}
