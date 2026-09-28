import type { UnderstandingAction, UnderstandingSession } from './readingUnderstanding';
import type { UnderstandingTopic } from './understandingPlan';

export function createGuidedUnderstanding(parent: UnderstandingSession, topic?: UnderstandingTopic, question = ''): UnderstandingSession {
  return {
    version: 1, id: crypto.randomUUID(), scopePolicy: 'message-topic-v1',
    teachingFlow: 'case-reasoning-v2', entryPath: topic || question.trim() ? 'specific' : 'whole',
    topic: topic?.title || '从刚才这一段开始',
    sourceText: topic?.summary || parent.sourceText,
    pageRefs: [...(topic?.pageRefs ?? parent.pageRefs)],
    ...(question.trim() ? { focusQuestion: question.trim() } : {}),
    turns: [], mode: 'acquisition', phase: 'question', createdAt: Date.now(),
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

/** A direct explanation remains an explicit escape hatch, including typed requests. */
export function resolveGuidedAction(action: UnderstandingAction, text: string): UnderstandingAction {
  if (action !== 'answer') return action;
  const request = text.trim();
  if (/^(?:请|麻烦你|你)?(?:直接(?:告诉我|讲给我|讲解|解释|给我答案|揭晓)|不用(?:再)?问了|别(?:再)?问了)|^(?:(?:please|just)\s+)*(?:tell me (?:the answer|directly)|give me the answer|explain (?:it|this) (?:directly|to me)|stop (?:asking|quizzing))/i.test(request)) return 'explain';
  return isUnderstandingNonAnswer(request) ? 'foundation' : action;
}
