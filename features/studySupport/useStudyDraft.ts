import { useCallback, useEffect, useState, type SetStateAction } from 'react';

const keyFor = (scope: string) => `classSkip_studyDraft_v1:${scope}`;
export function readStudyDraft(scope: string) {
  try { return localStorage.getItem(keyFor(scope)) ?? ''; } catch { return ''; }
}
export function writeStudyDraft(scope: string, text: string) {
  if (text) localStorage.setItem(keyFor(scope), text);
  else localStorage.removeItem(keyFor(scope));
}

/** Scope changes never copy the previous document's draft into the new one. */
export function useStudyDraft(scope: string) {
  const [state, setState] = useState(() => ({ scope, text: readStudyDraft(scope) }));
  const text = state.scope === scope ? state.text : readStudyDraft(scope);
  const setText = useCallback((next: SetStateAction<string>) => {
    setState(previous => ({ scope, text: typeof next === 'function' ? next(previous.scope === scope ? previous.text : readStudyDraft(scope)) : next }));
  }, [scope]);
  const flush = () => writeStudyDraft(scope, text);
  useEffect(() => {
    if (state.scope !== scope) return;
    try { writeStudyDraft(scope, state.text); } catch { /* Explicit pause reports persistence errors. */ }
  }, [scope, state]);
  return [text, setText, flush] as const;
}
