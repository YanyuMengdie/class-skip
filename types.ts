
export interface Slide {
  id: string;
  imageUrl: string;
  pageNumber: number;
}

export interface ExplanationCache {
  [slideId: string]: string;
}

/** 1-3：该轮助手回复绑定的检索白名单，用于解析 †chunkId† 与持久化留痕后恢复链钮 */
export interface ExamChunkCitationSnapshot {
  chunks: Record<string, { materialLinkId: string; page: number }>;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp: number;
  isQuiz?: boolean; // Flag for Phase 2 intercepts
  /** 备考台：仅 model 消息；有快照时优先按 chunk 协议解析链钮 */
  examChunkCitationSnapshot?: ExamChunkCitationSnapshot;
}

export interface ChatCache {
  [slideId: string]: ChatMessage[];
}

export type DocType = 'STEM' | 'HUMANITIES';

export interface AppState {
  slides: Slide[];
  currentIndex: number;
  explanations: ExplanationCache;
  chats: ChatCache;
  isProcessing: boolean;
  fileName: string | null;
  docType: DocType;
}

export interface Note {
  id: string;
  text: string;
  createdAt: number;
  category?: 'deep' | 'skim'; // NEW: Categorize notes
}

export interface PageNotes {
  [pageNumber: number]: Note[];
}

export interface NotebookData {
  [fileName: string]: PageNotes;
}

export interface SlideAnnotation {
  id: string;
  text: string;
  x: number; // Percentage
  y: number; // Percentage
  width?: number;   // Pixels
  height?: number;  // Pixels
  fontSize?: number;// Pixels
  color?: string;   // Text color (hex)
  isBold?: boolean; // Is bold text
}

export interface AnnotationCache {
  [slideId: string]: SlideAnnotation[];
}

/** 幻灯片下方「本页注释」单条 */
export interface SlidePageComment {
  id: string;
  text: string;
  orderIndex: number;
  /** 文本框高度（px），可拖拽调节，默认 80 */
  height?: number;
}

/** 按 slideId 存储的本页注释列表 */
export interface PageCommentsCache {
  [slideId: string]: SlidePageComment[];
}

export interface Prerequisite {
  id: string;
  concept: string;
  mastered: boolean;
}

export interface StudyMap {
  topic: string;
  prerequisites: Prerequisite[];
  initialBriefing: string;
}

export interface QuizData {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** 一轮测验（多题），用于「复习」里的 Quiz */
export interface QuizRound {
  id: string;
  items: QuizData[];
  createdAt: number;
}

/** 单张闪卡 */
export interface FlashCard {
  id: string;
  front: string;
  back: string;
  sourcePage?: number;
  createdAt: number;
}

/** 陷阱清单条目（错题/易错点） */
export interface TrapItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  userSelectedIndex: number;
  explanation: string;
  source?: string;
  createdAt: number;
}

// --- MIND MAP TYPES ---
/** 思维导图树节点 */
export interface MindMapNode {
  id: string;
  /** 主标签，中文或英文均可 */
  label: string;
  /** 中英对照：另一语种标签，如 label 为中文则填英文，反之亦然 */
  labelEn?: string;
  children?: MindMapNode[];
}

/** 多文档思维导图：每文档一棵树 + 文档间关联 */
export interface MindMapMultiResult {
  perDoc: Array<{ fileName: string; tree: MindMapNode }>;
  crossDoc: Array<{ docA: string; docB: string; similarities: string[] }>;
}

/** 自建导图：AI 评判与补充的返回 */
export interface MindMapEvaluateResult {
  feedback: string;
  suggestedNodes: Array<{ parentId: string; node: MindMapNode }>;
}

// --- L-SAP 考前预测 ---
/** 隶属于某一 KC 的最小逻辑单元（用于「命题密度」与覆盖统计） */
export interface LogicAtom {
  id: string;
  kcId: string;
  label: string;
  /** 一句说明，便于 UI 与后续对齐讲义 */
  description: string;
}

/** 每个 KC 下原子覆盖：atomId -> 是否已在教学对话中被判定覆盖（M2 可全 false） */
export type AtomCoverageByKc = Record<string, Record<string, boolean>>;

