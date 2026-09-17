import React, { useState } from 'react';
import { Coffee, FlaskConical, HelpCircle, MessagesSquare, Shuffle } from 'lucide-react';
import type { AppLanguage, TinyStudyEntryType } from '@/types';
import './entrySourceArt.css';

export interface EntrySourceArtProps {
  type: TinyStudyEntryType;
  pageStart: number;
  pageEnd: number;
  previewUrl?: string;
  language: AppLanguage;
  onOpen: () => void;
  disabled?: boolean;
}

const entrySymbols = {
  question: HelpCircle,
  experiment: FlaskConical,
  counterintuitive: Shuffle,
  debate: MessagesSquare,
  real_life: Coffee,
};

// Mount a fresh preview for each source/page so a loaded image never lingers
// when a different source is waiting for its own preview.
function SourcePreview({ url }: { url?: string }) {
  const [status, setStatus] = useState<'pending' | 'loaded' | 'failed'>('pending');
  return <span className="entry-source-art__paper">
    <span className="entry-source-art__paper-lines"><i /><i /><i /><i /><i /></span>
    {url && status !== 'failed' && <img
      src={url}
      alt=""
      draggable={false}
      className={status === 'loaded' ? 'entry-source-art__image entry-source-art__image--loaded' : 'entry-source-art__image'}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('failed')}
    />}
    <span className="entry-source-art__bookmark" />
  </span>;
}

export function EntrySourceArt({ type, pageStart, pageEnd, previewUrl, language, onOpen, disabled = false }: EntrySourceArtProps) {
  const en = language === 'en';
  const pages = pageStart === pageEnd ? String(pageStart) : `${pageStart}–${pageEnd}`;
  const Symbol = entrySymbols[type];
  const label = en ? `View source ${pageStart === pageEnd ? 'page' : 'pages'} ${pages}` : `查看原文第 ${pages} 页`;

  return <button type="button" className={`entry-source-art entry-source-art--${type}`} onClick={onOpen} disabled={disabled} aria-label={label} title={label}>
    <span className="entry-source-art__composition" aria-hidden="true">
      <span className="entry-source-art__wash" />
      <span className="entry-source-art__orbit" />
      <span className="entry-source-art__paper-back" />
      <SourcePreview key={`${pageStart}:${pageEnd}:${previewUrl || ''}`} url={previewUrl} />
      <span className="entry-source-art__symbol"><Symbol size={26} strokeWidth={1.4} /></span>
      <span className="entry-source-art__dash" />
      <span className="entry-source-art__dot" />
    </span>
    <span className="entry-source-art__caption" aria-hidden="true">{en ? 'SOURCE' : '原文'}<span>·</span>{pages}</span>
  </button>;
}
