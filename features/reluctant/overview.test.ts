import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertOverviewResponseComplete,
  buildOverviewExplanationPrompt,
  buildOverviewOutlinePrompt,
  isOverviewExplanation,
  isOverviewOutline,
  parseOverviewExplanation,
  parseOverviewOutline,
  type OverviewExplanation,
  type OverviewOutline,
} from './overview';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import { generateReluctantOverviewExplanation, generateReluctantOverviewOutline, generateTinyStudyStep } from '@/services/geminiService';
import { ReadingAstraClientError } from '@/services/readingAstraClient';

const { generateContentMock } = vi.hoisted(() => ({ generateContentMock: vi.fn() }));

vi.mock('@/services/readingAstraClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/readingAstraClient')>();
  return { ...actual, generateReadingContent: generateContentMock };
});

const outline: OverviewOutline = {
  title: '身体怎样参与情绪',
  overview: '这节课讨论身体反应和我们怎样解释处境，以及两者怎样影响感受和选择。',
  pageCount: 34,
  points: [
    {
      id: 'p1',
      idea: '同样心跳加快，可以有不同感受。',
      explanation: '身体变得激动之后，我们对当时处境的解释也会影响感受。',
      caveat: '这个经典实验存在方法问题，不能当作最终答案。',
      pages: [10, 25],
    },
    {
      id: 'p2',
      idea: '过去经历留下的身体信号可以参与选择。',
      explanation: '抽牌时，身体反应可能帮助我们避开长期不划算的牌。',
      caveat: '',
      pages: [30, 34],
    },
  ],
};

const explanation: OverviewExplanation = {
  title: '感受和选择，也有身体的一份',
  sections: [
    {
      text: '同样心跳加快，我们怎样理解处境也会影响感受。这个经典实验存在方法问题，不能当作最终答案。',
      pointIds: ['p1'],
    },
    {
      text: '这些身体反应还可能帮助选择。抽牌时，过去经历留下的信号可能帮助我们避开长期不划算的牌。',
      pointIds: ['p2'],
    },
  ],
};

const modelResponse = (value: unknown) => ({
  text: JSON.stringify(value),
});

beforeEach(() => {
  generateContentMock.mockReset();
  setCurrentAppLanguage('zh-CN');
});

afterEach(() => {
  setCurrentAppLanguage('zh-CN');
});

describe('overview factual coverage and source validation', () => {
  it('accepts source points including late-page qualifications and complete variants', () => {
    expect(parseOverviewOutline(JSON.stringify(outline), 34)).toEqual(outline);
    expect(parseOverviewExplanation(explanation, outline)).toEqual(explanation);
    expect(isOverviewOutline(outline)).toBe(true);
    expect(isOverviewExplanation(explanation, outline)).toBe(true);
  });

  it.each([0, 35, 1.5, '10', NaN])('rejects invalid source page %s instead of coercing it', (page) => {
    expect(() => parseOverviewOutline({
      ...outline,
      points: [{ ...outline.points[0], pages: [page] }],
    }, 34)).toThrow(/source page/);
  });

  it('rejects another document page count, absent sources, and duplicate core ids', () => {
    expect(() => parseOverviewOutline(outline, 20)).toThrow(/does not match/);
    expect(() => parseOverviewOutline({ ...outline, points: [{ ...outline.points[0], pages: [] }] }, 34)).toThrow(/no source page/);
    expect(() => parseOverviewOutline({ ...outline, points: [outline.points[0], outline.points[0]] }, 34)).toThrow(/duplicate point id/);
    expect(() => parseOverviewOutline({ ...outline, pageCount: 0 }, 0)).toThrow(/positive integer/);
  });

  it('rejects a fluent ending that quietly omits a later core point', () => {
    const shortened = { ...explanation, sections: [explanation.sections[0]] };
    expect(() => parseOverviewExplanation(shortened, outline)).toThrow(/omitted core points/);
    expect(isOverviewExplanation(shortened, outline)).toBe(false);
  });

  it('requires qualifications in visible prose even when the correct id is claimed', () => {
    expect(() => parseOverviewExplanation({
      ...explanation,
      sections: [{ text: '这个实验完全证明了情绪的形成方式。', pointIds: ['p1'] }, explanation.sections[1]],
    }, outline)).toThrow(/dropped an essential qualification/);
  });

  it('allows paragraphs to regroup points while retaining every qualification', () => {
    const combined = {
      ...explanation,
      sections: [{ text: explanation.sections.map((section) => section.text).join('\n\n'), pointIds: ['p2', 'p1'] }],
    };
    expect(parseOverviewExplanation(combined, outline)).toEqual(combined);
  });

  it('rejects unknown ids and ids repeated in the same or another paragraph', () => {
    expect(() => parseOverviewExplanation({
      ...explanation,
      sections: [explanation.sections[0], { ...explanation.sections[1], pointIds: ['invented'] }],
    }, outline)).toThrow(/unknown point id/);
    expect(() => parseOverviewExplanation({
      ...explanation,
      sections: [explanation.sections[0], { ...explanation.sections[1], pointIds: ['p2', 'p2'] }],
    }, outline)).toThrow(/repeats a point id/);
    expect(() => parseOverviewExplanation({
      ...explanation,
      sections: [...explanation.sections, explanation.sections[1]],
    }, outline)).toThrow(/repeats a point id/);
  });

  it('rejects empty, malformed, and truncated output without salvaging partial JSON', () => {
    expect(() => parseOverviewOutline('{"title":"unfinished', 34)).toThrow(/complete JSON/);
    expect(() => parseOverviewOutline({ ...outline, points: [] }, 34)).toThrow(/no core points/);
    expect(() => parseOverviewExplanation({ ...explanation, sections: [] }, outline)).toThrow(/no explanation sections/);
    expect(() => assertOverviewResponseComplete('', 'STOP')).toThrow(/empty/);
    expect(() => assertOverviewResponseComplete(JSON.stringify(explanation), 'MAX_TOKENS')).toThrow(/MAX_TOKENS/);
  });

  it('does not accept serialized strings as validated cache objects', () => {
    expect(isOverviewOutline(JSON.stringify(outline))).toBe(false);
    expect(isOverviewExplanation(JSON.stringify(explanation), outline)).toBe(false);
  });
});