/** 知识组件（考点） */
export interface LSAPKnowledgeComponent {
  id: string;
  concept: string;
  definition: string;
  sourcePages: number[];
  sourceExcerpt?: string;
  /** 复习重点（一句话，用于复习模式清单展示） */
  reviewFocus?: string;
  examWeight: number;
  bloomTargetLevel: number;
  /** 备考工作台：该考点下的逻辑原子（与 bundle 一并持久化） */
  atoms?: LogicAtom[];
  /** P1：多份材料合并图谱时，标记来源考试材料 link（旧 bundle 无此字段） */
  sourceLinkId?: string;
  /** P1：来源文件名（展示/分组） */
  sourceFileName?: string;
}

/** 某 KC 下、对话中自动收录的术语卡片（即时术语侧栏） */
export interface KcGlossaryEntry {
  id: string;
  kcId: string;
  /** 术语展示名（与粗体一致或规范化后） */
  term: string;
  /** 基于本场讲义与 KC 的短释义（1～3 句，中文） */
  definition: string;
  /** 可选：首次出现的对话时间戳 */
  firstSeenAt?: number;
}

/** 考点图谱 */
export interface LSAPContentMap {
  id: string;
  sourceKey: string;
  kcs: LSAPKnowledgeComponent[];
  createdAt: number;
}

/** 单轮探测记录（证据链） */
export interface ProbeRecord {
  kcId: string;
  bloomLevel: number;
  question: string;
  userAnswer: string;
  correct: boolean | 'partial';
  evidence?: string;
  sourcePage?: number;
  timestamp: number;
}

/** BKT 掌握概率：kcId -> pMastery (0-1) */
export type LSAPBKTState = Record<string, number>;

/** 考前预测状态 */
export interface LSAPState {
  contentMapId: string;
  bktState: LSAPBKTState;
  probeHistory: ProbeRecord[];
  lastPredictedScore: number;
  lastUpdated: number;
  /** 上次使用的面板模式，恢复时默认进入该模式 */
  lastPanelMode?: 'probe' | 'review';
}

// --- STUDIO / SAVED ARTIFACTS (NotebookLM-style) ---
/** 术语项（与 geminiService.TerminologyItem 一致，用于 artifact 存储） */
export interface TerminologyItemForArtifact {
  term: string;
  definition: string;
  keyWords?: string[];
}

export type SavedArtifactType =
  | 'studyGuide'
  | 'examSummary'
  | 'examTraps'
  | 'feynman'
  | 'trickyProfessor'
  | 'terminology'
  | 'mindMap'
  | 'quiz'
  | 'flashcard'
  | 'trapList';

export interface SavedArtifactBase {
  id: string;
  type: SavedArtifactType;
  title: string;
  createdAt: number;
  sourceLabel?: string;
}

export type SavedArtifact =
  | (SavedArtifactBase & { type: 'studyGuide'; payload: StudyGuide })
  | (SavedArtifactBase & { type: 'examSummary'; payload: { markdown: string } })
  | (SavedArtifactBase & { type: 'examTraps'; payload: { markdown: string } })
  | (SavedArtifactBase & { type: 'feynman'; payload: { markdown: string } })
  | (SavedArtifactBase & { type: 'trickyProfessor'; payload: { markdown: string } })
  | (SavedArtifactBase & { type: 'terminology'; payload: { terms: TerminologyItemForArtifact[] } })
  | (SavedArtifactBase & { type: 'mindMap'; payload: { tree: MindMapNode } | { multiResult: MindMapMultiResult } })
  | (SavedArtifactBase & { type: 'quiz'; payload: { roundIndex: number; questionCount?: number } })
  | (SavedArtifactBase & { type: 'flashcard'; payload: { count: number } })
  | (SavedArtifactBase & { type: 'trapList'; payload: { itemIds: string[] } });

export type ViewMode = 'deep' | 'skim' | 'layered';
export type SkimStage = 'diagnosis' | 'tutoring' | 'quiz' | 'reading';

// --- 递进阅读模式（layered reading）---
// 数据完全独立于 studyMap，详见 docs/inquiries/LAYERED_READING_INQUIRY.md §8.G
export interface LayeredReadingModule {
  id: string;
  index: number;
  storyTitle: string;
  pageRange?: string;
  /** Round 1 内容（大白话故事）；按需填充，未生成时为 null */
  round1Content?: string | null;
  /** Round 2 子枝干列表；按需填充 */
  round2Branches?: LayeredReadingRound2Branch[];
  /** 各 Round 完成状态 */
  round1Done?: boolean;
  round2Done?: boolean;
  round3Done?: boolean;
}

