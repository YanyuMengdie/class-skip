import { useEffect, useState } from 'react';
import type { AppLanguage, SkimRecordCardState, SkimRecordDeck } from '@/types';
import { cachedRecordLabels, needsRecordTranslation, recordLabelSource, recordLabelsKey, translateRecordLabels, type RecordLabels } from './recordLocalization';

export function useRecordLabels(deck: SkimRecordDeck | null | undefined, language: AppLanguage) {
  const source = recordLabelSource(deck).filter(row => needsRecordTranslation(row.title, language) || needsRecordTranslation(row.summary, language));
  const key = recordLabelsKey(source, language);
  const [state, setState] = useState<{ key: string; labels?: RecordLabels; failed?: boolean }>({ key: '' });
  const [attempt, setAttempt] = useState(0);
  const labels = (state.key === key ? state.labels : undefined) ?? cachedRecordLabels(source, language);
  const failed = !labels && state.key === key && !!state.failed;

  useEffect(() => {
    if (!source.length) return;
    let current = true;
    setState({ key, labels: cachedRecordLabels(source, language) });
    void translateRecordLabels(source, language).then(
      result => { if (current) setState({ key, labels: result }); },
      () => { if (current) setState({ key, failed: true }); },
    );
    return () => { current = false; };
    // Key includes language and every source string, but excludes learning progress.
  }, [key, attempt]);

  const label = (card: SkimRecordCardState, field: 'title' | 'summary'): string => {
    if (!needsRecordTranslation(card[field], language)) return card[field];
    const translated = labels?.[card.id]?.[field];
    if (translated !== undefined) return translated;
    if (failed) return card[field];
    return field === 'title'
      ? (language === 'en' ? `Section ${card.moduleIndex}${card.partIndex ? ` · Part ${card.partIndex}` : ''}` : `第 ${card.moduleIndex} 分段`)
      : (language === 'en' ? 'Translating section details…' : '正在翻译分段简介…');
  };
  return { label, failed, retry: () => setAttempt(value => value + 1) };
}
