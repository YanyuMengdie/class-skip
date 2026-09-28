import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AppLanguage } from '@/types';
import { useOutputLanguage } from './appLanguage';
import { cachedExplanation, explanationSegments, requestsChinese, translatedMarkdown, translateExplanation } from './explanationTranslation';

type TranslationOptions = { language?: AppLanguage; enabled?: boolean; userRequest?: string; markdown?: boolean };
export function useTranslatedExplanation(source: string, options: TranslationOptions = {}) {
  const appLanguage = useOutputLanguage();
  const language = options.language ?? appLanguage;
  const enabled = options.enabled !== false && language === 'en' && !requestsChinese(options.userRequest);
  const segments = useMemo(() => !enabled ? [] : options.markdown === false
    ? (/\p{Script=Han}/u.test(source) ? [{ start: 0, end: source.length, text: source }] : [])
    : explanationSegments(source), [source, enabled, options.markdown]);
  const key = JSON.stringify([enabled, source, options.markdown]);
  const [state, setState] = useState<{ key: string; text?: string; failed?: boolean }>({ key: '' });
  const [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const assemble = (values: string[]) => options.markdown === false ? values[0] : translatedMarkdown(source, segments, values);
  const cached = segments.map(segment => cachedExplanation(segment.text));
  const cachedText = segments.length && cached.every(text => text !== undefined) ? assemble(cached as string[]) : undefined;
  useEffect(() => {
    if (!segments.length || !visible || cachedText !== undefined) return;
    let current = true;
    setState({ key });
    void Promise.all(segments.map(segment => translateExplanation(segment.text))).then(
      result => { if (current) setState({ key, text: assemble(result) }); },
      () => { if (current) setState({ key, failed: true }); },
    );
    return () => { current = false; };
  }, [key, visible, attempt, cachedText]);
  const text = cachedText ?? (state.key === key ? state.text : undefined);
  const failed = segments.length > 0 && !text && state.key === key && !!state.failed;
  return { value: segments.length ? text ?? source : source, ref, failed,
    pending: segments.length > 0 && visible && !text && !failed, retry: () => setAttempt(value => value + 1) };
}

export function ExplanationTranslationStatus({ state }: { state: ReturnType<typeof useTranslatedExplanation> }) {
  return state.failed ? <div role="status" className="text-xs text-amber-700 my-2">
    Translation is unavailable. Showing the original explanation.{' '}
    <button type="button" onClick={state.retry} className="underline">Retry translation</button>
  </div> : state.pending ? <div role="status" className="text-xs text-stone-500 my-2">Translating explanation into English…</div> : null;
}

type Props = React.ComponentProps<typeof ReactMarkdown> & Omit<TranslationOptions, 'markdown'>;
export default function ExplanationMarkdown({ children = '', language, enabled, userRequest, ...props }: Props) {
  const state = useTranslatedExplanation(children, { language, enabled, userRequest });
  return <div ref={state.ref} data-preserve-language="true">
    <ExplanationTranslationStatus state={state} />
    <ReactMarkdown {...props}>{state.value}</ReactMarkdown>
  </div>;
}

export function ExplanationText({ children, language, userRequest }: { children: string; language?: AppLanguage; userRequest?: string }) {
  const state = useTranslatedExplanation(children, { language, userRequest, markdown: false });
  // Inline copies share the same batched translator; a plain-text wrapper avoids
  // reparsing titles, answer feedback and diagram labels as Markdown.
  return <span data-preserve-language="true"><span ref={state.ref as React.RefObject<HTMLSpanElement>}>{state.value}</span>
    {state.failed && <button type="button" onClick={state.retry} className="ml-1 text-xs underline" title="Retry translation">↻</button>}
  </span>;
}
