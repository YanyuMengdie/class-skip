import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECHECK_DELAY_MS, addSupport, advanceRound, applyEvaluation, buildRoundHistory, buildRoundReport,
  createRound, disputeAttempt, endRound, getAnswerElapsedMs, hydrateRoundExposures, loadRoundStore, mergeRoundStore, pauseRound, recordEvaluationError,
  recordHelp, recordScopeExposure, recordStoreExposure, recordStoreScopeExposure, resolveDispute, resumeRound, saveRoundStore, submitRoundAnswer, updateDraft, upsertRound,
} from './roundState';
import type { RoundBlueprint, RoundEvaluation, RoundQuestion, RoundRecordStore, StudyRound } from './roundTypes';
import { questionAuditKey } from './questionPresentation';
import { buildConditionEvidence, getAttemptConditions } from './conditionEvidence';

const source = { materialId: 'lecture', page: 3, quote: 'A control group separates an intervention effect from other changes.' };
const answer = 'A control group provides a comparison. Random allocation reduces systematic differences.';
function reviewed(question: RoundQuestion): RoundQuestion {
  const value = { ...question, presentationVersion: 2 as const, presentationScopeTitle: 'Research design', answerFormat: 'explain' as const, responseRequirements: [] };
  return { ...value, audit: { version: 1, status: 'checked', questionKey: questionAuditKey(value),
    cueLevel: value.cueLevel, cognitiveDemand: 'explain', connection: 'single' } };
}
function blueprint(overrides: Partial<RoundBlueprint> = {}): RoundBlueprint {
  return {
    id: 'plan', createdAt: 1000, maxAttempts: 2,
    scope: { id: 'scope:page-3:content-a', title: '研究设计', materials: [{ materialId: 'lecture', title: '研究方法', pages: [3, 4] }], objectiveHints: [], mode: 'practice' },
    objectives: [
      { id: 'comparison', label: '解释对照组的作用', sources: [source] },
      { id: 'random', label: '解释随机分配', sources: [{ ...source, page: 4, quote: 'Random allocation reduces systematic differences.' }] },
    ],
    questions: [reviewed({ id: 'q1', objectiveIds: ['comparison'], prompt: '解释为什么这个研究需要对照组。', responseRequirements: [],
      criteria: [{ id: 'c1', objectiveId: 'comparison', requirement: '说明比较作用', expected: 'Control group provides a comparison.', sources: [source] }],
      kind: 'initial', cueLevel: 4, novelty: 'original' })],
    ...overrides,
  };
}
function question(id: string, overrides: Partial<RoundQuestion> = {}): RoundQuestion {
  return reviewed({ ...blueprint().questions[0], id, prompt: `用新的研究情境解释对照的作用：${id}`, kind: 'recheck', novelty: 'new', ...overrides });
}
function evaluation(status: 'met' | 'partial' | 'missing' | 'uncertain' = 'met'): RoundEvaluation {
  return { questionValid: true, items: [{ criterionId: 'c1', status, answerQuote: status === 'met' ? 'A control group provides a comparison.' : '', feedback: '核对对照组的比较作用。' }], summary: '逐项核对完成。', nextAction: 'continue' };
}
function evaluate(round: StudyRound, at = 1300, value = evaluation()): StudyRound {
  return applyEvaluation(round, round.attempts.at(-1)!.id, value, at);
}
function completed(at = 1000): StudyRound {
  return evaluate(submitRoundAnswer(createRound(blueprint(), undefined, at), answer, at + 100), at + 200);
}

afterEach(() => vi.unstubAllGlobals());

