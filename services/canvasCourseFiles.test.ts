import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/i18n/appLanguage', () => ({ localizeText: (zh: string) => zh }));
import { CANVAS_MODULE_FALLBACK_LIMIT, CANVAS_MODULE_FILE_LIMIT, CANVAS_PAGE_FALLBACK_LIMIT, CanvasRequestError, listCanvasCourseFiles, requestCanvas } from './canvas';

const connection = { canvasUrl: 'https://canvas.university.edu', accessToken: 'test-only-token' };
const base = '/api/v1/courses/71';
const file = (id: number, extra: Record<string, unknown> = {}) => ({ id, folder_id: 2, display_name: `Lecture-${id}.pdf`, filename: `lecture-${id}.pdf`, size: 500, 'content-type': 'application/pdf', ...extra });
const forbidden = () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
const json = (value: unknown) => new Response(JSON.stringify(value));
function routes(handler: (path: string, init: RequestInit) => unknown | Response | Promise<unknown | Response>) {
  const paths: string[] = [];
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init: RequestInit) => {
    const path = (JSON.parse(init.body as string) as { path: string }).path.split('?')[0]; paths.push(path);
    const value = await handler(path, init); return value instanceof Response ? value : json(value);
  });
  vi.stubGlobal('fetch', fetcher); return { paths, fetcher };
}
afterEach(() => vi.unstubAllGlobals());

