import type { Exam, ExamMaterialLink } from '@/types';
import { assessExamPressure, type ExamPressureAssessment, type FilePlanMeta } from '@/utils/examSchedule';

export interface MaintenanceEligibilityResult {
  allowedExamIds: string[];
  blockedSprint: ExamPressureAssessment[];
  warning: ExamPressureAssessment[];
  allAssessments: ExamPressureAssessment[];
}

export function evaluateMaintenanceEligibility(input: {
  now: Date;
  exams: Exam[];
  selectedExamIds: string[];
  materialsByExamId: Map<string, ExamMaterialLink[]>;
  fileMeta?: Map<string, FilePlanMeta>;
}): MaintenanceEligibilityResult {
  const selected = input.exams.filter((e) => input.selectedExamIds.includes(e.id));
  const allAssessments = selected.map((e) =>
    assessExamPressure(e, input.materialsByExamId.get(e.id) || [], input.fileMeta, input.now)
  );
  const blockedSprint = allAssessments.filter((a) => a.mode === 'sprint_mode');
  const warning = allAssessments.filter((a) => a.mode === 'warning_mode');
  const allowedExamIds = allAssessments.filter((a) => a.mode !== 'sprint_mode').map((a) => a.examId);
  return { allowedExamIds, blockedSprint, warning, allAssessments };
}