describe('bounded answer and evaluation lifecycle', () => {
  it('upgrades feedback for the original submission without consuming an attempt or changing the rubric', () => {
    const original = completed();
    const fresh: RoundEvaluation = { ...evaluation(), feedbackVersion: 1,
      items: [{ ...evaluation().items[0], covered: 'You explained the comparison.', needed: '' }],
      answerGuide: { referenceAnswer: 'A control group provides a comparison for the intervention.', criterionIds: ['c1'], sources: [source],
        optionalNotes: [{ text: 'Additional source detail can be read later.', sources: [source] }] },
      nextAction: 'recheck', followUpFocus: 'Ask about the optional detail.',
    };
    const updated = applyEvaluation(original, original.attempts[0].id, fresh, 4000);
    expect(updated.attempts).toHaveLength(1);
    expect(updated.attempts[0].answer).toBe(answer);
    expect(updated.attempts[0].question).toEqual(original.attempts[0].question);
    expect(original.attempts[0].evaluation?.feedbackVersion).toBeUndefined();
    expect(updated.attempts[0].evaluation?.nextAction).toBe('continue');
    expect(updated.attempts[0].evaluation?.followUpFocus).toBeUndefined();
    expect(buildRoundReport(updated).independent).toHaveLength(1);
    expect(buildConditionEvidence(updated.attempts).cueLevels.find(item => item.cueLevel === 4)?.completedWithoutSupport).toHaveLength(1);
    expect(updated.exposures.some(item => item.kind === 'feedback')).toBe(true);
    fresh.answerGuide!.referenceAnswer = 'Mutated after applying';
    expect(updated.attempts[0].evaluation?.answerGuide?.referenceAnswer).not.toBe('Mutated after applying');
  });

  it('rejects contradictory new feedback without overwriting the saved answer or old feedback', () => {
    const original = completed();
    const bad: RoundEvaluation = { ...evaluation(), feedbackVersion: 1,
      items: [{ ...evaluation().items[0], covered: 'The meaning is correct.', needed: 'More detail is still required.' }],
      answerGuide: { referenceAnswer: 'A comparison.', criterionIds: ['c1'], sources: [source], optionalNotes: [] },
    };
    expect(() => applyEvaluation(original, original.attempts[0].id, bad)).toThrow(/参考回答/);
    expect(original.attempts[0].answer).toBe(answer);
    expect(original.attempts[0].evaluation).toEqual(evaluation());
  });

  it('does not promote malformed saved modern feedback into a success record', () => {
    const original = completed();
    original.attempts[0].evaluation!.feedbackVersion = 1;
    expect(buildRoundReport(original).independent).toHaveLength(0);
    expect(buildRoundReport(original).uncertain).toHaveLength(1);
    expect(buildConditionEvidence(original.attempts).cueLevels.find(item => item.cueLevel === 4)?.uncertain).toHaveLength(1);
  });

  it('uses one budget slot for a complete answer and permits failed evaluation retries without resubmitting', () => {
    const starting = updateDraft(createRound(blueprint(), undefined, 1000), answer, 1050);
    let round = submitRoundAnswer(starting, starting.draft, 1100);
    expect(starting.attempts).toEqual([]);
    expect(round.phase).toBe('feedback');
    expect(round.draft).toBe('');
    expect(() => submitRoundAnswer(round, 'changed answer', 1120)).toThrow(/不要重复提交/);
    expect(() => advanceRound(round, undefined, 1130)).toThrow(/尚未完成/);
    round = recordEvaluationError(round, round.attempts[0].id, '网络中断', 1140);
    expect(buildRoundReport(round).uncertain).toHaveLength(1);
    round = evaluate(round, 1200);
    expect(round.attempts).toHaveLength(1);
    expect(round.attempts[0]).toMatchObject({ answer, independent: true });
    expect(round.attempts[0].evaluationError).toBeUndefined();
    expect(round.attempts[0].helpEvents).toEqual([]);
    expect(round.exposures.some(event => event.kind === 'feedback')).toBe(true);
  });

  it('counts an adaptive recheck in the same hard budget and leaves displaced targets unchecked', () => {
    const second = question('q2', { objectiveIds: ['random'], criteria: [{ id: 'c2', objectiveId: 'random', requirement: '解释随机分配', expected: '减少系统性差异', sources: [{ ...source, page: 4 }] }] });
    let round = createRound(blueprint({ questions: [question('q1'), second] }), undefined, 1000);
    round = evaluate(submitRoundAnswer(round, answer, 1100), 1200);
    round = advanceRound(round, question('adaptive'), 1300);
    expect(round.currentQuestionId).toBe('adaptive');
    round = evaluate(submitRoundAnswer(round, answer, 1400), 1500);
    expect(round.attempts).toHaveLength(2);
    expect(() => advanceRound(round, question('overflow'), 1600)).toThrow(/预算已用完/);
    round = advanceRound(round, undefined, 1600);
    expect(round).toMatchObject({ phase: 'ended', endReason: 'budget' });
    expect(buildRoundReport(round).unchecked.map(row => row.objective.id)).toEqual(['random']);
    expect(() => submitRoundAnswer(round, answer, 1700)).toThrow();
  });

  it('continues preplanned questions and ends when no question remains', () => {
    let round = completed();
    round = advanceRound(round, undefined, 1400);
    expect(round).toMatchObject({ phase: 'ended', endReason: 'completed' });
    expect(round.attempts).toHaveLength(1);
    const planned = blueprint({ questions: [question('q1'), question('q2')] });
    round = evaluate(submitRoundAnswer(createRound(planned, undefined, 2000), answer, 2100), 2200);
    expect(advanceRound(round, undefined, 2300).currentQuestionId).toBe('q2');
  });

  it('preserves draft and help through pause, restore and a user-requested ending', () => {
    let round = recordHelp(updateDraft(createRound(blueprint(), undefined, 1000), 'My unfinished explanation', 1050), 'source', 1100);
    round = pauseRound(round, 1200);
    expect(() => submitRoundAnswer(round, answer, 1250)).toThrow();
    expect(round).toMatchObject({ phase: 'paused', resumePhase: 'answering', draft: 'My unfinished explanation' });
    round = resumeRound(round, 1300);
    expect(round.resumePhase).toBeUndefined();
    expect(round.currentHelp).toHaveLength(1);
    const ended = endRound(round, 1400);
    expect(ended.draft).toBe('My unfinished explanation');
    expect(ended.currentHelp[0].kind).toBe('source');
    expect(ended.endReason).toBe('user');
    round = pauseRound(submitRoundAnswer(round, answer, 1500), 1600);
    round = evaluate(round, 1700);
    expect(round.phase).toBe('paused');
    expect(resumeRound(round, 1800).phase).toBe('feedback');
    expect(round.attempts).toHaveLength(1);
  });
});

