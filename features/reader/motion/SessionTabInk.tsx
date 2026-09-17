import React, { useLayoutEffect, useRef } from 'react';
import './sessionTabInk.css';

export interface SessionTabInkPosition {
  scopeKey: string;
  activeKey: string;
  x: number;
  width: number;
}

interface SessionTabInkProps {
  activeKey: string | null;
  scopeKey: string;
  layoutKey: string;
  positionRef: React.MutableRefObject<SessionTabInkPosition | null>;
}

/** Decoration only: the existing session buttons retain all selection and locking logic. */
export function SessionTabInk({ activeKey, scopeKey, layoutKey, positionRef }: SessionTabInkProps) {
  const inkRef = useRef<HTMLSpanElement>(null);
  const initializedRef = useRef(false);
  const animationRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const ink = inkRef.current;
    const bar = ink?.parentElement;
    if (!ink || !bar) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancelAnimation = () => {
      animationRef.current?.cancel();
      animationRef.current = null;
    };
    const measure = (allowMotion: boolean) => {
      const activeTab = bar.querySelector<HTMLElement>('.editorial-session-tab.is-active');
      if (!activeTab || !activeKey) {
        cancelAnimation();
        ink.style.opacity = '0';
        initializedRef.current = false;
        positionRef.current = null;
        return;
      }

      const barRect = bar.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const next: SessionTabInkPosition = {
        scopeKey,
        activeKey,
        // Content coordinates keep the mark attached to its tab during horizontal scrolling.
        x: tabRect.left - barRect.left + bar.scrollLeft - bar.clientLeft + 7,
        width: Math.max(12, tabRect.width - 14),
      };
      const previous = positionRef.current;
      if (initializedRef.current && previous?.scopeKey === scopeKey
        && previous.activeKey === activeKey && Math.abs(previous.x - next.x) < 0.5
        && Math.abs(previous.width - next.width) < 0.5) return;

      const currentRect = ink.getBoundingClientRect();
      const from = initializedRef.current && ink.style.opacity === '1'
        ? {
          x: currentRect.left - barRect.left + bar.scrollLeft - bar.clientLeft,
          width: currentRect.width,
        }
        : previous;
      const shouldAnimate = allowMotion && previous?.scopeKey === scopeKey
        && previous.activeKey !== activeKey && from && !reducedMotion.matches
        && document.visibilityState !== 'hidden';

      cancelAnimation();
      ink.style.width = `${next.width}px`;
      ink.style.transform = `translate3d(${next.x}px, 0, 0)`;
      ink.style.opacity = '1';
      initializedRef.current = true;
      positionRef.current = next;

      if (shouldAnimate && typeof ink.animate === 'function') {
        animationRef.current = ink.animate([
          { transform: `translate3d(${from.x}px, 0, 0)`, width: `${from.width}px` },
          { transform: `translate3d(${next.x}px, 0, 0)`, width: `${next.width}px` },
        ], { duration: 340, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      }
    };

    measure(true);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => measure(false));
    resizeObserver?.observe(bar);
    bar.querySelectorAll('.editorial-session-tab').forEach(tab => resizeObserver?.observe(tab));
    const onResize = () => measure(false);
    const onMotionPreference = () => { if (reducedMotion.matches) cancelAnimation(); };
    window.addEventListener('resize', onResize);
    reducedMotion.addEventListener('change', onMotionPreference);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      reducedMotion.removeEventListener('change', onMotionPreference);
    };
  }, [activeKey, layoutKey, scopeKey, positionRef]);

  useLayoutEffect(() => () => { animationRef.current?.cancel(); }, []);

  return <span ref={inkRef} className="session-tab-ink" aria-hidden="true" />;
}
