
/** 全局应用语言。只控制固定界面与未来生成内容，不改写任何既有学习数据。 */
export type AppLanguage = 'zh-CN' | 'en';

export interface AppPreferences {
  version: 1;
  language: AppLanguage;
  updatedAt: number;
}

export interface GenerationLocaleContext {
  outputLanguage: AppLanguage;
}

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

export type SkimReadingAnchorKind =
  | 'module'
  | 'part'
  | 'section'
  | 'stage'
  | 'naturalPart'
  | 'paragraphGroup';

/**
 * 领读目录锚点只绑定“正式推进”产生的助手消息。
 * 路线负责规划下一步，锚点负责把用户带回已经读过的那条消息。
 */
export interface SkimReadingMessageAnchor {
  id: string;
  kind: SkimReadingAnchorKind;
  index: number;
  parentIndex?: number;
  title: string;
  pageLabel?: string;
  routeNodeId?: string;
}

/** 普通 Lecture 整段式/分段唱片式领读的讲解深度；旧会话缺省为 normal。 */
export type SkimExplanationDepth = 'simple' | 'normal';
export type SkimExplanationStyle = 'standard' | 'interesting';
export type SkimExplanationVariantKey =
  | 'simple-standard'
  | 'simple-interesting'
  | 'normal-standard'
  | 'normal-interesting';
export type SkimExplanationSpineKind = 'concept' | 'relationship' | 'mechanism' | 'evidence' | 'boundary' | 'example';

/** 一条讲解所有版本共用、不可随表达方式变化的内容骨架。 */
export interface SkimExplanationSpineItem {
  id: string;
  titleZh: string;
  titleEn?: string;
  kind: SkimExplanationSpineKind;
  summary: string;
  pageRefs: number[];
}

export interface SkimExplanationVariant {
  key: SkimExplanationVariantKey;
  depth: SkimExplanationDepth;
  style: SkimExplanationStyle;
  messageMarkdown: string;
  coveredSpineItemIds: string[];
  deferredSpineItemIds: string[];
  pageRefs: number[];
  createdAt: number;
}

/** 仅挂在适用的 model 消息上；其他消息没有此字段，保持原行为。 */
export interface SkimExplanationState {
  version: 1;
  activeVariantKey: SkimExplanationVariantKey;
  spineItems: SkimExplanationSpineItem[];
  variants: Partial<Record<SkimExplanationVariantKey, SkimExplanationVariant>>;
  sourcePageRefs: number[];
}

export type SkimModuleTakeawayStatus = 'explained' | 'deferred';

/** “看要点”临时生成的展示项；不参与掌握、证据或进度计算。 */
export interface SkimModuleTakeaway {
  id: string;
  titleZh: string;
  titleEn?: string;
  plainLanguage: string;
  connection: string;
  pageRefs: number[];
  status: SkimModuleTakeawayStatus;
  /** 对应连接式讲解骨架，或唱片式当前消息级来源；旧整段式消息可能为空。 */
  sourceIds: string[];
}

export interface ChatMessage {
  /** 新消息使用稳定 id；旧持久化消息缺省时由界面用 timestamp/index 兼容。 */
  id?: string;
  role: 'user' | 'model';
  text: string;
  /** @deprecated 用 images 数组,本字段仅为历史数据兼容保留;读取请走 getMessageImages() */
  image?: string;
  /** 新写入路径只填这个字段;读取请走 getMessageImages() 兼容旧 image */
  images?: string[];
  timestamp: number;
  /** 仅记录生成当时的语言；旧消息缺省时原样显示。 */
  generatedLanguage?: AppLanguage;
  isQuiz?: boolean; // Flag for Phase 2 intercepts
  /** 领读：标记该助手回复由正式开始/继续产生，即使它没有输出可解析的标题。 */
  skimReadingFormal?: boolean;
  /** 领读：本条正式讲解在“领读目录”中的一个或多个可跳转位置。 */
  skimReadingAnchors?: SkimReadingMessageAnchor[];
  /** 备考台：仅 model 消息；有快照时优先按 chunk 协议解析链钮 */
  examChunkCitationSnapshot?: ExamChunkCitationSnapshot;
  /** 案件式领读：本条回复关联的应用内页码，可点击跳回原页。 */
  casePageRefs?: number[];
  /** 普通 Lecture 整段式/分段唱片式领读：同一卡片内的连接式讲解版本。 */
  skimExplanation?: SkimExplanationState;
  /** 普通领读“看要点”触发的一次性提取题；仅用于避免把题面再次当成学习内容。 */
  skimKnowledgeExtraction?: boolean;
  /** 用户回答临时提取题后的即时核对；不应被再次整理成学习要点。 */
  skimKnowledgeExtractionFeedback?: boolean;
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
  /** 课程材料中的原始术语/命题标题，通常保留英文 */
  label: string;
  /** 一句说明，便于 UI 与后续对齐讲义 */
  description: string;
  /** 面向学习者的中文标题；旧 bundle 可能没有 */
  labelZh?: string;
  /** 面向学习者的中文解释；旧 bundle 可能没有 */
  descriptionZh?: string;
  /** 直接支持该原子的原 PDF 页码；旧 bundle 回退到 KC 页码 */
  sourcePages?: number[];
}