describe('soft answer timing', () => {
  it('excludes paused time, resumes the accumulated answer time and freezes it at submission', () => {
    let round = createRound(blueprint({ answerTimeLimitSeconds: 180 }), undefined, 1000);
    round = updateDraft(round, 'unfinished answer', 21000);
    expect(getAnswerElapsedMs(round, 31000)).toBe(30000);
    round = pauseRound(round, 61000);
    expect(round.answerStartedAt).toBeUndefined();
    expect(getAnswerElapsedMs(round, 601000)).toBe(60000);
    // A refresh retains the paused accumulator; the next active interval starts at resume.
    round = resumeRound(JSON.parse(JSON.stringify(round)), 601000);
    expect(getAnswerElapsedMs(round, 621000)).toBe(80000);
    round = submitRoundAnswer(round, answer, 631000);
    expect(round.attempts[0]).toMatchObject({ elapsedMs: 90000, timeLimitSeconds: 180, independent: true });
    expect(getAnswerElapsedMs(round, 999999)).toBe(90000);
    expect(round.answerStartedAt).toBeUndefined();
    round = pauseRound(round, 1000000);
    round = resumeRound(round, 2000000);
    expect(round.phase).toBe('feedback');
    expect(getAnswerElapsedMs(round, 3000000)).toBe(90000);
  });

  it('allows an over-limit answer and records time without changing its evidence classification', () => {
    const initial = createRound(blueprint({ answerTimeLimitSeconds: 180 }), undefined, 1000);
    expect(getAnswerElapsedMs(initial, 242000)).toBe(241000);
    expect(initial.phase).toBe('answering');
    expect(initial.attempts).toEqual([]);
    const submitted = submitRoundAnswer(initial, answer, 242000);
    expect(submitted.attempts[0].elapsedMs! > submitted.attempts[0].timeLimitSeconds! * 1000).toBe(true);
    const result = evaluate(submitted, 243000);
    expect(buildRoundReport(result).independent).toHaveLength(1);
    expect(result.attempts[0].elapsedMs).toBe(241000);
    const unlimited = submitRoundAnswer(createRound(blueprint(), undefined, 1000), answer, 601000);
    expect(unlimited.attempts[0]).toMatchObject({ elapsedMs: 600000, independent: true });
    expect(unlimited.attempts[0].timeLimitSeconds).toBeUndefined();
  });

  it('starts a fresh timer for a follow-up and preserves the first answer timing', () => {
    let round = createRound(blueprint({ answerTimeLimitSeconds: 300 }), undefined, 1000);
    round = evaluate(submitRoundAnswer(round, answer, 61000), 71000);
    round = advanceRound(round, question('timed-follow-up'), 121000);
    expect(getAnswerElapsedMs(round, 122000)).toBe(1000);
    round = submitRoundAnswer(round, answer, 131000);
    expect(round.attempts.map(attempt => attempt.elapsedMs)).toEqual([60000, 10000]);
    expect(round.attempts.map(attempt => attempt.timeLimitSeconds)).toEqual([300, 300]);
    const stopped = endRound(createRound(blueprint(), undefined, 2000), 12000);
    expect(getAnswerElapsedMs(stopped, 999999)).toBe(10000);
  });
});

