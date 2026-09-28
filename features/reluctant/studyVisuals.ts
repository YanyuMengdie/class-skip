import { Type, type Schema } from '@google/genai';

export type StudyVisualIcon = 'idea' | 'person' | 'eye' | 'heart' | 'brain' | 'experiment' | 'cell';
export interface StudyVisualNode { label: string; detail: string; icon?: StudyVisualIcon; link?: string }
interface VisualBase { title: string; caption: string }
export type StudyVisual =
  | (VisualBase & { kind: 'scene' | 'flow' | 'branches'; nodes: StudyVisualNode[] })
  | (VisualBase & { kind: 'compare'; columns: string[]; rows: Array<{ label: string; cells: string[] }> });

const icons: StudyVisualIcon[] = ['idea', 'person', 'eye', 'heart', 'brain', 'experiment', 'cell'];
const object = (v: unknown): Record<string, unknown> | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const short = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && v.length <= max && (empty || !!v.trim());

/** Visuals are optional enhancements: malformed/oversized data never discards valid teaching. */
export function parseStudyVisual(value: unknown): StudyVisual | undefined {
  const v = object(value);
  if (!v || !short(v.title, 100) || !short(v.caption, 350, true)) return undefined;
  const base = { title: v.title.trim(), caption: v.caption.trim() };
  if (v.kind === 'compare') {
    if (!Array.isArray(v.columns) || v.columns.length < 2 || v.columns.length > 3 || !v.columns.every(c => short(c, 80))
      || !Array.isArray(v.rows) || v.rows.length < 2 || v.rows.length > 4) return undefined;
    const rows: Array<{ label: string; cells: string[] }> = [];
    for (const raw of v.rows) {
      const row = object(raw);
      if (!row || !short(row.label, 80) || !Array.isArray(row.cells) || row.cells.length !== v.columns.length || !row.cells.every(c => short(c, 220))) return undefined;
      rows.push({ label: row.label, cells: row.cells });
    }
    return { ...base, kind: 'compare', columns: v.columns, rows };
  }
  if (!['scene', 'flow', 'branches'].includes(v.kind as string) || !Array.isArray(v.nodes) || v.nodes.length < 2 || v.nodes.length > 4) return undefined;
  const nodes: StudyVisualNode[] = [];
  for (const [index, raw] of v.nodes.entries()) {
    const n = object(raw);
    if (!n || !short(n.label, 80) || !short(n.detail, 220, true)) return undefined;
    // Explicit edge labels distinguish temporal order, hypothesis, correlation and causation.
    if (index > 0 && v.kind !== 'scene' && !short(n.link, 60)) return undefined;
    const icon = icons.includes(n.icon as StudyVisualIcon) ? n.icon as StudyVisualIcon : undefined;
    nodes.push({ label: n.label, detail: n.detail, ...(icon ? { icon } : {}),
      ...(index > 0 && v.kind !== 'scene' ? { link: n.link as string } : {}) });
  }
  return { ...base, kind: v.kind as 'scene' | 'flow' | 'branches', nodes };
}

const str: Schema = { type: Type.STRING };
export const studyVisualSchema: Schema = {
  type: Type.OBJECT,
  required: ['kind', 'title', 'caption'],
  properties: {
    kind: { type: Type.STRING, enum: ['scene', 'flow', 'branches', 'compare'] }, title: str, caption: str,
    nodes: { type: Type.ARRAY, minItems: '2', maxItems: '4', items: {
      type: Type.OBJECT, required: ['label', 'detail'], properties: {
        label: str, detail: str, icon: { type: Type.STRING, enum: icons }, link: str,
      },
    } },
    columns: { type: Type.ARRAY, minItems: '2', maxItems: '3', items: str },
    rows: { type: Type.ARRAY, minItems: '2', maxItems: '4', items: {
      type: Type.OBJECT, required: ['label', 'cells'], properties: { label: str, cells: { type: Type.ARRAY, items: str } },
    } },
  },
};

export const STUDY_VISUAL_INSTRUCTION = `
Optional lightweight teaching visual, generated WITH the prose in this same response; no separate image generation.
Use a visual only if it clarifies an actual scene, mechanism, relationship or comparison in the supplied source. Omit visual if prose is enough. Never manufacture a scene, comparison or causal chain to fill a template. Keep the plain-language explanation complete without the visual. The visual is a compact alternative view of facts explained in this section, not extra untaught information. Avoid duplicating it as a Markdown table in the prose.
visual.kind:
- scene: 2–4 icon-and-text tiles for an existing example/situation, without arrows. If hypothetical, label it clearly in title/caption.
- flow: 2–4 ordered nodes. Every node after the first has a short link explicitly stating the relation from the previous node (e.g. next step, inhibits, this theory proposes). Do not turn order or association into causation.
- branches: nodes[0] is a common origin, the remaining 1–3 nodes are parallel branches. Each branch has link naming its relation to the origin. Never render parallel processes as a sequential chain.
- compare: 2–3 columns naming the compared concepts, 2–4 rows with a label and one cell per column. Compare the same dimension; retain qualifiers in each cell.
For scene/flow/branches use nodes, not columns/rows. Nodes contain label (<=80 chars), detail (<=220 chars; may be empty), optional icon from idea/person/eye/heart/brain/experiment/cell, and link (<=60 chars, required on flow/branch targets). For compare use columns (each <=80 chars) and rows (label <=80 chars, cells <=220 chars), not nodes.
title <=100 chars. caption <=350 chars; include necessary scope/theory/evidence limitations, or an empty string when unnecessary. Titles, nodes and cells must themselves retain qualifications; a caption cannot undo an overstated label. All strings are plain text in the app output language, no Markdown/HTML, URLs, image data, decorative emoji, fabricated graphs, numerical data, or guessed page numbers. Use only the corresponding source facts. Other disciplines use the same components as appropriate, not psychology-specific templates.`;
