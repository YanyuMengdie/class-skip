import { ExplanationText } from '@/shared/i18n/ExplanationMarkdown';
import { previousLearnerRequest } from '@/shared/i18n/explanationTranslation';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb, Loader2 } from 'lucide-react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import remarkGfm from 'remark-gfm';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { useSupportSurface } from '@/features/studySupport/StudySupportContext';
import { generateUnderstandingTopics } from '@/services/geminiService';
import { UnderstandingConversation, type UnderstandingConversationProps } from './UnderstandingConversation';
import { createGuidedUnderstanding, savedUnderstandingDiscussions, saveUnderstandingPlan } from './guidedUnderstanding';
import { createWholeUnderstanding, advanceWholeUnderstanding, updateWholePart, understandingPartStatus, type UnderstandingPartStatus } from './wholeUnderstanding';
import type { UnderstandingSession } from './readingUnderstanding';
import type { UnderstandingTopic } from './understandingPlan';
import './understanding.css';

type Props = Pick<UnderstandingConversationProps, 'session' | 'documentContent' | 'pageTexts' | 'onUpdate' | 'onClose' | 'onBusyChange' | 'onJumpToPage' | 'generateTurn' | 'expanded' | 'onToggleExpanded'> & { generateTopics?: typeof generateUnderstandingTopics };
export const UnderstandingPanel: React.FC<Props> = props => {
  const { session, onUpdate, onClose, generateTopics = generateUnderstandingTopics } = props;
  const { text: t } = useAppLanguage();
  const [view, setView] = useState<'entry' | 'specific' | 'conversation' | 'round'>('entry');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const preparation = useRef<AbortController | null>(null);
  const intent = useRef<'whole' | 'specific'>('whole');
  const live = useRef({ session, onUpdate, onBusyChange: props.onBusyChange });
  live.current = { session, onUpdate, onBusyChange: props.onBusyChange };
  useEffect(() => () => { preparation.current?.abort(); if (preparation.current) live.current.onBusyChange(false); }, []);
  const active = session.guidedDiscussions?.find(item => item.id === activeId);
  const currentPart = active?.coverage?.parts.find(part => part.id === active.coverage?.activePartId);
  const conversation = currentPart?.conversation ?? (!active?.coverage ? active : undefined);
  const partIndex = active?.coverage?.parts.findIndex(part => part.id === currentPart?.id) ?? -1;
  const nextPart = active?.coverage?.parts[partIndex + 1];
  const changeActive = (update: (item: UnderstandingSession) => UnderstandingSession) => {
    if (!activeId) return;
    onUpdate(previous => ({ ...previous, guidedDiscussions: previous.guidedDiscussions?.map(item => item.id === activeId ? update(item) : item) }));
  };
  const add = (discussion: UnderstandingSession) => {
    onUpdate(previous => ({ ...previous, guidedDiscussions: [...(previous.guidedDiscussions ?? []), discussion] }));
    setActiveId(discussion.id); setView('conversation');
  };
  const start = (topic?: UnderstandingTopic, questionText = '') => add(createGuidedUnderstanding(session, topic, questionText));
  const prepare = async (choice: 'whole' | 'specific') => {
    if (preparation.current) return;
    intent.current = choice; setSelectionError(false);
    // Resume a saved round with its exact per-part scope; no new questions on reopen.
    if (choice === 'whole') {
      const unfinished = [...(session.guidedDiscussions ?? [])].reverse().find(item => item.coverage && !item.coverage.finished);
      if (unfinished) { setActiveId(unfinished.id); setView(unfinished.coverage?.activePartId ? 'conversation' : 'round'); return; }
    }
    const controller = new AbortController(); preparation.current = controller;
    setPreparing(true); live.current.onBusyChange(true);
    try {
      const snapshot = live.current.session;
      const plan = snapshot.plan?.selectionVersion === 1 ? snapshot.plan : await generateTopics({ sourceText: snapshot.sourceText, allowedPages: snapshot.pageRefs, abortSignal: controller.signal });
      if (controller.signal.aborted || preparation.current !== controller) return;
      live.current.onUpdate(previous => saveUnderstandingPlan(previous, plan));
      if (choice === 'specific' || !plan.topics.length) setView('specific');
      else add(createWholeUnderstanding(snapshot, plan));
    } catch {
      if (!controller.signal.aborted) setSelectionError(true);
    } finally {
      if (preparation.current === controller) { preparation.current = null; setPreparing(false); live.current.onBusyChange(false); }
    }
  };
  const next = (defer = false) => {
    if (!active?.coverage) return;
    const changed = advanceWholeUnderstanding(active, defer);
    changeActive(() => changed);
    setView(changed.coverage?.activePartId ? 'conversation' : 'round');
  };
  const resumePart = (id: string) => {
    changeActive(item => item.coverage ? { ...item, coverage: { ...item.coverage, activePartId: id, finished: false } } : item);
    setView('conversation');
  };
  const statusLabel = (status: UnderstandingPartStatus) => ({
    checked: t('已通过情境判断核对', 'Checked through scenario reasoning'),
    review: t('仍有疑惑，已保存', 'Still unclear · saved'),
    explained: t('已看讲解，尚未核对理解', 'Explanation viewed · understanding not checked'),
    'in-progress': t('已开始，尚未核对完成', 'Started · check unfinished'),
    unvisited: t('尚未检查', 'Not checked yet'),
  }[status]);
  useSupportSurface({ scope: `understanding-picker:${session.id}`, priority: 15, busy: preparing, actions: [] });
  if (view === 'conversation' && active && conversation) return <UnderstandingConversation {...props}
    key={conversation.id} session={conversation} autoStart={conversation.turns.length === 0}
    progressLabel={currentPart && active.coverage ? t(`第 ${partIndex + 1}/${active.coverage.parts.length} 部分`, `Part ${partIndex + 1}/${active.coverage.parts.length}`) : undefined}
    nextPartTitle={nextPart?.title} onNextPart={active.coverage ? () => next() : undefined}
    onDeferPart={active.coverage ? () => next(true) : undefined} onViewRound={active.coverage ? () => setView('round') : undefined}
    minutes={5} onMinutesChange={() => {}} needsReview={Boolean(conversation.reviewRequested)}
    onReview={value => changeActive(item => currentPart ? updateWholePart(item, currentPart.id, part => ({ ...part, reviewRequested: value })) : { ...item, reviewRequested: value })}
    onFinish={onClose} onClose={onClose}
    onUpdate={update => changeActive(item => currentPart ? updateWholePart(item, currentPart.id, update) : update(item))}
  />;
  const earlier = savedUnderstandingDiscussions(session);
  const showTranscript = (discussion: UnderstandingSession) => discussion.turns.map((turn, turnIndex) => <article className="understanding-turn" key={turn.id}>
    <span className="understanding-speaker">{turn.role === 'user' ? t('你', 'You') : t('一起想一想', 'Thinking together')}</span>
    <ReactMarkdown enabled={turn.role !== 'user'} userRequest={previousLearnerRequest(discussion.turns, turnIndex)} remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
    {turn.role === 'model' && turn.question && <div className="understanding-reasoning-question"><ReactMarkdown userRequest={previousLearnerRequest(discussion.turns, turnIndex)}>{turn.question}</ReactMarkdown></div>}
  </article>);
  return <section className="understanding-panel" aria-label={t('陪我想通这个', 'Help me understand')} data-preserve-language="true">
    <header className="understanding-header"><button type="button" onClick={onClose} className="understanding-back"><ArrowLeft size={16}/>{t('回到领读', 'Back to reading')}</button></header>
    <div className="understanding-picker understanding-guided-picker">
      <p className="understanding-eyebrow"><Lightbulb size={15}/>{t('陪我想通这个', 'Help me understand')}</p>
      {view === 'round' && active?.coverage ? <>
        <h2>{t('这次实际检查到哪里了？', 'What did we check this time?')}</h2>
        <p className="understanding-scope">{t('每部分分别记录。看过讲解或跳过，不代表已经理解；你随时可以接着想。', 'Each part is recorded separately. Viewing an explanation or skipping is not evidence of understanding. Continue whenever you like.')}</p>
        <div className="understanding-entry-choices">{active.coverage.parts.map((part, index) => <button type="button" key={part.id} onClick={() => resumePart(part.id)}>
          <span><strong>{index + 1}. <ExplanationText>{part.title}</ExplanationText></strong><small>{statusLabel(understandingPartStatus(part.conversation))}</small></span><ArrowRight size={16}/>
        </button>)}</div>
        <div className="understanding-picker-actions"><button type="button" onClick={onClose}>{t('先到这里，回到领读', 'Pause and return to reading')}</button><button type="button" onClick={() => setView('entry')}>{t('选择另一种帮法', 'Choose another approach')}</button></div>
      </> : <>
      <h2>{view === 'specific' ? t('是哪一处，让你卡住了？', 'Where did you get stuck?') : t('不用先说清自己哪里不懂。', 'You don’t have to pinpoint the problem yet.')}</h2>
      <p className="understanding-scope">{t('只围绕刚才这条讲解的实际知识，从具体情境找到哪里没想通。', 'Use the knowledge actually explained in this message and concrete situations to find the missing links.')}</p>
      {view === 'entry' ? <div className="understanding-entry-choices">
        <button type="button" disabled={preparing} onClick={() => void prepare('whole')}><span><strong>{t('整段都没进脑子', 'The whole passage hasn’t sunk in')}</strong><small>{t('按主要知识部分接着想，一次一个问题，不遗漏后面的部分。', 'Work through the main parts, one reasoning step at a time.')}</small></span><ArrowRight size={18}/></button>
        <button type="button" disabled={preparing} onClick={() => void prepare('specific')}><span><strong>{t('有一个地方想不通', 'One part is unclear')}</strong><small>{t('选一个知识部分，只围绕它找理解断点。', 'Choose one part and focus on its missing link.')}</small></span><ArrowRight size={18}/></button>
      </div> : <>
        {session.plan?.selectionVersion === 1 && <div className="understanding-entry-choices">{session.plan.topics.map(topic => <button type="button" key={topic.id} onClick={() => start(topic)}><span><strong><ExplanationText>{topic.title}</ExplanationText></strong><small><ExplanationText>{topic.preview || topic.summary.slice(0, 160)}</ExplanationText></small></span><ArrowRight size={16}/></button>)}</div>}
        {session.plan?.selectionVersion === 1 && !session.plan.topics.length && <p className="understanding-picker-note">{t('这条消息主要是导读、回顾或进度提示，没有可单独检查的知识部分。可以回到实际讲解再打开，也可以写下具体疑问。', 'This message mainly contains orientation, recap, or progress information, with no standalone knowledge to check. Open a substantive explanation or write a specific question.')}</p>}
        <form className="understanding-specific-form" onSubmit={event => { event.preventDefault(); if (question.trim()) start(undefined, question); }}>
          <label htmlFor={`understanding-question-${session.id}`}>{t('也可以贴一句话，或说说哪里卡住', 'Or quote a sentence or describe the difficulty')}</label>
          <textarea id={`understanding-question-${session.id}`} rows={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('比如：这两件事为什么有关系？', 'For example: why are these two things connected?')}/>
          <div className="understanding-picker-actions"><button type="submit" className="is-primary" disabled={!question.trim()}>{t('从这里帮我拆开', 'Help me with this')}</button><button type="button" onClick={() => setView('entry')}>{t('换一种帮法', 'Choose another approach')}</button></div>
        </form>
      </>}
      {preparing && <p role="status" className="understanding-status"><Loader2 size={15} className="animate-spin"/>{t('正在整理这条讲解的主要知识部分…', 'Organizing the main knowledge parts in this message…')}</p>}
      {selectionError && <div role="alert" className="understanding-error">{t('知识部分还没整理好，尚未开始提问。请重试，原对话仍保留。', 'The knowledge parts could not be organized. No questions have started; your discussions are preserved.')}<button type="button" onClick={() => void prepare(intent.current)}>{t('重试整理', 'Retry')}</button></div>}
      </>}
      <details className="understanding-scope-details"><summary>{t('看看刚才那条讲解', 'View the reading message')}</summary><div className="understanding-saved-source"><ReactMarkdown remarkPlugins={[remarkGfm]}>{session.sourceText}</ReactMarkdown></div></details>
      {earlier.length > 0 && <details className="understanding-legacy"><summary>{t('已保存的辅导对话', 'Saved discussions')} · {earlier.length}</summary>
        {earlier.map(discussion => <details key={discussion.id}><summary>{discussion.coverage ? t(`逐部分辅导 · ${discussion.coverage.parts.length} 部分`, `Whole-passage discussion · ${discussion.coverage.parts.length} parts`) : <ExplanationText>{discussion.topic || t('此前的讨论', 'Earlier discussion')}</ExplanationText>}</summary>
          {discussion.coverage ? discussion.coverage.parts.map(part => <details key={part.id}><summary><ExplanationText>{part.title}</ExplanationText> · {statusLabel(understandingPartStatus(part.conversation))}</summary>{showTranscript(part.conversation)}</details>) : showTranscript(discussion)}
          {session.guidedDiscussions?.some(item => item.id === discussion.id) && <div className="understanding-picker-actions"><button type="button" onClick={() => { setActiveId(discussion.id); setView(discussion.coverage ? 'round' : 'conversation'); }}>{t('接着这段想', 'Continue this discussion')}</button></div>}
        </details>)}
      </details>}
    </div>
  </section>;
};
