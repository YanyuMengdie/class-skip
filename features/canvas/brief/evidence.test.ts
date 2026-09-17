import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readingAstraFormat } from '@/server/readingAstra';
import { extractBriefItems, parseDocumentDate, parseDocumentWeek } from './evidence';
import type { BriefItem, BriefSource } from './types';

const { astra } = vi.hoisted(() => ({ astra: vi.fn() }));
vi.mock('@/services/readingAstraClient', () => ({ generateReadingContent: astra }));
const zone = 'America/Toronto';
const quote = 'Required: Read chapter 3 before September 21, 2026. Bring two discussion questions.';
const source: BriefSource = {
  id: 'source-1', courseId: 42, kind: 'syllabus', title: 'PSY 494 syllabus', url: 'https://canvas.example.edu/courses/42/files/5',
  text: quote, page: 3, fetchedAt: '2026-09-15T12:00:00.000Z',
};
const draft = (changes: Record<string, unknown> = {}) => ({
  courseId: 42, kind: 'reading', title: '阅读第 3 章', details: '阅读第 3 章，并带两道讨论问题。',
  evidence: [{ sourceId: source.id, quote }], requirement: 'required', requirementQuote: 'Required: Read chapter 3',
  dateText: 'September 21, 2026', relatedAssignmentId: null, ...changes,
});
const decision = (changes: Record<string, unknown> = {}) => ({
  candidateId: 'candidate-1', factSupported: true, dateSupported: true, requirementSupported: true,
  assignmentLinkSupported: true, reason: '', ...changes,
});
function extracted(items = [draft()], reviewedSourceIds = [source.id], issues: string[] = []) {
  return { text: JSON.stringify({ items, reviewedSourceIds, issues }) };
}
function verified(decisions = [decision()]) { return { text: JSON.stringify({ decisions }) }; }
function setup(itemChanges: Record<string, unknown> = {}, decisionChanges: Record<string, unknown> = {}) {
  astra.mockResolvedValueOnce(extracted([draft(itemChanges)])).mockResolvedValueOnce(verified([decision(decisionChanges)]));
}
beforeEach(() => astra.mockReset());

describe('literal course dates', () => {
  it.each([
    ['2026-09-21', '2026-09-21'], ['September 21, 2026', '2026-09-21'], ['21 September 2026', '2026-09-21'],
    ['2026年9月21日', '2026-09-21'], ['Monday, September 21, 2026', '2026-09-21'], ['Sept. 21st, 2026', '2026-09-21'],
  ])('parses complete calendar literal %s without inventing a deadline time', (raw, value) => {
    expect(parseDocumentDate(raw, zone)).toEqual({ value, precision: 'date', origin: 'document', raw, timeZone: zone });
  });
  it.each([
    'Sep 21', 'Week 4', 'tomorrow', 'TBD',
    '09/10/2026', '2026-02-29', '2026-13-02', 'Tuesday, September 21, 2026', '2026-09-21 to 2026-09-23',
    '2026-09-21T23:60Z', '2026-09-21T23:59+14:30', '2026-09-21T24:00Z', '2026-09-21T00:30 PM UTC',
  ])('leaves uncertain or invalid date unresolved: %s', raw => {
    expect(parseDocumentDate(raw, zone)).toBeUndefined();
  });
  it('resolves explicit offsets and preserves exact raw text', () => {
    const raw = 'September 21, 2026 at 11:59 PM UTC-04:00';
    expect(parseDocumentDate(raw, zone)).toMatchObject({ value: '2026-09-22T03:59:00.000Z', precision: 'datetime', raw });
    expect(parseDocumentDate('2026-09-21T23:59Z', zone)?.value).toBe('2026-09-21T23:59:00.000Z');
  });
  it('accepts explicit IANA zone but rejects duplicated/nonexistent DST wall times', () => {
    expect(parseDocumentDate('2026-09-21 23:59 America/Toronto', zone)?.value).toBe('2026-09-22T03:59:00.000Z');
    expect(parseDocumentDate('2026-11-01 01:30 America/Toronto', zone)).toBeUndefined();
    expect(parseDocumentDate('2026-03-08 02:30 America/Toronto', zone)).toBeUndefined();
  });
});

