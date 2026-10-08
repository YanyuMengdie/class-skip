import type { UnderstandingSession } from './readingUnderstanding';
import type { UnderstandingPlan } from './understandingPlan';
import { createGuidedUnderstanding } from './guidedUnderstanding';

export function createWholeUnderstanding(parent: UnderstandingSession, plan: UnderstandingPlan): UnderstandingSession {
  if (plan.selectionVersion !== 1 || !plan.topics.length) throw new Error('请先整理这条讲解的知识部分。');
  const parts = plan.topics.map((topic, index) => ({
    id: topic.id, title: topic.title,
    conversation: { ...createGuidedUnderstanding(parent, topic), entryPath: 'whole' as const,
      partScope: { index: index + 1, total: plan.topics.length, title: topic.title } },
  }));
  return { ...createGuidedUnderstanding(parent), topic: '逐部分一起想', sourceText: plan.topics.map(topic => topic.summary).join('\n\n'),
    pageRefs: [...new Set(plan.topics.flatMap(topic => topic.pageRefs))],
    coverage: { version: 1, activePartId: parts[0].id, parts } };
}

export type UnderstandingPartStatus = 'checked' | 'review' | 'explained' | 'in-progress' | 'unvisited';
export function understandingPartStatus(session: UnderstandingSession): UnderstandingPartStatus {
  if (session.reviewRequested) return 'review';
  if (session.phase === 'complete' && session.reasoning?.diagnosis.status === 'supported') return 'checked';
  if (session.reasoning?.diagnosis.status === 'gap') return 'review';
  if (session.explained) return 'explained';
  return session.turns.some(turn => turn.role === 'model') ? 'in-progress' : 'unvisited';
}

/** Completion is per part. Moving forward never marks an unanswered or revealed part as understood. */
export function advanceWholeUnderstanding(round: UnderstandingSession, defer = false): UnderstandingSession {
  if (!round.coverage) return round;
  const coverage = round.coverage;
  const index = coverage.parts.findIndex(part => part.id === coverage.activePartId);
  if (index < 0) return round;
  const parts = coverage.parts.map((part, i) => i === index && defer && understandingPartStatus(part.conversation) !== 'checked'
    ? { ...part, conversation: { ...part.conversation, reviewRequested: part.conversation.turns.some(turn => turn.role === 'model') } } : part);
  const next = parts[index + 1];
  return { ...round, coverage: { ...coverage, parts, activePartId: next?.id ?? null, finished: !next } };
}

export function updateWholePart(round: UnderstandingSession, partId: string, update: (part: UnderstandingSession) => UnderstandingSession): UnderstandingSession {
  if (!round.coverage) return round;
  return { ...round, coverage: { ...round.coverage, parts: round.coverage.parts.map(part => part.id === partId
    ? { ...part, conversation: update(part.conversation) } : part) } };
}