/** 每个 KC 下原子覆盖：atomId -> 是否已在教学对话中被判定覆盖（M2 可全 false） */
export type AtomCoverageByKc = Record<string, Record<string, boolean>>;

/** 知识组件（考点） */
export interface LSAPKnowledgeComponent {
  id: string;
  concept: string;
  definition: string;
  /** 中文概念名与解释；旧 bundle 可能没有 */
  conceptZh?: string;
  definitionZh?: string;
  sourcePages: number[];
  /** 该 KC 最核心的证据页；比 sourcePages 更适合用来核查页码 */
  anchorPages?: number[];
  /** 只作背景/承接的关联页，不应被当成主证据页 */
  relatedPages?: number[];
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

/** 备考工作台当前复习块边界：给模型看的“主回答范围”。 */
export interface ExamReviewScope {
  title: string;
  materialLinkId: string | null;
  materialTitle: string;
  pageRange: { start: number; end: number } | null;
  /** 由 KC 证据页聚合出的检索窗口；不连续页码不会被揉成一个大范围 */
  pageWindows?: Array<{ start: number; end: number }>;
  pageLabel?: string | null;
  sourceKcs: LSAPKnowledgeComponent[];
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
  /** 新生成内容的语言；旧数据缺省时按原文展示，不触发迁移。 */
  generatedLanguage?: AppLanguage;
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

export type ViewMode = 'deep' | 'skim' | 'layered' | 'tutor';
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
  /** 阶段 3 新增：溯源页码（铁律 6）。子枝干可能跨页，故为可选；若 AI 生成时给出则按"最关键页"填。 */
  sourcePage?: number;
  /** 阶段 3 新增：位置描述（铁律 6）。 */
  sourceLocation?: string;
  /** Round 3 细节挂载 */
  round3Details?: LayeredReadingRound3Detail[];
  /** Round 3 新数据:结构化 7 块学习单元(阶段 5 新增,优先级高于 round3Details) */
  round3Unit?: LayeredReadingRound3Unit;
}

export interface LayeredReadingRound3Detail {
  id: string;
  /** "term" | "experiment" | "figure" | "evidence" | "comparison" 等自由文本类型 */
  kind: string;
  label: string;
  description: string;
  /** 阶段 3 新增：溯源页码（铁律 6，必填——细节就是钉到具体一页一处） */
  sourcePage: number;
  /** 阶段 3 新增：位置描述（铁律 6，必填） */
  sourceLocation: string;
}

/**
 * 阶段 5 新增:Round 3 结构化学习单元(7 块固定结构)。
 *
 * 与旧 LayeredReadingRound3Detail[] 共存:
 * - 旧数据(round3Details)保留显示,不强制迁移
 * - 新生成的 branch 走 round3Unit
 * - 渲染层根据 branch 上哪个字段有值决定走哪条路径(round3Unit 优先)
 *
 * 7 块顺序固定不可重排,与 buildLayeredRound3UnitPrompt 输出顺序一致。
 * 第 4 块(figureGuide)按需省略——讲义无图时 AI 不输出该字段。
 *
 * 第 7 块 miniQuestion 是纯展示文本,不进 LayeredReadingState.questions[]。
 * 阶段 4 的 application 题独立保留,与本 unit 无任何耦合。
 */
export interface LayeredReadingRound3Unit {
  /** 块 1:这一小节在回答什么问题(一句话,问句形式) */
  coreQuestion: string;
  /** 块 2:机制 / 逻辑链条(step-by-step,markdown 编号列表) */
  mechanismChain: string;
  /** 块 3:关键术语挂载(每条说明在机制中的角色,markdown 列表) */
  keyTerms: string;
  /** 块 4:图 / 表 / 实验怎么读(可选——讲义无图时省略) */
  figureGuide?: string;
  /** 块 5:考试最低答案骨架(中英对照) */
  answerSkeleton: string;
  /** 块 6:易混点("不要把 A 理解成 B" 格式) */
  confusionPoints: string;
  /** 块 7:小题(题面 + 参考答案,纯展示文本) */
  miniQuestion: string;
  /** 阶段 3 溯源延续:整块 unit 的主要溯源页码(>= 1) */
  sourcePage: number;
  /** 阶段 3 溯源延续:位置描述(如"第 12 页中部图示") */
  sourceLocation: string;
  /** 生成时间(Unix ms) */
  generatedAt: number;
}

/**
 * 阶段 3 新增：递进阅读模式独立的对话消息类型（铁律 7：视觉独立、数据全局）。
 *
 * - 视觉过滤：每 module chat 框只渲染 askedInModuleId === currentModuleId 的消息
 * - 数据全局：调用 chatWithLayeredReadingTutor 时传完整 globalChatHistory(不过滤)
 *   所有消息标记 askedInModuleId 让 AI 看到跨 module 的对话脉络
 */
export interface LayeredReadingChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  /** 用户提问时所在的 module id；视觉过滤的关键字段 */
  askedInModuleId: string;
  timestamp: number;
}

