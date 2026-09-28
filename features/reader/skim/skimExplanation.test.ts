import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import {
  canRewriteSkimExplanation,
  createSkimExplanationState,
  createSkimExplanationStateFromLegacyMessage,
  getDisplayedSkimMessageText,
  getDisplayedSkimReadingMedia,
  getSkimExplanationVariantKey,
  isLegacyRecordExplanationCandidate,
  resolveSkimExplanationPageBounds,
  shouldUseConnectedLectureExplanation,
  validateSkimExplanationTurnDraft,
  validateSkimExplanationVariantDraft,
  withActiveSkimExplanationVariant,
} from './skimExplanation';

const draft = {
  responseKind: 'explanation' as const,
  messageMarkdown: '简单解释',
  spineItems: [
    { id: 's1', titleZh: '核心关系', titleEn: 'Core relation', kind: 'relationship' as const, summary: 'A 导致 B', pageRefs: [2] },
    { id: 's2', titleZh: '证据', titleEn: 'Evidence', kind: 'evidence' as const, summary: '实验支持关系', pageRefs: [3] },
  ],
  coveredSpineItemIds: ['s1'],
  deferredSpineItemIds: ['s2'],
  pageRefs: [2, 3],
};

describe('skim explanation variants', () => {
  it('enables the same connected explanation flow for an opened record only', () => {
    expect(shouldUseConnectedLectureExplanation('reading', 'continuous', 'lecture', false)).toBe(true);
    expect(shouldUseConnectedLectureExplanation('reading', 'records', 'lecture', true)).toBe(true);
    expect(shouldUseConnectedLectureExplanation('reading', 'records', 'lecture', false)).toBe(false);
    expect(shouldUseConnectedLectureExplanation('reading', 'case', 'lecture', true)).toBe(false);
    expect(shouldUseConnectedLectureExplanation('reading', 'records', 'paper', true)).toBe(false);
    expect(shouldUseConnectedLectureExplanation('tutoring', 'records', 'lecture', true)).toBe(false);
  });

  it('allows rewriting opened records without enabling the Lecture reading route for papers', () => {
    expect(canRewriteSkimExplanation('reading', 'records', true)).toBe(true);
    expect(canRewriteSkimExplanation('reading', 'records', false)).toBe(false);
    expect(canRewriteSkimExplanation('reading', 'continuous', false)).toBe(true);
    expect(canRewriteSkimExplanation('reading', 'case', true)).toBe(false);
    expect(canRewriteSkimExplanation('diagnosis', 'records', true)).toBe(false);
    expect(shouldUseConnectedLectureExplanation('reading', 'records', 'paper', true)).toBe(false);
    expect(shouldUseConnectedLectureExplanation('reading', 'records', 'article', true)).toBe(false);
  });

  it('uses the current record pages instead of the whole configured range', () => {
    expect(resolveSkimExplanationPageBounds(1, 72, { pageStart: 18, pageEnd: 24 })).toEqual({
      pageStart: 18,
      pageEnd: 24,
    });
    expect(resolveSkimExplanationPageBounds(3, 40, null)).toEqual({ pageStart: 3, pageEnd: 40 });
  });

  it('recognizes a substantive legacy record explanation but excludes transitions', () => {
    expect(isLegacyRecordExplanationCandidate({
      role: 'model',
      text: '这是一条旧分段里已经生成的完整讲解，其中包含概念、关系、例子与详细的原文说明。',
      timestamp: 1,
    })).toBe(true);
    expect(isLegacyRecordExplanationCandidate({ role: 'model', text: '好的，我们继续。', timestamp: 1 })).toBe(false);
  });

  it('adopts a legacy record explanation without replacing its original normal version', () => {
    const state = createSkimExplanationStateFromLegacyMessage(
      '原来的正常讲解',
      draft,
      'simple',
      'standard',
      3,
    );
    expect(state.activeVariantKey).toBe('simple-standard');
    expect(state.variants['normal-standard']?.messageMarkdown).toBe('原来的正常讲解');
    expect(state.variants['simple-standard']?.messageMarkdown).toBe('简单解释');
    expect(state.sourcePageRefs).toEqual([2, 3]);
  });

  it('preserves original visual metadata and recovers old saved records without leaking it into rewrites', () => {
    const media = { terms: [] };
    const state = createSkimExplanationStateFromLegacyMessage('原文', draft, 'normal', 'interesting', 1, media);
    const message: ChatMessage = { role: 'model', text: '原文', timestamp: 1, readingMedia: media, skimExplanation: state };
    const original = withActiveSkimExplanationVariant(message, 'normal-standard');
    expect(getDisplayedSkimReadingMedia(original)).toBe(media);
    delete state.variants['normal-standard']!.readingMedia;
    expect(getDisplayedSkimReadingMedia(original)).toBe(media);
    expect(getDisplayedSkimReadingMedia(message)).toBeUndefined();
    state.variants['normal-standard']!.readingMedia = {};
    expect(getDisplayedSkimReadingMedia(original)).toEqual({});
    delete state.variants['normal-standard']!.readingMedia;
    state.variants['normal-standard']!.messageMarkdown = '另一份正文';
    expect(getDisplayedSkimReadingMedia(original)).toBeUndefined();
  });

  it('builds the two-axis variant key', () => {
    expect(getSkimExplanationVariantKey('simple', 'interesting')).toBe('simple-interesting');
    expect(getSkimExplanationVariantKey('normal', 'standard')).toBe('normal-standard');
  });

  it('accepts a complete simple partition and rejects an incomplete one', () => {
    expect(validateSkimExplanationTurnDraft(draft, 'simple', 1, 4).valid).toBe(true);
    expect(validateSkimExplanationTurnDraft({ ...draft, deferredSpineItemIds: [] }, 'simple', 1, 4).valid).toBe(false);
  });

  it('requires normal variants to cover the entire immutable spine', () => {
    const result = validateSkimExplanationVariantDraft({
      messageMarkdown: '正常展开',
      coveredSpineItemIds: ['s1'],
      deferredSpineItemIds: ['s2'],
      pageRefs: [2, 3],
    }, draft.spineItems, 'normal', 1, 4);
    expect(result.valid).toBe(false);
  });

  it('rejects source pages outside the configured range', () => {
    const invalid = {
      ...draft,
      spineItems: [{ ...draft.spineItems[0], pageRefs: [9] }],
      coveredSpineItemIds: ['s1'],
      deferredSpineItemIds: [],
    };
    expect(validateSkimExplanationTurnDraft(invalid, 'simple', 1, 4).valid).toBe(false);
  });

  it('shows and switches cached variants without changing the base message text', () => {
    const state = createSkimExplanationState(draft, 'simple', 'standard', 1);
    state.variants['normal-standard'] = {
      key: 'normal-standard', depth: 'normal', style: 'standard', messageMarkdown: '正常展开',
      coveredSpineItemIds: ['s1', 's2'], deferredSpineItemIds: [], pageRefs: [2, 3], createdAt: 2,
    };
    const message: ChatMessage = { id: 'm1', role: 'model', text: '兼容正文', timestamp: 1, skimExplanation: state };
    expect(getDisplayedSkimMessageText(message)).toBe('简单解释');
    const switched = withActiveSkimExplanationVariant(message, 'normal-standard');
    expect(getDisplayedSkimMessageText(switched)).toBe('正常展开');
    expect(switched.text).toBe('兼容正文');
  });
});
