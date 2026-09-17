import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, ExternalLink, FileText, GraduationCap, Link2, Loader2, RefreshCw, Settings2, ShieldCheck, X } from 'lucide-react';
import {
  clearCanvasConnection, downloadCanvasFile, listCanvasCourses, loadCanvasConnection,
  saveCanvasConnection, testCanvasConnection,
  type CanvasConnection, type CanvasCourse, type CanvasFile, type CanvasProfile,
} from '@/services/canvas';
import { readOneSyllabus } from './readOneSyllabus';
import { organizeSavedSyllabus, syncCourseBrief } from './sync';
import { updateSavedBrief } from './processing';
import { lectureFileCandidates, allowedLectureFile } from './lectureFiles';
import { addWeeklyLectureGuides } from './lectureGuides';
import { loadBriefStore, saveBriefStore } from './store';
import { addDays, briefDateKey, currentWeekStart, dateInZone } from './dates';
import { SyllabusSources, SyllabusReportStatus, syllabusMissingArrangement } from './SyllabusSources';
import { readSyllabusSelections, saveSyllabusSelections, syllabusScopeKey } from './syllabusStore';
import type { BriefEvidence, BriefItem, BriefSource, BriefSyllabusSelection, CourseBriefReport } from './types';
import './brief.css';

interface CanvasWeeklyBriefProps {
  ownerId: string;
  onImport?: (files: File[]) => Promise<void>;
  onReportChange?: (report: CourseBriefReport | null) => void;
}
const KIND_LABELS: Record<BriefItem['kind'], string> = {
  assignment: '作业', quiz: '小测', exam: '考试', discussion: '讨论', lecture: '课件 / 课程', reading: '阅读', notice: '注意事项',
};
const REQUIREMENT_LABELS: Record<BriefItem['requirement'], string> = {
  required: '课程要求', optional: '选做 / 选读', unspecified: '是否必做未明确',
};
const STATUS_LABELS: Record<BriefItem['status'], string> = {
  submitted: 'Canvas 已提交', not_submitted: 'Canvas 尚未提交', excused: 'Canvas 已豁免', unknown: '',
};
const dateLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(date);
};
const stamp = (value: string, timeZone: string) => {
  try { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone, hour12: false }).format(new Date(value)); }
  catch { return '时间未明确'; }
};
export const briefSafeUrl = (value: string): string | undefined => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
};
const originOf = (value: string): string => {
  try { return new URL(value).origin; } catch { return ''; }
};
const validZone = (value: string): boolean => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return !!value.trim(); } catch { return false; }
};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const isMonday = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).getUTCDay() === 1;
const mondayOf = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return addDays(value, -((date.getUTCDay() + 6) % 7));
};
export const briefHasGaps = (report: CourseBriefReport): boolean => report.analysisStatus !== 'complete' || report.organizingStatus === 'partial' || report.coverage.some((area) => area.status === 'partial' || area.status === 'unavailable');
const itemDay = (item: BriefItem, report: CourseBriefReport): string => {
  if (item.dateStatus !== 'confirmed' || !item.date) return '';
  try { return briefDateKey(item.date, report.timeZone); } catch { return ''; }
};
const itemWeek = (item: BriefItem): string => item.dateStatus === 'confirmed' && item.weekStart && isMonday(item.weekStart) ? item.weekStart : '';
const isLearningArrangement = (item: BriefItem) => item.kind === 'lecture' || item.kind === 'reading';
export const groupBriefItems = (report: CourseBriefReport) => {
  const end = addDays(report.weekStart, 7);
  const horizon = addDays(report.weekStart, 21);
  const groups: Record<'thisWeek' | 'upcoming' | 'unresolved' | 'other' | 'reference' | 'unassigned', BriefItem[]> = { thisWeek: [], upcoming: [], unresolved: [], other: [], reference: [], unassigned: [] };
  for (const item of report.items) {
    const day = itemDay(item, report) || itemWeek(item);
    if (item.dateStatus === 'conflict') groups.unresolved.push(item);
    else if (item.context === 'conditional' || item.context === 'reference') groups.reference.push(item);
    else if (!day && isLearningArrangement(item)) groups.unassigned.push(item);
    else if (!day && (item.requirement === 'optional' || item.kind === 'notice')) groups.reference.push(item);
    else if (!day) groups.unresolved.push(item);
    else if (day >= report.weekStart && day < end) groups.thisWeek.push(item);
    else if (day >= end && day < horizon) groups.upcoming.push(item);
    else groups.other.push(item);
  }
  const byDate = (a: BriefItem, b: BriefItem) => (itemDay(a, report) || itemWeek(a)).localeCompare(itemDay(b, report) || itemWeek(b)) || (a.date?.value || '').localeCompare(b.date?.value || '');
  groups.thisWeek.sort(byDate); groups.upcoming.sort(byDate); groups.other.sort(byDate);
  return groups;
};
const catalogOnly = (source: BriefSource) => source.readMode === 'catalog' || (!source.readMode && source.id.includes(':resource:'));
export const briefSourceCatalog = (sources: BriefSource[]): BriefSource[] => {
  const catalog = new Map<string, BriefSource>();
  for (const source of sources) {
    const key = source.fileId ? `${source.courseId}:pdf:${source.fileId}` : source.id;
    const previous = catalog.get(key);
    if (!previous || (catalogOnly(previous) && !catalogOnly(source)) || (!catalogOnly(source) && !catalogOnly(previous) && (source.page || Infinity) < (previous.page || Infinity))) catalog.set(key, source);
  }
  return [...catalog.values()];
};
const sourceHref = (source: BriefSource) => {
  const url = briefSafeUrl(source.url);
  if (!url) return undefined;
  if (source.page && /\.pdf(?:[?#]|$)/i.test(url)) return `${url.split('#')[0]}#page=${source.page}`;
  return url;
};
// The source contract only sets fileId for PDF material; validate the downloaded bytes as well.
const importableSource = (source: BriefSource) => !!source.fileId && (source.kind === 'file' || source.kind === 'module');
const isCompleted = (item: BriefItem) => item.status === 'submitted' || item.status === 'excused';
const validItemEvidence = (entries: BriefEvidence[] | undefined, item: BriefItem, report: CourseBriefReport) => (entries || []).filter((entry) => entry.quote.trim() && report.sources.some((source) => source.id === entry.sourceId && source.courseId === item.courseId));
export const verifiedAssessmentWeight = (item: BriefItem, report: CourseBriefReport): number | undefined => {
  const weight = item.assessmentWeight;
  return weight?.basis === 'individual' && Number.isFinite(weight.percent) && weight.percent > 0 && weight.percent <= 100 && validItemEvidence(weight.evidence, item, report).length > 0 ? weight.percent : undefined;
};
export const selectMajorAssessments = (report: CourseBriefReport): BriefItem[] => groupBriefItems(report).upcoming.filter((item) => {
  const weight = verifiedAssessmentWeight(item, report);
  return !isCompleted(item) && item.context !== 'conditional' && item.context !== 'reference' && (item.dateRole === 'deadline' || item.kind === 'exam' && item.dateRole === 'start')
    && item.dateStatus === 'confirmed' && !!itemDay(item, report) && ['assignment', 'exam', 'quiz', 'discussion'].includes(item.kind)
    && weight != null && weight >= 10;
});
const isThisWeek = (item: BriefItem, report: CourseBriefReport) => {
  const day = itemDay(item, report) || itemWeek(item);
  return !!day && day >= report.weekStart && day < addDays(report.weekStart, 7);
};
const canPrepare = (item: BriefItem, report: CourseBriefReport) => {
  if (isCompleted(item) || item.context === 'conditional' || item.context === 'reference' || item.dateStatus === 'conflict') return false;
  const day = itemDay(item, report);
  if (!day) return !!itemWeek(item) && itemWeek(item) >= currentWeekStart(report.timeZone);
  return day >= dateInZone(new Date(), report.timeZone) && (item.date?.precision !== 'datetime' || Date.parse(item.date.value) > Date.now());
};

export function BriefItemCard({ item, report, onImportSource, importingId, onGuide, onSelectLectureFile }: {
  item: BriefItem; report: CourseBriefReport; onImportSource?: (source: BriefSource) => void; importingId?: number | null;
  onGuide?: (itemId: string, fileId: number) => void;
  onSelectLectureFile?: (itemId: string, fileId: number) => void;
}) {
  const [guideFile, setGuideFile] = useState(String(item.lectureFile?.fileId || ''));
  const [showOtherFiles, setShowOtherFiles] = useState(false);
  useEffect(() => { setGuideFile(String(item.lectureFile?.fileId || '')); }, [item.id, item.lectureFile?.fileId]);
  const course = report.courses.find((entry) => entry.id === item.courseId);
  const day = itemDay(item, report);
  const week = itemWeek(item);
  const url = briefSafeUrl(item.url);
  const evidence = [...new Map([...item.evidence, ...(item.digest?.evidence || []), ...(item.assessmentWeight?.evidence || []), ...(item.guide?.evidence || [])].map((entry) => [`${entry.sourceId}:${entry.quote}`, entry])).values()];
  const linkedSources = evidence.map((entry) => ({ ...entry, source: report.sources.find((source) => source.id === entry.sourceId && source.courseId === item.courseId) }));
  const pdfSources = item.kind === 'lecture'
    ? [...new Map(report.sources.filter(source => source.fileId === item.lectureFile?.fileId && allowedLectureFile(source, item)).map(source => [source.fileId, source])).values()]
    : [...new Map(linkedSources.filter(({ source }) => source && importableSource(source) && source.documentRole !== 'syllabus' && source.resourceRole !== 'syllabus').map(({ source }) => [source!.fileId, source!])).values()];
  const needsConfirmation = !day && !week;
  const weight = verifiedAssessmentWeight(item, report);
  const digest = item.digest && validItemEvidence(item.digest.evidence, item, report).length > 0 ? item.digest : undefined;
  const guide = item.kind === 'lecture' && isThisWeek(item, report) ? item.guide : undefined;
  const readyGuide = guide?.status === 'ready' && validItemEvidence(guide.evidence, item, report).length > 0 ? guide : undefined;
  const preparation = canPrepare(item, report) ? (readyGuide?.preparation?.length ? readyGuide.preparation : digest?.preparation || []).slice(0, 2) : [];
  const candidates = lectureFileCandidates(item, report);
  const guideFiles = candidates.filter(candidate => showOtherFiles || candidate.score > 0 || candidate.source.fileId === item.lectureFile?.fileId);
  const chosen = candidates.find(candidate => candidate.source.fileId === Number(guideFile));
  const associated = !!chosen && item.lectureFile?.fileId === chosen.source.fileId;

  return <article className={`cb-item ${item.status === 'submitted' || item.status === 'excused' ? 'cb-item-done' : ''}`}>
    <div className="cb-item-top"><span className="cb-course-label">{course?.course_code || course?.name || '课程信息未明确'}</span><span>{KIND_LABELS[item.kind]}</span>{item.requirement !== 'unspecified' && <span className={`cb-requirement ${item.requirement}`}>{REQUIREMENT_LABELS[item.requirement]}</span>}{weight != null && <span className="cb-weight">本项占总成绩 {weight}%</span>}</div>
    <h4>{item.title}</h4>
    <div className="cb-item-meta">
      {day ? <span className="cb-date"><CalendarDays size={14} />{item.kind === 'exam' && item.dateRole === 'start' ? '考试时间 · ' : item.dateRole === 'deadline' ? '截止 · ' : item.dateRole === 'start' ? '开始 · ' : item.dateRole === 'reading' ? '阅读安排 · ' : '时间 · '}{dateLabel(day)}{item.date?.precision === 'datetime' ? ` · ${stamp(item.date.value, report.timeZone).split(' ').slice(-1)[0]}` : /\d{1,2}:\d{2}/.test(item.date?.raw || '') ? ` · 原文：${item.date?.raw}（时区未确认）` : ' · 未给出具体时刻'}</span>
        : week ? <span className="cb-date"><CalendarDays size={14} />{week === report.weekStart ? '本周安排' : `${dateLabel(week)}起的一周`} · 未指定具体日期</span>
          : item.dateStatus === 'conflict' ? <span className="cb-date-unresolved"><AlertCircle size={14} />日期冲突，待确认</span>
            : <span className={isLearningArrangement(item) || item.context === 'reference' || item.context === 'conditional' || item.requirement === 'optional' || item.kind === 'notice' ? 'cb-date-neutral' : 'cb-date-unresolved'}>{item.context === 'conditional' ? '特定情况适用' : isLearningArrangement(item) ? '尚未对应到具体周次' : item.context === 'reference' || item.kind === 'notice' ? '课程参考信息' : item.dateStatus === 'needs_confirmation' ? '日期待确认' : '日期未明确'}</span>}
      {STATUS_LABELS[item.status] && <span className="cb-submission">{item.status === 'submitted' || item.status === 'excused' ? <Check size={14} /> : null}{STATUS_LABELS[item.status]}</span>}
    </div>
    {digest ? <div className="cb-digest"><p className="cb-digest-overview">{digest.overview}</p>{digest.keyRequirements.length > 0 && <div className="cb-key-requirements"><strong>{isLearningArrangement(item) ? '阅读与课前要求' : '关键要求'}</strong><ul>{digest.keyRequirements.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}</div>
      : !isLearningArrangement(item) && <p className="cb-digest-pending">作业或事项摘要尚未生成，可展开查看原始要求。</p>}
    {item.kind === 'lecture' && isThisWeek(item, report) && <p className="cb-section-intro">导读：{readyGuide ? '已生成' : guide ? '生成未完成' : '尚未生成'}</p>}
    {guide && <div className="cb-lecture-guide"><p className="cb-eyebrow">这一讲的导读</p>{readyGuide ? <><p>{readyGuide.overview}</p>{readyGuide.concepts && readyGuide.concepts.length > 0 && <ul>{readyGuide.concepts.slice(0, 3).map((concept, index) => <li key={index}>{concept}</li>)}</ul>}</> : <p className="cb-guide-unavailable">{guide.reason || '尚未取得这一讲可核对的课件，导读暂未生成。'}</p>}</div>}
    {preparation.length > 0 && <div className="cb-item-preparation"><strong>建议先做 · 可按自己的节奏安排</strong><ul>{preparation.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    {item.kind === 'lecture' && isThisWeek(item, report) && <div className="cb-syllabus-actions">
      {candidates.length > 0 ? <>
        <label><span>选择本讲课件 · 推荐项仍需你确认</span><select disabled={!onSelectLectureFile} value={guideFile} onChange={event => setGuideFile(event.target.value)}>
          <option value="">选择本讲课件</option>{guideFiles.map(({ source, score, role, conflict }) => <option key={source.fileId} value={source.fileId}>{source.title}{conflict ? '（讲次编号不同）' : score > 0 ? '（推荐）' : role === 'unknown' ? '（用途待确认）' : ''}</option>)}
        </select></label>
        <button type="button" className="cb-text-link" onClick={() => setShowOtherFiles(value => !value)}>{showOtherFiles ? '只看推荐课件' : '查看本课其他课件'}</button>
        {chosen && !associated && <button type="button" className="cb-text-link" disabled={!onSelectLectureFile} onClick={() => onSelectLectureFile?.(item.id, chosen.source.fileId!)}>确认这是本讲课件</button>}
        {associated && <span>已保存本讲课件</span>}
        {onGuide && <button type="button" className="cb-text-link" disabled={!associated} onClick={() => onGuide(item.id, Number(guideFile))}>{readyGuide ? '重新生成本讲导读' : '生成本讲导读'}（最多 1 次 AI 请求）</button>}
      </> : <p className="cb-section-intro">当前保存的目录中没有合适课件。同步可更新文件目录；不会自动阅读课件正文。</p>}
    </div>}
    <div className="cb-item-actions">
      <details className="cb-evidence cb-full-details"><summary><Link2 size={14} />完整要求与原文依据 <ChevronDown size={13} /></summary><div className="cb-evidence-body">
        {item.details && <section className="cb-raw-description"><h5>原始说明</h5><p>{item.details}</p></section>}
        {item.requirement === 'unspecified' && <p className="cb-date-origin">来源未明确标注必做或选做。</p>}
        {needsConfirmation && item.dateText && <p className="cb-raw-date">材料中的时间说法：{item.dateText}</p>}
        {item.issues.length > 0 && <ul className="cb-item-issues">{item.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
        {weight != null && <p className="cb-date-origin">本项占总成绩 {weight}%，按下方课程原文核对；类别合计不作为单项占比。</p>}
        {linkedSources.length === 0 && <p>未提供可核对的原文，请在 Canvas 中确认。</p>}
        {linkedSources.map(({ sourceId, quote, source }, index) => <div className="cb-citation" key={`${sourceId}:${index}`}>
          <p className="cb-source-title">{source?.title || '来源暂不可用'}{source?.page ? ` · PDF 第 ${source.page} 页` : ''}</p>
          {quote && <blockquote>{quote}</blockquote>}
          {source && <div className="cb-source-meta"><span>读取于 {stamp(source.fetchedAt, report.timeZone)}</span>{source.updatedAt && <span>来源更新于 {stamp(source.updatedAt, report.timeZone)}</span>}{sourceHref(source) && <a href={sourceHref(source)} target="_blank" rel="noopener noreferrer">打开来源 <ExternalLink size={12} /></a>}</div>}
        </div>)}
        {item.date && <p className="cb-date-origin">日期依据：{item.date.origin === 'canvas' ? 'Canvas 结构化日期' : '课程材料原文'} · 原始值：{item.date.raw} · 显示时区：{report.timeZone}</p>}
        {item.date?.context && <p className="cb-date-origin">日期对应依据：{item.date.context}</p>}
        {item.weekContext && <p className="cb-date-origin">周次对应依据：{item.weekContext}</p>}
        {item.status === 'submitted' && <p className="cb-date-origin">已提交仅指 Canvas 返回的提交状态，不代表已经学会或完成批改。</p>}
      </div></details>
      {url && <a className="cb-text-link" href={url} target="_blank" rel="noopener noreferrer">{isLearningArrangement(item) ? '打开材料或安排' : '去 Canvas 查看'} <ExternalLink size={13} /></a>}
      {onImportSource && pdfSources.map((source) => <button type="button" key={source.fileId} disabled={importingId != null} className="cb-text-link" onClick={() => onImportSource(source)}>{importingId === source.fileId ? <Loader2 size={14} className="cb-spin" /> : <BookOpen size={14} />}导入 PDF 学习{pdfSources.length > 1 ? ` · ${source.title}` : ''}</button>)}
    </div>
  </article>;
}

export function CanvasBriefReportView({ report, onImportSource, importingId, onGuide, onSelectLectureFile, onReadSyllabus }: {
  report: CourseBriefReport; onImportSource?: (source: BriefSource) => void; importingId?: number | null;
  onGuide?: (itemId: string, fileId: number) => void;
  onSelectLectureFile?: (itemId: string, fileId: number) => void;
  onReadSyllabus?: (courseId: number) => void;
}) {
  const groups = groupBriefItems(report);
  const sourceCatalog = briefSourceCatalog(report.sources);
  const learning = groups.thisWeek.filter(isLearningArrangement);
  const tasks = groups.thisWeek.filter((item) => !isLearningArrangement(item) && !isCompleted(item));
  const completed = groups.thisWeek.filter((item) => !isLearningArrangement(item) && isCompleted(item));
  const dailyTasks = tasks.filter((item) => itemDay(item, report));
  const weeklyTasks = tasks.filter((item) => !itemDay(item, report));
  const majors = selectMajorAssessments(report);
  const otherUpcoming = groups.upcoming.filter((item) => !majors.some((major) => major.id === item.id));
  const conflicts = groups.unresolved.filter((item) => item.dateStatus === 'conflict' && !isCompleted(item) && item.context !== 'conditional' && item.context !== 'reference');
  const remainingUnresolved = groups.unresolved.filter((item) => !conflicts.some((conflict) => conflict.id === item.id));
  const renderCard = (item: BriefItem) => <BriefItemCard key={item.id} item={item} report={report} onImportSource={onImportSource} importingId={importingId} onGuide={onGuide} onSelectLectureFile={onSelectLectureFile} />;
  const days = Array.from({ length: 7 }, (_, index) => addDays(report.weekStart, index));
  const lectureCount = learning.filter((item) => item.kind === 'lecture').length;
  const readingCount = learning.filter((item) => item.kind === 'reading').length;
  const organizingAreas = new Set(['digest', 'assessment_weights']);
  const organizingErrors = [...new Set(report.coverage.filter(area => organizingAreas.has(area.area)
    && (area.status === 'partial' || area.status === 'unavailable')).map(area => area.detail))];
  const readingGaps = report.analysisStatus !== 'complete' || report.coverage.some(area => !organizingAreas.has(area.area)
    && (area.status === 'partial' || area.status === 'unavailable'));
  return <div className="cb-report">
    <div className="cb-report-heading"><div><p className="cb-eyebrow">COURSE BRIEF · {report.courses.length} 门课程</p><h2>{dateLabel(report.weekStart).replace(/周./, '').trim()} — {dateLabel(addDays(report.weekStart, 6)).replace(/周./, '').trim()}</h2><p>上次读取 {stamp(report.fetchedAt, report.timeZone)} · 时间按 {report.timeZone} 显示</p></div><span className={`cb-snapshot-label ${briefHasGaps(report) ? 'has-gaps' : ''}`}><ShieldCheck size={15} />{briefHasGaps(report) ? '部分信息待核对' : '已读取来源快照'}</span></div>
    <section className="cb-week-overview" aria-label="本周概览"><p className="cb-eyebrow">这一周，先看这些</p><p>已找到 <strong>{lectureCount} 项讲次安排</strong>、<strong>{readingCount} 项阅读</strong>；本周另有 <strong>{tasks.length} 项待办安排</strong>，后两周有 <strong>{majors.length} 项占比至少 10% 的任务</strong>需要提前留意。</p>{completed.length > 0 && <small>Canvas 已标记 {completed.length} 项本周任务提交或豁免，收在「本周已完成」。</small>}</section>
    {(report.pipelineVersion !== 2) && <div className="cb-scope-notice" role="status"><BookOpen size={17} /><p>这是旧流程保存的简报。新版会复用课程安排表，并记录请求次数与用量；旧简报不会自动重跑。</p></div>}
    {report.run && <details className="cb-secondary-details"><summary>本次处理记录 · {report.run.requests} 次 AI 请求 · {report.run.cacheHits} 份缓存复用 <ChevronDown size={15} /></summary><p className="cb-section-intro">AI 整理阶段用时 {Math.ceil(report.run.elapsedMs / 1000)} 秒。已返回用量：输入 {report.run.inputTokens.toLocaleString()} tokens，输出 {report.run.outputTokens.toLocaleString()} tokens。{report.run.unknownUsage > 0 ? `另有 ${report.run.unknownUsage} 次请求未返回用量，不代表没有费用。` : ''}金额以 API 账单为准。新版每轮最多 12 次请求、累计 48,000 输出 token 预算；单次最多 60 秒，AI 阶段最多 4 分钟，失败后不自动重试。</p></details>}
    {report.run?.stoppedReason && <div className="cb-compact-gap" role="status"><AlertCircle size={16} /><span>{report.run.stoppedReason}</span></div>}
    {!!report.run?.attempts?.length && <details className="cb-secondary-details"><summary>每次整理请求的详情 <ChevronDown size={15} /></summary>
      <p className="cb-section-intro">这里只列真正发送的请求。未发送的课程不会算成请求失败；等待服务回复包含网络等待和模型生成，不能据此判断模型是否已经读懂。</p>
      <ul>{report.run.attempts.map((attempt, index) => <li key={index}>
        <strong>{attempt.label}</strong> · {{ running: '进行中', completed: '已返回', timeout: '超时', failed: '失败', cancelled: '已取消' }[attempt.status]}
        {' · '}{Math.ceil(attempt.elapsedMs / 1000)} 秒 · 输入 {attempt.inputChars.toLocaleString()} 字符
        {attempt.outputChars !== undefined ? ` · 返回 ${attempt.outputChars.toLocaleString()} 字符` : ' · 未取得完整返回'}
        {attempt.failureStage && <span> · {({ waiting_for_response: '等待 AI 服务回复', reading_response: '接收 AI 服务返回', parsing_response: '解析 AI 服务返回' } as Record<string, string>)[attempt.failureStage] || '处理返回内容'}</span>}
        {attempt.errorCode && <small>（{attempt.errorCode}）</small>}
      </li>)}</ul>
    </details>}
    {report.pipelineVersion === 2 && <p className="cb-section-intro">课程文字由 AI 整理，程序检查原文位置和日期格式。每条都可展开核对；日期有冲突时会保留两处来源。</p>}
    {readingGaps && <div className="cb-compact-gap" role="status"><AlertCircle size={16} /><span>这次读取有缺口，任务与阅读安排可能有遗漏；具体来源情况收在下方「读取范围与来源」。</span></div>}
    {(report.organizingStatus === 'partial' || organizingErrors.length > 0) && <div className="cb-compact-gap" role="status"><AlertCircle size={16} /><span>已读取的安排保留，部分摘要或评分占比尚未整理。{organizingErrors.length > 0 ? organizingErrors.join('；') : '具体情况请查看下方「读取范围与来源」。'}</span></div>}
    {conflicts.length > 0 && <details className="cb-conflicts"><summary><AlertCircle size={16} /><strong>{conflicts.length} 项任务日期有冲突，请核对后安排</strong><ChevronDown size={15} /></summary><div className="cb-card-grid">{conflicts.map(renderCard)}</div></details>}
    {report.changes.length > 0 && <details className="cb-changes"><summary><RefreshCw size={15} /><span>与上次相比，有 {report.changes.length} 处变化</span><ChevronDown size={15} /></summary><div>{report.changes.map((change) => <article key={change.id}><span className="cb-course-label">{report.courses.find((course) => course.id === change.courseId)?.course_code}</span><strong>{change.title}</strong><p>{change.kind === 'added' ? '新读取到的信息' : change.kind === 'no_longer_returned' ? '本次没有返回这项信息；不能据此认定任务已取消。' : '来源信息发生变化'}</p>{change.before && <p>上次：{change.before}</p>}{change.after && <p>本次：{change.after}</p>}{briefSafeUrl(change.url) && <a className="cb-text-link" href={briefSafeUrl(change.url)} target="_blank" rel="noopener noreferrer">核对变化 <ExternalLink size={12} /></a>}</article>)}</div></details>}
    <section className="cb-section cb-learning-section"><div className="cb-section-title"><h3><BookOpen size={20} />这周上什么，读什么</h3><span>{learning.length} 项已对应到本周</span></div><p className="cb-section-intro">讲次、主题与指定阅读按课程整理；课程大纲中可查看已保存的整学期安排表。</p>
      <div className="cb-learning-courses">{report.courses.map((course) => {
        const lectures = learning.filter((item) => item.courseId === course.id && item.kind === 'lecture');
        const readings = learning.filter((item) => item.courseId === course.id && item.kind === 'reading');
        const missing = [!lectures.length ? '讲次' : '', !readings.length ? '阅读清单' : ''].filter(Boolean).join('和');
        const syllabus = report.syllabi?.find((entry) => entry.courseId === course.id);
        const unresolvedLearning = groups.unassigned.filter(item => item.courseId === course.id);
        const scopeGaps = syllabus?.processing?.problems.filter(problem => problem.kind === 'scope' || problem.kind === 'extraction') || [];
        return <article className="cb-learning-course" key={course.id}><header><span className="cb-course-label">{course.course_code || course.name}</span><h4>{course.name}</h4><SyllabusReportStatus status={syllabus} /></header>
          {syllabus?.fileId && (syllabus.status === 'read_failed' || syllabus.status === 'read_partial') && onReadSyllabus && <button type="button" className="cb-text-link" onClick={() => onReadSyllabus(course.id)}>仅重新读取本课大纲（不调用 AI）</button>}
          {(lectures.length > 0 || readings.length > 0) && <p className="cb-arrangement-note">本周已找到 {lectures.length} 项讲次、{readings.length} 项阅读。{scopeGaps.length || unresolvedLearning.length || !syllabus?.processing ? '课表范围仍有未核对部分，已找到的安排可先使用。' : '已保存的课表日期已对应；最新公告变更仍以上次同步为准。'}</p>}
          {unresolvedLearning.length > 0 && <details className="cb-syllabus-detail"><summary>{unresolvedLearning.length} 项讲次或阅读尚不能确定属于哪周</summary><ul>{unresolvedLearning.map(item => <li key={item.id}>{item.title} · 原文日期：{item.dateText || '未记录'}</li>)}</ul></details>}
          {(lectures.length > 0 || readings.length > 0) && <div className="cb-learning-columns">
            {lectures.length > 0 && <div><h5><GraduationCap size={16} />本周 Lecture</h5><div>{lectures.map(renderCard)}</div></div>}
            {readings.length > 0 && <div><h5><BookOpen size={16} />本周 Reading</h5><div>{readings.map(renderCard)}</div></div>}
          </div>}
          {missing && <p className="cb-arrangement-note">{syllabusMissingArrangement(syllabus, missing)}</p>}
        </article>;
      })}</div>
    </section>
    <section className="cb-section cb-week-tasks"><div className="cb-section-title"><h3><CalendarDays size={20} />本周任务与截止时间</h3><span>{tasks.length} 项待办</span></div><p className="cb-section-intro">按日期查看要交什么、关键要求，以及建议先做哪一步。Calendar 的课程事件也会整理在这里。</p>
      {tasks.length === 0 ? <div className="cb-empty"><CalendarDays size={24} /><p>这次读取中，暂未找到该周待办的任务或课程事件。</p><span>不代表本周没有任务；仍需留意尚未明确的安排与读取范围。</span></div> : <div className="cb-timeline">{days.map((day) => { const items = dailyTasks.filter((item) => itemDay(item, report) === day); return items.length > 0 ? <section className="cb-day" key={day}><div className="cb-day-label"><span>{dateLabel(day)}</span></div><div className="cb-day-items">{items.map(renderCard)}</div></section> : null; })}</div>}
      {weeklyTasks.length > 0 && <div className="cb-weekly-tasks"><p className="cb-section-intro">以下任务明确属于本周，来源未指定具体日期。</p><div className="cb-card-grid">{weeklyTasks.map(renderCard)}</div></div>}
      {completed.length > 0 && <details className="cb-completed"><summary><Check size={16} />本周已完成 <span>{completed.length} 项</span><ChevronDown size={15} /></summary><ul>{completed.map((item) => <li key={item.id}><div><span className="cb-course-label">{report.courses.find((course) => course.id === item.courseId)?.course_code}</span><strong>{item.title}</strong><small>{itemDay(item, report) ? dateLabel(itemDay(item, report)) : '本周安排'} · {STATUS_LABELS[item.status]}</small></div>{briefSafeUrl(item.url) && <a className="cb-text-link" href={briefSafeUrl(item.url)} target="_blank" rel="noopener noreferrer">查看记录 <ExternalLink size={12} /></a>}</li>)}</ul><p>提交与豁免状态以本次 Canvas 返回为准。</p></details>}
    </section>
    <section className="cb-section cb-major-section"><div className="cb-section-title"><h3><ArrowRight size={20} />大作业，提前准备</h3><span>{majors.length} 项</span></div><p className="cb-section-intro">{dateLabel(addDays(report.weekStart, 7))} — {dateLabel(addDays(report.weekStart, 20))} 到期或举行、单项占总成绩至少 10% 的作业或考试。本周截止的已放在上方。</p>{majors.length > 0 ? <div className="cb-card-grid">{majors.map(renderCard)}</div> : <p className="cb-inline-empty">当前来源中，尚未找到符合这个日期范围且单项占比已明确的任务。</p>}</section>
    {(otherUpcoming.length > 0 || groups.other.length > 0) && <details className="cb-secondary-details"><summary>其他日期的已知安排 <span>{otherUpcoming.length + groups.other.length} 项</span><ChevronDown size={15} /></summary><p className="cb-section-intro">保留其他近期事项与远期截止日期；日期较早不等于仍然欠交。</p><div className="cb-card-grid">{[...otherUpcoming, ...groups.other].map(renderCard)}</div></details>}
    {remainingUnresolved.length > 0 && <details className="cb-secondary-details"><summary>尚未明确的任务安排 <span>{remainingUnresolved.length} 项</span><ChevronDown size={15} /></summary><div className="cb-card-grid">{remainingUnresolved.map(renderCard)}</div></details>}
    {groups.unassigned.length > 0 && <details className="cb-secondary-details"><summary><BookOpen size={16} />尚未对应周次的课程安排 <span>{groups.unassigned.length} 项</span><ChevronDown size={15} /></summary><p className="cb-section-intro">这些讲次与阅读材料的周次还没有可靠依据，暂不放进本周清单。</p>{report.courses.map((course) => { const items = groups.unassigned.filter((item) => item.courseId === course.id); return items.length > 0 ? <section className="cb-unassigned-course" key={course.id}><h4>{course.course_code || course.name}</h4><div className="cb-card-grid">{items.map(renderCard)}</div></section> : null; })}</details>}
    {groups.reference.length > 0 && <details className="cb-secondary-details"><summary>课程参考与条件说明 <span>{groups.reference.length} 项</span><ChevronDown size={15} /></summary><p className="cb-section-intro">成绩构成、一般规则、特定情况适用的说明，以及没有日期的可选事项，供需要时查看。</p><div className="cb-card-grid">{groups.reference.map(renderCard)}</div></details>}
    <details className="cb-secondary-details"><summary><FileText size={16} />课程来源与 PDF 资料 <span>{sourceCatalog.length} 份</span><ChevronDown size={15} /></summary><p className="cb-section-intro">这里是所选课程的来源目录。出现在目录里，不代表本周要读或老师要求必读；具体安排以上方有依据的事项为准。</p><div className="cb-source-catalog">{sourceCatalog.map((source) => <article key={source.id}><div><span className="cb-course-label">{report.courses.find((course) => course.id === source.courseId)?.course_code || '课程'}</span><strong>{source.title.replace(/\s*·\s*第\s*\d+\s*页$/, '')}</strong><small>{catalogOnly(source) ? '仅记录名称与链接 · 未读正文' : source.readMode === 'lecture' ? '已读本周课件 · 用于导读' : source.fileId || source.kind === 'syllabus' ? report.scopeVersion ? '已读课程安排正文' : '已读正文 · 旧版范围' : source.kind === 'announcement' ? '已读课程公告' : source.kind === 'module' ? '已读模块安排' : '已读课程来源'} · 读取于 {stamp(source.fetchedAt, report.timeZone)}</small></div><div className="cb-source-catalog-actions">{sourceHref(source) && <a className="cb-text-link" href={sourceHref(source)} target="_blank" rel="noopener noreferrer">打开来源 <ExternalLink size={12} /></a>}{onImportSource && importableSource(source) && <button type="button" className="cb-text-link" disabled={importingId != null} onClick={() => onImportSource(source)}>{importingId === source.fileId ? <Loader2 size={13} className="cb-spin" /> : <BookOpen size={13} />}导入学习</button>}</div></article>)}</div></details>
    <details className="cb-secondary-details"><summary><ShieldCheck size={16} />读取范围与来源 <span>{sourceCatalog.length} 份资料与页面</span><ChevronDown size={15} /></summary><p className="cb-section-intro">{report.scopeVersion === 3 || report.scopeVersion === 4 ? '读取课程安排与任务要求；新版默认不读取 lecture 或 reading 正文。无权限或读取失败会单独标明。' : '这是旧版读取范围的快照；再次同步后将采用新的摘要和本周课件导读范围。'}来源记录可能是同一 PDF 的不同页，不等于资料份数。</p><div className="cb-coverage">{report.coverage.map((area, index) => <div key={`${area.courseId}:${area.area}:${index}`}><span>{report.courses.find((course) => course.id === area.courseId)?.course_code || '课程'} · {area.label}</span><span className={area.status === 'partial' || area.status === 'unavailable' ? 'cb-coverage-gap' : ''}>{area.status === 'complete' ? '已读取' : area.status === 'partial' ? '部分读取' : area.status === 'skipped' ? '按范围跳过' : '无法读取'} · {area.sourceCount} 条来源记录</span><p>{area.detail}</p></div>)}</div></details>
  </div>;
}

export const CanvasWeeklyBrief: React.FC<CanvasWeeklyBriefProps> = ({ ownerId, onImport, onReportChange }) => {
  const [canvasUrl, setCanvasUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connection, setConnection] = useState<CanvasConnection | null>(null);
  const [profile, setProfile] = useState<CanvasProfile | null>(null);
  const [identityOwner, setIdentityOwner] = useState('');
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [timeZone, setTimeZone] = useState(browserZone);
  const [weekStart, setWeekStart] = useState(() => currentWeekStart(browserZone()));
  const [reports, setReports] = useState<CourseBriefReport[]>([]);
  const [report, setReport] = useState<CourseBriefReport | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [syllabusChoices, setSyllabusChoices] = useState<{ scope: string; entries: BriefSyllabusSelection[] }>({ scope: '', entries: [] });
  const [syllabusChanged, setSyllabusChanged] = useState(false);
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const [syllabusStorageError, setSyllabusStorageError] = useState('');
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const reportCallback = useRef(onReportChange);
  reportCallback.current = onReportChange;
  const reportOwner = useRef(ownerId);
  reportOwner.current = ownerId;

  const connect = async (nextConnection: CanvasConnection) => {
    const nextOrigin = originOf(nextConnection.canvasUrl);
    if (!briefSafeUrl(nextConnection.canvasUrl) || !nextOrigin || !nextConnection.accessToken.trim()) {
      setError('请填写完整的学校 Canvas 地址和 Access Token。'); return;
    }
    controller.current?.abort();
    const requestId = ++generation.current;
    reportCallback.current?.(null);
    setConnecting(true); setSyncing(false); setImportingId(null); setError(''); setStorageError(''); setReport(null); setReports([]); setProfile(null); setConnection(null); setCourses([]); setSelectedCourseIds([]);
    setSyllabusChoices({ scope: '', entries: [] }); setSyllabusChanged(false); setSyllabusUploading(false); setSyllabusStorageError('');
    try {
      const [nextProfile, nextCourses] = await Promise.all([testCanvasConnection(nextConnection), listCanvasCourses(nextConnection)]);
      if (requestId !== generation.current) return;
      if (!Number.isSafeInteger(nextProfile.id) || nextProfile.id <= 0) throw new Error('Invalid Canvas identity');
      const normalized = { ...nextConnection, canvasUrl: nextOrigin };
      setConnection(normalized); setProfile(nextProfile); setIdentityOwner(ownerId); setCourses(nextCourses); setAccessToken(''); setCanvasUrl(nextOrigin);
      const syllabusScope = syllabusScopeKey(ownerId, nextOrigin, nextProfile.id);
      try { setSyllabusChoices({ scope: syllabusScope, entries: readSyllabusSelections(syllabusScope) }); }
      catch { setSyllabusChoices({ scope: syllabusScope, entries: [] }); setSyllabusStorageError('没有读到本机保存的大纲选择，可以重新指定。'); }
      try { saveCanvasConnection(normalized); } catch { setStorageError('浏览器未能保存本次连接。当前页面仍可使用，重新打开后需要再次连接。'); }
      const profileZone = (nextProfile as CanvasProfile & { time_zone?: string }).time_zone;
      const nextZone = profileZone && validZone(profileZone) ? profileZone : browserZone();
      setTimeZone(nextZone); setWeekStart(currentWeekStart(nextZone));
      try {
        const saved = loadBriefStore(ownerId);
        const matching = saved.reports.filter((entry) => entry.ownerId === ownerId && originOf(entry.canvasOrigin) === nextOrigin && entry.canvasUserId === nextProfile.id).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
        setReports(matching);
        const latest = matching[0];
        if (latest) {
          setReport(latest); setSelectedCourseIds(latest.courses.map((course) => course.id).filter((id) => nextCourses.some((course) => course.id === id))); setSettingsOpen(false);
          if (validZone(latest.timeZone)) { setTimeZone(latest.timeZone); setWeekStart(currentWeekStart(latest.timeZone)); }
          reportCallback.current?.(latest);
        } else { setSelectedCourseIds([]); setSettingsOpen(true); }
      } catch { setStorageError('暂时无法读取已保存简报。可以重新选择课程并同步。'); }
    } catch {
      if (requestId !== generation.current) return;
      setError('没有连接成功。请检查学校 Canvas 地址、令牌权限及网络，然后重试。');
    } finally { if (requestId === generation.current) setConnecting(false); }
  };

  useEffect(() => {
    ++generation.current; controller.current?.abort();
    reportCallback.current?.(null);
    setConnection(null); setProfile(null); setReport(null); setReports([]); setCourses([]); setSelectedCourseIds([]); setAccessToken(''); setError(''); setStorageError(''); setSyncing(false); setImportingId(null); setImportMessage(''); setConnecting(false); setSettingsOpen(true);
    setSyllabusChoices({ scope: '', entries: [] }); setSyllabusChanged(false); setSyllabusUploading(false); setSyllabusStorageError('');
    const saved = loadCanvasConnection();
    if (saved) { setCanvasUrl(saved.canvasUrl); void connect(saved); }
    return () => { ++generation.current; controller.current?.abort(); };
  }, [ownerId]);

  const selectedCourses = useMemo(() => courses.filter((course) => selectedCourseIds.includes(course.id)), [courses, selectedCourseIds]);
  const selectionChanged = !!report && (report.weekStart !== weekStart || report.timeZone !== timeZone || [...report.courses.map((course) => course.id)].sort().join(',') !== [...selectedCourseIds].sort().join(','));
  const hasVerifiedConnection = !!connection && !!profile && identityOwner === ownerId;
  const visibleReport = report?.ownerId === ownerId && hasVerifiedConnection && connection && profile && report.canvasUserId === profile.id && originOf(report.canvasOrigin) === originOf(connection.canvasUrl) ? report : null;
  const syllabusScope = hasVerifiedConnection && connection && profile ? syllabusScopeKey(ownerId, originOf(connection.canvasUrl), profile.id) : '';
  const syllabusScopeRef = useRef(syllabusScope);
  syllabusScopeRef.current = syllabusScope;
  const syllabusSelections = syllabusChoices.scope === syllabusScope ? syllabusChoices.entries : [];
  const syllabusChoicesRef = useRef(syllabusSelections);
  syllabusChoicesRef.current = syllabusSelections;
  const changeSyllabus = (courseId: number, selection: BriefSyllabusSelection | null) => {
    if (!syllabusScope || syllabusScope !== syllabusScopeRef.current || syncing || !courses.some((course) => course.id === courseId)) return;
    const entries = [...syllabusChoicesRef.current.filter((entry) => entry.courseId !== courseId), ...(selection ? [selection] : [])];
    syllabusChoicesRef.current = entries;
    setSyllabusChoices({ scope: syllabusScope, entries }); setSyllabusChanged(true); setSyllabusStorageError('');
    try { saveSyllabusSelections(syllabusScope, entries); }
    catch { setSyllabusStorageError('大纲选择已在当前页面生效，但本机没有保存成功。你仍可同步本周简报；关闭页面后可能需要重新指定。'); }
  };
  const processing = useRef(false);
  const handleSavedSyllabus = async (courseId: number) => {
    if (processing.current || syncing || !visibleReport || !hasVerifiedConnection || !connection || !profile || syllabusChanged || syllabusUploading) return;
    if (visibleReport.ownerId !== ownerId || visibleReport.canvasUserId !== profile.id || originOf(visibleReport.canvasOrigin) !== originOf(connection.canvasUrl)) return;
    processing.current = true;
    const requestId = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setSyncing(true); setError(''); setStorageError(''); setProgress('正在使用已读大纲整理这门课，不重新下载…');
    try {
      const next = await organizeSavedSyllabus(visibleReport, courseId, { connection, signal: abort.signal,
        onProgress: message => { if (requestId === generation.current && !abort.signal.aborted) setProgress(message); } });
      if (requestId !== generation.current || abort.signal.aborted || ownerId !== reportOwner.current) return;
      setReport(next); setReports(saved => [next, ...saved].slice(0, 3)); reportCallback.current?.(next);
      try { const saved = loadBriefStore(ownerId); saveBriefStore(ownerId, { selectedCourseIds, reports: [next, ...saved.reports] }); }
      catch { setStorageError('本课结果已显示，但本机保存失败；关闭页面前请保留。'); }
    } catch (error) {
      if (requestId === generation.current && !abort.signal.aborted) setError(error instanceof Error ? error.message : '本课整理未完成，已有简报保留。');
    } finally {
      if (requestId === generation.current) { processing.current = false; setSyncing(false); setProgress(''); controller.current = null; }
    }
  };
  const handleSync = async () => {
    if (processing.current) return;
    if (!hasVerifiedConnection || !connection || !profile || syncing || connecting || syllabusUploading) return;
    if (!selectedCourses.length) { setError('先选择要整理的课程。'); setSettingsOpen(true); return; }
    if (selectedCourses.length > 12) { setError('一次最多整理 12 门课程，请减少选择后再同步。'); setSettingsOpen(true); return; }
    if (!validZone(timeZone)) { setError('请填写有效的时区，例如 America/Toronto。'); setSettingsOpen(true); return; }
    if (!isMonday(weekStart)) { setError('请选择这一周的周一作为起始日期。'); setSettingsOpen(true); return; }
    processing.current = true;
    const requestId = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setSyncing(true); setError(''); setStorageError(''); setProgress('正在读取课程来源…'); setImportMessage('');
    try {
      const previous = reports[0];
      const next = await syncCourseBrief({ connection, canvasUserId: profile.id, ownerId, courses: selectedCourses, weekStart, timeZone, previous, syllabusSelections: syllabusSelections.filter((selection) => selectedCourseIds.includes(selection.courseId)), signal: abort.signal, onCheckpoint: snapshot => {
        if (requestId !== generation.current || abort.signal.aborted || ownerId !== reportOwner.current) return;
        const savedSnapshot: CourseBriefReport = JSON.parse(JSON.stringify(snapshot));
        setReport(savedSnapshot); setReports(saved => [savedSnapshot, ...saved.filter(entry => entry.id !== savedSnapshot.id)].slice(0, 3));
        try {
          const saved = loadBriefStore(ownerId);
          saveBriefStore(ownerId, { selectedCourseIds, reports: [savedSnapshot, ...saved.reports.filter(entry => entry.id !== savedSnapshot.id)] });
        } catch { setStorageError('当前结果已显示，但本机保存失败；关闭页面前请保留。'); }
        reportCallback.current?.(savedSnapshot);
      }, onProgress: (message) => { if (requestId === generation.current && !abort.signal.aborted) setProgress(message); } });
      if (requestId !== generation.current || abort.signal.aborted || ownerId !== reportOwner.current) return;
      if (next.ownerId !== ownerId || next.canvasUserId !== profile.id || originOf(next.canvasOrigin) !== originOf(connection.canvasUrl)) throw new Error('Identity mismatch');
      setReport(next); setReports((saved) => [next, ...saved.filter((entry) => entry.id !== next.id)]); setSettingsOpen(false);
      setSyllabusChanged(false);
      try {
        const saved = loadBriefStore(ownerId);
        saveBriefStore(ownerId, { selectedCourseIds, reports: [next, ...saved.reports.filter((entry) => entry.id !== next.id)] });
      } catch { setStorageError('简报已生成，但浏览器没有保存成功。请先查看当前结果，关闭页面后可能需要重新同步。'); }
      reportCallback.current?.(next);
    } catch {
      if (requestId !== generation.current || abort.signal.aborted) return;
      setError('这次同步没有完成，已保留之前的简报。请检查 Canvas 连接、网络及 AI 服务后重试。');
    } finally {
      if (requestId === generation.current) { processing.current = false; setSyncing(false); setProgress(''); controller.current = null; }
    }
  };
  const cancelSync = () => { processing.current = false; controller.current?.abort(); ++generation.current; setSyncing(false); setProgress(''); setError('已停止后续请求；本次已完成的课程结果和之前的简报均保留。'); };
  const disconnect = () => {
    processing.current = false;
    ++generation.current; controller.current?.abort();
    reportCallback.current?.(null);
    try { clearCanvasConnection(); } catch { /* The in-memory connection is still removed. */ }
    setConnection(null); setProfile(null); setReport(null); setReports([]); setCourses([]); setSelectedCourseIds([]); setAccessToken(''); setConnecting(false); setSyncing(false); setImportingId(null); setError(''); setStorageError(''); setSettingsOpen(true);
    setSyllabusChoices({ scope: '', entries: [] }); setSyllabusChanged(false); setSyllabusUploading(false); setSyllabusStorageError('');
  };
  const importSource = async (source: BriefSource) => {
    if (!hasVerifiedConnection || !connection || !profile || !onImport || importingId != null || !source.fileId || !importableSource(source)) return;
    const requestId = generation.current;
    setImportingId(source.fileId); setImportMessage('');
    try {
      const canvasFile: CanvasFile = { id: source.fileId, folder_id: 0, display_name: source.title.replace(/\s*·?\s*(?:PDF )?第\s*\d+\s*页.*$/, ''), filename: source.title, size: 0, 'content-type': 'application/pdf' };
      const file = await downloadCanvasFile(connection, canvasFile);
      if (requestId !== generation.current || ownerId !== reportOwner.current) return;
      const prefix = await file.slice(0, 5).text();
      if (prefix !== '%PDF-') throw new Error('Not PDF');
      if (requestId !== generation.current || ownerId !== reportOwner.current) return;
      await onImport([file]);
      if (requestId === generation.current) setImportMessage('PDF 已导入资料库，可以打开学习。');
    } catch { if (requestId === generation.current) setImportMessage('这份 PDF 没有导入成功，请打开 Canvas 来源检查文件是否可访问。'); }
    finally { if (requestId === generation.current) setImportingId(null); }
  };

  const saveLocalReport = (next: CourseBriefReport) => {
    setReport(next); setReports(saved => [next, ...saved].slice(0, 3)); reportCallback.current?.(next);
    try { const saved = loadBriefStore(ownerId); saveBriefStore(ownerId, { selectedCourseIds, reports: [next, ...saved.reports] }); }
    catch { setStorageError('结果已更新，但本机保存失败，请先保留当前页面。'); }
  };
  const localRun = () => ({ requests: 0, cacheHits: 0, elapsedMs: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 });
  const updateLocal = () => {
    if (processing.current || !visibleReport) return;
    const next = updateSavedBrief(visibleReport);
    saveLocalReport({ ...next, id: `brief:processed:${Date.now()}`, generatedAt: new Date().toISOString(), run: localRun() });
    setImportMessage('已根据保存的原文更新日期与展示；未连接 Canvas，也未调用 AI。');
  };
  const selectLectureFile = (itemId: string, fileId: number) => {
    if (processing.current || !visibleReport) return;
    const item = visibleReport.items.find(item => item.id === itemId && item.kind === 'lecture');
    const source = visibleReport.sources.find(source => source.fileId === fileId && item && allowedLectureFile(source, item));
    if (!item || !source) return;
    const replace = (entry: BriefItem): BriefItem => entry.id === itemId ? { ...entry, lectureFile: { fileId, confirmedBy: 'user' },
      guide: entry.lectureFile?.fileId === fileId ? entry.guide : undefined } : entry;
    saveLocalReport({ ...visibleReport, id: `brief:association:${Date.now()}`, generatedAt: new Date().toISOString(), run: localRun(),
      items: visibleReport.items.map(replace), syllabusSchedules: visibleReport.syllabusSchedules?.map(schedule => ({ ...schedule, items: schedule.items.map(replace) })) });
  };

  const handleReadSyllabus = async (courseId: number) => {
    if (processing.current || !visibleReport || !connection || !profile || syllabusChanged || syllabusUploading || importingId != null) return;
    processing.current = true;
    const requestId = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setSyncing(true); setError(''); setStorageError(''); setImportMessage('');
    setProgress('仅重新读取本课大纲，不调用 AI…');
    try {
      const next = await readOneSyllabus(visibleReport, courseId, connection, abort.signal, message => {
        if (requestId === generation.current && !abort.signal.aborted) setProgress(message);
      });
      if (requestId !== generation.current || abort.signal.aborted || ownerId !== reportOwner.current) return;
      saveLocalReport(next);
      const status = next.syllabi?.find(status => status.courseId === courseId);
      setImportMessage(status?.status === 'read_failed' ? '本课读取未完成，具体失败阶段已显示在课程卡片中；本次没有 AI 请求。'
        : '本课大纲正文已保存；没有调用 AI。需要提取安排时，在「课程大纲」中单独整理这门课。');
    } catch (error) {
      if (requestId === generation.current && !abort.signal.aborted) setError(error instanceof Error ? error.message : '本课大纲读取未完成；已有结果保留。');
    } finally {
      if (requestId === generation.current) { processing.current = false; setSyncing(false); setProgress(''); controller.current = null; }
    }
  };

  const handleGuide = async (itemId: string, fileId: number) => {
    if (processing.current || !visibleReport || !connection || !profile) return;
    processing.current = true;
    const requestId = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setSyncing(true); setError(''); setProgress('正在读取你选定的这一讲课件…');
    const started = Date.now();
    const run: NonNullable<CourseBriefReport['run']> = { requests: 0, cacheHits: 0, elapsedMs: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 };
    const timeout = setTimeout(() => { abort.abort(); if (requestId === generation.current) setError('单讲导读已等待 90 秒，已停止；课程安排保留。'); }, 90_000);
    try {
      const next = await addWeeklyLectureGuides(visibleReport, { connection, signal: abort.signal, previous: visibleReport,
        selectedFile: { itemId, fileId }, onRequest: () => { run.requests++; run.unknownUsage++; },
        onUsage: usage => { if (usage) { run.inputTokens += usage.inputTokens; run.outputTokens += usage.outputTokens; run.unknownUsage--; } },
        onProgress: message => { if (requestId === generation.current) setProgress(message); } });
      if (requestId !== generation.current || abort.signal.aborted || ownerId !== reportOwner.current) return;
      run.elapsedMs = Date.now() - started;
      next.run = run; next.id = `brief:guide:${Date.now()}`; next.generatedAt = new Date().toISOString();
      setReport(next); setReports(saved => [next, ...saved].slice(0, 3)); reportCallback.current?.(next);
      try { const saved = loadBriefStore(ownerId); saveBriefStore(ownerId, { selectedCourseIds, reports: [next, ...saved.reports] }); }
      catch { setStorageError('导读已显示，但本机保存失败。'); }
    } catch { if (requestId === generation.current && !abort.signal.aborted) setError('这一讲的导读未完成，课程安排保留；没有继续请求其他课件。'); }
    finally { clearTimeout(timeout); if (requestId === generation.current) { processing.current = false; setSyncing(false); setProgress(''); controller.current = null; } }
  };

  return <section className="canvas-brief" aria-labelledby="canvas-brief-title">
    <header className="cb-hero"><div><p className="cb-eyebrow">把课程安排带回这里</p><h1 id="canvas-brief-title">本周课程简报</h1><p>看看这周每门课上哪些 lecture、读哪些 reading，再把作业和考试排清楚。每条安排都保留来源。</p></div><div className="cb-hero-icon" aria-hidden="true"><CalendarDays size={36} /><span /><span /></div></header>
    {!hasVerifiedConnection ? <div className="cb-connect"><div><span className="cb-step">01 / CONNECT</span><h2>先连接你的学校</h2><p>沿用 Canvas 导入的连接。令牌只保存在本次浏览器会话，课程简报保存在当前浏览器。</p><form onSubmit={(event) => { event.preventDefault(); void connect({ canvasUrl: canvasUrl.trim(), accessToken: accessToken.trim() }); }}><label>学校 Canvas 地址<input type="url" value={canvasUrl} onChange={(event) => setCanvasUrl(event.target.value)} placeholder="https://你的学校.instructure.com" disabled={connecting} autoComplete="url" required /></label><label>个人 Access Token<input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} disabled={connecting} autoComplete="off" required /></label><button type="submit" className="cb-button-primary" disabled={connecting}>{connecting ? <Loader2 size={17} className="cb-spin" /> : <GraduationCap size={17} />}{connecting ? '正在验证学校与账号…' : '连接 Canvas'}</button></form></div><aside><ShieldCheck size={24} /><h3>先核对来源，再安排这一周</h3><ul><li>读取 syllabus、课程日程、任务与公告。</li><li>保留原文、来源日期和更新时间。</li><li>默认只读安排资料，课件导读单独选择，文章保留名称和链接。</li></ul><p>在 Canvas「账号 → 设置 → Approved Integrations」创建个人令牌。这里不会替你提交作业或修改课程。</p></aside></div> : <>
      <div className="cb-connection-bar"><span><GraduationCap size={17} /><strong>{profile?.name}</strong><span>{originOf(connection.canvasUrl).replace(/^https?:\/\//, '')}</span></span><button type="button" onClick={disconnect} className="cb-text-link" disabled={importingId != null}>更换账号</button></div>
      <details className="cb-settings" open={settingsOpen} onToggle={(event) => setSettingsOpen(event.currentTarget.open)}><summary><Settings2 size={17} /><strong>{selectedCourses.length ? `已选 ${selectedCourses.length} 门课程` : '选择需要整理的课程'}</strong><span>{dateLabel(weekStart)}起的一周</span><ChevronDown size={16} /></summary><div className="cb-settings-body"><div className="cb-course-options">{courses.map((course) => <label key={course.id} className={selectedCourseIds.includes(course.id) ? 'selected' : ''}><input type="checkbox" checked={selectedCourseIds.includes(course.id)} disabled={syncing || importingId != null || (!selectedCourseIds.includes(course.id) && selectedCourseIds.length >= 12)} onChange={() => setSelectedCourseIds((selected) => selected.includes(course.id) ? selected.filter((id) => id !== course.id) : [...selected, course.id])} /><span><strong>{course.course_code || course.name}</strong><span>{course.name}</span>{course.term?.name && <small>{course.term.name}</small>}</span></label>)}{courses.length === 0 && <p>Canvas 没有返回当前可访问的课程，请确认账号或在 Canvas 中检查。</p>}</div><p className="cb-section-intro" style={{margin:'12px 0 0'}}>一次最多整理 12 门课程。已选 {selectedCourseIds.length} 门。</p><div className="cb-time-settings"><label>查看哪一周<input type="date" value={weekStart} disabled={syncing || importingId != null} onChange={(event) => { if (event.target.value) setWeekStart(mondayOf(event.target.value)); }} /><small>选择日期后会对齐到当周周一。</small></label><label>课程日历使用的时区<input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="America/Toronto" disabled={syncing || importingId != null} /><small>先采用 Canvas 个人设置；未提供时采用浏览器时区，请按学校安排核对。</small></label></div></div></details>
      <SyllabusSources onRead={!syllabusChanged ? courseId => void handleReadSyllabus(courseId) : undefined} onOrganize={!syllabusChanged ? courseId => void handleSavedSyllabus(courseId) : undefined} key={syllabusScope} courses={selectedCourses} report={visibleReport} selections={syllabusSelections} disabled={syncing || connecting || importingId != null} onChange={changeSyllabus} onBusyChange={(busy) => { if (syllabusScope === syllabusScopeRef.current) setSyllabusUploading(busy); }} />
      {syllabusChanged && <div className="cb-selection-notice" role="status"><BookOpen size={16} /><span>大纲来源已调整，等待下次同步。现有简报仍保留上次读取的结果。</span></div>}
      {syllabusStorageError && <div className="cb-alert" role="alert"><AlertCircle size={18} /><p>{syllabusStorageError}</p></div>}
      <div className="cb-sync-bar"><div><p>只在你点击时读取并整理，不会在后台自动追踪。</p><span>已整理的大纲直接复用；每门课最多一次大纲整理、一次任务摘要。AI 阶段最多 4 分钟，超时即停止后续请求。课件导读另行生成。</span></div><button type="button" className="cb-button-primary" onClick={() => void handleSync()} disabled={syncing || connecting || importingId != null || syllabusUploading || selectedCourses.length === 0}>{syncing ? <Loader2 size={17} className="cb-spin" /> : <RefreshCw size={17} />}{syncing ? '正在整理课程' : syllabusUploading ? '先读取大纲 PDF…' : '同步并生成本周简报'}</button></div>
      {visibleReport?.pipelineVersion === 2 && !syncing && visibleReport.weekStart !== weekStart && <button type="button" className="cb-text-link" onClick={() => {
        const selected = new Set(selectedCourseIds);
        const refreshed = updateSavedBrief(visibleReport);
        const snapshot: CourseBriefReport = { ...refreshed, id: `brief:local:${Date.now()}`, weekStart, timeZone,
          courses: visibleReport.courses.filter(course => selected.has(course.id)),
          items: refreshed.items.filter(item => selected.has(item.courseId)),
          analysisStatus: 'partial', run: { requests: 0, cacheHits: 0, elapsedMs: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 },
          coverage: [...refreshed.coverage.filter(area => area.area !== 'local_week'), { courseId: visibleReport.courses[0]?.id || 0, area: 'local_week', label: '本地切换周次', status: 'partial', detail: '仅按已保存安排筛选，未读取这一周的新公告与任务变更。', sourceCount: 0 }] };
        setReport(snapshot); setReports(saved => [snapshot, ...saved].slice(0, 3)); reportCallback.current?.(snapshot);
        try { const saved = loadBriefStore(ownerId); saveBriefStore(ownerId, { selectedCourseIds, reports: [snapshot, ...saved.reports] }); }
        catch { setStorageError('本周视图已切换，但本机保存失败。'); }
      }}>用已保存的安排查看所选周（不调用 AI）</button>}
      {syncing && <div className="cb-progress" role="status" aria-live="polite"><Loader2 size={17} className="cb-spin" /><span>{progress}</span><button type="button" onClick={cancelSync}><X size={15} />取消</button></div>}
    </>}
    {error && <div className="cb-alert" role="alert"><AlertCircle size={18} /><p>{error}</p></div>}
    {storageError && <div className="cb-alert" role="alert"><AlertCircle size={18} /><p>{storageError}</p></div>}
    {visibleReport && <>
      <button type="button" className="cb-text-link" disabled={syncing || importingId != null} onClick={updateLocal}><RefreshCw size={15} />更新已有结果（不调用 AI）</button>
      {selectionChanged && <div className="cb-selection-notice"><AlertCircle size={16} /><span>课程、周次或时区已调整，尚未同步。下面仍是上次简报的范围与日期。</span></div>}
      {reports.length > 1 && <div className="cb-history"><label>已保存简报<select value={visibleReport.id} disabled={syncing || importingId != null} onChange={(event) => { const saved = reports.find((entry) => entry.id === event.target.value); if (saved) { setReport(saved); reportCallback.current?.(saved); } }}>{reports.map((entry) => <option key={entry.id} value={entry.id}>{stamp(entry.generatedAt, entry.timeZone)} · {entry.weekStart} 起 · {entry.courses.length} 门课{briefHasGaps(entry) ? ' · 有读取缺口' : ''}</option>)}</select></label></div>}
      {importMessage && <p className="cb-import-message" role="status">{importMessage}</p>}
      <CanvasBriefReportView onReadSyllabus={!syncing && !syllabusChanged && !syllabusUploading ? courseId => void handleReadSyllabus(courseId) : undefined} onSelectLectureFile={!syncing ? selectLectureFile : undefined} onGuide={!syncing ? (itemId, fileId) => void handleGuide(itemId, fileId) : undefined} report={visibleReport} onImportSource={onImport && !syncing ? (source) => void importSource(source) : undefined} importingId={importingId} />
    </>}
    {hasVerifiedConnection && !visibleReport && !syncing && <div className="cb-first-brief"><FileText size={28} /><h2>这一周，从选中的课程开始</h2><p>选择课程后，整理 syllabus、周历、模块与公告中的课程安排。已确认的讲次和阅读清单按课展示，作业与考试保留截止日期。</p></div>}
  </section>;
};
