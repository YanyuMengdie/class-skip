
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { Header } from './components/Header';
import { SlideViewer } from './components/SlideViewer';
import { ExplanationPanel } from './components/ExplanationPanel';
import { SkimPanel } from './components/SkimPanel';
import { Sidebar } from './components/Sidebar';
import { TaskHug } from './components/TaskHug';
import { ChatHug } from './components/ChatHug';
import { Notebook } from './components/Notebook'; 
import { HistoryModal } from './components/HistoryModal';
import { GalgameOverlay } from './components/GalgameOverlay';
import { GalgameSettings } from './components/GalgameSettings'; 
import { WelcomeScreen } from './components/WelcomeScreen'; 
import { SideQuestPanel } from './components/SideQuestPanel';
import { QuizReviewPanel } from './components/QuizReviewPanel';
import { FlashCardReviewPanel } from './components/FlashCardReviewPanel';
import { PageMarkPanel } from './components/PageMarkPanel';
import { StudyGuidePanel } from './components/StudyGuidePanel';
import { ExamSummaryPanel } from './components/ExamSummaryPanel';
import { FeynmanPanel } from './components/FeynmanPanel';
import { ExamTrapsPanel } from './components/ExamTrapsPanel';
import { TerminologyPanel } from './components/TerminologyPanel';
import { TrapListPanel } from './components/TrapListPanel';
import { TrickyProfessorPanel } from './components/TrickyProfessorPanel';
import { BreakPanel } from './components/BreakPanel';
import { ClassroomPanel } from './components/ClassroomPanel';
import { LectureTranscriptPage } from './components/LectureTranscriptPage';
import { ReviewPage, ReviewType } from './components/ReviewPage';
import { convertPdfToImages, readFileAsDataURL, extractPdfText, generateFileHash, fetchFileFromUrl } from './utils/pdfUtils';
import { generateSlideExplanation, chatWithSlide, performPreFlightDiagnosis, classifyDocument, generatePersonaStoryScript, runSideQuestAgent, organizeLectureFromTranscript } from './services/geminiService';
import { startRecording, stopRecording, isTranscriptionSupported } from './services/transcriptionService';
import { storageService } from './services/storageService';
import { auth, loginWithGoogle, logoutUser, uploadPDF, createCloudSession, updateCloudSessionState, deleteCloudSession, fetchSessionDetails } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Slide, ExplanationCache, ChatCache, ChatMessage, NotebookData, Note, AnnotationCache, SlideAnnotation, StudyMap, ViewMode, FileHistoryItem, SkimStage, QuizData, DocType, FilePersistedState, PersonaSettings, CloudSession, SideQuestState, QuizRound, FlashCard, TrapItem, PageMarks, PageMark, StudyGuide, LectureRecord } from './types';
import { Sparkles, X, ChevronDown, Loader2, Wand2 } from 'lucide-react';

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
  const [fullPdfText, setFullPdfText] = useState<string | null>(null); 
  const [isStudyMapLoading, setIsStudyMapLoading] = useState<boolean>(false);
  
  const [isImmersive, setIsImmersive] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(60);
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<FileHistoryItem[]>([]);
  const [restoreHash, setRestoreHash] = useState<string | null>(null);

  // --- NEW: CLOUD STATES ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- ENERGY MODE STATE ---
  const [isEnergyMode, setIsEnergyMode] = useState(false);

  // --- 小憩区 & 白噪音面板受控 ---
  const [isBreakPanelOpen, setIsBreakPanelOpen] = useState(false);
  const [isMusicPanelOpen, setIsMusicPanelOpen] = useState(false);

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

  // --- 一起复习：多选合并内容与方式选择 ---
  const [combinedReviewContent, setCombinedReviewContent] = useState<string | null>(null);
  const [combinedReviewFileName, setCombinedReviewFileName] = useState<string | null>(null);
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
  
  const splitterRef = useRef<boolean>(false);
  const pageEntryTime = useRef<number>(Date.now());
  const hasEncouragedOnPage = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);
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
            studyGuide
          }
        };
        await storageService.saveFileState(item);
        setHistoryItems(await storageService.getAllHistory());
      } catch (e) { console.warn('Auto-save failed:', e); }
    }, 2000);
    return () => clearTimeout(saveTimeout);
  }, [fileHash, fileName, explanations, chatCache, skimMessages, annotations, notebookData, currentIndex, viewMode, skimTopHeight, studyMap, skimStage, quizData, docType, customBackgroundUrl, customAvatarUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide]);

  useEffect(() => {
    if (!currentSessionId || !user) return;
    const cloudSaveTimeout = setTimeout(() => {
      updateCloudSessionState(currentSessionId, {
        explanations, chatCache, annotations, notebookData, skimMessages, viewMode, studyMap: studyMap ? JSON.parse(JSON.stringify(studyMap)) : null, skimStage, quizData, docType, skimTopHeight, currentIndex, customAvatarUrl: customAvatarUrl || undefined, customBackgroundUrl: customBackgroundUrl || undefined, personaSettings: personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide
      });
    }, 3000);
    return () => clearTimeout(cloudSaveTimeout);
  }, [currentSessionId, user, explanations, chatCache, annotations, skimMessages, notebookData, viewMode, studyMap, skimStage, quizData, docType, skimTopHeight, currentIndex, customAvatarUrl, customBackgroundUrl, personaSettings, reviewQuizRounds, reviewFlashCards, flashCardEstimate, pageMarks, studyGuide]);


  // --- HANDLERS ---
  const handleLogin = async () => { await loginWithGoogle(); };
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
      setFileName(file.name); setSlides(newSlides); setFullPdfText(fullText); setStudyTime(0); setIsTimerRunning(true); pageEntryTime.current = Date.now();
      const existingRecord = await storageService.getFileState(hash);
      const stateToRestore = restoreData || (existingRecord ? existingRecord.state : null);
      if (stateToRestore) {
        setExplanations(stateToRestore.explanations || {}); setChatCache(stateToRestore.chatCache || {}); setSkimMessages(stateToRestore.skimMessages || []); setAnnotations(stateToRestore.annotations || {}); if (stateToRestore.notebookData) setNotebookData(stateToRestore.notebookData);
        setCurrentIndex(stateToRestore.currentIndex || 0); setViewMode(stateToRestore.viewMode || 'deep'); setSkimTopHeight(stateToRestore.skimTopHeight || 60); setStudyMap(stateToRestore.studyMap || null); setSkimStage(stateToRestore.skimStage || 'diagnosis'); setQuizData(stateToRestore.quizData || null); setDocType(stateToRestore.docType || 'STEM');
        setReviewQuizRounds(stateToRestore.reviewQuizRounds || []); setReviewFlashCards(stateToRestore.reviewFlashCards || []); setFlashCardEstimate(stateToRestore.flashCardEstimate);
        setPageMarks(stateToRestore.pageMarks || {});
        setStudyGuide(stateToRestore.studyGuide || null);
        if (restoredAvatar) setCustomAvatarUrl(restoredAvatar); else if (stateToRestore.customAvatarUrl) setCustomAvatarUrl(stateToRestore.customAvatarUrl);
        if (restoredBg) setCustomBackgroundUrl(restoredBg); else if (stateToRestore.galgameBackgroundUrl) setCustomBackgroundUrl(stateToRestore.galgameBackgroundUrl);
        if (stateToRestore.personaSettings) setPersonaSettings(stateToRestore.personaSettings);
      } else {
        setExplanations({}); setChatCache({}); setSkimMessages([]); setAnnotations({}); setCurrentIndex(0); setViewMode('deep'); setSkimTopHeight(60); setStudyMap(null); setSkimStage('diagnosis'); setQuizData(null); setDocType('STEM'); setCurrentSessionId(null); setCustomAvatarUrl(null); setCustomBackgroundUrl(null); setPersonaSettings(DEFAULT_PERSONA); setReviewQuizRounds([]); setReviewFlashCards([]); setFlashCardEstimate(undefined); setPageMarks({}); setStudyGuide(null);
      }
      if (!stateToRestore?.studyMap) {
        setIsStudyMapLoading(true); const diagnosisContent = rawPdfData || fullText;
        // #region agent log
        _debugLog('App.tsx:processFile', 'before diagnosis (background)', {});
        // #endregion
        const diagnosisPromise = Promise.all([performPreFlightDiagnosis(diagnosisContent), (!existingRecord && !restoreData) ? classifyDocument(diagnosisContent) : Promise.resolve(stateToRestore?.docType || 'STEM')]);
        const timeoutMs = 90000;
        const timeoutPromise = new Promise<[StudyMap | null, DocType]>((resolve) => setTimeout(() => resolve([null, 'STEM']), timeoutMs));
        Promise.race([diagnosisPromise, timeoutPromise])
          .then(([map, type]) => {
            _debugLog('App.tsx:processFile', 'after Promise.all diagnosis', { hasMap: !!map });
            if (map) setStudyMap(map); if (!existingRecord && !restoreData) setDocType(type);
          })
          .catch(() => {})
          .finally(() => setIsStudyMapLoading(false));
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
    if (!user) return; setIsProcessingFile(true);
    try { if (!session.fileUrl) throw new Error("File URL missing"); const heavyDetails = await fetchSessionDetails(session.id); const file = await fetchFileFromUrl(session.fileUrl, session.fileName); const fullData = { ...session, ...heavyDetails }; const restoreData: Partial<FilePersistedState> = { explanations: fullData.explanations, chatCache: fullData.chatCache, annotations: fullData.annotations, notebookData: fullData.notebookData, skimMessages: fullData.skimMessages, viewMode: fullData.viewMode, studyMap: fullData.studyMap, skimStage: fullData.skimStage, quizData: fullData.quizData, docType: fullData.docType, skimTopHeight: fullData.skimTopHeight, currentIndex: fullData.currentIndex, personaSettings: fullData.personaSettings, reviewQuizRounds: fullData.reviewQuizRounds, reviewFlashCards: fullData.reviewFlashCards, flashCardEstimate: fullData.flashCardEstimate, pageMarks: fullData.pageMarks, studyGuide: fullData.studyGuide }; await processFile(file, restoreData, fullData.customAvatarUrl, fullData.customBackgroundUrl); setCurrentSessionId(session.id); setIsSyncing(true); } catch (e) { console.error("Restore failed:", e); alert("无法从云端恢复，请重试。"); } finally { setIsProcessingFile(false); }
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
      openReviewPanelByType(type);
      return;
    }
    if (sessions.length < 1) return;
    setIsCombinedReviewLoading(true);
    setCombinedReviewContent(null);
    setCombinedReviewFileName(null);
    try {
      const parts: string[] = [];
      for (const session of sessions) {
        if (!session.fileUrl || session.type !== 'file') continue;
        const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
        const texts = await extractPdfText(file);
        parts.push(`【${session.fileName}】\n${texts.join('\n')}`);
      }
      const merged = parts.join('\n\n').slice(0, 60000);
      setCombinedReviewContent(merged);
      setCombinedReviewFileName(sessions.length === 1 ? sessions[0].fileName : `多文档合并 (${sessions.length} 个文件)`);
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
    }
  };

  const clearCombinedReview = () => {
    setCombinedReviewContent(null);
    setCombinedReviewFileName(null);
    setReviewModeChooserOpen(false);
  };

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
      onToggleViewMode={() => setViewMode(prev => prev === 'deep' ? 'skim' : 'deep')} 
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
      onToggleBreakPanel={() => setIsBreakPanelOpen((v) => !v)}
      musicPanelOpen={isMusicPanelOpen}
      onMusicPanelOpenChange={setIsMusicPanelOpen}
      hasLectureHistory={lectureHistory.length > 0}
      onOpenLectureTranscript={() => setLectureTranscriptPageOpen(true)}
      isClassroomMode={isClassroomMode}
      onStartClass={handleStartClass}
      isTranscriptionSupported={transcriptionSupported}
      onOpenReview={() => setReviewPageOpen(true)}
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

      <BreakPanel
        isOpen={isBreakPanelOpen}
        onClose={() => setIsBreakPanelOpen(false)}
        onOpenMusicPlayer={() => setIsMusicPanelOpen(true)}
        onEnterEnergyMode={() => setIsEnergyMode(true)}
        onVideoSelect={handleVideoSelect}
      />

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
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">选择复习方式</h3>
            <p className="text-sm text-slate-500 mb-4">基于 {combinedReviewFileName} 进行复习</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('quiz'); }} className="py-3 px-4 rounded-xl bg-violet-100 text-violet-800 font-bold text-sm hover:bg-violet-200 transition-colors">测验</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setReviewPanel('flashcard'); }} className="py-3 px-4 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm hover:bg-amber-200 transition-colors">闪卡</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setStudyGuidePanel(true); }} className="py-3 px-4 rounded-xl bg-indigo-100 text-indigo-800 font-bold text-sm hover:bg-indigo-200 transition-colors">学习指南</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setExamSummaryPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-sm hover:bg-emerald-200 transition-colors">考前速览</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setFeynmanPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-sky-100 text-sky-800 font-bold text-sm hover:bg-sky-200 transition-colors">费曼检验</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setExamTrapsPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-rose-100 text-rose-800 font-bold text-sm hover:bg-rose-200 transition-colors">考点与陷阱</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setTerminologyPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-cyan-100 text-cyan-800 font-bold text-sm hover:bg-cyan-200 transition-colors">术语精确定义</button>
              <button onClick={() => { setReviewModeChooserOpen(false); setTrickyProfessorPanelOpen(true); }} className="py-3 px-4 rounded-xl bg-orange-100 text-orange-800 font-bold text-sm hover:bg-orange-200 transition-colors">刁钻教授</button>
            </div>
            <button onClick={() => { setReviewModeChooserOpen(false); setTrapListPanelOpen(true); }} className="mt-2 text-amber-600 text-sm font-medium hover:underline">我的陷阱清单{trapList.length > 0 ? ` (${trapList.length})` : ''}</button>
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
          onSaveRounds={setReviewQuizRounds}
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
          onSaveCards={setReviewFlashCards}
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
          }}
        />
      )}

      {/* 考点与陷阱面板 */}
      {examTrapsPanelOpen && (
        <ExamTrapsPanel
          onClose={() => { setExamTrapsPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
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
        />
      )}

      {/* 刁钻教授面板 */}
      {trickyProfessorPanelOpen && (
        <TrickyProfessorPanel
          onClose={() => { setTrickyProfessorPanelOpen(false); clearCombinedReview(); }}
          pdfContent={combinedReviewContent ?? pdfDataUrl ?? fullPdfText}
        />
      )}

      {/* 陷阱清单面板 */}
      {trapListPanelOpen && (
        <TrapListPanel
          onClose={() => setTrapListPanelOpen(false)}
          items={trapList}
          onRemove={(id) => setTrapList(prev => prev.filter(t => t.id !== id))}
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
          }}
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
            className="relative flex flex-col border-r border-stone-200 bg-[#E5E7EB] transition-[width] duration-0 ease-linear" 
            style={{ width: isImmersive ? (isSidePanelCollapsed ? '98%' : `${leftPanelWidth}%`) : '60%' }}
          >
              <div className="flex-1 relative overflow-hidden flex flex-col">
                  {commonSlideViewer}
                  {renderVideoOverlay()}
              </div>
          </div>

          {isImmersive && !isSidePanelCollapsed && (
            <div
              onMouseDown={handleDragSplitterStart} 
              className="w-1.5 bg-stone-200 hover:bg-indigo-400 cursor-col-resize z-50 flex items-center justify-center transition-colors shadow-sm relative -ml-[3px]" 
              title="左右拖动调整宽度"
            ></div>
          )}

          <div className={`flex flex-col h-full relative z-20 bg-white transition-all duration-300 ${isImmersive ? (isSidePanelCollapsed ? 'w-[40px] border-l border-stone-200' : 'flex-1 min-w-[300px]') : 'flex-1'}`}>
            {commonRightPanel}
          </div>
        </main>
        {!isImmersive && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-stone-300 animate-bounce flex flex-col items-center cursor-pointer pointer-events-none z-30 opacity-80">
            <span className="text-xs font-bold tracking-widest uppercase mb-1">Scroll Down</span>
            <ChevronDown className="w-6 h-6" />
          </div>
        )}
      </section>

      {!isImmersive && (
        <>
          <section className="bg-[#FFFBF7] pt-20 pb-24 relative z-10">
             <Notebook fileName={fileName} notes={fileName ? (notebookData[fileName] || {}) : {}} onUpdateNote={handleUpdateNote} onDeleteNote={handleDeleteNote} />
             <footer className="mt-10 text-center text-stone-300 text-sm font-bold tracking-widest">逃课神器 · POWERED BY GEMINI 3.0 PRO</footer>
          </section>
        </>
      )}
    </div>
  );
};

export default App;
