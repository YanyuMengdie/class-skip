import type { Exam, ExamMaterialLink, FilePersistedState, LearnerMood, LSAPState } from '../types';
import type { MaterialFamiliarity, UrgencyBand } from '../types';

const DAY_MS = 86_400_000;

function startOfDayLocal(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function avgBkt(state: LSAPState | null | undefined): number | null {
  if (!state?.bktState) return null;
  const vals = Object.values(state.bktState);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function hasMeaningfulInteraction(state: FilePersistedState | null): boolean {
  if (!state) return false;
  const expl = Object.keys(state.explanations || {}).length;
  const chats = Object.keys(state.chatCache || {}).length;
  const skim = (state.skimMessages || []).length;
  return expl + chats + skim > 2;
}

/**
 * 根据本地持久化状态推断材料熟悉度
 */
export function inferFamiliarity(_fileHash: string, filePersistedState: FilePersistedState | null): MaterialFamiliarity {
  if (!filePersistedState || !hasMeaningfulInteraction(filePersistedState)) {
    return 'never_seen';
  }
  const avg = avgBkt(filePersistedState.lsapState);
  if (avg == null) return 'learned_once';
  if (avg < 0.55) return 'learned_once';
  return 'reviewed_before';
}

/**
 * 找与该文件关联的最近一场未来考试，返回紧迫度分桶
 */
export function inferUrgencyForFile(
  fileHash: string | undefined,
  cloudSessionId: string | undefined,
  exams: Exam[],
  materials: ExamMaterialLink[],
  now: Date = new Date()
): UrgencyBand {
  const links = materials.filter((m) => {
    if (fileHash && m.sourceType === 'fileHash' && m.fileHash === fileHash) return true;
    if (cloudSessionId && m.sourceType === 'sessionId' && m.cloudSessionId === cloudSessionId) return true;
    return false;
  });
  const examMap = new Map(exams.map((e) => [e.id, e]));
  let nearest: Exam | null = null;
  let nearestAt = Infinity;
  const start = startOfDayLocal(now);

  for (const l of links) {
    const e = examMap.get(l.examId);
    if (!e || e.examAt == null) continue;
    if (e.examAt <= start) continue;
    if (e.examAt < nearestAt) {
      nearestAt = e.examAt;
      nearest = e;
    }
  }

  if (!nearest || nearest.examAt == null) return 'no_exam';

  const days = Math.ceil((startOfDayLocal(new Date(nearest.examAt)) - start) / DAY_MS);
  if (days <= 2) return 'd1_2';
  if (days <= 7) return 'd3_7';
  return 'd8_plus';
}

export function buildScenarioKey(
  familiarity: MaterialFamiliarity,
  urgency: UrgencyBand,
  affect: 'good' | 'tired' | 'anxious' = 'good'
): string {
  return `${familiarity}_${urgency}_${affect}`;
}

/** P1：情境模板键扩展为 LearnerMood（与旧 `affect` 命名空间区分） */
export function buildExtendedScenarioKey(
  familiarity: MaterialFamiliarity,
  urgency: UrgencyBand,
  mood: LearnerMood
): string {
  return `${familiarity}_${urgency}_${mood}`;
}

/** 与旧 `AffectState` 的对照：Study Flow 回退模板 / 文档说明用 */
export function mapLearnerMoodToLegacyAffect(mood: LearnerMood): 'good' | 'tired' | 'anxious' {
  if (mood === 'normal') return 'good';
  if (mood === 'dont_want') return 'tired';
  return 'anxious';
}
