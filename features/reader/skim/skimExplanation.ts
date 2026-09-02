import type {
  ChatMessage,
  SkimContentType,
  SkimExplanationDepth,
  SkimExplanationSpineItem,
  SkimExplanationState,
  SkimExplanationStyle,
  SkimExplanationVariant,
  SkimExplanationVariantKey,
  SkimStudyStyle,
} from '@/types';

export interface SkimExplanationTurnDraft {
  responseKind: 'explanation' | 'transition';
  messageMarkdown: string;
  spineItems: SkimExplanationSpineItem[];
  coveredSpineItemIds: string[];
  deferredSpineItemIds: string[];
  pageRefs: number[];
}

export interface SkimExplanationVariantDraft {
  messageMarkdown: string;
  coveredSpineItemIds: string[];
  deferredSpineItemIds: string[];
  pageRefs: number[];
}

export interface SkimExplanationValidationResult {
  valid: boolean;
  errors: string[];
}

export const shouldUseConnectedLectureExplanation = (
  mode: 'tutoring' | 'reading',
  studyStyle: SkimStudyStyle,
  contentType: SkimContentType,
  hasActiveRecord: boolean,
): boolean => (
  mode === 'reading'
  && contentType === 'lecture'
  && (studyStyle === 'continuous' || (studyStyle === 'records' && hasActiveRecord))
);

export const resolveSkimExplanationPageBounds = (
  configuredStart: number,
  configuredEnd: number,
  recordScope?: { pageStart: number; pageEnd: number } | null,
): { pageStart: number; pageEnd: number } => (
  recordScope
    ? { pageStart: recordScope.pageStart, pageEnd: recordScope.pageEnd }
    : { pageStart: configuredStart, pageEnd: configuredEnd }
);

export const getSkimExplanationVariantKey = (
  depth: SkimExplanationDepth,
  style: SkimExplanationStyle,
): SkimExplanationVariantKey => `${depth}-${style}` as SkimExplanationVariantKey;

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

export const normalizeSkimExplanationPages = (
  pages: number[],
  pageStart: number,
  pageEnd: number,
): number[] => unique(
  pages
    .map((page) => Math.round(Number(page)))
    .filter((page) => Number.isFinite(page) && page >= pageStart && page <= pageEnd),
).sort((a, b) => a - b);

const validateCoveragePartition = (
  allIds: string[],
  coveredIds: string[],
  deferredIds: string[],
  depth: SkimExplanationDepth,
): string[] => {
  const errors: string[] = [];
  const known = new Set(allIds);
  const covered = unique(coveredIds);
  const deferred = unique(deferredIds);
  [...covered, ...deferred].forEach((id) => {
    if (!known.has(id)) errors.push(`讲解引用了不存在的骨架项 ${id}。`);
  });
  covered.filter((id) => deferred.includes(id)).forEach((id) => {
    errors.push(`骨架项 ${id} 同时被标记为已讲和暂存。`);
  });
  allIds.forEach((id) => {
    if (!covered.includes(id) && !deferred.includes(id)) errors.push(`骨架项 ${id} 没有被安置。`);
  });
  if (depth === 'normal') {
    if (deferred.length > 0) errors.push('正常版不能保留暂存骨架项。');
    allIds.forEach((id) => {
      if (!covered.includes(id)) errors.push(`正常版没有覆盖骨架项 ${id}。`);
    });
  }
  return errors;
};

export const validateSkimExplanationTurnDraft = (
  draft: SkimExplanationTurnDraft,
  depth: SkimExplanationDepth,
  pageStart: number,
  pageEnd: number,
): SkimExplanationValidationResult => {
  const errors: string[] = [];
  if (!draft.messageMarkdown.trim()) errors.push('讲解正文为空。');
  if (draft.responseKind === 'transition') {
    if (draft.spineItems.length > 0) errors.push('纯过渡回复不应创建内容骨架。');
    if (draft.coveredSpineItemIds.length > 0 || draft.deferredSpineItemIds.length > 0 || draft.pageRefs.length > 0) {
      errors.push('纯过渡回复不应创建覆盖或页码记录。');
    }
    return { valid: errors.length === 0, errors };
  }
  if (draft.spineItems.length === 0) errors.push('实质讲解缺少内容骨架。');
  const ids = draft.spineItems.map((item) => item.id.trim());
  if (ids.some((id) => !id)) errors.push('存在没有 ID 的骨架项。');
  if (new Set(ids).size !== ids.length) errors.push('内容骨架 ID 重复。');
  draft.spineItems.forEach((item) => {
    if (!item.titleZh.trim() || !item.summary.trim()) errors.push(`骨架项 ${item.id || '未知'} 缺少中文标题或摘要。`);
    if (item.pageRefs.length === 0) errors.push(`骨架项 ${item.id || '未知'} 没有原文页码。`);
    item.pageRefs.forEach((page) => {
      if (!Number.isInteger(page) || page < pageStart || page > pageEnd) {
        errors.push(`骨架项 ${item.id || '未知'} 引用了范围外第 ${page} 页。`);
      }
    });
  });
  draft.pageRefs.forEach((page) => {
    if (!Number.isInteger(page) || page < pageStart || page > pageEnd) errors.push(`讲解引用了范围外第 ${page} 页。`);
  });
  errors.push(...validateCoveragePartition(ids, draft.coveredSpineItemIds, draft.deferredSpineItemIds, depth));
  return { valid: errors.length === 0, errors };
};

