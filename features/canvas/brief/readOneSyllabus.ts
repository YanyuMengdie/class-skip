import { CanvasRequestError, downloadCanvasFile, requestCanvas, type CanvasConnection, type CanvasFile } from '@/services/canvas';
import { canvasFileAccessProblem } from '@/shared/canvasFileAccess';
import { readBriefPdf } from './syllabusPdf';
import type { BriefSource, BriefSyllabusStatus, CourseBriefReport } from './types';

/** Read exactly the selected attachment. No course crawl, extraction model or automatic retry. */
export async function readOneSyllabus(report: CourseBriefReport, courseId: number, connection: CanvasConnection,
  signal?: AbortSignal, onProgress?: (message: string) => void): Promise<CourseBriefReport> {
  const original = report.syllabi?.find(status => status.courseId === courseId);
  if (!original?.fileId || !report.courses.some(course => course.id === courseId)) throw new Error('尚未保存这门课的大纲文件编号，请先在课程大纲中指定文件。');
  if (new URL(connection.canvasUrl).origin !== report.canvasOrigin) throw new Error('当前 Canvas 学校与已保存的大纲不一致。');
  const fileId = original.fileId;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
  const started = Date.now();
  const at = new Date().toISOString();
  let stage = '读取附件信息';
  let status: BriefSyllabusStatus = { ...original, processing: undefined };
  const added: BriefSource[] = [];
  const enter = (message: string) => { stage = message; onProgress?.(`仅处理本课大纲 · ${message}（不调用 AI）`); };
  try {
    enter('读取附件信息');
    const raw = await requestCanvas<unknown>(connection, `/api/v1/files/${fileId}`, { signal: controller.signal });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Canvas 未返回有效附件信息。');
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'number' || typeof row.id === 'string' && /^\d+$/.test(row.id) ? Number(row.id) : NaN;
    if (!Number.isSafeInteger(id) || id !== fileId) throw new Error('Canvas 返回的附件编号与保存的大纲编号不一致。');
    const accessProblem = canvasFileAccessProblem(row);
    if (accessProblem) throw new Error(accessProblem);
    const referenced = report.sources.some(source => source.courseId === courseId && (source.fileId === fileId
      && !!source.linkedFrom?.length || source.readMode !== 'catalog' && new RegExp(`/files/${fileId}(?:[/\\s?#"')]|$)`).test(source.text)));
    if (row.course_id != null && Number(row.course_id) !== courseId && !referenced)
      throw new Error('附件属于另一门课程，已保存资料中没有当前课程的明确链接。');
    const name = typeof row.display_name === 'string' ? row.display_name : typeof row.filename === 'string' ? row.filename : original.title || `大纲 ${fileId}.pdf`;
    status.title = name;
    if (row['content-type'] !== 'application/pdf' && !/\.pdf$/i.test(name)) throw new Error('附件不是 PDF，请指定 PDF 大纲。');
    if (typeof row.size === 'number' && row.size > 25 * 1024 * 1024) throw new Error('附件超过 25 MB 读取上限。');
    enter('下载 PDF');
    const file = await downloadCanvasFile(connection, { ...row, id } as unknown as CanvasFile, { signal: controller.signal });
    enter('提取 PDF 文字');
    const pages = await readBriefPdf(file, controller.signal);
    if (controller.signal.aborted) throw new DOMException('已取消读取', 'AbortError');
    for (const [index, text] of pages.entries()) if (text.trim().length >= 12) added.push({
      id: `${courseId}:syllabus-retry:${fileId}:${started}:${index + 1}`, courseId, kind: 'file', fileId,
      title: `${name} · 第 ${index + 1} 页`, page: index + 1, text, fetchedAt: at,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      url: `${report.canvasOrigin}/courses/${courseId}/files/${fileId}`, readMode: 'content',
      documentRole: 'syllabus', documentId: `canvas-file:${fileId}`, resourceRole: 'syllabus',
    });
    if (!added.length) throw new Error('PDF 已下载，但没有提取到可用正文。');
    status = { ...status, sourceIds: added.map(source => source.id), pageCount: pages.length,
      status: added.length === pages.length ? 'read' : 'read_partial',
      detail: `本次已下载大纲，${pages.length} 页中 ${added.length} 页取得文字；未调用 AI。可在「课程大纲」中单独整理本课。` };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('已取消读取', 'AbortError');
    const reason = timedOut ? '超过 60 秒，已停止，没有自动重试。'
      : error instanceof CanvasRequestError ? `Canvas 返回 ${error.status}：${error.message}`
      : error instanceof Error ? error.message : '未取得完整返回。';
    status = { ...status, status: 'read_failed', detail: `${stage}失败：${reason}${original.sourceIds.length ? ' 上次已读正文仍保留。' : ' 尚未取得大纲正文。'} 本次未调用 AI。` };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
  }
  return { ...report, id: `brief:syllabus-read:${started}`, generatedAt: new Date().toISOString(),
    sources: [...report.sources, ...added], syllabi: report.syllabi?.map(entry => entry.courseId === courseId ? status : entry),
    coverage: [...report.coverage.filter(area => !(area.courseId === courseId && area.area === 'syllabus_read')),
      { courseId, area: 'syllabus_read', label: '单课大纲读取', status: status.status === 'read' ? 'complete' : 'partial', detail: status.detail, sourceCount: added.length }],
    run: { requests: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0, elapsedMs: Date.now() - started } };
}
