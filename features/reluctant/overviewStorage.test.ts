import { describe, expect, it, vi } from 'vitest';
import { OVERVIEW_VERSION, type OverviewOutline } from './overview';
import { createOverviewRequestPool, getOverviewStorageKey, readOverviewCache, writeOverviewCache, type OverviewCache } from './overviewStorage';

const outline: OverviewOutline = {
  title: '身体怎样参与情绪',
  overview: '身体反应和情境一起影响感受。',
  pageCount: 4,
  points: [{ id: 'p1', idea: '身体提供线索。', explanation: '身体变化可能影响感受。', caveat: '并不是每次都有效。', pages: [2, 4] }],
};

const makeCache = (): OverviewCache => ({
  version: OVERVIEW_VERSION,
  outline,
  explanations: {
    plain: { title: '大白话', sections: [{ text: '身体会提供线索。并不是每次都有效。', pointIds: ['p1'] }] },
  },
  scrollPositions: { plain: 312 },
  updatedAt: 1,
});

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe('overview local persistence', () => {
  it('isolates users, documents, changed URLs, and output languages', () => {
    const key = getOverviewStorageKey('user', 'doc', 'https://example.test/a.pdf', 'zh-CN');
    expect(new Set([
      key,
      getOverviewStorageKey('other', 'doc', 'https://example.test/a.pdf', 'zh-CN'),
      getOverviewStorageKey('user', 'doc2', 'https://example.test/a.pdf', 'zh-CN'),
      getOverviewStorageKey('user', 'doc', 'https://example.test/b.pdf', 'zh-CN'),
      getOverviewStorageKey('user', 'doc', 'https://example.test/a.pdf', 'en'),
    ]).size).toBe(5);
  });

  it('restores both explanations and their separate reading positions', () => {
    const storage = makeStorage();
    const first = makeCache();
    expect(writeOverviewCache(storage, 'key', first)).toBe(true);
    const second: OverviewCache = {
      ...first,
      explanations: { story: { title: '故事', sections: [{ text: '假设我们遇到一只熊。并不是每次都有效。', pointIds: ['p1'] }] } },
      scrollPositions: { story: 88 },
    };
    expect(writeOverviewCache(storage, 'key', second)).toBe(true);
    const restored = readOverviewCache(storage, 'key').cache;
    expect(restored?.explanations.plain).toEqual(first.explanations.plain);
    expect(restored?.explanations.story).toEqual(second.explanations.story);
    expect(restored?.scrollPositions).toEqual({ plain: 312, story: 88 });
  });

  it('does not merge explanations generated from different outlines', () => {
    const storage = makeStorage();
    writeOverviewCache(storage, 'key', makeCache());
    const changed = { ...makeCache(), outline: { ...outline, title: '不同的一份内容' }, explanations: {}, scrollPositions: {} };
    writeOverviewCache(storage, 'key', changed);
    expect(readOverviewCache(storage, 'key').cache?.explanations).toEqual({});
  });

  it('ignores malformed JSON and invalid page references', () => {
    const storage = makeStorage();
    storage.setItem('key', '{');
    expect(readOverviewCache(storage, 'key')).toEqual({ cache: null, unavailable: false });
    const invalid = { ...makeCache(), outline: { ...outline, points: [{ ...outline.points[0], pages: [99] }] } };
    storage.setItem('key', JSON.stringify(invalid));
    expect(readOverviewCache(storage, 'key').cache).toBeNull();
  });

  it('keeps a valid outline while discarding a damaged variant or invalid position', () => {
    const storage = makeStorage();
    storage.setItem('key', JSON.stringify({ ...makeCache(), explanations: { plain: { title: 'Incomplete', sections: [{ text: 'Dropped the qualification.', pointIds: ['p1'] }] } }, scrollPositions: { plain: -20, story: '20' } }));
    const cached = readOverviewCache(storage, 'key').cache;
    expect(cached?.outline).toEqual(outline);
    expect(cached?.explanations).toEqual({});
    expect(cached?.scrollPositions).toEqual({});
  });

  it('normalizes stored identities before matching explanation source pages', () => {
    const storage = makeStorage();
    const raw = { ...makeCache(), outline: { ...outline, points: [{ ...outline.points[0], id: ' p1 ' }] } };
    storage.setItem('key', JSON.stringify(raw));
    const cached = readOverviewCache(storage, 'key').cache;
    expect(cached?.outline.points[0].id).toBe('p1');
    expect(cached?.explanations.plain?.sections[0].pointIds).toEqual(['p1']);
  });

  it('reports inaccessible or full local storage without blocking reading', () => {
    const storage = {
      getItem: () => { throw new Error('Access denied'); },
      setItem: () => { throw new Error('Quota'); },
    };
    expect(readOverviewCache(storage, 'key')).toEqual({ cache: null, unavailable: true });
    expect(writeOverviewCache(storage, 'key', makeCache())).toBe(false);
  });
});

describe('overview generation reuse', () => {
  it('shares one request during rapid switches and reuses its completed text', async () => {
    const request = createOverviewRequestPool<string>();
    let finish!: (value: string) => void;
    const create = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const first = request('source', create);
    const second = request('source', create);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
    finish('ready');
    await expect(first).resolves.toBe('ready');
    await expect(request('source', create)).resolves.toBe('ready');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('allows a failed generation to be retried and isolates other documents', async () => {
    const request = createOverviewRequestPool<string>();
    await expect(request('source', () => Promise.reject(new Error('interrupted')))).rejects.toThrow('interrupted');
    await expect(request('source', () => Promise.resolve('retry'))).resolves.toBe('retry');
    await expect(request('other', () => Promise.resolve('other result'))).resolves.toBe('other result');
  });
});
