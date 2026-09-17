import { describe, expect, it } from 'vitest';
import { buildPracticeEvidence, getAttemptConditions, snapshotAnswerConditions } from './conditionEvidence';
import { hasReviewedPresentation, questionAuditKey } from './questionPresentation';
import type { RoundAttempt, RoundQuestion } from './roundTypes';

function makeAttempt(): RoundAttempt {
  const question: RoundQuestion = {
    id: 'case', objectiveIds: ['mechanism', 'definition'],
    prompt: 'A new group receives the intervention. Explain the observed difference and define the term.',
    responseRequirements: [], kind: 'initial', novelty: 'new', cueLevel: 2, answerFormat: 'apply',
    presentationVersion: 2, practiceVersion: 1, presentationScopeTitle: 'Practice question',
    criteria: ['mechanism', 'definition'].map(id => ({ id, objectiveId: id, requirement: `Explain ${id}`,
      expected: 'The intervention changes the response.', sources: [{ materialId: 'lecture', page: 3, quote: 'The intervention changes the response.' }] })),
  };
  question.audit = { version: 1, status: 'checked', questionKey: questionAuditKey(question), cueLevel: 2,
    cognitiveDemand: 'apply', connection: 'linked', exercise: { version: 1, taskType: 'case',
      applicationObjectiveIds: ['mechanism'], hypothetical: true } };
  return { id: 'attempt', question, answer: 'The intervention changes the response.', submittedAt: 1000,
    helpEvents: [], independent: true, conditions: snapshotAnswerConditions(question, []),
    evaluation: { questionValid: true, items: question.criteria.map(c => ({ criterionId: c.id, status: 'met',
      answerQuote: 'The intervention changes the response.', feedback: 'Supported.' })), summary: 'Checked.', nextAction: 'continue' } };
}

describe('case practice observations', () => {
  it('counts application only for the atoms actually used in case reasoning', () => {
    const attempt = makeAttempt();
    expect(buildPracticeEvidence([attempt], 'mechanism').lowCueApplication.independent).toEqual(['attempt']);
    const definition = buildPracticeEvidence([attempt], 'definition');
    expect(definition.basis.independent).toEqual(['attempt']);
    expect(definition.application.attempted).toEqual([]);
  });

  it('keeps a helped definition separate from an unassisted case explanation', () => {
    const attempt = makeAttempt();
    attempt.helpEvents.push({ id: 'help', questionId: 'case', kind: 'hint', objectiveIds: ['definition'], at: 900 });
    attempt.independent = false;
    attempt.conditions = snapshotAnswerConditions(attempt.question, attempt.helpEvents);
    const evidence = buildPracticeEvidence([attempt]);
    expect(evidence.basis.assisted).toEqual(['attempt']);
    expect(evidence.application.independent).toEqual(['attempt']);
  });

  it('does not turn a missed recall criterion into a failed case explanation', () => {
    const attempt = makeAttempt();
    attempt.evaluation!.items[1].status = 'missing';
    const evidence = buildPracticeEvidence([attempt]);
    expect(evidence.basis.needsWork).toEqual(['attempt']);
    expect(evidence.application.independent).toEqual(['attempt']);
  });

  it('records an explicit-concept application without inventing low-cue success', () => {
    const attempt = makeAttempt();
    attempt.question.cueLevel = 4;
    attempt.question.audit!.cueLevel = 4;
    attempt.question.audit!.questionKey = questionAuditKey(attempt.question);
    attempt.conditions = snapshotAnswerConditions(attempt.question, []);
    const evidence = buildPracticeEvidence([attempt]);
    expect(evidence.application.independent).toEqual(['attempt']);
    expect(evidence.lowCueApplication.attempted).toEqual([]);
  });

  it('does not upgrade a previous apply label into a verified case', () => {
    const attempt = makeAttempt();
    delete attempt.question.practiceVersion;
    delete attempt.question.audit!.exercise;
    attempt.question.audit!.questionKey = questionAuditKey(attempt.question);
    attempt.conditions = snapshotAnswerConditions(attempt.question, []);
    expect(hasReviewedPresentation(attempt.question)).toBe(true);
    expect(buildPracticeEvidence([attempt]).application.attempted).toEqual([]);
  });

  it('rejects new case classifications that are missing, unsupported, or forged after submission', () => {
    const missing = makeAttempt();
    delete missing.question.audit!.exercise;
    expect(hasReviewedPresentation(missing.question)).toBe(false);
    const unbound = makeAttempt();
    unbound.question.audit!.exercise!.applicationObjectiveIds = ['not-in-this-question'];
    expect(hasReviewedPresentation(unbound.question)).toBe(false);
    const forged = makeAttempt();
    forged.conditions!.applicationObjectiveIds!.push('definition');
    expect(getAttemptConditions(forged).presentation).toBe('legacy_unchecked');
    expect(buildPracticeEvidence([forged]).application.attempted).toEqual([]);
  });

  it('requires application reasoning instead of accepting a case label on a recall task', () => {
    const attempt = makeAttempt();
    attempt.question.audit!.cognitiveDemand = 'recall';
    expect(hasReviewedPresentation(attempt.question)).toBe(false);
  });

  it('withholds disputed and source-invalid attempts rather than presenting completion or a weakness', () => {
    const attempt = makeAttempt();
    attempt.dispute = { note: 'The question is not supported.', at: 1100 };
    expect(buildPracticeEvidence([attempt]).application.attempted).toEqual([]);
    delete attempt.dispute;
    expect(buildPracticeEvidence([attempt], undefined, () => false).application.attempted).toEqual([]);
  });

  it('deduplicates records and accepts per-attempt mappings for historical objective IDs', () => {
    const attempt = makeAttempt();
    const evidence = buildPracticeEvidence([attempt, structuredClone(attempt)], item => item.question.objectiveIds.filter(id => id === 'mechanism'));
    expect(evidence.application.independent).toEqual(['attempt']);
    expect(evidence.basis.attempted).toEqual([]);
  });
});
