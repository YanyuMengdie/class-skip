import type {
  ChatMessage,
  SkimExplanationSpineKind,
  SkimModuleTakeaway,
  SkimModuleTakeawayStatus,
} from '@/types';
import {
  getActiveSkimExplanationVariant,
  getDisplayedSkimMessageText,
} from './skimExplanation';

export interface SkimTakeawaySourceItem {
  id: string;
  titleZh: string;
  titleEn?: string;
  kind: SkimExplanationSpineKind;
  summary: string;
  pageRefs: number[];
  status: SkimModuleTakeawayStatus;
}

export interface SkimTakeawayModelDraft {
  titleZh?: unknown;
  titleEn?: unknown;
  plainLanguage?: unknown;
  connection?: unknown;
  sourceIds?: unknown;
}

export interface SkimTakeawaySourceOptions {
  /** 唱片式没有连接式内容骨架时，用当前唱片边界建立可信的消息级来源。 */
  recordScope?: {
    title: string;
    pageStart: number;
    pageEnd: number;
  };
}

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

const cleanText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const getMessageSourcePrefix = (message: ChatMessage, index: number): string => (
  message.id ?? `legacy-${message.timestamp || 0}-${index}`
);

const getScopedMessagePageRefs = (text: string, pageStart: number, pageEnd: number): number[] => {
  const safeStart = Math.max(1, Math.floor(pageStart));
  const safeEnd = Math.max(safeStart, Math.floor(pageEnd));
  const found = new Set<number>();
  const addRange = (rawStart: string, rawEnd?: string) => {
    const start = Number.parseInt(rawStart, 10);
    const end = rawEnd ? Number.parseInt(rawEnd, 10) : start;
    if (!Number.isInteger(start) || !Number.isInteger(end)) return;
    const low = Math.max(safeStart, Math.min(start, end));
    const high = Math.min(safeEnd, Math.max(start, end));
    for (let page = low; page <= high; page += 1) found.add(page);
  };
  for (const match of text.matchAll(/(?:第\s*)?(\d{1,4})\s*(?:[-–—至~]\s*(\d{1,4}))?\s*页/gi)) {
    addRange(match[1], match[2]);
  }
  for (const match of text.matchAll(/(?:pages?|pp?\.?)[\s:]*(\d{1,4})\s*(?:(?:[-–—~]|to)\s*(\d{1,4}))?/gi)) {
    addRange(match[1], match[2]);
  }
  return found.size > 0
    ? Array.from(found).sort((a, b) => a - b)
    : Array.from({ length: safeEnd - safeStart + 1 }, (_, index) => safeStart + index);
};

export const collectSkimTakeawaySources = (
  messages: ChatMessage[],
  options: SkimTakeawaySourceOptions = {},
): SkimTakeawaySourceItem[] => {
  const sources: SkimTakeawaySourceItem[] = [];
  let recordMessageNumber = 0;
  messages.forEach((message, messageIndex) => {
    if (
      message.role !== 'model'
      || message.skimKnowledgeExtraction
      || message.skimKnowledgeExtractionFeedback
    ) return;
    if (!message.skimExplanation) {
      const scope = options.recordScope;
      const displayedText = getDisplayedSkimMessageText(message).trim();
      if (!scope || !displayedText) return;
      recordMessageNumber += 1;
      sources.push({
        id: `${getMessageSourcePrefix(message, messageIndex)}:record-message`,
        titleZh: `${scope.title} · 讲解 ${recordMessageNumber}`,
        kind: 'concept',
        summary: displayedText.slice(0, 360),
        pageRefs: getScopedMessagePageRefs(displayedText, scope.pageStart, scope.pageEnd),
        status: 'explained',
      });
      return;
    }
    const activeVariant = getActiveSkimExplanationVariant(message);
    if (!activeVariant) return;
    const covered = new Set(activeVariant.coveredSpineItemIds);
    const deferred = new Set(activeVariant.deferredSpineItemIds);
    const prefix = getMessageSourcePrefix(message, messageIndex);
    message.skimExplanation.spineItems.forEach((item) => {
      const status: SkimModuleTakeawayStatus | null = covered.has(item.id)
        ? 'explained'
        : deferred.has(item.id)
          ? 'deferred'
          : null;
      if (!status) return;
      sources.push({
        id: `${prefix}:${item.id}`,
        titleZh: item.titleZh.trim(),
        ...(item.titleEn?.trim() ? { titleEn: item.titleEn.trim() } : {}),
        kind: item.kind,
        summary: item.summary.trim(),
        pageRefs: unique(item.pageRefs.filter(Number.isInteger)).sort((a, b) => a - b),
        status,
      });
    });
  });
  return sources;
};

export const buildDisplayedSkimTranscript = (messages: ChatMessage[]): string => (
  messages
    .filter((message) => !message.skimKnowledgeExtraction && !message.skimKnowledgeExtractionFeedback)
    .map((message) => `${message.role === 'user' ? '用户' : '导读'}: ${getDisplayedSkimMessageText(message)}`)
    .join('\n\n')
);

