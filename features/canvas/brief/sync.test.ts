import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignmentItem, briefChanges, canvasHtmlText, flagBriefConflicts, mergeAssignmentFindings, mergeCalendarFindings, safeCanvasUrl, syncCourseBrief } from './sync';
import { canvasDate } from './dates';
import type { BriefItem, BriefSource, BriefSyncOptions, CourseBriefReport } from './types';

const mocks = vi.hoisted(() => ({ request: vi.fn(), download: vi.fn(), pdf: vi.fn(), extract: vi.fn(), organize: vi.fn(), guides: vi.fn() }));
vi.mock('@/services/canvas', () => ({ requestCanvas: mocks.request, downloadCanvasFile: mocks.download }));
vi.mock('@/lib/pdf/pdfUtils', () => ({ extractPdfText: mocks.pdf }));
vi.mock('./evidence', () => ({ extractBriefItems: mocks.extract }));
vi.mock('./organize', () => ({ organizeCourseBrief: mocks.organize }));
vi.mock('./lectureGuides', () => ({ addWeeklyLectureGuides: mocks.guides }));

const zone = 'America/Toronto';
const options: BriefSyncOptions = { connection: { canvasUrl: 'https://school.example', accessToken: 'test-only' },
  canvasUserId: 9, ownerId: 'owner-a', courses: [{ id: 12, name: 'Psychology', course_code: 'PSY494' }], weekStart: '2026-09-14', timeZone: zone };
const source = (overrides: Partial<BriefSource> = {}): BriefSource => ({ id: '12:assignment:1', courseId: 12, kind: 'assignment', title: 'Essay',
  url: 'https://school.example/courses/12/assignments/1', text: 'Essay due September 18, 2026.', fetchedAt: '2026-09-15T12:00:00Z', assignmentId: 1, ...overrides });
const task = (overrides: Partial<BriefItem> = {}): BriefItem => ({ id: '12:assignment:1', courseId: 12, kind: 'assignment', title: 'Essay', details: 'Write a paragraph.',
  url: 'https://school.example/courses/12/assignments/1', evidence: [{ sourceId: '12:assignment:1', quote: 'Essay due September 18, 2026.' }],
  requirement: 'unspecified', date: canvasDate('2026-09-19T03:59:00Z', zone), dateText: '2026-09-19T03:59:00Z', dateRole: 'deadline',
  dateStatus: 'confirmed', status: 'unknown', assignmentId: 1, issues: [], ...overrides });
const apiAssignment = { id: 1, name: 'Essay', description: '<p>Write a paragraph.</p>', due_at: '2026-09-19T03:59:00Z',
  lock_at: '2026-09-23T03:59:00Z', unlock_at: '2026-09-01T00:00:00Z', submission_types: ['online_upload'], submission: { workflow_state: 'unsubmitted' } };
let endpoints: Record<string, unknown>;
let failed: Set<string>;
beforeEach(() => {
  vi.clearAllMocks();
  endpoints = { '/api/v1/courses/12': { id: 12, syllabus_body: '<p>Course rules apply.</p>', start_at: '2026-09-01T00:00:00Z' },
    '/api/v1/courses/12/assignments': [apiAssignment] };
  failed = new Set();
  mocks.request.mockImplementation(async (_connection, path: string, { signal }: { signal?: AbortSignal }) => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const key = path.split('?')[0];
    if (failed.has(key)) throw new Error('read failed');
    if (key === '/api/v1/calendar_events' && path.includes('type=assignment')) return endpoints['calendarAssignments'] ?? [];
    return endpoints[key] ?? [];
  });
  mocks.extract.mockResolvedValue({ items: [], issues: [] });
  mocks.organize.mockImplementation(async (report) => ({ ...report, digestVersion: 1, organizingStatus: 'complete' }));
  mocks.guides.mockImplementation(async (report) => report);
  mocks.download.mockResolvedValue({ name: 'Syllabus.pdf' });
  mocks.pdf.mockResolvedValue(['Read chapter three before the discussion.']);
});

