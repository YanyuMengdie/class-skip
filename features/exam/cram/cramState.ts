import type { ExamMaterialLink } from '@/types';
import type { GuidedSprint } from './sprintState';

export type Familiarity = 'unknown' | 'new' | 'familiar' | 'confident';
export type CramStatus = 'unchecked' | 'explained' | 'immediate' | 'revisit' | 'checked' | 'unclear';
export type CramGroup = 'focus' | 'quick' | 'deferred';
export interface CramTopic {
  id: string; materialId: string; title: string; summary: string; pages: number[];
  quote: string; origin: 'cached' | 'extracted' | 'manual'; included: boolean;
  familiarity: Familiarity; group: CramGroup; status: CramStatus;
  priorityNote: string; note: string; order: number; manualOrder?: number;
  attempts: number; independentPasses: number; lastVisited?: number;
  dueAt?: number; lastStudiedAt?: number;
  /** IDs of intervening objectives, rather than a count of repeated clicks. */
  spacingSince?: number;
  lesson?: string;
}
export interface CramSource {
  material: ExamMaterialLink; pages: string[]; processedPages: number[];
  extractionNotes: string[]; readError?: string;
}
export interface CramQuestion {
  id: string; prompt: string; options: string[]; answer: string;
  explanation: string; page: number; quote: string;
}
export interface CramFeedback { verdict: 'correct' | 'partial' | 'incorrect'; feedback: string; gap: string; page: number; quote: string }
export interface CramAttempt {
  id: string; topicId: string; question: CramQuestion; answer: string;
  submittedAt: number; feedback?: CramFeedback; assisted: boolean; delayed: boolean;
  evaluationDisputed?: boolean; guessed?: boolean;
}
export interface CramActive {
  topicId: string; kind: 'diagnostic' | 'learn' | 'check';
  question?: CramQuestion; draft: string; attemptId?: string;
  showLesson: boolean; assisted: boolean; delayed: boolean; startedAt: number; spentSeconds?: number; guessed?: boolean;
}
export interface CramSession {
  guided?: GuidedSprint;
  version: 1; id: string; userId: string; title: string; createdAt: number; updatedAt: number;
  examAt: string; minutes: string; format: 'mixed' | 'choice' | 'short' | 'application'; requirements: string;
  stage: 'scope' | 'diagnostic' | 'queue'; wrapUp: boolean;
  sources: CramSource[]; topics: CramTopic[]; attempts: CramAttempt[];
  visits: { topicId: string; at: number; kind?: CramActive['kind']; seconds?: number }[];
  activeSeconds?: number; archivedWork?: CramActive[]; active?: CramActive;
  requests: { at: number; kind: string; inputTokens?: number; outputTokens?: number; outcome: string }[];
}
export const cramId = () => crypto.randomUUID();
export const makeCramSession = (userId: string, materials: ExamMaterialLink[]): CramSession => ({
  version: 1, id: cramId(), userId, title: '', createdAt: Date.now(), updatedAt: Date.now(),
  examAt: '', minutes: '', format: 'mixed', requirements: '', stage: 'scope', wrapUp: false,
  sources: materials.map(material => ({ material, pages: [], processedPages: [], extractionNotes: [] })),
  topics: [], attempts: [], visits: [], requests: [],
});
export function interveningCount(s: CramSession, t: CramTopic): number {
  return new Set(s.visits.slice(t.spacingSince ?? s.visits.length).filter(v => v.topicId !== t.id && (v.seconds ?? 0) >= 20).map(v => v.topicId)).size;
}
export function eligibleRecheck(s: CramSession, t: CramTopic, now = Date.now()): boolean {
  if (!t.lastStudiedAt) return false;
  if (t.status === 'checked') return !!t.dueAt && now >= t.dueAt;
  const otherCount = s.topics.filter(x => x.included && x.group !== 'deferred' && x.id !== t.id).length;
  const enoughOther = otherCount > 0 && interveningCount(s, t) >= Math.min(2, otherCount);
  return enoughOther || (!!t.dueAt && now >= t.dueAt);
}
export function topicQueue(s: CramSession, now = Date.now()): CramTopic[] {
  return s.topics.filter(t => t.included && t.group !== 'deferred' && (!s.wrapUp || t.attempts > 0 || !!t.lesson))
    .filter(t => !['immediate', 'checked'].includes(t.status) || eligibleRecheck(s, t, now))
    .sort((a, b) => {
      // Evidence-backed revisits, then user priority, then broad coverage; never use inferred examWeight.
      const score = (t: CramTopic) => {
        const recent = s.attempts.filter(x => x.topicId === t.id && x.feedback && !x.evaluationDisputed).slice(-2);
        const improvingGap = recent[recent.length - 1]?.feedback?.verdict === 'partial';
        const stuck = recent.length === 2 && recent.every(x => x.feedback?.verdict === 'incorrect');
        return (eligibleRecheck(s, t, now) ? (stuck ? 12 : 100) : 0) + (t.priorityNote.trim() ? 30 : 0)
          + (!t.lastVisited ? 15 : 0) + (improvingGap ? 8 : 0) + (t.group === 'focus' ? 5 : 0) - (stuck ? 15 : 0);
      };
      return (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER) || score(b) - score(a) || (a.lastVisited ?? 0) - (b.lastVisited ?? 0) || a.order - b.order;
    });
}
export function beginTopic(s: CramSession, id: string, kind?: CramActive['kind']): CramSession {
  const t = s.topics.find(t => t.id === id);
  if (!t || !t.included) return s;
  const delayed = eligibleRecheck(s, t);
  return { ...s, topics: s.topics.map(x => x.id === id && x.group === 'deferred' ? { ...x, group: x.status === 'revisit' || x.status === 'unclear' || x.familiarity === 'new' ? 'focus' as const : 'quick' as const } : x), active: { topicId: id, kind: kind ?? (t.familiarity === 'new' && !t.lesson ? 'learn' : 'check'),
    draft: '', showLesson: false, assisted: false, delayed, startedAt: Date.now() } };
}
export function finishTopic(s: CramSession, defer = false): CramSession {
  if (!s.active) return s;
  const id = s.active.topicId;
  return { ...s, active: undefined, archivedWork: [...(s.archivedWork ?? []), s.active], visits: [...s.visits, { topicId: id, at: Date.now(), kind: s.active.kind, seconds: s.active.spentSeconds ?? 0 }],
    topics: s.topics.map(t => t.id !== id ? t : { ...t, lastVisited: Date.now(), manualOrder: undefined,
      ...(defer ? { group: 'deferred' as const, note: t.note || 'deferred-by-user' } : {}) }) };
}
export function applyCramFeedback(s: CramSession, attemptId: string, f: CramFeedback): CramSession {
  const a = s.attempts.find(a => a.id === attemptId);
  if (!a || a.feedback) return s; // A manual feedback retry must never duplicate learning evidence.
  const now = Date.now();
  const independent = f.verdict === 'correct' && !a.assisted && !a.guessed;
  const exam = new Date(s.examAt).getTime();
  const nextDayPossible = Number.isFinite(exam) && exam - now > 26 * 60 * 60 * 1000;
  return { ...s, attempts: s.attempts.map(x => x.id === attemptId ? { ...x, feedback: f } : x),
    topics: s.topics.map(t => t.id !== a.topicId ? t : { ...t,
      status: independent ? (a.delayed ? 'checked' : 'immediate') : 'revisit',
      attempts: t.attempts + 1, independentPasses: t.independentPasses + (independent ? 1 : 0),
      lastStudiedAt: now, spacingSince: s.visits.length,
      // Engineering defaults, not a scientifically optimal interval. Intervening topics can make it due earlier.
      dueAt: a.delayed && independent ? (nextDayPossible ? now + 24 * 60 * 60 * 1000 : undefined) : now + 10 * 60 * 1000,
      group: independent ? 'quick' : 'focus', note: f.gap || t.note,
    }) };
}

export function mergeCramTopics(existing: CramTopic[], incoming: CramTopic[]): CramTopic[] {
  const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const topics = [...existing];
  for (const topic of incoming) {
    const index = topics.findIndex(old => old.materialId === topic.materialId && key(old.title) === key(topic.title)
      && (key(old.summary) === key(topic.summary) || (!!old.quote && key(old.quote) === key(topic.quote))));
    if (index < 0) topics.push({ ...topic, order: topics.length });
    else topics[index] = { ...topics[index], pages: [...new Set([...topics[index].pages, ...topic.pages])].sort((a, b) => a - b) };
  }
  return topics;
}
