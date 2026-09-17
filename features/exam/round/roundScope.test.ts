import { describe, expect, it } from 'vitest';
import type { ExamMaterialLink, LogicAtom, LSAPKnowledgeComponent } from '@/types';
import { buildStudyBlocks, createRoundContext, getMaterialKcs, pageLabel } from './roundScope';
import type { ThemePlan } from './themeGrouping';

const material: ExamMaterialLink = { id: 'a', fileName: 'lecture.pdf', examId: 'exam', userId: 'u', sourceType: 'fileHash', addedAt: 1 };
const atom = (id: string, sourcePages?: number[]): LogicAtom => ({ id, kcId: 'kc', label: `Atom ${id}`, description: `Explain ${id}`, sourcePages });
const kc = (pages: number[], atoms: LogicAtom[] = [], id = 'kc', sourceLinkId: string | undefined = 'a'): LSAPKnowledgeComponent => ({
  id, concept: `Concept ${id}`, definition: 'definition', sourcePages: pages, sourceLinkId, atoms,
  examWeight: 5, bloomTargetLevel: 1,
});
const texts = Array.from({ length: 31 }, (_, index) => `Original lecture evidence on PDF page ${index + 1}, long enough to support a question.`);

const themes = (kcGroups: string[][]): ThemePlan => ({ version: 1, sourceKey: 'validated-by-caller', groups: kcGroups.map((kcIds, index) => ({
  id: `theme-${index}`, title: `Topic ${index}`, description: 'Related lecture concepts.', kcIds,
})) });

describe('semantic theme study blocks', () => {
  it('keeps every KC and its atoms whole across distant evidence pages, without filling gaps', () => {
    const first = { ...kc([1, 9], [atom('bridge', [1, 9]), atom('unlocated')]), anchorPages: [3], relatedPages: [5, 6] };
    const second = kc([11], [atom('other', [12])], 'second');
    const [block] = buildStudyBlocks(material, 20, [first, second], 'en', themes([['kc', 'second']]));
    expect(block.title).toBe('Topic 0');
    expect(block.description).toBe('Related lecture concepts.');
    expect(block.pages).toEqual([1, 3, 9, 11, 12]);
    expect(block.kcs[0]).toBe(first);
    expect(block.kcs[1]).toBe(second);
    expect(block.kcs[0].atoms).toHaveLength(2);
    expect(block.knowledgeTargets.map(target => target.atomId)).toEqual(['bridge', 'other']);
    const context = createRoundContext([block], { a: texts }, 'practice', 'en');
    expect(context.pages.map(page => page.page)).toEqual([1, 3, 9, 11, 12]);
  });

  it('follows semantic membership even when unrelated themes overlap on the same PDF pages', () => {
    const first = kc([1, 2], [atom('first', [1])]);
    const second = kc([2, 3], [atom('second', [3])], 'second');
    const blocks = buildStudyBlocks(material, 12, [first, second], 'en', themes([['kc'], ['second']]));
    expect(blocks.map(block => block.pages)).toEqual([[1, 2], [2, 3]]);
    expect(blocks.flatMap(block => block.kcs.map(kc => kc.id))).toEqual(['kc', 'second']);
  });

  it('preserves unlocated KCs and atom-free KCs in their assigned theme', () => {
    const unlocated = kc([], [atom('missing')]);
    const noAtoms = kc([4], [], 'second');
    const blocks = buildStudyBlocks(material, 12, [unlocated, noAtoms], 'en', themes([['kc', 'second']]));
    expect(blocks[0].kcs).toEqual([unlocated, noAtoms]);
    expect(blocks[0].pages).toEqual([4]);
    expect(blocks[0].knowledgeTargets).toEqual([]);
  });

  it('rejects malformed theme coverage instead of reverting to page fragments', () => {
    const original = [kc([1, 9])];
    expect(() => buildStudyBlocks(material, 12, original, 'en', themes([['kc'], ['kc']]))).toThrow('Invalid theme grouping');
    expect(() => buildStudyBlocks(material, 12, original, 'en', themes([['unknown']]))).toThrow('foreign');
  });

  it('keeps atom evidence identity stable when existing KCs are regrouped', () => {
    const source = [kc([1], [atom('first', [1])]), kc([9], [atom('second', [9])], 'second')];
    const separate = createRoundContext(buildStudyBlocks(material, 12, source, 'en', themes([['kc'], ['second']])), { a: texts }, 'practice', 'en');
    const merged = createRoundContext(buildStudyBlocks(material, 12, source, 'en', themes([['kc', 'second']])), { a: texts }, 'practice', 'en');
    expect(merged.scope.knowledgeTargets).toEqual(separate.scope.knowledgeTargets);
  });
});

