import type { DailySegment, DailySegmentKind, Exam, ExamMaterialLink } from '../types';

const DAY_MS = 86_400_000;

export interface FilePlanMeta {
  pageCount?: number;
  lastIndex?: number;
  weakKcId?: string;
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

    while (examMinutes >= 5 && minutesLeft >= 5) {
      const m = mats[rr % mats.length];
      rr++;
      const chunk = pickChunkMinutes(Math.min(examMinutes, minutesLeft));
      const metaKey = metaKeyForMaterial(m);
      const meta = fileMeta?.get(metaKey);

      let kind: DailySegmentKind = 'slide_review';
      let kcId: string | undefined;
      if (meta?.weakKcId) {
        kind = 'lsap_probe';
        kcId = meta.weakKcId;
      }

      const pageCount = meta?.pageCount ?? 20;
      const useLast = !meta?.pageCount;
      const span = Math.max(2, Math.min(5, Math.ceil(pageCount / 10)));
      const round = (perMaterialRound.get(metaKey) || 0) + 1;
      perMaterialRound.set(metaKey, round);

      const startPage = useLast ? undefined : 1 + ((round - 1) * span) % Math.max(1, pageCount - span + 1);
      const endPage =
        useLast || startPage == null ? undefined : Math.min(pageCount, startPage + span - 1);

      segments.push({
        id: `seg-${Date.now()}-${++segCounter}`,
        examId: exam.id,
        examTitle: exam.title,
        fileHash: m.fileHash,
        cloudSessionId: m.cloudSessionId,
        fileName: m.fileName,
        kind,
        title:
          kind === 'lsap_probe'
            ? `薄弱考点探测 · ${m.fileName}`
            : `幻灯复习 · ${m.fileName}`,
        description: useLast
          ? '打开该文件后从你上次进度继续'
          : `建议浏览第 ${startPage ?? '?'}–${endPage ?? '?'} 页（约 ${chunk} 分钟）`,
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
