import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readingAstraFormat } from '@/server/readingAstra';
import { ReadingAstraClientError } from '@/services/readingAstraClient';
import { organizeCourseBrief } from './organize';
import type { BriefItem, BriefSource, CourseBriefReport } from './types';

const { astra } = vi.hoisted(() => ({ astra: vi.fn() }));
vi.mock('@/services/readingAstraClient', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/readingAstraClient')>(), generateReadingContent: astra,
}));
const taskText = 'Read the assigned paper and write an abstract of no more than 350 words. Submit a PDF. Do not use AI to write it. After submission, review one peer abstract.';
const source: BriefSource = { id: '1:assignment:7', courseId: 1, kind: 'assignment', assignmentId: 7,
  title: 'Peer Writing Exercise 1', url: 'https://canvas.example.edu/courses/1/assignments/7', text: taskText, fetchedAt: '2026-09-15T10:00:00Z' };
const item: BriefItem = { id: source.id, courseId: 1, assignmentId: 7, kind: 'assignment', title: source.title,
  details: taskText, evidence: [{ sourceId: source.id, quote: taskText }], url: source.url,
  requirement: 'optional', date: { value: '2026-09-16T23:59:00-04:00', precision: 'datetime', origin: 'canvas', raw: '2026-09-16T23:59:00-04:00', timeZone: 'America/Toronto' },
  dateStatus: 'confirmed', dateRole: 'deadline', status: 'not_submitted', context: 'action', issues: [] };
const report = (overrides: Partial<CourseBriefReport> = {}): CourseBriefReport => ({ version: 1, scopeVersion: 3, id: 'report-1',
  canvasOrigin: 'https://canvas.example.edu', canvasUserId: 5, ownerId: 'owner', courses: [{ id: 1, name: 'PSY240', course_code: 'PSY240' }], weekStart: '2026-09-14',
  timeZone: 'America/Toronto', fetchedAt: '2026-09-15T10:00:00Z', generatedAt: '2026-09-15T10:00:00Z',
  sources: [source], items: [item], coverage: [], changes: [], analysisStatus: 'complete', ...overrides });
const summary = (overrides: Record<string, unknown> = {}) => ({ itemId: item.id, overview: '阅读指定论文，独立写摘要并参加同伴互评。',
  keyRequirements: ['摘要不超过 350 词；提交 PDF。', '禁止使用 AI 代写；提交后评阅一份同伴摘要。'],
  preparation: ['先自行阅读指定论文，记下研究问题、方法和结果。'], evidence: [{ sourceId: source.id, quote: taskText }], ...overrides });
const summaryDecision = (overrides: Record<string, unknown> = {}) => ({ itemId: item.id, factsSupported: true,
  criticalRequirementsComplete: true, preparationSupported: true, conciseChinese: true, reason: '', ...overrides });
const result = (value: unknown) => ({ text: JSON.stringify(value) });
const mockSummary = (candidate = summary(), decision = summaryDecision()) => astra.mockResolvedValueOnce(result({ summaries: [candidate] }))
  .mockResolvedValueOnce(result({ decisions: [decision] }));
const payloadAt = (index: number) => JSON.parse(astra.mock.calls[index][0].contents[0].parts[0].text);
beforeEach(() => astra.mockReset());

