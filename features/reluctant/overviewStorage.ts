import type { AppLanguage } from '@/types';
import {
  OVERVIEW_VERSION,
  parseOverviewExplanation,
  parseOverviewOutline,
  type OverviewExplanation,
  type OverviewOutline,
  type OverviewStyle,
} from './overview';

export interface OverviewCache {
  version: typeof OVERVIEW_VERSION;
  outline: OverviewOutline;
  explanations: Partial<Record<OverviewStyle, OverviewExplanation>>;
  scrollPositions: Partial<Record<OverviewStyle, number>>;
  updatedAt: number;
}

type OverviewStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const getOverviewStorageKey = (
  userId: string,
  sessionId: string,
  fileUrl: string,
  language: AppLanguage,
): string => `reluctant-overview:${JSON.stringify([OVERVIEW_VERSION, userId, sessionId, fileUrl, language])}`;

export const readOverviewCache = (
  storage: OverviewStorage,
  key: string,
): { cache: OverviewCache | null; unavailable: boolean } => {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { cache: null, unavailable: true };
  }
  if (!raw) return { cache: null, unavailable: false };
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== OVERVIEW_VERSION || !value.outline) {
      return { cache: null, unavailable: false };
    }
    const outline = parseOverviewOutline(value.outline, value.outline.pageCount);
    const explanations: OverviewCache['explanations'] = {};
    const scrollPositions: OverviewCache['scrollPositions'] = {};
    for (const style of ['plain', 'story'] as const) {
      const explanation = value.explanations?.[style];
      try {
        if (explanation) explanations[style] = parseOverviewExplanation(explanation, outline);
      } catch {
        // Regenerate only the damaged style; the shared source outline is still useful.
      }
      const position = value.scrollPositions?.[style];
      if (typeof position === 'number' && Number.isFinite(position) && position >= 0 && position <= 10_000_000) {
        scrollPositions[style] = position;
      }
    }
    return {
      cache: {
        version: OVERVIEW_VERSION,
        outline,
        explanations,
        scrollPositions,
        updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
      },
      unavailable: false,
    };
  } catch {
    return { cache: null, unavailable: false };
  }
};

export const writeOverviewCache = (storage: OverviewStorage, key: string, next: OverviewCache): boolean => {
  try {
    const previous = readOverviewCache(storage, key).cache;
    const normalizedNext = { ...next, outline: parseOverviewOutline(next.outline, next.outline.pageCount) };
    // A different outline must never inherit source references from an older explanation.
    const sameOutline = previous && JSON.stringify(previous.outline) === JSON.stringify(normalizedNext.outline);
    const merged: OverviewCache = sameOutline ? {
      ...normalizedNext,
      explanations: { ...previous.explanations, ...next.explanations },
      scrollPositions: { ...previous.scrollPositions, ...next.scrollPositions },
    } : normalizedNext;
    storage.setItem(key, JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
};

/** Reuse pending and completed generated text; rejected requests remain retryable. */
export const createOverviewRequestPool = <T,>(maxCompleted = 12) => {
  const requests = new Map<string, { promise: Promise<T>; completed: boolean }>();
  return (key: string, create: () => Promise<T>): Promise<T> => {
    const existing = requests.get(key);
    if (existing) return existing.promise;
    const entry = { promise: Promise.resolve().then(create), completed: false };
    requests.set(key, entry);
    void entry.promise.then(() => {
      entry.completed = true;
      const completedKeys = [...requests].filter(([, value]) => value.completed).map(([requestKey]) => requestKey);
      for (const oldKey of completedKeys.slice(0, Math.max(0, completedKeys.length - maxCompleted))) requests.delete(oldKey);
    }, () => {
      if (requests.get(key) === entry) requests.delete(key);
    });
    return entry.promise;
  };
};
