import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Flame, Loader2, Trash2, X } from 'lucide-react';
import type { CloudSession, ExamMaterialLink, LSAPContentMap } from '@/types';
import type { WorkspaceUser } from '@/services/workspaceUser';
import { getUserSessions, listExamMaterialLinks, listExams } from '@/services/firebase';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { extractPdfText } from '@/lib/pdf/pdfUtils';
import { ReviewMaterialPicker } from '@/features/review/ReviewMaterialPicker';
import { createLectureReviewMaterial } from '@/features/exam/lib/lectureReviewScope';
import { computeExamWorkspaceLsapKey, loadWorkspaceLsapBundle } from '@/features/exam/lib/examWorkspaceLsapKey';
import { ExamWorkspaceMaterialPreview } from '@/features/exam/workspace/ExamWorkspaceMaterialPreview';
import { cramId, makeCramSession, mergeCramTopics, type CramSession } from './cramState';
import { GuidedSprintPanel } from './GuidedSprint';
import { sprintState } from './sprintState';
import { deleteCramSession, loadCramSessions, reusableCramTopics, saveCramSession } from './cramStorage';
import { extractCramTopics, nextSourcePages } from './cramAI';
import '@/features/review/review.css';
import './cram.css';

interface Props {
  user: WorkspaceUser; currentMaterial: ExamMaterialLink | null;
  currentContentMap?: LSAPContentMap | null;
  resolvePdf: (material: ExamMaterialLink) => Promise<File | null>;
  onBack: () => void; onLibrary: () => void;
}
export function CramWorkspace({ user, currentMaterial, currentContentMap, resolvePdf, onBack, onLibrary }: Props) {
  const { text: t } = useAppLanguage();
  const [saved, setSaved] = useState<CramSession[]>([]);
  const [session, setSession] = useState<CramSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [files, setFiles] = useState<CloudSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useCurrent, setUseCurrent] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState('');
  const deletingRef = useRef(false);
  const userIdRef = useRef(user.uid); userIdRef.current = user.uid;
  const [preview, setPreview] = useState<{ linkId: string; page: number; requestId: number } | null>(null);
  const live = useRef(true);
  const sessionRef = useRef(session);
  const requestRef = useRef<AbortController | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const allowWrite = useRef(false);
  const storageFailed = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; requestRef.current?.abort(); }; }, []);
  const load = async () => {
    setLoading(true); setError('');
    try { const rows = await loadCramSessions(user.uid); if (live.current) { setSaved(rows); allowWrite.current = true; setStorageError(''); } }
    catch { if (live.current) setStorageError(t('已有冲刺记录无法读取。请重试，暂不创建或覆盖记录。', 'Saved sprint records could not be read. Retry before creating or overwriting records.')); }
    finally { if (live.current) setLoading(false); }
  };
  useEffect(() => { void load(); }, [user.uid]);
  const persist = (next: CramSession) => {
    if (!allowWrite.current) return;
    const r = ++revision.current; setSaving(true);
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => saveCramSession(next)).then(() => {
      if (revision.current === r) storageFailed.current = false;
      if (live.current && revision.current === r) { setSaving(false); setStorageError(''); }
    }).catch(() => { storageFailed.current = true; if (live.current) { setSaving(false); setStorageError(t('保存失败，当前内容仍在页面中。请重试保存或导出备份后再离开。', 'Save failed. Keep this page open and retry saving or export a backup before leaving.')); } });
  };
  const commit = (update: (s: CramSession) => CramSession) => {
    if (!live.current || !sessionRef.current) return;
    const next = { ...update(sessionRef.current), updatedAt: Date.now() };
    sessionRef.current = next; setSession(next);
    setSaved(rows => [next, ...rows.filter(s => s.id !== next.id)]); persist(next);
  };
  useEffect(() => {
    const timer = window.setInterval(() => { if (live.current) setClock(Date.now()); }, 30000);
    return () => clearInterval(timer);
  }, []);
  const openSaved = (savedSession: CramSession) => {
    if (deletingRef.current) return;
    const s = { ...savedSession, requests: savedSession.requests.map(r => r.outcome === 'pending' ? { ...r, outcome: 'interrupted-usage-unknown' } : r) };
    const next = { ...s, guided: sprintState(s) };
    sessionRef.current = next; setSession(next); setError('');
  };
  const removeSaved = async (target: CramSession) => {
    if (deletingRef.current || sessionRef.current || busy || loading || !allowWrite.current) return;
    const title = target.title || target.sources.map(x => x.material.fileName).join(' / ');
    if (!window.confirm(t(
      `删除这条冲刺记录？\n\n${title}\n\n这次冲刺的知识点、讲解、术语释义、复述和学习进度都会删除，无法撤销。资料库里的原始 PDF、其他冲刺和复习记录会保留。需要留存的话，请先取消并导出备份。`,
      `Delete this sprint?\n\n${title}\n\nIts objectives, explanations, definitions, retellings and progress will be permanently deleted. Original library PDFs and other sprint/review records will be kept. Cancel and export a backup first if you want to keep a copy.`,
    ))) return;
    const owner = user.uid;
    deletingRef.current = true; setDeleting(target.id); setError(''); setHistoryNotice('');
    // Delete after pending saves; otherwise an older write could bring the record back.
    const deletion = writeQueue.current.catch(() => {}).then(() => deleteCramSession(owner, target.id));
    writeQueue.current = deletion.catch(() => {});
    try {
      await deletion;
      if (live.current && userIdRef.current === owner) {
        setSaved(rows => rows.filter(row => row.id !== target.id));
        setHistoryNotice(t('已删除这条冲刺记录，原始 PDF 已保留。', 'Sprint deleted. Original PDFs are kept.'));
      }
    } catch {
      if (live.current && userIdRef.current === owner) setError(t('删除失败，记录仍保留。请重试。', 'Deletion failed. The record is still available; please retry.'));
    } finally {
      deletingRef.current = false;
      if (live.current) setDeleting(null);
    }
  };
  const loadFiles = async () => {
    setFilesLoading(true); setFilesError('');
    try { const rows = await getUserSessions(user); if (live.current) setFiles(rows); }
    catch { if (live.current) setFilesError(t('资料目录读取失败，请重试。', 'Could not load the library. Please retry.')); }
    finally { if (live.current) setFilesLoading(false); }
  };
  const pick = () => { if (deletingRef.current) return; setPicking(true); setSelected(new Set()); setUseCurrent(false); void loadFiles(); };
  const create = async () => {
    const materials = files.filter(f => selected.has(f.id)).flatMap(f => {
      const m = createLectureReviewMaterial(user.uid, { cloudSessionId: f.id, fileName: f.fileName }); return m ? [m] : [];
    });
    if (useCurrent && currentMaterial && !materials.some(m => m.id === currentMaterial.id)) materials.push(currentMaterial);
    if (!materials.length || !allowWrite.current) return;
    const s = makeCramSession(user.uid, materials);
    // Reuse raw text by stable material identity; opening another sprint does not reread the PDF.
    s.sources = s.sources.map(source => {
      const previous = saved.flatMap(old => old.sources).find(old => old.material.id === source.material.id && old.pages.length);
      return previous ? { ...source, pages: previous.pages, processedPages: previous.processedPages, extractionNotes: previous.extractionNotes } : source;
    });
    s.topics = materials.flatMap(m => {
      const existing = files.find(f => f.id === m.cloudSessionId)?.lsapContentMap;
      const maps = existing ? [{ ...existing, kcs: existing.kcs.map(k => ({ ...k, sourceLinkId: m.id })) }] : [];
      const topics = reusableCramTopics(user.uid, m, maps);
      const previous = saved.find(old => old.sources.some(source => source.material.id === m.id && source.pages.length));
      const reused = previous?.topics.filter(t => t.materialId === m.id).map((topic, order) => ({
        ...topic, id: cramId(), origin: 'cached' as const, included: true, familiarity: 'unknown' as const,
        status: 'unchecked' as const, group: 'quick' as const, attempts: 0, independentPasses: 0,
        note: '', priorityNote: '', manualOrder: undefined, dueAt: undefined, spacingSince: undefined,
        lastStudiedAt: undefined, lastVisited: undefined, order,
      })) ?? [];
      return mergeCramTopics(reused, topics);
    });
    // Current-reader map has an explicit material identity, unlike name-based cache matching.
    if (currentContentMap && currentMaterial && materials.some(m => m.id === currentMaterial.id)) {
      const map = { ...currentContentMap, kcs: currentContentMap.kcs.map(k => ({ ...k, sourceLinkId: currentMaterial.id })) };
      const extra = reusableCramTopics(user.uid, currentMaterial, [map]);
      if (!s.topics.some(x => x.materialId === currentMaterial.id)) s.topics.push(...extra);
    }
    s.guided = sprintState(s);
    sessionRef.current = s; setSession(s); setSaved(rows => [s, ...rows]); persist(s); setPicking(false);
  };
  const exportBackup = () => {
    const data = sessionRef.current ? [sessionRef.current] : saved;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, sessions: data }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `classskip-cram-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  /** Requests only start from explicit user actions; restoring records never invokes AI. */
  const run = async (label: string, task: (signal: AbortSignal, usage: (u?: { inputTokens: number; outputTokens: number }) => void) => Promise<void>, ai = true, timeoutMs = 180_000) => {
    if (requestRef.current || !sessionRef.current || !live.current) return false;
    const controller = new AbortController(); requestRef.current = controller;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let completed = false;
    const owner = sessionRef.current.id; setBusy(label); setError('');
    const started = Date.now();
    if (ai) commit(s => ({ ...s, requests: [...s.requests, { at: started, kind: label, outcome: 'pending' }] }));
    let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
    try { await task(controller.signal, u => { tokenUsage = u; }); completed = true; }
    catch (e) { if (live.current && !controller.signal.aborted) setError(`${t('这一步没有完成，已保存的内容会保留。', 'This step did not finish. Saved work is retained.')} ${e instanceof Error ? e.message : ''}`); }
    finally {
      clearTimeout(deadline);
      if (live.current && sessionRef.current?.id === owner) {
        if (ai) commit(s => ({ ...s, requests: s.requests.map(r => r.at !== started ? r : { ...r, ...tokenUsage, outcome: controller.signal.aborted ? 'cancelled' : completed ? 'completed' : 'failed' }) }));
        setBusy('');
        if (controller.signal.aborted) setError(timedOut
          ? t('本轮处理时间已到上限，进度已保留。可点击继续整理未完成的部分。', 'This run reached its time limit. Progress is retained; continue the unfinished portion when ready.')
          : t('已停止，已完成的结果保留。再次点击会继续未完成的部分。', 'Stopped. Completed results are retained; the next run continues unfinished work.'));
      }
      if (requestRef.current === controller) requestRef.current = null;
    }
    return completed && !controller.signal.aborted && live.current;
  };
  const cancel = () => requestRef.current?.abort();
  // Both entry points share the same extraction and per-request accounting.
  const extractBatch = async (materialId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    const source = sessionRef.current!.sources.find(s => s.material.id === materialId)!;
    const pages = nextSourcePages(source);
    if (!pages.length) return;
    const total = source.pages.filter(page => page.trim().length >= 30).length;
    const label = `${source.material.fileName} · ${t('已处理', 'Processed')} ${source.processedPages.length}/${total} · ${t('正在整理 PDF 页', 'Processing PDF pages')} ${pages[0]}–${pages[pages.length - 1]}`;
    const requestIndex = sessionRef.current!.requests.length;
    let completed = false;
    let tokenUsage: { inputTokens: number; outputTokens: number } | undefined;
    const usage = (value?: { inputTokens: number; outputTokens: number }) => { tokenUsage = value; };
    setBusy(label);
    commit(s => ({ ...s, requests: [...s.requests, { at: Date.now(), kind: label, outcome: 'pending' }] }));
    try {
      const result = await extractCramTopics(source, pages, signal, usage); signal.throwIfAborted();
      commit(s => {
        return { ...s, topics: mergeCramTopics(s.topics, result.topics),
          sources: s.sources.map(x => x.material.id === materialId ? { ...x, processedPages: [...new Set([...x.processedPages, ...pages])],
            extractionNotes: [...x.extractionNotes, ...result.limitations.map(n => `${pages.join(',')}: ${n}`)] } : x) };
      });
      completed = true;
    } finally {
      commit(s => ({ ...s, requests: s.requests.map((r, i) => i !== requestIndex ? r : {
        ...r, ...tokenUsage, outcome: signal.aborted ? 'cancelled' : completed ? 'completed' : 'failed',
      }) }));
    }
  };
  const extractRemaining = async (materialId: string, signal: AbortSignal) => {
    while (true) {
      signal.throwIfAborted();
      // Do not spend on another batch until the previous checkpoint is safely stored.
      await writeQueue.current;
      signal.throwIfAborted();
      if (storageFailed.current) throw new Error(t('保存尚未成功，已暂停后续提取。请先重试保存。', 'Saving failed; further extraction is paused. Retry saving first.'));
      const source = sessionRef.current!.sources.find(x => x.material.id === materialId)!;
      if (!nextSourcePages(source).length) return;
      const previousCount = source.processedPages.length;
      await extractBatch(materialId, signal);
      const nextCount = sessionRef.current!.sources.find(x => x.material.id === materialId)!.processedPages.length;
      if (nextCount <= previousCount) throw new Error(t('这批没有取得新进度，已停止以避免重复请求。', 'No new progress; stopped to avoid duplicate requests.'));
    }
  };
  const readSources = () => run(t('读取并整理知识点', 'Read and extract objectives'), async signal => {
    // Existing exam maps are reused only through the current user's authorized material links.
    let cachedMaps: { material: ExamMaterialLink; map: LSAPContentMap }[] = [];
    try {
      const [exams, links] = await Promise.all([listExams(user), listExamMaterialLinks(user)]); signal.throwIfAborted();
      for (const exam of exams) {
        const ownLinks = links.filter(l => l.examId === exam.id);
        const map = loadWorkspaceLsapBundle(computeExamWorkspaceLsapKey(user.uid, exam.id, ownLinks))?.contentMap;
        if (map) ownLinks.forEach(material => cachedMaps.push({ material, map }));
      }
    } catch { if (signal.aborted) signal.throwIfAborted(); /* Optional cache lookup must not block reading PDFs. */ }
    for (const source of sessionRef.current!.sources) {
      signal.throwIfAborted();
      if (!sessionRef.current!.topics.some(t => t.materialId === source.material.id)) {
        const match = cachedMaps.find(c => source.material.cloudSessionId ? c.material.cloudSessionId === source.material.cloudSessionId : !!source.material.fileHash && c.material.fileHash === source.material.fileHash);
        if (match) {
          const map = { ...match.map, kcs: match.map.kcs.filter(k => k.sourceLinkId === match.material.id).map(k => ({ ...k, sourceLinkId: source.material.id })) };
          const topics = reusableCramTopics(user.uid, source.material, [map]);
          commit(s => ({ ...s, topics: [...s.topics, ...topics] }));
        }
      }
      if (!source.pages.length) {
        setBusy(`${t('读取资料', 'Read source')} · ${source.material.fileName}`);
        try {
          const pdf = await resolvePdf(source.material); signal.throwIfAborted();
          if (!pdf) throw new Error(t('无法取得 PDF。请在资料库重新打开这份文件后再试。', 'PDF unavailable. Reopen this file in the library and retry.'));
          const pages = await extractPdfText(pdf); signal.throwIfAborted();
          if (!pages.length) throw new Error(t('这份 PDF 没有可读取的页面。', 'This PDF has no readable pages.'));
          commit(s => ({ ...s, sources: s.sources.map(x => x.material.id === source.material.id ? { ...x, pages, readError: undefined } : x) }));
        } catch (e) {
          signal.throwIfAborted();
          commit(s => ({ ...s, sources: s.sources.map(x => x.material.id === source.material.id ? { ...x, readError: e instanceof Error ? e.message : 'PDF unavailable' } : x) }));
          throw e;
        }
      }
      signal.throwIfAborted();
      // Existing objectives remain; only pages without a saved extraction checkpoint are submitted.
      await extractRemaining(source.material.id, signal);
    }
  }, false, 20 * 60_000);
  const extract = (materialId: string) => void run(t('继续整理剩余知识点', 'Continue remaining objectives'),
    signal => extractRemaining(materialId, signal), false, 20 * 60_000);
  const openSource = (materialId: string, page: number) => setPreview({ linkId: materialId, page, requestId: Date.now() });
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = () => document.querySelector<HTMLButtonElement>('.cram-preview-close')?.focus();
    const frame = requestAnimationFrame(close);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPreview(null); }
      if (event.key === 'Tab') {
        const nodes = [...document.querySelectorAll<HTMLElement>('.cram-preview button:not(:disabled), .cram-preview select, .cram-preview input, .cram-preview summary')];
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, [!!preview]);
  return <div className="review-page cram-workspace" data-preserve-language="true">
    <header className="review-page-header"><div className="review-page-heading"><Flame size={27} /><div><h1>{t('考前冲刺', 'Exam sprint')}</h1><p>{t('先讲通主线，自己复述，隔开回想，再深入。', 'Understand the main thread, retell it, recall after a gap, then go deeper.')}</p></div></div>
      <div className="cram-actions">{session && <button disabled={!!busy} onClick={() => { setSession(null); sessionRef.current = null; }}>{t('冲刺记录', 'Sprint history')}</button>}<button onClick={exportBackup}><Download size={16} />{t('导出备份', 'Export backup')}</button><button disabled={!!busy} className="review-back" onClick={onBack}><ArrowLeft size={16} />{t('复习工作台', 'Review workspace')}</button></div></header>
    <main className="review-page-body"><div className="review-page-inner">
      {storageError && <div role="alert" className="review-notice">{storageError}<button onClick={() => session ? persist(session) : void load()}>{t('重试保存／读取', 'Retry storage')}</button><button onClick={exportBackup}>{t('导出备份', 'Export backup')}</button></div>}
      {error && <div className="review-notice" role="alert">{error}</div>}
      {busy && <div className="cram-busy" role="status"><Loader2 size={18} className="animate-spin" />{busy}<button onClick={cancel}>{t('取消', 'Cancel')}</button></div>}
      {loading ? <div className="review-empty">{t('读取本机冲刺记录…', 'Loading local sprint records…')}</div> : picking ? <ReviewMaterialPicker sessions={files} loading={filesLoading} error={filesError} signedIn toolLabel={t('考前冲刺', 'Exam sprint')}
        hasCurrentDoc={!!currentMaterial} currentDocName={currentMaterial?.fileName || null} currentSessionId={currentMaterial?.cloudSessionId}
        selectedIds={selected} useCurrentDoc={useCurrent} onToggleFile={id => setSelected(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; })}
        onToggleCurrent={() => setUseCurrent(v => !v)} onBack={() => setPicking(false)} onStart={() => void create()} onRetry={() => void loadFiles()} onLibrary={onLibrary} additiveCurrent /> : !session ? <>
          <div className="review-intro"><span className="review-eyebrow">EXAM SPRINT</span><h2>{t('把有限的时间，用在接下来该学的地方。', 'Spend your time on the next useful step.')}</h2><p>{t('先用大白话把每一讲串起来，再安排回想与深入。考试信息可以稍后补充。', 'Start with each lecture in everyday language, then weave in recall and deeper learning. Add exam details anytime.')}</p><button className="review-primary" disabled={!allowWrite.current || !!deleting} onClick={pick}>{t('选择考试资料', 'Choose exam materials')}<ArrowRight size={17} /></button></div>
          {historyNotice && <p className="cram-muted" role="status">{historyNotice}</p>}
          {saved.map(s => { const title = s.title || s.sources.map(x => x.material.fileName).join(' / '); return <div className="cram-history" key={s.id}>
            <button type="button" className="cram-history-open" disabled={!!deleting} onClick={() => openSaved(s)}><strong>{title}</strong><span>{s.topics.filter(t => t.included).length} {t('个知识点', 'objectives')} · {new Date(s.updatedAt).toLocaleString()}</span><ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" className="cram-history-delete" disabled={!!deleting || !allowWrite.current} aria-label={t(`删除冲刺记录：${title}`, `Delete sprint: ${title}`)} onClick={() => void removeSaved(s)}>{deleting === s.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}{t('删除', 'Delete')}</button>
          </div>; })}
        </> : <>
          <GuidedSprintPanel key={session.id} session={session} getSession={() => sessionRef.current!} busy={!!busy} run={run} commit={commit}
            readSources={readSources} extract={extract} resolvePdf={resolvePdf} onSource={openSource} />
          <footer className="cram-save">{saving ? t('正在保存到这台设备…', 'Saving on this device…') : storageError ? t('尚未安全保存', 'Not safely saved') : t('保存在这台设备；不会覆盖单讲或考试复习记录。', 'Saved on this device; lecture and exam review records are separate.')}</footer>
        </>}
    </div></main>
    {preview && session && <div className="cram-preview" role="dialog" aria-modal="true" aria-label={t('原文依据', 'Source evidence')}><div className="cram-preview-inner"><button className="cram-preview-close" onClick={() => setPreview(null)}><X size={20} />{t('关闭原文', 'Close source')}</button><ExamWorkspaceMaterialPreview materials={session.sources.map(s => s.material)} resolveExamMaterialPdf={resolvePdf} previewJumpRequest={preview} />
      <details><summary>{t('提取的原文文字', 'Extracted source text')}</summary><pre>{session.sources.find(s => s.material.id === preview.linkId)?.pages[preview.page - 1]}</pre></details></div></div>}
  </div>;
}
