import { describe, expect, it } from 'vitest';
import type { LSAPContentMap } from '@/types';
import type { WorkspaceEvidenceAnnotation } from '@/features/exam/lib/examWorkspaceLsapKey';
import {
  deferRevisit,
  filterEvidenceAnnotationsForMap,
  findDueRevisit,
  pendingRevisitCount,
  resolveRevisit,
  upsertEvidenceAnnotation,
} from './examLearningEvidence';

const map: LSAPContentMap = {
  id: 'map',
  sourceKey: 'source',
  createdAt: 1,
  kcs: [{
    id: 'kc-1',
    concept: 'Threat vs. challenge',
    definition: 'definition',
    sourcePages: [1],
    examWeight: 5,
    bloomTargetLevel: 2,
    atoms: [
      { id: 'atom-1', kcId: 'kc-1', label: 'Resources and demands', description: 'compare them' },
      { id: 'atom-2', kcId: 'kc-1', label: 'Physiology', description: 'vascular response' },
    ],
  }],
};

function review(overrides: Partial<WorkspaceEvidenceAnnotation> = {}): WorkspaceEvidenceAnnotation {
  return {
    id: 'review-1',
    kind: 'needs_review',
    kcId: 'kc-1',
    atomId: 'atom-1',
    createdAt: 10,
    updatedAt: 10,
    revisitStatus: 'pending',
    deferUntilUserTurnCount: 5,
    ...overrides,
  };
}

describe('exam learning evidence helpers', () => {
  it('filters annotations whose KC or atom disappeared after rebuilding the map', () => {
    const valid = review();
    const missingAtom = review({ id: 'missing-atom', atomId: 'atom-x' });
    const missingKc = review({ id: 'missing-kc', kcId: 'kc-x' });
    expect(filterEvidenceAnnotationsForMap([valid, missingAtom, missingKc], map)).toEqual([valid]);
  });

  it('does not schedule a revisit until two later user turns have elapsed', () => {
    const item = review({ deferUntilUserTurnCount: 5 });
    expect(findDueRevisit([item], ['kc-1'], 4)).toBeNull();
    expect(findDueRevisit([item], ['kc-1'], 5)?.id).toBe(item.id);
  });

  it('does not requeue asked or resolved revisits', () => {
    expect(findDueRevisit([review({ revisitStatus: 'asked' })], ['kc-1'], 99)).toBeNull();
    expect(findDueRevisit([review({ revisitStatus: 'resolved' })], ['kc-1'], 99)).toBeNull();
  });

  it('counts pending and asked items but not completed ones', () => {
    expect(pendingRevisitCount([
      review(),
      review({ id: 'asked', atomId: 'atom-2', revisitStatus: 'asked' }),
      review({ id: 'done', revisitStatus: 'resolved' }),
    ], ['kc-1'])).toBe(2);
  });

  it('upserts the same atom/turn annotation without creating duplicates', () => {
    const original = review({ turnId: 'turn-1' });
    const changed = review({ id: 'new-id', turnId: 'turn-1', note: 'still weak', updatedAt: 20 });
    const result = upsertEvidenceAnnotation([original], changed);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: original.id, createdAt: original.createdAt, note: 'still weak' });
  });

  it('resolves or defers a revisit without changing unrelated annotations', () => {
    const other = review({ id: 'other', atomId: 'atom-2' });
    expect(resolveRevisit([review(), other], 'review-1', 30)[0]).toMatchObject({ revisitStatus: 'resolved', updatedAt: 30 });
    expect(deferRevisit([review({ revisitStatus: 'asked' }), other], 'review-1', 8, 40)[0]).toMatchObject({
      revisitStatus: 'pending',
      deferUntilUserTurnCount: 10,
      updatedAt: 40,
    });
  });
});
