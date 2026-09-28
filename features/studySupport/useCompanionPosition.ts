import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_KEY = 'classSkip_companion_position_v1';
const EDGE = 12;
type Position = { left: number; top: number };

function readPosition(): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
  } catch { return null; }
}

export function useCompanionPosition(paused: boolean, popupKey: string, onDrag: () => void) {
  const root = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position | null>(readPosition);
  const [dragging, setDragging] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const drag = useRef<{ id: number; x: number; y: number; origin: Position; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const latestPosition = useRef(position);

  const clamp = (next: Position): Position => {
    const rect = root.current?.getBoundingClientRect();
    return {
      left: Math.max(EDGE, Math.min(next.left, window.innerWidth - (rect?.width ?? 170) - EDGE)),
      top: Math.max(EDGE, Math.min(next.top, window.innerHeight - (rect?.height ?? 85) - EDGE)),
    };
  };
  const move = (next: Position | null, save = false) => {
    const value = next ? clamp(next) : null;
    latestPosition.current = value;
    setPosition(previous => previous?.left === value?.left && previous?.top === value?.top ? previous : value);
    if (save) {
      try {
        if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        else localStorage.removeItem(STORAGE_KEY);
      } catch { /* Moving remains available without browser storage. */ }
    }
  };

  useLayoutEffect(() => {
    if (paused) return;
    const update = () => {
      if (latestPosition.current) move(latestPosition.current);
      const anchor = launcher.current?.getBoundingClientRect();
      const box = popup.current?.getBoundingClientRect();
      if (!popupKey || !anchor || !box) return;
      const above = Math.max(0, anchor.top - EDGE - 10);
      const below = Math.max(0, window.innerHeight - anchor.bottom - EDGE - 10);
      const useAbove = above >= below;
      const maxHeight = Math.max(48, useAbove ? above : below);
      const next = {
        left: Math.max(EDGE, Math.min(anchor.right - box.width, window.innerWidth - box.width - EDGE)),
        top: useAbove ? Math.max(EDGE, anchor.top - Math.min(box.height, maxHeight) - 10) : anchor.bottom + 10,
        maxHeight,
      };
      setPopupStyle(previous => previous.left === next.left && previous.top === next.top && previous.maxHeight === next.maxHeight ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (root.current) observer.observe(root.current);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [position, paused, popupKey]);

  const finish = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    if (drag.current?.id !== event.pointerId) return;
    const moved = drag.current.moved;
    suppressClick.current = moved || cancelled;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) move(latestPosition.current, true);
  };

  return {
    root, launcher, popup, dragging,
    rootStyle: !paused && position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } as CSSProperties : undefined,
    popupStyle: paused ? undefined : popupStyle,
    consumeDragClick: (detail: number) => {
      const skip = detail !== 0 && suppressClick.current;
      suppressClick.current = false;
      return skip;
    },
    launcherEvents: {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (paused || !event.isPrimary || event.button !== 0) return;
        const rect = root.current?.getBoundingClientRect();
        if (!rect) return;
        suppressClick.current = false;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { left: rect.left, top: rect.top }, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 6) return;
        if (!start.moved) { start.moved = true; setDragging(true); onDrag(); }
        move({ left: start.origin.left + dx, top: start.origin.top + dy });
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => finish(event),
      onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, true),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (paused) return;
        if (event.key === 'Home') { event.preventDefault(); move(null, true); return; }
        const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = delta[event.key];
        const rect = root.current?.getBoundingClientRect();
        if (!direction || !rect) return;
        event.preventDefault();
        const step = event.shiftKey ? 40 : 10;
        move({ left: rect.left + direction[0] * step, top: rect.top + direction[1] * step }, true);
      },
    },
  };
}
