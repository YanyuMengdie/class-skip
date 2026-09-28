import { useSupportSurface } from '@/features/studySupport/StudySupportContext';
import { useStudyDraft } from '@/features/studySupport/useStudyDraft';
import { useAppLanguage, localizeUiText } from '@/shared/i18n/appLanguage';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, BookOpen, Lightbulb, Loader2, Send, Square } from 'lucide-react';
import { generateReadingUnderstandingTurn } from '@/services/geminiService';
import type { UnderstandingAction, UnderstandingSession, UnderstandingTurn } from './readingUnderstanding';
import { isUnderstandingNonAnswer } from './guidedUnderstanding';
import './understanding.css';

export interface UnderstandingConversationProps {
  session: UnderstandingSession;
  minutes: number;
  autoStart?: boolean;
  needsReview?: boolean;
  onMinutesChange: (minutes: number) => void;
  onFinish: () => void;
  onReview: (value: boolean) => void;
  documentContent: string;
  pageTexts?: string[];
  onUpdate: (update: (previous: UnderstandingSession) => UnderstandingSession) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onJumpToPage?: (page: number) => void;
  generateTurn?: typeof generateReadingUnderstandingTurn;
}

const ACTION_LABELS: Partial<Record<UnderstandingAction, string>> = {
  reason: '带我想一步', hint: '给点提示', explain: '直接讲给我', foundation: '先讲基础', revisit: '换个例子再试',
};

