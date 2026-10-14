import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import { ProductionAuthError, requireProductionUser } from './productionAuth.js';
import { createReadingStore } from './littleReadingStore.js';
import { advanceReadingJob, claimReadingJob, sourceObject } from './littleReading.js';
import type { ReadingLanguage } from '../features/littleReading/model.js';

type Request=IncomingMessage & {body?:unknown};
export function workerSignature(key:string,uid:string,body:string):string {
  return createHmac('sha256',key).update(`class-skip-little-reading-worker:v1:${uid}:${body}`).digest('hex');
}
export function verifyWorkerSignature(signature:unknown,key:string,uid:string,body:string):boolean {
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(workerSignature(key,uid,body),'hex'));
}
export function parseReadingCommand(raw:unknown):{sessionId:string;language:ReadingLanguage;target:number;worker:boolean} {
  const v=typeof raw==='string'?JSON.parse(raw):raw;
  if(!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!['sessionId','language','target','worker'].includes(k))
    || typeof v.sessionId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v.sessionId)
    || !['zh-CN','en'].includes(v.language) || ![3,6].includes(v.target??3)
    || v.worker!==undefined && typeof v.worker!=='boolean')throw new Error('Invalid reading request.');
  return {sessionId:v.sessionId,language:v.language,target:v.target??3,worker:v.worker===true};
}
export function littleReadingHandler(options:{key?:()=>string;origin?:()=>string;schedule?:(promise:Promise<unknown>)=>void}={}) {
  return async(req:Request,res:ServerResponse)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    const send=(status:number,data:unknown)=>{if(!res.destroyed){res.statusCode=status;res.end(JSON.stringify(data));}};
    if(req.method!=='POST')return send(405,{error:'Use POST.'});
    try {
      const key=options.key?.()??process.env.GEMINI_API_KEY??'';
      if(!key.trim())return send(503,{error:'文章准备服务尚未配置。'});
      const uid=await requireProductionUser(req),token=String(req.headers['x-classskip-token']);
      const encoded=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      if(!encoded || Buffer.byteLength(encoded)>4096)return send(400,{error:'Invalid reading request.'});
      const command=parseReadingCommand(req.body);
      if(command.worker && !verifyWorkerSignature(req.headers['x-reading-worker'],key,uid,encoded))return send(403,{error:'Invalid worker signature.'});
      const store=createReadingStore(uid,token),source=await store.session(command.sessionId);
      if(!source || source.userId!==uid)return send(404,{error:'Lecture not found.'});
      try{sourceObject(source.fileUrl,uid);}catch{return send(422,{error:'这份旧资料的存储地址不支持自动准备，请重新上传 PDF。'});}
      const job=await claimReadingJob(store,command.sessionId,command.language,command.target);
      if(!job)return send(200,{accepted:true,alreadyScheduled:true});
      const work=(async()=>{
        const again=await advanceReadingJob(store,job,uid,token,key);
        if(!again)return;
        // Persist the next step before dispatching it. A dropped dispatch is recoverable from the job lease.
        const origin=options.origin?.()??`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL||'class-skip-flash.vercel.app'}`;
        const u=new URL(origin);
        if(options.origin===undefined && (u.protocol!=='https:' || !u.hostname.endsWith('.vercel.app')))throw new Error('Invalid worker origin.');
        const body=JSON.stringify({...command,worker:true});
        const next=await fetch(`${u.origin}/api/little-reading/prepare`,{method:'POST',headers:{'Content-Type':'application/json',
          'X-ClassSkip-Token':token,'X-Reading-Worker':workerSignature(key,uid,body)},body,redirect:'error',signal:AbortSignal.timeout(20_000)});
        if(!next.ok)throw new Error('Next article step was not scheduled.');
      })().catch(()=>{console.warn('[Read a little] Preparation interrupted; persisted job can resume.');});
      (options.schedule??waitUntil)(work);
      return send(202,{accepted:true,jobId:job.id});
    }catch(e){return send(e instanceof ProductionAuthError?e.status:400,{error:e instanceof ProductionAuthError?e.message:'无法开始文章准备，请稍后重试。'});}
  };
}
