import { describe, expect, it } from 'vitest';
import type { LectureCaseManifest, LectureCasePlan, LectureCaseSuitabilityReport } from '@/types';
import {
  applyLectureCaseCoverageUpdates,
  buildLectureCaseSourceSignature,
  createLectureCaseProgress,
  passesStrictLectureCaseGate,
  validateLectureCaseManifest,
  validateLectureCasePlan,
} from './lectureCase';

const manifest: LectureCaseManifest = {
  version: 1,
  pageStart: 1,
  pageEnd: 4,
  pages: [
    { page: 1, kind: 'title', unitIds: [], reason: '标题页，保留为案件入口。' },
    { page: 2, kind: 'substantive', unitIds: ['u1'], reason: '提出核心主张。' },
    { page: 3, kind: 'substantive', unitIds: ['u2'], reason: '提供反驳证据。' },
    { page: 4, kind: 'duplicate', unitIds: [], reason: '第 3 页图表的动画递进版本。' },
  ],
  units: [
    { id: 'u1', title: '核心主张', kind: 'claim', summary: '主张 A。', pageRefs: [2], importance: 'core', narrativeRole: 'spine' },
    { id: 'u2', title: '反驳证据', kind: 'evidence', summary: '证据 B。', pageRefs: [3], importance: 'core', narrativeRole: 'evidence' },
  ],
};

const report: LectureCaseSuitabilityReport = {
  suitabilityScore: 0.9,
  mappableRate: 0.9,
  centralQuestion: '主张 A 能否成立？',
  fitReasons: ['存在主张与反证'],
  unsuitableReasons: [],
  detectedClaims: ['主张 A'],
  detectedEvidenceGroups: ['证据 B'],
  episodePreviews: [
    { title: '提出问题', role: '建立问题', pageRefs: [1] },
    { title: '主张登场', role: '检查主张', pageRefs: [2] },
    { title: '证据反击', role: '完成裁决', pageRefs: [3, 4] },
  ],
  recommendedFallback: 'records',
};

const plan: LectureCasePlan = {
  version: 1,
  caseTitle: 'A 的审判',
  centralQuestion: report.centralQuestion,
  spineSummary: '提出 A，再用 B 棧验。',
  episodes: [
    { id: 'e1', index: 1, title: '工具', role: '建立问题', guidingQuestion: '问题是什么？', pageRefs: [1], unitIds: [], prerequisiteEpisodeIds: [], openingPrompt: '先看问题。', status: 'not_started', lastPage: 1, messages: [], unresolvedQuestions: [] },
    { id: 'e2', index: 2, title: '主张', role: '提出 A', guidingQuestion: 'A 会预测什么？', pageRefs: [2], unitIds: ['u1'], prerequisiteEpisodeIds: ['e1'], openingPrompt: '预测 A。', status: 'not_started', lastPage: 2, messages: [], unresolvedQuestions: [] },
    { id: 'e3', index: 3, title: '证据', role: '用 B 裁决', guidingQuestion: 'B 支持哪一边？', pageRefs: [3, 4], unitIds: ['u2'], prerequisiteEpisodeIds: ['e2'], openingPrompt: '判断 B。', status: 'not_started', lastPage: 3, messages: [], unresolvedQuestions: [] },
  ],
};

describe('lecture case validation', () => {
  it('accepts a complete page ledger and one-owner unit plan', () => {
    expect(validateLectureCaseManifest(manifest, 1, 4)).toEqual({ valid: true, errors: [] });
    expect(validateLectureCasePlan(plan, manifest)).toEqual({ valid: true, errors: [] });
    expect(passesStrictLectureCaseGate(report, manifest)).toEqual({ valid: true, errors: [] });
  });

  it('rejects missing pages and unassigned substantive content', () => {
    const brokenManifest = { ...manifest, pages: manifest.pages.filter((page) => page.page !== 3) };
    expect(validateLectureCaseManifest(brokenManifest, 1, 4).errors).toContain('第 3 页没有归档。');
    const brokenPlan = { ...plan, episodes: plan.episodes.map((episode) => ({ ...episode, unitIds: episode.unitIds.filter((id) => id !== 'u2') })) };
    expect(validateLectureCasePlan(brokenPlan, manifest).errors).toContain('内容单元 u2 没有进入任何章节。');
  });

  it('rejects out-of-range episode citations and duplicate ownership', () => {
    const brokenPlan = {
      ...plan,
      episodes: plan.episodes.map((episode, index) => index === 0
        ? { ...episode, pageRefs: [99], unitIds: ['u1'] }
        : episode),
    };
    const errors = validateLectureCasePlan(brokenPlan, manifest).errors;
    expect(errors).toContain('章节 e1 引用了范围外第 99 页。');
    expect(errors).toContain('内容单元 u1 被分配到多个主章节。');
  });

  it('uses the strict score and mappable-rate gate', () => {
    expect(passesStrictLectureCaseGate({ ...report, suitabilityScore: 0.74 }, manifest).valid).toBe(false);
    expect(passesStrictLectureCaseGate({ ...report, mappableRate: 0.84 }, manifest).valid).toBe(false);
  });
});

describe('lecture case progress', () => {
  it('keeps reveal at introduced and never accepts unknown unit IDs', () => {
    const progress = createLectureCaseProgress(manifest);
    const next = applyLectureCaseCoverageUpdates(progress, [
      { unitId: 'u1', level: 'introduced', evidence: '用户直接揭晓。' },
      { unitId: 'unknown', level: 'verified' },
    ], new Set(['u1', 'u2']));
    expect(next.units.u1.level).toBe('introduced');
    expect(next.units.unknown).toBeUndefined();
  });

  it('separates self-report from verified evidence', () => {
    const progress = createLectureCaseProgress(manifest);
    const selfReported = applyLectureCaseCoverageUpdates(progress, [
      { unitId: 'u1', level: 'engaged', selfReportedUnderstood: true },
    ], new Set(['u1']));
    expect(selfReported.units.u1.level).toBe('engaged');
    expect(selfReported.units.u1.selfReportedUnderstood).toBe(true);
    const verified = applyLectureCaseCoverageUpdates(selfReported, [
      { unitId: 'u1', level: 'verified', evidence: '无提示回答正确。' },
    ], new Set(['u1']));
    expect(verified.units.u1.level).toBe('verified');
  });

  it('marks needs-review explicitly and does not downgrade normal progress', () => {
    const progress = createLectureCaseProgress(manifest);
    const engaged = applyLectureCaseCoverageUpdates(progress, [{ unitId: 'u1', level: 'engaged' }], new Set(['u1']));
    const noDowngrade = applyLectureCaseCoverageUpdates(engaged, [{ unitId: 'u1', level: 'introduced' }], new Set(['u1']));
    expect(noDowngrade.units.u1.level).toBe('engaged');
    const needsReview = applyLectureCaseCoverageUpdates(noDowngrade, [{ unitId: 'u1', level: 'needs_review' }], new Set(['u1']));
    expect(needsReview.units.u1.level).toBe('needs_review');
  });

  it('invalidates cache signatures when page range changes', () => {
    expect(buildLectureCaseSourceSignature('file', 1, 72)).not.toBe(buildLectureCaseSourceSignature('file', 10, 20));
  });
});
