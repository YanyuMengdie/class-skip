import { Type } from '@google/genai';
import { parseStudyTerms, studyTermsSchema, STUDY_TERMS_INSTRUCTION, type StudyTerm } from '@/features/reluctant/studyTerms';

export interface ReadingAid {
  kind: 'flow' | 'parallel' | 'cycle' | 'structure' | 'compare' | 'figure';
  title: string;
  /** Exact paragraph ending in this version of the explanation. */
  afterText: string;
  caption: string;
  nodes?: Array<{ label: string; detail: string; link?: string; parent?: number }>;
  columns?: string[];
  rows?: Array<{ label: string; cells: string[] }>;
  page?: number;
  focus?: string;
}
export interface ReadingMedia { aids?: ReadingAid[]; terms?: StudyTerm[]; unavailable?: boolean }
const str = { type: Type.STRING };
export const readingMediaSchema = {
  aids: { type: Type.ARRAY, maxItems: '3', items: {
    type: Type.OBJECT, properties: {
      kind: { type: Type.STRING, enum: ['flow','parallel','cycle','structure','compare','figure'] },
      title: str, afterText: str, caption: str,
      nodes: { type: Type.ARRAY, maxItems:'6', items: { type: Type.OBJECT, properties: { label:str, detail:str, link:str, parent:{type:Type.INTEGER} }, required:['label','detail'] } },
      columns: { type:Type.ARRAY, items:str },
      rows: { type:Type.ARRAY, items:{type:Type.OBJECT,properties:{label:str,cells:{type:Type.ARRAY,items:str}},required:['label','cells']} },
      page:{type:Type.INTEGER}, focus:str,
    }, required:['kind','title','afterText','caption'],
  } },
  terms: studyTermsSchema,
};
export const READING_MEDIA_INSTRUCTION = `
【按需辅助表达，不改变领读方法、深度、范围或推进节奏】
在同一响应中可选提供 aids 和 terms；messageMarkdown 仍是完整独立可读的原有讲解，不删去正文的重要信息，不改成卡片提纲。
先判断当前 module/part 和本条消息哪些内容真的需要视觉帮助。aids 可以为空；不设每个 module/part 的配图任务，不重复历史已经讲清的图。最多 3 项是上限，不是目标，通常 0–1 项。过渡、简短追问一般不需要图。
只有比较关键区别、梳理复杂关系，或重要原图承载了关键证据时才选用。图多、占页多不等于重要。装饰图、重复图和背景细节可不讲；只需一句的图在正文带过。
kind: flow=因果/步骤（必须真有顺序）；parallel=一个来源并行产生多个结果；cycle=最后一项确实反馈第一项；structure=组成或层级（不是时间顺序）；compare=对照同一维度；figure=主 PDF 的真实重要图。
每项 title<=100字，afterText 必须逐字复制本次 messageMarkdown 某段最后一句（含标点，不包含 Markdown 标记，<=300字），紧接该段展示；caption<=500字，准确说明关系或证据边界。不要写“点击下一步”，所有内容默认展开。
flow/parallel/cycle/structure 使用 2–6 个 nodes，label<=100字、detail<=300字、link<=100字。parallel 的第一项为共同来源，其他项为同时分支；cycle 最后一项必须写 link 说明它到第一项的反馈；structure 第一项是整体，后面每项的 parent 是前面某节点的从 0 开始索引（parent < 本节点索引），用于表示属于谁。其余关系不填 parent。
compare 使用 2–3 个 columns、2–5 行 rows，每行 label<=100字，cells 与列数一致且每格<=300字。不得混淆条件、忽略限定或用很宽的大表格。
figure 只引用主 PDF 当前范围中实际可见、值得讲的图，page 是应用内原 PDF 的页码（不是印刷页码，裁剪附件需换算）；focus<=500字，指出看哪部分、关键对比及它能/不能支持什么。应用显示该真实页面；不返回图片 URL，不编造图、实验数值、裁剪坐标。仅拿到文本或不确定图确实存在时，不生成 figure。无需逐个讲坐标、图例，除非它们影响结论。引用一张后不必继续讲本模块的其他图。
所有新增文字与正文同语言。示意是讲解辅助，不是实验数据。不得把相关关系画成因果，或把并行画成先后。
${STUDY_TERMS_INSTRUCTION}
`;
const short = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
/** Match visible paragraph text, not Markdown punctuation or presentation whitespace. */
export function normalizeReadingAnchor(value: string): string {
  return value.normalize('NFKC')
    .replace(/<br\s*\/?>|&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/。/g, '.')
    .replace(/\s+/g, '').trim();
}

