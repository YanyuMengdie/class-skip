import { describe,expect,it } from 'vitest';
import { parseArticle,parsePlan,recentPdfs,selectArticle,type LittleArticle } from './model';
const article=(id:string,jobId:string,sequence:number):LittleArticle=>({id,jobId,sequence,title:id,body:'body',sourceSessionId:jobId,sourceName:'lecture.pdf',language:'en',pages:[1],nextTitle:'next',createdAt:100-sequence});
describe('spare-time reading feed',()=>{
  it('resumes the saved article rather than jumping to a new upload',()=>{
    const a=article('old','a',0),b={...article('new','b',0),createdAt:200};
    expect(selectArticle([b,a],{},'old')?.id).toBe('old');
  });
  it('continues the same story sequence and changes lecture when requested',()=>{
    const rows=[article('a0','a',0),article('a1','a',1),article('b0','b',0)];
    expect(selectArticle(rows,{},'a0','next')?.id).toBe('a1');
    expect(selectArticle(rows,{},'a0','change')?.id).toBe('b0');
    expect(selectArticle(rows,{a1:{articleId:'a1',fraction:1,finished:true,updatedAt:0}},'a0','next')?.id).toBe('b0');
  });
  it('limits preparation to ten newest PDFs, not last opened or folders',()=>{
    const files=Array.from({length:12},(_,i)=>({type:'file',fileName:`${i}.pdf`,createdAt:{seconds:i}}));
    expect(recentPdfs([...files,{type:'folder',fileName:'folder.pdf',createdAt:{seconds:100}}]).map(f=>f.fileName)).toEqual(['11.pdf','10.pdf','9.pdf','8.pdf','7.pdf','6.pdf','5.pdf','4.pdf','3.pdf','2.pdf']);
  });
  it('rejects invented source pages and duplicate topics',()=>{
    const t={title:'one',question:'why',pages:[1,4],angle:'story'};
    expect(()=>parsePlan(JSON.stringify({topics:[t]}),3)).toThrow();
    expect(()=>parsePlan(JSON.stringify({topics:[{...t,pages:[1]},{...t,pages:[2]}]}),3)).toThrow();
  });
  it('does not publish incomplete articles, unseen citations or Chinese text in English mode',()=>{
    const a={title:'story',body:'A complete narrative. '.repeat(50),pages:[2]};
    expect(()=>parseArticle(JSON.stringify(a),3,[1],'en')).toThrow('unread');
    expect(()=>parseArticle(JSON.stringify({...a,pages:[1],body:'只有一小段。'}),3,[1],'zh-CN')).toThrow('incomplete');
    expect(()=>parseArticle(JSON.stringify({...a,pages:[1],body:'这是一篇中文故事。'.repeat(100)}),3,[1],'en')).toThrow('language');
  });
});
