import { expect, it } from 'vitest';
import { readingCloudPatch } from './readingPatch';

it('updates structured reading without rewriting the old active-module mirror', () => {
  const snapshot = { skimSessions: [{ id: 's1', messages: [{ id: 'm1', text: 'new' }] }], activeSkimIndex: 0,
    skimMessages: [{ text: 'current module' }], studyMap: {}, skimStage: 'reading', quizData: null,
    skimTopHeight: 60, skimFocusMode: false, annotations: { one: 'keep' }, unknown: 'keep' };
  const original = structuredClone(snapshot);
  expect(readingCloudPatch(snapshot)).toEqual({ skimSessions: snapshot.skimSessions, activeSkimIndex: 0, annotations: snapshot.annotations, unknown: 'keep' });
  expect(snapshot).toEqual(original);
});
it('preserves legacy-only writes and explicit empty session deletions', () => {
  const legacy = { skimMessages: ['old'], studyMap: null, skimStage: 'reading' };
  expect(readingCloudPatch(legacy)).toEqual(legacy);
  expect(readingCloudPatch({ ...legacy, skimSessions: [] })).toEqual({ ...legacy, skimSessions: [] });
});
