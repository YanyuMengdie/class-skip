import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addWeeklyLectureGuides } from './lectureGuides';
import type { BriefItem, BriefSource, CourseBriefReport } from './types';

const mocks = vi.hoisted(() => ({ request: vi.fn(), download: vi.fn(), pdf: vi.fn(), ai: vi.fn() }));
vi.mock('@/services/canvas', () => ({ requestCanvas: mocks.request, downloadCanvasFile: mocks.download }));
vi.mock('@/lib/pdf/pdfUtils', () => ({ extractPdfText: mocks.pdf }));
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: mocks.ai }));
const origin = 'https://school.example';
const connection = { canvasUrl: origin, accessToken: 'test-token' };
const fileUrl = `${origin}/courses/12/files/40`;
const lectureText = 'Amino acids differ in the chemical properties of their side chains. These properties affect protein structure.';
const source = (overrides: Partial<BriefSource> = {}): BriefSource => ({ id: 'schedule', courseId: 12, kind: 'syllabus', title: 'Course schedule',
  url: `${origin}/courses/12`, text: `Week of September 14, 2026: Lecture 3, amino acids. ${fileUrl}`, fetchedAt: '2026-09-15T12:00:00Z', readMode: 'content', ...overrides });
const item = (overrides: Partial<BriefItem> = {}): BriefItem => ({ id: 'lecture3', courseId: 12, kind: 'lecture', title: 'Lecture 3：氨基酸',
  details: '本周讲解氨基酸。', url: fileUrl, evidence: [{ sourceId: 'schedule', quote: source().text }], requirement: 'unspecified',
  weekStart: '2026-09-14', dateStatus: 'confirmed', status: 'unknown', issues: [], ...overrides });
const catalog = (overrides: Partial<BriefSource> = {}): BriefSource => source({ id: '12:resource:file:40', kind: 'module', title: 'Lecture3.pdf', url: fileUrl,
  text: `Lecture3.pdf ${fileUrl}`, fileId: 40, readMode: 'catalog', ...overrides });
const report = (items = [item()], sources = [source(), catalog()]): CourseBriefReport => ({ version: 1, scopeVersion: 3, id: 'report', canvasOrigin: origin,
  canvasUserId: 9, ownerId: 'owner', courses: [{ id: 12, name: 'Biochemistry', course_code: 'BCH210' }], weekStart: '2026-09-14', timeZone: 'America/Toronto',
  fetchedAt: '2026-09-15T12:00:00Z', generatedAt: '2026-09-15T12:05:00Z', sources, items, coverage: [], changes: [], analysisStatus: 'complete' });
const file = { id: 40, folder_id: 2, display_name: 'Lecture3.pdf', filename: 'lecture3.pdf', size: 2000,
  'content-type': 'application/pdf', course_id: 12, updated_at: '2026-09-14T12:00:00Z' };

