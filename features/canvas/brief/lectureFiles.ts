import type { BriefItem, BriefSource, CourseBriefReport } from './types';

type Role = NonNullable<BriefSource['resourceRole']>;
export function resourceRole(title: string, documentRole?: BriefSource['documentRole']): Role {
  if (documentRole) return documentRole;
  const name = title.replace(/[_.-]/g, ' ');
  if (/syllabus|course\s+(?:outline|syllabi)|课程大纲/i.test(name)) return 'syllabus';
  if (/assignment|instructions?|rubric|problem\s*set|prep\s*questions?|\bLPQs?\b|作业|评分细则/i.test(name)) return 'instructions';
  if (/timetable|schedule|calendar|课程安排/i.test(name)) return 'schedule';
  if (/lecture|slides?|\bLEC\s*\d|\bL\d+\b|课件|讲义/i.test(name)) return 'lecture';
  if (/readings?|articles?|journal|papers?|et\s*al|阅读|论文|文章/i.test(name)) return 'reading';
  return 'unknown';
}
export function lectureNumber(title: string): number | undefined {
  const match = title.match(/(?:\b(?:lecture|lec|L)\s*0*|第\s*)(\d+)\b/i) || title.match(/^\s*(\d+)[.、:：]\s*/);
  return match ? Number(match[1]) : undefined;
}
export function allowedLectureFile(source: BriefSource, item: BriefItem): boolean {
  const role = source.resourceRole || resourceRole(source.title, source.documentRole);
  return source.courseId === item.courseId && !!source.fileId && /\.pdf\b/i.test(source.title)
    && (role === 'lecture' || role === 'unknown');
}
export function lectureFileCandidates(item: BriefItem, report: CourseBriefReport) {
  const number = lectureNumber(item.title);
  const tokens = new Set(item.title.toLowerCase().match(/[a-z]{4,}/g)?.filter(word => !['lecture', 'introduction', 'course', 'week'].includes(word)) || []);
  const unique = new Map<number, BriefSource>();
  for (const source of report.sources) if (allowedLectureFile(source, item) && !unique.has(source.fileId!)) unique.set(source.fileId!, source);
  return [...unique.values()].map(source => {
    const fileNumber = lectureNumber(source.title);
    const conflict = number !== undefined && fileNumber !== undefined && number !== fileNumber;
    const directlyLinked = item.evidence.some(e => new RegExp(`/files/${source.fileId}(?:[/\\s?#"')]|$)`).test(e.quote));
    const words = new Set(source.title.toLowerCase().match(/[a-z]{4,}/g) || []);
    const overlap = [...tokens].filter(token => words.has(token)).length;
    const score = conflict ? 0 : directlyLinked ? 100 : number !== undefined && number === fileNumber ? 80 : overlap >= 2 ? 40 + overlap : 0;
    return { source, score, conflict, role: source.resourceRole || resourceRole(source.title, source.documentRole) };
  }).sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title));
}
