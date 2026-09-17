import { localizeText } from '@/shared/i18n/appLanguage';
import { canvasFileAccessProblem } from '@/shared/canvasFileAccess';

export interface CanvasConnection {
  canvasUrl: string;
  accessToken: string;
}

export interface CanvasProfile {
  id: number;
  name: string;
  primary_email?: string;
  time_zone?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state?: string;
  access_restricted_by_date?: boolean;
  syllabus_body?: string;
  time_zone?: string;
  start_at?: string | null;
  end_at?: string | null;
  term?: {
    id: number;
    name: string;
    start_at?: string | null;
    end_at?: string | null;
  };
}

export interface CanvasFile {
  id: number;
  course_id?: number | string | null;
  published?: boolean;
  folder_id: number;
  display_name: string;
  filename: string;
  size: number;
  created_at?: string;
  updated_at?: string;
  locked_for_user?: boolean;
  hidden_for_user?: boolean;
  'content-type': string;
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name: string;
}

export class CanvasRequestError extends Error {
  constructor(message: string, public code = 'unavailable', public status = 502) {
    super(message); this.name = 'CanvasRequestError';
  }
}
export interface CanvasRequestOptions { signal?: AbortSignal }

const fetchCanvasProxy = async (path: string, init: RequestInit): Promise<Response> => {
  try { return await fetch(path, init); }
  catch (error) {
    if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new CanvasRequestError(localizeText('无法连接 Canvas 读取服务，请确认逃课神器仍在运行。', 'Could not reach the Canvas reader. Check that the app is running.'), 'unavailable');
  }
};

const responseError = async (response: Response): Promise<CanvasRequestError> => {
  const payload = await response.json().catch(() => null) as { error?: string; message?: string; code?: string } | null;
  return new CanvasRequestError(
    (typeof payload?.error === 'string' ? payload.error : payload?.message) || (response.status === 401
      ? localizeText('Canvas 授权失败，请检查访问令牌。', 'Canvas authorization failed. Check your access token.')
      : response.status === 403
        ? localizeText('Canvas 不允许读取这项内容（403）；请查看本课程开放的其他入口。', 'Canvas denied access to this content (403). Check the available course entry points.')
      : localizeText('无法完整读取 Canvas，请稍后重试。', 'Could not completely load Canvas. Please try again.')),
    payload?.code || (response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'unavailable'), response.status,
  );
};

export const requestCanvas = async <T>(connection: CanvasConnection, path: string, options: CanvasRequestOptions = {}): Promise<T> => {
  const response = await fetchCanvasProxy('/api/canvas/request', {
    method: 'POST', credentials: 'same-origin', redirect: 'error', signal: options.signal,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ canvasUrl: connection.canvasUrl, path }),
  });
  if (!response.ok) throw await responseError(response);
  try { return await response.json() as T; }
  catch { throw new CanvasRequestError(localizeText('Canvas 内容未读取完整，请重新同步。', 'Canvas content was incomplete. Please sync again.'), 'incomplete'); }
};

export const testCanvasConnection = async (connection: CanvasConnection): Promise<CanvasProfile> => (
  requestCanvas<CanvasProfile>(connection, '/api/v1/users/self/profile')
);

export const listCanvasCourses = async (connection: CanvasConnection): Promise<CanvasCourse[]> => {
  const courses = await requestCanvas<CanvasCourse[]>(
    connection,
    '/api/v1/courses?enrollment_state=active&state[]=available&include[]=term&per_page=100'
  );
  return courses
    .filter((course) => course.name && !course.access_restricted_by_date)
    .sort((left, right) => {
      const leftStart = left.term?.start_at ? Date.parse(left.term.start_at) : 0;
      const rightStart = right.term?.start_at ? Date.parse(right.term.start_at) : 0;
      return rightStart - leftStart || left.name.localeCompare(right.name);
    });
};

