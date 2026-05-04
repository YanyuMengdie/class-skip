import type { DailySegment, DailySegmentKind, DocType, Exam, ExamMaterialLink } from '@/types';

const DAY_MS = 86_400_000;

export interface FilePlanMeta {
  pageCount?: number;
  lastIndex?: number;
  weakKcId?: string;
  /** 文档分类（与 classifyDocument 一致），用于 P1 学科带回退 */
  docTypeHint?: DocType;
}

export interface BuildDailyPlanInput {
  now: Date;
  selectedExamIds: string[];
  exams: Exam[];
  materialsByExamId: Map<string, ExamMaterialLink[]>;
  budgetMinutes: number;
  alpha?: number;
  fileMeta?: Map<string, FilePlanMeta>;
}

export type ExamDailyMode = 'daily_mode' | 'warning_mode' | 'sprint_mode';
export interface ExamPressureAssessment {
  examId: string;
  mode: ExamDailyMode;
  pressureScore: number;
  daysLeft: number;
  materialCount: number;
  workloadPages: number;
}

function startOfDayLocal(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function daysUntilExam(now: Date, examAt: number): number {
  const start = startOfDayLocal(now);
  const examStart = startOfDayLocal(new Date(examAt));
  const diff = examStart - start;
  return Math.max(1, Math.ceil(diff / DAY_MS));
}

function pickChunkMinutes(totalLeft: number): number {
  if (totalLeft <= 5) return totalLeft;
  return Math.min(15, Math.max(5, Math.min(8, totalLeft)));
}

function metaKeyForMaterial(m: ExamMaterialLink): string {
  return m.sourceType === 'fileHash' ? m.fileHash! : `session:${m.cloudSessionId}`;
}

export function assessExamPressure(
  exam: Exam,
  mats: ExamMaterialLink[],
  fileMeta: Map<string, FilePlanMeta> | undefined,
  now: Date
): ExamPressureAssessment {
  const daysLeft = exam.examAt != null ? daysUntilExam(now, exam.examAt) : 999;
  const materialCount = mats.length;
  let workloadPages = 0;
  mats.forEach((m) => {
    const key = metaKeyForMaterial(m);
    workloadPages += fileMeta?.get(key)?.pageCount ?? 30;
  });
  const pressureScore = workloadPages / Math.max(1, daysLeft);
  let mode: ExamDailyMode = 'daily_mode';
  if (daysLeft <= 2 || pressureScore >= 70) mode = 'sprint_mode';
  else if (daysLeft <= 7 || pressureScore >= 40) mode = 'warning_mode';
  return {
    examId: exam.id,
    mode,
    pressureScore,
    daysLeft,
    materialCount,
    workloadPages,
  };
}

const nonSlideKinds: DailySegmentKind[] = [
  'flashcard_batch',
  'trap_review',
  'feynman_chunk',
  'study_guide_section',
];

/**
 * 根据选中考试与材料生成今日学习片段（纯前端计算）
 */
export function buildDailyPlan(input: BuildDailyPlanInput): DailySegment[] {
  const alpha = input.alpha ?? 0.7;
  const { now, selectedExamIds, exams, materialsByExamId, budgetMinutes, fileMeta } = input;
  const budget = Math.max(5, budgetMinutes);

  const selectedSet = new Set(selectedExamIds);
  const schedulable = exams.filter(
    (e) => selectedSet.has(e.id) && e.examAt != null && e.examAt > startOfDayLocal(now)
  );

  if (schedulable.length === 0) return [];

  const weighted = schedulable.map((e) => ({
    exam: e,
    w: 1 / Math.pow(daysUntilExam(now, e.examAt!), alpha),
  }));
  const sumW = weighted.reduce((s, x) => s + x.w, 0);
  if (sumW <= 0) return [];

  const rawAlloc = new Map<string, number>();
  weighted.forEach(({ exam, w }) => {
    rawAlloc.set(exam.id, Math.max(5, Math.floor((budget * w) / sumW)));
  });
  let totalAlloc = [...rawAlloc.values()].reduce((a, b) => a + b, 0);
  while (totalAlloc > budget) {
    let maxId = '';
    let maxV = -1;
    rawAlloc.forEach((v, id) => {
      if (v > maxV) {
        maxV = v;
        maxId = id;
      }
    });
    if (!maxId || maxV <= 5) break;
    rawAlloc.set(maxId, maxV - 1);
    totalAlloc -= 1;
  }
  while (totalAlloc < budget) {
    const id = weighted[0]?.exam.id;
    if (!id) break;
    rawAlloc.set(id, (rawAlloc.get(id) || 0) + 1);
    totalAlloc += 1;
  }

  const segments: DailySegment[] = [];
  let segCounter = 0;
  let minutesLeft = budget;

  for (const { exam } of weighted) {
    let examMinutes = Math.min(rawAlloc.get(exam.id) || 0, minutesLeft);
    const mats = (materialsByExamId.get(exam.id) || []).filter(
      (m) => (m.sourceType === 'fileHash' ? !!m.fileHash : !!m.cloudSessionId)
    );
    if (mats.length === 0 || examMinutes < 5) continue;

    let rr = 0;
    const perMaterialRound = new Map<string, number>();

    let examChunkIndex = 0;
    while (examMinutes >= 5 && minutesLeft >= 5) {
      const m = mats[rr % mats.length];
      rr++;
      examChunkIndex++;
      const chunk = pickChunkMinutes(Math.min(examMinutes, minutesLeft));
      const metaKey = metaKeyForMaterial(m);
      const meta = fileMeta?.get(metaKey);

      let kind: DailySegmentKind = 'slide_review';
      let kcId: string | undefined;
      if (meta?.weakKcId) {
        const shouldProbe = examChunkIndex % 3 === 1;
        if (shouldProbe) {
          kind = 'lsap_probe';
          kcId = meta.weakKcId;
        }
      }

      if (kind === 'slide_review' && examChunkIndex % 2 === 0) {
        const idx = Math.floor(examChunkIndex / 2) % nonSlideKinds.length;
        kind = nonSlideKinds[idx];
      }

      const pageCount = meta?.pageCount ?? 20;
      const useLast = !meta?.pageCount;
      const span = Math.max(2, Math.min(5, Math.ceil(pageCount / 10)));
      const round = (perMaterialRound.get(metaKey) || 0) + 1;
      perMaterialRound.set(metaKey, round);

      const startPage = useLast ? undefined : 1 + ((round - 1) * span) % Math.max(1, pageCount - span + 1);
      const endPage =
        useLast || startPage == null ? undefined : Math.min(pageCount, startPage + span - 1);

      let title = `幻灯复习 · ${m.fileName}`;
      let description = useLast
        ? '打开该文件后从你上次进度继续'
        : `建议浏览第 ${startPage ?? '?'}–${endPage ?? '?'} 页（约 ${chunk} 分钟）`;
      if (kind === 'lsap_probe') {
        title = `薄弱考点探测 · ${m.fileName}`;
        description = '进入考前预测，优先复习薄弱考点';
      } else if (kind === 'flashcard_batch') {
        title = `闪卡速刷 · ${m.fileName}`;
        description = `建议刷 8-12 张闪卡（约 ${chunk} 分钟）`;
      } else if (kind === 'trap_review') {
        title = `陷阱清单回看 · ${m.fileName}`;
        description = `建议回看 3-5 个易错点（约 ${chunk} 分钟）`;
      } else if (kind === 'feynman_chunk') {
        title = `费曼讲解一段 · ${m.fileName}`;
        description = `选择 1 个核心概念尝试复述（约 ${chunk} 分钟）`;
      } else if (kind === 'study_guide_section') {
        title = `学习指南推进 · ${m.fileName}`;
        description = `按学习指南推进一小节（约 ${chunk} 分钟）`;
      }

      segments.push({
        id: `seg-${Date.now()}-${++segCounter}`,
        examId: exam.id,
        examTitle: exam.title,
        fileHash: m.fileHash,
        cloudSessionId: m.cloudSessionId,
        fileName: m.fileName,
        kind,
        title,
        description,
        estimatedMinutes: chunk,
        kcId,
        pageFrom: startPage,
        pageTo: endPage,
        payload: useLast ? { useLastIndex: true } : undefined,
      });

      examMinutes -= chunk;
      minutesLeft -= chunk;
    }
  }

  return segments;
}