export interface LayeredReadingRound2Branch {
  id: string;
  index: number;
  title: string;
  content?: string | null;
  /** Round 3 细节挂载 */
  round3Details?: LayeredReadingRound3Detail[];
}

export interface LayeredReadingRound3Detail {
  id: string;
  /** "term" | "experiment" | "figure" | "evidence" | "comparison" 等自由文本类型 */
  kind: string;
  label: string;
  description: string;
}

export interface LayeredReadingQuestion {
  id: string;
  /** 题目所属轮次：1/2/3，对应故事题/结构题/细节题 */
  roundLevel: 1 | 2 | 3;
  /** 题目挂在哪个节点下 */
  attachedTo: { moduleId: string; branchId?: string; detailId?: string };
  question: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  /** 用户作答记录 */
  userAnswerIndex?: number;
  answeredAt?: number;
}

export interface LayeredReadingState {
  /** 本模式独立 module 列表，与 studyMap 无关 */
  modules: LayeredReadingModule[];
  /** 用户上次浏览到的位置（学习状态记忆） */
  lastVisited?: { moduleId: string; round: 1 | 2 | 3; branchId?: string };
  /** 题目作答记录 */
  questions: LayeredReadingQuestion[];
  /** 进度统计快照 */
  progressSnapshot?: {
    round1: { done: number; total: number };
    round2: { done: number; total: number };
    round3: { done: number; total: number };
  };
  /** 创建时间 */
  createdAt: number;
}

// --- PAGE MARK TYPES ---
export type MarkType = 'core' | 'formula' | 'example' | 'trap' | 'exam' | 'difficult' | 'summary' | 'custom';
export type MarkPriority = 'high' | 'medium' | 'low';

export interface PageMark {
  id: string;
  pageNumber: number;
  types: MarkType[];  // 可多个类型
  priority: MarkPriority;
  customTypeName?: string;  // 自定义类型名称（当 types 包含 'custom' 时）
  note?: string;     // 备注
  createdAt: number;
}

/** 按文件名存储的页面标记 */
export interface PageMarks {
  [fileName: string]: {
    [pageNumber: number]: PageMark[];
  };
}

// --- STUDY GUIDE TYPES ---
export type StudyGuideFormat = 'outline' | 'detailed';

export interface StudyGuideContent {
  // 章节大纲
  chapters: Array<{
    title: string;
    pageRange?: string; // "1-5"
    subsections?: string[];
  }>;
  
  // 核心概念
  coreConcepts: Array<{
    term: string;
    definition: string;
    importance: 'high' | 'medium' | 'low';
  }>;
  
  // 学习路径
  learningPath: Array<{
    step: number;
    title: string;
    description: string;
    suggestedPages?: number[];
  }>;
  
  // 知识点树（层级结构）
  knowledgeTree: {
    root: string; // 主题
    branches: Array<{
      concept: string;
      children?: Array<{
        concept: string;
        details?: string[];
      }>;
    }>;
  };
  
  // 复习建议
  reviewSuggestions: {
    keyPoints: string[];
    practiceTips: string[];
    commonMistakes?: string[];
  };
  
  // Markdown 格式的完整内容（用于渲染）
  markdownContent: string;
}

export interface StudyGuide {
  id: string;
  fileName: string;
  format: StudyGuideFormat;
  content: StudyGuideContent;
  createdAt: number;
}

// --- PERSONA TYPES ---
export interface PersonaSettings {
  charName: string;
  userNickname: string;
  relationship: string;
  personality: string;
}

// --- 上课模式（路径 A：录音 + 转写 + 课后整理）---
export interface LectureRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** 转写段落（带时间戳），或前端拼接为全文 */
  transcript: { text: string; timestamp: number }[];
  /** AI 整理结果（讲课逻辑、重点、风格），可选持久化 */
  organizedSummary?: string;
  /** 自定义名称（可选，默认使用时间） */
  name?: string;
}

