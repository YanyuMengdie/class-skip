import type { PersistedSkimSession, SkimReadingRouteNode } from '@/types';
import type {
  Assessment,
  Attempt,
  Lesson,
  ModulePlan,
  ModuleReviewRecord,
  QuestionSlot,
  ReviewModule,
  ReviewQuestion,
  SourcePage,
} from './types';

export async function digest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function readingModules(
  sessions: PersistedSkimSession[],
  pageCount: number,
): ReviewModule[] {
  return sessions.flatMap((s, i) => {
    if (s.contentType && s.contentType !== 'lecture') return [];
    const route = s.readingRoute;
    const visit = (nodes: SkimReadingRouteNode[]): SkimReadingRouteNode[] =>
      nodes.flatMap((n) => (n.kind === 'module' ? [n] : visit(n.children ?? [])));
    if (!route && s.recordDeck) {
      const deck = s.recordDeck;
      const groups = new Map<number, (typeof deck.cards)[string][]>();
      for (const id of deck.orderedCardIds) {
        const card = deck.cards[id];
        if (card) groups.set(card.moduleIndex, [...(groups.get(card.moduleIndex) ?? []), card]);
      }
      return [...groups.entries()]
        .map(([index, cards]) => ({
          id: `${s.id}:${deck.routeId}:module-${index}`,
          routeId: deck.routeId,
          sessionId: s.id,
          sessionTitle: s.title || `Reading ${i + 1}`,
          title: cards[0].moduleTitle || cards[0].title,
          summary: cards.map((c) => c.summary).join('\n'),
          start: Math.min(...cards.map((c) => c.pageStart)),
          end: Math.max(...cards.map((c) => c.pageEnd)),
        }))
        .filter(
          (m) =>
            Number.isInteger(m.start) &&
            Number.isInteger(m.end) &&
            m.start >= 1 &&
            m.end >= m.start &&
            m.end <= pageCount,
        );
    }
    const nodes = route ? visit(route.nodes) : [];
    return nodes
      .filter(
        (n) =>
          Number.isInteger(n.pageStart) &&
          Number.isInteger(n.pageEnd) &&
          n.pageStart! >= 1 &&
          n.pageEnd! >= n.pageStart! &&
          n.pageEnd! <= pageCount,
      )
      .map((n) => ({
        id: `${s.id}:${route!.id}:${n.id}`,
        routeId: route!.id,
        sessionId: s.id,
        sessionTitle: s.title || `Reading ${i + 1}`,
        title: n.title,
        summary: n.summary || '',
        start: n.pageStart!,
        end: n.pageEnd!,
      }));
  });
}
export function selectedPages(pages: string[], module: ReviewModule): SourcePage[] {
  if (module.start < 1 || module.end > pages.length || module.start > module.end)
    throw new Error('Invalid module page range.');
  return pages
    .slice(module.start - 1, module.end)
    .map((text, i) => ({ page: module.start + i, text }));
}
export function makeSlots(plan: ModulePlan, count: 16 | 24): QuestionSlot[] {
  const counts = count === 16 ? [6, 4, 4, 2] : [8, 6, 6, 4];
  const levels = ['foundation', 'connection', 'application', 'analysis'] as const;
  let cursor = 0;
  return levels.flatMap((level, part) =>
    Array.from({ length: counts[part] }, () => {
      const index = cursor++;
      // Every objective is assigned before cycling. Advanced tasks connect two objectives.
      const ids = [plan.objectives[index % plan.objectives.length].id];
      if (level !== 'foundation' && plan.objectives.length > 1)
        ids.push(plan.objectives[(index + 1) % plan.objectives.length].id);
      return {
        id: `q${index + 1}`,
        level,
        kind: level === 'foundation' ? 'choice' : 'written',
        objectiveIds: ids,
      };
    }),
  );
}
const fail = (reason = ''): never => {
  throw new Error(
    'Content validation failed; completed work is retained. Retry. / 内容校验未通过，已完成的内容保留，请重试。' +
      (reason ? ` (${reason})` : ''),
  );
};
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : fail();
const str = (v: unknown, limit = 30000): string =>
  typeof v === 'string' && v.trim() && v.length <= limit ? v.trim() : fail();
const arr = (v: unknown, min = 1, max = 40): any[] =>
  Array.isArray(v) && v.length >= min && v.length <= max ? v : fail();
