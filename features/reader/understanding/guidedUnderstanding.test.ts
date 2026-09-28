import { describe, it, expect } from 'vitest';
import { createGuidedUnderstanding, savedUnderstandingDiscussions, isUnderstandingNonAnswer } from './guidedUnderstanding';
import { buildUnderstandingPrompt, normalizeUnderstandingResult, type UnderstandingSession } from './readingUnderstanding';
import { prepareMessageUnderstanding } from './understandingScope';
import type { ChatMessage } from '@/types';
const parent: UnderstandingSession = { version: 1, id: 'old', topic: '旧主题', sourceText: '原讲解，范围 A。', pageRefs: [3], turns: [{id:'old-answer',role:'model',text:'已保存的旧答案',timestamp:1}], mode:'acquisition',phase:'explanation',createdAt:1 };
describe('guided help preserves history and scope', () => {
 it('whole passage starts a separate empty discussion with no legacy reasoning', () => {
  const before=JSON.stringify(parent); const fresh=createGuidedUnderstanding(parent);
  expect(fresh.sourceText).toBe(parent.sourceText); expect(fresh.turns).toEqual([]);expect(fresh.pageRefs).toEqual([3]);expect(fresh.entryPath).toBe('whole');expect(JSON.stringify(parent)).toBe(before);
 });
 it('specific help uses only the selected topic and its pages', () => {
  const fresh=createGuidedUnderstanding(parent,{id:'a',title:'A',summary:'仅 A 的内容',pageRefs:[3]});
  expect(fresh.sourceText).toBe('仅 A 的内容');expect(fresh.entryPath).toBe('specific');
  const quoted=createGuidedUnderstanding(parent,undefined,'这句话为什么成立');expect(quoted.focusQuestion).toBe('这句话为什么成立');expect(quoted.sourceText).toBe(parent.sourceText);
 });
 it('survives serialization and source regrouping without losing earlier branches', () => {
  const guided={...createGuidedUnderstanding(parent),turns:parent.turns};
  const saved=JSON.parse(JSON.stringify({...parent,guidedDiscussions:[guided]}));
  const migrated=prepareMessageUnderstanding({role:'model',text:'新的讲解',timestamp:1,skimUnderstanding:saved} as ChatMessage,'新的讲解',[3]);
  expect(savedUnderstandingDiscussions(migrated).map(x=>x.id)).toEqual(['old',guided.id]);
 });
 it('recognizes not knowing without treating a reasoned answer as a non-answer', () => {
  for(const text of ['不知道','我还是没懂。',"I don't understand"] ) expect(isUnderstandingNonAnswer(text)).toBe(true);
  expect(isUnderstandingNonAnswer('我不知道原因，但我觉得删掉就不能再用了')).toBe(false);
 });
});
