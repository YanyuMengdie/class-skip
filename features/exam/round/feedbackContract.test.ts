import { describe, expect, it } from 'vitest';
import { feedbackContractValid } from './feedbackContract';
import type { RoundEvaluation, RoundQuestion } from './roundTypes';

const source = { materialId: 'lecture', page: 3, quote: 'A comparison isolates the relevant difference.' };
const question: RoundQuestion = {
  id: 'q', prompt: 'Why use a comparison?', objectiveIds: ['atom'], responseRequirements: [],
  criteria: [{ id: 'c', objectiveId: 'atom', requirement: 'Explain the comparison.', expected: source.quote, sources: [source] }],
  kind: 'initial', cueLevel: 4, novelty: 'original',
};
const value = (): RoundEvaluation => ({
  feedbackVersion: 1, questionValid: true,
  items: [{ criterionId: 'c', status: 'met', answerQuote: 'see the difference', feedback: 'You expressed the comparison.', covered: 'The comparison shows the relevant difference.', needed: '' }],
  summary: 'The question is addressed.', nextAction: 'continue',
  answerGuide: { referenceAnswer: 'A comparison lets us see the relevant difference.', criterionIds: ['c'], sources: [source], optionalNotes: [] },
});

describe('required answer and optional enrichment contract', () => {
  it('accepts a coherent reference answer and keeps optional detail separate', () => {
    const feedback = value();
    feedback.answerGuide!.optionalNotes = [{ text: 'An additional source-backed illustration.', sources: [source] }];
    expect(feedbackContractValid(question, feedback)).toBe(true);
  });
  it('does not allow a completed criterion to demand an extra detail', () => {
    const feedback = value(); feedback.items[0].needed = 'Also list every mechanism.';
    expect(feedbackContractValid(question, feedback)).toBe(false);
  });
  it('requires a concrete minimal repair for an incomplete answer', () => {
    const feedback = value(); feedback.items[0].status = 'partial';
    expect(feedbackContractValid(question, feedback)).toBe(false);
    feedback.items[0].needed = 'Say what the comparison helps distinguish.';
    expect(feedbackContractValid(question, feedback)).toBe(true);
  });
  it('does not classify uncertainty as a definite knowledge gap', () => {
    const feedback = value(); feedback.items[0].status = 'uncertain'; feedback.items[0].needed = 'Learn the mechanism.';
    expect(feedbackContractValid(question, feedback)).toBe(false);
  });
  it.each([{ ids: [] }, { ids: ['other'] }, { ids: ['c', 'c'] }])('rejects incomplete, foreign or duplicate reference criterion IDs: $ids', ({ ids }) => {
    const feedback = value(); feedback.answerGuide!.criterionIds = ids;
    expect(feedbackContractValid(question, feedback)).toBe(false);
  });
  it('rejects reference or optional sources outside the fixed question', () => {
    const feedback = value(); feedback.answerGuide!.sources[0] = { ...source, page: 4 };
    expect(feedbackContractValid(question, feedback)).toBe(false);
    const optional = value(); optional.answerGuide!.optionalNotes = [{ text: 'Extra', sources: [{ ...source, page: 4 }] }];
    expect(feedbackContractValid(question, optional)).toBe(false);
  });
  it('does not manufacture an authoritative reference for an invalid question', () => {
    const feedback = value(); feedback.questionValid = false; feedback.items = [];
    expect(feedbackContractValid(question, feedback)).toBe(false);
    delete feedback.answerGuide;
    expect(feedbackContractValid(question, feedback)).toBe(true);
  });
  it('keeps saved earlier feedback valid without fabricating the new fields', () => {
    const feedback = value(); delete feedback.feedbackVersion; delete feedback.answerGuide;
    delete feedback.items[0].covered; delete feedback.items[0].needed;
    expect(feedbackContractValid(question, feedback)).toBe(true);
  });
});
