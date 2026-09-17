import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, BookOpen, Lightbulb, Loader2, Send, Square } from 'lucide-react';
import { generateReadingUnderstandingTurn } from '@/services/geminiService';
import type { UnderstandingAction, UnderstandingSession, UnderstandingTurn } from './readingUnderstanding';
import './understanding.css';

interface UnderstandingPanelProps {
  session: UnderstandingSession;
  documentContent: string;
  pageTexts?: string[];
  onUpdate: (update: (previous: UnderstandingSession) => UnderstandingSession) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onJumpToPage?: (page: number) => void;
  generateTurn?: typeof generateReadingUnderstandingTurn;
}

const ACTION_LABELS: Partial<Record<UnderstandingAction, string>> = {
  hint: '给点提示', explain: '直接讲给我', foundation: '先讲基础', revisit: '换个例子再试',
};

export const UnderstandingPanel: React.FC<UnderstandingPanelProps> = ({
  session, documentContent, pageTexts = [], onUpdate, onClose, onBusyChange, onJumpToPage,
  generateTurn = generateReadingUnderstandingTurn,
}) => {
  const [input, setInput] = useState('');
  const [minutes, setMinutes] = useState(3);
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
    const before = retryBefore ?? sessionRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    busyCallbackRef.current(true);
    setError(null);
    setRetry({ action, text, before });
    const userTurn: UnderstandingTurn | null = action === 'start' ? null : {
      id: crypto.randomUUID(), role: 'user', text: action === 'answer' ? text.trim() : ACTION_LABELS[action] || text,
      action, timestamp: Date.now(),
    };
    if (userTurn && !retryBefore) {
      onUpdate(previous => ({ ...previous, turns: [...previous.turns, userTurn] }));
      if (action === 'answer') setInput('');
    }
    try {
      const result = await generateTurn({ session: before, action, userText: text, minutes, documentContent, pageTexts, abortSignal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const reply: UnderstandingTurn = {
        id: crypto.randomUUID(), role: 'model', text: result.messageMarkdown, phase: result.phase, timestamp: Date.now(),
      };
      onUpdate(previous => ({
        ...previous, topic: result.topic, mode: result.mode, phase: result.phase,
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
      if (active && sessionRef.current.turns.length === 0) void run('start');
    });
    return () => { active = false; };
    // The parent keys this panel by document/session/message identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => { cancel(); onClose(); };
  const lastTurn = session.turns.at(-1);
  const interrupted = !busy && !error && retry && (lastTurn?.role === 'user' || session.turns.length === 0);
  const canReviewLater = session.phase === 'complete' && Boolean(session.reflection);

  return (
    <section className="understanding-panel" aria-label="陪我想通这个">
      <header className="understanding-header">
        <button ref={backButtonRef} type="button" onClick={close} className="understanding-back"><ArrowLeft size={16} />回到领读</button>
        <label className="understanding-budget">这次想花
          <select value={minutes} onChange={event => setMinutes(Number(event.target.value))} disabled={busy} aria-label="这次想花的时间">
            <option value={3}>约 3 分钟</option><option value={5}>约 5 分钟</option><option value={10}>慢慢想</option>
          </select>
        </label>
      </header>
      <div className="understanding-context">
        <p className="understanding-eyebrow"><Lightbulb size={15} />陪我想通这个</p>
        <h2>{session.topic || '从刚才这一段开始'}</h2>
        <details><summary>这次围绕哪段内容</summary><p>{session.sourceText}</p></details>
        {onJumpToPage && session.pageRefs.length > 0 && <div className="understanding-sources">
          {session.pageRefs.length > 6
            ? <button type="button" onClick={() => onJumpToPage(session.pageRefs[0])}><BookOpen size={12} />对照原文：第 {session.pageRefs[0]}–{session.pageRefs.at(-1)} 页</button>
            : session.pageRefs.map(page => <button type="button" key={page} onClick={() => onJumpToPage(page)}><BookOpen size={12} />第 {page} 页</button>)}
        </div>}
      </div>
      <div className="understanding-transcript" ref={transcriptRef}>
        {session.turns.map(turn => (
          <article key={turn.id} className={`understanding-turn ${turn.role === 'user' ? 'is-user' : 'is-model'}`}>
            <span className="understanding-speaker">{turn.role === 'user' ? '你' : '一起想一想'}</span>
            <div data-preserve-language="true"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{turn.text}</ReactMarkdown></div>
          </article>
        ))}
        {busy && <p role="status" className="understanding-status"><Loader2 size={15} className="animate-spin" />正在准备这一小步…</p>}
        {error && <div role="alert" className="understanding-error">{error}<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>重试这一轮</button></div>}
        {interrupted && <p className="understanding-status">已停止。<button type="button" onClick={() => retry && void run(retry.action, retry.text, retry.before)}>接着这一轮</button></p>}
        {session.phase === 'complete' && <div className="understanding-reflection">
          <h3>这次想通的这一点</h3>
          {session.reflection ? <dl><dt>原来的想法</dt><dd>{session.reflection.before}</dd><dt>让我重新想的例子</dt><dd>{session.reflection.trigger}</dd><dt>现在的理解</dt><dd>{session.reflection.after}</dd></dl> : <p>这一轮已经核对过，可以回到领读；之后也能再来换个例子。</p>}
          <div className="understanding-reflection-actions"><button type="button" onClick={close}>继续领读</button><button type="button" disabled={busy} onClick={() => void run('revisit')}>换个例子再试</button>
            {canReviewLater && <button type="button" aria-pressed={Boolean(session.reviewRequested)} onClick={() => onUpdate(previous => ({ ...previous, reviewRequested: !previous.reviewRequested }))}>{session.reviewRequested ? '已标记以后再试' : '留着以后再试'}</button>}
          </div>
        </div>}
      </div>
      <footer className="understanding-composer">
        <div className="understanding-actions">
          <button type="button" disabled={busy} onClick={() => void run('hint')}>给点提示</button>
          <button type="button" disabled={busy} onClick={() => void run('foundation')}>先讲基础</button>
          <button type="button" disabled={busy} onClick={() => void run('explain')}>直接讲给我</button>
          {busy && <button type="button" onClick={cancel}><Square size={12} />停止</button>}
        </div>
        <form onSubmit={event => { event.preventDefault(); void run('answer', input); }}>
          <textarea aria-label="你的想法" placeholder="说说你的猜测或理由，不知道也可以…" value={input} onChange={event => setInput(event.target.value)} rows={2} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void run('answer', input); }
          }} />
          <button type="submit" disabled={busy || !input.trim()} aria-label="发送想法"><Send size={17} /></button>
        </form>
        <p>一次只想一个点，随时可以回去接着读。</p>
      </footer>
    </section>
  );
};
