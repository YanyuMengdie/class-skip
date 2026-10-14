import { watchLibraryMetadata } from '@/services/libraryArchiveService';
import { isArchived, activeLibraryItems } from '@/features/library/archive';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, BookOpen, RefreshCw } from 'lucide-react';
import type { CloudSession } from '@/types';
import { getUserSessions } from '@/services/firebase';
import { isCloudUser, type WorkspaceUser } from '@/services/workspaceUser';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { cachedArticles, loadReadArticles, loadReadingPositions, prepareLecture, prepareRecentLectures, saveReadingPosition, watchLittleReading } from '@/services/littleReadingService';
import { recentPdfs, selectArticle, type LittleArticle, type ReadingJob, type ReadingPosition } from './model';
import './littleReading.css';
import { ReadingRoomScenery } from './ReadingRoomScenery';

export function LittleReadingPage({user,onBack,onLogin,onUseCloud,cloudAvailable,onSource}: {
  user:WorkspaceUser;onBack:()=>void;onLogin:()=>void;onUseCloud:()=>void;cloudAvailable:boolean;
  onSource:(session:CloudSession,page:number)=>void;
}) {
  const {language,text}=useAppLanguage();
  const [articles,setArticles]=useState<LittleArticle[]>([]),[files,setFiles]=useState<CloudSession[]>([]),[jobs,setJobs]=useState<ReadingJob[]>([]);
  const [positions,setPositions]=useState<Record<string,ReadingPosition>>({}),[currentId,setCurrentId]=useState<string>();
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[saveError,setSaveError]=useState(false),[retry,setRetry]=useState(0);
  const [historyOpen,setHistoryOpen]=useState(false);
  const essayRef=useRef<HTMLElement|null>(null),pageRef=useRef<HTMLDivElement|null>(null);
  const dirty=useRef(false),fraction=useRef(0),saveChain=useRef(Promise.resolve());
  const cursorRef=useRef<LittleArticle|undefined>(undefined),positionRef=useRef(positions);
  positionRef.current=positions;
  const selected=articles.find(a=>a.id===currentId);
  cursorRef.current=selected;
  useEffect(()=>{
    let active=true,stop=()=>{},stopMeta=()=>{};
    setArticles([]);setJobs([]);setFiles([]);setCurrentId(undefined);setPositions({});setLoading(true);setError('');setSaveError(false);
    if(!isCloudUser(user)){setLoading(false);return;}
    const init=async()=>{
      const cached=await cachedArticles(user.uid,language).catch(()=>[]);

      const progress=await loadReadingPositions(user,language);
      if(!active)return;
      setPositions(progress.positions);setCurrentId(progress.currentId);
      // Resume a cached, already-read story offline. Unread cached recommendations wait for archive metadata.
      const readCache=cached.filter(a=>a.id===progress.currentId||progress.positions[a.id]);
      setArticles(readCache); if(readCache.some(a=>a.id===progress.currentId))setLoading(false);
      const loaded=await getUserSessions(user,{throwOnError:true});
      if(!active)return;setFiles(loaded);
      // A deleted PDF never stays in the active feed just because its article was cached locally.
      setArticles(cached.filter(x=>loaded.some(f=>f.id===x.sourceSessionId && (!isArchived(f, loaded) || x.id===progress.currentId || progress.positions[x.id]))));
      const history=(await loadReadArticles(user,language,progress.positions,progress.currentId)).filter(a=>loaded.some(f=>f.id===a.sourceSessionId));
      if(!active)return;
      stop=watchLittleReading(user,loaded,language,a=>{if(active)setArticles(a);},j=>{if(active)setJobs(j);},()=>{if(active)setError(text('云端暂时连接不上，已缓存的文章仍可阅读。','Cloud connection unavailable. Cached articles are still readable.'));},history);
      stopMeta=watchLibraryMetadata(user, rows=>{if(active)setFiles(rows);},()=>{});
      setLoading(false);
      await prepareRecentLectures(user,language);
    };
    void init().catch(e=>{if(active)setError(navigator.onLine?(e instanceof Error?e.message:text('准备暂时中断，请重试。','Preparation was interrupted. Please retry.')):text('当前离线，可以继续读已缓存的文章。','You are offline. You can continue cached articles.'));}).finally(()=>{if(active)setLoading(false);});
    const online=()=>setRetry(n=>n+1);window.addEventListener('online',online);
    return()=>{active=false;stop();stopMeta();window.removeEventListener('online',online);};
  },[user.uid,language,retry]);
  useEffect(()=>{
    if(loading || selected || !articles.length)return;
    const article=selectArticle(articles.filter(a=>files.some(f=>f.id===a.sourceSessionId&&!isArchived(f,files))),positions,currentId);if(article)setCurrentId(article.id);
  },[articles,currentId,loading,files]);
  useEffect(()=>{
    if(!selected)return;
    dirty.current=false;fraction.current=positionRef.current[selected.id]?.fraction??0;
    persist(selected,fraction.current,positionRef.current[selected.id]?.finished??false);
    const frame=requestAnimationFrame(()=>{
      const essay=essayRef.current;if(!essay)return;
      const top=window.scrollY+essay.getBoundingClientRect().top;
      window.scrollTo({top:Math.max(0,top+fraction.current*Math.max(0,essay.offsetHeight-window.innerHeight+120)-100),behavior:'instant'});
    });
    return()=>cancelAnimationFrame(frame);
  },[selected?.id]);
  const persist=(article:LittleArticle,value:number,finished:boolean)=>{
    if(!isCloudUser(user))return;
    const p={articleId:article.id,fraction:value,finished,updatedAt:Date.now()};
    setPositions(old=>({...old,[article.id]:p}));
    // Serialize writes on this page so a late response cannot restore the previous article's cursor.
    saveChain.current=saveChain.current.catch(()=>{}).then(async()=>{
      try{await saveReadingPosition(user,article,value,finished);setSaveError(false);}catch{setSaveError(true);}
    });
  };
  const flush=()=>{const article=cursorRef.current;if(article&&dirty.current){dirty.current=false;persist(article,fraction.current,positionRef.current[article.id]?.finished??false);}};
  const flushRef=useRef(flush);flushRef.current=flush;
  useEffect(()=>{
    const scroll=()=>{const essay=essayRef.current;if(!essay || !cursorRef.current)return;
      const top=essay.getBoundingClientRect().top+window.scrollY;
      fraction.current=Math.min(1,Math.max(0,(window.scrollY-top+100)/Math.max(1,essay.offsetHeight-window.innerHeight+120)));dirty.current=true;};
    const hidden=()=>{if(document.visibilityState==='hidden')flushRef.current();};
    window.addEventListener('scroll',scroll,{passive:true});document.addEventListener('visibilitychange',hidden);
    const timer=setInterval(()=>flushRef.current(),4000);
    return()=>{clearInterval(timer);window.removeEventListener('scroll',scroll);document.removeEventListener('visibilitychange',hidden);flushRef.current();};
  },[user.uid,language]);
  const change=(mode:'next'|'change')=>{
    if(!selected)return;
    if(mode==='next')persist(selected,1,true);else flush();
    const next=selectArticle(articles.filter(a=>files.some(f=>f.id===a.sourceSessionId&&!isArchived(f,files))),{...positions,[selected.id]:{articleId:selected.id,fraction:1,finished:mode==='next',updatedAt:Date.now()}},selected.id,mode);
    if(next && next.id!==selected.id){persist(next,positions[next.id]?.fraction??0,positions[next.id]?.finished??false);setCurrentId(next.id);}
    else if(isCloudUser(user)){
      const job=jobs.find(j=>j.id===selected.jobId);
      if(job && source && !isArchived(source,files) && job.completed<job.plan.length && job.target<6)void prepareLecture(user,job.sourceSessionId,language,6).catch(()=>setError(text('后续文章准备未开始，请重试。','Could not prepare more articles. Please retry.')));
      setError(text('这一批读完了，后续文章准备好后会出现在这里。也可以回看读过的文章。','You have reached the end of the ready articles. More will appear here when ready. You can also revisit your reading history.'));
    }
  };
  // Advance through recent PDFs in small batches while the reader is open; each accepted job continues server-side.
  useEffect(()=>{
    if(!isCloudUser(user)||loading||!files.length)return;
    const active=jobs.filter(j=>j.leaseUntil>Date.now()||j.status==='queued').length;
    if(active>=2)return;
    const unseen=recentPdfs(files).filter(f=>!jobs.some(j=>j.sourceSessionId===f.id));
    if(!unseen.length)return;
    const timer=setTimeout(()=>void Promise.allSettled(unseen.slice(0,2-active).map(f=>prepareLecture(user,f.id,language))),2000);
    return()=>clearTimeout(timer);
  },[jobs,files,loading,user.uid,language]);
  useEffect(()=>{
    if(!isCloudUser(user))return;
    const timer=setInterval(()=>{
      const stalled=jobs.filter(j=>(j.status==='queued'||j.status==='working')&&j.leaseUntil<Date.now()&&files.some(f=>f.id===j.sourceSessionId&&!isArchived(f,files)));
      void Promise.allSettled(stalled.slice(0,2).map(j=>prepareLecture(user,j.sourceSessionId,language,j.target===6?6:3)));
    },45000);
    return()=>clearInterval(timer);
  },[jobs,files,user.uid,language]);
  const readyNext=selected?articles.find(a=>a.jobId===selected.jobId&&a.sequence===selected.sequence+1):undefined;
  const source=files.find(f=>f.id===selected?.sourceSessionId);
  const working=jobs.some(j=>(j.status==='working'||j.status==='queued')&&files.some(f=>f.id===j.sourceSessionId&&!isArchived(f,files)));
  return <div className="little-reading" ref={pageRef} data-preserve-language="true">
    <header className="little-reading-header"><button onClick={()=>{flush();onBack();}}><ArrowLeft size={17}/>{text('返回','Back')}</button>
      <span>{text('读一会儿','Read a little')}</span>
      <button disabled={!selected || articles.length<2} onClick={()=>change('change')}>{text('换一篇','Another story')}<RefreshCw size={15}/></button></header>
    <div className="little-reading-cozy-layout">
    <ReadingRoomScenery side="left" />
    <div className="little-reading-content">
    {!isCloudUser(user)?<main className="little-reading-empty"><BookOpen size={32}/><h1>{text('给这一点空闲，留一篇好读的。','A good story for a spare moment.')}</h1>
      <p>{text('登录后，从你上传的 lecture 中提前准备文章。手机和电脑都能接着读。','Sign in to read stories prepared from your lectures, and continue on your phone or computer.')}</p>
      <button className="little-reading-primary" onClick={cloudAvailable?onUseCloud:onLogin}>{text(cloudAvailable?'打开账号文章':'登录逃课神器',cloudAvailable?'Open account stories':'Sign in')}</button></main>
    :selected?<>
      <article className="little-reading-essay" ref={essayRef}>
        <div className="little-reading-meta"><span>{text('生活里的小问题','Everyday curiosities')}</span><span>{text('一小篇','A short read')} · {text('约','About')} {Math.max(1,Math.round(selected.body.length/(language==='en'?2400:450)))} {text('分钟','min')}</span></div>
        <h1>{selected.title}</h1>
        <div className="little-reading-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,img:({alt})=><span>{alt}</span>}}>{selected.body}</ReactMarkdown></div>
        <details className="little-reading-source"><summary>{text('这和我学过的什么有关？','Where did I learn about this?')}</summary>
          <p>{selected.sourceName}</p><div>{selected.pages.map(page=><button key={page} disabled={!source} onClick={()=>{flush();if(source)onSource(source,page);}}>{text(`第 ${page} 页`,`Page ${page}`)}</button>)}</div></details>
        <footer className="little-reading-next"><p>{text('顺着这件事，再看一点','Follow the story a little further')}</p>
          <button onClick={()=>change('next')}><span>{readyNext?.title||selected.nextTitle||text('接着看','Keep reading')}</span><ArrowRight size={22}/></button>
          <div><span>{text('看到这里也刚好。','This is a good place to pause, too.')}</span><button onClick={()=>change('change')}>{text('换个话题','Something different')}</button></div>
        </footer>
      </article>
      <div className="little-reading-status" role="status">{saveError&&<span>{text('位置已保存在本机，联网后会重试同步。','Your place is saved on this device. Cloud sync will retry when connected.')}</span>}{error&&<span>{error} <button onClick={()=>setRetry(n=>n+1)}>{text('重试','Retry')}</button></span>}</div>
      <div className="little-reading-history"><button onClick={()=>setHistoryOpen(!historyOpen)}>{text('读过的文章','Reading history')}</button>{historyOpen&&<div>{articles.filter(a=>positions[a.id]).map(a=><button key={a.id} onClick={()=>{flush();persist(a,positions[a.id]?.fraction??0,positions[a.id]?.finished??false);setCurrentId(a.id);setHistoryOpen(false);}}>{a.title}</button>)}</div>}</div>
    </>:<main className="little-reading-empty" aria-live="polite"><BookOpen size={32}/><h1>{loading?text('正在翻开…','Opening…'):working?text('第一篇正在准备。','Your first story is being prepared.'):text('给这一点空闲，留一篇好读的。','A good story for a spare moment.')}</h1>
      <p>{loading?text('先找已经准备好的文章。','Looking for a ready story.'):working?text('准备好后会直接出现在这里。你可以先离开，后台会继续。','It will appear here when ready. You can leave while preparation continues.'):activeLibraryItems(files).some(f=>f.type==='file')?text('从最近的 lecture 开始准备，写好一篇就能读。','We will start with your recent lectures. Each story becomes readable as soon as it is ready.'):text('先在资料库上传一份 PDF，我们会提前准备文章。','Upload a lecture PDF in your library to start preparing stories.')}</p>
      {(error||jobs.some(j=>j.status==='failed'||j.status==='unsupported'))&&<p role="status">{error||text('部分资料暂未准备成功。自动准备支持 32 MB 以内的可读 PDF；已完成的文章会保留。','Some lectures could not be prepared. Automatic preparation supports readable PDFs up to 32 MB. Completed stories are retained.')}</p>}
      <button className="little-reading-primary" onClick={()=>setRetry(n=>n+1)}>{text('重试准备','Retry preparation')}</button><button onClick={onBack}>{text('回到书房','Back to the study')}</button></main>}
    </div>
    <ReadingRoomScenery side="right" />
    </div>
  </div>;
}
