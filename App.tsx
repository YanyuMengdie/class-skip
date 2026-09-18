import { useReviewCache } from '@/features/review/lib/useReviewCache';
import { reviewSourceKey, notesToTree } from '@/features/review/lib/reviewNotes';
import { StudyToolMenu } from '@/features/review/StudyToolMenu';
import { prepareLectureKnowledge, type PrepareLectureKnowledgeOptions } from '@/features/exam/round/lectureKnowledge';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from '@/shared/layout/Header';
import { dashboardFeatures } from '@/shared/dashboardFeatures';
import { SlideViewer } from '@/features/reader/slide-viewer/SlideViewer';
import { exportStudyHandoutPdf } from '@/features/reader/export/studyHandoutPdf';
import { SlidePageComments } from '@/features/reader/page-notes/SlidePageComments';
import { ExplanationPanel } from '@/features/reader/deep-read/ExplanationPanel';
import { SkimPanel } from '@/features/reader/skim/SkimPanel';
import { SkimRecordShelf } from '@/features/reader/skim/SkimRecordShelf';
import { SessionTabInk, type SessionTabInkPosition } from '@/features/reader/motion/SessionTabInk';
import '@/features/reader/readingWorkspaceShell.css';
import { TutorChat, TUTOR_OPENING_TEXT } from '@/features/tutor/TutorChat';
import { Sidebar } from '@/shared/layout/Sidebar';
import { Notebook } from '@/features/reader/notebook/Notebook';
import { HistoryModal } from '@/shared/history/HistoryModal';
import { GalgameOverlay } from '@/components/GalgameOverlay';
import { GalgameSettings } from '@/components/GalgameSettings'; 
import { WelcomeScreen } from '@/shared/layout/WelcomeScreen';
import { DashboardScreen } from '@/shared/layout/DashboardScreen';
import { QuizReviewPanel } from '@/features/review/tools/QuizReviewPanel';
import { FlashCardReviewPanel } from '@/features/review/tools/FlashCardReviewPanel';
import { PageMarkPanel } from '@/features/reader/marks/PageMarkPanel';
import { StudyGuidePanel } from '@/features/review/tools/StudyGuidePanel';
import { ExamSummaryPanel } from '@/features/review/tools/ExamSummaryPanel';
import { FeynmanPanel } from '@/features/review/tools/FeynmanPanel';
import { ExamTrapsPanel } from '@/features/review/tools/ExamTrapsPanel';
import { TerminologyPanel } from '@/features/review/tools/TerminologyPanel';
import { TrapListPanel } from '@/features/review/tools/TrapListPanel';
import { TrickyProfessorPanel } from '@/features/review/tools/TrickyProfessorPanel';
import { MindMapPanel } from '@/features/review/tools/mindMap/MindMapPanel';
import { MultiDocQAPanel, getMultiDocQAConversationKey, loadMultiDocQAMessages, saveMultiDocQAMessages } from '@/features/review/tools/MultiDocQAPanel';
import { StudioPanel, ArtifactFullView } from '@/shared/studio/StudioPanel';
import { LoginModal } from '@/shared/auth/LoginModal';
import { ClassroomPanel } from '@/features/lecture/ClassroomPanel';
import { MicrophoneSetupDialog } from '@/features/lecture/MicrophoneSetupDialog';
import { LectureTranscriptPage } from '@/features/lecture/LectureTranscriptPage';
import { getLecturePageAtElapsedMs } from '@/features/lecture/lectureReviewExport';
import { ReviewPage, ReviewType } from '@/features/review/ReviewPage';
import { TurtleSoupPanel } from '@/features/turtleSoup/TurtleSoupPanel';
import { ExamPredictionPanel } from '@/features/exam/ExamPredictionPanel';
import { ExamHubModal } from '@/features/exam/ExamHubModal';
import { ExamWorkspacePage } from '@/features/exam/workspace/ExamWorkspacePage';
import { ReviewWorkspaceEntry } from '@/features/exam/workspace/ReviewWorkspaceEntry';
import { createLectureReviewMaterial } from '@/features/exam/lib/lectureReviewScope';
import { convertPdfToImages, readFileAsDataURL, extractPdfText, generateFileHash, fetchFileFromUrl } from '@/lib/pdf/pdfUtils';
import { buildArtifactSourceLabel } from '@/shared/lib/artifactSourceLabel';
import { generateSlideExplanation, chatWithSlide, performPreFlightDiagnosis, classifyDocument, generatePersonaStoryScript, organizeLectureFromTranscript, organizeLectureWithEvidence, generateLSAPContentMap, generateLogicAtomsForContentMap, generateProfileNotebookUpdateSuggestion, translateLectureTranscriptSegment, type SlideExplanationMode } from '@/services/geminiService';
import { pauseRecording, resumeRecording, startRecording, stopRecording, isLectureRecordingSupported } from '@/services/transcriptionService';
import {
  retryElevenLabsRealtimeTranscription,
  startElevenLabsRealtimeTranscription,
  stopElevenLabsRealtimeTranscription,
} from '@/services/elevenLabsRealtimeService';
import { lectureAudioStorage } from '@/services/lectureAudioStorage';
import {
  transcribeLectureAudio,
  type LectureTranscriptionOptions,
} from '@/services/elevenLabsTranscriptionService';
import { storageService } from '@/services/storageService';
import { auth, logoutUser, uploadPDF, createCloudSession, updateCloudSessionState, deleteCloudSession, deleteSkimSessionFromCloud, fetchSessionDetails, isEmailLinkSignIn, completeEmailLinkSignIn, getUserSessions, listExamMaterialLinks, saveTutorSessionToCloud, getTutorSessionsFromCloud, deleteTutorSessionFromCloud } from '@/services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LOCAL_WORKSPACE_USER, isLocalUser, isCloudUser, type WorkspaceUser as User } from '@/services/workspaceUser';
import { Slide, ExplanationCache, ChatCache, ChatMessage, NotebookData, Note, AnnotationCache, SlideAnnotation, StudyMap, ViewMode, FileHistoryItem, SkimStage, QuizData, DocType, FilePersistedState, PersonaSettings, CloudSession, QuizRound, FlashCard, TrapItem, PageMarks, PageMark, StudyGuide, LectureRecord, LectureAudioRecording, LectureRealtimeLine, LectureRealtimeStatus, TurtleSoupState, PageCommentsCache, SlidePageComment, SavedArtifact, LSAPContentMap, LSAPState, LSAPBKTState, LSAPKnowledgeComponent, DailySegment, StudyFlowStep, ExamMaterialLink, AtomCoverageByKc, KcGlossaryEntry, TutorSession, SkimContentType, SkimAuxiliaryMaterial, SkimReadingRoute, SkimStudyStyle, SkimExplanationDepth, SkimRecordDeck, SkimRecordCardState, LearnerProfileNotebook, ProfileNotebookUpdateSuggestion, StudyWitnessAwayEvent, StudyWitnessPageSegment, StudyWitnessPageSummary, StudyWitnessSession, LectureCaseLearningState } from '@/types';
import {
  appendLocalPendingSuggestion,
  appendLocalWitnessSession,
  getCloudProfileNotebook,
  getCloudWitnessSessions,
  loadLocalPendingSuggestions,
  loadLocalProfileNotebook,
  loadLocalWitnessSessions,
  normalizeProfileNotebook,
  saveCloudPendingSuggestion,
  saveCloudProfileNotebook,
  saveCloudWitnessSession,
  saveLocalProfileNotebook,
} from '@/services/profileNotebookService';
import {
  computeExamWorkspaceLsapKey,
  loadWorkspaceLsapBundle,
  mergeAtomCoverageForMap,
  saveWorkspaceLsapBundle,
  truncateWorkspaceDialogue,
  type WorkspaceDialogueTurn,
  type WorkspaceEvidenceAnnotation,
} from '@/features/exam/lib/examWorkspaceLsapKey';
import { filterEvidenceAnnotationsForMap } from '@/features/exam/lib/examLearningEvidence';
import { getActiveIndexAfterDeletion, getNextDefaultSessionSequence } from '@/features/reader/sessionTabs';
import { computePredictedScore } from '@/features/exam/lib/lsapScore';
import { normalizeTermKey } from '@/lib/text/extractBoldTermsFromMarkdown';
import { X, ChevronDown, Loader2, Wand2, Plus, MessageCircle, MoreHorizontal, Pencil, Trash2, PanelRightClose, PanelRightOpen, Mic, Pause, Play, BookOpen, Info } from 'lucide-react';
import { useAppLanguage, getCurrentAppLanguage } from '@/shared/i18n/appLanguage';
import { getCloudAppPreferences, saveCloudAppPreferences } from '@/services/appPreferencesService';
import type { AppLanguage, AppPreferences } from '@/types';

/** P0 备考工作台：当前考试 ID 存 localStorage */
const EXAM_WORKSPACE_ACTIVE_EXAM_LS = 'examWorkspace_activeExamId';

/** P2：备考台按单份材料抽逻辑原子时与 KC 图谱单份上限一致（120000），避免仍被 4 万截断 */
const LSAP_ATOMS_PER_MATERIAL_MAX_CHARS = 120_000;
const PAGE_TOOL_PROMPT_VERSION = 'v2';
const getLegacyPageToolCacheKey = (slideId: string, mode: SlideExplanationMode) => `${slideId}::${mode}::${PAGE_TOOL_PROMPT_VERSION}`;
const getPageToolCacheKey = (slideId: string, mode: SlideExplanationMode, language: AppLanguage = getCurrentAppLanguage()) => (
  `${getLegacyPageToolCacheKey(slideId, mode)}::${language}`
);
const getPageToolLabel = (mode: SlideExplanationMode) => {
  if (mode === 'note') return '整理本页内容';
  if (mode === 'exam') return '这页怎么考';
  return '听讲解';
};

const getCloudAppPreferencesWithTimeout = async (user: User, timeoutMs = 4000): Promise<AppPreferences | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getCloudAppPreferences(user),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('App preference cloud read timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getLectureAudioExtension = (mimeType?: string) => {
  const normalized = mimeType?.toLowerCase() || '';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('flac')) return 'flac';
  if (normalized.includes('aac')) return 'aac';
  return 'webm';
};

const withLectureAudio = (
  lecture: LectureRecord,
  audio: LectureAudioRecording
): LectureRecord => ({
  ...lecture,
  audioRecordingId: audio.id,
  audioSource: audio.source,
  audioStatus: audio.status,
  audioMimeType: audio.mimeType,
  audioSizeBytes: audio.sizeBytes,
  audioChunkCount: audio.chunkCount,
  audioDurationMs: audio.durationMs,
  endedAt: lecture.endedAt || audio.endedAt,
});

const importedAudioLecture = (audio: LectureAudioRecording): LectureRecord => ({
  id: audio.id,
  startedAt: audio.createdAt,
  endedAt: audio.endedAt,
  transcript: [],
  name: audio.originalFileName?.replace(/\.[^.]+$/, '') || '上传的课堂录音',
  audioRecordingId: audio.id,
  audioSource: audio.source,
  audioStatus: audio.status,
  audioMimeType: audio.mimeType,
  audioSizeBytes: audio.sizeBytes,
  audioChunkCount: audio.chunkCount,
  audioDurationMs: audio.durationMs,
});

const getLectureHistoryKey = (lecture: LectureRecord) => (
  lecture.audioRecordingId || lecture.id
);

const dedupeLectureHistory = (lectures: LectureRecord[]): LectureRecord[] => {
  const deduped = new Map<string, LectureRecord>();
  [...lectures]
    .sort((a, b) => b.startedAt - a.startedAt)
    .forEach((lecture) => {
      const key = getLectureHistoryKey(lecture);
      const existing = deduped.get(key);
      deduped.set(key, existing ? { ...lecture, ...existing } : lecture);
    });
  return [...deduped.values()].sort((a, b) => b.startedAt - a.startedAt);
};

const upsertLectureHistory = (
  lectures: LectureRecord[],
  lecture: LectureRecord
): LectureRecord[] => {
  const key = getLectureHistoryKey(lecture);
  return dedupeLectureHistory([
    lecture,
    ...lectures.filter((item) => (
      getLectureHistoryKey(item) !== key && item.id !== lecture.id
    )),
  ]);
};

// #region agent log
const _debugLog = (location: string, message: string, data: Record<string, unknown>) => {
  const entry = { location, message, data, timestamp: Date.now() };
  (window as unknown as { __debugLog?: unknown[] }).__debugLog = (window as unknown as { __debugLog?: unknown[] }).__debugLog || [];
  (window as unknown as { __debugLog: unknown[] }).__debugLog.push(entry);
  fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,hypothesisId:'H1'})}).catch(()=>{});
};
// #endregion

const normalizeGeneratedLineBreaks = (text: string): string => (
  text.replace(/<br\s*\/?>|&lt;br\s*\/?&gt;/gi, '\n')
);

const DEFAULT_PERSONA: PersonaSettings = {
    charName: '蕾姆',
    userNickname: '昂君',
    relationship: '爱慕者',
    personality: '温柔体贴'
};

/**
 * 略读「一段会话」的内存模型（阶段一：纯前端内存，刷新即丢，不进任何持久化结构）。
 * 把原本散落的略读 App 单值（studyMap / skimMessages / skimStage / quizData）+ UI 态
 * （topHeight / focusMode）+ 原 SkimPanel 内部态（moduleCount / skimPace / pageRange）
 * 全部收进一段，按 id 隔离，避免多段串台。**刻意不写进 types.ts 的持久化类型。**
 */
interface SkimSession {
  id: string;
  /** 稳定标签名；删除其他会话时不会随数组位置重排 */
  title: string;
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
  /** 方案 A：true = 跳过诊断开场，直接进配置区（仅「+」新建段）；首段/恢复段为 false，走完整诊断 */
  skipDiagnosis: boolean;
  /** 阶段二：内容类型（可选，与 PersistedSkimSession 同形）。旧 session 无此字段 → 按 'lecture' 兜底。 */
  contentType?: SkimContentType;
  /** 学习页领读：可选联合一个云端辅助 PDF；AI 只在相关时作为补充引用。 */
  auxiliaryMaterial?: SkimAuxiliaryMaterial | null;
  /** V1：结构化领读路线，用于后续目录跳转和重规划。 */
  readingRoute?: SkimReadingRoute | null;
  /** Lecture 领读呈现方式；旧会话缺省为整段式。 */
  studyStyle?: SkimStudyStyle;
  /** 普通 Lecture 整段式/分段式领读的后续讲解深度；旧会话缺省为正常讲。 */
  explanationDepth?: SkimExplanationDepth;
  /** 整段式领读自己的 PDF 停留页，与分段停留页分开保存。 */
  continuousLastPage?: number;
  /** 分段式学习的分段路线、状态与独立对话。 */
  recordDeck?: SkimRecordDeck | null;
  /** 推演式领读的适配报告、内容账本、章节与学习证据。 */
  caseLearning?: LectureCaseLearningState | null;
  /** 阶段二：paper/文章模式 AI 是否已讲过梗概（阶段四才真正写，先占位）。 */
  briefingDone?: boolean;
}

/** 新建一段干净的空白略读会话（id 沿用本仓库现有 `${Date.now()}-${random}` 风格） */
const createEmptySkimSession = (seq = 1): SkimSession => ({
  id: `skim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  title: `领读 ${seq}`,
  studyMap: null,
  messages: [],
  stage: 'diagnosis',
  quizData: null,
  moduleCount: 4,
  skimPace: 'module',
  pageRangeStart: null,
  pageRangeEnd: null,
  studyMapModuleCount: null,
  topHeight: 60,
  focusMode: false,
  skipDiagnosis: false,
  readingRoute: null,
  studyStyle: 'continuous',
  explanationDepth: 'normal',
  continuousLastPage: 1,
  recordDeck: null,
  caseLearning: null,
});

/** 略读会话数量上限（阶段一） */
const MAX_SKIM_SESSIONS = 10;

/** 问答会话数量上限 */
const MAX_TUTOR_SESSIONS = 10;

type ManagedSessionTab = { kind: 'skim' | 'tutor'; id: string };

/** 新建一条问答会话：含前端开场白 messages[0]，docType 默认 STEM；与略读 SkimSession 完全独立。
 *  cloudSessionId：基于的云端文件会话 id（轻引用，仅存指针、不存 PDF），无则不写该字段。 */
const createTutorSession = (seq: number, cloudSessionId?: string | null, fileHash?: string | null): TutorSession => ({
  id: `tutor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  title: `问答 ${seq}`,
  createdAt: Date.now(),
  messages: [{ role: 'model', text: TUTOR_OPENING_TEXT, timestamp: Date.now() }],
  docType: 'STEM',
  ...(cloudSessionId ? { cloudSessionId } : {}),
  ...(fileHash ? { fileHash } : {}),
});

const normalizeTutorSessionTitle = (title: string): string => title.replace(/^私教(?=\s*\d+$)/, '问答');

/** 旧版本可能保存过已下线的阅读模式；恢复时统一安全回到领读。 */
const normalizeRestoredViewMode = (mode: unknown): ViewMode => {
  if (mode === 'deep' || mode === 'tutor') return mode;
  return 'skim';
};

/** 问答多会话本地↔云合并：按 id 去重，云端在冲突时覆盖本地（跨设备源），按 createdAt 倒序 */
const mergeTutorSessions = (local: TutorSession[], cloud: TutorSession[]): TutorSession[] => {
  const map = new Map<string, TutorSession>();
  for (const s of local) map.set(s.id, { ...s, title: normalizeTutorSessionTitle(s.title) });
  for (const s of cloud) map.set(s.id, { ...s, title: normalizeTutorSessionTitle(s.title) }); // 云端后写 → 冲突时云端胜
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
};

interface ActiveStudyWitnessDraft {
  id: string;
  fileName: string;
  fileHash: string | null;
  cloudSessionId: string | null;
  startedAt: number;
  currentPageNumber: number | null;
  pageEnteredAt: number;
  pageSegments: StudyWitnessPageSegment[];
  awayEvents: StudyWitnessAwayEvent[];
  awayStartedAt: number | null;
}

const formatDurationShort = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} 秒`;
  return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`;
};

