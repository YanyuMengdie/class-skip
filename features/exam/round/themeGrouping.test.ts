import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamMaterialLink, LSAPKnowledgeComponent } from '@/types';

const { generateReadingContent } = vi.hoisted(() => ({ generateReadingContent: vi.fn() }));
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent }));
import { generateThemePlan, themeSourceKey, validateThemePlan, type ThemePlan } from './themeGrouping';

const material: ExamMaterialLink = { id: 'lecture', fileName: 'Memory.pdf', examId: 'exam', userId: 'u', sourceType: 'fileHash', fileHash: 'hash', addedAt: 1 };
const kc = (id: string, pages: number[] = [1]): LSAPKnowledgeComponent => ({
  id, sourceLinkId: material.id, concept: `Concept ${id}`, definition: `Original explanation about ${id} from the lecture.`,
  sourcePages: pages, examWeight: 3, bloomTargetLevel: 1,
  atoms: [{ id: `atom-${id}`, kcId: id, label: `Atom ${id}`, description: `A precise existing logical relationship for ${id}.`, sourcePages: pages }],
});
const kcs = [kc('working', [1, 3]), kc('long-term', [3]), kc('attention', [4])];
const pages = ['Chapter 1: Memory systems', 'Transition and exercise', 'Long-term memory', 'Chapter 2: Attention'];
const plan = (): ThemePlan => ({
  version: 1, sourceKey: themeSourceKey(material, kcs, pages, 'en'), groups: [
    { id: 'memory', title: 'Memory systems', description: 'Working memory and long-term memory: their roles and relationship.', kcIds: ['working', 'long-term'] },
    { id: 'attention', title: 'Attention', description: 'The scope of attention.', kcIds: ['attention'] },
  ],
});
const mockResponse = (groups = plan().groups) => generateReadingContent.mockResolvedValueOnce({ text: JSON.stringify({ groups }) });

