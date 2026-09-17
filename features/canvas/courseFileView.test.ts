import { describe, expect, it } from 'vitest';
import { currentCourseFileLoad, type CourseFileLoad, type CourseFileScope } from './courseFileView';

const connection = { canvasUrl: 'https://canvas.example.edu', accessToken: 'test-only' };
const psychology: CourseFileScope = { connection, courseId: 240, revision: 0 };
const biochemistry: CourseFileScope = { connection, courseId: 210, revision: 0 };
const loadedPsychology: CourseFileLoad = {
  scope: psychology,
  phase: 'ready',
  result: { files: [{ id: 1, folder_id: 2, display_name: 'PSY240.pdf', filename: 'PSY240.pdf', size: 10, 'content-type': 'application/pdf' }], folders: [], warnings: [], complete: true },
};

describe('Canvas course switching', () => {
  it('hides the previous course immediately while the new request is still pending', () => {
    expect(currentCourseFileLoad(loadedPsychology, psychology)).toBe(loadedPsychology);
    expect(currentCourseFileLoad(loadedPsychology, biochemistry)).toBeNull();
    const failedCourse: CourseFileLoad = { scope: biochemistry, phase: 'error', message: '文件目录读取被拒绝（403）' };
    expect(currentCourseFileLoad(failedCourse, biochemistry)).toEqual(failedCourse);
    expect(currentCourseFileLoad(failedCourse, biochemistry)).not.toHaveProperty('result.files');
    // A late success from the previous course must not restore its file list.
    expect(currentCourseFileLoad(loadedPsychology, biochemistry)).toBeNull();
  });

  it('does not re-enable old files after retrying or reconnecting', () => {
    expect(currentCourseFileLoad(loadedPsychology, { ...psychology, revision: 1 })).toBeNull();
    expect(currentCourseFileLoad(loadedPsychology, { ...psychology, connection: { ...connection } })).toBeNull();
    expect(currentCourseFileLoad(loadedPsychology, null)).toBeNull();
  });

  it('keeps partial results and their warnings associated with the correct course', () => {
    const partial: CourseFileLoad = { ...loadedPsychology, result: { ...loadedPsychology.result, complete: false, warnings: ['仅列出本课模块中可访问的文件。'] } };
    expect(currentCourseFileLoad(partial, psychology)).toEqual(partial);
    expect(currentCourseFileLoad(partial, biochemistry)).toBeNull();
  });
});
