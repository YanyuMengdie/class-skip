import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AppLanguage } from '@/types';
import { parseStudyTerms, splitStudyTerms, type StudyTerm } from './studyTerms';
import './studyTerms.css';

const empty: StudyTerm[] = [];
const Context = createContext<{ terms: StudyTerm[]; open?: (term: StudyTerm, trigger: HTMLElement) => void }>({ terms: empty });
export const useStudyTerms = () => useContext(Context);

export function StudyTerms({ terms, language, children }: { terms?: StudyTerm[]; language: AppLanguage; children: React.ReactNode }) {
  const validated = useMemo(() => parseStudyTerms(terms) ?? empty, [terms]);
  const [selected, setSelected] = useState<{ term: StudyTerm; trigger: HTMLElement } | null>(null);
  const context = useMemo(() => ({ terms: validated, open: (term: StudyTerm, trigger: HTMLElement) => setSelected({ term, trigger }) }), [validated]);
  return <Context.Provider value={context}>
    {children}
    {selected && <TermDialog term={selected.term} trigger={selected.trigger} language={language} onClose={() => setSelected(null)} />}
  </Context.Provider>;
}

function TermDialog({ term, trigger, language, onClose }: { term: StudyTerm; trigger: HTMLElement; language: AppLanguage; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId(); const en = language === 'en';
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      // StrictMode immediately sets the effect up again. Do not move focus out
      // of that reopened dialog when the previous cleanup's microtask runs.
      queueMicrotask(() => { if (!dialog.open && trigger.isConnected) trigger.focus(); });
    };
  }, []);
  return <dialog data-preserve-language="true" className="study-term-dialog" ref={ref} aria-labelledby={id} aria-describedby={`${id}-meaning`}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={event => {
      // close() queues this event. StrictMode may have reopened the same dialog
      // before it arrives; that stale event must not discard the selected term.
      if (!event.currentTarget.open) onClose();
    }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <div className="study-term-dialog-top"><span>{en ? 'In plain language' : '用大白话说'}</span><button type="button" autoFocus onClick={onClose} aria-label={en ? 'Close definition' : '关闭释义'}>×</button></div>
    <h3 id={id}>{term.term}</h3>
    {term.term.toLowerCase() !== term.english.toLowerCase() && <p className="study-term-name" lang="en">{term.english}</p>}
    <p id={`${id}-meaning`} className="study-term-meaning">{term.explanation}</p>
  </dialog>;
}

export function StudyTermButton({ index, showEnglish, children }: { index: number; showEnglish: boolean; children: React.ReactNode }) {
  const { terms, open } = useStudyTerms(); const term = terms[index];
  if (!term || !open) return <>{children}</>;
  return <button type="button" className="study-term" aria-haspopup="dialog" onClick={event => open(term, event.currentTarget)}>
    {children}{showEnglish && <span className="study-term-english" lang="en">（{term.english}）</span>}
  </button>;
}

/** For plain diagram labels; Markdown remains the responsibility of OverviewProse. */
export function StudyTermText({ value }: { value: string }) {
  const { terms } = useStudyTerms();
  return <>{splitStudyTerms(value, terms).map((part, i) => part.index === undefined ? <React.Fragment key={i}>{part.text}</React.Fragment>
    : <StudyTermButton key={i} index={part.index} showEnglish={!!part.showEnglish}>{part.text}</StudyTermButton>)}</>;
}
