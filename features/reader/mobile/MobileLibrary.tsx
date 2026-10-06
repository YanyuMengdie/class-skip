import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, FileText, Folder, Loader2, RefreshCw } from 'lucide-react';
import type { CloudSession } from '@/types';
import { getFolderPath } from '@/shared/layout/libraryFolders';
import { getUserSessions } from '@/services/firebase';
import { isCloudUser, type WorkspaceUser } from '@/services/workspaceUser';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

export function MobileLibrary({
  user,
  onLogin,
  onOpen,
  busy,
  onFull,
  onQuickStudy,
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
  notice: string;
  cloudAvailable: boolean;
  onUseCloud: () => void;
}) {
  const { text } = useAppLanguage();
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const { files, folders, folderCounts } = useMemo(() => {
    const files = sessions.filter((item) => item.type === 'file' && /\.pdf$/i.test(item.fileName));
    const folders = sessions.filter((item) => item.type === 'folder');
    const folderCounts = new Map<string, number>();
    for (const file of files) {
      for (const folder of getFolderPath(file.parentId, folders)) {
        folderCounts.set(folder.id, (folderCounts.get(folder.id) ?? 0) + 1);
      }
    }
    return { files, folders, folderCounts };
  }, [sessions]);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const currentFolderId = folderId && folderIds.has(folderId) ? folderId : null;
  const folderPath = getFolderPath(currentFolderId, folders);
  const parentOf = (item: CloudSession) =>
    item.parentId && folderIds.has(item.parentId) ? item.parentId : null;
  const query = search.trim().toLowerCase();
  const matchesSearch = (item: CloudSession) =>
    `${item.customTitle || ''} ${item.fileName}`.toLowerCase().includes(query);
  const visibleFolders = folders.filter((folder) => query
    ? matchesSearch(folder)
    : parentOf(folder) === currentFolderId);
  const visibleFiles = files.filter((file) => query
    ? matchesSearch(file)
    : parentOf(file) === currentFolderId);
  const pathLabel = (item: CloudSession) => getFolderPath(item.parentId, folders)
    .map((folder) => folder.customTitle || folder.fileName).join(' / ') || text('资料库', 'Library');
  const openFolder = (id: string | null) => {
    setFolderId(id);
    setSearch('');
  };
  useEffect(() => {
    setFolderId(null);
    setSearch('');
  }, [user.uid]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSessions([]);
    getUserSessions(user, { throwOnError: true })
      .then((sessions) => {
        if (active) setSessions(sessions);
      })
      .catch(() => {
        if (active)
          setError(
            text(
              '资料没有加载成功，请联网后重试。',
              'Could not load your library. Reconnect and retry.',
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
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
          onClick={onQuickStudy}
          disabled={busy || loading || !files.length}
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
          <h2>{text('我的资料库', 'My library')}</h2>
          <button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={busy || loading}
            aria-label={text('刷新资料', 'Refresh library')}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <nav className="mobile-library-path" aria-label={text('文件夹位置', 'Folder location')}>
          <button disabled={busy} onClick={() => openFolder(null)}
            aria-current={!currentFolderId ? 'page' : undefined}>
            {text('资料库', 'Library')}
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
            onClick={() => openFolder(parentOf(folderPath[folderPath.length - 1]))}>
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
          <button className="mobile-file mobile-folder" key={folder.id}
            onClick={() => openFolder(folder.id)} disabled={busy}>
            <span className="mobile-file-icon"><Folder size={22} /></span>
            <span>
              <strong>{folder.customTitle || folder.fileName}</strong>
              <small>{text(
                `${folderCounts.get(folder.id) ?? 0} 份 PDF（含子文件夹）`,
                `${folderCounts.get(folder.id) ?? 0} PDFs including subfolders`,
              )}</small>
              {query && <small>{pathLabel(folder)}</small>}
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
        {visibleFiles.map((file) => (
            <button
              className="mobile-file"
              key={file.id}
              onClick={() => onOpen(file)}
              disabled={busy}
            >
              <span className="mobile-file-icon">
                <FileText size={22} />
              </span>
              <span>
                <strong>{file.customTitle || file.fileName.replace(/\.pdf$/i, '')}</strong>
                <small>{file.fileName}</small>
                {query && <small>{pathLabel(file)}</small>}
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
      </main>
    </div>
  );
}
