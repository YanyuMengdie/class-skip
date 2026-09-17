import { describe, expect, it } from 'vitest';
import type { Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { remarkCuriosityReading, type CuriosityReadingOptions } from './entryMarkdown';

function prepare(markdown: string, options?: CuriosityReadingOptions) {
  const processor = unified().use(remarkParse).use(remarkMath).use(remarkCuriosityReading, options);
  const original = processor.parse(markdown);
  const tree = processor.runSync(structuredClone(original)) as Root;
  return { original, tree };
}

type ReadableNode = { type: string; value?: string; children?: ReadableNode[]; data?: { hProperties?: { className?: unknown } } };

function characters(node: ReadableNode): string {
  return node.value ?? node.children?.map(characters).join('') ?? '';
}

function highlights(node: ReadableNode): ReadableNode[] {
  return [
    ...(node.data?.hProperties?.className === 'curiosity-reading-highlight' ? [node] : []),
    ...(node.children?.flatMap(highlights) ?? []),
  ];
}

describe('curiosity reading layout preserves the supplied explanation', () => {
  it('adds paragraph breathing room without losing newlines, words or existing inline emphasis', () => {
    const { original, tree } = prepare('海水中的**盐分**仍然存在。\n蒸发的是*水*。\n这也适用于[另一个例子](https://example.com)。');
    expect(tree.children).toHaveLength(3);
    expect(characters(tree)).toBe(characters(original));
    expect(highlights(tree).map(characters)).toEqual(['盐分']);
    expect(tree.children[2]).toEqual(expect.objectContaining({
      children: expect.arrayContaining([expect.objectContaining({ type: 'link', url: 'https://example.com' })]),
    }));
  });

  it('supports English sentence boundaries while retaining soft line wraps and abbreviations', () => {
    const { original, tree } = prepare('Dr.\nChen studies evaporation.\nWater changes\nphase, while salt remains.\n**The same water can change state.**');
    expect(tree.children).toHaveLength(3);
    expect(characters(tree.children[0])).toBe('Dr.\nChen studies evaporation.\n');
    expect(characters(tree.children[1])).toBe('Water changes\nphase, while salt remains.\n');
    expect(characters(tree)).toBe(characters(original));
    expect(highlights(tree).map(characters)).toEqual(['The same water can change state.']);
  });

  it('does not split within nested formatting, links, lists, quotations, code or mathematics', () => {
    const markdown = [
      '**First sentence.\nStill the same emphasis.**',
      '[Linked sentence.\nStill the same link.](https://example.com)',
      '- First list sentence.\n  Second list sentence.',
      '> First quotation.\n> Second quotation.',
      '```text\nFirst code sentence.\nSecond code sentence.\n```',
      'Before math.\n$x = 1.\ny = 2$\nAfter math.',
    ].join('\n\n');
    const { original, tree } = prepare(markdown, { highlight: false });
    expect(tree).toEqual(original);
  });

  it('preserves every long emphasis and highlights only the first short prose emphasis', () => {
    const long = 'This deliberately long emphasized sentence must remain complete and receive ordinary emphasis throughout.';
    const { original, tree } = prepare(`**${long}** **123.45** **x + y** **$E=mc^2$** **Phase changes** and **Energy transfer**.`);
    expect(characters(tree)).toBe(characters(original));
    expect(highlights(tree).map(characters)).toEqual(['Phase changes']);
    expect(tree.children[0]).toEqual(expect.objectContaining({
      children: expect.arrayContaining([expect.objectContaining({ type: 'strong', children: [{ type: 'text', value: long, position: expect.any(Object) }] })]),
    }));
  });

  it('allows later turns to retain their content with no added highlight or invented emphasis', () => {
    const source = 'Galaxies contain stars.\n**Gravity** shapes their motion.';
    const opening = prepare(source);
    const later = prepare(source, { highlight: false });
    expect(highlights(opening.tree)).toHaveLength(1);
    expect(highlights(later.tree)).toHaveLength(0);
    expect(characters(later.tree)).toBe(characters(later.original));
    expect(highlights(prepare('任意一份没有加粗的新资料。\n这里只展示原有文字。').tree)).toHaveLength(0);
  });
});
