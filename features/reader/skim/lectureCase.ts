import type {
  LectureCaseCoverageLevel,
  LectureCaseCoverageUpdate,
  LectureCaseLearningState,
  LectureCaseManifest,
  LectureCasePlan,
  LectureCaseProgress,
  LectureCaseSuitabilityReport,
} from '@/types';

export const LECTURE_CASE_ANALYSIS_VERSION = 'lecture-case-v2-zh';
export const LECTURE_CASE_MIN_SCORE = 0.75;
export const LECTURE_CASE_MIN_MAPPABLE_RATE = 0.85;

export interface LectureCaseValidationResult {
  valid: boolean;
  errors: string[];
}

export const buildLectureCaseSourceSignature = (
  fileHash: string,
  pageStart: number,
  pageEnd: number,
): string => `${fileHash}:${pageStart}-${pageEnd}:${LECTURE_CASE_ANALYSIS_VERSION}`;

export const createIdleLectureCaseState = (
  sourceSignature: string,
  pageStart: number,
  pageEnd: number,
): LectureCaseLearningState => ({
  version: 1,
  analysisVersion: LECTURE_CASE_ANALYSIS_VERSION,
  sourceSignature,
  pageStart,
  pageEnd,
  status: 'idle',
  activeEpisodeId: null,
});

export const validateLectureCaseManifest = (
  manifest: LectureCaseManifest,
  pageStart: number,
  pageEnd: number,
): LectureCaseValidationResult => {
  const errors: string[] = [];
  if (manifest.pageStart !== pageStart || manifest.pageEnd !== pageEnd) {
    errors.push(`内容账本范围 ${manifest.pageStart}-${manifest.pageEnd} 与检测范围 ${pageStart}-${pageEnd} 不一致。`);
  }

  const expectedPages = Array.from({ length: pageEnd - pageStart + 1 }, (_, index) => pageStart + index);
  const actualPages = manifest.pages.map((page) => page.page);
  expectedPages.forEach((page) => {
    const count = actualPages.filter((value) => value === page).length;
    if (count === 0) errors.push(`第 ${page} 页没有归档。`);
    if (count > 1) errors.push(`第 ${page} 页被重复归档。`);
  });
  actualPages.filter((page) => page < pageStart || page > pageEnd).forEach((page) => {
    errors.push(`第 ${page} 页超出检测范围。`);
  });

  const unitIds = new Set<string>();
  manifest.units.forEach((unit) => {
    if (!unit.id.trim()) errors.push('存在没有 ID 的内容单元。');
    if (unitIds.has(unit.id)) errors.push(`内容单元 ${unit.id} 重复。`);
    unitIds.add(unit.id);
    if (unit.pageRefs.length === 0) errors.push(`内容单元 ${unit.id} 没有来源页。`);
    unit.pageRefs.forEach((page) => {
      if (page < pageStart || page > pageEnd) errors.push(`内容单元 ${unit.id} 引用了范围外第 ${page} 页。`);
    });
  });

  manifest.pages.forEach((page) => {
    if (!page.reason.trim()) errors.push(`第 ${page.page} 页缺少归档理由。`);
    if (page.kind === 'substantive' && page.unitIds.length === 0) {
      errors.push(`实质性第 ${page.page} 页没有关联内容单元。`);
    }
    page.unitIds.forEach((unitId) => {
      if (!unitIds.has(unitId)) errors.push(`第 ${page.page} 页引用了不存在的内容单元 ${unitId}。`);
    });
  });

  return { valid: errors.length === 0, errors };
};