/** Ambiguous or absent anchors go to a clearly labelled appendix, never a guessed paragraph. */
export function readingAidBlockIndex(blocks: string[], anchor: string): number {
  const normalized = normalizeReadingAnchor(anchor);
  if (!normalized) return -1;
  const matches = blocks.flatMap((block, index) => {
    if (/^\s*(`{3,}|~{3,}|\$\$)/.test(block)) return [];
    return normalizeReadingAnchor(block).endsWith(normalized) ? [index] : [];
  });
  return matches.length === 1 ? matches[0] : -1;
}

/** Only flag an explicit visual introduction followed by a new section or the end. */
export function missingReadingAidBlocks(blocks: string[], aids: ReadingAid[]): number[] {
  const placed = new Set(aids.map(aid => readingAidBlockIndex(blocks, aid.afterText)));
  return blocks.flatMap((block, index) => {
    if (placed.has(index) || /^\s*(`{3,}|~{3,}|\$\$)/.test(block)) return [];
    const line = normalizeReadingAnchor(block.split('\n').at(-1) || '');
    const introduction = /(?:如下|以下|下面|下方).{0,30}(?:链条|流程|示意图|图表|对照表|关系图).*[:：]$/.test(line)
      || /(?:链条|流程|示意图|图表|对照表|关系图).{0,15}(?:如下|以下|下面|下方).*[:：]$/.test(line)
      || /(?:following|below).{0,50}(?:diagram|flowchart|chain|table).*:$/i.test(line);
    const next = blocks[index + 1]?.trim();
    const boundary = !next || /^(?:#{1,6}\s|(?:[-*_]\s*){3,}$|(?:\*\*)?(?:Part|Module)\s*\d)/i.test(next);
    return introduction && boundary ? [index] : [];
  });
}

/** Invalid visuals carry a visible warning; valid but unplaced visuals remain recoverable. */
export function parseReadingMedia(value: unknown, text: string, start = 1, end = Number.MAX_SAFE_INTEGER, allowFigures = true): ReadingMedia {
  const input = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const aids: ReadingAid[] = [];
  let unavailable = input.unavailable === true;
  if (Array.isArray(input.aids)) for (const raw of input.aids.slice(0,3)) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as ReadingAid;
    if (!short(a.title,100) || (a.afterText != null && (typeof a.afterText !== 'string' || a.afterText.length > 300)) || (a.caption != null && (typeof a.caption !== 'string' || a.caption.length > 500))) continue;
    const base = {kind:a.kind,title:a.title,afterText:a.afterText ?? '',caption:a.caption ?? ''};
    if (a.kind === 'figure') {
      if (allowFigures && Number.isInteger(a.page) && a.page! >= start && a.page! <= end && short(a.focus,500)) aids.push({...base,page:a.page,focus:a.focus});
    } else if (a.kind === 'compare') {
      if (!Array.isArray(a.columns) || a.columns.length < 2 || a.columns.length > 3 || !a.columns.every(c=>short(c,100)) || !Array.isArray(a.rows) || a.rows.length < 2 || a.rows.length > 5) continue;
      if (!a.rows.every(r=>r && short(r.label,100) && Array.isArray(r.cells) && r.cells.length===a.columns!.length && r.cells.every(c=>short(c,300)))) continue;
      aids.push({...base,columns:a.columns,rows:a.rows.map(r=>({label:r.label,cells:r.cells}))});
    } else if (['flow','parallel','cycle','structure'].includes(a.kind)) {
      if (!Array.isArray(a.nodes) || a.nodes.length < 2 || a.nodes.length > 6 || !a.nodes.every((n,i)=>n && short(n.label,100) && (n.detail == null || (typeof n.detail==='string' && n.detail.length<=300)) && (n.link == null || n.link === '' || short(n.link,100)) && (a.kind!=='structure' || i===0 || (Number.isInteger(n.parent) && n.parent!>=0 && n.parent!<i)))) continue;
      if (a.kind==='cycle' && !a.nodes.at(-1)?.link) continue;
      aids.push({...base,nodes:a.nodes.map(n=>({label:n.label,detail:n.detail ?? '',...(n.link?{link:n.link}:{}),...(a.kind==='structure' && n.parent!==undefined?{parent:n.parent}:{})}))});
    }
  }
  if (Array.isArray(input.aids) && aids.length < input.aids.slice(0,3).length) unavailable = true;
  const terms=parseStudyTerms(input.terms);
  return {...(aids.length?{aids}:{}),...(terms?.length?{terms}:{}),...(unavailable?{unavailable:true}:{})};
}
export function readingBlocks(text: string): string[] {
  const blocks: string[]=[]; let block=''; let fence='';
  for (const line of text.split('\n')) {
    const match=line.match(/^\s*(`{3,}|~{3,}|\$\$\s*$)/);
    if (match) { if (!fence) fence=match[1][0]; else if(fence===match[1][0]) fence=''; }
    if (!line.trim() && !fence && block.trim()) {blocks.push(block);block='';} else block+=(block?'\n':'')+line;
  }
  if(block.trim()) blocks.push(block); return blocks;
}

export function parseReadingResponse(raw:string,start:number,end:number,figures:boolean):{text:string;media:ReadingMedia}{
  const parsed:unknown=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!parsed||typeof parsed!=='object'||!('messageMarkdown' in parsed)||typeof parsed.messageMarkdown!=='string'||!parsed.messageMarkdown.trim()) throw new Error('这轮领读没有返回完整讲解，请重试。');
  const text=parsed.messageMarkdown.trim();return {text,media:parseReadingMedia(parsed,text,start,end,figures)};
}
