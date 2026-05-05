import type { DisciplineBand, DocType, Exam, ExamMaterialLink, LearnerMood, UrgencyBand } from '@/types';
import type { FilePlanMeta } from '@/features/exam/lib/examSchedule';

const DAY_MS = 86_400_000;

function startOfDayLocal(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * 对当前勾选的多场考试，取「最近一场未来考试」的日历天数，映射到紧迫度分桶（与单文件 inferUrgency 一致思想）。
 */
export function aggregateUrgencyFromSelectedExams(
  exams: Exam[],
  selectedExamIds: string[],
  now: Date = new Date()
): UrgencyBand {
  const start = startOfDayLocal(now);
  let minDays = Infinity;
  for (const id of selectedExamIds) {
    const e = exams.find((x) => x.id === id);
    if (!e?.examAt || e.examAt <= start) continue;
    const examStart = startOfDayLocal(new Date(e.examAt));
    const days = Math.max(1, Math.ceil((examStart - start) / DAY_MS));
    minDays = Math.min(minDays, days);
  }
  if (!Number.isFinite(minDays)) return 'no_exam';
  if (minDays <= 2) return 'd1_2';
  if (minDays <= 7) return 'd3_7';
  return 'd8_plus';
}

export interface MaintenanceStrategy {
  suggestedFlashCount: number;
  suggestQuiz: boolean;
  softTone: boolean;
  showBreathingFirst: boolean;
  feedbackVariant: 'standard' | 'gentle' | 'celebrate_small';
}

/**
 * P1：心态 × 紧迫度 → 保温策略（非 sprint 拦截场景下使用）
 */
export function computeMaintenanceStrategy(input: {
  mood: LearnerMood;
  urgency: UrgencyBand;
  /** 是否允许保温（未命中 sprint 拦截） */
  maintenanceAllowed: boolean;
}): MaintenanceStrategy {
  const { mood, urgency, maintenanceAllowed } = input;

  if (!maintenanceAllowed) {
    return {
      suggestedFlashCount: 15,
      suggestQuiz: true,
      softTone: false,
      showBreathingFirst: false,
      feedbackVariant: 'standard',
    };
  }

  // 规则表（可微调）
  if (mood === 'dont_want' && urgency === 'd8_plus') {
    return {
      suggestedFlashCount: 10,
      suggestQuiz: false,
      softTone: true,
      showBreathingFirst: true,
      feedbackVariant: 'gentle',
    };
  }
  if (mood === 'want_anxious' && urgency === 'd1_2') {
    return {
      suggestedFlashCount: 12,
      suggestQuiz: true,
      softTone: false,
      showBreathingFirst: true,
      feedbackVariant: 'standard',
    };
  }
  if (mood === 'normal' && urgency === 'd3_7') {
    return {
      suggestedFlashCount: 15,
      suggestQuiz: true,
      softTone: false,
      showBreathingFirst: false,
      feedbackVariant: 'standard',
    };
  }

  if (mood === 'dont_want') {
    return {
      suggestedFlashCount: urgency === 'd1_2' ? 10 : 12,
      suggestQuiz: false,
      softTone: true,
      showBreathingFirst: true,
      feedbackVariant: 'gentle',
    };
  }
  if (mood === 'want_anxious') {
    return {
      suggestedFlashCount: urgency === 'd8_plus' ? 14 : 12,
      suggestQuiz: true,
      softTone: true,
      showBreathingFirst: true,
      feedbackVariant: urgency === 'd1_2' ? 'standard' : 'gentle',
    };
  }

  // normal + 其他紧迫度
  const flash =
    urgency === 'd1_2' ? 16 : urgency === 'd3_7' ? 15 : urgency === 'd8_plus' ? 12 : 14;
  return {
    suggestedFlashCount: Math.min(20, Math.max(10, flash)),
    suggestQuiz: urgency !== 'no_exam',
    softTone: false,
    showBreathingFirst: false,
    feedbackVariant: urgency === 'd8_plus' ? 'celebrate_small' : 'standard',
  };
}

function mapDocTypeToBand(d: DocType): DisciplineBand {
  return d === 'STEM' ? 'stem' : 'humanities_social';
}

/**
 * 单场考试：用户显式 `disciplineBand` 优先；若为 unspecified，用第一份材料（sortIndex）上的 `docTypeHint` 映射。
 */
export function resolveDisciplineBandForMaintenance(
  exam: Exam | undefined,
  linksForExam: ExamMaterialLink[],
  fileMeta?: Map<string, FilePlanMeta>
): DisciplineBand {
  const explicit = exam?.disciplineBand;
  if (explicit && explicit !== 'unspecified') return explicit;
  const sorted = [...linksForExam].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const first = sorted[0];
  if (!first) return explicit ?? 'unspecified';
  const key = first.sourceType === 'fileHash' ? first.fileHash! : `session:${first.cloudSessionId}`;
  const hint = fileMeta?.get(key)?.docTypeHint;
  if (hint) return mapDocTypeToBand(hint);
  return explicit ?? 'unspecified';
}

/** 多考试合并保温：取 allowed 考试 id 字典序第一场，解析其学科带 */
export function resolveDisciplineBandForMergedMaintenance(
  exams: Exam[],
  allowedExamIds: string[],
  materialsByExamId: Map<string, ExamMaterialLink[]>,
  fileMeta?: Map<string, FilePlanMeta>
): DisciplineBand {
  const sortedIds = [...allowedExamIds].sort();
  const primaryId = sortedIds[0];
  if (!primaryId) return 'unspecified';
  const exam = exams.find((e) => e.id === primaryId);
  const links = materialsByExamId.get(primaryId) || [];
  return resolveDisciplineBandForMaintenance(exam, links, fileMeta);
}
