import { describe, expect, it } from 'vitest';
import {
  RECHECK_DELAY_MS, applyEvaluation, buildKnowledgeEvidence, buildRoundHistory, createRound,
  disputeAttempt, getRoundTargetKey, recordHelp, submitRoundAnswer,
} from './roundState';
import type {
  RoundBlueprint, RoundEvaluation, RoundKnowledgeTarget, RoundObjective, RoundQuestion, StudyRound,
} from './roundTypes';
import { questionAuditKey } from './questionPresentation';
import { buildConditionEvidence } from './conditionEvidence';

const targets: RoundKnowledgeTarget[] = [
  { id: 'kc-a:comparison', kcId: 'kc-a', atomId: 'comparison', kcLabel: '研究设计', label: '对照组提供比较',
    description: '比较干预组与对照组，区分其他变化。', materialId: 'lecture', pages: [3], contentKey: 'source-v1:comparison' },
  { id: 'kc-a:random', kcId: 'kc-a', atomId: 'random', kcLabel: '研究设计', label: '随机分配减少系统差异',
    description: '分组前随机分配参与者。', materialId: 'lecture', pages: [4], contentKey: 'source-v1:random' },
  { id: 'kc-a:blind', kcId: 'kc-a', atomId: 'blind', kcLabel: '研究设计', label: '盲法减少期望影响',
    description: '控制测量中的期望影响。', materialId: 'lecture', pages: [4], contentKey: 'source-v1:blind' },
];
const answer = 'A control group provides a comparison. Random allocation reduces systematic differences.';
function reviewed(question: RoundQuestion): RoundQuestion {
  const value = { ...question, presentationVersion: 2 as const, presentationScopeTitle: 'Research design', answerFormat: 'explain' as const, responseRequirements: [] };
  return { ...value, audit: { version: 1, status: 'checked', questionKey: questionAuditKey(value),
    cueLevel: value.cueLevel, cognitiveDemand: 'explain', connection: 'linked' } };
}
function plan(id = 'plan', objectiveTargets = targets.slice(0, 2)): RoundBlueprint {
  const objectives: RoundObjective[] = objectiveTargets.map((target, index) => ({
    id: `${id}:objective-${index}`, label: `检验：${target.label}`, knowledgeTarget: target,
    sources: [{ materialId: target.materialId, page: target.pages[0], quote: target.description }],
  }));
  return {
    id, createdAt: 1000, maxAttempts: 2,
    scope: { id: `scope:${id}`, title: '研究设计', mode: 'practice', objectiveHints: [], knowledgeTargets: targets,
      materials: [{ materialId: 'lecture', title: 'Lecture', pages: [3, 4] }] },
    objectives,
    questions: [reviewed({ id: `${id}:question`, objectiveIds: objectives.map(objective => objective.id),
      prompt: `完整解释研究设计：${id}`, responseRequirements: ['说明比较与随机分配的作用'],
      kind: 'initial', cueLevel: 4, novelty: 'new', criteria: objectives.map((objective, index) => ({
        id: `${id}:criterion-${index}`, objectiveId: objective.id, requirement: objective.label,
        expected: objective.knowledgeTarget!.description, sources: objective.sources,
      })) })],
  };
}
function evaluated(blueprint = plan(), at = 1000, statuses: ('met' | 'partial' | 'missing' | 'uncertain')[] = ['met', 'met'], assisted = false): StudyRound {
  let round = createRound(blueprint, undefined, at);
  if (assisted) round = recordHelp(round, 'hint', at + 10);
  round = submitRoundAnswer(round, answer, at + 100);
  const evaluation: RoundEvaluation = {
    questionValid: true, summary: '逐项核对。', nextAction: 'continue',
    items: blueprint.questions[0].criteria.map((criterion, index) => ({
      criterionId: criterion.id, status: statuses[index] ?? 'met',
      answerQuote: statuses[index] === 'missing' || statuses[index] === 'partial' ? '' : 'A control group provides a comparison.',
      feedback: '核对本项要求。',
    })),
  };
  return applyEvaluation(round, round.attempts[0].id, evaluation, at + 200);
}

