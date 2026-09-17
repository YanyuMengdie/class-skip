import type { Paragraph, PhrasingContent, Root, Strong, Text } from 'mdast';
import type { Plugin } from 'unified';

export interface CuriosityReadingOptions {
  /** Use false on later turns when only the opening explanation needs an accent. */
  highlight?: boolean;
}

const HIGHLIGHT_CLASS = 'curiosity-reading-highlight';
const SENTENCE_END = /[。！？!?…]["'”’」』）)\]]*$/u;
const PERIOD_END = /\.["'”’」』）)\]]*$/u;
const ABBREVIATION_END = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|fig|eq|no|al)|\b[a-z]|(?:\b[a-z]\.)+[a-z])\.$/iu;

function endsSentence(value: string): boolean {
  const end = value.trimEnd();
  if (SENTENCE_END.test(end)) return true;
  if (!PERIOD_END.test(end)) return false;
  const unquoted = end.replace(/["'”’」』）)\]]+$/u, '');
  // A soft wrap after an initial, abbreviation or numeric label is ambiguous.
  return !ABBREVIATION_END.test(unquoted) && !/\d\.$/u.test(unquoted);
}

function textPart(node: Text, value: string): Text {
  // Split nodes no longer have the original node's source range.
  const { position: _position, ...rest } = node;
  return { ...rest, value };
}

function splitParagraph(paragraph: Paragraph): Paragraph[] {
  // Keep raw inline HTML and formula-containing paragraphs intact. Without a
  // math parser, dollar/backslash delimiters can still occur inside text nodes.
  if (paragraph.children.some((node) => (
    node.type === 'html'
    || (node.type as string) === 'inlineMath'
    || (node.type === 'text' && /\$|\\[([]/u.test(node.value))
  ))) return [paragraph];

  const groups: PhrasingContent[][] = [];
  let current: PhrasingContent[] = [];
  for (const node of paragraph.children) {
    if (node.type !== 'text' || !node.value.includes('\n')) {
      current.push(node);
      continue;
    }

    let start = 0;
    for (let index = node.value.indexOf('\n'); index >= 0; index = node.value.indexOf('\n', index + 1)) {
      const prefix = node.value.slice(start, index);
      // Do not walk into emphasis, links, code or other inline nodes to find a
      // boundary. Ambiguous cross-node/cross-emphasis sentences stay together.
      if (!endsSentence(prefix)) continue;
      current.push(textPart(node, node.value.slice(start, index + 1)));
      groups.push(current);
      current = [];
      start = index + 1;
    }
    if (start === 0) current.push(node);
    else if (start < node.value.length) current.push(textPart(node, node.value.slice(start)));
  }
  if (current.length) groups.push(current);
  if (groups.length <= 1) return [paragraph];

  const { position: _position, ...rest } = paragraph;
  return groups.map((children) => ({ ...rest, children }));
}

function plainEmphasisText(children: PhrasingContent[]): string | null {
  let value = '';
  for (const child of children) {
    if (child.type === 'text') value += child.value;
    else if (child.type === 'emphasis' || child.type === 'strong') {
      const nested = plainEmphasisText(child.children);
      if (nested === null) return null;
      value += nested;
    } else return null;
  }
  return value;
}

function isShortProse(strong: Strong): boolean {
  const value = plainEmphasisText(strong.children)?.trim();
  if (!value || Array.from(value).length > 60 || /[\r\n]/u.test(value)) return false;
  if (!/\p{L}/u.test(value) || /[$\\=<>+*^∑∫√≤≥±×÷]/u.test(value)) return false;
  // A lone Latin/Greek symbol and digits are more likely a variable than prose.
  return !/^[\p{Script=Latin}\p{Script=Greek}][\d\s\p{P}\p{S}]*$/u.test(value);
}

function highlightFirst(children: PhrasingContent[]): boolean {
  for (const node of children) {
    if (node.type === 'strong' && isShortProse(node)) {
      const properties = node.data?.hProperties || {};
      const previous = properties.className;
      const classes = Array.isArray(previous)
        ? previous.map(String)
        : typeof previous === 'string' ? previous.split(/\s+/u).filter(Boolean) : [];
      node.data = {
        ...node.data,
        hProperties: {
          ...properties,
          className: [...new Set([...classes, HIGHLIGHT_CLASS])].join(' '),
        },
      };
      return true;
    }
    if (node.type === 'emphasis' && highlightFirst(node.children)) return true;
  }
  return false;
}

/** Layout only: preserve every source character and existing inline node. */
export const remarkCuriosityReading: Plugin<[CuriosityReadingOptions?], Root> = function (options = {}) {
  return (tree) => {
    tree.children = tree.children.flatMap<Root['children'][number]>((node) => (
      node.type === 'paragraph' ? splitParagraph(node) : [node]
    ));
    if (options.highlight === false) return;
    for (const node of tree.children) {
      if (node.type === 'paragraph' && highlightFirst(node.children)) break;
    }
  };
};