describe('Chinese weekly brief editing', () => {
  it('summarizes complete API task instructions while preserving raw evidence, deadlines and submission states', async () => {
    const input = report();
    const untouched = JSON.stringify(input);
    mockSummary();
    const output = await organizeCourseBrief(input);
    expect(output.items[0].digest).toMatchObject({ overview: '阅读指定论文，独立写摘要并参加同伴互评。', keyRequirements: summary().keyRequirements });
    expect(output.items[0].details).toBe(taskText);
    expect(output.items[0].date).toEqual(item.date);
    expect(output.items[0].status).toBe('not_submitted');
    expect(output.items[0].evidence).toEqual(item.evidence);
    expect(JSON.stringify(input)).toBe(untouched);
    expect(output).toMatchObject({ digestVersion: 1, organizingStatus: 'complete' });
    expect(astra).toHaveBeenCalledTimes(2);
    expect(payloadAt(1).sources[0].text).toBe(taskText);
    expect(astra.mock.calls[1][0].config.systemInstruction).toContain('完整同课原文');
    for (const [request] of astra.mock.calls) {
      expect(request.model).toBe('gpt-6-astra');
      expect(request.config.systemInstruction).toContain('不可信数据');
      expect(readingAstraFormat(request.config.responseSchema).schema.additionalProperties).toBe(false);
    }
  });
  it('fails one digest honestly when its short summary omitted a time limit or other critical condition', async () => {
    mockSummary(summary(), summaryDecision({ criticalRequirementsComplete: false, reason: '遗漏必须同伴互评。' }));
    const output = await organizeCourseBrief(report());
    expect(output.items[0].digest).toBeUndefined();
    expect(output.items[0].details).toBe(taskText);
    expect(output.organizingStatus).toBe('partial');
    expect(output.analysisStatus).toBe('complete');
    expect(output.coverage).toContainEqual(expect.objectContaining({ area: 'digest', label: '中文摘要', status: 'partial', detail: '未完成中文摘要核对；原始说明已保留。' }));
  });
  it('reports safe quota errors as Chinese editing failures, replaces prior stage warnings, and preserves input coverage', async () => {
    const safeMessage = 'Astra 的额度或请求频率受限，请检查 API 额度，或稍后重试。';
    astra.mockRejectedValueOnce(new ReadingAstraClientError(safeMessage, 'rate_limit'));
    const input = report({ coverage: [
      { courseId: 1, area: 'assignments', label: '作业', status: 'complete', detail: '已读取', sourceCount: 1 },
      { courseId: 1, area: 'digest', label: '中文摘要', status: 'partial', detail: '上次失败', sourceCount: 0 },
    ] });
    const previousCoverage = JSON.stringify(input.coverage);
    const output = await organizeCourseBrief(input);
    expect(output.coverage.filter(row => row.area === 'digest')).toEqual([
      { courseId: 1, area: 'digest', label: '中文摘要', status: 'partial', detail: safeMessage, sourceCount: 0 },
    ]);
    expect(output.coverage.find(row => row.area === 'assignments')?.status).toBe('complete');
    expect(JSON.stringify(input.coverage)).toBe(previousCoverage);
    expect(output.items[0].digest).toBeUndefined();
    expect(output.organizingStatus).toBe('partial');
  });
  it.each([
    { sourceId: '2:assignment:7', quote: taskText },
    { sourceId: source.id, quote: 'Write exactly 350 words and use AI.' },
  ])('rejects cross-course and rewritten quotes before auditing: %j', async evidence => {
    astra.mockResolvedValueOnce(result({ summaries: [summary({ evidence: [evidence] })] }));
    const output = await organizeCourseBrief(report({ sources: [source, { ...source, id: '2:assignment:7', courseId: 2 }] }));
    expect(output.items[0].digest).toBeUndefined();
    expect(astra).toHaveBeenCalledTimes(1);
  });
  it('does not accept a valid same-course quotation belonging to a different task', async () => {
    const unrelated = { ...source, id: '1:assignment:8', assignmentId: 8, text: 'Use AI for a 500 word report.' };
    astra.mockResolvedValueOnce(result({ summaries: [summary({ evidence: [{ sourceId: unrelated.id, quote: unrelated.text }] })] }));
    const output = await organizeCourseBrief(report({ sources: [source, unrelated] }));
    expect(output.items[0].digest).toBeUndefined();
    expect(payloadAt(0).sources).toHaveLength(1);
  });
  it('removes stale enrichments when new generation is unavailable', async () => {
    const { itemId, ...digest } = summary();
    astra.mockRejectedValueOnce(new Error('rate limit'));
    const output = await organizeCourseBrief(report({ items: [{ ...item, digest, assessmentWeight: { percent: 20, basis: 'individual', evidence: item.evidence } }] }));
    expect(output.items[0].digest).toBeUndefined();
    expect(output.items[0].assessmentWeight).toBeUndefined();
    expect(output.organizingStatus).toBe('partial');
  });
  it('edits only the requested three-week task window and current-week assigned materials', async () => {
    const lecture = { ...item, id: 'lecture', assignmentId: undefined, kind: 'lecture' as const, weekStart: '2026-09-14', date: undefined };
    const current = { ...item, id: 'current' };
    const future = { ...item, id: 'far-future', date: { ...item.date!, value: '2026-10-05', precision: 'date' as const } };
    const done = { ...item, id: 'done', status: 'submitted' as const };
    const lectureNext = { ...lecture, id: 'next-lecture', weekStart: '2026-09-21' };
    const unscheduled = { ...lecture, id: 'unknown-week', weekStart: undefined, dateStatus: 'unspecified' as const };
    const rawLecture: BriefSource = { ...source, id: 'lecture-body', kind: 'file', readMode: 'lecture', text: 'Academic lecture full text must not enter schedule summaries.' };
    const catalog: BriefSource = { ...source, id: 'catalog', kind: 'file', readMode: 'catalog', text: 'All semester lectures.' };
    astra.mockResolvedValueOnce(result({ summaries: [summary({ itemId: 'current' }), summary({ itemId: 'lecture' })] }))
      .mockResolvedValueOnce(result({ decisions: [summaryDecision({ itemId: 'current' }), summaryDecision({ itemId: 'lecture' })] }));
    const output = await organizeCourseBrief(report({ items: [current, future, done, lecture, lectureNext, unscheduled], sources: [source, rawLecture, catalog] }));
    expect(payloadAt(0).items.map((row: { itemId: string }) => row.itemId)).toEqual(['current', 'lecture']);
    expect(payloadAt(0).sources.map((row: { id: string }) => row.id)).toEqual([source.id]);
    expect(output.items.filter(row => row.digest).map(row => row.id)).toEqual(['current', 'lecture']);
    expect(output.organizingStatus).toBe('complete');
  });
  it('rejects duplicate or missing auditor decisions instead of accepting the first one', async () => {
    astra.mockResolvedValueOnce(result({ summaries: [summary()] }))
      .mockResolvedValueOnce(result({ decisions: [summaryDecision(), summaryDecision()] }));
    expect((await organizeCourseBrief(report())).items[0].digest).toBeUndefined();
  });
  it('summarizes confirmed actionable calendar events this week without pulling in future or conditional notices', async () => {
    const eventSource: BriefSource = { ...source, id: '1:calendar:12', kind: 'calendar', assignmentId: undefined,
      text: 'Attend the course lab orientation on September 17. Bring your laboratory notebook.' };
    const event: BriefItem = { ...item, id: 'orientation', assignmentId: undefined, kind: 'notice', title: 'Lab orientation',
      details: eventSource.text, dateRole: 'start', evidence: [{ sourceId: eventSource.id, quote: eventSource.text }] };
    const future = { ...event, id: 'future', date: { ...item.date!, value: '2026-09-21', precision: 'date' as const } };
    const unknown = { ...event, id: 'unknown', dateStatus: 'needs_confirmation' as const };
    const reference = { ...event, id: 'reference', context: 'reference' as const };
    const conditional = { ...event, id: 'conditional', context: 'conditional' as const };
    mockSummary(summary({ itemId: event.id, overview: '参加课程实验室说明会，带上实验记录本。',
      keyRequirements: ['携带实验记录本。'], preparation: [], evidence: event.evidence }), summaryDecision({ itemId: event.id }));
    const output = await organizeCourseBrief(report({ items: [event, future, unknown, reference, conditional], sources: [eventSource] }));
    expect(payloadAt(0).items.map((row: { itemId: string }) => row.itemId)).toEqual(['orientation']);
    expect(output.items.filter(row => row.digest).map(row => row.id)).toEqual(['orientation']);
    expect(output.organizingStatus).toBe('complete');
  });
});

