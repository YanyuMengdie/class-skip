import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, FileText, Loader2, RefreshCw } from 'lucide-react';
import type { CloudSession } from '@/types';
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
  const [files, setFiles] = useState<CloudSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setFiles([]);
    getUserSessions(user, { throwOnError: true })
      .then((sessions) => {
        if (active)
          setFiles(
            sessions.filter((file) => file.type === 'file' && /\.pdf$/i.test(file.fileName)),
          );
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
          <h2>{text('我的 PDF', 'My PDFs')}</h2>
          <button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={busy || loading}
            aria-label={text('刷新资料', 'Refresh library')}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <input
          aria-label={text('查找 PDF', 'Find a PDF')}
          placeholder={text('查找资料…', 'Find a PDF…')}
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
        {!loading && !error && !files.length && (
          <p className="mobile-muted">
            {text(
              '这里还没有 PDF。先在电脑端上传，再回来刷新。',
              'No PDFs here yet. Upload on your computer, then refresh here.',
            )}
          </p>
        )}
        {files
          .filter((file) =>
            `${file.customTitle || ''} ${file.fileName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((file) => (
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
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
      </main>
    </div>
  );
}
