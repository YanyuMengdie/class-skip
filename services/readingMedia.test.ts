import { PAPER_COMPANION_PROMPT, ARTICLE_COMPANION_PROMPT } from '@/lib/prompts/systemPrompts';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {generateContinuousLectureTurn,generateContinuousLectureVariant,generateLegacyRecordExplanationVariant,chatWithSkimAdaptiveTutor} from './geminiService';
import {createSkimExplanationState} from '@/features/reader/skim/skimExplanation';
import {parseReadingResponse} from '@/features/reader/skim/readingAids';
const {generate}=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('./readingAstraClient',()=>({generateReadingContent:generate}));
const body={responseKind:'explanation',messageMarkdown:'这张图解释了核心差异。',spineItems:[{id:'p1',titleZh:'差异',kind:'evidence',summary:'证据',pageRefs:[7]}],coveredSpineItemIds:['p1'],deferredSpineItemIds:[],pageRefs:[7],aids:[{kind:'figure',title:'关键图',afterText:'这张图解释了核心差异。',caption:'结论有限定。',focus:'看两组的差异。',page:7}]};
const input={docContent:'data:application/pdf;base64,cGRm',history:[],newMessage:'继续',docType:'STEM' as const,depth:'normal' as const,pageStart:7,pageEnd:9};
beforeEach(()=>{generate.mockReset();generate.mockResolvedValue({text:JSON.stringify(body)});});
describe('reading media generation',()=>{
 it('generates text and optional media in one request while preserving the PDF and bounds',async()=>{
  const draft=await generateContinuousLectureTurn(input);expect(draft.readingMedia?.aids?.[0].page).toBe(7);expect(generate).toHaveBeenCalledTimes(1);
  const req=generate.mock.calls[0][0];expect(JSON.stringify(req.contents)).toContain('cGRm');expect(req.config.responseSchema.properties.aids).toBeDefined();expect(JSON.stringify(req.config.systemInstruction)).toContain('aids 可以为空');
 });
 it('retains prose without retrying when an optional figure is out of scope',async()=>{
  generate.mockResolvedValue({text:JSON.stringify({...body,aids:[{...body.aids[0],page:10}]})});
  const draft=await generateContinuousLectureTurn(input);expect(draft.messageMarkdown).toBe(body.messageMarkdown);expect(draft.readingMedia?.aids).toBeUndefined();expect(generate).toHaveBeenCalledTimes(1);
 });
 it('does not accept original figures from a text-only source',async()=>{
  expect((await generateContinuousLectureTurn({...input,docContent:'page 7 text'})).readingMedia?.aids).toBeUndefined();
 });
 it('generates separate optional media for a rewritten version',async()=>{
  const draft=await generateContinuousLectureTurn(input);generate.mockClear();
  const variant=await generateContinuousLectureVariant({docContent:input.docContent,explanation:createSkimExplanationState(draft,'normal'),targetDepth:'normal',targetStyle:'interesting',pageStart:7,pageEnd:9});
  expect(variant.readingMedia?.aids).toHaveLength(1);expect(generate).toHaveBeenCalledTimes(1);
 });
 it.each(['paper','article'] as const)('adds optional presentation without replacing %s reading rules or cropped-page mapping',async(contentType)=>{
  const raw=await chatWithSkimAdaptiveTutor(input.docContent,[],'继续','reading','STEM',{visualAids:true,readingScope:{pageStart:7,pageEnd:9,cropped:true}},undefined,undefined,contentType);
  expect(parseReadingResponse(raw,7,9,true).media.aids?.[0].page).toBe(7);expect(generate).toHaveBeenCalledTimes(1);
  const config=generate.mock.calls[0][0].config;expect(JSON.stringify(config.systemInstruction)).toContain('不改成 Lecture 模板');expect(JSON.stringify(config.systemInstruction)).toContain('附件页码 + 6');expect(config.responseMimeType).toBe('application/json');
 });
 it.each(['paper','article'] as const)('rewrites an existing %s explanation within its record without switching teaching templates',async(contentType)=>{
  const draft=await generateLegacyRecordExplanationVariant({docContent:input.docContent,contentType,legacyMessageMarkdown:'旧讲解原文及其实验限定条件。',targetDepth:'normal',targetStyle:'interesting',pageStart:7,pageEnd:9,recordTitle:'当前分段'});
  let req=generate.mock.calls[0][0];
  expect(JSON.stringify(req.config.systemInstruction)).toContain('不改成 Lecture 模板');
  expect(String(req.config.systemInstruction)).toContain(contentType === 'paper' ? PAPER_COMPANION_PROMPT : ARTICLE_COMPANION_PROMPT);
  expect(JSON.stringify(req.config.systemInstruction)).toContain('译文引用块须原样保留');
  expect(JSON.stringify(req.contents)).toContain('旧讲解原文及其实验限定条件。');
  expect(JSON.stringify(req.contents)).toContain('第 7-9 页');
  generate.mockClear();
  await generateContinuousLectureVariant({docContent:input.docContent,contentType,explanation:createSkimExplanationState(draft,'normal'),targetDepth:'normal',targetStyle:'interesting',pageStart:7,pageEnd:9});
  req=generate.mock.calls[0][0];
  expect(JSON.stringify(req.config.systemInstruction)).toContain('保留原讲解的论证顺序、证据和限定条件');
  expect(JSON.stringify(req.contents)).toContain('对应回原文的术语');
  expect(generate).toHaveBeenCalledTimes(1);
 });
 it('leaves tutoring and non-opted-in callers on their existing response protocol',async()=>{
  generate.mockResolvedValue({text:'原有回复'});await chatWithSkimAdaptiveTutor('text',[],'问题','tutoring','STEM',{visualAids:true});
  expect(generate.mock.calls[0][0].config.responseSchema).toBeUndefined();expect(JSON.stringify(generate.mock.calls[0][0].config.systemInstruction)).not.toContain('按需辅助表达');
 });
});
