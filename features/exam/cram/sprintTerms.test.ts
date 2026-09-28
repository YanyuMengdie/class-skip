import { beforeEach, describe, expect, it, vi } from 'vitest';
import { annotateSprintTerms, explainSprintDetail, replySprint } from './sprintAI';
import { makeCramSession } from './cramState';
import type { ExamMaterialLink } from '@/types';
import type { SprintPlanItem } from './sprintState';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: generate }));
const terms = [{ term: '遗传漂变', english: 'Genetic drift', explanation: '基因比例可以因偶然事件改变。', aliases: [] }];
const pdf = 'data:application/pdf;base64,cGRm';
const signal = new AbortController().signal;
const usage = vi.fn();
const session = makeCramSession('u', [{ id: 'm', fileName: 'Lecture.pdf' } as ExamMaterialLink]);
const item = { id: 'i', kind: 'detail', materialId: 'm', topicIds: [], title: 'Drift', reason: 'Source', depth: 'Main meaning', minutes: 2, status: 'pending', chats: [], draft: '' } satisfies SprintPlanItem;
beforeEach(() => { generate.mockReset(); usage.mockClear(); });

describe('sprint term generation', () => {
  it('includes glossary in the existing supplement request with the original PDF', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ lesson: '遗传漂变。', terms }), usage: { inputTokens: 10, outputTokens: 20 } });
    const result = await explainSprintDetail(session, item, pdf, signal, usage);
    expect(result.terms).toEqual(terms);
    expect(result.lesson).toBe('遗传漂变。');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].contents[0].parts[0].inlineData.mimeType).toBe('application/pdf');
    expect(generate.mock.calls[0][0].config.responseSchema.required).toContain('terms');
    expect(usage).toHaveBeenCalledWith({ inputTokens: 10, outputTokens: 20 });
  });
  it('returns saved definitions with follow-up answers, without a second request', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ answer: '遗传漂变不等于自然选择。', terms }) });
    const result = await replySprint(session, 'm', '什么意思？', '遗传漂变', [], pdf, signal, usage);
    expect(result).toEqual({ answer: '遗传漂变不等于自然选择。', terms });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('annotates legacy content without changing the saved teaching or progress', async () => {
    const content = { teaching: [{ text: '**遗传漂变**', pointIds: ['p1'] }], answers: ['漂变的例子。'] };
    const before = JSON.stringify(content);
    generate.mockResolvedValue({ text: JSON.stringify({ terms }) });
    expect(await annotateSprintTerms(content, pdf, signal, usage)).toEqual(terms);
    expect(JSON.stringify(content)).toBe(before);
    expect(generate.mock.calls[0][0].contents[0].parts[1].text).toContain('no rewritten lesson');
    expect(generate.mock.calls[0][0].config.abortSignal).toBe(signal);
  });
  it('reports failures for a retry instead of saving an empty successful annotation', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ terms: [{ term: '漂变' }] }) });
    await expect(annotateSprintTerms('遗传漂变', pdf, signal, usage)).rejects.toThrow('incomplete');
    generate.mockRejectedValue(new Error('unavailable'));
    await expect(annotateSprintTerms('遗传漂变', pdf, signal, usage)).rejects.toThrow('unavailable');
  });
});
