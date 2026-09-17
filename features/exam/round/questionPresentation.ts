import type { RoundAnswerFormat, RoundLanguage, RoundQuestion } from './roundTypes';

export const ANSWER_FORMATS: readonly RoundAnswerFormat[] = ['recall', 'explain', 'compare', 'apply'];
export const TASK_TYPES = ['direct', 'case', 'compare', 'predict', 'data'] as const;

function exerciseReviewValid(question: RoundQuestion): boolean {
  if (question.practiceVersion === undefined) return true;
  const exercise = question.audit?.exercise;
  return question.practiceVersion === 1 && exercise?.version === 1
    && TASK_TYPES.includes(exercise.taskType) && typeof exercise.hypothetical === 'boolean'
    && Array.isArray(exercise.applicationObjectiveIds)
    && new Set(exercise.applicationObjectiveIds).size === exercise.applicationObjectiveIds.length
    && exercise.applicationObjectiveIds.every(id => question.objectiveIds.includes(id)
      && question.criteria.some(criterion => criterion.objectiveId === id))
    && (exercise.taskType !== 'direct' || exercise.applicationObjectiveIds.length === 0)
    && (!['case', 'predict', 'data'].includes(exercise.taskType) || exercise.applicationObjectiveIds.length > 0)
    && (!exercise.applicationObjectiveIds.length || ['apply', 'compare'].includes(question.audit!.cognitiveDemand));
}

/** The only answer-format text shown before submission; it contains no course content. */
export function answerFormatInstruction(format: RoundAnswerFormat, language: RoundLanguage): string {
  const instructions: Record<RoundAnswerFormat, [string, string]> = {
    recall: ['用自己的话简短回答。', 'Give a brief answer in your own words.'],
    explain: ['用自己的话说明理由或过程。', 'Explain your reasoning or the process in your own words.'],
    compare: ['说明题目所问的相同点或不同点。', 'Describe the similarities or differences asked about.'],
    apply: ['结合题目给出的情况作答，并说明理由。', 'Answer for the situation in the question and explain your reasoning.'],
  };
  return instructions[format][language === 'en' ? 1 : 0];
}

/** Canonical full content, not a lossy hash: any content change invalidates a review. */
export function questionAuditKey(question: RoundQuestion): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)])) : value;
  const { audit: _audit, ...content } = question;
  return `question-v2:${JSON.stringify(canonical(content))}`;
}

export function hasReviewedPresentation(question: RoundQuestion): boolean {
  const audit = question?.audit;
  return question?.presentationVersion === 2 && ANSWER_FORMATS.includes(question.answerFormat!)
    && typeof question.presentationScopeTitle === 'string' && !!question.presentationScopeTitle.trim()
    && Array.isArray(question.responseRequirements) && question.responseRequirements.length === 0
    && audit?.version === 1 && audit.status === 'checked'
    && [1, 2, 3, 4].includes(question.cueLevel) && audit.cueLevel === question.cueLevel
    && ANSWER_FORMATS.includes(audit.cognitiveDemand) && ['single', 'linked'].includes(audit.connection)
    && exerciseReviewValid(question)
    && audit.questionKey === questionAuditKey(question);
}