// --- PERSISTENCE TYPES ---
export interface FilePersistedState {
  explanations: ExplanationCache;
  chatCache: ChatCache;
  skimMessages: ChatMessage[];
  annotations: AnnotationCache;
  notebookData: NotebookData; 
  currentIndex: number;
  viewMode: ViewMode;
  skimTopHeight: number;
  studyMap: StudyMap | null;
  /** 递进阅读模式独立 state；与 studyMap 完全独立（铁律 2） */
  layeredReadingState?: LayeredReadingState | null;
  skimStage?: SkimStage;
  quizData?: QuizData | null;
  docType?: DocType;
  galgameBackgroundUrl?: string | null;
  /** 复习：多轮测验（继续出题不重复） */
  reviewQuizRounds?: QuizRound[];
  /** 复习：当前文件的闪卡牌组 */
  reviewFlashCards?: FlashCard[];
  /** 闪卡预估数量（根据 PDF 估算） */
  flashCardEstimate?: number;
  /** 页面标记（重点标记） */
  pageMarks?: PageMarks;
  /** Study Guide/Outline */
  studyGuide?: StudyGuide;
  /** Studio 已生成条目（学习指南、考前速览、考点与陷阱等） */
  savedArtifacts?: SavedArtifact[];
  customAvatarUrl?: string | null;
  personaSettings?: PersonaSettings;
  /** 幻灯片下方本页注释 */
  pageComments?: PageCommentsCache;
  /** L-SAP 考前预测：考点图谱 */
  lsapContentMap?: LSAPContentMap;
  /** L-SAP 考前预测：BKT 与探测历史 */
  lsapState?: LSAPState;
}

export interface FileHistoryItem {
  hash: string;
  name: string;
  lastOpened: number;
  state: FilePersistedState;
}

// --- CLOUD SESSION TYPES ---
export interface CloudSession {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string; // Empty string if type is 'folder'
  createdAt: any; 
  
  // Folder System
  type: 'file' | 'folder';
  parentId: string | null; // null means root
  children?: CloudSession[]; // For UI tree rendering only (not in DB)

  customTitle?: string; 
  sortIndex?: number;   

  // Full State Fields (For files)
  chatCache?: ChatCache; 
  explanations?: ExplanationCache;
  annotations?: AnnotationCache;
  notebookData?: NotebookData; 
  skimMessages?: ChatMessage[];
  viewMode?: ViewMode;
  studyMap?: StudyMap | null;
  /** 递进阅读模式独立 state（铁律 2） */
  layeredReadingState?: LayeredReadingState | null;
  skimStage?: SkimStage;
  quizData?: QuizData | null;
  docType?: DocType;
  skimTopHeight?: number;
  currentIndex?: number;
  reviewQuizRounds?: QuizRound[];
  reviewFlashCards?: FlashCard[];
  flashCardEstimate?: number;
  pageMarks?: PageMarks;
  studyGuide?: StudyGuide;
  savedArtifacts?: SavedArtifact[];
  customAvatarUrl?: string | null;
  customBackgroundUrl?: string | null;
  personaSettings?: PersonaSettings;
  pageComments?: PageCommentsCache;
  lsapContentMap?: LSAPContentMap;
  lsapState?: LSAPState;
}

// --- NEW: CALENDAR & MEMO TYPES ---
export interface CalendarEvent {
    id: string;
    userId: string;
    title: string;
    startTime: string; // "10:00"
    endTime: string;   // "11:30"
    type: 'study' | 'exam' | 'break';
    dateStr: string;   // "2023-10-27"
    /** 可选：关联的考试中心 Exam id（Firestore）*/
    linkedExamId?: string;
}

/** P1：学科教学法分带（Firestore Exam.disciplineBand 可选） */
export type DisciplineBand =
  | 'humanities_social'
  | 'business_mgmt'
  | 'stem'
  | 'arts_creative'
  | 'unspecified';

/** P1：保温流学习者心态 */
export type LearnerMood = 'normal' | 'dont_want' | 'want_anxious';

/** P1：保温正反馈语气变体 */
export type MaintenanceFeedbackVariant = 'standard' | 'gentle' | 'celebrate_small';

/** P4：学生上一轮表述质量（启发式 / LLM 分类） */
export type LearnerTurnQuality = 'strong' | 'partial' | 'weak' | 'empty' | 'neutral';

