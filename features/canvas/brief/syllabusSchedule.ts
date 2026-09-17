import { extractBriefItems, type BriefCourseDateContext } from './evidence';
import { readingFailureMessage } from '@/services/readingAstraClient';
import type { BriefCoverage, BriefExtractionResult, BriefItem, BriefSource, BriefSyllabusSchedule, BriefSyllabusStatus, CourseBriefReport } from './types';

const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消同步', 'AbortError'); };
const isLearning = (item: BriefItem) => item.kind === 'lecture' || item.kind === 'reading';
const dated = (item: BriefItem) => item.dateStatus === 'confirmed' && !!(item.date || item.weekStart);
const copyResult = (result: BriefExtractionResult): BriefExtractionResult => JSON.parse(JSON.stringify(result));

/** Find arrangement pages without asking the model to rewrite the whole syllabus.
 * Dates also select assessment pages; Week N tables remain visible even without dates.
 * If no recognizable heading/date is found, inspect every page rather than conclude
 * that no schedule exists. Full, untruncated context pages accompany each target.
 */
function syllabusPages(sources: BriefSource[]): Array<{ target: BriefSource; sources: BriefSource[] }> {
  const scheduleHeading = /(?:schedule|calendar|timetable|outline)\s+(?:of\s+)?(?:lectures?|classes|topics|readings?|deadlines)|(?:course|lecture|class|weekly|tentative)\s+(?:schedule|calendar|outline)|课程(?:日程|安排|进度)|教学进度|周次.*(?:日期|主题)/i;
  const calendarDate = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:Sept?|October|November|December|January|February|March|April|May|June|July|August)\b|\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\d{1,2}月\s*\d{1,2}日/i;
  const candidates = sources.filter(source => scheduleHeading.test(source.text) || calendarDate.test(source.text)
    || (source.text.match(/\bweek\s*\d+|第\s*\d+\s*周/gi) || []).length >= 2);
  // Process date-dense schedule tables first, before introductory/policy pages.
  const score = (source: BriefSource) => (scheduleHeading.test(source.text) ? 20 : 0)
    + (source.text.match(new RegExp(calendarDate.source, 'gi')) || []).length;
  const targets = [...(candidates.length ? candidates : sources)].sort((a, b) => score(b) - score(a));
  // Headers carry the term; textbook pages carry the scope of optional/required reading.
  const policies = sources.filter(source => /(?:recommended|optional|required)\s*(?:\(optional\)\s*)?(?:textbook|readings?)|教材|指定阅读|推荐阅读/i.test(source.text));
  const context = [...new Map([sources[0], ...policies].filter(Boolean).map(source => [source.id, source])).values()];
  return targets.map(target => {
    const index = sources.indexOf(target);
    const previous = index > 0 && targets.includes(sources[index - 1]) ? sources[index - 1] : undefined;
    const selected = [...new Map([target, ...context, ...(previous ? [previous] : [])].map(source => [source.id, source])).values()];
    return { target, sources: selected };
  });
}

