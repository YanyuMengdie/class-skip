import { watchLibraryMetadata } from '@/services/libraryArchiveService';
import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ArrowLeft, ArrowRight, BookOpen, FileText, Folder, Loader2, RefreshCw } from 'lucide-react';
import type { CloudSession } from '@/types';
import { activeLibraryItems, archiveRoots, isArchived } from '@/features/library/archive';
import { useLibraryArchive } from '@/shared/layout/useLibraryArchive';
import { LibraryArchiveAction } from '@/shared/layout/LibraryArchiveAction';
import { getFolderPath } from '@/shared/layout/libraryFolders';
import { isCloudUser, type WorkspaceUser } from '@/services/workspaceUser';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

export function MobileLibrary({
  user,
  onLogin,
  onOpen,
  busy,
  onFull,
  onQuickStudy,
  onReadALittle,
  notice,
  onUseCloud,
  cloudAvailable,
}: {
  user: WorkspaceUser;
  onLogin: () => void;
  onOpen: (file: CloudSession) => void;
  busy: boolean;
  onFull: () => void;
  onQuickStudy: () => void;
  onReadALittle: () => void;
  notice: string;
  cloudAvailable: boolean;
  onUseCloud: () => void;
}) {
  const { text } = useAppLanguage();
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [archiveView, setArchiveView] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const archive = useLibraryArchive(user, sessions, setSessions);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const activeItems = useMemo(() => activeLibraryItems(sessions), [sessions]);
  const roots = useMemo(() => archiveRoots(sessions), [sessions]);
  const { files, folders, folderCounts } = useMemo(() => {
    const files = sessions.filter((item) => item.type === 'file' && /\.pdf$/i.test(item.fileName));
    const folders = sessions.filter((item) => item.type === 'folder');
    const folderCounts = new Map<string, number>();
    for (const file of files.filter(file => isArchived(file, sessions) === archiveView)) {
      for (const folder of getFolderPath(file.parentId, folders)) {
        folderCounts.set(folder.id, (folderCounts.get(folder.id) ?? 0) + 1);
      }
    }
    return { files, folders, folderCounts };
  }, [sessions, archiveView]);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const currentFolderId = folderId && folderIds.has(folderId) ? folderId : null;
  useEffect(() => {
    if (!loading && folderId) {
      const folder = sessions.find(row => row.id === folderId);
      if (!folder || isArchived(folder, sessions) !== archiveView) { setFolderId(null); setSearch(''); }
    }
  }, [sessions, loading, folderId, archiveView]);
  const folderPath = getFolderPath(currentFolderId, folders).filter(folder => !archiveView || isArchived(folder, sessions));
  const parentOf = (item: CloudSession) =>
    item.parentId && folderIds.has(item.parentId) ? item.parentId : null;
  const query = search.trim().toLowerCase();
  const matchesSearch = (item: CloudSession) =>
    `${item.customTitle || ''} ${item.fileName}`.toLowerCase().includes(query);
  const visibleFolders = folders.filter(folder => isArchived(folder, sessions) === archiveView).filter((folder) => query
    ? matchesSearch(folder)
    : archiveView && !currentFolderId ? roots.some(root => root.id === folder.id) : parentOf(folder) === currentFolderId);
  const visibleFiles = files.filter(file => isArchived(file, sessions) === archiveView).filter((file) => query
    ? matchesSearch(file)
    : archiveView && !currentFolderId ? roots.some(root => root.id === file.id) : parentOf(file) === currentFolderId);
  const pathLabel = (item: CloudSession) => getFolderPath(item.parentId, folders)
    .map((folder) => folder.customTitle || folder.fileName).join(' / ') || text('资料库', 'Library');
  const openFolder = (id: string | null) => {
    setFolderId(id);
    setSearch('');
  };
  const toggleSelected = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  const changeArchive = async (ids: string[]) => {
    const result = await archive.change(ids, !archiveView);
    setSelectedIds(result.failedIds);
    if (!result.failedIds.length) openFolder(null);
  };
  useEffect(() => { setSelectedIds([]); }, [folderId, search, archiveView, user.uid]);
  useEffect(() => { setArchiveView(false); setSelecting(false); }, [user.uid]);
  useEffect(() => {
    const focus = () => setRefresh(n => n + 1);
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  useEffect(() => {
    setFolderId(null);
    setSearch('');
  }, [user.uid]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSessions([]);
    const stop = watchLibraryMetadata(user, rows => {
      if (active) { setSessions(rows); setLoading(false); }
    }, () => { if (active) { setError(text('资料没有加载成功，请联网后重试。', 'Could not load your library. Reconnect and retry.')); setLoading(false); } });
    return () => {
      active = false; stop();
    };
  }, [user.uid, refresh]);
  return (
    <div className="mobile-reading mobile-library">
      <header className="mobile-header">
        <span className="mobile-brand">
          <BookOpen size={23} />
          {text('逃课神器', 'Class Skip')}
        </span>
        <button onClick={onFull} disabled={busy}>
          {text('完整版', 'Full version')}
        </button>
      </header>
      <main className="mobile-library-main">
        <p className="mobile-eyebrow">YOUR READING ROOM</p>
        <h1>{text('今天，先读一点。', 'A little reading, today.')}</h1>
        <p className="mobile-muted">
          {text('熟悉的资料，换个地方接着读。', 'The same material. A new place to keep reading.')}
        </p>
        {!isCloudUser(user) && (
          <section className="mobile-account">
            <p>
              {text(
                '登录电脑上使用的账号，接着读已有的 PDF 和领读记录。',
                'Sign in with your desktop account to continue your PDFs and guided reading.',
              )}
            </p>
            <button className="mobile-primary" onClick={cloudAvailable ? onUseCloud : onLogin}>
              {text(
                cloudAvailable ? '打开账号资料' : '登录逃课神器',
                cloudAvailable ? 'Open account library' : 'Sign in',
              )}
            </button>
          </section>
        )}
        {isCloudUser(user) && (
          <p className="mobile-note">
            {user.displayName || user.email} · {text('账号资料', 'Account library')}
          </p>
        )}
        <button
          className="mobile-quick"
          onClick={onReadALittle}
        >
          {text('读一会儿', 'Read a little')}<BookOpen size={18} />
        </button>
        <button
          className="mobile-quick"
          onClick={onQuickStudy}
          disabled={busy || loading || !activeItems.some(item => item.type === 'file')}
        >
          {text('任务太多不知道从哪里学', 'Too many tasks — where do I start?')}
          <ArrowRight size={18} />
        </button>
        {notice && (
          <p role="status" className="mobile-notice">
            {notice}
          </p>
        )}
        <div className="mobile-library-title">
          <h2>{archiveView ? text('归档资料', 'Archived material') : text('我的资料库', 'My library')}</h2>
          <button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={busy || loading}
            aria-label={text('刷新资料', 'Refresh library')}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="mobile-archive-tools">
          <button disabled={busy || archive.busy} onClick={() => { setArchiveView(value => !value); openFolder(null); }}><Archive size={14}/> {archiveView ? text('返回资料库', 'Back to library') : text('查看归档', 'View archive')}</button>
          <button disabled={busy || archive.busy} onClick={() => { setSelecting(value => !value); setSelectedIds([]); }}>{selecting ? text('完成多选', 'Done selecting') : text('多选', 'Select multiple')}</button>
          {selecting && <>
            <button disabled={busy || archive.busy} onClick={() => setSelectedIds([...visibleFolders, ...visibleFiles].map(i => i.id))}>{text('全选', 'Select all')}</button>
            <button disabled={busy || archive.busy || !selectedIds.length} onClick={() => void changeArchive(selectedIds)}>{text(archiveView ? `恢复所选 ${selectedIds.length} 项` : `归档所选 ${selectedIds.length} 项`, `${archiveView ? 'Restore' : 'Archive'} ${selectedIds.length} selected`)}</button>
          </>}
        </div>
        {archiveView && <p className="mobile-muted">{text('PDF 和记录都保留。恢复夹内资料也会恢复所属归档文件夹。', 'PDFs and history are kept. Restoring a contained item also restores its archived parent folders.')}</p>}
        {archive.notice && <div role="status" className="library-archive-notice"><span>{archive.notice}</span>{archive.canUndo && <button disabled={archive.busy} onClick={() => void archive.undoLast()}>{text('撤销', 'Undo')}</button>}<button onClick={archive.dismiss}>{text('关闭', 'Dismiss')}</button></div>}
        <nav className="mobile-library-path" aria-label={text('文件夹位置', 'Folder location')}>
          <button disabled={busy} onClick={() => openFolder(null)}
            aria-current={!currentFolderId ? 'page' : undefined}>
            {archiveView ? text('归档目录', 'Archive') : text('资料库', 'Library')}
          </button>
          {folderPath.map((folder) => (
            <React.Fragment key={folder.id}>
              <span aria-hidden="true">/</span>
              <button disabled={busy} onClick={() => openFolder(folder.id)}
                aria-current={folder.id === currentFolderId ? 'page' : undefined}>
                {folder.customTitle || folder.fileName}
              </button>
            </React.Fragment>
          ))}
        </nav>
        {currentFolderId && (
          <button className="mobile-folder-back" disabled={busy}
            onClick={() => { const parent = parentOf(folderPath[folderPath.length - 1]); openFolder(archiveView && !folders.some(f => f.id === parent && isArchived(f, sessions)) ? null : parent); }}>
            <ArrowLeft size={16} />{text('返回上级', 'Back to parent folder')}
          </button>
        )}
        <input
          aria-label={text('搜索所有 PDF 和文件夹', 'Search all PDFs and folders')}
          placeholder={text('搜索所有 PDF 和文件夹…', 'Search all PDFs and folders…')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {(busy || loading) && (
          <p role="status" className="mobile-loading">
            <Loader2 className="animate-spin" size={18} />
            {text(
              busy ? '正在恢复领读…' : '正在读取资料…',
              busy ? 'Opening guided reading…' : 'Loading library…',
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="mobile-notice">
            {error}
          </p>
        )}
        {!loading && !error && !visibleFolders.length && !visibleFiles.length && (
          <p className="mobile-muted">
            {query
              ? text('没有找到匹配的 PDF 或文件夹。', 'No matching PDFs or folders.')
              : currentFolderId
                ? text('这个文件夹里还没有 PDF 或子文件夹。', 'This folder has no PDFs or subfolders yet.')
                : text('这里还没有资料。先在电脑端上传，再回来刷新。',
                    'No material here yet. Upload on your computer, then refresh here.')}
          </p>
        )}
        {visibleFolders.map((folder) => (
          <div key={folder.id} className={`mobile-archive-row${selectedIds.includes(folder.id) ? ' is-selected' : ''}`}>
          <button className="mobile-file mobile-folder" aria-pressed={selecting ? selectedIds.includes(folder.id) : undefined}
            onClick={() => selecting ? toggleSelected(folder.id) : openFolder(folder.id)} disabled={busy || archive.busy}>
            <span className="mobile-file-icon"><Folder size={22} /></span>
            <span>
              <strong>{folder.customTitle || folder.fileName}</strong>
              <small>{text(
                `${folderCounts.get(folder.id) ?? 0} 份 PDF（含子文件夹）`,
                `${folderCounts.get(folder.id) ?? 0} PDFs including subfolders`,
              )}</small>
              {query && <small>{pathLabel(folder)}</small>}
            </span>
            {selecting && selectedIds.includes(folder.id) ? <Check size={17}/> : <ArrowRight size={17} />}
          </button>
          {!selecting && <LibraryArchiveAction name={folder.customTitle || folder.fileName} archived={archiveView} disabled={busy || archive.busy} onChange={() => changeArchive([folder.id])} />}
          </div>
        ))}
        {visibleFiles.map((file) => (
            <div key={file.id} className={`mobile-archive-row${selectedIds.includes(file.id) ? ' is-selected' : ''}`}>
            <button
              className="mobile-file" aria-pressed={selecting ? selectedIds.includes(file.id) : undefined}
              onClick={() => selecting ? toggleSelected(file.id) : onOpen(file)}
              disabled={busy || archive.busy}
            >
              <span className="mobile-file-icon">
                <FileText size={22} />
              </span>
              <span>
                <strong>{file.customTitle || file.fileName.replace(/\.pdf$/i, '')}</strong>
                <small>{file.fileName}</small>
                {query && <small>{pathLabel(file)}</small>}
              </span>
              {selecting && selectedIds.includes(file.id) ? <Check size={17}/> : <ArrowRight size={17} />}
            </button>
            {!selecting && <LibraryArchiveAction name={file.customTitle || file.fileName} archived={archiveView} disabled={busy || archive.busy} onChange={() => changeArchive([file.id])} />}
            </div>
          ))}
      </main>
    </div>
  );
}