describe('overview generation contract', () => {
  it('changes expression while giving both styles the identical complete factual outline', () => {
    const plain = buildOverviewExplanationPrompt(outline, 'plain');
    const story = buildOverviewExplanationPrompt(outline, 'story');
    expect(plain).toContain('讲法：大白话讲解');
    expect(plain).toContain('先说熟悉的意思');
    expect(story).toContain('讲法：故事讲解');
    expect(story).toContain('真实案例、实验经过');
    expect(story).toContain('不能把虚构角色');
    for (const prompt of [plain, story]) {
      expect(prompt).toContain(JSON.stringify(outline));
      expect(prompt).toContain('逐字保留');
      expect(prompt).toContain('不要求读者预测、作答');
    }
    expect(buildOverviewOutlinePrompt('lecture.pdf', 34)).toContain('包含图表和末尾页面');
  });

  it('sends all text beyond the existing 40k helper limit and validates its sources', async () => {
    generateContentMock.mockResolvedValueOnce(modelResponse(outline));
    const text = `${'开头内容 '.repeat(12_000)}[PAGE 34] 后来的修正证据`;
    await expect(generateReluctantOverviewOutline(text, { fileName: 'lecture.pdf', pageCount: 34 })).resolves.toEqual(outline);
    const request = generateContentMock.mock.calls[0][0];
    expect(request.contents[0].parts[0].text).toBe(`DOCUMENT CONTENT:\n${text}`);
    expect(JSON.stringify(request.config.systemInstruction)).toContain('不可信的资料数据');
    expect(JSON.stringify(request.config.systemInstruction)).toContain('简体中文');
    expect(request.config.responseMimeType).toBe('application/json');
  });

  it('keeps the complete PDF attachment for diagrams and scanned pages', async () => {
    generateContentMock.mockResolvedValueOnce(modelResponse(outline));
    await generateReluctantOverviewOutline('data:application/pdf;base64,JVBERi0xLjc=', { fileName: 'scan.pdf', pageCount: 34 });
    expect(generateContentMock.mock.calls[0][0].contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjc=' },
    });
  });

  it('fails before calling the model when no valid source is available', async () => {
    await expect(generateReluctantOverviewOutline('', { fileName: 'empty.pdf', pageCount: 34 })).rejects.toThrow(/No PDF content/);
    await expect(generateReluctantOverviewOutline('data:application/pdf;base64,broken!', { fileName: 'broken.pdf', pageCount: 34 })).rejects.toThrow(/attachment is invalid/);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('throws rather than displaying generated text with missing caveats or truncated output', async () => {
    const incomplete = new ReadingAstraClientError('Astra did not finish the reading response. Please retry.');
    generateContentMock.mockRejectedValueOnce(incomplete);
    await expect(generateReluctantOverviewExplanation(outline, 'story')).rejects.toBe(incomplete);
    generateContentMock.mockResolvedValueOnce(modelResponse({
      ...explanation,
      sections: [{ text: '情绪完全取决于我们怎样想。', pointIds: ['p1'] }, explanation.sections[1]],
    }));
    await expect(generateReluctantOverviewExplanation(outline, 'plain')).rejects.toThrow(/qualification/);
  });

  it('uses the English gateway and stops a stale Chinese request before language mixing', async () => {
    setCurrentAppLanguage('en');
    generateContentMock.mockResolvedValueOnce(modelResponse(explanation));
    await generateReluctantOverviewExplanation(outline, 'plain', { language: 'en' });
    expect(JSON.stringify(generateContentMock.mock.calls[0][0].config.systemInstruction)).toContain('APPLICATION OUTPUT LANGUAGE');
    await expect(generateReluctantOverviewExplanation(outline, 'story', { language: 'zh-CN' })).rejects.toThrow(/language changed/);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});

describe('sequential plain-language reading', () => {
  it('starts with the first substantive material and keeps subsequent steps in source order', async () => {
    generateContentMock.mockResolvedValue({ text: '先从情绪与身体的关系讲起。' });
    await generateTinyStudyStep('lecture', { fileName: 'lecture.pdf', action: 'start' });
    expect(generateContentMock.mock.calls[0][0].contents[0].parts[1].text).toContain('第一小块实质内容');
    await generateTinyStudyStep('lecture', { fileName: 'lecture.pdf', action: 'next', previousTurns: ['第一段'] });
    expect(generateContentMock.mock.calls[1][0].contents[0].parts[1].text).toContain('按原资料的顺序往后讲');
  });

  it('throws on empty or failed generation so a failure cannot be saved as a learning step', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      generateContentMock.mockResolvedValueOnce({ text: '' });
      await expect(generateTinyStudyStep('lecture', { fileName: 'lecture.pdf', action: 'start' })).rejects.toThrow();
      generateContentMock.mockRejectedValueOnce(new Error('network failure'));
      await expect(generateTinyStudyStep('lecture', { fileName: 'lecture.pdf', action: 'next' })).rejects.toThrow();
    } finally {
      log.mockRestore();
    }
  });
});
