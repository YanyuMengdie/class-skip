import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, Pause, RefreshCw, X } from 'lucide-react';
import type { AnnotationCache, AppLanguage, PageCommentsCache, Slide } from '@/types';
import { exportStudyHandoutPdf } from '@/features/reader/export/studyHandoutPdf';
import { createHandoutAI } from './ai';
import { exportAnnotations, newJob, pageRange, parseDraft, type HandoutDepth, type HandoutJob, type PageDraft, type HandoutPage } from './model';
import { HandoutConflictError, loadHandoutJob, saveHandoutJob } from './storage';
import { runHandout } from './run';
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
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [editing, setEditing] = useState<PageDraft>();
  const [busy, setBusy] = useState(false);
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
  async function run(pages?: number[], recheckOnly = false) {
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
        await runHandout({ job: jobRef.current!, signal: controller.current!.signal, pages, recheckOnly,
          ai: createHandoutAI({ pdf: props.pdf, slides: props.slides, language: props.language, depth, signal: controller.current.signal }),
          save, onProgress: (phase, page) => {
            if (alive.current) setStage(phase === 'planning' ? t('正在阅读整份 PDF，建立本批页码的上下文…', 'Reading the full PDF and planning these pages…')
              : `${t('原文第', 'Source page')} ${page} ${t('页', '')} · ${phase === 'writing' ? t('正在写解析', 'Writing explanation') : t('正在对照原文核查', 'Checking against the source')}`);
          },
        });
      };
      if (navigator.locks) await navigator.locks.request(`auto-handout:${seed.id}`, { ifAvailable: true }, async held => {
        if (!held) throw new Error(t('另一个页面正在处理这批试验解析，请先在那里暂停，或稍后接续。', 'Another tab is processing this batch. Pause it there or resume later.'));
        await work();
      }); else await work();
      if (alive.current) setStage(t('本批处理结束。请查看待核查或失败的页面。', 'Batch finished. Review flagged or failed pages.'));
    } catch (e) {
      if (alive.current) {
        if (controller.current.signal.aborted) setStage(t('已暂停；再次开始会接续已保存进度。', 'Paused; resume from saved progress.'));
        else { setError(e instanceof Error ? e.message : t('生成失败，请重试。', 'Generation failed. Retry.')); setStage(t('本次处理已停止，已完成的步骤和草稿保留。', 'Processing stopped; completed stages and drafts are retained.')); }
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const current = job?.pages[selected];
  const slide = props.slides.find(s => s.pageNumber === selected);
  const status = (page?: HandoutPage) => !page || page.status === 'pending' ? t('尚未生成', 'Not started') : ({
    draft: t('解析已保存 · 待核查', 'Draft saved · check pending'), checked: t('自动核查通过', 'AI check passed'),
    needs_review: t('需要核查', 'Needs review'), edited: t('已修改 · 待核查', 'Edited · check pending'), failed: t('未完成 · 可重试', 'Incomplete · retry'),
  }[page.status]);
  const ready = Object.values(job?.pages || {}).filter(p => p.status === 'checked').length;
  const drafted = Object.values(job?.pages || {}).filter(p => p.draft).length;
  const close = () => { if (editing || exporting) return; controller.current?.abort(); props.onClose(); };
  async function download() {
    if (lock.current || !jobRef.current) return;
    lock.current = true; setBusy(true); setExporting(true); setError(''); setStage(t('正在沿用原讲义格式导出…', 'Exporting with the existing handout layout…'));
    try {
      const snapshot = jobRef.current;
      const slides = props.slides.filter(s => snapshot.pageNumbers.includes(s.pageNumber));
      await exportStudyHandoutPdf({ slides, annotations: exportAnnotations(snapshot, slides, props.annotations, includeUnverified), pageComments: props.pageComments,
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
    <div className="auto-handout-settings"><label>{t('原文起始页', 'First source page')}<input type="number" min={first} max={last} disabled={busy || !!editing} value={start} onChange={e => setStart(Number(e.target.value))}/></label><label>{t('原文结束页', 'Last source page')}<input type="number" min={start} max={last} disabled={busy || !!editing} value={end} onChange={e => setEnd(Number(e.target.value))}/></label><label>{t('这次想学多仔细', 'Learning depth')}<select disabled={busy || !!editing} value={depth} onChange={e => setDepth(e.target.value as HandoutDepth)}><option value="quick">{t('快速理解', 'Quick understanding')}</option><option value="thorough">{t('仔细讲解', 'Careful explanation')}</option></select></label><button disabled={busy || !!editing || last - first >= 60} onClick={() => { setStart(first); setEnd(last); }}>{t('整份讲义', 'Whole PDF')}</button>
      <button className="auto-handout-primary" disabled={busy || loading || !!rangeError || !!saveError || !props.pdf || !props.source || !!editing} onClick={() => void run()}>{busy ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} {drafted ? t('继续／重试未完成页', 'Resume / retry incomplete pages') : t('生成并核查', 'Generate and check')}</button>
      {busy && !exporting && <button onClick={() => { controller.current?.abort(); setStage(t('正在暂停，等待当前请求结束…', 'Pausing the current request…')); }} disabled={!controller.current || controller.current.signal.aborted}><Pause size={16}/>{t('暂停', 'Pause')}</button>}
    </div>
    <div className="auto-handout-notice">{t('默认先试当前起的 3 页，每批最多 60 页。逐页写作并另行核查；封面与过渡页简短处理。草稿仅保存在当前浏览器，尚不跨设备同步。', 'Starts with three pages; up to 60 per batch. Each explanation is checked against the source. Cover and transition pages stay brief. Trial drafts are saved in this browser only.')}</div>
    {(rangeError || error) && <p className="auto-handout-error" role="alert">{rangeError || error}</p>}
    {saveError && <div className="auto-handout-error" role="alert">{saveError}<button disabled={busy} onClick={() => { if (jobRef.current) void save(jobRef.current).catch(() => {}); else setReload(v => v + 1); }}>{t('重试保存／读取', 'Retry save / load')}</button><button disabled={busy || !!editing} onClick={() => setReload(v => v + 1)}>{t('放弃本页未保存修改，重新读取草稿', 'Discard unsaved changes and reload draft')}</button></div>}
    <div className="auto-handout-progress" role="status" aria-live="polite">{loading ? t('正在读取试验草稿…', 'Loading trial drafts…') : stage || t('生成内容会自动加入下载的讲义，无需逐条粘贴。', 'Generated explanations are added to the downloaded handout automatically.')}<span>{t('自动核查通过', 'AI checks passed')} {ready}/{range.length}</span></div>
    <div className="auto-handout-body"><nav className="auto-handout-pages" aria-label={t('逐页解析状态', 'Page explanation status')}>{range.map(p => <button key={p} disabled={!!editing} className={selected === p ? 'is-active' : ''} aria-current={selected === p ? 'page' : undefined} onClick={() => setSelected(p)}><strong>{t('第', 'Page')} {p} {t('页', '')}</strong><small>{status(job?.pages[p])}</small></button>)}</nav>
      <main className="auto-handout-preview"><div className="auto-handout-original">{slide && <img src={slide.imageUrl} alt={t(`原文第 ${selected} 页`, `Source page ${selected}`)}/>}</div><section className="auto-handout-explanation"><div className="auto-handout-section-head"><h3>{t('本页解析', 'Page explanation')}</h3><span>{status(current)}</span></div>
        {current?.error && <p role="alert" className="auto-handout-error">{current.error}</p>}
        {editing ? <><label>{t('标题', 'Title')}<input value={editing.title} maxLength={250} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label>{editing.sections.map((s, i) => <div className="auto-handout-edit" key={i}><label>{t('小标题', 'Heading')}<input value={s.heading} maxLength={200} onChange={e => setEditing({ ...editing, sections: editing.sections.map((v, j) => j === i ? { ...v, heading: e.target.value } : v) })}/></label><label>{t('解释', 'Explanation')}<textarea value={s.explanation} maxLength={6000} onChange={e => setEditing({ ...editing, sections: editing.sections.map((v, j) => j === i ? { ...v, explanation: e.target.value } : v) })}/></label><label>{t('原文依据', 'Source basis')}<textarea value={s.sourceEvidence} maxLength={1200} onChange={e => setEditing({ ...editing, sections: editing.sections.map((v, j) => j === i ? { ...v, sourceEvidence: e.target.value } : v) })}/></label></div>)}<div className="auto-handout-actions"><button disabled={busy || !editing.title.trim() || editing.sections.some(s => !s.heading.trim() || !s.explanation.trim() || !s.sourceEvidence.trim())} className="auto-handout-primary" onClick={async () => {
          if (!jobRef.current || lock.current) return;
          lock.current = true; setBusy(true);
          try { const checkedDraft = parseDraft(editing); await save({ ...jobRef.current, pages: { ...jobRef.current.pages, [selected]: { ...current!, draft: checkedDraft, audit: undefined, error: undefined, status: 'edited', updatedAt: Date.now() } }, updatedAt: Date.now() }); setEditing(undefined); }
          catch (e) { if (alive.current) setError(e instanceof Error ? e.message : t('修改尚未保存。', 'Edit not saved.')); } finally { lock.current = false; if (alive.current) setBusy(false); }
        }}>{t('保存修改（需重新核查）', 'Save edit (check required)')}</button><button disabled={busy} onClick={() => setEditing(undefined)}>{t('取消修改', 'Cancel edit')}</button></div></>
          : current?.draft ? <><h3>{current.draft.title}</h3>{current.draft.sections.map((s, i) => <article key={i}><h4>{s.heading}</h4><p>{s.explanation}</p><details><summary>{t('原文依据', 'Source basis')}</summary><p>{s.sourceEvidence}</p></details></article>)}</> : <p className="auto-handout-empty">{t('这一页还没有解析。生成后会在这里对照原文预览。', 'No explanation yet. Preview it beside the original after generation.')}</p>}
        {!!current?.draft?.uncertainties.length && <section className="auto-handout-flags"><h4>{t('原文尚有不确定处', 'Source uncertainties')}</h4><ul>{current.draft.uncertainties.map((s, i) => <li key={i}>{s}</li>)}</ul></section>}
        {current?.audit && <details className="auto-handout-audit"><summary>{t('查看核查结果', 'Source check results')}</summary><ul>{(['coverage', 'source', 'visuals', 'context', 'teaching'] as const).map((key, i) => <li key={key}>{current.audit![key] ? '✓' : '○'} {en ? ['Main-point coverage', 'Source grounding', 'Figures and formulas', 'Context', 'Explanation quality'][i] : ['重点覆盖', '原文依据', '图表与公式', '上下文关系', '解释而非复述'][i]}</li>)}</ul>{!!current.audit.issues.length && <ul>{current.audit.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>}</details>}
        <div className="auto-handout-actions">{!editing && <><button disabled={busy || loading || !job || !!rangeError || !!saveError} onClick={() => void run([selected])}><RefreshCw size={15}/>{current?.draft ? t('按问题重做本页', 'Revise this page') : t('只生成本页', 'Generate this page')}</button>{current?.draft && <><button disabled={busy || !!saveError} onClick={() => setEditing(structuredClone(current.draft!))}>{t('编辑本页', 'Edit page')}</button><button disabled={busy || !!saveError} onClick={() => void run([selected], true)}><Check size={15}/>{t('重新核查', 'Check again')}</button></>}</>}</div>
      </section></main></div>
    <footer className="auto-handout-footer"><div><label><input type="checkbox" checked={includeUnverified} disabled={busy || !!editing} onChange={e => setIncludeUnverified(e.target.checked)}/>{t('附入待核查／手动修改的解析，并保留状态标记', 'Include unverified / edited explanations with status labels')}</label><p>{t('所选原文页全部导出。未完成或未通过核查的页默认只附状态说明；原有标签与注释保留。自动核查不能保证完全正确。', 'All selected source pages are exported. Unfinished or flagged explanations get a status note by default. Existing notes are retained. AI checks cannot guarantee correctness.')}</p></div><button className="auto-handout-primary" disabled={busy || !drafted || !!editing || loading || !!rangeError} onClick={() => void download()}><Download size={16}/>{t(`导出所选 ${range.length} 页`, `Export ${range.length} source pages`)}</button></footer>
  </div></div>;
}
