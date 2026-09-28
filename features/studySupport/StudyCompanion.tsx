import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, CloudMoon, ExternalLink, Footprints, Heart, PawPrint, Puzzle, Sparkles, X } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { runChatHugAgent } from '@/services/geminiService';
import type { ChatMessage } from '@/types';
import { useStudySupport } from './StudySupportContext';
import { canCheckIn, REST_LINKS } from './supportPolicy';
import './studyCompanion.css';
import { useCompanionPosition } from './useCompanionPosition';

type View = 'menu' | 'stuck' | 'tired' | 'bored' | 'sad' | 'leave';
const PREFERENCE_KEY = 'classSkip_companion_checkins_v1';
export function StudyCompanion() {
  const support = useStudySupport();
  const { text: t } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [checkIn, setCheckIn] = useState(false);
  const [checkInsEnabled, setCheckInsEnabled] = useState(() => {
    try { return localStorage.getItem(PREFERENCE_KEY) !== 'off'; } catch { return true; }
  });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [comfort, setComfort] = useState(false);
  const [talk, setTalk] = useState(false);
  const [draft, setDraft] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [avoiding, setAvoiding] = useState(false);
  const restoreFocus = useRef(true);
  const chatList = useRef<HTMLDivElement>(null);
  const lastCheckIn = useRef(Date.now());
  const lastBoundary = useRef('');
  const pauseLock = useRef(false);
  const pauseGeneration = useRef(0);
  const chatGeneration = useRef(0);
  const resumeCallbacks = useRef<(() => void)[]>([]);
  const paused = support?.paused ?? false;
  const placement = useCompanionPosition(paused, open ? 'help' : checkIn ? 'checkin' : '', () => { setOpen(false); setCheckIn(false); });
  const launcher = placement.launcher;
  const panel = placement.popup;
  const surfaces = support?.surfaces.map(entry => entry.current) ?? [];
  const current = [...surfaces].sort((a, b) => b.priority - a.priority)[0];
  const boundary = `${current?.scope ?? ''}:${current?.boundary ?? ''}`;
  const busy = surfaces.some(surface => surface.busy);

  useEffect(() => {
    if (chatList.current) chatList.current.scrollTop = chatList.current.scrollHeight;
  }, [chat.length, talk]);

  useEffect(() => {
    const changed = !!lastBoundary.current && boundary !== lastBoundary.current;
    lastBoundary.current = boundary;
    const active = document.activeElement;
    const editing = active instanceof HTMLElement && (active.matches('input,textarea,select') || active.isContentEditable);
    if (checkInsEnabled && !open && canCheckIn({ now: Date.now(), lastCheckIn: lastCheckIn.current, boundaryChanged: changed,
      busy, paused, editing, visible: document.visibilityState === 'visible' && !document.querySelector('[aria-modal="true"]') })) {
      lastCheckIn.current = Date.now(); setCheckIn(true);
    }
  }, [boundary, busy, paused, open, checkInsEnabled]);

  useEffect(() => () => {
    chatGeneration.current++; pauseGeneration.current++;
    resumeCallbacks.current.forEach(callback => callback());
    resumeCallbacks.current = [];
    support?.setPaused(false);
  }, [support?.setPaused]);
  useEffect(() => {
    if (!open) return;
    restoreFocus.current = true;
    const prior = document.activeElement;
    panel.current?.focus();
    return () => { requestAnimationFrame(() => { if (restoreFocus.current && prior instanceof HTMLElement && prior.isConnected) prior.focus(); }); };
  }, [open]);
  useEffect(() => {
    if (!paused) return;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    if (root) root.inert = true;
    return () => { if (root) root.inert = wasInert ?? false; };
  }, [paused]);
  useEffect(() => {
    if (!open || paused) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !launcher.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, paused]);

  const pause = async () => {
    if (!support || pauseLock.current) return;
    pauseLock.current = true;
    const generation = ++pauseGeneration.current;
    const snapshot = support.surfaces.map(entry => entry.current);
    if (!paused) resumeCallbacks.current = snapshot.flatMap(surface => surface.resume ? [surface.resume] : []);
    support.setPaused(true);
    setSaveState('saving');
    const results = await Promise.allSettled(snapshot.map(async surface => { await surface.pause?.(); }));
    if (generation !== pauseGeneration.current) return;
    setSaveState(results.some(result => result.status === 'rejected') ? 'error' : 'saved');
    pauseLock.current = false;
  };
  const resume = () => {
    pauseGeneration.current++; pauseLock.current = false;
    resumeCallbacks.current.forEach(callback => callback());
    resumeCallbacks.current = [];
    support?.setPaused(false);
    lastCheckIn.current = Date.now();
    setOpen(false); setView('menu'); setSaveState('idle');
    chatGeneration.current++; setChatBusy(false);
  };
  const choose = (next: View) => {
    setCheckIn(false); lastCheckIn.current = Date.now(); setOpen(true); setView(next);
    if (next !== 'menu' && next !== 'stuck') void pause();
  };
  const send = async () => {
    if (!draft.trim() || chatBusy) return;
    const message = draft.trim();
    const generation = ++chatGeneration.current;
    setChatBusy(true); setChatError(false);
    try {
      const reply = await runChatHugAgent(chat, message, 'emotional', { throwOnError: true });
      if (generation !== chatGeneration.current) return;
      setChat(previous => [...previous, { role: 'user', text: message, timestamp: Date.now() }, { role: 'model', text: reply, timestamp: Date.now() }]);
      setDraft('');
    } catch { if (generation === chatGeneration.current) setChatError(true); }
    finally { if (generation === chatGeneration.current) setChatBusy(false); }
  };
  const options = [
    { id: 'stuck' as const, Icon: Puzzle, label: t('这里没看懂', 'I’m stuck here') },
    { id: 'tired' as const, Icon: CloudMoon, label: t('好累，想歇一下', 'I’m tired. A little rest?') },
    { id: 'bored' as const, Icon: Sparkles, label: t('好无聊，换换脑子', 'I’m bored. A change of scene?') },
    { id: 'sad' as const, Icon: Heart, label: t('心情不好，想被安慰', 'I could use some comfort') },
    { id: 'leave' as const, Icon: Footprints, label: t('我想先离开一会', 'I need to step away') },
  ];
  const titles: Record<View, string> = {
    menu: t('我在呢，怎么啦？', 'I’m here. What’s on your mind?'), stuck: t('我们一起看看。', 'Let’s look at it together.'),
    tired: t('那就歇一会吧。', 'Let’s take a breather.'), bored: t('出去换换脑子。', 'A little change of scene.'),
    sad: t('给你留一个软软的角落。', 'A soft place to land.'), leave: t('嗯，我们先停在这里。', 'We can stop right here.'),
  };

  return createPortal(<div data-preserve-language="true" ref={placement.root} style={placement.rootStyle} className={`study-companion ${paused ? 'is-resting' : ''} ${placement.dragging ? 'is-dragging' : ''}`}>
    {paused && <div className="companion-rest-backdrop" />}
    <div className="companion-dock">
      {checkIn && !open && <section ref={panel} style={placement.popupStyle} className="companion-checkin" aria-label={t('轻轻问候', 'A gentle check-in')}>
        <button className="companion-close" aria-label={t('这次不用问候', 'Dismiss check-in')} onClick={() => setCheckIn(false)}><X size={16} /></button>
        <p>{t('学得怎么样呀？', 'How’s it going?')}</p>
        <div><button onClick={() => { setCheckIn(false); lastCheckIn.current = Date.now(); }}>{t('挺顺利的', 'Going well')}</button>
          <button onClick={() => { setCheckIn(false); setOpen(true); setView('menu'); }}>{t('想帮我一下', 'Could use a hand')}</button></div>
        <button className="companion-text" onClick={() => { setCheckInsEnabled(false); setCheckIn(false); try { localStorage.setItem(PREFERENCE_KEY, 'off'); } catch { /* Session preference still applies. */ } }}>{t('以后不用主动问', 'Turn off check-ins')}</button>
      </section>}
      {open && <section ref={panel} style={placement.popupStyle} tabIndex={-1} className="companion-panel" role="dialog" aria-modal={paused || undefined} aria-labelledby="companion-title"
        onKeyDown={event => {
          if (event.key === 'Escape' && !paused) { setOpen(false); launcher.current?.focus(); }
          if (event.key === 'Tab' && paused) {
            const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled)');
            if (!nodes?.length) return;
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
          }
        }}>
        <header className="companion-head"><div><h2 id="companion-title">{titles[view]}</h2><p>{paused ? t('现在不用再完成什么。回来不着急。', 'Nothing to finish right now. Take your time.') : t('想求助，或只是想歇一会，都可以。', 'A little help or a little rest. Both are welcome.')}</p></div>
          {!paused && <button className="companion-close" aria-label={t('收起帮助', 'Close help')} onClick={() => setOpen(false)}><X size={18} /></button>}</header>
        {view === 'menu' && <>
          <div className="companion-options">{options.map(({ id, Icon, label }) => <button key={id} className={`companion-option ${id === 'leave' ? 'is-leave' : ''}`} onClick={() => choose(id)}>
            <span className="companion-icon"><Icon size={18} /></span><span>{label}</span><ChevronRight size={15} />
          </button>)}</div>
          <label className="companion-preference"><input type="checkbox" checked={checkInsEnabled} onChange={event => { const value = event.target.checked; setCheckInsEnabled(value); try { localStorage.setItem(PREFERENCE_KEY, value ? 'on' : 'off'); } catch { /* Session preference still applies. */ } }} />{t('偶尔在段落间轻轻问候', 'Occasional check-ins between sections')}</label>
        </>}
        {view === 'stuck' && <div className="companion-detail">
          <p>{t('从这一处开始就好。帮助会回到当前学习对话里。', 'Start right here. Help will appear in your current study conversation.')}</p>
          {current?.actions.length ? current.actions.map(action => <button className="companion-action" key={action.id} disabled={busy} onClick={() => { restoreFocus.current = false; setOpen(false); action.run(); }}>{action.label}</button>) : <p>{current?.scope.startsWith('understanding-picker:') ? t('先在知识点清单里选中你想弄懂的内容，进入对话后就能在这里要提示。', 'Choose a topic from the list first. Once in its conversation, you can ask for a hint here.') : current?.scope.startsWith('round:') ? t('当前还没有正在作答的题目。进入作答后，可以在这里要提示或讲解。', 'Once you are answering a question, you can ask for a hint or explanation here.') : t('可以先开始一段领读，或进入“问答”，把不明白的那句话告诉我。', 'Start a reading section or open chat and share the part that feels unclear.')}</p>}
          {busy && <p role="status">{t('正在处理上一条内容，稍等它完成就好。', 'The previous response is still in progress.')}</p>}
          <button className="companion-text" onClick={() => setView('menu')}>{t('← 返回其他选项', '← Other options')}</button>
        </div>}
        {(view === 'tired' || view === 'bored') && <div className="companion-detail">
          <p>{view === 'tired' ? t('伸个懒腰、喝口水、看看窗外。也可以听听声音，什么都不做。', 'Stretch, have some water, look outside. Or just listen and do nothing.') : t('这一会儿留给喜欢的事情。看看小动物，或者离开屏幕随便走走。', 'Make a little room for something you enjoy. Watch animals, or wander away from the screen.')}</p>
          {REST_LINKS.map(link => <a key={link.id} className="companion-action" href={link.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t(link.zh, link.en)}<small>{link.source} · {t('新标签页', 'new tab')} <ExternalLink size={12} /></small></a>)}
          <p className="companion-note">{t('也可以直接离开屏幕。这里没有倒计时，也不会催你回来。', 'You can simply step away. No countdown or reminders to return.')}</p>
        </div>}
        {view === 'sad' && <div className="companion-detail">
          <p>{t('不想解释也没关系，不用整理好情绪再来。', 'You don’t have to explain or sort out your feelings first.')}</p>
          {!comfort && <button className="companion-action" onClick={() => setComfort(true)}>{t('不用问，安慰我一下', 'No questions, just some comfort')}</button>}
          {comfort && <p className="companion-comfort">{t('今天不必把每件事都处理好。难受的时候，先照顾自己也可以。你不需要用学了多少来证明自己值得被温柔对待。', 'You don’t have to sort everything out today. It’s okay to take care of yourself first. You don’t need to earn kindness by getting more done.')}</p>}
          {!talk && <button className="companion-action" onClick={() => setTalk(true)}>{t('我想说说', 'I’d like to talk')}</button>}
          {talk && <><div ref={chatList} className="companion-chat" aria-live="polite">{chat.map((message, index) => <p key={index} className={message.role === 'user' ? 'from-user' : ''}>{message.text}</p>)}</div>
            <form onSubmit={event => { event.preventDefault(); void send(); }}>
              <label className="companion-note" htmlFor="companion-chat-input">{t('发给 AI 陪伴；不会加入学习记录。', 'Send to the AI companion; excluded from study records.')}</label>
              <textarea id="companion-chat-input" value={draft} onChange={event => setDraft(event.target.value)} disabled={chatBusy} placeholder={t('从想说的地方开始…', 'Start wherever you like…')} />
              <button className="companion-action" disabled={!draft.trim() || chatBusy}>{chatBusy ? t('正在听你说…', 'Listening…') : t('发送', 'Send')}</button>
              {chatError && <p role="alert">{t('暂时没有连上，你的话还在，可以再试。', 'Could not connect. Your words are still here; try again.')}</p>}
            </form></>}
        </div>}
        {view === 'leave' && <div className="companion-detail">
          <p>{t('有事要忙，或是今天已经学够了，都可以先离开。不需要说明原因。', 'An errand, or enough for today—either is okay. No explanation needed.')}</p>
          {!avoiding ? <button className="companion-action" onClick={() => setAvoiding(true)}>{t('其实是有点难，我不想面对', 'It feels hard, and I’m avoiding it')}</button> : <p className="companion-comfort">{t('谢谢你告诉我。现在可以先放下，不必立刻克服它。等你愿意回来，我们再从不明白的那一点开始。', 'Thank you for telling me. You can put it down for now. When you feel ready, we can start with the bit that feels unclear.')}</p>}
          <button className="companion-text" onClick={() => setView('tired')}>{t('找一点放松的东西', 'Find something relaxing')}</button>
        </div>}
        {paused && <footer className="companion-rest-footer">
          <p className="companion-note" role={saveState === 'error' ? 'alert' : 'status'}>{saveState === 'saving' ? t('已暂停，正在保存进度…', 'Paused. Saving progress…') : saveState === 'error' ? t('已暂停，但有些进度没能保存。请保持此页打开，未发送内容仍在当前页面。', 'Paused, but some progress could not be saved. Keep this page open; unsent text is still here.') : t('已暂停。进度已保存到这台设备；未发送的内容仍在当前页面，休息时请保留此页。', 'Paused. Progress is saved on this device. Unsent text stays on this page; keep it open during your break.')}</p>
          {saveState === 'error' && <button className="companion-text" onClick={() => void pause()}>{t('再试一次保存', 'Retry saving')}</button>}
          <button className="companion-action companion-resume" onClick={resume}>{t('我回来了，从这里继续', 'I’m back. Continue from here')}</button>
        </footer>}
      </section>}
      <button ref={launcher} {...placement.launcherEvents} title={paused ? undefined : t('按住拖动，轻点打开。也可用方向键移动，Home 键恢复位置。', 'Drag to move, tap to open. Arrow keys move; Home resets the position.')} className="companion-launcher" aria-expanded={open} aria-label={t('帮我一下，打开小猫帮助', 'Give me a hand. Open cat companion')} onClick={event => { if (placement.consumeDragClick(event.detail)) return; if (paused) { panel.current?.focus(); return; } lastCheckIn.current = Date.now(); setCheckIn(false); setView('menu'); setOpen(previous => !previous); }}>
        <span className={`companion-cat ${paused ? 'sleeping' : ''}`} aria-hidden="true"><span className="ear" /><span className="ear r" /><span className="face"><span className="stripe" /><span className="eye" /><span className="eye r" /><span className="blush" /><span className="blush r" /><span className="mouth" /></span></span><span>{paused ? t('陪你歇一会', 'Resting with you') : t('帮我一下', 'A little help')}</span>
      </button>
      <span className="companion-paw"><PawPrint size={12} />{paused ? t('需要的时候，点点我', 'Here when you need me') : t('按住拖动 · 轻点求助', 'Drag to move · Tap for help')}</span>
    </div>
  </div>, document.body);
}