describe('help and evidence boundaries', () => {
  it('snapshots reviewed cue conditions separately from extra help and preserves the submitted question', () => {
    const initial = createRound(blueprint(), undefined, 1000);
    const submitted = submitRoundAnswer(initial, answer, 1100);
    expect(submitted.attempts[0].conditions).toMatchObject({ presentation: 'reviewed', cueLevel: 4, cognitiveDemand: 'explain',
      connection: 'single', support: 'none_recorded' });
    const originalPrompt = submitted.attempts[0].question.prompt;
    initial.questions[0].prompt = 'A changed live prompt';
    expect(submitted.attempts[0].question.prompt).toBe(originalPrompt);
    expect(getAttemptConditions(submitted.attempts[0]).presentation).toBe('reviewed');
  });

  it('keeps feedback-supported low-cue completion separate from no-extra-help completion', () => {
    let round = completed();
    round = advanceRound(round, question('low-cue', { cueLevel: 1 }), 1400);
    round = evaluate(submitRoundAnswer(round, answer, 1500), 1600);
    expect(round.attempts[0].conditions).toMatchObject({ cueLevel: 4, support: 'none_recorded' });
    expect(round.attempts[1].conditions).toMatchObject({ cueLevel: 1, support: 'recorded' });
    const evidence = buildConditionEvidence(round.attempts, 'comparison');
    expect(evidence.cueLevels[0].completedWithoutSupport).toEqual([]);
    expect(evidence.cueLevels[0].completedWithSupport).toEqual([round.attempts[1].id]);
    expect(evidence.cueLevels[3].completedWithoutSupport).toEqual([round.attempts[0].id]);
    expect(round.attempts[1].helpEvents.some(event => event.kind === 'feedback')).toBe(true);
  });

  it('retains a newly submitted legacy answer but cannot certify its old cue labels', () => {
    const oldPlan = blueprint();
    delete oldPlan.questions[0].audit;
    delete oldPlan.questions[0].presentationVersion;
    oldPlan.questions[0].responseRequirements = ['The control group provides a comparison.'];
    const round = evaluate(submitRoundAnswer(createRound(oldPlan, undefined, 1000), answer, 1100), 1200);
    expect(round.attempts[0]).toMatchObject({ answer, independent: true, conditions: { presentation: 'legacy_unchecked', cueLevel: null } });
    expect(round.attempts[0].evaluation!.items[0].status).toBe('met');
    expect(buildRoundReport(round).uncertain).toHaveLength(1);
    expect(buildRoundReport(round).independent).toHaveLength(0);
  });

  it('records requested support once, even when it is recorded before an asynchronous reply', () => {
    let round = recordHelp(createRound(blueprint(), undefined, 1000), 'hint', 1100);
    const support = { questionId: 'q1', kind: 'hint' as const, text: '考虑两组之间可以比较什么。', sources: [source], at: 1200 };
    round = addSupport(round, support, 1200);
    expect(round.currentHelp).toHaveLength(1);
    expect(addSupport(round, support, 1200)).toBe(round);
    round = addSupport(round, { ...support, text: '比较能排除哪些其他变化？', at: 1300 }, 1300);
    expect(round.currentHelp).toHaveLength(2);
    const requestedOnly = recordHelp(createRound(blueprint({ id: 'request-failed' }), undefined, 2000), 'explanation', 2100);
    expect(submitRoundAnswer(requestedOnly, answer, 2200).attempts[0].independent).toBe(false);
  });

  it('retains earlier independent evidence while later feedback-assisted practice is labelled as assisted', () => {
    let round = completed();
    expect(round.attempts[0].independent).toBe(true);
    round = advanceRound(round, question('q2'), 1400);
    round = evaluate(submitRoundAnswer(round, answer, 1500), 1600);
    expect(round.attempts.map(attempt => attempt.independent)).toEqual([true, false]);
    expect(buildRoundReport(round).independent).toHaveLength(1);
    expect(buildRoundReport(round).rows[0].attempts).toHaveLength(2);
    expect(buildRoundReport(round).rows[0].delayedCheck).toBe(false);
  });

  it('carries same-page exposure across new objective ids and changed source text without inheriting old success', () => {
    const original = completed();
    const changed = blueprint({ id: 'new-plan', scope: { ...blueprint().scope, id: 'scope:page-3:content-b' } });
    changed.objectives = [{ id: 'new-target', label: '换一种说法说明对照的价值', sources: [{ ...source, quote: 'A different sentence on the same page.' }] }];
    changed.questions = [question('new-question', { objectiveIds: ['new-target'], criteria: [{ ...question('base').criteria[0], objectiveId: 'new-target' }] })];
    const history = buildRoundHistory([original], changed.scope);
    expect(history.previousQuestions).toEqual([]);
    let round = createRound(changed, history, 2000);
    expect(buildRoundReport(round, [original]).unchecked).toHaveLength(1);
    round = evaluate(submitRoundAnswer(round, answer, 2100), 2200);
    expect(round.attempts[0].independent).toBe(false);
    expect(buildRoundReport(round, [original]).assisted).toHaveLength(1);
  });

  it('does not contaminate a different page and requires a real elapsed interval for a novel delayed check', () => {
    const original = completed();
    const pageFour = blueprint({ id: 'page-four' });
    pageFour.questions = [question('other-page', { objectiveIds: ['random'], criteria: [{ ...question('base').criteria[0], objectiveId: 'random', sources: [pageFour.objectives[1].sources[0]] }] })];
    let next = createRound(pageFour, buildRoundHistory([original], pageFour.scope), 2000);
    expect(submitRoundAnswer(next, answer, 2100).attempts[0].independent).toBe(true);

    const laterAt = 1200 + RECHECK_DELAY_MS;
    const later = blueprint({ id: 'next-day', questions: [question('next-day-question', { kind: 'delayed', novelty: 'new' })] });
    next = createRound(later, buildRoundHistory([original], later.scope), laterAt);
    next = evaluate(submitRoundAnswer(next, answer, laterAt), laterAt + 100);
    expect(next.attempts[0].independent).toBe(true);
    expect(buildRoundReport(next, [original]).rows[0].delayedCheck).toBe(true);

    const rephrased = { ...next, attempts: next.attempts.map(attempt => ({ ...attempt, question: { ...attempt.question, novelty: 'rephrased' as const } })) };
    expect(buildRoundReport(rephrased, [original]).rows[0].delayedCheck).toBe(false);
  });

  it('refreshes the help interval when an old answer receives new visible feedback', () => {
    const original = completed();
    const refreshed = applyEvaluation(original, original.attempts[0].id, evaluation(), RECHECK_DELAY_MS + 2000);
    const later = blueprint({ id: 'after-review', questions: [question('after-review')] });
    const round = createRound(later, buildRoundHistory([refreshed], later.scope), RECHECK_DELAY_MS + 2100);
    expect(submitRoundAnswer(round, answer, RECHECK_DELAY_MS + 2200).attempts[0].independent).toBe(false);
    expect(refreshed.attempts[0].independent).toBe(true);
  });

  it('records source-panel exposure while paused or ended for every page, including goals not yet generated', () => {
    let first = createRound(blueprint(), undefined, 1000);
    first = recordScopeExposure(pauseRound(first, 1100), 'source', 1200);
    expect(first.phase).toBe('paused');
    expect(submitRoundAnswer(resumeRound(first, 1300), answer, 1400).attempts[0].independent).toBe(false);
    const reviewed = recordScopeExposure(endRound(first, 1500), 'source', 1600);
    expect(reviewed.phase).toBe('ended');
    const plan = blueprint({ id: 'new-page-four-goal', objectives: [{ id: 'new-goal', label: '另一个尚未生成过的目标', sources: [{ ...source, page: 4 }] }] });
    plan.questions = [question('new-page-four', { objectiveIds: ['new-goal'], criteria: [{ ...question('base').criteria[0], objectiveId: 'new-goal', sources: [{ ...source, page: 4 }] }] })];
    const next = createRound(plan, buildRoundHistory([reviewed], plan.scope), 1700);
    expect(submitRoundAnswer(next, answer, 1800).attempts[0].independent).toBe(false);
  });

  it('uses previous rounds only as delayed-check context, never as current-round coverage', () => {
    const first = completed();
    const current = createRound(blueprint({ id: 'fresh-round' }), buildRoundHistory([first], first.blueprint.scope), 2000);
    const report = buildRoundReport(current, [first]);
    expect(report.unchecked).toHaveLength(2);
    expect(report.independent).toHaveLength(0);
    expect(report.rows.every(row => row.attempts.length === 0)).toBe(true);
    const weak = evaluate(submitRoundAnswer(createRound(blueprint({ id: 'old-gap' }), undefined, 500), answer, 600), 700, evaluation('missing'));
    expect(buildRoundHistory([weak, first], first.blueprint.scope).weakTargets).toEqual([]);
  });

  it('offers only the newest matching-content round objectives for rechecks, never another scope version', () => {
    const old = { ...completed(), updatedAt: 99999 };
    const latestPlan = blueprint({ id: 'latest-plan' });
    latestPlan.objectives = latestPlan.objectives.map(objective => ({ ...objective, label: `${objective.label}：本轮具体要求` }));
    const latest = createRound(latestPlan, undefined, 5000);
    const other = createRound(blueprint({ id: 'changed-source', scope: { ...latestPlan.scope, id: 'new-content-hash' } }), undefined, 10000);
    const history = buildRoundHistory([other, latest, old], latestPlan.scope);
    expect(history.previousObjectives).toEqual(latestPlan.objectives);
    history.previousObjectives![0].sources[0].quote = 'downstream edit';
    expect(latestPlan.objectives[0].sources[0].quote).toBe(source.quote);
    expect(buildRoundHistory([latest, old], other.blueprint.scope).previousObjectives).toBeUndefined();
  });
});

