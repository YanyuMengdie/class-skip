import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import {
  chatWithSkimAdaptiveTutor,
  generateContinuousLectureTurn,
  generateGatekeeperQuiz,
  generateSkimReadingRoute,
  performPreFlightDiagnosis,
} from './geminiService';

const { astra, gemini } = vi.hoisted(() => ({ astra: vi.fn(), gemini: vi.fn() }));

vi.mock('./readingAstraClient', () => ({ generateReadingContent: astra }));
vi.mock('@google/genai', async importOriginal => {
  const original = await importOriginal<typeof import('@google/genai')>();
  return { ...original, GoogleGenAI: class { models = { generateContent: gemini }; } };
});

beforeEach(() => {
  astra.mockReset();
  gemini.mockReset();
  vi.stubEnv('API_KEY', 'test-only');
  // The pre-existing diagnosis debug hook must not make any network request.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  setCurrentAppLanguage('zh-CN');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setCurrentAppLanguage('zh-CN');
});

describe('lead-reading model boundaries', () => {
  it('uses Astra for reading and preserves PDF, images, cancellation and output language', async () => {
    astra.mockResolvedValue({ text: '领读正文' });
    setCurrentAppLanguage('en');
    const controller = new AbortController();
    await expect(chatWithSkimAdaptiveTutor(
      'data:application/pdf;base64,cGRm',
      [{ role: 'user', text: 'Earlier question', images: ['data:image/png;base64,b2xk'], timestamp: 1 }],
      'Please continue', 'reading', 'STEM', undefined, controller.signal,
      ['data:image/png;base64,bmV3'], 'paper',
    )).resolves.toBe('领读正文');
    expect(gemini).not.toHaveBeenCalled();
    const params = astra.mock.calls[0][0];
    expect(params.model).toBe('gpt-6-astra');
    expect(params.config.abortSignal).toBe(controller.signal);
    expect(JSON.stringify(params.config.systemInstruction)).toContain('English');
    expect(JSON.stringify(params.contents)).toContain('cGRm');
    expect(JSON.stringify(params.contents)).toContain('b2xk');
    expect(JSON.stringify(params.contents)).toContain('bmV3');
  });

  it('uses Astra for the independently shared tutor too', async () => {
    astra.mockResolvedValue({ text: '私教正文' });
    await expect(chatWithSkimAdaptiveTutor('source', [], 'question', 'tutoring')).resolves.toBe('私教正文');
    expect(gemini).not.toHaveBeenCalled();
    expect(astra).toHaveBeenCalledOnce();
  });

  it.each(['', '   '])('rejects empty reading text rather than returning a fake assistant message', async text => {
    astra.mockResolvedValue({ text });
    await expect(chatWithSkimAdaptiveTutor('source', [], 'continue', 'reading')).rejects.toThrow('没有返回内容');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('surfaces reading connection failures without switching provider', async () => {
    const error = new Error('Astra unavailable');
    astra.mockRejectedValue(error);
    await expect(chatWithSkimAdaptiveTutor('source', [], 'continue', 'reading')).rejects.toBe(error);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('uses Astra for default diagnosis and the gatekeeper as well as reading maps', async () => {
    const map = { text: JSON.stringify({ topic: '主题', initialBriefing: '主线', prerequisites: [] }) };
    astra.mockResolvedValue(map);
    gemini.mockResolvedValue(map);
    await performPreFlightDiagnosis('source', { moduleCount: 4 }, 'astra');
    expect(astra).toHaveBeenCalledOnce();
    expect(gemini).not.toHaveBeenCalled();
    await performPreFlightDiagnosis('source', { moduleCount: 4 });
    expect(astra).toHaveBeenCalledTimes(2);
    astra.mockResolvedValue({ text: JSON.stringify({ question: '题干', options: ['甲', '乙'], correctIndex: 0, explanation: '解释' }) });
    await generateGatekeeperQuiz('source', '主题');
    expect(gemini).not.toHaveBeenCalled();
    expect(astra).toHaveBeenCalledTimes(3);
  });

  it('does not disguise an Astra map failure as a missing map', async () => {
    const error = new Error('Astra unavailable');
    astra.mockRejectedValue(error);
    await expect(performPreFlightDiagnosis('source', { moduleCount: 4 }, 'astra')).rejects.toBe(error);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('surfaces route provider failures so first-time record planning can show a retry', async () => {
    const error = new Error('Astra quota limit');
    astra.mockRejectedValue(error);
    await expect(generateSkimReadingRoute('source', {
      contentType: 'lecture', docType: 'STEM', strictPageRanges: true,
    })).rejects.toBe(error);
    expect(astra).toHaveBeenCalledOnce();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('keeps unusable route output eligible for the existing page-range repair', async () => {
    astra.mockResolvedValue({ text: JSON.stringify({ nodes: [] }) });
    await expect(generateSkimReadingRoute('source', {
      contentType: 'lecture', docType: 'STEM', strictPageRanges: true,
    })).resolves.toBeNull();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('retains the one-repair page-boundary guard for structured Lecture reading', async () => {
    const draft = {
      responseKind: 'explanation', messageMarkdown: '关系说明',
      spineItems: [{ id: 's1', titleZh: '关系', kind: 'relationship', summary: 'A 导致 B', pageRefs: [9] }],
      coveredSpineItemIds: ['s1'], deferredSpineItemIds: [], pageRefs: [9],
    };
    astra.mockResolvedValue({ text: JSON.stringify(draft) });
    await expect(generateContinuousLectureTurn({
      docContent: 'data:application/pdf;base64,cGRm', history: [], newMessage: '开始',
      docType: 'STEM', depth: 'normal', pageStart: 2, pageEnd: 4,
    })).rejects.toThrow('校验失败');
    expect(astra).toHaveBeenCalledTimes(2);
    expect(gemini).not.toHaveBeenCalled();
    expect(JSON.stringify(astra.mock.calls[1][0].contents)).toContain('上一次输出未通过校验');
  });
});
