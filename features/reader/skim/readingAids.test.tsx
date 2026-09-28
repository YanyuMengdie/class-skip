import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import {parseReadingMedia,parseReadingResponse,readingBlocks,readingAidBlockIndex,type ReadingAid} from './readingAids';
import {ReadingMessage} from './ReadingMessage';
import {createSkimExplanationState,getActiveSkimExplanationVariant,withActiveSkimExplanationVariant} from './skimExplanation';
vi.mock('./SourceFigure',()=>({SourceFigure:()=> <div>Original PDF</div>}));
const text='第一段：身体和情绪有不同的关系。\n\n接着解释证据。';
const base={title:'关系',afterText:'第一段：身体和情绪有不同的关系。',caption:'教学示意。'};
const aid:ReadingAid={...base,kind:'parallel',nodes:[{label:'看到刺激',detail:''},{label:'身体反应',detail:''},{label:'情绪感受',detail:''}]};
const terms=[{term:'身体',english:'body',explanation:'这里指身体反应。'}];
describe('optional reading aids',()=>{
 it('accepts a prose-only response and does not invent media',()=>{expect(parseReadingResponse(JSON.stringify({messageMarkdown:text}),1,4,true)).toEqual({text,media:{}});expect(parseReadingMedia(undefined,text)).toEqual({});});
 it('flags unsafe figures and preserves unplaced valid diagrams',()=>{
  const figure={...base,kind:'figure',page:5,focus:'两组差异'};
  expect(parseReadingMedia({aids:[figure]},text,1,4,true)).toEqual({unavailable:true});
  expect(parseReadingMedia({aids:[figure]},text,1,8,false)).toEqual({unavailable:true});
  expect(parseReadingMedia({aids:[{...aid,afterText:'不存在。'}]},text).aids).toHaveLength(1);
  expect(parseReadingMedia({aids:[figure]},text,5,8,true).aids?.[0].page).toBe(5);
 });
 it('drops malformed optional aids while retaining valid teaching and terms',()=>{
  const result=parseReadingResponse(JSON.stringify({messageMarkdown:text,terms,aids:[{...aid,kind:'compare',columns:['one','two'],rows:[{label:'bad',cells:['one']}]},aid]}),1,3,true);
  expect(result.text).toBe(text);expect(result.media.aids).toHaveLength(1);expect(result.media.terms?.[0].english).toBe('body');
 });
 it('requires a valid hierarchy and an explicit feedback edge',()=>{
  expect(parseReadingMedia({aids:[{...aid,kind:'structure',nodes:[{label:'a',detail:''},{label:'b',detail:'',parent:2}]}]},text)).toEqual({unavailable:true});
  expect(parseReadingMedia({aids:[{...aid,kind:'cycle'}]},text)).toEqual({unavailable:true});
  expect(parseReadingMedia({aids:[{...aid,kind:'structure',nodes:[{label:'a',detail:''},{label:'b',detail:'',parent:0}]}]},text).aids).toHaveLength(1);
 });
 it('preserves fenced code and tables when identifying insertion points',()=>{
  expect(readingBlocks('start\n\n```js\nlet x=1;\n\nx++;\n```\n\n| a | b |\n| - | - |\n| c | d |')).toHaveLength(3);
 });
 it('renders full parallel branches in the relevant paragraph and terms without step controls',()=>{
  const html=renderToStaticMarkup(<ReadingMessage text={text} media={{aids:[aid],terms}} components={{}} language="zh-CN"/>);
  expect(html).toContain('reading-aid-branches');expect(html).toContain('情绪感受');expect(html).toContain('study-term');expect(html).not.toContain('下一步');expect(html.indexOf('reading-aid')).toBeLessThan(html.indexOf('接着解释证据'));
 });
 it.each(['flow','cycle','structure'] as const)('renders the whole %s without reveal controls',kind=>{
  const nodes=[{label:'整体',detail:'起点'},{label:'部分',detail:'下一项',parent:0,link:'形成'},{label:'结果',detail:'最后一项',parent:1,link:'反馈'}];
  const html=renderToStaticMarkup(<ReadingMessage text={text} media={{aids:[{...base,kind,nodes}]}} components={{}} language="zh-CN"/>);
  expect(html).toContain('最后一项');expect(html).not.toContain('<button');
  if(kind==='cycle')expect(html).toContain('reading-aid-return');
  if(kind==='structure')expect(html).toContain('reading-aid-children');
 });
 it('keeps metadata through JSON storage and selects the matching variant only',()=>{
  const draft={responseKind:'explanation' as const,messageMarkdown:text,readingMedia:{aids:[aid]},spineItems:[],coveredSpineItemIds:[],deferredSpineItemIds:[],pageRefs:[1]};
  const state=createSkimExplanationState(draft,'normal');state.variants['normal-interesting']={...state.variants['normal-standard']!,key:'normal-interesting',style:'interesting',readingMedia:{},messageMarkdown:'另一种讲法。'};
  const msg=JSON.parse(JSON.stringify({role:'model',text,timestamp:1,skimExplanation:state}));
  expect(getActiveSkimExplanationVariant(msg)?.readingMedia?.aids?.[0]).toEqual(aid);
  expect(getActiveSkimExplanationVariant(withActiveSkimExplanationVariant(msg,'normal-interesting'))?.readingMedia).toEqual({});
 });
});


