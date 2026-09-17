import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBriefStore, saveBriefStore } from './store';
import type { CourseBriefReport } from './types';

const data = new Map<string, string>();
const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
const dispatch = vi.fn();
const key = (ownerId: string) => `class-skip:canvas-brief:v1:${encodeURIComponent(ownerId)}`;
const report = (id: string, ownerId = 'user-a'): CourseBriefReport => ({
  version: 1, id, ownerId, canvasOrigin: 'https://school.instructure.com', canvasUserId: 7,
  courses: [], weekStart: '2026-09-14', timeZone: 'America/Toronto', fetchedAt: '2026-09-15T12:00:00Z',
  generatedAt: '2026-09-15T12:00:00Z', sources: [], items: [], coverage: [], changes: [], analysisStatus: 'complete',
});
beforeEach(() => {
  data.clear(); storage.getItem.mockClear(); storage.setItem.mockClear(); dispatch.mockClear();
  storage.getItem.mockImplementation((key: string) => data.get(key) ?? null);
  storage.setItem.mockImplementation((key: string, value: string) => { data.set(key, value); });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { dispatchEvent: dispatch });
  if (typeof CustomEvent === 'undefined') vi.stubGlobal('CustomEvent', class { constructor(readonly type: string) {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('local course brief snapshot storage', () => {
  it('starts empty and isolates both selected courses and reports by owner', () => {
    expect(loadBriefStore('user-a')).toEqual({ selectedCourseIds: [], reports: [] });
    saveBriefStore('user-a', { selectedCourseIds: [42], reports: [report('a')] });
    saveBriefStore('user-b', { selectedCourseIds: [99], reports: [report('b', 'user-b')] });
    expect(loadBriefStore('user-a')).toEqual({ selectedCourseIds: [42], reports: [report('a')] });
    expect(loadBriefStore('user-b')).toEqual({ selectedCourseIds: [99], reports: [report('b', 'user-b')] });
    expect(loadBriefStore('user-c')).toEqual({ selectedCourseIds: [], reports: [] });
  });
  it('encodes owner keys so punctuation cannot alias another account', () => {
    saveBriefStore('a:b', { selectedCourseIds: [1], reports: [report('punctuation', 'a:b')] });
    saveBriefStore('a%3Ab', { selectedCourseIds: [2], reports: [report('encoded', 'a%3Ab')] });
    expect(loadBriefStore('a:b').selectedCourseIds).toEqual([1]);
    expect(loadBriefStore('a%3Ab').selectedCourseIds).toEqual([2]);
    expect(data.size).toBe(2);
  });
  it('rejects cross-account records on save and on load', () => {
    saveBriefStore('user-a', { selectedCourseIds: [42], reports: [report('mine'), report('theirs', 'user-b')] });
    expect(loadBriefStore('user-a').reports.map(item => item.id)).toEqual(['mine']);
    data.set(key('user-a'), JSON.stringify({ selectedCourseIds: [42], reports: [report('injected', 'user-b'), report('mine')] }));
    expect(loadBriefStore('user-a').reports.map(item => item.id)).toEqual(['mine']);
  });
  it('keeps at most three snapshots in the supplied newest-first order', () => {
    saveBriefStore('user-a', { selectedCourseIds: [42], reports: [report('latest'), report('previous'), report('older'), report('oldest')] });
    expect(loadBriefStore('user-a').reports.map(item => item.id)).toEqual(['latest', 'previous', 'older']);
  });
  it('leaves the old snapshot intact if browser quota rejects the next save', () => {
    const original = { selectedCourseIds: [42], reports: [report('existing')] };
    saveBriefStore('user-a', original);
    const oldRaw = data.get(key('user-a'));
    dispatch.mockClear();
    storage.setItem.mockImplementationOnce(() => { throw new DOMException('Quota full', 'QuotaExceededError'); });
    expect(() => saveBriefStore('user-a', { selectedCourseIds: [99], reports: [report('new')] })).toThrow('Quota full');
    expect(data.get(key('user-a'))).toBe(oldRaw);
    expect(loadBriefStore('user-a')).toEqual(original);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('emits the refresh event only after a successful atomic save', () => {
    dispatch.mockImplementationOnce(() => expect(data.has(key('user-a'))).toBe(true));
    saveBriefStore('user-a', { selectedCourseIds: [42], reports: [report('saved')] });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'canvas-brief-updated' }));
  });
  it('surfaces blocked browser storage and malformed JSON without silently replacing old content', () => {
    storage.getItem.mockImplementationOnce(() => { throw new DOMException('Storage blocked', 'SecurityError'); });
    expect(() => loadBriefStore('user-a')).toThrow('Storage blocked');
    data.set(key('user-a'), '{corrupt');
    expect(() => loadBriefStore('user-a')).toThrow();
    expect(data.get(key('user-a'))).toBe('{corrupt');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('filters invalid course IDs and malformed stored reports', () => {
    data.set(key('user-a'), JSON.stringify({ selectedCourseIds: [42, 0, -1, 1.5, '9', 7],
      reports: [null, { ...report('old-version'), version: 0 }, { ...report('bad-shape'), items: null }, { ...report('bad-user'), canvasUserId: '7' }, report('valid')] }));
    expect(loadBriefStore('user-a')).toEqual({ selectedCourseIds: [42, 7], reports: [report('valid')] });
  });
});
