import { describe,it,expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { advanceReadingJob,claimReadingJob,jobIdFor,sourceObject,UnsupportedLecture } from './littleReading';
import { parseReadingCommand,verifyWorkerSignature,workerSignature } from './littleReadingApi';
import { StoreConflict,type ReadingStore,type Stored } from './littleReadingStore';
import type { ReadingJob,LittleArticle } from '../features/littleReading/model';
function memory(){
  let revision=0;const jobs=new Map<string,Stored<ReadingJob>>(),articles=new Map<string,LittleArticle>();
  const store:ReadingStore={session:async()=>({userId:'alice',fileName:'lecture.pdf',fileUrl:'https://firebasestorage.googleapis.com/v0/b/ai-tutor-647fd.firebasestorage.app/o/users%2Falice%2Fuploads%2Ftest.pdf',type:'file'}),
    get:async id=>jobs.has(id)?structuredClone(jobs.get(id)!):null,
    put:async(job,expected)=>{if((jobs.get(job.id)?.updateTime??null)!==expected)throw new StoreConflict();jobs.set(job.id,{value:structuredClone(job),updateTime:String(++revision)});},
    article:async a=>{if(!articles.has(a.id))articles.set(a.id,structuredClone(a));}};
  return {store,jobs,articles};
}
describe('background lecture articles',()=>{
  it('only reads the account-owned object on the fixed storage host',()=>{
    expect(sourceObject('https://firebasestorage.googleapis.com/v0/b/ai-tutor-647fd.firebasestorage.app/o/users%2Falice%2Fuploads%2Fx.pdf?token=private','alice')).toBe('users/alice/uploads/x.pdf');
    for(const u of ['https://example.com/x.pdf','https://firebasestorage.googleapis.com/v0/b/ai-tutor-647fd.firebasestorage.app/o/users%2Fbob%2Fuploads%2Fx.pdf','http://127.0.0.1/private'])expect(()=>sourceObject(u,'alice')).toThrow();
  });
  it('signs worker continuations for the exact owner and command',()=>{
    const payload=JSON.stringify({sessionId:'s',language:'en',target:3,worker:true});const signature=workerSignature('secret','alice',payload);
    expect(verifyWorkerSignature(signature,'secret','alice',payload)).toBe(true);
    expect(verifyWorkerSignature(signature,'secret','bob',payload)).toBe(false);
    expect(verifyWorkerSignature(signature,'secret','alice',payload+' ')).toBe(false);
    expect(()=>parseReadingCommand({sessionId:'../s',language:'en'})).toThrow();
    expect(()=>parseReadingCommand({sessionId:'s',language:'en',target:100})).toThrow();
  });
  it('leases suppress concurrent tabs and an expired lease can resume',async()=>{
    const {store}=memory();const [a,b]=await Promise.all([claimReadingJob(store,'s','en',3,100),claimReadingJob(store,'s','en',3,100)]);
    expect([a,b].filter(Boolean)).toHaveLength(1);
    expect(await claimReadingJob(store,'s','en',3,1000)).toBeNull();
    expect(await claimReadingJob(store,'s','en',3,300000)).not.toBeNull();
    expect(jobIdFor('s','en')).not.toBe(jobIdFor('s','zh-CN'));
  });
  it('persists the plan and draft but publishes only after evidence review; a new worker resumes',async()=>{
    const {store,jobs,articles}=memory();const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const bytes=Buffer.from(await pdf.save());
    const draft={title:'Could the body know first?',body:'Imagine a familiar everyday situation. '.repeat(30),pages:[1,2]};
    const outputs=[JSON.stringify({topics:[{title:draft.title,question:'why?',angle:'a full story',pages:[1,2]}]}),JSON.stringify(draft),JSON.stringify({...draft,body:'After checking the evidence, here is the story. '.repeat(30)})];
    const deps={load:async()=>bytes,model:async()=>({text:outputs.shift()!})};
    for(let i=0;i<3;i++){
      const claimed=await claimReadingJob(store,'s','en');expect(claimed).not.toBeNull();
      const again=await advanceReadingJob(store,claimed!,'alice','token','key',deps);
      expect(articles.size).toBe(i===2?1:0);expect(again).toBe(i<2);
    }
    expect(jobs.get(jobIdFor('s','en'))?.value.status).toBe('ready');
    expect([...articles.values()][0].body).toContain('After checking');
    expect(await claimReadingJob(store,'s','en')).toBeNull();
  });
  it('retries only the failed stage and retains published articles',async()=>{
    const {store,jobs,articles}=memory();const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
    const claimed=await claimReadingJob(store,'s','en');
    const deps={load:async()=>bytes,model:async()=>{throw new Error('model unavailable');}};
    for(let i=0;i<3;i++){
      const c=i===0?claimed:await claimReadingJob(store,'s','en');
      await advanceReadingJob(store,c!,'alice','token','key',deps);
    }
    const j=jobs.get(jobIdFor('s','en'))!.value;expect(j.status).toBe('failed');expect(j.attempts).toBe(3);expect(articles.size).toBe(0);
  });
  it('never calls the model for unsupported PDFs or a lost lease',async()=>{
    const {store,jobs}=memory();const claimed=await claimReadingJob(store,'s','en');let calls=0;
    await advanceReadingJob(store,claimed!,'alice','token','key',{load:async()=>{throw new UnsupportedLecture('Too large');},model:async()=>{calls++;return{text:''};}});
    expect(jobs.get(claimed!.id)!.value.status).toBe('unsupported');expect(calls).toBe(0);
    expect(await claimReadingJob(store,'s','en')).toBeNull();
    expect(await advanceReadingJob(store,claimed!,'alice','token','key')).toBe(false);
  });
});
