import { previousLearnerRequest } from '@/shared/i18n/explanationTranslation';
import { useSupportSurface } from '@/features/studySupport/StudySupportContext';
import { useStudyDraft } from '@/features/studySupport/useStudyDraft';
import { useAppLanguage, localizeUiText } from '@/shared/i18n/appLanguage';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, BookOpen, Lightbulb, Loader2, Send, Square, MoreHorizontal, Maximize2, Minimize2, ChevronDown, Bookmark } from 'lucide-react';
import { generateReadingUnderstandingTurn } from '@/services/geminiService';
import type { UnderstandingAction, UnderstandingSession, UnderstandingTurn } from './readingUnderstanding';
import { resolveGuidedAction } from './guidedUnderstanding';
import { isCaseUnderstanding } from './caseReasoning';
import './understanding.css';

export interface UnderstandingConversationProps {
  session: UnderstandingSession;
  minutes: number;
  autoStart?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
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
  session, minutes, autoStart = false, expanded = false, onToggleExpanded, needsReview = false, onMinutesChange, onFinish, onReview, documentContent, pageTexts = [], onUpdate, onClose, onBusyChange, onJumpToPage,
  generateTurn = generateReadingUnderstandingTurn,
}) => {
  const { text: t } = useAppLanguage();
  const guided = isCaseUnderstanding(session);
  const actionLabel = (action: UnderstandingAction) => guided && action === 'reason' ? t('继续推理', 'Continue reasoning') : guided && action === 'hint' ? t('给我一条线索', 'Give me a clue') : guided && action === 'foundation' ? t('不知道，从哪想？', 'I don’t know where to start') : guided && action === 'explain' ? t('直接讲给我', 'Explain it to me') : localizeUiText(ACTION_LABELS[action] || '');
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'tools' | 'scope' | 'sources' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [input]);
  useEffect(() => {
    if (!menu && !helpOpen) return;
    const outside = (event: PointerEvent) => {
      if (!contextRef.current?.contains(event.target as Node)) setMenu(null);
      if (!helpRef.current?.contains(event.target as Node)) setHelpOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenu(null); setHelpOpen(false);
      (helpOpen ? helpButtonRef : toolsButtonRef).current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu, helpOpen]);

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
    setHelpOpen(false);
    const submittedAnswer = action === 'answer';
    if (guided) action = resolveGuidedAction(action, text);
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
        ...(result.reasoning?.question ? { question: result.reasoning.question } : {}),
      };
      onUpdate(previous => ({
        ...previous, topic: previous.focus?.title || result.topic, mode: result.mode, phase: result.phase,
        explained: Boolean(previous.explained) || (result.phase === 'explanation' && ['start', 'explain', 'foundation'].includes(action)),
        turns: [...previous.turns, reply],
        ...(result.reflection ? { reflection: result.reflection } : {}),
        ...(guided ? { teachingFlow: 'case-reasoning-v2' as const, reasoning: result.reasoning } : {}),
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
  const lastModelIndex = session.turns.reduce((last, turn, index) => turn.role === 'model' ? index : last, -1);
  const hasReply = lastModelIndex >= 0;

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
    <section className="understanding-panel understanding-compact" aria-label={localizeUiText("陪我想通这个")}>
      <header ref={contextRef} className="understanding-compact-header">
        <button ref={backButtonRef} type="button" onClick={close} className="understanding-compact-icon"
          aria-label={guided ? t('回到刚才的位置', 'Back to reading') : t('返回知识点清单', 'Back to topics')}
          title={guided ? t('回到刚才的位置', 'Back to reading') : t('返回知识点清单', 'Back to topics')}><ArrowLeft size={16} /></button>
        <div className="understanding-compact-topic">
          <span>{localizeUiText("陪我想通这个")}</span>
          <h2>{session.topic || localizeUiText("从刚才这一段开始")}</h2>
          {session.scopePolicy && !session.pageRefs.length && <small role="status">{t('对应页码待定位 · 原文尚未核对', 'Source pages not located · Original not verified')}</small>}
        </div>
        <div className="understanding-compact-tools">
          <button ref={toolsButtonRef} type="button" className="understanding-compact-icon" aria-expanded={Boolean(menu)}
            aria-label={t('范围与更多操作', 'Scope and more options')} onClick={() => { setHelpOpen(false); setMenu(value => value ? null : 'tools'); }}><MoreHorizontal size={18} /></button>
          {onToggleExpanded && <button type="button" className="understanding-compact-icon" onClick={() => { setMenu(null); onToggleExpanded(); }}
            aria-label={expanded ? t('恢复原文对照', 'Restore PDF view') : t('放大思考区', 'Expand discussion')} title={expanded ? t('恢复原文对照', 'Restore PDF view') : t('放大思考区', 'Expand discussion')}>
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>}
        </div>
        {menu && <div className="understanding-context-popover" aria-label={t('范围与更多操作', 'Scope and more options')}>
          {menu === 'tools' ? <>
            <button type="button" onClick={() => setMenu('scope')}><BookOpen size={15} />{localizeUiText("这次围绕哪段内容")}</button>
            {onJumpToPage && session.pageRefs.length > 0 && <button type="button" onClick={() => setMenu('sources')}><BookOpen size={15} />{t('查看原文', 'View source')} · {session.pageRefs.length === 1 ? session.pageRefs[0] : t(`${session.pageRefs.length} 页`, `${session.pageRefs.length} pages`)}</button>}
            <button type="button" disabled={busy} aria-pressed={needsReview} onClick={() => { onReview(!needsReview); setMenu(null); }}><Bookmark size={15} />{needsReview ? t('已留待回顾 · 我现在懂了', 'Saved for later · I understand now') : t('还没懂，先记下', 'Still unclear — save for later')}</button>
            {!guided && <>
              <label className="understanding-budget">{t('本轮节奏 ', 'Round pace ')}<select value={minutes} onChange={event => onMinutesChange(Number(event.target.value))} disabled={busy} aria-label={localizeUiText("这次想花的时间")}>
                <option value={3}>{localizeUiText("约 3 分钟")}</option><option value={5}>{localizeUiText("约 5 分钟")}</option><option value={10}>{localizeUiText("慢慢想")}</option>
              </select></label>
              <button type="button" disabled={busy || !hasReply} onClick={onFinish}>{t('这一点先到这里，查看下一步', 'Pause this topic and see what’s next')}</button>
            </>}
          </> : <>
            <button type="button" onClick={() => setMenu('tools')}><ArrowLeft size={14} />{t('返回操作', 'Back to options')}</button>
            {menu === 'scope' ? <>
              <h3>{localizeUiText("这次围绕哪段内容")}</h3>
              <p className="understanding-context-source" data-preserve-language="true">{session.sourceText}</p>
              {guided ? <p>{t('从一个具体情境开始，用你的判断找到卡住的那一步。', 'Use a concrete situation and your reasoning to find where you get stuck.')}</p> : session.scopePolicy && <p>{t('仅讲解所选知识点；改变节奏不会扩大范围。', 'Only the selected topic; pace does not expand its scope.')}</p>}
              {session.scopePolicy && !session.pageRefs.length && <p role="status">{t('当前依据领读段落解释，原文尚未核对。', 'This explanation uses the reading excerpt and has not been checked against the original.')}</p>}
            </> : <>
              <h3>{t('查看原文', 'View source')}</h3>
              <div className="understanding-sources">{session.pageRefs.map(page => <button type="button" key={page} onClick={() => { onJumpToPage?.(page); setMenu(null); }}><BookOpen size={12} />{localizeUiText("第 ")}{page}{localizeUiText(" 页")}</button>)}</div>
            </>}
          </>}
        </div>}
      </header>
      <div className="understanding-transcript" ref={transcriptRef}>
        {session.turns.map((turn, turnIndex) => (
          <article key={turn.id} className={`understanding-turn ${turn.role === 'user' ? 'is-user' : 'is-model'}`}>
            <span className="understanding-speaker">{turn.role === 'user' ? localizeUiText("你") : localizeUiText("一起想一想")}</span>
            <div data-preserve-language="true"><ReactMarkdown enabled={turn.role !== 'user'} userRequest={previousLearnerRequest(session.turns, turnIndex)} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{turn.text}</ReactMarkdown></div>
            {turn.role === 'model' && turn.question && <div className="understanding-reasoning-question"><ReactMarkdown userRequest={previousLearnerRequest(session.turns, turnIndex)} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{turn.question}</ReactMarkdown></div>}
            {turnIndex === lastModelIndex && <div className="understanding-question-help">
              {guided && session.phase === 'explanation' && <button type="button" disabled={busy} onClick={() => void run('reason')}>{t('继续推理', 'Continue reasoning')}</button>}
              <button type="button" disabled={busy} onClick={() => void run('hint')}><Lightbulb size={14} />{actionLabel('hint')}</button>
              <div className="understanding-help-anchor" ref={helpRef}>
                <button ref={helpButtonRef} type="button" disabled={busy} aria-expanded={helpOpen} onClick={() => { setMenu(null); setHelpOpen(value => !value); }}>{t('更多帮助', 'More help')}<ChevronDown size={13} /></button>
                {helpOpen && <div className="understanding-help-popover">
                  <button type="button" disabled={busy} onClick={() => void run('foundation')}>{actionLabel('foundation')}</button>
                  <button type="button" disabled={busy} onClick={() => void run('explain')}>{actionLabel('explain')}</button>
                </div>}
              </div>
            </div>}
          </article>
        ))}
        {busy && <p role="status" className="understanding-status"><Loader2 size={15} className="animate-spin" />{localizeUiText("正在准备这一小步…")}</p>}
        {error && <div role="alert" className="understanding-error">{localizeUiText(error)}<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>{localizeUiText("重试这一轮")}</button></div>}
        {interrupted && <p className="understanding-status">{localizeUiText("已停止。")}<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>{localizeUiText("接着这一轮")}</button></p>}
        {!hasReply && !busy && !retry && <div className="understanding-question-help"><button type="button" onClick={() => void run('start')}>{t('开始一起推理', 'Start reasoning together')}</button></div>}
        {session.phase === 'complete' && <div className="understanding-reflection">
          <h3>{localizeUiText("这次想通的这一点")}</h3>
          {session.reflection ? <dl><dt>{localizeUiText("原来的想法")}</dt><dd>{session.reflection.before}</dd><dt>{localizeUiText("让我重新想的例子")}</dt><dd>{session.reflection.trigger}</dd><dt>{localizeUiText("现在的理解")}</dt><dd>{session.reflection.after}</dd></dl> : <p>{localizeUiText("这一轮已经核对过，可以回到领读；之后也能再来换个例子。")}</p>}
          <div className="understanding-reflection-actions"><button type="button" onClick={close}>{guided ? t('回到刚才的位置', 'Back to reading') : t('返回知识点清单', 'Back to topics')}</button><button type="button" disabled={busy} onClick={() => void run('revisit')}>{localizeUiText("换个例子再试")}</button>
            
          </div>
        </div>}
      </div>
      <footer className="understanding-composer">
        <form onSubmit={event => { event.preventDefault(); void run('answer', input); }}>
          <textarea ref={inputRef} aria-label={localizeUiText("你的想法")} placeholder={localizeUiText("说说你的猜测或理由，不知道也可以…")} value={input} onChange={event => setInput(event.target.value)} rows={1} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void run('answer', input); }
          }} />
          {busy
            ? <button type="button" onClick={cancel} className="understanding-stop" aria-label={localizeUiText("停止")}><Square size={14} /></button>
            : <button type="submit" disabled={!input.trim()} aria-label={localizeUiText("发送想法")}><Send size={17} /></button>}

        </form>
      </footer>
    </section>
  );
};