const summarizeWitnessPages = (segments: StudyWitnessPageSegment[]): StudyWitnessPageSummary[] => {
  const map = new Map<number, StudyWitnessPageSummary>();
  for (const segment of segments) {
    const prev = map.get(segment.pageNumber) || {
      pageNumber: segment.pageNumber,
      totalDurationMs: 0,
      visits: 0,
    };
    prev.totalDurationMs += segment.durationMs;
    prev.visits += 1;
    map.set(segment.pageNumber, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.pageNumber - b.pageNumber);
};

const buildLocalSessionSummary = (session: StudyWitnessSession): string[] => {
  const longestPage = session.pageSummaries
    .slice()
    .sort((a, b) => b.totalDurationMs - a.totalDurationMs)[0];
  const result = [
    `本次学习总时长 ${formatDurationShort(session.totalDurationMs)}，有效停留 ${formatDurationShort(session.activeDurationMs)}。`,
    `本次共经过 ${session.pageSummaries.length} 页，结束时停在第 ${session.finalPageNumber ?? '-'} 页。`,
  ];
  if (longestPage) {
    result.push(`停留最久的是第 ${longestPage.pageNumber} 页，累计 ${formatDurationShort(longestPage.totalDurationMs)}。`);
  }
  if (session.awayEvents.length > 0) {
    result.push(`中途离开 ${session.awayEvents.length} 次，最长 ${formatDurationShort(Math.max(...session.awayEvents.map((event) => event.durationMs)))}。`);
  }
  return result;
};

const buildSkimRecordDigest = (messages: ChatMessage[]) => {
  const clarified = messages
    .filter((message) => (
      message.role === 'model'
      && message.text.trim()
      && !message.skimKnowledgeExtraction
      && !message.skimKnowledgeExtractionFeedback
    ))
    .slice(-3)
    .map((message) => message.text.replace(/\s+/g, ' ').trim().slice(0, 220));
  const unresolved = messages
    .filter((message, index) => (
      message.role === 'user'
      && message.text.trim()
      && !messages[index - 1]?.skimKnowledgeExtraction
    ))
    .slice(-3)
    .map((message) => message.text.replace(/\s+/g, ' ').trim().slice(0, 160));
  return { clarified, unresolved, updatedAt: Date.now() };
};

const App: React.FC = () => {
  const { language: appLanguage, setLanguage: setAppLanguage, text: uiText } = useAppLanguage();
  // --- STATE DECLARATIONS ---
  const [hasStarted, setHasStarted] = useState(false);
  const [shellMode, setShellMode] = useState<'dashboard' | 'study'>('dashboard');
  const [dashboardInitialTab, setDashboardInitialTab] = useState<'library' | 'calendar' | 'memo' | 'energy' | 'growth' | 'profile' | 'settings'>('library');
  const [profileNotebook, setProfileNotebook] = useState<LearnerProfileNotebook>(() => loadLocalProfileNotebook());
  const [activeStudyStartedAt, setActiveStudyStartedAt] = useState<number | null>(null);
  const [activeStudyElapsedMs, setActiveStudyElapsedMs] = useState(0);
  const activeStudyDraftRef = useRef<ActiveStudyWitnessDraft | null>(null);
  const [summarySession, setSummarySession] = useState<StudyWitnessSession | null>(null);
  const [profileSuggestion, setProfileSuggestion] = useState<ProfileNotebookUpdateSuggestion | null>(null);
  const [profileSuggestionDraft, setProfileSuggestionDraft] = useState<LearnerProfileNotebook | null>(null);
  const [isGeneratingProfileSuggestion, setIsGeneratingProfileSuggestion] = useState(false);
  const [profileSuggestionError, setProfileSuggestionError] = useState<string | null>(null);
  const profileCloudReadyRef = useRef(false);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [explanations, setExplanations] = useState<ExplanationCache>({});
  const [explanationErrors, setExplanationErrors] = useState<Record<string, string>>({});
  const [activePageToolMode, setActivePageToolMode] = useState<SlideExplanationMode>('explain');
  const [chatCache, setChatCache] = useState<ChatCache>({});
  const [annotations, setAnnotations] = useState<AnnotationCache>({});
  const [pageComments, setPageComments] = useState<PageCommentsCache>({});
  // === 略读多会话（阶段一：纯内存）===
  // 原 4 个略读单值 + 2 个 UI 单值 + 原 SkimPanel 内部态，统一提升进「会话列表 + 激活索引」。
  const [skimSessions, setSkimSessions] = useState<SkimSession[]>(() => [createEmptySkimSession()]);
  const [activeSkimIndex, setActiveSkimIndex] = useState(0);
  /** SkimPanel 内部 isChatLoading 上抛（onLoadingChange），用于标签栏「生成中锁切换」 */
  const [skimActiveLoading, setSkimActiveLoading] = useState(false);
  /** 始终指向当前激活会话 id；所有包装 setter 按此 id 定位，绝不用 activeSkimIndex 闭包，异步回包也只写自己那段 */
  const activeIdRef = useRef<string | null>(null);
  /** 阶段二「读旧不毁旧」：迁移旧格式时记下那份内存列表的引用。只要 skimSessions 仍是这同一引用
   *  （= 用户尚未对略读做任何改动），本地保存就**不写新格式 skimSessions**、只续写旧扁平字段，
   *  从而不覆盖硬盘上的旧记录；一旦任意包装 setter 产生新数组（引用变了），即按新格式落盘。 */
  const migratedSkimBaselineRef = useRef<SkimSession[] | null>(null);
  // 派生当前激活会话切片：喂给 SkimPanel 的「单份」props 全部从这里取，SkimPanel 的 props 形状保持不变。
  const activeSkim = skimSessions[activeSkimIndex] ?? skimSessions[0];
  activeIdRef.current = activeSkim?.id ?? null;
  const activeRecordCard = useMemo<SkimRecordCardState | null>(() => {
    const deck = activeSkim?.recordDeck;
    if (activeSkim?.studyStyle !== 'records' || deck?.view !== 'reader' || !deck.activeCardId) return null;
    return deck.cards[deck.activeCardId] ?? null;
  }, [activeSkim?.recordDeck, activeSkim?.studyStyle]);
  const activeRecordCardIdRef = useRef<string | null>(null);
  activeRecordCardIdRef.current = activeRecordCard?.id ?? null;
  const skimMessages = activeRecordCard?.messages ?? activeSkim.messages;
  const skimTopHeight = activeSkim.topHeight;
  const skimFocusMode = activeSkim.focusMode;
  const skimStage = activeSkim.stage;
  const quizData = activeSkim.quizData;
  const studyMap = activeSkim.studyMap;
  const studyMapModuleCount = activeSkim.studyMapModuleCount;
  /** 包装 setter 统一入口：按「调用时」的 activeIdRef.current 定位单段更新（生成中已锁切换，故必落在发起段） */
  const updateActiveSkimSession = useCallback((updater: (s: SkimSession) => SkimSession) => {
    const id = activeIdRef.current;
    if (id == null) return;
    setSkimSessions(prev => prev.map(s => (s.id === id ? updater(s) : s)));
  }, []);
  // ↓↓↓ 与原单值 setter 同名同形（含函数式更新），故所有既有调用点无需改动，只是改为写进激活会话。
  const setSkimMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
    value => updateActiveSkimSession(s => {
      const cardId = activeRecordCardIdRef.current;
      const deck = s.recordDeck;
      if (s.studyStyle === 'records' && cardId && deck?.cards[cardId]) {
        const previous = deck.cards[cardId].messages ?? [];
        const messages = typeof value === 'function'
          ? (value as (p: ChatMessage[]) => ChatMessage[])(previous)
          : value;
        return {
          ...s,
          recordDeck: {
            ...deck,
            cards: {
              ...deck.cards,
              [cardId]: {
                ...deck.cards[cardId],
                messages,
                digest: buildSkimRecordDigest(messages),
              },
            },
          },
        };
      }
      return {
        ...s,
        messages: typeof value === 'function'
          ? (value as (p: ChatMessage[]) => ChatMessage[])(s.messages)
          : value,
      };
    }),
    [updateActiveSkimSession]
  );
  const setSkimTopHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>(
    value => updateActiveSkimSession(s => ({ ...s, topHeight: typeof value === 'function' ? (value as (p: number) => number)(s.topHeight) : value })),
    [updateActiveSkimSession]
  );
  const setSkimFocusMode = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    value => updateActiveSkimSession(s => ({ ...s, focusMode: typeof value === 'function' ? (value as (p: boolean) => boolean)(s.focusMode) : value })),
    [updateActiveSkimSession]
  );
  const setSkimStage = useCallback((stage: SkimStage) => updateActiveSkimSession(s => ({ ...s, stage })), [updateActiveSkimSession]);
  const setQuizData = useCallback((data: QuizData | null) => updateActiveSkimSession(s => ({ ...s, quizData: data })), [updateActiveSkimSession]);
  // 原 SkimPanel 内部态（模块数 / 节奏 / 页码范围）提升到会话后的写入器（均为值式，与 SkimPanel 用法一致）
  const setSkimModuleCount = useCallback((count: number) => updateActiveSkimSession(s => ({ ...s, moduleCount: count })), [updateActiveSkimSession]);
  const setSkimPaceValue = useCallback((pace: 'module' | 'part') => updateActiveSkimSession(s => ({ ...s, skimPace: pace })), [updateActiveSkimSession]);
  const setSkimContentType = useCallback((next: SkimContentType) => updateActiveSkimSession(s => ({
    ...s,
    contentType: next,
    readingRoute: null,
    ...(next === 'lecture' ? {} : { studyStyle: 'continuous' as const, recordDeck: null }),
  })), [updateActiveSkimSession]);
  const setSkimAuxiliaryMaterial = useCallback((next: SkimAuxiliaryMaterial | null) => updateActiveSkimSession(s => ({ ...s, auxiliaryMaterial: next })), [updateActiveSkimSession]);
  const setSkimReadingRoute = useCallback((route: SkimReadingRoute | null) => updateActiveSkimSession(s => ({ ...s, readingRoute: route })), [updateActiveSkimSession]);
  const setSkimExplanationDepth = useCallback((explanationDepth: SkimExplanationDepth) => updateActiveSkimSession(s => ({
    ...s,
    explanationDepth,
  })), [updateActiveSkimSession]);
  const setSkimStudyStyle = useCallback((studyStyle: SkimStudyStyle) => {
    if (studyStyle === 'continuous') {
      const page = Math.max(1, Math.min(activeSkim.continuousLastPage ?? 1, Math.max(1, slides.length)));
      setCurrentIndex(page - 1);
    }
    updateActiveSkimSession(s => ({
      ...s,
      studyStyle,
      continuousLastPage: (s.studyStyle ?? 'continuous') === 'continuous' && studyStyle !== 'continuous'
        ? currentIndex + 1
        : (s.continuousLastPage ?? 1),
      ...(studyStyle === 'continuous'
        ? {
            recordDeck: s.recordDeck ? {
              ...s.recordDeck,
              view: 'shelf' as const,
              cards: s.recordDeck.activeCardId && s.recordDeck.cards[s.recordDeck.activeCardId]
                ? {
                    ...s.recordDeck.cards,
                    [s.recordDeck.activeCardId]: {
                      ...s.recordDeck.cards[s.recordDeck.activeCardId],
                      digest: buildSkimRecordDigest(s.recordDeck.cards[s.recordDeck.activeCardId].messages),
                    },
                  }
                : s.recordDeck.cards,
            } : s.recordDeck,
          }
        : { readingRoute: s.recordDeck ? s.readingRoute : null }),
    }));
  }, [activeSkim.continuousLastPage, currentIndex, slides.length, updateActiveSkimSession]);
  const setSkimRecordDeck = useCallback<React.Dispatch<React.SetStateAction<SkimRecordDeck | null>>>(
    value => updateActiveSkimSession(s => ({
      ...s,
      recordDeck: typeof value === 'function'
        ? (value as (previous: SkimRecordDeck | null) => SkimRecordDeck | null)(s.recordDeck ?? null)
        : value,
    })),
    [updateActiveSkimSession]
  );
  const setLectureCaseLearning = useCallback<React.Dispatch<React.SetStateAction<LectureCaseLearningState | null>>>(
    value => updateActiveSkimSession(s => ({
      ...s,
      caseLearning: typeof value === 'function'
        ? (value as (previous: LectureCaseLearningState | null) => LectureCaseLearningState | null)(s.caseLearning ?? null)
        : value,
    })),
    [updateActiveSkimSession]
  );
  const handleOpenSkimRecord = useCallback((cardId: string) => {
    const deck = activeSkim.recordDeck;
    const card = deck?.cards[cardId];
    if (!deck || !card) return;
    setCurrentIndex(Math.max(0, Math.min((card.lastPage || card.pageStart) - 1, Math.max(0, slides.length - 1))));
    setSkimRecordDeck(previous => {
      if (!previous) return previous;
      const previousCard = previous.activeCardId && previous.activeCardId !== cardId
        ? previous.cards[previous.activeCardId]
        : null;
      const nextCard = previous.cards[cardId];
      if (!nextCard) return previous;
      const cards = previousCard
        ? {
            ...previous.cards,
            [previousCard.id]: {
              ...previousCard,
              digest: buildSkimRecordDigest(previousCard.messages),
            },
          }
        : previous.cards;
      return {
        ...previous,
        view: 'reader',
        activeCardId: cardId,
        selectedModuleIndex: nextCard.moduleIndex,
        cards: {
          ...cards,
          [cardId]: {
            ...nextCard,
            status: nextCard.status === 'completed' ? 'completed' : 'in_progress',
            lastOpenedAt: Date.now(),
          },
        },
      };
    });
    setSkimStage('reading');
  }, [activeSkim.recordDeck, setSkimRecordDeck, setSkimStage, slides.length]);
  const handleFocusSkimRecord = useCallback((cardId: string) => {
    setSkimRecordDeck(previous => {
      const card = previous?.cards[cardId];
      if (!previous || !card) return previous;
      if (previous.activeCardId === cardId && previous.selectedModuleIndex === card.moduleIndex) return previous;
      return {
        ...previous,
        activeCardId: cardId,
        selectedModuleIndex: card.moduleIndex,
      };
    });
  }, [setSkimRecordDeck]);
  const handleReturnToSkimRecordShelf = useCallback(() => {
    setSkimRecordDeck(previous => {
      if (!previous) return previous;
      const cardId = previous.activeCardId;
      const card = cardId ? previous.cards[cardId] : null;
      return {
        ...previous,
        view: 'shelf',
        cards: cardId && card ? {
          ...previous.cards,
          [cardId]: { ...card, digest: buildSkimRecordDigest(card.messages) },
        } : previous.cards,
      };
    });
  }, [setSkimRecordDeck]);
  const handleSetSkimRecordCompleted = useCallback((completed: boolean) => {
    setSkimRecordDeck(previous => {
      if (!previous?.activeCardId) return previous;
      const card = previous.cards[previous.activeCardId];
      if (!card) return previous;
      return {
        ...previous,
        cards: {
          ...previous.cards,
          [card.id]: {
            ...card,
            status: completed ? 'completed' : 'in_progress',
            completedAt: completed ? Date.now() : undefined,
            digest: buildSkimRecordDigest(card.messages),
          },
        },
      };
    });
  }, [setSkimRecordDeck]);
  const handleOpenNextSkimRecord = useCallback(() => {
    const deck = activeSkim.recordDeck;
    if (!deck?.activeCardId) return;
    const index = deck.orderedCardIds.indexOf(deck.activeCardId);
    const nextId = deck.orderedCardIds[index + 1];
    if (nextId) handleOpenSkimRecord(nextId);
  }, [activeSkim.recordDeck, handleOpenSkimRecord]);
  const setSkimPageRangeStart = useCallback((v: number | null) => updateActiveSkimSession(s => ({ ...s, pageRangeStart: v })), [updateActiveSkimSession]);
  const setSkimPageRangeEnd = useCallback((v: number | null) => updateActiveSkimSession(s => ({ ...s, pageRangeEnd: v })), [updateActiveSkimSession]);
  /** 「读旧不毁旧」抑制判断（阶段二/三）：本地 + 云端两条保存 effect **共用这一套**，避免漂移。
   *  仍是迁移产出的同一份内存列表（用户没动过略读）⇒ 不写新格式 skimSessions，只续写旧扁平字段。 */
  const isUntouchedSkimMigration = useCallback(
    () => migratedSkimBaselineRef.current !== null && skimSessions === migratedSkimBaselineRef.current,
    [skimSessions]
  );

  const [viewMode, setViewMode] = useState<ViewMode>('skim');
  const sessionTabInkPositionRef = useRef<SessionTabInkPosition | null>(null);
  const [managedSessionTab, setManagedSessionTab] = useState<ManagedSessionTab | null>(null);
  const [sessionRenameDraft, setSessionRenameDraft] = useState('');
  const [sessionTabDeleting, setSessionTabDeleting] = useState(false);

  // === 问答多会话（阶段三）：与略读三件套平行、命名独立，绝不混进 skimSessions / 文件 hash 存储 ===
  const [tutorSessions, setTutorSessions] = useState<TutorSession[]>([]);
  const [activeTutorIndex, setActiveTutorIndex] = useState(0);
  /** 问答 isChatLoading 上抛，用于标签栏「生成中锁切换」 */
  const [tutorActiveLoading, setTutorActiveLoading] = useState(false);
  /** 始终指向当前激活问答会话 id；所有写入按此 id 定位，绝不用 index 闭包（防跨 session 污染） */
  const activeTutorIdRef = useRef<string | null>(null);
  const activeTutor = tutorSessions[activeTutorIndex] ?? tutorSessions[0];
  activeTutorIdRef.current = activeTutor?.id ?? null;
  /** 按「调用时」激活 id 单段更新（生成中已锁切换，故必落在发起段） */
  const updateActiveTutorSession = useCallback((updater: (s: TutorSession) => TutorSession) => {
    const id = activeTutorIdRef.current;
    if (id == null) return;
    setTutorSessions(prev => prev.map(s => (s.id === id ? updater(s) : s)));
  }, []);
  const setTutorMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
    value => updateActiveTutorSession(s => ({ ...s, messages: typeof value === 'function' ? (value as (p: ChatMessage[]) => ChatMessage[])(s.messages) : value })),
    [updateActiveTutorSession]
  );
  /** 问答会话 id → 该会话对应 PDF 的 dataURL（运行时缓存，**不持久化**；持久化只存 cloudSessionId 轻引用）。
   *  STOP-2 ①：每轮喂 AI 用这份 PDF（vision），与略读 content=pdfDataUrl 完全一致。 */
  const [tutorMaterialMap, setTutorMaterialMap] = useState<Record<string, string>>({});

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null); 
  
  const [docType, setDocType] = useState<DocType>('STEM');

  const [isGalgameMode, setIsGalgameMode] = useState(false);
  const [galgameChatCache, setGalgameChatCache] = useState<ChatCache>({});
  const [isGalgameLoading, setIsGalgameLoading] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [personaSettings, setPersonaSettings] = useState<PersonaSettings>(DEFAULT_PERSONA);

  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isExportingHandout, setIsExportingHandout] = useState(false);
  const [isOpeningStudyFile, setIsOpeningStudyFile] = useState<boolean>(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [fullPdfText, setFullPdfText] = useState<string | null>(null);
  const [pdfPageTexts, setPdfPageTexts] = useState<string[]>([]);
  const [isStudyMapLoading, setIsStudyMapLoading] = useState<boolean>(false);
  
  const [isImmersive, setIsImmersive] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(60);
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  /** 本页注释区域高度占左侧面板的百分比（可拖拽调节），默认 25%，范围 15–65 */
  const [notesPanelHeightPercent, setNotesPanelHeightPercent] = useState(25);
  /** 本页注释区域默认收起，需要记笔记时再展开 */
  const [notesPanelCollapsed, setNotesPanelCollapsed] = useState(true);
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<FileHistoryItem[]>([]);
  const [restoreHash, setRestoreHash] = useState<string | null>(null);

  // --- NEW: CLOUD STATES ---
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [useLocalWorkspace, setUseLocalWorkspace] = useState(() => localStorage.getItem('classskip_workspace_location') === 'local');
  useEffect(() => { localStorage.setItem('classskip_workspace_location', useLocalWorkspace ? 'local' : 'cloud'); }, [useLocalWorkspace]);
  const user: User = useLocalWorkspace ? LOCAL_WORKSPACE_USER : authUser ?? LOCAL_WORKSPACE_USER;
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [studyCloudSessions, setStudyCloudSessions] = useState<CloudSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // === 问答入口/新建（放在 pdfDataUrl + currentSessionId 之后：创建时即捕获「当前文件」的 PDF 与云引用）===
  /** 新建一条问答会话并切过去（满上限 / 生成中则忽略）。
   *  STOP-2：以当前 currentSessionId 作轻引用存进会话；以当前内存 pdfDataUrl 作本会话材料（直接复用，不再存一份）。 */
  const handleAddTutorSession = useCallback(() => {
    if (tutorActiveLoading || tutorSessions.length >= MAX_TUTOR_SESSIONS) return;
    const nextSequence = getNextDefaultSessionSequence(tutorSessions.map(session => normalizeTutorSessionTitle(session.title)), '问答');
    const newSession = createTutorSession(nextSequence, currentSessionId, fileHash);
    const newIndex = tutorSessions.length;
    setTutorSessions(prev => (prev.length >= MAX_TUTOR_SESSIONS ? prev : [...prev, newSession]));
    setActiveTutorIndex(newIndex);
    activeTutorIdRef.current = newSession.id;
    // 直接复用当前已加载 PDF（含未登录场景）；无文件则空串=纯对话
    setTutorMaterialMap(m => ({ ...m, [newSession.id]: pdfDataUrl ?? '' }));
  }, [tutorActiveLoading, tutorSessions, currentSessionId, pdfDataUrl, fileHash]);
  /** 略读配置卡「问答模式」入口：无会话则建一条，进入独立 tutor viewMode */
  const handleStartTutorMode = useCallback(() => {
    if (tutorSessions.length === 0) handleAddTutorSession();
    setViewMode('tutor');
  }, [tutorSessions.length, handleAddTutorSession]);
  /** 恢复路径（刷新/重登）：进入某问答会话且其 PDF 尚未解析 → 凭 cloudSessionId 轻引用重取，
   *  复用略读同款 getUserSessions→fetchFileFromUrl→readFileAsDataURL 通路。仅在 tutor viewMode 下触发。 */
  useEffect(() => {
    if (viewMode !== 'tutor' || !activeTutor) return;
    const id = activeTutor.id;
    if (tutorMaterialMap[id] !== undefined) return; // 已解析（含 '' ）→ 不重复
    let cancelled = false;
    (async () => {
      const ref = activeTutor.cloudSessionId;
      if (ref && user) {
        try {
          const sessions = await getUserSessions(user);
          const s = sessions.find(x => x.id === ref && x.type === 'file' && x.fileUrl);
          if (s?.fileUrl) {
            const file = await fetchFileFromUrl(s.fileUrl, s.fileName);
            const dataUrl = await readFileAsDataURL(file);
            if (!cancelled) setTutorMaterialMap(m => ({ ...m, [id]: dataUrl }));
            return;
          }
        } catch (e) { console.warn('问答材料重取失败，退化为纯对话', e); }
      }
      if (!cancelled) setTutorMaterialMap(m => ({ ...m, [id]: '' })); // 取不到 → 纯对话
    })();
    return () => { cancelled = true; };
  }, [viewMode, activeTutor?.id, activeTutor?.cloudSessionId, tutorMaterialMap, user]);

  // --- 白噪音面板受控（休息改为顶栏下方弹层，不再用独立面板）---
  const [isMusicPanelOpen, setIsMusicPanelOpen] = useState(false);

  // --- 海龟汤 ---
  const [turtleSoupOpen, setTurtleSoupOpen] = useState(false);
  const [turtleSoupState, setTurtleSoupState] = useState<TurtleSoupState | null>(null);

  // --- 复习：Quiz / Flash Card ---
  const [reviewQuizRounds, setReviewQuizRounds] = useState<QuizRound[]>([]);
  const [reviewFlashCards, setReviewFlashCards] = useState<FlashCard[]>([]);
  const [flashCardEstimate, setFlashCardEstimate] = useState<number | undefined>(undefined);
  const [reviewPanel, setReviewPanel] = useState<'quiz' | 'flashcard' | null>(null);

  // --- 页面标记状态 ---
  const [pageMarks, setPageMarks] = useState<PageMarks>({});
  const [isMarkPanelOpen, setIsMarkPanelOpen] = useState(false);

  // --- Study Guide 状态 ---
  const [studyGuide, setStudyGuide] = useState<StudyGuide | null>(null);
  const [studyGuidePanel, setStudyGuidePanel] = useState(false);
  const [quizPracticeKind, setQuizPracticeKind] = useState<'standard' | 'case'>('standard');

  // --- Studio 已生成条目（NotebookLM 式右侧持久化）---
  const [savedArtifacts, setSavedArtifacts] = useState<SavedArtifact[]>([]);
  const [studioExpandedId, setStudioExpandedId] = useState<string | null>(null);
  const [studioCollapsed, setStudioCollapsed] = useState(true);

  // --- 一起复习：多选合并内容与方式选择 ---
  const [combinedReviewContent, setCombinedReviewContent] = useState<string | null>(null);
  const [combinedReviewFileName, setCombinedReviewFileName] = useState<string | null>(null);
  const [combinedReviewFileNames, setCombinedReviewFileNames] = useState<string[] | null>(null);
  const [reviewModeChooserOpen, setReviewModeChooserOpen] = useState(false);
  const [practiceChooserOpen, setPracticeChooserOpen] = useState(false);
  const [isCombinedReviewLoading, setIsCombinedReviewLoading] = useState(false);
  const [examSummaryPanelOpen, setExamSummaryPanelOpen] = useState(false);
  const [reviewPageOpen, setReviewPageOpen] = useState(false);
  const [examSummaryCache, setExamSummaryCache] = useState<Record<string, string>>({});
  const examSummaryContentKey = useMemo(() => {
    const c = combinedReviewContent ?? pdfDataUrl ?? fullPdfText;
    if (!c || typeof c !== 'string' || c.length === 0) return '';
    let h = 0;
    for (let i = 0; i < Math.min(c.length, 30000); i++) h = ((h << 5) - h + c.charCodeAt(i)) | 0;
    return `exam-${h}`;
  }, [combinedReviewContent, pdfDataUrl, fullPdfText]);
  const notesSourceLabel = buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName);
  const notesSourceKey = useMemo(() => reviewSourceKey(combinedReviewContent ?? pdfDataUrl ?? fullPdfText ?? '', notesSourceLabel ?? ''), [combinedReviewContent, pdfDataUrl, fullPdfText, notesSourceLabel]);
  const { warning: reviewCacheWarning, ready: reviewCacheReady } = useReviewCache(user?.uid ?? 'local', (combinedReviewContent || pdfDataUrl || fullPdfText) ? notesSourceKey : '', savedArtifacts, reviewFlashCards, reviewQuizRounds, setSavedArtifacts, setReviewFlashCards, setReviewQuizRounds);
  const sourceReviewArtifacts = useMemo(() => savedArtifacts.filter(a => a.sourceKey ? a.sourceKey === notesSourceKey : a.sourceLabel === notesSourceLabel), [savedArtifacts, notesSourceKey, notesSourceLabel]);
  const sourceStudyGuide = useMemo(() => {
    const saved = [...sourceReviewArtifacts].reverse().find((a): a is Extract<SavedArtifact, { type: 'studyGuide' }> => a.type === 'studyGuide');
    if (saved) return saved.payload;
    if (studyGuide?.sourceKey === notesSourceKey) return studyGuide;
    if (studyGuide && !studyGuide.sourceKey && !combinedReviewFileNames?.length && studyGuide.fileName === (combinedReviewFileName ?? fileName)) return studyGuide;
    return null;
  }, [sourceReviewArtifacts, studyGuide, notesSourceKey, combinedReviewFileNames, combinedReviewFileName, fileName]);
  const reviewingCurrentFile = !combinedReviewContent || (!combinedReviewFileNames?.length && combinedReviewFileName === fileName);
  const sourceReviewCards = reviewFlashCards.filter(c => c.sourceKey ? c.sourceKey === notesSourceKey : reviewingCurrentFile);
  const sourceReviewRounds = reviewQuizRounds.filter(r => r.sourceKey ? r.sourceKey === notesSourceKey : reviewingCurrentFile);
  const sourceMindMap = useMemo(() => {
    const saved = [...sourceReviewArtifacts].reverse().find((a): a is Extract<SavedArtifact, { type: 'mindMap' }> => a.type === 'mindMap');
    if (saved) return saved.payload;
    const tree = notesToTree(sourceStudyGuide);
    return tree ? { tree } : null;
  }, [sourceReviewArtifacts, sourceStudyGuide]);
  const [feynmanPanelOpen, setFeynmanPanelOpen] = useState(false);
  const [examTrapsPanelOpen, setExamTrapsPanelOpen] = useState(false);
  const [terminologyPanelOpen, setTerminologyPanelOpen] = useState(false);
  const [trapListPanelOpen, setTrapListPanelOpen] = useState(false);
  const [trickyProfessorPanelOpen, setTrickyProfessorPanelOpen] = useState(false);
  const [mindMapPanelOpen, setMindMapPanelOpen] = useState(false);
  const [examPredictionPanelOpen, setExamPredictionPanelOpen] = useState(false);
  const [examPredictionInitialKCId, setExamPredictionInitialKCId] = useState<string | null>(null);
  const [examHubOpen, setExamHubOpen] = useState(false);
  const [examHubInitialTab, setExamHubInitialTab] = useState<'exams' | 'daily' | 'flow'>('exams');
  /** P0：主界面 study vs 全屏备考工作台 */
  const [appMode, setAppMode] = useState<'study' | 'examWorkspace'>('study');
  const [selectedExamId, setActiveExamId] = useState<string | null>(null);
  const [reviewWorkspaceMode, setReviewWorkspaceMode] = useState<'home' | 'lecture' | 'exam'>('home');
  const [reviewEntryPickLecture, setReviewEntryPickLecture] = useState(false);
  const [lectureReviewMaterial, setLectureReviewMaterial] = useState<ExamMaterialLink | null>(null);
  const standaloneMaterial = reviewWorkspaceMode === 'lecture' && lectureReviewMaterial?.userId === user?.uid ? lectureReviewMaterial : null;
  // Existing engine keys accept a review scope. Standalone scopes never create an exam.
  const activeExamId = reviewWorkspaceMode === 'lecture' ? standaloneMaterial?.examId ?? null : reviewWorkspaceMode === 'exam' ? selectedExamId : null;
  const currentLectureReviewMaterial = useMemo(() => user && fileName && pdfDataUrl?.startsWith('data:application/pdf')
    ? createLectureReviewMaterial(user.uid, { cloudSessionId: currentSessionId, fileHash, fileName }) : null,
  [user?.uid, currentSessionId, fileHash, fileName, pdfDataUrl]);
  const startLectureReview = (material: ExamMaterialLink) => {
    setLectureReviewMaterial(material);
    setReviewWorkspaceMode('lecture');
    setReviewEntryPickLecture(false);
    setAppMode('examWorkspace');
  };
  /** 避免登录后立即用 null 覆盖掉 localStorage 里已存的 activeExamId */
  const [examWorkspaceStorageReady, setExamWorkspaceStorageReady] = useState<string | null>(null);
  const [lsapContentMap, setLsapContentMap] = useState<LSAPContentMap | null>(null);
  const [lsapState, setLsapState] = useState<LSAPState | null>(null);
  /** M1：备考工作台独立 LSAP（键含 userId+exam+材料，存 localStorage） */
  const [workspaceLsapContentMap, setWorkspaceLsapContentMap] = useState<LSAPContentMap | null>(null);
  const [workspaceLsapState, setWorkspaceLsapState] = useState<LSAPState | null>(null);
  const [workspaceLsapKey, setWorkspaceLsapKey] = useState<string | null>(null);
  const [examWorkspaceMaterials, setExamWorkspaceMaterials] = useState<ExamMaterialLink[]>([]);
  const [workspaceLsapGenerating, setWorkspaceLsapGenerating] = useState(false);
  const workspaceKnowledgeOwnerRef = useRef('');
  const workspaceKnowledgeInFlightRef = useRef(false);
  workspaceKnowledgeOwnerRef.current = `${user?.uid ?? ''}:${activeExamId ?? ''}`;
  /** P1：按材料逐份生成考点图谱时的进度（与 workspaceLsapGenerating 同时置位） */
  const [workspaceLsapProgress, setWorkspaceLsapProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  /** P2：按材料逐份提取逻辑原子时的进度（与 workspaceAtomsGenerating 同时置位） */
  const [workspaceAtomsProgress, setWorkspaceAtomsProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  /** M2：备考工作台逻辑原子覆盖（与 bundle 持久化，独立于考前预测 LSAPState） */
  const [workspaceAtomCoverage, setWorkspaceAtomCoverage] = useState<AtomCoverageByKc>({});
  /** M5：备考台对话留痕（与 bundle 同步） */
  const [workspaceDialogueTranscript, setWorkspaceDialogueTranscript] = useState<WorkspaceDialogueTurn[]>([]);
  /** KC 即时术语侧栏（按 kcId 分组，与 bundle 同步） */
  const [workspaceKcGlossary, setWorkspaceKcGlossary] = useState<Record<string, KcGlossaryEntry[]>>({});
  /** 用户对学习证据的纠正备注与待回访项。 */
  const [workspaceEvidenceAnnotations, setWorkspaceEvidenceAnnotations] = useState<WorkspaceEvidenceAnnotation[]>([]);
  /** 与 bundle 保存同步，避免闭包覆盖旧 state */
  const workspaceLsapStateRef = useRef<LSAPState | null>(null);
  const workspaceAtomCoverageRef = useRef<AtomCoverageByKc>({});
  const workspaceDialogueTranscriptRef = useRef<WorkspaceDialogueTurn[]>([]);
  const workspaceKcGlossaryRef = useRef<Record<string, KcGlossaryEntry[]>>({});
  const workspaceEvidenceAnnotationsRef = useRef<WorkspaceEvidenceAnnotation[]>([]);
  const [workspaceAtomsGenerating, setWorkspaceAtomsGenerating] = useState(false);
  useEffect(() => {
    workspaceLsapStateRef.current = workspaceLsapState;
  }, [workspaceLsapState]);
  useEffect(() => {
    workspaceAtomCoverageRef.current = workspaceAtomCoverage;
  }, [workspaceAtomCoverage]);
  useEffect(() => {
    workspaceDialogueTranscriptRef.current = workspaceDialogueTranscript;
  }, [workspaceDialogueTranscript]);
  useEffect(() => {
    workspaceKcGlossaryRef.current = workspaceKcGlossary;
  }, [workspaceKcGlossary]);
  useEffect(() => {
    workspaceEvidenceAnnotationsRef.current = workspaceEvidenceAnnotations;
  }, [workspaceEvidenceAnnotations]);
  const examWorkspaceMaterialsSorted = useMemo(() => {
    if (standaloneMaterial) return [standaloneMaterial];
    if (!activeExamId) return [];
    return [...examWorkspaceMaterials]
      .filter((m) => m.examId === activeExamId)
      .sort((a, b) => (a.sortIndex ?? a.addedAt) - (b.sortIndex ?? b.addedAt));
  }, [activeExamId, examWorkspaceMaterials, standaloneMaterial]);
  const [multiDocQAPanelOpen, setMultiDocQAPanelOpen] = useState(false);
  const [multiDocQAConversationKey, setMultiDocQAConversationKey] = useState<string | null>(null);
  const multiDocQAInitialMessages = useMemo(() => multiDocQAConversationKey ? loadMultiDocQAMessages(multiDocQAConversationKey) : [], [multiDocQAConversationKey]);
  const [isClassroomMode, setIsClassroomMode] = useState(false);
  const [microphoneSetupOpen, setMicrophoneSetupOpen] = useState(false);
  const [isClassroomPanelVisible, setIsClassroomPanelVisible] = useState(false);
  const [isClassroomPaused, setIsClassroomPaused] = useState(false);
  const [classroomPausedAt, setClassroomPausedAt] = useState<number | null>(null);
  const [classroomPausedDurationMs, setClassroomPausedDurationMs] = useState(0);
  const [currentLecture, setCurrentLecture] = useState<LectureRecord | null>(null);
  const [lectureHistory, setLectureHistory] = useState<LectureRecord[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('lecture_history') || '[]');
      return Array.isArray(stored) ? dedupeLectureHistory(stored) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lecture_history', JSON.stringify(lectureHistory));
    } catch (_) {}
  }, [lectureHistory]);
  const [lectureTranscriptPageOpen, setLectureTranscriptPageOpen] = useState(false);
  const [organizingLectureId, setOrganizingLectureId] = useState<string | null>(null);
  const [transcribingLectureId, setTranscribingLectureId] = useState<string | null>(null);
  const [transcriptLive, setTranscriptLive] = useState('');
  const [lectureRealtimeStatus, setLectureRealtimeStatus] = useState<LectureRealtimeStatus>('idle');
  const [lectureRealtimeMessage, setLectureRealtimeMessage] = useState('');
  const [lectureRealtimeLines, setLectureRealtimeLines] = useState<LectureRealtimeLine[]>([]);
  const [lectureAudioLevel, setLectureAudioLevel] = useState(0);
  const activeLectureIdRef = useRef<string | null>(null);
  const activeLectureMicrophoneDeviceIdRef = useRef<string | undefined>(undefined);
  const lectureRecentTextRef = useRef<string[]>([]);
  const lectureTranslationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lectureEndingRef = useRef(false);
  const transcriptionSupported = useMemo(() => isLectureRecordingSupported(), []);
  useEffect(() => () => {
    activeLectureIdRef.current = null;
    stopElevenLabsRealtimeTranscription();
  }, []);
  useEffect(() => {
    let cancelled = false;
    lectureAudioStorage.recoverInterruptedRecordings()
      .then((recordings) => {
        if (cancelled || recordings.length === 0) return;
        setLectureHistory((previous) => {
          const previousByAudioId = new Map(
            previous.map((lecture) => [lecture.audioRecordingId || lecture.id, lecture])
          );
          const merged = recordings.map((audio) => {
            const existing = previousByAudioId.get(audio.id);
            return existing ? withLectureAudio(existing, audio) : importedAudioLecture(audio);
          });
          const audioIds = new Set(recordings.map((recording) => recording.id));
          return dedupeLectureHistory([
            ...merged,
            ...previous.filter((lecture) => !audioIds.has(lecture.audioRecordingId || lecture.id)),
          ]);
        });
      })
      .catch((error) => console.error('Lecture audio recovery failed:', error));
    return () => {
      cancelled = true;
    };
  }, []);
  const [trapList, setTrapList] = useState<TrapItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('trap_list') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('trap_list', JSON.stringify(trapList));
    } catch (_) {}
  }, [trapList]);

  const [notebookData, setNotebookData] = useState<NotebookData>(() => {
    try { 
      const stored = localStorage.getItem('study_notebook_data');
      return stored ? JSON.parse(stored) : {}; 
    } catch { 
      return {}; 
    }
  });
  
  const [studyTime, setStudyTime] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // --- 番茄钟（与「我学完一段」打通）---
  const [pomodoroSegmentSeconds, setPomodoroSegmentSeconds] = useState<number>(25 * 60);
  const [pomodoroBreakSeconds, setPomodoroBreakSeconds] = useState<number>(5 * 60);
  const [pomodoroPhase, setPomodoroPhase] = useState<'idle' | 'study' | 'break'>('idle');
  const [pomodoroRemainingSeconds, setPomodoroRemainingSeconds] = useState<number>(25 * 60);
  const [completedSegmentsCount, setCompletedSegmentsCount] = useState<number>(0);
  
  const splitterRef = useRef<boolean>(false);
  const notesSplitterRef = useRef<boolean>(false);
  const pageEntryTime = useRef<number>(Date.now());
  const hasEncouragedOnPage = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);
  const pendingNavSegmentRef = useRef<DailySegment | null>(null);
  const applyDailySegRef = useRef<(seg: DailySegment) => void>(() => {});
  const pendingExamPredictionAfterHashRef = useRef<string | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.5);
  const [currentTrackName, setCurrentTrackName] = useState<string | null>(null);
  const [externalVideo, setExternalVideo] = useState<{ type: 'bilibili' | 'youtube', id: string } | null>(null);
  const [isEmbeddedDev, setIsEmbeddedDev] = useState(false);
  const [devBannerDismissed, setDevBannerDismissed] = useState(false);

  // --- EFFECTS ---
  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const embedded = typeof window !== 'undefined' && window.self !== window.top;
    if ((host === 'localhost' || host === '127.0.0.1') && embedded) setIsEmbeddedDev(true);
  }, []);

  useEffect(() => {
    saveLocalProfileNotebook(profileNotebook);
    if (!isCloudUser(user) || !profileCloudReadyRef.current) return;
    const t = window.setTimeout(() => {
      saveCloudProfileNotebook(user, profileNotebook).catch((e) => console.warn('Profile cloud save failed:', e));
    }, 1200);
    return () => window.clearTimeout(t);
  }, [profileNotebook, user]);

  useEffect(() => {
    profileCloudReadyRef.current = false;
    if (!isCloudUser(user)) return;
    let cancelled = false;
    getCloudProfileNotebook(user)
      .then((cloudProfile) => {
        if (cancelled) return;
        if (cloudProfile) {
          setProfileNotebook(cloudProfile);
          saveLocalProfileNotebook(cloudProfile);
        } else {
          saveCloudProfileNotebook(user, profileNotebook).catch(() => {});
        }
      })
      .finally(() => {
        if (!cancelled) profileCloudReadyRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  /** M1：备考工作台材料；关考试中心后重拉以同步新关联 */
  useEffect(() => {
    if (appMode !== 'examWorkspace' || !user || reviewWorkspaceMode !== 'exam') return;
    let current = true;
    listExamMaterialLinks(user).then(items => { if (current) setExamWorkspaceMaterials(items); })
      .catch(() => { if (current) setExamWorkspaceMaterials([]); });
    return () => { current = false; };
  }, [appMode, user, examHubOpen, reviewWorkspaceMode]);

  /** M1：本场 LSAP localStorage 恢复（键随考试+材料变） */
  useEffect(() => {
    if (appMode !== 'examWorkspace' || !user?.uid || !activeExamId) {
      setWorkspaceLsapKey(null);
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
      setWorkspaceEvidenceAnnotations([]);
      return;
    }
    if (examWorkspaceMaterialsSorted.length === 0) {
      setWorkspaceLsapKey(null);
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
      setWorkspaceEvidenceAnnotations([]);
      return;
    }
    const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
    setWorkspaceLsapKey(key);
    const bundle = loadWorkspaceLsapBundle(key);
    if (bundle) {
      setWorkspaceLsapContentMap(bundle.contentMap);
      setWorkspaceLsapState(bundle.state);
      setWorkspaceAtomCoverage(mergeAtomCoverageForMap(bundle.atomCoverage, bundle.contentMap));
      setWorkspaceDialogueTranscript(bundle.dialogueTranscript ?? []);
      setWorkspaceKcGlossary(bundle.kcGlossary ?? {});
      setWorkspaceEvidenceAnnotations(filterEvidenceAnnotationsForMap(bundle.evidenceAnnotations, bundle.contentMap));
    } else {
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
      setWorkspaceEvidenceAnnotations([]);
    }
  }, [appMode, user?.uid, activeExamId, examWorkspaceMaterialsSorted]);
  useEffect(() => { 
    localStorage.setItem('study_notebook_data', JSON.stringify(notebookData)); 
  }, [notebookData]);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    audioRef.current.volume = audioVolume;
    audioRef.current.onerror = (e) => {
      if (!externalVideo) { setIsPlayingAudio(false); alert("无法播放该音频。"); }
    };
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []); 

  useEffect(() => { if (audioRef.current) audioRef.current.volume = audioVolume; }, [audioVolume]);

  useEffect(() => {
    let interval: number | undefined;
    if (isTimerRunning) {
      interval = window.setInterval(() => {
        setStudyTime(prev => prev + 1);
        const timeOnPage = Date.now() - pageEntryTime.current;
        if (timeOnPage > 300000 && !hasEncouragedOnPage.current && slides.length > 0) {
          triggerEncouragement();
        }
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isTimerRunning, slides.length]);

  useEffect(() => {
    if (!activeStudyStartedAt) return;
    const interval = window.setInterval(() => {
      setActiveStudyElapsedMs(Date.now() - activeStudyStartedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeStudyStartedAt]);

  useEffect(() => {
    const draft = activeStudyDraftRef.current;
    if (!draft || draft.awayStartedAt !== null) return;
    const now = Date.now();
    flushActiveStudyPageSegment(now);
    draft.currentPageNumber = slides.length > 0 ? currentIndex + 1 : null;
    draft.pageEnteredAt = now;
  }, [currentIndex, slides.length]);

  useEffect(() => {
    const markAway = () => {
      const draft = activeStudyDraftRef.current;
      if (!draft || draft.awayStartedAt !== null) return;
      const now = Date.now();
      flushActiveStudyPageSegment(now);
      draft.awayStartedAt = now;
    };
    const markReturn = () => {
      const draft = activeStudyDraftRef.current;
      if (!draft || draft.awayStartedAt === null) return;
      const now = Date.now();
      draft.awayEvents.push({
        startedAt: draft.awayStartedAt,
        endedAt: now,
        durationMs: now - draft.awayStartedAt,
      });
      draft.awayStartedAt = null;
      draft.currentPageNumber = slides.length > 0 ? currentIndex + 1 : null;
      draft.pageEnteredAt = now;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') markAway();
      else markReturn();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', markAway);
    window.addEventListener('focus', markReturn);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', markAway);
      window.removeEventListener('focus', markReturn);
    };
  }, [currentIndex, slides.length]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const session = buildWitnessSessionFromDraft('abandoned');
      if (!session) return;
      appendLocalWitnessSession(session);
      clearActiveStudySession();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // --- 番茄钟倒计时 ---
  const pomodoroPhaseRef = useRef(pomodoroPhase);
  pomodoroPhaseRef.current = pomodoroPhase;
  useEffect(() => {
    if (pomodoroPhase !== 'study' && pomodoroPhase !== 'break') return;
    const interval = window.setInterval(() => {
      setPomodoroRemainingSeconds((prev) => {
        if (prev <= 0) {
          const phase = pomodoroPhaseRef.current;
          if (phase === 'study') {
            setCompletedSegmentsCount((c) => c + 1);
            setPomodoroPhase('break');
            return pomodoroBreakSeconds;
          } else {
            setPomodoroPhase('study');
            return pomodoroSegmentSeconds;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pomodoroPhase, pomodoroSegmentSeconds, pomodoroBreakSeconds]);

  // --- 海龟汤：从本地加载 ---
  useEffect(() => {
    const raw = localStorage.getItem('turtleSoupState');
    if (raw) {
      try {
        setTurtleSoupState(JSON.parse(raw));
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (turtleSoupState) localStorage.setItem('turtleSoupState', JSON.stringify(turtleSoupState));
  }, [turtleSoupState]);

  // --- 邮件链接登录回调：用户点击邮件中的链接后会打开本页，在此完成登录 ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const href = window.location.href;
    if (!isEmailLinkSignIn(href)) return;
    const email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      console.warn("[Auth] Email link sign-in: no email in storage");
      return;
    }
    (async () => {
      try {
        await completeEmailLinkSignIn(email, href);
        window.history.replaceState({}, document.title, window.location.pathname || '/');
      } catch (e) {
        console.error("[Auth] Email link sign-in failed:", e);
      }
    })();
  }, []);

  // --- AUTH LISTENER ---
  useEffect(() => {
    storageService.getAllHistory().then(setHistoryItems);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthUser(currentUser);
      if (!currentUser) setUseLocalWorkspace(true);
      if (currentUser) {
          console.log("✅ [App] User Authenticated:", currentUser.uid);
          try {
            const cloudPreferences = await getCloudAppPreferencesWithTimeout(currentUser);
            if (cloudPreferences) {
              setAppLanguage(cloudPreferences.language);
            } else {
              void saveCloudAppPreferences(currentUser, {
                version: 1,
                language: getCurrentAppLanguage(),
                updatedAt: Date.now(),
              }).catch((error) => console.warn('Initial app language cloud save failed.', error));
            }
          } catch (error) {
            console.warn('App language cloud restore failed; keeping the local preference.', error);
          }
      } else {
          console.log("ℹ️ [App] No User Authenticated");
          setCurrentSessionId(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [setAppLanguage]);

  const handleAppLanguageChange = useCallback((language: AppLanguage) => {
    setAppLanguage(language);
    if (!user) return;
    saveCloudAppPreferences(user, { version: 1, language, updatedAt: Date.now() })
      .catch((error) => console.warn('App language cloud save failed; the local preference is still active.', error));
  }, [setAppLanguage, user]);

  const workspaceOwnerRef = useRef(user.uid);
  workspaceOwnerRef.current = user.uid;
  const reloadStudyCloudSessions = useCallback(async () => {
    if (!user) {
      setStudyCloudSessions([]);
      return;
    }
    try {
      const sessions = await getUserSessions(user);
      if (workspaceOwnerRef.current === user.uid) setStudyCloudSessions(sessions);
    } catch (error) {
      console.warn('学习页云端资料列表刷新失败', error);
    }
  }, [user]);

  useEffect(() => {
    reloadStudyCloudSessions();
  }, [reloadStudyCloudSessions]);

  // --- 问答会话持久化（阶段三）：独立于略读 / 文件 hash，按用户全局存取 ---
  // 1) 挂载即从本地 IndexedDB 恢复（仅当内存仍为空，避免覆盖用户已开的会话）
  useEffect(() => {
    if (!fileHash) { setTutorSessions([]); return; }
    storageService.getAllTutorSessions(fileHash)
      .then(local => setTutorSessions(local.map(session => ({ ...session, title: normalizeTutorSessionTitle(session.title) }))))
      .catch(() => {});
  }, [fileHash]);
  // 2) 登录后拉云端，与内存（本地）按 id 合并、云端胜（跨设备恢复）。本地优先显示、云端到达再并入。
  useEffect(() => {
    if (!user) return;
    let active = true;
    getTutorSessionsFromCloud(user)
      .then(cloud => { if (active && cloud.length > 0) setTutorSessions(prev => mergeTutorSessions(prev, cloud)); })
      .catch(() => {});
    return () => { active = false; };
  }, [user?.uid]);
  // 3) 激活会话变化（含新建 / 每次消息更新）→ 防抖写本地 + 云端（各自独立 try/catch，互不阻塞）
  useEffect(() => {
    if (!activeTutor) return;
    const snapshot = activeTutor;
    const t = setTimeout(() => {
      storageService.saveTutorSession(snapshot).catch(() => {});
      if (user) saveTutorSessionToCloud(user, snapshot).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [activeTutor, user]);

  /** P0：备考工作台当前考试 — 登录后从 localStorage 恢复；登出则回到主界面 */
  useEffect(() => {
    setReviewWorkspaceMode('home');
    setLectureReviewMaterial(null);
    setExamWorkspaceMaterials([]);
    if (!user) {
      setAppMode('study');
      setActiveExamId(null);
      setExamWorkspaceStorageReady(null);
      return;
    }
    try {
      const key = `${EXAM_WORKSPACE_ACTIVE_EXAM_LS}_${user.uid}`;
      const v = localStorage.getItem(key);
      setActiveExamId(v && v.length > 0 ? v : null);
    } catch {
      setActiveExamId(null);
    }
    setExamWorkspaceStorageReady(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    if (!user || examWorkspaceStorageReady !== user.uid) return;
    try {
      const key = `${EXAM_WORKSPACE_ACTIVE_EXAM_LS}_${user.uid}`;
      if (selectedExamId) localStorage.setItem(key, selectedExamId);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [selectedExamId, user, examWorkspaceStorageReady]);

  useEffect(() => {
    setCurrentSessionId(null); setTutorSessions([]); setActiveTutorIndex(0); setStudyCloudSessions([]);
    setReviewPageOpen(false); setAppMode('study'); setStorageError('');
    setFileName(null); setFileHash(null); setPdfDataUrl(null); setSlides([]); setFullPdfText('');
    setShellMode('dashboard');
  }, [user.uid]);

  // --- AUTO-SAVE (IndexedDB & Cloud) logic omitted for brevity, same as previous ---
  useEffect(() => {
    if (!fileHash || !fileName) return;
    const saveTimeout = setTimeout(async () => {
      try {
        // 「读旧不毁旧」：仍是迁移产出的同一份内存列表（用户没动过略读）⇒ 这次不写新格式，只续写旧扁平字段。
        const isUntouchedMigration = isUntouchedSkimMigration();
        const item: FileHistoryItem = {
          hash: fileHash,
          name: fileName,
          lastOpened: Date.now(),
          state: {
            explanations,
            chatCache,
            skimMessages,
            annotations,
            notebookData,
            pageComments,
            currentIndex,
            // 问答是独立 viewMode、不属于任何文件：落盘时 'tutor' 归一为 'deep'，避免重开文件误入问答
            viewMode: viewMode === 'tutor' ? 'deep' : viewMode,
            skimTopHeight,
            skimFocusMode,
            studyMap,
            skimStage,
            quizData,
            // 阶段二：新格式多会话列表 + 激活索引。迁移未触碰前不写（保护旧记录）。
            ...(isUntouchedMigration ? {} : { skimSessions, activeSkimIndex }),
            docType,
            galgameBackgroundUrl: customBackgroundUrl,
            customAvatarUrl: customAvatarUrl,
            personaSettings: personaSettings,
            reviewQuizRounds,
            reviewFlashCards,
            flashCardEstimate,
            pageMarks,
            studyGuide,
            savedArtifacts,
            ...(lsapContentMap?.sourceKey === examSummaryContentKey && lsapContentMap && lsapState
              ? { lsapContentMap, lsapState }
              : {})
          }
        };
        await storageService.saveFileState(item);
        setHistoryItems(await storageService.getAllHistory());
      } catch (e) { console.warn('Auto-save failed:', e); }
    }, 2000);
    return () => clearTimeout(saveTimeout);
  }, [fileHash, fileName, explanations, chatCache, skimMessages, annotations, notebookData, pageComments, currentIndex, viewMode, skimTopHeight, skimFocusMode, studyMap, skimStage, quizData, skimSessions, activeSkimIndex, isUntouchedSkimMigration, docType, customBackgroundUrl, customAvatarUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, lsapContentMap, lsapState, examSummaryContentKey]);

  useEffect(() => {
    if (!currentSessionId || !user) return;
    const cloudSaveTimeout = setTimeout(() => {
      updateCloudSessionState(currentSessionId, {
        // 阶段三：把完整 skimSessions + activeSkimIndex 一并写云端（整包覆盖，冲突走「后写覆盖」策略 A）。
        // 「读旧不毁旧」复用本地同一套抑制：迁移未触碰前不写新字段、只续写旧扁平字段，不改写云端旧记录。
        ...(isUntouchedSkimMigration() ? {} : { skimSessions, activeSkimIndex }),
        explanations, chatCache, annotations, notebookData, pageComments, skimMessages, viewMode: viewMode === 'tutor' ? 'deep' : viewMode, studyMap: studyMap ? JSON.parse(JSON.stringify(studyMap)) : null, skimStage, quizData, docType, skimTopHeight, skimFocusMode, currentIndex, customAvatarUrl: customAvatarUrl || undefined, customBackgroundUrl: customBackgroundUrl || undefined, personaSettings: personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, lsapContentMap: lsapContentMap ?? undefined, lsapState: lsapState ?? undefined
      }, true).then(() => setStorageError('')).catch((error) => {
        console.error('资料保存失败', error); setIsSyncing(false);
        setStorageError(isLocalUser(user) ? '本机保存未完成，请检查浏览器存储空间。当前内容仍在页面中。' : '云端保存未完成，请检查网络。当前内容仍在页面中。');
      });
    }, 3000);
    return () => clearTimeout(cloudSaveTimeout);
  }, [currentSessionId, user, explanations, chatCache, annotations, skimMessages, notebookData, pageComments, viewMode, studyMap, skimStage, quizData, skimSessions, activeSkimIndex, isUntouchedSkimMigration, docType, skimTopHeight, skimFocusMode, currentIndex, customAvatarUrl, customBackgroundUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, lsapContentMap, lsapState]);


  const addArtifact = useCallback((artifact: SavedArtifact) => {
    setSavedArtifacts((prev) => [...prev, artifact]);
  }, []);

  const removeArtifact = useCallback((id: string) => {
    setSavedArtifacts((prev) => prev.filter((a) => a.id !== id));
    if (studioExpandedId === id) setStudioExpandedId(null);
  }, [studioExpandedId]);

  // --- HANDLERS ---
  const handleLogin = () => { setLoginModalOpen(true); };
  const handleLogout = async () => { if (window.confirm("确定要退出登录吗？")) await logoutUser(); };

  const commitProfileNotebook = useCallback((next: LearnerProfileNotebook) => {
    setProfileNotebook(normalizeProfileNotebook({ ...next, updatedAt: Date.now() }));
  }, []);

  const flushActiveStudyPageSegment = (at = Date.now()) => {
    const draft = activeStudyDraftRef.current;
    if (!draft || draft.currentPageNumber == null || draft.awayStartedAt !== null) return;
    const durationMs = at - draft.pageEnteredAt;
    if (durationMs <= 0) return;
    draft.pageSegments.push({
      pageNumber: draft.currentPageNumber,
      enteredAt: draft.pageEnteredAt,
      leftAt: at,
      durationMs,
    });
    draft.pageEnteredAt = at;
  };

  const buildWitnessSessionFromDraft = (status: StudyWitnessSession['status']): StudyWitnessSession | null => {
    const draft = activeStudyDraftRef.current;
    if (!draft) return null;
    const endedAt = Date.now();
    if (draft.awayStartedAt !== null) {
      draft.awayEvents.push({
        startedAt: draft.awayStartedAt,
        endedAt,
        durationMs: endedAt - draft.awayStartedAt,
      });
      draft.awayStartedAt = null;
    } else {
      flushActiveStudyPageSegment(endedAt);
    }
    const activeDurationMs = draft.pageSegments.reduce((sum, segment) => sum + segment.durationMs, 0);
    return {
      id: draft.id,
      fileName: draft.fileName,
      fileHash: draft.fileHash,
      cloudSessionId: draft.cloudSessionId,
      startedAt: draft.startedAt,
      endedAt,
      status,
      totalDurationMs: endedAt - draft.startedAt,
      activeDurationMs,
      pageSegments: draft.pageSegments,
      pageSummaries: summarizeWitnessPages(draft.pageSegments),
      awayEvents: draft.awayEvents,
      finalPageNumber: draft.currentPageNumber,
      createdAt: Date.now(),
    };
  };

  const clearActiveStudySession = () => {
    activeStudyDraftRef.current = null;
    setActiveStudyStartedAt(null);
    setActiveStudyElapsedMs(0);
  };

  const persistWitnessSession = async (session: StudyWitnessSession) => {
    appendLocalWitnessSession(session);
    if (user) {
      await saveCloudWitnessSession(user, session);
    }
  };

  const abandonActiveStudySession = async () => {
    const session = buildWitnessSessionFromDraft('abandoned');
    if (!session) return;
    clearActiveStudySession();
    try {
      await persistWitnessSession(session);
    } catch (e) {
      console.warn('Abandoned witness save failed:', e);
    }
  };

  const handleStartStudySession = () => {
    if (!fileName || slides.length === 0) {
      alert('请先打开一份 PDF。');
      return;
    }
    if (activeStudyDraftRef.current) return;
    const now = Date.now();
    activeStudyDraftRef.current = {
      id: `witness-${now}-${Math.random().toString(36).slice(2, 8)}`,
      fileName,
      fileHash,
      cloudSessionId: currentSessionId,
      startedAt: now,
      currentPageNumber: currentIndex + 1,
      pageEnteredAt: now,
      pageSegments: [],
      awayEvents: [],
      awayStartedAt: null,
    };
    setActiveStudyStartedAt(now);
    setActiveStudyElapsedMs(0);
  };

  const handleEndStudySession = async () => {
    const session = buildWitnessSessionFromDraft('completed');
    if (!session) return;
    clearActiveStudySession();
    setSummarySession(session);
    setProfileSuggestion(null);
    setProfileSuggestionDraft(null);
    setProfileSuggestionError(null);
    setIsGeneratingProfileSuggestion(dashboardFeatures.profile);
    try {
      await persistWitnessSession(session);
      if (!dashboardFeatures.profile) return;
      const localRecent = loadLocalWitnessSessions();
      const cloudRecent = user ? await getCloudWitnessSessions(user, 20).catch(() => []) : [];
      const mergedRecent = [session, ...cloudRecent, ...localRecent]
        .filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index)
        .sort((a, b) => b.startedAt - a.startedAt);
      const suggestion = await generateProfileNotebookUpdateSuggestion(profileNotebook, session, mergedRecent);
      setProfileSuggestion(suggestion);
      setProfileSuggestionDraft(suggestion.proposedNotebook);
    } catch (e) {
      console.warn('Profile suggestion generation failed:', e);
      setProfileSuggestionError('AI 画像建议生成失败。录像已经保存，你可以稍后再试。');
    } finally {
      setIsGeneratingProfileSuggestion(false);
    }
  };

  const closeProfileSummaryModal = () => {
    setSummarySession(null);
    setProfileSuggestion(null);
    setProfileSuggestionDraft(null);
    setProfileSuggestionError(null);
    setIsGeneratingProfileSuggestion(false);
  };

  const handleAcceptProfileSuggestion = async () => {
    if (!profileSuggestionDraft) return;
    commitProfileNotebook(profileSuggestionDraft);
    closeProfileSummaryModal();
  };

  const handleSaveProfileSuggestionForLater = async () => {
    if (!profileSuggestion) {
      closeProfileSummaryModal();
      return;
    }
    const suggestionToSave = profileSuggestionDraft
      ? { ...profileSuggestion, proposedNotebook: normalizeProfileNotebook(profileSuggestionDraft) }
      : profileSuggestion;
    appendLocalPendingSuggestion(suggestionToSave);
    if (user) {
      saveCloudPendingSuggestion(user, suggestionToSave).catch(() => {});
    }
    closeProfileSummaryModal();
  };

  const handleOpenHistory = async () => { setHistoryItems(await storageService.getAllHistory()); setIsHistoryOpen(true); };
  const handleDeleteHistory = async (hash: string) => { await storageService.deleteFileState(hash); setHistoryItems(await storageService.getAllHistory()); };
  const handleSelectHistory = (item: FileHistoryItem) => { setRestoreHash(item.hash); setIsHistoryOpen(false); alert(`请重新选择文件 "${item.name}" 以恢复学习进度。`); hiddenFileInputRef.current?.click(); };

  // --- CORE: FILE PROCESSING LOGIC (omitted for brevity, same as previous) ---
  const processFile = async (file: File, restoreData?: Partial<FilePersistedState>, restoredAvatar?: string | null, restoredBg?: string | null) => {
    try {
      // #region agent log
      _debugLog('App.tsx:processFile', 'entry', { type: file.type });
      // #endregion
      const hash = await generateFileHash(file);
      setFileHash(hash);
      let images: string[] = []; let pdfText: string[] = []; let rawPdfData: string | null = null;
      if (file.type === 'application/pdf') { rawPdfData = await readFileAsDataURL(file); setPdfDataUrl(rawPdfData); images = await convertPdfToImages(file); pdfText = await extractPdfText(file); } else if (file.type.startsWith('image/')) { const image = await readFileAsDataURL(file); images = [image]; pdfText = ["Image Upload - No Text Layer"]; rawPdfData = image; setPdfDataUrl(image); }
      // #region agent log
      _debugLog('App.tsx:processFile', 'pdf parse done', { imagesLen: images.length });
      // #endregion
      const newSlides: Slide[] = images.map((img, idx) => ({ id: `slide-${hash}-${idx}`, imageUrl: img, pageNumber: idx + 1 }));
      const fullText = pdfText.join('\n');
      setFileName(file.name); setSlides(newSlides); setFullPdfText(fullText); setPdfPageTexts(pdfText); setStudyTime(0); pageEntryTime.current = Date.now();
      const existingRecord = await storageService.getFileState(hash);
      const stateToRestore = restoreData || (existingRecord ? existingRecord.state : null);
      if (stateToRestore) {
        setExplanations(stateToRestore.explanations || {}); setExplanationErrors({}); setChatCache(stateToRestore.chatCache || {}); setAnnotations(stateToRestore.annotations || {}); if (stateToRestore.notebookData) setNotebookData(stateToRestore.notebookData); setPageComments(stateToRestore.pageComments || {});
        setCurrentIndex(stateToRestore.currentIndex || 0); setViewMode(normalizeRestoredViewMode(stateToRestore.viewMode)); setDocType(stateToRestore.docType || 'STEM');
        // 阶段二：区分新旧格式。无 version 字段，只能靠「skimSessions 是否存在」判断（RECON Q4）。
        if (stateToRestore.skimSessions && stateToRestore.skimSessions.length > 0) {
          // 新格式：直接恢复多段列表 + 激活索引（越界回 0）。补 createEmptySkimSession 默认值，兼容未来新增字段。
          const list: SkimSession[] = stateToRestore.skimSessions.map((s, index) => ({
            ...createEmptySkimSession(index + 1),
            ...s,
            title: s.title?.trim() || `领读 ${index + 1}`,
          }));
          const rawIdx = stateToRestore.activeSkimIndex ?? 0;
          const idx = rawIdx >= 0 && rawIdx < list.length ? rawIdx : 0;
          setSkimSessions(list); setActiveSkimIndex(idx); activeIdRef.current = list[idx].id;
          migratedSkimBaselineRef.current = null; // 新格式，不需抑制
        } else {
          // 旧格式：扁平字段在内存里包成「列表第一段」。**读旧不毁旧**：记下这份列表引用，
          // 保存 effect 据此抑制写新格式，直到用户真正改动略读（见 migratedSkimBaselineRef）。
          const restoredSkimSession: SkimSession = {
            ...createEmptySkimSession(),
            studyMap: stateToRestore.studyMap || null,
            messages: stateToRestore.skimMessages || [],
            stage: stateToRestore.skimStage || 'diagnosis',
            quizData: stateToRestore.quizData || null,
            topHeight: stateToRestore.skimTopHeight || 60,
            focusMode: stateToRestore.skimFocusMode ?? false,
          };
          const migratedList = [restoredSkimSession];
          setSkimSessions(migratedList); setActiveSkimIndex(0); activeIdRef.current = restoredSkimSession.id;
          migratedSkimBaselineRef.current = migratedList;
        }
        setReviewQuizRounds(stateToRestore.reviewQuizRounds || []); setReviewFlashCards(stateToRestore.reviewFlashCards || []); setFlashCardEstimate(stateToRestore.flashCardEstimate);
        setPageMarks(stateToRestore.pageMarks || {});
        setStudyGuide(stateToRestore.studyGuide || null);
        setSavedArtifacts(stateToRestore.savedArtifacts || []);
        setLsapContentMap(stateToRestore.lsapContentMap ?? null); setLsapState(stateToRestore.lsapState ?? null);
        if (restoredAvatar) setCustomAvatarUrl(restoredAvatar); else if (stateToRestore.customAvatarUrl) setCustomAvatarUrl(stateToRestore.customAvatarUrl);
        if (restoredBg) setCustomBackgroundUrl(restoredBg); else if (stateToRestore.galgameBackgroundUrl) setCustomBackgroundUrl(stateToRestore.galgameBackgroundUrl);
        if (stateToRestore.personaSettings) setPersonaSettings(stateToRestore.personaSettings);
      } else {
        setExplanations({}); setExplanationErrors({}); setChatCache({}); setAnnotations({}); setPageComments({}); setCurrentIndex(0); setViewMode('skim'); setDocType('STEM'); setCurrentSessionId(null); setCustomAvatarUrl(null); setCustomBackgroundUrl(null); setPersonaSettings(DEFAULT_PERSONA); setReviewQuizRounds([]); setReviewFlashCards([]); setFlashCardEstimate(undefined); setPageMarks({}); setStudyGuide(null); setSavedArtifacts([]); setLsapContentMap(null); setLsapState(null);
        // 全新文件：领读回到单段空白配置区（非迁移，不抑制保存）。
        const blankSkimSession = { ...createEmptySkimSession(), skipDiagnosis: true };
        setSkimSessions([blankSkimSession]); setActiveSkimIndex(0); activeIdRef.current = blankSkimSession.id;
        migratedSkimBaselineRef.current = null;
      }
      // 后台诊断只写「本次打开时的那一段」（旧格式迁移段），按 id 锁定，绝不串到别段。
      // 新格式（skimSessions 存在）已自带各段 map / skipDiagnosis 状态；全新文件直接进领读配置区。
      const diagTargetSkimId = activeIdRef.current;
      if (stateToRestore && !stateToRestore.skimSessions && !stateToRestore.studyMap) {
        setIsStudyMapLoading(true); const diagnosisContent = rawPdfData || fullText;
        // #region agent log
        _debugLog('App.tsx:processFile', 'before diagnosis (background)', {});
        // #endregion
        const diagnosisPromise = Promise.all([performPreFlightDiagnosis(diagnosisContent, { moduleCount: 4 }), (!existingRecord && !restoreData) ? classifyDocument(diagnosisContent) : Promise.resolve(stateToRestore?.docType || 'STEM')]);
        const timeoutMs = 90000;
        const timeoutPromise = new Promise<[StudyMap | null, DocType]>((resolve) => setTimeout(() => resolve([null, 'STEM']), timeoutMs));
        Promise.race([diagnosisPromise, timeoutPromise])
          .then(([map, type]) => {
            _debugLog('App.tsx:processFile', 'after Promise.all diagnosis', { hasMap: !!map });
            if (map) setSkimSessions(prev => prev.map(s => (s.id === diagTargetSkimId ? { ...s, studyMap: map, studyMapModuleCount: 4 } : s)));
            if (!existingRecord && !restoreData) setDocType(type);
          })
          .catch(() => {})
          .finally(() => setIsStudyMapLoading(false));
      }
      const pendLoc = pendingNavSegmentRef.current;
      if (pendLoc && pendLoc.fileHash === hash) {
        pendingNavSegmentRef.current = null;
        window.setTimeout(() => applyDailySegRef.current(pendLoc), 120);
      }
      const pendPredHash = pendingExamPredictionAfterHashRef.current;
      if (pendPredHash && pendPredHash === hash) {
        pendingExamPredictionAfterHashRef.current = null;
        setExamPredictionInitialKCId(null);
        setExamPredictionPanelOpen(true);
        /* 保持在备考工作台，不跳回主学习界面 */
      }
      // 文档加载后直接进入阅读，本页注释默认收起。
      setNotesPanelCollapsed(true);
    } catch (error) {
      // #region agent log
      _debugLog('App.tsx:processFile', 'catch', { err: String(error) });
      // #endregion
      console.error("Error processing file:", error); alert("文件处理失败，请重试。"); setFileName(null); setIsTimerRunning(false); setIsStudyMapLoading(false); throw error;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setIsProcessingFile(true);
    setIsOpeningStudyFile(true);
    // #region agent log
    _debugLog('App.tsx:handleFileUpload', 'upload started', { fileName: file?.name });
    // #endregion
    try {
      const PROCESS_FILE_TIMEOUT_MS = 120000;
      await Promise.race([
        processFile(file),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('处理超时（120秒），请重试或换一个较小的 PDF。')), PROCESS_FILE_TIMEOUT_MS)),
      ]);
      setShellMode('study');
      setIsOpeningStudyFile(false);
      // #region agent log
      _debugLog('App.tsx:handleFileUpload', 'processFile resolved', {});
      // #endregion
      if (user) { setIsSyncing(true); try { const downloadUrl = await uploadPDF(user, file); const sessionId = await createCloudSession(user, file.name, downloadUrl); setCurrentSessionId(sessionId); await reloadStudyCloudSessions(); } catch (e) { console.error("Cloud Sync Failed:", e); alert(isLocalUser(user) ? "本机保存失败，请检查浏览器存储空间。" : "云端同步失败，请检查网络。"); } finally { setIsSyncing(false); } }
    } catch (e) {
      console.error("Local Processing Failed", e);
      // #region agent log
      _debugLog('App.tsx:handleFileUpload', 'processFile rejected', { err: String(e) });
      // #endregion
      if (String(e).includes('处理超时')) alert(String(e));
    } finally {
      // #region agent log
      _debugLog('App.tsx:handleFileUpload', 'setIsProcessingFile(false)', {});
      // #endregion
      setIsOpeningStudyFile(false);
      setIsProcessingFile(false);
    }
  };

  const handleRestoreCloudSession = async (session: CloudSession, options?: { initialPage?: number }) => {
    if (!user) return;
    const wasInDashboard = shellMode === 'dashboard';
    setIsOpeningStudyFile(true);
    if (wasInDashboard) setShellMode('study');
    setIsProcessingFile(true);
    try {
      if (!session.fileUrl) throw new Error('File URL missing');
      const heavyDetails = await fetchSessionDetails(session.id);
      const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
      const fullData = { ...session, ...heavyDetails };
      const restoreData: Partial<FilePersistedState> = {
        explanations: fullData.explanations,
        chatCache: fullData.chatCache,
        annotations: fullData.annotations,
        notebookData: fullData.notebookData,
        pageComments: fullData.pageComments,
        skimMessages: fullData.skimMessages,
        viewMode: fullData.viewMode,
        studyMap: fullData.studyMap,
        skimStage: fullData.skimStage,
        quizData: fullData.quizData,
        // 阶段三：带上云端多会话列表 + 激活索引，交给 processFile 统一分流（有 ⇒ 多段；无 ⇒ 旧格式迁移成单段并打 baseline）。
        skimSessions: fullData.skimSessions,
        activeSkimIndex: fullData.activeSkimIndex,
        docType: fullData.docType,
        skimTopHeight: fullData.skimTopHeight,
        skimFocusMode: fullData.skimFocusMode,
        currentIndex: options?.initialPage
          ? Math.max(0, Math.trunc(options.initialPage) - 1)
          : fullData.currentIndex,
        personaSettings: fullData.personaSettings,
        reviewQuizRounds: fullData.reviewQuizRounds,
        reviewFlashCards: fullData.reviewFlashCards,
        flashCardEstimate: fullData.flashCardEstimate,
        pageMarks: fullData.pageMarks,
        studyGuide: fullData.studyGuide,
        savedArtifacts: fullData.savedArtifacts,
        lsapContentMap: fullData.lsapContentMap,
        lsapState: fullData.lsapState,
      };
      await processFile(file, restoreData, fullData.customAvatarUrl, fullData.customBackgroundUrl);
      setCurrentSessionId(session.id);
      await reloadStudyCloudSessions();
      setShellMode('study');
      setIsSyncing(true);
      const pendCloud = pendingNavSegmentRef.current;
      if (pendCloud && pendCloud.cloudSessionId === session.id) {
        pendingNavSegmentRef.current = null;
        window.setTimeout(() => applyDailySegRef.current(pendCloud), 120);
      }
    } catch (e) {
      console.error('Restore failed:', e);
      if (wasInDashboard) setShellMode('dashboard');
      alert(isLocalUser(user) ? '无法读取本机资料，请重新添加文件或检查浏览器存储。' : '无法从云端恢复，请重试。');
    } finally {
      setIsOpeningStudyFile(false);
      setIsProcessingFile(false);
    }
  };

  const handleDeleteSession = async (session: CloudSession): Promise<boolean> => {
    if (!window.confirm("确定删除此存档？")) return false; try { await deleteCloudSession(session.id); if (currentSessionId === session.id) { setCurrentSessionId(null); setIsSyncing(false); } return true; } catch (e) { console.error("Delete failed:", e); return false; }
  };

  const handleStartCombinedReview = async (sessions: CloudSession[]) => {
    if (!user || sessions.length < 1) return;
    setIsCombinedReviewLoading(true);
    setCombinedReviewContent(null);
    setCombinedReviewFileName(null);
    try {
      const parts: string[] = [];
      for (const session of sessions) {
        if (!session.fileUrl || session.type !== 'file') continue;
        const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
        const texts = await extractPdfText(file);
        const block = `【${session.fileName}】\n${texts.join('\n')}`;
        parts.push(block);
      }
      const merged = parts.join('\n\n').slice(0, 60000);
      setCombinedReviewContent(merged);
      setCombinedReviewFileName(sessions.length === 1 ? sessions[0].fileName : `多文档合并 (${sessions.length} 个文件)`);
      setPracticeChooserOpen(false);
      setReviewModeChooserOpen(true);
    } catch (e) {
      console.error("Combined review load failed:", e);
      alert("拉取或合并文件失败，请重试。");
    } finally {
      setIsCombinedReviewLoading(false);
    }
  };

  const handleStartReview = async (sessions: CloudSession[] | null, type: ReviewType) => {
    setReviewPageOpen(false);
    if (type === 'trapList') { setTrapListPanelOpen(true); return; }
    if (sessions?.length === 1 && sessions[0].id === currentSessionId && (pdfDataUrl || fullPdfText)) sessions = null;
    if (sessions === null) {
      const content = pdfDataUrl || fullPdfText;
      if (!content) {
        alert('当前没有已打开的文档');
        return;
      }
      setCombinedReviewContent(content);
      setCombinedReviewFileName(fileName || '当前文档');
      setCombinedReviewFileNames(null);
      openReviewPanelByType(type);
      return;
    }
    if (sessions.length < 1) return;
    setIsCombinedReviewLoading(true);
    setCombinedReviewContent(null);
    setCombinedReviewFileName(null);
    setCombinedReviewFileNames(null);
    try {
      const parts: string[] = [];
      const names: string[] = [];
      for (const session of sessions) {
        if (!session.fileUrl || session.type !== 'file') continue;
        const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
        const texts = await extractPdfText(file);
        parts.push(`【${session.fileName}】\n${texts.join('\n')}`);
        names.push(session.fileName);
      }
      const merged = parts.join('\n\n').slice(0, 60000);
      setCombinedReviewContent(merged);
      setCombinedReviewFileName(sessions.length === 1 ? sessions[0].fileName : `多文档合并 (${sessions.length} 个文件)`);
      setCombinedReviewFileNames(names);
      openReviewPanelByType(type);
    } catch (e) {
      console.error("Review load failed:", e);
      alert("拉取或合并文件失败，请重试。");
    } finally {
      setIsCombinedReviewLoading(false);
    }
  };

  const openReviewPanelByType = (type: ReviewType) => {
    switch (type) {
      case 'practice':
        setPracticeChooserOpen(true);
        setReviewModeChooserOpen(true);
        break;
      case 'caseQuiz':
        setQuizPracticeKind('case');
        setReviewPanel('quiz');
        break;
      case 'quiz':
        setQuizPracticeKind('standard');
        setReviewPanel('quiz');
        break;
      case 'flashcard':
        setReviewPanel('flashcard');
        break;
      case 'studyGuide':
        setStudyGuidePanel(true);
        break;
      case 'examSummary':
        setStudyGuidePanel(true);
        break;
      case 'feynman':
        setFeynmanPanelOpen(true);
        break;
      case 'examTraps':
        setStudyGuidePanel(true);
        break;
      case 'terminology':
        setStudyGuidePanel(true);
        break;
      case 'trickyProfessor':
        setQuizPracticeKind('standard');
        setReviewPanel('quiz');
        break;
      case 'trapList':
        setTrapListPanelOpen(true);
        break;
      case 'mindMap':
        setMindMapPanelOpen(true);
        break;
      case 'multiDocQA':
        setMultiDocQAConversationKey(getMultiDocQAConversationKey(combinedReviewFileName ?? '当前文档', combinedReviewFileNames));
        setMultiDocQAPanelOpen(true);
        break;
    }
  };

  const clearCombinedReview = () => {
    setCombinedReviewContent(null);
    setCombinedReviewFileName(null);
    setCombinedReviewFileNames(null);
    setReviewModeChooserOpen(false);
  };

  const applyDailySegmentNavigation = useCallback(
    (seg: DailySegment) => {
      if (!seg.payload?.useLastIndex && seg.pageFrom != null && slides.length > 0) {
        const from = Math.max(0, seg.pageFrom - 1);
        setCurrentIndex(Math.min(slides.length - 1, from));
      }
      setExamPredictionInitialKCId(seg.kcId ?? null);
      switch (seg.kind) {
        case 'slide_review':
          setViewMode('deep');
          window.alert('已打开页面工具：可以点“听讲解”或“整理本页内容”。');
          break;
        case 'lsap_probe':
          setExamPredictionPanelOpen(true);
          if (!seg.kcId) window.alert('已打开考前预测：请先手动选择一个单元进行探测。');
          else window.alert('已打开考前预测：将优先带你做该薄弱考点探测。');
          break;
        case 'flashcard_batch':
          setReviewPanel('flashcard');
          window.alert('已进入闪卡复习：先刷一轮，再标记不熟卡片。');
          break;
        case 'trap_review':
          setTrapListPanelOpen(true);
          window.alert('已打开陷阱清单：先看最近错题，再针对性复习。');
          break;
        case 'feynman_chunk':
          setFeynmanPanelOpen(true);
          window.alert('已进入费曼检验：先尝试口述，再根据反馈补缺。');
          break;
        case 'study_guide_section':
          setStudyGuidePanel(true);
          window.alert('已打开学习指南：先完成一个小节，再回到今日学习选下一块。');
          break;
        default:
          setViewMode('skim');
          window.alert('该任务将打开领读模式；若需其他功能请从「复习」进入');
      }
    },
    [slides.length]
  );

  applyDailySegRef.current = applyDailySegmentNavigation;

  const navigateToSegment = useCallback(
    async (seg: DailySegment) => {
      const sameLocal = !!(seg.fileHash && seg.fileHash === fileHash);
      const sameCloud = !!(seg.cloudSessionId && seg.cloudSessionId === currentSessionId);
      if (sameLocal || sameCloud) {
        applyDailySegmentNavigation(seg);
        return;
      }
      if (seg.cloudSessionId && user) {
        const sessions = await getUserSessions(user);
        const s = sessions.find((x) => x.id === seg.cloudSessionId && x.type === 'file' && x.fileUrl);
        if (s) {
          pendingNavSegmentRef.current = seg;
          await handleRestoreCloudSession(s);
          return;
        }
        window.alert('未找到对应的云端存档或文件不可用');
        return;
      }
      if (seg.fileHash) {
        const item = await storageService.getFileState(seg.fileHash);
        if (!item) {
          window.alert('本地无该文件记录，请上传同一文件或从历史恢复');
          return;
        }
        pendingNavSegmentRef.current = seg;
        window.alert(`请重新选择文件「${item.name}」以继续今日任务`);
        hiddenFileInputRef.current?.click();
        return;
      }
      window.alert('无法定位该学习任务对应的文件');
    },
    [user, fileHash, currentSessionId, applyDailySegmentNavigation]
  );

  const navigateStudyFlowStep = useCallback((step: StudyFlowStep) => {
    if (!dashboardFeatures.energy && (step.action === 'rest' || step.action === 'open_panel' && step.target === 'break')) return;
    if (step.action === 'rest') {
      setDashboardInitialTab('energy');
      setShellMode('dashboard');
      return;
    }
    if (step.action === 'slide_skim') {
      setViewMode(step.target === 'skim' ? 'skim' : 'deep');
      return;
    }
    if (step.action === 'lsap_session') {
      setExamPredictionInitialKCId(null);
      setExamPredictionPanelOpen(true);
      return;
    }
    if (step.action === 'open_panel') {
      switch (step.target) {
        case 'studyGuide':
          setStudyGuidePanel(true);
          break;
        case 'examSummary':
          setStudyGuidePanel(true);
          break;
        case 'feynman':
          setFeynmanPanelOpen(true);
          break;
        case 'terminology':
          setStudyGuidePanel(true);
          break;
        case 'trapList':
          setTrapListPanelOpen(true);
          break;
        case 'flashcard':
          setReviewPanel('flashcard');
          break;
        case 'mindMap':
          setMindMapPanelOpen(true);
          break;
        case 'break':
          setDashboardInitialTab('energy');
          setShellMode('dashboard');
          break;
        case 'examPrediction':
          setExamPredictionInitialKCId(null);
          setExamPredictionPanelOpen(true);
          break;
        case 'trickyProfessor':
          setQuizPracticeKind('standard'); setReviewPanel('quiz');
          break;
        case 'quiz':
          setReviewPanel('quiz');
          break;
        default:
          window.alert(`「${String(step.target)}」暂未接入导航`);
      }
    }
  }, []);

  const openReviewToolFromExamHub = useCallback((tool: 'examPrediction' | 'examSummary' | 'examTraps' | 'feynman' | 'flashcard' | 'quiz') => {
    switch (tool) {
      case 'examPrediction':
        setExamPredictionInitialKCId(null);
        setExamPredictionPanelOpen(true);
        break;
      case 'examSummary':
        setStudyGuidePanel(true);
        break;
      case 'examTraps':
        setStudyGuidePanel(true);
        break;
      case 'feynman':
        setFeynmanPanelOpen(true);
        break;
      case 'flashcard':
        setReviewPanel('flashcard');
        break;
      case 'quiz':
        setReviewPanel('quiz');
        break;
      default:
        break;
    }
  }, []);

  /**
   * 单条考试材料 → 全文串（与合并函数内单 link 逻辑一致，避免重复实现漂移）。
   * 空串表示该条无法解析出文本（云端无 URL、本地无 studyGuide 等）。
   */
  const getDocContentForExamLink = useCallback(
    async (link: ExamMaterialLink, sessionMap: Map<string, CloudSession>): Promise<string> => {
      try {
        if (link.sourceType === 'sessionId' && link.cloudSessionId) {
          const s = sessionMap.get(link.cloudSessionId);
          if (!s?.fileUrl) return '';
          const file = await fetchFileFromUrl(s.fileUrl, s.fileName || link.fileName || '云端文件.pdf');
          const text = (await extractPdfText(file)).join('\n').trim();
          if (!text) return '';
          return `【${link.fileName || s.fileName || '材料'}】\n${text}`;
        }
        if (link.sourceType === 'fileHash' && link.fileHash) {
          if (fileHash === link.fileHash && fullPdfText?.trim()) {
            return `【${link.fileName || fileName || '当前文件'}】\n${fullPdfText}`;
          }
          const localState = await storageService.getFileState(link.fileHash);
          const fallbackText = localState?.state?.studyGuide?.content;
          if (fallbackText?.trim()) {
            return `【${link.fileName || localState.name || '本地材料'}】\n${fallbackText}`;
          }
        }
      } catch (e) {
        console.warn('getDocContentForExamLink: skip one link', e);
      }
      return '';
    },
    [fileHash, fullPdfText, fileName]
  );

  /**
   * P0：备考台讲义预览 — 单条材料 → 原始 PDF File（与 getDocContentForExamLink 同源路径）。
   * 本地 fileHash 仅当与当前主界面打开文件一致且 pdfDataUrl 为 PDF 时可解析；否则返回 null（需先在主界面打开该 PDF）。
   */
  const resolveExamMaterialPdf = useCallback(
    async (link: ExamMaterialLink): Promise<File | null> => {
      if (!user) return null;
      try {
        if (link.cloudSessionId && link.cloudSessionId === currentSessionId && pdfDataUrl?.startsWith('data:application/pdf')) {
          const response = await fetch(pdfDataUrl);
          return new File([await response.blob()], link.fileName || '讲义.pdf', { type: 'application/pdf' });
        }
        if (link.sourceType === 'sessionId' && link.cloudSessionId) {
          const sessions = await getUserSessions(user);
          const s = sessions.find((x) => x.id === link.cloudSessionId);
          if (!s?.fileUrl) return null;
          return await fetchFileFromUrl(s.fileUrl, s.fileName || link.fileName || '云端材料.pdf');
        }
        if (link.sourceType === 'fileHash' && link.fileHash) {
          if (fileHash === link.fileHash && pdfDataUrl?.startsWith('data:application/pdf')) {
            const res = await fetch(pdfDataUrl);
            const blob = await res.blob();
            return new File([blob], link.fileName || fileName || '材料.pdf', { type: 'application/pdf' });
          }
          // TODO：若日后在 IndexedDB 持久化 PDF 二进制，可在此按 fileHash 取回 File，无需「当前打开」限制。
          return null;
        }
      } catch (e) {
        console.warn('resolveExamMaterialPdf', e);
      }
      return null;
    },
    [user, fileHash, pdfDataUrl, fileName, currentSessionId]
  );

  /** P2：备考工作台合并讲义（与保温流同一套逻辑与长度截断）；用于合并预览、逻辑原子整包等 */
  const getMergedDocContentForExamLinks = useCallback(
    async (links: ExamMaterialLink[]) => {
      const sessionIds = Array.from(
        new Set(links.filter((x) => x.sourceType === 'sessionId' && x.cloudSessionId).map((x) => x.cloudSessionId!))
      );
      const sessions = sessionIds.length > 0 && user ? await getUserSessions(user) : [];
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));

      const blocks: string[] = [];
      for (const link of links) {
        const t = await getDocContentForExamLink(link, sessionMap);
        if (t.trim()) blocks.push(t);
      }
      return blocks.join('\n\n-----\n\n').slice(0, 60000);
    },
    [user, getDocContentForExamLink]
  );

  /**
   * 结业探测：按材料 linkId 拉取**单份**讲义全文（与合并逻辑同源 `getDocContentForExamLink`），供出题/阅卷约束材料边界。
   */
  const loadExamWorkspaceMaterialTextForProbe = useCallback(
    async (linkId: string): Promise<string | null> => {
      const link = examWorkspaceMaterialsSorted.find((x) => x.id === linkId);
      if (!link) return null;
      const sessionIds = Array.from(
        new Set(
          examWorkspaceMaterialsSorted
            .filter((x) => x.sourceType === 'sessionId' && x.cloudSessionId)
            .map((x) => x.cloudSessionId!)
        )
      );
      const sessions = sessionIds.length > 0 && user ? await getUserSessions(user) : [];
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));
      const text = await getDocContentForExamLink(link, sessionMap);
      if (!text.trim()) return null;
      return text;
    },
    [user, examWorkspaceMaterialsSorted, getDocContentForExamLink]
  );

  const buildMaintenanceMergedContent = getMergedDocContentForExamLinks;

  const workspacePredictedScore = useMemo(() => {
    if (!workspaceLsapContentMap || !workspaceLsapState) return null;
    return computePredictedScore(workspaceLsapContentMap, workspaceLsapState.bktState);
  }, [workspaceLsapContentMap, workspaceLsapState]);

  /** Run the existing KC and atom extractors in order, saving each completed stage. */
  const handlePrepareLectureKnowledge = useCallback(async (options: PrepareLectureKnowledgeOptions) => {
    const material = examWorkspaceMaterialsSorted.find(item => item.id === options.materialId);
    if (!user?.uid || !activeExamId || !material) throw new Error('请先选择要复习的讲义。');
    if (workspaceKnowledgeInFlightRef.current || workspaceLsapGenerating || workspaceAtomsGenerating) return;
    workspaceKnowledgeInFlightRef.current = true;
    const owner = workspaceKnowledgeOwnerRef.current;
    const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
    let map = workspaceLsapContentMap;
    const needsConcepts = options.restart || !map?.kcs.some(kc => kc.sourceLinkId === material.id);
    const persistStage = (next: LSAPContentMap) => {
      next.sourceKey = key;
      const existingState = workspaceLsapStateRef.current;
      const state: LSAPState = existingState ? { ...existingState, contentMapId: next.id } : {
        contentMapId: next.id, bktState: {}, probeHistory: [], lastPredictedScore: 0, lastUpdated: Date.now(),
      };
      // Earlier estimates, coverage and conversations remain historical records.
      const atomCoverage = { ...workspaceAtomCoverageRef.current, ...mergeAtomCoverageForMap(workspaceAtomCoverageRef.current, next) };
      saveWorkspaceLsapBundle(key, {
        contentMap: next, state, atomCoverage,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations: workspaceEvidenceAnnotationsRef.current,
        dialogueUpdatedAt: Date.now(), savedAt: Date.now(),
      });
      setWorkspaceLsapContentMap(next);
      workspaceLsapStateRef.current = state;
      setWorkspaceLsapState(state);
      workspaceAtomCoverageRef.current = atomCoverage;
      setWorkspaceAtomCoverage(atomCoverage);
      setWorkspaceLsapKey(key);
    };
    const api = {
      concepts: (source: string) => generateLSAPContentMap(source, { mode: 'workspaceChunk' }),
      atoms: (source: string, subset: LSAPContentMap) => generateLogicAtomsForContentMap(source, subset, {
        maxDocChars: source.length, perMaterial: true, preserveExistingAtoms: true,
      }),
    };
    let stage: 'kc' | 'atoms' = needsConcepts ? 'kc' : 'atoms';
    try {
      if (needsConcepts) {
        setWorkspaceLsapGenerating(true);
        setWorkspaceLsapProgress(null);
        map = await prepareLectureKnowledge(map, material, options.pageTexts, 'kc', api,
          (current, total) => setWorkspaceLsapProgress({ current, total, fileName: material.fileName }));
        if (workspaceKnowledgeOwnerRef.current !== owner) return;
        persistStage(map);
      }
      stage = 'atoms';
      setWorkspaceAtomsGenerating(true);
      setWorkspaceLsapGenerating(false);
      setWorkspaceLsapProgress(null);
      // Use the returned map directly: React's state update may not have rendered yet.
      map = await prepareLectureKnowledge(map, material, options.pageTexts, 'atoms', api,
        (current, total) => setWorkspaceAtomsProgress({ current, total, fileName: material.fileName }));
      if (workspaceKnowledgeOwnerRef.current !== owner) return;
      persistStage(map);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '请求未完成。';
      throw new Error(stage === 'atoms'
        ? `知识点已保留，具体要点与原文依据尚未整理完成。点击“继续提取知识点”可接着完成，无需重做前一步。${detail}`
        : detail);
    } finally {
      workspaceKnowledgeInFlightRef.current = false;
      setWorkspaceLsapGenerating(false);
      setWorkspaceAtomsGenerating(false);
      setWorkspaceLsapProgress(null);
      setWorkspaceAtomsProgress(null);
    }
  }, [user, activeExamId, examWorkspaceMaterialsSorted, workspaceLsapContentMap, workspaceLsapGenerating, workspaceAtomsGenerating]);

  const handleGenerateWorkspaceLsap = useCallback(async () => {
    if (!user?.uid || !activeExamId || examWorkspaceMaterialsSorted.length === 0) {
      window.alert('请先选择考试并关联材料。');
      return;
    }
    setWorkspaceLsapGenerating(true);
    setWorkspaceLsapProgress(null);
    const sessionIds = Array.from(
      new Set(
        examWorkspaceMaterialsSorted
          .filter((x) => x.sourceType === 'sessionId' && x.cloudSessionId)
          .map((x) => x.cloudSessionId!)
      )
    );
    let sessionMap = new Map<string, CloudSession>();
    try {
      const sessions = sessionIds.length > 0 && user ? await getUserSessions(user) : [];
      sessionMap = new Map(sessions.map((s) => [s.id, s]));
    } catch (e) {
      console.warn('handleGenerateWorkspaceLsap: getUserSessions', e);
    }

    const total = examWorkspaceMaterialsSorted.length;
    const mergedKcs: LSAPKnowledgeComponent[] = [];
    let skippedEmpty = 0;
    let skippedFail = 0;

    try {
      for (let i = 0; i < examWorkspaceMaterialsSorted.length; i++) {
        const link = examWorkspaceMaterialsSorted[i];
        const displayName = link.fileName?.trim() || '未命名材料';
        setWorkspaceLsapProgress({ current: i + 1, total, fileName: displayName });

        const text = await getDocContentForExamLink(link, sessionMap);
        if (!text.trim()) {
          skippedEmpty++;
          console.warn(`[P1 LSAP] skip empty material link ${link.id}`);
          continue;
        }
        const partMap = await generateLSAPContentMap(text, { mode: 'workspaceChunk' });
        if (!partMap?.kcs?.length) {
          skippedFail++;
          console.warn(`[P1 LSAP] generateLSAPContentMap returned empty for link ${link.id}`);
          continue;
        }
        const matKey = link.id;
        for (const kc of partMap.kcs) {
          mergedKcs.push({
            ...kc,
            id: `${matKey}__${kc.id}`,
            sourceLinkId: link.id,
            sourceFileName: displayName,
          });
        }
      }

      if (mergedKcs.length === 0) {
        const parts = ['未能生成任何考点。'];
        if (skippedEmpty) parts.push(`${skippedEmpty} 份材料无可用文本（请检查本地是否打开过 PDF / 云端是否可拉取）。`);
        if (skippedFail) parts.push(`${skippedFail} 份材料生成失败。`);
        window.alert(parts.join(' '));
        return;
      }

      const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
      const map: LSAPContentMap = {
        id: `content-map-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        sourceKey: key,
        kcs: mergedKcs,
        createdAt: Date.now(),
      };
      const initialBkt: LSAPBKTState = {};
      map.kcs.forEach((k) => {
        initialBkt[k.id] = 0;
      });
      const state: LSAPState = {
        contentMapId: map.id,
        bktState: initialBkt,
        probeHistory: [],
        lastPredictedScore: 0,
        lastUpdated: Date.now(),
      };
      setWorkspaceLsapContentMap(map);
      setWorkspaceLsapState(state);
      setWorkspaceLsapKey(key);
      const atomCoverage = mergeAtomCoverageForMap(undefined, map);
      setWorkspaceAtomCoverage(atomCoverage);
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
      setWorkspaceEvidenceAnnotations([]);
      saveWorkspaceLsapBundle(key, {
        contentMap: map,
        state,
        atomCoverage,
        dialogueTranscript: [],
        kcGlossary: {},
        evidenceAnnotations: [],
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
    } finally {
      setWorkspaceLsapGenerating(false);
      setWorkspaceLsapProgress(null);
    }
  }, [user, activeExamId, examWorkspaceMaterialsSorted, getDocContentForExamLink]);

  /**
   * M2 / P2：逻辑原子。
   * - 若全部 KC 无 `sourceLinkId`（旧 bundle）：回退为整包 merged 一次调用（与改动前一致，`maxDocChars: 60000` 对齐合并串上限）。
   * - 否则：按 `examWorkspaceMaterialsSorted` 循环，每份 `getDocContentForExamLink` + 仅含该 `sourceLinkId` 的 KC 子集调用模型；
   *   无 `sourceLinkId` 的 KC 另用「整包 merged」抽一次（子集），再按 `kc.id` 拼回。
   * 某份失败则跳过并继续；若全部失败则 alert。未返回 atoms 的 KC 保留原 atoms（若有）。
   */
  const handleExtractLogicAtoms = useCallback(async (options?: { preserveExistingAtoms?: boolean }) => {
    if (!user?.uid || !activeExamId || !workspaceLsapContentMap?.kcs?.length) {
      window.alert('请先生成本场考点图谱。');
      return;
    }
    if (examWorkspaceMaterialsSorted.length === 0) {
      window.alert('请先关联材料。');
      return;
    }
    if (!workspaceLsapState) {
      window.alert('本场 LSAP 状态缺失，请重新生成本场考点图谱。');
      return;
    }
    const kcs = workspaceLsapContentMap.kcs;
    const withSource = kcs.filter((k) => k.sourceLinkId);
    const withoutSource = kcs.filter((k) => !k.sourceLinkId);

    setWorkspaceAtomsGenerating(true);
    setWorkspaceAtomsProgress(null);

    const runLegacyFallback = async () => {
      const merged = await getMergedDocContentForExamLinks(examWorkspaceMaterialsSorted);
      if (!merged.trim()) {
        window.alert('合并材料为空，请先在主界面打开过本地 PDF，或检查云端文件。');
        return false;
      }
      setWorkspaceAtomsProgress({ current: 1, total: 1, fileName: '整包合并讲义（旧版考点图谱）' });
      const newMap = await generateLogicAtomsForContentMap(merged, workspaceLsapContentMap, {
        maxDocChars: 60000,
        preserveExistingAtoms: options?.preserveExistingAtoms,
      });
      if (!newMap) {
        window.alert('提取逻辑原子失败，请重试。');
        return false;
      }
      const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
      const atomCoverage = mergeAtomCoverageForMap(workspaceAtomCoverage, newMap);
      const evidenceAnnotations = filterEvidenceAnnotationsForMap(workspaceEvidenceAnnotationsRef.current, newMap);
      setWorkspaceLsapContentMap(newMap);
      setWorkspaceAtomCoverage(atomCoverage);
      workspaceEvidenceAnnotationsRef.current = evidenceAnnotations;
      setWorkspaceEvidenceAnnotations(evidenceAnnotations);
      saveWorkspaceLsapBundle(key, {
        contentMap: newMap,
        state: workspaceLsapStateRef.current ?? workspaceLsapState,
        atomCoverage,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations,
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
      return true;
    };

    try {
      if (withSource.length === 0) {
        await runLegacyFallback();
        return;
      }

      const sessionIds = Array.from(
        new Set(
          examWorkspaceMaterialsSorted
            .filter((x) => x.sourceType === 'sessionId' && x.cloudSessionId)
            .map((x) => x.cloudSessionId!)
        )
      );
      let sessionMap = new Map<string, CloudSession>();
      try {
        const sessions = sessionIds.length > 0 && user ? await getUserSessions(user) : [];
        sessionMap = new Map(sessions.map((s) => [s.id, s]));
      } catch (e) {
        console.warn('handleExtractLogicAtoms: getUserSessions', e);
      }

      type AtomStep = { kind: 'link'; link: (typeof examWorkspaceMaterialsSorted)[number] } | { kind: 'orphan' };
      const steps: AtomStep[] = [];
      for (const link of examWorkspaceMaterialsSorted) {
        if (kcs.some((kc) => kc.sourceLinkId === link.id)) {
          steps.push({ kind: 'link', link });
        }
      }
      if (withoutSource.length > 0) {
        steps.push({ kind: 'orphan' });
      }

      if (steps.length === 0) {
        window.alert('无法将考点与关联材料匹配，请重新生成本场考点图谱。');
        return;
      }

      const resultMap = JSON.parse(JSON.stringify(workspaceLsapContentMap)) as LSAPContentMap;
      let skippedEmpty = 0;
      let skippedFail = 0;
      let anySuccess = false;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const displayName =
          step.kind === 'link'
            ? step.link.fileName?.trim() || '未命名材料'
            : '合并讲义（无材料归属的考点）';
        setWorkspaceAtomsProgress({ current: i + 1, total: steps.length, fileName: displayName });

        if (step.kind === 'link') {
          const link = step.link;
          const subset = kcs.filter((kc) => kc.sourceLinkId === link.id);
          if (subset.length === 0) continue;

          const text = await getDocContentForExamLink(link, sessionMap);
          if (!text.trim()) {
            skippedEmpty++;
            console.warn(`[P2 atoms] skip empty text for link ${link.id}`);
            continue;
          }

          const partialMap: LSAPContentMap = {
            id: resultMap.id,
            sourceKey: resultMap.sourceKey,
            createdAt: resultMap.createdAt,
            kcs: subset,
          };

          const newPartial = await generateLogicAtomsForContentMap(text, partialMap, {
            maxDocChars: LSAP_ATOMS_PER_MATERIAL_MAX_CHARS,
            perMaterial: true,
            preserveExistingAtoms: options?.preserveExistingAtoms,
          });
          if (!newPartial) {
            skippedFail++;
            console.warn(`[P2 atoms] generateLogicAtomsForContentMap null for link ${link.id}`);
            continue;
          }
          anySuccess = true;
          for (const kc of newPartial.kcs) {
            const target = resultMap.kcs.find((x) => x.id === kc.id);
            if (target) {
              target.atoms = kc.atoms;
              target.conceptZh = kc.conceptZh;
              target.definitionZh = kc.definitionZh;
            }
          }
        } else {
          const merged = await getMergedDocContentForExamLinks(examWorkspaceMaterialsSorted);
          if (!merged.trim()) {
            skippedEmpty++;
            continue;
          }
          const partialMap: LSAPContentMap = {
            id: resultMap.id,
            sourceKey: resultMap.sourceKey,
            createdAt: resultMap.createdAt,
            kcs: withoutSource,
          };
          const newPartial = await generateLogicAtomsForContentMap(merged, partialMap, {
            maxDocChars: 60000,
            preserveExistingAtoms: options?.preserveExistingAtoms,
          });
          if (!newPartial) {
            skippedFail++;
            continue;
          }
          anySuccess = true;
          for (const kc of newPartial.kcs) {
            const target = resultMap.kcs.find((x) => x.id === kc.id);
            if (target) {
              target.atoms = kc.atoms;
              target.conceptZh = kc.conceptZh;
              target.definitionZh = kc.definitionZh;
            }
          }
        }
      }

      if (!anySuccess) {
        const parts = ['未能为任何考点生成逻辑原子。'];
        if (skippedEmpty) parts.push(`${skippedEmpty} 步材料无可用文本。`);
        if (skippedFail) parts.push(`${skippedFail} 步模型调用失败。`);
        window.alert(parts.join(' '));
        return;
      }

      const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
      const atomCoverage = mergeAtomCoverageForMap(workspaceAtomCoverage, resultMap);
      const evidenceAnnotations = filterEvidenceAnnotationsForMap(workspaceEvidenceAnnotationsRef.current, resultMap);
      setWorkspaceLsapContentMap(resultMap);
      setWorkspaceAtomCoverage(atomCoverage);
      workspaceEvidenceAnnotationsRef.current = evidenceAnnotations;
      setWorkspaceEvidenceAnnotations(evidenceAnnotations);
      saveWorkspaceLsapBundle(key, {
        contentMap: resultMap,
        state: workspaceLsapStateRef.current ?? workspaceLsapState,
        atomCoverage,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations,
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
    } finally {
      setWorkspaceAtomsGenerating(false);
      setWorkspaceAtomsProgress(null);
    }
  }, [
    user,
    activeExamId,
    workspaceLsapContentMap,
    workspaceLsapState,
    workspaceAtomCoverage,
    examWorkspaceMaterialsSorted,
    getMergedDocContentForExamLinks,
    getDocContentForExamLink,
  ]);

  /** M3：对话中更新原子覆盖并持久化 bundle */
  const handleWorkspaceAtomCoverageChange = useCallback(
    (next: AtomCoverageByKc) => {
      setWorkspaceAtomCoverage(next);
      if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap || !workspaceLsapStateRef.current) return;
      saveWorkspaceLsapBundle(workspaceLsapKey, {
        contentMap: workspaceLsapContentMap,
        state: workspaceLsapStateRef.current,
        atomCoverage: next,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations: workspaceEvidenceAnnotationsRef.current,
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
    },
    [user?.uid, workspaceLsapKey, workspaceLsapContentMap]
  );

  /** M4：结业探测后更新 LSAPState + bundle（与 atomCoverage 最新值一致） */
  const commitWorkspaceLsapState = useCallback(
    (next: LSAPState) => {
      setWorkspaceLsapState(next);
      if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap) return;
      saveWorkspaceLsapBundle(workspaceLsapKey, {
        contentMap: workspaceLsapContentMap,
        state: next,
        atomCoverage: workspaceAtomCoverageRef.current,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations: workspaceEvidenceAnnotationsRef.current,
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
    },
    [user?.uid, workspaceLsapKey, workspaceLsapContentMap]
  );

  /** M5：对话留痕合并（按 chatSessionKey 分段）并持久化 */
  const handleWorkspaceDialogueTranscriptChange = useCallback(
    (turns: WorkspaceDialogueTurn[], chatSessionKey: string) => {
      setWorkspaceDialogueTranscript((prev) => {
        const filtered = prev.filter((t) => t.sessionKey !== chatSessionKey);
        const marked = turns.map((t) => ({ ...t, sessionKey: chatSessionKey }));
        const next = truncateWorkspaceDialogue([...filtered, ...marked]);
        queueMicrotask(() => {
          if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap || !workspaceLsapStateRef.current) return;
          saveWorkspaceLsapBundle(workspaceLsapKey, {
            contentMap: workspaceLsapContentMap,
            state: workspaceLsapStateRef.current,
            atomCoverage: workspaceAtomCoverageRef.current,
            dialogueTranscript: next,
            kcGlossary: workspaceKcGlossaryRef.current,
            evidenceAnnotations: workspaceEvidenceAnnotationsRef.current,
            dialogueUpdatedAt: Date.now(),
            savedAt: Date.now(),
          });
        });
        return next;
      });
    },
    [user?.uid, workspaceLsapKey, workspaceLsapContentMap]
  );

  /** 用户证据备注与待回访队列；不改动原子覆盖和理解等级。 */
  const handleWorkspaceEvidenceAnnotationsChange = useCallback(
    (next: WorkspaceEvidenceAnnotation[]) => {
      workspaceEvidenceAnnotationsRef.current = next;
      setWorkspaceEvidenceAnnotations(next);
      if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap || !workspaceLsapStateRef.current) return;
      saveWorkspaceLsapBundle(workspaceLsapKey, {
        contentMap: workspaceLsapContentMap,
        state: workspaceLsapStateRef.current,
        atomCoverage: workspaceAtomCoverageRef.current,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
        evidenceAnnotations: next,
        dialogueUpdatedAt: Date.now(),
        savedAt: Date.now(),
      });
    },
    [user?.uid, workspaceLsapKey, workspaceLsapContentMap]
  );

  /** KC 即时术语：合并去重并写入 bundle */
  const handleWorkspaceGlossaryAppend = useCallback(
    (entries: KcGlossaryEntry[]) => {
      if (!entries.length) return;
      setWorkspaceKcGlossary((prev) => {
        const next: Record<string, KcGlossaryEntry[]> = { ...prev };
        for (const e of entries) {
          const list = [...(next[e.kcId] ?? [])];
          const nk = normalizeTermKey(e.term);
          if (list.some((x) => normalizeTermKey(x.term) === nk)) continue;
          list.push(e);
          next[e.kcId] = list;
        }
        workspaceKcGlossaryRef.current = next;
        queueMicrotask(() => {
          if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap || !workspaceLsapStateRef.current) return;
          saveWorkspaceLsapBundle(workspaceLsapKey, {
            contentMap: workspaceLsapContentMap,
            state: workspaceLsapStateRef.current,
            atomCoverage: workspaceAtomCoverageRef.current,
            dialogueTranscript: workspaceDialogueTranscriptRef.current,
            kcGlossary: workspaceKcGlossaryRef.current,
            evidenceAnnotations: workspaceEvidenceAnnotationsRef.current,
            dialogueUpdatedAt: Date.now(),
            savedAt: Date.now(),
          });
        });
        return next;
      });
    },
    [user?.uid, workspaceLsapKey, workspaceLsapContentMap]
  );

  /** P0：备考工作台 → 考前预测（单材料：优先第一份 fileHash，否则第一份云端 session） */
  const handleWorkspaceEnterPrediction = async (links: ExamMaterialLink[]) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    const sorted = [...links].sort((a, b) => (a.sortIndex ?? a.addedAt) - (b.sortIndex ?? b.addedAt));
    const firstFile = sorted.find((l) => l.sourceType === 'fileHash' && l.fileHash);
    if (firstFile) {
      const hasContent = !!(fullPdfText?.trim() || pdfDataUrl);
      if (fileHash === firstFile.fileHash && hasContent) {
        setExamPredictionInitialKCId(null);
        setExamPredictionPanelOpen(true);
        return;
      }
      pendingExamPredictionAfterHashRef.current = firstFile.fileHash;
      window.alert(`请选择本地文件「${firstFile.fileName}」以加载与考试关联的 PDF，随后将打开考前预测。`);
      hiddenFileInputRef.current?.click();
      return;
    }
    const firstSession = sorted.find((l) => l.sourceType === 'sessionId' && l.cloudSessionId);
    if (firstSession) {
      try {
        const sessions = await getUserSessions(user);
        const s = sessions.find((x) => x.id === firstSession.cloudSessionId && x.type === 'file');
        if (!s?.fileUrl) {
          window.alert('无法找到云端文件或下载链接缺失。请先在主界面侧栏从「云端」恢复该 PDF，或到考试中心检查材料关联。');
          return;
        }
        await handleRestoreCloudSession(s);
        setExamPredictionInitialKCId(null);
        setExamPredictionPanelOpen(true);
        /* 保持在备考工作台，不跳回主学习界面 */
      } catch (e) {
        console.error(e);
        window.alert('从云端打开材料失败，请检查网络后重试。');
      }
      return;
    }
    window.alert('当前考试没有可打开的关联材料。');
  };

  const filePersistedSnapshot: FilePersistedState | null = useMemo(() => {
    if (!fileHash && !fileName) return null;
    return {
      explanations,
      chatCache,
      skimMessages,
      annotations,
      notebookData,
      currentIndex,
      viewMode,
      skimTopHeight,
      skimFocusMode,
      studyMap,
      skimStage,
      quizData,
      docType,
      reviewQuizRounds,
      reviewFlashCards,
      flashCardEstimate,
      pageMarks,
      studyGuide,
      savedArtifacts,
      customAvatarUrl,
      personaSettings,
      pageComments,
      lsapContentMap,
      lsapState,
    };
  }, [
    fileHash,
    fileName,
    explanations,
    chatCache,
    skimMessages,
    annotations,
    notebookData,
    currentIndex,
    viewMode,
    skimTopHeight,
    skimFocusMode,
    studyMap,
    skimStage,
    quizData,
    docType,
    reviewQuizRounds,
    reviewFlashCards,
    flashCardEstimate,
    pageMarks,
    studyGuide,
    savedArtifacts,
    customAvatarUrl,
    personaSettings,
    pageComments,
    lsapContentMap,
    lsapState,
  ]);

  useEffect(() => {
    if (!isClassroomMode || !fileName || slides.length === 0) return;
    const pageNumber = currentIndex + 1;

    setCurrentLecture((previous) => {
      if (!previous) return previous;
      const visits = previous.pageVisits || [];
      if (visits[visits.length - 1]?.pageNumber === pageNumber) return previous;

      return {
        ...previous,
        sourceFileName: previous.sourceFileName || fileName,
        sourceFileHash: previous.sourceFileHash || fileHash || undefined,
        sourceStartedPage: previous.sourceStartedPage || pageNumber,
        pageVisits: [
          ...visits,
          {
            pageNumber,
            elapsedMs: Math.max(0, Date.now() - previous.startedAt),
          },
        ],
      };
    });
  }, [currentIndex, fileHash, fileName, isClassroomMode, slides.length]);

  const handleLectureRealtimeCommitted = useCallback((lectureId: string, text: string) => {
    if (activeLectureIdRef.current !== lectureId) return;
    const normalized = text.trim();
    if (!normalized) return;

    const timestamp = Date.now();
    const lineId = `${lectureId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const context = lectureRecentTextRef.current.slice(-2);
    lectureRecentTextRef.current = [...lectureRecentTextRef.current, normalized].slice(-3);
    setTranscriptLive('');
    setCurrentLecture((previous) => previous?.id === lectureId
      ? { ...previous, transcript: [...previous.transcript, { text: normalized, timestamp }] }
      : previous);
    setLectureRealtimeLines((previous) => [
      ...previous,
      { id: lineId, text: normalized, timestamp, translationStatus: 'pending' },
    ]);

    lectureTranslationQueueRef.current = lectureTranslationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const translation = await translateLectureTranscriptSegment(normalized, context);
          if (activeLectureIdRef.current !== lectureId) return;
          setLectureRealtimeLines((previous) => previous.map((line) => line.id === lineId
            ? { ...line, translation, translationStatus: 'ready' }
            : line));
        } catch (error) {
          console.error('Lecture realtime translation failed:', error);
          if (activeLectureIdRef.current !== lectureId) return;
          setLectureRealtimeLines((previous) => previous.map((line) => line.id === lineId
            ? { ...line, translationStatus: 'error' }
            : line));
        }
      });
  }, []);

  const startLectureRealtime = useCallback(async (lectureId: string, microphoneDeviceId?: string) => {
    await startElevenLabsRealtimeTranscription({
      onStatus: (status, message) => {
        if (activeLectureIdRef.current !== lectureId) return;
        setLectureRealtimeStatus(status);
        setLectureRealtimeMessage(message || '');
      },
      onPartial: (text) => {
        if (activeLectureIdRef.current !== lectureId) return;
        setTranscriptLive(text);
      },
      onCommitted: (text) => handleLectureRealtimeCommitted(lectureId, text),
    }, microphoneDeviceId ?? activeLectureMicrophoneDeviceIdRef.current);
  }, [handleLectureRealtimeCommitted]);

  const handleRetryLectureRealtime = useCallback(async () => {
    if (!activeLectureIdRef.current || isClassroomPaused) return;
    setLectureRealtimeMessage('');
    await retryElevenLabsRealtimeTranscription();
  }, [isClassroomPaused]);

  const handleStartClass = async (microphoneDeviceId?: string): Promise<boolean> => {
    const startedAt = Date.now();
    const hasOpenMaterial = Boolean(fileName && slides.length > 0);
    const lecture: LectureRecord = {
      id: `lecture-${startedAt}`,
      startedAt,
      transcript: [],
      audioStatus: 'recording',
      audioSource: 'microphone',
      sourceFileName: hasOpenMaterial ? fileName || undefined : undefined,
      sourceFileHash: hasOpenMaterial ? fileHash || undefined : undefined,
      sourceStartedPage: hasOpenMaterial ? currentIndex + 1 : undefined,
      pageVisits: hasOpenMaterial
        ? [{ pageNumber: currentIndex + 1, elapsedMs: 0 }]
        : undefined,
    };
    try {
      activeLectureMicrophoneDeviceIdRef.current = microphoneDeviceId;
      activeLectureIdRef.current = lecture.id;
      lectureEndingRef.current = false;
      lectureRecentTextRef.current = [];
      lectureTranslationQueueRef.current = Promise.resolve();
      setCurrentLecture(lecture);
      setTranscriptLive('');
      setLectureRealtimeLines([]);
      setLectureRealtimeStatus('connecting');
      setLectureRealtimeMessage('');
      setLectureAudioLevel(0);
      setIsClassroomPaused(false);
      setClassroomPausedAt(null);
      setClassroomPausedDurationMs(0);
      setIsClassroomMode(true);
      setIsClassroomPanelVisible(true);
      const audio = await startRecording(
        lecture.id,
        (progress) => {
          setCurrentLecture((prev) => prev ? withLectureAudio(prev, progress) : null);
        },
        setLectureAudioLevel,
        microphoneDeviceId
      );
      setCurrentLecture((prev) => prev ? withLectureAudio(prev, audio) : null);
      void startLectureRealtime(lecture.id, microphoneDeviceId);
      return true;
    } catch (e) {
      activeLectureIdRef.current = null;
      activeLectureMicrophoneDeviceIdRef.current = undefined;
      stopElevenLabsRealtimeTranscription();
      alert(e instanceof Error ? e.message : '无法开启录音');
      setCurrentLecture(null);
      setIsClassroomPaused(false);
      setClassroomPausedAt(null);
      setClassroomPausedDurationMs(0);
      setIsClassroomMode(false);
      setIsClassroomPanelVisible(false);
      return false;
    }
  };

  const openMicrophoneSetup = useCallback(() => setMicrophoneSetupOpen(true), []);
  const closeMicrophoneSetup = useCallback(() => setMicrophoneSetupOpen(false), []);

  const handlePauseClass = async () => {
    if (!isClassroomMode || isClassroomPaused || !currentLecture) return;
    try {
      await pauseRecording();
      stopElevenLabsRealtimeTranscription();
      setTranscriptLive('');
      setLectureRealtimeStatus('idle');
      setLectureRealtimeMessage('');
      setLectureAudioLevel(0);
      setClassroomPausedAt(Date.now());
      setIsClassroomPaused(true);
    } catch (error) {
      console.error('Lecture pause failed:', error);
      alert(error instanceof Error ? error.message : '课堂录音暂时无法暂停');
    }
  };

  const handleResumeClass = async () => {
    if (!isClassroomMode || !isClassroomPaused || !currentLecture) return;
    try {
      await resumeRecording();
      const resumedAt = Date.now();
      if (classroomPausedAt !== null) {
        setClassroomPausedDurationMs((duration) => duration + Math.max(0, resumedAt - classroomPausedAt));
      }
      setClassroomPausedAt(null);
      setIsClassroomPaused(false);
      setLectureRealtimeStatus('connecting');
      setLectureRealtimeMessage('');
      void startLectureRealtime(currentLecture.id);
    } catch (error) {
      console.error('Lecture resume failed:', error);
      alert(error instanceof Error ? error.message : '课堂录音暂时无法继续');
    }
  };

  const handleEndClass = async () => {
    if (lectureEndingRef.current) return;
    lectureEndingRef.current = true;
    const lecture = currentLecture;
    activeLectureIdRef.current = null;
    activeLectureMicrophoneDeviceIdRef.current = undefined;
    stopElevenLabsRealtimeTranscription();
    let audio: LectureAudioRecording | null = null;
    try {
      audio = await stopRecording();
    } catch (error) {
      console.error('Lecture audio stop failed:', error);
      alert('音频收尾没有完整完成，已保存的分段仍会保留为未正常结束记录。');
    }
    setTranscriptLive('');
    setLectureRealtimeStatus('idle');
    setLectureRealtimeMessage('');
    setLectureAudioLevel(0);
    setIsClassroomPaused(false);
    setClassroomPausedAt(null);
    setClassroomPausedDurationMs(0);
    if (lecture) {
      const ended = audio
        ? withLectureAudio({ ...lecture, endedAt: audio.endedAt || Date.now() }, audio)
        : { ...lecture, endedAt: Date.now(), audioStatus: 'interrupted' as const };
      setLectureHistory((history) => upsertLectureHistory(history, ended));
    }
    setCurrentLecture(null);
    setIsClassroomMode(false);
    setIsClassroomPanelVisible(false);
    setLectureTranscriptPageOpen(true);
    lectureEndingRef.current = false;
  };

  const handleOrganizeLecture = useCallback(async (lecture: LectureRecord) => {
    const id = lecture.id;
    const segments = lecture.transcriptSegments || [];
    const text = lecture.transcript.map((t) => t.text).join('');
    if (segments.length === 0 && !text.trim()) return;
    setOrganizingLectureId(id);
    try {
      if (segments.length > 0) {
        const matchesCurrentMaterial = Boolean(
          lecture.sourceFileHash
            ? fileHash && lecture.sourceFileHash === fileHash
            : lecture.sourceFileName && fileName && lecture.sourceFileName === fileName
        );
        const pageBySegmentId = Object.fromEntries(
          segments.flatMap((segment) => {
            const pageNumber = getLecturePageAtElapsedMs(lecture, segment.startMs);
            return pageNumber ? [[segment.id, pageNumber]] : [];
          })
        );
        const structuredNotes = await organizeLectureWithEvidence(segments, {
          sourceFileName: lecture.sourceFileName,
          pageBySegmentId,
          pageTexts: matchesCurrentMaterial
            ? pdfPageTexts.map((pageText, index) => ({
                pageNumber: index + 1,
                text: pageText,
              }))
            : [],
        });
        setLectureHistory((prev) =>
          prev.map((item) => item.id === id
            ? { ...item, structuredNotes, organizedSummary: structuredNotes.overview }
            : item)
        );
      } else {
        const summary = await organizeLectureFromTranscript(text);
        setLectureHistory((prev) =>
          prev.map((item) => item.id === id ? { ...item, organizedSummary: summary } : item)
        );
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'AI 整理失败');
    } finally {
      setOrganizingLectureId(null);
    }
  }, [fileHash, fileName, pdfPageTexts]);

  const handleTranscribeLecture = useCallback(async (
    lecture: LectureRecord,
    options: LectureTranscriptionOptions
  ) => {
    if (!lecture.audioRecordingId) return;
    const id = lecture.id;
    setTranscribingLectureId(id);
    setLectureHistory((previous) => previous.map((item) => (
      item.id === id
        ? { ...item, transcriptionStatus: 'transcribing', transcriptionError: undefined }
        : item
    )));

    try {
      const audio = await lectureAudioStorage.getRecordingBlob(lecture.audioRecordingId);
      const result = await transcribeLectureAudio(
        audio,
        {
          ...options,
          fileName: options.fileName || `${lecture.name || lecture.id}.${getLectureAudioExtension(lecture.audioMimeType)}`,
        },
        lecture.audioDurationMs
      );
      setLectureHistory((previous) => previous.map((item) => (
        item.id === id
          ? {
              ...item,
              transcript: result.legacyTranscript,
              transcriptSegments: result.segments,
              transcriptionStatus: 'ready',
              transcriptionError: undefined,
              transcriptionProvider: 'elevenlabs-scribe-v2',
              transcriptionLanguageCode: result.languageCode,
              transcriptionLanguageProbability: result.languageProbability,
              transcribedAt: Date.now(),
              audioQuality: result.quality,
              transcriptionKeyterms: options.keyterms,
              transcriptionSpeakerCount: result.speakerCount,
            }
          : item
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : '高精度转写失败，请稍后重试。';
      setLectureHistory((previous) => previous.map((item) => (
        item.id === id
          ? { ...item, transcriptionStatus: 'error', transcriptionError: message }
          : item
      )));
    } finally {
      setTranscribingLectureId(null);
    }
  }, []);

  const handleDeleteLecture = useCallback(async (lectureId: string) => {
    const lecture = lectureHistory.find((item) => item.id === lectureId);
    if (lecture?.audioRecordingId) {
      await lectureAudioStorage.deleteRecording(lecture.audioRecordingId).catch((error) => {
        console.error('Lecture audio deletion failed:', error);
      });
    }
    setLectureHistory((prev) => prev.filter((l) => l.id !== lectureId));
  }, [lectureHistory]);

  const handleRenameLecture = useCallback((lectureId: string, newName: string) => {
    setLectureHistory((prev) =>
      prev.map((l) => (l.id === lectureId ? { ...l, name: newName } : l))
    );
  }, []);

  const handleImportLectureAudio = useCallback(async (file: File) => {
    const recordingId = `lecture-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const audio = await lectureAudioStorage.importAudioFile(file, recordingId);
    setLectureHistory((previous) => upsertLectureHistory(previous, importedAudioLecture(audio)));
  }, []);

  // --- STANDARD LOGIC ---
  const getCachedPageToolExplanation = useCallback((slideId: string, mode: SlideExplanationMode) => {
    const otherLanguage: AppLanguage = appLanguage === 'en' ? 'zh-CN' : 'en';
    return explanations[getPageToolCacheKey(slideId, mode, appLanguage)]
      ?? explanations[getLegacyPageToolCacheKey(slideId, mode)]
      ?? explanations[getPageToolCacheKey(slideId, mode, otherLanguage)]
      ?? (mode === 'explain' ? explanations[slideId] : undefined);
  }, [appLanguage, explanations]);

  const buildPageToolGuideContext = useCallback((mode: SlideExplanationMode) => {
    const recentTurns = skimMessages
      .slice(-6)
      .map((msg) => `${msg.role === 'user' ? '学生' : 'AI'}：${msg.text.slice(0, 700)}`)
      .join('\n');
    return [
      `页面工具：${getPageToolLabel(mode)}`,
      `当前主学习路径：领读模式（内部兼容字段仍为 skim）。`,
      `当前领读状态：${skimStage}`,
      `当前材料类型：${activeSkim.contentType ?? 'lecture'}`,
      `领读模块数：${activeSkim.moduleCount}`,
      `领读节奏：${activeSkim.skimPace === 'part' ? '一次一个 part' : '一次一个 module'}`,
      activeSkim.pageRangeStart || activeSkim.pageRangeEnd ? `本段页码范围：${activeSkim.pageRangeStart ?? '开头'}-${activeSkim.pageRangeEnd ?? '结尾'}` : '本段页码范围：全本',
      studyMap?.topic ? `学习地图主题：${studyMap.topic}` : '',
      studyMap?.initialBriefing ? `学习地图摘要：${studyMap.initialBriefing}` : '',
      recentTurns ? `最近领读对话：\n${recentTurns}` : '最近领读对话：暂无。',
    ].filter(Boolean).join('\n');
  }, [activeSkim.contentType, activeSkim.moduleCount, activeSkim.pageRangeEnd, activeSkim.pageRangeStart, activeSkim.skimPace, skimMessages, skimStage, studyMap?.initialBriefing, studyMap?.topic]);

  const fetchExplanation = useCallback(async (index: number, currentSlides: Slide[], fullContext: string | null, mode: SlideExplanationMode = 'explain', forceRegenerate = false) => {
    const slide = currentSlides[index]; 
    if (!slide) return; 
    const cacheKey = getPageToolCacheKey(slide.id, mode);
    if (!forceRegenerate && getCachedPageToolExplanation(slide.id, mode)) {
      setExplanationErrors(prev => {
        if (!prev[cacheKey]) return prev;
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
      setIsGeneratingAI(false);
      return;
    } 
    
    setExplanationErrors(prev => {
      if (!prev[cacheKey]) return prev;
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
    setIsGeneratingAI(true); 
    try { 
        const explanation = await generateSlideExplanation(slide.imageUrl, fullContext || undefined, {
          mode,
          pageNumber: slide.pageNumber,
          guideContext: buildPageToolGuideContext(mode),
        }); 
        setExplanations(prev => ({ ...prev, [cacheKey]: explanation })); 
        setExplanationErrors(prev => {
          if (!prev[cacheKey]) return prev;
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
    } catch (error) { 
        console.error(error); 
        setExplanationErrors(prev => ({ ...prev, [cacheKey]: '页面工具生成失败，请稍后重试。' }));
    } finally { 
        setIsGeneratingAI(false); 
    }
  }, [buildPageToolGuideContext, getCachedPageToolExplanation]);

  useEffect(() => { 
    pageEntryTime.current = Date.now(); 
    hasEncouragedOnPage.current = false; 
  }, [currentIndex]);

  const toggleImmersiveMode = async () => { if (!isImmersive) { setIsImmersive(true); try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch (e) {} } else { setIsImmersive(false); try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (e) {} } };
  useEffect(() => { const handleFullscreenChange = () => { if (!document.fullscreenElement) setIsImmersive(false); }; document.addEventListener('fullscreenchange', handleFullscreenChange); return () => document.removeEventListener('fullscreenchange', handleFullscreenChange); }, []);

  const triggerEncouragement = () => { if (!slides[currentIndex]) return; const slideId = slides[currentIndex].id; hasEncouragedOnPage.current = true; const encouragementMsg: ChatMessage = { role: 'model', text: "这页内容有点难，但你已经坚持很久了，真棒！❤️", timestamp: Date.now() }; setChatCache(prev => ({ ...prev, [slideId]: [...(prev[slideId] || []), encouragementMsg] })); };

  const handleAddAnnotation = (text: string, x: number, y: number) => { if (!slides[currentIndex]) return; const slideId = slides[currentIndex].id; const newAnnotation: SlideAnnotation = { id: `anno-${Date.now()}`, text, x, y, fontSize: 14, width: 240, height: 120, color: '#111827', isBold: false }; setAnnotations(prev => ({ ...prev, [slideId]: [...(prev[slideId] || []), newAnnotation] })); };
  const handleUpdateAnnotation = (id: string, updates: Partial<SlideAnnotation>) => { if (!slides[currentIndex]) return; const slideId = slides[currentIndex].id; setAnnotations(prev => ({ ...prev, [slideId]: (prev[slideId] || []).map(a => a.id === id ? { ...a, ...updates } : a) })); };
  const handleDeleteAnnotation = (id: string) => { if (!slides[currentIndex]) return; const slideId = slides[currentIndex].id; setAnnotations(prev => ({ ...prev, [slideId]: (prev[slideId] || []).filter(a => a.id !== id) })); };

  const handleAddPageComment = () => {
    if (!slides[currentIndex]) return;
    const slideId = slides[currentIndex].id;
    const list = pageComments[slideId] || [];
    const nextOrder = list.length === 0 ? 0 : Math.max(...list.map(c => c.orderIndex), -1) + 1;
    const newComment: SlidePageComment = { id: `pcomment-${Date.now()}`, text: '', orderIndex: nextOrder, height: 80 };
    setPageComments(prev => ({ ...prev, [slideId]: [...(prev[slideId] || []), newComment] }));
  };
  const handleUpdatePageComment = (id: string, text: string) => {
    if (!slides[currentIndex]) return;
    const slideId = slides[currentIndex].id;
    setPageComments(prev => ({ ...prev, [slideId]: (prev[slideId] || []).map(c => c.id === id ? { ...c, text } : c) }));
  };
  const handleDeletePageComment = (id: string) => {
    if (!slides[currentIndex]) return;
    const slideId = slides[currentIndex].id;
    setPageComments(prev => ({ ...prev, [slideId]: (prev[slideId] || []).filter(c => c.id !== id) }));
  };
  const handleReorderPageComments = (fromIndex: number, toIndex: number) => {
    if (!slides[currentIndex]) return;
    const slideId = slides[currentIndex].id;
    const list = [...(pageComments[slideId] || [])].sort((a, b) => a.orderIndex - b.orderIndex);
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;
    const [removed] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, removed);
    const reordered = list.map((c, i) => ({ ...c, orderIndex: i }));
    setPageComments(prev => ({ ...prev, [slideId]: reordered }));
  };
  const handleResizePageComment = (id: string, height: number) => {
    if (!slides[currentIndex]) return;
    const slideId = slides[currentIndex].id;
    setPageComments(prev => ({ ...prev, [slideId]: (prev[slideId] || []).map(c => c.id === id ? { ...c, height } : c) }));
  };

  const handleRegenerateStudyMap = async (moduleCount: number, contentOverride?: string) => {
    // 写进「发起重算的那一段」（按 id 锁定，多段并存各自重算不互相覆盖，见 RECON Q5）。
    const targetSkimId = activeIdRef.current;
    // 方案 A：设了页码范围时，地图也只覆盖选中页（contentOverride 优先），否则回退整本
    const content = contentOverride || pdfDataUrl || fullPdfText;
    if (!content) return null;
    const map = await performPreFlightDiagnosis(content, { moduleCount }, 'astra');
    if (map) setSkimSessions(prev => prev.map(s => (s.id === targetSkimId ? { ...s, studyMap: map, studyMapModuleCount: moduleCount } : s)));
    return map; // 返回新 map，供 SkimPanel 直接用，绕开 setState 后的旧闭包
  };

  /** 新建一段空白略读会话并切过去；满 10 段或生成中则忽略（按钮亦已禁用，此处双保险）。
   *  方案 A：新建段 **不跑诊断开场**（skipDiagnosis=true），建出来即 studyMap=null、直接进配置区；
   *  studyMap 留到用户在配置区点「开始领读」时按所选页码范围 + 模块数生成（复用 onRegenerateStudyMap）。 */
  const handleAddSkimSession = useCallback(() => {
    if (skimActiveLoading || skimSessions.length >= MAX_SKIM_SESSIONS) return;
    const nextSequence = getNextDefaultSessionSequence(skimSessions.map(session => session.title), '领读');
    const newSession: SkimSession = { ...createEmptySkimSession(nextSequence), skipDiagnosis: true };
    const newIndex = skimSessions.length;
    setSkimSessions(prev => (prev.length >= MAX_SKIM_SESSIONS ? prev : [...prev, newSession]));
    setActiveSkimIndex(newIndex);
  }, [skimActiveLoading, skimSessions]);

  const openSessionTabManager = useCallback((kind: ManagedSessionTab['kind'], id: string, title: string) => {
    setManagedSessionTab({ kind, id });
    setSessionRenameDraft(title);
  }, []);

  const managedSkimSession = managedSessionTab?.kind === 'skim'
    ? skimSessions.find(session => session.id === managedSessionTab.id) ?? null
    : null;
  const managedTutorSession = managedSessionTab?.kind === 'tutor'
    ? tutorSessions.find(session => session.id === managedSessionTab.id) ?? null
    : null;
  const managedSessionTitle = managedSkimSession?.title ?? managedTutorSession?.title ?? '';
  const managedSessionIsGenerating = Boolean(
    (managedSkimSession && skimActiveLoading && managedSkimSession.id === activeSkim?.id) ||
    (managedTutorSession && tutorActiveLoading && managedTutorSession.id === activeTutor?.id)
  );

  const handleRenameManagedSession = useCallback(() => {
    if (!managedSessionTab) return;
    const nextTitle = sessionRenameDraft.trim().slice(0, 40);
    if (!nextTitle) {
      window.alert('名称不能为空。');
      return;
    }
    if (managedSessionTab.kind === 'skim') {
      if (skimSessions.some(session => session.id !== managedSessionTab.id && session.title.trim() === nextTitle)) {
        window.alert('已经有一个同名的领读标签。');
        return;
      }
      migratedSkimBaselineRef.current = null;
      setSkimSessions(previous => previous.map(session => session.id === managedSessionTab.id
        ? { ...session, title: nextTitle }
        : session));
    } else {
      if (tutorSessions.some(session => session.id !== managedSessionTab.id && session.title.trim() === nextTitle)) {
        window.alert('已经有一个同名的问答标签。');
        return;
      }
      const target = tutorSessions.find(session => session.id === managedSessionTab.id);
      if (!target) return;
      const renamed = { ...target, title: nextTitle };
      setTutorSessions(previous => previous.map(session => session.id === renamed.id ? renamed : session));
      void storageService.saveTutorSession(renamed).catch(() => {});
      if (user) void saveTutorSessionToCloud(user, renamed).catch(() => {});
    }
    setManagedSessionTab(null);
  }, [managedSessionTab, sessionRenameDraft, skimSessions, tutorSessions, user]);

  const handleDeleteManagedSession = useCallback(async () => {
    if (!managedSessionTab || sessionTabDeleting) return;
    const targetTitle = managedSessionTab.kind === 'skim'
      ? skimSessions.find(session => session.id === managedSessionTab.id)?.title
      : tutorSessions.find(session => session.id === managedSessionTab.id)?.title;
    if (!targetTitle) return;
    const targetGenerating = managedSessionTab.kind === 'skim'
      ? skimActiveLoading && skimSessions[activeSkimIndex]?.id === managedSessionTab.id
      : tutorActiveLoading && tutorSessions[activeTutorIndex]?.id === managedSessionTab.id;
    if (targetGenerating) return;

    const lastSkimHint = managedSessionTab.kind === 'skim' && skimSessions.length === 1
      ? '\n\n为了让领读入口保持可用，删除后会建立一个全新的空白领读标签。'
      : '';
    const confirmed = window.confirm(
      `永久删除“${targetTitle}”？\n\n该标签里的对话、学习位置和模式记录会被删除；其他领读、问答、PDF 注释与便签不受影响。${lastSkimHint}`
    );
    if (!confirmed) return;

    setSessionTabDeleting(true);
    try {
      if (managedSessionTab.kind === 'skim') {
        if (currentSessionId && user) {
          await deleteSkimSessionFromCloud(currentSessionId, managedSessionTab.id);
        }
        const nextIndex = getActiveIndexAfterDeletion(skimSessions, activeSkimIndex, managedSessionTab.id);
        let remaining = skimSessions.filter(session => session.id !== managedSessionTab.id);
        if (remaining.length === 0) {
          const nextSequence = getNextDefaultSessionSequence(skimSessions.map(session => session.title), '领读');
          remaining = [{ ...createEmptySkimSession(nextSequence), skipDiagnosis: true }];
        }
        migratedSkimBaselineRef.current = null;
        setSkimSessions(remaining);
        setActiveSkimIndex(Math.min(nextIndex, remaining.length - 1));
        activeIdRef.current = remaining[Math.min(nextIndex, remaining.length - 1)]?.id ?? null;
        if (currentSessionId && user) {
          void updateCloudSessionState(currentSessionId, {
            skimSessions: remaining,
            activeSkimIndex: Math.min(nextIndex, remaining.length - 1),
          });
        }
      } else {
        const target = tutorSessions.find(session => session.id === managedSessionTab.id);
        if (!target) return;
        try {
          if (user) await deleteTutorSessionFromCloud(user.uid, managedSessionTab.id);
          await storageService.deleteTutorSession(managedSessionTab.id);
        } catch (error) {
          // 任一存储删除失败时尽力把两端恢复，避免出现“界面还在、某一端已半删”的状态。
          await storageService.saveTutorSession(target).catch(() => {});
          if (user) await saveTutorSessionToCloud(user, target).catch(() => {});
          throw error;
        }
        const nextIndex = getActiveIndexAfterDeletion(tutorSessions, activeTutorIndex, managedSessionTab.id);
        const remaining = tutorSessions.filter(session => session.id !== managedSessionTab.id);
        setTutorSessions(remaining);
        setActiveTutorIndex(nextIndex);
        activeTutorIdRef.current = remaining[nextIndex]?.id ?? null;
        setTutorMaterialMap(previous => {
          const next = { ...previous };
          delete next[managedSessionTab.id];
          return next;
        });
        if (remaining.length === 0 && viewMode === 'tutor') setViewMode('skim');
      }
      setManagedSessionTab(null);
    } catch (error) {
      console.error('Delete session tab failed', error);
      window.alert('删除失败，现有标签和内容没有改变。请检查网络后重试。');
    } finally {
      setSessionTabDeleting(false);
    }
  }, [
    activeSkimIndex,
    activeTutorIndex,
    currentSessionId,
    managedSessionTab,
    sessionTabDeleting,
    skimActiveLoading,
    skimSessions,
    tutorActiveLoading,
    tutorSessions,
    user,
    viewMode,
  ]);

  const handleRunPageTool = useCallback((mode: SlideExplanationMode) => {
      if (!slides.length || !slides[currentIndex]) return;
      setActivePageToolMode(mode);
      fetchExplanation(currentIndex, slides, fullPdfText, mode, false);
  }, [slides, currentIndex, fetchExplanation, fullPdfText]);

  const handleRetryExplanation = useCallback(() => { 
      if (!slides.length || !slides[currentIndex]) return;
      const slideId = slides[currentIndex].id;
      const cacheKey = getPageToolCacheKey(slideId, activePageToolMode);
      setExplanations(prev => {
        const newExplanations = { ...prev };
        delete newExplanations[cacheKey];
        if (activePageToolMode === 'explain') delete newExplanations[slideId];
        return newExplanations;
      });
      setExplanationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[cacheKey];
        return newErrors;
      });
      fetchExplanation(currentIndex, slides, fullPdfText, activePageToolMode, true); 
  }, [slides, currentIndex, activePageToolMode, fetchExplanation, fullPdfText]);

  const handleSendChat = async (text: string, images?: string[]) => {
    if (!slides[currentIndex]) return; const slide = slides[currentIndex]; const slideId = slide.id; const userMessage: ChatMessage = { role: 'user', text, ...(images && images.length > 0 ? { images } : {}), timestamp: Date.now() };
    setChatCache(prev => { const newState = { ...prev, [slideId]: [...(prev[slideId] || []), userMessage] }; return newState; }); setIsChatLoading(true);
    try { const currentHistory = chatCache[slideId] || []; const replyText = await chatWithSlide(slide.imageUrl, currentHistory, text, images, 'standard', undefined); const replyMessage: ChatMessage = { role: 'model', text: replyText, timestamp: Date.now() }; setChatCache(prev => { const newState = { ...prev, [slideId]: [...(prev[slideId] || []), replyMessage] }; return newState; }); } catch (error) { console.error(error); } finally { setIsChatLoading(false); }
  };

  const handleSendGalgameChat = async (text: string) => { if (!slides[currentIndex]) return; };

  const handleExportPDF = async () => {
    if (slides.length === 0 || isExportingHandout) return;
    setIsExportingHandout(true);
    try {
      await exportStudyHandoutPdf({
        slides,
        annotations,
        pageComments,
        fileName: fileName || 'study-notes',
      });
    } catch (error) {
      console.error('Export study handout failed:', error);
      alert('导出复习讲义失败了，可以稍后再试一次。');
    } finally {
      setIsExportingHandout(false);
    }
  };

  const handleAddNote = (text: string, category: 'deep' | 'skim' = 'deep') => { if (!fileName) { alert("请先上传课件"); return; } const currentPage = currentIndex + 1; const newNote: Note = { id: `note-${Date.now()}`, text: normalizeGeneratedLineBreaks(text), createdAt: Date.now(), category }; setNotebookData(prev => ({ ...prev, [fileName]: { ...(prev[fileName] || {}), [currentPage]: [...(prev[fileName]?.[currentPage] || []), newNote] } })); };
  const handleSavePageToolResult = useCallback(() => {
    if (!slides[currentIndex]) return;
    const slide = slides[currentIndex];
    const content = getCachedPageToolExplanation(slide.id, activePageToolMode);
    if (!content) return;
    handleAddNote(`【页面工具 · ${getPageToolLabel(activePageToolMode)}】\n${content}`, 'deep');
  }, [slides, currentIndex, activePageToolMode, getCachedPageToolExplanation]);
  const handleUpdateNote = (page: number, noteId: string, newText: string) => { if (!fileName) return; setNotebookData(prev => { const fileNotes = prev[fileName]; if (!fileNotes) return prev; const pageNotes = fileNotes[page].map(note => note.id === noteId ? { ...note, text: newText } : note); return { ...prev, [fileName]: { ...fileNotes, [page]: pageNotes } }; }); };
  const handleDeleteNote = (page: number, noteId: string) => { if (!fileName) return; setNotebookData(prev => { const fileNotes = prev[fileName]; if (!fileNotes) return prev; const pageNotes = fileNotes[page].filter(note => note.id !== noteId); return { ...prev, [fileName]: { ...fileNotes, [page]: pageNotes } }; }); };

  const handleToggleTimer = () => { setIsTimerRunning(!isTimerRunning); if (!isTimerRunning) pageEntryTime.current = Date.now(); };
  const handleAudioPlayPause = () => { if (externalVideo) { setExternalVideo(null); return; } if (!audioRef.current || !audioRef.current.src) return; if (isPlayingAudio) audioRef.current.pause(); else audioRef.current.play().catch(e => setIsPlayingAudio(false)); setIsPlayingAudio(!isPlayingAudio); };
  const handleAudioTrackChange = (url: string, name: string) => { setExternalVideo(null); if (!audioRef.current) return; if (audioRef.current.src === url && isPlayingAudio) return; setIsPlayingAudio(false); audioRef.current.src = url; audioRef.current.load(); audioRef.current.play().then(() => { setIsPlayingAudio(true); setCurrentTrackName(name); }); setCurrentTrackName(name); };
  const handleVideoSelect = (type: 'bilibili' | 'youtube', id: string) => { if (audioRef.current) { audioRef.current.pause(); setIsPlayingAudio(false); } setExternalVideo({ type, id }); };

  const handleNext = () => { if (currentIndex < slides.length - 1) setCurrentIndex(prev => prev + 1); };
  const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(prev => prev - 1); };
  const handleJumpToPage = (index: number) => { if (index >= 0 && index < slides.length) setCurrentIndex(index); };
  const handleDragSplitterStart = (e: React.MouseEvent) => { e.preventDefault(); splitterRef.current = true; document.addEventListener('mousemove', handleDragSplitterMove); document.addEventListener('mouseup', handleDragSplitterEnd); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; };
  const handleDragSplitterMove = (e: MouseEvent) => { if (!splitterRef.current) return; const newLeftWidth = (e.clientX / window.innerWidth) * 100; if (newLeftWidth > 30 && newLeftWidth < 70) setLeftPanelWidth(newLeftWidth); };
  const handleDragSplitterEnd = () => { splitterRef.current = false; document.removeEventListener('mousemove', handleDragSplitterMove); document.removeEventListener('mouseup', handleDragSplitterEnd); document.body.style.cursor = ''; document.body.style.userSelect = ''; };

  const handleNotesSplitterStart = (e: React.MouseEvent) => { e.preventDefault(); notesSplitterRef.current = true; document.addEventListener('mousemove', handleNotesSplitterMove); document.addEventListener('mouseup', handleNotesSplitterEnd); document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; };
  const handleNotesSplitterMove = (e: MouseEvent) => {
    if (!notesSplitterRef.current || !leftPanelRef.current) return;
    const rect = leftPanelRef.current.getBoundingClientRect();
    const fromBottom = rect.bottom - e.clientY;
    const percent = (fromBottom / rect.height) * 100;
    const clamped = Math.max(15, Math.min(65, percent));
    setNotesPanelHeightPercent(clamped);
  };
  const handleNotesSplitterEnd = () => { notesSplitterRef.current = false; document.removeEventListener('mousemove', handleNotesSplitterMove); document.removeEventListener('mouseup', handleNotesSplitterEnd); document.body.style.cursor = ''; document.body.style.userSelect = ''; };

  const currentSlide = slides[currentIndex];

  /**
   * Sidebar 页缩略图：与 slides 同源（processFile → convertPdfToImages 已为每页生成 imageUrl，无需再跑 pdf.js）。
   * - 换文档：`setSlides(newSlides)` 整表替换，缩略图数组与 totalPages 同步，不会残留上一本书。
   * - 清空：`slides === []` 时此处为 `[]`，Sidebar 无页格或仅「无预览」占位，不引用旧 data URL。
   * - 泄漏：当前为 data: URL 字符串，无 blob: revoke 需求；若未来改为 blob URL，需在替换/卸载时 revoke。
   */
  const pageThumbnails = useMemo(() => slides.map((s) => s.imageUrl), [slides]);

  const renderVideoOverlay = () => {
    if (!externalVideo) return null;
    return (
        <div className="fixed bottom-4 right-4 z-[9999] w-80 bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4">
        <div className="bg-stone-50 px-4 py-2 flex justify-between items-center text-xs text-stone-50 border-b border-stone-100">
            <span className="font-bold flex items-center">{externalVideo.type === 'bilibili' ? 'Bilibili' : 'YouTube'} 播放器</span>
            <button onClick={() => setExternalVideo(null)} className="p-1 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative pt-[56.25%] bg-black">
            {externalVideo.type === 'bilibili' ? (
            <iframe src={`//player.bilibili.com/player.html?bvid=${externalVideo.id}&page=1&high_quality=1&danmaku=0&autoplay=1`} className="absolute top-0 left-0 w-full h-full" scrolling="no" frameBorder="0" allowFullScreen></iframe>
            ) : (
            <iframe src={`https://www.youtube.com/embed/${externalVideo.id}?autoplay=1`} className="absolute top-0 left-0 w-full h-full" frameBorder="0" allowFullScreen></iframe>
            )}
        </div>
        </div>
    );
  };

  const commonHeader = (
    <Header 
      fileName={fileName} 
      currentPage={slides.length > 0 ? currentIndex + 1 : 0} 
      totalPages={slides.length} 
      onUpload={handleFileUpload} 
      onNext={handleNext} 
      onPrev={handlePrev} 
      isProcessing={isProcessingFile} 
      studyTime={studyTime} 
      isTimerRunning={isTimerRunning} 
      onToggleTimer={handleToggleTimer} 
      progressPercentage={slides.length > 0 ? (new Set(Object.keys(explanations).map(key => key.split('::')[0])).size / slides.length) * 100 : 0} 
      isPlayingAudio={isPlayingAudio} 
      currentTrackName={currentTrackName} 
      volume={audioVolume} 
      onAudioPlayPause={handleAudioPlayPause} 
      onAudioTrackChange={handleAudioTrackChange} 
      onVideoSelect={handleVideoSelect} 
      onAudioVolumeChange={setAudioVolume} 
      isImmersive={isImmersive} 
      onToggleImmersive={toggleImmersiveMode} 
      onLayoutPreset={setLeftPanelWidth} 
      viewMode={viewMode} 
      onToggleSkim={() => {
        setIsClassroomPanelVisible(false);
        setViewMode(prev => prev === 'skim' ? 'deep' : 'skim');
      }}
      hasStudyMap={slides.length > 0} 
      onOpenHistory={handleOpenHistory} 
      onEnterGalgameMode={() => setIsGalgameMode(true)}
      user={authUser}
      localWorkspace={isLocalUser(user)}
      saveError={storageError}
      onLogin={handleLogin}
      onLogout={handleLogout}
      isSyncing={isSyncing}
      onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      onOpenDashboard={() => {
        if (activeStudyDraftRef.current) abandonActiveStudySession();
        setDashboardInitialTab('library');
        setShellMode('dashboard');
      }}
      onOpenMarkPanel={() => setIsMarkPanelOpen(true)}
      hasMarkOnCurrentPage={fileName && pageMarks[fileName] && pageMarks[fileName][currentIndex + 1] ? pageMarks[fileName][currentIndex + 1].length > 0 : false}
      musicPanelOpen={isMusicPanelOpen}
      onMusicPanelOpenChange={setIsMusicPanelOpen}
      hasLectureHistory={lectureHistory.length > 0}
      onOpenLectureTranscript={() => setLectureTranscriptPageOpen(true)}
      isClassroomMode={isClassroomMode}
      isClassroomPanelVisible={isClassroomPanelVisible}
      onStartClass={openMicrophoneSetup}
      onOpenClassroomPanel={() => setIsClassroomPanelVisible(true)}
      isTranscriptionSupported={transcriptionSupported}
      onOpenReview={() => setReviewPageOpen(true)}
      onOpenExamWorkspace={() => {
        if (!user) {
          setLoginModalOpen(true);
          return;
        }
        if (currentLectureReviewMaterial) startLectureReview(currentLectureReviewMaterial);
        else { setReviewWorkspaceMode('home'); setReviewEntryPickLecture(true); setAppMode('examWorkspace'); }
      }}
      onOpenTurtleSoup={() => setTurtleSoupOpen(true)}
      pomodoroSegmentSeconds={pomodoroSegmentSeconds}
      pomodoroBreakSeconds={pomodoroBreakSeconds}
      onPomodoroSegmentChange={setPomodoroSegmentSeconds}
      onPomodoroBreakChange={setPomodoroBreakSeconds}
      pomodoroPhase={pomodoroPhase}
      pomodoroRemainingSeconds={pomodoroRemainingSeconds}
      completedSegmentsCount={completedSegmentsCount}
      onPomodoroStart={() => { setPomodoroPhase('study'); setPomodoroRemainingSeconds(pomodoroSegmentSeconds); }}
      onPomodoroStop={() => setPomodoroPhase('idle')}
    />
  );
  
  const commonSlideViewer = (
    <SlideViewer 
      slide={currentSlide} 
      annotations={currentSlide ? (annotations[currentSlide.id] || []) : []} 
      onAddAnnotation={handleAddAnnotation} 
      onUpdateAnnotation={handleUpdateAnnotation} 
      onDeleteAnnotation={handleDeleteAnnotation} 
      onExportPDF={handleExportPDF} 
      isExporting={isExportingHandout}
      onRequestUpload={() => hiddenFileInputRef.current?.click()} 
      isImmersive={isImmersive}
      leftPanelRef={leftPanelRef}
    />
  );
  
  // 领读 + 问答共用的同一排标签栏（数据仍两套独立；点标签同时切 viewMode + 该套 activeIndex）。
  // 任一套生成中即锁全排，避免切走时打断在途生成。仅在 viewMode==='skim' / 'tutor' 两态渲染。
  const tabsLocked = skimActiveLoading || tutorActiveLoading;
  const sessionTabBar = (
    <div className="editorial-session-tabs has-session-tab-ink flex items-center gap-1.5 px-3 py-2 border-b border-stone-100 bg-white shrink-0 overflow-x-auto custom-scrollbar">
      <SessionTabInk
        activeKey={viewMode === 'skim' ? `skim:${activeSkim.id}` : activeTutor ? `tutor:${activeTutor.id}` : null}
        scopeKey={fileHash || currentSessionId || fileName || 'local-document'}
        layoutKey={JSON.stringify([skimSessions.map(s => [s.id, s.title]), tutorSessions.map(s => [s.id, s.title])])}
        positionRef={sessionTabInkPositionRef}
      />
      {/* 领读与问答保留各自会话，以图标区分。 */}
      {skimSessions.map((s, i) => {
        const active = viewMode === 'skim' && i === activeSkimIndex;
        return (
          <div
            key={s.id}
            className={`editorial-session-tab is-skim flex shrink-0 items-center text-xs font-bold whitespace-nowrap transition-colors border ${active ? 'is-active' : ''} ${
              active
                ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                : 'bg-stone-50 text-stone-500 border-transparent hover:bg-stone-100'
            }`}
          >
            <button
              type="button"
              onClick={() => { if (!tabsLocked) { setViewMode('skim'); setActiveSkimIndex(i); } }}
              disabled={tabsLocked}
              title={tabsLocked ? '生成中，请等转圈结束再切换' : s.title}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 max-w-40 items-center gap-1.5 px-3 py-1.5 ${tabsLocked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
            <button
              type="button"
              onClick={() => openSessionTabManager('skim', s.id, s.title)}
              className="mr-1 rounded-md p-1 text-current opacity-55 hover:bg-white/70 hover:opacity-100"
              aria-label={`管理${s.title}`}
              title={`重命名或删除${s.title}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {/* 问答标签 */}
      {tutorSessions.map((s, i) => {
        const active = viewMode === 'tutor' && i === activeTutorIndex;
        return (
          <div
            key={s.id}
            className={`editorial-session-tab is-tutor flex shrink-0 items-center text-xs font-bold whitespace-nowrap transition-colors border ${active ? 'is-active' : ''} ${
              active
                ? 'bg-violet-100 text-violet-700 border-violet-200'
                : 'bg-stone-50 text-violet-400 border-transparent hover:bg-violet-50'
            }`}
          >
            <button
              type="button"
              onClick={() => { if (!tabsLocked) { setViewMode('tutor'); setActiveTutorIndex(i); activeTutorIdRef.current = s.id; } }}
              disabled={tabsLocked}
              title={tabsLocked ? '生成中，请等转圈结束再切换' : s.title}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 max-w-40 items-center gap-1.5 px-3 py-1.5 ${tabsLocked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <MessageCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
            <button
              type="button"
              onClick={() => openSessionTabManager('tutor', s.id, s.title)}
              className="mr-1 rounded-md p-1 text-current opacity-55 hover:bg-white/70 hover:opacity-100"
              aria-label={`管理${s.title}`}
              title={`重命名或删除${s.title}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {/* 新建领读 */}
      <button
        type="button"
        onClick={() => { handleAddSkimSession(); setViewMode('skim'); }}
        disabled={tabsLocked || skimSessions.length >= MAX_SKIM_SESSIONS}
        title={
          skimSessions.length >= MAX_SKIM_SESSIONS
            ? `最多 ${MAX_SKIM_SESSIONS} 段领读`
            : tabsLocked
              ? '生成中，请等转圈结束再新建'
              : '新建一段空白领读'
        }
        className={`editorial-session-add shrink-0 flex items-center justify-center w-7 h-7 border transition-colors ${
          tabsLocked || skimSessions.length >= MAX_SKIM_SESSIONS
            ? 'bg-stone-50 text-stone-300 border-transparent cursor-not-allowed'
            : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'
        }`}
        aria-label="新建领读会话"
      >
        <Plus className="w-4 h-4" />
      </button>
      {/* 新建问答（紫色 + 对话图标，区分于新建领读） */}
      <button
        type="button"
        onClick={() => { handleAddTutorSession(); setViewMode('tutor'); }}
        disabled={tabsLocked || tutorSessions.length >= MAX_TUTOR_SESSIONS}
        title={
          tutorSessions.length >= MAX_TUTOR_SESSIONS
            ? `最多 ${MAX_TUTOR_SESSIONS} 段问答`
            : tabsLocked
              ? '生成中，请等转圈结束再新建'
              : '新建一段问答'
        }
        className={`editorial-session-add shrink-0 flex items-center justify-center gap-0.5 h-7 px-1.5 border transition-colors ${
          tabsLocked || tutorSessions.length >= MAX_TUTOR_SESSIONS
            ? 'bg-stone-50 text-stone-300 border-transparent cursor-not-allowed'
            : 'bg-white text-violet-600 border-violet-200 hover:bg-violet-50'
        }`}
        aria-label="新建问答会话"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        <Plus className="w-3.5 h-3.5" />
      </button>

      {managedSessionTab && (managedSkimSession || managedTutorSession) && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            aria-label="关闭标签管理"
            disabled={sessionTabDeleting}
            onClick={() => setManagedSessionTab(null)}
          />
          <section className="relative w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="session-tab-manager-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                  {managedSessionTab.kind === 'skim' ? '领读标签' : '问答标签'}
                </p>
                <h2 id="session-tab-manager-title" className="mt-1 text-base font-black text-slate-900">管理“{managedSessionTitle}”</h2>
              </div>
              <button type="button" disabled={sessionTabDeleting} onClick={() => setManagedSessionTab(null)} className="rounded-lg bg-stone-100 p-2 text-slate-500 hover:bg-stone-200 disabled:opacity-50" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 block text-xs font-bold text-slate-600" htmlFor="session-tab-rename">标签名称</label>
            <div className="mt-2 flex gap-2">
              <input
                id="session-tab-rename"
                value={sessionRenameDraft}
                maxLength={40}
                disabled={sessionTabDeleting}
                onChange={(event) => setSessionRenameDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleRenameManagedSession(); }}
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-stone-100"
              />
              <button
                type="button"
                onClick={handleRenameManagedSession}
                disabled={sessionTabDeleting || !sessionRenameDraft.trim() || sessionRenameDraft.trim() === managedSessionTitle}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Pencil className="h-3.5 w-3.5" />保存
              </button>
            </div>

            <div className="mt-5 border-t border-stone-200 pt-4">
              <p className="text-xs leading-5 text-slate-500">
                永久删除只会清除这个{managedSessionTab.kind === 'skim' ? '领读' : '问答'}标签里的对话、学习位置和模式记录，不影响另一类标签、PDF 注释或便签。
              </p>
              <button
                type="button"
                onClick={() => void handleDeleteManagedSession()}
                disabled={managedSessionIsGenerating || sessionTabDeleting}
                title={managedSessionIsGenerating ? '这个标签正在生成回答，暂时不能删除' : `永久删除${managedSessionTitle}`}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-slate-400"
              >
                {sessionTabDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {sessionTabDeleting
                  ? '正在删除…'
                  : managedSessionIsGenerating
                    ? '生成中，暂时不能删除'
                    : '永久删除这个标签'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );

  const currentPageToolExplanation = currentSlide ? getCachedPageToolExplanation(currentSlide.id, activePageToolMode) : undefined;
  const currentPageToolError = currentSlide ? explanationErrors[getPageToolCacheKey(currentSlide.id, activePageToolMode)] : undefined;
  const isRecordShelfVisible = viewMode === 'skim'
    && activeSkim.studyStyle === 'records'
    && activeSkim.recordDeck?.view === 'shelf';

  useEffect(() => {
    if (!activeRecordCard || slides.length === 0) return;
    const page = currentIndex + 1;
    setSkimRecordDeck(previous => {
      if (!previous?.activeCardId) return previous;
      const card = previous.cards[previous.activeCardId];
      if (!card || card.lastPage === page) return previous;
      return {
        ...previous,
        cards: { ...previous.cards, [card.id]: { ...card, lastPage: page } },
      };
    });
  }, [activeRecordCard?.id, currentIndex, setSkimRecordDeck, slides.length]);

  useEffect(() => {
    if ((activeSkim.studyStyle ?? 'continuous') !== 'continuous' || slides.length === 0) return;
    const page = currentIndex + 1;
    updateActiveSkimSession(session => session.continuousLastPage === page
      ? session
      : { ...session, continuousLastPage: page });
  }, [activeSkim.studyStyle, currentIndex, slides.length, updateActiveSkimSession]);

  const studyRightPanel = viewMode === 'skim' ? (
    // 标签栏（领读+问答同排，共享）+ SkimPanel 同框：SkimPanel 始终挂载，切换标签只换喂进去的「激活会话切片」。
    <div className="flex flex-col h-full">
      {sessionTabBar}
      <div className="flex-1 min-h-0">
        <SkimPanel
          readingSessionKey={JSON.stringify([fileHash, currentSessionId, activeSkim.id, activeRecordCard?.id ?? 'continuous'])}
          studyMap={studyMap}
          isLoading={isStudyMapLoading}
          onSwitchToDeep={() => setViewMode('deep')}
          fullText={fullPdfText}
          pdfDataUrl={pdfDataUrl}
          messages={skimMessages}
          setMessages={setSkimMessages}
          topHeight={skimTopHeight}
          setTopHeight={setSkimTopHeight}
          focusMode={skimFocusMode}
          setFocusMode={setSkimFocusMode}
          stage={skimStage}
          setStage={setSkimStage}
          quizData={quizData}
          setQuizData={setQuizData}
          docType={docType}
          onNotebookAdd={handleAddNote}
          onRegenerateStudyMap={handleRegenerateStudyMap}
          studyMapModuleCount={studyMapModuleCount}
          totalPages={slides.length}
          moduleCount={activeSkim.moduleCount}
          setModuleCount={setSkimModuleCount}
          skimPace={activeSkim.skimPace}
          setSkimPace={setSkimPaceValue}
          contentType={activeSkim.contentType ?? 'lecture'}
          onContentTypeChange={setSkimContentType}
          auxiliaryMaterial={activeSkim.auxiliaryMaterial ?? null}
          onAuxiliaryMaterialChange={setSkimAuxiliaryMaterial}
          readingRoute={activeSkim.readingRoute ?? null}
          onReadingRouteChange={setSkimReadingRoute}
          studyStyle={activeSkim.studyStyle ?? 'continuous'}
          onStudyStyleChange={setSkimStudyStyle}
          explanationDepth={activeSkim.explanationDepth ?? 'normal'}
          onExplanationDepthChange={setSkimExplanationDepth}
          recordDeck={activeSkim.recordDeck ?? null}
          onRecordDeckChange={setSkimRecordDeck}
          activeRecordCard={activeRecordCard}
          pdfPageTexts={pdfPageTexts}
          onOpenRecordShelf={handleReturnToSkimRecordShelf}
          onCompleteRecord={() => handleSetSkimRecordCompleted(true)}
          onUndoRecordComplete={() => handleSetSkimRecordCompleted(false)}
          onOpenNextRecord={handleOpenNextSkimRecord}
          caseLearning={activeSkim.caseLearning ?? null}
          onCaseLearningChange={setLectureCaseLearning}
          caseSourceId={fileHash || currentSessionId || fileName || 'local-document'}
          currentPage={slides.length > 0 ? currentIndex + 1 : undefined}
          onJumpToPage={slides.length > 0 ? (page) => setCurrentIndex(Math.max(0, Math.min(page - 1, slides.length - 1))) : undefined}
          cloudSessions={studyCloudSessions}
          currentCloudSessionId={currentSessionId}
          pageRangeStart={activeSkim.pageRangeStart}
          setPageRangeStart={setSkimPageRangeStart}
          pageRangeEnd={activeSkim.pageRangeEnd}
          setPageRangeEnd={setSkimPageRangeEnd}
          onLoadingChange={setSkimActiveLoading}
          skipDiagnosis={activeSkim.skipDiagnosis}
          onStartTutorMode={handleStartTutorMode}
        />
      </div>
    </div>
  ) : viewMode === 'tutor' ? (
    // 问答 = 右栏内一种视图，与领读共用左侧 PDF 与同排标签栏；返回领读靠点领读标签。
    <div className="flex flex-col h-full">
      {sessionTabBar}
      <div className="flex-1 min-h-0">
        {activeTutor && (
          <TutorChat
            messages={activeTutor.messages}
            setMessages={setTutorMessages}
            docType={activeTutor.docType}
            materialContent={tutorMaterialMap[activeTutor.id] ?? ''}
            onLoadingChange={setTutorActiveLoading}
            currentPage={slides.length > 0 ? currentIndex + 1 : undefined}
            totalPages={slides.length || undefined}
          />
        )}
      </div>
    </div>
  ) : (
    <ExplanationPanel
      explanation={currentPageToolExplanation} 
      explanationError={currentPageToolError}
      isLoadingExplanation={isGeneratingAI} 
      onRetryExplanation={handleRetryExplanation} 
      activeToolMode={activePageToolMode}
      onRunPageTool={handleRunPageTool}
      onSaveExplanation={handleSavePageToolResult}
      onBackToGuidedReading={() => setViewMode('skim')}
      chatMessages={currentSlide ? (chatCache[currentSlide.id] || []) : []} 
      onSendChat={handleSendChat} 
      isChatLoading={isChatLoading} 
      onNotebookAdd={handleAddNote}
      isImmersive={isImmersive} 
      isCollapsed={isSidePanelCollapsed} 
      onToggleCollapse={() => setIsSidePanelCollapsed(!isSidePanelCollapsed)} 
    />
  );

  const commonRightPanel = isClassroomPanelVisible && isClassroomMode && currentLecture ? (
    <ClassroomPanel
      currentLecture={currentLecture}
      onEndClass={handleEndClass}
      isPaused={isClassroomPaused}
      pausedAt={classroomPausedAt}
      pausedDurationMs={classroomPausedDurationMs}
      onPauseClass={handlePauseClass}
      onResumeClass={handleResumeClass}
      onShowGuidedReading={() => {
        setViewMode('skim');
        setIsClassroomPanelVisible(false);
      }}
      onShowPageTools={() => {
        setViewMode('deep');
        setIsClassroomPanelVisible(false);
      }}
      transcriptLive={transcriptLive}
      realtimeStatus={lectureRealtimeStatus}
      realtimeMessage={lectureRealtimeMessage}
      liveLines={lectureRealtimeLines}
      audioLevel={lectureAudioLevel}
      onRetryRealtime={handleRetryLectureRealtime}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {isClassroomMode && currentLecture && (
        <div className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 ${isClassroomPaused ? 'border-amber-100 bg-amber-50/80' : 'border-rose-100 bg-rose-50/80'}`}>
          <div className={`flex min-w-0 items-center gap-2 text-xs font-semibold ${isClassroomPaused ? 'text-amber-700' : 'text-rose-700'}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {!isClassroomPaused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-50" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isClassroomPaused ? 'bg-amber-400' : 'bg-rose-500'}`} />
            </span>
            <Mic className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {isClassroomPaused ? '课堂录音与 ElevenLabs 字幕已暂停' : '课堂录音与 ElevenLabs 字幕仍在继续'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={isClassroomPaused ? handleResumeClass : handlePauseClass}
              className={`flex h-8 items-center gap-1.5 rounded-lg border bg-white px-3 text-[11px] font-bold ${isClassroomPaused ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}
            >
              {isClassroomPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {isClassroomPaused ? '继续' : '暂停'}
            </button>
            <button
              type="button"
              onClick={() => setIsClassroomPanelVisible(true)}
              className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
            >
              查看课堂字幕
            </button>
            <button
              type="button"
              onClick={handleEndClass}
              className="h-8 rounded-lg bg-rose-500 px-3 text-[11px] font-bold text-white hover:bg-rose-600"
            >
              下课
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">{studyRightPanel}</div>
    </div>
  );

  const rightPanelRailLabel = isClassroomPanelVisible && isClassroomMode && currentLecture
    ? '上课'
    : viewMode === 'skim'
      ? '领读'
      : viewMode === 'tutor'
        ? '问答'
        : '页面工具';

  // 阅读双栏使用剩余空间的 46:54；专用工作区及沉浸拖宽仍沿用原布局。
  const isReadingWorkspaceLayout = (viewMode === 'skim' || viewMode === 'tutor')
    && !(isClassroomPanelVisible && isClassroomMode && currentLecture)
    && !studioExpandedId
    && !isRecordShelfVisible
    && !(viewMode === 'skim' && activeSkim.studyStyle === 'case');
  
  if (!hasStarted) {
    return <WelcomeScreen onStart={() => { setHasStarted(true); setDashboardInitialTab('library'); setShellMode('dashboard'); }} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF7] flex-col space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
        <p className="text-sm font-bold text-slate-500">{uiText('正在连接云端...', 'Connecting to the cloud...')}</p>
      </div>
    );
  }

  if (shellMode === 'dashboard' && !(appMode === 'examWorkspace' && user)) {
    return (
      <div className="min-h-screen bg-[#f7f8f6] font-sans">
        <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
        <DashboardScreen
          user={user}
          cloudUser={isCloudUser(authUser) ? authUser : null}
          onSwitchStorage={() => setUseLocalWorkspace(value => !value)}
          isSyncing={isSyncing}
          isProcessing={isProcessingFile}
          currentFileName={fileName}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onRestoreSession={handleRestoreCloudSession}
          onUpload={handleFileUpload}
          onOpenCurrentStudy={() => setShellMode('study')}
          onOpenExamWorkspace={() => {
            if (!user) {
              setLoginModalOpen(true);
              return;
            }
            setReviewWorkspaceMode('home');
            setReviewEntryPickLecture(false);
            setAppMode('examWorkspace');
          }}
          profileNotebook={profileNotebook}
          onProfileNotebookChange={commitProfileNotebook}
          language={appLanguage}
          onLanguageChange={handleAppLanguageChange}
          initialTab={dashboardInitialTab}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#FFFBF7] font-sans">
      {isCombinedReviewLoading && (
        <div className="fixed inset-0 z-[180] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            <p className="text-sm font-bold text-slate-700">正在拉取并合并文档...</p>
          </div>
        </div>
      )}

      <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
      <MicrophoneSetupDialog
        open={microphoneSetupOpen}
        onClose={closeMicrophoneSetup}
        onStart={handleStartClass}
      />

      {summarySession && (
        <div className="fixed inset-0 z-[220] bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-stone-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">本次学习小结</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {summarySession.fileName} · {formatDurationShort(summarySession.totalDurationMs)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeProfileSummaryModal}
                className="p-2 rounded-lg text-slate-400 hover:bg-stone-100 hover:text-slate-700"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black text-slate-800">这次记录到的现象</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {buildLocalSessionSummary(summarySession).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>

            {dashboardFeatures.profile && <section className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-800">画像更新建议</h3>
                {isGeneratingProfileSuggestion && (
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在生成
                  </span>
                )}
              </div>

              {profileSuggestionError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {profileSuggestionError}
                </div>
              )}

              {profileSuggestion && (
                <div className="mt-3 space-y-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <p className="text-xs font-black uppercase text-indigo-500">AI 小结</p>
                    <ul className="mt-2 space-y-1 text-sm text-indigo-900">
                      {profileSuggestion.sessionSummary.map((line) => (
                        <li key={line}>· {line}</li>
                      ))}
                    </ul>
                  </div>

                  {profileSuggestionDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {([
                        ['smoothAndStuck', '哪里顺 / 哪里卡'],
                        ['focusDuration', '专注能撑多久'],
                        ['stuckReaction', '卡住时的反应'],
                        ['bestTime', '什么时候状态最好'],
                        ['recentTrend', '最近怎么样'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className={key === 'recentTrend' ? 'md:col-span-2' : ''}>
                          <span className="text-xs font-black text-slate-400 uppercase">{label}</span>
                          <textarea
                            value={profileSuggestionDraft[key]}
                            onChange={(event) => setProfileSuggestionDraft((prev) => prev ? { ...prev, [key]: event.target.value } : prev)}
                            className="mt-1 w-full h-24 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 outline-none resize-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeProfileSummaryModal}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                {dashboardFeatures.profile ? '跳过这次' : '关闭小结'}
              </button>
              {dashboardFeatures.profile && <><button
                type="button"
                onClick={handleSaveProfileSuggestionForLater}
                disabled={!profileSuggestion}
                className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                稍后再看
              </button>
              <button
                type="button"
                onClick={handleAcceptProfileSuggestion}
                disabled={!profileSuggestionDraft}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40"
              >
                保存当前建议
              </button></>}
            </div>
          </div>
        </div>
      )}

      {user && examHubOpen && (
        <ExamHubModal
          open={examHubOpen}
          onClose={() => setExamHubOpen(false)}
          user={user}
          initialTab={examHubInitialTab}
          fileHash={fileHash}
          cloudSessionId={currentSessionId}
          fileName={fileName}
          filePersistedState={filePersistedSnapshot}
          onExecuteFlowStep={navigateStudyFlowStep}
          onOpenReviewTool={openReviewToolFromExamHub}
          onBuildMaintenanceContent={buildMaintenanceMergedContent}
        />
      )}

      <HistoryModal 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={historyItems}
        onSelect={handleSelectHistory}
        onDelete={handleDeleteHistory}
      />

      {lectureTranscriptPageOpen && (
        <LectureTranscriptPage
          lectureHistory={lectureHistory}
          onClose={() => setLectureTranscriptPageOpen(false)}
          onOrganize={handleOrganizeLecture}
          organizingId={organizingLectureId}
          onTranscribe={handleTranscribeLecture}
          transcribingId={transcribingLectureId}
          onDelete={handleDeleteLecture}
          onRename={handleRenameLecture}
          onImportAudio={handleImportLectureAudio}
          onOpenSourcePage={(lecture, pageNumber) => {
            const isSameMaterial = lecture.sourceFileHash
              ? lecture.sourceFileHash === fileHash
              : Boolean(
                  lecture.sourceFileName &&
                  fileName &&
                  lecture.sourceFileName === fileName
                );

            if (!isSameMaterial || slides.length === 0) {
              alert(
                `请先打开关联课件「${lecture.sourceFileName || '未知课件'}」，再跳转到第 ${pageNumber} 页。`
              );
              return;
            }

            setCurrentIndex(
              Math.max(0, Math.min(pageNumber - 1, slides.length - 1))
            );
            setLectureTranscriptPageOpen(false);
          }}
        />
      )}

      {reviewPageOpen && (
        <ReviewPage
          user={user}
          hasCurrentDoc={!!(fullPdfText || pdfDataUrl)}
          currentDocName={fileName}
          currentSessionId={currentSessionId}
          onLogin={() => { setReviewPageOpen(false); handleLogin(); }}
          onLibrary={() => { setReviewPageOpen(false); setDashboardInitialTab('library'); setShellMode('dashboard'); }}
          onClose={() => setReviewPageOpen(false)}
          onStartReview={handleStartReview}
          onRemoveSavedArtifact={removeArtifact}
          trapCount={trapList.length}
        />
      )}

      <GalgameSettings 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onSetAvatar={setCustomAvatarUrl}
        onSetBackground={setCustomBackgroundUrl}
        initialPersona={personaSettings}
        onSavePersona={setPersonaSettings}
      />

      <GalgameOverlay 
        isVisible={isGalgameMode}
        onClose={() => setIsGalgameMode(false)}
        slide={currentSlide}
        slides={slides}
        onNextSlide={handleNext}
        onPrevSlide={handlePrev}
        chatHistory={currentSlide ? (galgameChatCache[currentSlide.id] || []) : []}
        onSendChat={handleSendGalgameChat}
        isLoading={isGalgameLoading}
        fullText={fullPdfText}
        customAvatarUrl={customAvatarUrl}
        customBackgroundUrl={customBackgroundUrl} 
        personaSettings={personaSettings} 
      />

      {reviewCacheWarning && <div role="status" className="fixed bottom-4 left-4 z-[400] max-w-md rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{reviewCacheWarning}</div>}
      {/* 复习方式选择（多选一起复习后） */}
      {reviewModeChooserOpen && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="review-tools-dialog w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-2">学习工具</h3>
            <p className="text-sm text-slate-500 mb-4">基于 {combinedReviewFileName} 进行复习</p>

            <StudyToolMenu initialPractice={practiceChooserOpen} trapCount={trapList.length} onSelect={(type) => { setReviewModeChooserOpen(false); openReviewPanelByType(type); }} />

            <button onClick={clearCombinedReview} className="mt-4 w-full py-2 text-slate-500 text-sm hover:text-slate-700">取消</button>
          </div>
        </div>
      )}

      {/* 复习：Quiz */}
      {reviewPanel === 'quiz' && (
        <QuizReviewPanel
          onClose={() => { setReviewPanel(null); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          practiceKind={quizPracticeKind}
          existingRounds={sourceReviewRounds}
          onSaveRounds={(rounds) => {
            setReviewQuizRounds(prev => [...prev.filter(r => r.sourceKey ? r.sourceKey !== notesSourceKey : !reviewingCurrentFile), ...rounds.map(r => ({ ...r, sourceKey: notesSourceKey }))]);
            const sourceName = combinedReviewFileName || fileName || '文档';
            const lastRound = rounds[rounds.length - 1];
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'quiz',
              sourceKey: notesSourceKey,
              title: `测验 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { roundIndex: rounds.length - 1, questionCount: lastRound?.items?.length ?? 0 }
            });
          }}
          onAddToTrap={(data) => {
            const trap: TrapItem = {
              id: `trap-${Date.now()}`,
              question: data.question,
              options: data.options,
              correctIndex: data.correctIndex,
              userSelectedIndex: data.userSelectedIndex,
              explanation: data.explanation,
              source: combinedReviewFileName ?? fileName ?? undefined,
              createdAt: Date.now()
            };
            setTrapList(prev => [...prev, trap]);
          }}
        />
      )}

      {/* 复习：Flash Card */}
      {reviewPanel === 'flashcard' && (
        <FlashCardReviewPanel
          onClose={() => { setReviewPanel(null); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onOpenNotes={() => { setReviewPanel(null); setStudyGuidePanel(true); }}
          hasNoteConcepts={!!sourceStudyGuide?.content.coreConcepts?.length}
          existingCards={sourceReviewCards}
          savedEstimate={reviewingCurrentFile ? flashCardEstimate : undefined}
          onSaveCards={(cards) => {
            setReviewFlashCards(prev => [...prev.filter(c => c.sourceKey ? c.sourceKey !== notesSourceKey : !reviewingCurrentFile), ...cards.map(c => ({ ...c, sourceKey: notesSourceKey }))]);
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'flashcard',
              sourceKey: notesSourceKey,
              title: `闪卡 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { count: cards.length }
            });
          }}
          onSaveEstimate={(n) => { if (reviewingCurrentFile) setFlashCardEstimate(n); }}
        />
      )}

      {/* 页面标记面板 */}
      {isMarkPanelOpen && fileName && (
        <PageMarkPanel
          pageNumber={currentIndex + 1}
          existingMarks={pageMarks[fileName]?.[currentIndex + 1] || []}
          onSave={(marks: PageMark[]) => {
            setPageMarks(prev => {
              const newMarks = { ...prev };
              if (!newMarks[fileName]) newMarks[fileName] = {};
              if (marks.length === 0) {
                delete newMarks[fileName][currentIndex + 1];
              } else {
                newMarks[fileName][currentIndex + 1] = marks;
              }
              return newMarks;
            });
          }}
          onClose={() => setIsMarkPanelOpen(false)}
        />
      )}

      {/* 费曼检验面板 */}
      {feynmanPanelOpen && (
        <FeynmanPanel
          practiceOnly
          onWrongAnswer={(item) => setTrapList(prev => [...prev, {
            id: `trap-written-${Date.now()}`, answerKind: 'written', question: item.question,
            userAnswer: item.userAnswer, referenceAnswer: item.referenceAnswer,
            options: [], correctIndex: -1, userSelectedIndex: -1, explanation: item.feedback,
            source: combinedReviewFileName ?? fileName ?? undefined, createdAt: Date.now(),
          }])}
          onClose={() => { setFeynmanPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onSaveToStudio={(markdown, title) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'feynman',
              sourceKey: notesSourceKey,
              title: title ? `${title} · ${sourceName}` : `费曼大白话 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { markdown }
            });
          }}
        />
      )}

      {/* 考前速览面板 */}
      {examSummaryPanelOpen && (
        <ExamSummaryPanel
          onClose={() => { setExamSummaryPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          initialMarkdown={examSummaryContentKey ? examSummaryCache[examSummaryContentKey] : null}
          onGenerated={(markdown) => {
            if (examSummaryContentKey) setExamSummaryCache((prev) => ({ ...prev, [examSummaryContentKey]: markdown }));
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'examSummary',
              title: `考前速览 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { markdown }
            });
          }}
        />
      )}

      {/* 考点与陷阱面板 */}
      {examTrapsPanelOpen && (
        <ExamTrapsPanel
          onClose={() => { setExamTrapsPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onGenerated={(markdown) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'examTraps',
              title: `考点与陷阱 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { markdown }
            });
          }}
        />
      )}

      {/* 考前预测面板 */}
      {examPredictionPanelOpen && (
        <ExamPredictionPanel
          onClose={() => { setExamPredictionPanelOpen(false); setExamPredictionInitialKCId(null); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          contentKey={examSummaryContentKey}
          displayFileName={combinedReviewFileName ?? fileName ?? '当前文档'}
          onJumpToPage={slides.length > 0 ? (page) => setCurrentIndex(Math.max(0, Math.min(page - 1, slides.length - 1))) : undefined}
          initialContentMap={lsapContentMap?.sourceKey === examSummaryContentKey ? lsapContentMap : null}
          initialLSAPState={lsapContentMap?.sourceKey === examSummaryContentKey ? lsapState : null}
          initialKCId={examPredictionInitialKCId}
          onSaveState={(map, state) => {
            setLsapContentMap(map);
            setLsapState(state);
          }}
        />
      )}

      {/* 术语精确定义面板 */}
      {terminologyPanelOpen && (
        <TerminologyPanel
          onClose={() => { setTerminologyPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onGenerateFlashCards={(terms) => {
            const now = Date.now();
            const newCards: FlashCard[] = terms.map((t, i) => ({
              id: `term-${now}-${i}`,
              front: t.term,
              back: t.definition,
              createdAt: now
            }));
            setReviewFlashCards(prev => [...prev, ...newCards]);
            setTerminologyPanelOpen(false);
            setReviewModeChooserOpen(false);
            setReviewPanel('flashcard');
          }}
          onSaveToStudio={(terms) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'terminology',
              title: `术语定义 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { terms: terms.map((t) => ({ term: t.term, definition: t.definition, keyWords: t.keyWords })) }
            });
          }}
        />
      )}

      {/* 刁钻教授面板 */}
      {trickyProfessorPanelOpen && (
        <TrickyProfessorPanel
          onClose={() => { setTrickyProfessorPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onGenerated={(markdown) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'trickyProfessor',
              title: `刁钻教授 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { markdown }
            });
          }}
        />
      )}

      {/* 思维导图面板 */}
      {mindMapPanelOpen && (
        <MindMapPanel
          initialPayload={sourceMindMap}
          onClose={() => { setMindMapPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          fileNames={combinedReviewFileNames}
          displayName={combinedReviewFileName}
          onSaveToStudio={(payload) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            const title = 'tree' in payload ? `思维导图 · ${sourceName}` : `思维导图（多文档） · ${sourceName}`;
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'mindMap',
              sourceKey: notesSourceKey,
              title,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(
                combinedReviewFileNames ?? ('multiResult' in payload ? payload.multiResult.perDoc.map((d) => d.fileName) : null),
                combinedReviewFileName,
                fileName
              ),
              payload
            });
          }}
        />
      )}

      {/* 多文档问答面板 */}
      {multiDocQAPanelOpen && combinedReviewContent && multiDocQAConversationKey && (
        <MultiDocQAPanel
          onClose={() => { setMultiDocQAPanelOpen(false); setMultiDocQAConversationKey(null); clearCombinedReview(); }}
          docContent={combinedReviewContent.startsWith('data:') ? (fullPdfText || combinedReviewContent) : combinedReviewContent}
          docLabel={combinedReviewFileName ?? '当前文档'}
          conversationKey={multiDocQAConversationKey}
          initialMessages={multiDocQAInitialMessages}
          onMessagesChange={(messages) => saveMultiDocQAMessages(multiDocQAConversationKey, messages)}
        />
      )}

      {/* 陷阱清单面板 */}
      {trapListPanelOpen && (
        <TrapListPanel
          onClose={() => setTrapListPanelOpen(false)}
          items={trapList}
          onRemove={(id) => setTrapList(prev => prev.filter(t => t.id !== id))}
          onSaveToStudio={
            trapList.length > 0
              ? () => {
                  const sourceName = combinedReviewFileName || fileName || '文档';
                  addArtifact({
                    id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    type: 'trapList',
                    title: `陷阱清单 · ${sourceName}`,
                    createdAt: Date.now(),
                    sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
                    payload: { itemIds: trapList.map((t) => t.id) }
                  });
                }
              : undefined
          }
        />
      )}

      {/* Study Guide 面板 */}
      {studyGuidePanel && (
        <StudyGuidePanel
          onClose={() => { setStudyGuidePanel(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          fileName={combinedReviewFileName ?? fileName}
          cacheReady={reviewCacheReady}
          existingGuide={sourceStudyGuide}
          sourceKey={notesSourceKey}
          legacyArtifacts={sourceReviewArtifacts}
          onOpenMindMap={() => { setStudyGuidePanel(false); setMindMapPanelOpen(true); }}
          onCreateCards={(concepts) => {
            const now = Date.now();
            setReviewFlashCards(prev => {
              const keys = new Set(prev.filter(c => c.sourceKey ? c.sourceKey === notesSourceKey : reviewingCurrentFile).map(c => `${c.front.trim()}\n${c.back.trim()}`));
              const additions = concepts.filter(c => { const key = `${c.term.trim()}\n${c.definition.trim()}`; if (keys.has(key)) return false; keys.add(key); return true; });
              return [...prev, ...additions.map((c, i) => ({ id: `notes-card-${now}-${i}`, sourceKey: notesSourceKey, front: c.term, back: c.definition, createdAt: now }))];
            });
            setStudyGuidePanel(false); setReviewPanel('flashcard');
          }}
          onSaveGuide={(guide) => {
            if (sourceStudyGuide && !savedArtifacts.some(a => a.type === 'studyGuide' && a.payload.id === sourceStudyGuide.id)) {
              addArtifact({ id: `legacy-guide-${sourceStudyGuide.id}`, type: 'studyGuide', sourceKey: notesSourceKey, title: `以前的学习指南 · ${sourceStudyGuide.fileName}`, createdAt: sourceStudyGuide.createdAt, sourceLabel: notesSourceLabel, payload: sourceStudyGuide });
            }
            if (!combinedReviewContent || (!combinedReviewFileNames?.length && combinedReviewFileName === fileName)) setStudyGuide(guide);
            const title = guide.content?.chapters?.[0]?.title || guide.fileName || '学习指南';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'studyGuide',
              sourceKey: notesSourceKey,
              title,
              createdAt: guide.createdAt,
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: guide
            });
          }}
        />
      )}

      {/* 海龟汤 */}
      {turtleSoupOpen && (
        <TurtleSoupPanel
          isOpen={turtleSoupOpen}
          onClose={() => setTurtleSoupOpen(false)}
          state={turtleSoupState}
          onUpdateState={setTurtleSoupState}
          completedSegmentsCount={completedSegmentsCount}
          onConsumeSegment={() => setCompletedSegmentsCount((c) => Math.max(0, c - 1))}
        />
      )}

      <input
        type="file"
        ref={hiddenFileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,image/*"
        className="hidden"
      />

      {appMode === 'examWorkspace' && user ? (reviewWorkspaceMode === 'home' ? (
        <ReviewWorkspaceEntry user={user} currentMaterial={currentLectureReviewMaterial} initialPick={reviewEntryPickLecture}
          onLecture={startLectureReview} onExam={() => setReviewWorkspaceMode('exam')}
          onBack={() => setAppMode('study')}
          onLibrary={() => { setAppMode('study'); setShellMode('dashboard'); setDashboardInitialTab('library'); }}
        />
      ) : (
        <ExamWorkspacePage
          key={`${user.uid}:${reviewWorkspaceMode}:${standaloneMaterial?.id ?? 'exam'}`}
          standaloneMaterial={standaloneMaterial}
          onChooseReviewScope={() => { setReviewEntryPickLecture(false); setReviewWorkspaceMode('home'); }}
          onChooseLecture={() => { setReviewEntryPickLecture(true); setReviewWorkspaceMode('home'); }}
          user={user}
          activeExamId={activeExamId}
          onActiveExamIdChange={setActiveExamId}
          onBack={() => setAppMode('study')}
          onOpenExamHub={() => {
            setExamHubInitialTab('exams');
            setExamHubOpen(true);
          }}
          onEnterExamPrediction={handleWorkspaceEnterPrediction}
          onLoadMergedContent={getMergedDocContentForExamLinks}
          onLoadProbeMaterialText={loadExamWorkspaceMaterialTextForProbe}
          workspaceLsapContentMap={workspaceLsapContentMap}
          workspaceLsapState={workspaceLsapState}
          onWorkspaceLsapStateCommit={commitWorkspaceLsapState}
          predictedScore={workspacePredictedScore}
          onGenerateWorkspaceLsap={handleGenerateWorkspaceLsap}
          onPrepareLectureKnowledge={handlePrepareLectureKnowledge}
          workspaceLsapGenerating={workspaceLsapGenerating}
          workspaceLsapProgress={workspaceLsapProgress}
          workspaceAtomsProgress={workspaceAtomsProgress}
          workspaceAtomCoverage={workspaceAtomCoverage}
          onExtractLogicAtoms={handleExtractLogicAtoms}
          workspaceAtomsGenerating={workspaceAtomsGenerating}
          onWorkspaceAtomCoverageChange={handleWorkspaceAtomCoverageChange}
          workspaceDialogueTranscript={workspaceDialogueTranscript}
          workspaceEvidenceAnnotations={workspaceEvidenceAnnotations}
          workspaceLsapKey={workspaceLsapKey}
          onWorkspaceDialogueTranscriptChange={handleWorkspaceDialogueTranscriptChange}
          onWorkspaceEvidenceAnnotationsChange={handleWorkspaceEvidenceAnnotationsChange}
          workspaceKcGlossary={workspaceKcGlossary}
          onWorkspaceGlossaryAppend={handleWorkspaceGlossaryAppend}
          resolveExamMaterialPdf={resolveExamMaterialPdf}
        />
      )) : (
        <>
      <section className={`craft-learning-shell reading-workspace-shell h-screen flex flex-col relative z-20 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] ${isImmersive ? 'bg-[#F3F4F6]' : ''}`}>
        {isEmbeddedDev && !devBannerDismissed && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shrink-0">
            <span>上传 PDF 在 Cursor 预览中可能受限，建议用 Chrome 打开 <strong>http://localhost:3000</strong> 进行开发调试。</span>
            <button type="button" onClick={() => setDevBannerDismissed(true)} className="shrink-0 px-2 py-1 rounded hover:bg-amber-100 font-medium">关闭</button>
          </div>
        )}
        {commonHeader}

        {fileName && slides.length > 0 && (
          <div className="craft-study-strip reading-study-strip shrink-0 border-b">
            <div className="reading-study-strip-main">
              <div className="reading-study-status">
                <span className={`reading-study-dot ${activeStudyStartedAt ? 'is-recording' : ''}`} aria-hidden="true" />
                <span>本次学习</span>
                <span className="reading-study-state">{activeStudyStartedAt ? '记录中' : '未开始记录'}</span>
                {activeStudyStartedAt && <span className="reading-study-elapsed">{formatDurationShort(activeStudyElapsedMs)}</span>}
                <details className="reading-study-help">
                  <summary aria-label="学习记录说明" title="学习记录说明"><Info className="h-3.5 w-3.5" /></summary>
                  <p>开始后记录页面停留、离开和回来，不记录聊天内容。你可以随时开始或结束记录。</p>
                </details>
              </div>
              <span className="reading-study-description">{activeStudyStartedAt ? `当前原文第 ${currentIndex + 1} / ${slides.length} 页` : '只记录停留、离开和回来'}</span>
              <button
                type="button"
                onClick={activeStudyStartedAt ? handleEndStudySession : handleStartStudySession}
                disabled={isProcessingFile}
                className={`reading-study-action ${activeStudyStartedAt ? 'is-recording' : ''}`}
              >
                {activeStudyStartedAt ? '结束本次学习' : '开始学习'}
              </button>
            </div>
          </div>
        )}
        
        {false && fileName && !isImmersive && (
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="fixed bottom-6 right-6 z-[60] bg-white p-3 rounded-full shadow-xl border border-stone-100 text-purple-500 hover:text-purple-600 hover:bg-purple-50 hover:scale-110 transition-all group"
                title="✨ AI 场景工坊"
            >
                <Wand2 className="w-6 h-6" />
                <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    定制专属场景
                </span>
            </button>
        )}

        <main className={`reading-workspace-main flex-1 flex overflow-hidden relative ${isReadingWorkspaceLayout && !isImmersive && !isSidePanelCollapsed ? 'is-reading-layout' : ''}`}>
          {isOpeningStudyFile && (
            <div className="absolute inset-0 z-[170] flex items-center justify-center bg-white/85 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-100 bg-white px-8 py-6 shadow-xl shadow-stone-200/60">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <div className="text-center">
                  <p className="text-sm font-black text-slate-800">正在打开资料</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">正在恢复页面、笔记和领读状态...</p>
                </div>
              </div>
            </div>
          )}
          
          <div className={`reading-page-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
          <Sidebar 
            isOpen={isSidebarOpen}
            totalPages={slides.length} 
            currentPage={currentIndex + 1} 
            onJumpToPage={handleJumpToPage}
            pageThumbnails={pageThumbnails}
            hasPdfLoaded={!!fileName && slides.length > 0}
            onOpenQuiz={() => setReviewPanel('quiz')}
            onOpenFlashCard={() => setReviewPanel('flashcard')}
            onOpenStudyGuide={() => setStudyGuidePanel(true)}
            onOpenTrapList={() => setTrapListPanelOpen(true)}
            trapCount={trapList.length}
            pageMarks={pageMarks}
            fileName={fileName}
            user={user}
            onLogin={handleLogin}
            onRestoreSession={handleRestoreCloudSession}
            onDeleteSession={handleDeleteSession}
          />
          </div>
          
          <div
            ref={leftPanelRef}
            className={`craft-reader-canvas relative flex min-w-0 flex-col border-r border-stone-200 transition-[width] duration-0 ease-linear h-full ${isImmersive ? '' : 'flex-1'}`}
            style={isImmersive ? { width: isSidePanelCollapsed ? 'calc(100% - 48px)' : `${leftPanelWidth}%` } : undefined}
          >
              <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
                  {isRecordShelfVisible && activeSkim.recordDeck ? (
                    <SkimRecordShelf
                      deck={activeSkim.recordDeck}
                      pageThumbnails={pageThumbnails}
                      onOpenRecord={handleOpenSkimRecord}
                      onFocusRecord={handleFocusSkimRecord}
                    />
                  ) : commonSlideViewer}
                  {renderVideoOverlay()}
              </div>
              {currentSlide && !isRecordShelfVisible && (
                <>
                  {notesPanelCollapsed ? (
                    <button
                      type="button"
                      onClick={() => setNotesPanelCollapsed(false)}
                      className="flex-shrink-0 flex items-center justify-center gap-2 py-2 border-t border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-500 hover:text-stone-700 text-xs font-medium transition-colors"
                      title="展开本页注释"
                    >
                      <span className="uppercase tracking-wider">本页注释</span>
                      {(pageComments[currentSlide.id] || []).length > 0 && (
                        <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[10px]">
                          {(pageComments[currentSlide.id] || []).length}
                        </span>
                      )}
                    </button>
                  ) : (
                    <>
                      <div
                        onMouseDown={handleNotesSplitterStart}
                        className="flex-shrink-0 h-1.5 bg-stone-300 hover:bg-indigo-400 cursor-row-resize z-30 flex items-center justify-center transition-colors hover:h-2 group"
                        title="上下拖动调整本页注释高度"
                      >
                        <div className="w-12 h-0.5 rounded-full bg-stone-400 group-hover:bg-indigo-500 transition-colors" />
                      </div>
                      <div
                        className="flex-shrink-0 min-h-[120px] overflow-hidden flex flex-col"
                        style={{ height: `${notesPanelHeightPercent}%` }}
                      >
                        <SlidePageComments
                          slideId={currentSlide.id}
                          comments={pageComments[currentSlide.id] || []}
                          onAdd={handleAddPageComment}
                          onUpdate={handleUpdatePageComment}
                          onDelete={handleDeletePageComment}
                          onReorder={handleReorderPageComments}
                          onResize={handleResizePageComment}
                          onCollapse={() => setNotesPanelCollapsed(true)}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
          </div>

          {isImmersive && !isSidePanelCollapsed && (
            <div
              onMouseDown={handleDragSplitterStart} 
              className="w-1.5 bg-stone-200 hover:bg-indigo-400 cursor-col-resize z-50 flex items-center justify-center transition-colors shadow-sm relative -ml-[3px]" 
              title="左右拖动调整宽度"
            ></div>
          )}

          <div
            className={`craft-reader-panel flex flex-col h-full relative z-20 transition-all duration-300 ${
              isSidePanelCollapsed
                ? 'w-12 shrink-0 border-l border-stone-200'
                : isImmersive
                  ? 'flex-1 min-w-[300px]'
                  : 'shrink-0 border-l border-stone-100 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.03)]'
            }`}
            style={!isImmersive && !isSidePanelCollapsed && !isReadingWorkspaceLayout ? { width: 'clamp(400px, 34vw, 560px)' } : undefined}
          >
            {isSidePanelCollapsed ? (
              <div className="h-full w-full flex flex-col items-center bg-stone-50">
                <button
                  type="button"
                  onClick={() => setIsSidePanelCollapsed(false)}
                  className="mt-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-stone-200 hover:bg-indigo-50 hover:text-indigo-600 hover:ring-indigo-200 transition-colors"
                  title="展开右侧面板"
                  aria-label="展开右侧面板"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
                <div className="mt-5 select-none text-[11px] font-black tracking-[0.25em] text-slate-400 [writing-mode:vertical-rl]">
                  {rightPanelRailLabel}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsSidePanelCollapsed(true)}
                  className="absolute -left-4 top-4 z-[90] flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-slate-400 shadow-sm ring-1 ring-stone-200 backdrop-blur hover:bg-indigo-50 hover:text-indigo-600 hover:ring-indigo-200 transition-colors"
                  title="收起右侧面板"
                  aria-label="收起右侧面板"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
                {studioExpandedId ? (() => {
                  const artifact = savedArtifacts.find((a) => a.id === studioExpandedId);
                  return artifact ? (
                    <ArtifactFullView
                      artifact={artifact}
                      onClose={() => setStudioExpandedId(null)}
                      onOpenQuiz={() => { setStudioExpandedId(null); setReviewPanel('quiz'); }}
                      onOpenFlashcard={() => { setStudioExpandedId(null); setReviewPanel('flashcard'); }}
                      onOpenTrapList={() => { setStudioExpandedId(null); setTrapListPanelOpen(true); }}
                    />
                  ) : commonRightPanel;
                })() : commonRightPanel}
              </>
            )}
          </div>

          {fileName && slides.length > 0 && !isClassroomMode && (
            <div className={`reading-studio-dock ${studioCollapsed ? 'is-collapsed' : 'is-expanded'}`}>
            <StudioPanel
              artifacts={savedArtifacts}
              expandedId={studioExpandedId}
              onToggleExpand={setStudioExpandedId}
              onDelete={removeArtifact}
              isCollapsed={studioCollapsed}
              onToggleCollapse={() => setStudioCollapsed((c) => !c)}
              onOpenQuiz={() => setReviewPanel('quiz')}
              onOpenFlashcard={() => setReviewPanel('flashcard')}
              onOpenTrapList={() => setTrapListPanelOpen(true)}
            />
            </div>
          )}
        </main>
        {!isImmersive && slides.length > 0 && fileName && (() => {
          const pageNotes = notebookData[fileName] || {};
          const hasNotesBelow = Object.values(pageNotes).some((notes) => Array.isArray(notes) && notes.length > 0);
          return hasNotesBelow ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-stone-300 animate-bounce flex flex-col items-center cursor-pointer pointer-events-none z-30 opacity-80">
              <span className="text-xs font-bold tracking-widest uppercase mb-1">Scroll Down</span>
              <ChevronDown className="w-6 h-6" />
            </div>
          ) : null;
        })()}
      </section>

      {!isImmersive && (
        <>
          <section className="craft-notebook-section pt-10 pb-24 relative z-10">
             <Notebook fileName={fileName} notes={fileName ? (notebookData[fileName] || {}) : {}} onUpdateNote={handleUpdateNote} onDeleteNote={handleDeleteNote} />
             <footer className="mt-10 text-center text-stone-300 text-sm font-bold tracking-widest">逃课神器 · POWERED BY GPT-6 ASTRA</footer>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
};

export default App;
