import { describe, expect, it } from 'vitest';
import type { RoundQuestion } from './roundTypes';
import { ANSWER_FORMATS, answerFormatInstruction, hasReviewedPresentation, questionAuditKey } from './questionPresentation';

const reviewedQuestion = (): RoundQuestion => {
  const task: RoundQuestion = {
    id: 'q', objectiveIds: ['a'], prompt: 'Explain how the response develops.', responseRequirements: [],
    criteria: [{ id: 'c', objectiveId: 'a', requirement: 'Identify the undisclosed causal direction.',
      expected: 'Increased care lowers methylation and increases GR expression.',
      sources: [{ materialId: 'm', page: 1, quote: 'The source establishes this relationship.' }] }],
    cueLevel: 3, kind: 'initial', novelty: 'new', presentationVersion: 2, answerFormat: 'explain', presentationScopeTitle: 'Stress regulation',
  };
  task.audit = { version: 1, status: 'checked', questionKey: questionAuditKey(task), cueLevel: 3, cognitiveDemand: 'explain', connection: 'linked' };
  return task;
};

describe('reviewed question presentation', () => {
  it('uses only local course-independent answer-format instructions', () => {
    for (const language of ['zh', 'en'] as const) for (const format of ANSWER_FORMATS) {
      expect(answerFormatInstruction(format, language)).not.toMatch(/GR|methylation|甲基化|HPA|LG-ABN/);
      expect(answerFormatInstruction(format, language).length).toBeGreaterThan(5);
    }
  });

  it('does not upgrade old questions or unreviewed v2 questions', () => {
    const task = reviewedQuestion();
    expect(hasReviewedPresentation(task)).toBe(true);
    delete task.audit;
    expect(hasReviewedPresentation(task)).toBe(false);
    delete task.presentationVersion;
    expect(hasReviewedPresentation(task)).toBe(false);
  });

  it.each([
    ['prompt', (task: RoundQuestion) => { task.prompt += ' The answer is already in this question.'; }],
    ['format', (task: RoundQuestion) => { task.answerFormat = 'recall'; }],
    ['topic title', (task: RoundQuestion) => { task.presentationScopeTitle = 'GR methylation decreases'; }],
    ['objective', (task: RoundQuestion) => { task.objectiveIds.push('b'); }],
    ['criterion', (task: RoundQuestion) => { task.criteria[0].requirement += ' Another requirement.'; }],
    ['expected answer', (task: RoundQuestion) => { task.criteria[0].expected += ' A new fact.'; }],
    ['source page', (task: RoundQuestion) => { task.criteria[0].sources[0].page = 2; }],
    ['source quote', (task: RoundQuestion) => { task.criteria[0].sources[0].quote += ' Changed evidence.'; }],
    ['cue', (task: RoundQuestion) => { task.cueLevel = 1; }],
    ['novelty', (task: RoundQuestion) => { task.novelty = 'original'; }],
    ['kind', (task: RoundQuestion) => { task.kind = 'diagnostic'; }],
    ['legacy visible requirements', (task: RoundQuestion) => { task.responseRequirements = ['Reveal the answer']; }],
  ] as const)('invalidates the review when %s changes', (_name, change) => {
    const task = reviewedQuestion();
    change(task);
    expect(hasReviewedPresentation(task)).toBe(false);
  });

  it('uses canonical complete content independent of object insertion order and audit presence', () => {
    const task = reviewedQuestion();
    const reordered = Object.fromEntries(Object.entries(task).reverse()) as unknown as RoundQuestion;
    expect(questionAuditKey(reordered)).toBe(questionAuditKey(task));
    delete reordered.audit;
    expect(questionAuditKey(reordered)).toBe(questionAuditKey(task));
  });

  it('rejects a mismatched cue or an invalid review classification', () => {
    const task = reviewedQuestion();
    task.audit!.cueLevel = 1;
    expect(hasReviewedPresentation(task)).toBe(false);
    task.audit!.cueLevel = task.cueLevel;
    task.audit!.connection = 'unknown' as 'single';
    expect(hasReviewedPresentation(task)).toBe(false);
  });
});