describe('Canvas facts and conflict boundaries', () => {
  it('does not confuse a grade for a real submission and handles resubmission', () => {
    expect(assignmentItem({ ...apiAssignment, submission: { workflow_state: 'graded', missing: true } }, source(), zone).status).toBe('unknown');
    expect(assignmentItem({ ...apiAssignment, submission: { workflow_state: 'graded', submitted_at: '2026-09-17T15:00:00Z' } }, source(), zone).status).toBe('submitted');
    const redo = assignmentItem({ ...apiAssignment, submission: { workflow_state: 'submitted', redo_request: true } }, source(), zone);
    expect(redo.status).toBe('unknown'); expect(redo.issues.join()).toContain('重新提交');
    expect(assignmentItem({ ...apiAssignment, submission: { workflow_state: 'unsubmitted', excused: true } }, source(), zone).status).toBe('excused');
  });
  it('uses only due_at, never lock_at, for assignment deadlines', () => {
    expect(assignmentItem(apiAssignment, source(), zone).date?.value).toBe(apiAssignment.due_at);
    expect(assignmentItem({ ...apiAssignment, due_at: null }, source(), zone).dateStatus).toBe('unspecified');
  });
  it('does not restore an assignment link rejected by the independent audit', () => {
    const finding = task({ id: 'doc', assignmentId: undefined, dateRole: 'deadline', date: canvasDate('2026-09-20T03:59:00Z', zone) });
    expect(flagBriefConflicts([task(), finding], [source()], zone).every(item => item.dateStatus === 'confirmed')).toBe(true);
  });
  it('keeps reading and class dates distinct from a linked assignment deadline', () => {
    const finding = task({ id: 'reading', kind: 'reading', assignmentId: undefined, relatedAssignmentId: 1, dateRole: 'reading', date: canvasDate('2026-09-16T03:59:00Z', zone) });
    expect(flagBriefConflicts([task(), finding], [source()], zone).every(item => item.dateStatus === 'confirmed')).toBe(true);
  });
  it('flags conflicting verified deadlines, keeps both values, and does not mutate inputs', () => {
    const original = task();
    const finding = task({ id: 'extension', assignmentId: undefined, relatedAssignmentId: 1, date: canvasDate('2026-09-20T03:59:00Z', zone), evidence: [{ sourceId: 'announcement', quote: 'New due date.' }] });
    const result = flagBriefConflicts([original, finding], [source()], zone);
    expect(result.map(item => item.dateStatus)).toEqual(['conflict', 'conflict']);
    expect(result[0].date).toEqual(original.date);
    expect(original.dateStatus).toBe('confirmed'); expect(original.evidence).toHaveLength(1);
    expect(result[0].evidence).toHaveLength(2);
  });
  it('compares date-only document deadlines with the local Canvas date', () => {
    const finding = task({ id: 'doc', assignmentId: undefined, relatedAssignmentId: 1, date: { value: '2026-09-18', precision: 'date', origin: 'document', raw: 'September 18, 2026', timeZone: zone } });
    expect(flagBriefConflicts([task(), finding], [], zone)[0].dateStatus).toBe('confirmed');
  });
  it('does not demote a real Canvas deadline merely because another date is incomplete', () => {
    const finding = task({ id: 'doc', assignmentId: undefined, relatedAssignmentId: 1, date: undefined, dateText: 'Next Friday', dateStatus: 'needs_confirmation' });
    const result = flagBriefConflicts([task(), finding], [], zone);
    expect(result[0].dateStatus).toBe('confirmed');
    expect(result[1].dateStatus).toBe('needs_confirmation');
  });
  it('merges verified same-task instructions without double-counting or changing submission state', () => {
    const original = task({ status: 'submitted' });
    const finding = task({ id: 'doc-task', assignmentId: undefined, relatedAssignmentId: 1, status: 'unknown', details: 'Use APA format.', requirement: 'required' });
    const result = mergeAssignmentFindings([original, finding], zone);
    expect(result).toHaveLength(1); expect(result[0].status).toBe('submitted');
    expect(result[0].date).toEqual(original.date); expect(result[0].details).toContain('Use APA format.');
    expect(original.details).not.toContain('Use APA format.');
    const conflict = mergeAssignmentFindings([original, { ...finding, dateStatus: 'conflict' }], zone);
    expect(conflict).toHaveLength(1); expect(conflict[0].dateStatus).toBe('conflict');
  });
  it('does not invent or execute source links', () => {
    expect(safeCanvasUrl('', 'https://school.example', 'fallback')).toBe('fallback');
    expect(safeCanvasUrl('javascript:alert(1)', 'https://school.example', 'fallback')).toBe('fallback');
    expect(safeCanvasUrl('https://other.example', 'https://school.example', 'fallback')).toBe('fallback');
    expect(canvasHtmlText('<p>Read A</p><script>doSomething()</script><p>Read B</p>')).toContain('Read B');
    expect(canvasHtmlText('<script>doSomething()</script>')).not.toContain('doSomething');
  });
  it('merges a calendar lecture with its verified explanation without losing the actual class time', () => {
    const event = task({ id: '12:calendar:5', assignmentId: undefined, kind: 'lecture', dateRole: 'start', title: 'Lecture 3', url: 'https://school.example/calendar?event_id=5' });
    const finding = task({ id: 'doc-lecture', assignmentId: undefined, kind: 'lecture', dateRole: 'start', title: 'Lecture 3 氨基酸', url: 'https://school.example/courses/12/files/30', evidence: [{ sourceId: event.id, quote: 'Lecture 3 on September 18, 2026.' }] });
    const merged = mergeCalendarFindings([event, finding], zone);
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toEqual(event.date);
    expect(merged[0].url).toBe(finding.url);
    expect(merged[0].kind).toBe('lecture');
  });
});