export const validateLectureCasePlan = (
  plan: LectureCasePlan,
  manifest: LectureCaseManifest,
): LectureCaseValidationResult => {
  const errors: string[] = [];
  if (!plan.centralQuestion.trim()) errors.push('案件计划缺少贯穿问题。');
  if (plan.episodes.length < 3) errors.push('案件计划少于 3 个章节。');

  const episodeIds = new Set(plan.episodes.map((episode) => episode.id));
  if (episodeIds.size !== plan.episodes.length) errors.push('案件章节 ID 重复。');
  const assignments = new Map<string, number>();
  const unitIds = new Set(manifest.units.map((unit) => unit.id));

  plan.episodes.forEach((episode, index) => {
    if (episode.index !== index + 1) errors.push(`章节 ${episode.id} 的顺序编号不连续。`);
    if (episode.pageRefs.length === 0) errors.push(`章节 ${episode.id} 没有来源页。`);
    episode.pageRefs.forEach((page) => {
      if (page < manifest.pageStart || page > manifest.pageEnd) errors.push(`章节 ${episode.id} 引用了范围外第 ${page} 页。`);
    });
    episode.prerequisiteEpisodeIds.forEach((id) => {
      if (!episodeIds.has(id)) errors.push(`章节 ${episode.id} 引用了不存在的前置章节 ${id}。`);
      if (id === episode.id) errors.push(`章节 ${episode.id} 不能依赖自己。`);
    });
    episode.unitIds.forEach((unitId) => {
      if (!unitIds.has(unitId)) errors.push(`章节 ${episode.id} 引用了不存在的内容单元 ${unitId}。`);
      assignments.set(unitId, (assignments.get(unitId) ?? 0) + 1);
    });
  });

  manifest.units.forEach((unit) => {
    const count = assignments.get(unit.id) ?? 0;
    if (count === 0) errors.push(`内容单元 ${unit.id} 没有进入任何章节。`);
    if (count > 1) errors.push(`内容单元 ${unit.id} 被分配到多个主章节。`);
  });

  return { valid: errors.length === 0, errors };
};

export const passesStrictLectureCaseGate = (
  report: LectureCaseSuitabilityReport,
  manifest: LectureCaseManifest,
): LectureCaseValidationResult => {
  const errors: string[] = [];
  if (!report.centralQuestion.trim()) errors.push('没有识别出清晰的贯穿问题。');
  if (report.suitabilityScore < LECTURE_CASE_MIN_SCORE) errors.push('案件结构适配度不足。');
  if (report.mappableRate < LECTURE_CASE_MIN_MAPPABLE_RATE) errors.push('可进入案件主线的实质内容不足 85%。');
  if (report.episodePreviews.length < 3) errors.push('无法形成至少 3 个连贯章节。');
  if (!manifest.units.some((unit) => unit.narrativeRole === 'spine')) errors.push('内容账本中没有主线单元。');
  return { valid: errors.length === 0, errors };
};

export const createLectureCaseProgress = (manifest: LectureCaseManifest): LectureCaseProgress => ({
  units: Object.fromEntries(manifest.units.map((unit) => [unit.id, {
    level: 'unseen' as const,
    updatedAt: Date.now(),
  }])),
});

const LEVEL_RANK: Record<Exclude<LectureCaseCoverageLevel, 'needs_review'>, number> = {
  unseen: 0,
  introduced: 1,
  engaged: 2,
  verified: 3,
};

export const applyLectureCaseCoverageUpdates = (
  progress: LectureCaseProgress,
  updates: LectureCaseCoverageUpdate[],
  allowedUnitIds: Set<string>,
): LectureCaseProgress => {
  const units = { ...progress.units };
  updates.forEach((update) => {
    if (!allowedUnitIds.has(update.unitId)) return;
    const previous = units[update.unitId] ?? { level: 'unseen' as const, updatedAt: 0 };
    let level: LectureCaseCoverageLevel = update.level;
    if (update.level !== 'needs_review' && previous.level !== 'needs_review') {
      const previousRank = LEVEL_RANK[previous.level];
      const nextRank = LEVEL_RANK[update.level];
      level = nextRank >= previousRank ? update.level : previous.level;
    }
    units[update.unitId] = {
      ...previous,
      level,
      ...(update.evidence ? { evidence: update.evidence } : {}),
      ...(update.selfReportedUnderstood !== undefined
        ? { selfReportedUnderstood: update.selfReportedUnderstood }
        : {}),
      updatedAt: Date.now(),
    };
  });
  return { units };
};

export const getLectureCaseCoverageCounts = (progress: LectureCaseProgress | undefined) => {
  const counts: Record<LectureCaseCoverageLevel, number> = {
    unseen: 0,
    introduced: 0,
    engaged: 0,
    verified: 0,
    needs_review: 0,
  };
  Object.values(progress?.units ?? {}).forEach((unit) => { counts[unit.level] += 1; });
  return counts;
};
