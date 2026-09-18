import React, { useEffect, useRef, useState } from 'react';
import { localGet, localPut } from '@/services/localWorkspace';
import { CanvasBriefReportView } from './CanvasWeeklyBrief';
import { readBriefPdf } from './syllabusPdf';
import { organizeSavedSyllabus } from './sync';
import { updateSavedBrief } from './processing';
import { currentWeekStart, addDays } from './dates';
import type { CourseBriefReport, BriefSource } from './types';

// Namespaces local evidence without representing an actual Canvas connection.
const LOCAL_ORIGIN = 'https://local.classskip.invalid';
export function LocalSyllabusBrief({ ownerId }: { ownerId: string }) {
  const [report, setReport] = useState<CourseBriefReport | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [courseName, setCourseName] = useState('');
  const [week, setWeek] = useState(() => currentWeekStart(Intl.DateTimeFormat().resolvedOptions().timeZone));
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    alive.current = true;
    localGet<CourseBriefReport>('localBrief', ownerId).then(saved => {
      if (alive.current) { setReport(saved); setReady(true); }
    }).catch(() => { if (alive.current) setMessage('本机存储不可用，请允许浏览器保存网站数据。'); });
    return () => { alive.current = false; abort.current?.abort(); };
  }, [ownerId]);
  const save = async (next: CourseBriefReport) => {
    await localPut('localBrief', ownerId, next);
    if (alive.current) setReport(next);
  };
  const read = async (file: File) => {
    if (running.current || !ready) return;
    running.current = true; setBusy(true); setMessage('正在读取大纲，不调用 AI…');
    const controller = new AbortController(); abort.current = controller;
    try {
      const pages = await readBriefPdf(file, controller.signal);
      const courseId = Date.now(); const stamp = new Date().toISOString();
      const documentId = `local-syllabus:${crypto.randomUUID()}`;
      const sources: BriefSource[] = pages.flatMap((text, index) => text.trim() ? [{
        id: `${documentId}:${index + 1}`, courseId, kind: 'file', title: file.name,
        url: '', text, fetchedAt: stamp, page: index + 1, documentId, documentRole: 'syllabus', readMode: 'content',
      }] : []);
      if (!sources.length) throw new Error('没有读到可用文字；请使用包含文字的大纲 PDF。');
      const next: CourseBriefReport = report ?? {
        version: 1, pipelineVersion: 2, id: `local-brief:${Date.now()}`, ownerId,
        canvasOrigin: LOCAL_ORIGIN, canvasUserId: 0, courses: [], weekStart: week,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, fetchedAt: stamp, generatedAt: stamp,
        sources: [], items: [], coverage: [], changes: [], analysisStatus: 'not_run', syllabi: [],
      };
      await save({ ...next, courses: [...next.courses, { id: courseId, name: courseName.trim() || file.name.replace(/\.pdf$/i, ''), course_code: courseName.trim() || file.name }],
        sources: [...next.sources, ...sources], syllabi: [...(next.syllabi ?? []), { courseId, title: file.name,
          status: sources.length === pages.length ? 'read' : 'read_partial', pageCount: pages.length,
          sourceIds: sources.map(s => s.id), candidates: [], detail: `已读取 ${sources.length}/${pages.length} 页，点击整理这门课后才会调用 AI。` }] });
      if (alive.current) { setMessage('大纲正文已保存在本机，可以单独整理这门课。'); setCourseName(''); }
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : '读取失败。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const organize = async (courseId: number) => {
    if (!report || running.current) return;
    running.current = true; setBusy(true); setMessage('正在整理这门课，其他课程的结果会保留…');
    const controller = new AbortController(); abort.current = controller;
    try {
      const next = await organizeSavedSyllabus({ ...report, weekStart: week }, courseId, {
        connection: { canvasUrl: LOCAL_ORIGIN, accessToken: '' }, signal: controller.signal,
        onProgress: value => { if (alive.current) setMessage(value); },
      });
      const incomplete = next.courses.some(course => !next.syllabusSchedules?.some(schedule => schedule.courseId === course.id && schedule.complete));
      await save({ ...next, analysisStatus: incomplete ? 'partial' : 'complete' });
      if (alive.current) setMessage('本次结果已保存。可以切换周次查看，不会重新调用 AI。');
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : '整理未完成，已读取的大纲仍保留。'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="cb-shell space-y-5">
    <h2 className="text-2xl font-bold text-[#294B3B]">从本地大纲整理周报</h2>
    <p>无需连接 Canvas。添加 syllabus 后按课程整理，原文和结果保存在当前浏览器；不包含老师之后发布的改期或提交状态。</p>
    <div className="flex flex-wrap gap-3 items-center">
      <input aria-label="课程名称" placeholder="课程名称（可选）" value={courseName} onChange={e => setCourseName(e.target.value)} disabled={busy} className="border rounded-lg p-2" />
      <label className="cb-button-primary">添加 syllabus PDF<input type="file" accept=".pdf,application/pdf" disabled={!ready || busy} className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file); }} /></label>
      <label>查看周次 <input type="date" value={week} disabled={busy} onChange={e => {
        if (!e.target.value) return;
        const day = e.target.value; const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
        setWeek(addDays(day, -((weekday + 6) % 7)));
      }} /></label>
      {busy && <button type="button" onClick={() => abort.current?.abort()}>取消</button>}
    </div>
    {message && <p role="status">{message}</p>}
    {report?.courses.map(course => <div key={course.id} className="flex gap-3 items-center border-b py-3">
      <span>{course.name}</span><button className="cb-text-link" disabled={busy} onClick={() => void organize(course.id)}>{report.syllabusSchedules?.some(s => s.courseId === course.id) ? '重新整理这门课' : '整理这门课'}</button>
    </div>)}
    {report && <CanvasBriefReportView report={updateSavedBrief({ ...report, weekStart: week })} />}
  </section>;
}