describe('KC-driven study blocks', () => {
  it('requires extracted KCs instead of generating six-page placeholder blocks', () => {
    expect(buildStudyBlocks(material, 31, [])).toEqual([]);
    expect(buildStudyBlocks(material, 0, [kc([1])])).toEqual([]);
  });

  it('preserves one continuous topic longer than six pages instead of splitting by length', () => {
    const pages = Array.from({ length: 9 }, (_, index) => index + 2);
    const original = kc(pages, [atom('a', [2]), atom('b', [9, 10])]);
    const blocks = buildStudyBlocks(material, 31, [original]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].pages).toEqual(pages);
    expect(blocks[0].kcs[0]).toBe(original);
    expect(blocks[0].knowledgeTargets.map((target) => target.atomId)).toEqual(['a', 'b']);
  });

  it('splits distant KC evidence into fragments and never fills the gap', () => {
    const blocks = buildStudyBlocks(material, 20, [kc([1, 2, 9, 10], [atom('a', [1, 2]), atom('b', [9])])]);
    expect(blocks.map((block) => block.pages)).toEqual([[1, 2], [9, 10]]);
    expect(blocks.map((block) => block.knowledgeTargets.map((target) => target.atomId))).toEqual([['a'], ['b']]);
  });

  it('does not append related pages or KCs from another or unbound legacy material', () => {
    const local = { ...kc([1], [atom('a', [1])]), relatedPages: [8, 9] };
    const unbound = { ...kc([2], [atom('a', [2])], 'legacy'), sourceLinkId: undefined };
    const all = [local, kc([12], [atom('a', [12])], 'other', 'b'), unbound];
    expect(getMaterialKcs(material, all)).toEqual([local]);
    const blocks = buildStudyBlocks(material, 12, all);
    const context = createRoundContext(blocks, { a: texts });
    expect(context.pages.map((page) => page.page)).toEqual([1]);
    expect(context.scope.materials.map((item) => item.materialId)).toEqual(['a']);
  });

  it('uses direct atom evidence in addition to KC references and keeps adjacent topics separate', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([1], [atom('a', [2])]), kc([3], [atom('b', [3])], 'second')]);
    expect(blocks.map((block) => block.pages)).toEqual([[1, 2], [3]]);
  });

  it('groups co-located topics while retaining their full KC and atom objects', () => {
    const first = kc([1, 2], [atom('a', [1])]);
    const second = kc([2, 3], [atom('b', [2, 3])], 'second');
    const blocks = buildStudyBlocks(material, 12, [first, second]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].pages).toEqual([1, 2, 3]);
    expect(blocks[0].kcs).toEqual([first, second]);
    expect(blocks[0].knowledgeTargets.map((target) => target.kcId)).toEqual(['kc', 'second']);
  });

  it('keeps incomplete atoms visible but does not substitute KC page references for them', () => {
    const original = kc([1, 2], [atom('known', [1]), atom('unknown')]);
    const [block] = buildStudyBlocks(material, 12, [original]);
    expect(block.kcs[0].atoms).toEqual(original.atoms);
    expect(block.knowledgeTargets.map((target) => target.atomId)).toEqual(['known']);
    expect(createRoundContext([block], { a: texts }).scope.knowledgeTargets?.map((target) => target.atomId)).toEqual(['known']);
  });

  it('keeps unlocated and atom-free KCs for inspection, but refuses to plan from them', () => {
    const original = kc([], [atom('unknown')]);
    const blocks = buildStudyBlocks(material, 12, [kc([1]), original]);
    expect(blocks.map((block) => block.pages)).toEqual([[1], []]);
    expect(blocks[1].kcs[0]).toBe(original);
    expect(blocks.every((block) => block.knowledgeTargets.length === 0)).toBe(true);
    expect(() => createRoundContext(blocks, { a: texts })).toThrow('补全逻辑原子');
  });

  it('keeps blank and placeholder atom descriptions visible without treating them as testable targets', () => {
    const original = kc([1], [atom('valid', [1]), ...['', '   ', '—', '-'].map((description, index) => ({
      ...atom(`incomplete-${index}`, [1]), description,
    }))]);
    const [block] = buildStudyBlocks(material, 12, [original]);
    expect(block.kcs[0]).toBe(original);
    expect(block.kcs[0].atoms).toHaveLength(5);
    expect(block.knowledgeTargets.map((target) => target.atomId)).toEqual(['valid']);
    expect(createRoundContext([block], { a: texts }).scope.knowledgeTargets?.map((target) => target.atomId)).toEqual(['valid']);
  });

  it('does not sanitize partially invalid atom references into a false complete binding', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([1], [atom('outside', [1, 50]), atom('fraction', [1, 1.5]), atom('zero', [0, 1])])]);
    expect(blocks[0].pages).toEqual([1]);
    expect(blocks[0].knowledgeTargets).toEqual([]);
  });

  it('keeps cross-fragment atoms out of single blocks and only admits explicit combined evidence', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([1, 9], [atom('local', [1]), atom('bridge', [1, 9])])]);
    expect(blocks[0].knowledgeTargets.map((target) => target.atomId)).toEqual(['local']);
    expect(blocks[1].knowledgeTargets).toEqual([]);
    expect(createRoundContext([blocks[0]], { a: texts }).scope.knowledgeTargets?.map((target) => target.atomId)).toEqual(['local']);
    const combined = createRoundContext(blocks, { a: texts }, 'integrated');
    expect(combined.scope.knowledgeTargets?.map((target) => target.atomId)).toEqual(['local', 'bridge']);
    expect(combined.pages.map((page) => page.page)).toEqual([1, 9]);
    expect(pageLabel(combined.scope.materials[0].pages)).toBe('PDF 第 1、9 页');
  });
});