describe('reading diagram recovery',()=>{
 const introduction='这一现代实验揭示的认知加工机制可以梳理为如下递进链条：';
 const flow={...aid,kind:'flow' as const,afterText:introduction};
 it.each([
   `**${introduction}**`,
   introduction.replace('：',':'),
   introduction.replace('认知加工','认知\n加工'),
   introduction.replace('认知加工','认知<br/>加工'),
 ])('places a diagram despite presentation differences: %s', intro=>{
   const body=intro+'\n\n## Part 3：下一部分';
   const parsed=parseReadingMedia({aids:[flow]},body);
   const html=renderToStaticMarkup(<ReadingMessage text={body} media={parsed} components={{}} language="zh-CN"/>);
   expect(html).toContain('reading-aid--flow');
   expect(html.indexOf('<figure')).toBeLessThan(html.indexOf('Part 3'));
   expect(html).not.toContain('未能');
 });
 it('accepts null or empty optional fields without inventing content',()=>{
   const parsed=parseReadingMedia({aids:[{...flow,caption:null,nodes:[{label:'A',detail:null,link:null},{label:'B',link:''}]}]},introduction);
   expect(parsed.aids?.[0].nodes).toEqual([{label:'A',detail:''},{label:'B',detail:''}]);
   expect(parsed.unavailable).toBeUndefined();
 });
 it.each(['不匹配的位置',null])('keeps unplaced diagrams visible after saving/reloading: %s',afterText=>{
   const parsed=JSON.parse(JSON.stringify(parseReadingMedia({aids:[{...flow,afterText}]},text)));
   const html=renderToStaticMarkup(<ReadingMessage text={text} media={parsed} components={{}} language="zh-CN"/>);
   expect(html).toContain('补充图解');expect(html).toContain('reading-aid--flow');
   expect(html.indexOf('<figure')).toBeGreaterThan(html.indexOf('接着解释证据'));
 });
 it('does not guess among repeated anchors or match code',()=>{
   expect(readingAidBlockIndex([introduction,introduction],introduction)).toBe(-1);
   expect(readingAidBlockIndex(['```txt\n'+introduction+'\n```'],introduction)).toBe(-1);
 });
 it('flags a dangling chain introduction before the next section without generating a chain',()=>{
   const body=introduction+'\n\n---\n\n## Part 3';
   const html=renderToStaticMarkup(<ReadingMessage text={body} media={{}} components={{}} language="zh-CN"/>);
   expect(html).toContain('这里提到的图解未能显示');expect(html).not.toContain('<figure');
   expect(html.indexOf('图解未能显示')).toBeLessThan(html.indexOf('Part 3'));
 });
 it('leaves a prose chain or table following the introduction alone',()=>{
   for(const content of ['刺激 → 反应 → 判断。','- 刺激\n- 反应','| 一 | 二 |\n| -- | -- |\n| A | B |']){
     const html=renderToStaticMarkup(<ReadingMessage text={introduction+'\n\n'+content} media={{}} components={{}} language="zh-CN"/>);
     expect(html).not.toContain('reading-aid-notice');
   }
 });
 it('retains a visible unavailable marker across repeated parsing/storage',()=>{
   const parsed=parseReadingMedia({aids:[{...flow,nodes:[]}]},text);
   const html=renderToStaticMarkup(<ReadingMessage text={text} media={JSON.parse(JSON.stringify(parsed))} components={{}} language="zh-CN"/>);
   expect(html).toContain('部分图解的数据不完整');expect(html).not.toContain('<figure');
 });
});
