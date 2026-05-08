
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { Header } from '@/shared/layout/Header';
import { SlideViewer } from '@/features/reader/slide-viewer/SlideViewer';
import { SlidePageComments } from '@/features/reader/page-notes/SlidePageComments';
import { ExplanationPanel } from '@/features/reader/deep-read/ExplanationPanel';
import { SkimPanel } from '@/features/reader/skim/SkimPanel';
import { Sidebar } from '@/shared/layout/Sidebar';
import { TaskHug } from '@/features/energyRefuel/TaskHug';
import { ChatHug } from '@/features/energyRefuel/ChatHug';
import { Notebook } from '@/features/reader/notebook/Notebook';
import { HistoryModal } from '@/shared/history/HistoryModal';
import { GalgameOverlay } from '@/components/GalgameOverlay';
import { GalgameSettings } from '@/components/GalgameSettings'; 
import { WelcomeScreen } from '@/shared/layout/WelcomeScreen';
import { SideQuestPanel } from '@/features/reader/side-quest/SideQuestPanel';
import { LayeredReadingPanel } from '@/features/reader/layered/LayeredReadingPanel';
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
import { MoodDialog } from '@/features/sessionStart/MoodDialog';
import { LoginModal } from '@/shared/auth/LoginModal';
import { FiveMinFlowPanel } from '@/features/sessionStart/FiveMinFlowPanel';
import { ClassroomPanel } from '@/features/lecture/ClassroomPanel';
import { LectureTranscriptPage } from '@/features/lecture/LectureTranscriptPage';
import { ReviewPage, ReviewType } from '@/features/review/ReviewPage';
import { TurtleSoupPanel } from '@/features/turtleSoup/TurtleSoupPanel';
import { ExamPredictionPanel } from '@/features/exam/ExamPredictionPanel';
import { ExamHubModal } from '@/features/exam/ExamHubModal';
import { ExamWorkspacePage } from '@/features/exam/workspace/ExamWorkspacePage';
import { convertPdfToImages, readFileAsDataURL, extractPdfText, generateFileHash, fetchFileFromUrl } from '@/lib/pdf/pdfUtils';
import { buildArtifactSourceLabel } from '@/shared/lib/artifactSourceLabel';
import { generateSlideExplanation, chatWithSlide, performPreFlightDiagnosis, classifyDocument, generatePersonaStoryScript, runSideQuestAgent, organizeLectureFromTranscript, generateLSAPContentMap, generateLogicAtomsForContentMap } from '@/services/geminiService';
import { startRecording, stopRecording, isTranscriptionSupported } from '@/services/transcriptionService';
import { storageService } from '@/services/storageService';
import { auth, logoutUser, uploadPDF, createCloudSession, updateCloudSessionState, deleteCloudSession, fetchSessionDetails, isEmailLinkSignIn, completeEmailLinkSignIn, getUserSessions, listExamMaterialLinks } from '@/services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Slide, ExplanationCache, ChatCache, ChatMessage, NotebookData, Note, AnnotationCache, SlideAnnotation, StudyMap, ViewMode, FileHistoryItem, SkimStage, QuizData, DocType, FilePersistedState, PersonaSettings, CloudSession, SideQuestState, QuizRound, FlashCard, TrapItem, PageMarks, PageMark, StudyGuide, LectureRecord, TurtleSoupState, PageCommentsCache, SlidePageComment, SavedArtifact, LSAPContentMap, LSAPState, LSAPBKTState, LSAPKnowledgeComponent, DailySegment, StudyFlowStep, ExamMaterialLink, AtomCoverageByKc, KcGlossaryEntry, LayeredReadingState } from '@/types';
import {
  computeExamWorkspaceLsapKey,
  loadWorkspaceLsapBundle,
  mergeAtomCoverageForMap,
  saveWorkspaceLsapBundle,
  truncateWorkspaceDialogue,
  type WorkspaceDialogueTurn,
} from '@/features/exam/lib/examWorkspaceLsapKey';
import { computePredictedScore } from '@/features/exam/lib/lsapScore';
import { normalizeTermKey } from '@/lib/text/extractBoldTermsFromMarkdown';
import { Sparkles, X, ChevronDown, Loader2, Wand2 } from 'lucide-react';

/** P0 备考工作台：当前考试 ID 存 localStorage */
const EXAM_WORKSPACE_ACTIVE_EXAM_LS = 'examWorkspace_activeExamId';

/** P2：备考台按单份材料抽逻辑原子时与 KC 图谱单份上限一致（120000），避免仍被 4 万截断 */
const LSAP_ATOMS_PER_MATERIAL_MAX_CHARS = 120_000;

