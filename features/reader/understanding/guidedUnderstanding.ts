import type { UnderstandingSession } from './readingUnderstanding';
import type { UnderstandingTopic } from './understandingPlan';

export function createGuidedUnderstanding(parent: UnderstandingSession, topic?: UnderstandingTopic, question = ''): UnderstandingSession {
  return {
    version: 1, id: crypto.randomUUID(), scopePolicy: 'message-topic-v1',
    teachingFlow: 'guided-step-v1', entryPath: topic || question.trim() ? 'specific' : 'whole',
    topic: topic?.title || '从刚才这一段开始',
    sourceText: topic?.summary || parent.sourceText,
    pageRefs: [...(topic?.pageRefs ?? parent.pageRefs)],
    ...(question.trim() ? { focusQuestion: question.trim() } : {}),
    turns: [], mode: 'acquisition', phase: 'explanation', createdAt: Date.now(),
  };
}

/** All earlier branches remain viewable; only explicit new guided branches are resumed. */
export function savedUnderstandingDiscussions(session: UnderstandingSession): UnderstandingSession[] {
  const result: UnderstandingSession[] = [];
  const seen = new Set<string>();
  const visit = (item: UnderstandingSession) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    if (item.turns.length) result.push(item);
    item.plan?.topics.forEach(topic => { if (topic.conversation) visit(topic.conversation); });
    item.guidedDiscussions?.forEach(visit);
    item.archivedSessions?.forEach(visit);
  };
  visit(session);
  return result;
}

export function isUnderstandingNonAnswer(text: string): boolean {
  return /^(?:我)?(?:还|还是|完全)?(?:不知道|没懂|不懂|不会|不明白|没看懂|没有基础)[。！!？?\s]*$|^i (?:don't|do not) (?:know|understand)[.!?\s]*$/i.test(text.trim());
}