async function signature(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareSyllabusSchedules(options: {
  sources: BriefSource[]; syllabi: BriefSyllabusStatus[]; knownItems: BriefItem[]; timeZone: string;
  courseContexts: BriefCourseDateContext[]; previous?: CourseBriefReport;
  signal?: AbortSignal; onProgress?: (message: string) => void;
}): Promise<{ items: BriefItem[]; schedules: BriefSyllabusSchedule[]; coverage: BriefCoverage[]; syllabi: BriefSyllabusStatus[] }> {
  const items: BriefItem[] = [], schedules: BriefSyllabusSchedule[] = [], coverage: BriefCoverage[] = [];
  const syllabi = options.syllabi.map(status => ({ ...status, sourceIds: [...status.sourceIds] }));
  for (const status of syllabi) {
    abort(options.signal);
    if (!status.sourceIds.length || !['read', 'read_partial'].includes(status.status)) continue;
    const fullyRead = status.status === 'read';
    const readDetail = status.detail;
    const sources = options.sources.filter(source => status.sourceIds.includes(source.id) && source.courseId === status.courseId)
      .sort((a, b) => (a.page || 0) - (b.page || 0));
    const context = options.courseContexts.filter(context => context.courseId === status.courseId);
    const knownItems = options.knownItems.filter(item => item.courseId === status.courseId);
    const basis = { version: 2, timeZone: options.timeZone, context,
      assignments: knownItems.filter(item => item.assignmentId !== undefined)
        .map(({ assignmentId, title, date }) => ({ assignmentId, title, date })).sort((a, b) => a.assignmentId! - b.assignmentId!),
    };
    const sourceContent = (rows: BriefSource[]) => rows.map(({ id, text, documentId, documentRole }) => ({ id, text, documentId, documentRole }));
    const key = await signature({ ...basis, sources: sourceContent(sources) });
    const oldSchedule = options.previous?.scopeVersion === 4
      ? options.previous.syllabusSchedules?.find(schedule => schedule.courseId === status.courseId) : undefined;
    const pages: NonNullable<BriefSyllabusSchedule['pages']> = [];
    for (const plan of syllabusPages(sources)) {
      abort(options.signal);
      const pageKey = await signature({ ...basis, target: plan.target.id, sources: sourceContent(plan.sources) });
      const oldPage = oldSchedule?.pages?.find(page => page.sourceId === plan.target.id && page.signature === pageKey);
      const reusablePage = oldPage?.result.items.every(item => item.evidence.every(reference =>
        plan.sources.some(source => source.id === reference.sourceId && source.text.includes(reference.quote)))) ? oldPage : undefined;
      let result: BriefExtractionResult;
      if (reusablePage?.result.retryable === false) result = copyResult(reusablePage.result);
      else {
        options.onProgress?.(`${oldPage?.result.checkpoint ? '继续核对' : '正在整理'}大纲第 ${plan.target.page || '?'} 页 · ${status.title || '课程大纲'}…`);
        try {
          result = await extractBriefItems(plan.sources, knownItems, options.timeZone, {
            signal: options.signal, courseContexts: context, syllabusSourceId: plan.target.id,
            checkpoint: reusablePage?.result.checkpoint,
          });
          abort(options.signal);
        } catch (error) {
          abort(options.signal);
          const detail = readingFailureMessage(error, error instanceof Error ? error.message : '请求未完成');
          result = { items: [], issues: [detail], retryable: true,
            trace: { extracted: 0, grounded: 0, verified: 0, dated: 0, detail } };
        }
      }
      pages.push({ sourceId: plan.target.id, signature: pageKey, result });
    }
    const unique = [...new Map(pages.flatMap(page => page.result.items).map(item => [item.id, item])).values()];
    const learning = unique.filter(isLearning);
    const datedLearning = learning.filter(dated);
    const issues = [...new Set(pages.flatMap(page => page.result.issues))];
    const pendingPages = pages.filter(page => page.result.retryable).length;
    const complete = fullyRead && pendingPages === 0 && issues.length === 0 && datedLearning.length > 0 && datedLearning.length === learning.length;
    const schedule: BriefSyllabusSchedule = { courseId: status.courseId, signature: key, sourceIds: sources.map(source => source.id), items: unique, issues, complete, pages };
    schedules.push(schedule); items.push(...unique);
    status.status = complete ? 'ready' : datedLearning.length ? 'schedule_partial' : !fullyRead ? 'read_partial' : 'schedule_failed';
    const counts = `按页提取 ${pages.reduce((n, page) => n + (page.result.trace?.extracted || 0), 0)} 项，核对通过 ${unique.length} 项，其中 ${datedLearning.length} 项讲课与阅读已确认日期。`;
    const problem = pages.find(page => page.result.retryable)?.result.issues[0] || issues[0];
    status.detail = `${!fullyRead ? `${readDetail} ` : ''}${counts}${pendingPages ? `还有 ${pendingPages} 页未完成，下次同步只继续未完成部分。` : ''}${problem ? ` ${problem}` : !datedLearning.length ? ' 尚未找到能对应到日历的讲课或阅读，请查看逐页提取记录。' : ''}`;
    coverage.push({ courseId: status.courseId, area: 'analysis:syllabus', label: '大纲课表', status: complete ? 'complete' : 'partial', detail: status.detail, sourceCount: sources.length });
  }
  return { items, schedules, coverage, syllabi };
}
