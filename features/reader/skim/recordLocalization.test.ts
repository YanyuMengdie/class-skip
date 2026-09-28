import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkimRecordDeck } from '@/types';
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: generate }));

let api: typeof import('./recordLocalization');
const original = [{ id: 'section-1', title: '注意力定向与眼动', summary: '介绍注意力与眼动之间的联系。' }];
const english = [{ id: 'section-1', title: 'Attention orienting and eye movements', summary: 'The relationship between attention and eye movements.' }];
beforeEach(async () => {
  vi.resetModules(); generate.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  api = await import('./recordLocalization');
});
afterEach(() => vi.unstubAllGlobals());

describe('section display translations', () => {
  it('shares one request between shelf and reader, with an explicit target language', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ entries: english }) });
    const [shelf, reader] = await Promise.all([api.translateRecordLabels(original, 'en'), api.translateRecordLabels(original, 'en')]);
    expect(shelf).toEqual(reader);
    expect(shelf['section-1'].title).toBe(english[0].title);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0].config.systemInstruction).toContain('English');
    expect(original[0].title).toBe('注意力定向与眼动');
  });

  it('restores cached translations after reload and invalidates changed source copy', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ entries: english }) });
    await api.translateRecordLabels(original, 'en');
    vi.resetModules(); api = await import('./recordLocalization');
    await api.translateRecordLabels(original, 'en');
    expect(generate).toHaveBeenCalledOnce();
    await api.translateRecordLabels([{ ...original[0], title: '注意力的新标题' }], 'en');
    expect(generate).toHaveBeenCalledTimes(2);
    vi.resetModules(); api = await import('./recordLocalization');
    await api.translateRecordLabels(original, 'en');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('extracts only labels without changing progress, pages or conversations', () => {
    const deck: SkimRecordDeck = { version: 1, routeId: 'route', createdAt: 1, orderedCardIds: ['section-1'], view: 'shelf', activeCardId: 'section-1', cards: {
      'section-1': { ...original[0], routeNodeId: 'node', moduleIndex: 1, moduleTitle: '注意力', pageStart: 2, pageEnd: 4, pageLabel: '2–4', lastPage: 3,
        status: 'completed', completedAt: 123, messages: [{ role: 'user', text: 'PRIVATE CHAT', timestamp: 1 }] },
    } };
    const saved = JSON.stringify(deck);
    expect(api.recordLabelSource(deck)).toEqual(original);
    expect(JSON.stringify(api.recordLabelSource(deck))).not.toContain('PRIVATE CHAT');
    expect(api.recordLabelsKey(api.recordLabelSource({ ...deck, cards: { 'section-1': { ...deck.cards['section-1'], lastPage: 4 } } }), 'en'))
      .toBe(api.recordLabelsKey(original, 'en'));
    expect(JSON.stringify(deck)).toBe(saved);
  });

  it.each([
    [], [{ ...english[0], id: 'different-section' }], [english[0], english[0]],
    [{ ...english[0], title: '' }], [{ ...english[0], summary: '' }], original,
  ])('rejects incomplete, misaligned or untranslated output', entries => {
    expect(() => api.validateRecordLabels({ entries }, original, 'en')).toThrow();
  });

  it('does not cache failures and permits an explicit retry', async () => {
    generate.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce({ text: JSON.stringify({ entries: english }) });
    await expect(api.translateRecordLabels(original, 'en')).rejects.toThrow();
    expect(api.cachedRecordLabels(original, 'en')).toBeUndefined();
    await expect(api.translateRecordLabels(original, 'en')).resolves.toHaveProperty('section-1');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('keeps English source labels as-is and recognizes original Chinese on switching back', () => {
    expect(api.needsRecordTranslation(english[0].title, 'en')).toBe(false);
    expect(api.needsRecordTranslation(original[0].title, 'zh-CN')).toBe(false);
    expect(api.needsRecordTranslation(original[0].title, 'en')).toBe(true);
  });
});