describe('evidence-grounded Canvas extraction', () => {
  it('uses two independent Astra requests and fills links only from actual source records', async () => {
    setup({ url: 'https://invented.invalid', id: 'invented-id' });
    const result = await extractBriefItems([source], [], zone);
    expect(result.issues).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ url: source.url, dateStatus: 'confirmed', requirement: 'required', status: 'unknown',
      date: { value: '2026-09-21', origin: 'document', precision: 'date' }, evidence: [{ sourceId: source.id, quote }] });
    expect(result.items[0].id).not.toBe('invented-id');
    expect(astra).toHaveBeenCalledTimes(2);
    for (const [request] of astra.mock.calls) {
      expect(request.model).toBe('gpt-6-astra');
      expect(request.config.systemInstruction).toContain('不可信数据');
      expect(readingAstraFormat(request.config.responseSchema).schema.additionalProperties).toBe(false);
    }
    expect(astra.mock.calls[1][0].config.systemInstruction).toContain('独立的课程证据审核者');
  });
  it.each([
    { evidence: [{ sourceId: 'unknown-id', quote }] },
    { courseId: 99 },
    { evidence: [{ sourceId: source.id, quote: 'Required: Read chapter 4 before September 21, 2026.' }] },
    { evidence: [{ sourceId: source.id, quote: 'Read  chapter 3' }] },
  ])('rejects missing, cross-course and altered citations: %j', async changes => {
    setup(changes);
    const result = await extractBriefItems([source], [], zone);
    expect(result.items).toEqual([]); expect(result.issues.join(' ')).toContain('同课原文引用');
    expect(astra).toHaveBeenCalledTimes(1);
  });
  it('does not accept a cited source that extraction omitted from its coverage', async () => {
    astra.mockResolvedValueOnce(extracted([draft()], []));
    const result = await extractBriefItems([source], [], zone);
    expect(result.items).toEqual([]); expect(result.issues.join(' ')).toContain('未确认完整读取');
  });
  it('keeps genuine source dates without a year unresolved', async () => {
    const localQuote = 'Required: Read chapter 3 before Sep 21.';
    const localSource = { ...source, text: localQuote };
    setup({ evidence: [{ sourceId: source.id, quote: localQuote }], dateText: 'Sep 21' });
    const result = await extractBriefItems([localSource], [], zone);
    expect(result.items[0]).toMatchObject({ dateText: 'Sep 21', dateStatus: 'needs_confirmation' });
    expect(result.items[0].date).toBeUndefined();
  });
  it('removes a date that the model rewrites or invents instead of copying literally', async () => {
    setup({ dateText: '2026-09-21' });
    const result = await extractBriefItems([source], [], zone);
    expect(result.items[0].date).toBeUndefined(); expect(result.items[0].dateText).toBeUndefined();
    expect(result.items[0].dateStatus).toBe('needs_confirmation');
    expect(result.issues.join(' ')).toContain('不在引用原文');
  });
  it('does not use exact but irrelevant dates if independent meaning check fails', async () => {
    setup({}, { dateSupported: false, reason: '该日期是上传日期，未布置阅读期限。' });
    const result = await extractBriefItems([source], [], zone);
    expect(result.items[0]).toMatchObject({ dateText: 'September 21, 2026', dateStatus: 'needs_confirmation' });
    expect(result.items[0].date).toBeUndefined();
    expect(result.issues.join(' ')).toContain('上传日期');
  });
  it.each([false, null, undefined])('drops unsupported facts instead of treating a citation as proof: %s', async factSupported => {
    setup({}, { factSupported });
    const result = await extractBriefItems([source], [], zone);
    expect(result.items).toEqual([]); expect(result.issues.join(' ')).toContain('未通过原文核对');
  });
  it('drops candidates absent from, or duplicated in, the independent review', async () => {
    astra.mockResolvedValueOnce(extracted()).mockResolvedValueOnce(verified([decision(), decision()]));
    expect((await extractBriefItems([source], [], zone)).items).toEqual([]);
    astra.mockResolvedValueOnce(extracted()).mockResolvedValueOnce(verified([]));
    expect((await extractBriefItems([source], [], zone)).items).toEqual([]);
  });
  it('requires literal and semantic support before marking a reading required', async () => {
    setup({ requirementQuote: 'Students must read' });
    expect((await extractBriefItems([source], [], zone)).items[0].requirement).toBe('unspecified');
    setup({}, { requirementSupported: false });
    expect((await extractBriefItems([source], [], zone)).items[0].requirement).toBe('unspecified');
  });
  it('never rewrites known assignment deadlines or submitted status', async () => {
    const known: BriefItem = {
      id: 'a9', assignmentId: 9, courseId: 42, kind: 'assignment', title: 'Chapter 3 questions', details: '', url: source.url,
      evidence: [], requirement: 'required', dateStatus: 'confirmed', status: 'submitted',
      date: { value: '2026-09-20T23:00:00Z', precision: 'datetime', raw: '2026-09-20T23:00:00Z', timeZone: zone, origin: 'canvas' }, issues: [],
    };
    const snapshot = JSON.stringify(known);
    setup({ relatedAssignmentId: 9, assignmentId: 9, status: 'not_submitted', date: { value: '2026-09-22' } });
    const result = await extractBriefItems([source], [known], zone);
    expect(JSON.stringify(known)).toBe(snapshot);
    expect(result.items[0]).toMatchObject({ relatedAssignmentId: 9, status: 'unknown', date: { origin: 'document', value: '2026-09-21' } });
    expect(result.items[0].assignmentId).toBeUndefined();
  });
  it('rejects invented or semantically unconfirmed assignment links', async () => {
    setup({ relatedAssignmentId: 93 });
    expect((await extractBriefItems([source], [], zone)).items[0].relatedAssignmentId).toBeUndefined();
    const known = { assignmentId: 9, courseId: 42, title: 'Some other task' } as BriefItem;
    setup({ relatedAssignmentId: 9 }, { assignmentLinkSupported: false });
    expect((await extractBriefItems([source], [known], zone)).items[0].relatedAssignmentId).toBeUndefined();
    setup({ relatedAssignmentId: 9 });
    expect((await extractBriefItems([source], [{ ...known, courseId: 43 }], zone)).items[0].relatedAssignmentId).toBeUndefined();
  });
  it('keeps a reading date separate even when it appears in the same assignment description', async () => {
    const assignmentSource = { ...source, kind: 'assignment' as const, assignmentId: 9 };
    const known = { assignmentId: 9, courseId: 42, title: 'Chapter 3 questions' } as BriefItem;
    setup({ dateRole: 'reading', relatedAssignmentId: 9 });
    const result = await extractBriefItems([assignmentSource], [known], zone);
    expect(result.items[0]).toMatchObject({ dateRole: 'reading', relatedAssignmentId: 9, dateStatus: 'confirmed' });
    const verificationInput = JSON.parse(astra.mock.calls[1][0].contents[0].parts[0].text);
    expect(verificationInput.candidates[0].dateRole).toBe('reading');
    expect(astra.mock.calls[1][0].config.systemInstruction).toContain('reading/start 不得冒充 deadline');
  });
  it('uses deadline only for a verified link to a known assignment', async () => {
    const known = { assignmentId: 9, courseId: 42, title: 'Chapter 3 questions' } as BriefItem;
    setup({ dateRole: 'deadline', relatedAssignmentId: 9 });
    expect((await extractBriefItems([source], [known], zone)).items[0].dateRole).toBe('deadline');
    setup({ dateRole: 'deadline', relatedAssignmentId: 9 }, { assignmentLinkSupported: false });
    const unlinked = (await extractBriefItems([source], [known], zone)).items[0];
    expect(unlinked.dateRole).toBe('other'); expect(unlinked.relatedAssignmentId).toBeUndefined();
    setup({ dateRole: 'deadline', relatedAssignmentId: 93 });
    expect((await extractBriefItems([source], [known], zone)).items[0].dateRole).toBe('other');
  });
  it('does not confirm a date if its deadline/start/reading role fails meaning review', async () => {
    setup({ dateRole: 'start' }, { dateSupported: false, reason: '原文是阅读安排，不是上课开始时间。' });
    const item = (await extractBriefItems([source], [], zone)).items[0];
    expect(item.dateStatus).toBe('needs_confirmation'); expect(item.date).toBeUndefined();
  });
  it('treats older candidates without a date role as other instead of guessing a deadline', async () => {
    setup();
    expect((await extractBriefItems([source], [], zone)).items[0].dateRole).toBe('other');
  });
  it('allows a complete empty result and reports extraction omissions', async () => {
    astra.mockResolvedValueOnce(extracted([], [source.id]));
    await expect(extractBriefItems([source], [], zone)).resolves.toEqual({ items: [], issues: [] });
    astra.mockResolvedValueOnce(extracted([], [], ['表格日期无法对应课程任务']));
    const result = await extractBriefItems([source], [], zone);
    expect(result.items).toEqual([]); expect(result.issues.join(' ')).toContain('未确认完整读取');
    expect(result.issues.join(' ')).toContain('表格日期');
  });
  it('does not truncate oversized batches or silently use partial model JSON', async () => {
    await expect(extractBriefItems([{ ...source, text: 'a'.repeat(60_001) }], [], zone)).rejects.toThrow('未截断');
    expect(astra).not.toHaveBeenCalled();
    astra.mockResolvedValueOnce({ text: '{"items":[' });
    await expect(extractBriefItems([source], [], zone)).rejects.toThrow('没有完整整理');
  });
  it('keeps cancellation and upstream failures visible and does not substitute invented output', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(extractBriefItems([source], [], zone, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(astra).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    astra.mockRejectedValueOnce(new Error('Quota unavailable'));
    await expect(extractBriefItems([source], [], zone, { signal })).rejects.toThrow('Quota unavailable');
    expect(astra.mock.calls[0][0].config.abortSignal).toBe(signal);
  });
  it('does not return unreviewed candidates if second pass fails or cancellation occurs between passes', async () => {
    astra.mockResolvedValueOnce(extracted()).mockRejectedValueOnce(new Error('Review failed'));
    await expect(extractBriefItems([source], [], zone)).rejects.toThrow('Review failed');
    const controller = new AbortController();
    astra.mockImplementationOnce(async () => { controller.abort(); return extracted(); });
    await expect(extractBriefItems([source], [], zone, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});


describe('focused weekly course arrangements', () => {
  const term = { courseId: 42, termStart: '2026-09-01T00:00:00Z', termEnd: '2026-12-31T23:59:59Z' };
  it('never sends catalog-only lectures or accepts them as assignment evidence', async () => {
    const catalog = { ...source, id: 'course:42:resource:5', readMode: 'catalog' as const, text: 'Lecture on epigenetics. Read everything.' };
    expect(await extractBriefItems([catalog], [], zone)).toEqual({ items: [], issues: [] });
    expect(astra).not.toHaveBeenCalled();
    setup({ evidence: [{ sourceId: catalog.id, quote: catalog.text }] });
    const result = await extractBriefItems([source, catalog], [], zone);
    expect(result.items).toEqual([]);
    const payload = JSON.parse(astra.mock.calls[0][0].contents[0].parts[0].text);
    expect(payload.sources).toHaveLength(1);
    expect(payload.sources[0].id).toBe(source.id);
  });
  it('retains optional reading pages and only a literal verified material link', async () => {
    const resourceUrl = 'https://canvas.example.edu/courses/42/files/99';
    const localQuote = `Optional reading: Article A, pages 5–12, before September 21, 2026. ${resourceUrl}`;
    setup({ details: '选读文章 A，第 5–12 页。', requirement: 'optional', requirementQuote: 'Optional reading', resourceUrl,
      evidence: [{ sourceId: source.id, quote: localQuote }] }, { resourceLinkSupported: true });
    const result = await extractBriefItems([{ ...source, text: localQuote }], [], zone);
    expect(result.items[0]).toMatchObject({ requirement: 'optional', details: '选读文章 A，第 5–12 页。', url: resourceUrl, context: 'action' });
    setup({ resourceUrl: 'https://invented.invalid/a.pdf' }, { resourceLinkSupported: true });
    expect((await extractBriefItems([source], [], zone)).items[0].url).toBe(source.url);
    setup({ resourceUrl, evidence: [{ sourceId: source.id, quote: localQuote }] }, { resourceLinkSupported: false });
    expect((await extractBriefItems([{ ...source, text: localQuote }], [], zone)).items[0].url).toBe(source.url);
  });
  it('resolves missing year only within one explicit matching term, never from today or upload date', async () => {
    const localQuote = 'Required: Read chapter 3 before Sep 21.';
    setup({ dateText: 'Sep 21', evidence: [{ sourceId: source.id, quote: localQuote }] });
    const result = await extractBriefItems([{ ...source, text: localQuote }], [], zone, { courseContexts: [term] });
    expect(result.items[0]).toMatchObject({ dateStatus: 'confirmed', date: { value: '2026-09-21', raw: 'Sep 21', context: expect.stringContaining('2026-09-01') } });
    expect(result.issues).toEqual([]);
    expect(parseDocumentDate('Sep 21', zone)).toBeUndefined();
    expect(parseDocumentDate('Sep 21', zone, { termStart: '2025-09-01', termEnd: '2026-12-31' })).toBeUndefined();
    expect(parseDocumentDate('January 15', zone, term)).toBeUndefined();
    expect(parseDocumentDate('January 15', zone, { termStart: '2026-09-01', termEnd: '2027-04-30' })?.value).toBe('2027-01-15');
    expect(parseDocumentDate('Tuesday, Sep 21', zone, term)).toBeUndefined();
  });
  it('keeps a known day when a valid time has no explicit unambiguous zone', async () => {
    for (const raw of ['September 21, 2026 at 11:59 PM', 'September 21, 2026 at 11:59 PM EDT']) {
      expect(parseDocumentDate(raw, zone)).toMatchObject({ value: '2026-09-21', precision: 'date', raw });
    }
    expect(parseDocumentDate('September 21, 2026 at 11:80 PM', zone)).toBeUndefined();
    const localQuote = 'Required: Read chapter 3 before September 21, 2026 at 11:59 PM.';
    setup({ dateText: 'September 21, 2026 at 11:59 PM', evidence: [{ sourceId: source.id, quote: localQuote }] });
    const item = (await extractBriefItems([{ ...source, text: localQuote }], [], zone)).items[0];
    expect(item.dateStatus).toBe('confirmed');
    expect(item.date?.precision).toBe('date');
    expect(item.issues.join(' ')).toContain('时区未明确');
  });
  it('supports only explicit calendar week mappings without inventing a class date', async () => {
    const weekText = 'September 14–20, 2026';
    const localQuote = `${weekText}: Lecture 3, Epigenetics. Optional reading: Article A, pages 5–12.`;
    const moduleSource = { ...source, kind: 'module' as const, readMode: 'content' as const, text: localQuote };
    setup({ kind: 'lecture', title: 'Lecture 3：表观遗传', details: '本周 Lecture 3，主题为表观遗传。', dateText: '', weekText,
      requirement: 'unspecified', requirementQuote: '', evidence: [{ sourceId: source.id, quote: localQuote }] }, { weekSupported: true });
    const item = (await extractBriefItems([moduleSource], [], zone)).items[0];
    expect(item).toMatchObject({ weekStart: '2026-09-14', dateStatus: 'confirmed' });
    expect(item.date).toBeUndefined();
    expect(parseDocumentWeek('Week of September 14', zone, term)).toBe('2026-09-14');
    expect(parseDocumentWeek('2026-09-14 to 2026-09-20', zone)).toBe('2026-09-14');
    expect(parseDocumentWeek('Week 3', zone, term)).toBeUndefined();
    expect(parseDocumentWeek('September 14–28, 2026', zone)).toBeUndefined();
    setup({ dateText: '', weekText, evidence: [{ sourceId: source.id, quote: localQuote }] }, { weekSupported: false });
    const rejected = (await extractBriefItems([moduleSource], [], zone)).items[0];
    expect(rejected.weekStart).toBeUndefined();
    expect(rejected.dateStatus).toBe('needs_confirmation');
  });
  it('retains genuine undated notices and independently separates conditional policies', async () => {
    const localQuote = 'Office hours are by appointment. If you miss an exam, submit the form within seven days.';
    setup({ kind: 'notice', title: '办公时间说明', details: '办公时间需要预约。', dateText: '', context: 'reference', requirement: 'unspecified', requirementQuote: '',
      evidence: [{ sourceId: source.id, quote: localQuote }] }, { dateSupported: false, context: 'reference' });
    const item = (await extractBriefItems([{ ...source, text: localQuote }], [], zone)).items[0];
    expect(item).toMatchObject({ context: 'reference', dateStatus: 'unspecified', issues: [] });
    setup({ kind: 'notice', context: 'action', dateText: '', evidence: [{ sourceId: source.id, quote: localQuote }] }, { context: 'conditional', dateSupported: false });
    expect((await extractBriefItems([{ ...source, text: localQuote }], [], zone)).items[0].context).toBe('conditional');
    const instructions = astra.mock.calls[0][0].config.systemInstruction;
    expect(instructions).toContain('不读取或总结 lecture/文章的知识正文');
    expect(instructions).toContain('成绩汇总项目');
    expect(instructions).toContain('老师何时批改');
  });
});
