import { describe, expect, it } from 'vitest';
import { parseOverviewExplanation, type OverviewOutline } from './overview';
import { parseStudyVisual } from './studyVisuals';

const nodes = [{ label: 'Stimulus', detail: '', icon: 'eye' }, { label: 'Response', detail: 'Only in this model.', link: 'the theory proposes' }];
const diagram = { kind: 'flow', title: 'A proposed relation', caption: 'This is a hypothesis.', nodes };
const outline: OverviewOutline = { title: 'Test', overview: 'Overview', pageCount: 1,
  points: [{ id: 'p1', idea: 'Idea', explanation: 'Explanation', caveat: 'Not settled.', pages: [1] }] };
const explanation = (visual?: unknown) => ({ title: 'Lesson', sections: [{ text: 'The theory proposes a relation. Not settled.', pointIds: ['p1'], ...(visual ? { visual } : {}) }] });

describe('optional lightweight teaching visuals', () => {
  it.each(['flow', 'branches', 'scene'])('preserves a qualified %s without adding relation text', kind => {
    const parsed = parseStudyVisual({ ...diagram, kind });
    expect(parsed).toMatchObject({ kind, title: diagram.title, caption: diagram.caption });
    if (parsed?.kind !== 'compare') expect(parsed?.nodes[1].detail).toBe('Only in this model.');
  });
  it('rejects ambiguous edges instead of silently turning them into causes', () => {
    for (const kind of ['flow', 'branches']) expect(parseStudyVisual({ ...diagram, kind, nodes: nodes.map(n => ({ ...n, link: undefined })) })).toBeUndefined();
    expect(parseStudyVisual({ ...diagram, kind: 'scene', nodes: nodes.map(n => ({ ...n, link: undefined })) })).toBeDefined();
  });
  it('rejects ragged comparison tables', () => {
    const table = { kind: 'compare', title: 'Compare', caption: '', columns: ['A', 'B'], rows: [{ label: 'One', cells: ['A1', 'B1'] }, { label: 'Two', cells: ['A2', 'B2'] }] };
    expect(parseStudyVisual(table)).toEqual(table);
    expect(parseStudyVisual({ ...table, rows: [...table.rows, { label: 'Broken', cells: ['Only A'] }] })).toBeUndefined();
  });
  it('does not truncate qualifications to fit a large diagram', () => {
    expect(parseStudyVisual({ ...diagram, caption: 'x'.repeat(351) })).toBeUndefined();
    expect(parseStudyVisual({ ...diagram, nodes: [...nodes, ...nodes, ...nodes] })).toBeUndefined();
  });
  it('keeps old explanations byte-for-byte compatible and drops only malformed visual metadata', () => {
    expect(parseOverviewExplanation(explanation(), outline)).toEqual(explanation());
    expect(parseOverviewExplanation(explanation({ kind: 'image', url: 'https://invalid.example' }), outline)).toEqual(explanation());
    expect(parseOverviewExplanation(explanation(diagram), outline).sections[0].visual).toBeDefined();
  });
  it('retains all prose but limits optional visuals to three per lecture', () => {
    const points = Array.from({ length: 5 }, (_, i) => ({ ...outline.points[0], id: `p${i}` }));
    const sections = points.map(p => ({ ...explanation(diagram).sections[0], pointIds: [p.id] }));
    const parsed = parseOverviewExplanation({ title: 'Full lecture', sections }, { ...outline, points });
    expect(parsed.sections).toHaveLength(5);
    expect(parsed.sections.filter(s => s.visual)).toHaveLength(3);
  });
  it('still rejects omitted factual qualifications even with a valid diagram', () => {
    expect(() => parseOverviewExplanation({ title: 'Lesson', sections: [{ text: 'No caveat', pointIds: ['p1'], visual: diagram }] }, outline)).toThrow(/qualification/);
  });
});
