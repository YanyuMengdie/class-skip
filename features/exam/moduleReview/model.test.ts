import { describe, expect, it } from 'vitest';
import type { PersistedSkimSession } from '@/types';
import {
  makeSlots,
  readingModules,
  selectedPages,
  submitAttempt,
  validateAssessments,
  validateLesson,
  validatePlan,
  validateQuestions,
} from './model';
import type { ModulePlan, ModuleReviewRecord, ReviewQuestion } from './types';
const source = [
  { page: 7, text: 'Theory' },
  { page: 8, text: 'Evidence' },
  { page: 9, text: 'Limits' },
];
const plan: ModulePlan = {
  objectives: Array.from({ length: 8 }, (_, i) => ({
    id: `o${i + 1}`,
    title: `Target ${i + 1}`,
    explanation: 'Explain the relation',
    evidence: 'Source evidence',
    kind: 'concept',
    pages: [7 + (i % 3)],
  })),
  excluded: [],
};
const slots = makeSlots(plan, 16);
const rawQuestion = (i: number) => ({
  ...slots[i],
  promptEn: `Which explanation fits case ${i + 1}?`,
  promptZh: `哪种解释符合案例 ${i + 1}？`,
  optionsEn: ['First explanation', 'Second explanation', 'Third explanation', 'Fourth explanation'],
  optionsZh: ['甲解释', '乙解释', '丙解释', '丁解释'],
  correctIndex: 0,
  reference: 'Reasoned answer',
  criteria: ['Identify the mechanism', 'Explain the evidence'],
  pages: [7],
});
const questions = slots.map(
  (_, i) => validateQuestions({ questions: [rawQuestion(i)] }, [slots[i]], source)[0],
);
const record = (): ModuleReviewRecord => ({
  version: 1,
  id: 'key',
  module: {
    id: 'module',
    routeId: 'route',
    sessionId: 's',
    sessionTitle: 'Reading',
    title: 'Module',
    summary: '',
    start: 7,
    end: 9,
  },
  sourceFingerprint: 'pdf',
  lessons: {},
  lessonRead: true,
  questionCount: 16,
  questions,
  draft: { q1: '0', q2: '1', q7: '我认为有两个不同的机制。' },
  attempts: [],
  supplements: {},
  stage: 'assignment',
  showChinese: true,
  updatedAt: 0,
});