/** P4：本轮希望模型采取的策略 */
export type ScaffoldingPhase =
  | 'socratic_probe'
  | 'light_hint'
  | 'sub_questions'
  | 'structured_explain';

/** P4：传入 chatWithAdaptiveTutor / chatWithSlide 的支架上下文（略读 chatWithSkimAdaptiveTutor 不使用） */
export interface TutorScaffoldingContext {
  quality: LearnerTurnQuality;
  phase: ScaffoldingPhase;
  consecutiveWeakStreak: number;
  totalUserTurns: number;
}

/** M3：在 KC 内的探测阶段 */
export type SocraticProbeMode = 'direct' | 'stress' | 'remediate';

/** M3：扩展 P4 支架上下文，供 chatWithAdaptiveTutor 在备考台「锚定 KC」时使用（略读不用） */
export interface KCScopedTutorContext extends TutorScaffoldingContext {
  kcId: string;
  kcConcept: string;
  kcDefinition: string;
  /** 当前 KC 下的原子；可为空数组 */
  atoms: LogicAtom[];
  probeMode: SocraticProbeMode;
  /** 当前追问目标布鲁姆层级（简化 1～3） */
  bloomTarget: 1 | 2 | 3;
  /** 可选：模型上一步推断的缺失原子 id */
  gapAtomIds?: string[];
}

/**
 * 阶段 3：备考台「多选 KC（>=2）锚定」时使用的上下文。
 * 与 KCScopedTutorContext 平级且互斥：单选走 KCScopedTutorContext，
 * 多选走 MultiKCScopedTutorContext。chatWithAdaptiveTutor 内部按 type guard
 * 决定追加哪一种 prompt appendix。
 *
 * 多选模式简化策略：不携带 probeMode / bloomTarget（这些是单 KC 内部探测节奏的
 * 概念，多 KC 横跨不适用）；可选 gapAtomIdsByKcId 记录上一轮各 KC 的 gap。
 */
export interface MultiKCScopedTutorContext extends TutorScaffoldingContext {
  /** 选中的 KC 列表（≥2 项） */
  kcs: LSAPKnowledgeComponent[];
  /** 可选：上一轮模型推断的各 KC 缺失原子 id（按 kcId 分组） */
  gapAtomIdsByKcId?: Record<string, string[]>;
}

// --- 考试中心（Exam Hub）---
export interface Exam {
  id: string;
  userId: string;
  title: string;
  /** 考试日期（当日 0 点的 UTC 时间戳或本地日期毫秒，按保存约定）；null 表示日期待定 */
  examAt: number | null;
  color?: string;
  notes?: string;
  /** P1：显式学科带；未设置时保温流可回退 unspecified */
  disciplineBand?: DisciplineBand;
  createdAt: number;
  updatedAt: number;
}

export type ExamMaterialSourceType = 'fileHash' | 'sessionId';

/** 考试与材料的关联（Firestore `examMaterials`）*/
export interface ExamMaterialLink {
  id: string;
  userId: string;
  examId: string;
  sourceType: ExamMaterialSourceType;
  fileHash?: string;
  cloudSessionId?: string;
  fileName: string;
  sortIndex?: number;
  addedAt: number;
}

/**
 * 备考引用管线 1-1：单份 PDF 按页文本切块后的持久化单元（chunkId 稳定可复现）。
 * chunkIndex：该页内从 0 递增；page：1-based，与 extractPdfText 数组下标满足 page === index + 1。
 * **多材料（1-4）**：`materialLinkId` 编入 `chunkId`，故不同 PDF 的块互不冲突；检索与链钮均依赖该字段区分文件。
 */
export interface ExamMaterialTextChunk {
  /** 稳定主键：`${materialLinkId}__p${page}__c${chunkIndex}`（多材料下由 materialLinkId 区分 PDF） */
  chunkId: string;
  materialLinkId: string;
  examId: string;
  page: number;
  /** 该页内第几块，0-based */
  chunkIndex: number;
  /** 块内纯文本；生成时对 slice 做 trim，块与块之间可有重叠区字符重复 */
  text: string;
  createdAt?: number;
}

