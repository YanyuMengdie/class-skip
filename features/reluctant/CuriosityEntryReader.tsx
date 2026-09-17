import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, BookOpen, ChevronLeft } from 'lucide-react';
import type { AppLanguage, TinyStudyEntry, TinyStudyEntryAction, TinyStudyEntryType } from '@/types';
import { EntrySourceArt } from './EntrySourceArt';
import { StudyBookLoader } from './StudyBookLoader';
import { remarkCuriosityReading } from './entryMarkdown';
import './curiosityEntryReader.css';

type FollowUpAction = Exclude<TinyStudyEntryAction, 'start'>;

interface CuriosityEntryReaderProps {
  entry: TinyStudyEntry;
  fileName: string;
  previewUrl?: string;
  language: AppLanguage;
  loadingAction: TinyStudyEntryAction | null;
  actionsDisabled: boolean;
  openingSource: boolean;
  error: string | null;
  cloudWarning?: boolean;
  scrollRef: React.Ref<HTMLDivElement>;
  onScroll: React.UIEventHandler<HTMLDivElement>;
  onBack: () => void;
  onOpenSource: () => void;
  onAction: (action: FollowUpAction) => void;
}

const entryTypes: Record<TinyStudyEntryType, [string, string]> = {
  question: ['一个值得好奇的问题', 'A question worth exploring'],
  experiment: ['从一个实验或案例说起', 'An experiment or a case'],
  counterintuitive: ['一个出乎意料的发现', 'An unexpected finding'],
  debate: ['从不同的观点看一看', 'A closer look at a debate'],
  real_life: ['和生活有关的一点', 'A connection to everyday life'],
};

const actionLabels: Record<TinyStudyEntryAction, [string, string]> = {
  start: ['先从这里说起', 'Let’s start here'],
  simpler: ['再讲白一点', 'Make it simpler'],
  interesting: ['为什么有意思', 'Why is this interesting?'],
  deeper: ['沿着它深入一点', 'Go a little deeper'],
};

export function CuriosityEntryReader({
  entry, fileName, previewUrl, language, loadingAction, actionsDisabled, openingSource,
  error, cloudWarning, scrollRef, onScroll, onBack, onOpenSource, onAction,
}: CuriosityEntryReaderProps) {
  const en = language === 'en';
  const label = (pair: [string, string]) => pair[en ? 1 : 0];
  const pages = entry.pageStart === entry.pageEnd ? String(entry.pageStart) : `${entry.pageStart}–${entry.pageEnd}`;
  const sourceLabel = en ? `Source · ${entry.pageStart === entry.pageEnd ? 'page' : 'pages'} ${pages}` : `原文 · 第 ${pages} 页`;

  return (
    <section className="curiosity-reading" aria-label={en ? 'Read this entry' : '兴趣入口讲解'}>
      <header className="curiosity-reading__header">
        <button type="button" className="curiosity-reading__back" onClick={onBack}>
          <ChevronLeft size={15} aria-hidden="true" />{en ? 'Try another entry' : '换一个入口'}
        </button>
        <div className="curiosity-reading__hero">
          <div className="curiosity-reading__headline">
            <div className="curiosity-reading__kicker"><span aria-hidden="true" />{label(entryTypes[entry.type])}</div>
            <h2>{entry.title}</h2>
            {entry.teaser && <p className="curiosity-reading__teaser">{entry.teaser}</p>}
          </div>
          <div className="curiosity-reading__source-art">
            <EntrySourceArt type={entry.type} pageStart={entry.pageStart} pageEnd={entry.pageEnd}
              previewUrl={previewUrl} language={language} onOpen={onOpenSource} disabled={openingSource} />
          </div>
        </div>
        <div className="curiosity-reading__source-line">
          <span className="curiosity-reading__file">{fileName}</span>
          <button type="button" onClick={onOpenSource} disabled={openingSource} className="curiosity-reading__source-link">
            <BookOpen size={14} aria-hidden="true" />{sourceLabel}<ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="curiosity-reading__scroll custom-scrollbar" tabIndex={0} aria-label={en ? 'Explanation text' : '讲解正文'}>
        <div className="curiosity-reading__body">
          {entry.turns.map((turn, index) => (
            <article key={turn.id} className={`curiosity-reading__turn${index === 0 ? ' curiosity-reading__turn--opening' : ''}`}>
              {index > 0 && <h3 className="curiosity-reading__turn-label">{label(actionLabels[turn.action])}</h3>}
              <div className="curiosity-reading__prose">
                <ReactMarkdown remarkPlugins={[[remarkCuriosityReading, { highlight: index === 0 }]]}>{turn.text}</ReactMarkdown>
              </div>
            </article>
          ))}

          {loadingAction && <div className={`curiosity-reading__waiting${entry.turns.length ? '' : ' curiosity-reading__waiting--first'}`} role="status">
            <StudyBookLoader size={entry.turns.length ? 'compact' : 'regular'} />
            <p>{en ? `Working on: ${label(actionLabels[loadingAction])}…` : `${label(actionLabels[loadingAction])}，正在讲给你听…`}</p>
          </div>}
          {!entry.turns.length && !loadingAction && !error && <p className="curiosity-reading__empty">{en ? 'Choose a way below to explore this entry.' : '从下面选一种讲法，先了解这一点。'}</p>}
          {error && <p className="curiosity-reading__notice curiosity-reading__notice--error" role="alert">{error}</p>}
          {cloudWarning && <p className="curiosity-reading__notice" role="status">{en ? 'You can keep reading, but this entry has not synced to the cloud yet.' : '可以继续阅读，但这次入口记录暂时没有同步到云端。'}</p>}
        </div>
      </div>

      <footer className="curiosity-reading__footer">
        {entry.turns.length > 0 && !loadingAction && <div className="curiosity-reading__footer-copy">
          <span>{en ? 'You can pause here.' : '读到这里就可以。'}</span>
          <span>{en ? 'Still curious? We can talk a little more.' : '还好奇的话，我们再聊一点。'}</span>
        </div>}
        <div className="curiosity-reading__actions">
          {(['simpler', 'interesting', 'deeper'] as const).map(action => <button type="button" key={action} onClick={() => onAction(action)} disabled={actionsDisabled}>
            {label(actionLabels[action])}<ArrowUpRight size={14} aria-hidden="true" />
          </button>)}
          <button type="button" className="curiosity-reading__another" onClick={onBack}>{en ? 'Another entry' : '换一个入口'}</button>
        </div>
      </footer>
    </section>
  );
}
