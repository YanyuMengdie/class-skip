import { describe, expect, it } from 'vitest';
import { reconcileStudy, sameStudyValue } from './reconcile';

const conflict = (base: object, local: object, remote: object) => expect(() => reconcileStudy(base as Record<string, unknown>, local as Record<string, unknown>, remote as Record<string, unknown>)).toThrow('无法安全自动合并');

describe('content-aware study reconciliation', () => {
  it('compares JSON objects independently of property order', () => {
    expect(sameStudyValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });
  it('merges different modules without losing old or unknown fields', () => {
    const session = { id: 's1', recordDeck: { cards: { a: { messages: [{ id: 'm0', text: 'old' }] }, b: { messages: [] } } } };
    const base = { future: { preserved: true }, skimSessions: [session] };
    const local = structuredClone(base), remote = structuredClone(base);
    local.skimSessions[0].recordDeck.cards.a.messages.push({ id: 'm1', text: 'local' });
    remote.skimSessions[0].recordDeck.cards.b.messages.push({ id: 'm2', text: 'remote' });
    const merged = reconcileStudy(base, local, remote) as typeof base;
    expect(merged.skimSessions[0].recordDeck.cards.a.messages.map(m => m.id)).toEqual(['m0', 'm1']);
    expect(merged.skimSessions[0].recordDeck.cards.b.messages.map(m => m.id)).toEqual(['m2']);
    expect(merged.future).toEqual(base.future);
    expect(base.skimSessions[0].recordDeck.cards.b.messages).toEqual([]);
  });
  it('retains distinct appended discussions and deduplicates identical messages', () => {
    const base = { turns: [{ id: 'q', text: 'question' }] };
    const a = { id: 'a', text: 'answer a' }, b = { id: 'b', text: 'answer b' };
    expect(reconcileStudy(base, { turns: [...base.turns, a] }, { turns: [...base.turns, b] })).toEqual({ turns: [...base.turns, b, a] });
    expect(reconcileStudy(base, { turns: [...base.turns, a] }, { turns: [...base.turns, a] })).toEqual({ turns: [...base.turns, a] });
  });
  it('matches legacy reading messages by unique role/timestamp rather than position', () => {
    const q = { role: 'model', timestamp: 1, text: 'old' };
    const a = { role: 'user', timestamp: 2, text: 'a' }, b = { role: 'user', timestamp: 3, text: 'b' };
    expect(reconcileStudy({ messages: [q] }, { messages: [q, a] }, { messages: [q, b] })).toEqual({ messages: [q, b, a] });
  });
  it('does not fabricate a merged explanation from incompatible changes to the same message', () => {
    conflict({ turns: [{ id: 'm1', text: 'old' }] }, { turns: [{ id: 'm1', text: 'local' }] }, { turns: [{ id: 'm1', text: 'remote' }] });
  });
  it('keeps explicit deletion when the cloud has not edited the deleted content', () => {
    expect(reconcileStudy({ messages: [{ id: 'm1', text: 'old' }], notes: 'old' }, { messages: [], notes: 'old' }, { messages: [{ id: 'm1', text: 'old' }], notes: 'new' })).toEqual({ messages: [], notes: 'new' });
  });
  it('does not resurrect a deleted message or silently drop a concurrent edit', () => {
    conflict({ messages: [{ id: 'm1', text: 'old' }] }, { messages: [] }, { messages: [{ id: 'm1', text: 'edited' }] });
  });
  it('rejects duplicate identities, reordered history and positional arrays', () => {
    conflict({ messages: [] }, { messages: [{ id: 'm', text: 'a' }, { id: 'm', text: 'b' }] }, { messages: [{ id: 'n', text: 'c' }] });
    conflict({ messages: [{ id: 'a' }, { id: 'b' }] }, { messages: [{ id: 'b' }, { id: 'a' }] }, { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    conflict({ values: [] }, { values: ['a'] }, { values: ['b'] });
  });
  it('allows navigation differences but never guesses a completion or reasoning status', () => {
    expect(reconcileStudy({ currentIndex: 0 }, { currentIndex: 1 }, { currentIndex: 2 })).toEqual({ currentIndex: 1 });
    conflict({ status: 'reading' }, { status: 'complete' }, { status: 'not-started' });
  });
});
