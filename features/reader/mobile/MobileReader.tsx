import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Loader2, X } from 'lucide-react';
import { renderPdfPagePreview } from '@/lib/pdf/pdfUtils';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

export function MobileReader({
  title,
  sessions,
  activeIndex,
  onSelect,
  onAdd,
  busy,
  loading,
  onBack,
  onFull,
  status,
  children,
  file,
  sourcePage,
  onSourcePage,
  onCloseSource,
}: {
  title: string;
  sessions: Array<{ id: string; title: string }>;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  busy: boolean;
  loading: boolean;
  onBack: () => void;
  onFull: () => void;
  status: string;
  children: React.ReactNode;
  file: File | null;
  sourcePage: number | null;
  onSourcePage: (page: number) => void;
  onCloseSource: () => void;
}) {
  const { text } = useAppLanguage();
  const [switcher, setSwitcher] = useState(false);
  const [image, setImage] = useState('');
  const [sourceError, setSourceError] = useState(false);
  useEffect(() => {
    if (!file || sourcePage == null) return;
    let active = true;
    setImage('');
    setSourceError(false);
    renderPdfPagePreview(file, sourcePage, 1.35)
      .then((value) => {
        if (active) setImage(value);
      })
      .catch(() => {
        if (active) setSourceError(true);
      });
    return () => {
      active = false;
    };
  }, [file, sourcePage]);
  return (
    <div className="mobile-reading mobile-reader">
      <header className="mobile-header">
        <button onClick={onBack} disabled={busy} aria-label={text('回到资料库', 'Back to library')}>
          <ArrowLeft size={21} />
        </button>
        <div className="mobile-reader-title">
          <strong>{title}</strong>
          <small role="status">{status}</small>
        </div>
        <button onClick={() => setSwitcher((value) => !value)} disabled={loading}>
          {text('切换领读', 'Readings')}
        </button>
      </header>
      {switcher && (
        <section className="mobile-session-picker" aria-label={text('切换领读', 'Switch reading')}>
          {sessions.map((session, index) => (
            <button
              key={session.id}
              disabled={busy}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => {
                onSelect(index);
                setSwitcher(false);
              }}
            >
              {session.title}
              {index === activeIndex ? ' ✓' : ''}
            </button>
          ))}
          <button
            disabled={busy || sessions.length >= 10}
            onClick={() => {
              onAdd();
              setSwitcher(false);
            }}
          >
            {text('＋ 新建领读', '+ New reading')}
          </button>
          <button disabled={busy} onClick={onFull}>
            {text('切换完整版', 'Switch to full version')}
          </button>
        </section>
      )}
      <main className="mobile-reader-content">
        {loading ? (
          <div className="mobile-loading">
            <Loader2 className="animate-spin" />
            {text('正在恢复页面与领读记录…', 'Restoring guided reading…')}
          </div>
        ) : (
          children
        )}
      </main>
      {sourcePage != null && (
        <section
          className="mobile-source"
          role="dialog"
          aria-modal="true"
          aria-label={text('查看原文', 'Original PDF')}
        >
          <header className="mobile-header">
            <FileText size={20} />
            <strong>{text(`原文第 ${sourcePage} 页`, `Original page ${sourcePage}`)}</strong>
            <button onClick={onCloseSource} aria-label={text('回到解析', 'Back to reading')}>
              <X size={20} />
            </button>
          </header>
          <div className="mobile-source-body">
            {sourceError ? (
              <p role="alert">
                {text(
                  '这一页没有加载成功，请关闭后重试。',
                  'Could not load this page. Close and retry.',
                )}
              </p>
            ) : image ? (
              <img src={image} alt={text(`PDF 第 ${sourcePage} 页`, `PDF page ${sourcePage}`)} />
            ) : (
              <Loader2 className="animate-spin" />
            )}
          </div>
          <footer>
            <button onClick={() => onSourcePage(sourcePage - 1)} disabled={sourcePage <= 1}>
              <ChevronLeft />
              {text('上一页', 'Previous')}
            </button>
            <button onClick={onCloseSource}>{text('回到解析', 'Back to reading')}</button>
            <button onClick={() => onSourcePage(sourcePage + 1)}>
              {text('下一页', 'Next')}
              <ChevronRight />
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