describe('checkable results and disputes', () => {
  it('distinguishes an uncovered objective, an evaluated gap and an incomplete evaluation', () => {
    let round = createRound(blueprint(), undefined, 1000);
    expect(buildRoundReport(round).unchecked).toHaveLength(2);
    round = submitRoundAnswer(round, answer, 1100);
    expect(buildRoundReport(round).uncertain.map(row => row.objective.id)).toEqual(['comparison']);
    round = evaluate(round, 1200, evaluation('missing'));
    expect(buildRoundReport(round).needsWork.map(row => row.objective.id)).toEqual(['comparison']);
    expect(buildRoundReport(round).unchecked.map(row => row.objective.id)).toEqual(['random']);
  });

  it('requires all criteria for a target, rather than treating one matched point as a complete answer', () => {
    const plan = blueprint();
    plan.questions[0].criteria.push({ ...plan.questions[0].criteria[0], id: 'c2', requirement: '解释排除其他变化的原因' });
    plan.questions[0] = reviewed(plan.questions[0]);
    let round = submitRoundAnswer(createRound(plan, undefined, 1000), answer, 1100);
    const partial = evaluation();
    partial.items.push({ criterionId: 'c2', status: 'missing', answerQuote: '', feedback: '还没有说明为什么需要比较。' });
    round = evaluate(round, 1200, partial);
    expect(buildRoundReport(round).needsWork).toHaveLength(1);
    expect(buildRoundReport(round).independent).toHaveLength(0);
    expect(() => applyEvaluation(round, round.attempts[0].id, evaluation(), 1300)).toThrow(/逐项对应/);
  });

  it('withdraws a disputed result until the user accepts a review, retaining the original answer', () => {
    let round = completed();
    const attemptId = round.attempts[0].id;
    round = disputeAttempt(round, attemptId, '原答并没有说明因果方向', 1400);
    expect(buildRoundReport(round).independent).toHaveLength(0);
    expect(buildRoundReport(round).uncertain).toHaveLength(1);
    expect(round.attempts[0].evaluation!.items[0].status).toBe('met');
    round = resolveDispute(round, attemptId, evaluation('partial'), 1500);
    expect(round.attempts[0].dispute).toMatchObject({ note: '原答并没有说明因果方向', at: 1400, resolvedAt: 1500 });
    expect(round.attempts[0].answer).toBe(answer);
    expect(buildRoundReport(round).needsWork).toHaveLength(1);
    expect(() => resolveDispute(round, attemptId, evaluation(), 1600)).toThrow(/没有待核对/);
  });

  it('does not award evidence for invalid questions, invented answer quotations or out-of-range sources', () => {
    const submitted = submitRoundAnswer(createRound(blueprint(), undefined, 1000), answer, 1100);
    const invalid = evaluate(submitted, 1200, { ...evaluation(), questionValid: false, items: [], invalidReason: '题目要求了资料没有给出的内容。' });
    expect(buildRoundReport(invalid).uncertain).toHaveLength(1);
    expect(invalid.attempts[0].evaluation!.invalidReason).toContain('资料没有给出');
    expect(advanceRound(invalid, undefined, 1300).phase).toBe('ended');

    const invented = evaluation();
    invented.items[0].answerQuote = 'A sentence the student never wrote.';
    expect(buildRoundReport(evaluate(submitted, 1200, invented)).independent).toHaveLength(0);
    const wrongSource = { ...submitted, attempts: submitted.attempts.map(attempt => ({ ...attempt, question: {
      ...attempt.question, criteria: [{ ...attempt.question.criteria[0], sources: [{ ...source, page: 99 }] }],
    } })) };
    expect(buildRoundReport(evaluate(wrongSource, 1200)).uncertain).toHaveLength(1);
    const duplicate = { ...completed(), attempts: completed().attempts.map(attempt => ({ ...attempt, evaluation: { ...evaluation(), items: [evaluation().items[0], evaluation().items[0]] } })) };
    expect(buildRoundReport(duplicate).independent).toHaveLength(0);
  });
});

