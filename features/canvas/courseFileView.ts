import type { CanvasConnection, CanvasCourseFilesResult } from '@/services/canvas';

export interface CourseFileScope {
  connection: CanvasConnection;
  courseId: number;
  revision: number;
}
export type CourseFileLoad =
  | { scope: CourseFileScope; phase: 'ready'; result: CanvasCourseFilesResult }
  | { scope: CourseFileScope; phase: 'error'; message: string };

/** Hide another course's result immediately, before the next effect/request runs. */
export function currentCourseFileLoad(load: CourseFileLoad | null, scope: CourseFileScope | null): CourseFileLoad | null {
  if (!load || !scope || load.scope.connection !== scope.connection || load.scope.courseId !== scope.courseId
    || load.scope.revision !== scope.revision) return null;
  return load;
}
