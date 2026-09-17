import { describe, expect, it } from 'vitest';
import { buildConditionEvidence, getAttemptConditions, snapshotAnswerConditions, summarizeQuestionConditions } from './conditionEvidence';
import { questionAuditKey } from './questionPresentation';
import type { RoundAttempt, RoundQuestion } from './roundTypes';

function question(cueLevel: 1 | 2 | 3 | 4 = 4): RoundQuestion {
  const value: RoundQuestion = {
    id: 'question', objectiveIds: ['target'], prompt: 'Explain the comparison in this study.', responseRequirements: [],
    criteria: [{ id: 'criterion', objectiveId: 'target', requirement: 'Explain the comparison', expected: 'It supplies a comparison.',
      sources: [{ materialId: 'lecture', page: 3, quote: 'A control group supplies a comparison.' }] }],
    kind: 'initial', cueLevel, novelty: 'original', presentationVersion: 2, presentationScopeTitle: 'Research design', answerFormat: 'explain',
  };
  return { ...value, audit: { version: 1, status: 'checked', questionKey: questionAuditKey(value), cueLevel, cognitiveDemand: 'explain', connection: 'single' } };
}
function attempt(id = 'attempt', cueLevel: 1 | 2 | 3 | 4 = 4, supported = false): RoundAttempt {
  const q = question(cueLevel);
  const helpEvents: RoundAttempt['helpEvents'] = supported ? [{ id: 'help', kind: 'explanation', questionId: q.id, objectiveIds: ['target'], at: 900 }] : [];
  return {
    id, question: q, answer: 'It supplies a comparison.', submittedAt: 1000, helpEvents, independent: !supported,
    conditions: snapshotAnswerConditions(q, helpEvents),
    evaluation: { questionValid: true, items: [{ criterionId: 'criterion', status: 'met', answerQuote: 'It supplies a comparison.', feedback: 'Matches.' }],
      summary: 'Checked.', nextAction: 'continue' },
  };
}

describe('observed question and help conditions', () => {
  it('records a named-concept success only in that cue condition, without inferring low-cue success', () => {
    const evidence = buildConditionEvidence([attempt()]);
    expect(evidence.cueLevels.map(bucket => bucket.completedWithoutSupport)).toEqual([[], [], [], ['attempt']]);
    expect(evidence.observations[0]).toMatchObject({ result: 'met', conditions: { cueLevel: 4, cognitiveDemand: 'explain', connection: 'single', support: 'none_recorded' } });
  });

  it('separates helped and no-extra-help success at the same cue level', () => {
    const evidence = buildConditionEvidence([attempt('first', 2), attempt('after-explanation', 2, true)]);
    expect(evidence.cueLevels[1]).toMatchObject({ completedWithoutSupport: ['first'], completedWithSupport: ['after-explanation'] });
    expect(evidence.cueLevels[0].completedWithoutSupport).toEqual([]);
    expect(summarizeQuestionConditions(attempt('low-but-helped', 1, true))).toContain('已记录额外帮助');
  });

  it('does not trust a legacy raw cue label or independent flag as reviewed evidence', () => {
    const legacy = attempt('legacy', 1);
    delete legacy.conditions;
    delete legacy.question.presentationVersion;
    delete legacy.question.audit;
    legacy.question.responseRequirements = ['The comparison removes other explanations.'];
    const original = structuredClone(legacy);
    const evidence = buildConditionEvidence([legacy]);
    expect(evidence.legacyUnchecked).toEqual(['legacy']);
    expect(evidence.observations[0]).toMatchObject({ result: 'uncertain', conditions: { presentation: 'legacy_unchecked', cueLevel: null, cognitiveDemand: null, connection: 'unknown' } });
    expect(evidence.cueLevels.every(bucket => !bucket.completedWithoutSupport.length && !bucket.needsWork.length)).toBe(true);
    expect(summarizeQuestionConditions(legacy, 'en')).toContain('conditions need review');
    expect(legacy).toEqual(original);
  });

  it('also withholds legacy omissions instead of turning them into a reliable weak point', () => {
    const legacy = attempt(); delete legacy.conditions;
    legacy.evaluation!.items[0].status = 'missing';
    expect(buildConditionEvidence([legacy]).observations[0].result).toBe('uncertain');
  });

  it('requires the submitted snapshot and current audit to agree without silently upgrading older attempts', () => {
    const missingSnapshot = attempt(); delete missingSnapshot.conditions;
    expect(getAttemptConditions(missingSnapshot).presentation).toBe('legacy_unchecked');
    const changedQuestion = attempt(); changedQuestion.question.prompt += ' A new clause.';
    expect(getAttemptConditions(changedQuestion).presentation).toBe('legacy_unchecked');
    const changedSnapshot = attempt(); changedSnapshot.conditions!.cueLevel = 1;
    expect(getAttemptConditions(changedSnapshot).presentation).toBe('legacy_unchecked');
  });

  it('retains observed demand, connection and novelty without inferring them from each other', () => {
    const current = attempt();
    current.question.answerFormat = 'apply'; current.question.novelty = 'new';
    current.question.audit = { ...current.question.audit!, questionKey: questionAuditKey(current.question), cognitiveDemand: 'compare', connection: 'linked' };
    current.conditions = snapshotAnswerConditions(current.question, []);
    expect(buildConditionEvidence([current]).observations[0].conditions).toMatchObject({ cueLevel: 4, cognitiveDemand: 'compare', connection: 'linked', novelty: 'new' });
  });

  it('handles target-specific help without labeling every part of a composite answer as helped', () => {
    const current = attempt();
    current.question.objectiveIds.push('second');
    current.question.criteria.push({ ...current.question.criteria[0], id: 'second-criterion', objectiveId: 'second' });
    current.question.audit!.questionKey = questionAuditKey(current.question);
    current.helpEvents.push({ id: 'target-help', kind: 'hint', at: 900, questionId: current.question.id, objectiveIds: ['target'] });
    current.independent = false;
    current.conditions = snapshotAnswerConditions(current.question, current.helpEvents);
    current.evaluation!.items.push({ ...current.evaluation!.items[0], criterionId: 'second-criterion' });
    expect(buildConditionEvidence([current], 'target').cueLevels[3].completedWithSupport).toEqual(['attempt']);
    expect(buildConditionEvidence([current], 'second').cueLevels[3].completedWithoutSupport).toEqual(['attempt']);
    expect(buildConditionEvidence([current], 'not-asked').observations).toEqual([]);
  });

  it('does not accept an incorrect met quote, invalid evaluation or unresolved dispute as success', () => {
    const badQuote = attempt('quote'); badQuote.evaluation!.items[0].answerQuote = 'Never said';
    const invalid = attempt('invalid'); invalid.evaluation!.questionValid = false;
    const disputed = attempt('disputed'); disputed.dispute = { note: 'Check source', at: 1200 };
    const missing = attempt('gap'); missing.evaluation!.items[0].status = 'missing';
    const evidence = buildConditionEvidence([badQuote, invalid, disputed, missing]);
    expect(evidence.cueLevels[3]).toMatchObject({ completedWithoutSupport: [], uncertain: ['quote', 'invalid', 'disputed'], needsWork: ['gap'] });
  });

  it('does not lose conservative help when a historic record has only a false independent flag', () => {
    const current = attempt(); current.independent = false;
    expect(getAttemptConditions(current).support).toBe('recorded');
    expect(buildConditionEvidence([current]).cueLevels[3].completedWithSupport).toEqual(['attempt']);
  });
});