export interface CanvasCourseFilesResult {
  files: CanvasFile[];
  folders: CanvasFolder[];
  warnings: string[];
  /** Whether the file directory itself was read completely. Folder grouping is optional. */
  complete: boolean;
}
export const CANVAS_MODULE_FALLBACK_LIMIT = 40;
export const CANVAS_MODULE_FILE_LIMIT = 120;
export const CANVAS_PAGE_FALLBACK_LIMIT = 20;
const CANVAS_PAGE_BODY_LIMIT = 500_000;
const CANVAS_PAGE_ANCHOR_LIMIT = 2000;
const CANVAS_MODULE_ITEM_LIMIT = 500;
type CanvasRow = Record<string, unknown>;
const canvasRow = (value: unknown): value is CanvasRow => !!value && typeof value === 'object' && !Array.isArray(value);
const canvasList = (value: unknown): CanvasRow[] => {
  if (!Array.isArray(value) || value.some(item => !canvasRow(item))) {
    throw new CanvasRequestError(localizeText('Canvas 列表没有完整返回。', 'Canvas returned an incomplete list.'), 'incomplete');
  }
  return value;
};
const checkCanvasCancellation = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Canvas request cancelled.', 'AbortError');
};
const inaccessibleCanvasRow = (row: CanvasRow): boolean => row.locked_for_user === true || row.hidden_for_user === true
  || row.locked === true || row.hidden === true || row.published === false || row.state === 'locked'
  || (canvasRow(row.content_details) && (row.content_details.locked_for_user === true || row.content_details.hidden_for_user === true));
// "hidden" may mean available only with a link. Explicitly linked files are still
// subject to the current student's metadata permissions and the download check.
const inaccessibleCanvasFile = (row: CanvasRow): boolean => !!canvasFileAccessProblem(row);
const supportedCanvasFile = (row: CanvasRow): boolean => ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'].includes(String(row['content-type']))
  || /\.(pdf|pptx?)$/i.test(String(row.display_name || row.filename || ''));
const validCanvasFile = (row: CanvasRow): boolean => Number.isSafeInteger(row.id) && Number(row.id) > 0
  && typeof row.filename === 'string' && typeof row.display_name === 'string' && typeof row.size === 'number' && Number.isFinite(row.size) && row.size >= 0;
