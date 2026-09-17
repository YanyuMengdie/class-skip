import { CanvasRequestError, downloadCanvasFile, requestCanvas, type CanvasCourse, type CanvasFile } from '@/services/canvas';
import { canvasFileAccessProblem } from '@/shared/canvasFileAccess';
import { updateSavedBrief } from './processing';
import { resourceRole } from './lectureFiles';
import { readBriefPdf } from './syllabusPdf';
import { prepareCompactPlans } from './compactPlan';
import { addDays, briefDateKey, canvasDate, validDay, validTimeZone } from './dates';
import { briefDocumentPurpose, briefLinks, briefPagePurpose, resolveBriefFilePurpose, isSyllabusLabel } from './sourcePolicy';
import type { BriefCoverage, BriefItem, BriefSource, BriefSyncOptions, CourseBriefReport, BriefChange, BriefSyllabusStatus } from './types';

type Row = Record<string, any>;

/** One explicit course action, using already-read text; never contacts Canvas. */
export async function organizeSavedSyllabus(report: CourseBriefReport, courseId: number,
  options: Pick<BriefSyncOptions, 'connection' | 'signal' | 'onProgress'>): Promise<CourseBriefReport> {
  const course = report.courses.find(entry => entry.id === courseId);
  const original = report.syllabi?.find(entry => entry.courseId === courseId);
  const sources = report.sources.filter(source => source.courseId === courseId);
  if (!course || !original?.sourceIds.length || !original.sourceIds.every(id => sources.some(source => source.id === id && source.text.trim())))
    throw new Error('本机没有完整保存这门课已读的正文，请先读取大纲。');
  if (new URL(options.connection.canvasUrl).origin !== report.canvasOrigin) throw new Error('学校与来源不一致。');
  const completeText = !original.pageCount || original.sourceIds.length === original.pageCount;
  const result = await prepareCompactPlans({ modeOnly: 'syllabus',
    sync: { ...options, canvasUserId: report.canvasUserId, ownerId: report.ownerId, courses: [course],
      weekStart: report.weekStart, timeZone: report.timeZone, previous: report, forceSyllabusCourseId: courseId }, sources,
    syllabi: [{ ...original, status: completeText ? 'read' : 'read_partial' }],
    knownItems: [], context: [{ courseId, termStart: course.start_at || course.term?.start_at || undefined, termEnd: course.end_at || course.term?.end_at || undefined }],
  });
  aborted(options.signal);
  const schedule = result.schedules[0];
  const previousIds = new Set(report.syllabusSchedules?.filter(entry => entry.courseId === courseId).flatMap(entry => entry.items.map(item => item.id)) || []);
  const retained = report.items.filter(item => !(schedule?.complete && item.courseId === courseId && previousIds.has(item.id)));
  for (const item of result.items) {
    if (!['assignment', 'quiz', 'exam', 'discussion'].includes(item.kind)) continue;
    const matches = retained.filter(task => task.courseId === courseId && task.assignmentId !== undefined
      && normalize(task.title).toLowerCase() === normalize(item.title).toLowerCase());
    if (matches.length === 1) item.relatedAssignmentId = matches[0].assignmentId;
  }
  const combined = retainLearningFiles([...new Map([...retained, ...result.items].map(item => [item.id, item])).values()], report, report.sources);
  const coverage = [...report.coverage.filter(area => area.courseId !== courseId || !['analysis:syllabus', 'scope:syllabus'].includes(area.area)), ...result.coverage];
  return updateSavedBrief({ ...report, pipelineVersion: 2, digestVersion: 1, id: `brief:syllabus:${Date.now()}`, generatedAt: new Date().toISOString(),
    syllabi: report.syllabi?.map(status => status.courseId === courseId ? result.syllabi[0] : status),
    syllabusSchedules: schedule ? [...(report.syllabusSchedules || []).filter(entry => entry.courseId !== courseId), schedule] : report.syllabusSchedules,
    items: mergeCalendarFindings(mergeAssignmentFindings(flagBriefConflicts(combined, report.sources, report.timeZone), report.timeZone), report.timeZone),
    coverage, analysisStatus: coverage.some(area => area.area.startsWith('analysis:') && area.status !== 'complete') ? 'partial' : report.analysisStatus,
    run: result.run });
}

const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const numericId = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return undefined;
  const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const aborted = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消同步', 'AbortError'); };
export const safeCanvasUrl = (value: unknown, origin: string, fallback: string): string => {
  if (!str(value).trim()) return fallback;
  try {
    const url = new URL(str(value), origin);
    if (url.origin === origin && url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Fall back to a known course page. */ }
  return fallback;
};
export function canvasHtmlText(html: string): string {
  const clean = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/t[dh]\s*>/gi, ' | ');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(clean.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n'), 'text/html');
    return (doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  }
  return clean.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

/** A list endpoint must really be a list; error-shaped 200 responses are not empty courses. */
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some(item => !record(item))) throw new Error('invalid_response');
  return value;
}
function sourceId(courseId: number, kind: string, id: number | string) { return `${courseId}:${kind}:${id}`; }
export function assignmentItem(row: Row, source: BriefSource, timeZone: string): BriefItem {
  const date = canvasDate(row.due_at, timeZone);
  const submission = record(row.submission) ? row.submission : {};
  const status = submission.excused === true ? 'excused'
    : submission.redo_request === true ? 'unknown'
    : canvasDate(submission.submitted_at, timeZone) || ['submitted', 'pending_review'].includes(submission.workflow_state) ? 'submitted'
      : submission.workflow_state === 'unsubmitted' ? 'not_submitted' : 'unknown';
  const submissionTypes = Array.isArray(row.submission_types) ? row.submission_types : [];
  const kind = row.is_quiz_assignment || submissionTypes.includes('online_quiz') ? 'quiz'
    : submissionTypes.includes('discussion_topic') ? 'discussion' : 'assignment';
  const issues = row.due_at && !date ? ['Canvas 返回的截止时间格式无法核实，请打开原文。'] : [];
  if (submission.redo_request === true) issues.push('Canvas 标记这项任务需要重新提交，请查看老师要求。');
  if (submission.missing === true && status !== 'submitted' && status !== 'excused') issues.push('Canvas 当前标记为缺交，请核对提交记录。');
  return { id: source.id, courseId: source.courseId, kind, title: str(row.name),
    details: canvasHtmlText(str(row.description)), url: source.url,
    evidence: [{ sourceId: source.id, quote: source.text }], requirement: /\boptional\b|选做|选读/i.test(str(row.name)) ? 'optional' : 'unspecified',
    ...(date ? { date, dateText: str(row.due_at) } : {}), dateStatus: date ? 'confirmed' : row.due_at ? 'needs_confirmation' : 'unspecified',
    dateRole: 'deadline', status, assignmentId: row.id, issues,
    context: !row.due_at && (submissionTypes.includes('none') || /\b(?:final|total|overall|participation)\s*(?:\w+\s*)?(?:grade|score)|成绩汇总|总成绩/i.test(str(row.name))) ? 'reference' : 'action' };
}

