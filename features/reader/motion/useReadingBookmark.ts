import { useCallback, useEffect, useRef } from 'react';
import './readingBookmark.css';

/** Scroll to an existing reading reply, then briefly mark the actual destination. */
export function useReadingBookmark() {
  const cleanupRef = useRef<(() => void) | null>(null);
  const cancelReadingBookmark = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const jumpToReadingMessage = useCallback((container: HTMLElement, message: HTMLElement) => {
    cancelReadingBookmark();
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const targetTop = Math.max(0, Math.min(
      container.scrollHeight - container.clientHeight,
      container.scrollTop + message.getBoundingClientRect().top
        - container.getBoundingClientRect().top - 12,
    ));
    container.scrollTo({ top: targetTop, behavior: preference.matches ? 'instant' : 'smooth' });
    if (preference.matches || document.visibilityState === 'hidden') return;

    let frame = 0;
    let settledFrames = 0;
    let waitingForLanding = true;
    const startedAt = performance.now();
    const animations: Animation[] = [];
    const cleanup = () => {
      cancelAnimationFrame(frame);
      if (waitingForLanding && container.isConnected) {
        container.scrollTo({ top: container.scrollTop, behavior: 'instant' });
      }
      animations.forEach(animation => animation.cancel());
      container.removeEventListener('wheel', cleanup);
      container.removeEventListener('touchstart', cleanup);
      container.removeEventListener('pointerdown', cleanup);
      container.removeEventListener('keydown', cleanup);
      preference.removeEventListener('change', cleanup);
      document.removeEventListener('visibilitychange', cleanup);
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    container.addEventListener('wheel', cleanup, { passive: true });
    container.addEventListener('touchstart', cleanup, { passive: true });
    container.addEventListener('pointerdown', cleanup, { passive: true });
    container.addEventListener('keydown', cleanup);
    preference.addEventListener('change', cleanup);
    document.addEventListener('visibilitychange', cleanup);

    const waitForLanding = () => {
      if (!message.isConnected || !container.contains(message) || performance.now() - startedAt > 1800) {
        cleanup();
        return;
      }
      // The last message may be too near the bottom to align at the top.
      // Check the clamped scroll destination, not a fixed delay or PDF page.
      settledFrames = Math.abs(container.scrollTop - targetTop) < 2 ? settledFrames + 1 : 0;
      if (settledFrames < 2) {
        frame = requestAnimationFrame(waitForLanding);
        return;
      }
      waitingForLanding = false;

      const paper = message.querySelector<HTMLElement>('.reading-reply-paper');
      const bookmark = paper?.querySelector<HTMLElement>('.reading-reply-bookmark');
      if (!paper || !bookmark || typeof paper.animate !== 'function') {
        cleanup();
        return;
      }
      const background = getComputedStyle(paper).backgroundColor;
      const paperAnimation = paper.animate([
        { backgroundColor: background, offset: 0 },
        { backgroundColor: '#f7efd7', offset: 0.2 },
        { backgroundColor: '#f7efd7', offset: 0.65 },
        { backgroundColor: background, offset: 1 },
      ], { duration: 1200, easing: 'ease-out' });
      const bookmarkAnimation = bookmark.animate([
        { opacity: 0, transform: 'translateY(-9px)', offset: 0 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.18 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.72 },
        { opacity: 0, transform: 'translateY(-2px)', offset: 1 },
      ], { duration: 1200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      animations.push(paperAnimation, bookmarkAnimation);
      paperAnimation.addEventListener('finish', cleanup, { once: true });
    };
    frame = requestAnimationFrame(waitForLanding);
  }, [cancelReadingBookmark]);

  useEffect(() => cancelReadingBookmark, [cancelReadingBookmark]);
  return { jumpToReadingMessage, cancelReadingBookmark };
}
