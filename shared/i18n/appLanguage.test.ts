import { afterEach, describe, expect, it } from 'vitest';
import {
  detectBrowserLanguage,
  getAIOutputLanguageInstruction,
  setCurrentAppLanguage,
} from '@/shared/i18n/appLanguage';
import { translateKnownUiText } from '@/shared/i18n/uiCatalog';
import { withCurrentOutputLanguage } from '@/services/geminiService';

describe('global app language', () => {
  afterEach(() => setCurrentAppLanguage('zh-CN'));

  it('uses Chinese for any Chinese browser locale', () => {
    expect(detectBrowserLanguage(['zh-CN'])).toBe('zh-CN');
    expect(detectBrowserLanguage(['zh-Hans'])).toBe('zh-CN');
    expect(detectBrowserLanguage(['zh-TW'])).toBe('zh-CN');
    expect(detectBrowserLanguage(['zh-HK'])).toBe('zh-CN');
  });

  it('uses English for English and other non-Chinese browser locales', () => {
    expect(detectBrowserLanguage(['en-CA'])).toBe('en');
    expect(detectBrowserLanguage(['fr-CA', 'en-CA'])).toBe('en');
    expect(detectBrowserLanguage([])).toBe('en');
  });

  it('adds the selected output language without changing response schemas', () => {
    setCurrentAppLanguage('en');
    const request = withCurrentOutputLanguage({
      model: 'test-model',
      contents: 'hello',
      config: {
        systemInstruction: 'Existing instruction',
        responseMimeType: 'application/json',
      },
    });
    expect(JSON.stringify(request.config?.systemInstruction)).toContain('APPLICATION OUTPUT LANGUAGE');
    expect(request.config?.responseMimeType).toBe('application/json');
    expect(getAIOutputLanguageInstruction()).toContain('English');
  });

  it('translates known fixed UI copy but leaves unknown stored content untouched', () => {
    expect(translateKnownUiText('备考工作台', 'en')).toBe('Exam workspace');
    expect(translateKnownUiText('这是过去生成的一段内容', 'en')).toBe('这是过去生成的一段内容');
  });
});