describe('local record persistence', () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
    vi.stubGlobal('localStorage', storage);
    return { values, storage };
  }

  it('round-trips drafts, support, disputes and records from other blocks without pruning', () => {
    memoryStorage();
    expect(loadRoundStore('exam')).toEqual({ version: 1, rounds: [] });
    const second = blueprint({ id: 'other-block', scope: { ...blueprint().scope, id: 'another-scope' } });
    const otherRound = pauseRound(updateDraft(createRound(second, undefined, 2000), '暂存的未完成原答', 2100), 2200);
    const reviewed = disputeAttempt(completed(), completed().attempts[0].id, '请核对这一项', 1400);
    let store: RoundRecordStore = upsertRound({ version: 1, rounds: [] }, reviewed);
    store = upsertRound(store, otherRound);
    saveRoundStore('exam', store);
    expect(loadRoundStore('exam')).toEqual(store);
    const next = upsertRound(store, endRound(otherRound, 2300));
    expect(next.rounds[0]).toEqual(reviewed);
    expect(next.rounds).toHaveLength(2);
    expect(upsertRound(next, otherRound)).toBe(next);
  });

  it('preserves source exposure before the first round across a block switch and reload', () => {
    memoryStorage();
    const plan = blueprint();
    let store = recordStoreScopeExposure(loadRoundStore('exam'), plan.scope, 'source', 1000);
    expect(store.rounds).toEqual([]);
    saveRoundStore('exam', store);

    // Switching blocks unmounts the preparation page; another block may write to the same exam store.
    const otherPlan = blueprint({ id: 'other-block', scope: { ...plan.scope, id: 'block-b', materials: [{ materialId: 'another-lecture', title: '另一份资料', pages: [3] }] } });
    store = recordStoreScopeExposure(loadRoundStore('exam'), otherPlan.scope, 'source', 1500);
    saveRoundStore('exam', store);

    // Reloading must not depend on the discarded component's pending flags.
    store = loadRoundStore('exam');
    const history = buildRoundHistory(store.rounds, plan.scope, store.scopeExposures);
    const submitted = submitRoundAnswer(createRound(plan, history, 2000), answer, 2100);
    expect(submitted.attempts[0].independent).toBe(false);
    expect(submitted.attempts[0].helpEvents.some(event => event.kind === 'source' && event.at === 1000)).toBe(true);
    expect(submitted.exposures.every(event => event.at !== 1500)).toBe(true);
    expect(buildRoundReport(submitted).independent).toHaveLength(0);
    const updated = upsertRound(store, submitted);
    expect(updated.scopeExposures).toEqual(store.scopeExposures);
    saveRoundStore('exam', updated);
    expect(loadRoundStore('exam').scopeExposures).toHaveLength(3);
  });

  it('merges preparation and round exposures without duplicates or phantom question history', () => {
    memoryStorage();
    const plan = blueprint();
    const initial: RoundRecordStore = { version: 1, rounds: [] };
    const exposed = recordStoreScopeExposure(initial, plan.scope, 'feedback', 1000);
    const duplicate = recordStoreScopeExposure(exposed, plan.scope, 'feedback', 1000);
    expect(initial.scopeExposures).toBeUndefined();
    expect(duplicate.scopeExposures).toHaveLength(2);
    const before = buildRoundHistory(duplicate.rounds, plan.scope, duplicate.scopeExposures);
    expect(before.previousQuestions).toEqual([]);
    expect(before.weakTargets).toEqual([]);
    const round = createRound(plan, before, 2000);
    const store = upsertRound(duplicate, round);
    const merged = buildRoundHistory(store.rounds, plan.scope, store.scopeExposures);
    expect(merged.exposures).toHaveLength(2);
    expect(submitRoundAnswer(round, answer, 2100).attempts[0].independent).toBe(false);
    const later = createRound(blueprint({ id: 'later' }), merged, 1000 + RECHECK_DELAY_MS);
    expect(submitRoundAnswer(later, answer, 1100 + RECHECK_DELAY_MS).attempts[0].independent).toBe(true);
  });

  it('keeps legacy version 1 stores readable and rejects broken preparation exposure without overwriting it', () => {
    const { values } = memoryStorage();
    values.set('exam', JSON.stringify({ version: 1, rounds: [completed()] }));
    expect(loadRoundStore('exam').scopeExposures).toBeUndefined();
    const broken = JSON.stringify({ version: 1, rounds: [], scopeExposures: [{ targetKey: 'unreadable', at: 1000, kind: 'source' }] });
    values.set('exam', broken);
    expect(() => loadRoundStore('exam')).toThrow(/准备阶段/);
    expect(values.get('exam')).toBe(broken);
  });

  it('round-trips original legacy scores without upgrading them to reviewed success or diagnosis', () => {
    const { values } = memoryStorage();
    const legacy = completed();
    delete legacy.attempts[0].conditions;
    delete legacy.attempts[0].question.audit;
    delete legacy.attempts[0].question.presentationVersion;
    legacy.attempts[0].question.responseRequirements = ['The control group provides a comparison.'];
    const original = JSON.stringify({ version: 1, rounds: [legacy] });
    values.set('legacy', original);
    const loaded = loadRoundStore('legacy');
    expect(loaded.rounds[0].attempts[0].answer).toBe(answer);
    expect(loaded.rounds[0].attempts[0].evaluation!.items[0].status).toBe('met');
    expect(loaded.rounds[0].attempts[0].conditions).toBeUndefined();
    expect(buildRoundReport(loaded.rounds[0]).uncertain).toHaveLength(1);
    saveRoundStore('legacy', loaded);
    expect(values.get('legacy')).toBe(original);
    const missing = evaluate(loaded.rounds[0], 1400, evaluation('missing'));
    expect(buildRoundHistory([missing], missing.blueprint.scope).weakTargets).toEqual([]);
    expect(buildRoundReport(missing).needsWork).toHaveLength(0);
  });

  it('round-trips paused timing and keeps old records with unknown timing readable', () => {
    memoryStorage();
    const timed = pauseRound(createRound(blueprint({ answerTimeLimitSeconds: 300 }), undefined, 1000), 41000);
    saveRoundStore('exam', { version: 1, rounds: [timed] });
    const restored = loadRoundStore('exam').rounds[0];
    expect(getAnswerElapsedMs(restored, 1000000)).toBe(40000);
    const resumed = resumeRound(restored, 1000000);
    expect(getAnswerElapsedMs(resumed, 1010000)).toBe(50000);
    const legacy = completed();
    delete legacy.answerStartedAt;
    delete legacy.answerElapsedMs;
    delete legacy.attempts[0].elapsedMs;
    delete legacy.attempts[0].timeLimitSeconds;
    saveRoundStore('exam', { version: 1, rounds: [legacy] });
    expect(loadRoundStore('exam').rounds[0].attempts[0].elapsedMs).toBeUndefined();
    expect(buildRoundReport(loadRoundStore('exam').rounds[0]).independent).toHaveLength(1);
  });

  it('matches actual viewed pages across blocks without exposing unrelated pages or materials', () => {
    const plan = blueprint();
    let store = recordStoreExposure({ version: 1, rounds: [] }, [{ materialId: 'lecture', pages: [4] }], 'source', 1000);
    store = recordStoreExposure(store, [{ materialId: 'other-pdf', pages: [3] }], 'source', 1100);
    expect(store.scopeExposures![0]).toEqual({ materialId: 'lecture', pages: [4], kind: 'source', at: 1000 });
    const round = hydrateRoundExposures(createRound(plan, undefined, 2000), store.scopeExposures);
    expect(submitRoundAnswer(round, answer, 2100).attempts[0].independent).toBe(true);
    const pageFourPlan = blueprint({ id: 'cross-block', scope: { ...plan.scope, id: 'new-block-with-new-hash' } });
    pageFourPlan.questions = [question('page-four', { objectiveIds: ['random'], criteria: [{ ...question('base').criteria[0], objectiveId: 'random', sources: [{ ...source, page: 4 }] }] })];
    const later = createRound(pageFourPlan, buildRoundHistory(store.rounds, pageFourPlan.scope, store.scopeExposures), 2200);
    expect(submitRoundAnswer(later, answer, 2300).attempts[0].independent).toBe(false);
  });

  it('merges externally recorded page views with current drafts and older round snapshots', () => {
    const original = createRound(blueprint(), undefined, 1000);
    const draft = updateDraft(original, '已经写下的独立草稿', 1500);
    const local = upsertRound({ version: 1, rounds: [] }, draft);
    let external = upsertRound({ version: 1, rounds: [] }, original);
    external = recordStoreExposure(external, [{ materialId: 'lecture', pages: [3] }], 'source', 1600);
    const other = createRound(blueprint({ id: 'another-block' }), undefined, 1700);
    external = upsertRound(external, other);
    const merged = mergeRoundStore(local, external);
    expect(merged.rounds).toHaveLength(2);
    expect(merged.rounds.find(round => round.id === original.id)!.draft).toBe('已经写下的独立草稿');
    const hydrated = hydrateRoundExposures(merged.rounds.find(round => round.id === original.id)!, merged.scopeExposures);
    expect(submitRoundAnswer(hydrated, answer, 1800).attempts[0].independent).toBe(false);
    expect(mergeRoundStore(merged, external).scopeExposures).toHaveLength(1);
    const alreadyAnswered = completed();
    expect(hydrateRoundExposures(alreadyAnswered, merged.scopeExposures).attempts[0].independent).toBe(true);
  });

  it('retains unknown-page feedback exposure until a later block of that material is loaded', () => {
    memoryStorage();
    const exposed = recordStoreExposure({ version: 1, rounds: [] }, [{ materialId: 'lecture', pages: [], allPages: true }], 'feedback', 1000);
    const merged = mergeRoundStore(exposed, { version: 1, rounds: [] });
    saveRoundStore('exam', merged);
    const restored = loadRoundStore('exam');
    expect(restored.scopeExposures).toEqual([{ materialId: 'lecture', pages: [], allPages: true, kind: 'feedback', at: 1000 }]);
    const plan = blueprint();
    plan.scope = { ...plan.scope, id: 'later-loaded-page-92', materials: [{ materialId: 'lecture', title: '后来加载的原资料', pages: [92] }] };
    plan.objectives = [{ ...plan.objectives[0], sources: [{ ...source, page: 92 }] }];
    plan.questions = [question('page-92', { criteria: [{ ...question('base').criteria[0], sources: [{ ...source, page: 92 }] }] })];
    const history = buildRoundHistory(restored.rounds, plan.scope, restored.scopeExposures);
    expect(history.exposures).toHaveLength(1);
    const submitted = submitRoundAnswer(createRound(plan, history, 2000), answer, 2100);
    expect(submitted.attempts[0].independent).toBe(false);
    expect(submitted.attempts[0].helpEvents[0].kind).toBe('feedback');
  });

  it('confines all-pages exposure to its material and rejects empty unqualified page lists', () => {
    const exposed = recordStoreExposure({ version: 1, rounds: [] }, [{ materialId: 'unrelated-pdf', pages: [], allPages: true }], 'feedback', 1000);
    const plan = blueprint();
    expect(buildRoundHistory([], plan.scope, exposed.scopeExposures).exposures).toEqual([]);
    const untouched = hydrateRoundExposures(createRound(plan, undefined, 2000), exposed.scopeExposures);
    expect(submitRoundAnswer(untouched, answer, 2100).attempts[0].independent).toBe(true);
    expect(() => recordStoreExposure(exposed, [{ materialId: 'lecture', pages: [] }], 'source', 2200)).toThrow(/页码无效/);
    const relevant = recordStoreExposure(exposed, [{ materialId: 'lecture', pages: [], allPages: true }], 'feedback', 2300);
    const hydrated = hydrateRoundExposures(untouched, relevant.scopeExposures);
    expect(hydrated.exposures).toHaveLength(1);
    expect(submitRoundAnswer(hydrated, answer, 2400).attempts[0].independent).toBe(false);
  });

  it('surfaces quota and read failures while preserving the stored record', () => {
    const { values, storage } = memoryStorage();
    values.set('exam', 'existing record');
    storage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveRoundStore('exam', { version: 1, rounds: [completed()] })).toThrow(/本地保存失败/);
    expect(values.get('exam')).toBe('existing record');
    expect(() => loadRoundStore('exam')).toThrow(/原记录未被修改/);
    storage.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => loadRoundStore('exam')).toThrow(/无法读取/);
  });

  it('rejects damaged or legacy mastery records instead of converting them to independent evidence', () => {
    const { values } = memoryStorage();
    values.set('exam', JSON.stringify({ version: 1, rounds: [{ mastery: 100, coverage: ['comparison'] }] }));
    expect(() => loadRoundStore('exam')).toThrow();
    const damaged = completed();
    damaged.attempts.push(damaged.attempts[0]);
    expect(() => saveRoundStore('exam', { version: 1, rounds: [damaged] })).toThrow(/重复/);
    expect(values.get('exam')).toContain('mastery');
  });
});
