import { describe, expect, it } from 'vitest';
import { briefDocumentPurpose, briefLinks, briefPagePurpose, resolveBriefFilePurpose } from './sourcePolicy';

describe('weekly brief source purpose', () => {
  it.each(['Lecture4.pdf', 'PSY473_LEC01.pdf', 'Lecture Outline.pdf', 'Reading Outline.pdf', 'Lecture 4 course schedule.pdf', 'Article about memory.pdf', 'Research paper.pdf', 'Reading assignment.pdf', 'Sample exam.pdf', 'Exam questions.pdf', 'Old exam 2024.pdf', '讲义.pdf'])('keeps teaching material in the catalog: %s', title => {
    expect(briefDocumentPurpose(title)).toBe('catalog');
    expect(resolveBriefFilePurpose(title, ['Syllabus'])).toBe('catalog');
  });
  it.each(['Syllabus.pdf', 'Course Outline.pdf', 'Lecture schedule.pdf', 'Reading_list.pdf', '教学大纲.pdf'])('reads arrangement documents: %s', title => {
    expect(briefDocumentPurpose(title)).toBe('schedule');
  });
  it.each(['Exam instructions.pdf', 'Assignment 1 guidelines.pdf', 'Submission requirements.pdf', '考试说明.pdf'])('reads explicit instructions: %s', title => {
    expect(briefDocumentPurpose(title)).toBe('instructions');
  });
  it('uses a teacher link label for neutral names, with uncertain names remaining catalog-only', () => {
    expect(resolveBriefFilePurpose('14362.pdf', ['Course syllabus'])).toBe('schedule');
    expect(resolveBriefFilePurpose('14362.pdf', ['Read this'])).toBe('catalog');
    expect(briefPagePurpose('Lecture slides')).toBe('catalog');
    expect(briefPagePurpose('Course resources')).toBe('directory');
    expect(briefPagePurpose('Week 3')).toBe('directory');
  });
  it('follows only actual same-course anchors and preserves external references without traversing them', () => {
    const result = briefLinks(`<script><a href="/files/1">Syllabus</a></script>
      <!-- <a href="/files/2">Syllabus</a> --><img src="/files/3">
      <a href="/courses/99/pages/syllabus">Syllabus</a>
      <a href="/courses/12/pages/syllabus">Syllabus</a>
      <a href="/courses/12/files/5/download?download_frd=1&amp;x=2">Course schedule</a>
      <a href="https://journal.example/a">Reading A</a>
      <a href="javascript:alert(1)">bad</a>`, 'https://school.example/courses/12', 12);
    expect(result).toHaveLength(3);
    expect(result[0].pageSlug).toBe('syllabus');
    expect(result[1]).toMatchObject({ fileId: 5, label: 'Course schedule', external: false });
    expect(result[1].url).toContain('&x=2');
    expect(result[2]).toMatchObject({ label: 'Reading A', external: true });
  });
});
