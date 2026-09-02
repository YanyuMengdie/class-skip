import { describe, expect, it } from 'vitest';
import { getActiveIndexAfterDeletion, getNextDefaultSessionSequence } from './sessionTabs';

describe('session tabs', () => {
  it('does not reuse or renumber default names after deletion', () => {
    expect(getNextDefaultSessionSequence(['领读 1', '领读 3', '复习思路'], '领读')).toBe(4);
    expect(getNextDefaultSessionSequence(['私教 2'], '私教')).toBe(3);
  });

  it('keeps the same active session when deleting an earlier tab', () => {
    const sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(getActiveIndexAfterDeletion(sessions, 2, 'a')).toBe(1);
  });

  it('selects the nearest remaining tab when deleting the active tab', () => {
    const sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(getActiveIndexAfterDeletion(sessions, 1, 'b')).toBe(1);
    expect(getActiveIndexAfterDeletion(sessions, 2, 'c')).toBe(1);
  });
});
