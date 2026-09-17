import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TinyStudyEntry } from '@/types';
import { CuriosityEntryReader } from './CuriosityEntryReader';

const skyEntry: TinyStudyEntry = {
  id: 'sky-observation',
  type: 'question',
  title: '为什么同一颗星的位置会变？',
  teaser: '先区分观察者的位置和星体的运动。',
  pageStart: 12,
  pageEnd: 12,
  evidence: '观察位置示意图',
  status: 'seen',
  turns: [
    { id: 'sky-start', action: 'start', text: '这段先讨论观察的位置。\n**视角会改变看到的方向。**\n模型的适用范围仍要保留。', createdAt: 1 },
    { id: 'sky-deeper', action: 'deeper', text: '接着比较两次观察。\n**观测间隔**也要一起记录。', createdAt: 2 },
  ],
};

const languageEntry: TinyStudyEntry = {
  id: 'language-experiment',
  type: 'experiment',
  title: '换一个词，理解会改变吗？',
  teaser: '比较两组措辞，并保留实验条件。',
  pageStart: 31,
  pageEnd: 33,
  evidence: '措辞任务与结果表',
  status: 'seen',
  turns: [
    { id: 'language-start', action: 'start', text: '这一节描述措辞任务。\n**先看具体语境。**\n不要把这个例子扩展成所有语言的规律。', createdAt: 3 },
    { id: 'language-simpler', action: 'simpler', text: '换句话说，比较的是这次任务中的两种表达。', createdAt: 4 },
  ],
};

type ReaderProps = React.ComponentProps<typeof CuriosityEntryReader>;

function renderReader(overrides: Partial<ReaderProps> = {}) {
  return renderToStaticMarkup(<CuriosityEntryReader
    entry={skyEntry}
    fileName="天文观察.pdf"
    previewUrl="blob:sky-page-12"
    language="zh-CN"
    loadingAction={null}
    actionsDisabled={false}
    openingSource={false}
    error={null}
    scrollRef={null}
    onScroll={() => {}}
    onBack={() => {}}
    onOpenSource={() => {}}
    onAction={() => {}}
    {...overrides}
  />);
}

describe('CuriosityEntryReader source content and reading states', () => {
  it('renders each PDF’s own topic, source pages, preview and follow-up without substituting another topic', () => {
    const sky = renderReader();
    const language = renderReader({ entry: languageEntry, fileName: '语言理解.pdf', previewUrl: 'blob:language-page-31' });

    for (const value of [skyEntry.title, skyEntry.teaser, '天文观察.pdf', '一个值得好奇的问题', '原文 · 第 12 页', '查看原文第 12 页', 'blob:sky-page-12', '接着比较两次观察。']) {
      expect(sky).toContain(value);
      expect(language).not.toContain(value);
    }
    for (const value of [languageEntry.title, languageEntry.teaser, '语言理解.pdf', '从一个实验或案例说起', '原文 · 第 31–33 页', '查看原文第 31–33 页', 'blob:language-page-31', '换句话说，比较的是这次任务中的两种表达。']) {
      expect(language).toContain(value);
      expect(sky).not.toContain(value);
    }
    expect(sky).toContain('模型的适用范围仍要保留。');
    expect(language).toContain('不要把这个例子扩展成所有语言的规律。');
    expect(sky).not.toContain('role="alert"');
    expect(language).not.toContain('role="status"');
  });

  it('preserves existing short emphasis and later turns while accenting only the opening explanation', () => {
    const markup = renderReader();
    expect(markup).toContain('<strong class="curiosity-reading-highlight">视角会改变看到的方向。</strong>');
    expect(markup).toContain('<strong>观测间隔</strong>');
    expect(markup.match(/class="curiosity-reading-highlight"/g)).toHaveLength(1);
    expect(markup.indexOf('这段先讨论观察的位置。')).toBeLessThan(markup.indexOf('模型的适用范围仍要保留。'));
    expect(markup.indexOf('模型的适用范围仍要保留。')).toBeLessThan(markup.indexOf('接着比较两次观察。'));
    expect(markup).toContain('读到这里就可以。');
  });

  it('shows a new source’s first-load or error state without completed text or a success footer', () => {
    const pendingProps: Partial<ReaderProps> = {
      entry: { ...languageEntry, turns: [] }, fileName: '语言理解.pdf', previewUrl: undefined,
      loadingAction: 'start', actionsDisabled: true,
    };
    const loading = renderReader(pendingProps);
    expect(loading).toContain(languageEntry.title);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('先从这里说起，正在讲给你听…');
    expect(loading.match(/disabled=""/g)).toHaveLength(3);
    expect(loading).not.toContain(skyEntry.title);
    expect(loading).not.toContain('先看具体语境。');
    expect(loading).not.toContain('读到这里就可以。');
    expect(loading).not.toContain('role="alert"');

    const failure = renderReader({ ...pendingProps, loadingAction: null, actionsDisabled: false, error: '这份资料暂时无法读取。' });
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('这份资料暂时无法读取。');
    expect(failure).not.toContain('role="status"');
    expect(failure).not.toContain('正在讲给你听');
    expect(failure).not.toContain('读到这里就可以。');
    expect(failure).not.toContain('disabled=""');
  });

  it('keeps completed reading visible during follow-up work and failures, with source controls disabled only while opening', () => {
    const waiting = renderReader({ loadingAction: 'interesting', actionsDisabled: true });
    expect(waiting).toContain('为什么有意思，正在讲给你听…');
    expect(waiting).toContain('模型的适用范围仍要保留。');
    expect(waiting).toContain('接着比较两次观察。');
    expect(waiting).not.toContain('读到这里就可以。');

    const failure = renderReader({ error: '这次追问没有完成。', cloudWarning: true });
    expect(failure).toContain('模型的适用范围仍要保留。');
    expect(failure).toContain('这次追问没有完成。');
    expect(failure).toContain('这次入口记录暂时没有同步到云端。');
    expect(failure).not.toContain('正在讲给你听');

    const opening = renderReader({ openingSource: true });
    const disabledButtons = opening.match(/<button\b[^>]*disabled=""[^>]*>/g) ?? [];
    expect(disabledButtons).toHaveLength(2);
    expect(disabledButtons.some(button => button.includes('aria-label="查看原文第 12 页"'))).toBe(true);
    expect(opening).toContain('换一个入口');
  });
});