/** 备考引用 1-2：BM25 检索得到的候选块（score 越大越相关，见 utils/examChunkRetrieval 注释） */
export interface RetrievedChunk {
  chunk: ExamMaterialTextChunk;
  /**
   * Okapi BM25 原始分数（未做 0～1 归一化），仅保证同次检索内可排序比较、越大越相关。
   */
  score: number;
}

// --- 今日学习分段 ---
export type DailySegmentKind =
  | 'slide_review'
  | 'lsap_probe'
  | 'flashcard_batch'
  | 'trap_review'
  | 'feynman_chunk'
  | 'study_guide_section'
  | 'generic';

export interface DailySegment {
  id: string;
  examId: string;
  examTitle: string;
  fileHash?: string;
  cloudSessionId?: string;
  fileName: string;
  kind: DailySegmentKind;
  title: string;
  description?: string;
  estimatedMinutes: number;
  kcId?: string;
  pageFrom?: number;
  pageTo?: number;
  payload?: Record<string, unknown>;
  /** P1：可选关联情境流程 */
  flowTemplateId?: string;
  flowStepIndex?: number;
}

export interface DailyPlanCacheDoc {
  userId: string;
  date: string;
  selectedExamIds: string[];
  segments: DailySegment[];
  generatedAt: number;
  budgetMinutes: number;
  version: number;
  maintenance?: CachedMaintenanceBundle;
}

export interface MaintenanceFlashCard {
  front: string;
  back: string;
}

export interface CachedMaintenanceBundle {
  cacheKey: string;
  examIds: string[];
  examTitles: string[];
  materialKeys: string[];
  flashCount: number;
  cards: MaintenanceFlashCard[];
  mergedContent: string;
  generatedAt: number;
  /** P1：参与 cacheKey 的维度（旧缓存无此字段则视为不匹配） */
  disciplineBand?: DisciplineBand;
  mood?: LearnerMood;
  urgency?: UrgencyBand;
}

export interface MaintenanceSessionState {
  phase:
    | 'idle'
    | 'blocked_sprint'
    | 'loading_cards'
    | 'cards'
    | 'continue_menu'
    | 'quiz_setup'
    | 'quiz_doing'
    | 'feedback_exit'
    | 'feedback_strong';
  selectedExamIds: string[];
  flashTargetCount: number;
  cards: MaintenanceFlashCard[];
  cardIndex: number;
  cardFlipped: boolean;
  mergedContent: string;
  quizCount: number;
  quizItems: QuizData[];
  quizIndex: number;
  quizAnswers: Array<number | null>;
  quizSubmitted: boolean[];
}

// --- 情境化复习编排（Study Flow）---
export type MaterialFamiliarity = 'never_seen' | 'learned_once' | 'reviewed_before';
export type UrgencyBand = 'd1_2' | 'd3_7' | 'd8_plus' | 'no_exam';
export type AffectState = 'good' | 'tired' | 'anxious';

export type StudyFlowPanelTarget =
  | 'studyGuide'
  | 'examSummary'
  | 'feynman'
  | 'terminology'
  | 'trapList'
  | 'flashcard'
  | 'mindMap'
  | 'fiveMin'
  | 'break'
  | 'skim'
  | 'deep'
  | 'examPrediction'
  | 'trickyProfessor'
  | 'quiz';

export type StudyFlowStepAction = 'open_panel' | 'lsap_session' | 'slide_skim' | 'rest';

export interface StudyFlowStep {
  id: string;
  order: number;
  label: string;
  description: string;
  action: StudyFlowStepAction;
  target?: StudyFlowPanelTarget | string;
  estimatedMinutes: number;
  skippable: boolean;
  reasonForUser: string;
}

export interface StudyFlowTemplate {
  scenarioKey: string;
  title: string;
  steps: StudyFlowStep[];
}

export interface Memo {
    id: string;
    userId: string;
    content: string;
    createdAt: number;
}

// --- NEW: SIDE QUEST TYPES ---
export interface SideQuestState {
  isActive: boolean;
  anchorText: string;
  messages: ChatMessage[];
  isLoading: boolean;
}

// --- 海龟汤 ---
export interface TurtleSoupPuzzle {
  situation: string;
  hiddenStory: string;
}

export interface TurtleSoupState {
  situation: string;
  hiddenStory: string;
  hints: string[];
  questionsLeft: number;
  solved: boolean;
  questionHistory?: { q: string; a: string }[];
}