describe('source and knowledge identity', () => {
  it('refuses missing source pages instead of substituting the full lecture', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([9], [atom('a', [9])])]);
    expect(() => createRoundContext(blocks, { a: ['text'] })).toThrow('第 9 页');
  });

  it('changes both scope and atom revision when the underlying evidence changes', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([1], [atom('a', [1])])]);
    const first = createRoundContext(blocks, { a: texts });
    const second = createRoundContext(blocks, { a: ['Revised lecture text explaining a very different principle.'] });
    expect(first.scope.id).not.toBe(second.scope.id);
    expect(first.scope.knowledgeTargets![0].id).toBe(second.scope.knowledgeTargets![0].id);
    expect(first.scope.knowledgeTargets![0].contentKey).not.toBe(second.scope.knowledgeTargets![0].contentKey);
  });

  it('changes the scope when the knowledge structure changes even if PDF text stays the same', () => {
    const first = createRoundContext(buildStudyBlocks(material, 12, [kc([1], [atom('a', [1])])]), { a: texts });
    const revised = { ...atom('a', [1]), description: 'A different required relationship.' };
    const second = createRoundContext(buildStudyBlocks(material, 12, [kc([1], [revised])]), { a: texts });
    expect(first.scope.id).not.toBe(second.scope.id);
    expect(first.scope.knowledgeTargets![0].contentKey).not.toBe(second.scope.knowledgeTargets![0].contentKey);
  });

  it('keeps atom evidence identity stable when another block is added or unrelated page text changes', () => {
    const blocks = buildStudyBlocks(material, 12, [kc([1], [atom('a', [1])]), kc([9], [atom('b', [9])], 'second')]);
    const single = createRoundContext([blocks[0]], { a: texts });
    const combined = createRoundContext(blocks, { a: texts }, 'integrated');
    const changed = createRoundContext(blocks, { a: texts.map((text, index) => index === 8 ? 'Changed ninth page with enough source evidence.' : text) }, 'integrated');
    expect(single.scope.knowledgeTargets![0].contentKey).toBe(combined.scope.knowledgeTargets![0].contentKey);
    expect(combined.scope.knowledgeTargets![0].contentKey).toBe(changed.scope.knowledgeTargets![0].contentKey);
    expect(combined.scope.knowledgeTargets![1].contentKey).not.toBe(changed.scope.knowledgeTargets![1].contentKey);
  });
});