const strings = (v: unknown, min = 1, max = 30) => arr(v, min, max).map((x) => str(x));
const pagesFor = (v: unknown, source: SourcePage[]) => {
  const ps = arr(v).map((p) =>
    Number.isInteger(p) && source.some((s) => s.page === p) ? (p as number) : fail(),
  );
  return [...new Set(ps)];
};
const english = (v: unknown) => {
  const s = str(v);
  if (!/[A-Za-z]/.test(s) || /\p{Script=Han}/u.test(s)) fail('English question or option required');
  return s;
};
export function validatePlan(value: unknown, source: SourcePage[]): ModulePlan {
  const v = obj(value);
  const objectives = arr(v.objectives, 3, 16).map((raw, i) => {
    const x = obj(raw);
    const kind = str(x.kind);
    if (!['concept', 'relationship', 'evidence', 'application', 'limitation'].includes(kind))
      fail();
    return {
      id: `o${i + 1}`,
      title: str(x.title),
      explanation: str(x.explanation),
      pages: pagesFor(x.pages, source),
      evidence: str(x.evidence),
      kind: kind as ModulePlan['objectives'][number]['kind'],
    };
  });
  if (new Set(objectives.map((o) => o.title.toLowerCase())).size !== objectives.length) fail();
  const covered = new Set(objectives.flatMap((o) => o.pages));
  // Every physical source page has either a learning objective or an explicit exclusion.
  const excluded = arr(v.excluded, 0, source.length).map((raw) => {
    const x = obj(raw);
    const ps = pagesFor([x.page], source);
    covered.add(ps[0]);
    return `PDF ${ps[0]}: ${str(x.reason)}`;
  });
  if (source.some((p) => !covered.has(p.page))) fail();
  return { objectives, excluded };
}
export function validateLesson(
  value: unknown,
  plan: ModulePlan,
  source: SourcePage[],
  language: 'zh' | 'en',
): Lesson {
  const covered = new Set<string>();
  const sections = arr(obj(value).sections, 2, 10).map((raw) => {
    const x = obj(raw),
      ids = strings(x.objectiveIds);
    if (ids.some((id) => !plan.objectives.some((o) => o.id === id))) fail();
    ids.forEach((id) => covered.add(id));
    return {
      title: str(x.title),
      markdown: str(x.markdown),
      objectiveIds: ids,
      pages: pagesFor(x.pages, source),
    };
  });
  if (
    plan.objectives.some((o) => !covered.has(o.id)) ||
    sections.reduce((n, s) => n + s.markdown.length, 0) < 900
  )
    fail();
  return { language, sections };
}
const signature = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function validateQuestions(
  value: unknown,
  slots: QuestionSlot[],
  source: SourcePage[],
  existing: ReviewQuestion[] = [],
): ReviewQuestion[] {
  const seen = new Set(existing.map((q) => signature(q.promptEn)));
  const raw = arr(obj(value).questions, slots.length, slots.length);
  return slots.map((slot) => {
    const matches = raw.filter((q) => q.id === slot.id);
    if (matches.length !== 1) fail(`${slot.id}: missing or duplicate question`);
    const x = obj(matches[0]);
    const promptEn = english(x.promptEn),
      sig = signature(promptEn);
    if (seen.has(sig)) fail(`${slot.id}: repeated question`);
    seen.add(sig);
    const optionsEn = slot.kind === 'choice' ? arr(x.optionsEn, 4, 4).map(english) : [];
    const optionsZh = slot.kind === 'choice' ? strings(x.optionsZh, 4, 4) : [];
    if (
      slot.kind === 'choice' &&
      (!Number.isInteger(x.correctIndex) ||
        x.correctIndex < 0 ||
        x.correctIndex > 3 ||
        new Set(optionsEn.map(signature)).size !== 4)
    )
      fail();
    const ids = strings(x.objectiveIds);
    if (
      ids.length !== slot.objectiveIds.length ||
      slot.objectiveIds.some((id) => !ids.includes(id))
    )
      fail(`${slot.id}: objective coverage mismatch`);
    return {
      ...slot,
      promptEn,
      promptZh: str(x.promptZh),
      optionsEn,
      optionsZh,
      correctIndex: slot.kind === 'choice' ? x.correctIndex : -1,
      reference: str(x.reference),
      criteria: strings(x.criteria, slot.kind === 'choice' ? 1 : 2, 5),
      pages: pagesFor(x.pages, source),
    };
  });
}
export function validateAssessments(value: unknown, questions: ReviewQuestion[]): Assessment[] {
  const rows = arr(obj(value).assessments, questions.length, questions.length);
  return questions.map((q) => {
    const matches = rows.filter((r) => r.questionId === q.id);
    if (matches.length !== 1) fail();
    const x = obj(matches[0]);
    const status = str(x.status);
    if (!['met', 'partial', 'not_yet'].includes(status)) fail();
    const criteria = arr(x.criteria, q.criteria.length, q.criteria.length).map((raw, i) => {
      const c = obj(raw);
      if (!['met', 'partial', 'missing'].includes(c.status)) fail();
      return {
        criterion: q.criteria[i],
        status: c.status as 'met' | 'partial' | 'missing',
        evidence: str(c.evidence),
      };
    });
    // A blanket positive verdict cannot contradict the criterion-level evaluation.
    const resolved = criteria.every((c) => c.status === 'met')
      ? 'met'
      : criteria.every((c) => c.status === 'missing')
        ? 'not_yet'
        : 'partial';
    return { questionId: q.id, status: resolved, feedback: str(x.feedback), criteria };
  });
}
export function submitAttempt(record: ModuleReviewRecord, language: 'zh' | 'en'): Attempt {
  if (record.questions.length !== record.questionCount)
    throw new Error('Generate the entire assignment before submitting.');
  const answers = structuredClone(record.draft);
  const assessments: Assessment[] = record.questions.flatMap<Assessment>((q) => {
    const answer = answers[q.id]?.trim();
    if (!answer)
      return [
        {
          questionId: q.id,
          status: 'unanswered' as const,
          feedback:
            language === 'en'
              ? 'Not answered; understanding has not been checked.'
              : '未作答，尚未确认理解。',
          criteria: [],
        },
      ];
    if (q.kind !== 'choice') return [];
    if (!/^[0-3]$/.test(answer)) throw new Error('Invalid selected answer.');
    return [
      {
        questionId: q.id,
        status: Number(answer) === q.correctIndex ? ('met' as const) : ('not_yet' as const),
        feedback: q.reference,
        criteria: [],
      },
    ];
  });
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    answers,
    assessments,
    language,
    assisted: record.attempts.length > 0,
  };
}
export function validateStoredRecord(v: unknown, id: string): ModuleReviewRecord {
  const x = obj(v);
  if (
    x.version !== 1 ||
    x.id !== id ||
    !Array.isArray(x.questions) ||
    !Array.isArray(x.attempts) ||
    !x.lessons ||
    !x.draft ||
    !x.module ||
    ![16, 24].includes(x.questionCount) ||
    !['prepare', 'lesson', 'assignment', 'feedback'].includes(x.stage) ||
    typeof x.showChinese !== 'boolean' ||
    typeof x.lessonRead !== 'boolean' ||
    typeof x.updatedAt !== 'number' ||
    !x.supplements
  )
    fail();
  const m = obj(x.module);
  if (
    typeof m.id !== 'string' ||
    typeof m.title !== 'string' ||
    !Number.isInteger(m.start) ||
    !Number.isInteger(m.end) ||
    m.start < 1 ||
    m.end < m.start
  )
    fail();
  if (
    Object.values(obj(x.draft)).some((answer) => typeof answer !== 'string') ||
    Object.values(obj(x.supplements)).some((content) => typeof content !== 'string')
  )
    fail();
  if (
    x.questions.length > x.questionCount ||
    new Set(x.questions.map((q: any) => q.id)).size !== x.questions.length
  )
    fail();
  const source = Array.from({ length: m.end - m.start + 1 }, (_, i) => ({
    page: m.start + i,
    text: '',
  }));
  if (x.plan) {
    const p = obj(x.plan);
    const objectives = arr(p.objectives, 3, 16);
    if (
      objectives.some(
        (o) => typeof o.id !== 'string' || typeof o.title !== 'string' || !Array.isArray(o.pages),
      ) ||
      new Set(objectives.map((o) => o.id)).size !== objectives.length ||
      !Array.isArray(p.excluded)
    )
      fail();
    const slots = makeSlots(p as ModulePlan, x.questionCount);
    if (x.questions.length)
      validateQuestions({ questions: x.questions }, slots.slice(0, x.questions.length), source);
    for (const [language, lesson] of Object.entries(obj(x.lessons))) {
      if (language !== 'zh' && language !== 'en') fail();
      validateLesson(lesson, p as ModulePlan, source, language as 'zh' | 'en');
    }
  } else if (x.questions.length || x.attempts.length || Object.keys(x.lessons).length) fail();
  for (const a of x.attempts) {
    if (
      typeof a.id !== 'string' ||
      !a.answers ||
      !Array.isArray(a.assessments) ||
      x.questions.length !== x.questionCount
    )
      fail();
    if (Object.values(obj(a.answers)).some((answer) => typeof answer !== 'string')) fail();
    if (new Set(a.assessments.map((r: any) => r.questionId)).size !== a.assessments.length) fail();
    for (const r of a.assessments)
      if (
        !x.questions.some((q: any) => q.id === r.questionId) ||
        !['met', 'partial', 'not_yet', 'unanswered'].includes(r.status) ||
        typeof r.feedback !== 'string' ||
        !Array.isArray(r.criteria)
      )
        fail();
  }
  return x as ModuleReviewRecord;
}
