import { useEffect, useMemo, useState } from 'react';
import type { ExamMaterialLink, LSAPKnowledgeComponent } from '@/types';
import type { RoundLanguage } from './roundTypes';
import { generateThemePlan, themeSourceKey, validateThemePlan, type ThemePlan } from './themeGrouping';

// Shared only while in flight: React remounts must not duplicate paid generation.
const pendingPlans = new Map<string, Promise<ThemePlan>>();

export function useThemePlan(storageKey: string, material: ExamMaterialLink | null,
  kcs: LSAPKnowledgeComponent[], pages: string[], language: RoundLanguage, enabled: boolean) {
  const sourceKey = useMemo(() => material && kcs.length && pages.length
    ? themeSourceKey(material, kcs, pages, language) : '', [material, kcs, pages, language]);
  const cacheKey = `${storageKey}:themes:${material?.id ?? ''}:${language}`;
  const identity = `${cacheKey}:${sourceKey}`;
  const [revision, setRevision] = useState({ identity: '', value: 0 });
  const retry = revision.identity === identity ? revision.value : 0;
  const [state, setState] = useState<{ identity: string; plan: ThemePlan | null; busy: boolean; error: string }>({ identity: '', plan: null, busy: false, error: '' });

  useEffect(() => {
    if (!enabled || !sourceKey || !material) return;
    let cancelled = false;
    let cached: ThemePlan | null = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) cached = validateThemePlan(JSON.parse(raw), material, kcs, pages, language);
    } catch { /* An outdated or invalid grouping never changes the knowledge map or records. */ }
    if (cached && !retry) {
      setState({ identity, plan: cached, busy: false, error: '' });
      return;
    }
    setState({ identity, plan: cached, busy: true, error: '' });
    const requestKey = `${identity}:${retry}`;
    let request = pendingPlans.get(requestKey);
    if (!request) {
      request = generateThemePlan(material, kcs, pages, language);
      pendingPlans.set(requestKey, request);
      void request.finally(() => pendingPlans.delete(requestKey)).catch(() => {});
    }
    request.then(plan => {
      if (cancelled) return;
      let error = '';
      try { localStorage.setItem(cacheKey, JSON.stringify(plan)); }
      catch { error = language === 'en' ? 'Grouping is available on this page, but could not be saved on this device.' : '主题已整理好，但暂时无法存到这台设备；当前页面仍可使用。'; }
      setState({ identity, plan, busy: false, error });
    }).catch(error => {
      if (!cancelled) setState({ identity, plan: cached, busy: false,
        error: error instanceof Error ? error.message : (language === 'en' ? 'Theme grouping did not finish. Please retry.' : '主题分组没有完成，请重试。') });
    });
    return () => { cancelled = true; };
  }, [identity, enabled, retry]);

  const current = state.identity === identity ? state : null;
  return {
    plan: current?.plan ?? null,
    busy: enabled && !!sourceKey && (!current || current.busy),
    error: current?.error ?? '',
    regenerate: () => setRevision(value => ({ identity, value: value.identity === identity ? value.value + 1 : 1 })),
  };
}
