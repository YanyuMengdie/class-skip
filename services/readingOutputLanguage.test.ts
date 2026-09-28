import { afterEach, expect, it, vi } from 'vitest';
const fetcher = vi.hoisted(() => vi.fn());
vi.mock('@/services/authenticatedApi', () => ({authenticatedApiFetch: fetcher, ApiPayloadSizeError: class extends Error {}}));
import { generateReadingContent } from './readingAstraClient';
import { setCurrentAppLanguage } from '@/shared/i18n/appLanguage';
afterEach(() => {setCurrentAppLanguage('zh-CN');fetcher.mockReset();});
it('enforces selected language for direct feature callers while retaining learner-request exceptions',async()=>{
 setCurrentAppLanguage('en');fetcher.mockResolvedValue(new Response(JSON.stringify({text:'Done'})));
 await generateReadingContent({model:'test',contents:'这个概念是什么意思？',config:{systemInstruction:'必须用中文'}});
 const body=JSON.parse(fetcher.mock.calls[0][1].body);
 expect(body.instructions).toContain('APPLICATION OUTPUT LANGUAGE (highest priority): English');
 expect(body.instructions).toContain('built-in task templates');
 expect(body.instructions).toContain('Only an explicit language request');
 expect(body.messages[0].parts[0].text).toBe('这个概念是什么意思？');
});
it('pins translation target even when the interface switches back to Chinese',async()=>{
 setCurrentAppLanguage('zh-CN');fetcher.mockResolvedValue(new Response(JSON.stringify({text:'Done'})));
 await generateReadingContent({model:'test',contents:'Translate this'}, {outputLanguage:'en'});
 expect(JSON.parse(fetcher.mock.calls[0][1].body).instructions).toContain('highest priority): English');
});

it('preserves the explicitly Chinese classroom translation tool in English UI',async()=>{
 setCurrentAppLanguage('en');fetcher.mockResolvedValue(new Response(JSON.stringify({text:'课堂译文'})));
 const {translateLectureTranscriptSegment}=await import('./geminiService');
 await translateLectureTranscriptSegment('Attention can shift without eye movements.');
 const instructions=JSON.parse(fetcher.mock.calls[0][1].body).instructions;
 expect(instructions).toContain('应用输出语言（最高优先级）：简体中文');
 expect(instructions).not.toContain('highest priority): English');
});