describe('reuse the lecture structure and source boundaries', () => {
  it('takes whole existing modules, never their fine-grained children or reading status', () => {
    const session = {
      id: 's',
      title: 'My reading',
      contentType: 'lecture',
      readingRoute: {
        id: 'r',
        nodes: [
          {
            id: 'm',
            kind: 'module',
            title: 'Whole unit',
            pageStart: 7,
            pageEnd: 9,
            children: [{ id: 'p', kind: 'part', title: 'Tiny part', pageStart: 7, pageEnd: 7 }],
          },
        ],
      },
    } as unknown as PersistedSkimSession;
    const original = structuredClone(session);
    const modules = readingModules(
      [session, { ...session, id: 'paper', contentType: 'paper' }],
      10,
    );
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ id: 's:r:m', start: 7, end: 9, title: 'Whole unit' });
    expect(session).toEqual(original);
    expect(readingModules([session], 8)).toEqual([]);
    expect(
      selectedPages(
        [
          'unrelated1',
          'unrelated2',
          'unrelated3',
          'unrelated4',
          'unrelated5',
          'unrelated6',
          'Theory',
          'Evidence',
          'Limits',
          'outside',
        ],
        modules[0],
      ),
    ).toEqual(source);
  });
  it('rejects uncovered source pages instead of silently shortening the knowledge plan', () => {
    const raw = { objectives: plan.objectives.slice(0, 3), excluded: [] };
    expect(validatePlan(raw, source).objectives).toHaveLength(3);
    expect(() =>
      validatePlan(
        { ...raw, objectives: raw.objectives.map((o) => ({ ...o, pages: [7] })) },
        source,
      ),
    ).toThrow();
    expect(() =>
      validatePlan(
        { ...raw, objectives: raw.objectives.map((o) => ({ ...o, pages: [99] })) },
        source,
      ),
    ).toThrow();
  });
});
describe('substantial, graded homework', () => {
  it.each([16, 24] as const)(
    'requires all %s questions across four difficulty levels and covers every objective',
    (count) => {
      const tasks = makeSlots(plan, count);
      expect(tasks).toHaveLength(count);
      expect(new Set(tasks.map((t) => t.id)).size).toBe(count);
      expect(new Set(tasks.flatMap((t) => t.objectiveIds)).size).toBe(plan.objectives.length);
      expect(tasks.filter((t) => t.kind === 'choice')).toHaveLength(count === 16 ? 6 : 8);
      expect(tasks.filter((t) => t.level === 'analysis')).toHaveLength(count === 16 ? 2 : 4);
    },
  );
  it('rejects short sets, repeated questions, Chinese English-fields and unsupported page citations', () => {
    expect(() =>
      validateQuestions({ questions: [rawQuestion(0)] }, slots.slice(0, 4), source),
    ).toThrow();
    expect(() =>
      validateQuestions(
        { questions: [{ ...rawQuestion(1), promptEn: questions[0].promptEn }] },
        [slots[1]],
        source,
        [questions[0]],
      ),
    ).toThrow();
    expect(() =>
      validateQuestions(
        { questions: [{ ...rawQuestion(0), promptEn: 'What is 注意力?' }] },
        [slots[0]],
        source,
      ),
    ).toThrow();
    expect(() =>
      validateQuestions({ questions: [{ ...rawQuestion(0), pages: [6] }] }, [slots[0]], source),
    ).toThrow();
    expect(() =>
      validateQuestions(
        { questions: [{ ...rawQuestion(0), objectiveIds: ['o8'] }] },
        [slots[0]],
        source,
      ),
    ).toThrow();
  });
  it('rejects an outline lesson and omitted objectives', () => {
    const sections = plan.objectives.map((o) => ({
      title: o.title,
      markdown: 'A connected explanation. '.repeat(10),
      objectiveIds: [o.id],
      pages: o.pages,
    }));
    expect(validateLesson({ sections }, plan, source, 'en').sections).toHaveLength(8);
    expect(() => validateLesson({ sections: sections.slice(0, 7) }, plan, source, 'en')).toThrow();
    expect(() =>
      validateLesson(
        { sections: sections.map((s) => ({ ...s, markdown: 'Too brief.' })) },
        plan,
        source,
        'en',
      ),
    ).toThrow();
  });
  it('freezes each attempt, checks choices locally, leaves unanswered unassessed and retains old submissions', () => {
    const r = record();
    const a = submitAttempt(r, 'en');
    r.draft.q7 = 'Changed later';
    expect(a.answers.q7).toBe('我认为有两个不同的机制。');
    expect(a.assessments.find((x) => x.questionId === 'q1')?.status).toBe('met');
    expect(a.assessments.find((x) => x.questionId === 'q2')?.status).toBe('not_yet');
    expect(a.assessments.find((x) => x.questionId === 'q3')?.status).toBe('unanswered');
    expect(a.assessments.some((x) => x.questionId === 'q7')).toBe(false);
    r.attempts = [a];
    const b = submitAttempt(r, 'zh');
    expect(b.assisted).toBe(true);
    expect(r.attempts).toEqual([a]);
    expect(b.id).not.toBe(a.id);
    expect(() => submitAttempt({ ...r, questions: questions.slice(0, 3) }, 'en')).toThrow();
  });
  it('uses criterion-level evidence to prevent blanket pass and rejects missing grading results', () => {
    const q = questions[6];
    const grade = {
      questionId: q.id,
      status: 'met',
      feedback: 'Conclusion given, evidence absent.',
      criteria: [
        { status: 'met', evidence: 'Names mechanism' },
        { status: 'missing', evidence: 'No comparison' },
      ],
    };
    expect(validateAssessments({ assessments: [grade] }, [q])[0].status).toBe('partial');
    expect(() => validateAssessments({ assessments: [] }, [q])).toThrow();
    expect(() =>
      validateAssessments({ assessments: [{ ...grade, criteria: grade.criteria.slice(0, 1) }] }, [
        q,
      ]),
    ).toThrow();
  });
});

it('accepts one clear scoring criterion for MCQs but requires reasoning criteria for written questions', () => {
  expect(
    validateQuestions(
      { questions: [{ ...rawQuestion(0), criteria: ['Select the supported explanation'] }] },
      [slots[0]],
      source,
    )[0].criteria,
  ).toHaveLength(1);
  expect(() =>
    validateQuestions(
      { questions: [{ ...rawQuestion(6), criteria: ['Correct'] }] },
      [slots[6]],
      source,
    ),
  ).toThrow();
});
it('reuses the original module groups when only a legacy record deck is available', () => {
  const session = {
    id: 's',
    recordDeck: {
      routeId: 'r',
      orderedCardIds: ['part1', 'part2', 'module2'],
      cards: {
        part1: {
          moduleIndex: 1,
          moduleTitle: 'Original first module',
          pageStart: 2,
          pageEnd: 3,
          summary: '',
        },
        part2: {
          moduleIndex: 1,
          moduleTitle: 'Original first module',
          pageStart: 4,
          pageEnd: 6,
          summary: '',
        },
        module2: {
          moduleIndex: 2,
          moduleTitle: 'Original second module',
          pageStart: 7,
          pageEnd: 10,
          summary: '',
        },
      },
    },
  } as unknown as PersistedSkimSession;
  expect(
    readingModules([session], 10).map((m) => ({ title: m.title, start: m.start, end: m.end })),
  ).toEqual([
    { title: 'Original first module', start: 2, end: 6 },
    { title: 'Original second module', start: 7, end: 10 },
  ]);
});
