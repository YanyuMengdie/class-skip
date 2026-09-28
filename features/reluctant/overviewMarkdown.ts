import type { BlockContent, Paragraph, Root, RootContent, Text } from 'mdast';
import type { Plugin } from 'unified';

interface ReadingOptions { language: string; caveats: string[] }
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
}
const paragraph = (value: string): Paragraph => ({ type: 'paragraph', children: [{ type: 'text', value }] });

const calloutLabels = new Set(['注意', '容易混淆', '举个例子', '例子', '举个假想例子', '记住这个', '要点', 'note', 'caution', 'example', 'hypothetical example', 'takeaway', 'remember this']);
const isCalloutLabel = (value: string) => calloutLabels.has(value.trim().replace(/[:：]$/, '').toLowerCase());

/** Repair only a dangling callout heading immediately before its quoted body.
 * Models sometimes emit `prose > **Note**\n\n> body`; Markdown leaves the heading in prose.
 * Work on parsed nodes so emphasis, code, source text and ordinary > comparisons survive.
 */
function joinDetachedCalloutHeadings(tree: Root): void {
  const repaired: RootContent[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    const next = tree.children[i + 1];
    if (node.type !== 'paragraph' || next?.type !== 'blockquote') { repaired.push(node); continue; }
    const children = [...node.children];
    while (children.at(-1)?.type === 'text' && !(children.at(-1) as Text).value.trim()) children.pop();
    const last = children.at(-1);
    let label: string | undefined;
    if (last?.type === 'strong' && last.children.every(child => child.type === 'text')) {
      const candidate = last.children.map(child => (child as Text).value).join('');
      const before = children.at(-2);
      if (isCalloutLabel(candidate) && before?.type === 'text' && /(?:^|\s)>\s*$/.test(before.value)) {
        label = candidate;
        children.pop();
        children[children.length - 1] = { ...before, value: before.value.replace(/(?:^|\s)>\s*$/, '').trimEnd() };
      }
    } else if (last?.type === 'text') {
      const match = /(?:^|\s)>\s*([^>\n]+?)\s*$/.exec(last.value);
      if (match && isCalloutLabel(match[1])) {
        label = match[1];
        children[children.length - 1] = { ...last, value: last.value.slice(0, match.index).trimEnd() };
      }
    }
    if (!label) { repaired.push(node); continue; }
    const content = children.filter(child => child.type !== 'text' || !!child.value);
    if (content.length) repaired.push({ ...node, children: content });
    repaired.push({ ...next, children: [
      { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: label.trim() }] }] },
      ...next.children,
    ] });
    i++;
  }
  tree.children = repaired;
}

/** Presentation only: keep stored prose and source references unchanged. */
export const remarkOverviewReading: Plugin<[ReadingOptions], Root> = (options) => (tree) => {
  joinDetachedCalloutHeadings(tree);
  let caveatShown = false;
  tree.children = tree.children.flatMap<RootContent>((node) => {
    // Only reflow plain prose. Keep lists, tables, formulas and authored Markdown intact.
    if (node.type !== 'paragraph' || node.children.some(child => child.type !== 'text')) return [node];
    const value = node.children.map(child => (child as Text).value).join('');
    if (/[$\\]|==/.test(value)) return [node];
    const chunks: BlockContent[] = [];
    let remaining = value;
    const caveat = !caveatShown && options.caveats.find(candidate => candidate && value.includes(candidate));
    if (caveat) {
      const start = remaining.indexOf(caveat);
      if (start > 0) chunks.push(...reflow(remaining.slice(0, start), options.language));
      chunks.push({ type: 'blockquote', children: [{ type: 'paragraph', children: [
        { type: 'strong', children: [{ type: 'text', value: options.language === 'en' ? 'Note' : '注意' }] },
        { type: 'text', value: `\n${caveat}` },
      ] }] });
      remaining = remaining.slice(start + caveat.length);
      caveatShown = true;
    }
    if (remaining.trim()) chunks.push(...reflow(remaining, options.language));
    return chunks.length ? chunks : [node];
  });

  // Only explicit ==...== annotations become highlights; never guess importance.
  const decorate = (parent: MarkdownNode) => {
    if (!parent.children || ['code', 'inlineCode', 'link', 'linkReference'].includes(parent.type)) return;
    parent.children = parent.children.flatMap(child => {
      if (child.type !== 'text' || typeof child.value !== 'string') { decorate(child); return [child]; }
      const result: MarkdownNode[] = [];
      let from = 0;
      for (const match of child.value.matchAll(/==([^=\n]+)==/g)) {
        if (match.index > from) result.push({ type: 'text', value: child.value.slice(from, match.index) });
        result.push({ type: 'emphasis', data: { hName: 'mark' }, children: [{ type: 'text', value: match[1] }] });
        from = match.index + match[0].length;
      }
      if (!from) return [child];
      if (from < child.value.length) result.push({ type: 'text', value: child.value.slice(from) });
      return result;
    });
  };
  decorate(tree as MarkdownNode);
};

function reflow(value: string, language: string): Paragraph[] {
  const target = language === 'en' ? 320 : 130;
  if (value.length < target * 1.6 || typeof Intl.Segmenter !== 'function') return [paragraph(value)];
  const sentences = [...new Intl.Segmenter(language, { granularity: 'sentence' }).segment(value)].map(part => part.segment);
  const groups: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length >= target) { groups.push(current); current = ''; }
    current += sentence;
  }
  if (current) {
    if (current.length < target / 3 && groups.length) groups[groups.length - 1] += current;
    else groups.push(current);
  }
  return groups.map(paragraph);
}

/** Compress consecutive source pages without inventing pages between gaps. */
export function overviewPageRanges(pages: number[]): string[] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    let last = first;
    while (i + 1 < sorted.length && sorted[i + 1] === last + 1) last = sorted[++i];
    ranges.push(first === last ? String(first) : `${first}–${last}`);
  }
  return ranges;
}
