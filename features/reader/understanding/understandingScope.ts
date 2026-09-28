import type { ChatMessage } from '@/types';
import type { UnderstandingSession } from './readingUnderstanding';
import { createMessageUnderstandingPlan } from './messageTopics';

/** Rebuild old/broader scopes from the clicked message; keep old discussions for viewing only. */
export function prepareMessageUnderstanding(message: ChatMessage, sourceText: string, allowedPages: number[]): UnderstandingSession {
  const saved = message.skimUnderstanding;
  if (saved?.scopePolicy === 'message-topic-v1' && saved.plan?.scopePolicy === 'message-topic-v1'
    && saved.plan.groupingVersion === 2
    && saved.sourceText === sourceText
    && saved.plan.topics.every(topic => !topic.conversation || topic.conversation.scopePolicy === 'message-topic-v1')) return saved;

  const plan = createMessageUnderstandingPlan(message, sourceText, allowedPages);
  const { archivedSessions = [], ...previous } = saved ?? {};
  return {
    version: 1, id: crypto.randomUUID(), scopePolicy: 'message-topic-v1',
    topic: '', sourceText, plan,
    pageRefs: [...new Set(plan.topics.flatMap(topic => topic.pageRefs))].sort((a, b) => a - b),
    turns: [], mode: 'acquisition', phase: 'question', createdAt: Date.now(),
    ...(saved ? { archivedSessions: [...archivedSessions, previous as UnderstandingSession] } : {}),
  };
}
