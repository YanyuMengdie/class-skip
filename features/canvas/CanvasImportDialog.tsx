import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, ChevronRight, ExternalLink, Eye, EyeOff, FileText,
  GraduationCap, Loader2, LockKeyhole, LogOut, RefreshCcw, X,
} from 'lucide-react';
import {
  clearCanvasConnection,
  downloadCanvasFile,
  listCanvasCourseFiles,
  listCanvasCourses,
  loadCanvasConnection,
  saveCanvasConnection,
  testCanvasConnection,
  type CanvasConnection,
  type CanvasCourse,
  type CanvasFile,
  type CanvasProfile,
} from '@/services/canvas';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { currentCourseFileLoad, type CourseFileLoad } from './courseFileView';

interface CanvasImportDialogProps {
  open: boolean;
  disabled?: boolean;
  destinationFolders: Array<{ id: string; label: string }>;
  defaultFolderId: string | null;
  onClose: () => void;
  onImport: (files: File[], parentId: string | null) => Promise<void>;
}

const DEFAULT_CANVAS_URL = 'https://q.utoronto.ca';
const canvasSettingsUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    return `${url.origin}/profile/settings`;
  } catch { return null; }
};
const canvasHostLabel = (value: string): string => {
  try { return new URL(value).hostname; } catch { return 'Canvas'; }
};
const isPdf = (file: CanvasFile) => file['content-type'] === 'application/pdf' || (file.display_name || file.filename || '').toLowerCase().endsWith('.pdf');
const formatBytes = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatDate = (value: string | undefined, language: 'zh-CN' | 'en') => value
  ? new Date(value).toLocaleDateString(language === 'en' ? 'en-CA' : 'zh-CN', { month: 'short', day: 'numeric' })
  : '';