function goodAI(params: any) {
  const input = JSON.parse(params.contents[0].parts[0].text);
  if (input.fileId) return { text: JSON.stringify({ sameLecture: true }) };
  if (input.guide) return { text: JSON.stringify({ supported: true, sameLecture: true, preparationIsSuggestion: true, reason: '' }) };
  return { text: JSON.stringify({ overview: '这一讲介绍氨基酸侧链性质与蛋白质结构的联系。', concepts: ['留意侧链性质怎样影响蛋白质结构。'],
    preparation: ['建议先浏览课件里的侧链分类。'], evidence: [{ sourceId: input.pages[0].id, quote: input.pages[0].text }] }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({ ...file });
  mocks.download.mockResolvedValue({ name: 'Lecture3.pdf', size: 2000, type: 'application/pdf' });
  mocks.pdf.mockResolvedValue([lectureText, 'Protein structure depends on interactions between the amino acid side chains.']);
  mocks.ai.mockImplementation(goodAI);
});

describe('specific weekly lecture scope', () => {
  it('downloads only a confirmed current-week lecture and leaves task facts unchanged', async () => {
    const original = report([item(), item({ id: 'past', weekStart: '2026-09-07' }), item({ id: 'future', weekStart: '2026-09-21' }),
      item({ id: 'reading', kind: 'reading' }), item({ id: 'assignment', kind: 'assignment' }), item({ id: 'uncertain', dateStatus: 'needs_confirmation' })]);
    const snapshot = JSON.stringify(original);
    const result = await addWeeklyLectureGuides(original, { connection });
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.ai).toHaveBeenCalledTimes(2);
    expect(result.items[0].guide?.status).toBe('ready');
    expect(result.items.slice(1).every(entry => !entry.guide)).toBe(true);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(result.items.map(({ guide: _guide, ...entry }) => entry)).toEqual(original.items);
    const pages = result.sources.filter(entry => entry.readMode === 'lecture');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ fileId: 40, page: 1, courseId: 12 });
    expect(result.items[0].guide?.evidence?.[0].sourceId).toBe(pages[0].id);
  });

  it('uses the report time zone and rejects dates conflicting with the assigned week', async () => {
    const dated = item({ weekStart: undefined, date: { value: '2026-09-21T02:00:00Z', precision: 'datetime', origin: 'canvas', raw: '', timeZone: 'America/Toronto' } });
    const result = await addWeeklyLectureGuides(report([dated, item({ id: 'mismatch', date: { ...dated.date!, value: '2026-09-22T02:00:00Z' } })]), { connection });
    expect(result.items[0].guide?.status).toBe('ready');
    expect(result.items[1].guide).toBeUndefined();
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('never guesses a file from matching lecture titles or unrelated course catalog links', async () => {
    const arranged = source({ text: 'Week of September 14, 2026: Lecture 3.' });
    const scheduled = item({ url: `${origin}/courses/12/modules`, evidence: [{ sourceId: arranged.id, quote: arranged.text }] });
    const result = await addWeeklyLectureGuides(report([scheduled], [arranged, catalog(), catalog({ id: 'other', courseId: 13, fileId: 99 })]), { connection });
    expect(result.items[0].guide?.status).toBe('unavailable');
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('resolves only the single explicitly cited catalog file and verifies its relation before reading', async () => {
    const result = await addWeeklyLectureGuides(report([item({ url: `${origin}/courses/12/modules` })]), { connection });
    expect(mocks.ai).toHaveBeenCalledTimes(3);
    expect(mocks.ai.mock.invocationCallOrder[0]).toBeLessThan(mocks.download.mock.invocationCallOrder[0]);
    expect(result.items[0].guide?.status).toBe('ready');
    expect(mocks.request.mock.calls[0][1]).toBe('/api/v1/files/40');
  });

  it('does not choose among multiple file links or a rejected quote association', async () => {
    const ambiguous = source({ text: `${source().text} Lecture 4: ${origin}/courses/12/files/41` });
    const first = await addWeeklyLectureGuides(report([item({ url: `${origin}/courses/12/modules`, evidence: [{ sourceId: 'schedule', quote: ambiguous.text }] })],
      [ambiguous, catalog()]), { connection });
    expect(first.items[0].guide?.status).toBe('unavailable');
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ sameLecture: false }) });
    const second = await addWeeklyLectureGuides(report([item({ url: `${origin}/courses/12/modules` })]), { connection });
    expect(second.items[0].guide?.status).toBe('unavailable');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('does not trust fabricated quotes, other-origin files, or mismatching course metadata', async () => {
    const noQuotes = report([item({ evidence: [{ sourceId: 'schedule', quote: 'Fabricated schedule' }] })]);
    expect((await addWeeklyLectureGuides(noQuotes, { connection })).items[0].guide?.status).toBe('unavailable');
    const externalSource = source({ text: 'Lecture 3: https://different.example/courses/12/files/40' });
    await addWeeklyLectureGuides(report([item({ url: 'https://different.example/courses/12/files/40', evidence: [{ sourceId: 'schedule', quote: externalSource.text }] })], [externalSource, catalog()]), { connection });
    mocks.request.mockResolvedValue({ ...file, course_id: 99 });
    await addWeeklyLectureGuides(report(), { connection });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('never downloads known readings, inaccessible files, or non-PDF materials even when classified as lecture', async () => {
    for (const override of [{ display_name: 'Assigned reading paper.pdf' }, { locked_for_user: true }, { hidden_for_user: true }, { published: false },
      { display_name: 'Lecture3.pptx', 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }]) {
      mocks.request.mockResolvedValue({ ...file, ...override });
      expect((await addWeeklyLectureGuides(report(), { connection })).items[0].guide?.status).toBe('unavailable');
    }
    mocks.request.mockResolvedValue({ ...file, display_name: 'resource40.pdf' });
    const knownReading = await addWeeklyLectureGuides(report([item()], [source(), catalog({ title: 'Assigned reading.pdf' })]), { connection });
    expect(knownReading.items[0].guide?.status).toBe('unavailable');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

describe('grounding and safe reuse', () => {
  it('rejects invented page quotes before audit and rejected guides after independent audit', async () => {
    mocks.ai.mockImplementation(params => {
      const draft = JSON.parse(goodAI(params).text);
      return { text: JSON.stringify({ ...draft, evidence: [{ sourceId: 'invented-page', quote: 'Not from the lecture.' }] }) };
    });
    const first = await addWeeklyLectureGuides(report(), { connection });
    expect(first.items[0].guide?.status).toBe('unavailable');
    expect(first.sources.some(entry => entry.readMode === 'lecture')).toBe(false);
    mocks.ai.mockImplementation(params => {
      const input = JSON.parse(params.contents[0].parts[0].text);
      return input.guide ? { text: JSON.stringify({ supported: false, sameLecture: true, preparationIsSuggestion: true, reason: 'Unsupported fact' }) } : goodAI(params);
    });
    expect((await addWeeklyLectureGuides(report(), { connection })).items[0].guide?.status).toBe('unavailable');
  });

  it('reuses a verified unchanged guide only after fresh metadata validation', async () => {
    const previous = await addWeeklyLectureGuides(report(), { connection });
    vi.clearAllMocks();
    const current = await addWeeklyLectureGuides(report(), { connection, previous });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(current.items[0].guide).toEqual(previous.items[0].guide);
    expect(current.sources.filter(entry => entry.readMode === 'lecture')).toHaveLength(1);
    mocks.request.mockResolvedValue({ ...file, updated_at: '2026-09-15T14:00:00Z' });
    await addWeeklyLectureGuides(report(), { connection, previous });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('does not reuse prior guides from another owner, account, or week', async () => {
    const previous = await addWeeklyLectureGuides(report(), { connection });
    vi.clearAllMocks();
    for (const wrong of [{ ...previous, ownerId: 'other' }, { ...previous, canvasUserId: 22 }, { ...previous, weekStart: '2026-09-07' }]) {
      await addWeeklyLectureGuides(report(), { connection, previous: wrong });
    }
    expect(mocks.download).toHaveBeenCalledTimes(3);
  });

  it('shares one PDF download across two confirmed items without sharing their guide blindly', async () => {
    const result = await addWeeklyLectureGuides(report([item(), item({ id: 'lecture3-repeat', title: 'Lecture 3 复习' })]), { connection });
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.ai).toHaveBeenCalledTimes(4);
    expect(result.items.every(entry => entry.guide?.status === 'ready')).toBe(true);
    expect(result.sources.filter(entry => entry.readMode === 'lecture')).toHaveLength(1);
  });

  it('marks unreadable and overlarge PDFs honestly rather than generating from truncated text', async () => {
    for (const pages of [['', '', lectureText], [lectureText.repeat(1000)], Array.from({ length: 141 }, () => lectureText)]) {
      mocks.pdf.mockResolvedValue(pages);
      const result = await addWeeklyLectureGuides(report(), { connection });
      expect(result.items[0].guide?.status).toBe('unavailable');
    }
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('keeps confirmed schedules when provider calls fail and respects cancellation', async () => {
    mocks.ai.mockRejectedValue(new Error('provider unavailable'));
    const result = await addWeeklyLectureGuides(report(), { connection });
    expect(result.items[0]).toMatchObject({ dateStatus: 'confirmed', weekStart: '2026-09-14', guide: { status: 'unavailable' } });
    const controller = new AbortController(); controller.abort();
    await expect(addWeeklyLectureGuides(report(), { connection, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
