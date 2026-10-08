import { it, expect, vi } from 'vitest';
const generate = vi.hoisted(()=>vi.fn());
vi.mock('@/services/readingAstraClient',()=>({generateReadingContent:generate,readingFailureMessage:(_error:unknown,fallback:string)=>fallback}));
import { generateReadingUnderstandingTurn } from '@/services/geminiService';
import { createGuidedUnderstanding } from './guidedUnderstanding';
import type { UnderstandingSession } from './readingUnderstanding';

it('requests the case contract through the actual service and carries the last question and learner evidence',async()=>{
 const parent={version:1,id:'parent',sourceText:'选中的关系',pageRefs:[],turns:[],mode:'acquisition',phase:'question',createdAt:1} as UnderstandingSession;
 const session=createGuidedUnderstanding(parent);
 session.turns=[{id:'m',role:'model',text:'给出的情境',question:'前提变了会怎样？',phase:'question',timestamp:1}];
 const reasoning={centralQuestion:'选中的关系成立吗？',situation:'给出的情境',move:'compare',question:'这一变化影响哪个前提？',diagnosis:{status:'unknown',learnerQuote:'',gapKind:'unknown',detail:'还需要看到理由。'}};
 generate.mockResolvedValue({text:JSON.stringify({topic:'所选关系',mode:'acquisition',phase:'question',messageMarkdown:'只看刚才改变的条件。',pageRefs:[],reasoning})});
 const result=await generateReadingUnderstandingTurn({session,action:'answer',userText:'A',minutes:5,documentContent:'ENTIRE_DOCUMENT_MUST_NOT_BE_SENT'});
 expect(result.reasoning?.question).toBe(reasoning.question);
 const request=generate.mock.calls[0][0];const config=request.config;
 expect(config.responseSchema.required).toContain('reasoning');expect(JSON.stringify(config.systemInstruction)).toContain('案件推理辅导');
 expect(JSON.stringify(request.contents)).toContain('前提变了会怎样？');
 expect(JSON.stringify(request)).not.toContain('ENTIRE_DOCUMENT_MUST_NOT_BE_SENT');
 expect(JSON.stringify(request)).not.toContain('绝对不要在开场给用户出题');
});

it('organizes only the clicked message into exact knowledge and support excerpts through the service', async () => {
 const { generateUnderstandingTopics } = await import('@/services/geminiService');
 const source = '## 模块导读\n欢迎来到本模块。\n\n## 多元回归\n控制重叠信息，第 2 页。\n\n## 类比\n跟班和真凶。';
 generate.mockClear();
 generate.mockResolvedValue({ text: JSON.stringify({ groups: [{ title: '多元回归', knowledgeIds: ['block-1'], supportIds: ['block-2'] }], excludedIds: ['block-0'] }) });
 const plan = await generateUnderstandingTopics({ sourceText: source, allowedPages: [1, 2, 3] });
 const request = generate.mock.calls[0][0];
 expect(JSON.stringify(request.contents)).toContain('控制重叠信息');
 expect(JSON.stringify(request)).not.toContain('ENTIRE_DOCUMENT_MUST_NOT_BE_SENT');
 expect(JSON.stringify(request.config.systemInstruction)).toContain('不能只按标题筛选');
 expect(request.config.responseSchema.required).toContain('excludedIds');
 expect(plan.topics).toHaveLength(1);
 expect(plan.topics[0].pageRefs).toEqual([2]);
 expect(plan.topics[0].summary).not.toContain('欢迎');
 expect(plan.topics[0].supportingText).toContain('跟班');
 generate.mockResolvedValue({ text: JSON.stringify({ groups: [{ title: '另一个知识', knowledgeIds: ['invented'], supportIds: [] }], excludedIds: ['block-0'] }) });
 await expect(generateUnderstandingTopics({ sourceText: source, allowedPages: [1, 2, 3] })).rejects.toThrow('整理未完成');
});
