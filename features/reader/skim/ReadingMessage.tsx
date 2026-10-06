import { requestsChinese } from '@/shared/i18n/explanationTranslation';
import React, { useMemo } from 'react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowDown, CornerDownRight, RotateCcw, BookOpen } from 'lucide-react';
import { StudyTerms, StudyTermButton, StudyTermText } from '@/features/reluctant/StudyTermPopover';
import { remarkStudyTerms } from '@/features/reluctant/studyTerms';
import type { AppLanguage } from '@/types';
import { parseReadingMedia, readingBlocks, readingAidBlockIndex, missingReadingAidBlocks, type ReadingMedia, type ReadingAid } from './readingAids';
import { SourceFigure } from './SourceFigure';
import './readingAids.css';

export function ReadingMessage({ text, media, components, pdfDataUrl, onPage, language, userRequest, preserveStoredContent = false }: {
  text:string; media?:ReadingMedia; components:Components; pdfDataUrl?:string; onPage?:(page:number)=>void; language:AppLanguage; userRequest?:string; preserveStoredContent?:boolean;
}) {
  const safe=useMemo(()=>parseReadingMedia(media,text,1,Number.MAX_SAFE_INTEGER,!!pdfDataUrl),[media,text,pdfDataUrl]);
  const renderers=useMemo<Components>(()=>({...components,span:({node,children})=>node?.properties?.['data-study-term']!==undefined
    ? <StudyTermButton index={Number(node.properties['data-study-term'])} showEnglish={node.properties['data-show-english']==='yes'}>{children}</StudyTermButton> : <span>{children}</span>}),[components]);
  // Group Markdown up to insertion points without changing the original prose.
  const layout=useMemo(()=>{
    const sourceBlocks=readingBlocks(text);
    const aids=safe.aids??[];
    const positions=aids.map(a=>readingAidBlockIndex(sourceBlocks,a.afterText));
    const missing=new Set(missingReadingAidBlocks(sourceBlocks,aids));
    const chunks:Array<{text:string;aids:ReadingAid[];missing:boolean}>=[];
    let pending='';
    sourceBlocks.forEach((block,index)=>{
      pending+=(pending?'\n\n':'')+block;
      const attached=aids.filter((_,i)=>positions[i]===index);
      if(attached.length||missing.has(index)){chunks.push({text:pending,aids:attached,missing:missing.has(index)});pending='';}
    });
    if(pending)chunks.push({text:pending,aids:[],missing:false});
    return {chunks,unplaced:aids.filter((_,i)=>positions[i]<0),missing:missing.size>0};
  },[text,safe.aids]);
  const en=language==='en';
  const missingNotice=layout.unplaced.length
    ? (en?'Some diagrams could not be placed here. See the supplementary diagrams at the end of this message.':'部分图解未能定位到正文，请查看本条讲解末尾的补充图解。')
    : (en?'The diagram mentioned here is unavailable. You can ask “Please explain the missing chain in words.”':'这里提到的图解未能显示。你可以追问“请用文字补充刚才缺失的链条”。');
  return <StudyTerms preserveContent={preserveStoredContent} terms={safe.terms} language={requestsChinese(userRequest) ? 'zh-CN' : language}><div className="reading-enriched">
    {layout.chunks.map((chunk,i)=><React.Fragment key={i}><ReactMarkdown enabled={!preserveStoredContent} userRequest={userRequest} language={language} skipHtml components={renderers} remarkPlugins={[remarkMath,remarkGfm,[remarkStudyTerms,safe.terms??[]]]} rehypePlugins={[rehypeKatex]}>{chunk.text}</ReactMarkdown>
      {chunk.aids.map((a,j)=><ReadingDiagram key={j} aid={a} pdfDataUrl={pdfDataUrl} onPage={onPage} language={language}/>)}
      {chunk.missing&&<p className="reading-aid-notice" role="status">{missingNotice}</p>}
    </React.Fragment>)}
    {layout.unplaced.length>0&&<section aria-label={en?'Supplementary diagrams':'补充图解'}><p className="reading-aid-notice">{en?'Supplementary diagrams · their position in the text could not be matched.':'补充图解 · 未能匹配正文位置，完整保留在这里。'}</p>{layout.unplaced.map((a,i)=><ReadingDiagram key={i} aid={a} pdfDataUrl={pdfDataUrl} onPage={onPage} language={language}/>)}</section>}
    {safe.unavailable&&!layout.missing&&<p className="reading-aid-notice" role="status">{en?'Some diagram data was incomplete or outside this reading range and could not be displayed. The explanation is kept; you can ask for a text explanation of the missing diagram.':'部分图解的数据不完整或不在本次阅读范围内，未能显示。正文已保留，可追问要求用文字补充缺失的图解。'}</p>}
  </div></StudyTerms>;
}

