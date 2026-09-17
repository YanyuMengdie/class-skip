import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, BookOpen, Check, FileText, RefreshCcw } from 'lucide-react';
import { StudyBookLoader } from './StudyBookLoader';
import type { AppLanguage, CloudSession } from '@/types';
import { extractPdfText, fetchFileFromUrl, readFileAsDataURL } from '@/lib/pdf/pdfUtils';
import { generateReluctantOverviewExplanation, generateReluctantOverviewOutline } from '@/services/geminiService';
import { readingFailureMessage } from '@/services/readingAstraClient';
import { OVERVIEW_VERSION, type OverviewExplanation, type OverviewOutline, type OverviewStyle } from './overview';
import { createOverviewRequestPool, getOverviewStorageKey, readOverviewCache, writeOverviewCache, type OverviewCache } from './overviewStorage';

interface ReluctantOverviewReaderProps {
  userId: string;
  session: CloudSession;
  style: OverviewStyle;
  onStyleChange: (style: OverviewStyle) => void;
  onOpenPage: (page: number) => void;
  language: AppLanguage;
}

const requestOutline = createOverviewRequestPool<OverviewOutline>();
const requestExplanation = createOverviewRequestPool<OverviewExplanation>(24);

interface ReaderState {
  key: string;
  phase: 'outline' | 'explanation' | 'ready' | 'error';
  cache: OverviewCache | null;
  unavailable: boolean;
  error?: string;
}

const readLocalCache = (key: string) => {
  try { return readOverviewCache(window.localStorage, key); }
  catch { return { cache: null, unavailable: true }; }
};

const saveLocalCache = (key: string, cache: OverviewCache): boolean => {
  try { return writeOverviewCache(window.localStorage, key, cache); }
  catch { return false; }
};

