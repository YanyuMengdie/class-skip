import React from 'react';
import { ArrowRight, BookOpen, FileText, Lightbulb } from 'lucide-react';
import type { AppLanguage } from '@/types';
import type { TinyStudyAction } from '@/services/geminiService';
import { OverviewProse } from './OverviewProse';
import { StudyBookLoader } from './StudyBookLoader';
import './overviewReader.css';
import './linearStudyReader.css';

type FollowUpAction = Exclude<TinyStudyAction, 'start' | 'next'>;
type Turn = {
  id: string;
  action: 'start' | 'next';
  text: string;
  followUps: Array<{ id: string; action: FollowUpAction; text: string }>;
};

type Props = {
  title: string;
  language: AppLanguage;
  turns: Turn[];
  loading: boolean;
  loadingTargetId: string | null;
  loadingAction: TinyStudyAction | null;
  error: string | null;
  canStart: boolean;
  canOpen: boolean;
  onStep: (action: TinyStudyAction, targetId?: string) => void;
  onOpen: () => void;
};

/** Presentation only: generation, history and progression remain owned by Dashboard. */
export function LinearStudyReader({ title, language, turns, loading, loadingTargetId, loadingAction, error, canStart, canOpen, onStep, onOpen }: Props) {
  const en = language === 'en';
  const labels: Record<FollowUpAction, string> = {
    simpler: en ? 'A simpler explanation' : '讲白一点',
    deeper: en ? 'A little more detail' : '多讲一点',
    example: en ? 'Another example' : '换个例子',
  };
  const actions: FollowUpAction[] = ['simpler', 'deeper', 'example'];
  const prose = (value: string) => <OverviewProse value={value} caveats={[]} language={language} />;
  const waiting = <div className="linear-study-waiting" role="status">
    <StudyBookLoader size="compact" />
    <span>{loadingTargetId && loadingAction && actions.includes(loadingAction as FollowUpAction)
      ? (en ? `Preparing: ${labels[loadingAction as FollowUpAction]}…` : `正在${labels[loadingAction as FollowUpAction]}…`)
      : (en ? 'Putting the next part into simple words…' : '正在用最简单的话讲给你听…')}</span>
  </div>;

  return <section className="linear-study-reader" aria-label={en ? 'Read one small part at a time' : '大白话从头讲'}>
    <p className="linear-study-filename" title={title} data-preserve-language="true">{title}</p>
    <div className="linear-study-toolbar">
      <span className="linear-study-mode"><BookOpen size={16} aria-hidden="true" />{en ? 'Plain-language reading' : '大白话讲解'}</span>
      <span className="linear-study-caption">{en ? 'One small part at a time' : '一次只讲一小段，按你的节奏来'}</span>
    </div>
    <div className="overview-reader-scroll custom-scrollbar" tabIndex={0} aria-label={en ? 'Explanation' : '讲解正文'}>
      <div className="overview-article" lang={language} data-preserve-language="true">
        <header className="linear-study-intro">
          <div className="overview-eyebrow">{en ? 'TAKE IT SLOWLY' : '慢慢读，不用急'}</div>
          <h2 className="overview-title">{en ? 'Let’s start with one small part.' : '先读懂这一小段。'}</h2>
          <p>{en ? 'Read the explanation here. We’ll move on whenever you’re ready.' : '先看这里的讲解。想明白了，再往下走。'}</p>
        </header>
        {turns.map((turn, index) => <article className="overview-section linear-study-section" key={turn.id}>
          <div className="overview-section-heading">
            <span className="overview-section-number">{String(index + 1).padStart(2, '0')}</span>
            <h3>{en ? `Part ${index + 1}` : `第 ${index + 1} 小段`}</h3>
          </div>
          {prose(turn.text)}
          {turn.followUps.map(followUp => <aside key={followUp.id} className={`linear-study-followup linear-study-followup--${followUp.action}`}>
            <div className="linear-study-followup-label"><Lightbulb size={16} aria-hidden="true" />{labels[followUp.action]}</div>
            {prose(followUp.text)}
          </aside>)}
          {loading && loadingTargetId === turn.id && waiting}
          <div className="linear-study-actions" aria-label={en ? `Explore part ${index + 1}` : `再聊聊第 ${index + 1} 小段`}>
            {actions.map(action => <button type="button" key={action} disabled={!canStart} onClick={() => onStep(action, turn.id)}>
              {action === 'simpler' ? (en ? 'Make it simpler' : '这段讲白一点') : action === 'deeper' ? (en ? 'Tell me more' : '这段多讲一点') : labels.example}
            </button>)}
          </div>
        </article>)}
        {!turns.length && !loading && <p className="linear-study-empty">{en ? 'No need to open the PDF yet. Start here, and we’ll take it a little at a time.' : '先不用打开资料。点下方开始，我们从开头慢慢讲。'}</p>}
        {loading && !loadingTargetId && waiting}
        {error && <div className="linear-study-error" role="alert">{error}</div>}
      </div>
    </div>
    <footer className="linear-study-footer">
      <button type="button" className="linear-study-next" onClick={() => onStep(turns.length ? 'next' : 'start')} disabled={!canStart}>
        {turns.length ? (en ? 'Continue to the next part' : '继续下一小段') : (en ? 'Start from the beginning' : '从开头开始讲')}<ArrowRight size={16} aria-hidden="true" />
      </button>
      <button type="button" className="linear-study-source" disabled={!canOpen} onClick={onOpen}><FileText size={16} aria-hidden="true" />{en ? 'Open material' : '打开资料'}</button>
    </footer>
  </section>;
}
