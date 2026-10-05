import type { LSAPKnowledgeComponent, PersistedSkimSession } from '@/types';

export interface ModuleReviewSource {
  pdf: File;
  sessions: PersistedSkimSession[];
  preferredSessionId?: string;
  knowledge: LSAPKnowledgeComponent[];
}
export interface ReviewModule {
  id: string;
  routeId: string;
  sessionId: string;
  sessionTitle: string;
  title: string;
  summary: string;
  start: number;
  end: number;
}
export interface SourcePage {
  page: number;
  text: string;
}
export interface Objective {
  id: string;
  title: string;
  explanation: string;
  pages: number[];
  evidence: string;
  kind: 'concept' | 'relationship' | 'evidence' | 'application' | 'limitation';
}
export interface ModulePlan {
  objectives: Objective[];
  excluded: string[];
}
export interface LessonSection {
  title: string;
  markdown: string;
  objectiveIds: string[];
  pages: number[];
}
export interface Lesson {
  sections: LessonSection[];
  language: 'zh' | 'en';
}
export type Level = 'foundation' | 'connection' | 'application' | 'analysis';
export interface QuestionSlot {
  id: string;
  level: Level;
  kind: 'choice' | 'written';
  objectiveIds: string[];
}
export interface ReviewQuestion extends QuestionSlot {
  promptEn: string;
  promptZh: string;
  optionsEn: string[];
  optionsZh: string[];
  correctIndex: number;
  reference: string;
  criteria: string[];
  pages: number[];
}
export interface Assessment {
  questionId: string;
  status: 'met' | 'partial' | 'not_yet' | 'unanswered';
  feedback: string;
  criteria: Array<{ criterion: string; status: 'met' | 'partial' | 'missing'; evidence: string }>;
}
export interface Attempt {
  id: string;
  createdAt: number;
  answers: Record<string, string>;
  assessments: Assessment[];
  assisted: boolean;
  language: 'zh' | 'en';
}
export interface ModuleReviewRecord {
  version: 1;
  id: string;
  module: ReviewModule;
  sourceFingerprint: string;
  plan?: ModulePlan;
  lessons: Partial<Record<'zh' | 'en', Lesson>>;
  lessonRead: boolean;
  questionCount: 16 | 24;
  questions: ReviewQuestion[];
  draft: Record<string, string>;
  attempts: Attempt[];
  supplements: Record<string, string>;
  stage: 'prepare' | 'lesson' | 'assignment' | 'feedback';
  assignmentReviewed?: boolean;
  pendingRepairs?: Array<{ id: string; reason: string }>;
  draftAssisted?: boolean;
  showChinese: boolean;
  updatedAt: number;
}
