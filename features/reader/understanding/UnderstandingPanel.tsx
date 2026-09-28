import { previousLearnerRequest } from '@/shared/i18n/explanationTranslation';
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import remarkGfm from 'remark-gfm';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { useSupportSurface } from '@/features/studySupport/StudySupportContext';
import { UnderstandingConversation, type UnderstandingConversationProps } from './UnderstandingConversation';
import { createGuidedUnderstanding, savedUnderstandingDiscussions } from './guidedUnderstanding';
import type { UnderstandingTopic } from './understandingPlan';
import './understanding.css';

type Props = Pick<UnderstandingConversationProps, 'session' | 'documentContent' | 'pageTexts' | 'onUpdate' | 'onClose' | 'onBusyChange' | 'onJumpToPage' | 'generateTurn'>;
export const UnderstandingPanel: React.FC<Props> = props => {
  const { session, onUpdate, onClose } = props;
  const { text: t } = useAppLanguage();
  const [view, setView] = useState<'entry' | 'specific' | 'conversation'>('entry');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const active = session.guidedDiscussions?.find(item => item.id === activeId);
  const start = (topic?: UnderstandingTopic, questionText = '') => {
    const discussion = createGuidedUnderstanding(session, topic, questionText);
    onUpdate(previous => ({ ...previous, guidedDiscussions: [...(previous.guidedDiscussions ?? []), discussion] }));
    setActiveId(discussion.id); setView('conversation');
  };
  useSupportSurface({ scope: `understanding-picker:${session.id}`, priority: 15, actions: [] });
  if (view === 'conversation' && active) return <UnderstandingConversation {...props}
    key={active.id} session={active} autoStart={active.turns.length === 0}
    minutes={5} onMinutesChange={() => {}} needsReview={Boolean(active.reviewRequested)}
    onReview={value => onUpdate(previous => ({ ...previous, guidedDiscussions: previous.guidedDiscussions?.map(item => item.id === active.id ? { ...item, reviewRequested: value } : item) }))}
    onFinish={onClose} onClose={onClose}
    onUpdate={update => onUpdate(previous => ({ ...previous, guidedDiscussions: previous.guidedDiscussions?.map(item => item.id === active.id ? update(item) : item) }))}
  />;
  const earlier = savedUnderstandingDiscussions(session);
  return <section className="understanding-panel" aria-label={t('陪我想通这个', 'Help me understand')} data-preserve-language="true">
    <header className="understanding-header"><button type="button" onClick={onClose} className="understanding-back"><ArrowLeft size={16}/>{t('回到领读', 'Back to reading')}</button></header>
    <div className="understanding-picker understanding-guided-picker">
      <p className="understanding-eyebrow"><Lightbulb size={15}/>{t('陪我想通这个', 'Help me understand')}</p>
      <h2>{view === 'specific' ? t('是哪一处，让你卡住了？', 'Where did you get stuck?') : t('不用先说清自己哪里不懂。', 'You don’t have to pinpoint the problem yet.')}</h2>
      <p className="understanding-scope">{t('就从你点击的这条领读开始。先讲清背景，再一起想一小步。', 'We’ll use the reading message you opened: background first, then one small step together.')}</p>
      {view === 'entry' ? <div className="understanding-entry-choices">
        <button type="button" onClick={() => start()}><span><strong>{t('整段都没进脑子', 'The whole passage hasn’t sunk in')}</strong><small>{t('先用大白话重新讲，再陪你推一步。', 'Start in plain language, then reason through one step.')}</small></span><ArrowRight size={18}/></button>
        <button type="button" onClick={() => setView('specific')}><span><strong>{t('有一个地方想不通', 'One part is unclear')}</strong><small>{t('指给我看，我们只拆开那个地方。', 'Point it out, and we’ll focus on that part.')}</small></span><ArrowRight size={18}/></button>
      </div> : <>
        <div className="understanding-entry-choices">{session.plan?.topics.map(topic => <button type="button" key={topic.id} onClick={() => start(topic)}><span><strong>{topic.title}</strong><small>{topic.preview || topic.summary.slice(0, 160)}</small></span><ArrowRight size={16}/></button>)}</div>
        <form className="understanding-specific-form" onSubmit={event => { event.preventDefault(); if (question.trim()) start(undefined, question); }}>
          <label htmlFor={`understanding-question-${session.id}`}>{t('也可以贴一句话，或说说哪里卡住', 'Or quote a sentence or describe the difficulty')}</label>
          <textarea id={`understanding-question-${session.id}`} rows={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('比如：这两件事为什么有关系？', 'For example: why are these two things connected?')}/>
          <div className="understanding-picker-actions"><button type="submit" className="is-primary" disabled={!question.trim()}>{t('从这里帮我拆开', 'Help me with this')}</button><button type="button" onClick={() => setView('entry')}>{t('换一种帮法', 'Choose another approach')}</button></div>
        </form>
      </>}
      <details className="understanding-scope-details"><summary>{t('看看刚才那条讲解', 'View the reading message')}</summary><div className="understanding-saved-source"><ReactMarkdown remarkPlugins={[remarkGfm]}>{session.sourceText}</ReactMarkdown></div></details>
      {earlier.length > 0 && <details className="understanding-legacy"><summary>{t('已保存的辅导对话', 'Saved discussions')} · {earlier.length}</summary>
        {earlier.map(discussion => <details key={discussion.id}><summary>{discussion.topic || t('此前的讨论', 'Earlier discussion')}</summary>
          {discussion.turns.map((turn, turnIndex) => <article className="understanding-turn" key={turn.id}><span className="understanding-speaker">{turn.role === 'user' ? t('你', 'You') : t('一起想一想', 'Thinking together')}</span><ReactMarkdown enabled={turn.role !== 'user'} userRequest={previousLearnerRequest(discussion.turns, turnIndex)} remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown></article>)}
          {session.guidedDiscussions?.some(item => item.id === discussion.id) && <div className="understanding-picker-actions"><button type="button" onClick={() => { setActiveId(discussion.id); setView('conversation'); }}>{t('接着这段想', 'Continue this discussion')}</button></div>}
        </details>)}
      </details>}
    </div>
  </section>;
};
