import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TinyStudyEntry } from '@/types';
import type { OverviewOutline } from '@/features/reluctant/overview';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import { parseReadingAstraRequest, readingAstraFormat } from '@/server/readingAstra';
import { buildReadingAstraRequest, ReadingAstraClientError } from './readingAstraClient';
import {
  generateReluctantOverviewOutline,
  generateReluctantOverviewExplanation,
  generateTinyStudyStep,
  generateTinyStudyEntries,
  generateTinyStudyEntryStep,
} from './geminiService';

const { astra, gemini } = vi.hoisted(() => ({ astra: vi.fn(), gemini: vi.fn() }));
vi.mock('./readingAstraClient', async importOriginal => {
  const actual = await importOriginal<typeof import('./readingAstraClient')>();
  return { ...actual, generateReadingContent: astra };
});
vi.mock('@google/genai', async importOriginal => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return { ...actual, GoogleGenAI: class { models = { generateContent: gemini }; } };
});

const pdf = 'data:application/pdf;base64,JVBERi0xLjc=';
const pages = ['Outside entry: page one.', 'Sustained attention improves accuracy.', 'Later qualification: the sample was small.'];
const outline: OverviewOutline = {
  title: 'Attention', overview: 'Attention and accuracy.', pageCount: 3,
  points: [{ id: 'p1', idea: 'Attention helps.', explanation: pages[1], caveat: 'The sample was small.', pages: [2, 3] }],
};
const explanation = { title: 'Attention explained', sections: [{ text: 'Attention improves accuracy. The sample was small.', pointIds: ['p1'] }] };
const entry: TinyStudyEntry = {
  id: 'entry-1', type: 'question', title: 'Why does attention help?', teaser: 'Look at a finding about accuracy.',
  pageStart: 2, pageEnd: 2, evidence: pages[1], status: 'unseen', turns: [],
};
const entryOptions = () => ({ fileName: 'lecture.pdf', documentSummary: 'Attention lecture', entry,
  action: 'deeper' as const, pageTexts: pages,
  previousTurns: [{ id: 'turn-1', action: 'start' as const, text: 'Earlier entry explanation.', createdAt: 1 }],
});
const paths = [
  ['overview facts', () => generateReluctantOverviewOutline(pdf, { fileName: 'lecture.pdf', pageCount: 3 })],
  ['overview explanation', () => generateReluctantOverviewExplanation(outline, 'story')],
  ['sequential explanation', () => generateTinyStudyStep(pdf, { fileName: 'lecture.pdf', action: 'next', previousTurns: ['Earlier sequential explanation.'] })],
  ['interest entry discovery', () => generateTinyStudyEntries(pdf, pages, { fileName: 'lecture.pdf' })],
  ['interest entry explanation', () => generateTinyStudyEntryStep(pdf, entryOptions())],
] as const;

beforeEach(() => {
  astra.mockReset(); gemini.mockReset();
  vi.stubEnv('API_KEY', 'test-only');
  setCurrentAppLanguage('zh-CN');
});
afterEach(() => { vi.unstubAllEnvs(); setCurrentAppLanguage('zh-CN'); });

