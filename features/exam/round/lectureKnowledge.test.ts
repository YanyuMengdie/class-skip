import { describe, expect, it, vi } from 'vitest';
import type { ExamMaterialLink, LSAPContentMap, LSAPKnowledgeComponent } from '@/types';
import { lectureSourceChunks, prepareLectureKnowledge } from './lectureKnowledge';

const material = { id: 'lecture-a', fileName: 'A.pdf' } as ExamMaterialLink;
const kc = (id: string, sourceLinkId = material.id): LSAPKnowledgeComponent => ({ id, sourceLinkId, concept: id, definition: 'A source-grounded point', sourcePages: [1], examWeight: 3, bloomTargetLevel: 1 });
const original: LSAPContentMap = { id: 'map', sourceKey: 'exam', createdAt: 1, kcs: [kc('old'), kc('other', 'lecture-b')] };
const generated = { ...original, kcs: [kc('generated')] };

describe('lecture knowledge extraction integration', () => {
  it('retains physical page numbers through source chunks without dropping text', () => {
    const pages = ['First page. '.repeat(12), 'Second page. '.repeat(12), ''];
    const chunks = lectureSourceChunks(pages, 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(chunk => chunk.length <= 100)).toBe(true);
    expect(chunks.join('').replace(/\[PAGE \d+\]\n|\n/g, '')).toBe(pages[0].trim() + pages[1].trim() + '（本页没有可提取文字）');
    expect(chunks.join('')).toContain('[PAGE 2]');
    expect(chunks.join('')).toContain('[PAGE 3]');
  });

  it('replaces only the selected lecture with new IDs and validates physical pages', async () => {
    const concepts = vi.fn(async (_source: string) => ({ ...generated, kcs: [{ ...kc('generated'), sourcePages: [1, 9], anchorPages: [9], relatedPages: [2] }] }));
    const result = await prepareLectureKnowledge(original, material, ['Page one source', 'Page two source'], 'kc', { concepts, atoms: vi.fn() });
    expect(result.kcs.find(item => item.id === 'other')).toEqual(original.kcs[1]);
    expect(result.kcs).toHaveLength(2);
    expect(result.kcs[1].id).not.toBe('old');
    expect(result.kcs[1]).toMatchObject({ sourceLinkId: material.id, sourcePages: [1], anchorPages: [], relatedPages: [2] });
    expect(concepts.mock.calls[0][0]).toContain('[PAGE 2]');
    expect(original.kcs[0].id).toBe('old');
  });

  it('retains old atom identity and the other lecture when filling atom source pages', async () => {
    const atom = { id: 'existing-atom', kcId: 'old', label: 'Existing point', description: 'Existing explanation', sourcePages: [1] };
    const map = { ...original, kcs: [{ ...original.kcs[0], atoms: [atom] }, original.kcs[1]] };
    const atoms = vi.fn(async (_source: string, subset: LSAPContentMap) => ({ ...subset, kcs: [{ ...subset.kcs[0], atoms: [{ ...atom, sourcePages: [1, 2, 99] }] }] }));
    const result = await prepareLectureKnowledge(map, material, ['Page one', 'Page two'], 'atoms', { concepts: vi.fn(), atoms });
    expect(atoms.mock.calls[0][1].kcs.map(item => item.id)).toEqual(['old']);
    expect(result.kcs[0].atoms?.[0]).toEqual(atom);
    expect(result.kcs[1]).toBe(original.kcs[1]);
  });

  it('allows zero supported atoms, and leaves the input intact on failed extraction', async () => {
    const empty = await prepareLectureKnowledge(original, material, ['Source'], 'atoms', { concepts: vi.fn(), atoms: async (_s, map) => ({ ...map, kcs: [{ ...map.kcs[0], atoms: [] }] }) });
    expect(empty.kcs[0].atoms).toEqual([]);
    await expect(prepareLectureKnowledge(original, material, ['Source'], 'kc', { concepts: async () => null, atoms: vi.fn() })).rejects.toThrow('原有清单已保留');
    expect(original.kcs.map(item => item.id)).toEqual(['old', 'other']);
  });
});