export const validateSkimExplanationVariantDraft = (
  draft: SkimExplanationVariantDraft,
  spineItems: SkimExplanationSpineItem[],
  depth: SkimExplanationDepth,
  pageStart: number,
  pageEnd: number,
): SkimExplanationValidationResult => {
  const errors: string[] = [];
  if (!draft.messageMarkdown.trim()) errors.push('新版本正文为空。');
  const ids = spineItems.map((item) => item.id);
  errors.push(...validateCoveragePartition(ids, draft.coveredSpineItemIds, draft.deferredSpineItemIds, depth));
  draft.pageRefs.forEach((page) => {
    if (!Number.isInteger(page) || page < pageStart || page > pageEnd) errors.push(`新版本引用了范围外第 ${page} 页。`);
  });
  return { valid: errors.length === 0, errors };
};

export const createSkimExplanationState = (
  draft: SkimExplanationTurnDraft,
  depth: SkimExplanationDepth,
  style: SkimExplanationStyle = 'standard',
  createdAt = Date.now(),
): SkimExplanationState => {
  const key = getSkimExplanationVariantKey(depth, style);
  const sourcePageRefs = unique([
    ...draft.pageRefs,
    ...draft.spineItems.flatMap((item) => item.pageRefs),
  ]).sort((a, b) => a - b);
  const variant: SkimExplanationVariant = {
    key,
    depth,
    style,
    messageMarkdown: draft.messageMarkdown,
    coveredSpineItemIds: unique(draft.coveredSpineItemIds),
    deferredSpineItemIds: unique(draft.deferredSpineItemIds),
    pageRefs: unique(draft.pageRefs).sort((a, b) => a - b),
    createdAt,
  };
  return {
    version: 1,
    activeVariantKey: key,
    spineItems: draft.spineItems,
    variants: { [key]: variant },
    sourcePageRefs,
  };
};

export const isLegacyRecordExplanationCandidate = (message: ChatMessage): boolean => (
  message.role === 'model'
  && !message.skimExplanation
  && !message.isQuiz
  && !message.skimKnowledgeExtraction
  && !message.skimKnowledgeExtractionFeedback
  && message.text.replace(/\s+/g, ' ').trim().length >= 32
);

export const createSkimExplanationStateFromLegacyMessage = (
  legacyMessageMarkdown: string,
  draft: SkimExplanationTurnDraft,
  targetDepth: SkimExplanationDepth,
  targetStyle: SkimExplanationStyle,
  createdAt = Date.now(),
): SkimExplanationState => {
  const targetKey = getSkimExplanationVariantKey(targetDepth, targetStyle);
  const allSpineItemIds = draft.spineItems.map((item) => item.id);
  const sourcePageRefs = unique([
    ...draft.pageRefs,
    ...draft.spineItems.flatMap((item) => item.pageRefs),
  ]).sort((a, b) => a - b);
  const legacyVariant: SkimExplanationVariant = {
    key: 'normal-standard',
    depth: 'normal',
    style: 'standard',
    messageMarkdown: legacyMessageMarkdown,
    coveredSpineItemIds: allSpineItemIds,
    deferredSpineItemIds: [],
    pageRefs: sourcePageRefs,
    createdAt,
  };
  const generatedVariant: SkimExplanationVariant = {
    key: targetKey,
    depth: targetDepth,
    style: targetStyle,
    messageMarkdown: draft.messageMarkdown,
    coveredSpineItemIds: unique(draft.coveredSpineItemIds),
    deferredSpineItemIds: unique(draft.deferredSpineItemIds),
    pageRefs: unique(draft.pageRefs).sort((a, b) => a - b),
    createdAt,
  };
  return {
    version: 1,
    activeVariantKey: targetKey,
    spineItems: draft.spineItems,
    variants: targetKey === 'normal-standard'
      ? { 'normal-standard': legacyVariant }
      : { 'normal-standard': legacyVariant, [targetKey]: generatedVariant },
    sourcePageRefs,
  };
};

export const getActiveSkimExplanationVariant = (
  message: ChatMessage,
): SkimExplanationVariant | null => {
  const state = message.skimExplanation;
  if (!state) return null;
  return state.variants[state.activeVariantKey] ?? Object.values(state.variants).find(Boolean) ?? null;
};

export const getDisplayedSkimMessageText = (message: ChatMessage): string => (
  getActiveSkimExplanationVariant(message)?.messageMarkdown ?? message.text
);

export const withActiveSkimExplanationVariant = (
  message: ChatMessage,
  key: SkimExplanationVariantKey,
): ChatMessage => {
  if (!message.skimExplanation?.variants[key]) return message;
  return {
    ...message,
    skimExplanation: { ...message.skimExplanation, activeVariantKey: key },
  };
};