export function ReadingDiagram({aid:a,pdfDataUrl,onPage,language}:{aid:ReadingAid;pdfDataUrl?:string;onPage?:(p:number)=>void;language:AppLanguage}){
 const en=language==='en';
 const names={flow:en?'Process / mechanism':'过程与机制',parallel:en?'Parallel relationships':'并行关系',cycle:en?'Feedback loop':'反馈循环',structure:en?'Parts and hierarchy':'组成与层级',compare:en?'Compare the differences':'放在一起比较',figure:en?'From the source PDF':'原文图表'};
 const node=(i:number)=><div className="reading-aid-node"><strong><StudyTermText value={a.nodes![i].label}/></strong>{a.nodes![i].detail&&<p><StudyTermText value={a.nodes![i].detail}/></p>}</div>;
 const tree=(i:number):React.ReactNode=><div className="reading-aid-tree-node" key={i}>{node(i)}{a.nodes!.some((n,j)=>j>i&&n.parent===i)&&<div className="reading-aid-children">{a.nodes!.map((n,j)=>j>i&&n.parent===i?<div key={j}>{n.link&&<div className="reading-aid-link"><CornerDownRight size={16}/><StudyTermText value={n.link}/></div>}{tree(j)}</div>:null)}</div>}</div>;
 return <figure className={`reading-aid reading-aid--${a.kind}`}><figcaption><span>{names[a.kind]}{a.kind!=='figure'&&(en?' · Teaching schematic':' · 教学示意')}</span><h4><StudyTermText value={a.title}/></h4></figcaption>
 {a.kind==='figure'?<><SourceFigure source={pdfDataUrl} page={a.page!} title={a.title} language={language}/><p className="reading-aid-focus"><StudyTermText value={a.focus!}/></p>{onPage&&<button type="button" className="reading-aid-source" onClick={()=>onPage(a.page!)}><BookOpen size={15}/>{en?`Open source · page ${a.page}`:`对照原文 · 第 ${a.page} 页`}</button>}</>
 :a.kind==='compare'?<div className="reading-aid-table"><table><thead><tr><th>{en?'Compare':'比较什么'}</th>{a.columns!.map((c,i)=><th key={i}><StudyTermText value={c}/></th>)}</tr></thead><tbody>{a.rows!.map((r,i)=><tr key={i}><th scope="row"><StudyTermText value={r.label}/></th>{r.cells.map((c,j)=><td key={j}><StudyTermText value={c}/></td>)}</tr>)}</tbody></table></div>
 :a.kind==='structure'?tree(0)
 :a.kind==='parallel'?<>{node(0)}<div className="reading-aid-link">{en?'Parallel branches':'并行分支'}</div><div className="reading-aid-branches">{a.nodes!.slice(1).map((n,i)=><div key={i}><div className="reading-aid-link"><ArrowDown size={16}/><StudyTermText value={n.link||''}/></div>{node(i+1)}</div>)}</div></>
 :<div className="reading-aid-path">{a.nodes!.map((n,i)=><React.Fragment key={i}>{i>0&&<div className="reading-aid-link"><ArrowDown size={16}/><StudyTermText value={a.kind==='cycle'?a.nodes![i-1].link||'':n.link||''}/></div>}{node(i)}</React.Fragment>)}{a.kind==='cycle'&&<div className="reading-aid-return"><RotateCcw size={18}/><span><StudyTermText value={a.nodes!.at(-1)!.link!}/> → <StudyTermText value={a.nodes![0].label}/></span></div>}</div>}
 <p className="reading-aid-caption"><StudyTermText value={a.caption}/></p></figure>;
}
