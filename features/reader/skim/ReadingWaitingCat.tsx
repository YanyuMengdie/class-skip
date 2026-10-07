import React, { useEffect, useRef, useState } from 'react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import './readingWaitingCat.css';

/** A companion for a real pending request, never a simulated progress indicator. */
export function ReadingWaitingCat({ compact = false, preparing = false }: {
  compact?: boolean;
  preparing?: boolean;
}) {
  const { text } = useAppLanguage();
  const startedAt = useRef(Date.now());
  const greetingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [greeting, setGreeting] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const updateTime = () => {
      if (!document.hidden) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    };
    const updateNetwork = () => setOffline(!navigator.onLine);
    const timer = setInterval(updateTime, 1000);
    document.addEventListener('visibilitychange', updateTime);
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      clearInterval(timer);
      if (greetingTimer.current) clearTimeout(greetingTimer.current);
      document.removeEventListener('visibilitychange', updateTime);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  const greet = () => {
    if (greetingTimer.current) clearTimeout(greetingTimer.current);
    setGreeting(true);
    greetingTimer.current = setTimeout(() => setGreeting(false), 3200);
  };
  const chatter = [
    text('这一页的字有点多，容我扒拉一下。', 'Quite a few words here. Let me paw through them.'),
    text('让我想想，从哪里讲比较好懂。', 'Hmm… where would be a good place to start?'),
    text('你先伸个懒腰，我还在这里。', 'Have a little stretch. I’m right here.'),
  ];
  const title = compact
    ? text('小猫陪你等下一条讲解。', 'Waiting for the next explanation, together.')
    : text('小猫正在替你先读这一段。', 'Your little companion is reading ahead.');

  return (
    <div className={`reading-waiting-cat${compact ? ' is-compact' : ''}`} data-greeting={greeting}>
      <button type="button" className="reading-waiting-cat__scene" onClick={greet}
        aria-label={text('点点小猫，和它打个招呼', 'Tap the cat to say hello')}>
        <svg viewBox="0 0 320 210" fill="none" aria-hidden="true" focusable="false">
          <ellipse cx="156" cy="110" rx="108" ry="89" fill="#f3f2e8" />
          <circle cx="251" cy="46" r="5" fill="#e6d7b5" />
          <circle cx="56" cy="76" r="3" fill="#d1ddc9" />
          <path d="M266 104v8m-4-4h8" stroke="#d4bea0" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="161" cy="190" rx="112" ry="9" fill="#e8e5d9" />
          <path d="M69 172c-21-6-27-23-17-29 10-5 11 15 26 13" className="reading-waiting-cat__tail"
            stroke="#dfb17b" strokeWidth="14" strokeLinecap="round" />
          <path d="M91 164c0-35 12-63 49-63s52 33 52 64" fill="#edc797" />
          <g className="reading-waiting-cat__head">
            <path d="M95 71L88 39q0-12 11-8l25 17m36 0 23-17q12-5 11 8l-5 34" fill="#edc797" />
            <path d="M100 53l-4-13 17 12m62 0 11-12-2 15" stroke="#e6a391" strokeWidth="8" strokeLinecap="round" />
            <path d="M88 78c0-27 18-36 53-36s55 11 55 38c0 30-23 44-54 44S88 110 88 78" fill="#edc797" />
            <path d="M140 46v13m-16-11 3 8m27-8-3 8" stroke="#cf9d68" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="142" cy="107" rx="25" ry="14" fill="#f6dbb4" />
            <g className="reading-waiting-cat__eyes" fill="#604939">
              <ellipse cx="121" cy="85" rx="3" ry="4.5" />
              <ellipse cx="163" cy="85" rx="3" ry="4.5" />
            </g>
            <ellipse cx="105" cy="99" rx="8" ry="4" fill="#e6a391" opacity=".75" />
            <ellipse cx="179" cy="99" rx="8" ry="4" fill="#e6a391" opacity=".75" />
            <path d="M139 98h6l-3 3z" fill="#946847" />
            <path d="M137 105q5 7 10 0" stroke="#604939" strokeWidth="2" strokeLinecap="round" />
          </g>
          <path d="M55 178h211" stroke="#bb9d7c" strokeWidth="5" strokeLinecap="round" />
          <path d="M78 158q29-7 62 3 30-11 61-5v18q-30-4-61 5-31-9-62-4z" fill="#52715b" />
          <path d="M82 135q29-5 58 9 27-13 57-9l3 31q-32-6-60 7-29-11-60-6z" fill="#fffaf0" stroke="#ddcfb4" strokeWidth="1.5" />
          <path d="M140 144v29" stroke="#ddcfb4" strokeWidth="1.5" />
          <g stroke="#c8cbb6" strokeWidth="2" strokeLinecap="round">
            <path d="M91 144l36 10m-35-3 32 9m29-7 32-9m-31 16 33-9" />
          </g>
          <path className="reading-waiting-cat__page" d="M140 144q25-16 54-10l5 31q-29-6-59 8z" fill="#fffdf5" stroke="#ddcfb4" strokeWidth="1.5" />
          <ellipse cx="96" cy="134" rx="13" ry="9" fill="#f3d3a9" transform="rotate(18 96 134)" />
          <g className="reading-waiting-cat__writing-paw">
            <path d="M181 137l14 25" stroke="#ac7651" strokeWidth="5" strokeLinecap="round" />
            <path d="M195 162l3 6-6-4z" fill="#604939" />
            <ellipse cx="180" cy="136" rx="12" ry="9" fill="#f3d3a9" transform="rotate(-20 180 136)" />
          </g>
          <path d="M226 143h19v22q0 10-10 10t-10-10z" fill="#d7e1cd" stroke="#9fac91" strokeWidth="1.5" />
          <path d="M245 148h4q11 9-4 14" stroke="#9fac91" strokeWidth="3" />
          <path d="M228 144h14" stroke="#9c795b" strokeWidth="3" strokeLinecap="round" />
          <g className="reading-waiting-cat__steam" stroke="#b9c5b0" strokeWidth="2" strokeLinecap="round">
            <path d="M231 134c-7-8 7-12 0-20" />
            <path d="M239 134c-7-8 7-12 0-20" />
          </g>
          <g className="reading-waiting-cat__hello" stroke="#b18d63" strokeWidth="2" strokeLinecap="round">
            <path d="M202 44l5-6m1 18h8" />
          </g>
        </svg>
        <span className="reading-waiting-cat__tap">{text('点点小猫', 'Say hello')}</span>
      </button>
      <div className="reading-waiting-cat__copy">
        <p className="reading-waiting-cat__title" role="status">{title}</p>
        {!compact && <p className="reading-waiting-cat__subtitle">{text('等一下，我们把它讲明白。', 'A moment, then we’ll make sense of it together.')}</p>}
        <p className="reading-waiting-cat__chatter">{greeting
          ? text('在读啦，在读啦。', 'Reading, reading!')
          : chatter[Math.floor(elapsed / 12) % chatter.length]}</p>
        <p className="reading-waiting-cat__status" role="status">
          <span className="reading-waiting-cat__dot" aria-hidden="true" />
          {offline ? text('网络已断开，请检查连接。', 'Connection lost. Please check your network.')
            : preparing ? text('正在分析资料', 'Analyzing the material')
              : text('正在准备讲解', 'Preparing the explanation')}
        </p>
        {elapsed >= 45 && <p className="reading-waiting-cat__slow">
          {offline ? text('这次请求尚未结束，页面会保留已有内容。', 'This request has not finished. Your existing content stays on the page.')
            : preparing
              ? text(`已等待 ${elapsed} 秒，资料分析尚未返回结果。`, `Waiting ${elapsed}s; the material analysis has not returned yet.`)
              : text(`已等待 ${elapsed} 秒，内容尚未返回。你可以继续等，也可以停止后重试。`,
                  `Waiting ${elapsed}s; the content has not arrived yet. You can wait, or stop and retry.`)}
        </p>}
      </div>
    </div>
  );
}
