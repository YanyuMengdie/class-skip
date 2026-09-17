import type { RoundCitation, RoundEvaluation, RoundQuestion } from './roundTypes';

/** Check the new feedback contract without reinterpreting older saved evaluations. */
export function feedbackContractValid(question: RoundQuestion, evaluation: RoundEvaluation): boolean {
  if (evaluation.feedbackVersion === undefined) return evaluation.answerGuide === undefined;
  if (evaluation.feedbackVersion !== 1 || !Array.isArray(evaluation.items)) return false;
  if (!evaluation.questionValid) return evaluation.items.length === 0 && evaluation.answerGuide === undefined;
  const criteria = question.criteria;
  const ids = new Set(criteria.map(criterion => criterion.id));
  if (!criteria.length || ids.size !== criteria.length || evaluation.items.length !== criteria.length
    || new Set(evaluation.items.map(item => item.criterionId)).size !== criteria.length) return false;
  if (evaluation.items.some(item => {
    if (!ids.has(item.criterionId) || typeof item.covered !== 'string' || typeof item.needed !== 'string') return true;
    const covered = !!item.covered.trim();
    const needed = !!item.needed.trim();
    switch (item.status) {
      case 'met': return !covered || needed;
      case 'partial': return !covered || !needed;
      case 'missing': return covered || !needed;
      case 'uncertain': return needed;
      default: return true;
    }
  })) return false;
  const guide = evaluation.answerGuide;
  if (!guide || typeof guide.referenceAnswer !== 'string' || !guide.referenceAnswer.trim()
    || !Array.isArray(guide.criterionIds) || guide.criterionIds.length !== ids.size
    || new Set(guide.criterionIds).size !== ids.size || guide.criterionIds.some(id => !ids.has(id))) return false;
  const sourceAllowed = (source: RoundCitation) => source && typeof source.quote === 'string' && !!source.quote.trim()
    && Number.isSafeInteger(source.page) && source.page > 0
    && criteria.some(criterion => criterion.sources.some(fixed => fixed.materialId === source.materialId && fixed.page === source.page));
  const sourcesAllowed = (sources: RoundCitation[]) => Array.isArray(sources) && sources.length > 0 && sources.every(sourceAllowed);
  return sourcesAllowed(guide.sources) && Array.isArray(guide.optionalNotes) && guide.optionalNotes.length <= 3
    && guide.optionalNotes.every(note => note && typeof note.text === 'string' && !!note.text.trim() && sourcesAllowed(note.sources));
}