describe('knowledge identities and factual evidence', () => {
  it('maps case observations back to the actual atom across historical objective IDs', () => {
    const blueprint = plan('old-objective-ids');
    const task = blueprint.questions[0];
    task.practiceVersion = 1;
    task.cueLevel = 2;
    task.answerFormat = 'apply';
    task.audit = { ...task.audit!, cueLevel: 2, cognitiveDemand: 'apply', questionKey: questionAuditKey(task),
      exercise: { version: 1, taskType: 'case', hypothetical: true,
        applicationObjectiveIds: [blueprint.objectives[0].id] } };
    const round = evaluated(blueprint);
    const rows = buildKnowledgeEvidence(targets, [round], 2000);
    expect(rows[0].practiceEvidence.lowCueApplication.independent).toEqual([round.attempts[0].id]);
    expect(rows[1].practiceEvidence.application.attempted).toEqual([]);
    expect(rows[1].practiceEvidence.basis.independent).toEqual([round.attempts[0].id]);
    expect(rows[2].practiceEvidence.application.attempted).toEqual([]);
  });

  it('records high-cue completion for its actual condition without labeling low-cue evidence as tested', () => {
    const round = evaluated(plan(), 1000);
    const row = buildKnowledgeEvidence(targets, [round], 2000)[0];
    expect(row.status).toBe('independent');
    const conditions = buildConditionEvidence(row.attempts, round.blueprint.objectives[0].id);
    expect(conditions.cueLevels[3].completedWithoutSupport).toHaveLength(1);
    expect(conditions.cueLevels.slice(0, 3).every(bucket => !bucket.completedWithoutSupport.length)).toBe(true);
    expect(buildKnowledgeEvidence(targets, [round], 2000)[2].status).toBe('unchecked');
  });

  it('keeps legacy successes and omissions visible without using them as new evidence or erasing reviewed records', () => {
    const prior = evaluated(plan('reviewed'), 1000, ['met', 'missing']);
    const legacy = evaluated(plan('legacy'), 2000, ['missing', 'met']);
    delete legacy.attempts[0].conditions;
    delete legacy.attempts[0].question.audit;
    const onlyLegacy = buildKnowledgeEvidence(targets, [legacy], 3000);
    expect(onlyLegacy.map(row => row.status)).toEqual(['uncertain', 'uncertain', 'unchecked']);
    const rows = buildKnowledgeEvidence(targets, [prior, legacy], 3000);
    expect(rows.map(row => row.status)).toEqual(['independent', 'needs_work', 'unchecked']);
    expect(rows[0].attempts).toEqual([prior.attempts[0], legacy.attempts[0]]);
    expect(buildRoundHistory([legacy], legacy.blueprint.scope, [], 3000).weakTargets).toEqual([]);
    expect(legacy.attempts[0].evaluation!.items.map(item => item.status)).toEqual(['missing', 'met']);
  });

  it('keeps fixed atom identity across AI labels and source snippets while retaining exposure pages', () => {
    const objective = plan().objectives[0];
    const changedWording = { ...objective, id: 'new-objective', label: '不同提问方式', sources: [{ ...objective.sources[0], quote: 'another source excerpt' }] };
    expect(getRoundTargetKey(changedWording)).toBe(getRoundTargetKey(objective));
    expect(JSON.parse(getRoundTargetKey(objective)).pages).toEqual([JSON.stringify(['lecture', 3])]);
    expect(getRoundTargetKey({ ...objective, knowledgeTarget: { ...targets[0], contentKey: 'source-v2' } })).not.toBe(getRoundTargetKey(objective));

    const first = evaluated(plan('first', [targets[0]]), 1000, ['met']);
    const nextPlan = plan('reworded', [targets[0]]);
    nextPlan.objectives[0].label = '另一个表述';
    const next = submitRoundAnswer(createRound(nextPlan, buildRoundHistory([first], nextPlan.scope), 2000), answer, 2100);
    expect(next.attempts[0].independent).toBe(false);
  });

  it('scores each atom in a composite answer and leaves unasked atoms unchecked', () => {
    const round = evaluated(plan(), 1000, ['met', 'missing']);
    const rows = buildKnowledgeEvidence(targets, [round], 2000);
    expect(rows.map(row => row.status)).toEqual(['independent', 'needs_work', 'unchecked']);
    expect(rows[0].conditionEvidence.cueLevels[3].completedWithoutSupport).toEqual([round.attempts[0].id]);
    expect(rows[1].conditionEvidence.cueLevels[3].completedWithoutSupport).toEqual([]);
    expect(rows[1].conditionEvidence.cueLevels[3].needsWork).toEqual([round.attempts[0].id]);
    expect(rows[0].attempts).toEqual([round.attempts[0]]);
    expect(rows[1].attempts[0].evaluation!.items[1].status).toBe('missing');
    expect(rows[2].attempts).toEqual([]);
  });

  it('requires every criterion for an atom, without discarding another atom’s valid result', () => {
    const blueprint = plan();
    blueprint.questions[0].criteria.push({ ...blueprint.questions[0].criteria[0], id: 'second-comparison-requirement' });
    blueprint.questions[0] = reviewed(blueprint.questions[0]);
    const round = evaluated(blueprint, 1000, ['met', 'met', 'partial']);
    expect(buildKnowledgeEvidence(targets, [round], 2000).map(row => row.status)).toEqual(['needs_work', 'independent', 'unchecked']);
  });

  it('accumulates by stable extracted target across block boundaries but never inherits legacy or changed-content success', () => {
    const first = evaluated(plan('original'), 1000);
    const next = evaluated(plan('integrated-other-block'), 2000, ['missing', 'met']);
    next.blueprint.scope.mode = 'integrated';
    const rows = buildKnowledgeEvidence(targets, [first, next], 3000);
    expect(rows[0].status).toBe('needs_work');
    expect(rows[0].attempts).toEqual([first.attempts[0], next.attempts[0]]);
    expect(buildKnowledgeEvidence([{ ...targets[0], contentKey: 'changed-content' }], [first, next], 3000)[0].status).toBe('unchecked');
    const legacyPlan = plan('legacy');
    delete legacyPlan.scope.knowledgeTargets;
    legacyPlan.objectives.forEach(objective => { delete objective.knowledgeTarget; });
    const legacy = evaluated(legacyPlan, 1000);
    expect(buildKnowledgeEvidence(targets, [legacy], 3000).every(row => row.status === 'unchecked')).toBe(true);
  });

  it('withdraws success while a result is disputed or invalid, retaining the actual submitted answer', () => {
    const first = evaluated();
    const disputed = disputeAttempt(first, first.attempts[0].id, '来源没有要求这一点', 1300);
    const rows = buildKnowledgeEvidence(targets, [first, disputed], 2000);
    expect(rows.slice(0, 2).every(row => row.status === 'uncertain')).toBe(true);
    expect(rows[0].attempts[0].answer).toBe(answer);
    expect(rows[0].attempts[0].dispute?.note).toBe('来源没有要求这一点');
    const invalid = applyEvaluation(first, first.attempts[0].id, {
      questionValid: false, invalidReason: '材料没有提供评分要求', items: [], summary: '需要核对', nextAction: 'clarify',
    }, 1400);
    expect(buildKnowledgeEvidence(targets, [invalid], 2000)[0].status).toBe('uncertain');
  });

  it('tracks help conditions for the specific atom in a composite answer', () => {
    const round = evaluated();
    round.attempts[0].independent = false;
    round.attempts[0].helpEvents = [{ id: 'prior-help', kind: 'hint', at: 1050,
      questionId: round.attempts[0].question.id, objectiveIds: [round.blueprint.objectives[0].id] }];
    const rows = buildKnowledgeEvidence(targets, [round], 2000);
    expect(rows.map(row => row.status)).toEqual(['assisted', 'independent', 'unchecked']);
    expect(rows[0].conditionEvidence.cueLevels[3].completedWithSupport).toEqual([round.attempts[0].id]);
    expect(rows[1].conditionEvidence.cueLevels[3].completedWithoutSupport).toEqual([round.attempts[0].id]);
  });

  it('uses elapsed time only to schedule rechecks and does not revive success after a later gap', () => {
    const first = evaluated(plan('first'), 1000);
    const assisted = evaluated(plan('assisted'), 2000, ['met', 'met'], true);
    const due = buildKnowledgeEvidence(targets, [first, assisted], 1100 + RECHECK_DELAY_MS);
    expect(due[0]).toMatchObject({ status: 'recheck', lastAt: 2100 });
    expect(due[0].attempts.map(attempt => attempt.independent)).toEqual([true, false]);
    const gap = evaluated(plan('gap'), 1500, ['missing', 'met']);
    expect(buildKnowledgeEvidence(targets, [first, gap, assisted], 3000)[0].status).toBe('assisted');
    const rechecked = evaluated(plan('rechecked'), RECHECK_DELAY_MS + 3000);
    expect(buildKnowledgeEvidence(targets, [first, rechecked], RECHECK_DELAY_MS + 4000)[0].status).toBe('independent');
  });
});

