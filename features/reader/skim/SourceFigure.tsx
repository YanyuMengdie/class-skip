import React,{useEffect,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Maximize2, X } from 'lucide-react';
import type { AppLanguage } from '@/types';

// Share only in memory; images are never written into messages or sent to another service.
const documents=new Map<string,{promise:Promise<PDFDocumentProxy>;refs:number;dispose:()=>void;timer?:ReturnType<typeof setTimeout>}>();
function acquire(source:string){
 let entry=documents.get(source);
 if(!entry){const data=Uint8Array.from(atob(source.slice(source.indexOf(',')+1)),c=>c.charCodeAt(0));const task=pdfjs.getDocument({data,isEvalSupported:false});entry={promise:task.promise,refs:0,dispose:()=>{void task.destroy();}};documents.set(source,entry);}
 clearTimeout(entry.timer);entry.refs++;const item=entry;
 return {promise:item.promise,release:()=>{item.refs--;if(!item.refs)item.timer=setTimeout(()=>{if(!item.refs){documents.delete(source);item.dispose();}},500);}};
}
function ExpandedFigure({url,title,onClose}:{url:string;title:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close();},[]);
 return <dialog className="reading-figure-dialog" ref={ref} aria-label={title} onClose={e=>{if(!e.currentTarget.open)onClose();}} onCancel={e=>{e.preventDefault();onClose();}}><button type="button" autoFocus onClick={onClose} aria-label="Close / 关闭"><X size={22}/></button><img src={url} alt={title}/></dialog>;
}
export function SourceFigure({source,page,title,language}:{source?:string;page:number;title:string;language:AppLanguage}){
 const host=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false);const [url,setUrl]=useState('');const [error,setError]=useState(false);const [expanded,setExpanded]=useState(false);const en=language==='en';
 useEffect(()=>{if(!host.current)return;if(!('IntersectionObserver' in window)){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'300px'});observer.observe(host.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{setUrl('');setError(false);setExpanded(false);if(!visible)return;if(!source?.startsWith('data:application/pdf')||!source.includes(';base64,')){setError(true);return;}
 let live=true;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
 let handle:ReturnType<typeof acquire>;
 try { handle=acquire(source); } catch { setError(true); return; }
 void handle.promise.then(async pdf=>{if(!live)return;if(page<1||page>pdf.numPages)throw Error('Page unavailable');const p=await pdf.getPage(page);if(!live)return;const size=p.getViewport({scale:1});const viewport=p.getViewport({scale:Math.min(2,1200/size.width)});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;render=p.render({canvas,canvasContext:canvas.getContext('2d')!,viewport});await render.promise;if(live)setUrl(canvas.toDataURL('image/webp',.9));}).catch(()=>{if(live)setError(true);});
 return()=>{live=false;render?.cancel();handle.release();};},[visible,source,page]);
 return <div ref={host} className="reading-source-figure">{url?<><img src={url} alt={`${title} · ${en?'original PDF page':'原 PDF 第'} ${page} ${en?'':'页'}`}/><button type="button" className="reading-aid-source" onClick={()=>setExpanded(true)}><Maximize2 size={15}/>{en?'Enlarge source page':'放大原图所在页'}</button>{expanded&&<ExpandedFigure url={url} title={title} onClose={()=>setExpanded(false)}/>}</>:<p role="status">{error?(en?'Source preview unavailable. Open the original page below.':'暂时无法显示原图，请通过下方页码查看原文。'):(en?'Loading source page…':'正在显示原图所在页…')}</p>}</div>;
}
