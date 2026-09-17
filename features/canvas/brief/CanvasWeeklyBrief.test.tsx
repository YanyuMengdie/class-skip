import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BriefItemCard, CanvasBriefReportView, CanvasWeeklyBrief, briefHasGaps, briefSafeUrl, briefSourceCatalog, groupBriefItems, selectMajorAssessments, verifiedAssessmentWeight } from './CanvasWeeklyBrief';
import { CanvasBriefSummary } from './CanvasBriefSummary';
import type { BriefItem, CourseBriefReport } from './types';

vi.mock('./sync', () => ({ syncCourseBrief: vi.fn() }));
const report = (items: BriefItem[] = []): CourseBriefReport => ({
  version: 1, scopeVersion: 3, digestVersion: 1, organizingStatus: 'complete', id: 'r1', ownerId: 'owner-a', canvasOrigin: 'https://school.example', canvasUserId: 1,
  courses: [{ id: 12, course_code: 'PSY494', name: 'Course A' }], weekStart: '2026-09-14', timeZone: 'America/Toronto',
  fetchedAt: '2026-09-15T12:00:00Z', generatedAt: '2026-09-15T12:01:00Z',
  sources: [{ id: 's1', courseId: 12, kind: 'file', title: 'Syllabus.pdf', url: 'https://school.example/courses/12/files/33', fileId: 33, page: 4, text: 'Read Chapter 3 by September 18.', fetchedAt: '2026-09-15T12:00:00Z' }],
  items, coverage: [{ courseId: 12, area: 'assignments', label: '作业', status: 'complete', detail: 'Read all pages.', sourceCount: 2 }], changes: [], analysisStatus: 'complete',
});
const item = (overrides: Partial<BriefItem> = {}): BriefItem => ({
  id: 'item1', courseId: 12, kind: 'reading', title: 'Read chapter 3', details: 'Read pages 4–8.', url: 'https://school.example/assignment',
  requirement: 'required', dateStatus: 'confirmed', status: 'unknown', issues: [],
  evidence: [{ sourceId: 's1', quote: 'Read Chapter 3 by September 18.' }],
  date: { value: '2026-09-18', precision: 'date', origin: 'document', raw: 'September 18', timeZone: 'America/Toronto' }, ...overrides,
});
afterEach(() => { vi.useRealTimers(); });
// Native details is closed by default; remove its subtree to test the initial view.
const initialView = (html: string): string => {
  let depth = 0; let start = 0; let result = '';
  for (const token of html.matchAll(/<details\b[^>]*>|<\/details>/g)) {
    if (token[0].startsWith('<details')) {
      if (depth === 0) result += html.slice(start, token.index);
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) start = token.index! + token[0].length;
    }
  }
  return result + html.slice(start);
};
const digest = (overrides: Partial<NonNullable<BriefItem['digest']>> = {}): NonNullable<BriefItem['digest']> => ({
  overview: '阅读指定论文，独立完成一份摘要，之后参加同伴互评。',
  keyRequirements: ['摘要不超过 350 词。', '使用老师提供的无摘要版本，不查原摘要或使用 AI 代写。'],
  preparation: ['先记下论文的研究问题、方法和主要结果。'], evidence: [{ sourceId: 's1', quote: 'Read Chapter 3 by September 18.' }], ...overrides,
});

