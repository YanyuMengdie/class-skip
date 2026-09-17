import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, FileText, Loader2, Upload } from 'lucide-react';
import type { CanvasCourse } from '@/services/canvas';
import type { BriefSyllabusSelection, BriefSyllabusStatus, CourseBriefReport } from './types';
import { readBriefPdf } from './syllabusPdf';

const STATUS_LABELS: Record<BriefSyllabusStatus['status'], string> = {
  not_found: '尚未找到大纲', needs_selection: '需要指定大纲', read_failed: '大纲读取失败', read_partial: '大纲部分页面已读',
  read: '大纲已读 · 课表尚未整理', schedule_pending: '大纲已读 · 尚未发起整理', schedule_failed: '大纲已读 · 尚无可用课表', schedule_partial: '已有安排 · 范围待核对', ready: '课表日期已整理',
};

export const syllabusStatusLabel = (status?: BriefSyllabusStatus, hasReport = false): string =>
  status ? STATUS_LABELS[status.status] : hasReport ? '旧简报未记录大纲读取情况' : '尚未读取大纲';

export const syllabusMissingArrangement = (status: BriefSyllabusStatus | undefined, missing: string): string => {
  if (!status) return `这份简报没有记录大纲是否读过；重新同步后再确认本周${missing}。`;
  if (status.status === 'not_found') return `尚未找到课程大纲，本周${missing}还未核实。可在上方指定或上传大纲。`;
  if (status.status === 'needs_selection') return `发现多份可能的大纲，先在上方指定一份，再同步本周${missing}。`;
  if (status.status === 'read_failed') return `找到了大纲，但这次没有读到正文；本周${missing}还未核实。可重新同步或上传本地 PDF。`;
  if (status.status === 'read_partial') return `大纲还有部分页面未读到，本周${missing}尚未完整核实；已核对的安排会继续显示。`;
  if (status.status === 'schedule_partial') return `已有部分安排对应到原文，但本周${missing}尚未完整确认。可展开课程安排表与原文查看；有误时仅重新整理这门课。`;
  if (status.status === 'schedule_pending') return `大纲正文已读取，但本轮没有向 AI 发送本课的整理请求。可单独整理这门课，无需重新下载大纲。`;
  if (status.status === 'read' || status.status === 'schedule_failed') return `大纲正文已读取，课表尚未整理成功，因此还不能确认本周${missing}。`;
  return `学期课表已整理，但没有对应到本周的${missing}；这不表示老师没有安排。`;
};

export function SyllabusReportStatus({ status, hasReport = true }: { status?: BriefSyllabusStatus; hasReport?: boolean }) {
  return <div className={`cb-syllabus-status ${status?.status === 'ready' ? 'is-ready' : ''}`}>
    <BookOpen size={13} /><span>{syllabusStatusLabel(status, hasReport)}</span>
    {status?.title && <small>{status.title}{status.pageCount ? ` · 共 ${status.pageCount} 页，已读 ${status.sourceIds.length} 页` : ''}</small>}
    {status?.processing && <small>已保存 {status.processing.learningDated} 项有日期的讲次或阅读{status.processing.learningUnresolved ? ` · ${status.processing.learningUnresolved} 项日期待对应` : ''}</small>}
    {status?.status === 'read_failed' && <p className="cb-syllabus-status-detail" role="status">{status.detail || '这份旧记录没有保存具体失败原因，可仅重新读取本课大纲。'}</p>}
    {status && (status.detail || status.processing?.problems.length) && <details className="cb-syllabus-status-detail"><summary><ChevronDown size={12} />读取范围与其他学期信息</summary>
      <p>{status.detail}</p>
      {status.processing?.analyzedSourceIds && <p>已提取正文 {status.sourceIds.length} 页；实际交给 AI {status.processing.analyzedSourceIds.length} 页；未交给 AI {status.processing.omittedSourceIds?.length || 0} 页。</p>}
      {!!status.processing?.problems.length && <ul>{status.processing.problems.map((problem, index) => <li key={index}>{problem.message}</li>)}</ul>}
    </details>}
  </div>;
}

