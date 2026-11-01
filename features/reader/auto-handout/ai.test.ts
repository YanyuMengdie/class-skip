import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schema } from '@google/genai';
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: vi.fn() }));
import { generateReadingContent } from '@/services/readingAstraClient';
import { createHandoutAI } from './ai';
const source = 'data:application/pdf;base64,YQ==';
const slides = [1, 2, 3].map(pageNumber => ({ id: `${pageNumber}`, pageNumber, imageUrl: `data:image/png;base64,YQ==` }));
const page = { page: 2, title: 'Study', kind: 'figure' as const, role: '比较实验条件', focus: ['图例与趋势'], linkedPages: [3] };
const plan = { overview: '整份 PDF 上下文', pages: [page] };
const draft = { title: '研究结果', sections: [{ heading: '比较条件', explanation: '解释图中趋势及其限制', sourceEvidence: '原文第 2 页图例' }], uncertainties: [] };
beforeEach(() => vi.clearAllMocks());
describe('grounded AI requests', () => {
  it('plans from the complete PDF with requested physical pages and captured language', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify({ overview: plan.overview, pages: { page_2: page } }) });
    const signal = new AbortController().signal;
    const ai = createHandoutAI({ pdf: source, slides, language: 'en', depth: 'quick', signal });
    expect(await ai.plan([2])).toEqual({ ...plan, issues: {} });
    const [request, options] = vi.mocked(generateReadingContent).mock.calls[0];
    expect(JSON.stringify(request.contents)).toContain('application/pdf');
    expect(JSON.stringify(request.contents)).toContain('requestedPages');
    expect(request.config?.abortSignal).toBe(signal);
    expect((request.config?.responseSchema as Schema)?.properties?.pages.required).toEqual(['page_2']);
    expect(options).toEqual({ outputLanguage: 'en' });
  });
  it('repairs only invalid slots once, keeping valid plans and physical page identity', async () => {
    const model = vi.mocked(generateReadingContent);
    model.mockResolvedValueOnce({ text: JSON.stringify({ overview: plan.overview, pages: { page_1: { ...page, page: 99 }, page_2: { ...page, linkedPages: [99] } } }) });
    model.mockResolvedValueOnce({ text: JSON.stringify({ overview: plan.overview, pages: { page_2: page } }) });
    const onPlanRepair = vi.fn();
    const result = await createHandoutAI({ pdf: source, slides, language: 'en', depth: 'quick', signal: new AbortController().signal, onPlanRepair }).plan([1, 2]);
    expect(result.pages.map(p => p.page)).toEqual([1, 2]);
    expect(onPlanRepair).toHaveBeenCalledWith([2]);
    expect((model.mock.calls[1][0].config?.responseSchema as Schema)?.properties?.pages.required).toEqual(['page_2']);
    expect(model).toHaveBeenCalledTimes(2);
  });
  it('returns valid pages and precise per-page errors if one repair still fails', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify({ overview: plan.overview, pages: { page_1: page, page_2: { ...page, linkedPages: [99] } } }) });
    const result = await createHandoutAI({ pdf: source, slides, language: 'en', depth: 'quick', signal: new AbortController().signal }).plan([1, 2]);
    expect(result.pages.map(p => p.page)).toEqual([1]);
    expect(result.issues?.[2]).toContain('99');
    expect(generateReadingContent).toHaveBeenCalledTimes(2);
  });
  it('does not retry billing failures as formatting errors', async () => {
    vi.mocked(generateReadingContent).mockRejectedValue(Object.assign(new Error('billing'), { code: 'billing_required' }));
    await expect(createHandoutAI({ pdf: source, slides, language: 'en', depth: 'quick', signal: new AbortController().signal }).plan([1])).rejects.toThrow('billing');
    expect(generateReadingContent).toHaveBeenCalledTimes(1);
  });
  it('gives the checker actual labeled source images rather than the explanation alone', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify({ coverage: true, source: true, visuals: false, context: true, teaching: true, issues: ['图例不支持这项结论'] }) });
    const ai = createHandoutAI({ pdf: source, slides, language: 'zh-CN', depth: 'thorough', signal: new AbortController().signal });
    const audit = await ai.audit(plan, page, draft);
    expect(audit.visuals).toBe(false);
    const [request] = vi.mocked(generateReadingContent).mock.calls[0];
    const contents = JSON.stringify(request.contents);
    expect(contents).toContain('SOURCE IMAGE — ORIGINAL PDF PAGE 2');
    expect(contents).toContain('SOURCE IMAGE — ORIGINAL PDF PAGE 3');
    expect(contents).toContain('image/png');
    expect(String(request.config?.systemInstruction)).toContain('never evidence');
  });
  it('makes pace/depth affect teaching content and includes prior concrete issues for a rewrite', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify(draft) });
    const context = { pdf: source, slides, language: 'en' as const, signal: new AbortController().signal };
    await createHandoutAI({ ...context, depth: 'quick' }).draft(plan, page);
    await createHandoutAI({ ...context, depth: 'thorough' }).draft(plan, page, draft, ['图例读反']);
    const calls = vi.mocked(generateReadingContent).mock.calls;
    expect(String(calls[0][0].config?.systemInstruction)).toContain('Learner chooses FAST');
    expect(String(calls[1][0].config?.systemInstruction)).toContain('Learner chooses CAREFUL');
    expect(JSON.stringify(calls[1][0].contents)).toContain('图例读反');
  });
});
