import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefCallback } from 'react';

/**
 * Mark only a successfully generated reply, immediately before appending it.
 * The mark is consumed on its first DOM attachment, so restored history and
 * remounts never acquire an animation just because the message list changed.
 */
export function useReplyArrival() {
  const pendingReplies = useRef(new WeakSet<object>());
  const replyRefs = useRef(new WeakMap<object, RefCallback<HTMLElement>>());
  const activeAnimations = useRef(new Set<Animation>());

  const markReplyArrival = useCallback((reply: object) => {
    pendingReplies.current.add(reply);
  }, []);

  const replyArrivalRef = useCallback((reply: object): RefCallback<HTMLElement> => {
    const existing = replyRefs.current.get(reply);
    if (existing) return existing;

    let running: Animation | null = null;
    let attachedElement: HTMLElement | null = null;
    const attach: RefCallback<HTMLElement> = (element) => {
      attachedElement = element;
      if (!element) {
        if (running) {
          activeAnimations.current.delete(running);
          running.cancel();
          running = null;
        }
        return;
      }

      if (!pendingReplies.current.delete(reply)) return;
      // Wait only for React's ref attachment pass (including StrictMode's
      // setup/cleanup probe), not for a timer or another frame of content.
      queueMicrotask(() => {
        if (
          attachedElement !== element || !element.isConnected ||
          typeof element.animate !== 'function' ||
          document.visibilityState === 'hidden' ||
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) return;

        // Compositor-only movement: markdown, final height, and scroll targets
        // are already in place; the full response remains readable immediately.
        const animation = element.animate([
          { opacity: 0.72, transform: 'translateY(5px) scaleY(0.992)', transformOrigin: 'center top' },
          { opacity: 1, transform: 'translateY(0) scaleY(1)', transformOrigin: 'center top' },
        ], {
          duration: 360,
          easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
        });
        running = animation;
        activeAnimations.current.add(animation);
        const release = () => {
          activeAnimations.current.delete(animation);
          if (running === animation) running = null;
        };
        animation.addEventListener('finish', release, { once: true });
        animation.addEventListener('cancel', release, { once: true });
      });
    };
    replyRefs.current.set(reply, attach);
    return attach;
  }, []);

  useLayoutEffect(() => {
    // Descendant refs have attached before this layout effect. Replies absent
    // from this commit must not animate when an old/hidden view appears later.
    // Consumed arrivals already have their own microtask; StrictMode's layout
    // replay therefore cannot suppress an actual new reply.
    pendingReplies.current = new WeakSet<object>();
  });

  useEffect(() => {
    const cancelAnimations = () => {
      activeAnimations.current.forEach((animation) => animation.cancel());
      activeAnimations.current.clear();
    };
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => {
      if (preference?.matches) cancelAnimations();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelAnimations();
    };
    preference?.addEventListener('change', onPreferenceChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      preference?.removeEventListener('change', onPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimations();
    };
  }, []);

  return { markReplyArrival, replyArrivalRef };
}
