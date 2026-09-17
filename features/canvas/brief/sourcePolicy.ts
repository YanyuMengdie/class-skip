/** Purpose is decided before downloading a body. Unclear resources stay in the catalog. */
export type BriefDocumentPurpose = 'schedule' | 'instructions' | 'catalog';

const plainLabel = (label: string) => label
  .replace(/([a-z\d])([A-Z])/g, '$1 $2')
  .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
  .replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
const teaching = /\b(?:lectures?|slides?|articles?|chapters?|textbooks?|papers?|readings?|journal|research|text)\b|课件|讲义|论文|文章|教材|课文/i;
const numberedTeaching = /(?:lecture|lec|chapter|slide|reading)\s*\d|第\s*[\d一二三四五六七八九十]+\s*讲/i;
const practice = /\b(?:past|previous|old|sample|practice|mock)\s*(?:exams?|tests?|questions?|papers?)|\b(?:exam|test)\s*(?:review|solutions?|answers?|questions?)|往年|真题|练习题|模拟题|参考答案/i;

/** A syllabus is a course-wide source, unlike a standalone weekly schedule. */
export function isSyllabusLabel(label: string): boolean {
  const name = plainLabel(label).replace(/\s*·\s*第\s*\d+\s*页$/, '');
  if (practice.test(name) || numberedTeaching.test(name)) return false;
  // Course filenames often run all words together, including all-lowercase names.
  return /syllabus|course\s*outline|class\s*outline|课程大纲|教学大纲/i.test(name);
}

export function briefDocumentPurpose(label: string): BriefDocumentPurpose {
  const name = plainLabel(label).replace(/\s*·\s*第\s*\d+\s*页$/, '');
  // Schedules may legitimately be called "Lecture schedule" or "Reading list".
  const schedule = isSyllabusLabel(label) || /\b(?:course|class|teaching|term|semester|weekly)\s*(?:outline|schedule|calendar|plan|information)\b|\b(?:lecture|reading)\s*(?:schedule|calendar)\b|\b(?:schedule|timetable|reading\s*list)\b|课程安排|教学计划|课程日历|阅读清单|课表|时间表/i.test(name);
  if (practice.test(name) || numberedTeaching.test(name)) return 'catalog';
  if (schedule) return 'schedule';
  if (teaching.test(name)) return 'catalog';
  if (/\b(?:assignment|assessment|exam|test|submission|project|essay)\s*(?:\d+\s*)?(?:instructions?|guidelines?|requirements?|brief|information|info|details?|rubric|schedule)\b|\b(?:instructions?|guidelines?|rubric)\s*(?:for\s*)?(?:assignment|assessment|exam|test|project|essay)\b|\b(?:assignment|assessment|exam|test)\s*\d*\s*(?:pdf)?$|作业要求|作业说明|考试安排|考试说明|考试要求|提交要求|评分标准/i.test(name)) return 'instructions';
  return 'catalog';
}

export function briefPagePurpose(title: string): BriefDocumentPurpose | 'directory' {
  const purpose = briefDocumentPurpose(title);
  if (purpose !== 'catalog') return purpose;
  const name = plainLabel(title);
  if (/\b(?:course\s*(?:home|materials|resources|content)|home|overview|start\s*here|modules?|weekly\s*(?:overview|agenda)|week\s*\d+|syllabus|assessments?|assignments?|announcements?)\b|课程首页|课程资料|课程资源|本周安排|第\s*\d+\s*周|作业与考试/i.test(name)
    && !/\b(?:article|chapter|paper|slides?)\b|论文|课件|讲义/i.test(name)) return 'directory';
  return 'catalog';
}

export interface BriefLink { url: string; label: string; fileId?: number; pageSlug?: string; external: boolean }
const decodeAttribute = (value: string) => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; });

/** Only actual same-course anchors are traversable. External links are retained as references. */
export function briefLinks(html: string, currentUrl: string, courseId: number): BriefLink[] {
  const origin = new URL(currentUrl).origin;
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const links: BriefLink[] = [];
  for (const anchor of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    if (links.length >= 2_000) break;
    const href = anchor[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const endpoint = anchor[1].match(/\bdata-api-endpoint\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3] ?? endpoint?.[1] ?? endpoint?.[2];
    if (!raw) continue;
    try {
      const url = new URL(decodeAttribute(raw), currentUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      const label = decodeAttribute(anchor[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      const external = url.origin !== origin;
      if (external) { links.push({ url: url.href, label, external }); continue; }
      const course = url.pathname.match(/\/(?:api\/v1\/)?courses\/(\+?\d+)\//);
      if (course && Number(course[1]) !== courseId) continue;
      const file = url.pathname.match(/^\/(?:api\/v1\/)?(?:courses\/\d+\/)?files\/(\d+)(?:\/|$)/);
      const page = url.pathname.match(/^\/(?:api\/v1\/)?courses\/\d+\/pages\/([^/]+)\/?$/);
      links.push({ url: url.href, label, external, ...(file ? { fileId: Number(file[1]) } : {}), ...(page ? { pageSlug: decodeURIComponent(page[1]) } : {}) });
    } catch { /* Invalid/untrusted references are not followed. */ }
  }
  return links;
}

/** Download decisions require a positive administrative label, never just a PDF link. */
export function resolveBriefFilePurpose(filename: string, labels: string[]): BriefDocumentPurpose {
  const actual = briefDocumentPurpose(filename);
  if (actual !== 'catalog') return actual;
  if (teaching.test(plainLabel(filename)) || numberedTeaching.test(plainLabel(filename)) || practice.test(plainLabel(filename))) return 'catalog';
  // A neutral numeric filename may be identified by the teacher's explicit anchor text.
  return labels.map(briefDocumentPurpose).find(purpose => purpose !== 'catalog') ?? 'catalog';
}