/**
 * 阶段 4：递进阅读题目类型(铁律 8/9)。
 *
 * 题型对应:
 * - story:每 module Round 1 末出 1 道(attachedTo = moduleId)
 * - structure:每 branch Round 2 末出 1 道(attachedTo = branchId)
 * - application:每 branch Round 3 末出 1 道(attachedTo = branchId,不是每 detail 一道)
 *
 * 检索方式:复合 `(attachedTo, questionType)` 唯一定位;
 *           id 命名约定 `${attachedTo}-${questionType}`(如 module-1-story / module-1.2-structure)。
 *
 * 软门槛(铁律 8):
 * - 答 / 跳过 / 不答都不阻塞外层"展开到 Round X →"按钮
 * - 跳过后能回头答(status: 'skipped' → 'answered')
 * - 答完后能重答(✏️ 重新答题 → 清空 userAnswer + aiGrade,回到 'unanswered')
 *
 * 题目数据完全独立于 globalChatHistory(铁律 8:不混淆)——题目代码 0 处读 globalChatHistory。
 */
export type LayeredReadingQuestionType = 'story' | 'structure' | 'application';
export type LayeredReadingQuestionStatus = 'unanswered' | 'answered' | 'skipped';

/**
 * 阶段 4:批改维度(铁律 9 按题型分组)。
 * - story: 故事感 + 主旨准确
 * - structure: 步骤完整 + 步骤顺序
 * - application: 推理逻辑 + 细节抓取
 */
export interface LayeredReadingQuestionDimension {
  /** 维度名称(中文,与 prompt 输出对齐) */
  label: string;
  /** ★1-5 评分 */
  stars: 1 | 2 | 3 | 4 | 5;
  /** 一句话说明,必须指出具体好/差在哪(prompt 强约束) */
  comment: string;
}

export interface LayeredReadingQuestionGrade {
  /** 2 个维度,顺序与题型对应表一致 */
  dimensions: LayeredReadingQuestionDimension[];
  /** 批改完成时间 */
  gradedAt: number;
}

export interface LayeredReadingQuestion {
  /** 主键;命名约定 `${attachedTo}-${questionType}` 保证唯一 */
  id: string;
  /** 题型决定批改维度(铁律 9) */
  questionType: LayeredReadingQuestionType;
  /** 挂载点:story → moduleId;structure / application → branchId */
  attachedTo: string;
  /** AI 出的题(开放题) */
  questionText: string;
  /** 参考答案(150-300 字大白话) */
  referenceAnswer: string;
  /** 用户答案;null 时表示未答或跳过 */
  userAnswer?: string | null;
  /** 答题状态(软门槛三态,铁律 8) */
  status: LayeredReadingQuestionStatus;
  /** AI 批改结果(仅 status === 'answered' 时有) */
  aiGrade?: LayeredReadingQuestionGrade | null;
  /** 题目生成时间 */
  generatedAt: number;
  /** 最后一次答题/跳过时间 */
  answeredAt?: number;
}