/** Document dates never silently override a student's structured Canvas deadline. */
export function flagBriefConflicts(items: BriefItem[], sources: BriefSource[], timeZone: string): BriefItem[] {
  const result = items.map(item => ({ ...item, evidence: [...item.evidence], issues: [...item.issues] }));
  for (const finding of result) {
    const assignmentId = finding.relatedAssignmentId;
    if (!assignmentId || finding.assignmentId === assignmentId || finding.dateRole !== 'deadline') continue;
    const task = result.find(item => item.courseId === finding.courseId && item.assignmentId === assignmentId);
    if (!task) continue;
    const differentDate = task.date && finding.date && briefDateKey(task.date, timeZone) !== briefDateKey(finding.date, timeZone);
    const sameDayDifferentTime = task.date && finding.date && finding.date.precision === 'datetime'
      && Date.parse(task.date.value) !== Date.parse(finding.date.value);
    // Only an independently verified deadline for the same task can conflict with its API due date.
    if (differentDate || sameDayDifferentTime) {
      const message = '相关课程文字与 Canvas 任务日期需要核对；两处信息都已保留，未自动覆盖。';
      task.dateStatus = 'conflict'; finding.dateStatus = 'conflict';
      task.issues.push(message); finding.issues.push(message);
      for (const evidence of finding.evidence) if (!task.evidence.some(e => e.sourceId === evidence.sourceId && e.quote === evidence.quote)) task.evidence.push(evidence);
    }
  }
  return result;
}

/** A verified description of the same assignment is evidence, not a second task. */
export function mergeAssignmentFindings(items: BriefItem[], timeZone: string): BriefItem[] {
  const result = items.map(item => ({ ...item, evidence: [...item.evidence], issues: [...item.issues] }));
  const merged = new Set<string>();
  for (const finding of result) {
    if (finding.assignmentId !== undefined || finding.relatedAssignmentId === undefined || !['assignment', 'quiz', 'discussion', 'exam'].includes(finding.kind)
      || finding.context === 'conditional' || finding.context === 'reference') continue;
    const task = result.find(item => item.courseId === finding.courseId && item.assignmentId === finding.relatedAssignmentId);
    if (!task) continue;
    const conflict = task.dateStatus === 'conflict' || finding.dateStatus === 'conflict';
    const sameDate = task.date && finding.date && finding.dateStatus === 'confirmed' && finding.dateRole === 'deadline'
      && briefDateKey(task.date, timeZone) === briefDateKey(finding.date, timeZone)
      && (finding.date.precision === 'date' || Date.parse(task.date.value) === Date.parse(finding.date.value));
    const missingDate = !task.date && task.dateStatus === 'unspecified' && finding.date && finding.dateStatus === 'confirmed' && finding.dateRole === 'deadline';
    if (!conflict && !missingDate && (finding.dateText && !sameDate || !finding.dateText && finding.dateStatus !== 'unspecified')) continue;
    for (const evidence of finding.evidence) if (!task.evidence.some(e => e.sourceId === evidence.sourceId && e.quote === evidence.quote)) task.evidence.push(evidence);
    if (normalize(finding.details) && !normalize(task.details).includes(normalize(finding.details))) task.details += `${task.details ? '\n\n' : ''}材料补充：${finding.details}`;
    if (missingDate) { task.date = finding.date; task.dateText = finding.dateText; task.dateStatus = 'confirmed'; }
    if (conflict) task.dateStatus = 'conflict';
    if (finding.kind === 'exam') task.kind = 'exam';
    if (task.requirement === 'unspecified') task.requirement = finding.requirement;
    else if (finding.requirement !== 'unspecified' && finding.requirement !== task.requirement) {
      task.requirement = 'unspecified'; task.issues.push('不同来源对是否必做的说法不一致，请核对原文。');
    }
    task.issues = [...new Set([...task.issues, ...finding.issues])];
    task.digest ||= finding.digest;
    if (task.assessmentWeight && finding.assessmentWeight && task.assessmentWeight.percent !== finding.assessmentWeight.percent) {
      task.assessmentWeight = undefined; task.issues.push('评分占比来源冲突，未采用单项占比。');
    } else task.assessmentWeight ||= finding.assessmentWeight;
    task.evidenceCheck ||= finding.evidenceCheck;
    merged.add(finding.id);
  }
  return result.filter(item => !merged.has(item.id));
}

/** A verified explanation of one calendar event enriches that event, rather than duplicating it. */
export function mergeCalendarFindings(items: BriefItem[], timeZone: string): BriefItem[] {
  const result = items.map(item => ({ ...item, evidence: [...item.evidence], issues: [...item.issues] }));
  const removed = new Set<string>();
  for (const event of result.filter(item => item.id.includes(':calendar:') && item.assignmentId === undefined && item.dateStatus === 'confirmed' && item.date)) {
    const matches = result.filter(item => item.courseId === event.courseId && item.id.startsWith('doc-') && item.assignmentId === undefined && item.relatedAssignmentId === undefined
      && item.context !== 'reference' && item.context !== 'conditional' && item.dateStatus === 'confirmed' && item.dateRole === 'start' && item.date
      && item.evidence.some(e => e.sourceId === event.id) && briefDateKey(item.date!, timeZone) === briefDateKey(event.date!, timeZone)
      && (item.date!.precision === 'date' || Date.parse(item.date!.value) === Date.parse(event.date!.value))
      && (item.kind === event.kind || event.kind === 'notice' && ['lecture', 'exam', 'notice'].includes(item.kind)));
    if (matches.length !== 1) continue;
    const finding = matches[0];
    event.kind = finding.kind; event.title = finding.title; event.url = finding.url;
    event.digest ||= finding.digest;
    event.evidenceCheck ||= finding.evidenceCheck;
    if (finding.requirement !== 'unspecified') event.requirement = finding.requirement;
    if (!normalize(event.details).includes(normalize(finding.details))) event.details += `\n\n材料补充：${finding.details}`;
    for (const evidence of finding.evidence) if (!event.evidence.some(e => e.sourceId === evidence.sourceId && e.quote === evidence.quote)) event.evidence.push(evidence);
    removed.add(finding.id);
  }
  return result.filter(item => !removed.has(item.id));
}

export function briefChanges(previous: CourseBriefReport | undefined, sources: BriefSource[], items: BriefItem[], coverage: BriefCoverage[]): BriefChange[] {
  if (!previous) return [];
  const changes: BriefChange[] = [];
  const oldSources = new Map(previous.sources.map(source => [source.id, source]));
  const currentSources = new Map(sources.map(source => [source.id, source]));
  const oldItems = new Map(previous.items.filter(item => item.assignmentId !== undefined).map(item => [item.id, item]));
  for (const item of items.filter(item => item.assignmentId !== undefined)) {
    const old = oldItems.get(item.id);
    if (!old) changes.push({ id: `added:${item.id}`, courseId: item.courseId, kind: 'added', title: item.title, after: '新增 Canvas 任务', url: item.url });
    else if (old.date?.value !== item.date?.value || oldSources.get(item.id)?.text !== currentSources.get(item.id)?.text || old.status !== item.status || old.title !== item.title) {
      changes.push({ id: `changed:${item.id}`, courseId: item.courseId, kind: 'changed', title: item.title,
        before: `${old.date?.raw || '未设置截止时间'} · ${old.status}`, after: `${item.date?.raw || '未设置截止时间'} · ${item.status}；说明或状态已更新`, url: item.url });
    }
  }
  for (const source of sources.filter(source => source.kind !== 'assignment')) {
    const old = oldSources.get(source.id);
    if (!old || old.text !== source.text) changes.push({ id: `source:${source.id}`, courseId: source.courseId,
      kind: old ? 'changed' : 'added', title: source.title, after: old ? '原文内容发生变化，请查看来源' : '新读取到的课程资料', url: source.url });
  }
  for (const old of oldItems.values()) if (!items.some(item => item.id === old.id)
    && coverage.some(c => c.courseId === old.courseId && c.area === 'assignments' && c.status === 'complete')) {
    changes.push({ id: `absent:${old.id}`, courseId: old.courseId, kind: 'no_longer_returned', title: old.title,
      after: '本次 Canvas 未返回；不代表已取消，请核对原任务', url: old.url });
  }
  return changes;
}