const referenceBelongsToCourse = (row: CanvasRow, courseId: number, origin: string): boolean => {
  if ((row.course_id != null && row.course_id !== courseId) || (typeof row.external_url === 'string' && row.external_url)) return false;
  for (const value of [row.url, row.html_url]) {
    if (typeof value !== 'string' || !value) continue;
    try {
      const url = new URL(value, origin);
      if (url.origin !== origin || url.username || url.password) return false;
      const course = url.pathname.match(/^\/(?:api\/v1\/)?courses\/(\+?\d+)(?:\/|$)/);
      if (course && Number(course[1]) !== courseId) return false;
    } catch { return false; }
  }
  return true;
};
const canvasPageSlug = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value || value.length > 500) return undefined;
  try {
    const slug = decodeURIComponent(value);
    return !/[\/\\?#:\x00-\x1f]/.test(slug) ? slug : undefined;
  } catch { return undefined; }
};
const decodeCanvasAttribute = (value: string): string => value.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([0-9a-f]+));/gi, (entity, decimal, hex) => {
  if (decimal || hex) { const code = parseInt(decimal || hex, decimal ? 10 : 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; }
  return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' } as Record<string, string>)[entity.toLowerCase()] || entity;
});
/** Inert, bounded tokenization: quoted attributes are consumed whole; text and scripts never become links. */
const canvasAnchorReferences = (html: string): { anchors: Array<{ href?: string; endpoint?: string }>; limited: boolean } => {
  if (html.length > CANVAS_PAGE_BODY_LIMIT) return { anchors: [], limited: true };
  const clean = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|textarea|title|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  const anchors: Array<{ href?: string; endpoint?: string }> = [];
  let count = 0;
  for (const token of clean.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)) {
    const tag = token[0];
    if (!/^<a(?:\s|>)/i.test(tag)) continue;
    if (++count > CANVAS_PAGE_ANCHOR_LIMIT) return { anchors, limited: true };
    const anchor: { href?: string; endpoint?: string } = {};
    for (const attribute of tag.slice(2, -1).matchAll(/([^\s=\/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const name = attribute[1].toLowerCase(), value = decodeCanvasAttribute(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      if (name === 'href' && anchor.href === undefined) anchor.href = value;
      if (name === 'data-api-endpoint' && anchor.endpoint === undefined) anchor.endpoint = value;
    }
    if (anchor.href || anchor.endpoint) anchors.push(anchor);
  }
  return { anchors, limited: false };
};
const canvasFailureLabel = (error: unknown): string => error instanceof CanvasRequestError
  ? `HTTP ${error.status}` : localizeText('连接或读取错误', 'connection or read error');
const moduleFallbackError = (zh: string, en: string) => new CanvasRequestError(
  localizeText(`本课程文件目录拒绝读取（403）；${zh}。请在 Canvas 中查看本课程的课件入口。`,
    `The course file directory denied access (403); ${en}. Open the course material links in Canvas.`), 'file_access_limited', 403,
);

/** A restricted folder list must not discard a successfully read file list. */
export const listCanvasCourseFiles = async (
  connection: CanvasConnection,
  courseId: number,
  options: CanvasRequestOptions = {},
): Promise<CanvasCourseFilesResult> => {
  if (!Number.isSafeInteger(courseId) || courseId <= 0) throw new CanvasRequestError('Canvas course ID is invalid.', 'invalid_request', 400);
  checkCanvasCancellation(options.signal);
  const base = `/api/v1/courses/${courseId}`;
  const [fileResult, folderResult] = await Promise.allSettled([
    requestCanvas<unknown>(connection, `${base}/files?content_types[]=application/pdf&content_types[]=application/vnd.openxmlformats-officedocument.presentationml.presentation&content_types[]=application/vnd.ms-powerpoint&sort=updated_at&order=desc&per_page=100`, options).then(canvasList),
    requestCanvas<unknown>(connection, `${base}/folders?per_page=100`, options).then(canvasList),
  ]);
  checkCanvasCancellation(options.signal);
  const warnings: string[] = [];
  const folders = folderResult.status === 'fulfilled' ? folderResult.value as unknown as CanvasFolder[] : [];
  if (folderResult.status === 'rejected') warnings.push(localizeText(`文件夹分类未能读取（${canvasFailureLabel(folderResult.reason)}）；可用文件仍会显示。`, `Folder grouping could not be read (${canvasFailureLabel(folderResult.reason)}); available files are still shown.`));
  if (fileResult.status === 'fulfilled') {
    const malformed = fileResult.value.some(file => !validCanvasFile(file));
    if (malformed) warnings.push(localizeText('部分文件资料缺少必要信息，未列出；文件清单可能不完整。', 'Some file records were incomplete and were omitted.'));
    return { files: fileResult.value.filter(file => validCanvasFile(file) && supportedCanvasFile(file) && !inaccessibleCanvasFile(file)) as unknown as CanvasFile[], folders, warnings, complete: !malformed };
  }
  if (!(fileResult.reason instanceof CanvasRequestError) || fileResult.reason.status !== 403) throw fileResult.reason;

  // Only follow references Canvas has exposed in this course's accessible modules/pages.
  const origin = new URL(connection.canvasUrl).origin;
  const ids = new Set<number>(), modulePages = new Set<string>(), frontPageLinks = new Set<string>();
  let skipped = 0, failedModules = 0, failedPages = 0, failedFiles = 0, limited = false;
  const failureStatuses = new Set<string>();
  const addFile = (id: number) => {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (ids.size >= CANVAS_MODULE_FILE_LIMIT && !ids.has(id)) { limited = true; return; }
    ids.add(id);
  };
  const addPage = (set: Set<string>, value: unknown) => {
    const slug = canvasPageSlug(value);
    if (!slug) { skipped++; return; }
    if (set.size >= CANVAS_PAGE_FALLBACK_LIMIT && !set.has(slug)) { limited = true; return; }
    set.add(slug);
  };
  const collectPageReferences = (body: string, currentUrl: string, collectPages: boolean) => {
    const parsed = canvasAnchorReferences(body);
    if (parsed.limited) limited = true;
    for (const anchor of parsed.anchors) {
      // A conflicting external/cross-course href cannot lend authority to a data-api attribute.
      if (anchor.href) {
        try {
          const href = new URL(anchor.href, currentUrl);
          const scope = href.pathname.match(/^\/(?:api\/v1\/)?courses\/(\d+)(?:\/|$)/);
          if (href.origin !== origin || href.username || href.password || (scope && Number(scope[1]) !== courseId)) { skipped++; continue; }
        } catch { skipped++; continue; }
      }
      for (const reference of [anchor.href, anchor.endpoint]) {
        if (!reference) continue;
        try {
          const url = new URL(reference, currentUrl);
          if (url.origin !== origin || url.username || url.password) continue;
          const courseFile = url.pathname.match(/^\/(?:api\/v1\/)?courses\/(\d+)\/files\/(\d+)(?:\/(?:download|preview))?\/?$/);
          const apiFile = url.pathname.match(/^\/api\/v1\/files\/(\d+)\/?$/);
          if (courseFile && Number(courseFile[1]) === courseId) addFile(Number(courseFile[2]));
          else if (apiFile) addFile(Number(apiFile[1]));
          if (collectPages) {
            const page = url.pathname.match(/^\/(?:api\/v1\/)?courses\/(\d+)\/pages\/([^/]+)\/?$/);
            if (page && Number(page[1]) === courseId) addPage(frontPageLinks, page[2]);
          }
        } catch { /* Invalid links are not followed. */ }
      }
    }
  };
  let modules: CanvasRow[] = [];
  try { modules = canvasList(await requestCanvas(connection, `${base}/modules?per_page=100`, options)); }
  catch (error) { checkCanvasCancellation(options.signal); failedModules++; failureStatuses.add(`modules: ${canvasFailureLabel(error)}`); }
  const eligibleModules = modules.filter(module => {
    const allowed = Number.isSafeInteger(module.id) && Number(module.id) > 0 && !inaccessibleCanvasRow(module) && referenceBelongsToCourse(module, courseId, origin);
    if (!allowed) skipped++;
    return allowed;
  });
  if (eligibleModules.length > CANVAS_MODULE_FALLBACK_LIMIT) limited = true;
  for (const module of eligibleModules.slice(0, CANVAS_MODULE_FALLBACK_LIMIT)) {
    checkCanvasCancellation(options.signal);
    let items: CanvasRow[];
    try { items = canvasList(await requestCanvas(connection, `${base}/modules/${module.id}/items?per_page=100`, options)); }
    catch (error) { checkCanvasCancellation(options.signal); failedModules++; failureStatuses.add(`module ${module.id}: ${canvasFailureLabel(error)}`); continue; }
    if (items.length > CANVAS_MODULE_ITEM_LIMIT) limited = true;
    for (const item of items.slice(0, CANVAS_MODULE_ITEM_LIMIT)) {
      if (item.type !== 'File' && item.type !== 'Page') continue;
      if ((item.module_id != null && item.module_id !== module.id) || inaccessibleCanvasRow(item) || !referenceBelongsToCourse(item, courseId, origin)) { skipped++; continue; }
      if (item.type === 'Page') { addPage(modulePages, item.page_url); continue; }
      if (!Number.isSafeInteger(item.content_id) || Number(item.content_id) <= 0) { skipped++; continue; }
      addFile(Number(item.content_id));
    }
    if (ids.size >= CANVAS_MODULE_FILE_LIMIT) { if (eligibleModules.indexOf(module) < eligibleModules.length - 1) limited = true; break; }
  }
  // Front page plus directly linked pages only. Never enumerate pages or recursively crawl links.
  const visitedPages = new Set<string>();
  const readPage = async (path: string, slug: string | undefined, collectPages: boolean) => {
    checkCanvasCancellation(options.signal);
    try {
      const page = await requestCanvas<unknown>(connection, path, options);
      if (!canvasRow(page)) throw new CanvasRequestError('Canvas page response is incomplete.', 'incomplete');
      if (inaccessibleCanvasRow(page) || !referenceBelongsToCourse(page, courseId, origin)) { skipped++; return; }
      if (typeof page.body !== 'string') throw new CanvasRequestError('Canvas page body is unavailable.', 'incomplete');
      const actualSlug = canvasPageSlug(page.url) ?? slug;
      if (actualSlug) visitedPages.add(actualSlug);
      collectPageReferences(page.body, `${origin}/courses/${courseId}/pages/${encodeURIComponent(actualSlug || 'front_page')}`, collectPages);
    } catch (error) {
      checkCanvasCancellation(options.signal); failedPages++;
      failureStatuses.add(`${slug ? 'page' : 'front_page'}: ${canvasFailureLabel(error)}`);
    }
  };
  await readPage(`${base}/front_page`, undefined, true);
  const pageCandidates = [...new Set([...frontPageLinks, ...modulePages])].filter(slug => !visitedPages.has(slug));
  if (pageCandidates.length >= CANVAS_PAGE_FALLBACK_LIMIT) limited = true;
  for (const slug of pageCandidates.slice(0, CANVAS_PAGE_FALLBACK_LIMIT - 1)) {
    if (ids.size >= CANVAS_MODULE_FILE_LIMIT) { limited = true; break; }
    await readPage(`${base}/pages/${encodeURIComponent(slug)}`, slug, false);
  }
  const files: CanvasFile[] = [];
  const fileIds = [...ids];
  // Small bounded groups keep a course with many references responsive without flooding Canvas.
  for (let start = 0; start < fileIds.length; start += 4) {
    checkCanvasCancellation(options.signal);
    await Promise.all(fileIds.slice(start, start + 4).map(async fileId => {
      try {
        const file = await requestCanvas<unknown>(connection, `/api/v1/files/${fileId}`, options);
        if (!canvasRow(file) || file.id !== fileId || !validCanvasFile(file) || (file.course_id != null && file.course_id !== courseId)) { failedFiles++; return; }
        if (inaccessibleCanvasFile(file)) { skipped++; return; }
        if (supportedCanvasFile(file)) files.push(file as unknown as CanvasFile);
      } catch (error) { checkCanvasCancellation(options.signal); failedFiles++; failureStatuses.add(canvasFailureLabel(error)); }
    }));
  }
  checkCanvasCancellation(options.signal);
  const statusSuffix = failureStatuses.size ? ` (${[...failureStatuses].join(', ')})` : '';
  if (!files.length) throw moduleFallbackError(failedModules || failedPages || failedFiles ? `模块、课程页面或所引用文件未能读取${statusSuffix}，尚未找到可访问的 PDF/PowerPoint` : '可访问模块与课程页面中未找到允许读取的 PDF/PowerPoint', failedModules || failedPages || failedFiles ? `modules, course pages or referenced files could not be read${statusSuffix}; no accessible PDF/PowerPoint was found` : 'no accessible PDF/PowerPoint was found in available modules or course pages');
  warnings.push(localizeText('文件目录拒绝读取（403）；当前仅显示从本课程可访问模块与页面找到的文件，不能视为完整课件清单。', 'The file directory denied access (403). These files were found in accessible course modules and pages and are not a complete course file list.'));
  if (failedModules || failedPages || failedFiles) warnings.push(localizeText(`${failedModules} 个模块、${failedPages} 个页面、${failedFiles} 个文件未能读取${statusSuffix}；可能还有遗漏。`, `${failedModules} modules, ${failedPages} pages and ${failedFiles} files could not be read${statusSuffix}; some material may be missing.`));
  if (skipped) warnings.push(localizeText('已跳过未开放、隐藏或无法确认属于本课程的条目。', 'Unavailable, hidden, or unverified course references were skipped.'));
  if (limited) warnings.push(localizeText('已达到本次模块、页面或链接读取上限，剩余条目尚未检查。', 'A module, page or link lookup limit was reached; remaining references were not checked.'));
  files.sort((left, right) => left.display_name.localeCompare(right.display_name));
  return { files, folders, warnings, complete: false };
};

export const downloadCanvasFile = async (connection: CanvasConnection, canvasFile: CanvasFile, options: CanvasRequestOptions = {}): Promise<File> => {
  const response = await fetchCanvasProxy('/api/canvas/download', {
    method: 'POST', credentials: 'same-origin', redirect: 'error', signal: options.signal,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ canvasUrl: connection.canvasUrl, fileId: canvasFile.id }),
  });
  if (!response.ok) throw await responseError(response);
  const blob = await response.blob();
  const headerName = response.headers.get('x-canvas-file-name');
  let name = canvasFile.display_name || canvasFile.filename;
  try { if (headerName) name = decodeURIComponent(headerName); } catch { /* Keep the original Canvas filename. */ }
  return new File([blob], name, {
    type: blob.type || canvasFile['content-type'] || 'application/pdf',
    lastModified: canvasFile.updated_at ? Date.parse(canvasFile.updated_at) : Date.now(),
  });
};

const CANVAS_SESSION_KEY = 'class-skip:canvas-connection';

export const loadCanvasConnection = (): CanvasConnection | null => {
  try {
    const raw = window.sessionStorage.getItem(CANVAS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasConnection;
    return parsed.canvasUrl && parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
};

export const saveCanvasConnection = (connection: CanvasConnection) => {
  window.sessionStorage.setItem(CANVAS_SESSION_KEY, JSON.stringify(connection));
  window.dispatchEvent?.(new Event('canvas-connection-changed'));
};

export const clearCanvasConnection = () => {
  window.sessionStorage.removeItem(CANVAS_SESSION_KEY);
  window.dispatchEvent?.(new Event('canvas-connection-changed'));
};
