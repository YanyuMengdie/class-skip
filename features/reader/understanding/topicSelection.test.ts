import { describe, expect, it } from 'vitest';
import { understandingBlocks, normalizeTopicSelection } from './topicSelection';
import { createGuidedUnderstanding, saveUnderstandingPlan, savedUnderstandingDiscussions } from './guidedUnderstanding';
import { buildUnderstandingPrompt, type UnderstandingSession } from './readingUnderstanding';

const source = `## 模块导读与位置脉络
欢迎来到本模块，第 1–7 页为后续学习做准备。

## 第一部分：多元回归
第 1–4 页，控制重叠信息，区分独立贡献。

## 第二部分：多维尺度分析
第 5 页，以距离表达对象差异。

## 第三部分：RSA 与杏仁核
第 6–7 页，比较表征关系与行为证据。

## 贴切类比映射表
“跟班”对应重叠信息，“真凶”对应独立贡献。

## 已讲内容回顾
EARLIER_KNOWLEDGE_OUTSIDE_THIS_CHECK

## 下一步
是否继续？`;
const response = {
 groups: [
  {title:'多元回归',knowledgeIds:['block-1'],supportIds:['block-4']},
  {title:'多维尺度分析',knowledgeIds:['block-2'],supportIds:[]},
  {title:'RSA 与杏仁核',knowledgeIds:['block-3'],supportIds:[]},
 ],excludedIds:['block-0','block-5','block-6'],
};
const pages=[1,2,3,4,5,6,7];
const parent: UnderstandingSession = {version:1,id:'parent',topic:'',sourceText:source,pageRefs:pages,turns:[],mode:'acquisition',phase:'question',createdAt:1};

describe('semantic selection with exact message excerpts',()=>{
 it('excludes orientation and old recap, attaching an analogy without making it a separate knowledge topic',()=>{
  const plan=normalizeTopicSelection(response,source,pages);
  expect(plan.topics.map(t=>t.title)).toEqual(['多元回归','多维尺度分析','RSA 与杏仁核']);
  expect(plan.topics[0].summary).toContain('控制重叠信息');
  expect(plan.topics[0].supportingText).toContain('跟班');
  expect(plan.topics[0].pageRefs).toEqual([1,2,3,4]);
  expect(JSON.stringify(plan.topics)).not.toContain('EARLIER_KNOWLEDGE');
  const prompt=buildUnderstandingPrompt({session:createGuidedUnderstanding(parent,plan.topics[1]),action:'start',userText:'',minutes:5});
  expect(prompt).toContain('以距离表达对象差异');
  expect(prompt).not.toContain('控制重叠信息');
  expect(prompt).not.toContain('比较表征关系');
  expect(prompt).not.toContain('EARLIER_KNOWLEDGE');
 });
 it('does not drop actual knowledge just because it appears under an introductory heading',()=>{
  const mixed='## 导读\n注意定向是选择信息位置的过程，第 2 页。\n\n欢迎学习。';
  const plan=normalizeTopicSelection({groups:[{title:'注意定向',knowledgeIds:['block-0'],supportIds:[]}],excludedIds:['block-1']},mixed,pages);
  expect(plan.topics[0].summary).toContain('选择信息位置');expect(plan.topics[0].pageRefs).toEqual([2]);
 });
 it('keeps pure orientation empty and never manufactures a whole-passage topic',()=>{
  expect(normalizeTopicSelection({groups:[],excludedIds:['block-0']},'## 全篇路线\n先看模块一，再看模块二。',pages).topics).toEqual([]);
 });
 it('rejects invented excerpts, missing assignments, conflicting assignments and a heading-only topic',()=>{
  expect(()=>normalizeTopicSelection({...response,excludedIds:['block-0','block-5','invented']},source,pages)).toThrow();
  expect(()=>normalizeTopicSelection({...response,excludedIds:['block-0','block-5']},source,pages)).toThrow();
  expect(()=>normalizeTopicSelection({...response,excludedIds:[...response.excludedIds,'block-1']},source,pages)).toThrow();
  expect(()=>normalizeTopicSelection({groups:[{title:'路线',knowledgeIds:['block-0'],supportIds:[]}],excludedIds:[]},'## 路线',pages)).toThrow();
 });
 it('preserves original section order and does not allow another topic’s knowledge as a background block',()=>{
  const plan=normalizeTopicSelection({...response,groups:[...response.groups].reverse()},source,pages);
  expect(plan.topics[0].title).toBe('多元回归');
  expect(()=>normalizeTopicSelection({...response,groups:response.groups.map((g,i)=>i===1?{...g,supportIds:['block-1']}:g)},source,pages)).toThrow();
 });
 it('does not split a fenced example at its blank lines or treat its headings as real source sections',()=>{
  const text='概念。\n\n~~~md\n# 示例\n\n仍在例子里\n~~~\n\n结论。';
  expect(understandingBlocks(text).map(b=>b.text)).toEqual(['概念。','~~~md\n# 示例\n\n仍在例子里\n~~~','结论。']);
 });
 it('preserves old topic conversations when replacing the heading picker and does not archive duplicates',()=>{
  const plan=normalizeTopicSelection(response,source,pages);
  const old=createGuidedUnderstanding(parent,plan.topics[0]);
  old.turns=[{id:'old-answer',role:'user',text:'以前的回答',timestamp:1}];
  const legacy={...parent,plan:{...plan,selectionVersion:undefined,topics:[{...plan.topics[0],conversation:old}]}};
  const updated=saveUnderstandingPlan(legacy,plan);
  const saved=JSON.parse(JSON.stringify(saveUnderstandingPlan(updated,plan)));
  expect(saved.plan.selectionVersion).toBe(1);
  expect(saved.archivedSessions).toHaveLength(1);
  expect(savedUnderstandingDiscussions(saved).find(item=>item.id===old.id)?.turns[0].text).toBe('以前的回答');
  expect(legacy.plan.topics[0].conversation).toBe(old);
 });
 it('separates adjacent section headings even without blank lines',()=>{
  expect(understandingBlocks('## 导读\n欢迎。\n## 回归\n独立贡献。').map(block=>block.text)).toEqual(['## 导读\n欢迎。','## 回归\n独立贡献。']);
 });
});
