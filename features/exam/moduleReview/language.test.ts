import { afterEach, expect, it, vi } from 'vitest';
import { generateReadingContent, readingOutputContract } from '@/services/readingAstraClient';
import { getAIOutputLanguageInstruction, setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
afterEach(() => {
  vi.unstubAllGlobals();
  setCurrentAppLanguage('zh-CN');
});
it('preserves the existing language rule for normal requests', () => {
  expect(readingOutputContract('en')).toBe(getAIOutputLanguageInstruction('en'));
  expect(readingOutputContract('zh-CN')).toBe(getAIOutputLanguageInstruction('zh-CN'));
});
it.each(['en', 'zh-CN'] as const)(
  'sends the English homework plus Chinese translation contract in %s mode',
  async (language) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '{}' })));
    vi.stubGlobal('fetch', fetcher);
    await generateReadingContent(
      {
        model: 'gemini',
        contents: 'Prepare homework',
        config: { systemInstruction: 'Source-bound module' },
      },
      { outputLanguage: language, englishAssignment: true },
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.instructions).toContain('promptEn/optionsEn');
    expect(body.instructions).toContain('promptZh/optionsZh');
    expect(body.instructions).not.toContain('All learner-facing explanations');
    expect(body.instructions).not.toContain('所有面向学习者');
    expect(fetcher.mock.calls[0][0]).toBe('/api/reading/gemini');
  },
);