describe('individual assessment weights', () => {
  const syllabus: BriefSource = { ...source, id: '1:syllabus', kind: 'syllabus', assignmentId: undefined, title: 'Syllabus evaluation',
    text: 'Evaluation: Final paper 25%. All twelve weekly quizzes together 20%. Proposal 5%.' };
  const finalPaper = { ...item, title: 'Final paper', date: undefined, dateStatus: 'unspecified' as const };
  const weight = (overrides: Record<string, unknown> = {}) => ({ itemId: item.id, percent: 25, basis: 'individual',
    evidence: [{ sourceId: syllabus.id, quote: 'Final paper 25%.' }], ...overrides });
  const decision = (overrides: Record<string, unknown> = {}) => ({ itemId: item.id, percent: 25, sameTask: true,
    individualWeight: true, percentSupported: true, evaluationSupported: true, ...overrides });
  it('attaches a verified single-task weight from the all-term evaluation without inventing its deadline', async () => {
    astra.mockResolvedValueOnce(result({ weights: [weight()] })).mockResolvedValueOnce(result({ decisions: [decision()] }));
    const output = await organizeCourseBrief(report({ items: [finalPaper], sources: [source, syllabus] }));
    expect(output.items[0].assessmentWeight).toEqual({ percent: 25, basis: 'individual', evidence: weight().evidence });
    expect(output.items[0].date).toBeUndefined();
    expect(output.items[0].digest).toBeUndefined();
    expect(payloadAt(0).evaluationSources[0].text).toBe(syllabus.text);
    expect(astra).toHaveBeenCalledTimes(2);
  });
  it('rejects group weights even when generation calls them individual', async () => {
    astra.mockResolvedValueOnce(result({ weights: [weight({ percent: 20, evidence: [{ sourceId: syllabus.id, quote: 'All twelve weekly quizzes together 20%.' }] })] }))
      .mockResolvedValueOnce(result({ decisions: [decision({ percent: 20, individualWeight: false })] }));
    const output = await organizeCourseBrief(report({ items: [{ ...finalPaper, title: 'Weekly quiz 1' }], sources: [syllabus] }));
    expect(output.items[0].assessmentWeight).toBeUndefined();
  });
  it('does not divide a group total or accept an unsupported percentage', async () => {
    astra.mockResolvedValueOnce(result({ weights: [weight({ percent: 15 })] }));
    const output = await organizeCourseBrief(report({ items: [finalPaper], sources: [syllabus] }));
    expect(output.items[0].assessmentWeight).toBeUndefined();
    expect(astra).toHaveBeenCalledTimes(1);
  });
  it('keeps conflicting individual weights unknown even if separate audit rows approve them', async () => {
    const changed = { ...syllabus, text: 'Final paper 25%. Final paper 30%.' };
    astra.mockResolvedValueOnce(result({ weights: [weight(), weight({ percent: 30, evidence: [{ sourceId: syllabus.id, quote: 'Final paper 30%.' }] })] }))
      .mockResolvedValueOnce(result({ decisions: [decision(), decision({ percent: 30 })] }));
    const output = await organizeCourseBrief(report({ items: [finalPaper], sources: [changed] }));
    expect(output.items[0].assessmentWeight).toBeUndefined();
    expect(output.organizingStatus).toBe('partial');
  });
});