// #region agent log
const _debugLog = (location: string, message: string, data: Record<string, unknown>) => {
  const entry = { location, message, data, timestamp: Date.now() };
  (window as unknown as { __debugLog?: unknown[] }).__debugLog = (window as unknown as { __debugLog?: unknown[] }).__debugLog || [];
  (window as unknown as { __debugLog: unknown[] }).__debugLog.push(entry);
  fetch('http://127.0.0.1:7242/ingest/f7788da6-7262-4420-bc72-576f23e0b7d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,hypothesisId:'H1'})}).catch(()=>{});
};
// #endregion

const cleanHtmlToText = (html: string): string => {
  if (!html) return '';
  const temp = document.createElement('div');
  let processed = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n');
  temp.innerHTML = processed;
  return temp.innerText.trim();
};

const DEFAULT_PERSONA: PersonaSettings = {
    charName: '蕾姆',
    userNickname: '昂君',
    relationship: '爱慕者',
    personality: '温柔体贴'
};

const App: React.FC = () => {
  // --- STATE DECLARATIONS ---
  const [hasStarted, setHasStarted] = useState(false);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [explanations, setExplanations] = useState<ExplanationCache>({});
  const [chatCache, setChatCache] = useState<ChatCache>({});
  const [annotations, setAnnotations] = useState<AnnotationCache>({});
  const [pageComments, setPageComments] = useState<PageCommentsCache>({});
  const [skimMessages, setSkimMessages] = useState<ChatMessage[]>([]);
  const [skimTopHeight, setSkimTopHeight] = useState(60);
  const [viewMode, setViewMode] = useState<ViewMode>('deep');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null); 
  
  const [docType, setDocType] = useState<DocType>('STEM');
  const [skimStage, setSkimStage] = useState<SkimStage>('diagnosis');
  const [quizData, setQuizData] = useState<QuizData | null>(null);

  const [isGalgameMode, setIsGalgameMode] = useState(false);
  const [galgameChatCache, setGalgameChatCache] = useState<ChatCache>({});
  const [isGalgameLoading, setIsGalgameLoading] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [personaSettings, setPersonaSettings] = useState<PersonaSettings>(DEFAULT_PERSONA);

  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [studyMap, setStudyMap] = useState<StudyMap | null>(null);
  const [studyMapModuleCount, setStudyMapModuleCount] = useState<number | null>(null);
  /** 递进阅读模式独立 state，与 studyMap 完全无关（铁律 2，详见 docs/inquiries/LAYERED_READING_INQUIRY.md §8.G） */
  const [layeredReadingState, setLayeredReadingState] = useState<LayeredReadingState | null>(null);
  const [fullPdfText, setFullPdfText] = useState<string | null>(null); 
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // --- ENERGY MODE STATE ---
  const [isEnergyMode, setIsEnergyMode] = useState(false);

  // --- 白噪音面板受控（休息改为顶栏下方弹层，不再用独立面板）---
  const [isMusicPanelOpen, setIsMusicPanelOpen] = useState(false);

  // --- 海龟汤 ---
  const [turtleSoupOpen, setTurtleSoupOpen] = useState(false);
  const [turtleSoupState, setTurtleSoupState] = useState<TurtleSoupState | null>(null);

  // --- SIDE QUEST STATE (NEW) ---
  const [sideQuest, setSideQuest] = useState<SideQuestState>({ isActive: false, anchorText: '', messages: [], isLoading: false });
  const [triggerPosition, setTriggerPosition] = useState<{ top: number, left: number, text: string } | null>(null);

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

  // --- Studio 已生成条目（NotebookLM 式右侧持久化）---
  const [savedArtifacts, setSavedArtifacts] = useState<SavedArtifact[]>([]);
  const [studioExpandedId, setStudioExpandedId] = useState<string | null>(null);
  const [studioCollapsed, setStudioCollapsed] = useState(false);

  // --- 一起复习：多选合并内容与方式选择 ---
  const [combinedReviewContent, setCombinedReviewContent] = useState<string | null>(null);
  const [combinedReviewFileName, setCombinedReviewFileName] = useState<string | null>(null);
  const [combinedReviewFileNames, setCombinedReviewFileNames] = useState<string[] | null>(null);
  const [reviewModeChooserOpen, setReviewModeChooserOpen] = useState(false);
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
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  /** 避免登录后立即用 null 覆盖掉 localStorage 里已存的 activeExamId */
  const [examWorkspaceStorageReady, setExamWorkspaceStorageReady] = useState(false);
  const [lsapContentMap, setLsapContentMap] = useState<LSAPContentMap | null>(null);
  const [lsapState, setLsapState] = useState<LSAPState | null>(null);
  /** M1：备考工作台独立 LSAP（键含 userId+exam+材料，存 localStorage） */
  const [workspaceLsapContentMap, setWorkspaceLsapContentMap] = useState<LSAPContentMap | null>(null);
  const [workspaceLsapState, setWorkspaceLsapState] = useState<LSAPState | null>(null);
  const [workspaceLsapKey, setWorkspaceLsapKey] = useState<string | null>(null);
  const [examWorkspaceMaterials, setExamWorkspaceMaterials] = useState<ExamMaterialLink[]>([]);
  const [workspaceLsapGenerating, setWorkspaceLsapGenerating] = useState(false);
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
  /** 与 bundle 保存同步，避免闭包覆盖旧 state */
  const workspaceLsapStateRef = useRef<LSAPState | null>(null);
  const workspaceAtomCoverageRef = useRef<AtomCoverageByKc>({});
  const workspaceDialogueTranscriptRef = useRef<WorkspaceDialogueTurn[]>([]);
  const workspaceKcGlossaryRef = useRef<Record<string, KcGlossaryEntry[]>>({});
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
  const examWorkspaceMaterialsSorted = useMemo(() => {
    if (!activeExamId) return [];
    return [...examWorkspaceMaterials]
      .filter((m) => m.examId === activeExamId)
      .sort((a, b) => (a.sortIndex ?? a.addedAt) - (b.sortIndex ?? b.addedAt));
  }, [activeExamId, examWorkspaceMaterials]);
  const [multiDocQAPanelOpen, setMultiDocQAPanelOpen] = useState(false);
  const [multiDocQAConversationKey, setMultiDocQAConversationKey] = useState<string | null>(null);
  const multiDocQAInitialMessages = useMemo(() => multiDocQAConversationKey ? loadMultiDocQAMessages(multiDocQAConversationKey) : [], [multiDocQAConversationKey]);
  // 学习兴致弹窗 & 5 分钟模式
  const [moodDialogOpen, setMoodDialogOpen] = useState(false);
  const [fiveMinFlowOpen, setFiveMinFlowOpen] = useState(false);
  const [isClassroomMode, setIsClassroomMode] = useState(false);
  const [currentLecture, setCurrentLecture] = useState<LectureRecord | null>(null);
  const [lectureHistory, setLectureHistory] = useState<LectureRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lecture_history') || '[]');
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
  const [transcriptLive, setTranscriptLive] = useState('');
  const transcriptionSupported = useMemo(() => isTranscriptionSupported(), []);
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
  const skipMoodOnNextFileLoadRef = useRef(false);
  const selectionTimeoutRef = useRef<number | null>(null);
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

  /** M1：备考工作台材料；关考试中心后重拉以同步新关联 */
  useEffect(() => {
    if (appMode !== 'examWorkspace' || !user) {
      setExamWorkspaceMaterials([]);
      return;
    }
    listExamMaterialLinks(user).then(setExamWorkspaceMaterials).catch(() => setExamWorkspaceMaterials([]));
  }, [appMode, user, examHubOpen]);

  /** M1：本场 LSAP localStorage 恢复（键随考试+材料变） */
  useEffect(() => {
    if (appMode !== 'examWorkspace' || !user?.uid || !activeExamId) {
      setWorkspaceLsapKey(null);
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
      return;
    }
    if (examWorkspaceMaterialsSorted.length === 0) {
      setWorkspaceLsapKey(null);
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
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
    } else {
      setWorkspaceLsapContentMap(null);
      setWorkspaceLsapState(null);
      setWorkspaceAtomCoverage({});
      setWorkspaceDialogueTranscript([]);
      setWorkspaceKcGlossary({});
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

  // --- SIDE QUEST SELECTION LISTENER (FIXED) ---
  useEffect(() => {
    const handleSelectionChange = () => {
      // Debounce
      if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);

      selectionTimeoutRef.current = window.setTimeout(() => {
        const selection = window.getSelection();
        
        // 1. Validate Selection
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          setTriggerPosition(null);
          return;
        }

        // 2. Ignore Inputs
        if (document.activeElement && (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName))) {
           setTriggerPosition(null);
           return;
        }

        // 3. Calculate Position
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Safety check for invisible rects
          if (rect.width === 0 && rect.height === 0) {
              setTriggerPosition(null);
              return;
          }

          // Force position to BOTTOM to avoid conflict with top buttons (e.g. Note taking)
          setTriggerPosition({
            top: rect.bottom + 12, 
            left: rect.left + (rect.width / 2),
            text: selection.toString().trim()
          });
        } catch (e) {
          setTriggerPosition(null);
        }
      }, 150); // 150ms Debounce
    };

    // 4. Global Click Handler (Click Outside -> Close)
    const handleGlobalMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const triggerBtn = document.getElementById('side-quest-trigger-btn');
        
        // If clicking the button itself, do nothing (let button logic handle it)
        if (triggerBtn && triggerBtn.contains(target)) {
            return;
        }

        // Otherwise (clicking blank space, other elements), hide button
        setTriggerPosition(null);
        
        // Optional: Force clear browser selection to be clean
        // window.getSelection()?.removeAllRanges(); 
    };

    // 5. Scroll Handler (Hide on scroll)
    const handleScroll = () => {
       // Hide immediately on scroll to prevent floating button from drifting
       setTriggerPosition(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('scroll', handleScroll, true); // Capture phase

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
      if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
    };
  }, []);

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
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
          console.log("✅ [App] User Authenticated:", currentUser.uid);
      } else {
          console.log("ℹ️ [App] No User Authenticated");
          setCurrentSessionId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  /** P0：备考工作台当前考试 — 登录后从 localStorage 恢复；登出则回到主界面 */
  useEffect(() => {
    if (!user) {
      setAppMode('study');
      setActiveExamId(null);
      setExamWorkspaceStorageReady(false);
      return;
    }
    try {
      const key = `${EXAM_WORKSPACE_ACTIVE_EXAM_LS}_${user.uid}`;
      const v = localStorage.getItem(key);
      setActiveExamId(v && v.length > 0 ? v : null);
    } catch {
      setActiveExamId(null);
    }
    setExamWorkspaceStorageReady(true);
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !examWorkspaceStorageReady) return;
    try {
      const key = `${EXAM_WORKSPACE_ACTIVE_EXAM_LS}_${user.uid}`;
      if (activeExamId) localStorage.setItem(key, activeExamId);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [activeExamId, user, examWorkspaceStorageReady]);

  // --- AUTO-SAVE (IndexedDB & Cloud) logic omitted for brevity, same as previous ---
  useEffect(() => {
    if (!fileHash || !fileName) return;
    const saveTimeout = setTimeout(async () => {
      try {
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
            viewMode,
            skimTopHeight,
            studyMap,
            skimStage,
            quizData,
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
            layeredReadingState,
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
  }, [fileHash, fileName, explanations, chatCache, skimMessages, annotations, notebookData, pageComments, currentIndex, viewMode, skimTopHeight, studyMap, skimStage, quizData, docType, customBackgroundUrl, customAvatarUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, layeredReadingState, lsapContentMap, lsapState, examSummaryContentKey]);

  useEffect(() => {
    if (!currentSessionId || !user) return;
    const cloudSaveTimeout = setTimeout(() => {
      updateCloudSessionState(currentSessionId, {
        explanations, chatCache, annotations, notebookData, pageComments, skimMessages, viewMode, studyMap: studyMap ? JSON.parse(JSON.stringify(studyMap)) : null, layeredReadingState: layeredReadingState ? JSON.parse(JSON.stringify(layeredReadingState)) : null, skimStage, quizData, docType, skimTopHeight, currentIndex, customAvatarUrl: customAvatarUrl || undefined, customBackgroundUrl: customBackgroundUrl || undefined, personaSettings: personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, lsapContentMap: lsapContentMap ?? undefined, lsapState: lsapState ?? undefined
      });
    }, 3000);
    return () => clearTimeout(cloudSaveTimeout);
  }, [currentSessionId, user, explanations, chatCache, annotations, skimMessages, notebookData, pageComments, viewMode, studyMap, layeredReadingState, skimStage, quizData, docType, skimTopHeight, currentIndex, customAvatarUrl, customBackgroundUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide, savedArtifacts, lsapContentMap, lsapState]);


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
      setFileName(file.name); setSlides(newSlides); setFullPdfText(fullText); setStudyTime(0); pageEntryTime.current = Date.now();
      const existingRecord = await storageService.getFileState(hash);
      const stateToRestore = restoreData || (existingRecord ? existingRecord.state : null);
      if (stateToRestore) {
        setExplanations(stateToRestore.explanations || {}); setChatCache(stateToRestore.chatCache || {}); setSkimMessages(stateToRestore.skimMessages || []); setAnnotations(stateToRestore.annotations || {}); if (stateToRestore.notebookData) setNotebookData(stateToRestore.notebookData); setPageComments(stateToRestore.pageComments || {});
        setCurrentIndex(stateToRestore.currentIndex || 0); setViewMode(stateToRestore.viewMode || 'deep'); setSkimTopHeight(stateToRestore.skimTopHeight || 60); setStudyMap(stateToRestore.studyMap || null); setStudyMapModuleCount(null); setLayeredReadingState(stateToRestore.layeredReadingState ?? null); setSkimStage(stateToRestore.skimStage || 'diagnosis'); setQuizData(stateToRestore.quizData || null); setDocType(stateToRestore.docType || 'STEM');
        setReviewQuizRounds(stateToRestore.reviewQuizRounds || []); setReviewFlashCards(stateToRestore.reviewFlashCards || []); setFlashCardEstimate(stateToRestore.flashCardEstimate);
        setPageMarks(stateToRestore.pageMarks || {});
        setStudyGuide(stateToRestore.studyGuide || null);
        setSavedArtifacts(stateToRestore.savedArtifacts || []);
        setLsapContentMap(stateToRestore.lsapContentMap ?? null); setLsapState(stateToRestore.lsapState ?? null);
        if (restoredAvatar) setCustomAvatarUrl(restoredAvatar); else if (stateToRestore.customAvatarUrl) setCustomAvatarUrl(stateToRestore.customAvatarUrl);
        if (restoredBg) setCustomBackgroundUrl(restoredBg); else if (stateToRestore.galgameBackgroundUrl) setCustomBackgroundUrl(stateToRestore.galgameBackgroundUrl);
        if (stateToRestore.personaSettings) setPersonaSettings(stateToRestore.personaSettings);
      } else {
        setExplanations({}); setChatCache({}); setSkimMessages([]); setAnnotations({}); setPageComments({}); setCurrentIndex(0); setViewMode('deep'); setSkimTopHeight(60); setStudyMap(null); setStudyMapModuleCount(null); setLayeredReadingState(null); setSkimStage('diagnosis'); setQuizData(null); setDocType('STEM'); setCurrentSessionId(null); setCustomAvatarUrl(null); setCustomBackgroundUrl(null); setPersonaSettings(DEFAULT_PERSONA); setReviewQuizRounds([]); setReviewFlashCards([]); setFlashCardEstimate(undefined); setPageMarks({}); setStudyGuide(null); setSavedArtifacts([]); setLsapContentMap(null); setLsapState(null);
      }
      if (!stateToRestore?.studyMap) {
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
            if (map) { setStudyMap(map); setStudyMapModuleCount(4); }
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
      // 本页注释默认收起；文档加载完成后弹出一次「学习兴致」选择对话框
      setNotesPanelCollapsed(true);
      if (skipMoodOnNextFileLoadRef.current) {
        skipMoodOnNextFileLoadRef.current = false;
      } else {
        setMoodDialogOpen(true);
      }
    } catch (error) {
      // #region agent log
      _debugLog('App.tsx:processFile', 'catch', { err: String(error) });
      // #endregion
      console.error("Error processing file:", error); alert("文件处理失败，请重试。"); setFileName(null); setIsTimerRunning(false); setIsStudyMapLoading(false); throw error;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setIsProcessingFile(true);
    // #region agent log
    _debugLog('App.tsx:handleFileUpload', 'upload started', { fileName: file?.name });
    // #endregion
    try {
      const PROCESS_FILE_TIMEOUT_MS = 120000;
      await Promise.race([
        processFile(file),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('处理超时（120秒），请重试或换一个较小的 PDF。')), PROCESS_FILE_TIMEOUT_MS)),
      ]);
      // #region agent log
      _debugLog('App.tsx:handleFileUpload', 'processFile resolved', {});
      // #endregion
      if (user) { setIsSyncing(true); try { const downloadUrl = await uploadPDF(user, file); const sessionId = await createCloudSession(user, file.name, downloadUrl); setCurrentSessionId(sessionId); } catch (e) { console.error("Cloud Sync Failed:", e); alert("云端同步失败，请检查网络。"); } finally { setIsSyncing(false); } }
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
      setIsProcessingFile(false);
    }
  };

  const handleRestoreCloudSession = async (session: CloudSession) => {
    if (!user) return;
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
        layeredReadingState: fullData.layeredReadingState,
        skimStage: fullData.skimStage,
        quizData: fullData.quizData,
        docType: fullData.docType,
        skimTopHeight: fullData.skimTopHeight,
        currentIndex: fullData.currentIndex,
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
      setIsSyncing(true);
      const pendCloud = pendingNavSegmentRef.current;
      if (pendCloud && pendCloud.cloudSessionId === session.id) {
        pendingNavSegmentRef.current = null;
        window.setTimeout(() => applyDailySegRef.current(pendCloud), 120);
      }
    } catch (e) {
      console.error('Restore failed:', e);
      alert('无法从云端恢复，请重试。');
    } finally {
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
    if (sessions === null) {
      const content = fullPdfText || pdfDataUrl;
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
      case 'quiz':
        setReviewPanel('quiz');
        break;
      case 'flashcard':
        setReviewPanel('flashcard');
        break;
      case 'studyGuide':
        setStudyGuidePanel(true);
        break;
      case 'examSummary':
        setExamSummaryPanelOpen(true);
        break;
      case 'feynman':
        setFeynmanPanelOpen(true);
        break;
      case 'examTraps':
        setExamTrapsPanelOpen(true);
        break;
      case 'terminology':
        setTerminologyPanelOpen(true);
        break;
      case 'trickyProfessor':
        setTrickyProfessorPanelOpen(true);
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
          window.alert('已进入精读模式：先看当前页，再向右侧提问“先讲这页最核心的3点”。');
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
          setViewMode('deep');
          window.alert('该任务将打开精读模式；若需其他功能请从「复习」进入');
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
    if (step.action === 'rest') {
      setIsEnergyMode(true);
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
          setExamSummaryPanelOpen(true);
          break;
        case 'feynman':
          setFeynmanPanelOpen(true);
          break;
        case 'terminology':
          setTerminologyPanelOpen(true);
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
        case 'fiveMin':
          setFiveMinFlowOpen(true);
          break;
        case 'break':
          setIsEnergyMode(true);
          break;
        case 'examPrediction':
          setExamPredictionInitialKCId(null);
          setExamPredictionPanelOpen(true);
          break;
        case 'trickyProfessor':
          setTrickyProfessorPanelOpen(true);
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
        setExamSummaryPanelOpen(true);
        break;
      case 'examTraps':
        setExamTrapsPanelOpen(true);
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
    [user, fileHash, pdfDataUrl, fileName]
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

  /**
   * M1 / P1：按 examWorkspaceMaterialsSorted **逐份**拉文本 → generateLSAPContentMap(workspaceChunk) → 合并 KC；
   * 空文本跳过；单份返回 null 跳过；若最终 0 个 KC 则 alert。
   */
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
      saveWorkspaceLsapBundle(key, {
        contentMap: map,
        state,
        atomCoverage,
        dialogueTranscript: [],
        kcGlossary: {},
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
  const handleExtractLogicAtoms = useCallback(async () => {
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
      const newMap = await generateLogicAtomsForContentMap(merged, workspaceLsapContentMap, { maxDocChars: 60000 });
      if (!newMap) {
        window.alert('提取逻辑原子失败，请重试。');
        return false;
      }
      const key = computeExamWorkspaceLsapKey(user.uid, activeExamId, examWorkspaceMaterialsSorted);
      const atomCoverage = mergeAtomCoverageForMap(workspaceAtomCoverage, newMap);
      setWorkspaceLsapContentMap(newMap);
      setWorkspaceAtomCoverage(atomCoverage);
      saveWorkspaceLsapBundle(key, {
        contentMap: newMap,
        state: workspaceLsapStateRef.current ?? workspaceLsapState,
        atomCoverage,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
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
          });
          if (!newPartial) {
            skippedFail++;
            console.warn(`[P2 atoms] generateLogicAtomsForContentMap null for link ${link.id}`);
            continue;
          }
          anySuccess = true;
          for (const kc of newPartial.kcs) {
            const target = resultMap.kcs.find((x) => x.id === kc.id);
            if (target) target.atoms = kc.atoms;
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
          const newPartial = await generateLogicAtomsForContentMap(merged, partialMap, { maxDocChars: 60000 });
          if (!newPartial) {
            skippedFail++;
            continue;
          }
          anySuccess = true;
          for (const kc of newPartial.kcs) {
            const target = resultMap.kcs.find((x) => x.id === kc.id);
            if (target) target.atoms = kc.atoms;
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
      setWorkspaceLsapContentMap(resultMap);
      setWorkspaceAtomCoverage(atomCoverage);
      saveWorkspaceLsapBundle(key, {
        contentMap: resultMap,
        state: workspaceLsapStateRef.current ?? workspaceLsapState,
        atomCoverage,
        dialogueTranscript: workspaceDialogueTranscriptRef.current,
        kcGlossary: workspaceKcGlossaryRef.current,
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
            dialogueUpdatedAt: Date.now(),
            savedAt: Date.now(),
          });
        });
        return next;
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
      skipMoodOnNextFileLoadRef.current = true;
      window.alert(`请选择本地文件「${firstFile.fileName}」以加载与考试关联的 PDF，随后将打开考前预测。`);
      hiddenFileInputRef.current?.click();
      return;
    }
    const firstSession = sorted.find((l) => l.sourceType === 'sessionId' && l.cloudSessionId);
    if (firstSession) {
      skipMoodOnNextFileLoadRef.current = true;
      try {
        const sessions = await getUserSessions(user);
        const s = sessions.find((x) => x.id === firstSession.cloudSessionId && x.type === 'file');
        if (!s?.fileUrl) {
          window.alert('无法找到云端文件或下载链接缺失。请先在主界面侧栏从「云端」恢复该 PDF，或到考试中心检查材料关联。');
          skipMoodOnNextFileLoadRef.current = false;
          return;
        }
        await handleRestoreCloudSession(s);
        setExamPredictionInitialKCId(null);
        setExamPredictionPanelOpen(true);
        /* 保持在备考工作台，不跳回主学习界面 */
      } catch (e) {
        console.error(e);
        window.alert('从云端打开材料失败，请检查网络后重试。');
        skipMoodOnNextFileLoadRef.current = false;
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
      studyMap,
      layeredReadingState,
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
    studyMap,
    layeredReadingState,
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

  const handleStartClass = async () => {
    try {
      const lecture: LectureRecord = {
        id: `lecture-${Date.now()}`,
        startedAt: Date.now(),
        transcript: []
      };
      setCurrentLecture(lecture);
      setTranscriptLive('');
      setIsClassroomMode(true);
      await startRecording((text, isFinal) => {
        if (isFinal) {
          setCurrentLecture((prev) =>
            prev
              ? { ...prev, transcript: [...prev.transcript, { text, timestamp: Date.now() }] }
              : null
          );
        } else {
          setTranscriptLive(text);
        }
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : '无法开启录音');
      setCurrentLecture(null);
      setIsClassroomMode(false);
    }
  };

  const handleEndClass = async () => {
    await stopRecording();
    setTranscriptLive('');
    setCurrentLecture((prev) => {
      if (!prev) return null;
      const ended = { ...prev, endedAt: Date.now() };
      setLectureHistory((h) => [ended, ...h]);
      return null;
    });
    setIsClassroomMode(false);
    setLectureTranscriptPageOpen(true);
  };

  const handleOrganizeLecture = useCallback(async (lecture: LectureRecord) => {
    const id = lecture.id;
    const text = lecture.transcript.map((t) => t.text).join('');
    if (!text.trim()) return;
    setOrganizingLectureId(id);
    try {
      const summary = await organizeLectureFromTranscript(text);
      setLectureHistory((prev) =>
        prev.map((l) => (l.id === id ? { ...l, organizedSummary: summary } : l))
      );
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'AI 整理失败');
    } finally {
      setOrganizingLectureId(null);
    }
  }, []);

  const handleDeleteLecture = useCallback((lectureId: string) => {
    setLectureHistory((prev) => prev.filter((l) => l.id !== lectureId));
  }, []);

  const handleRenameLecture = useCallback((lectureId: string, newName: string) => {
    setLectureHistory((prev) =>
      prev.map((l) => (l.id === lectureId ? { ...l, name: newName } : l))
    );
  }, []);

  // --- STANDARD LOGIC ---
  const fetchExplanation = useCallback(async (index: number, currentSlides: Slide[], fullContext: string | null) => {
    const slide = currentSlides[index]; 
    if (!slide) return; 
    if (explanations[slide.id]) { setIsGeneratingAI(false); return; } 
    
    setIsGeneratingAI(true); 
    try { 
        // Modified to pass fullContext for "smart memory"
        const explanation = await generateSlideExplanation(slide.imageUrl, fullContext || undefined); 
        setExplanations(prev => ({ ...prev, [slide.id]: explanation })); 
    } catch (error) { 
        console.error(error); 
    } finally { 
        setIsGeneratingAI(false); 
    }
  }, [explanations]);

  useEffect(() => { 
    pageEntryTime.current = Date.now(); 
    hasEncouragedOnPage.current = false; 
    if (!isGalgameMode && slides.length > 0 && viewMode === 'deep') { 
        // Pass fullPdfText state to fetchExplanation
        fetchExplanation(currentIndex, slides, fullPdfText); 
    } 
  }, [currentIndex, slides, viewMode, isGalgameMode, fetchExplanation, fullPdfText]);

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

  const handleRegenerateStudyMap = async (moduleCount: number) => {
    const content = pdfDataUrl || fullPdfText;
    if (!content) return;
    const map = await performPreFlightDiagnosis(content, { moduleCount });
    if (map) { setStudyMap(map); setStudyMapModuleCount(moduleCount); }
  };

  const handleRetryExplanation = useCallback(() => { 
      if (!slides.length || !slides[currentIndex]) return;
      // 清除当前页面的解释，强制重新生成
      const slideId = slides[currentIndex].id;
      setExplanations(prev => {
        const newExplanations = { ...prev };
        delete newExplanations[slideId];
        return newExplanations;
      });
      // 重新生成解释
      fetchExplanation(currentIndex, slides, fullPdfText); 
  }, [slides, currentIndex, fetchExplanation, fullPdfText]);

  const handleSendChat = async (text: string, image?: string) => {
    if (!slides[currentIndex]) return; const slide = slides[currentIndex]; const slideId = slide.id; const userMessage: ChatMessage = { role: 'user', text, image, timestamp: Date.now() };
    setChatCache(prev => { const newState = { ...prev, [slideId]: [...(prev[slideId] || []), userMessage] }; return newState; }); setIsChatLoading(true);
    try { const currentHistory = chatCache[slideId] || []; const replyText = await chatWithSlide(slide.imageUrl, currentHistory, text, image, 'standard', undefined); const replyMessage: ChatMessage = { role: 'model', text: replyText, timestamp: Date.now() }; setChatCache(prev => { const newState = { ...prev, [slideId]: [...(prev[slideId] || []), replyMessage] }; return newState; }); } catch (error) { console.error(error); } finally { setIsChatLoading(false); }
  };

  const handleSendGalgameChat = async (text: string) => { if (!slides[currentIndex]) return; };

  const handleExportPDF = async () => {
    if (slides.length === 0) return; const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] }); const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < slides.length; i++) { const slide = slides[i]; const slideAnnos = annotations[slide.id] || []; if (i > 0) pdf.addPage(); try { const imgProps = pdf.getImageProperties(slide.imageUrl); const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height); const drawWidth = imgProps.width * ratio; const drawHeight = imgProps.height * ratio; const offsetX = (pdfWidth - drawWidth) / 2; const offsetY = (pdfHeight - drawHeight) / 2; pdf.addImage(slide.imageUrl, 'PNG', offsetX, offsetY, drawWidth, drawHeight, undefined, 'FAST'); } catch (e) { pdf.addImage(slide.imageUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST'); } slideAnnos.forEach(anno => { const xPos = (anno.x / 100) * pdfWidth; const yPos = (anno.y / 100) * pdfHeight; pdf.setFillColor(255, 252, 235); pdf.setDrawColor(251, 191, 36); pdf.rect(xPos, yPos, anno.width || 240, anno.height || 100, 'FD'); pdf.setFontSize(anno.fontSize || 14); if (anno.color) { const r = parseInt(anno.color.substr(1, 2), 16); const g = parseInt(anno.color.substr(3, 2), 16); const b = parseInt(anno.color.substr(5, 2), 16); pdf.setTextColor(r, g, b); } else { pdf.setTextColor(50, 50, 50); } pdf.text(pdf.splitTextToSize(cleanHtmlToText(anno.text), (anno.width || 240) - 20), xPos + 10, yPos + (anno.fontSize || 14) + 5); }); } pdf.save(`${fileName || 'study-notes'}_annotated.pdf`);
  };

  const handleAddNote = (text: string, category: 'deep' | 'skim' = 'deep') => { if (!fileName) { alert("请先上传课件"); return; } const currentPage = currentIndex + 1; const newNote: Note = { id: `note-${Date.now()}`, text, createdAt: Date.now(), category }; setNotebookData(prev => ({ ...prev, [fileName]: { ...(prev[fileName] || {}), [currentPage]: [...(prev[fileName]?.[currentPage] || []), newNote] } })); };
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

  // --- NEW: SIDE QUEST LOGIC ---
  const handleTriggerSideQuest = async () => {
      if (!triggerPosition) return;
      const text = triggerPosition.text;
      setTriggerPosition(null);
      setSideQuest({ isActive: true, anchorText: text, messages: [], isLoading: true });
      
      try {
          // Generate initial deep dive explanation
          const response = await runSideQuestAgent([], "请开始深度解析", text);
          setSideQuest(prev => ({ 
              ...prev, 
              isLoading: false, 
              messages: [{ role: 'model', text: response, timestamp: Date.now() }] 
          }));
      } catch (e) {
          setSideQuest(prev => ({ ...prev, isLoading: false, messages: [{role: 'model', text: "解析失败...", timestamp: Date.now()}] }));
      }
  };

  const handleSideQuestSend = async (text: string) => {
      setSideQuest(prev => ({ 
          ...prev, 
          isLoading: true, 
          messages: [...prev.messages, { role: 'user', text, timestamp: Date.now() }] 
      }));

      try {
          const response = await runSideQuestAgent(sideQuest.messages, text, sideQuest.anchorText);
          setSideQuest(prev => ({ 
              ...prev, 
              isLoading: false, 
              messages: [...prev.messages, { role: 'model', text: response, timestamp: Date.now() }] 
          }));
      } catch (e) {
          setSideQuest(prev => ({ ...prev, isLoading: false }));
      }
  };

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
      progressPercentage={slides.length > 0 ? (Object.keys(explanations).length / slides.length) * 100 : 0} 
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
      onToggleSkim={() => setViewMode(prev => prev === 'skim' ? 'deep' : 'skim')}
      onToggleLayered={() => setViewMode(prev => prev === 'layered' ? 'deep' : 'layered')}
      hasStudyMap={!!studyMap} 
      onOpenHistory={handleOpenHistory} 
      onEnterGalgameMode={() => setIsGalgameMode(true)}
      user={user}
      onLogin={handleLogin}
      onLogout={handleLogout}
      isSyncing={isSyncing}
      onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      onEnterEnergyMode={() => setIsEnergyMode(true)}
      onOpenMarkPanel={() => setIsMarkPanelOpen(true)}
      hasMarkOnCurrentPage={fileName && pageMarks[fileName] && pageMarks[fileName][currentIndex + 1] ? pageMarks[fileName][currentIndex + 1].length > 0 : false}
      musicPanelOpen={isMusicPanelOpen}
      onMusicPanelOpenChange={setIsMusicPanelOpen}
      hasLectureHistory={lectureHistory.length > 0}
      onOpenLectureTranscript={() => setLectureTranscriptPageOpen(true)}
      isClassroomMode={isClassroomMode}
      onStartClass={handleStartClass}
      isTranscriptionSupported={transcriptionSupported}
      onOpenReview={() => setReviewPageOpen(true)}
      onOpenExamWorkspace={() => {
        if (!user) {
          setLoginModalOpen(true);
          return;
        }
        setAppMode('examWorkspace');
      }}
      onOpenFiveMin={() => setFiveMinFlowOpen(true)}
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
      onRequestUpload={() => hiddenFileInputRef.current?.click()} 
      isImmersive={isImmersive}
      leftPanelRef={leftPanelRef}
    />
  );
  
  const commonRightPanel = isClassroomMode && currentLecture ? (
    <ClassroomPanel
      currentLecture={currentLecture}
      onEndClass={handleEndClass}
      transcriptLive={transcriptLive}
    />
  ) : viewMode === 'skim' ? (
    <SkimPanel 
      studyMap={studyMap} 
      isLoading={isStudyMapLoading} 
      onSwitchToDeep={() => setViewMode('deep')} 
      fullText={fullPdfText}
      pdfDataUrl={pdfDataUrl} 
      messages={skimMessages}
      setMessages={setSkimMessages}
      topHeight={skimTopHeight}
      setTopHeight={setSkimTopHeight}
      stage={skimStage}
      setStage={setSkimStage}
      quizData={quizData}
      setQuizData={setQuizData}
      docType={docType}
      onToggleDocType={() => setDocType(prev => prev === 'STEM' ? 'HUMANITIES' : 'STEM')}
      onNotebookAdd={handleAddNote}
      onRegenerateStudyMap={handleRegenerateStudyMap}
      studyMapModuleCount={studyMapModuleCount}
    />
  ) : viewMode === 'layered' ? (
    <LayeredReadingPanel
      fullText={fullPdfText}
      pdfDataUrl={pdfDataUrl}
      fileName={fileName}
      layeredReadingState={layeredReadingState}
      setLayeredReadingState={setLayeredReadingState}
      onJumpToPage={(page1Based: number) => {
        if (slides.length === 0) return;
        const idx = Math.max(0, Math.min(page1Based - 1, slides.length - 1));
        setCurrentIndex(idx);
      }}
    />
  ) : (
    <ExplanationPanel
      explanation={currentSlide ? explanations[currentSlide.id] : undefined} 
      isLoadingExplanation={isGeneratingAI} 
      onRetryExplanation={handleRetryExplanation} 
      chatMessages={currentSlide ? (chatCache[currentSlide.id] || []) : []} 
      onSendChat={handleSendChat} 
      isChatLoading={isChatLoading} 
      onNotebookAdd={handleAddNote}
      isImmersive={isImmersive} 
      isCollapsed={isSidePanelCollapsed} 
      onToggleCollapse={() => setIsSidePanelCollapsed(!isSidePanelCollapsed)} 
    />
  );
  
  if (!hasStarted) {
    return <WelcomeScreen onStart={() => setHasStarted(true)} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF7] flex-col space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
        <p className="text-sm font-bold text-slate-500">正在连接云端...</p>
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
          onDelete={handleDeleteLecture}
          onRename={handleRenameLecture}
        />
      )}

      {reviewPageOpen && (
        <ReviewPage
          user={user}
          hasCurrentDoc={!!(fullPdfText || pdfDataUrl)}
          currentDocName={fileName}
          onClose={() => setReviewPageOpen(false)}
          onStartReview={handleStartReview}
          trapCount={trapList.length}
        />
      )}

      {/* 学习兴致弹窗 */}
      {moodDialogOpen && (
        <MoodDialog
          open={moodDialogOpen}
          onSelectLowEnergy={() => {
            setMoodDialogOpen(false);
            setFiveMinFlowOpen(true);
          }}
          onSelectHighEnergy={() => {
            setMoodDialogOpen(false);
          }}
        />
      )}

      {/* 5 分钟学习模式 */}
      {fiveMinFlowOpen && (
        <FiveMinFlowPanel
          docContent={fullPdfText || pdfDataUrl || ''}
          docLabel={fileName || '当前文档'}
          onClose={() => setFiveMinFlowOpen(false)}
          onExtend={() => {
            setFiveMinFlowOpen(false);
            const content = fullPdfText || pdfDataUrl;
            if (!content) return;
            setCombinedReviewContent(content);
            setCombinedReviewFileName(fileName || '当前文档');
            setCombinedReviewFileNames(null);
            setReviewModeChooserOpen(true);
          }}
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

      {/* TRIGGER BUBBLE */}
      {triggerPosition && !sideQuest.isActive && (
          <button 
            id="side-quest-trigger-btn"
            className="fixed z-[1000] bg-indigo-600 text-white px-4 py-2 rounded-full shadow-xl shadow-indigo-300 transform -translate-x-1/2 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 mt-1 hover:scale-105 transition-transform flex items-center space-x-2 border-2 border-white"
            style={{ top: triggerPosition.top, left: triggerPosition.left }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleTriggerSideQuest(); }}
          >
              <Sparkles className="w-4 h-4 text-yellow-300 fill-current" />
              <span className="text-xs font-bold whitespace-nowrap">展开讲讲</span>
          </button>
      )}

      {/* SIDE QUEST PANEL */}
      <SideQuestPanel 
        isActive={sideQuest.isActive}
        anchorText={sideQuest.anchorText}
        messages={sideQuest.messages}
        isLoading={sideQuest.isLoading}
        onClose={() => setSideQuest(prev => ({...prev, isActive: false}))}
        onSend={handleSideQuestSend}
      />

      {/* 复习方式选择（多选一起复习后） */}
      {reviewModeChooserOpen && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-2">选择喜欢的学习方式</h3>
            <p className="text-sm text-slate-500 mb-4">基于 {combinedReviewFileName} 进行复习</p>

            <div className="space-y-4">
              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">推荐</h4>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('quiz'); }} className="py-2.5 px-3 rounded-xl bg-violet-100 text-violet-800 font-bold text-sm hover:bg-violet-200 transition-colors">测验</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('flashcard'); }} className="py-2.5 px-3 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm hover:bg-amber-200 transition-colors">闪卡</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setStudyGuidePanel(true); }} className="py-2.5 px-3 rounded-xl bg-indigo-100 text-indigo-800 font-bold text-sm hover:bg-indigo-200 transition-colors">学习指南</button>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">巩固记忆</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('flashcard'); }} className="py-3 px-4 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm hover:bg-amber-200 transition-colors">闪卡</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setStudyGuidePanel(true); }} className="py-3 px-4 rounded-xl bg-indigo-100 text-indigo-800 font-bold text-sm hover:bg-indigo-200 transition-colors">学习指南</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setTerminologyPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-cyan-100 text-cyan-800 font-bold text-sm hover:bg-cyan-200 transition-colors">术语精确定义</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setMindMapPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-teal-100 text-teal-800 font-bold text-sm hover:bg-teal-200 transition-colors">思维导图</button>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">自我检测</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('quiz'); }} className="py-3 px-4 rounded-xl bg-violet-100 text-violet-800 font-bold text-sm hover:bg-violet-200 transition-colors">测验</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setFeynmanPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-sky-100 text-sky-800 font-bold text-sm hover:bg-sky-200 transition-colors">费曼检验</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setTrickyProfessorPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-orange-100 text-orange-800 font-bold text-sm hover:bg-orange-200 transition-colors">刁钻教授</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setTrapListPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm hover:bg-amber-200 transition-colors w-full col-span-2">我的陷阱清单{trapList.length > 0 ? ` (${trapList.length})` : ''}</button>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">考前冲刺</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setReviewModeChooserOpen(false); setExamSummaryPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm hover:bg-emerald-200 transition-colors">考前速览</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setExamTrapsPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-rose-100 text-rose-800 font-bold text-sm hover:bg-rose-200 transition-colors">考点与陷阱</button>
                  <button onClick={() => { setReviewModeChooserOpen(false); setExamPredictionInitialKCId(null); setExamPredictionPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm hover:bg-amber-200 transition-colors col-span-2">考前预测</button>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">自由问答</h4>
                <button onClick={() => { setReviewModeChooserOpen(false); setMultiDocQAConversationKey(getMultiDocQAConversationKey(combinedReviewFileName ?? '当前文档', combinedReviewFileNames)); setMultiDocQAPanelOpen(true); }} className="w-full py-3 px-4 rounded-xl bg-indigo-100 text-indigo-800 font-bold text-sm hover:bg-indigo-200 transition-colors">多文档问答</button>
              </section>
            </div>

            <button onClick={clearCombinedReview} className="mt-4 w-full py-2 text-slate-500 text-sm hover:text-slate-700">取消</button>
          </div>
        </div>
      )}

      {/* 复习：Quiz */}
      {reviewPanel === 'quiz' && (
        <QuizReviewPanel
          onClose={() => { setReviewPanel(null); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          existingRounds={reviewQuizRounds}
          onSaveRounds={(rounds) => {
            setReviewQuizRounds(rounds);
            const sourceName = combinedReviewFileName || fileName || '文档';
            const lastRound = rounds[rounds.length - 1];
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'quiz',
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
          existingCards={reviewFlashCards}
          savedEstimate={flashCardEstimate}
          onSaveCards={(cards) => {
            setReviewFlashCards(cards);
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'flashcard',
              title: `闪卡 · ${sourceName}`,
              createdAt: Date.now(),
              sourceLabel: buildArtifactSourceLabel(combinedReviewFileNames, combinedReviewFileName, fileName),
              payload: { count: cards.length }
            });
          }}
          onSaveEstimate={setFlashCardEstimate}
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
          onClose={() => { setFeynmanPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
          onSaveToStudio={(markdown, title) => {
            const sourceName = combinedReviewFileName || fileName || '文档';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'feynman',
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
          existingGuide={studyGuide}
          onSaveGuide={(guide) => {
            setStudyGuide(guide);
            const title = guide.content?.chapters?.[0]?.title || guide.fileName || '学习指南';
            addArtifact({
              id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'studyGuide',
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

      {isEnergyMode && (
        <div className="fixed inset-0 z-[200] bg-[#FFFBF7] overflow-y-auto animate-in fade-in duration-300">
            <div className="sticky top-0 z-50 w-full flex justify-center py-6 bg-gradient-to-b from-[#FFFBF7] via-[#FFFBF7] to-transparent">
              <button 
                  onClick={() => setIsEnergyMode(false)}
                  className="group flex items-center gap-2 px-8 py-3 bg-white border-2 border-stone-100 rounded-full shadow-lg hover:shadow-xl hover:scale-105 hover:border-orange-200 transition-all duration-300"
              >
                  <span className="text-xl group-hover:animate-bounce">😤</span>
                  <span className="font-bold text-stone-700 group-hover:text-orange-500 text-base">满血复活，回去学习！</span>
              </button>
            </div>

            <div className="flex flex-col items-center justify-start p-4 min-h-[80vh] max-w-5xl mx-auto w-full">
                <div className="flex flex-col items-center gap-4 mb-12 text-center mt-4">
                   <h2 className="text-4xl font-extrabold text-slate-800 tracking-tight">AI 能量补给站</h2>
                   <p className="text-lg text-slate-500 font-medium max-w-lg">学习累了？迷茫了？在这里，我们不谈分数，<br/>只谈你的感受和下一步。</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 w-full">
                    <div className="flex justify-center transform hover:-translate-y-2 transition-transform duration-500"><TaskHug /></div>
                    <div className="flex justify-center transform hover:-translate-y-2 transition-transform duration-500 delay-100"><ChatHug /></div>
                </div>
            </div>
        </div>
      )}

      <input
        type="file"
        ref={hiddenFileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,image/*"
        className="hidden"
      />

      {appMode === 'examWorkspace' && user ? (
        <ExamWorkspacePage
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
          workspaceLsapGenerating={workspaceLsapGenerating}
          workspaceLsapProgress={workspaceLsapProgress}
          workspaceAtomsProgress={workspaceAtomsProgress}
          workspaceAtomCoverage={workspaceAtomCoverage}
          onExtractLogicAtoms={handleExtractLogicAtoms}
          workspaceAtomsGenerating={workspaceAtomsGenerating}
          onWorkspaceAtomCoverageChange={handleWorkspaceAtomCoverageChange}
          workspaceDialogueTranscript={workspaceDialogueTranscript}
          workspaceLsapKey={workspaceLsapKey}
          onWorkspaceDialogueTranscriptChange={handleWorkspaceDialogueTranscriptChange}
          workspaceKcGlossary={workspaceKcGlossary}
          onWorkspaceGlossaryAppend={handleWorkspaceGlossaryAppend}
          resolveExamMaterialPdf={resolveExamMaterialPdf}
        />
      ) : (
        <>
      <section className={`h-screen flex flex-col relative z-20 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] ${isImmersive ? 'bg-[#F3F4F6]' : 'bg-[#FFFBF7]'}`}>
        {isEmbeddedDev && !devBannerDismissed && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shrink-0">
            <span>上传 PDF 在 Cursor 预览中可能受限，建议用 Chrome 打开 <strong>http://localhost:3000</strong> 进行开发调试。</span>
            <button type="button" onClick={() => setDevBannerDismissed(true)} className="shrink-0 px-2 py-1 rounded hover:bg-amber-100 font-medium">关闭</button>
          </div>
        )}
        {commonHeader}
        
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

        <main className="flex-1 flex overflow-hidden relative">
          
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
          
          <div 
            ref={leftPanelRef}
            className="relative flex flex-col border-r border-stone-200 bg-[#E5E7EB] transition-[width] duration-0 ease-linear h-full" 
            style={{ width: isImmersive ? (isSidePanelCollapsed ? '98%' : `${leftPanelWidth}%`) : '60%' }}
          >
              <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
                  {commonSlideViewer}
                  {renderVideoOverlay()}
              </div>
              {currentSlide && (
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

          <div className={`flex flex-col h-full relative z-20 bg-white transition-all duration-300 ${isImmersive ? (isSidePanelCollapsed ? 'w-[40px] border-l border-stone-200' : 'flex-1 min-w-[300px]') : 'flex-1'}`}>
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
          </div>

          {fileName && slides.length > 0 && !isClassroomMode && (
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
          <section className="bg-[#FFFBF7] pt-10 pb-24 relative z-10">
             <Notebook fileName={fileName} notes={fileName ? (notebookData[fileName] || {}) : {}} onUpdateNote={handleUpdateNote} onDeleteNote={handleDeleteNote} />
             <footer className="mt-10 text-center text-stone-300 text-sm font-bold tracking-widest">逃课神器 · POWERED BY GEMINI 3.0 PRO</footer>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
};

export default App;