export const UnderstandingConversation: React.FC<UnderstandingConversationProps> = ({
  session, minutes, autoStart = false, needsReview = false, onMinutesChange, onFinish, onReview, documentContent, pageTexts = [], onUpdate, onClose, onBusyChange, onJumpToPage,
  generateTurn = generateReadingUnderstandingTurn,
}) => {
  const { text: t } = useAppLanguage();
  const guided = session.teachingFlow === 'guided-step-v1';
  const actionLabel = (action: UnderstandingAction) => guided && action === 'foundation' ? t('这里还是没懂', 'I still don’t understand') : guided && action === 'explain' ? t('你接着讲', 'Please walk me through it') : localizeUiText(ACTION_LABELS[action] || '');
  const [input, setInput, saveInputDraft] = useStudyDraft(`understanding:${session.id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ action: UnderstandingAction; text: string; before: UnderstandingSession } | null>(() => {
    const last = session.turns.at(-1);
    return last?.role === 'user' ? { action: last.action ?? 'answer', text: last.text, before: { ...session, turns: session.turns.slice(0, -1) } } : null;
  });
  const requestRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const busyCallbackRef = useRef(onBusyChange);
  busyCallbackRef.current = onBusyChange;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);

  const cancel = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    busyCallbackRef.current(false);
  };

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
    busyCallbackRef.current(false);
  }, []);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [session.turns.length, busy]);

  const run = async (action: UnderstandingAction, text = '', retryBefore?: UnderstandingSession) => {
    if (requestRef.current || (action === 'answer' && !text.trim())) return;
    const submittedAnswer = action === 'answer';
    if (guided && action === 'answer' && isUnderstandingNonAnswer(text)) action = 'foundation';
    const before = retryBefore ?? sessionRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    busyCallbackRef.current(true);
    setError(null);
    setRetry({ action, text, before });
    const userTurn: UnderstandingTurn | null = action === 'start' ? null : {
      id: crypto.randomUUID(), role: 'user', text: action === 'answer' || text.trim() ? text.trim() : actionLabel(action),
      action, timestamp: Date.now(),
    };
    if (userTurn && !retryBefore) {
      onUpdate(previous => ({ ...previous, turns: [...previous.turns, userTurn] }));
      if (submittedAnswer) setInput('');
    }
    try {
      const result = await generateTurn({ session: before, action, userText: text, minutes, documentContent, pageTexts, abortSignal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const reply: UnderstandingTurn = {
        id: crypto.randomUUID(), role: 'model', text: result.messageMarkdown, phase: result.phase, timestamp: Date.now(),
      };
      onUpdate(previous => ({
        ...previous, topic: previous.focus?.title || result.topic, mode: result.mode, phase: result.phase,
        explained: Boolean(previous.explained) || (result.phase === 'explanation' && ['start', 'explain', 'foundation'].includes(action)),
        turns: [...previous.turns, reply],
        ...(result.reflection ? { reflection: result.reflection } : {}),
      }));
      setRetry(null);
    } catch (cause) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setError(cause instanceof Error && cause.message.includes('页码')
        ? '这轮没有对上原文页码，已保留你的回答，可以重试。'
        : '这一轮没有完成，已保留对话，可以重试或返回领读。');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setBusy(false);
        busyCallbackRef.current(false);
      }
    }
  };

  useEffect(() => {
    // 仅新分支开场；再次打开已有对话不重复提问。
    // StrictMode replays effects before this microtask: do not send its discarded request.
    let active = true;
    backButtonRef.current?.focus({ preventScroll: true });
    queueMicrotask(() => {
      if (active && autoStart && sessionRef.current.turns.length === 0) void run('start');
    });
    return () => { active = false; };
    // The parent keys this panel by document/session/message identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { cancel(); onClose(); };
  const lastTurn = session.turns.at(-1);
  const interrupted = !busy && !error && retry && (lastTurn?.role === 'user' || session.turns.length === 0);
  const hasReply = session.turns.some(turn => turn.role === 'model');

  useSupportSurface({
    scope: `understanding:${session.id}`, priority: 20, busy,
    boundary: String(session.turns.filter(turn => turn.role === 'model').length),
    actions: [
      { id: 'hint', label: t('给点提示', 'A small hint'), run: () => { void run('hint'); } },
      { id: 'foundation', label: t('先讲基础', 'Explain the basics'), run: () => { void run('foundation'); } },
      { id: 'explain', label: t('直接讲给我', 'Explain it to me'), run: () => { void run('explain'); } },
    ],
    pause: () => { cancel(); saveInputDraft(); },
  });

  return (
    <section className="understanding-panel" aria-label={localizeUiText("陪我想通这个")}>
      <header className="understanding-header">
        <button ref={backButtonRef} type="button" onClick={close} className="understanding-back"><ArrowLeft size={16} />{guided ? t('回到刚才的位置', 'Back to reading') : t('返回知识点清单', 'Back to topics')}</button>
        {!guided && <label className="understanding-budget">{t('本轮节奏 ', 'Round pace ')}<select value={minutes} onChange={event => onMinutesChange(Number(event.target.value))} disabled={busy} aria-label={localizeUiText("这次想花的时间")}>
            <option value={3}>{localizeUiText("约 3 分钟")}</option><option value={5}>{localizeUiText("约 5 分钟")}</option><option value={10}>{localizeUiText("慢慢想")}</option>
          </select>
        </label>}
      </header>
      <div className="understanding-context">
        <p className="understanding-eyebrow"><Lightbulb size={15} />{localizeUiText("陪我想通这个")}</p>
        <h2>{session.topic || localizeUiText("从刚才这一段开始")}</h2>
        <details><summary>{localizeUiText("这次围绕哪段内容")}</summary><p data-preserve-language="true">{session.sourceText}</p></details>
        {guided ? <p>{t('先讲清背景，再一起想一小步。随时可以回去接着读。', 'Background first, then one small step. Return to reading whenever you like.')}</p> : session.scopePolicy && <p>{t('仅讲解所选知识点；改变节奏不会扩大范围。', 'Only the selected topic; pace does not expand its scope.')}</p>}
        {session.scopePolicy && !session.pageRefs.length && <p role="status">{t('对应页码待定位 · 当前依据领读段落解释，原文尚未核对。', 'Source pages not located · This explanation uses the reading excerpt and has not been checked against the original.')}</p>}
        {onJumpToPage && session.pageRefs.length > 0 && <div className="understanding-sources">
          {!session.scopePolicy && session.pageRefs.length > 6
            ? <button type="button" onClick={() => onJumpToPage(session.pageRefs[0])}><BookOpen size={12} />{localizeUiText("对照原文：第 ")}{session.pageRefs[0]}–{session.pageRefs.at(-1)}{localizeUiText(" 页")}</button>
            : session.pageRefs.map(page => <button type="button" key={page} onClick={() => onJumpToPage(page)}><BookOpen size={12} />{localizeUiText("第 ")}{page}{localizeUiText(" 页")}</button>)}
        </div>}
      </div>
      <div className="understanding-transcript" ref={transcriptRef}>
        {session.turns.map(turn => (
          <article key={turn.id} className={`understanding-turn ${turn.role === 'user' ? 'is-user' : 'is-model'}`}>
            <span className="understanding-speaker">{turn.role === 'user' ? localizeUiText("你") : localizeUiText("一起想一想")}</span>
            <div data-preserve-language="true"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{turn.text}</ReactMarkdown></div>
          </article>
        ))}
        {busy && <p role="status" className="understanding-status"><Loader2 size={15} className="animate-spin" />{localizeUiText("正在准备这一小步…")}</p>}
        {error && <div role="alert" className="understanding-error">{localizeUiText(error)}<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>{localizeUiText("重试这一轮")}</button></div>}
        {interrupted && <p className="understanding-status">{localizeUiText("已停止。")}<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>{localizeUiText("接着这一轮")}</button></p>}
        {session.phase === 'complete' && <div className="understanding-reflection">
          <h3>{localizeUiText("这次想通的这一点")}</h3>
          {session.reflection ? <dl><dt>{localizeUiText("原来的想法")}</dt><dd>{session.reflection.before}</dd><dt>{localizeUiText("让我重新想的例子")}</dt><dd>{session.reflection.trigger}</dd><dt>{localizeUiText("现在的理解")}</dt><dd>{session.reflection.after}</dd></dl> : <p>{localizeUiText("这一轮已经核对过，可以回到领读；之后也能再来换个例子。")}</p>}
          <div className="understanding-reflection-actions"><button type="button" onClick={close}>{guided ? t('回到刚才的位置', 'Back to reading') : t('返回知识点清单', 'Back to topics')}</button><button type="button" disabled={busy} onClick={() => void run('revisit')}>{localizeUiText("换个例子再试")}</button>
            
          </div>
        </div>}
      </div>
      <footer className="understanding-composer">
        <div className="understanding-actions">
          <button type="button" disabled={busy} aria-pressed={needsReview} onClick={() => onReview(!needsReview)}>{needsReview ? t('已留待回顾 · 我现在懂了', 'Saved for later · I understand now') : t('还没懂，先记下', 'Still unclear — save for later')}</button>
          <button type="button" disabled={busy || !hasReply} onClick={onFinish}>{guided ? t('回到刚才的位置', 'Back to reading') : t('这一点先到这里，查看下一步', 'Pause this topic and see what’s next')}</button>
          {!hasReply && !busy && !retry && <button type="button" onClick={() => void run('start')}>{t('开始讲解这一点', 'Explain this topic')}</button>}
        </div>
        <div className="understanding-actions">
          {guided ? <button type="button" disabled={busy || !hasReply} onClick={() => void run('reason')}>{t('带我想一步', 'Let me try one step')}</button> : <button type="button" disabled={busy} onClick={() => void run('hint')}>{localizeUiText("给点提示")}</button>}
          <button type="button" disabled={busy || (guided && !hasReply)} onClick={() => void run('foundation')}>{actionLabel('foundation')}</button>
          <button type="button" disabled={busy || (guided && !hasReply)} onClick={() => void run('explain')}>{actionLabel('explain')}</button>
          {busy && <button type="button" onClick={cancel}><Square size={12} />{localizeUiText("停止")}</button>}
        </div>
        <form onSubmit={event => { event.preventDefault(); void run('answer', input); }}>
          <textarea aria-label={localizeUiText("你的想法")} placeholder={localizeUiText("说说你的猜测或理由，不知道也可以…")} value={input} onChange={event => setInput(event.target.value)} rows={2} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void run('answer', input); }
          }} />
          <button type="submit" disabled={busy || !input.trim()} aria-label={localizeUiText("发送想法")}><Send size={17} /></button>
        </form>
        <p>{localizeUiText("一次只想一个点，随时可以回去接着读。")}</p>
      </footer>
    </section>
  );
};
