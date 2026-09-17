/** Evidence from a bounded study round. These records never represent a predicted exam score. */
export type RoundLanguage = 'zh' | 'en';
/** Historical model identity; new operations use Gemini 3.8 Flash without rewriting older records. */
export interface RoundModelInfo {
  provider: 'gemini' | 'astra';
  model: string;
  reasoning: 'low' | 'medium';
}
export interface RoundMaterialScope { materialId: string; title: string; pages: number[] }
/** A source-bound atom from the persistent KC map, rather than a freely generated round objective. */
export interface RoundKnowledgeTarget {
  id: string;
  kcId: string;
  atomId: string;
  kcLabel: string;
  label: string;
  description: string;
  materialId: string;
  pages: number[];
  /** Changes when the source binding or knowledge statement changes. */
  contentKey: string;
}
export interface RoundScope {
  id: string;
  title: string;
  materials: RoundMaterialScope[];
  objectiveHints: string[];
  /** Missing only in legacy, unbound rounds. An empty list is not permission for free-form objectives. */
  knowledgeTargets?: RoundKnowledgeTarget[];
  mode: 'practice' | 'recheck' | 'integrated';
}
export interface RoundSourcePage { materialId: string; materialTitle: string; page: number; text: string }
export interface RoundContext { scope: RoundScope; pages: RoundSourcePage[] }
export interface RoundCitation { materialId: string; page: number; quote: string }
export interface RoundObjective { id: string; label: string; sources: RoundCitation[]; knowledgeTarget?: RoundKnowledgeTarget }
export interface RoundCriterion {
  id: string;
  objectiveId: string;
  requirement: string;
  expected: string;
  sources: RoundCitation[];
}
export type RoundAnswerFormat = 'recall' | 'explain' | 'compare' | 'apply';
export type RoundTaskType = 'direct' | 'case' | 'compare' | 'predict' | 'data';
export interface RoundExerciseAudit {
  version: 1;
  taskType: RoundTaskType;
  /** Only objectives actually used to reason about the supplied case, not every objective in a composite question. */
  applicationObjectiveIds: string[];
  hypothetical: boolean;
}
export interface RoundQuestionAudit {
  version: 1;
  /** A separate model review, not a proof of psychometric validity. */
  status: 'checked';
  questionKey: string;
  cueLevel: 1 | 2 | 3 | 4;
  cognitiveDemand: RoundAnswerFormat;
  connection: 'single' | 'linked';
  exercise?: RoundExerciseAudit;
}
export interface RoundQuestion {
  id: string;
  objectiveIds: string[];
  prompt: string;
  responseRequirements: string[];
  criteria: RoundCriterion[];
  kind: 'initial' | 'diagnostic' | 'recheck' | 'transfer' | 'delayed' | 'integrated';
  cueLevel: 1 | 2 | 3 | 4;
  novelty: 'original' | 'rephrased' | 'new';
  /** v2 displays local format instructions, never model-authored scoring requirements. */
  presentationVersion?: 2;
  /** The visible neutral topic title included in the question review. */
  presentationScopeTitle?: string;
  answerFormat?: RoundAnswerFormat;
  audit?: RoundQuestionAudit;
  /** New questions must also pass the exercise review; older reviewed questions remain usable. */
  practiceVersion?: 1;
  /** The model that generated this question; absent on older stored questions. */
  model?: RoundModelInfo;
}
export interface RoundAnswerConditions {
  version: 1;
  presentation: 'reviewed' | 'legacy_unchecked';
  cueLevel: 1 | 2 | 3 | 4 | null;
  cognitiveDemand: RoundAnswerFormat | null;
  connection: 'single' | 'linked' | 'unknown';
  novelty: RoundQuestion['novelty'];
  support: 'none_recorded' | 'recorded';
  taskType?: RoundTaskType;
  applicationObjectiveIds?: string[];
}
export interface RoundBlueprint {
  id: string;
  /** Original plan-generation model, retained even when later operations use another model. */
  model?: RoundModelInfo;
  scope: RoundScope;
  objectives: RoundObjective[];
  questions: RoundQuestion[];
  maxAttempts: number;
  /** Optional soft answer-time condition; exceeding it never submits an answer or decides its quality. */
  answerTimeLimitSeconds?: number;
  createdAt: number;
  practiceDesign?: {
    version: 1;
    caseAvailability: 'included' | 'limited';
    /** Reviewed source limitation, shown only after answering to avoid revealing content. */
    limitation?: string;
    /** A valid applied round may retain necessary concept cues after one bounded improvement attempt. */
    preparationNote?: 'stronger_cues';
  };
}
export type RoundHelpKind = 'source' | 'hint' | 'explanation' | 'feedback';
export interface RoundHelpEvent {
  id: string;
  kind: RoundHelpKind;
  questionId: string;
  objectiveIds: string[];
  at: number;
}
export interface RoundCriterionResult {
  criterionId: string;
  status: 'met' | 'partial' | 'missing' | 'uncertain';
  answerQuote: string;
  feedback: string;
  /** Plain-language meaning already expressed, grounded in answerQuote. */
  covered?: string;
  /** The smallest required addition/correction; empty when this criterion is met. */
  needed?: string;
}
export interface RoundAnswerGuide {
  /** One coherent, concise answer to the fixed question; never a new grading rubric. */
  referenceAnswer: string;
  criterionIds: string[];
  sources: RoundCitation[];
  /** Source-backed enrichment kept outside the required answer and result. */
  optionalNotes: Array<{ text: string; sources: RoundCitation[] }>;
}
export interface RoundEvaluation {
  /** Actual model for this evaluation, independent of the original plan/question model. */
  model?: RoundModelInfo;
  questionValid: boolean;
  invalidReason?: string;
  items: RoundCriterionResult[];
  summary: string;
  nextAction: 'continue' | 'hint' | 'explain' | 'clarify' | 'recheck';
  followUpFocus?: string;
  /** Missing on earlier feedback; its original text remains readable. */
  feedbackVersion?: 1;
  answerGuide?: RoundAnswerGuide;
}
export interface RoundDispute { note: string; at: number; resolvedAt?: number }
export interface RoundAttempt {
  id: string;
  question: RoundQuestion;
  answer: string;
  submittedAt: number;
  /** Absent only in records created before answer timing existed. */
  elapsedMs?: number;
  timeLimitSeconds?: number;
  helpEvents: RoundHelpEvent[];
  independent: boolean;
  /** Actual help and the reviewed question conditions are distinct observations. */
  conditions?: RoundAnswerConditions;
  evaluation?: RoundEvaluation;
  evaluationError?: string;
  dispute?: RoundDispute;
}
export interface RoundSupport {
  model?: RoundModelInfo;
  questionId: string;
  kind: 'hint' | 'explanation';
  text: string;
  sources: RoundCitation[];
  at: number;
}
export interface RoundExposure {
  objectiveId: string;
  /** A stable source-based signature permits matching across newly generated blueprints. */
  targetKey: string;
  at: number;
  kind: RoundHelpKind;
}
export interface StudyRound {
  version: 1;
  id: string;
  blueprint: RoundBlueprint;
  questions: RoundQuestion[];
  currentQuestionId: string | null;
  phase: 'answering' | 'feedback' | 'paused' | 'ended';
  resumePhase?: 'answering' | 'feedback';
  draft: string;
  /** Active answer interval; removed when paused or submitted. */
  answerStartedAt?: number;
  /** Accumulated active time for the current question, excluding paused intervals. */
  answerElapsedMs?: number;
  currentHelp: RoundHelpEvent[];
  supports: RoundSupport[];
  attempts: RoundAttempt[];
  exposures: RoundExposure[];
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  endReason?: 'completed' | 'budget' | 'user';
}
export interface RoundRecordStore {
  version: 1;
  rounds: StudyRound[];
  /** Source/feedback exposure can occur before any round exists; keep it across block switches and reloads. */
  scopeExposures?: { materialId: string; pages: number[]; allPages?: true; kind: RoundHelpKind; at: number }[];
}
export interface RoundEvidenceRow {
  objective: RoundObjective;
  status: 'independent' | 'assisted' | 'needs_work' | 'unchecked' | 'uncertain';
  attempts: RoundAttempt[];
  latestAt?: number;
  delayedCheck: boolean;
}
export interface RoundReport {
  rows: RoundEvidenceRow[];
  independent: RoundEvidenceRow[];
  assisted: RoundEvidenceRow[];
  needsWork: RoundEvidenceRow[];
  unchecked: RoundEvidenceRow[];
  uncertain: RoundEvidenceRow[];
  nextStep: string;
}
export interface RoundHistorySummary {
  previousQuestions: string[];
  weakTargets: string[];
  /** Fixed objectives from the most recent round in this scope, for a genuine recheck. */
  previousObjectives?: RoundObjective[];
  knowledgePriorities?: Array<{ targetId: string; status: 'unchecked' | 'needs_work' | 'assisted' | 'recheck' | 'independent'; lastAt?: number }>;
  exposures: RoundExposure[];
}
export interface RoundAI {
  plan(context: RoundContext, options: { maxAttempts: number; history: RoundHistorySummary; language: RoundLanguage;
    onProgress?: (stage: 'generating' | 'reviewing' | 'repairing') => void }): Promise<RoundBlueprint>;
  evaluate(context: RoundContext, question: RoundQuestion, answer: string, options: { language: RoundLanguage; dispute?: string }): Promise<RoundEvaluation>;
  support(context: RoundContext, question: RoundQuestion, answer: string, kind: 'hint' | 'explanation', language: RoundLanguage): Promise<RoundSupport>;
  followUp(context: RoundContext, round: StudyRound, language: RoundLanguage, options?: { reduceCues?: boolean }): Promise<RoundQuestion | null>;
}
