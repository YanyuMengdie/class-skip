import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import { prepareMessageUnderstanding } from './understandingScope';
import { createTopicConversation } from './understandingPlan';
import { buildUnderstandingPrompt } from './readingUnderstanding';
import { prepareUnderstandingSource } from './understandingSource';
import { PDFDocument } from 'pdf-lib';

const text = '## 本次知识点\n这是本次选中的内容，见第 2 页。';
const message: ChatMessage = { role: 'model', timestamp: 1, text };

describe('understanding scope across saved versions', () => {
  it('archives broad legacy plans and discussions without reusing their teaching scope', () => {
    const old = prepareMessageUnderstanding(message, '## OLD_UNSELECTED_TOPIC\n旧内容，第 1 页。', [1, 2]);
    delete old.scopePolicy;
    delete old.plan!.scopePolicy;
    const topic = old.plan!.topics[0];
    topic.conversation = createTopicConversation(old, topic, old.plan!);
    topic.conversation.turns = [{ id: 'old-answer', role: 'model', text: 'OLD_OFF_TOPIC_ANSWER', timestamp: 1 }];
    topic.needsReview = true;
    const next = prepareMessageUnderstanding({ ...message, skimUnderstanding: old }, text, [1, 2]);
    expect(next.id).not.toBe(old.id);
    expect(next.archivedSessions?.[0]).toEqual(old);
    expect(old.plan?.topics[0].needsReview).toBe(true);
    expect(next.plan!.topics).toHaveLength(1);
    const session = createTopicConversation(next, next.plan!.topics[0], next.plan!);
    const prompt = buildUnderstandingPrompt({ session, action: 'start', userText: '', minutes: 3 });
    expect(prompt).toContain('本次选中的内容');
    expect(prompt).not.toContain('OLD_UNSELECTED_TOPIC');
    expect(prompt).not.toContain('OLD_OFF_TOPIC_ANSWER');
    expect(session.turns).toEqual([]);
    expect(session.pageRefs).toEqual([2]);
  });

  it('preserves a current scoped discussion on reopen and does not duplicate archives', () => {
    const saved = prepareMessageUnderstanding(message, text, [1, 2]);
    saved.plan!.topics[0].conversation = createTopicConversation(saved, saved.plan!.topics[0], saved.plan!);
    saved.plan!.topics[0].conversation!.turns.push({ id: 'answer', role: 'user', text: '本知识点的问题', timestamp: 1 });
    expect(prepareMessageUnderstanding({ ...message, skimUnderstanding: saved }, text, [1, 2])).toBe(saved);
  });

  it('rebuilds when the displayed reading variant changes, retaining prior discussions', () => {
    const saved = prepareMessageUnderstanding(message, text, [1, 2]);
    const next = prepareMessageUnderstanding({ ...message, skimUnderstanding: saved }, '## 新段落\n不同的讲解。第 1 页。', [1, 2]);
    expect(next.pageRefs).toEqual([1]);
    expect(next.archivedSessions).toHaveLength(1);
    expect(next.sourceText).not.toContain('本次选中的内容');
  });

  it('never inherits parent material or turns when creating a topic, even for a legacy plan', () => {
    const parent = prepareMessageUnderstanding(message, text, [1, 2]);
    parent.sourceText = 'OTHER_TOPIC';
    parent.pageRefs = [1, 2];
    delete parent.plan!.scopePolicy;
    const session = createTopicConversation(parent, parent.plan!.topics[0], parent.plan!);
    expect(session.scopePolicy).toBe('message-topic-v1');
    expect(session.sourceText).not.toContain('OTHER_TOPIC');
    expect(session.pageRefs).toEqual([2]);
  });
});

describe('understanding original material boundaries', () => {
  it('attaches only selected PDF pages and does not attach any PDF when references are unknown', async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 3; i++) pdf.addPage();
    const documentContent = await pdf.saveAsBase64({ dataUri: true });
    const result = await prepareUnderstandingSource({ sessionId: 'cropping-test', documentContent, pageRefs: [2] });
    const crop = await PDFDocument.load(result.source.slice(result.source.indexOf(',') + 1));
    expect(crop.getPageCount()).toBe(1);
    expect(result.instruction).toContain('1 → 2');
    const unknown = await prepareUnderstandingSource({ sessionId: 'unknown-test', documentContent, pageRefs: [] });
    expect(unknown.source).toBe('');
  });

  it('fails closed when a selected page cannot be read', async () => {
    await expect(prepareUnderstandingSource({ sessionId: 'bad-pdf-test', documentContent: 'data:application/pdf;base64,bm90IGEgcGRm', pageRefs: [2] })).rejects.toThrow('未发送整份文档');
  });
});
