import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import { buildReadingAstraRequest } from './readingAstraClient';
import { parseReadingAstraRequest, readingAstraFormat } from '../server/readingAstra';
import {
  generateExamSummary, generateFeynmanExplanation, generateMindMap, extractTerminology,
  generateStudyGuide, generateSlideExplanation, generatePersonaStoryScript,
  generateLSAPContentMap, translateLectureTranscriptSegment,
} from './geminiService';

const { astra } = vi.hoisted(() => ({ astra: vi.fn() }));
vi.mock('./readingAstraClient', async importOriginal => ({
  ...await importOriginal<typeof import('./readingAstraClient')>(), generateReadingContent: astra,
}));
const pdfData = Buffer.from('%PDF-1.7\n' + 'source content\n'.repeat(5000)).toString('base64');
const pdf = `data:application/pdf;base64,${pdfData}`;
beforeEach(() => { astra.mockReset(); setCurrentAppLanguage('zh-CN'); });
afterEach(() => { vi.unstubAllGlobals(); setCurrentAppLanguage('zh-CN'); });

function capturedRequest() {
  expect(astra).toHaveBeenCalledOnce();
  const params = astra.mock.calls[0][0];
  expect(params.model).toBe('gpt-6-astra');
  const request = buildReadingAstraRequest(params);
  expect(() => parseReadingAstraRequest(request)).not.toThrow();
  if (request.schema) expect(() => readingAstraFormat(request.schema)).not.toThrow();
  return request;
}

describe('shared Astra migration compatibility', () => {
  it.each([
    ['summary', generateExamSummary, 'A concise summary'],
    ['Feynman', generateFeynmanExplanation, 'A plain-language explanation'],
    ['mind map', generateMindMap, JSON.stringify({ id: 'root', label: 'Topic', children: [] })],
    ['terms', extractTerminology, JSON.stringify([{ term: 'Term', definition: 'Meaning' }])],
  ] as const)('keeps the full PDF for %s instead of truncating its base64', async (_label, generate, text) => {
    astra.mockResolvedValue({ text });
    await generate(pdf);
    const request = capturedRequest();
    expect(request.messages.flatMap(message => message.parts)).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: pdfData } });
  });

  it('keeps the existing text limit while preserving PDF input', async () => {
    astra.mockResolvedValue({ text: 'Summary' });
    await generateExamSummary('a'.repeat(60000) + 'AFTER_TEXT_LIMIT');
    const request = capturedRequest();
    expect(JSON.stringify(request.messages)).not.toContain('AFTER_TEXT_LIMIT');
  });

  it('accepts a concise study guide schema through the real strict-output converter', async () => {
    astra.mockResolvedValue({ text: JSON.stringify({ chapters: [{ title: 'Chapter' }], coreConcepts: [], markdownContent: '# Outline' }) });
    expect(await generateStudyGuide(pdf, { format: 'outline' })).not.toBeNull();
    capturedRequest();
  });

  it('sends long page context as source data and keeps structured page output', async () => {
    astra.mockResolvedValue({ text: JSON.stringify({ summary: 'A summary', key_points: ['Point'], deep_dive: { title: 'Page', content: 'Explanation', interactive_question: 'Why?' } }) });
    await expect(generateSlideExplanation('data:image/png;base64,aW1hZ2U=', 'a'.repeat(79000) + 'SOURCE_TAIL', { guideContext: 'GUIDE_CONTEXT' })).resolves.toContain('Explanation');
    const request = capturedRequest();
    expect(request.instructions).not.toContain('SOURCE_TAIL');
    expect(JSON.stringify(request.messages)).toContain('SOURCE_TAIL');
    expect(JSON.stringify(request.messages)).toContain('GUIDE_CONTEXT');
    expect((request.schema as any).properties.deep_dive.required).toContain('content');
  });

  it('preserves the visual-novel script array contract with strict output', async () => {
    astra.mockResolvedValue({ text: JSON.stringify(['First line', 'Second line']) });
    expect(await generatePersonaStoryScript('This is a sufficiently long source document about a concept and its supporting explanation.')).toEqual(['First line', 'Second line']);
    expect(readingAstraFormat(capturedRequest().schema).array).toBe(true);
  });

  it('extracts KC data with the original source and schema through Astra', async () => {
    astra.mockResolvedValue({ text: JSON.stringify({ id: 'map', sourceKey: 'doc', kcs: [], createdAt: 0 }) });
    await generateLSAPContentMap(pdf, { mode: 'workspaceChunk' });
    const request = capturedRequest();
    expect(request.messages.flatMap(message => message.parts)).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: pdfData } });
    expect((request.schema as any).properties.kcs).toBeDefined();
  });

  it('routes transcript translation through Astra while preserving the recent context', async () => {
    astra.mockResolvedValue({ text: '译文' });
    expect(await translateLectureTranscriptSegment('CURRENT_SEGMENT', ['EARLIER_SEGMENT'])).toBe('译文');
    const request = capturedRequest();
    expect(JSON.stringify(request.messages)).toContain('CURRENT_SEGMENT');
    expect(JSON.stringify(request.messages)).toContain('EARLIER_SEGMENT');
  });
});
