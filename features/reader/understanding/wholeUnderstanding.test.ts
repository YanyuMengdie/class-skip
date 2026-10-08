import { describe, expect, it } from 'vitest';
import { createWholeUnderstanding, advanceWholeUnderstanding, updateWholePart, understandingPartStatus } from './wholeUnderstanding';
import { buildUnderstandingPrompt, type UnderstandingSession } from './readingUnderstanding';
import { normalizeTopicSelection } from './topicSelection';
import { prepareMessageUnderstanding } from './understandingScope';
import { savedUnderstandingDiscussions } from './guidedUnderstanding';

const source='## 第一部分\n回归控制重叠信息，第 1 页。\n\n## 第二部分\nMDS 表达距离，第 2 页。\n\n## 第三部分\nRSA 比较关系，第 3 页。';
const plan=normalizeTopicSelection({groups:[
 {title:'回归',knowledgeIds:['block-0'],supportIds:[]},
 {title:'MDS',knowledgeIds:['block-1'],supportIds:[]},
 {title:'RSA',knowledgeIds:['block-2'],supportIds:[]},
],excludedIds:[]},source,[1,2,3]);
const parent:UnderstandingSession={version:1,id:'parent',topic:'',sourceText:source,pageRefs:[1,2,3],turns:[{id:'old',role:'model',text:'UNRELATED_OLD_DISCUSSION',timestamp:1}],mode:'acquisition',phase:'question',createdAt:1,plan};
const complete=(part:UnderstandingSession):UnderstandingSession=>({...part,phase:'complete',reasoning:{centralQuestion:'判断',situation:'情境',question:'',move:'summarize',diagnosis:{status:'supported',learnerQuote:'因为…',gapKind:'none',detail:'有理由支持'}},turns:[{id:'model',role:'model',text:'这一部分已核对',phase:'complete',timestamp:2}]});

describe('whole passage checks each main part',()=>{
 it('does not finish the whole message after the first part passes and scopes each next request independently',()=>{
  let round=createWholeUnderstanding(parent,plan);
  const before=JSON.stringify(parent);
  const first=round.coverage!.parts[0];
  const prompt=buildUnderstandingPrompt({session:first.conversation,action:'start',userText:'',minutes:5});
  expect(prompt).toContain('第 1/3 部分');expect(prompt).not.toContain('MDS 表达距离');expect(prompt).not.toContain('UNRELATED_OLD_DISCUSSION');
  round=updateWholePart(round,first.id,complete);round=advanceWholeUnderstanding(round);
  expect(round.coverage!.finished).toBe(false);expect(round.coverage!.activePartId).toBe(round.coverage!.parts[1].id);
  expect(understandingPartStatus(round.coverage!.parts[0].conversation)).toBe('checked');
  expect(understandingPartStatus(round.coverage!.parts[1].conversation)).toBe('unvisited');
  const next=buildUnderstandingPrompt({session:round.coverage!.parts[1].conversation,action:'start',userText:'',minutes:5});
  expect(next).toContain('MDS 表达距离');expect(next).not.toContain('回归控制重叠信息');
  expect(JSON.stringify(parent)).toBe(before);
 });
 it('does not equate a revealed answer or skipped part with understanding, and ends with all three statuses intact',()=>{
  let round=createWholeUnderstanding(parent,plan);
  round=updateWholePart(round,round.coverage!.activePartId!,complete);round=advanceWholeUnderstanding(round);
  round=updateWholePart(round,round.coverage!.activePartId!,part=>({...part,explained:true,phase:'explanation',turns:[{id:'reveal',role:'model',text:'主动要求的答案',timestamp:3}]}));
  expect(understandingPartStatus(round.coverage!.parts[1].conversation)).toBe('explained');
  round=advanceWholeUnderstanding(round,true);round=advanceWholeUnderstanding(round,true);
  expect(round.coverage!.finished).toBe(true);expect(round.coverage!.activePartId).toBeNull();
  expect(round.coverage!.parts.map(p=>understandingPartStatus(p.conversation))).toEqual(['checked','review','unvisited']);
 });
 it('resumes persisted per-part conversations and preserves them when the reading message is regrouped',()=>{
  let round=createWholeUnderstanding(parent,plan);round=updateWholePart(round,round.coverage!.activePartId!,complete);round=advanceWholeUnderstanding(round);
  const saved=JSON.parse(JSON.stringify({...parent,guidedDiscussions:[round]}));
  const fresh=prepareMessageUnderstanding({role:'model',text:'新消息',timestamp:1,skimUnderstanding:saved},'新消息',[1,2,3]);
  expect(savedUnderstandingDiscussions(fresh).find(s=>s.id===round.id)?.coverage?.parts[0].conversation.turns[0].text).toBe('这一部分已核对');
  const resumed=JSON.parse(JSON.stringify(round));expect(resumed.coverage.activePartId).toBe(resumed.coverage.parts[1].id);
  expect(resumed.coverage.parts[1].conversation.turns).toEqual([]);
 });
 it('never presents a complete phase without diagnostic evidence as checked',()=>{
  const part=createWholeUnderstanding(parent,plan).coverage!.parts[0].conversation;
  expect(understandingPartStatus({...part,phase:'complete'})).toBe('unvisited');
 });
});
