import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { X, Loader2 } from 'lucide-react';
import type { StudyGuide, SavedArtifact } from '@/types';
import { generateStudyGuide } from '@/services/geminiService';
import { legacyNoteMarkdown } from '../lib/reviewNotes';

type Concept = StudyGuide['content']['coreConcepts'][number];
interface StudyGuidePanelProps {
  onClose: () => void;
  pdfContent: string | null;
  fileName: string | null;
  existingGuide: StudyGuide | null;
  cacheReady?: boolean;
  sourceKey?: string;
  legacyArtifacts?: SavedArtifact[];
  onSaveGuide: (guide: StudyGuide) => void;
  onCreateCards?: (concepts: Concept[]) => void;
  onOpenMindMap?: () => void;
}
const Markdown = ({ text }: { text: string }) => <div className="prose prose-stone max-w-none break-words"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown></div>;

export const StudyGuidePanel: React.FC<StudyGuidePanelProps> = ({ onClose, pdfContent, fileName, existingGuide, cacheReady = true, sourceKey, legacyArtifacts = [], onSaveGuide, onCreateCards, onOpenMindMap }) => {
  const [guide, setGuide] = useState(existingGuide);
  const [view, setView] = useState<'brief' | 'detail'>('brief');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (existingGuide && (!guide || existingGuide.createdAt > guide.createdAt)) {
      setGuide(existingGuide); setSelected(new Set());
    }
  }, [existingGuide, guide]);
  const content = guide?.content;
  const oldNotes = legacyArtifacts.filter(a => a.id !== guide?.id && !(a.type === 'studyGuide' && a.payload.id === guide?.id) && legacyNoteMarkdown(a));
  const generate = async () => {
    if (busy || !cacheReady || !pdfContent || !fileName) return;
    setBusy(true); setError('');
    try {
      const result = await generateStudyGuide(pdfContent, { format: 'detailed' });
      if (!result || (!result.coreConcepts.length && !result.markdownContent.trim())) throw new Error('empty');
      const next: StudyGuide = { id: `guide-${Date.now()}`, sourceKey, fileName, format: 'detailed', content: result, createdAt: Date.now() };
      onSaveGuide(next); setGuide(next); setSelected(new Set());
    } catch { setError('本次笔记未能生成，已有内容已保留。可以稍后手动重试。'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl border border-stone-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
      <header className="p-4 border-b flex justify-between gap-4"><div><h2 className="text-lg font-bold text-emerald-900">复习笔记</h2><p className="text-sm text-slate-500">{fileName}</p></div><button aria-label="关闭复习笔记" onClick={onClose} disabled={busy}><X /></button></header>
      <div className="flex flex-wrap items-center gap-2 p-4 border-b">
        {(['brief', 'detail'] as const).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-sm ${view === v ? 'bg-emerald-900 text-white' : 'bg-stone-100'}`}>{v === 'brief' ? '要点版' : '详细版'}</button>)}
        <span className="text-xs text-slate-500">切换只查看已有内容</span>
        {content?.knowledgeTree?.branches?.length ? <button type="button" className="text-sm text-emerald-800 ml-auto" onClick={onOpenMindMap}>查看这份笔记的导图 →</button> : null}
      </div>
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && <p role="alert" className="text-rose-700">{error}</p>}
        {content ? <>
          <p className="text-sm text-slate-500">{content.coverageNote || '这是已保存的整理结果，覆盖范围未经完整核对；未列出不代表不需要学习。'}</p>
          {!!content.chapters?.length && <details><summary className="cursor-pointer font-semibold">章节与来源范围</summary><ul className="mt-3 space-y-2">{content.chapters.map((c, i) => <li key={i}>{c.title} {c.pageRange && <span className="text-slate-500">· {c.pageRange}</span>}</li>)}</ul></details>}
          {view === 'brief' ? <>
            {!!content.reviewSuggestions?.keyPoints?.length && <section><h3 className="font-bold mb-3">核心要点</h3><ul className="list-disc pl-5 space-y-2">{content.reviewSuggestions.keyPoints.map((point, i) => <li key={i}>{point}</li>)}</ul></section>}
            {!content.coreConcepts?.length && content.markdownContent && <Markdown text={content.markdownContent} />}
          </> : <>
            {content.markdownContent ? <Markdown text={content.markdownContent} /> : <p className="text-slate-500">旧笔记没有保存详细讲解，下方仍可查看已保存的概念。</p>}
            {guide?.format === 'outline' && <p className="text-sm text-amber-700">这是一份旧大纲，切换视图不会自动补写详细内容。</p>}
          </>}
          {!!content.coreConcepts?.length && <section>
            <div className="flex flex-wrap justify-between gap-3 mb-3"><h3 className="font-bold">知识点与术语</h3>{onCreateCards && <button type="button" disabled={!selected.size} className="text-sm text-emerald-800 disabled:opacity-40" onClick={() => onCreateCards(content.coreConcepts.filter((_, i) => selected.has(i)))}>将选中的 {selected.size} 项加入闪卡</button>}</div>
            <p className="text-xs text-slate-500 mb-3">勾选后直接制作闪卡，无需重新生成。展开查看定义与相关易混点。</p>
            <div className="space-y-3">{content.coreConcepts.map((c, i) => <div key={i} className="border rounded-xl p-4 flex gap-3">
              <input type="checkbox" aria-label={`选择 ${c.term}`} checked={selected.has(i)} onChange={() => setSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; })} />
              <details className="flex-1 min-w-0"><summary className="cursor-pointer font-medium">{c.term}</summary><div className="mt-3 space-y-3"><Markdown text={c.definition} />{view === 'detail' && c.explanation && <Markdown text={c.explanation} />}{c.commonMistakes?.map((m, j) => <p key={j} className="text-sm text-amber-800">易混淆：{m}</p>)}</div></details>
            </div>)}</div>
          </section>}
          {!!content.reviewSuggestions?.commonMistakes?.length && <details><summary className="cursor-pointer font-semibold">其他易混淆的地方</summary><ul className="list-disc pl-5 mt-3 space-y-2">{content.reviewSuggestions.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}</ul></details>}
        </> : <p className="text-slate-600">尚未生成统一笔记。已有的学习指南、速览、易错点和术语会保留在下方。</p>}
        {!!oldNotes.length && <section><h3 className="font-bold mb-3">以前保存的笔记</h3>{oldNotes.map(a => <details className="border rounded-xl p-4 mb-3" key={a.id}><summary className="cursor-pointer">{a.title}</summary><div className="mt-4"><Markdown text={legacyNoteMarkdown(a) || ''} /></div></details>)}</section>}
        <div className="border-t pt-4"><button type="button" disabled={busy || !cacheReady || !pdfContent} onClick={generate} className="rounded-xl px-4 py-2 bg-emerald-900 text-white disabled:opacity-50 inline-flex gap-2 items-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />}{!cacheReady ? '正在读取已有笔记…' : busy ? '正在整理…' : guide ? '生成新版笔记' : '生成复习笔记'}</button><p className="text-xs text-slate-500 mt-2">点击才会调用 AI。已有版本保留；笔记中的重点不等于老师确认的必考内容。</p></div>
      </main>
    </div>
  </div>;
};
