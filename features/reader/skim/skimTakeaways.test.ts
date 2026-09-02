import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import {
  collectSkimTakeawaySources,
  normalizeSkimTakeawayDrafts,
} from './skimTakeaways';

const message: ChatMessage = {
  id: 'message-1',
  role: 'model',
  text: '简单讲解',
  timestamp: 1,
  skimExplanation: {
    version: 1,
    activeVariantKey: 'simple-standard',
    sourcePageRefs: [3, 4],
    spineItems: [
      { id: 'concept', titleZh: '核心概念', titleEn: 'Core concept', kind: 'concept', summary: '一句大白话。', pageRefs: [3] },
      { id: 'evidence', titleZh: '关键证据', titleEn: 'Key evidence', kind: 'evidence', summary: '尚未展开的证据。', pageRefs: [4] },
    ],
    variants: {
      'simple-standard': {
        key: 'simple-standard',
        depth: 'simple',
        style: 'standard',
        messageMarkdown: '简单讲解',
        coveredSpineItemIds: ['concept'],
        deferredSpineItemIds: ['evidence'],
        pageRefs: [3],
        createdAt: 1,
      },
    },
  },
};

describe('skim takeaways', () => {
  it('distinguishes displayed and AI-deferred explanation spine items', () => {
    const sources = collectSkimTakeawaySources([message]);
    expect(sources.map((source) => [source.id, source.status])).toEqual([
      ['message-1:concept', 'explained'],
      ['message-1:evidence', 'deferred'],
    ]);
  });

  it('derives status and legal page references from source items instead of model claims', () => {
    const sources = collectSkimTakeawaySources([message]);
    const result = normalizeSkimTakeawayDrafts([
      {
        titleZh: '核心概念',
        titleEn: 'Core concept',
        plainLanguage: '模型改写的大白话。',
        connection: '连接前后内容。',
        sourceIds: ['message-1:concept', 'invented-id'],
      },
      {
        titleZh: '关键证据',
        plainLanguage: '暂时没有正式讲过。',
        connection: '之后补全结论。',
        sourceIds: ['message-1:evidence'],
      },
    ], sources, 1, 3);

    expect(result[0]).toMatchObject({ status: 'explained', pageRefs: [3] });
    expect(result[1]).toMatchObject({ status: 'deferred', pageRefs: [] });
    expect(result.flatMap((item) => item.sourceIds)).not.toContain('invented-id');
  });

  it('does not treat extraction prompts as material that has been taught', () => {
    const extraction: ChatMessage = {
      ...message,
      id: 'extraction',
      skimKnowledgeExtraction: true,
    };
    expect(collectSkimTakeawaySources([extraction])).toEqual([]);
  });

  it('builds trusted message-level sources inside the active record page range', () => {
    const recordMessage: ChatMessage = {
      id: 'record-message-1',
      role: 'model',
      text: '这张唱片解释了交感与副交感的动态平衡。',
      timestamp: 2,
    };
    const sources = collectSkimTakeawaySources([recordMessage], {
      recordScope: { title: 'ANS 双引擎', pageStart: 11, pageEnd: 13 },
    });

    expect(sources).toEqual([expect.objectContaining({
      id: 'record-message-1:record-message',
      titleZh: 'ANS 双引擎 · 讲解 1',
      status: 'explained',
      pageRefs: [11, 12, 13],
    })]);
  });

  it('uses explicit original-page references from a record message when available', () => {
    const sources = collectSkimTakeawaySources([{
      id: 'record-message-2',
      role: 'model',
      text: '交感与副交感并非轮流开关，原文第 12–13 页强调两者持续共同活动。',
      timestamp: 3,
    }], {
      recordScope: { title: 'ANS 双引擎', pageStart: 11, pageEnd: 15 },
    });

    expect(sources[0]?.pageRefs).toEqual([12, 13]);
  });

  it('does not recycle extraction feedback into later record takeaways', () => {
    const feedback: ChatMessage = {
      id: 'feedback',
      role: 'model',
      text: '这次只核对刚才的回答。',
      timestamp: 4,
      skimKnowledgeExtractionFeedback: true,
    };
    expect(collectSkimTakeawaySources([feedback], {
      recordScope: { title: '当前唱片', pageStart: 4, pageEnd: 6 },
    })).toEqual([]);
  });

  it('does not merge AI-deferred details into an explained takeaway', () => {
    const sources = collectSkimTakeawaySources([message]);
    const result = normalizeSkimTakeawayDrafts([{
      titleZh: '混合要点',
      plainLanguage: '把已讲内容和暂存细节揉在一起。',
      connection: '不应进入提取。',
      sourceIds: ['message-1:concept', 'message-1:evidence'],
    }], sources, 1, 4);

    expect(result.some((item) => item.titleZh === '混合要点')).toBe(false);
    expect(result.find((item) => item.titleZh === '关键证据')?.status).toBe('deferred');
  });
});