describe('course synchronization', () => {
  it('reads explicit announcement date range and includes every independent quiz', async () => {
    endpoints['/api/v1/courses/12/quizzes'] = [{ id: 20, title: 'Graded quiz', assignment_id: 1 }, { id: 21, title: 'Practice A', due_at: apiAssignment.due_at }, { id: 22, title: 'Survey B', due_at: apiAssignment.due_at }];
    const report = await syncCourseBrief(options);
    expect(report.items.map(item => item.title)).toEqual(['Essay', 'Practice A', 'Survey B']);
    expect(report.items[1].assignmentId).toBeUndefined();
    const paths = mocks.request.mock.calls.map(call => call[1] as string);
    expect(paths.find(path => path.startsWith('/api/v1/announcements'))).toContain('start_date=2026-09-01&end_date=');
    expect(decodeURIComponent(paths.find(path => path.startsWith('/api/v1/announcements'))!)).toContain(`end_date=${report.fetchedAt}`);
    expect(paths.find(path => path.includes('/assignments?'))).toContain('include[]=submission');
    expect(report.items[0].url).toBe('https://school.example/courses/12/assignments/1');
  });
  it('retains structured dates when AI fails and labels the gap', async () => {
    mocks.extract.mockRejectedValue(new Error('AI unavailable'));
    const report = await syncCourseBrief(options);
    expect(report.items[0].date?.value).toBe(apiAssignment.due_at);
    expect(report.analysisStatus).toBe('partial');
    expect(report.coverage.some(entry => entry.area.startsWith('analysis:') && entry.status === 'unavailable')).toBe(true);
  });
  it('retains the actual start time in the evidence for a timed calendar event', async () => {
    endpoints['/api/v1/calendar_events'] = [{ id: 5, title: 'Office hours', all_day: false, all_day_date: '2026-09-16', start_at: '2026-09-16T18:00:00Z' }];
    const report = await syncCourseBrief(options);
    const entry = report.items.find(item => item.title === 'Office hours')!;
    expect(entry.dateRole).toBe('start');
    expect(entry.evidence[0].quote).toContain(entry.date!.value);
    expect(entry.dateText).toBe('2026-09-16T18:00:00Z');
  });
  it('reads Calendar assignments and merges with the matching assignment, preserving submitted state', async () => {
    endpoints['/api/v1/courses/12/assignments'] = [{ ...apiAssignment, submission: { workflow_state: 'submitted', submitted_at: '2026-09-15T12:00:00Z' } }];
    endpoints['calendarAssignments'] = [{ id: 'assignment_1', title: 'Essay', context_code: 'course_12', start_at: apiAssignment.due_at, description: 'Calendar instructions.' }];
    const report = await syncCourseBrief(options);
    expect(report.items).toHaveLength(1);
    expect(report.items[0].status).toBe('submitted');
    expect(report.items[0].evidence.some(e => e.sourceId === '12:calendar:assignment_1')).toBe(true);
    expect(mocks.request.mock.calls.some(call => call[1].includes('calendar_events?') && call[1].includes('type=assignment'))).toBe(true);
  });
  it('keeps a calendar-only task if the assignments list fails, without using calendar all-day midnight as the deadline', async () => {
    failed.add('/api/v1/courses/12/assignments');
    endpoints['calendarAssignments'] = [{ id: 'assignment_2', title: 'Project', context_code: 'course_12', all_day: true, all_day_date: '2026-09-18', start_at: '2026-09-19T03:59:00Z' }];
    const report = await syncCourseBrief(options);
    expect(report.items[0]).toMatchObject({ id: '12:assignment:2', assignmentId: 2, dateRole: 'deadline', status: 'unknown' });
    expect(report.items[0].date?.value).toBe('2026-09-19T03:59:00Z');
  });
  it('keeps calendar/API date conflicts on one task, and rejects other course or deleted calendar entries', async () => {
    endpoints['calendarAssignments'] = [{ id: 'assignment_1', title: 'Essay', context_code: 'course_12', start_at: '2026-09-20T03:59:00Z' },
      { id: 'assignment_2', title: 'Other course', context_code: 'course_99', start_at: apiAssignment.due_at },
      { id: 'assignment_3', title: 'Removed', context_code: 'course_12', workflow_state: 'deleted', start_at: apiAssignment.due_at }];
    const report = await syncCourseBrief(options);
    expect(report.items).toHaveLength(1);
    expect(report.items[0].dateStatus).toBe('conflict');
    expect(report.items[0].date?.value).toBe(apiAssignment.due_at);
  });
  it('runs summary after facts and targeted guides after summary, with cancellation stopping the final stage', async () => {
    mocks.organize.mockImplementation(async report => ({ ...report, digestVersion: 1 }));
    const report = await syncCourseBrief(options);
    expect(mocks.organize).toHaveBeenCalledTimes(1); expect(mocks.guides).toHaveBeenCalledTimes(1);
    expect(mocks.guides.mock.calls[0][0].digestVersion).toBe(1); expect(report.scopeVersion).toBe(3);
    const controller = new AbortController();
    mocks.organize.mockImplementation(async report => { controller.abort(); return report; });
    mocks.guides.mockClear();
    await expect(syncCourseBrief({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.guides).not.toHaveBeenCalled();
  });
  it('never calls a partial or failed assignments read an empty complete list', async () => {
    failed.add('/api/v1/courses/12/assignments');
    const report = await syncCourseBrief(options);
    expect(report.coverage.find(entry => entry.area === 'assignments')?.status).toBe('unavailable');
    expect(report.items).toHaveLength(0);
  });
  it('keeps old announcement exams and assignments when their refresh fails', async () => {
    const previous = await syncCourseBrief(options);
    const exam = task({ id: 'old-exam', assignmentId: undefined, kind: 'exam', title: 'Midterm exam', evidence: [{ sourceId: 'old-announcement', quote: 'Midterm exam on September 18, 2026.' }] });
    previous.items.push(exam); previous.sources.push(source({ id: 'old-announcement', kind: 'announcement', assignmentId: undefined, text: 'Midterm exam on September 18, 2026.' }));
    failed.add('/api/v1/announcements'); failed.add('/api/v1/courses/12/assignments'); mocks.extract.mockRejectedValue(new Error('no audit'));
    const report = await syncCourseBrief({ ...options, previous });
    expect(report.items.map(item => item.dateStatus)).toEqual(['needs_confirmation', 'needs_confirmation']);
    expect(report.sources.some(entry => entry.id === 'old-announcement')).toBe(true);
    expect(previous.items[0].dateStatus).toBe('confirmed');
  });
  it('does not inherit old data from another Canvas user or app owner', async () => {
    const previous = await syncCourseBrief(options);
    failed.add('/api/v1/courses/12/assignments');
    for (const wrong of [{ ...previous, canvasUserId: 44 }, { ...previous, ownerId: 'someone-else' }, { ...previous, canvasOrigin: 'https://different.example' }]) {
      const report = await syncCourseBrief({ ...options, previous: wrong });
      expect(report.items).toHaveLength(0); expect(report.changes).toHaveLength(0);
    }
  });
  it('reads module exam instructions PDF but marks lecture-only metadata as unread', async () => {
    endpoints['/api/v1/courses/12/modules'] = [{ id: 3, name: 'Week 3' }];
    endpoints['/api/v1/courses/12/modules/3/items'] = [{ id: 7, type: 'File', title: 'Exam instructions.pdf', content_id: 70 }, { id: 8, type: 'File', title: 'Lecture4.pdf', content_id: 80 }];
    endpoints['/api/v1/courses/12/files'] = [{ id: 70, display_name: 'Exam instructions.pdf', size: 100 }, { id: 80, display_name: 'Lecture4.pdf', size: 100 }];
    const report = await syncCourseBrief(options);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(report.sources.some(entry => entry.fileId === 70 && entry.page === 1)).toBe(true);
    expect(report.coverage.find(entry => entry.area === 'module_file_contents')?.detail).toContain('Lecture4.pdf');
    expect(report.items.some(item => item.title === 'Lecture4.pdf')).toBe(false);
  });
  it('marks scanned PDF pages as partial and never invents their text', async () => {
    endpoints['/api/v1/courses/12/files'] = [{ id: 70, display_name: 'Syllabus.pdf', size: 100 }];
    mocks.pdf.mockResolvedValue(['Known text about class rules.', '']);
    const report = await syncCourseBrief(options);
    expect(report.coverage.find(entry => entry.area === 'file:70')?.status).toBe('partial');
    expect(report.sources.filter(entry => entry.fileId === 70)).toHaveLength(1);
  });
  it('never downloads linked lecture or reading PDFs from a resource page or assignment', async () => {
    endpoints['/api/v1/courses/12/assignments'] = [{ ...apiAssignment, description: '<p>Read <a href="/courses/12/files/81">Article A</a> before writing.</p>' }];
    endpoints['/api/v1/courses/12/pages'] = [{ url: 'course-resources', title: 'Course resources' }, { url: 'lecture-text', title: 'Lecture 4 slides' }];
    endpoints['/api/v1/courses/12/pages/course-resources'] = { page_id: 5, title: 'Course resources', body: Array.from({ length: 40 }, (_, n) => `<a href="/courses/12/files/${100 + n}">Lecture ${n}.pdf</a>`).join('') + '<a href="/courses/12/files/70">Course schedule</a>' };
    endpoints['/api/v1/courses/12/files'] = [{ id: 70, display_name: 'Course schedule.pdf', size: 100 }, { id: 81, display_name: 'Article A.pdf', size: 100 }];
    const report = await syncCourseBrief(options);
    expect(mocks.download.mock.calls.map(call => call[1].id)).toEqual([70]);
    expect(mocks.request.mock.calls.some(call => call[1].includes('/pages/lecture-text'))).toBe(false);
    expect(report.coverage.some(c => c.area === 'attachment_limit')).toBe(false);
    expect(report.sources.filter(s => s.readMode === 'catalog')).toHaveLength(41);
    expect(mocks.extract.mock.calls.every(call => call[0].every((s: BriefSource) => s.readMode !== 'catalog'))).toBe(true);
  });
  it('uses the accessible course homepage to find arrangements when directory indexes are denied', async () => {
    failed.add('/api/v1/courses/12/pages'); failed.add('/api/v1/courses/12/files');
    endpoints['/api/v1/courses/12/front_page'] = { page_id: 1, title: 'Home', body: '<a href="/courses/12/pages/syllabus">Syllabus</a><a href="/courses/12/pages/lecture4">Lecture 4</a><a href="/courses/99/pages/syllabus">Syllabus</a>' };
    endpoints['/api/v1/courses/12/pages/syllabus'] = { page_id: 2, title: 'Syllabus', body: '<a href="/courses/12/files/70">Course schedule</a><a href="/courses/12/files/80">Lecture 4</a>' };
    endpoints['/api/v1/files/70'] = { id: 70, display_name: 'Syllabus.pdf', size: 100 };
    const report = await syncCourseBrief(options);
    expect(mocks.download.mock.calls.map(call => call[1].id)).toEqual([70]);
    expect(report.sources.some(s => s.fileId === 70 && s.page === 1)).toBe(true);
    expect(mocks.request.mock.calls.some(call => /courses\/99|pages\/lecture4|files\/80/.test(call[1]))).toBe(false);
  });
  it('rechecks metadata but reuses unchanged arrangement PDFs and AI findings only in the same scope and identity', async () => {
    endpoints['/api/v1/courses/12/files'] = [{ id: 70, display_name: 'Syllabus.pdf', updated_at: '2026-09-01T10:00:00Z', size: 100 }];
    const previous = await syncCourseBrief(options);
    mocks.download.mockClear(); mocks.extract.mockClear();
    const report = await syncCourseBrief({ ...options, previous });
    expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
    expect(report.coverage.find(c => c.area === 'analysis:cached')?.status).toBe('complete');
    (endpoints['/api/v1/courses/12/files'] as any[])[0].updated_at = '2026-09-15T10:00:00Z';
    await syncCourseBrief({ ...options, previous });
    expect(mocks.download).toHaveBeenCalledTimes(1); expect(mocks.extract).toHaveBeenCalledTimes(1);
    mocks.download.mockClear();
    await syncCourseBrief({ ...options, previous: { ...previous, ownerId: 'different' } });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it('preserves distant structured deadlines while limiting task-body analysis to this week and the following two', async () => {
    endpoints['/api/v1/courses/12/assignments'] = [apiAssignment, { ...apiAssignment, id: 2, name: 'Final exam', due_at: '2026-12-01T15:00:00Z', description: '<a href="/courses/12/files/90">Exam instructions.pdf</a>' }];
    const report = await syncCourseBrief(options);
    expect(report.items.find(item => item.title === 'Final exam')?.date?.value).toBe('2026-12-01T15:00:00Z');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.extract.mock.calls.flatMap(call => call[0]).some(s => s.id === '12:assignment:2')).toBe(false);
  });
  it('keeps the teacher module title for a neutral file name and excludes a teaching page body after title verification', async () => {
    endpoints['/api/v1/courses/12/modules'] = [{ id: 3, name: 'Course information' }];
    endpoints['/api/v1/courses/12/modules/3/items'] = [{ id: 7, type: 'File', title: 'Syllabus', content_id: 70 }];
    endpoints['/api/v1/courses/12/files'] = [{ id: 70, display_name: '174526.pdf', size: 100 }];
    endpoints['/api/v1/courses/12/front_page'] = { page_id: 5, title: 'Lecture Outline', body: 'TEACHING_BODY_MUST_NOT_BE_ANALYZED' };
    await syncCourseBrief(options);
    expect(mocks.download.mock.calls.map(call => call[1].id)).toEqual([70]);
    expect(mocks.extract.mock.calls.flatMap(call => call[0]).some(s => s.text.includes('TEACHING_BODY_MUST_NOT_BE_ANALYZED'))).toBe(false);
  });
  it('keeps verified assignment enrichment on an unchanged AI cache hit', async () => {
    mocks.extract.mockResolvedValue({ items: [task({ id: 'doc-extra', assignmentId: undefined, relatedAssignmentId: 1, details: 'Use APA format.', requirement: 'required' })], issues: [] });
    const previous = await syncCourseBrief(options);
    expect(previous.items[0].details).toContain('Use APA format.');
    mocks.extract.mockClear();
    const report = await syncCourseBrief({ ...options, previous });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(report.items[0].details).toContain('Use APA format.');
    expect(report.items[0].requirement).toBe('required');
    expect(report.items[0].date).toEqual(previous.items[0].date);
  });
  it('does not resurrect a legacy lecture body or its findings when an unrelated source fails', async () => {
    const previous = await syncCourseBrief(options);
    previous.sources.push(source({ id: 'lecture-body', kind: 'file', title: 'Lecture 4.pdf · 第 1 页', fileId: 80, readMode: 'content' }));
    previous.items.push(task({ id: 'doc-legacy', kind: 'reading', title: 'Legacy reading', assignmentId: undefined, evidence: [{ sourceId: 'lecture-body', quote: 'Read chapter three' }] }));
    failed.add('/api/v1/courses/12/discussion_topics');
    const report = await syncCourseBrief({ ...options, previous });
    expect(report.items.some(item => item.id === 'doc-legacy')).toBe(false);
    expect(report.sources.some(s => s.id === 'lecture-body')).toBe(false);
  });
  it('batches many short sources within the audit source-count limit', async () => {
    endpoints['/api/v1/announcements'] = Array.from({ length: 110 }, (_, id) => ({ id, title: `Notice ${id}`, message: '<p>Read the schedule.</p>' }));
    await syncCourseBrief(options);
    expect(mocks.extract).toHaveBeenCalledTimes(2);
    expect(mocks.extract.mock.calls.every(call => call[0].length <= 80)).toBe(true);
  });
  it('propagates cancellation without generating or overwriting a report', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(syncCourseBrief({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
  });
  it('reports disappeared tasks as not returned, never cancelled', async () => {
    const previous = await syncCourseBrief(options);
    const changes = briefChanges(previous, [], [], [{ courseId: 12, area: 'assignments', label: 'Tasks', status: 'complete', detail: '', sourceCount: 0 }]);
    expect(changes[0].kind).toBe('no_longer_returned'); expect(changes[0].after).toContain('不代表已取消');
    expect(briefChanges(previous, [], [], [{ courseId: 12, area: 'assignments', label: 'Tasks', status: 'unavailable', detail: '', sourceCount: 0 }])).toHaveLength(0);
  });
});
