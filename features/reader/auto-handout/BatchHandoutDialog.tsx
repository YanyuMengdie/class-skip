import React, { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, X } from 'lucide-react';
import { zipSync, strToU8 } from 'fflate';
import type { AppLanguage, CloudSession } from '@/types';
import { getFolderPath } from '@/shared/layout/libraryFolders';
import { exportStudyHandoutPdf } from '@/features/reader/export/studyHandoutPdf';
import { createHandoutAI } from './ai';
import { checkHandoutAbort, handoutZipName, prepareBatchHandout } from './batch';
import { exportAnnotations, newJob, type HandoutDepth, type HandoutJob } from './model';
import { loadHandoutJob, saveHandoutJob } from './storage';
import { runHandout, handoutProgressText } from './run';
import './autoHandout.css';

interface Props { owner: string; files: CloudSession[]; folders: CloudSession[]; language: AppLanguage; initialIds: string[]; onClose: () => void }
interface Progress { generated: number; total: number; message: string; error?: string }
export function BatchHandoutDialog({ owner, files, folders, language, initialIds, onClose }: Props) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const storageKey = `auto-handout-batch:${owner}:${language}`;
  const [selection, setSelection] = useState<string[]>(() => {
    if (initialIds.length) return initialIds.filter(id => files.some(file => file.id === id));
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); return Array.isArray(saved.ids) ? saved.ids.filter((id: unknown) => typeof id === 'string' && files.some(file => file.id === id)) : []; } catch { return []; }
  });
  const [depth, setDepth] = useState<HandoutDepth>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}').depth === 'quick' ? 'quick' : 'thorough'; } catch { return 'thorough'; }
  });
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [mode, setMode] = useState<'generate' | 'export' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const selected = files.filter(file => selection.includes(file.id));
  const visible = files.filter(file => (folder === 'all' || (folder === 'root' ? !file.parentId : getFolderPath(file.parentId, folders).some(p => p.id === folder)))
    && `${file.customTitle || file.fileName} ${getFolderPath(file.parentId, folders).map(p => p.customTitle || p.fileName).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ ids: selection, depth })); } catch { /* Jobs still use IndexedDB; selection persistence is optional. */ }
  }, [selection, depth, storageKey]);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { alive.current = false; controller.current?.abort(); previous?.focus(); };
  }, []);
  const update = (id: string, patch: Partial<Progress>) => { if (alive.current) setProgress(prev => ({ ...prev, [id]: { generated: 0, total: 0, message: '', ...prev[id], ...patch } })); };
  const count = (job: HandoutJob) => job.pageNumbers.filter(page => job.pages[page]?.draft).length;
  async function execute(action: 'generate' | 'export') {
    if (lock.current || !selected.length) return;
    lock.current = true; setMode(action); setError('');
    const abort = new AbortController(); controller.current = abort;
    const signal = abort.signal;
    const archive: Record<string, Uint8Array> = {};
    const report: string[] = [];
    let completed = 0;
    try {
      for (let index = 0; index < selected.length; index++) {
        checkHandoutAbort(signal);
        const file = selected[index];
        if (alive.current) setMessage(t(`正在处理第 ${index + 1}/${selected.length} 份：${file.customTitle || file.fileName}`, `Processing ${index + 1}/${selected.length}: ${file.customTitle || file.fileName}`));
        update(file.id, { message: t('正在读取 PDF…', 'Loading PDF…'), error: undefined });
        try {
          const material = await prepareBatchHandout(file, signal, (page, total) => update(file.id, { message: t(`准备第 ${page}/${total} 页`, `Preparing page ${page}/${total}`), total }));
          const seed = newJob(owner, material.source, language, depth, material.slides.map(slide => slide.pageNumber));
          const work = async () => {
            let job = await loadHandoutJob(seed.id, owner, material.source) || seed;
            checkHandoutAbort(signal);
            update(file.id, { generated: count(job), total: job.pageNumbers.length });
            if (action === 'generate') {
              // Test persistence before making paid requests. Save after every page.
              job = await saveHandoutJob(job);
              job = await runHandout({ job, signal,
                ai: createHandoutAI({ ...material, language, depth, owner }),
                save: async next => {
                  checkHandoutAbort(signal);
                  const saved = await saveHandoutJob(next);
                  update(file.id, { generated: count(saved), total: saved.pageNumbers.length });
                  return saved;
                },
                onProgress: progress => update(file.id, { message: handoutProgressText(progress, language) }),
              });
              const done = count(job);
              update(file.id, { generated: done, message: done === job.pageNumbers.length ? t('全部生成完成', 'Complete') : t('部分页面未完成，点击继续可重试', 'Some pages are incomplete; resume to retry') });
              if (done === job.pageNumbers.length) completed++;
            } else {
              if (!count(job)) throw new Error(t('还没有生成讲解，请先生成。', 'No explanations yet. Generate them first.'));
              update(file.id, { message: t('正在排版导出…', 'Preparing PDF export…') });
              const blob = await exportStudyHandoutPdf({ slides: material.slides, annotations: exportAnnotations(job, material.slides, material.annotations), pageComments: material.pageComments, fileName: file.customTitle || file.fileName, output: 'blob', signal });
              checkHandoutAbort(signal);
              if (!blob) throw new Error(t('导出结果为空。', 'Export is empty.'));
              archive[handoutZipName(file.customTitle || file.fileName, index)] = new Uint8Array(await blob.arrayBuffer());
              completed++;
              const missing = job.pageNumbers.filter(page => !job.pages[page]?.draft);
              report.push(`${file.customTitle || file.fileName}: ${count(job)}/${job.pageNumbers.length}${missing.length ? ` — ${t('尚无讲解的页码', 'Pages without explanations')}: ${missing.join(', ')}` : ''}`);
              update(file.id, { message: missing.length ? t('已打包，部分页面暂无讲解', 'Packed; some pages have no explanation') : t('已加入导出包', 'Added to ZIP') });
            }
          };
          if (navigator.locks) await navigator.locks.request(`auto-handout:${seed.id}`, { ifAvailable: true }, async held => {
            if (!held) throw new Error(t('另一个页面正在处理这份讲义，稍后重试。', 'This handout is being processed in another tab. Retry later.'));
            await work();
          }); else await work();
        } catch (e) {
          checkHandoutAbort(signal);
          const reason = e instanceof Error ? e.message : String(e);
          update(file.id, { message: t('未完成，可重试', 'Incomplete; retry'), error: reason });
          report.push(`${file.customTitle || file.fileName}: ${reason}`);
          if (action === 'generate' && e && typeof e === 'object' && 'code' in e && ['billing_required', 'rate_limit', 'unauthorized', 'not_configured', 'invalid_request'].includes(String(e.code))) throw e;
        }
      }
      checkHandoutAbort(signal);
      if (action === 'export') {
        if (!completed) throw new Error(t('没有可导出的讲义。请查看每份 PDF 下方的提示。', 'No handouts could be exported. See the file messages.'));
        archive['导出清单.txt'] = strToU8(report.join('\n'));
        const bytes = zipSync(archive, { level: 0 });
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url; link.download = 'AI讲解讲义.zip'; document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      if (alive.current) setMessage(action === 'generate' ? t(`本次结束：${completed}/${selected.length} 份全部完成，其余进度已保存。`, `Finished: ${completed}/${selected.length} complete; all progress saved.`) : t(`已导出 ${completed}/${selected.length} 份讲义，详情见 ZIP 内的导出清单。`, `Exported ${completed}/${selected.length} handouts. See the manifest inside the ZIP.`));
    } catch (e) {
      if (alive.current) {
        if (signal.aborted) setMessage(t('已暂停，生成进度已保存。可以继续。', 'Paused; generated pages are saved. Resume when ready.'));
        else { setError(e instanceof Error ? e.message : String(e)); setMessage(t('已停止，生成进度保留。', 'Stopped; generation progress retained.')); }
      }
    } finally { lock.current = false; if (alive.current) setMode(null); }
  }
  const close = () => { controller.current?.abort(); onClose(); };
  return <div className="auto-handout-backdrop"><div className="auto-handout-dialog batch-handout-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="batch-handout-title" tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') || []);
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === dialog.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
  }}>
    <header className="auto-handout-header"><div><h2 id="batch-handout-title">{t('批量生成讲解', 'Batch explanations')}</h2><p>{t('选好 PDF，一次生成；每份讲义单独排版，一起打包下载。', 'Choose PDFs, generate explanations, and download all handouts in one ZIP.')}</p></div><button onClick={close} aria-label={t('关闭并暂停', 'Close and pause')}><X size={20}/></button></header>
    <div className="auto-handout-settings"><label>{t('文件夹', 'Folder')}<select value={folder} onChange={e => setFolder(e.target.value)}><option value="all">{t('全部文件夹', 'All folders')}</option><option value="root">{t('未分类', 'Unfiled')}</option>{folders.map(item => <option key={item.id} value={item.id}>{getFolderPath(item.id, folders).map(p => p.customTitle || p.fileName).join(' / ')}</option>)}</select></label><label>{t('搜索 PDF', 'Search PDFs')}<input className="batch-handout-search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('文件名或课程', 'File or course')}/></label><label>{t('讲解深度', 'Depth')}<select disabled={!!mode} value={depth} onChange={e => { setDepth(e.target.value as HandoutDepth); setProgress({}); }}><option value="quick">{t('快速理解', 'Quick')}</option><option value="thorough">{t('仔细讲解', 'Thorough')}</option></select></label><button disabled={!!mode} onClick={() => setSelection(prev => [...new Set([...prev, ...visible.map(file => file.id)])])}>{t('选中当前列表', 'Select filtered')}</button><button disabled={!!mode} onClick={() => setSelection([])}>{t('清空选择', 'Clear')}</button></div>
    <p className="auto-handout-notice">{t('每份 PDF 先划分模块，同时讲解两个模块，按原页码保存。保持页面打开，可暂停后继续。', 'Each PDF is divided into modules; two modules are explained concurrently and saved by original page. Keep the page open; pause and resume anytime.')}</p>
    <div className="auto-handout-progress" role="status" aria-live="polite">{message || t('选择需要生成讲解的 PDF。', 'Select PDFs to explain.')}<span>{t(`已选 ${selected.length} 份`, `${selected.length} selected`)}</span></div>
    {error && <p className="auto-handout-error" role="alert">{error}</p>}
    <div className="batch-handout-list">{!visible.length && <p>{t('没有匹配的 PDF。', 'No matching PDFs.')}</p>}{visible.map(file => <div key={file.id} className="batch-handout-row"><label><input type="checkbox" disabled={!!mode} checked={selection.includes(file.id)} onChange={e => setSelection(prev => e.target.checked ? [...prev, file.id] : prev.filter(id => id !== file.id))}/><span><strong>{file.customTitle || file.fileName}</strong><small>{getFolderPath(file.parentId, folders).map(p => p.customTitle || p.fileName).join(' / ') || t('未分类', 'Unfiled')}</small></span></label>{progress[file.id] && <div className="batch-handout-file-progress"><span>{progress[file.id].message} {progress[file.id].total > 0 && `· ${progress[file.id].generated}/${progress[file.id].total}`}</span>{progress[file.id].error && <p role="alert">{progress[file.id].error}</p>}</div>}</div>)}</div>
    <footer className="auto-handout-footer"><div><p>{t('导出包含原讲义、已有标签和生成的讲解。未完成项会列在导出清单中。', 'Exports include original slides, existing notes and explanations. Incomplete items are listed in the manifest.')}</p></div>{mode ? <button onClick={() => { controller.current?.abort(); setMessage(t('正在暂停…', 'Pausing…')); }}><Pause size={16}/>{t('暂停', 'Pause')}</button> : <><button disabled={!selected.length} onClick={() => void execute('export')}><Download size={16}/>{t('全部打包导出', 'Export selected as ZIP')}</button><button className="auto-handout-primary" disabled={!selected.length} onClick={() => void execute('generate')}><Play size={16}/>{t('开始／继续生成', 'Start / resume')}</button></>}</footer>
  </div></div>;
}