export const CanvasImportDialog: React.FC<CanvasImportDialogProps> = ({ open, disabled = false, destinationFolders, defaultFolderId, onClose, onImport }) => {
  const { language } = useAppLanguage();
  const [canvasUrl, setCanvasUrl] = useState(DEFAULT_CANVAS_URL);
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connection, setConnection] = useState<CanvasConnection | null>(null);
  const [profile, setProfile] = useState<CanvasProfile | null>(null);
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<number | null>(null);
  const [fileLoad, setFileLoad] = useState<CourseFileLoad | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [connecting, setConnecting] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [importing, setImporting] = useState(false);
  const [finishedCount, setFinishedCount] = useState(0);
  const [destinationId, setDestinationId] = useState<string | null>(defaultFolderId);
  const [finishedDestination, setFinishedDestination] = useState('');
  const destination = destinationFolders.find(folder => folder.id === destinationId);
  const validDestination = destinationId === null || !!destination;
  const destinationLabel = destination?.label || (language === 'en' ? 'Library root' : '资料库根目录');
  const [error, setError] = useState('');
  const connectGeneration = useRef(0);
  const fileController = useRef<AbortController | null>(null);
  const currentLoad = currentCourseFileLoad(fileLoad, connection && activeCourseId ? { connection, courseId: activeCourseId, revision: reloadNonce } : null);
  const files = currentLoad?.phase === 'ready' ? currentLoad.result.files : [];
  const folders = currentLoad?.phase === 'ready' ? currentLoad.result.folders : [];
  const fileWarnings = currentLoad?.phase === 'ready' ? currentLoad.result.warnings ?? [] : [];
  const loadingFiles = !!connection && !!activeCourseId && !currentLoad;
  const fileError = currentLoad?.phase === 'error' ? currentLoad.message : '';

  const connect = async (nextConnection: CanvasConnection) => {
    const requestId = ++connectGeneration.current;
    fileController.current?.abort();
    setFileLoad(null); setSelected({}); setConnection(null);
    setConnecting(true);
    setError('');
    try {
      const [nextProfile, nextCourses] = await Promise.all([
        testCanvasConnection(nextConnection),
        listCanvasCourses(nextConnection),
      ]);
      if (requestId !== connectGeneration.current) return;
      saveCanvasConnection(nextConnection);
      setConnection(nextConnection);
      setProfile(nextProfile);
      setCourses(nextCourses);
      setActiveCourseId(nextCourses[0]?.id ?? null);
      setAccessToken('');
    } catch (connectError) {
      if (requestId !== connectGeneration.current) return;
      clearCanvasConnection();
      setConnection(null);
      setError(connectError instanceof Error ? connectError.message : language === 'en' ? 'Could not connect to Canvas.' : '连接 Canvas 失败。');
    } finally {
      if (requestId === connectGeneration.current) setConnecting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setFinishedCount(0);
    setDestinationId(defaultFolderId);
    setFinishedDestination('');
    setError('');
    const saved = loadCanvasConnection();
    if (saved) {
      setCanvasUrl(saved.canvasUrl);
      void connect(saved);
    } else {
      setConnecting(false);
    }
    return () => { ++connectGeneration.current; fileController.current?.abort(); };
  }, [open]);

  useEffect(() => {
    if (!open || !connection || !activeCourseId) {
      setFileLoad(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController(); fileController.current = controller;
    const scope = { connection, courseId: activeCourseId, revision: reloadNonce };
    setFileLoad(null);
    setSelected({});
    setError('');
    void listCanvasCourseFiles(connection, activeCourseId, { signal: controller.signal })
      .then((result) => {
        if (!cancelled) {
          setFileLoad({ scope, phase: 'ready', result });
        }
      })
      .catch((loadError) => {
        if (!cancelled) setFileLoad({ scope, phase: 'error', message: loadError instanceof Error ? loadError.message : language === 'en' ? 'Could not load files for this course.' : '无法读取这门课的文件。' });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [open, activeCourseId, connection, reloadNonce, language]);

  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.full_name || folder.name])), [folders]);
  const groupedFiles = useMemo(() => {
    const groups = new Map<string, CanvasFile[]>();
    files.forEach((file) => {
      const rawName = folderNames.get(file.folder_id) || '课程文件';
      const name = rawName.replace(/^course files\/?/i, '').trim() || '课程文件';
      groups.set(name, [...(groups.get(name) ?? []), file]);
    });
    return Array.from(groups.entries());
  }, [files, folderNames]);
  const selectedFiles = files.filter((file) => isPdf(file) && selected[file.id]);
  const activeCourse = courses.find((course) => course.id === activeCourseId) ?? null;
  const courseLink = connection && activeCourseId ? canvasSettingsUrl(connection.canvasUrl)?.replace('/profile/settings', `/courses/${activeCourseId}`) : null;

  if (!open) return null;

  const handleConnect = () => {
    if (!accessToken.trim()) {
      setError(language === 'en' ? 'Paste your Canvas access token.' : '请粘贴 Canvas 访问令牌。');
      return;
    }
    void connect({ canvasUrl: canvasUrl.trim() || DEFAULT_CANVAS_URL, accessToken: accessToken.trim() });
  };

  const handleDisconnect = () => {
    ++connectGeneration.current; fileController.current?.abort();
    clearCanvasConnection();
    setConnection(null);
    setConnecting(false);
    setProfile(null);
    setCourses([]);
    setActiveCourseId(null);
    setFileLoad(null);
    setSelected({});
    setError('');
  };

  const handleImport = async () => {
    if (!connection || disabled || importing || loadingFiles || currentLoad?.phase !== 'ready' || selectedFiles.length === 0) return;
    if (!validDestination) {
      setError(language === 'en' ? 'Choose an available destination folder.' : '原目标文件夹已不存在，请重新选择保存位置。');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const downloaded: File[] = [];
      for (const canvasFile of selectedFiles) downloaded.push(await downloadCanvasFile(connection, canvasFile));
      await onImport(downloaded, destinationId);
      setFinishedDestination(destinationLabel);
      setFinishedCount(downloaded.length);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : language === 'en' ? 'The import did not finish. Please try again.' : '导入没有完成，请稍后重试。');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-[#202822]/35 p-4 backdrop-blur-[2px]">
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-[#DCD9CF] bg-[#FBFAF6] shadow-[0_24px_70px_rgba(32,40,34,0.18)]" role="dialog" aria-modal="true" aria-labelledby="canvas-import-title">
        <header className="flex items-start justify-between gap-4 border-b border-[#DCD9CF] px-6 py-5 md:px-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6F756F]">Canvas Import</p>
            <h2 id="canvas-import-title" className="mt-2 font-serif text-2xl font-normal text-[#202822]">从 Canvas 带回课件</h2>
            <p className="mt-2 text-sm text-[#6F756F]">连接你的学校 Canvas，读取课程与课件；课程简报还可整理公告与任务安排。不会改动 Canvas。</p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="rounded-sm p-2 text-[#6F756F] hover:bg-[#E4EBE5] hover:text-[#202822] disabled:opacity-40" aria-label="关闭 Canvas 导入"><X className="h-5 w-5" /></button>
        </header>

        {!connection ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-8 md:py-10">
            <div className="mx-auto grid max-w-3xl gap-10 md:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6F756F]">01 · 连接学校账号</p>
                <h3 className="mt-3 font-serif text-3xl font-normal text-[#202822]">读取你现在真正使用的课程</h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[#6F756F]">访问令牌相当于一把临时钥匙，只保存在当前标签页的会话中。断开连接会清除令牌；浏览器恢复会话时可能保留。</p>
                <label className="mt-7 block">
                  <span className="text-xs font-semibold text-[#505851]">Canvas 地址</span>
                  <input placeholder="https://canvas.your-school.edu" value={canvasUrl} onChange={(event) => setCanvasUrl(event.target.value)} className="mt-2 w-full rounded-sm border border-[#D0CEC5] bg-[#FBFAF6] px-3.5 py-3 text-sm text-[#202822] outline-none focus:border-[#789583]" />
                </label>
                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-[#505851]">个人访问令牌</span>
                  <span className="relative mt-2 block">
                    <input type={showToken ? 'text' : 'password'} value={accessToken} onChange={(event) => setAccessToken(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleConnect(); }} placeholder="粘贴 Access Token" autoComplete="off" className="w-full rounded-sm border border-[#D0CEC5] bg-[#FBFAF6] px-3.5 py-3 pr-11 text-sm text-[#202822] outline-none focus:border-[#789583]" />
                    <button type="button" onClick={() => setShowToken((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-2 text-[#858A84] hover:bg-[#E4EBE5]" aria-label={showToken ? '隐藏令牌' : '显示令牌'}>{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </span>
                </label>
                {error && <p className="mt-3 text-sm font-medium text-[#A55B3D]">{error}</p>}
                <button type="button" onClick={handleConnect} disabled={connecting} className="mt-6 inline-flex min-w-36 items-center justify-center gap-2 rounded-sm bg-[#294B3B] px-5 py-3 text-sm font-semibold text-[#FBFAF6] hover:bg-[#202822] disabled:opacity-50">
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}{connecting ? '正在连接' : '连接 Canvas'}
                </button>
              </div>
              <aside className="rounded-sm border border-[#DCD9CF] bg-[#F3F0E8] p-5">
                <p className="text-xs font-semibold text-[#202822]">如何取得令牌</p>
                <ol className="mt-4 space-y-3 text-xs leading-5 text-[#6F756F]">
                  <li><span className="mr-2 font-serif italic text-[#3F6653]">1</span>打开 Canvas 的「账号 → 设置」</li>
                  <li><span className="mr-2 font-serif italic text-[#3F6653]">2</span>找到「Approved Integrations」</li>
                  <li><span className="mr-2 font-serif italic text-[#3F6653]">3</span>新建 Access Token 并复制</li>
                </ol>
                <a href={canvasSettingsUrl(canvasUrl) ?? undefined} aria-disabled={!canvasSettingsUrl(canvasUrl)} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3F6653] hover:text-[#294B3B]">打开 Canvas 设置 <ExternalLink className="h-3.5 w-3.5" /></a>
                <div className="mt-5 flex items-start gap-2 border-t border-[#DCD9CF] pt-4 text-[11px] leading-5 text-[#6F756F]"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3F6653]" />令牌不会上传到逃课神器账号，也不会写入资料库。</div>
              </aside>
            </div>
          </div>
        ) : finishedCount > 0 ? (
          <div className="grid min-h-[440px] place-items-center px-6 py-12 text-center">
            <div className="max-w-md"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E4EBE5] text-[#3F6653]"><Check className="h-6 w-6" /></div><p className="mt-6 font-serif text-3xl text-[#202822]">课件已经带回来了</p><p className="mt-3 text-sm leading-6 text-[#6F756F]">{language === 'en' ? `${finishedCount} Canvas PDF${finishedCount === 1 ? '' : 's'} saved to ${finishedDestination}.` : `${finishedCount} 份 Canvas PDF 已保存到「${finishedDestination}」，可以直接打开学习。`}</p><button type="button" onClick={onClose} className="mt-7 rounded-sm bg-[#294B3B] px-5 py-2.5 text-sm font-semibold text-[#FBFAF6] hover:bg-[#202822]">回到资料库</button></div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[270px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-b border-[#DCD9CF] bg-[#F3F0E8] p-5 md:border-b-0 md:border-r md:p-6">
              <div className="rounded-sm border border-[#CFD9D1] bg-[#E4EBE5] p-4">
                <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-sm bg-[#3F6653] text-white"><GraduationCap className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#202822]">{profile?.name || 'Canvas'}</p><p className="mt-0.5 truncate text-[11px] text-[#6F756F]">{canvasHostLabel(connection.canvasUrl)} · {language === 'en' ? 'Connected' : '已连接'}</p></div><button type="button" onClick={handleDisconnect} className="rounded-sm p-1.5 text-[#6F756F] hover:bg-[#FBFAF6] hover:text-[#A55B3D]" title="断开 Canvas"><LogOut className="h-3.5 w-3.5" /></button></div>
                <div className="mt-4 flex items-center gap-2 border-t border-[#C9D4CB] pt-3 text-[11px] text-[#3F6653]"><LockKeyhole className="h-3.5 w-3.5" />只读 · 不修改学校课程</div>
              </div>
              <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6F756F]">当前课程 · {courses.length}</p>
              <div className="space-y-1.5">
                {courses.map((course) => <button key={course.id} type="button" disabled={importing} onClick={() => { setSelected({}); setError(''); setActiveCourseId(course.id); }} className={`w-full rounded-sm border px-3 py-3 text-left transition-colors disabled:opacity-50 ${course.id === activeCourseId ? 'border-[#8BA697] bg-[#FBFAF6]' : 'border-transparent hover:bg-[#FBFAF6]/70'}`}><span className="block truncate text-xs font-semibold text-[#202822]">{course.course_code || course.name}</span><span className="mt-1 block truncate text-[11px] text-[#6F756F]">{course.name}</span></button>)}
                {courses.length === 0 && <p className="px-3 py-5 text-xs leading-5 text-[#6F756F]">Canvas 没有返回正在进行中的课程。</p>}
              </div>
            </aside>
            <div className="min-h-0 overflow-y-auto px-6 py-5 md:px-8 md:py-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DCD9CF] pb-5"><div className="min-w-0"><p className="text-xs text-[#6F756F]">{activeCourse?.term?.name || 'Current courses'}</p><h3 className="mt-1 truncate text-lg font-semibold text-[#202822]">{activeCourse ? `${activeCourse.course_code || ''} · ${activeCourse.name}` : '选择一门课程'}</h3></div><button type="button" disabled={!activeCourseId || loadingFiles} onClick={() => setReloadNonce((value) => value + 1)} className="inline-flex items-center gap-2 text-xs font-semibold text-[#3F6653] hover:text-[#294B3B] disabled:opacity-40"><RefreshCcw className={`h-3.5 w-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />重新读取</button></div>
              {error && <p className="mt-4 rounded-sm border border-[#D9BCAA] bg-[#F6ECE5] px-4 py-3 text-sm text-[#8D4D34]">{error}</p>}
              {fileWarnings.length > 0 && <div role="status" className="mt-4 rounded-sm border border-[#D9D1AB] bg-[#FAF6E8] px-4 py-3 text-sm text-[#75603A]">{fileWarnings.map((warning, index) => <p key={index} className={index ? 'mt-2' : ''}>{warning}</p>)}</div>}
              {(fileError || fileWarnings.length > 0) && courseLink && <a href={courseLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3F6653]">在 Canvas 打开本课 <ExternalLink className="h-3.5 w-3.5" /></a>}
              {loadingFiles ? <div className="grid min-h-72 place-items-center text-sm text-[#6F756F]"><span role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />正在读取本课可访问的课件</span></div> : fileError ? <div role="alert" className="mt-5 rounded-sm border border-[#D9BCAA] bg-[#F6ECE5] px-4 py-5 text-sm text-[#8D4D34]"><p className="font-semibold">这门课的文件列表暂时无法读取</p><p className="mt-2 leading-6">{fileError}</p><p className="mt-2 text-xs">这不是“没有课件”。其他课程的文件不会显示在这里。</p></div> : files.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><FileText className="mx-auto h-7 w-7 text-[#9DA39D]" /><p className="mt-3 text-sm font-semibold text-[#505851]">{activeCourseId ? '本次可访问的目录中未找到 PDF 或 PowerPoint' : '先选择一门课程'}</p><p className="mt-1 text-xs text-[#858A84]">其他链接中的资料或未开放内容，仍需在 Canvas 核对。</p></div></div> : (
                <div className="mt-5 space-y-6">{groupedFiles.map(([folderName, folderFiles]) => <section key={folderName}><p className="mb-2 text-xs font-semibold text-[#6F756F]">{folderName}</p><div className="divide-y divide-[#E4E0D7] border-y border-[#E4E0D7]">{folderFiles.map((file) => { const supported = isPdf(file); return <label key={file.id} className={`flex items-center gap-3 py-3.5 ${supported ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}><input type="checkbox" checked={!!selected[file.id]} disabled={!supported || importing} onChange={() => setSelected((previous) => ({ ...previous, [file.id]: !previous[file.id] }))} className="h-4 w-4 accent-[#3F6653]" /><FileText className={`h-4 w-4 shrink-0 ${supported ? 'text-[#3F6653]' : 'text-[#9B9E99]'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#202822]">{file.display_name || file.filename}</p><p className="mt-1 text-[11px] text-[#858A84]">{supported ? ['PDF', formatBytes(file.size), formatDate(file.updated_at, language)].filter(Boolean).join(' · ') : 'PowerPoint · 当前阅读器仅支持 PDF'}</p></div><ChevronRight className="h-4 w-4 text-[#B0B3AD]" /></label>; })}</div></section>)}</div>
              )}
            </div>
          </div>
        )}
        {connection && finishedCount === 0 && (
          <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-[#DCD9CF] bg-[#F3F0E8] px-6 py-4 md:px-8">
            <div className="min-w-0 flex-1 basis-64">
              <div className="mb-3 flex items-center gap-2 text-xs text-[#6F756F]"><BookOpen className="h-4 w-4" />{language === 'en' ? `${selectedFiles.length} PDFs selected` : `已选 ${selectedFiles.length} 份 PDF`}</div>
              <label className="block max-w-lg text-xs font-semibold text-[#505851]">
                {language === 'en' ? 'Save to' : '保存到'}
                <select value={destinationId ?? ''} disabled={importing || disabled}
                  onChange={event => { setDestinationId(event.target.value || null); setError(''); }}
                  className="mt-1.5 block w-full rounded-sm border border-[#D0CEC5] bg-[#FBFAF6] px-3 py-2 text-sm font-normal text-[#202822] outline-none focus:border-[#789583] disabled:opacity-50">
                  <option value="">{language === 'en' ? 'Library root (no folder)' : '资料库根目录（不放入文件夹）'}</option>
                  {!validDestination && <option value={destinationId!} disabled>{language === 'en' ? 'Folder unavailable — choose another' : '原文件夹已不存在，请重新选择'}</option>}
                  {destinationFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={importing} className="rounded-sm border border-[#D0CEC5] bg-[#FBFAF6] px-4 py-2 text-sm font-semibold text-[#505851] hover:border-[#9DA39D] disabled:opacity-40">取消</button>
              <button type="button" onClick={handleImport} disabled={disabled || importing || !validDestination || selectedFiles.length === 0} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-sm bg-[#294B3B] px-4 py-2 text-sm font-semibold text-[#FBFAF6] hover:bg-[#202822] disabled:cursor-not-allowed disabled:opacity-45">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}{importing ? '正在下载并导入' : '导入所选材料'}</button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
};
