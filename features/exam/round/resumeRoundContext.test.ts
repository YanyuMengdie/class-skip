import { describe, expect, it } from 'vitest';
import type { ExamMaterialLink, LSAPKnowledgeComponent } from '@/types';
import { buildStudyBlocks, createRoundContext } from './roundScope';
import { createRound, pauseRound, updateDraft } from './roundState';
import { resumeRoundContext } from './resumeRoundContext';
import { themeSourceKey, type ThemePlan } from './themeGrouping';

const material: ExamMaterialLink = { id: 'lecture', fileName: 'lecture.pdf', examId: 'exam', userId: 'u', sourceType: 'fileHash', addedAt: 1 };
const kcs: LSAPKnowledgeComponent[] = [1, 2].map(page => ({ id: `kc${page}`, concept: `Concept ${page}`, definition: `Definition ${page}`,
  sourceLinkId: material.id, sourcePages: [page], examWeight: 5, bloomTargetLevel: 1,
  atoms: [{ id: `atom${page}`, kcId: `kc${page}`, label: `Point ${page}`, description: `Explain point ${page}`, sourcePages: [page] }] }));
const pages = ['First page with enough source evidence for a complete question.', 'Second page with a separate, related concept to review.'];
const legacy = buildStudyBlocks(material, pages.length, kcs);
const plan: ThemePlan = { version: 1, sourceKey: themeSourceKey(material, kcs, pages), groups: [{ id: 'group', title: 'Related concepts', description: 'Two concepts and their relationship', kcIds: kcs.map(kc => kc.id) }] };
const themes = buildStudyBlocks(material, pages.length, kcs, 'zh', plan);
const context = createRoundContext([legacy[0]], { lecture: pages });
const source = { materialId: 'lecture', page: 1, quote: pages[0] };
const target = context.scope.knowledgeTargets![0];
const paused = pauseRound(updateDraft(createRound({ id: 'plan', scope: context.scope, maxAttempts: 6, createdAt: 1,
  objectives: [{ id: target.id, label: target.label, sources: [source], knowledgeTarget: target }],
  questions: [{ id: 'q', kind: 'initial', prompt: 'Explain the first point.', responseRequirements: ['Explain clearly'], objectiveIds: [target.id],
    criteria: [{ id: 'criterion', objectiveId: target.id, requirement: 'Explain the point', expected: 'Source-based answer', sources: [source] }], cueLevel: 1, novelty: 'original' }],
}, undefined, 1), 'My unfinished answer', 2), 3);

describe('resume after theme regrouping', () => {
  it('continues the exact original scope and preserves a paused draft', () => {
    const restored = resumeRoundContext(paused, [themes, legacy], { lecture: pages }, 'zh');
    expect(restored?.scope.id).toBe(context.scope.id);
    expect(restored?.scope.materials[0].pages).toEqual([1]);
    expect(paused.draft).toBe('My unfinished answer');
  });
  it('does not replace an old scope with a broader theme', () => {
    expect(resumeRoundContext(paused, [themes], { lecture: pages }, 'zh')).toBeNull();
  });
  it('does not resume against modified source text', () => {
    expect(resumeRoundContext(paused, [themes, legacy], { lecture: ['A materially revised explanation on the original page.', pages[1]] }, 'zh')).toBeNull();
  });
});
