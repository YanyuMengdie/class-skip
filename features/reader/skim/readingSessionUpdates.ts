import type { ChatMessage, SkimRecordDeck } from '@/types';

type ReadingSession = { id: string; messages: ChatMessage[]; recordDeck?: SkimRecordDeck | null };
export type ReadingMessageOrigin = { sessionId: string; recordId: string | null };

/** Apply an async response to its captured origin, never to the currently selected card. */
export function updateReadingMessages<T extends ReadingSession>(
  sessions: T[], origin: ReadingMessageOrigin,
  update: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[]),
  digest: (messages: ChatMessage[]) => NonNullable<SkimRecordDeck['cards'][string]['digest']>,
): T[] {
  return sessions.map(session => {
    if (session.id !== origin.sessionId) return session;
    const apply = (previous: ChatMessage[]) => typeof update === 'function' ? update(previous) : update;
    if (!origin.recordId) return { ...session, messages: apply(session.messages) };
    const deck = session.recordDeck;
    const card = deck?.cards[origin.recordId];
    // A removed/replanned record must not be recreated or redirected to general chat.
    if (!deck || !card) return session;
    const messages = apply(card.messages ?? []);
    return { ...session, recordDeck: { ...deck, cards: {
      ...deck.cards, [origin.recordId]: { ...card, messages, digest: digest(messages) },
    } } };
  });
}
