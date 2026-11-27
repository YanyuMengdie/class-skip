import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Pause, RefreshCw, X } from 'lucide-react';
import type { AnnotationCache, AppLanguage, PageCommentsCache, Slide } from '@/types';
import { exportStudyHandoutPdf } from '@/features/reader/export/studyHandoutPdf';
import { createHandoutAI } from './ai';
import { exportAnnotations, newJob, pageRange, parseDraft, type HandoutDepth, type HandoutJob, type PageDraft, type HandoutPage } from './model';
import { HandoutConflictError, loadHandoutJob, saveHandoutJob } from './storage';
import { runHandout, handoutProgressText } from './run';
import { HandoutExplanation } from './explanationFormat';
import './autoHandout.css';

export interface AutoHandoutDialogProps {
  owner: string; source: string; pdf: string; slides: Slide[]; fileName: string; language: AppLanguage;
  initialPage: number; annotations: AnnotationCache; pageComments: PageCommentsCache; onClose: () => void;
}
export function AutoHandoutDialog(props: AutoHandoutDialogProps) {
  const en = props.language === 'en';
  const t = (zh: string, english: string) => en ? english : zh;
  const first = props.slides[0]?.pageNumber || 1;
  const last = props.slides.at(-1)?.pageNumber || first;
  const [start, setStart] = useState(Math.max(first, props.initialPage));
  const [end, setEnd] = useState(Math.min(last, props.initialPage + 2));
  const [depth, setDepth] = useState<HandoutDepth>('thorough');
  const [job, setJob] = useState<HandoutJob>();
  const [selected, setSelected] = useState(props.initialPage);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editing, setEditing] = useState<PageDraft>();
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [exporting, setExporting] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const lock = useRef(false);
  const alive = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const jobRef = useRef<HandoutJob | undefined>(undefined);
  let range: number[] = [];
  let rangeError = '';
  try { range = pageRange(start, end, props.slides); }
  catch (e) { rangeError = e instanceof Error ? e.message : String(e); }
  const seed = newJob(props.owner, props.source, props.language, depth, range);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now(); setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { alive.current = false; controller.current?.abort(); previous?.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setJob(undefined); jobRef.current = undefined; setError(''); setSaveError(''); setEditing(undefined); setStage('');
    setSelected(range[0] || first);
    if (!range.length) { setLoading(false); return; }
    loadHandoutJob(seed.id, props.owner, props.source).then(saved => {
      if (!active) return;
      const value = saved || seed;
      jobRef.current = value; setJob(value);
    }).catch(() => {
      if (active) setSaveError(t('无法读取本机试验草稿，请重试；不会覆盖已有记录。', 'Could not read local trial drafts. Retry; existing records are untouched.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [seed.id, reload]);
  const save = async (value: HandoutJob) => {
    if (!alive.current) return;
    // Update the in-memory copy even if disk fails; stop requests and expose retry.
    jobRef.current = value; setJob(value);
    try {
      const saved = await saveHandoutJob(value);
      if (alive.current) { jobRef.current = saved; setJob(saved); setSaveError(''); }
      return saved;
    } catch (e) {
      if (alive.current) setSaveError(e instanceof HandoutConflictError ? e.message : t('本机草稿未保存，已停止后续生成。请先重试保存；关闭页面可能丢失本次未保存内容。', 'Local draft could not be saved; generation stopped. Retry saving before leaving.'));
      throw e;
    }
  };
  async function run(pages?: number[]) {
    if (lock.current || !jobRef.current || saveError) return;
    lock.current = true; setBusy(true); setError(''); controller.current = new AbortController();
    try {
      const work = async () => {
        // Re-read after acquiring the cross-tab lock. A resuming tab uses the latest draft.
        const fresh = await loadHandoutJob(seed.id, props.owner, props.source);
        if (fresh) { jobRef.current = fresh; if (alive.current) setJob(fresh); }
        if (controller.current!.signal.aborted) return;
        // Ensure a writable draft before making the first paid model request.
        await save(jobRef.current!);
        await runHandout({ job: jobRef.current!, signal: controller.current!.signal, pages,
          ai: createHandoutAI({ pdf: props.pdf, slides: props.slides, language: props.language, depth, owner: props.owner, source: props.source }),
          save, onProgress: progress => { if (alive.current) setStage(handoutProgressText(progress, props.language)); },
        });
      };
      if (navigator.locks) await navigator.locks.request(`auto-handout:${seed.id}`, { ifAvailable: true }, async held => {
        if (!held) throw new Error(t('另一个页面正在处理这批试验解析，请先在那里暂停，或稍后接续。', 'Another tab is processing this batch. Pause it there or resume later.'));
        await work();
      }); else await work();
      if (alive.current) {
        const unfinished = Object.values(jobRef.current?.pages || {}).filter(page => page.status === 'failed' && !page.draft).length;
        setStage(unfinished ? t(`本批处理结束，${unfinished} 页未完成；其余结果已保留，可重试未完成页。`, `Batch finished with ${unfinished} incomplete pages. Other results are saved; retry incomplete pages.`)
          : t('本批处理结束。可逐页查看解析。', 'Batch finished. Review explanations page by page.'));
      }
    } catch (e) {
      if (alive.current) {
        if (controller.current.signal.aborted) setStage(t('已暂停；再次开始会接续已保存进度。', 'Paused; resume from saved progress.'));
        else { setError(e instanceof Error ? e.message : t('生成失败，请重试。', 'Generation failed. Retry.')); setStage(t('本次处理已停止，已完成的步骤和草稿保留。', 'Processing stopped; completed stages and drafts are retained.')); }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const current = job?.pages[selected];
  const slide = props.slides.find(s => s.pageNumber === selected);
  const status = (page?: HandoutPage) => page?.draft ? (page.status === 'edited' ? t('已修改', 'Edited') : t('已生成', 'Generated')) : page?.status === 'failed' ? t('未完成 · 可重试', 'Incomplete · retry') : t('尚未生成', 'Not started');
  const drafted = Object.values(job?.pages || {}).filter(p => p.draft).length;
  const failed = Object.values(job?.pages || {}).filter(p => p.status === 'failed' && !p.draft).length;
  const close = () => { if (editing || exporting) return; controller.current?.abort(); props.onClose(); };
  async function download() {
    if (lock.current || !jobRef.current) return;
    lock.current = true; setBusy(true); setExporting(true); setError(''); setStage(t('正在沿用原讲义格式导出…', 'Exporting with the existing handout layout…'));
    try {
      const snapshot = jobRef.current;
      const slides = props.slides.filter(s => snapshot.pageNumbers.includes(s.pageNumber));
      await exportStudyHandoutPdf({ slides, annotations: exportAnnotations(snapshot, slides, props.annotations), pageComments: props.pageComments,
        fileName: `${props.fileName.replace(/\.pdf$/i, '')}_AI解析_${start}-${end}` });
      if (alive.current) setStage(t('已导出。原标签、注释和旧学习记录保持不变。', 'Exported. Existing notes and learning records are unchanged.'));
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t('导出失败，请重试。', 'Export failed. Retry.')); }
    finally { lock.current = false; if (alive.current) { setBusy(false); setExporting(false); } }
  }
  return <div className="auto-handout-backdrop"><div ref={dialog} tabIndex={-1} className="auto-handout-dialog" role="dialog" aria-modal="true" aria-labelledby="auto-handout-title"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || []);
        const firstNode = nodes[0], lastNode = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === firstNode || document.activeElement === dialog.current)) { event.preventDefault(); lastNode?.focus(); }
        else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode?.focus(); }
      }
    }}>
    <header className="auto-handout-header"><div><span className="auto-handout-eyebrow">{t('试验功能', 'EXPERIMENT')}</span><h2 id="auto-handout-title">{t('自动解析讲义', 'Annotated handout')}</h2><p>{props.fileName}</p></div><button disabled={!!editing || exporting} onClick={close} aria-label={t('关闭并暂停生成', 'Close and pause generation')}><X size={20}/></button></header>
    <div className="auto-handout-settings"><label>{t('原文起始页', 'First source page')}<input type="number" min={first} max={last} disabled={busy || !!editing} value={start} onChange={e => setStart(Number(e.target.value))}/></label><label>{t('原文结束页', 'Last source page')}<input type="number" min={start} max={last} disabled={busy || !!editing} value={end} onChange={e => setEnd(Number(e.target.value))}/></label><label>{t('这次想学多仔细', 'Learning depth')}<select disabled={busy || !!editing} value={depth} onChange={e => setDepth(e.target.value as HandoutDepth)}><option value="quick">{t('快速理解', 'Quick understanding')}</option><option value="thorough">{t('仔细讲解', 'Careful explanation')}</option></select></label><button disabled={busy || !!editing} onClick={() => { setStart(first); setEnd(last); }}>{t('整份讲义', 'Whole PDF')}</button>
      <button className="auto-handout-primary" disabled={busy || loading || !!rangeError || !!saveError || !props.pdf || !props.source || !!editing} onClick={() => void run()}>{busy ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} {busy ? t('正在处理…', 'Processing…') : drafted || failed ? t('继续／重试未完成页', 'Resume / retry incomplete pages') : t('生成讲解', 'Generate explanations')}</button>
      {busy && !exporting && <button onClick={() => { controller.current?.abort(); setStage(t('正在暂停，等待当前请求结束…', 'Pausing the current request…')); }} disabled={!controller.current || controller.current.signal.aborted}><Pause size={16}/>{t('暂停', 'Pause')}</button>}
    </div>
    <div className="auto-handout-notice">{t('先通读整份讲义划分模块，再同时讲解两个模块。长模块分次输出，每次保留完整模块及关联页。可暂停后继续。', 'Read the whole PDF once to define modules, then explain two modules concurrently. Longer modules use multiple parts with full module context and references. Pause and resume anytime.')}</div>
    {(rangeError || error) && <p className="auto-handout-error" role="alert">{rangeError || error}</p>}
    {saveError && <div className="auto-handout-error" role="alert">{saveError}<button disabled={busy} onClick={() => { if (jobRef.current) void save(jobRef.current).catch(() => {}); else setReload(v => v + 1); }}>{t('重试保存／读取', 'Retry save / load')}</button><button disabled={busy || !!editing} onClick={() => setReload(v => v + 1)}>{t('放弃本页未保存修改，重新读取草稿', 'Discard unsaved changes and reload draft')}</button></div>}
    <div className="auto-handout-progress" role="status" aria-live="polite">{loading ? t('正在读取试验草稿…', 'Loading trial drafts…') : stage || t('生成内容会自动加入下载的讲义，无需逐条粘贴。', 'Generated explanations are added to the downloaded handout automatically.')}<span>{busy && `${elapsed}s · `}{t('已生成', 'Drafts')} {drafted}/{range.length}{failed > 0 && ` · ${t('未完成', 'Incomplete')} ${failed}`}</span></div>
    {job?.modulePlan && <details className="auto-handout-modules"><summary>{t(`模块目录 · ${job.modulePlan.modules.length} 个模块`, `Module directory · ${job.modulePlan.modules.length} modules`)}</summary><ol>{job.modulePlan.modules.map(module => <li key={module.id}><strong>{module.title}</strong> · {module.startPage}–{module.endPage} {t('页', 'pages')}{module.linkedPages.length > 0 && <small>{t('关联页', 'Reference pages')}: {module.linkedPages.join(', ')}</small>}</li>)}</ol></details>}
    <div className="auto-handout-body"><nav className="auto-handout-pages" aria-label={t('逐页解析状态', 'Page explanation status')}>{range.map(p => <button key={p} disabled={!!editing} className={`${selected === p ? 'is-active' : ''} ${job?.pages[p]?.status === 'failed' && !job.pages[p].draft ? 'has-error' : ''}`} aria-current={selected === p ? 'page' : undefined} onClick={() => setSelected(p)}><strong>{t('第', 'Page')} {p} {t('页', '')}</strong><small>{status(job?.pages[p])}</small></button>)}</nav>
      <main className="auto-handout-preview"><div className="auto-handout-original">{slide && <img src={slide.imageUrl} alt={t(`原文第 ${selected} 页`, `Source page ${selected}`)}/>}</div><section className="auto-handout-explanation"><div className="auto-handout-section-head"><h3>{t('本页解析', 'Page explanation')}</h3><span>{status(current)}</span></div>
        {current?.error && !current.draft && <p role="alert" className="auto-handout-error">{current.error}</p>}
        {editing ? <><label>{t('标题', 'Title')}<input value={editing.title} maxLength={250} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label>{editing.sections.map((s, i) => <div className="auto-handout-edit" key={i}><label>{t('小标题', 'Heading')}<input value={s.heading} maxLength={200} onChange={e => setEditing({ ...editing, sections: editing.sections.map((v, j) => j === i ? { ...v, heading: e.target.value } : v) })}/></label><label>{t('解释', 'Explanation')}<textarea value={s.explanation} maxLength={6000} onChange={e => setEditing({ ...editing, sections: editing.sections.map((v, j) => j === i ? { ...v, explanation: e.target.value } : v) })}/></label></div>)}<div className="auto-handout-actions"><button disabled={busy || !editing.title.trim() || editing.sections.some(s => !s.heading.trim() || !s.explanation.trim())} className="auto-handout-primary" onClick={async () => {
          if (!jobRef.current || lock.current) return;
          lock.current = true; setBusy(true);
          try { const editedDraft = parseDraft({ ...editing, teachingMemory: undefined }); await save({ ...jobRef.current, pages: { ...jobRef.current.pages, [selected]: { ...current!, draft: editedDraft, audit: undefined, error: undefined, status: 'edited', updatedAt: Date.now() } }, updatedAt: Date.now() }); setEditing(undefined); }
          catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t('修改尚未保存。', 'Edit not saved.')); } finally { lock.current = false; if (alive.current) setBusy(false); }
        }}>{t('保存修改', 'Save edit')}</button><button disabled={busy} onClick={() => setEditing(undefined)}>{t('取消修改', 'Cancel edit')}</button></div></>
          : current?.draft ? <><h3>{current.draft.title}</h3>{current.draft.sections.map((s, i) => <article key={i}><h4>{s.heading}</h4><div className="auto-handout-prose"><HandoutExplanation text={s.explanation}/></div></article>)}</> : <p className="auto-handout-empty">{t('这一页还没有解析。生成后会在这里对照原文预览。', 'No explanation yet. Preview it beside the original after generation.')}</p>}
        {!!current?.draft?.uncertainties.length && current.draft.uncertainties.map((text, i) => <p key={`note-${i}`}>{text}</p>)}

        <div className="auto-handout-actions">{!editing && <><button disabled={busy || loading || !job || !!rangeError || !!saveError} onClick={() => void run([selected])}><RefreshCw size={15}/>{current?.draft ? t('重新生成本页', 'Regenerate page') : t('只生成本页', 'Generate this page')}</button>{current?.draft && <><button disabled={busy || !!saveError} onClick={() => setEditing(structuredClone(current.draft!))}>{t('编辑本页', 'Edit page')}</button></>}</>}</div>
      </section></main></div>
    <footer className="auto-handout-footer"><div><p>{t('已生成的讲解会直接附入讲义，原有标签与注释保留。', 'Generated explanations are included directly, alongside existing notes.')}</p></div><button className="auto-handout-primary" disabled={busy || !drafted || !!editing || loading || !!rangeError} onClick={() => void download()}><Download size={16}/>{t(`导出所选 ${range.length} 页`, `Export ${range.length} source pages`)}</button></footer>
  </div></div>;
}
