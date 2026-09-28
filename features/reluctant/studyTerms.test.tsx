import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseStudyTerms, splitStudyTerms } from './studyTerms';
import { StudyTerms } from './StudyTermPopover';
import { OverviewProse } from './OverviewProse';
import { parseOverviewExplanation } from './overview';
import { readOverviewCache, writeOverviewCache } from './overviewStorage';
import { SprintVisual } from '@/features/exam/cram/SprintVisual';

const terms = [{ term: '遗传漂变', english: 'Genetic drift', explanation: '基因所占比例会因为偶然事件改变，不一定是更有优势的基因留下来。', aliases: ['漂变'] },
  { term: '基因频率', english: 'Allele frequency', explanation: '某种基因版本在种群里占的比例。', aliases: [] },
  { term: '基因', english: 'Gene', explanation: '一段具有功能的遗传信息。', aliases: [] }];
const render = (value: string) => renderToStaticMarkup(<StudyTerms terms={terms} language="zh-CN"><OverviewProse value={value} caveats={[]} language="zh-CN" /></StudyTerms>);

describe('clickable study terminology', () => {
  it('annotates unbolded prose, emphasis, highlights, callouts and table cells', () => {
    const html = render('遗传漂变改变**基因频率**。\n\n> **注意**\n> ==遗传漂变==不保证留下优势。\n\n| 过程 | 影响 |\n| --- | --- |\n| 遗传漂变 | 基因频率 |');
    expect(html.match(/class="study-term"/g)).toHaveLength(5);
    expect(html).toContain('Genetic drift');
    expect(html).toContain('<mark><button');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('<dialog'); // Definitions do not appear before selection.
  });
  it('keeps existing parenthetical English even across a bold boundary without adding duplicates', () => {
    const html = render('**遗传漂变**（Genetic drift）会改变比例。');
    expect(html.match(/Genetic drift/g)).toHaveLength(1);
    expect(html).not.toContain('study-term-english');
  });
  it('prefers longest names, supports aliases, and does not match inside an English word', () => {
    const fragments = splitStudyTerms('基因频率与基因；漂变；Genetic drift。General Gene', terms);
    expect(fragments.filter(p => p.index !== undefined).map(p => p.text)).toEqual(['基因频率', '基因', '漂变', 'Genetic drift', 'Gene']);
    expect(fragments.map(p => p.text).join('')).toBe('基因频率与基因；漂变；Genetic drift。General Gene');
  });
  it('does not alter code, link labels or link destinations', () => {
    const html = render('`遗传漂变`\n\n[遗传漂变](https://example.com/Genetic-drift)\n\n```\n基因频率\n```');
    expect(html).not.toContain('class="study-term"');
    expect(html).toContain('<code>遗传漂变</code>');
  });
  it('keeps lessons readable with missing or damaged metadata, and deduplicates terms', () => {
    expect(parseStudyTerms(undefined)).toBeUndefined();
    expect(parseStudyTerms([terms[0], {}, { ...terms[0] }, { ...terms[1], english: '' }])).toEqual([terms[0]]);
    const html = renderToStaticMarkup(<OverviewProse value="**遗传漂变**" caveats={[]} language="zh-CN" />);
    expect(html).toContain('<strong>遗传漂变</strong>');
    expect(html).not.toContain('<button');
  });
  it('preserves glossary metadata across cache reloads without rewriting existing prose', () => {
    const outline = { title: 'Lecture', overview: 'Overview', pageCount: 1, points: [{ id: 'p', idea: 'Idea', explanation: 'Source', caveat: '', pages: [1] }] };
    const explanation = { title: 'Lecture', sections: [{ text: '遗传漂变', pointIds: ['p'] }], terms };
    expect(parseOverviewExplanation(explanation, outline)).toEqual(explanation);
    let stored = ''; const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    writeOverviewCache(storage, 'test', { version: '2', outline, explanations: { plain: explanation }, scrollPositions: { plain: 400 }, updatedAt: 1 });
    const reloaded = readOverviewCache(storage, 'test').cache!;
    expect(reloaded.explanations.plain).toEqual(explanation);
    expect(reloaded.scrollPositions.plain).toBe(400);
  });
  it('annotates diagram and comparison terms without nesting buttons', () => {
    const html = renderToStaticMarkup(<StudyTerms terms={terms} language="zh-CN"><SprintVisual language="zh-CN" visual={{ kind: 'compare', title: '遗传漂变', caption: '基因频率', columns: ['之前', '之后'], rows: [{ label: '基因频率', cells: ['遗传漂变', '比例改变'] }, { label: '过程', cells: ['偶然', '偶然'] }] }} /></StudyTerms>);
    expect(html).toContain('Genetic drift');
    expect(html).toContain('Allele frequency');
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
});
