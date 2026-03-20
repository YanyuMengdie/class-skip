
export interface Slide {
  id: string;
  imageUrl: string;
  pageNumber: number;
}

export interface ExplanationCache {
  [slideId: string]: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string;
  timestamp: number;
  isQuiz?: boolean; // Flag for Phase 2 intercepts
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

export type ViewMode = 'deep' | 'skim';
export type SkimStage = 'diagnosis' | 'tutoring' | 'quiz' | 'reading';

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

// --- 考试中心（Exam Hub）---
export interface Exam {
  id: string;
  userId: string;
  title: string;
  /** 考试日期（当日 0 点的 UTC 时间戳或本地日期毫秒，按保存约定）；null 表示日期待定 */
  examAt: number | null;
  color?: string;
  notes?: string;
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

