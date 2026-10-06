import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Device-local anchors: shared content must never drag another device's viewport. */
export function useReadingScroll(
  ref: RefObject<HTMLDivElement | null>,
  scope: string,
  revision: string,
  generating: boolean,
  surface: string,
) {
  const nearBottom = useRef(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = `classskip-reading-position:${scope}:${surface}`;
    let saved: { id?: string; offset?: number; top: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      /* Read without a bookmark. */
    }
    const restore = () => {
      const message = saved?.id
        ? Array.from(element.querySelectorAll<HTMLElement>('[data-reading-message]')).find(
            (item) => item.dataset.readingMessage === saved!.id,
          )
        : null;
      element.scrollTop = message ? message.offsetTop - (saved?.offset ?? 0) : (saved?.top ?? 0);
      nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    };
    restore();
    const frame = requestAnimationFrame(restore);
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => {
      const top = element.getBoundingClientRect().top;
      const message = Array.from(
        element.querySelectorAll<HTMLElement>('[data-reading-message]'),
      ).find((item) => item.getBoundingClientRect().bottom > top);
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            top: element.scrollTop,
            id: message?.dataset.readingMessage,
            offset: message ? message.offsetTop - element.scrollTop : 0,
          }),
        );
      } catch {
        /* Reading remains available. */
      }
    };
    const onScroll = () => {
      nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
      clearTimeout(timer);
      timer = setTimeout(persist, 150);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      persist();
      element.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
    };
  }, [scope, surface]);
  useLayoutEffect(() => {
    if (nearBottom.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [revision, generating]);
}
