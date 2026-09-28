import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface SupportSurface {
  scope: string;
  priority: number;
  busy?: boolean;
  boundary?: string;
  actions: { id: string; label: string; run: () => void }[];
  pause?: () => void | Promise<void>;
  resume?: () => void;
}
type Entry = { current: SupportSurface };
interface SupportContext {
  register: (id: string, entry: Entry) => () => void;
  surfaces: Entry[];
  paused: boolean;
  setPaused: (paused: boolean) => void;
}
const Context = createContext<SupportContext | null>(null);

export function StudySupportProvider({ children }: React.PropsWithChildren) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [paused, setPaused] = useState(false);
  const register = useCallback((id: string, entry: Entry) => {
    setEntries(previous => ({ ...previous, [id]: entry }));
    return () => setEntries(previous => {
      const next = { ...previous }; delete next[id]; return next;
    });
  }, []);
  const value = useMemo(() => ({ register, surfaces: Object.values(entries), paused, setPaused }), [entries, paused, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// Optional so existing panels also work when rendered independently.
export function useSupportSurface(surface: SupportSurface, enabled = true) {
  const context = useContext(Context);
  const id = useId();
  const entry = useRef(surface);
  entry.current = surface;
  const register = context?.register;
  const signature = JSON.stringify([surface.scope, surface.priority, surface.busy, surface.boundary, surface.actions.map(({ id, label }) => [id, label])]);
  useEffect(() => enabled && register ? register(id, entry) : undefined, [enabled, id, register, signature]);
}

export const useStudySupport = () => useContext(Context);
