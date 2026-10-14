import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, getUserSessions } from './firebase';
import { localGet, localPut } from './localWorkspace';
import { recentPdfs, type LittleArticle, type ReadingJob, type ReadingLanguage, type ReadingPosition } from '@/features/littleReading/model';
import { getCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import type { CloudSession } from '@/types';
const pending=new Map<string,Promise<void>>();
const cacheBucket=(uid:string,language:ReadingLanguage)=>`littleReading/${uid}/${language}`;
export function prepareLecture(user:User,sessionId:string,language:ReadingLanguage=getCurrentAppLanguage(),target=3):Promise<void> {
  const key=`${user.uid}:${sessionId}:${language}:${target}`;
  const existing=pending.get(key);if(existing)return existing;
  const operation=(async()=>{
    if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed.');
    const token=await user.getIdToken();
    const response=await fetch('/api/little-reading/prepare',{method:'POST',headers:{'Content-Type':'application/json','X-ClassSkip-Token':token},
      body:JSON.stringify({sessionId,language,target}),credentials:'same-origin',redirect:'error',keepalive:true,signal:AbortSignal.timeout(25_000)});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'文章准备未开始，请重试。');}
  })().finally(()=>pending.delete(key));pending.set(key,operation);return operation;
}
export async function prepareRecentLectures(user:User,language:ReadingLanguage):Promise<CloudSession[]> {
  const files=recentPdfs(await getUserSessions(user,{throwOnError:true}));
  // Prepare a small batch first; the remaining recent lectures are queued on subsequent visits.
  const snapshots=await getDocs(collection(db,'users',user.uid,'littleReadingJobs'));
  const jobs=snapshots.docs.flatMap(d=>{try{return [JSON.parse(d.data().payload) as ReadingJob];}catch{return [];}}).filter(j=>j.language===language);
  const eligible=files.filter(f=>!jobs.some(j=>j.sourceSessionId===f.id && (j.status==='ready'||j.status==='unsupported'||j.leaseUntil>Date.now())));
  const results=await Promise.allSettled(eligible.slice(0,2).map(f=>prepareLecture(user,f.id,language)));
  if(results.length && results.every(r=>r.status==='rejected'))throw (results[0] as PromiseRejectedResult).reason;
  return files;
}
export function watchLittleReading(user:User,files:CloudSession[],language:ReadingLanguage,
  onArticles:(a:LittleArticle[])=>void,onJobs:(j:ReadingJob[])=>void,onError:(e:Error)=>void,history:LittleArticle[]=[]):()=>void {
  const ids=recentPdfs(files).map(f=>f.id);
  if(!ids.length){onArticles(history);onJobs([]);return()=>{};}
  const articles=query(collection(db,'users',user.uid,'littleReadingArticles'),where('sourceSessionId','in',ids));
  const decode=<T>(payload:unknown):T|undefined=>{try{return typeof payload==='string'?JSON.parse(payload):undefined;}catch{return undefined;}};
  const stopArticles=onSnapshot(articles,s=>{
    if(auth.currentUser?.uid!==user.uid)return;
    const rows=s.docs.map(d=>decode<LittleArticle>(d.data().payload)).filter((a):a is LittleArticle=>!!a&&a.language===language);
    const merged=[...rows,...history.filter(old=>!rows.some(fresh=>fresh.id===old.id))];
    onArticles(merged);void localPut(cacheBucket(user.uid,language),'articles',merged).catch(()=>{});
  },onError);
  const stopJobs=onSnapshot(collection(db,'users',user.uid,'littleReadingJobs'),s=>{
    if(auth.currentUser?.uid!==user.uid)return;
    onJobs(s.docs.map(d=>decode<ReadingJob>(d.data().payload)).filter((j):j is ReadingJob=>!!j&&j.language===language&&ids.includes(j.sourceSessionId)));
  },onError);
  return()=>{stopArticles();stopJobs();};
}
export async function cachedArticles(uid:string,language:ReadingLanguage){return await localGet<LittleArticle[]>(cacheBucket(uid,language),'articles')??[];}
export async function loadReadArticles(user:User,language:ReadingLanguage,positions:Record<string,ReadingPosition>,currentId?:string):Promise<LittleArticle[]> {
  const ids=[...new Set([...(currentId?[currentId]:[]),...Object.values(positions).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,30).map(p=>p.articleId)])];
  const results=await Promise.all(ids.map(async id=>{
    if(!/^[a-f0-9]{64}-\d+$/.test(id))return undefined;
    const row=await getDoc(doc(db,'users',user.uid,'littleReadingArticles',id));
    if(!row.exists())return undefined;
    try{const a=JSON.parse(row.data().payload) as LittleArticle;return a.language===language?a:undefined;}catch{return undefined;}
  }));
  return results.filter((a):a is LittleArticle=>!!a);
}
export async function loadReadingPositions(user:User,language:ReadingLanguage):Promise<{positions:Record<string,ReadingPosition>;currentId?:string}> {
  const cached=await localGet<{positions:Record<string,ReadingPosition>;currentId?:string}>(cacheBucket(user.uid,language),'positions');
  if(!navigator.onLine)return cached??{positions:{}};
  const [progress,current]=await Promise.all([getDocs(collection(db,'users',user.uid,'littleReadingProgress')),
    getDoc(doc(db,'users',user.uid,'littleReadingState',language))]);
  const result={positions:Object.fromEntries(progress.docs.map(d=>[d.id,d.data() as ReadingPosition])),currentId:current.data()?.articleId as string|undefined};
  await localPut(cacheBucket(user.uid,language),'positions',result).catch(()=>{});return result;
}
export async function saveReadingPosition(user:User,article:LittleArticle,fraction:number,finished=false):Promise<ReadingPosition> {
  const position:ReadingPosition={articleId:article.id,fraction:Math.min(1,Math.max(0,fraction)),finished,updatedAt:Date.now()};
  const bucket=cacheBucket(user.uid,article.language);
  const cached=await localGet<{positions:Record<string,ReadingPosition>;currentId?:string}>(bucket,'positions')??{positions:{}};
  await localPut(bucket,'positions',{positions:{...cached.positions,[article.id]:position},currentId:article.id});
  if(auth.currentUser?.uid!==user.uid)throw new Error('Account changed.');
  await Promise.all([setDoc(doc(db,'users',user.uid,'littleReadingProgress',article.id),{...position,savedAt:serverTimestamp()},{merge:true}),
    setDoc(doc(db,'users',user.uid,'littleReadingState',article.language),{articleId:article.id,savedAt:serverTimestamp()},{merge:true})]);
  return position;
}
