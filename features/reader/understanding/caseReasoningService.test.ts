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
