import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OverviewProse } from './OverviewProse';

const render = (value: string) => renderToStaticMarkup(<OverviewProse value={value} caveats={[]} language="zh-CN" />);

describe('detached reading callout headings', () => {
  it('joins the screenshot’s inline 注意 labels to their quoted bodies without losing prose or emphasis', () => {
    const html = render('数量变少后，**遗传漂变**会变强。 > **注意**\n\n> 人口统计随机性对小种群往往最为关键。\n\n两种作用形成==灭绝漩涡==。 > **注意**\n\n> 两种力量在小种群中往往协同运作。');
    expect(html.match(/overview-callout--note/g)).toHaveLength(2);
    expect(html).toContain('<strong>遗传漂变</strong>');
    expect(html).toContain('<mark>灭绝漩涡</mark>');
    expect(html).not.toContain('&gt;');
    expect(html).toMatch(/overview-callout--note[\s\S]*?<strong>注意<\/strong>[\s\S]*?人口统计随机性对小种群往往最为关键/);
    expect(html).toContain('两种力量在小种群中往往协同运作。');
  });
  it.each(['注意', '**注意：**', '**Note**', '**Example**'])('repairs a known label %s with a following quotation', label => {
    const html = render(`完整正文。 > ${label}\n\n> 完整说明。`);
    expect(html).not.toContain('&gt;');
    expect(html).toContain('<p>完整正文。</p>');
    expect(html).toContain('<p>完整说明。</p>');
    expect(html).not.toContain('overview-callout--quote');
  });
  it('keeps valid callouts, greater-than comparisons and code untouched', () => {
    const html = render('x > 3。\n\n> **注意**\n> 已经正确的提示。\n\n`正文 > **注意**`\n\n> 代码示例后的引用。');
    expect(html).toContain('x &gt; 3。');
    expect(html.match(/overview-callout--note/g)).toHaveLength(1);
    expect(html).toContain('<code>正文 &gt; **注意**</code>');
    expect(html).toContain('overview-callout--quote');
  });
  it('does not remove unknown labels or attach an unrelated paragraph', () => {
    const html = render('正文 > **普通词语**\n\n> 引用。\n\n正文 > **注意**\n\n这不是引用块。');
    expect(html.match(/&gt;/g)).toHaveLength(2);
    expect(html).not.toContain('overview-callout--note');
    expect(html).toContain('这不是引用块。');
  });
});
