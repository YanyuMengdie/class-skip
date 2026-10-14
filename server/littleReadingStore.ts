import type { ReadingJob, LittleArticle } from '../features/littleReading/model.js';
const ROOT = 'https://firestore.googleapis.com/v1/projects/ai-tutor-647fd/databases/(default)/documents';
type Field = { stringValue?: string; integerValue?: string; timestampValue?: string; nullValue?: null; booleanValue?: boolean };
export interface Stored<T> { value:T; updateTime:string; }
export class StoreConflict extends Error {}
export interface ReadingSource { userId: string; fileName: string; fileUrl: string; type: string; parentId?: string | null; archived?: boolean; }
export interface ReadingStore {
  session(id:string):Promise<ReadingSource | null>;
  get(id:string):Promise<Stored<ReadingJob> | null>;
  put(job:ReadingJob, expected:string | null):Promise<void>;
  article(article:LittleArticle):Promise<void>;
}
export function createReadingStore(uid:string, token:string):ReadingStore {
  const request = async (path:string, init:RequestInit = {}) => {
    const r=await fetch(`${ROOT}/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
    if(r.status===404){if(!init.method||init.method==='GET')return null;throw new StoreConflict('Reading record was removed.');}
    if(r.status===409 || r.status===412)throw new StoreConflict('Reading job changed.');
    if(!r.ok)throw new Error(`Reading storage unavailable (${r.status}).`);
    return r.json();
  };
  const base=`users/${encodeURIComponent(uid)}`;
  const fields=(value:unknown)=>({payload:{stringValue:JSON.stringify(value)}});
  return {
    async session(id){const d=await request(`sessions/${encodeURIComponent(id)}`);if(!d)return null;
      const f=d.fields as Record<string,Field>;return {userId:f.userId?.stringValue??'',fileName:f.fileName?.stringValue??'',fileUrl:f.fileUrl?.stringValue??'',type:f.type?.stringValue??'file',parentId:f.parentId?.stringValue??null,archived:f.archived?.booleanValue===true};},
    async get(id){const d=await request(`${base}/littleReadingJobs/${id}`);return d?{value:JSON.parse(d.fields.payload.stringValue),updateTime:d.updateTime}:null;},
    async put(job,expected){const condition=expected?`currentDocument.updateTime=${encodeURIComponent(expected)}`:'currentDocument.exists=false';
      await request(`${base}/littleReadingJobs/${job.id}?${condition}`,{method:'PATCH',body:JSON.stringify({fields:fields(job)})});},
    async article(article){
      // Immutable IDs and create-only writes make a retry unable to replace an already published article.
      try{await request(`${base}/littleReadingArticles/${article.id}?currentDocument.exists=false`,{method:'PATCH',body:JSON.stringify({fields:{...fields(article),sourceSessionId:{stringValue:article.sourceSessionId}}})});}
      catch(e){if(!(e instanceof StoreConflict))throw e;}
    },
  };
}
