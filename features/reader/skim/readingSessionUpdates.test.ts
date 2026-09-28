import { describe, expect, it } from 'vitest';
import type { ChatMessage, SkimRecordDeck } from '@/types';
import { updateReadingMessages } from './readingSessionUpdates';
const reply: ChatMessage = { role: 'model', text: '第一段的回复', timestamp: 1 };
const digest = () => ({ clarified: [], unresolved: [], updatedAt: 1 });
const session = () => ({ id: 's1', messages: [] as ChatMessage[], recordDeck: {
  activeCardId: 'b', cards: { a: { id: 'a', messages: [] }, b: { id: 'b', messages: [] } },
} as unknown as SkimRecordDeck });
describe('reading response ownership', () => {
  it('writes to the initiating record after another record is selected', () => {
    const [next] = updateReadingMessages([session()], { sessionId: 's1', recordId: 'a' }, prev => [...prev, reply], digest);
    expect(next.recordDeck.cards.a.messages).toEqual([reply]);
    expect(next.recordDeck.cards.b.messages).toEqual([]);
    expect(next.messages).toEqual([]);
  });
  it('does not move a response into another session or recreate a removed record', () => {
    const s = session(); delete s.recordDeck.cards.a;
    expect(updateReadingMessages([s], { sessionId: 's1', recordId: 'a' }, [reply], digest)[0]).toBe(s);
    expect(updateReadingMessages([s], { sessionId: 'removed', recordId: 'b' }, [reply], digest)[0]).toBe(s);
  });
  it('retains concurrent messages and keeps continuous responses out of records', () => {
    const s = session(); s.messages = [reply];
    const [next] = updateReadingMessages([s], { sessionId: 's1', recordId: null }, prev => [...prev, reply], digest);
    expect(next.messages).toHaveLength(2);
    expect(next.recordDeck).toBe(s.recordDeck);
  });
});
