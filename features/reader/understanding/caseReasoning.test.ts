import { describe, it, expect } from 'vitest';
import { buildUnderstandingPrompt, normalizeUnderstandingResult, type UnderstandingSession, type UnderstandingAction } from './readingUnderstanding';
import { createGuidedUnderstanding, resolveGuidedAction } from './guidedUnderstanding';
import type { CaseReasoningState } from './caseReasoning';
const parent: UnderstandingSession = {version:1,id:'parent',topic:'注意与眼动',sourceText:'注意可以在不转动眼睛时转移，但发现刺激不能单凭结果判定眼睛是否转动。',pageRefs:[],turns:[],mode:'acquisition',phase:'question',createdAt:1};
const fresh = () => createGuidedUnderstanding(parent);
const initial: CaseReasoningState = {centralQuestion:'注意转移是否一定要转动眼睛？',situation:'假设你盯着中央，却注意到右边有人挥手。',move:'predict',question:'仅凭注意到右侧动静，能判断眼睛转动了吗？说说理由。',diagnosis:{status:'unknown',learnerQuote:'',gapKind:'unknown',detail:'尚未得到用户理由。'}};
const result = (reasoning:CaseReasoningState=initial, phase='question') => ({topic:'注意与眼动',mode:'acquisition',phase,messageMarkdown:'先考虑眼睛的位置与注意的对象这两个信息。',pageRefs:[],reasoning});
const normalize = (raw:unknown, session=fresh(), action:UnderstandingAction='start', userText='') => normalizeUnderstandingResult(raw,{session,action,userText});
const reply = (text:string, question:string, phase: 'question'|'check'='question') => ({id:'model',role:'model' as const,text,question,phase,timestamp:1});

describe('passage-scoped case reasoning',()=>{
 it('starts with a scenario and an immediate reasoning question, without importing parent discussions',()=>{
  const session=fresh();expect(session.teachingFlow).toBe('case-reasoning-v2');expect(session.turns).toEqual([]);
  expect(normalize(result(),session).reasoning?.question).toBe(initial.question);
  expect(()=>normalize({...result(),phase:'explanation'})).toThrow('推理步骤');
  expect(()=>normalize({...result(),reasoning:undefined})).toThrow('推理步骤');
  expect(()=>normalize(result({...initial,question:''}))).toThrow('推理步骤');
 });
 it('keeps the current case and the unanswered question in the next request',()=>{
  const session={...fresh(),reasoning:initial,turns:[reply('假设你盯着中央。',initial.question)]};
  const prompt=buildUnderstandingPrompt({session,action:'answer',userText:'我觉得眼睛一定动了，因为不看就注意不到。',minutes:5});
  expect(prompt).toContain(initial.centralQuestion);expect(prompt).toContain(initial.question);
  expect(prompt).toContain('一条有针对性的线索');expect(prompt).not.toContain('绝对不要在开场给用户出题');
  expect(prompt).not.toContain('不自动追加迁移测试或连续追问');
 });
 it('accepts a diagnosed gap only with an actual learner reasoning quote',()=>{
  const answer='眼睛一定动了，因为不看就注意不到。';
  const reasoning:CaseReasoningState={...initial,move:'compare',question:'眼睛盯着中央时，你能不能留意余光里的变化？',diagnosis:{status:'gap',learnerQuote:answer,gapKind:'relationship',detail:'把注意的对象与眼睛位置绑定了。'}};
  expect(normalize(result(reasoning),fresh(),'answer',answer).reasoning?.diagnosis.status).toBe('gap');
  expect(()=>normalize(result(reasoning),fresh(),'answer','我还没有给出这种理由。')).toThrow('推理步骤');
  expect(()=>normalize(result({...reasoning,diagnosis:{...reasoning.diagnosis,learnerQuote:'A'}}),fresh(),'answer','A')).toThrow('推理步骤');
 });
 it.each<UnderstandingAction>(['hint','foundation','reason'])('%s keeps a smaller next question instead of falling back to a lecture',action=>{
  const smaller={...initial,move:'compare' as const,question:'先只看眼睛：情境里它盯着哪里？'};
  expect(normalize(result(smaller),fresh(),action).phase).toBe('question');
  expect(()=>normalize(result({...smaller,question:''},'explanation'),fresh(),action)).toThrow('推理步骤');
 });
 it('supports explicit reveal and resumes reasoning only on request',()=>{
  const reveal={...initial,move:'reveal' as const,question:''};
  expect(normalize(result(reveal,'explanation'),fresh(),'explain').phase).toBe('explanation');
  expect(()=>normalize(result(initial),fresh(),'explain')).toThrow('推理步骤');
  expect(resolveGuidedAction('answer','请直接告诉我答案')).toBe('explain');
  expect(resolveGuidedAction('answer','Just tell me the answer')).toBe('explain');
  expect(resolveGuidedAction('answer','我不知道')).toBe('foundation');
  expect(resolveGuidedAction('answer','我觉得不一定，因为注意和眼睛位置不是同一回事。')).toBe('answer');
 });
 it('requires a real answer to the previous transfer check before wrapping up',()=>{
  const check={...initial,move:'transfer' as const,question:'换成只听到右边声音，这能证明眼睛转向了吗？为什么？'};
  const answer='不能，因为注意到某个方向并不能单独证明眼睛朝向。';
  const complete={...check,move:'summarize' as const,question:'',diagnosis:{status:'supported' as const,learnerQuote:answer,gapKind:'none' as const,detail:'区分了注意方向与眼睛朝向。'}};
  const session={...fresh(),reasoning:check,turns:[reply('只听到声音。',check.question,'check')]};
  expect(normalize(result(complete,'complete'),session,'answer',answer).phase).toBe('complete');
  expect(()=>normalize(result(complete,'complete'),fresh(),'answer',answer)).toThrow('完成理解检验');
  expect(()=>normalize(result(complete,'complete'),session,'answer','懂了')).toThrow('完成理解检验');
 });
 it('upgrades the old guided flow without discarding its discussion',()=>{
  const legacy={...fresh(),teachingFlow:'guided-step-v1' as const,turns:[reply('旧的背景讲解','')]};
  expect(normalize(result(),legacy,'reason').reasoning?.question).toBe(initial.question);
  expect(legacy.turns[0].text).toBe('旧的背景讲解');
 });
});
