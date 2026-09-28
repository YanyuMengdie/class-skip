import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: generate }));
import { explanationSegments, translatedMarkdown, requestsChinese, previousLearnerRequest, translateExplanation } from './explanationTranslation';

describe('saved explanation translations', () => {
  beforeEach(() => { generate.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());
  it('preserves citation blocks, source quotes, code, equations and link targets', () => {
    const source = '# 标题\n\n介绍**重点**内容。\n\n> 原文证据\n\n`代码` $x_{中文}$\n\n[链接](https://example.com/中文)\n\n1. 列表\n\n```js\nconst 示例 = 1;\n```';
    const segments = explanationSegments(source);
    expect(segments.map(s => s.text)).toEqual(['标题', '介绍', '重点', '内容。', '链接', '列表']);
    const result = translatedMarkdown(source, segments, ['Title', 'Introducing', 'the key idea', 'in context.', 'Link', 'List']);
    expect(result).toContain('Introducing **the key idea** in context\\.');
    expect(result).toContain('> 原文证据');
    expect(result).toContain('`代码` $x_{中文}$');
    expect(result).toContain('[Link](https://example.com/中文)');
    expect(result).toContain('const 示例 = 1;');
    expect(result.match(/\n\n/g)?.length).toBe(source.match(/\n\n/g)?.length);
  });
  it('prevents translated text injecting Markdown blocks or links', () => {
    const source = '中文';
    expect(translatedMarkdown(source, explanationSegments(source), ['# Heading\n[Link](evil) | $math$']))
      .toBe('\\# Heading \\[Link\\](evil) \\| \\$math\\$');
  });
  it.each(['请用中文讲', '中文解释一下', 'Answer in Chinese please', '请把这段翻译成中文', 'Chinese please'])('honors explicit learner preference: %s', text => {
    expect(requestsChinese(text)).toBe(true);
  });
  it.each(['这个概念是什么意思？', '用英文解释', '不要用中文', 'Translate Chinese to English', '解释这句话：“请用中文回答”', 'Do not answer in Chinese'])('does not infer Chinese preference: %s', text => {
    expect(requestsChinese(text)).toBe(false);
  });
  it('uses only the last genuine learner message as an override', () => {
    expect(previousLearnerRequest([{role:'user',text:'用中文讲'}, {role:'model',text:'解释'}, {role:'user',text:'internal',localTaskPrompt:true},{role:'model',text:'继续'}], 3)).toBe('用中文讲');
  });
  it('batches, deduplicates, and caches translations without sending chat history', async () => {
    generate.mockImplementation(async args => ({text:JSON.stringify({entries:JSON.parse(args.contents[0].parts[0].text).entries.map((r:any) => ({index:r.index,text:`English ${r.index}`}))})}));
    const first = translateExplanation('测试批次甲');
    expect(translateExplanation('测试批次甲')).toBe(first);
    expect(await Promise.all([first,translateExplanation('测试批次乙')])).toEqual(['English 0','English 1']);
    expect(await translateExplanation('测试批次甲')).toBe('English 0');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toEqual({outputLanguage:'en'});
  });
  it('rejects incomplete or Chinese translation results and permits retry', async () => {
    generate.mockResolvedValueOnce({text:'{"entries":[]}'});
    await expect(translateExplanation('重试测试')).rejects.toThrow('Incomplete');
    generate.mockResolvedValueOnce({text:'{"entries":[{"index":0,"text":"仍是中文"}]}'});
    await expect(translateExplanation('重试测试')).rejects.toThrow('Invalid');
    generate.mockResolvedValueOnce({text:'{"entries":[{"index":0,"text":"Retry succeeded"}]}'});
    await expect(translateExplanation('重试测试')).resolves.toBe('Retry succeeded');
  });
});