beforeEach(() => { generateReadingContent.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('theme source identity', () => {
  it('ignores input order and unrelated material knowledge', () => {
    const reordered = [...kcs].reverse().map(kc => ({ ...kc, sourcePages: [...kc.sourcePages].reverse(), atoms: [...kc.atoms!].reverse() }));
    expect(themeSourceKey(material, [...reordered, { ...kc('foreign'), sourceLinkId: 'other' }], pages, 'en')).toBe(plan().sourceKey);
    expect(themeSourceKey({ ...material, addedAt: 20, sortIndex: 9 }, kcs, pages, 'en')).toBe(plan().sourceKey);
  });

  it('invalidates a plan when text, meaning, atom evidence, material or language changes', () => {
    const original = plan().sourceKey;
    expect(themeSourceKey(material, kcs, [...pages, 'New section'], 'en')).not.toBe(original);
    expect(themeSourceKey(material, kcs.map(kc => ({ ...kc, definition: 'Revised meaning' })), pages, 'en')).not.toBe(original);
    expect(themeSourceKey(material, kcs.map(kc => ({ ...kc, atoms: kc.atoms!.map(atom => ({ ...atom, sourcePages: [2] })) })), pages, 'en')).not.toBe(original);
    expect(themeSourceKey({ ...material, fileHash: 'replacement' }, kcs, pages, 'en')).not.toBe(original);
    expect(themeSourceKey(material, kcs, pages, 'zh')).not.toBe(original);
  });
});

describe('strict theme plans', () => {
  it('preserves complete coverage without a minimum or maximum KC count per theme', () => {
    expect(validateThemePlan(plan(), material, kcs, pages, 'en')).toEqual(plan());
    const many = Array.from({ length: 7 }, (_, index) => kc(`kc${index}`));
    const value = { version: 1, sourceKey: 'manual', groups: [{ id: 'one', title: 'Memory systems', description: 'Related memory concepts.', kcIds: many.map(kc => kc.id) }] };
    expect(validateThemePlan(value, material, many, undefined, 'en').groups[0].kcIds).toHaveLength(7);
  });

  it.each(['missing', 'duplicate across themes', 'duplicate within theme', 'foreign', 'empty group', 'duplicate group', 'empty title'])('rejects %s instead of silently repairing coverage', mode => {
    const value = plan();
    if (mode === 'missing') value.groups[0].kcIds.pop();
    if (mode === 'duplicate across themes') value.groups[1].kcIds.push('working');
    if (mode === 'duplicate within theme') value.groups[0].kcIds.push('working');
    if (mode === 'foreign') value.groups[0].kcIds[0] = 'foreign';
    if (mode === 'empty group') value.groups[0].kcIds = [];
    if (mode === 'duplicate group') value.groups[1].id = 'memory';
    if (mode === 'empty title') value.groups[0].title = ' ';
    expect(() => validateThemePlan(value, material, [...kcs, { ...kc('foreign'), sourceLinkId: 'other' }], pages, 'en')).toThrow('Invalid theme grouping');
  });

  it('rejects stale cache, malformed plans, and duplicate source identifiers', () => {
    expect(() => validateThemePlan(plan(), material, kcs, ['Revised chapter', ...pages.slice(1)], 'en')).toThrow('changed');
    expect(() => validateThemePlan(null, material, kcs, pages, 'en')).toThrow('Invalid theme grouping');
    expect(() => validateThemePlan({ ...plan(), version: 2 }, material, kcs, pages, 'en')).toThrow('Invalid theme grouping');
    expect(() => validateThemePlan(plan(), material, [...kcs, kcs[0]], pages, 'en')).toThrow('duplicated');
  });

  it.each(['Correct answer: 42', 'Memory is the store of experience', '记忆意味着信息的保存', 'x = 4'])('rejects answer-bearing title %s', title => {
    const value = plan(); value.groups[0].title = title;
    expect(() => validateThemePlan(value, material, kcs, pages, 'en')).toThrow('answers');
  });

  it('rejects a copied definition or atom answer in a visible label', () => {
    const value = plan(); value.groups[0].description = kcs[0].atoms![0].description;
    expect(() => validateThemePlan(value, material, kcs, pages, 'en')).toThrow('answers');
  });
});

describe('AI theme organization', () => {
  it('uses existing semantic summaries and chapter cues; never sends another lecture or rewrites knowledge', async () => {
    mockResponse();
    const before = structuredClone(kcs);
    const result = await generateThemePlan(material, [...kcs, { ...kc('PRIVATE FOREIGN'), sourceLinkId: 'other' }], pages, 'en');
    expect(result.sourceKey).toBe(plan().sourceKey);
    expect(result.groups.map(group => group.kcIds)).toEqual([['working', 'long-term'], ['attention']]);
    expect(kcs).toEqual(before);
    const request = generateReadingContent.mock.calls[0][0];
    expect(request.model).toBe('gpt-6-astra');
    const data = JSON.parse(request.contents[0].parts[0].text);
    expect(data.pageOutline.map(page => page.page)).toEqual([1, 2, 3, 4]);
    expect(data.pageOutline[0].opening).toContain('Chapter 1');
    expect(data.existingKcs.map(kc => kc.id)).toEqual(kcs.map(kc => kc.id));
    expect(JSON.stringify(data)).not.toContain('PRIVATE FOREIGN');
    expect(request.config.systemInstruction).toContain('NEVER a quota');
    expect(request.config.systemInstruction).toContain('Page overlap or adjacency alone is NOT a reason to merge');
    expect(request.config.systemInstruction).toContain('Do not disclose definitions, answers');
    expect(request.config.responseSchema.properties.groups.items.required).toEqual(['title', 'description', 'kcIds']);
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('owns group identity locally and keeps it stable across repeated grouping and member order', async () => {
    mockResponse();
    const first = await generateThemePlan(material, kcs, pages, 'en');
    const changed = plan().groups.map(group => ({ ...group, id: 'model-chosen', title: `${group.title} overview`, kcIds: [...group.kcIds].reverse() }));
    mockResponse(changed);
    const second = await generateThemePlan(material, kcs, pages, 'en');
    expect(second.groups.map(group => group.id)).toEqual(first.groups.map(group => group.id));
    expect(second.groups[0].id).not.toBe('model-chosen');
  });

  it('includes unlocated or atom-free KCs without inventing evidence', async () => {
    const source = [{ ...kc('unknown', []), atoms: [] }];
    mockResponse([{ id: 'ignored', title: 'Memory scope', description: 'The lecture topic.', kcIds: ['unknown'] }]);
    const result = await generateThemePlan(material, source, pages, 'en');
    expect(result.groups[0].kcIds).toEqual(['unknown']);
    expect(source[0].sourcePages).toEqual([]);
  });

  it('rejects incomplete provider output without a page-based or fixed-count fallback', async () => {
    mockResponse(plan().groups.slice(0, 1));
    await expect(generateThemePlan(material, kcs, pages, 'en')).rejects.toThrow('missing');
    expect(generateReadingContent).toHaveBeenCalledTimes(1);
  });

  it('reports request failures and invalid JSON explicitly', async () => {
    generateReadingContent.mockRejectedValueOnce({ status: 429 });
    await expect(generateThemePlan(material, kcs, pages, 'en')).rejects.toThrow('quota');
    generateReadingContent.mockResolvedValueOnce({ text: 'not json' });
    await expect(generateThemePlan(material, kcs, pages, 'en')).rejects.toThrow('did not return usable');
  });

  it('bounds a hung provider request and aborts it', async () => {
    vi.useFakeTimers();
    generateReadingContent.mockImplementationOnce(() => new Promise(() => {}));
    const pending = generateThemePlan(material, kcs, pages, 'en');
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(generateReadingContent.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
  });

  it('handles no KCs locally and rejects unreadable text before requesting', async () => {
    expect((await generateThemePlan(material, [], pages, 'en')).groups).toEqual([]);
    await expect(generateThemePlan(material, kcs, [''], 'en')).rejects.toThrow('Load the lecture');
    expect(generateReadingContent).not.toHaveBeenCalled();
  });
});