describe('editing lifecycle', () => {
  it('reuses unchanged verified digests but invalidates them when a source changes', async () => {
    mockSummary();
    const previous = await organizeCourseBrief(report());
    astra.mockClear();
    const cached = await organizeCourseBrief(report({ fetchedAt: '2026-09-16T10:00:00Z', sources: [{ ...source, fetchedAt: '2026-09-16T10:00:00Z' }] }), { previous });
    expect(cached.items[0].digest).toEqual(previous.items[0].digest);
    expect(astra).not.toHaveBeenCalled();
    astra.mockRejectedValueOnce(new Error('offline'));
    const changed = await organizeCourseBrief(report({ sources: [{ ...source, text: `${taskText} Late work is not accepted.` }] }), { previous });
    expect(astra).toHaveBeenCalledTimes(1);
    expect(changed.items[0].digest).toBeUndefined();
  });
  it('never uses another account cached digest', async () => {
    mockSummary();
    const previous = await organizeCourseBrief(report());
    astra.mockClear();
    astra.mockRejectedValueOnce(new Error('offline'));
    const output = await organizeCourseBrief(report({ ownerId: 'another-owner' }), { previous });
    expect(output.items[0].digest).toBeUndefined();
    expect(astra).toHaveBeenCalledTimes(1);
  });
  it('respects cancellation before and between generation and independent audit', async () => {
    const before = new AbortController(); before.abort();
    await expect(organizeCourseBrief(report(), { signal: before.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(astra).not.toHaveBeenCalled();
    const during = new AbortController();
    astra.mockImplementationOnce(async () => { during.abort(); return result({ summaries: [summary()] }); });
    await expect(organizeCourseBrief(report(), { signal: during.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(astra).toHaveBeenCalledTimes(1);
  });
});
