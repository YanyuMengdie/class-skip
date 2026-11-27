import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: vi.fn() }));
vi.mock('./storage', () => ({ sharedModulePlan: vi.fn(async (_owner, _source, _language, _pages, generate) => generate()) }));
import { generateReadingContent } from '@/services/readingAstraClient';
import { createHandoutAI, decodeModuleDraft } from './ai';
import { parseModulePlan } from './model';
const slides = [1, 2, 3, 4, 5, 6].map(pageNumber => ({ id: `${pageNumber}`, pageNumber, imageUrl: 'data:image/png;base64,YQ==' }));
const rawPlan = { overview: '整份 PDF 上下文', modules: [
  { title: '背景', role: '定义', startPage: 1, endPage: 2, linkedPages: [] },
  { title: '实验', role: '方法与结果', startPage: 3, endPage: 5, linkedPages: [1] },
  { title: '总结', role: '应用', startPage: 6, endPage: 6, linkedPages: [3] },
] };
const plan = parseModulePlan(rawPlan, slides.map(slide => slide.pageNumber));
const draft = { title: '研究结果', sections: [{ heading: '比较条件', explanation: '解释图中趋势' }] };
async function context() {
  const pdf = await PDFDocument.create(); for (let i = 0; i < 6; i++) pdf.addPage([200, 200]);
  return { owner: 'alice', source: 'sourcehash', pdf: await pdf.saveAsBase64({ dataUri: true }), slides, language: 'zh-CN' as const, depth: 'thorough' as const };
}
beforeEach(() => vi.clearAllMocks());
describe('module AI input and output', () => {
  it('plans the entire source in a compact module schema without repeated per-page slots', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify(rawPlan) });
    const ctx = await context();
    expect(await createHandoutAI(ctx).planModules(new AbortController().signal)).toEqual(plan);
    const [request] = vi.mocked(generateReadingContent).mock.calls[0];
    expect(JSON.stringify(request.contents)).toContain(ctx.pdf.split(',')[1]);
    expect(JSON.stringify(request.config?.responseSchema)).not.toContain('page_1');
  });
  it('repairs missing module coverage once, without accepting a directory that drops pages', async () => {
    vi.mocked(generateReadingContent).mockResolvedValueOnce({ text: JSON.stringify({ ...rawPlan, modules: rawPlan.modules.slice(0, 2) }) }).mockResolvedValueOnce({ text: JSON.stringify(rawPlan) });
    expect(await createHandoutAI(await context()).planModules(new AbortController().signal)).toEqual(plan);
    expect(generateReadingContent).toHaveBeenCalledTimes(2);
  });
  it('does not retry billing failures as a malformed directory', async () => {
    vi.mocked(generateReadingContent).mockRejectedValue(Object.assign(new Error('billing'), { code: 'billing_required' }));
    await expect(createHandoutAI(await context()).planModules(new AbortController().signal)).rejects.toThrow('billing');
    expect(generateReadingContent).toHaveBeenCalledTimes(1);
  });
  it('sends the whole module and its distant references even when only one output page is requested', async () => {
    vi.mocked(generateReadingContent).mockResolvedValue({ text: JSON.stringify({ pages: { page_4: draft } }) });
    const ctx = await context();
    // Module 3–4, reference 1; boundary neighbors 2 and 5; original page 6 is not sent.
    const module = { ...plan.modules[1], endPage: 4 };
    const result = await createHandoutAI(ctx).draftModule(plan, module, [4], {}, new AbortController().signal);
    expect(result.drafts[4].title).toBe(draft.title);
    const [request] = vi.mocked(generateReadingContent).mock.calls[0];
    const parts = (request.contents as any)[0].parts;
    const meta = JSON.parse(parts[0].text);
    expect(meta.attachmentPageMap.map((item: any) => item.originalPage)).toEqual([1, 2, 3, 4, 5]);
    expect(meta.requestedPages).toEqual([4]);
    expect((await PDFDocument.load(parts[1].inlineData.data)).getPageCount()).toBe(5);
    expect(JSON.stringify(request.config?.responseSchema)).not.toContain('sourceEvidence');
  });
  it('retains successful pages from a partial module response and rejects missing slots', () => {
    const result = decodeModuleDraft({ pages: { page_3: draft, page_4: { title: 'broken' }, page_99: draft } }, [3, 4]);
    expect(Object.keys(result.drafts)).toEqual(['3']);
    expect(result.issues[4]).toBeTruthy();
  });
});