describe('knowledge-driven round history', () => {
  it('prioritizes untested atoms and concrete omissions across blocks while keeping recheck objectives fixed', () => {
    const previous = evaluated(plan('previous'), 1000, ['met', 'missing']);
    const nextScope = plan('other-block').scope;
    const history = buildRoundHistory([previous], nextScope, [], 2000);
    expect(history.knowledgePriorities?.map(item => [item.targetId, item.status])).toEqual([
      [targets[2].id, 'unchecked'], [targets[1].id, 'needs_work'], [targets[0].id, 'independent'],
    ]);
    expect(history.weakTargets).toEqual([targets[1].label]);
    expect(history.previousQuestions).toEqual([previous.attempts[0].question.prompt]);
    expect(history.previousObjectives).toBeUndefined();
    const recheck = buildRoundHistory([previous], { ...previous.blueprint.scope, mode: 'recheck' }, [], 2000);
    expect(recheck.previousObjectives).toEqual(previous.blueprint.objectives);
    recheck.previousObjectives![0].knowledgeTarget!.pages.push(99);
    expect(previous.blueprint.objectives[0].knowledgeTarget!.pages).toEqual([3]);
  });

  it('does not label a disputed evaluation as an established weak link', () => {
    const previous = evaluated(plan(), 1000, ['missing', 'met']);
    const disputed = disputeAttempt(previous, previous.attempts[0].id, '题意不清', 1400);
    const history = buildRoundHistory([disputed], previous.blueprint.scope, [], 2000);
    expect(history.weakTargets).toEqual([]);
    expect(history.knowledgePriorities?.filter(item => item.status === 'unchecked')).toHaveLength(3);
  });

  it('rejects persisted goal bindings or criteria outside the extracted atom’s source pages', () => {
    const noBinding = plan();
    delete noBinding.objectives[0].knowledgeTarget;
    expect(() => createRound(noBinding, undefined, 1000)).toThrow(/当前提取/);
    const changedBinding = plan();
    changedBinding.objectives[0].knowledgeTarget = { ...targets[0], contentKey: 'different-content' };
    expect(() => createRound(changedBinding, undefined, 1000)).toThrow(/当前提取/);
    const wrongPage = plan();
    wrongPage.questions[0].criteria[0].sources = [{ materialId: 'lecture', page: 4, quote: 'Source from a different atom.' }];
    expect(() => createRound(wrongPage, undefined, 1000)).toThrow(/评分依据/);
  });
});