const connectionFallback: Record<SkimExplanationSpineKind, string> = {
  concept: '这是理解本段内容时需要先抓住的核心概念。',
  relationship: '这条关系把本段中容易分散理解的内容连接起来。',
  mechanism: '它说明了这件事是怎样一步步发生的。',
  evidence: '这是材料用来支持或限制结论的依据。',
  boundary: '它提醒我们这个结论在什么情况下不能直接套用。',
  example: '这个例子负责把抽象说法落到具体情境中。',
};

const sourceToFallbackTakeaway = (
  source: SkimTakeawaySourceItem,
  index: number,
): SkimModuleTakeaway => ({
  id: `takeaway-fallback-${index}-${source.id}`,
  titleZh: source.titleZh,
  ...(source.titleEn ? { titleEn: source.titleEn } : {}),
  plainLanguage: source.summary,
  connection: connectionFallback[source.kind],
  pageRefs: source.pageRefs,
  status: source.status,
  sourceIds: [source.id],
});

const titleKey = (item: Pick<SkimModuleTakeaway, 'titleZh' | 'titleEn'>): string => (
  `${item.titleZh}|${item.titleEn ?? ''}`.toLocaleLowerCase()
);

export const normalizeSkimTakeawayDrafts = (
  drafts: SkimTakeawayModelDraft[],
  sources: SkimTakeawaySourceItem[],
  pageStart: number,
  pageEnd: number,
): SkimModuleTakeaway[] => {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const normalized: SkimModuleTakeaway[] = [];
  const seenTitles = new Set<string>();

  drafts.forEach((draft, index) => {
    const sourceIds = unique(
      (Array.isArray(draft.sourceIds) ? draft.sourceIds : [])
        .map(cleanText)
        .filter((id) => sourceMap.has(id)),
    );
    // 新版连接式讲解存在可靠骨架时，不接受无法定位来源的模型要点。
    if (sources.length > 0 && sourceIds.length === 0) return;
    const linkedSources = sourceIds.map((id) => sourceMap.get(id)!).filter(Boolean);
    // 已讲与暂存不能被模型揉成同一项，否则暂存细节可能被误拿去出题。
    if (new Set(linkedSources.map((source) => source.status)).size > 1) return;
    const firstSource = linkedSources[0];
    const titleZh = cleanText(draft.titleZh) || firstSource?.titleZh || '';
    const titleEn = cleanText(draft.titleEn) || firstSource?.titleEn || '';
    const plainLanguage = cleanText(draft.plainLanguage) || firstSource?.summary || '';
    const connection = cleanText(draft.connection)
      || (firstSource ? connectionFallback[firstSource.kind] : '这是刚才领读中已经出现的一个关键点。');
    if (!titleZh || !plainLanguage) return;
    const key = `${titleZh}|${titleEn}`.toLocaleLowerCase();
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    const pageRefs = unique(linkedSources.flatMap((source) => source.pageRefs))
      .filter((page) => Number.isInteger(page) && page >= pageStart && page <= pageEnd)
      .sort((a, b) => a - b);
    normalized.push({
      id: `takeaway-${index}-${sourceIds.join('-') || 'legacy'}`,
      titleZh,
      ...(titleEn ? { titleEn } : {}),
      plainLanguage,
      connection,
      pageRefs,
      status: linkedSources.length > 0 && linkedSources.every((source) => source.status === 'deferred')
        ? 'deferred'
        : 'explained',
      sourceIds,
    });
  });

  const addFallbacks = (status: SkimModuleTakeawayStatus, minimum: number, maximum: number) => {
    const currentCount = normalized.filter((item) => item.status === status).length;
    if (currentCount >= minimum) return;
    sources
      .filter((source) => source.status === status)
      .forEach((source, index) => {
        if (normalized.filter((item) => item.status === status).length >= maximum) return;
        const fallback = sourceToFallbackTakeaway(source, index);
        const key = titleKey(fallback);
        if (seenTitles.has(key)) return;
        seenTitles.add(key);
        normalized.push(fallback);
      });
  };

  addFallbacks('explained', Math.min(3, sources.filter((source) => source.status === 'explained').length), 6);
  // 暂存项用于告知“AI替你记着什么”，不要求凑数量。
  addFallbacks('deferred', sources.some((source) => source.status === 'deferred') ? 1 : 0, 4);
  return normalized;
};

export const formatSkimTakeawaysForNotebook = (takeaways: SkimModuleTakeaway[]): string => (
  takeaways.map((item) => {
    const title = `${item.titleZh}${item.titleEn ? `（${item.titleEn}）` : ''}`;
    const pages = item.pageRefs.length > 0 ? `（第 ${item.pageRefs.join('、')} 页）` : '';
    const prefix = item.status === 'deferred' ? '[AI暂存] ' : '';
    return `${prefix}${title}${pages}\n- 大白话：${item.plainLanguage}\n- 作用：${item.connection}`;
  }).join('\n\n')
);