export async function syncCourseBrief(options: BriefSyncOptions): Promise<CourseBriefReport> {
  const { connection, courses, signal, timeZone, weekStart } = options;
  if (!courses.length || courses.length > 12 || !validDay(weekStart) || !validTimeZone(timeZone)) throw new Error('请选择 1–12 门课程、有效日期与时区。');
  if (new Set(courses.map(course => course.id)).size !== courses.length) throw new Error('课程选择重复，请重新选择。');
  const origin = new URL(connection.canvasUrl).origin;
  const previous = options.previous?.ownerId === options.ownerId && options.previous.canvasOrigin === origin
    && options.previous.canvasUserId === options.canvasUserId ? options.previous : undefined;
  const fetchedAt = new Date().toISOString();
  const sources: BriefSource[] = [];
  const knownItems: BriefItem[] = [];
  const coverage: BriefCoverage[] = [];
  const syllabi: BriefSyllabusStatus[] = [];
  const courseContexts: Array<{ courseId: number; termStart?: string; termEnd?: string }> = [];
  const deferredAnalysis = new Set<string>();
  let totalChars = 0;
  const track = (courseId: number, area: string, label: string, status: BriefCoverage['status'], detail: string, sourceCount = 0) => {
    coverage.push({ courseId, area, label, status, detail, sourceCount });
  };
  const putSource = (source: BriefSource): boolean => {
    source.text = source.text.trim();
    source.readMode ??= 'content';
    if (!source.text || sources.some(s => s.id === source.id)) return false;
    if (source.text.length > 120_000 || totalChars + source.text.length > 900_000) {
      track(source.courseId, `size:${source.id}`, source.title, 'partial', '资料文字较多，本次未完整分析；请直接查看来源。');
      return false;
    }
    totalChars += source.text.length; sources.push(source); return true;
  };
  const get = async (courseId: number, area: string, label: string, path: string, list = true): Promise<Row[] | Row | undefined> => {
    aborted(signal);
    try {
      const raw: unknown = await requestCanvas(connection, path, { signal });
      aborted(signal);
      const data = list ? rows(raw) : record(raw) ? raw : (() => { throw new Error('invalid_response'); })();
      track(courseId, area, label, 'complete', '已读取当前账户可访问的内容', Array.isArray(data) ? data.length : 1);
      return data;
    } catch (error) {
      aborted(signal);
      track(courseId, area, label, 'unavailable', error instanceof CanvasRequestError
        ? error.status === 404 ? 'Canvas 返回 404：该文件或入口不存在，或当前账号不可见。'
          : error.status === 403 ? 'Canvas 返回 403：当前账号无权读取这个入口。'
            : `请求失败：${error.message}`
        : '请求未完成：连接或返回内容异常；这不表示没有安排。');
      return undefined;
    }
  };
  const currentCourses: CanvasCourse[] = [];
  for (const selected of courses) {
    aborted(signal); options.onProgress?.(`正在读取 ${selected.course_code || selected.name} 的课程安排…`);
    const cid = selected.id, base = `/api/v1/courses/${cid}`, home = `${origin}/courses/${cid}`;
    const detail = await get(cid, 'course', '课程与 syllabus', `${base}?include[]=syllabus_body&include[]=term`, false) as Row | undefined;
    const course: CanvasCourse = { ...selected, ...(detail ? { time_zone: str(detail.time_zone) || selected.time_zone,
      start_at: detail.start_at ?? selected.start_at, end_at: detail.end_at ?? selected.end_at,
      term: record(detail.term) ? detail.term as CanvasCourse['term'] : selected.term } : {}) };
    currentCourses.push(course);
    const explicitSyllabus = options.syllabusSelections?.find(selection => selection.courseId === cid);
    const syllabusHtml = str(detail?.syllabus_body);
    const linkedFiles = new Map<number, { labels: Set<string>; allowInstructions: boolean }>();
    const linkedPages = new Map<string, string>();
    const linkedExternal = new Set<string>();
    const fileReference = (id: number, label: string, allowInstructions = true) => {
      const reference = linkedFiles.get(id) ?? { labels: new Set<string>(), allowInstructions: false };
      reference.labels.add(label); reference.allowInstructions ||= allowInstructions;
      linkedFiles.set(id, reference);
    };
    const fileLinks = (html: string, allowInstructions = true, currentUrl = home) => {
      for (const link of briefLinks(html, currentUrl, cid)) {
        if (link.fileId) fileReference(link.fileId, link.label, allowInstructions);
        if (link.pageSlug && briefPagePurpose(link.label || link.pageSlug) !== 'catalog') linkedPages.set(link.pageSlug, link.label || link.pageSlug);
        if (link.external && briefDocumentPurpose(link.label) !== 'catalog') linkedExternal.add(link.url);
      }
    };
    const arrangementText = (html: string, currentUrl = home) => {
      const links = briefLinks(html, currentUrl, cid);
      return [canvasHtmlText(html), links.length ? `资料链接（仅有链接不代表本周必读）：\n${links.map(link => `${link.label || '链接'}：${link.url}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
    };
    const taskWithinWindow = (row: Row) => {
      const date = canvasDate(row.due_at, timeZone);
      return !date || row.submission?.missing === true || (briefDateKey(date, timeZone) >= weekStart && briefDateKey(date, timeZone) < addDays(weekStart, 21));
    };
    fileLinks(syllabusHtml);
    if (syllabusHtml.trim()) putSource({ id: sourceId(cid, 'syllabus', cid), courseId: cid, kind: 'syllabus', title: `${selected.course_code || selected.name} · Syllabus`,
      url: `${home}/assignments/syllabus`, text: arrangementText(syllabusHtml), fetchedAt, documentId: `canvas-syllabus:${cid}` });
    const termStart = str(detail?.start_at) || str(detail?.term?.start_at) || str(selected.term?.start_at);
    const termEnd = str(detail?.end_at) || str(detail?.term?.end_at) || str(selected.term?.end_at);
    courseContexts.push({ courseId: cid, termStart, termEnd });
    const start = canvasDate(termStart, timeZone) ? termStart.slice(0, 10) : addDays(weekStart, -370);
    if (!canvasDate(termStart, timeZone)) track(cid, 'term', '公告检索范围', 'partial', '课程没有明确学期起点；本次检索所选周之前 370 天至今天的公告。更早公告未核对。');
    const [assignmentRows, announcementRows, moduleRows, pageRows, fileRows, calendarRows, discussionRows, quizRows, calendarAssignmentRows] = await Promise.all([
      get(cid, 'assignments', '作业与关联测验', `${base}/assignments?include[]=submission&per_page=100`),
      get(cid, 'announcements', '课程公告', `/api/v1/announcements?context_codes[]=course_${cid}&start_date=${start}&end_date=${encodeURIComponent(fetchedAt)}&per_page=100`),
      get(cid, 'modules', '课程模块', `${base}/modules?per_page=100`),
      get(cid, 'pages', '课程页面目录', `${base}/pages?per_page=100`),
      get(cid, 'files', '课程文件目录', `${base}/files?per_page=100`),
      get(cid, 'calendar', '课程日历', `/api/v1/calendar_events?context_codes[]=course_${cid}&type=event&start_date=${addDays(weekStart, -7)}&end_date=${addDays(weekStart, 21)}&per_page=100`),
      get(cid, 'discussions', '讨论与回复要求', `${base}/discussion_topics?per_page=100`),
      get(cid, 'quizzes', '独立测验与问卷', `${base}/quizzes?per_page=100`),
      get(cid, 'calendar_assignments', '日历中的作业截止', `/api/v1/calendar_events?context_codes[]=course_${cid}&type=assignment&start_date=${weekStart}&end_date=${addDays(weekStart, 21)}&per_page=100`),
    ]) as Array<Row[] | undefined>;
    for (const row of assignmentRows ?? []) {
      if (!Number.isSafeInteger(row.id) || !str(row.name)) { track(cid, 'invalid_assignment', '作业资料', 'partial', '有任务缺少名称或标识，未纳入清单。'); continue; }
      fileLinks(str(row.description), taskWithinWindow(row));
      const text = [`名称：${row.name}`, `截止时间（Canvas，适用于当前账户）：${str(row.due_at) || '未设置'}`,
        `开放时间：${str(row.unlock_at) || '未设置'}`, `提交入口关闭时间：${str(row.lock_at) || '未设置'}`,
        `提交方式：${Array.isArray(row.submission_types) ? row.submission_types.join(', ') : '未设置'}`,
        Array.isArray(row.allowed_extensions) && row.allowed_extensions.length ? `允许文件类型：${row.allowed_extensions.join(', ')}` : '',
        arrangementText(str(row.description))].filter(Boolean).join('\n');
      const source: BriefSource = { id: sourceId(cid, 'assignment', row.id), courseId: cid, kind: 'assignment', title: row.name,
        url: safeCanvasUrl(row.html_url, origin, `${home}/assignments/${row.id}`), text, fetchedAt, updatedAt: str(row.updated_at), assignmentId: row.id };
      if (putSource(source)) knownItems.push(assignmentItem(row, source, timeZone));
      if (!taskWithinWindow(row)) deferredAnalysis.add(source.id);
    }
    for (const row of quizRows ?? []) {
      if (!Number.isSafeInteger(row.id) || !str(row.title)) { track(cid, 'invalid_quiz', '测验资料', 'partial', '有测验缺少名称或标识，未纳入清单。'); continue; }
      fileLinks(str(row.description), taskWithinWindow(row));
      const source: BriefSource = { id: sourceId(cid, 'quiz', row.id), courseId: cid, kind: 'quiz', title: row.title,
        url: safeCanvasUrl(row.html_url, origin, `${home}/quizzes/${row.id}`), fetchedAt,
        text: `名称：${row.title}\n测验类型：${str(row.quiz_type)}\n截止时间（Canvas）：${str(row.due_at) || '未设置'}\n${arrangementText(str(row.description))}`,
        assignmentId: Number.isSafeInteger(row.assignment_id) ? row.assignment_id : undefined };
      if (!putSource(source)) continue;
      if (!taskWithinWindow(row)) deferredAnalysis.add(source.id);
      if (Number.isSafeInteger(row.assignment_id) && knownItems.some(item => item.courseId === cid && item.assignmentId === row.assignment_id)) continue;
      const item = assignmentItem({ ...row, name: row.title, submission_types: ['online_quiz'] }, source, timeZone);
      // Ungraded quizzes have no assignment ID or current-user submission response here.
      knownItems.push({ ...item, assignmentId: source.assignmentId, status: 'unknown' });
    }
    for (const row of announcementRows ?? []) {
      fileLinks(str(row.message));
      putSource({ id: sourceId(cid, 'announcement', row.id), courseId: cid, kind: 'announcement', title: str(row.title) || '课程公告',
        url: safeCanvasUrl(row.html_url, origin, `${home}/discussion_topics/${row.id}`), text: `${str(row.title)}\n${arrangementText(str(row.message))}`,
        fetchedAt, updatedAt: str(row.updated_at), publishedAt: str(row.posted_at) });
    }
    for (const row of discussionRows ?? []) {
      fileLinks(str(row.message));
      putSource({ id: sourceId(cid, 'discussion', row.id), courseId: cid, kind: 'discussion', title: str(row.title) || '课程讨论',
        url: safeCanvasUrl(row.html_url, origin, `${home}/discussion_topics/${row.id}`), text: `${str(row.title)}\n${arrangementText(str(row.message))}`,
        fetchedAt, updatedAt: str(row.updated_at), assignmentId: Number.isSafeInteger(row.assignment_id) ? row.assignment_id : Number.isSafeInteger(row.assignment?.id) ? row.assignment.id : undefined });
    }
    const belongsToCourseCalendar = (row: Row) => row.workflow_state !== 'deleted' && row.hidden !== true
      && (!row.effective_context_code && !row.context_code || (row.effective_context_code || row.context_code) === `course_${cid}`);
    for (const row of calendarAssignmentRows ?? []) {
      if (!belongsToCourseCalendar(row) || !str(row.title)) continue;
      const match = str(row.id).match(/^assignment_(\d+)$/);
      const assignmentId = match ? Number(match[1]) : undefined;
      if (!Number.isSafeInteger(assignmentId) || !assignmentId || record(row.assignment) && row.assignment.id !== assignmentId) continue;
      const rawAssignment = record(row.assignment) ? row.assignment : {};
      const normalized = { ...rawAssignment, id: assignmentId, name: str(rawAssignment.name) || row.title,
        description: str(row.description) || str(rawAssignment.description), due_at: str(row.start_at) || str(rawAssignment.due_at) };
      fileLinks(normalized.description, taskWithinWindow(normalized));
      const source: BriefSource = { id: sourceId(cid, 'calendar', row.id), courseId: cid, kind: 'calendar', title: row.title,
        assignmentId, url: safeCanvasUrl(row.html_url, origin, `${home}/assignments/${assignmentId}`),
        text: `名称：${row.title}\n截止时间（Canvas 日历，适用于当前账户）：${normalized.due_at || '未设置'}\n${arrangementText(normalized.description)}`,
        fetchedAt, updatedAt: str(row.updated_at) };
      if (!putSource(source)) continue;
      const entry = assignmentItem(normalized, source, timeZone);
      const existing = knownItems.find(item => item.courseId === cid && item.assignmentId === assignmentId);
      if (existing) {
        existing.evidence.push(...entry.evidence);
        if (entry.date && existing.date && Date.parse(entry.date.value) !== Date.parse(existing.date.value)) {
          existing.dateStatus = 'conflict'; existing.issues.push('Canvas 日历与作业页面的截止时间不同，请核对；两处原文均已保留。');
        } else if (entry.date && !existing.date && existing.dateStatus === 'unspecified') {
          existing.date = entry.date; existing.dateText = entry.dateText; existing.dateStatus = 'confirmed';
        }
      } else knownItems.push({ ...entry, id: sourceId(cid, 'assignment', assignmentId) });
    }
    for (const row of calendarRows ?? []) {
      if (!belongsToCourseCalendar(row) || !str(row.title) || !Number.isSafeInteger(row.id)) continue;
      const startText = row.all_day === true ? str(row.all_day_date) : str(row.start_at);
      const date = row.all_day === true && validDay(str(row.all_day_date))
        ? { value: row.all_day_date, precision: 'date' as const, origin: 'canvas' as const, raw: row.all_day_date, timeZone }
        : canvasDate(row.start_at, timeZone);
      const source: BriefSource = { id: sourceId(cid, 'calendar', row.id), courseId: cid, kind: 'calendar', title: row.title,
        url: safeCanvasUrl(row.html_url, origin, `${origin}/calendar?include_contexts=course_${cid}`),
        text: `名称：${row.title}\n开始：${startText || '未设置'}\n结束：${str(row.end_at) || '未设置'}\n地点：${str(row.location_name)}\n${arrangementText(str(row.description))}`,
        fetchedAt, updatedAt: str(row.updated_at) };
      const kind: BriefItem['kind'] = /\b(?:lecture|lec)\s*\d+\b|(?:^|\s)L\d+\b|第\s*\d+\s*讲/i.test(row.title) ? 'lecture'
        : /\b(?:exam|midterm|final exam)\b|考试|期中考|期末考/i.test(row.title) ? 'exam' : 'notice';
      if (putSource(source)) knownItems.push({ id: source.id, courseId: cid, kind, context: 'action', title: row.title, details: canvasHtmlText(str(row.description)),
        url: source.url, evidence: [{ sourceId: source.id, quote: source.text }], requirement: 'unspecified', date,
        dateText: startText, dateRole: 'start', dateStatus: date ? 'confirmed' : startText ? 'needs_confirmation' : 'unspecified', status: 'unknown', issues: [] });
    }
    const accessible = (row: Row) => row.published !== false && !row.locked_for_user && !row.hidden_for_user
      && (row.course_id == null || Number(row.course_id) === cid);
    const files = (fileRows ?? []).filter(row => !canvasFileAccessProblem(row)
      && (row.course_id == null || Number(row.course_id) === cid))
      .map(row => ({ ...row, id: numericId(row.id) })).filter(row => Number.isSafeInteger(row.id)) as CanvasFile[];
    const filesById = new Map(files.map(file => [file.id, file]));
    for (const file of files) if (briefDocumentPurpose(file.display_name || file.filename) === 'schedule') fileReference(file.id, file.display_name || file.filename);
    const modules = (moduleRows ?? []).filter(accessible);
    const directoryOnlyFiles = new Map<number, string>();
    if (modules.length > 80) track(cid, 'module_limit', '课程模块', 'partial', '模块超过单次读取上限，剩余内容未核对。');
    for (const module of modules.slice(0, 80)) {
      if (!Number.isSafeInteger(module.id)) continue;
      const rawItems = await get(cid, `module:${module.id}`, str(module.name) || '课程模块', `${base}/modules/${module.id}/items?per_page=100`) as Row[] | undefined;
      if (!rawItems) continue;
      const items = rawItems.filter(accessible);
      const text = `${str(module.name)}\n${items.map(item => {
        const url = item.type === 'File' && Number.isSafeInteger(item.content_id) ? `${home}/files/${item.content_id}`
          : item.type === 'ExternalUrl' && /^https?:\/\//.test(str(item.external_url)) ? str(item.external_url)
            : safeCanvasUrl(item.html_url, origin, `${home}/modules`);
        return `${item.type}: ${str(item.title)} · ${url}`;
      }).join('\n')}`;
      putSource({ id: sourceId(cid, 'module', module.id), courseId: cid, kind: 'module', title: str(module.name), url: `${home}/modules`, text, fetchedAt });
      for (const item of items) {
        if ((item.type === 'ExternalUrl' || item.type === 'ExternalTool') && briefDocumentPurpose(str(item.title)) !== 'catalog') linkedExternal.add(str(item.external_url) || str(item.title));
        if (item.type === 'Page' && str(item.page_url) && briefPagePurpose(str(item.title) || item.page_url) !== 'catalog') linkedPages.set(item.page_url, item.title);
        if (item.type !== 'File' || !Number.isSafeInteger(item.content_id)) continue;
        const file = filesById.get(item.content_id);
        const title = file?.display_name || str(item.title);
        fileReference(item.content_id, title);
        if (str(item.title)) fileReference(item.content_id, item.title);
      }
    }
    const pages = (pageRows ?? []).filter(accessible);
    for (const page of pages) if (str(page.url) && briefPagePurpose(str(page.title) || page.url) !== 'catalog') linkedPages.set(page.url, page.title);
    const visitedPages = new Set<string>();
    const readPage = async (slug?: string) => {
      if (slug && visitedPages.has(slug)) return;
      if (slug) visitedPages.add(slug);
      const row = await get(cid, slug ? `page:${slug}` : 'front_page', slug ? linkedPages.get(slug) || '课程安排页面' : '课程首页', slug ? `${base}/pages/${encodeURIComponent(slug)}` : `${base}/front_page`, false) as Row | undefined;
      if (!row || !accessible(row)) return;
      if (str(row.url)) visitedPages.add(row.url);
      const url = safeCanvasUrl(row.html_url, origin, slug ? `${home}/pages/${encodeURIComponent(slug)}` : home);
      fileLinks(str(row.body), true, url);
      if (str(row.title) && briefPagePurpose(row.title) === 'catalog') {
        track(cid, `page_body:${slug || 'front_page'}`, row.title, 'skipped', '页面实际为教学内容，仅保留其中明确指向课程安排的链接，正文不参与周报分析。');
        return;
      }
      putSource({ id: sourceId(cid, 'page', row.page_id || slug || 'front_page'), courseId: cid, kind: 'page', title: str(row.title) || '课程首页',
        url, text: `${str(row.title)}\n${arrangementText(str(row.body), url)}`, fetchedAt, updatedAt: str(row.updated_at),
        documentId: `canvas-page:${row.page_id || slug || 'front_page'}`, ...(isSyllabusLabel(str(row.title)) ? { documentRole: 'syllabus' as const } : {}) });
    };
    // A hidden Pages/Files index can still expose the syllabus through the accessible course home.
    await readPage();
    if (coverage.find(c => c.courseId === cid && c.area === 'front_page')?.status === 'unavailable' && pageRows !== undefined) {
      const area = coverage.find(c => c.courseId === cid && c.area === 'front_page')!;
      area.status = 'skipped'; area.detail = '未取得独立首页；已从可访问的课程页面目录定位安排。';
    }
    let pageCount = 0;
    while (pageCount < 30) {
      const next = [...linkedPages].filter(([slug]) => !visitedPages.has(slug))
        .sort((a, b) => Number(briefPagePurpose(a[1]) === 'directory') - Number(briefPagePurpose(b[1]) === 'directory'))[0];
      if (!next) break;
      pageCount++; await readPage(next[0]);
    }
    if ([...linkedPages.keys()].some(slug => !visitedPages.has(slug))) track(cid, 'page_limit', '课程安排页面', 'partial', '安排页面超过单次读取上限，剩余页面未核对。');
    const skippedPages = pages.filter(page => !visitedPages.has(page.url));
    if (skippedPages.length) track(cid, 'teaching_pages', '其他教学页面', 'skipped', '本周简报仅读取安排页面；教学正文不在读取范围内。', skippedPages.length);
    if (linkedExternal.size) track(cid, 'external', '外部课程安排链接', 'partial', `${linkedExternal.size} 个明确标注为大纲、日程或任务说明的外部链接需在 Canvas 打开核对；文章正文链接不计入缺口。`);

    // Locate the syllabus explicitly before deciding which PDF bodies to read.
    if (explicitSyllabus?.kind === 'canvas') fileReference(explicitSyllabus.fileId, explicitSyllabus.title);
    const syllabusCandidates = [...linkedFiles].filter(([id, reference]) => {
      const file = filesById.get(id);
      return isSyllabusLabel(file?.display_name || file?.filename || '') || [...reference.labels].some(isSyllabusLabel)
        || explicitSyllabus?.kind === 'canvas' && explicitSyllabus.fileId === id;
    }).map(([fileId, reference]) => ({ fileId, title: filesById.get(fileId)?.display_name || filesById.get(fileId)?.filename || [...reference.labels][0] || `课程大纲 ${fileId}`, url: `${home}/files/${fileId}` }));
    const selectedSyllabusId = explicitSyllabus?.kind === 'canvas' ? explicitSyllabus.fileId
      : !explicitSyllabus && syllabusCandidates.length === 1 ? syllabusCandidates[0].fileId : undefined;
    const inlineSyllabi = sources.filter(source => source.courseId === cid && (source.kind === 'syllabus' || source.documentRole === 'syllabus')
      && source.text.length >= 300 && /schedule|week\s+date|lecture\s+time|evaluation|grading|课程安排|课程大纲|评分/i.test(source.text));
    const syllabusStatus: BriefSyllabusStatus = { courseId: cid, status: 'not_found', sourceIds: [], candidates: syllabusCandidates,
      availablePdfs: files.filter(file => file['content-type'] === 'application/pdf' || /\.pdf$/i.test(file.display_name || file.filename))
        .map(file => ({ fileId: file.id, title: file.display_name || file.filename, url: `${home}/files/${file.id}` })),
      detail: '尚未定位到可读取的大纲。可以指定 Canvas 中的大纲，或上传本地 PDF；其他已知任务仍会整理。' };
    syllabi.push(syllabusStatus);
    if (explicitSyllabus?.kind === 'upload') {
      syllabusStatus.title = explicitSyllabus.title;
      syllabusStatus.pageCount = explicitSyllabus.pages.length;
      if (!explicitSyllabus.pages.length || explicitSyllabus.pages.length > 300 || explicitSyllabus.pages.reduce((sum, page) => sum + page.length, 0) > 900_000) {
        syllabusStatus.status = 'read_failed'; syllabusStatus.detail = '上传的大纲内容为空或过大，请重新选择课程大纲 PDF。';
      } else {
        for (const [index, page] of explicitSyllabus.pages.entries()) {
          const id = sourceId(cid, 'local-syllabus', `${explicitSyllabus.documentId}:${index + 1}`);
          if (page.trim().length >= 12 && putSource({ id, courseId: cid, kind: 'syllabus', title: `${explicitSyllabus.title} · 第 ${index + 1} 页`,
            url: '', text: page, fetchedAt, page: index + 1, updatedAt: explicitSyllabus.selectedAt, documentRole: 'syllabus', documentId: explicitSyllabus.documentId })) syllabusStatus.sourceIds.push(id);
        }
        syllabusStatus.status = syllabusStatus.sourceIds.length === explicitSyllabus.pages.length ? 'read' : syllabusStatus.sourceIds.length ? 'read_partial' : 'read_failed';
        syllabusStatus.detail = syllabusStatus.status === 'read' ? `已读取上传的大纲 ${explicitSyllabus.pages.length} 页，准备整理课表。` : '大纲有空白或不可读页面，尚未确认完整读取。';
      }
    } else if (selectedSyllabusId !== undefined) {
      syllabusStatus.fileId = selectedSyllabusId;
      syllabusStatus.title = syllabusCandidates.find(candidate => candidate.fileId === selectedSyllabusId)?.title;
      syllabusStatus.status = 'read_failed'; syllabusStatus.detail = '已找到大纲，但正文尚未成功读取。';
    } else if (syllabusCandidates.length > 1) {
      syllabusStatus.status = 'needs_selection'; syllabusStatus.detail = '找到多份可能的大纲，请指定本学期使用的版本，再整理课表。';
    } else if (inlineSyllabi.length) {
      syllabusStatus.title = inlineSyllabi.map(source => source.title).join('、');
      syllabusStatus.status = 'read'; syllabusStatus.detail = '已读取 Canvas 大纲页面，准备整理课表。';
      for (const source of inlineSyllabi) { source.documentRole = 'syllabus'; syllabusStatus.sourceIds.push(source.id); }
    }
    // Unselected syllabus versions must not leak back into general extraction.
    for (const source of sources.filter(source => source.courseId === cid && (source.kind === 'syllabus' || source.documentRole === 'syllabus'))) {
      if (!syllabusStatus.sourceIds.includes(source.id)) source.readMode = 'catalog';
    }

    const catalogFile = (fileId: number, title: string) => {
      directoryOnlyFiles.set(fileId, title);
      putSource({ id: sourceId(cid, 'resource', `file:${fileId}`), courseId: cid, kind: 'module', title,
        url: `${home}/files/${fileId}`, text: `材料：${title}\n链接：${home}/files/${fileId}\n仅保留名称与链接；正文不读取。是否本周安排以课程日程、模块或公告的明确要求为准。`,
        fetchedAt, fileId, readMode: 'catalog', updatedAt: filesById.get(fileId)?.updated_at,
        resourceRole: resourceRole(title, fileId === selectedSyllabusId || syllabusCandidates.some(entry => entry.fileId === fileId) ? 'syllabus' : undefined),
        linkedFrom: [...(linkedFiles.get(fileId)?.labels || [])] });
    };
    // Files API is a metadata catalogue, not permission to download every PDF.
    for (const file of files) if (file['content-type'] === 'application/pdf' || /\.pdf$/i.test(file.display_name || file.filename))
      catalogFile(file.id, file.display_name || file.filename);
    // Classify before applying a download limit, so lecture lists cannot crowd out a syllabus.
    const candidates: Array<{ id: number; purpose: 'schedule' | 'instructions'; labels: string[] }> = [];
    for (const [id, reference] of linkedFiles) {
      const file = filesById.get(id), labels = [...reference.labels];
      if (syllabusCandidates.some(candidate => candidate.fileId === id) && id !== selectedSyllabusId) {
        catalogFile(id, file?.display_name || file?.filename || labels[0] || `资料 ${id}`); continue;
      }
      const purpose = id === selectedSyllabusId ? 'schedule' : resolveBriefFilePurpose(file?.display_name || file?.filename || '', labels);
      if (purpose === 'catalog' || purpose === 'instructions' && !reference.allowInstructions) { catalogFile(id, file?.display_name || file?.filename || labels[0] || `资料 ${id}`); continue; }
      candidates.push({ id, purpose, labels });
    }
    candidates.sort((a, b) => Number(b.id === selectedSyllabusId) - Number(a.id === selectedSyllabusId) || Number(a.purpose !== 'schedule') - Number(b.purpose !== 'schedule'));
    if (candidates.length > 30) track(cid, 'attachment_limit', '大纲、日程与任务说明', 'partial', '安排附件超过单次读取上限；优先读取大纲和日程，剩余说明未核对。');
    for (const candidate of candidates.slice(0, 30)) {
      const fileId = candidate.id;
      const isSelectedSyllabus = fileId === selectedSyllabusId;
      aborted(signal);
      let file = filesById.get(fileId);
      if (!file) file = await get(cid, `filemeta:${fileId}`, '关联附件信息', `/api/v1/files/${fileId}`, false) as CanvasFile | undefined;
      if (!file) {
        if (isSelectedSyllabus) syllabusStatus.detail = `大纲文件信息未读到：${coverage.find(area => area.courseId === cid && area.area === `filemeta:${fileId}`)?.detail || 'Canvas 未返回附件信息。'} 可上传本地大纲继续整理。`;
        continue;
      }
      const label = file.display_name || file.filename || `附件 ${fileId}`;
      if (isSelectedSyllabus) syllabusStatus.title = label;
      const returnedId = numericId(file.id);
      const linkedInCourse = linkedFiles.has(fileId);
      const accessProblem = canvasFileAccessProblem(file);
      const failure = returnedId === undefined ? 'Canvas 返回的附件编号格式无效。'
        : returnedId !== fileId ? 'Canvas 返回的附件编号与请求不一致。'
        : accessProblem ? accessProblem
        : file.course_id != null && Number(file.course_id) !== cid && !linkedInCourse ? '附件属于其他课程，当前课程没有明确链接，未下载。' : undefined;
      if (failure) {
        if (isSelectedSyllabus) syllabusStatus.detail = `${failure}尚未下载大纲正文，可上传本地大纲继续整理。`;
        track(cid, `file:${fileId}`, label, 'unavailable', failure); continue;
      }
      file = { ...file, id: returnedId! };
      filesById.set(fileId, file);
      if (!isSelectedSyllabus && resolveBriefFilePurpose(label, candidate.labels) === 'catalog') { catalogFile(fileId, label); continue; }
      if (!(file['content-type'] === 'application/pdf' || /\.pdf$/i.test(label))) {
        if (isSelectedSyllabus) syllabusStatus.detail = '已找到大纲附件，但它不是 PDF，目前未提取正文；请上传 PDF 版本。';
        track(cid, `file:${fileId}`, label, 'partial', '这份安排附件不是 PDF，正文尚未核对；请打开 Canvas 查看。'); continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        if (isSelectedSyllabus) syllabusStatus.detail = '大纲附件超过 25 MB，尚未下载正文；请上传小于 25 MB 的大纲 PDF。';
        track(cid, `file:${fileId}`, label, 'partial', '附件超过 25 MB，本次未读取。'); continue;
      }
      const cached = previous?.scopeVersion === 4 && file.updated_at
        && previous.coverage.some(area => area.courseId === cid && area.area === `file:${fileId}` && area.status === 'complete')
        ? previous.sources.filter(source => source.courseId === cid && source.fileId === fileId && source.kind === 'file' && !source.id.includes(':fragment:')) : [];
      if (cached.length && cached.every(source => source.updatedAt === file!.updated_at && source.readMode === 'content')) {
        const count = cached.filter(source => putSource({ ...source, documentRole: isSelectedSyllabus ? 'syllabus' : candidate.purpose, documentId: `canvas-file:${fileId}` })).length;
        track(cid, `file:${fileId}`, label, count === cached.length ? 'complete' : 'partial', '已核对 Canvas 文件更新时间；沿用上次读取的安排正文。', count);
        if (isSelectedSyllabus) {
          syllabusStatus.sourceIds = sources.filter(source => source.courseId === cid && source.fileId === fileId && source.readMode === 'content').map(source => source.id);
          syllabusStatus.pageCount = cached.length;
          syllabusStatus.status = count === cached.length ? 'read' : count ? 'read_partial' : 'read_failed';
          syllabusStatus.detail = count === cached.length ? `已核对大纲未更新，沿用 ${count} 页正文。` : '大纲正文未完整读入，尚未整理课表。';
        }
        continue;
      }
      options.onProgress?.(`正在读课程安排 · ${selected.course_code || selected.name} · ${label}…`);
      let fileStage = '下载附件';
      try {
        const downloaded = await downloadCanvasFile(connection, file, { signal });
        aborted(signal);
        fileStage = '提取 PDF 文字';
        const pageTexts = await readBriefPdf(downloaded);
        aborted(signal);
        let count = 0;
        for (const [index, text] of pageTexts.entries()) if (text.trim().length >= 12 && putSource({ id: sourceId(cid, 'file', `${fileId}:${index + 1}`), courseId: cid,
          kind: 'file', title: `${label} · 第 ${index + 1} 页`, url: `${home}/files/${fileId}`, text,
          fetchedAt, updatedAt: file.updated_at, fileId, page: index + 1, documentRole: isSelectedSyllabus ? 'syllabus' : candidate.purpose, documentId: `canvas-file:${fileId}` })) count++;
        if (isSelectedSyllabus) {
          syllabusStatus.sourceIds = sources.filter(source => source.courseId === cid && source.fileId === fileId && source.readMode === 'content').map(source => source.id);
          syllabusStatus.pageCount = pageTexts.length;
          syllabusStatus.status = count === pageTexts.length && count > 0 ? 'read' : count > 0 ? 'read_partial' : 'read_failed';
          syllabusStatus.detail = syllabusStatus.status === 'read' ? `已读取大纲 ${count} 页，准备整理课表。` : `大纲共 ${pageTexts.length} 页，仅 ${count} 页读到文字，尚未确认完整读取。`;
        }
        track(cid, `file:${fileId}`, label, count === pageTexts.length && count > 0 ? 'complete' : 'partial',
          count === pageTexts.length && count > 0 ? '已读取 PDF 文字；表格日期仍保留对应原页供核对。' : '部分页面没有可读取文字或超出大小限制，可能是扫描页；未据此判断没有安排。', count);
      } catch (error) {
        aborted(signal); track(cid, `file:${fileId}`, label, 'unavailable', `${fileStage}失败，尚未核对正文。`);
        if (isSelectedSyllabus) { syllabusStatus.status = 'read_failed'; syllabusStatus.detail = error instanceof Error ? `大纲${fileStage}失败：${error.message}` : `大纲${fileStage}失败。`; }
      }
    }
    if (directoryOnlyFiles.size) track(cid, 'module_file_contents', 'Lecture 与 reading 清单', 'skipped', `${directoryOnlyFiles.size} 份材料先保留名称和链接（例如 ${[...directoryOnlyFiles.values()].slice(0, 3).join('、')}）。仅在确认具体属于本周的 lecture 后，另外读取该课件生成导读；文章正文不读取。`, directoryOnlyFiles.size);
    track(cid, 'syllabus_read', '课程大纲读取', syllabusStatus.status === 'read' ? 'complete' : 'partial', syllabusStatus.detail, syllabusStatus.sourceIds.length);
  }
  aborted(signal);
  if (!coverage.some(c => c.status === 'complete')) throw new Error('没有成功读取课程信息，上次简报已保留。请检查 Canvas 连接后重试。');
  const reportId = `brief:${Date.now()}`;
  const syllabusPlan = await prepareCompactPlans({ sync: options, sources, syllabi, knownItems, context: courseContexts,
    onPartial: partial => {
      options.onCheckpoint?.({ version: 1, scopeVersion: 4, pipelineVersion: 2, digestVersion: 1,
        id: reportId, ownerId: options.ownerId, canvasOrigin: origin, canvasUserId: options.canvasUserId,
        courses: currentCourses, weekStart, timeZone, fetchedAt, generatedAt: new Date().toISOString(),
        sources, items: mergeCalendarFindings(mergeAssignmentFindings(flagBriefConflicts([...knownItems, ...partial.items], sources, timeZone), timeZone), timeZone),
        syllabi: partial.syllabi, syllabusSchedules: partial.schedules, coverage: [...coverage, ...partial.coverage],
        changes: [], analysisStatus: 'partial', run: { ...partial.run } });
    },
  });
  aborted(signal);
  coverage.push(...syllabusPlan.coverage);
  const extracted = syllabusPlan.items;
  // An exact task title can link a syllabus deadline to a Canvas task; no fuzzy match.
  for (const finding of extracted) {
    if (!['assignment', 'quiz', 'exam', 'discussion'].includes(finding.kind) || finding.relatedAssignmentId != null) continue;
    const matches = knownItems.filter(task => task.courseId === finding.courseId && task.assignmentId != null
      && normalize(task.title).toLowerCase() === normalize(finding.title).toLowerCase());
    if (matches.length === 1) finding.relatedAssignmentId = matches[0].assignmentId;
  }
  const unique = new Map<string, BriefItem>();
  for (const item of [...knownItems, ...extracted]) {
    const fingerprint = item.assignmentId !== undefined ? item.id : `${item.courseId}:${item.kind}:${normalize(item.title)}:${item.date?.value || item.dateText || ''}:${item.evidence.map(e => e.sourceId).sort().join(',')}`;
    if (!unique.has(fingerprint)) unique.set(fingerprint, item);
  }
  let items = mergeCalendarFindings(mergeAssignmentFindings(flagBriefConflicts([...unique.values()], sources, timeZone), timeZone), timeZone);
  const changes = briefChanges(previous, sources, items, coverage);
  // Failed reads must not erase a previously known exam or reading deadline either.
  if (previous) for (const old of previous.items) {
    if (!courses.some(c => c.id === old.courseId) || items.some(item => item.id === old.id)
      || !coverage.some(c => c.courseId === old.courseId && (c.status === 'partial' || c.status === 'unavailable'))) continue;
    // A narrower scope must not resurrect old lecture/article bodies or old undated resource noise.
    if (previous.scopeVersion !== 2 && previous.scopeVersion !== 3 && old.assignmentId === undefined && !old.date) continue;
    if (old.evidence.some(e => {
      const source = previous.sources.find(s => s.id === e.sourceId);
      return source?.readMode === 'catalog' || source?.readMode === 'lecture'
        || source?.documentRole === 'syllabus' && !syllabi.find(syllabus => syllabus.courseId === old.courseId)?.sourceIds.includes(e.sourceId)
        || source?.kind === 'file' && !source.documentRole && briefDocumentPurpose(source.title) === 'catalog';
    })) continue;
    // A successfully refreshed assignment list can legitimately stop returning an old task.
    if (old.assignmentId !== undefined && coverage.some(c => c.courseId === old.courseId && c.area === 'assignments' && c.status === 'complete')
      && !coverage.some(c => c.courseId === old.courseId && c.area.startsWith('size:'))) continue;
    const stale = '本次未能重新核对这项安排，保留的是上次同步信息；请查看原文。';
    items.push({ ...old, digest: undefined, guide: undefined, assessmentWeight: undefined, dateStatus: 'needs_confirmation', issues: [...new Set([...old.issues, stale])] });
    for (const e of old.evidence) {
      const source = previous.sources.find(s => s.id === e.sourceId);
      if (source && !sources.some(s => s.id === source.id)) sources.push(source);
    }
  }
  aborted(signal);
  const report: CourseBriefReport = { version: 1, scopeVersion: 4, pipelineVersion: 2, digestVersion: 1,
    syllabi: syllabusPlan.syllabi, syllabusSchedules: syllabusPlan.schedules,
    id: reportId, canvasOrigin: origin, canvasUserId: options.canvasUserId, ownerId: options.ownerId,
    courses: currentCourses, weekStart, timeZone, fetchedAt, generatedAt: new Date().toISOString(), sources, items, coverage, changes,
    run: { ...syllabusPlan.run },
    analysisStatus: coverage.some(c => c.area.startsWith('analysis:') && c.status !== 'complete') ? 'partial' : 'complete' };
  // The arrangement table and compact summaries are already produced. Do not run
  // a second editor/auditor or download lecture bodies as part of every sync.
  report.items = retainLearningFiles(report.items, previous, report.sources);
  return updateSavedBrief(report);
}

/** Association is a user decision; it survives re-grounding the same dated lesson. */
function retainLearningFiles(items: BriefItem[], previous: CourseBriefReport | undefined, sources: BriefSource[]): BriefItem[] {
  if (!previous) return items;
  return items.map(item => {
    if (item.kind !== 'lecture') return item;
    const old = previous.items.find(old => old.courseId === item.courseId && old.kind === item.kind && old.title === item.title
      && (old.id === item.id || old.dateText === item.dateText));
    if (!old) return item;
    const lectureFile = item.lectureFile || old.lectureFile;
    const currentFile = sources.find(source => source.courseId === item.courseId && source.fileId === lectureFile?.fileId);
    const oldFile = previous.sources.find(source => source.courseId === item.courseId && source.fileId === lectureFile?.fileId);
    const unchanged = !!currentFile?.updatedAt && currentFile.updatedAt === oldFile?.updatedAt;
    const guide = item.guide || (unchanged ? old.guide : undefined);
    if (guide) for (const evidence of guide.evidence || []) {
      const source = previous.sources.find(source => source.id === evidence.sourceId);
      if (source && !sources.some(existing => existing.id === source.id)) sources.push(source);
    }
    return { ...item, lectureFile, guide };
  });
}
