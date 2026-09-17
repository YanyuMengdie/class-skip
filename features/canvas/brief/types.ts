import type { CanvasConnection, CanvasCourse } from '@/services/canvas';

export interface BriefSource {
  id: string;
  courseId: number;
  kind: 'syllabus' | 'assignment' | 'announcement' | 'page' | 'file' | 'module' | 'calendar' | 'quiz' | 'discussion';
  title: string;
  url: string;
  text: string;
  fetchedAt: string;
  updatedAt?: string;
  publishedAt?: string;
  fileId?: number;
  page?: number;
  assignmentId?: number;
  /** Catalog entries identify resources; their bodies are never sent for brief analysis. */
  readMode?: 'content' | 'catalog' | 'lecture';
  /** Explicit document classification; local syllabi use documentId instead of a Canvas fileId. */
  documentRole?: 'syllabus' | 'schedule' | 'instructions';
  documentId?: string;
  resourceRole?: 'syllabus' | 'lecture' | 'reading' | 'instructions' | 'schedule' | 'unknown';
  linkedFrom?: string[];
}
export interface BriefEvidence { sourceId: string; quote: string }
export interface BriefDate {
  value: string;
  precision: 'datetime' | 'date';
  origin: 'canvas' | 'document';
  raw: string;
  timeZone: string;
  /** Explicit course context used to resolve an otherwise incomplete date literal. */
  context?: string;
}
export interface BriefItem {
  id: string;
  courseId: number;
  kind: 'assignment' | 'quiz' | 'exam' | 'discussion' | 'lecture' | 'reading' | 'notice';
  title: string;
  details: string;
  url: string;
  evidence: BriefEvidence[];
  requirement: 'required' | 'optional' | 'unspecified';
  date?: BriefDate;
  dateText?: string;
  /** Keep submission deadlines distinct from classes, reading dates and other times. */
  dateRole?: 'deadline' | 'start' | 'reading' | 'other';
  dateStatus: 'confirmed' | 'unspecified' | 'needs_confirmation' | 'conflict';
  status: 'submitted' | 'not_submitted' | 'excused' | 'unknown';
  assignmentId?: number;
  /** A text finding may point to a known task but can never replace its API date. */
  relatedAssignmentId?: number;
  issues: string[];
  /** General policies and conditional procedures are not outstanding student tasks. */
  context?: 'action' | 'reference' | 'conditional';
  /** Source coordinates/dates checked by code; not a second model's approval. */
  evidenceCheck?: 'source';
  /** Monday of a week explicitly assigned in the source; never inferred from upload time. */
  weekStart?: string;
  weekContext?: string;
  /** A verified Chinese digest; full teacher wording stays in details/evidence. */
  digest?: {
    overview: string;
    keyRequirements: string[];
    preparation: string[];
    evidence: BriefEvidence[];
  };
  assessmentWeight?: { percent: number; basis: 'individual'; evidence: BriefEvidence[] };
  lectureFile?: { fileId: number; confirmedBy: 'user' | 'source' };
  guide?: {
    status: 'ready' | 'unavailable';
    overview?: string;
    concepts?: string[];
    preparation?: string[];
    evidence?: BriefEvidence[];
    reason?: string;
  };
}
export interface BriefCoverage {
  courseId: number;
  area: string;
  label: string;
  status: 'complete' | 'partial' | 'unavailable' | 'skipped';
  detail: string;
  sourceCount: number;
}
export interface BriefChange {
  id: string;
  courseId: number;
  kind: 'added' | 'changed' | 'no_longer_returned';
  title: string;
  before?: string;
  after?: string;
  url: string;
}
export type BriefSyllabusSelection =
  | { courseId: number; kind: 'canvas'; fileId: number; title: string }
  | { courseId: number; kind: 'upload'; title: string; documentId: string; pages: string[]; selectedAt: string };
export interface BriefPlanProblem {
  courseId: number;
  itemId?: string;
  kind: 'scope' | 'date' | 'unpublished' | 'extraction' | 'information';
  message: string;
}
export interface BriefProcessingState {
  version: 1;
  readSourceIds: string[];
  analyzedSourceIds?: string[];
  omittedSourceIds?: string[];
  extraction: 'pending' | 'available' | 'failed';
  problems: BriefPlanProblem[];
  learningDated: number;
  learningUnresolved: number;
}
export interface BriefPlanExtraction {
  version: 1;
  sources: Array<{ id: string; text: string }>;
  generated: Record<string, unknown>;
}
export interface BriefSyllabusStatus {
  courseId: number;
  processing?: BriefProcessingState;
  status: 'not_found' | 'needs_selection' | 'read_failed' | 'read_partial' | 'read' | 'schedule_pending' | 'schedule_failed' | 'schedule_partial' | 'ready';
  title?: string;
  fileId?: number;
  pageCount?: number;
  detail: string;
  sourceIds: string[];
  candidates: Array<{ fileId: number; title: string; url: string }>;
  /** Course file metadata only, for manually identifying a syllabus with an opaque name. */
  availablePdfs?: Array<{ fileId: number; title: string; url: string }>;
}
export interface BriefSyllabusSchedule {
  extraction?: BriefPlanExtraction;
  processingVersion?: number;
  courseId: number;
  signature: string;
  sourceIds: string[];
  items: BriefItem[];
  issues: string[];
  complete: boolean;
  /** Completed pages and unfinished audits survive the next manual sync. */
  pages?: Array<{ sourceId: string; signature: string; result: BriefExtractionResult }>;
}
export interface CourseBriefReport {
  version: 1;
  /** Version of the source-selection policy, separate from persisted report shape. */
  scopeVersion?: 2 | 3 | 4;
  syllabi?: BriefSyllabusStatus[];
  /** All-term arrangements, independent of the selected report week. */
  syllabusSchedules?: BriefSyllabusSchedule[];
  digestVersion?: 1;
  organizingStatus?: 'complete' | 'partial';
  id: string;
  canvasOrigin: string;
  canvasUserId: number;
  ownerId: string;
  courses: CanvasCourse[];
  weekStart: string;
  timeZone: string;
  fetchedAt: string;
  generatedAt: string;
  sources: BriefSource[];
  items: BriefItem[];
  coverage: BriefCoverage[];
  changes: BriefChange[];
  analysisStatus: 'complete' | 'partial' | 'not_run';
  pipelineVersion?: 2;
  processingVersion?: number;
  run?: {
    requests: number; cacheHits: number; elapsedMs: number;
    inputTokens: number; outputTokens: number; unknownUsage: number;
    stoppedReason?: string;
    attempts?: Array<{ label: string; inputChars: number; elapsedMs: number; outputChars?: number;
      status: 'running' | 'completed' | 'timeout' | 'failed' | 'cancelled'; errorCode?: string; failureStage?: string }>;
  };
}
export interface BriefSyncOptions {
  connection: CanvasConnection;
  canvasUserId: number;
  ownerId: string;
  courses: CanvasCourse[];
  weekStart: string;
  timeZone: string;
  previous?: CourseBriefReport;
  forceSyllabusCourseId?: number;
  syllabusSelections?: BriefSyllabusSelection[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onCheckpoint?: (report: CourseBriefReport) => void;
}
export interface BriefExtractionResult {
  items: BriefItem[];
  issues: string[];
  retryable?: boolean;
  trace?: { extracted: number; grounded: number; verified: number; dated: number; detail: string };
  /** Internal draft only: never shown as confirmed facts before its audit passes. */
  checkpoint?: { draft: unknown; decisions: Record<string, unknown>[] };
}
