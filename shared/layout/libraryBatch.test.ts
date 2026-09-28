import { describe, expect, it, vi } from 'vitest';
import { runLibraryBatch } from './libraryBatch';

describe('library batch outcomes', () => {
  it('deduplicates selections and retries only unfinished files', async () => {
    const apply = vi.fn(async (id: string) => { if (id === 'b') throw Error('offline'); });
    const result = await runLibraryBatch(['a', 'b', 'a', 'c'], apply, () => true);
    expect(result).toEqual({ completedIds: ['a', 'c'], failedIds: ['b'] });
    expect(apply.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    const retry = vi.fn(async () => {});
    await runLibraryBatch(result.failedIds, retry, () => true);
    expect(retry.mock.calls).toHaveLength(1);
    expect(retry).toHaveBeenCalledWith('b');
  });
  it('stops issuing writes after the library account changes', async () => {
    let current = true;
    const apply = vi.fn(async () => { current = false; });
    expect(await runLibraryBatch(['a', 'b', 'c'], apply, () => current)).toEqual({ completedIds: ['a'], failedIds: ['b', 'c'] });
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('does not write when the account is already stale', async () => {
    const apply = vi.fn();
    expect(await runLibraryBatch(['a'], apply, () => false)).toEqual({ completedIds: [], failedIds: ['a'] });
    expect(apply).not.toHaveBeenCalled();
  });
});
