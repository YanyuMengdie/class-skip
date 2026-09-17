import { reprocessSavedDates } from './evidence';
import type { BriefItem, BriefPlanProblem, BriefSource, BriefSyllabusSchedule, BriefSyllabusStatus, CourseBriefReport } from './types';

export const PROCESSING_VERSION = 1;
const learning = (item: BriefItem) => item.kind === 'lecture' || item.kind === 'reading';
const unpublished = (value: string) => /\bTBD\b|to be (?:announced|determined)|尚未公布|待公布/i.test(value);

export function describeSyllabus(status: BriefSyllabusStatus, schedule: BriefSyllabusSchedule | undefined,
  sources: BriefSource[]): BriefSyllabusStatus {
  // A fresh attachment read does not mean an older attachment's table was checked.
  if (schedule && !schedule.sourceIds.every(id => status.sourceIds.includes(id))) schedule = undefined;
  const items = schedule?.items || [];
  const analyzed = schedule?.sourceIds;
  const omitted = analyzed ? status.sourceIds.filter(id => !analyzed.includes(id)) : undefined;
  const problems: BriefPlanProblem[] = [];
  const add = (kind: BriefPlanProblem['kind'], message: string, itemId?: string) => problems.push({ courseId: status.courseId, kind, message, itemId });
  if (!analyzed) add('scope', '尚未保存实际整理范围，不能确认课表是否完整。');
  if (omitted?.length) add('scope', `${omitted.length} 页已读正文尚未交给 AI 整理。`);
  if (status.pageCount && status.sourceIds.length < status.pageCount) add('scope', '部分大纲页面尚未读到。');
  for (const item of items) {
    if (item.dateStatus !== 'confirmed') add(unpublished(item.dateText || item.details) ? 'unpublished' : 'date',
      unpublished(item.dateText || item.details) ? `「${item.title}」学校尚未公布日期。` : `「${item.title}」尚未对应到确定日期。`, item.id);
  }
  // Old result issues include mechanically generated per-item date warnings. Recompute those
  // from the items, preserving model/source issues instead of silently declaring completeness.
  const mechanical = new Set(items.flatMap(item => item.issues.map(issue => `「${item.title}」${issue}`)));
  for (const message of schedule?.issues || []) {
    if (mechanical.has(message) || items.some(item => message.startsWith(`「${item.title}」`) && /日期、年份或时区未明确|日期已确认；原文时间/.test(message))) continue;
    const kind = unpublished(message) ? 'unpublished' : /缺页|未提供|输入缺少|未整理|条数上限|对齐|格式|跳过|冲突|缺课表/.test(message) ? 'extraction' : 'information';
    add(kind, message);
  }
  const learned = items.filter(learning);
  const dated = learned.filter(item => item.dateStatus === 'confirmed' && (item.date || item.weekStart));
  const blocking = problems.some(problem => problem.kind === 'scope' || problem.kind === 'extraction');
  const fullyProcessed = !!schedule && learned.length > 0 && dated.length === learned.length && !blocking;
  const nextStatus = schedule ? fullyProcessed ? 'ready' : items.length ? 'schedule_partial' : 'schedule_failed' : status.status;
  const pageNames = (ids: string[]) => ids.map(id => sources.find(source => source.id === id)?.page).filter((page): page is number => page != null).sort((a, b) => a - b).join('、');
  const detail = schedule ? `已保存 ${items.length} 项安排，${dated.length} 项讲次或阅读已对应日期。${omitted?.length ? `尚未整理第 ${pageNames(omitted) || '未知'} 页。` : ''}` : status.detail;
  return { ...status, status: nextStatus, detail, processing: {
    version: 1, readSourceIds: status.sourceIds, analyzedSourceIds: analyzed, omittedSourceIds: omitted,
    extraction: schedule ? 'available' : status.status === 'schedule_failed' ? 'failed' : 'pending',
    learningDated: dated.length, learningUnresolved: learned.length - dated.length, problems,
  } };
}

/** Pure local migration: no network, no model, no clearing old reports. */
export function updateSavedBrief(report: CourseBriefReport): CourseBriefReport {
  const context = report.courses.map(course => ({ courseId: course.id,
    termStart: course.start_at || course.term?.start_at || undefined, termEnd: course.end_at || course.term?.end_at || undefined }));
  const items = reprocessSavedDates(report.items, report.sources, report.timeZone, context);
  const schedules = report.syllabusSchedules?.map(schedule => ({ ...schedule, processingVersion: PROCESSING_VERSION,
    items: reprocessSavedDates(schedule.items, report.sources, report.timeZone, context) }));
  // Some historic snapshots saved only the semester table. Restore missing learning rows;
  // don't duplicate assignments already merged with the Canvas API.
  for (const schedule of schedules || []) for (const item of schedule.items) {
    if (learning(item) && !items.some(existing => existing.id === item.id || existing.courseId === item.courseId
      && existing.kind === item.kind && existing.title === item.title && existing.dateText === item.dateText)) items.push(item);
  }
  const syllabi = report.syllabi?.map(status => describeSyllabus(status, schedules?.find(s => s.courseId === status.courseId), report.sources));
  for (const schedule of schedules || []) schedule.complete = syllabi?.find(status => status.courseId === schedule.courseId)?.status === 'ready';
  const coverage = report.coverage.map(area => {
    if (area.area !== 'analysis:syllabus') return area;
    const status = syllabi?.find(status => status.courseId === area.courseId);
    return status?.processing?.extraction === 'available' ? { ...area, status: status.status === 'ready' ? 'complete' as const : 'partial' as const, detail: status.detail } : area;
  });
  return { ...report, processingVersion: PROCESSING_VERSION, items, syllabusSchedules: schedules, syllabi, coverage,
    analysisStatus: coverage.some(area => area.area.startsWith('analysis:') && area.status !== 'complete') ? 'partial' : report.analysisStatus === 'not_run' ? 'not_run' : 'complete' };
}
