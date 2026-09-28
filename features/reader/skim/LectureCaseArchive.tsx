import React, { useState } from 'react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, BookOpen } from 'lucide-react';
import type { LectureCaseLearningState } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import '../understanding/understanding.css';

/** No setters or generation callbacks: browsing cannot mutate saved case history. */
export function LectureCaseArchive({ state, onExit, onJumpToPage }: {
  state: LectureCaseLearningState | null;
  onExit: () => void;
  onJumpToPage?: (page: number) => void;
}) {
  const { text: t } = useAppLanguage();
  const [episodeId, setEpisodeId] = useState(state?.activeEpisodeId);
  const episodes = state?.plan?.episodes ?? [];
  const active = episodes.find(episode => episode.id === episodeId) ?? episodes[0];
  return <section className="case-reading-archive" aria-label={t('案例式领读历史', 'Case reading history')}>
    <header className="understanding-header"><button type="button" className="understanding-back" onClick={onExit}><ArrowLeft size={16}/>{t('回到领读设置', 'Back to reading setup')}</button><span>{t('历史记录 · 仅供回看', 'History · Read only')}</span></header>
    <div className="understanding-picker">
      <h2>{state?.plan?.caseTitle || t('案例式领读历史', 'Case reading history')}</h2>
      <p className="understanding-scope">{t('原有章节和对话仍保留。此模式不再生成或续写；需要帮助时，可回到领读使用“陪我想通这个”。', 'Your chapters and discussions are preserved. This mode no longer generates content. Use “Help me understand” in reading for assistance.')}</p>
      {state?.plan?.centralQuestion && <p>{state.plan.centralQuestion}</p>}
      <div className="understanding-picker-actions">{episodes.map(episode => <button type="button" key={episode.id} aria-pressed={active?.id === episode.id} onClick={() => setEpisodeId(episode.id)}>{episode.index}. {episode.title}</button>)}</div>
      {active && <><h3>{active.title}</h3><p>{active.guidingQuestion}</p>
        <div className="understanding-sources">{active.pageRefs.map(page => <button type="button" key={page} disabled={!onJumpToPage} onClick={() => onJumpToPage?.(page)}><BookOpen size={12}/>{page}</button>)}</div>
        {active.messages.length === 0 && <p className="understanding-picker-note">{t('这一章尚未生成对话；保留章节计划，不再自动开讲。', 'No conversation was generated for this chapter. Its plan is retained without starting a new discussion.')}</p>}
        {active.messages.map((message, index) => <article key={message.id || index} className={`understanding-turn ${message.role === 'user' ? 'is-user' : 'is-model'}`}><span className="understanding-speaker">{message.role === 'user' ? t('你', 'You') : t('原有讲解', 'Saved explanation')}</span><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{message.text}</ReactMarkdown>
          <div className="understanding-sources">{message.casePageRefs?.map(page => <button key={page} type="button" disabled={!onJumpToPage} onClick={() => onJumpToPage?.(page)}>{page}</button>)}</div></article>)}
      </>}
      {!episodes.length && <p>{t('没有已保存的章节对话。已有的检测记录仍可在下方查看。', 'No saved chapter discussions. Any saved analysis is available below.')}</p>}
      {state && <details className="understanding-legacy"><summary>{t('查看原有计划与学习记录', 'View saved plan and learning record')}</summary>
        {state.plan?.spineSummary && <p>{state.plan.spineSummary}</p>}
        {state.report && <><h3>{t('当时的材料分析', 'Saved material analysis')}</h3><p>{state.report.centralQuestion}</p><ul>{[...state.report.fitReasons, ...state.report.unsuitableReasons].map((reason, i) => <li key={i}>{reason}</li>)}</ul></>}
        {episodes.map(episode => <details key={episode.id}><summary>{episode.title}</summary><p>{episode.role}</p><p>{episode.openingPrompt}</p>{episode.bridgeToNext && <p>{episode.bridgeToNext}</p>}{episode.unresolvedQuestions.map((question, i) => <p key={i}>{question}</p>)}</details>)}
        {state.manifest?.units.map(unit => <div key={unit.id}><p>{unit.title}</p>{state.progress?.units[unit.id]?.evidence && <p>{state.progress.units[unit.id].evidence}</p>}</div>)}
        {state.errorMessage && <p>{state.errorMessage}</p>}
      </details>}
    </div>
  </section>;
}