describe('low-energy learning defaults to Astra', () => {
  it('uses one Astra facts outline for plain and story styles without fabricated Gemini completion metadata', async () => {
    astra.mockResolvedValueOnce({ text: JSON.stringify(outline) })
      .mockResolvedValue({ text: JSON.stringify(explanation) });
    const facts = await paths[0][1]();
    await expect(generateReluctantOverviewExplanation(facts, 'plain')).resolves.toEqual(explanation);
    await expect(generateReluctantOverviewExplanation(facts, 'story')).resolves.toEqual(explanation);
    expect(astra).toHaveBeenCalledTimes(3);
    expect(gemini).not.toHaveBeenCalled();
    expect(astra.mock.calls[0][0].contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjc=' } });
    for (const [params] of astra.mock.calls) {
      expect(params.model).toBe('gpt-6-astra');
      expect(params.config.maxOutputTokens).toBe(16384);
      const body = buildReadingAstraRequest(params);
      expect(body.schema).toBe(params.config.responseSchema);
      expect(parseReadingAstraRequest(body)).toBe(body);
      const strict = readingAstraFormat(body.schema);
      expect(strict.array).toBe(false);
      expect(strict.schema.additionalProperties).toBe(false);
      expect(strict.schema.required).toEqual(Object.keys(strict.schema.properties as object));
    }
    expect(astra.mock.calls[1][0].contents[0].parts[0].text).toContain(JSON.stringify(facts));
  });

  it('preserves sequential source, previous turns, target scope and selected output language', async () => {
    setCurrentAppLanguage('en');
    astra.mockResolvedValue({ text: 'A simple continuation.' });
    await expect(generateTinyStudyStep(pdf, {
      fileName: 'lecture.pdf', action: 'simpler', previousTurns: ['Earlier sequential explanation.'],
      targetTurn: { index: 1, text: 'Target explanation to simplify.' },
    })).resolves.toBe('A simple continuation.');
    const params = astra.mock.calls[0][0];
    expect(params.model).toBe('gpt-6-astra');
    expect(params.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjc=' } });
    const body = buildReadingAstraRequest(params);
    expect(parseReadingAstraRequest(body)).toBe(body);
    expect(body.instructions).toContain('English');
    expect(JSON.stringify(body.messages)).toContain('Earlier sequential explanation.');
    expect(JSON.stringify(body.messages)).toContain('Target explanation to simplify.');
    expect(body).not.toHaveProperty('schema');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('keeps evidence-grounded entry discovery as the same page-indexed JSON contract', async () => {
    const { id: _id, status: _status, turns: _turns, ...entryDraft } = entry;
    astra.mockResolvedValue({ text: JSON.stringify({ documentSummary: 'Attention lecture', entries: [entryDraft] }) });
    await expect(paths[3][1]()).resolves.toEqual({ documentSummary: 'Attention lecture', entries: [entryDraft] });
    const params = astra.mock.calls[0][0];
    expect(params.model).toBe('gpt-6-astra');
    const body = buildReadingAstraRequest(params);
    expect(parseReadingAstraRequest(body)).toBe(body);
    const source = JSON.stringify(body.messages);
    expect(source).toContain('[PAGE 3]');
    expect(source).toContain(pages[2]);
    expect(body).not.toHaveProperty('schema');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('keeps entry explanations on their selected pages and preserves history', async () => {
    astra.mockResolvedValue({ text: 'A source-bound entry explanation.' });
    await expect(paths[4][1]()).resolves.toBe('A source-bound entry explanation.');
    const params = astra.mock.calls[0][0];
    expect(params.model).toBe('gpt-6-astra');
    const body = buildReadingAstraRequest(params);
    expect(parseReadingAstraRequest(body)).toBe(body);
    const source = JSON.stringify(body.messages);
    expect(source).toContain(pages[1]);
    expect(source).not.toContain(pages[0]);
    expect(source).not.toContain(pages[2]);
    expect(source).toContain('Earlier entry explanation.');
    expect(gemini).not.toHaveBeenCalled();
  });

  it.each(paths)('propagates safe Astra failures for %s without fallback or fake explanations', async (_name, run) => {
    const failure = new ReadingAstraClientError('Astra quota limit reached.');
    astra.mockRejectedValue(failure);
    await expect(run()).rejects.toBe(failure);
    expect(astra).toHaveBeenCalledOnce();
    expect(gemini).not.toHaveBeenCalled();
  });

  it.each(paths)('rejects empty successful output for %s', async (_name, run) => {
    astra.mockResolvedValue({ text: '' });
    await expect(run()).rejects.toThrow();
    expect(gemini).not.toHaveBeenCalled();
  });
});
