import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify(plan) });
    const signal = new AbortController().signal;
    const ai = createHandoutAI({ pdf: source, slides, language: 'en', depth: 'quick', signal });
    expect(await ai.plan([2])).toEqual(plan);
    const [request, options] = vi.mocked(generateReadingContent).mock.calls[0];
    expect(JSON.stringify(request.contents)).toContain('application/pdf');
    expect(JSON.stringify(request.contents)).toContain('requestedPages');
    expect(request.config?.abortSignal).toBe(signal);
    expect(options).toEqual({ outputLanguage: 'en' });
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
