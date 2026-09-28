import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCheckIn, CHECK_IN_GAP_MS, REST_LINKS } from './supportPolicy';
import { readStudyDraft, writeStudyDraft } from './useStudyDraft';

afterEach(() => vi.unstubAllGlobals());
describe('gentle check-in eligibility', () => {
  const eligible = { now: CHECK_IN_GAP_MS, lastCheckIn: 0, boundaryChanged: true, busy: false, paused: false, editing: false, visible: true };
  it('only checks in at a boundary after a quiet interval', () => {
    expect(canCheckIn(eligible)).toBe(true);
    expect(canCheckIn({ ...eligible, boundaryChanged: false })).toBe(false);
    expect(canCheckIn({ ...eligible, now: CHECK_IN_GAP_MS - 1 })).toBe(false);
  });
  it.each(['busy', 'paused', 'editing'] as const)('does not interrupt %s', field => {
    expect(canCheckIn({ ...eligible, [field]: true })).toBe(false);
  });
  it('does not prompt in the background', () => expect(canCheckIn({ ...eligible, visible: false })).toBe(false));
  it('uses fixed HTTPS destinations without learner state', () => {
    for (const link of REST_LINKS) {
      const url = new URL(link.href);
      expect(url.protocol).toBe('https:');
      expect(url.search).toBe('');
    }
  });
});

describe('recoverable text drafts', () => {
  it('isolates documents and conversations and removes submitted text', () => {
    const values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    writeStudyDraft('doc-a:session-1', 'unfinished thought');
    writeStudyDraft('doc-b:session-1', 'another thought');
    expect(readStudyDraft('doc-a:session-1')).toBe('unfinished thought');
    expect(readStudyDraft('doc-a:session-2')).toBe('');
    writeStudyDraft('doc-a:session-1', '');
    expect(readStudyDraft('doc-a:session-1')).toBe('');
    expect(readStudyDraft('doc-b:session-1')).toBe('another thought');
  });
  it('surfaces a failed explicit save instead of claiming a draft is saved', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
    expect(readStudyDraft('doc')).toBe('');
    expect(() => writeStudyDraft('doc', 'keep this')).toThrow('quota');
  });
});