/**
 * 阶段 4:学习状态记忆(铁律 8 / 用户拍板交互维度 g)。
 *
 * 触发:用户每次切换/展开树节点 / 答题完成时更新。
 * 显示:进入 panel 时(距上次时间 > 1 小时)弹 banner;本次会话只显示一次。
 */
export interface LayeredReadingLastVisited {
  moduleId: string;
  round: 1 | 2 | 3;
  /** round=1 时无;round=2/3 时为当前展开的 branch.id */
  branchId?: string;
  lastUpdatedAt: number;
}

export interface LayeredReadingState {
  /** 本模式独立 module 列表，与 studyMap 无关 */
  modules: LayeredReadingModule[];
  /** 用户上次浏览到的位置（学习状态记忆，阶段 4 升级为 LayeredReadingLastVisited） */
  lastVisited?: LayeredReadingLastVisited;
  /** 题目作答记录(阶段 4 钉死结构;铁律 8 不进 globalChatHistory) */
  questions: LayeredReadingQuestion[];
  /** 阶段 3 新增：全局对话历史（铁律 7：视觉独立、数据全局） */
  globalChatHistory?: LayeredReadingChatMessage[];
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
export type LectureAudioStatus = 'recording' | 'ready' | 'interrupted' | 'error';
export type LectureAudioSource = 'microphone' | 'upload';
export type LectureTranscriptionStatus = 'idle' | 'transcribing' | 'ready' | 'error';
export type LectureAudioQualityRating = 'good' | 'fair' | 'poor';
export type LectureRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error';
export type LectureTranslationStatus = 'pending' | 'ready' | 'error';

export interface LectureRealtimeLine {
  id: string;
  text: string;
  translation?: string;
  timestamp: number;
  translationStatus: LectureTranslationStatus;
}

export interface LectureAudioQuality {
  rating: LectureAudioQualityRating;
  score: number;
  message: string;
  metrics?: {
    averageLogprob?: number;
    languageProbability?: number;
    speechCoverage?: number;
    speakerCount?: number;
  };
}

export interface LectureTranscriptSegment {
  id: string;
  speakerId: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface LectureNoteEvidence {
  segmentId: string;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  quote: string;
}

export interface LectureNoteSection {
  title: string;
  summary: string;
  evidence: LectureNoteEvidence[];
}

export interface LectureNoteKeyPoint {
  title: string;
  explanation: string;
  evidence: LectureNoteEvidence[];
}

export interface LectureNoteQuestionAnswer {
  question: string;
  answer: string;
  evidence: LectureNoteEvidence[];
}

export interface LectureNoteTerm {
  term: string;
  explanation: string;
  evidence: LectureNoteEvidence[];
}

export interface LectureNoteUncertainMoment {
  description: string;
  evidence: LectureNoteEvidence[];
}

export type LectureTeacherSignalKind =
  | 'emphasis'
  | 'assignment'
  | 'exam'
  | 'deadline'
  | 'correction'
  | 'limitation';

export interface LectureTeacherSignal extends LectureNoteKeyPoint {
  kind: LectureTeacherSignalKind;
}

export interface LectureStructuredNotes {
  version: 3 | 4;
  generatedAt: number;
  overview: string;
  /** V4: ten-minute catch-up route, grounded in transcript evidence. */
  catchUp?: LectureNoteSection[];
  outline: LectureNoteSection[];
  keyPoints: LectureNoteKeyPoint[];
  /** V4: material the teacher added, reframed or corrected beyond the linked slides. */
  teacherAdditions?: LectureNoteKeyPoint[];
  /** V4: examples and demonstrations used during class. */
  examples?: LectureNoteKeyPoint[];
  /** V4: explicit signals only; never inferred exam predictions. */
  teacherSignals?: LectureTeacherSignal[];
  questions: LectureNoteQuestionAnswer[];
  terms: LectureNoteTerm[];
  uncertainMoments: LectureNoteUncertainMoment[];
  /** True only when the organizer received a safely matched slide text source. */
  comparedWithSlides?: boolean;
}

export interface LectureAudioRecording {
  id: string;
  source: LectureAudioSource;
  createdAt: number;
  endedAt?: number;
  durationMs?: number;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  status: LectureAudioStatus;
  originalFileName?: string;
}

/** V4：录音期间真实发生的课件翻页事件，用于把转写证据定位回课件。 */
export interface LecturePageVisit {
  pageNumber: number;
  elapsedMs: number;
}

export interface LectureRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** 转写段落（带时间戳），或前端拼接为全文 */
  transcript: { text: string; timestamp: number }[];
  /** AI 整理结果（讲课逻辑、重点、风格），可选持久化 */
  organizedSummary?: string;
  /** V3 课堂复习笔记。每条内容只能引用真实转写段落。 */
  structuredNotes?: LectureStructuredNotes;
  /** 自定义名称（可选，默认使用时间） */
  name?: string;
  /** 原始音频保存在 IndexedDB 中，课堂记录只持有轻量索引。 */
  audioRecordingId?: string;
  audioSource?: LectureAudioSource;
  audioStatus?: LectureAudioStatus;
  audioMimeType?: string;
  audioSizeBytes?: number;
  audioChunkCount?: number;
  audioDurationMs?: number;
  transcriptionStatus?: LectureTranscriptionStatus;
  transcriptionError?: string;
  transcriptionProvider?: 'elevenlabs-scribe-v2';
  transcriptionLanguageCode?: string;
  transcriptionLanguageProbability?: number;
  transcriptSegments?: LectureTranscriptSegment[];
  transcribedAt?: number;
  audioQuality?: LectureAudioQuality;
  transcriptionKeyterms?: string[];
  transcriptionSpeakerCount?: number;
  /** V4：直播录音开始时关联的课件。上传的独立音频可以没有这些字段。 */
  sourceFileName?: string;
  sourceFileHash?: string;
  sourceStartedPage?: number;
  /** V4：按录音经过时间记录的翻页轨迹。 */
  pageVisits?: LecturePageVisit[];
}

// --- PERSISTENCE TYPES ---

/** 略读内容类型（阶段一 UI 三选一；阶段二提升为导出类型并入持久化）。缺省视为 'lecture'。 */
export type SkimContentType = 'lecture' | 'paper' | 'article';

export type SkimAuxiliaryMaterialRole = 'reading' | 'paper' | 'article' | 'textbook' | 'other';
export type SkimAuxiliaryUseMode = 'necessary' | 'active';

export interface SkimAuxiliaryMaterial {
  cloudSessionId: string;
  fileName: string;
  role: SkimAuxiliaryMaterialRole;
  useMode?: SkimAuxiliaryUseMode;
}

export type SkimReadingRouteNodeKind =
  | 'module'
  | 'part'
  | 'section'
  | 'naturalPart'
  | 'stage'
  | 'paragraphGroup';

export interface SkimReadingRouteNode {
  id: string;
  kind: SkimReadingRouteNodeKind;
  index: number;
  title: string;
  pageStart?: number;
  pageEnd?: number;
  pageLabel?: string;
  summary?: string;
  children?: SkimReadingRouteNode[];
}

export interface SkimReadingRoute {
  id: string;
  version: 1;
  kind: SkimContentType;
  title: string;
  sourceLabel?: string;
  generatedAt: number;
  pageRangeLabel?: string;
  moduleCount?: number;
  skimPace?: 'module' | 'part';
  nodes: SkimReadingRouteNode[];
}

/** Lecture 领读的呈现方式。旧会话缺省为 continuous。 */
export type SkimStudyStyle = 'continuous' | 'records' | 'case';

export type LectureCaseAnalysisStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'suitable'
  | 'unsuitable'
  | 'error';

export type LectureCasePageDispositionKind =
  | 'substantive'
  | 'duplicate'
  | 'transition'
  | 'title'
  | 'visual_only';

export type LectureCaseUnitKind =
  | 'concept'
  | 'claim'
  | 'evidence'
  | 'method'
  | 'critique'
  | 'example'
  | 'conclusion'
  | 'context';

export type LectureCaseCoverageLevel =
  | 'unseen'
  | 'introduced'
  | 'engaged'
  | 'verified'
  | 'needs_review';

export interface LectureCasePageDisposition {
  page: number;
  kind: LectureCasePageDispositionKind;
  unitIds: string[];
  reason: string;
}

export interface LectureCaseContentUnit {
  id: string;
  title: string;
  kind: LectureCaseUnitKind;
  summary: string;
  pageRefs: number[];
  importance: 'core' | 'supporting' | 'context';
  narrativeRole: 'spine' | 'toolkit' | 'evidence' | 'supplement';
}

export interface LectureCaseManifest {
  version: 1;
  pageStart: number;
  pageEnd: number;
  pages: LectureCasePageDisposition[];
  units: LectureCaseContentUnit[];
}

export interface LectureCaseEpisode {
  id: string;
  index: number;
  title: string;
  role: string;
  guidingQuestion: string;
  pageRefs: number[];
  unitIds: string[];
  prerequisiteEpisodeIds: string[];
  openingPrompt: string;
  bridgeToNext?: string;
  status: SkimRecordStatus;
  lastPage: number;
  messages: ChatMessage[];
  unresolvedQuestions: string[];
  readyToComplete?: boolean;
}

export interface LectureCasePlan {
  version: 1;
  caseTitle: string;
  centralQuestion: string;
  spineSummary: string;
  episodes: LectureCaseEpisode[];
}

export interface LectureCaseSuitabilityReport {
  suitabilityScore: number;
  mappableRate: number;
  centralQuestion: string;
  fitReasons: string[];
  unsuitableReasons: string[];
  detectedClaims: string[];
  detectedEvidenceGroups: string[];
  episodePreviews: Array<{ title: string; role: string; pageRefs: number[] }>;
  recommendedFallback: 'continuous' | 'records';
}

export interface LectureCaseUnitProgress {
  level: LectureCaseCoverageLevel;
  selfReportedUnderstood?: boolean;
  evidence?: string;
  updatedAt: number;
}

export interface LectureCaseProgress {
  units: Record<string, LectureCaseUnitProgress>;
}

export interface LectureCaseLearningState {
  version: 1;
  analysisVersion: string;
  sourceSignature: string;
  pageStart: number;
  pageEnd: number;
  status: LectureCaseAnalysisStatus;
  report?: LectureCaseSuitabilityReport;
  manifest?: LectureCaseManifest;
  plan?: LectureCasePlan;
  progress?: LectureCaseProgress;
  activeEpisodeId?: string | null;
  errorMessage?: string;
}

export interface LectureCaseCoverageUpdate {
  unitId: string;
  level: Exclude<LectureCaseCoverageLevel, 'unseen'>;
  evidence?: string;
  selfReportedUnderstood?: boolean;
}

export interface LectureCaseTurnResult {
  messageMarkdown: string;
  focusPages: number[];
  interactionKind: 'prediction' | 'judgment' | 'distinction' | 'reconstruction' | 'reveal' | 'none';
  coverageUpdates: LectureCaseCoverageUpdate[];
  unresolvedQuestions: string[];
  episodeReadyToComplete: boolean;
}

export type SkimRecordStatus = 'not_started' | 'in_progress' | 'completed';
export type SkimRecordDeckView = 'shelf' | 'reader';

/** 离开唱片时生成的轻量上下文，供下次续读和跨唱片关联使用。 */
export interface SkimRecordDigest {
  clarified: string[];
  unresolved: string[];
  updatedAt: number;
}

export interface SkimRecordCardState {
  id: string;
  routeNodeId: string;
  parentRouteNodeId?: string;
  moduleIndex: number;
  partIndex?: number;
  moduleTitle: string;
  title: string;
  summary: string;
  pageStart: number;
  pageEnd: number;
  pageLabel: string;
  status: SkimRecordStatus;
  lastPage: number;
  lastOpenedAt?: number;
  completedAt?: number;
  messages: ChatMessage[];
  digest?: SkimRecordDigest;
}

export interface SkimRecordDeck {
  version: 1;
  routeId: string;
  createdAt: number;
  orderedCardIds: string[];
  cards: Record<string, SkimRecordCardState>;
  activeCardId?: string | null;
  selectedModuleIndex?: number | null;
  view: SkimRecordDeckView;
}

/**
 * 略读「一段会话」的本地持久化形态（阶段二新增，仅本地 IndexedDB；云端 CloudSession 不动）。
 * 与 App 运行时的 SkimSession 同形——独立列出，避免持久化层耦合 App 内部类型。
 */
export interface PersistedSkimSession {
  id: string;
  /** 稳定的用户可编辑标签名；旧会话缺省时按恢复时的位置补“领读 N” */
  title?: string;
  studyMap: StudyMap | null;
  messages: ChatMessage[];
  stage: SkimStage;
  quizData: QuizData | null;
  moduleCount: number;
  skimPace: 'module' | 'part';
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  studyMapModuleCount: number | null;
  topHeight: number;
  focusMode: boolean;
  skipDiagnosis: boolean;
  /** 内容类型（阶段二新增，可选）。旧 session 无此字段 → 读取时按 'lecture' 兜底。 */
  contentType?: SkimContentType;
  /** 学习页领读：可选联合一个云端辅助 PDF；AI 只在相关时作为补充引用。 */
  auxiliaryMaterial?: SkimAuxiliaryMaterial | null;
  /** V1：可导航主线的结构化路线。旧 session 无此字段 → 读取时按 null 兜底。 */
  readingRoute?: SkimReadingRoute | null;
  /** Lecture 专用：整段式或分段唱片式；旧数据缺省为整段式。 */
  studyStyle?: SkimStudyStyle;
  /** 普通 Lecture 整段式/分段唱片式领读的后续讲解深度；旧数据缺省为 normal。 */
  explanationDepth?: SkimExplanationDepth;
  /** 整段式领读独立保存的 PDF 停留页；旧数据缺省为第 1 页。 */
  continuousLastPage?: number;
  /** 唱片式路线、状态和各唱片轻量元数据。 */
  recordDeck?: SkimRecordDeck | null;
  /** Lecture 案件式领读：适配报告、完整内容账本、章节与学习证据。 */
  caseLearning?: LectureCaseLearningState | null;
  /** paper/文章模式：AI 是否已讲过梗概（阶段四才真正写它，此处先占位存储）。 */
  briefingDone?: boolean;
}

/**
 * 私教模式（纯对话）独立会话类型。与略读 SkimSession / skimSessions 物理隔离：
 * 不含 study map / stage / quiz / page range 等略读包袱，只保留对话所需的最小字段。
 * 本地 IndexedDB（store `tutorSessions`）与云端 Firestore（`users/{uid}/tutorSessions`）共用此形。
 */
export interface TutorSession {
  /** 形如 tutor-${Date.now()}-${random} */
  id: string;
  /** 默认「私教 N」；本阶段只建字段，命名 UI 留待后续阶段 */
  title: string;
  /** 显式毫秒时间戳（区别于略读把创建时刻藏在 id 里） */
  createdAt: number;
  /** 复用现有 ChatMessage（已含 images?: string[]） */
  messages: ChatMessage[];
  /** 复用现有大写 DocType；缺省时由调用方给默认，本阶段不处理默认逻辑 */
  docType?: DocType;
  /**
   * 轻引用：创建私教会话时所基于文件的云端会话 id（= App 的 currentSessionId）。
   * 只存这个指针，**绝不存 PDF 字节**；刷新/重登恢复时凭它 getUserSessions→fetchFileFromUrl 重取 PDF。
   * 未登录 / 无云端文件时为空 → 恢复后退化为纯对话。
   */
  cloudSessionId?: string;
  /** 该私教会话所属 PDF 的 fileHash；旧数据无此字段 */
  fileHash?: string;
}

export interface FilePersistedState {
  explanations: ExplanationCache;
  chatCache: ChatCache;
  skimMessages: ChatMessage[];
  annotations: AnnotationCache;
  notebookData: NotebookData; 
  currentIndex: number;
  viewMode: ViewMode;
  skimTopHeight: number;
  /** 略读「专注模式」:隐藏上半块 + splitter,对话占满整个面板 */
  skimFocusMode?: boolean;
  studyMap: StudyMap | null;
  /** 递进阅读模式独立 state；与 studyMap 完全独立（铁律 2） */
  layeredReadingState?: LayeredReadingState | null;
  skimStage?: SkimStage;
  quizData?: QuizData | null;
  /** 阶段二：略读多会话列表（本地持久化）。字段存在 ⇒ 新格式；不存在 ⇒ 旧格式（用上面扁平字段迁移成单段）。
   *  上面的 skimMessages/studyMap/skimStage/quizData/skimTopHeight/skimFocusMode 旧扁平字段保留不删，作旧格式兼容。 */
  skimSessions?: PersistedSkimSession[];
  /** 阶段二：略读激活段索引 */
  activeSkimIndex?: number;
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

// --- LONG-TERM PROFILE NOTEBOOK ---
export type LearnerProfileAvatarTone = 'sky' | 'sage' | 'rose' | 'ink';

export interface LearnerProfileNotebook {
  companionName: string;
  welcomeLine: string;
  avatarTone: LearnerProfileAvatarTone;
  smoothAndStuck: string;
  focusDuration: string;
  stuckReaction: string;
  bestTime: string;
  recentTrend: string;
  updatedAt: number;
  version: number;
}

export interface StudyWitnessPageSegment {
  pageNumber: number;
  enteredAt: number;
  leftAt: number;
  durationMs: number;
}

export interface StudyWitnessPageSummary {
  pageNumber: number;
  totalDurationMs: number;
  visits: number;
}

export interface StudyWitnessAwayEvent {
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface StudyWitnessSession {
  id: string;
  userId?: string;
  fileName: string;
  fileHash: string | null;
  cloudSessionId?: string | null;
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'abandoned';
  totalDurationMs: number;
  activeDurationMs: number;
  pageSegments: StudyWitnessPageSegment[];
  pageSummaries: StudyWitnessPageSummary[];
  awayEvents: StudyWitnessAwayEvent[];
  finalPageNumber: number | null;
  createdAt: number;
}

export interface ProfileNotebookUpdateSuggestion {
  id: string;
  witnessSessionId: string;
  createdAt: number;
  sessionSummary: string[];
  proposedNotebook: LearnerProfileNotebook;
}

export type TinyStudyEntryType = 'question' | 'experiment' | 'counterintuitive' | 'debate' | 'real_life';
export type TinyStudyEntryStatus = 'unseen' | 'seen';
export type TinyStudyEntryAction = 'start' | 'simpler' | 'interesting' | 'deeper';

export interface TinyStudyEntryTurn {
  id: string;
  action: TinyStudyEntryAction;
  text: string;
  createdAt: number;
}

export interface TinyStudyEntry {
  id: string;
  type: TinyStudyEntryType;
  title: string;
  teaser: string;
  pageStart: number;
  pageEnd: number;
  evidence: string;
  status: TinyStudyEntryStatus;
  turns: TinyStudyEntryTurn[];
  lastReadAt?: number;
  scrollTop?: number;
}

export interface TinyStudyEntrySession {
  version: 1;
  fingerprintVersion?: 2;
  cloudSessionId: string;
  fileName: string;
  fileFingerprint: string;
  documentSummary: string;
  pageCount: number;
  entries: TinyStudyEntry[];
  activeEntryId?: string;
  updatedAt: number;
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
  /** 阶段三：略读多会话列表（云端 heavy 文档）。存在 ⇒ 新格式；不存在 ⇒ 旧格式（用扁平字段迁移成单段）。
   *  上面的 skimMessages/studyMap/skimStage/quizData/skimTopHeight/skimFocusMode 旧扁平字段保留不删，作旧格式兼容。 */
  skimSessions?: PersistedSkimSession[];
  /** 阶段三：略读激活段索引（云端） */
  activeSkimIndex?: number;
  docType?: DocType;
  skimTopHeight?: number;
  /** 略读「专注模式」:与 FilePersistedState.skimFocusMode 同步 */
  skimFocusMode?: boolean;
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

export type JointReviewMaterialRole = 'lecture' | 'reading' | 'article' | 'textbook' | 'other';

export interface JointReviewMaterial {
  cloudSessionId: string;
  fileName: string;
  role: JointReviewMaterialRole;
  sortIndex: number;
}

export interface JointReviewPack {
  id: string;
  userId: string;
  title: string;
  materials: JointReviewMaterial[];
  summaryMarkdown?: string;
  guideMessages?: ChatMessage[];
  examPrepMarkdown?: string;
  createdAt: number;
  updatedAt: number;
  generatedAt?: number | null;
  examPrepGeneratedAt?: number | null;
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
  /** 当前 UI 锚定的复习块边界；主回答必须先锁在这里。 */
  reviewScope?: ExamReviewScope | null;
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
  /** 当前 UI 锚定的复习块边界；主回答必须先锁在这里。 */
  reviewScope?: ExamReviewScope | null;
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
