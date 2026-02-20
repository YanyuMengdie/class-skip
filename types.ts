
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
  customAvatarUrl?: string | null;
  personaSettings?: PersonaSettings; 
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
  
  customAvatarUrl?: string | null;
  customBackgroundUrl?: string | null;
  personaSettings?: PersonaSettings;
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

// --- DUNGEON STUDY GAME TYPES ---
export interface DungeonRoom {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  cleared: boolean;
  icon: string; // Material icon name
  color: string; // Tailwind color class
}

export interface DungeonItem {
  id: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: string;
  count?: number;
}

export interface DungeonStory {
  id: string;
  title: string;
  content: string;
  unlocked: boolean;
  chapter: number;
}

export interface DungeonEvent {
  id: string;
  type: 'combat' | 'puzzle' | 'treasure' | 'encounter';
  title: string;
  description: string;
  difficultyClass: number; // DC for D20 roll
  requiredStudyMinutes: number; // 需要学习多少分钟才能获得骰子
  rewards: {
    gold?: number;
    itemId?: string;
    storyId?: string;
    roomId?: string;
  };
}

export interface DungeonState {
  currentRoomId: string;
  rooms: DungeonRoom[];
  items: DungeonItem[];
  stories: DungeonStory[];
  gold: number;
  dicePool: number; // 可用 D20 数量
  level: number;
  xp: number;
  xpToNextLevel: number;
  lastEventTime: number | null; // 上次事件触发时间（用于 2-3 分钟倒计时）
  exploring: boolean; // 是否正在探索（等待事件）
  eventStartTime: number | null; // 开始探索的时间
  totalStudyMinutes: number; // 累计学习时间（分钟），用于计算骰子概率
}