export const ReluctantOverviewReader: React.FC<ReluctantOverviewReaderProps> = ({
  userId, session, style, onStyleChange, onOpenPage, language,
}) => {
  const text = (zh: string, en: string) => language === 'en' ? en : zh;
  const sourceKey = getOverviewStorageKey(userId, session.id, session.fileUrl, language);
  const requestKey = `${sourceKey}:${style}`;
  const liveKey = useRef(requestKey);
  liveKey.current = requestKey;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<ReaderState>({ key: requestKey, phase: 'outline', cache: null, unavailable: false });
  const readerRef = useRef<HTMLDivElement>(null);
  const scrollSave = useRef<{ key: string; cache: OverviewCache; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  const flushScroll = () => {
    const pending = scrollSave.current;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    scrollSave.current = null;
    const saved = saveLocalCache(pending.key, pending.cache);
    if (!saved && pending.key === sourceKey) {
      setState((value) => value.key === requestKey ? { ...value, unavailable: true } : value);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const current = () => !cancelled && liveKey.current === requestKey;
    const restored = readLocalCache(sourceKey);
    const cached = restored.cache;
    setState({ key: requestKey, phase: cached?.explanations[style] ? 'ready' : cached ? 'explanation' : 'outline', cache: cached, unavailable: restored.unavailable });

    if (cached?.explanations[style]) return () => { cancelled = true; };

    const prepare = async () => {
      try {
        const outline = cached?.outline ?? await requestOutline(sourceKey, async () => {
          if (!session.fileUrl) throw new Error('Missing document');
          const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
          const [content, pages] = await Promise.all([readFileAsDataURL(file), extractPdfText(file)]);
          // Attach the complete PDF even if a scanned page has no extractable text.
          return generateReluctantOverviewOutline(content, {
            fileName: session.customTitle || session.fileName,
            pageCount: pages.length,
            language,
          });
        });
        if (!current()) return;
        let next: OverviewCache = cached ?? { version: OVERVIEW_VERSION, outline, explanations: {}, scrollPositions: {}, updatedAt: Date.now() };
        let unavailable = !saveLocalCache(sourceKey, next);
        setState({ key: requestKey, phase: 'explanation', cache: next, unavailable });
        // Include the actual outline so a refreshed outline cannot reuse an older variant.
        const explanation = await requestExplanation(`${requestKey}:${JSON.stringify(outline)}`, () =>
          generateReluctantOverviewExplanation(outline, style, { language }),
        );
        if (!current()) return;
        next = { ...next, explanations: { ...next.explanations, [style]: explanation }, updatedAt: Date.now() };
        unavailable = !saveLocalCache(sourceKey, next);
        setState({ key: requestKey, phase: 'ready', cache: next, unavailable });
      } catch (error) {
        if (current()) setState((value) => ({ ...value, key: requestKey, phase: 'error', error: readingFailureMessage(error,
          text('可能是资料暂时打不开，或生成中断了。可以再试一次。', 'The document may be unavailable, or generation was interrupted. Please try again.')) }));
      }
    };
    void prepare();
    return () => { cancelled = true; };
  }, [sourceKey, requestKey, retry]);

  const visibleState = state.key === requestKey ? state : null;
  const cache = visibleState?.cache;
  const explanation = cache?.explanations[style];
  const ready = visibleState?.phase === 'ready' && !!explanation;

  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      if (readerRef.current) readerRef.current.scrollTop = cache?.scrollPositions[style] ?? 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [requestKey, ready]);

  // Flush the user's latest reading position when changing styles or leaving the reader.
  useEffect(() => () => { flushScroll(); }, [requestKey]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!ready || !cache) return;
    const scrollTop = event.currentTarget.scrollTop;
    const previous = scrollSave.current;
    if (previous?.timer) clearTimeout(previous.timer);
    const next = {
      ...cache,
      scrollPositions: { ...cache.scrollPositions, [style]: scrollTop },
      updatedAt: Date.now(),
    };
    scrollSave.current = { key: sourceKey, cache: next, timer: setTimeout(flushScroll, 250) };
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dcded5] bg-[#fffdf8] shadow-sm" aria-label={text('整份资料讲解', 'Document overview')}>
      <p className="truncate border-b border-[#e4e4da] px-5 py-3 text-sm text-[#74786e] md:px-8" title={session.customTitle || session.fileName}>{session.customTitle || session.fileName}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e4da] px-5 py-4 md:px-8">
        <div className="inline-flex rounded-xl bg-[#eeeee5] p-1" role="group" aria-label={text('讲解方式', 'Explanation style')}>
          {(['plain', 'story'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={style === option}
              onClick={() => { flushScroll(); onStyleChange(option); }}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d6353] ${style === option ? 'bg-white text-[#294d3f] shadow-sm' : 'text-[#74786e] hover:text-[#294d3f]'}`}
            >
              {option === 'plain' ? text('大白话讲解', 'Plain-language explanation') : text('故事讲解', 'Story explanation')}
            </button>
          ))}
        </div>
        {ready && !visibleState?.unavailable && (
          <span className="flex items-center gap-1.5 text-xs text-[#788273]"><Check className="h-3.5 w-3.5" />{text('已保存在这台设备', 'Saved on this device')}</span>
        )}
      </div>

      {visibleState?.unavailable && (
        <p role="status" className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm leading-relaxed text-amber-800 md:px-8">
          {text('内容可以继续看，但暂时没能保存在这台设备上。关闭页面后可能需要重新生成。', 'You can keep reading, but this device could not save it. You may need to generate it again after closing the page.')}
        </p>
      )}

      {!ready && visibleState?.phase !== 'error' && (
        <div role="status" aria-live="polite" className="flex min-h-[340px] flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-5"><StudyBookLoader /></div>
          <p className="text-lg font-semibold text-[#344f42]">
            {visibleState?.phase === 'explanation'
              ? style === 'plain' ? text('把主要内容换成好懂的话', 'Putting the main ideas into everyday language') : text('把主要内容串成一段故事', 'Connecting the main ideas into a story')
              : text('先把整份资料读一遍', 'Reading through the whole document')}
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#7a8176]">{text('第一次需要一点时间。准备好后，下次可以直接接着看。', 'The first explanation takes a little time. Once saved, you can pick it up again next time.')}</p>
        </div>
      )}

      {visibleState?.phase === 'error' && (
        <div role="alert" className="flex min-h-[340px] flex-col items-center justify-center px-6 py-14 text-center">
          <BookOpen className="mb-4 h-7 w-7 text-[#967b5c]" />
          <p className="text-lg font-semibold text-[#514b3f]">{text('这次讲解没准备好', 'This explanation is not ready yet')}</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[#7a8176]">{visibleState.error}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#335c49] px-5 py-3 text-sm font-semibold text-white hover:bg-[#274d3c]">
            <RefreshCcw className="h-4 w-4" />{text('再试一次', 'Try again')}
          </button>
        </div>
      )}

      {ready && explanation && cache && (
        <div key={requestKey} ref={readerRef} onScroll={handleScroll} className="max-h-[72vh] min-h-[340px] overflow-y-auto px-6 py-8 md:px-12 md:py-10 custom-scrollbar" tabIndex={0} aria-label={text('讲解正文', 'Explanation text')}>
          <article className="mx-auto max-w-[760px]">
            <div className="mb-7 flex items-center gap-2 text-xs font-semibold tracking-wide text-[#7c8679]">
              <BookOpen className="h-4 w-4" />{text('整份资料的主线', 'The main thread of the document')}
            </div>
            <h2 className="mb-8 font-serif text-2xl font-semibold leading-relaxed text-[#304c3d] md:text-3xl">{explanation.title}</h2>
            <div className="space-y-8">
              {explanation.sections.map((section, index) => {
                const pointIds = new Set(section.pointIds);
                const pages = [...new Set(cache.outline.points.filter((point) => pointIds.has(point.id)).flatMap((point) => point.pages))].sort((a, b) => a - b);
                return (
                  <section key={index}>
                    <div className="text-[17px] leading-[1.95] text-[#444d43] md:text-[18px]">
                      <ReactMarkdown
                        skipHtml
                        allowedElements={['p', 'strong', 'em', 'br', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4']}
                        unwrapDisallowed
                        components={{
                          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-[#335541]">{children}</strong>,
                          h3: ({ children }) => <h3 className="mb-3 mt-5 text-lg font-semibold text-[#335541]">{children}</h3>,
                          h4: ({ children }) => <h4 className="mb-3 mt-5 font-semibold text-[#335541]">{children}</h4>,
                          ul: ({ children }) => <ul className="mb-4 list-disc space-y-2 pl-6">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-4 list-decimal space-y-2 pl-6">{children}</ol>,
                          blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-[#c8d5c4] pl-4">{children}</blockquote>,
                        }}
                      >{section.text}</ReactMarkdown>
                    </div>
                    {pages.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#879080]">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{text('对应原页', 'Source pages')}</span>
                        {pages.map((page) => (
                          <button key={page} type="button" onClick={() => { flushScroll(); onOpenPage(page); }} aria-label={text(`查看 PDF 第 ${page} 页`, `Open PDF page ${page}`)} className="rounded-md border border-[#e0e5d9] px-2 py-1 text-[#5a7259] transition-colors hover:bg-[#edf2e7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#557255]">
                            {page}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4e8dc] pt-6">
              <p className="text-sm text-[#7f8878]">{text('先看到这里，也很好。', 'This is a good place to stop for now.')}</p>
              <button type="button" onClick={() => readerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#677b5f] hover:bg-[#eef2e7]">
                <ArrowUp className="h-3.5 w-3.5" />{text('回到开头', 'Back to the beginning')}
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
};
