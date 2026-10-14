import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Loader2, MoreHorizontal, X } from 'lucide-react';
import { MobileReadingSheet, MobileReadingToolsContext } from './MobileReadingTools';
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTarget, setToolsTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => { setToolsOpen(false); }, [activeIndex, title]);
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
      <header className="mobile-reader-top">
        <span className="mobile-reader-short-title" data-preserve-language="true">{title.replace(/\.pdf$/i, '')}</span>
        <button type="button" onClick={() => setToolsOpen(true)} aria-label={text('打开领读工具', 'Open reading tools')} aria-haspopup="dialog"><MoreHorizontal size={20}/></button>
      </header>
      <MobileReadingSheet open={toolsOpen} onClose={() => setToolsOpen(false)} title={text('领读工具', 'Reading tools')}>
        <p className="mobile-tools-file" data-preserve-language="true">{title}</p>
        <p className="mobile-tools-status" role="status">{status}</p>
        <div ref={setToolsTarget} className="mobile-tools-reading" />
        <details className="mobile-tools-switcher">
          <summary>{text('切换领读', 'Switch reading')}</summary>
          <div className="mobile-session-picker">
            {sessions.map((session, index) => <button type="button" key={session.id} disabled={busy || loading}
              aria-current={index === activeIndex ? 'true' : undefined} onClick={() => { onSelect(index); setToolsOpen(false); }}>
              {session.title}{index === activeIndex ? ' ✓' : ''}
            </button>)}
            <button type="button" disabled={busy || loading || sessions.length >= 10} onClick={() => { onAdd(); setToolsOpen(false); }}>{text('＋ 新建领读', '+ New reading')}</button>
          </div>
        </details>
        <div className="mobile-tools-navigation">
          <button type="button" disabled={busy} onClick={() => { setToolsOpen(false); onBack(); }}><ArrowLeft size={17}/>{text('返回资料库', 'Back to library')}</button>
          <button type="button" disabled={busy} onClick={() => { setToolsOpen(false); onFull(); }}>{text('切换完整版', 'Switch to full version')}</button>
        </div>
      </MobileReadingSheet>
      <MobileReadingToolsContext.Provider value={{ target: toolsTarget, open: () => setToolsOpen(true), close: () => setToolsOpen(false) }}>
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
      </MobileReadingToolsContext.Provider>
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