describe('Canvas course file discovery', () => {
  it('keeps successful files when folder grouping is forbidden', async () => {
    const { paths } = routes(path => path === `${base}/files` ? [file(10)] : forbidden());
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result).toMatchObject({ files: [file(10)], folders: [], complete: true });
    expect(result.warnings.join(' ')).toContain('文件夹'); expect(result.warnings.join(' ')).toContain('403');
    expect(paths).not.toContain(`${base}/modules`);
  });
  it('recovers only allowed current-course module file references and never presents the list as complete', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files` || path === `${base}/folders`) return forbidden();
      if (path === `${base}/modules`) return [{ id: 1 }, { id: 2, state: 'locked' }, { id: 3, published: false }];
      if (path === `${base}/modules/1/items`) return [
        { type: 'File', content_id: 10, module_id: 1, html_url: `${connection.canvasUrl}/courses/71/modules/items/99` },
        { type: 'File', content_id: 10 }, // duplicate reference
        { type: 'File', content_id: 11, locked_for_user: true },
        { type: 'File', content_id: 12, hidden_for_user: true },
        { type: 'File', content_id: 13, published: false },
        { type: 'File', content_id: 14, html_url: `${connection.canvasUrl}/courses/72/files/14` },
        { type: 'File', content_id: 15, html_url: 'https://external.edu/file.pdf' },
        { type: 'ExternalUrl', content_id: 16 },
        { type: 'File', content_id: 17, content_details: { locked_for_user: true } },
        { type: 'File', content_id: 18, course_id: 72 },
        { type: 'File', content_id: 19, module_id: 999 },
      ];
      if (path === '/api/v1/files/10') return file(10);
      throw new Error(`Unexpected path: ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id)).toEqual([10]); expect(result.complete).toBe(false);
    expect(result.warnings.join(' ')).toContain('403'); expect(result.warnings.join(' ')).toContain('完整');
    expect(paths.filter(path => path.startsWith('/api/v1/files/'))).toEqual(['/api/v1/files/10']);
    expect(paths).not.toContain(`${base}/modules/2/items`); expect(paths).not.toContain(`${base}/modules/3/items`);
  });
  it('filters inaccessible, unsupported, or mismatched metadata returned for valid module references', async () => {
    routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return [10, 11, 12, 13, 14, 15, 16].map(content_id => ({ type: 'File', content_id }));
      if (path === '/api/v1/files/10') return file(10);
      if (path === '/api/v1/files/11') return file(11, { hidden_for_user: true });
      if (path === '/api/v1/files/12') return file(12, { locked_for_user: true });
      if (path === '/api/v1/files/13') return file(13, { course_id: 72 });
      if (path === '/api/v1/files/14') return file(140);
      if (path === '/api/v1/files/15') return file(15, { display_name: 'lecture.txt', filename: 'lecture.txt', 'content-type': 'text/plain' });
      if (path === '/api/v1/files/16') return file(16, { display_name: 'Lecture.pptx', filename: 'lecture.pptx', 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      throw new Error('Unexpected route');
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id).sort((a, b) => a - b)).toEqual([10, 16]);
    expect(result.warnings.some(warning => warning.includes('未能读取'))).toBe(true);
  });
  it.each(['none', 'modules_denied', 'items_denied', 'metadata_denied'])('reports the directory and module source when fallback yields no files: %s', async mode => {
    routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return mode === 'modules_denied' ? forbidden() : mode === 'none' ? [] : [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return mode === 'items_denied' ? forbidden() : [{ type: 'File', content_id: 10 }];
      return forbidden();
    });
    const error = await listCanvasCourseFiles(connection, 71).catch(error => error) as CanvasRequestError;
    expect(error).toMatchObject({ code: 'file_access_limited', status: 403 });
    expect(error.message).toContain('文件目录'); expect(error.message).toContain('403'); expect(error.message).toContain('模块');
    expect(error.message).not.toMatch(/令牌|token|private/i);
  });
  it('does not turn a true authorization failure into module crawling', async () => {
    const { paths } = routes(path => path === `${base}/files` ? new Response(JSON.stringify({ error: 'Invalid token', code: 'unauthorized' }), { status: 401 }) : []);
    await expect(listCanvasCourseFiles(connection, 71)).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
    expect(paths).not.toContain(`${base}/modules`);
  });
  it('does not hide a paginated file-list failure behind a partial fallback', async () => {
    const { paths } = routes(path => path === `${base}/files` ? new Response(JSON.stringify({ error: 'Incomplete', code: 'incomplete' }), { status: 502 }) : []);
    await expect(listCanvasCourseFiles(connection, 71)).rejects.toMatchObject({ code: 'incomplete' });
    expect(paths).not.toContain(`${base}/modules`);
  });
  it('bounds module traversal and warns about omitted modules', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return Array.from({ length: CANVAS_MODULE_FALLBACK_LIMIT + 1 }, (_, index) => ({ id: index + 1 }));
      if (path === `${base}/modules/1/items`) return [{ type: 'File', content_id: 10 }];
      if (path === '/api/v1/files/10') return file(10);
      return [];
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(paths.filter(path => /\/modules\/\d+\/items/.test(path))).toHaveLength(CANVAS_MODULE_FALLBACK_LIMIT);
    expect(result.warnings.some(warning => warning.includes('上限'))).toBe(true);
  });
  it('bounds metadata requests and warns when file references exceed the limit', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return Array.from({ length: CANVAS_MODULE_FILE_LIMIT + 2 }, (_, index) => ({ type: 'File', content_id: index + 1 }));
      return file(Number(path.split('/').pop()));
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(paths.filter(path => path.startsWith('/api/v1/files/'))).toHaveLength(CANVAS_MODULE_FILE_LIMIT);
    expect(result.warnings.some(warning => warning.includes('上限'))).toBe(true);
  });
  it('forwards cancellation to every request and stops before later module metadata work', async () => {
    const controller = new AbortController();
    const { paths, fetcher } = routes((path, init) => {
      expect(init.signal).toBe(controller.signal);
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) { controller.abort(); return [{ id: 1 }]; }
      throw new Error('Should have cancelled');
    });
    await expect(listCanvasCourseFiles(connection, 71, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(3); expect(paths).not.toContain(`${base}/modules/1/items`);
  });
  it('classifies code-less 403 as forbidden instead of a token problem', async () => {
    routes(() => new Response('{}', { status: 403 }));
    const error = await requestCanvas(connection, `${base}/files`).catch(error => error) as CanvasRequestError;
    expect(error.code).toBe('forbidden'); expect(error.message).not.toContain('令牌');
  });
  it('finds real linked files through the front page when file, module and page directories are restricted', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files` || path === `${base}/folders` || path === `${base}/modules` || path === `${base}/pages`) return forbidden();
      if (path === `${base}/front_page`) return { url: 'home', published: true, body: `<a href="/courses/71/pages/learning-materials">Learning materials</a>` };
      if (path === `${base}/pages/learning-materials`) return { url: 'learning-materials', published: true, body: `
        <a href="/courses/71/files/10?wrap=1&amp;verifier=ignored">Lecture</a>
        <a href="/courses/71/files/11" data-api-endpoint="${connection.canvasUrl}/api/v1/files/11">Link-only file</a>
        <a data-api-endpoint="${connection.canvasUrl}/api/v1/files/12">Review</a>
        <a href="/courses/71/pages/deeper-page">Do not recurse</a>
        <!-- <a href="/courses/71/files/99">Comment</a> -->
        <script>const fake = '<a href="/courses/71/files/98">Script</a>';</script>
        <style>.x:after{content:'<a href="/courses/71/files/97">Style</a>'}</style>
        <div title="<a href='/courses/71/files/96'>attribute text</a>">Ordinary text</div>
        &lt;a href="/courses/71/files/95"&gt;Escaped text&lt;/a&gt;
      ` };
      if (path === '/api/v1/files/10') return file(10);
      if (path === '/api/v1/files/11') return file(11, { hidden: true, hidden_for_user: false, locked_for_user: false });
      if (path === '/api/v1/files/12') return file(12);
      throw new Error(`Unexpected path ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id)).toEqual([10, 11, 12]); expect(result.complete).toBe(false);
    expect(paths).not.toContain(`${base}/pages`); expect(paths).not.toContain(`${base}/pages/deeper-page`);
    expect(paths.filter(path => path.startsWith('/api/v1/files/'))).toEqual(['/api/v1/files/10', '/api/v1/files/11', '/api/v1/files/12']);
    expect(result.warnings.join(' ')).toContain('modules: HTTP 403');
  });
  it('ignores external and other-course page links, locked module pages and files from blocked page bodies', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return [{ type: 'File', content_id: 10 }, { type: 'Page', page_url: 'locked-module-page', locked_for_user: true }, { type: 'Page', page_url: 'foreign-module-page', html_url: `${connection.canvasUrl}/courses/72/pages/foreign-module-page` }];
      if (path === `${base}/front_page`) return { url: 'home', body: `
        <a href="https://external.edu/courses/71/pages/external">External page</a>
        <a href="/courses/72/pages/foreign-page">Other course</a>
        <a href="/courses/71/pages/locked-page">A page whose API denies reading</a>
        <a href="/courses/71/pages/hidden-page">Hidden page</a>
        <a href="/courses/71/pages/unpublished-page">Unpublished page</a>
        <a href="/courses/72/files/99" data-api-endpoint="/api/v1/files/99">Conflicting course scope</a>
        <a href="https://external.edu/a" data-api-endpoint="/api/v1/files/98">External href</a>
      ` };
      if (path === `${base}/pages/locked-page`) return { locked_for_user: true, body: '<a href="/courses/71/files/20">Blocked</a>' };
      if (path === `${base}/pages/hidden-page`) return { hidden: true, body: '<a href="/courses/71/files/21">Hidden</a>' };
      if (path === `${base}/pages/unpublished-page`) return { published: false, body: '<a href="/courses/71/files/22">Unpublished</a>' };
      if (path === '/api/v1/files/10') return file(10);
      throw new Error(`Unexpected path ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id)).toEqual([10]);
    expect(paths.filter(path => path.startsWith('/api/v1/files/'))).toEqual(['/api/v1/files/10']);
    expect(paths.some(path => /foreign|external|locked-module/.test(path))).toBe(false);
  });
  it('uses accessible module Page references when the front page cannot be read', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files` || path === `${base}/front_page`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return [{ type: 'Page', page_url: 'reading-list', module_id: 1 }];
      if (path === `${base}/pages/reading-list`) return { url: 'reading-list', body: '<a href="/courses/71/files/10">PDF</a>' };
      if (path === '/api/v1/files/10') return file(10);
      throw new Error(`Unexpected path ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id)).toEqual([10]); expect(result.complete).toBe(false);
    expect(paths).toContain(`${base}/pages/reading-list`); expect(result.warnings.join(' ')).toContain('front_page: HTTP 403');
  });
  it('prioritizes front-page links and caps all page requests at twenty without recursion', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return Array.from({ length: 20 }, (_, index) => ({ type: 'Page', page_url: `module-page-${index}` }));
      if (path === `${base}/front_page`) return { url: 'home', body: Array.from({ length: 20 }, (_, index) => `<a href="/courses/71/pages/front-${index}">Page</a>`).join('') };
      if (path.startsWith(`${base}/pages/front-`)) return { body: '<a href="/courses/71/files/10">File</a><a href="/courses/71/pages/deeper">Ignored</a>' };
      if (path === '/api/v1/files/10') return file(10);
      throw new Error(`Unexpected path ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(paths.filter(path => path === `${base}/front_page` || path.startsWith(`${base}/pages/`))).toHaveLength(CANVAS_PAGE_FALLBACK_LIMIT);
    expect(paths).toContain(`${base}/pages/front-0`); expect(paths.some(path => path.includes('module-page-'))).toBe(false);
    expect(result.warnings.join(' ')).toContain('上限'); expect(result.complete).toBe(false);
  });
  it('marks oversized page bodies as unexamined instead of parsing arbitrary truncated HTML', async () => {
    const { paths } = routes(path => {
      if (path === `${base}/files`) return forbidden();
      if (path === `${base}/folders`) return [];
      if (path === `${base}/modules`) return [{ id: 1 }];
      if (path === `${base}/modules/1/items`) return [{ type: 'File', content_id: 10 }];
      if (path === `${base}/front_page`) return { body: '<a href="/courses/71/files/99">Skipped</a>' + 'x'.repeat(500_000) };
      if (path === '/api/v1/files/10') return file(10);
      throw new Error(`Unexpected path ${path}`);
    });
    const result = await listCanvasCourseFiles(connection, 71);
    expect(result.files.map(file => file.id)).toEqual([10]); expect(paths).not.toContain('/api/v1/files/99');
    expect(result.warnings.join(' ')).toContain('上限'); expect(result.complete).toBe(false);
  });

});