export function SyllabusSources({ courses, report, selections, disabled, onChange, onBusyChange, onRetry, onOrganize, onRead }: {
  courses: CanvasCourse[];
  report: CourseBriefReport | null;
  selections: BriefSyllabusSelection[];
  disabled: boolean;
  onChange: (courseId: number, selection: BriefSyllabusSelection | null) => void;
  onBusyChange: (busy: boolean) => void;
  onRetry?: (courseId: number) => void;
  onOrganize?: (courseId: number) => void;
  onRead?: (courseId: number) => void;
}) {
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<{ courseId: number; message: string } | null>(null);
  const alive = useRef(true);
  const request = useRef(0);
  const uploadLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current += 1; };
  }, []);
  const upload = async (courseId: number, file: File) => {
    if (disabled || uploadLock.current) return;
    if (file.size > 25 * 1024 * 1024) { setUploadError({ courseId, message: '请上传小于 25 MB 的课程大纲 PDF。' }); return; }
    const requestId = ++request.current;
    uploadLock.current = true; setUploadingId(courseId); setUploadError(null); onBusyChange(true);
    try {
      if ((await file.slice(0, 5).text()) !== '%PDF-') throw new Error('请上传 PDF 格式的课程大纲。');
      const pages = await readBriefPdf(file);
      if (!pages.some((page) => page.trim())) throw new Error('这份 PDF 没有读到可提取的文字，请换用有文字的版本。');
      if (pages.length > 300 || pages.reduce((length, page) => length + page.length, 0) > 900_000) throw new Error('这份文件过长，请只上传课程大纲，不要合并整门课的课件。');
      if (!alive.current || requestId !== request.current) return;
      onChange(courseId, { courseId, kind: 'upload', title: file.name, documentId: crypto.randomUUID(), pages, selectedAt: new Date().toISOString() });
    } catch (error) {
      if (alive.current && requestId === request.current) setUploadError({ courseId, message: error instanceof Error && /请|没有读到/.test(error.message) ? error.message : '这份 PDF 没有读成功，请换一份文件后重试。' });
    } finally {
      if (alive.current && requestId === request.current) { uploadLock.current = false; setUploadingId(null); onBusyChange(false); }
    }
  };
  if (!courses.length) return null;
  const readyCount = courses.filter((course) => report?.syllabi?.some((status) => status.courseId === course.id && status.status === 'ready')).length;
  return <details className="cb-syllabus-sources" open={!report || courses.some((course) => report.syllabi?.some((status) => status.courseId === course.id && status.status === 'needs_selection'))}>
    <summary><BookOpen size={17} /><strong>课程大纲</strong><span>{report ? `${readyCount} / ${courses.length} 门课已整理课表` : '先确认每门课的依据'}<ChevronDown size={15} /></span></summary>
    <div className="cb-syllabus-body"><p className="cb-section-intro">先读大纲、整理整学期课表，再结合公告和 Calendar 更新本周安排。更换来源后，点击「同步并生成本周简报」才会重新整理。</p>
      {courses.map((course) => {
        const status = report?.syllabi?.find((entry) => entry.courseId === course.id);
        const schedule = report?.syllabusSchedules?.find((entry) => entry.courseId === course.id);
        const selection = selections.find((entry) => entry.courseId === course.id);
        const candidates = new Map((status?.candidates || []).map((candidate) => [candidate.fileId, candidate]));
        for (const pdf of status?.availablePdfs || []) {
          if (!candidates.has(pdf.fileId)) candidates.set(pdf.fileId, pdf);
        }
        for (const source of report?.sources || []) {
          if (source.courseId === course.id && source.fileId && !candidates.has(source.fileId)) candidates.set(source.fileId, { fileId: source.fileId, title: source.title.replace(/\s*·\s*第\s*\d+\s*页$/, ''), url: source.url });
        }
        if (selection?.kind === 'canvas' && !candidates.has(selection.fileId)) candidates.set(selection.fileId, { fileId: selection.fileId, title: selection.title, url: '' });
        const busy = disabled || uploadingId != null;
        return <article className="cb-syllabus-course" key={course.id}>
          <div className="cb-syllabus-course-heading"><strong>{course.course_code || course.name}</strong><SyllabusReportStatus status={status} hasReport={!!report?.courses.some((entry) => entry.id === course.id)} /></div>
          {selection && <p className="cb-syllabus-choice"><FileText size={13} /><span>指定来源：{selection.title}{selection.kind === 'upload' ? `（本地 PDF，${selection.pages.length} 页）` : ''}</span></p>}
          <div className="cb-syllabus-actions">
            {candidates.size > 0 && <label><span>指定 Canvas 大纲</span><select aria-label={`${course.course_code || course.name}的大纲`} disabled={busy} value={selection?.kind === 'canvas' ? String(selection.fileId) : ''} onChange={(event) => { const candidate = candidates.get(Number(event.target.value)); if (candidate) { onChange(course.id, { courseId: course.id, kind: 'canvas', fileId: candidate.fileId, title: candidate.title }); setUploadError(null); } }}><option value="" disabled>选择课程大纲 PDF</option>{[...candidates.values()].map((candidate) => <option key={candidate.fileId} value={candidate.fileId}>{candidate.title}</option>)}</select></label>}
            <label className={`cb-syllabus-upload ${busy ? 'is-disabled' : ''}`}>{uploadingId === course.id ? <Loader2 size={14} className="cb-spin" /> : <Upload size={14} />}{uploadingId === course.id ? '正在读取 PDF…' : '上传本地大纲'}<input type="file" accept="application/pdf,.pdf" aria-label={`${course.course_code || course.name}上传本地大纲`} disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(course.id, file); }} /></label>
            {selection && <button type="button" className="cb-text-link" disabled={busy} onClick={() => { onChange(course.id, null); setUploadError(null); }}>恢复自动寻找</button>}
            {report?.pipelineVersion === 2 && onRetry && <button type="button" className="cb-text-link" disabled={busy} onClick={() => onRetry(course.id)}>下次重新整理这门课</button>}
            {!!status?.fileId && onRead && <button type="button" className="cb-text-link" disabled={busy} onClick={() => onRead(course.id)}>仅重新读取本课大纲（不调用 AI）</button>}
            {!!status?.sourceIds.length && onOrganize && <button type="button" className="cb-text-link" disabled={busy} onClick={() => onOrganize(course.id)}>重新提取本课已读课表（最多 1 次 AI 请求）</button>}
          </div>
          {uploadError?.courseId === course.id && <p className="cb-syllabus-error" role="alert">{uploadError.message}</p>}
          {status && <details className="cb-syllabus-detail"><summary>上次读取的依据 <ChevronDown size={12} /></summary><p>{status.detail}</p>{status.processing?.analyzedSourceIds && <p>实际整理页码：{status.processing.analyzedSourceIds.map(id => report?.sources.find(source => source.id === id)?.page || '页面正文').join('、')}。未整理页码：{status.processing.omittedSourceIds?.map(id => report?.sources.find(source => source.id === id)?.page || '页面正文').join('、') || '无'}。</p>}{status.sourceIds.length > 0 && <ul>{status.sourceIds.map((id) => report?.sources.find((source) => source.id === id && source.courseId === course.id)).filter((source) => !!source).map((source) => <li key={source!.id}><details><summary>{source!.title} · 查看已读文字</summary><pre className="cb-syllabus-raw">{source!.text}</pre></details></li>)}</ul>}</details>}
          {!!schedule?.items.length && <details className="cb-syllabus-detail"><summary>课程安排表 · {schedule.items.length} 项 <ChevronDown size={12} /></summary><div className="cb-plan-table-wrap"><table className="cb-plan-table"><thead><tr><th>日期</th><th>内容</th><th>原文</th></tr></thead><tbody>{[...schedule.items].sort((a, b) => (a.date?.value || a.weekStart || 'z').localeCompare(b.date?.value || b.weekStart || 'z')).map(item => <tr key={item.id}><td>{item.date?.value.slice(0, 10) || item.weekStart || item.dateText || '未明确'}{item.dateStatus === 'conflict' ? '（冲突）' : ''}</td><td>{item.title}{item.requirement === 'optional' ? ' · 选读 / 选做' : ''}</td><td><details><summary>查看</summary>{item.evidence.map((e, index) => <p key={index}>{report?.sources.find(s => s.id === e.sourceId)?.title}<br />{e.quote}</p>)}</details></td></tr>)}</tbody></table></div></details>}
          {!!schedule?.pages?.length && <details className="cb-syllabus-detail"><summary>逐页整理结果 <ChevronDown size={12} /></summary>
            {schedule.pages.map(page => {
              const source = report?.sources.find(source => source.id === page.sourceId && source.courseId === course.id);
              return <div className="cb-syllabus-page-result" key={page.sourceId}>
                <strong>{source?.page ? `第 ${source.page} 页` : source?.title || '大纲页面'}{page.result.retryable ? ' · 尚未完成，可继续同步' : ' · 已处理'}</strong>
                <p>{page.result.trace?.detail || `已核对 ${page.result.items.length} 项安排。`}</p>
                {!!page.result.issues.length && <ul>{page.result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
              </div>;
            })}
          </details>}
        </article>;
      })}
      <p className="cb-syllabus-footnote">大纲选择按当前账号与课程分别保存在本机。上传只用于整理课程简报，不会修改学校 Canvas；同步时会将大纲文字交给 AI 整理。</p>
    </div>
  </details>;
}