describe('Canvas brief date grouping and truthful labels', () => {
  it('uses the report timezone and separates uncertain dates even when a proposed date exists', () => {
    const beforeWeek = item({ id: 'before', date: { value: '2026-09-14T02:00:00Z', precision: 'datetime', origin: 'canvas', raw: '2026-09-14T02:00:00Z', timeZone: 'UTC' } });
    const nextWeek = item({ id: 'next', date: { value: '2026-09-21', precision: 'date', origin: 'document', raw: 'September 21', timeZone: 'America/Toronto' } });
    const conflict = item({ id: 'conflict', dateStatus: 'conflict' });
    const relative = item({ id: 'relative', dateStatus: 'needs_confirmation', dateText: 'Week 4' });
    const missing = item({ id: 'missing', date: undefined, dateStatus: 'unspecified' });
    const groups = groupBriefItems(report([beforeWeek, item(), nextWeek, conflict, relative, missing]));
    expect(groups.thisWeek.map(entry => entry.id)).toEqual(['item1']);
    expect(groups.upcoming.map(entry => entry.id)).toEqual(['next']);
    expect(groups.other.map(entry => entry.id)).toEqual(['before']);
    expect(groups.unresolved.map(entry => entry.id)).toEqual(['conflict']);
    expect(groups.unassigned.map(entry => entry.id)).toEqual(['relative', 'missing']);
  });

  it('does not invent a time or claim coursework is mastered after Canvas submission', () => {
    const html = renderToStaticMarkup(<BriefItemCard item={item({ status: 'submitted', requirement: 'optional' })} report={report()} />);
    expect(html).toContain('未给出具体时刻');
    expect(html).toContain('选做 / 选读');
    expect(html).toContain('Canvas 已提交');
    expect(html).toContain('不代表已经学会或完成批改');
    expect(html).not.toContain('23:59');
  });

  it('renders citations and page references as plain text and rejects executable links', () => {
    const fixture = report();
    fixture.sources[0].url = 'javascript:alert(1)';
    const html = renderToStaticMarkup(<BriefItemCard item={item({ title: '<script>PAYLOAD</script>', url: 'data:text/html,malicious', evidence: [{ sourceId: 's1', quote: '<img src=x onerror=alert(1)>' }] })} report={fixture} />);
    expect(html).toContain('PDF 第 4 页');
    expect(html).toContain('&lt;script&gt;PAYLOAD&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('<script>');
    expect(html).toContain('显示时区：America/Toronto');
  });

  it('never implies that an empty or incomplete snapshot means no work is due', () => {
    const fixture = report(); fixture.analysisStatus = 'partial'; fixture.coverage[0].status = 'unavailable'; fixture.coverage[0].detail = '公告未能读取';
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('这次读取有缺口');
    expect(html).toContain('公告未能读取');
    expect(html).toContain('不代表本周没有任务');
    expect(html).toContain('任务与阅读安排可能有遗漏');
    expect(html).not.toContain('本周无任务');
  });

  it('distinguishes due dates from event starts and uses the report display timezone label', () => {
    const fixture = report();
    const deadline = renderToStaticMarkup(<BriefItemCard item={item({ dateRole: 'deadline' })} report={fixture} />);
    const start = renderToStaticMarkup(<BriefItemCard item={item({ dateRole: 'start' })} report={fixture} />);
    expect(deadline).toContain('截止 · ');
    expect(start).toContain('开始 · ');
    expect(start).not.toContain('截止 · ');
    expect(start).toContain('显示时区：America/Toronto');
    expect(start).not.toContain('来源时区');
  });

  it('shows the stated course context used to resolve a document date', () => {
    const html = renderToStaticMarkup(<BriefItemCard item={item({ date: { value: '2026-09-18', precision: 'date', origin: 'document', raw: 'September 18', timeZone: 'America/Toronto', context: '年份来自 Canvas 明确的 2026 Fall 学期范围。' } })} report={report()} />);
    expect(html).toContain('日期对应依据：年份来自 Canvas 明确的 2026 Fall 学期范围。');
    expect(html).not.toContain('日期待确认');
  });

  it('keeps missing-again changes distinct from a cancellation', () => {
    const fixture = report();
    fixture.changes = [{ id: 'c1', courseId: 12, kind: 'no_longer_returned', title: 'Essay', url: 'https://school.example/essay' }];
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('不能据此认定任务已取消');
  });

  it('labels preparation as optional advice and excludes past or completed tasks', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    const past = item({ id: 'past', title: 'Past essay', digest: digest({ preparation: ['不要催促过去的任务'] }), date: { value: '2026-09-15', precision: 'date', origin: 'canvas', raw: 'September 15', timeZone: 'America/Toronto' } });
    const done = item({ id: 'done', title: 'Submitted reading', status: 'submitted', digest: digest({ preparation: ['不要催促已完成的任务'] }) });
    const fixture = report([past, done, item({ title: 'Future reading', digest: digest() })]);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('建议先做 · 可按自己的节奏安排');
    expect(html).toContain('先记下论文的研究问题、方法和主要结果。');
    expect(html).not.toContain('不要催促过去的任务');
    expect(html).not.toContain('不要催促已完成的任务');
  });

  it('only offers PDF study import when the evidence identifies a PDF file', () => {
    const fixture = report();
    expect(renderToStaticMarkup(<BriefItemCard item={item()} report={fixture} onImportSource={() => {}} />)).toContain('导入 PDF 学习');
    fixture.sources[0].fileId = undefined;
    expect(renderToStaticMarkup(<BriefItemCard item={item()} report={fixture} onImportSource={() => {}} />)).not.toContain('导入 PDF 学习');
  });

  it('lists undated PDF material separately without inventing a weekly reading requirement', () => {
    const fixture = report(); fixture.sources[0].kind = 'module'; fixture.sources[0].title = 'Lecture slides';
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} onImportSource={() => {}} />);
    expect(html).toContain('课程来源与 PDF 资料');
    expect(html).toContain('Lecture slides');
    expect(html).toContain('不代表本周要读或老师要求必读');
    expect(html).toContain('导入学习');
    expect(html).not.toContain('这一周，按日查看</h3><span>1');
  });

  it('shows only evidence-supported weekly lectures and readings, while keeping deadlines in the task timeline', () => {
    const lecture = item({ id: 'lecture', kind: 'lecture', title: 'Lecture 3: Memory', date: undefined, weekStart: '2026-09-14' });
    const lectureWithDay = item({ id: 'lecture-day', kind: 'lecture', title: 'Lecture 4: Attention' });
    const reading = item({ title: 'Required paper A', details: 'Read pages 5–12 before class.' });
    const assignment = item({ id: 'essay', kind: 'assignment', title: 'Essay due Friday', dateRole: 'deadline' });
    const fixture = report([lecture, lectureWithDay, reading, assignment]);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    const courses = html.split('这周上什么，读什么')[1].split('本周任务与截止时间')[0];
    const tasks = html.split('本周任务与截止时间')[1].split('再往后两周')[0];
    expect(courses).toContain('Lecture 3: Memory');
    expect(courses).toContain('Lecture 4: Attention');
    expect(courses).toContain('Required paper A');
    expect(courses).toContain('Read pages 5–12 before class.');
    expect(courses).toContain('本周安排');
    expect(courses).not.toContain('Essay due Friday');
    expect(tasks).toContain('Essay due Friday');
    expect(tasks).not.toContain('Lecture 4: Attention');
    expect(tasks).not.toContain('Required paper A');
  });

  it('does not use unverified week labels, upload dates or lecture catalog entries as a current-week assignment', () => {
    const fixture = report([item({ id: 'week-label', title: 'Lecture named Week 1', kind: 'lecture', date: undefined, weekStart: '2026-09-14', dateStatus: 'needs_confirmation', dateText: 'Week 1' })]);
    fixture.sources.push({ ...fixture.sources[0], id: 'catalog', title: 'Lecture uploaded this week', fileId: 44, page: undefined, readMode: 'catalog', updatedAt: '2026-09-15T12:00:00Z' });
    const groups = groupBriefItems(fixture);
    expect(groups.thisWeek).toHaveLength(0);
    expect(groups.unassigned).toHaveLength(1);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('本周讲次和阅读清单尚未找到明确安排');
    expect(html.match(/本周讲次和阅读清单尚未找到明确安排/g)).toHaveLength(1);
    const courses = html.split('这周上什么，读什么')[1].split('本周任务与截止时间')[0];
    expect(courses).not.toContain('Lecture named Week 1');
    expect(courses).not.toContain('Lecture uploaded this week');
    expect(html).toContain('<details class="cb-secondary-details"><summary>');
    expect(html).toContain('尚未对应周次的课程安排');
  });

  it('separates reference and conditional information from unresolved tasks but never hides date conflicts', () => {
    const fixture = report([
      item({ id: 'grade', kind: 'notice', title: 'Participation 10%', context: 'reference', date: undefined, dateStatus: 'unspecified' }),
      item({ id: 'missed', kind: 'assignment', title: 'Missed exam form', context: 'conditional' }),
      item({ id: 'optional', kind: 'assignment', requirement: 'optional', date: undefined, dateStatus: 'unspecified' }),
      item({ id: 'required', kind: 'assignment', context: 'action', date: undefined, dateStatus: 'unspecified' }),
      item({ id: 'conflict', kind: 'reading', context: 'reference', requirement: 'optional', dateStatus: 'conflict' }),
    ]);
    const groups = groupBriefItems(fixture);
    expect(groups.reference.map(entry => entry.id)).toEqual(['grade', 'missed', 'optional']);
    expect(groups.unresolved.map(entry => entry.id)).toEqual(['required', 'conflict']);
    expect(groups.thisWeek).toHaveLength(0);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('课程参考与条件说明');
    expect(html).toContain('日期冲突，待确认');
  });

  it('treats catalog-only skipped bodies as intentional scope and counts a PDF once, preferring read content', () => {
    const fixture = report();
    fixture.sources[0].readMode = 'content';
    fixture.sources.push({ ...fixture.sources[0], id: 's2', page: 5 });
    fixture.sources.push({ ...fixture.sources[0], id: 's3', page: undefined, readMode: 'catalog', text: 'Title only' });
    fixture.sources.push({ ...fixture.sources[0], id: 'lecture:resource:44', title: 'Lecture 6.pdf', fileId: 44, page: undefined, readMode: 'catalog', text: 'Title only' });
    fixture.coverage.push({ courseId: 12, area: 'file:44', label: 'Lecture 6.pdf', status: 'skipped', detail: '按范围不读课件正文', sourceCount: 1 });
    expect(briefHasGaps(fixture)).toBe(false);
    expect(briefSourceCatalog(fixture.sources).map(source => source.id)).toEqual(['s1', 'lecture:resource:44']);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).not.toContain('这次读取有缺口');
    expect(html).toContain('已读课程安排正文');
    expect(html).toContain('仅记录名称与链接 · 未读正文');
    expect(html).toContain('2 份资料与页面');
    expect(html).toContain('按范围跳过');
  });

  it('keeps old reports readable and explains that a new sync adopts the narrower scope', () => {
    const fixture = report([item()]);
    delete fixture.scopeVersion;
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(html).toContain('原记录已保留');
    expect(html).toContain('只读取明确属于本周的 lecture 课件来做导读');
    expect(html).toContain('阅读文章不读正文');
    expect(html).toContain('Read chapter 3');
  });

  it('gives a generic summary before a verified report is passed', () => {
    const html = renderToStaticMarkup(<CanvasBriefSummary onOpen={() => {}} />);
    expect(html).toContain('选择课程，手动同步');
    expect(html).not.toContain('PSY494');
    expect(html).not.toContain('有明确日期');
  });

  it('shows a real digest and key requirements while keeping the full source and issues closed', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    const fixture = item({ kind: 'assignment', title: '摘要写作练习', digest: digest(), details: 'Original long assignment description with resources and reflection prompts. '.repeat(40), issues: ['Internal extraction needs review'] });
    const html = renderToStaticMarkup(<BriefItemCard item={fixture} report={report()} />);
    const initial = initialView(html);
    expect(initial).toContain('阅读指定论文，独立完成一份摘要');
    expect(initial).toContain('摘要不超过 350 词');
    expect(initial).toContain('不查原摘要或使用 AI 代写');
    expect(initial).toContain('先记下论文的研究问题');
    expect(initial).not.toContain('Original long assignment');
    expect(initial).not.toContain('Internal extraction needs review');
    expect(html).toContain('Original long assignment');
    expect(html).toContain('完整要求与原文依据');
    expect(html).not.toContain('<details open');
  });

  it('does not disguise raw text or a missing-source digest as an organized summary', () => {
    const fixture = item({ details: 'Raw source must stay folded.', digest: digest({ evidence: [{ sourceId: 'unknown', quote: 'Unverified' }] }) });
    const html = renderToStaticMarkup(<BriefItemCard item={fixture} report={report()} />);
    expect(initialView(html)).toContain('摘要尚未整理，展开查看原始要求');
    expect(initialView(html)).not.toContain('Raw source must stay folded');
    expect(initialView(html)).not.toContain('独立完成一份摘要');
    expect(html).toContain('Raw source must stay folded');
  });

  it('moves submitted and excused work into a compact closed list without counting it as outstanding', () => {
    const fixture = report([
      item({ id: 'done', kind: 'quiz', title: 'Submitted LPQ', status: 'submitted', digest: digest() }),
      item({ id: 'excused', kind: 'assignment', title: 'Excused essay', status: 'excused' }),
      item({ id: 'active', kind: 'assignment', title: 'Active essay', status: 'not_submitted' }),
    ]);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    const initial = initialView(html);
    expect(initial).toContain('1 项待办安排');
    expect(initial).toContain('Active essay');
    expect(initial).not.toContain('Submitted LPQ');
    expect(initial).not.toContain('Excused essay');
    expect(html).toContain('<details class="cb-completed">');
    expect(html).toContain('Submitted LPQ');
    expect(html).toContain('Canvas 已豁免');
    expect(html).not.toContain('cb-item-done');
  });

  it('only promotes future individually weighted assessments at or above 10 percent', () => {
    const future = { value: '2026-09-21', precision: 'date' as const, origin: 'document' as const, raw: 'September 21', timeZone: 'America/Toronto' };
    const weighted = item({ id: 'major', kind: 'assignment', title: 'Major essay', dateRole: 'deadline', date: future, assessmentWeight: { percent: 10, basis: 'individual', evidence: [{ sourceId: 's1', quote: 'Read Chapter 3 by September 18.' }] } });
    const fixture = report([
      weighted,
      { ...weighted, id: 'small', assessmentWeight: { ...weighted.assessmentWeight!, percent: 9 } },
      { ...weighted, id: 'done', status: 'submitted' },
      { ...weighted, id: 'conditional', context: 'conditional' },
      { ...weighted, id: 'conflict', dateStatus: 'conflict' },
      { ...weighted, id: 'group-total', assessmentWeight: { ...weighted.assessmentWeight!, basis: 'category' } as unknown as BriefItem['assessmentWeight'] },
      { ...weighted, id: 'missing-proof', assessmentWeight: { ...weighted.assessmentWeight!, evidence: [] } },
      { ...weighted, id: 'this-week', date: { ...future, value: '2026-09-18' } },
      { ...weighted, id: 'beyond-horizon', date: { ...future, value: '2026-10-05' } },
    ]);
    expect(selectMajorAssessments(fixture).map((entry) => entry.id)).toEqual(['major']);
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    const majorSection = html.split('大作业，提前准备')[1].split('其他日期的已知安排')[0];
    expect(majorSection).toContain('本项占总成绩 10%');
    expect(majorSection.match(/Major essay/g)).toHaveLength(1);
    expect(verifiedAssessmentWeight({ ...weighted, assessmentWeight: { ...weighted.assessmentWeight!, evidence: [{ sourceId: 'other-course', quote: 'Essay 10%' }] } }, fixture)).toBeUndefined();
  });

  it('shows guides only for the report week and handles unavailable lecture content honestly', () => {
    const lecture = item({ kind: 'lecture', title: 'Lecture 3', guide: { status: 'ready', overview: '这一讲解释记忆如何被重新提取。', concepts: ['提取线索', '编码环境'], preparation: ['先想一个想不起名字的例子。'], evidence: [{ sourceId: 's1', quote: 'Read Chapter 3 by September 18.' }] } });
    const html = renderToStaticMarkup(<BriefItemCard item={lecture} report={report()} />);
    expect(initialView(html)).toContain('这一讲解释记忆如何被重新提取');
    const otherWeek = { ...report(), weekStart: '2026-09-21' };
    expect(renderToStaticMarkup(<BriefItemCard item={lecture} report={otherWeek} />)).not.toContain('这一讲解释记忆如何被重新提取');
    const unavailable = { ...lecture, guide: { status: 'unavailable' as const, reason: '本周课件尚未发布。' } };
    expect(renderToStaticMarkup(<BriefItemCard item={unavailable} report={report()} />)).toContain('本周课件尚未发布');
    const uncertain = { ...lecture, dateStatus: 'needs_confirmation' as const };
    expect(renderToStaticMarkup(<BriefItemCard item={uncertain} report={report()} />)).not.toContain('这一讲解释记忆如何被重新提取');
  });

  it('includes a scheduled calendar exam with a verified individual weight as an upcoming major assessment', () => {
    const exam = item({ id: 'calendar-exam', kind: 'exam', title: 'Midterm exam', dateRole: 'start', date: { value: '2026-09-28T14:00:00Z', precision: 'datetime', origin: 'canvas', raw: '2026-09-28T14:00:00Z', timeZone: 'UTC' }, assessmentWeight: { percent: 25, basis: 'individual', evidence: [{ sourceId: 's1', quote: 'Read Chapter 3 by September 18.' }] } });
    const fixture = report([exam]);
    expect(selectMajorAssessments(fixture).map((entry) => entry.id)).toEqual(['calendar-exam']);
    const html = renderToStaticMarkup(<BriefItemCard item={exam} report={fixture} />);
    expect(initialView(html)).toContain('考试时间 · ');
    expect(initialView(html)).toContain('10:00');
    expect(initialView(html)).not.toContain('截止 · ');
  });

  it('keeps technical gaps and unassigned catalog information below the main summary', () => {
    const fixture = report([item({ kind: 'lecture', date: undefined, dateStatus: 'unspecified', title: 'Unassigned lecture' })]);
    fixture.coverage[0] = { ...fixture.coverage[0], status: 'unavailable', detail: 'Permission diagnostics are long and specific.' };
    fixture.organizingStatus = 'partial';
    const html = renderToStaticMarkup(<CanvasBriefReportView report={fixture} />);
    expect(initialView(html)).toContain('这次读取有缺口');
    expect(initialView(html)).not.toContain('Permission diagnostics');
    expect(initialView(html)).not.toContain('Unassigned lecture');
    expect(html).toContain('Permission diagnostics');
  });

  it('does not load saved private course data or trigger sync from the initial render', () => {
    const html = renderToStaticMarkup(<CanvasWeeklyBrief ownerId="owner-b" />);
    expect(html).toContain('先连接你的学校');
    expect(html).not.toContain('PSY494');
    expect(html).toContain('type="password"');
  });

  it('shows a model quota failure without claiming Canvas source data is missing', () => {
    const fixture = report([item()]);
    fixture.organizingStatus = 'partial';
    fixture.coverage.push({ courseId: 12, area: 'digest', label: '中文摘要', status: 'partial', detail: 'Astra 的额度或请求频率受限，请检查 API 额度，或稍后重试。', sourceCount: 0 });
    const initial = initialView(renderToStaticMarkup(<CanvasBriefReportView report={fixture} />));
    expect(initial).toContain('已读取的安排保留');
    expect(initial).toContain('Astra 的额度或请求频率受限');
    expect(initial).not.toContain('这次读取有缺口');
  });

  it.each(['javascript:alert(1)', 'data:text/html,test', '//school.example/', 'https://secret:token@school.example/'])('rejects unsafe source URL %s', (value) => {
    expect(briefSafeUrl(value)).toBeUndefined();
  });
});
