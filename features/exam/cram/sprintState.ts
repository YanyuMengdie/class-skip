import type { StudyTerm } from '@/features/reluctant/studyTerms';
import type { OverviewExplanation, OverviewOutline } from '@/features/reluctant/overview';
import type { StudyVisual } from '@/features/reluctant/studyVisuals';
import type { CramSession } from './cramState';

export interface SprintChat { id: string; question: string; answer?: string; terms?: StudyTerm[]; section?: number }
export interface SprintLecture {
  materialId: string; outline?: OverviewOutline; explanation?: OverviewExplanation;
  visible: number; readAt?: number; immediateDone?: boolean;
  chats: SprintChat[]; draft: string;
}
export interface SprintFeedback { clear: string[]; corrections: string[]; unmentioned: string[]; guidance: string }
export interface SprintRecall {
  id: string; materialId: string; topicIds: string[]; kind: 'immediate' | 'delayed';
  startedAt: number; submittedAt?: number; finishedAt?: number; skipped?: boolean;
  draft: string; assisted: boolean; feedback?: SprintFeedback; hint?: string; disputed?: boolean;
}
export interface SprintPlanItem {
  id: string; kind: 'detail' | 'recall'; materialId: string; topicIds: string[];
  title: string; reason: string; depth: string; minutes: number;
  status: 'pending' | 'done' | 'deferred' | 'replaced'; lesson?: string; visual?: StudyVisual; terms?: StudyTerm[];
  chats: SprintChat[]; draft: string;
}
export interface SprintEvent { at: number; kind: 'lecture' | 'detail' | 'recall'; materialId: string; topicIds: string[] }
export interface GuidedSprint {
  version: 1; lectures: SprintLecture[]; recalls: SprintRecall[]; events: SprintEvent[];
  plan: SprintPlanItem[]; planKey?: string; planNote?: string;
  snoozed: Record<string, { at: number; eventCount: number }>;
  active?: { kind: 'lecture'; materialId: string } | { kind: 'recall'; id: string } | { kind: 'detail'; id: string };
}
export function sprintState(s: CramSession): GuidedSprint {
  return s.guided ?? { version: 1, lectures: s.sources.map(x => ({ materialId: x.material.id, visible: 1, chats: [], draft: '' })),
    recalls: [], events: [], plan: [], snoozed: {} };
}
export const firstRoundDone = (g: GuidedSprint) => g.lectures.length > 0 && g.lectures.every(l => l.readAt && l.immediateDone);
export function remainingMinutes(s: CramSession): number | undefined {
  const budget = Number(s.minutes);
  return Number.isFinite(budget) && budget > 0 ? Math.max(0, budget - (s.activeSeconds ?? 0) / 60) : undefined;
}
/** Product spacing defaults, not claims of an experimentally optimal interval. */
export function dueLectures(s: CramSession, now = Date.now()): SprintLecture[] {
  const g = sprintState(s);
  return g.lectures.filter(l => {
    if (!l.readAt || !l.immediateDone) return false;
    const last = g.recalls.filter(r => r.materialId === l.materialId && r.finishedAt && !r.skipped).at(-1);
    const since = Math.max(l.readAt, last?.finishedAt ?? 0);
    const delayedAlready = g.recalls.some(r => r.materialId === l.materialId && r.kind === 'delayed' && r.finishedAt && !r.skipped);
    const events = g.events.filter(e => e.at > since && e.kind !== 'recall');
    const otherLecture = events.some(e => e.materialId !== l.materialId);
    const enoughDetails = new Set(events.filter(e => e.kind === 'detail').flatMap(e => e.topicIds)).size >= 2;
    const elapsed = now - since;
    const due = otherLecture || enoughDetails || elapsed >= (delayedAlready ? 24 * 60 : 20) * 60_000;
    const snooze = g.snoozed[l.materialId];
    return due && (!snooze || g.events.length > snooze.eventCount || now - snooze.at >= 24 * 60 * 60_000);
  }).sort((a, b) => (g.recalls.filter(r => r.materialId === a.materialId && r.finishedAt && !r.skipped).at(-1)?.finishedAt ?? a.readAt!)
    - (g.recalls.filter(r => r.materialId === b.materialId && r.finishedAt && !r.skipped).at(-1)?.finishedAt ?? b.readAt!));
}
/** Only inputs that change future teaching invalidate a plan; editing a draft does not. */
export function sprintPlanKey(s: CramSession): string {
  const g = sprintState(s);
  return JSON.stringify([s.examAt, s.minutes, s.format, s.requirements,
    s.topics.map(t => [t.id, t.included, t.pages, t.summary, t.note, t.priorityNote]),
    g.events.length, g.recalls.map(r => [r.id, r.finishedAt, r.disputed, r.feedback]),
    g.plan.filter(i => i.status !== 'pending').map(i => [i.id, i.status]), g.snoozed]);
}
export function markSprintAssisted(s: CramSession): CramSession {
  const g = sprintState(s);
  if (!g.recalls.some(r => !r.finishedAt && !r.submittedAt)) return s;
  return { ...s, guided: { ...g, recalls: g.recalls.map(r => !r.finishedAt && !r.submittedAt ? { ...r, assisted: true } : r) } };
}
