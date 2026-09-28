import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInterestEntryPrompt, type InterestEntryContext } from './interestEntryPrompts';
import { generateTinyStudyEntries, generateTinyStudyEntryStep } from '../../services/geminiService';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../services/readingAstraClient', () => ({ generateReadingContent: generate }));

const context: InterestEntryContext = {
  fileName: 'Protein function.pdf',
  documentSummary: 'The lecture connects protein sequence, folding, function and disease.',
  entry: { id: 'prions', type: 'real_life', title: '折叠出错竟然可能致死？',
    teaser: '先看看这个变化在现实里造成了什么。', pageStart: 2, pageEnd: 2,
    evidence: 'Prions propagate misfolding.', status: 'unseen', turns: [] },
  action: 'start',
  pageTexts: ['Unrelated enzyme chapter.', 'Prions propagate misfolding.', 'Unrelated muscle chapter.'],
};

afterEach(() => generate.mockReset());

describe('reality-first interest entries', () => {
  it('sends the story contract, whole-lecture context and only the selected evidence to the model', async () => {
    generate.mockResolvedValue({ text: '  一个完整故事。\n\n最后接回资料。  ' });
    await expect(generateTinyStudyEntryStep('FULL PDF MUST NOT LEAK', context))
      .resolves.toBe('一个完整故事。\n\n最后接回资料。');
    expect(generate).toHaveBeenCalledOnce();
    const request = generate.mock.calls[0][0];
    const prompt = request.contents[0].parts[0].text;
    expect(prompt).toContain(context.documentSummary);
    expect(prompt).toContain('[PAGE 2]\nPrions propagate misfolding.');
    expect(prompt).toContain('必须兑现开头的悬念');
    expect(prompt).toContain('故事讲完之后');
    expect(prompt).toContain('页码只指向有关知识');
    expect(prompt).not.toMatch(/Unrelated|FULL PDF MUST NOT LEAK|180～320/);
    expect(request.config.systemInstruction).toBeTruthy();
  });

  it('starts fresh even when retrying with old turns', () => {
    const prompt = buildInterestEntryPrompt({ ...context,
      previousTurns: [{ id: 'old', action: 'start', text: 'OLD TEXTBOOK OPENING', createdAt: 1 }] });
    expect(prompt).not.toContain('OLD TEXTBOOK OPENING');
    expect(prompt).toContain('这是第一次讲。');
  });

  it('retains the original event after many follow-ups while bounding recent history', () => {
    const previousTurns = [
      { id: 'story', action: 'start' as const, text: 'ORIGINAL EVENT AND OUTCOME', createdAt: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `follow-${i}`, action: 'deeper' as const,
        text: `FOLLOW UP NUMBER ${i}`, createdAt: i + 2 })),
    ];
    const prompt = buildInterestEntryPrompt({ ...context, action: 'deeper', previousTurns });
    expect(prompt).toContain('ORIGINAL EVENT AND OUTCOME');
    expect(prompt).not.toContain('FOLLOW UP NUMBER 3');
    expect(prompt).toContain('FOLLOW UP NUMBER 4');
    expect(prompt).toContain('FOLLOW UP NUMBER 8');
    expect(prompt).not.toContain('首次正文约');
  });

  it.each([
    ['simpler', '最难理解的关系'], ['interesting', '现实为什么出乎意料'], ['deeper', '机制、证据或争议'],
  ] as const)('routes %s to a focused follow-up rather than another first story', async (action, focus) => {
    generate.mockResolvedValue({ text: '后续回答。' });
    await generateTinyStudyEntryStep('', { ...context, action });
    const prompt = generate.mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toContain(focus);
    expect(prompt).not.toContain('首次正文约');
  });

  it('still rejects ungrounded course entries and retains exact page mapping', async () => {
    generate.mockResolvedValue({ text: JSON.stringify({ documentSummary: context.documentSummary, entries: [
      { ...context.entry, pageStart: 99, pageEnd: 99 },
      { ...context.entry, evidence: 'This fabricated evidence is absent.' },
      context.entry,
    ] }) });
    const result = await generateTinyStudyEntries('', context.pageTexts, { fileName: context.fileName });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ pageStart: 2, pageEnd: 2, evidence: context.entry.evidence });
  });

  it('propagates provider failures and rejects empty stories without making up a fallback', async () => {
    generate.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValueOnce({ text: ' ' });
    await expect(generateTinyStudyEntryStep('', context)).rejects.toThrow('provider unavailable');
    await expect(generateTinyStudyEntryStep('', context)).rejects.toThrow('empty');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
