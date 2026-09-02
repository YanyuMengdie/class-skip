import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Coffee,
  FileText,
  Folder,
  GraduationCap,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  addCalendarEvent,
  addMemo,
  createCloudFolder,
  createCloudSession,
  createJointReviewPack,
  deleteCalendarEvent,
  deleteCloudSession,
  deleteJointReviewPack,
  deleteMemo,
  getCalendarEvents,
  getJointReviewPacks,
  getMemos,
  getTinyStudyEntrySessionFromCloud,
  getUserSessions,
  moveSession,
  saveTinyStudyEntrySessionToCloud,
  updateJointReviewPack,
  uploadPDF,
} from '@/services/firebase';
import { extractPdfText, fetchFileFromUrl, readFileAsDataURL, renderPdfFirstPagePreview, renderPdfPagePreview } from '@/lib/pdf/pdfUtils';
import { TaskHug } from '@/features/energyRefuel/TaskHug';
import { ChatHug } from '@/features/energyRefuel/ChatHug';
import {
  chatWithJointReviewGuide,
  generateJointReviewBriefing,
  generateJointReviewExamPrep,
  generateTinyStudyEntries,
  generateTinyStudyEntryStep,
  generateTinyStudyStep,
  type JointReviewSourceInput,
  type TinyStudyAction,
} from '@/services/geminiService';
import {
  CalendarEvent,
  ChatMessage,
  CloudSession,
  JointReviewMaterialRole,
  JointReviewPack,
  LearnerProfileAvatarTone,
  LearnerProfileNotebook,
  Memo,
  TinyStudyEntry,
  TinyStudyEntryAction,
  TinyStudyEntrySession,
  TinyStudyEntryType,
  type AppLanguage,
} from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

type DashboardTab = 'library' | 'jointReview' | 'reluctant' | 'calendar' | 'memo' | 'energy' | 'growth' | 'profile' | 'settings';

interface DashboardScreenProps {
  user: FirebaseUser | null;
  isSyncing: boolean;
  isProcessing: boolean;
  currentFileName: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onRestoreSession: (session: CloudSession, options?: { initialPage?: number }) => void | Promise<void>;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenCurrentStudy: () => void;
  onOpenExamWorkspace: () => void;
  profileNotebook: LearnerProfileNotebook;
  onProfileNotebookChange: (profile: LearnerProfileNotebook) => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  initialTab?: DashboardTab;
}

const WELCOME_LINES = [
  '你回来了，我一直在这儿。',
  '今天不用证明什么，先坐下来就好。',
  '慢一点也没关系，我们可以接着上次的地方走。',
  '我记得你已经走过的路，不会因为停顿就忘掉。',
  '先打开一份资料，剩下的我们一页一页来。',
];

const WELCOME_LINES_EN = [
  'You are back. I have been right here.',
  'You do not need to prove anything today. Just sit down for a moment.',
  'Going slowly is fine. We can continue from where you stopped.',
  'I remember how far you have come. A pause does not erase it.',
  'Open one material first. We can take the rest one page at a time.',
];

const AVATAR_TONES: Array<{ id: LearnerProfileAvatarTone; label: string; swatch: string; bg: string; accent: string }> = [
  { id: 'sky', label: 'Sky', swatch: 'bg-sky-200 border-sky-300', bg: 'from-sky-100 to-cyan-50', accent: 'bg-sky-500' },
  { id: 'sage', label: 'Sage', swatch: 'bg-emerald-200 border-emerald-300', bg: 'from-emerald-100 to-lime-50', accent: 'bg-emerald-500' },
  { id: 'rose', label: 'Rose', swatch: 'bg-rose-200 border-rose-300', bg: 'from-rose-100 to-amber-50', accent: 'bg-rose-500' },
  { id: 'ink', label: 'Ink', swatch: 'bg-slate-300 border-slate-400', bg: 'from-slate-200 to-zinc-50', accent: 'bg-slate-700' },
];

const getTimestampMs = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { seconds?: number; toMillis?: () => number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
};

const formatDate = (value: unknown, language: AppLanguage = 'zh-CN'): string => {
  const ms = getTimestampMs(value);
  if (!ms) return language === 'en' ? 'Just now' : '刚刚';
  return new Date(ms).toLocaleDateString(language, { month: 'short', day: 'numeric' });
};

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildChildrenCount = (sessions: CloudSession[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of sessions) {
    if (item.type === 'file' && item.parentId) counts[item.parentId] = (counts[item.parentId] ?? 0) + 1;
  }
  return counts;
};

const normalizeName = (name: string): string => name.trim().toLowerCase();

const getUniqueFileName = (name: string, usedNames: Set<string>): string => {
  const trimmed = name.trim() || 'Untitled.pdf';
  const dotIndex = trimmed.lastIndexOf('.');
  const hasExtension = dotIndex > 0;
  const base = hasExtension ? trimmed.slice(0, dotIndex) : trimmed;
  const extension = hasExtension ? trimmed.slice(dotIndex) : '';
  let candidate = trimmed;
  let suffix = 1;
  while (usedNames.has(normalizeName(candidate))) {
    candidate = `${base} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(normalizeName(candidate));
  return candidate;
};

const getUniqueFolderName = (name: string, folders: CloudSession[]): string => {
  const usedNames = new Set(folders.map((folder) => normalizeName(folder.customTitle || folder.fileName)));
  return getUniqueFileName(name, usedNames);
};

type LibraryUploadStatus = {
  total: number;
  completed: number;
  currentName: string;
  failures: string[];
};

type TinyStudyTurn = {
  id: string;
  action: Extract<TinyStudyAction, 'start' | 'next'>;
  text: string;
  followUps: Array<{
    id: string;
    action: Exclude<TinyStudyAction, 'start' | 'next'>;
    text: string;
  }>;
};

const TINY_STUDY_FOLLOW_UP_LABELS: Record<Exclude<TinyStudyAction, 'start' | 'next'>, string> = {
  simpler: '讲白一点',
  deeper: '多讲一点',
  example: '换个例子',
};

type TinyStudyViewMode = 'shelf' | 'entry' | 'linear';

const TINY_STUDY_ENTRY_META: Record<TinyStudyEntryType, { label: string; accent: string; tint: string }> = {
  question: { label: '有意思的问题', accent: 'text-sky-700', tint: 'bg-sky-50' },
  experiment: { label: '实验或案例', accent: 'text-emerald-700', tint: 'bg-emerald-50' },
  counterintuitive: { label: '反直觉发现', accent: 'text-rose-700', tint: 'bg-rose-50' },
  debate: { label: '理论争论', accent: 'text-violet-700', tint: 'bg-violet-50' },
  real_life: { label: '现实连接', accent: 'text-amber-700', tint: 'bg-amber-50' },
};

const TINY_STUDY_ENTRY_ACTION_LABELS: Record<TinyStudyEntryAction, string> = {
  start: '开始讲',
  simpler: '再讲白一点',
  interesting: '为什么有意思',
  deeper: '沿着它深入一点',
};

const TINY_STUDY_ENTRY_LOCAL_KEY_PREFIX = 'class-skip:tiny-study-entries:';
const TINY_STUDY_ENTRY_PROMPT_VERSION = 'curiosity-headlines-v2';

const getTinyStudyEntryLocalKey = (uid: string, cloudSessionId: string): string =>
  `${TINY_STUDY_ENTRY_LOCAL_KEY_PREFIX}${uid}:${cloudSessionId}`;

const hashTinyStudySource = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const isTinyStudyEntrySessionValid = (
  value: unknown,
  cloudSessionId: string,
  fileFingerprint: string,
  pageCount: number,
): value is TinyStudyEntrySession => {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TinyStudyEntrySession>;
  const fingerprintMatches = session.fingerprintVersion === undefined
    || (session.fingerprintVersion === 2 && session.fileFingerprint === fileFingerprint);
  if (
    session.version !== 1
    || session.cloudSessionId !== cloudSessionId
    || !fingerprintMatches
    || session.pageCount !== pageCount
    || !Array.isArray(session.entries)
    || session.entries.length === 0
  ) return false;

  const validTypes = new Set<TinyStudyEntryType>(['question', 'experiment', 'counterintuitive', 'debate', 'real_life']);
  return session.entries.every((entry) => (
    Boolean(entry?.id && entry.title && entry.teaser && entry.evidence)
    && validTypes.has(entry.type)
    && (entry.status === 'unseen' || entry.status === 'seen')
    && Number.isInteger(entry.pageStart)
    && Number.isInteger(entry.pageEnd)
    && entry.pageStart >= 1
    && entry.pageEnd >= entry.pageStart
    && entry.pageEnd <= pageCount
    && Array.isArray(entry.turns)
  ));
};

type JointReviewDetailMode = 'briefing' | 'guide' | 'exam';

const JOINT_REVIEW_ROLE_OPTIONS: Array<{ value: JointReviewMaterialRole; label: string; short: string }> = [
  { value: 'lecture', label: 'Lecture / 课堂 slides', short: 'Lecture' },
  { value: 'reading', label: 'Reading / 课前阅读', short: 'Reading' },
  { value: 'article', label: 'Article / 文章', short: 'Article' },
  { value: 'textbook', label: 'Textbook / 教科书', short: 'Textbook' },
  { value: 'other', label: 'Other / 其他', short: 'Other' },
];

const getJointReviewRoleLabel = (role: JointReviewMaterialRole): string => (
  JOINT_REVIEW_ROLE_OPTIONS.find((option) => option.value === role)?.short ?? 'Other'
);

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  user,
  isSyncing,
  isProcessing,
  currentFileName,
  onLogin,
  onLogout,
  onRestoreSession,
  onUpload,
  onOpenCurrentStudy,
  onOpenExamWorkspace,
  profileNotebook,
  onProfileNotebookChange,
  language,
  onLanguageChange,
  initialTab = 'library',
}) => {
  const { text } = useAppLanguage();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [jointReviewPacks, setJointReviewPacks] = useState<JointReviewPack[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingJointReviewPacks, setLoadingJointReviewPacks] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<'all' | string>('all');
  const [jointReviewFolderId, setJointReviewFolderId] = useState<'all' | string>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(toLocalDateString(new Date()));
  const [newEventTitle, setNewEventTitle] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [coverPreviews, setCoverPreviews] = useState<Record<string, string>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [libraryUploadStatus, setLibraryUploadStatus] = useState<LibraryUploadStatus | null>(null);
  const [reluctantView, setReluctantView] = useState<'home' | 'tiny'>('home');
  const [tinySelectedSessionId, setTinySelectedSessionId] = useState<string>('');
  const [tinyStudyDoc, setTinyStudyDoc] = useState<{ sessionId: string; fileName: string; content: string } | null>(null);
  const [tinyStudyTurns, setTinyStudyTurns] = useState<TinyStudyTurn[]>([]);
  const [tinyStudyLoading, setTinyStudyLoading] = useState(false);
  const [tinyStudyLoadingTargetId, setTinyStudyLoadingTargetId] = useState<string | null>(null);
  const [tinyStudyLoadingAction, setTinyStudyLoadingAction] = useState<TinyStudyAction | null>(null);
  const [tinyStudyError, setTinyStudyError] = useState<string | null>(null);
  const [tinyStudyViewMode, setTinyStudyViewMode] = useState<TinyStudyViewMode>('shelf');
  const [tinyEntrySession, setTinyEntrySession] = useState<TinyStudyEntrySession | null>(null);
  const [tinyEntryScanLoading, setTinyEntryScanLoading] = useState(false);
  const [tinyEntryActionLoading, setTinyEntryActionLoading] = useState<TinyStudyEntryAction | null>(null);
  const [tinyEntryActionTargetId, setTinyEntryActionTargetId] = useState<string | null>(null);
  const [tinyEntryError, setTinyEntryError] = useState<string | null>(null);
  const [tinyEntryCloudWarning, setTinyEntryCloudWarning] = useState(false);
  const [tinyEntryPreviews, setTinyEntryPreviews] = useState<Record<string, string>>({});
  const [tinyEntryScanNonce, setTinyEntryScanNonce] = useState(0);
  const [tinyEntryScanRequestedFor, setTinyEntryScanRequestedFor] = useState<string | null>(null);
  const [selectedJointReviewPackId, setSelectedJointReviewPackId] = useState<string>('');
  const [jointReviewTitle, setJointReviewTitle] = useState('');
  const [jointReviewSelectedIds, setJointReviewSelectedIds] = useState<Record<string, boolean>>({});
  const [jointReviewRoles, setJointReviewRoles] = useState<Record<string, JointReviewMaterialRole>>({});
  const [creatingJointReviewPack, setCreatingJointReviewPack] = useState(false);
  const [generatingJointReviewPackId, setGeneratingJointReviewPackId] = useState<string | null>(null);
  const [generatingJointReviewExamPackId, setGeneratingJointReviewExamPackId] = useState<string | null>(null);
  const [jointReviewError, setJointReviewError] = useState<string | null>(null);
  const [jointReviewDetailMode, setJointReviewDetailMode] = useState<JointReviewDetailMode>('briefing');
  const [jointReviewGuideInput, setJointReviewGuideInput] = useState('');
  const [jointReviewGuideLoadingPackId, setJointReviewGuideLoadingPackId] = useState<string | null>(null);
  const [jointReviewSourceCache, setJointReviewSourceCache] = useState<Record<string, JointReviewSourceInput[]>>({});
  const requestedCoverIdsRef = useRef<Set<string>>(new Set());
  const tinyEntryDocRef = useRef<{
    sessionId: string;
    file: File;
    fileName: string;
    content: string;
    pageTexts: string[];
    fingerprint: string;
  } | null>(null);
  const tinyEntrySessionRef = useRef<TinyStudyEntrySession | null>(null);
  const tinyEntryScrollRef = useRef<HTMLDivElement | null>(null);
  const tinyEntryRequestRef = useRef(0);
  const tinyEntryScrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tinyEntryForceScanRef = useRef(false);
  const profile = profileNotebook;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setJointReviewPacks([]);
      setEvents([]);
      setMemos([]);
      return;
    }

    setLoadingSessions(true);
    getUserSessions(user)
      .then(setSessions)
      .finally(() => setLoadingSessions(false));

    setLoadingJointReviewPacks(true);
    getJointReviewPacks(user)
      .then(setJointReviewPacks)
      .finally(() => setLoadingJointReviewPacks(false));

    setLoadingCalendar(true);
    getCalendarEvents(user)
      .then(setEvents)
      .finally(() => setLoadingCalendar(false));

    setLoadingMemos(true);
    getMemos(user)
      .then(setMemos)
      .finally(() => setLoadingMemos(false));
  }, [user]);

  const reloadSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const fresh = await getUserSessions(user);
      setSessions(fresh);
    } finally {
      setLoadingSessions(false);
    }
  };

  const reloadJointReviewPacks = async () => {
    if (!user) return;
    setLoadingJointReviewPacks(true);
    try {
      const fresh = await getJointReviewPacks(user);
      setJointReviewPacks(fresh);
    } finally {
      setLoadingJointReviewPacks(false);
    }
  };

  const fileSessions = useMemo(
    () => sessions.filter((session) => session.type === 'file' && session.fileUrl),
    [sessions]
  );

  const folders = useMemo(
    () => sessions.filter((session) => session.type === 'folder'),
    [sessions]
  );

  const activeFolder = useMemo(
    () => (activeFolderId === 'all' ? null : folders.find((folder) => folder.id === activeFolderId) ?? null),
    [activeFolderId, folders]
  );

  const jointReviewActiveFolder = useMemo(
    () => (jointReviewFolderId === 'all' ? null : folders.find((folder) => folder.id === jointReviewFolderId) ?? null),
    [jointReviewFolderId, folders]
  );

  const folderCounts = useMemo(() => buildChildrenCount(sessions), [sessions]);

  const visibleFiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return fileSessions
      .filter((session) => activeFolderId === 'all' || session.parentId === activeFolderId)
      .filter((session) => {
        if (!needle) return true;
        const title = `${session.customTitle || ''} ${session.fileName || ''}`.toLowerCase();
        return title.includes(needle);
      });
  }, [activeFolderId, fileSessions, search]);

  const selectedJointReviewPack = useMemo(
    () => jointReviewPacks.find((pack) => pack.id === selectedJointReviewPackId) ?? jointReviewPacks[0] ?? null,
    [jointReviewPacks, selectedJointReviewPackId]
  );

  const jointReviewVisibleFiles = useMemo(
    () => fileSessions.filter((session) => jointReviewFolderId === 'all' || session.parentId === jointReviewFolderId),
    [fileSessions, jointReviewFolderId]
  );

  useEffect(() => {
    if (tinySelectedSessionId && fileSessions.some((session) => session.id === tinySelectedSessionId)) return;
    setTinySelectedSessionId(fileSessions[0]?.id ?? '');
  }, [fileSessions, tinySelectedSessionId]);

  useEffect(() => {
    if (selectedJointReviewPackId && jointReviewPacks.some((pack) => pack.id === selectedJointReviewPackId)) return;
    setSelectedJointReviewPackId(jointReviewPacks[0]?.id ?? '');
  }, [jointReviewPacks, selectedJointReviewPackId]);

  useEffect(() => {
    if (jointReviewFolderId === 'all') return;
    if (folders.some((folder) => folder.id === jointReviewFolderId)) return;
    setJointReviewFolderId('all');
  }, [folders, jointReviewFolderId]);

  const selectedEvents = useMemo(
    () => events.filter((event) => event.dateStr === selectedDateStr),
    [events, selectedDateStr]
  );

  const avatarTone = AVATAR_TONES.find((tone) => tone.id === profile.avatarTone) ?? AVATAR_TONES[0];

  useEffect(() => {
    let cancelled = false;
    const candidates = visibleFiles
      .filter((session) => session.fileUrl && !requestedCoverIdsRef.current.has(session.id))
      .slice(0, 12);

    if (candidates.length === 0) return;
    candidates.forEach((session) => requestedCoverIdsRef.current.add(session.id));

    (async () => {
      for (const session of candidates) {
        try {
          const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
          const preview = await renderPdfFirstPagePreview(file, 0.7);
          if (cancelled) return;
          setCoverPreviews((prev) => ({ ...prev, [session.id]: preview }));
        } catch {
          if (cancelled) return;
          setCoverPreviews((prev) => ({ ...prev, [session.id]: '' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleFiles]);

  const handleOpenSession = async (session: CloudSession) => {
    if (openingSessionId) return;
    setOpeningSessionId(session.id);
    try {
      await onRestoreSession(session);
    } finally {
      setOpeningSessionId(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!user || creatingFolder) {
      if (!user) onLogin();
      return;
    }
    const rawName = window.prompt('新文件夹名称');
    const name = rawName?.trim();
    if (!name) return;
    const uniqueName = getUniqueFolderName(name, folders);
    setCreatingFolder(true);
    try {
      const id = await createCloudFolder(user, uniqueName, null);
      await reloadSessions();
      setActiveFolderId(id);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: CloudSession) => {
    if (!user) {
      onLogin();
      return;
    }
    const folderName = folder.customTitle || folder.fileName;
    const containedFiles = fileSessions.filter((session) => session.parentId === folder.id);
    const message = containedFiles.length > 0
      ? `确定删除文件夹“${folderName}”吗？里面的 ${containedFiles.length} 个 PDF 会保留，并移回根目录。`
      : `确定删除文件夹“${folderName}”吗？`;
    if (!window.confirm(message)) return;

    const previousFolderId = activeFolderId;
    setSessions((prev) => prev
      .filter((session) => session.id !== folder.id)
      .map((session) => (session.parentId === folder.id ? { ...session, parentId: null } : session))
    );
    if (activeFolderId === folder.id) setActiveFolderId('all');
    if (jointReviewFolderId === folder.id) setJointReviewFolderId('all');

    try {
      await Promise.all(containedFiles.map((session) => moveSession(session.id, null)));
      await deleteCloudSession(folder.id);
      await reloadSessions();
    } catch {
      setActiveFolderId(previousFolderId);
      await reloadSessions();
      window.alert('删除文件夹失败，请稍后重试。');
    }
  };

  const handleLibraryBatchUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!user) {
      onLogin();
      return;
    }
    const pdfFiles = selected.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return;

    const targetParentId = activeFolderId === 'all' ? null : activeFolderId;
    const usedNames = new Set(
      fileSessions
        .filter((session) => (session.parentId ?? null) === targetParentId)
        .map((session) => normalizeName(session.fileName))
    );
    const failures: string[] = [];
    setLibraryUploadStatus({ total: pdfFiles.length, completed: 0, currentName: pdfFiles[0]?.name ?? '', failures: [] });

    for (let index = 0; index < pdfFiles.length; index += 1) {
      const file = pdfFiles[index];
      const uniqueName = getUniqueFileName(file.name, usedNames);
      setLibraryUploadStatus((prev) => ({
        total: prev?.total ?? pdfFiles.length,
        completed: prev?.completed ?? index,
        currentName: uniqueName,
        failures: prev?.failures ?? [],
      }));
      try {
        const uploadFile = file.name === uniqueName
          ? file
          : new File([file], uniqueName, { type: file.type || 'application/pdf', lastModified: file.lastModified });
        const downloadUrl = await uploadPDF(user, uploadFile);
        await createCloudSession(user, uniqueName, downloadUrl, targetParentId);
      } catch {
        failures.push(uniqueName);
      } finally {
        setLibraryUploadStatus({
          total: pdfFiles.length,
          completed: index + 1,
          currentName: index + 1 < pdfFiles.length ? pdfFiles[index + 1].name : '',
          failures: [...failures],
        });
      }
    }

    await reloadSessions();
  };

  const selectedTinyStudySession = useMemo(
    () => fileSessions.find((session) => session.id === tinySelectedSessionId) ?? null,
    [fileSessions, tinySelectedSessionId]
  );

  const persistTinyEntrySession = (nextSession: TinyStudyEntrySession) => {
    tinyEntrySessionRef.current = nextSession;
    setTinyEntrySession(nextSession);
    if (!user) return;
    try {
      localStorage.setItem(getTinyStudyEntryLocalKey(user.uid, nextSession.cloudSessionId), JSON.stringify(nextSession));
    } catch {
      // The cloud copy can still preserve the session when browser storage is unavailable.
    }
    void saveTinyStudyEntrySessionToCloud(user, nextSession)
      .then(() => setTinyEntryCloudWarning(false))
      .catch(() => setTinyEntryCloudWarning(true));
  };

  useEffect(() => {
    const source = selectedTinyStudySession;
    const scanRequested = tinyEntryScanRequestedFor === source?.id;
    const requestId = ++tinyEntryRequestRef.current;
    let cancelled = false;

    if (!user || !source?.fileUrl) {
      tinyEntryDocRef.current = null;
      tinyEntrySessionRef.current = null;
      setTinyEntrySession(null);
      setTinyEntryPreviews({});
      setTinyEntryScanLoading(false);
      return () => { cancelled = true; };
    }

    const prepareEntries = async () => {
      setTinyEntryScanLoading(scanRequested);
      setTinyEntryError(null);
      setTinyEntryCloudWarning(false);
      setTinyEntryPreviews({});
      try {
        const file = await fetchFileFromUrl(source.fileUrl, source.fileName);
        const [content, pageTexts] = await Promise.all([
          readFileAsDataURL(file),
          extractPdfText(file),
        ]);
        if (cancelled || requestId !== tinyEntryRequestRef.current) return;

  const fingerprint = hashTinyStudySource([
    TINY_STUDY_ENTRY_PROMPT_VERSION,
    source.id,
    file.name,
    file.size,
    pageTexts.length,
    ...pageTexts.map((page) => `${page.length}:${page.slice(0, 160)}:${page.slice(-160)}`),
  ].join('|'));
        tinyEntryDocRef.current = {
          sessionId: source.id,
          file,
          fileName: source.customTitle || source.fileName,
          content,
          pageTexts,
          fingerprint,
        };

        let restored: TinyStudyEntrySession | null = null;
        const forceScan = tinyEntryForceScanRef.current;
        tinyEntryForceScanRef.current = false;
        if (!forceScan) {
          try {
            const localValue = localStorage.getItem(getTinyStudyEntryLocalKey(user.uid, source.id));
            const parsed = localValue ? JSON.parse(localValue) : null;
            if (isTinyStudyEntrySessionValid(parsed, source.id, fingerprint, pageTexts.length)) restored = parsed;
          } catch {
            // Ignore stale or malformed local data and try the cloud copy.
          }
          if (!restored) {
            try {
              const cloudValue = await getTinyStudyEntrySessionFromCloud(user, source.id);
              if (isTinyStudyEntrySessionValid(cloudValue, source.id, fingerprint, pageTexts.length)) restored = cloudValue;
            } catch {
              setTinyEntryCloudWarning(true);
            }
          }
        }

        if (restored && (restored.fingerprintVersion !== 2 || restored.fileFingerprint !== fingerprint)) {
          restored = {
            ...restored,
            fingerprintVersion: 2,
            fileFingerprint: fingerprint,
            updatedAt: Date.now(),
          };
          persistTinyEntrySession(restored);
        }

        if (!restored && !scanRequested) {
          tinyEntrySessionRef.current = null;
          setTinyEntrySession(null);
          return;
        }

        if (!restored) {
          const generated = await generateTinyStudyEntries(content, pageTexts, {
            fileName: source.customTitle || source.fileName,
          });
          restored = {
            version: 1,
            fingerprintVersion: 2,
            cloudSessionId: source.id,
            fileName: source.customTitle || source.fileName,
            fileFingerprint: fingerprint,
            documentSummary: generated.documentSummary,
            pageCount: pageTexts.length,
            entries: generated.entries.map((entry, index) => ({
              ...entry,
              id: `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
              status: 'unseen',
              turns: [],
            })),
            updatedAt: Date.now(),
          };
          persistTinyEntrySession(restored);
        } else {
          tinyEntrySessionRef.current = restored;
          setTinyEntrySession(restored);
          try {
            localStorage.setItem(getTinyStudyEntryLocalKey(user.uid, source.id), JSON.stringify(restored));
          } catch {
            // Cloud restoration is enough for the current visit.
          }
        }

        const previewPairs = await Promise.all(restored.entries.map(async (entry) => {
          try {
            return [entry.id, await renderPdfPagePreview(file, entry.pageStart, 0.56)] as const;
          } catch {
            return [entry.id, ''] as const;
          }
        }));
        if (!cancelled && requestId === tinyEntryRequestRef.current) {
          setTinyEntryPreviews(Object.fromEntries(previewPairs.filter(([, value]) => Boolean(value))));
        }
      } catch {
        if (!cancelled && requestId === tinyEntryRequestRef.current) {
          setTinyEntryError(scanRequested
            ? '暂时没能整理出兴趣入口。你仍然可以从头用大白话开始。'
            : '暂时没能读取这份资料。你仍然可以从头用大白话开始。');
        }
      } finally {
        if (!cancelled && requestId === tinyEntryRequestRef.current) setTinyEntryScanLoading(false);
      }
    };

    void prepareEntries();
    return () => { cancelled = true; };
  }, [selectedTinyStudySession?.id, tinyEntryScanNonce, tinyEntryScanRequestedFor, user?.uid]);

  useEffect(() => {
    if (tinyStudyViewMode !== 'entry') return;
    const activeEntry = tinyEntrySessionRef.current?.entries.find(
      (entry) => entry.id === tinyEntrySessionRef.current?.activeEntryId
    );
    const frame = window.requestAnimationFrame(() => {
      if (tinyEntryScrollRef.current) tinyEntryScrollRef.current.scrollTop = activeEntry?.scrollTop ?? 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tinyStudyViewMode, tinyEntrySession?.activeEntryId]);

  const runTinyEntryAction = async (entryId: string, action: TinyStudyEntryAction) => {
    const entrySession = tinyEntrySessionRef.current;
    const doc = tinyEntryDocRef.current;
    const entry = entrySession?.entries.find((item) => item.id === entryId);
    if (!entrySession || !doc || !entry || tinyEntryActionLoading) return;
    setTinyEntryActionLoading(action);
    setTinyEntryActionTargetId(entryId);
    setTinyEntryError(null);
    try {
      const text = await generateTinyStudyEntryStep(doc.content, {
        fileName: doc.fileName,
        documentSummary: entrySession.documentSummary,
        entry,
        action,
        pageTexts: doc.pageTexts,
        previousTurns: entry.turns,
      });
      const nextSession: TinyStudyEntrySession = {
        ...entrySession,
        activeEntryId: entryId,
        entries: entrySession.entries.map((item) => item.id === entryId ? {
          ...item,
          status: 'seen',
          lastReadAt: Date.now(),
          turns: [...item.turns, {
            id: `entry-turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            action,
            text,
            createdAt: Date.now(),
          }],
        } : item),
        updatedAt: Date.now(),
      };
      persistTinyEntrySession(nextSession);
      window.requestAnimationFrame(() => {
        if (tinyEntryScrollRef.current) tinyEntryScrollRef.current.scrollTop = tinyEntryScrollRef.current.scrollHeight;
      });
    } catch {
      setTinyEntryError('这次没有讲出来。可以再点一次，或者换一个入口。');
    } finally {
      setTinyEntryActionLoading(null);
      setTinyEntryActionTargetId(null);
    }
  };

  const handleOpenTinyEntry = (entryId: string) => {
    const entrySession = tinyEntrySessionRef.current;
    const entry = entrySession?.entries.find((item) => item.id === entryId);
    if (!entrySession || !entry) return;
    const nextSession: TinyStudyEntrySession = {
      ...entrySession,
      activeEntryId: entryId,
      entries: entrySession.entries.map((item) => item.id === entryId ? {
        ...item,
        status: 'seen',
        lastReadAt: Date.now(),
      } : item),
      updatedAt: Date.now(),
    };
    persistTinyEntrySession(nextSession);
    setTinyStudyViewMode('entry');
    if (entry.turns.length === 0) void runTinyEntryAction(entryId, 'start');
  };

  const handleTinyEntryScroll = () => {
    if (tinyEntryScrollSaveTimerRef.current) clearTimeout(tinyEntryScrollSaveTimerRef.current);
    tinyEntryScrollSaveTimerRef.current = setTimeout(() => {
      const entrySession = tinyEntrySessionRef.current;
      const scrollTop = tinyEntryScrollRef.current?.scrollTop;
      if (!entrySession?.activeEntryId || scrollTop === undefined) return;
      persistTinyEntrySession({
        ...entrySession,
        entries: entrySession.entries.map((entry) => entry.id === entrySession.activeEntryId
          ? { ...entry, scrollTop }
          : entry),
        updatedAt: Date.now(),
      });
    }, 250);
  };

  const handleOpenTinyEntryPage = async (entry: TinyStudyEntry) => {
    if (!selectedTinyStudySession || openingSessionId !== null) return;
    setOpeningSessionId(selectedTinyStudySession.id);
    try {
      await onRestoreSession(selectedTinyStudySession, { initialPage: entry.pageStart });
    } finally {
      setOpeningSessionId(null);
    }
  };

  const handleConfirmTinyEntryScan = () => {
    if (!selectedTinyStudySession || tinyEntryScanLoading) return;
    setTinyEntryError(null);
    setTinyEntryScanRequestedFor(selectedTinyStudySession.id);
  };

  const handleRegenerateTinyEntries = () => {
    if (!selectedTinyStudySession || tinyEntryScanLoading) return;
    if (!window.confirm('重新生成会替换这份资料现有的兴趣入口和入口内讲解。确定继续吗？')) return;
    tinyEntryForceScanRef.current = true;
    tinyEntrySessionRef.current = null;
    setTinyEntrySession(null);
    setTinyStudyViewMode('shelf');
    setTinyEntryScanRequestedFor(selectedTinyStudySession.id);
    setTinyEntryScanNonce((value) => value + 1);
  };

  const handleSelectTinyStudySession = (sessionId: string) => {
    setTinySelectedSessionId(sessionId);
    setTinyStudyDoc(null);
    setTinyStudyTurns([]);
    setTinyStudyLoadingTargetId(null);
    setTinyStudyLoadingAction(null);
    setTinyStudyError(null);
    setTinyStudyViewMode('shelf');
    setTinyEntrySession(null);
    tinyEntrySessionRef.current = null;
    tinyEntryDocRef.current = null;
    setTinyEntryError(null);
    setTinyEntryCloudWarning(false);
    setTinyEntryPreviews({});
    setTinyEntryScanRequestedFor(null);
  };

  const runTinyStudyStep = async (action: TinyStudyAction, targetTurnId?: string) => {
    if (!user) {
      onLogin();
      return;
    }
    if (!selectedTinyStudySession || tinyStudyLoading) return;
    const isFollowUpAction = action === 'simpler' || action === 'deeper' || action === 'example';
    const targetTurn = targetTurnId ? tinyStudyTurns.find((turn) => turn.id === targetTurnId) : null;
    if (isFollowUpAction && !targetTurn) return;
    setTinyStudyLoading(true);
    setTinyStudyLoadingTargetId(isFollowUpAction ? targetTurnId ?? null : null);
    setTinyStudyLoadingAction(action);
    setTinyStudyError(null);
    try {
      let doc = tinyStudyDoc;
      if (!doc || doc.sessionId !== selectedTinyStudySession.id) {
        const file = await fetchFileFromUrl(selectedTinyStudySession.fileUrl, selectedTinyStudySession.fileName);
        const content = await readFileAsDataURL(file);
        doc = {
          sessionId: selectedTinyStudySession.id,
          fileName: selectedTinyStudySession.customTitle || selectedTinyStudySession.fileName,
          content,
        };
        setTinyStudyDoc(doc);
      }

      const previousTurns = action === 'start'
        ? []
        : tinyStudyTurns.map((turn, index) => {
            const followUps = turn.followUps.length > 0
              ? `\n这段下面已有补充：${turn.followUps.map((item) => `${TINY_STUDY_FOLLOW_UP_LABELS[item.action]}：${item.text}`).join('\n')}`
              : '';
            return `第 ${index + 1} 小段：${turn.text}${followUps}`;
          });
      const text = await generateTinyStudyStep(doc.content, {
        fileName: doc.fileName,
        action,
        previousTurns,
        targetTurn: targetTurn ? {
          index: tinyStudyTurns.findIndex((turn) => turn.id === targetTurn.id) + 1,
          text: targetTurn.text,
        } : undefined,
      });
      const nextId = `tiny-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setTinyStudyTurns((prev) => {
        if (action === 'start') {
          return [{ id: nextId, action: 'start', text, followUps: [] }];
        }
        if (action === 'next') {
          return [...prev, { id: nextId, action: 'next', text, followUps: [] }];
        }
        return prev.map((turn) => (
          turn.id === targetTurn?.id
            ? { ...turn, followUps: [...turn.followUps, { id: nextId, action, text }] }
            : turn
        ));
      });
    } catch {
      setTinyStudyError('这次没能读到 PDF。可以稍后再试，或者换一份资料。');
    } finally {
      setTinyStudyLoading(false);
      setTinyStudyLoadingTargetId(null);
      setTinyStudyLoadingAction(null);
    }
  };

  const handleOpenTinyStudyMaterial = () => {
    if (!selectedTinyStudySession) return;
    handleOpenSession(selectedTinyStudySession);
  };

  const toggleJointReviewMaterial = (session: CloudSession) => {
    setJointReviewSelectedIds((prev) => {
      const next = { ...prev, [session.id]: !prev[session.id] };
      if (!next[session.id]) delete next[session.id];
      return next;
    });
    setJointReviewRoles((prev) => {
      if (prev[session.id]) return prev;
      const hasLecture = Object.entries(jointReviewSelectedIds).some(([id, selected]) => selected && prev[id] === 'lecture');
      return { ...prev, [session.id]: hasLecture ? 'reading' : 'lecture' };
    });
  };

  const setJointReviewMaterialRole = (sessionId: string, role: JointReviewMaterialRole) => {
    setJointReviewRoles((prev) => ({ ...prev, [sessionId]: role }));
  };

  const handleCreateJointReviewPack = async () => {
    if (!user) {
      onLogin();
      return;
    }
    if (creatingJointReviewPack) return;
    const selected = fileSessions.filter((session) => jointReviewSelectedIds[session.id]);
    if (selected.length < 2) {
      window.alert('至少选择 2 份 PDF：一份 lecture，再加一份 reading / article / textbook。');
      return;
    }
    const hasLecture = selected.some((session) => (jointReviewRoles[session.id] ?? 'reading') === 'lecture');
    if (!hasLecture) {
      window.alert('请至少把一份材料标记为 Lecture。');
      return;
    }
    const title = jointReviewTitle.trim() || `${selected.find((session) => jointReviewRoles[session.id] === 'lecture')?.fileName ?? '新的课次'} 复习包`;
    setCreatingJointReviewPack(true);
    setJointReviewError(null);
    try {
      const created = await createJointReviewPack(user, {
        title,
        materials: selected.map((session, index) => ({
          cloudSessionId: session.id,
          fileName: session.customTitle || session.fileName,
          role: jointReviewRoles[session.id] ?? (index === 0 ? 'lecture' : 'reading'),
          sortIndex: index,
        })),
      });
      setJointReviewPacks((prev) => [created, ...prev]);
      setSelectedJointReviewPackId(created.id);
      setJointReviewTitle('');
      setJointReviewSelectedIds({});
      setJointReviewRoles({});
    } catch {
      setJointReviewError('创建复习包失败，请稍后重试。');
    } finally {
      setCreatingJointReviewPack(false);
    }
  };

  const handleDeleteJointReviewPack = async (pack: JointReviewPack) => {
    if (!user) return;
    if (!window.confirm(`确定删除“${pack.title}”吗？不会删除里面的 PDF。`)) return;
    const previous = jointReviewPacks;
    setJointReviewPacks((prev) => prev.filter((item) => item.id !== pack.id));
    try {
      await deleteJointReviewPack(user.uid, pack.id);
    } catch {
      setJointReviewPacks(previous);
      setJointReviewError('删除复习包失败，请稍后重试。');
    }
  };

  const loadJointReviewSources = async (pack: JointReviewPack): Promise<JointReviewSourceInput[]> => {
    if (jointReviewSourceCache[pack.id]) return jointReviewSourceCache[pack.id];
    const sources: JointReviewSourceInput[] = [];
      for (const material of [...pack.materials].sort((a, b) => a.sortIndex - b.sortIndex)) {
        const session = fileSessions.find((item) => item.id === material.cloudSessionId);
        if (!session?.fileUrl) continue;
        const file = await fetchFileFromUrl(session.fileUrl, session.fileName);
        const content = await readFileAsDataURL(file);
        sources.push({
          fileName: material.fileName || session.customTitle || session.fileName,
          role: material.role,
          content,
        });
      }
    setJointReviewSourceCache((prev) => ({ ...prev, [pack.id]: sources }));
    return sources;
  };

  const handleGenerateJointReview = async (pack: JointReviewPack) => {
    if (!user || generatingJointReviewPackId) return;
    setGeneratingJointReviewPackId(pack.id);
    setJointReviewError(null);
    try {
      const sources = await loadJointReviewSources(pack);
      if (sources.length === 0) throw new Error('NO_SOURCES');
      const summaryMarkdown = await generateJointReviewBriefing(sources, { title: pack.title });
      const generatedAt = Date.now();
      await updateJointReviewPack(user, pack.id, { summaryMarkdown, generatedAt });
      setJointReviewPacks((prev) => prev.map((item) => (
        item.id === pack.id
          ? { ...item, summaryMarkdown, generatedAt, updatedAt: generatedAt }
          : item
      )));
    } catch {
      setJointReviewError('生成联合复习说明失败，请稍后重试。');
    } finally {
      setGeneratingJointReviewPackId(null);
    }
  };

  const handleGenerateJointReviewExamPrep = async (pack: JointReviewPack) => {
    if (!user || generatingJointReviewExamPackId) return;
    setGeneratingJointReviewExamPackId(pack.id);
    setJointReviewError(null);
    try {
      const sources = await loadJointReviewSources(pack);
      if (sources.length === 0) throw new Error('NO_SOURCES');
      const examPrepMarkdown = await generateJointReviewExamPrep(sources, {
        title: pack.title,
        summaryMarkdown: pack.summaryMarkdown,
        guideMessages: pack.guideMessages,
      });
      const examPrepGeneratedAt = Date.now();
      await updateJointReviewPack(user, pack.id, { examPrepMarkdown, examPrepGeneratedAt });
      setJointReviewPacks((prev) => prev.map((item) => (
        item.id === pack.id
          ? { ...item, examPrepMarkdown, examPrepGeneratedAt, updatedAt: examPrepGeneratedAt }
          : item
      )));
    } catch {
      setJointReviewError('生成考试整合失败，请稍后重试。');
    } finally {
      setGeneratingJointReviewExamPackId(null);
    }
  };

  const handleSendJointReviewGuide = async (pack: JointReviewPack, message: string) => {
    if (!user || jointReviewGuideLoadingPackId) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    setJointReviewGuideInput('');
    setJointReviewGuideLoadingPackId(pack.id);
    setJointReviewError(null);

    const previousMessages = pack.guideMessages ?? [];
    const userMsg: ChatMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
    const optimisticMessages = [...previousMessages, userMsg];
    setJointReviewPacks((prev) => prev.map((item) => (
      item.id === pack.id ? { ...item, guideMessages: optimisticMessages } : item
    )));

    try {
      const sources = await loadJointReviewSources(pack);
      if (sources.length === 0) throw new Error('NO_SOURCES');
      const response = await chatWithJointReviewGuide(sources, previousMessages, trimmed, {
        title: pack.title,
        summaryMarkdown: pack.summaryMarkdown,
      });
      const modelMsg: ChatMessage = { role: 'model', text: response, timestamp: Date.now() };
      const nextMessages = [...optimisticMessages, modelMsg];
      await updateJointReviewPack(user, pack.id, { guideMessages: nextMessages });
      setJointReviewPacks((prev) => prev.map((item) => (
        item.id === pack.id
          ? { ...item, guideMessages: nextMessages, updatedAt: Date.now() }
          : item
      )));
    } catch {
      setJointReviewPacks((prev) => prev.map((item) => (
        item.id === pack.id ? { ...item, guideMessages: previousMessages } : item
      )));
      setJointReviewGuideInput(trimmed);
      setJointReviewError('联合领读生成失败，请稍后重试。');
    } finally {
      setJointReviewGuideLoadingPackId(null);
    }
  };

  const updateProfile = <Key extends keyof LearnerProfileNotebook>(key: Key, value: LearnerProfileNotebook[Key]) => {
    onProfileNotebookChange({ ...profile, [key]: value, updatedAt: Date.now() });
  };

  const rotateWelcomeLine = () => {
    const lines = language === 'en' ? WELCOME_LINES_EN : WELCOME_LINES;
    const current = lines.indexOf(profile.welcomeLine);
    updateProfile('welcomeLine', lines[(current + 1 + lines.length) % lines.length]);
  };

  const addEvent = async () => {
    if (!user || !newEventTitle.trim()) return;
    const draft = {
      title: newEventTitle.trim(),
      startTime: '09:00',
      endTime: '10:00',
      type: 'study' as const,
      dateStr: selectedDateStr,
    };
    const tempId = `temp-${Date.now()}`;
    setEvents((prev) => [...prev, { id: tempId, userId: user.uid, ...draft }]);
    setNewEventTitle('');
    try {
      const saved = await addCalendarEvent(user, draft);
      setEvents((prev) => prev.map((event) => (event.id === tempId ? saved : event)));
    } catch {
      setEvents((prev) => prev.filter((event) => event.id !== tempId));
    }
  };

  const removeEvent = async (eventId: string) => {
    if (!user) return;
    const previous = events;
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
    try {
      await deleteCalendarEvent(user.uid, eventId);
    } catch {
      setEvents(previous);
    }
  };

  const addMemoItem = async () => {
    if (!user || !memoInput.trim()) return;
    const content = memoInput.trim();
    setMemoInput('');
    try {
      const saved = await addMemo(user, content);
      setMemos((prev) => [saved, ...prev]);
    } catch {
      setMemoInput(content);
    }
  };

  const removeMemo = async (memoId: string) => {
    if (!user) return;
    const previous = memos;
    setMemos((prev) => prev.filter((memo) => memo.id !== memoId));
    try {
      await deleteMemo(user.uid, memoId);
    } catch {
      setMemos(previous);
    }
  };

  const renderLibrary = () => {
    const uploadTargetName = activeFolder ? (activeFolder.customTitle || activeFolder.fileName) : '根目录';
    const isLibraryUploading = !!libraryUploadStatus && libraryUploadStatus.completed < libraryUploadStatus.total;
    const uploadCompleted = !!libraryUploadStatus && libraryUploadStatus.completed >= libraryUploadStatus.total;

    return (
    <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-6">
      <aside className="space-y-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setActiveFolderId('all')}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeFolderId === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span className="truncate">全部资料</span>
            </span>
            <span className="text-xs opacity-70">{fileSessions.length}</span>
          </button>
          {folders.map((folder) => {
            const active = activeFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveFolderId(folder.id)}
                  className="min-w-0 flex-1 flex items-center justify-between gap-2 px-3 py-2 text-sm font-bold"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="truncate">{folder.customTitle || folder.fileName}</span>
                  </span>
                  <span className="text-xs opacity-70">{folderCounts[folder.id] ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(folder)}
                  className={`shrink-0 p-1.5 rounded-md transition-colors ${
                    active
                      ? 'text-white/60 hover:bg-white/10 hover:text-white'
                      : 'text-slate-300 hover:bg-rose-50 hover:text-rose-500'
                  }`}
                  aria-label={`删除文件夹 ${folder.customTitle || folder.fileName}`}
                  title="删除文件夹"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleCreateFolder}
            disabled={!user || creatingFolder}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-slate-400 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Folder className="w-4 h-4" />}
            <span>{creatingFolder ? '创建中' : '新建文件夹'}</span>
          </button>
          <label className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-dashed border-indigo-300 text-sm font-bold text-indigo-700 hover:border-indigo-500 hover:text-indigo-900 cursor-pointer transition-colors ${!user || isLibraryUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isLibraryUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            <span>{isLibraryUploading ? '上传中' : '上传到云端'}</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              disabled={!user || isLibraryUploading}
              onChange={handleLibraryBatchUpload}
            />
          </label>
        </div>

        <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:border-slate-500 hover:text-slate-900 cursor-pointer transition-colors">
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{isProcessing ? '处理中' : '本地打开'}</span>
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={onUpload} />
        </label>
      </aside>

      <section className="min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">资料库</h2>
            <p className="text-sm text-slate-500 mt-1">
              {activeFolder ? `当前文件夹：${activeFolder.customTitle || activeFolder.fileName}` : currentFileName ? `上次打开：${currentFileName}` : '选一份资料进去，学习页会接住你。'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:items-center">
            <label className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold cursor-pointer hover:bg-slate-700 transition-colors ${!user || isLibraryUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isLibraryUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
              <span>{isLibraryUploading ? '上传中' : `上传到${uploadTargetName}`}</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                disabled={!user || isLibraryUploading}
                onChange={handleLibraryBatchUpload}
              />
            </label>
            <div className="relative md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Open"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-slate-400"
              />
            </div>
          </div>
        </div>

        {libraryUploadStatus && (
          <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800">
                  {uploadCompleted ? '上传完成' : `正在上传 ${libraryUploadStatus.completed}/${libraryUploadStatus.total}`}
                </p>
                <p className="mt-1 text-xs text-slate-500 truncate">
                  {uploadCompleted
                    ? `已放入${uploadTargetName}${libraryUploadStatus.failures.length ? `，${libraryUploadStatus.failures.length} 个失败` : ''}`
                    : libraryUploadStatus.currentName}
                </p>
                {libraryUploadStatus.failures.length > 0 && (
                  <p className="mt-2 text-xs font-bold text-rose-600">
                    失败：{libraryUploadStatus.failures.join('、')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLibraryUploadStatus(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
                aria-label="关闭上传状态"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!user ? (
          <div className="min-h-[320px] bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center text-center p-8">
            <CloudOff className="w-10 h-10 text-slate-300 mb-4" />
            <p className="text-lg font-black text-slate-800">登录后查看云端资料</p>
            <button
              type="button"
              onClick={onLogin}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
            >
              <LogIn className="w-4 h-4" />
              登录
            </button>
          </div>
        ) : loadingSessions ? (
          <div className="min-h-[320px] flex items-center justify-center text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : visibleFiles.length === 0 ? (
          <div className="min-h-[320px] bg-white border border-slate-200 rounded-lg flex flex-col items-center justify-center text-center p-8">
            <FileText className="w-10 h-10 text-slate-300 mb-4" />
            <p className="text-lg font-black text-slate-800">这里还没有资料</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {visibleFiles.map((session, index) => (
              <button
                key={session.id}
                type="button"
                onClick={() => handleOpenSession(session)}
                disabled={openingSessionId !== null}
                className="craft-library-card group text-left border rounded-lg overflow-hidden disabled:cursor-wait disabled:opacity-80"
              >
                <div className="h-44 bg-[#f7faf9] border-b border-slate-100 p-5 overflow-hidden relative">
                  {coverPreviews[session.id] ? (
                    <img
                      src={coverPreviews[session.id]}
                      alt=""
                      className="h-full w-full object-contain rounded-md border border-slate-200 bg-white shadow-sm"
                    />
                  ) : coverPreviews[session.id] === '' ? (
                    <div className="h-full rounded-md border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-sm ${index % 3 === 0 ? 'bg-rose-400' : index % 3 === 1 ? 'bg-emerald-400' : 'bg-sky-400'}`} />
                        <span className="h-2 rounded-full bg-slate-200 flex-1" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <span className="rounded-md bg-slate-100" />
                        <span className="rounded-md bg-amber-100" />
                        <span className="rounded-md bg-emerald-100" />
                        <span className="rounded-md bg-sky-100" />
                      </div>
                      <span className="h-2 rounded-full bg-slate-200 w-2/3" />
                    </div>
                  ) : (
                    <div className="h-full rounded-md border border-slate-200 bg-white shadow-sm p-4 animate-pulse">
                      <div className="h-3 rounded-full bg-slate-200 w-full" />
                      <div className="mt-7 grid grid-cols-2 gap-3">
                        <div className="h-10 rounded-md bg-slate-100" />
                        <div className="h-10 rounded-md bg-slate-100" />
                        <div className="h-10 rounded-md bg-slate-100" />
                        <div className="h-10 rounded-md bg-slate-100" />
                      </div>
                    </div>
                  )}
                  {openingSessionId === session.id && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                      <Loader2 className="w-7 h-7 animate-spin text-slate-800" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-black text-slate-900 line-clamp-2">
                      {session.customTitle || session.fileName}
                    </h3>
                    {openingSessionId === session.id ? (
                      <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0 mt-1" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-800 shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(session.createdAt, language)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
    );
  };

  const renderJointReview = () => {
    const selectedCount = Object.values(jointReviewSelectedIds).filter(Boolean).length;
    const isGeneratingSelected = !!selectedJointReviewPack && generatingJointReviewPackId === selectedJointReviewPack.id;
    const sortedPackMaterials = selectedJointReviewPack
      ? [...selectedJointReviewPack.materials].sort((a, b) => a.sortIndex - b.sortIndex)
      : [];
    const guideMessages = selectedJointReviewPack?.guideMessages ?? [];
    const isGuideLoading = !!selectedJointReviewPack && jointReviewGuideLoadingPackId === selectedJointReviewPack.id;
    const isExamGenerating = !!selectedJointReviewPack && generatingJointReviewExamPackId === selectedJointReviewPack.id;

    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 md:p-6">
          <p className="text-xs font-black uppercase text-indigo-600">Joint Review</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">课次复习包</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            把 lecture slides 和课前 paper / article / textbook 放在一起，让 AI 先整理它们的关系，再告诉你怎么搭配复习。
          </p>
        </section>

        {jointReviewError && (
          <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {jointReviewError}
          </div>
        )}

        <div className="grid grid-cols-1 2xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-black text-slate-900">创建一个课次</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                先选已有云端 PDF，至少一份标成 Lecture。
              </p>

              <input
                value={jointReviewTitle}
                onChange={(event) => setJointReviewTitle(event.target.value)}
                disabled={!user}
                placeholder="例如 Lecture 10 Emotion"
                className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 disabled:bg-slate-50"
              />

              {!user ? (
                <button
                  type="button"
                  onClick={onLogin}
                  className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white"
                >
                  登录后创建
                </button>
              ) : fileSessions.length === 0 ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  资料库里还没有云端 PDF。先上传一些 lecture 和 reading。
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <span className="text-xs font-black text-slate-400">选择范围</span>
                      <span className="text-xs font-bold text-slate-400">已选 {selectedCount}</span>
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => setJointReviewFolderId('all')}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-black transition-colors ${
                          jointReviewFolderId === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <LayoutGrid className="h-4 w-4 shrink-0" />
                          <span className="truncate">全部资料</span>
                        </span>
                        <span className="text-xs opacity-70">{fileSessions.length}</span>
                      </button>
                      {folders.map((folder) => {
                        const active = jointReviewFolderId === folder.id;
                        return (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setJointReviewFolderId(folder.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-black transition-colors ${
                              active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Folder className="h-4 w-4 shrink-0" />
                              <span className="truncate">{folder.customTitle || folder.fileName}</span>
                            </span>
                            <span className="text-xs opacity-70">{folderCounts[folder.id] ?? 0}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p className="mt-3 text-xs font-bold text-slate-400">
                    {jointReviewActiveFolder ? `当前文件夹：${jointReviewActiveFolder.customTitle || jointReviewActiveFolder.fileName}` : '当前显示：全部资料'}
                  </p>

                  <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                    {jointReviewVisibleFiles.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">
                        这个文件夹里还没有 PDF。
                      </div>
                    ) : (
                      jointReviewVisibleFiles.map((session) => {
                        const checked = !!jointReviewSelectedIds[session.id];
                        const role = jointReviewRoles[session.id] ?? 'reading';
                        return (
                          <div
                            key={session.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <label className="flex cursor-pointer items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleJointReviewMaterial(session)}
                                className="mt-1 h-4 w-4 rounded border-slate-300"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-black text-slate-800">
                                  {session.customTitle || session.fileName}
                                </span>
                                <span className="mt-1 block text-xs text-slate-400">{formatDate(session.createdAt, language)}</span>
                              </span>
                            </label>
                            {checked && (
                              <select
                                value={role}
                                onChange={(event) => setJointReviewMaterialRole(session.id, event.target.value as JointReviewMaterialRole)}
                                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-slate-400"
                              >
                                {JOINT_REVIEW_ROLE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateJointReviewPack}
                    disabled={creatingJointReviewPack || selectedCount < 2}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {creatingJointReviewPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    创建复习包
                  </button>
                </>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-900">已有复习包</h3>
                {loadingJointReviewPacks && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </div>
              {jointReviewPacks.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">还没有课次复习包。</p>
              ) : (
                <div className="space-y-2">
                  {jointReviewPacks.map((pack) => {
                    const active = selectedJointReviewPack?.id === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedJointReviewPackId(pack.id)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <span className="block truncate text-sm font-black">{pack.title}</span>
                        <span className={`mt-1 block text-xs ${active ? 'text-white/60' : 'text-slate-400'}`}>
                          {pack.materials.length} 份材料 · {pack.generatedAt ? '已生成说明' : '未生成'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          <section className="min-h-[680px] rounded-lg border border-slate-200 bg-white">
            {!selectedJointReviewPack ? (
              <div className="flex min-h-[680px] flex-col items-center justify-center p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                  <BookOpen className="h-8 w-8 text-slate-300" />
                </div>
                <p className="mt-5 text-lg font-black text-slate-800">先创建一个课次复习包</p>
                <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                  选 lecture 和 readings，AI 会先帮你整理它们之间的关系。
                </p>
              </div>
            ) : (
              <div className="flex min-h-[680px] flex-col">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase text-indigo-600">课次复习包</p>
                      <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedJointReviewPack.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedJointReviewPack.generatedAt
                          ? `上次生成：${new Date(selectedJointReviewPack.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : '还没有生成联合复习说明'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateJointReview(selectedJointReviewPack)}
                        disabled={!!generatingJointReviewPackId}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGeneratingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {selectedJointReviewPack.summaryMarkdown ? '重新生成说明' : '生成联合复习说明'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteJointReviewPack(selectedJointReviewPack)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-100 bg-white px-3 py-2 text-sm font-black text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {sortedPackMaterials.map((material) => (
                      <div key={`${material.cloudSessionId}-${material.sortIndex}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-indigo-700">
                          {getJointReviewRoleLabel(material.role)}
                        </span>
                        <p className="mt-2 line-clamp-2 text-sm font-black text-slate-800">{material.fileName}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 rounded-lg bg-slate-50 p-1">
                    {[
                      { id: 'briefing' as const, label: '复习说明', icon: FileText },
                      { id: 'guide' as const, label: '联合领读', icon: MessageCircle },
                      { id: 'exam' as const, label: '考试整合', icon: Check },
                    ].map((tab) => {
                      const active = jointReviewDetailMode === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setJointReviewDetailMode(tab.id)}
                          className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-colors ${
                            active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <tab.icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/40 p-5 md:p-6">
                  {jointReviewDetailMode === 'guide' ? (
                    <div className="mx-auto flex min-h-[500px] max-w-4xl flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 p-4">
                        <p className="text-sm font-black text-slate-900">联合领读</p>
                        <p className="mt-1 text-xs leading-6 text-slate-500">
                          以 lecture 为主线；需要证据、背景或出处时，再把 reading / article / textbook 拉进来。
                        </p>
                      </div>

                      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 custom-scrollbar">
                        {guideMessages.length === 0 && !isGuideLoading ? (
                          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50">
                              <MessageCircle className="h-8 w-8 text-indigo-300" />
                            </div>
                            <p className="mt-5 text-lg font-black text-slate-800">从 lecture 主线开始</p>
                            <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                              AI 会一小段一小段带你复习；遇到需要课前阅读支撑的地方，会顺手接上。
                            </p>
                          </div>
                        ) : (
                          guideMessages.map((msg, index) => (
                            <div key={`${msg.timestamp}-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div
                                className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                  msg.role === 'user'
                                    ? 'rounded-tr-none bg-indigo-600 text-white'
                                    : 'rounded-tl-none border border-slate-200 bg-white text-slate-700'
                                }`}
                              >
                                {msg.role === 'model' ? (
                                  <ReactMarkdown
                                    components={{
                                      p: ({ node, ...props }) => <p className="my-2 leading-7" {...props} />,
                                      ul: ({ node, ...props }) => <ul className="my-2 list-disc space-y-1 pl-5 leading-7" {...props} />,
                                      ol: ({ node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5 leading-7" {...props} />,
                                      strong: ({ node, ...props }) => <strong className="font-black text-indigo-800" {...props} />,
                                      h2: ({ node, ...props }) => <h2 className="mb-2 mt-4 text-base font-black text-slate-900" {...props} />,
                                      h3: ({ node, ...props }) => <h3 className="mb-2 mt-3 text-sm font-black text-slate-900" {...props} />,
                                    }}
                                  >
                                    {msg.text}
                                  </ReactMarkdown>
                                ) : (
                                  <p className="whitespace-pre-wrap leading-7">{msg.text}</p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                        {isGuideLoading && (
                          <div className="flex justify-start">
                            <div className="flex items-center gap-3 rounded-2xl rounded-tl-none border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm">
                              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                              正在把 lecture 和 readings 接起来...
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-100 bg-white p-4">
                        <div className="mb-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSendJointReviewGuide(selectedJointReviewPack, guideMessages.length === 0 ? '请开始联合领读。先用 lecture 主线讲第一小段，必要时调用 readings 支撑。' : '继续下一小段。')}
                            disabled={isGuideLoading}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-40"
                          >
                            {guideMessages.length === 0 ? '开始联合领读' : '继续下一小段'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendJointReviewGuide(selectedJointReviewPack, '这一段先只按 lecture 主线讲，不要展开 reading。')}
                            disabled={isGuideLoading}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            只讲 lecture
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendJointReviewGuide(selectedJointReviewPack, '把刚才这一点背后的 reading / article 证据补一下。')}
                            disabled={isGuideLoading || guideMessages.length === 0}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            补 reading 证据
                          </button>
                        </div>
                        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-slate-400">
                          <textarea
                            value={jointReviewGuideInput}
                            onChange={(event) => setJointReviewGuideInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSendJointReviewGuide(selectedJointReviewPack, jointReviewGuideInput);
                              }
                            }}
                            disabled={isGuideLoading}
                            placeholder="问联合领读 AI：这页 lecture 对应哪篇 reading？"
                            rows={1}
                            className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => handleSendJointReviewGuide(selectedJointReviewPack, jointReviewGuideInput)}
                            disabled={isGuideLoading || !jointReviewGuideInput.trim()}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                            aria-label="发送"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : jointReviewDetailMode === 'exam' ? (
                    <div className="mx-auto max-w-4xl space-y-4">
                      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-black text-slate-900">考试整合</p>
                            <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">
                              把 lecture 主线和 readings 的证据整理成考前版本：最小答案、加分 evidence、易混点和自测题。
                            </p>
                            {selectedJointReviewPack.examPrepGeneratedAt && (
                              <p className="mt-2 text-xs font-bold text-slate-400">
                                上次生成：{new Date(selectedJointReviewPack.examPrepGeneratedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleGenerateJointReviewExamPrep(selectedJointReviewPack)}
                            disabled={isExamGenerating || !!generatingJointReviewPackId}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isExamGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {selectedJointReviewPack.examPrepMarkdown ? '重新生成考试整合' : '生成考试整合'}
                          </button>
                        </div>
                      </section>

                      {isExamGenerating ? (
                        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-center shadow-sm">
                          <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />
                          <p className="mt-4 text-lg font-black text-slate-800">正在整理考前版本</p>
                          <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                            我会区分 lecture 的最小答案和 readings 的加分证据，再整理可能题型和易混点。
                          </p>
                        </div>
                      ) : selectedJointReviewPack.examPrepMarkdown ? (
                        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-7">
                          <ReactMarkdown
                            components={{
                              h1: ({ node, ...props }) => <h1 className="mb-5 text-2xl font-black text-slate-950" {...props} />,
                              h2: ({ node, ...props }) => <h2 className="mb-3 mt-7 text-lg font-black text-slate-900" {...props} />,
                              h3: ({ node, ...props }) => <h3 className="mb-2 mt-5 text-base font-black text-slate-800" {...props} />,
                              p: ({ node, ...props }) => <p className="my-3 text-sm leading-7 text-slate-700" {...props} />,
                              ul: ({ node, ...props }) => <ul className="my-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700" {...props} />,
                              ol: ({ node, ...props }) => <ol className="my-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700" {...props} />,
                              table: ({ node, ...props }) => <table className="my-5 w-full border-collapse text-left text-sm" {...props} />,
                              th: ({ node, ...props }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 font-black text-slate-700" {...props} />,
                              td: ({ node, ...props }) => <td className="border border-slate-200 px-3 py-2 align-top text-slate-700" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-black text-emerald-800" {...props} />,
                            }}
                          >
                            {selectedJointReviewPack.examPrepMarkdown}
                          </ReactMarkdown>
                        </article>
                      ) : (
                        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-center shadow-sm">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50">
                            <Check className="h-8 w-8 text-emerald-300" />
                          </div>
                          <p className="mt-5 text-lg font-black text-slate-800">还没生成考试整合</p>
                          <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                            点上方按钮后，AI 会把这组材料整理成可以直接考前看的答题版本。
                          </p>
                        </div>
                      )}
                    </div>
                  ) : isGeneratingSelected ? (
                    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                      <Loader2 className="h-9 w-9 animate-spin text-indigo-500" />
                      <p className="mt-4 text-lg font-black text-slate-800">正在整理材料关系</p>
                      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                        我会先看 lecture 和 readings 的角色，再生成主线、对应关系、复习优先级和考试用法。
                      </p>
                    </div>
                  ) : selectedJointReviewPack.summaryMarkdown ? (
                    <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-5 md:p-7 shadow-sm">
                      <ReactMarkdown
                        components={{
                          h1: ({ node, ...props }) => <h1 className="mb-5 text-2xl font-black text-slate-950" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="mb-3 mt-7 text-lg font-black text-slate-900" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="mb-2 mt-5 text-base font-black text-slate-800" {...props} />,
                          p: ({ node, ...props }) => <p className="my-3 text-sm leading-7 text-slate-700" {...props} />,
                          ul: ({ node, ...props }) => <ul className="my-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700" {...props} />,
                          ol: ({ node, ...props }) => <ol className="my-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-black text-indigo-800" {...props} />,
                        }}
                      >
                        {selectedJointReviewPack.summaryMarkdown}
                      </ReactMarkdown>
                    </article>
                  ) : (
                    <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                        <FileText className="h-8 w-8 text-slate-300" />
                      </div>
                      <p className="mt-5 text-lg font-black text-slate-800">还没生成说明</p>
                      <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
                        点上方按钮后，AI 会回答：这些 reading 和 lecture 到底怎么一起复习。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    return (
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
              className="p-2 rounded-lg hover:bg-slate-100"
              aria-label="上个月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-xl font-black text-slate-900">
              {currentDate.toLocaleDateString(language, { year: 'numeric', month: 'long' })}
            </h2>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
              className="p-2 rounded-lg hover:bg-slate-100"
              aria-label="下个月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {(language === 'en'
              ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              : ['日', '一', '二', '三', '四', '五', '六']).map((day) => (
              <div key={day} className="text-xs font-bold text-slate-400 py-2">
                {day}
              </div>
            ))}
            {Array.from({ length: firstDay }).map((_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const dateStr = toLocalDateString(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
              const selected = selectedDateStr === dateStr;
              const hasEvent = events.some((event) => event.dateStr === dateStr);
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`h-14 rounded-lg border text-sm font-bold transition-colors relative ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {day}
                  {hasEvent && <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-emerald-500'}`} />}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="bg-white border border-slate-200 rounded-lg p-5 min-h-[360px]">
          <h3 className="text-lg font-black text-slate-900">{selectedDateStr}</h3>
          <div className="mt-4 flex gap-2">
            <input
              value={newEventTitle}
              onChange={(event) => setNewEventTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addEvent();
              }}
              disabled={!user}
              placeholder={user ? text('新的日程', 'New event') : text('请先登录', 'Sign in first')}
              className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={addEvent}
              disabled={!user || !newEventTitle.trim()}
              className="p-2 rounded-lg bg-slate-900 text-white disabled:opacity-30"
              aria-label="新增日程"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loadingCalendar ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : selectedEvents.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">没有日程</p>
            ) : (
              selectedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <span className="mt-1 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">{event.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{event.startTime} - {event.endTime}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEvent(event.id)}
                    className="p-1 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                    aria-label="删除日程"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    );
  };

  const renderMemo = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 h-fit">
        <h2 className="text-xl font-black text-slate-900">便签</h2>
        <textarea
          value={memoInput}
          onChange={(event) => setMemoInput(event.target.value)}
          disabled={!user}
          placeholder={user ? '写一条便签' : '请先登录'}
          className="mt-4 w-full h-40 rounded-lg border border-slate-200 p-3 text-sm outline-none resize-none focus:border-slate-400 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={addMemoItem}
          disabled={!user || !memoInput.trim()}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-30"
        >
          <Check className="w-4 h-4" />
          保存
        </button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 content-start">
        {loadingMemos ? (
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        ) : memos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg min-h-[240px] flex items-center justify-center text-slate-400">
            暂无便签
          </div>
        ) : (
          memos.map((memo) => (
            <article key={memo.id} className="bg-white border border-slate-200 rounded-lg p-4 min-h-40 group">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{memo.content}</p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">{new Date(memo.createdAt).toLocaleDateString(language)}</span>
                <button
                  type="button"
                  onClick={() => removeMemo(memo.id)}
                  className="p-1 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  aria-label="删除便签"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );

  const renderGrowth = () => {
    const learningDays = new Set(fileSessions.map((session) => formatDate(session.createdAt, language))).size;
    const recentDocs = fileSessions.slice(0, 4);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: text('资料', 'Materials'), value: fileSessions.length, color: 'bg-sky-500' },
            { label: text('回来过的天', 'Days returned'), value: learningDays, color: 'bg-emerald-500' },
            { label: text('日程', 'Events'), value: events.length, color: 'bg-amber-500' },
            { label: text('便签', 'Notes'), value: memos.length, color: 'bg-rose-500' },
          ].map((item) => (
            <section key={item.label} className="bg-white border border-slate-200 rounded-lg p-5">
              <span className={`block w-8 h-1 rounded-full ${item.color}`} />
              <p className="mt-4 text-3xl font-black text-slate-900">{item.value}</p>
              <p className="text-sm font-bold text-slate-500">{item.label}</p>
            </section>
          ))}
        </div>

        <section className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-5">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-black text-slate-900">我的成长</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
              <p className="text-sm font-black text-slate-800">最近状态趋势</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{profile.recentTrend}</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
              <p className="text-sm font-black text-slate-800">最近打开</p>
              <div className="mt-3 space-y-2">
                {recentDocs.length === 0 ? (
                  <p className="text-sm text-slate-400">还没有云端资料</p>
                ) : (
                  recentDocs.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onRestoreSession(session)}
                      className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-slate-300"
                    >
                      <span className="truncate text-sm font-bold text-slate-700">{session.customTitle || session.fileName}</span>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 h-fit">
        <div className={`h-44 rounded-lg bg-gradient-to-br ${avatarTone.bg} relative overflow-hidden flex items-end justify-center`}>
          <div className="absolute left-6 top-8 w-24 h-12 rounded-[50%] bg-white/70" />
          <div className="absolute right-6 top-14 w-32 h-14 rounded-[50%] bg-white/70" />
          <div className="relative mb-5 w-24 h-24 rounded-full bg-white border border-white shadow-sm flex items-center justify-center">
            <div className={`w-16 h-16 rounded-full ${avatarTone.accent} flex items-center justify-center`}>
              <UserRound className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>
        <input
          value={profile.companionName}
          onChange={(event) => updateProfile('companionName', event.target.value)}
          className="mt-4 w-full px-3 py-2 rounded-lg border border-slate-200 font-black text-slate-900 outline-none focus:border-slate-400"
        />
        <div className="mt-4 flex items-center gap-2">
          {AVATAR_TONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => updateProfile('avatarTone', tone.id)}
              className={`w-8 h-8 rounded-lg border-2 ${tone.swatch} ${profile.avatarTone === tone.id ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
              aria-label={tone.label}
            />
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 className="text-xl font-black text-slate-900">关于我</h2>
          <button
            type="button"
            onClick={rotateWelcomeLine}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            aria-label="换一句迎接的话"
            title="换一句"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-black text-slate-400 uppercase">迎接的话</span>
          <textarea
            value={profile.welcomeLine}
            onChange={(event) => updateProfile('welcomeLine', event.target.value)}
            className="mt-2 w-full h-20 rounded-lg border border-slate-200 p-3 text-sm outline-none resize-none focus:border-slate-400"
          />
        </label>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            ['smoothAndStuck', '哪里顺 / 哪里卡'] as const,
            ['focusDuration', '专注能撑多久'] as const,
            ['stuckReaction', '卡住时的反应'] as const,
            ['bestTime', '什么时候状态最好'] as const,
            ['recentTrend', '最近怎么样'] as const,
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs font-black text-slate-400 uppercase">{label}</span>
              <textarea
                value={profile[key]}
                onChange={(event) => updateProfile(key, event.target.value)}
                className="mt-2 w-full h-28 rounded-lg border border-slate-200 p-3 text-sm leading-relaxed outline-none resize-none focus:border-slate-400"
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {text('通用设置', 'General settings')}
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">{text('语言', 'Language')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {text(
                '语言会立即应用到固定界面和之后新生成的 AI 内容。PDF、文件名、过去的聊天和已经生成的学习内容都不会被翻译或改写。',
                'The language applies immediately to the interface and future AI output. PDFs, filenames, past chats, and previously generated study content will not be translated or rewritten.',
              )}
            </p>
          </div>
        </div>

        <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <h3 className="font-black text-slate-900">{text('界面语言', 'Interface language')}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {user
                ? text('已登录：这个选择会同步到你的账户。', 'Signed in: this preference will sync with your account.')
                : text('未登录：这个选择会保存在当前设备。', 'Signed out: this preference will be saved on this device.')}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 md:mt-0 md:w-[300px]" role="group" aria-label={text('界面语言', 'Interface language')}>
            <button
              type="button"
              onClick={() => onLanguageChange('zh-CN')}
              aria-pressed={language === 'zh-CN'}
              className={`rounded-lg px-4 py-2.5 text-sm font-black transition-colors ${
                language === 'zh-CN' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              简体中文
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('en')}
              aria-pressed={language === 'en'}
              className={`rounded-lg px-4 py-2.5 text-sm font-black transition-colors ${
                language === 'en' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderTinyEntryPanel = () => {
    const activeEntry = tinyEntrySession?.entries.find((entry) => entry.id === tinyEntrySession.activeEntryId) ?? null;
    const isActiveEntryLoading = !!activeEntry
      && tinyEntryActionTargetId === activeEntry.id
      && tinyEntryActionLoading !== null;

    if (tinyStudyViewMode === 'entry' && activeEntry) {
      const meta = TINY_STUDY_ENTRY_META[activeEntry.type];
      return (
        <section className="rounded-lg border border-slate-200 bg-white min-h-[560px] flex flex-col overflow-hidden">
          <div className="border-b border-slate-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setTinyStudyViewMode('shelf')}
                className="mb-3 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4" />
                换一个入口
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${meta.tint} ${meta.accent}`}>{meta.label}</span>
                <span className="text-xs font-bold text-slate-400">第 {activeEntry.pageStart}-{activeEntry.pageEnd} 页</span>
              </div>
              <h3 className="mt-2 text-xl font-black text-slate-900">{activeEntry.title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{activeEntry.teaser}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleOpenTinyEntryPage(activeEntry)}
              disabled={openingSessionId !== null}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <BookOpen className="h-4 w-4" />
              打开原页
            </button>
          </div>

          <div
            ref={tinyEntryScrollRef}
            onScroll={handleTinyEntryScroll}
            className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/40 p-5 md:p-6"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              {activeEntry.turns.map((turn) => (
                <article key={turn.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-xs font-black text-slate-400">{TINY_STUDY_ENTRY_ACTION_LABELS[turn.action]}</p>
                  <div className="prose prose-slate max-w-none prose-p:leading-8 prose-li:leading-7 prose-headings:font-black">
                    <ReactMarkdown>{turn.text}</ReactMarkdown>
                  </div>
                </article>
              ))}

              {isActiveEntryLoading && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-indigo-700 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-black">正在{TINY_STUDY_ENTRY_ACTION_LABELS[tinyEntryActionLoading!]}...</span>
                </div>
              )}

              {tinyEntryError && (
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                  {tinyEntryError}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white p-4 flex flex-wrap items-center gap-2">
            {(['simpler', 'interesting', 'deeper'] as TinyStudyEntryAction[]).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void runTinyEntryAction(activeEntry.id, action)}
                disabled={tinyEntryActionLoading !== null}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {TINY_STUDY_ENTRY_ACTION_LABELS[action]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTinyStudyViewMode('shelf')}
              className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              换一个入口
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white min-h-[560px] overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-sky-600">兴趣入口</p>
            <h3 className="mt-1 text-xl font-black text-slate-900">
              {selectedTinyStudySession ? '这份资料可以从哪里开始？' : '先选一份 PDF'}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {tinyEntrySession?.documentSummary
                || (selectedTinyStudySession
                  ? '先确认这就是你现在想读的资料。确认后，我再帮你找几个有意思且有原文依据的入口。'
                  : '从左边选一份资料。')}
            </p>
          </div>
          {selectedTinyStudySession && tinyEntrySession && (
            <button
              type="button"
              onClick={handleRegenerateTinyEntries}
              disabled={tinyEntryScanLoading}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCcw className={`h-4 w-4 ${tinyEntryScanLoading ? 'animate-spin' : ''}`} />
              重新找入口
            </button>
          )}
        </div>

        <div className="p-5 md:p-6">
          {!selectedTinyStudySession ? (
            <div className="min-h-[380px] flex flex-col items-center justify-center text-center">
              <BookOpen className="h-10 w-10 text-slate-300" />
              <p className="mt-4 font-black text-slate-800">从左边选一份资料</p>
              <p className="mt-2 text-sm text-slate-500">不用打开 PDF，我先帮你找几个可能愿意读下去的地方。</p>
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setTinyStudyViewMode('linear')}
                className="w-full rounded-lg border border-slate-900 bg-slate-900 p-4 text-left text-white shadow-sm hover:bg-slate-800"
              >
                <span className="flex items-center gap-2 text-sm font-black"><BookOpen className="h-4 w-4" /> 从头开始，用大白话讲</span>
                <span className="mt-1 block text-xs leading-relaxed text-white/65">保留原来的方式，从资料开头一小段一小段往后听。</span>
              </button>

              {!tinyEntrySession && !tinyEntryScanLoading && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-5">
                  <p className="text-xs font-black uppercase text-indigo-600">已经选中</p>
                  <h4 className="mt-1 truncate text-base font-black text-slate-900">
                    {selectedTinyStudySession.customTitle || selectedTinyStudySession.fileName}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    我还没有开始扫描。确认后才会通读这份 PDF，并寻找几个真正有原文依据的兴趣入口。
                  </p>
                  <button
                    type="button"
                    onClick={handleConfirmTinyEntryScan}
                    className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-500"
                  >
                    就读这份，帮我找入口
                  </button>
                </div>
              )}

              {tinyEntryScanLoading && !tinyEntrySession ? (
                <div className="min-h-[300px] flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                  <p className="mt-4 font-black text-slate-800">正在翻一遍资料，找有意思的入口...</p>
                  <p className="mt-2 text-sm text-slate-500">只保留能在原文里找到依据的内容，不强行凑数。</p>
                </div>
              ) : tinyEntrySession?.entries.length ? (
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                  {tinyEntrySession.entries.map((entry) => {
                    const meta = TINY_STUDY_ENTRY_META[entry.type];
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleOpenTinyEntry(entry.id)}
                        className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                      >
                        <div className="aspect-[16/7] bg-slate-100 overflow-hidden">
                          {tinyEntryPreviews[entry.id] ? (
                            <img src={tinyEntryPreviews[entry.id]} alt="" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]" />
                          ) : (
                            <div className="h-full flex items-center justify-center"><FileText className="h-8 w-8 text-slate-300" /></div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${meta.tint} ${meta.accent}`}>{meta.label}</span>
                            <span className={`text-xs font-black ${entry.status === 'seen' ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {entry.status === 'seen' ? '看过' : '未看'}
                            </span>
                          </div>
                          <h4 className="mt-3 text-base font-black leading-snug text-slate-900">{entry.title}</h4>
                          <p className="mt-2 text-sm leading-6 text-slate-500 line-clamp-3">{entry.teaser}</p>
                          <div className="mt-4 flex items-center justify-between text-xs font-black text-slate-400">
                            <span>第 {entry.pageStart}-{entry.pageEnd} 页</span>
                            <span className="inline-flex items-center gap-1 text-slate-700">从这里开始 <ArrowRight className="h-3.5 w-3.5" /></span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {tinyEntryError && (
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{tinyEntryError}</div>
              )}
              {tinyEntryCloudWarning && (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  这次可以正常使用，但入口记录暂时没有同步到云端。
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderReluctant = () => {
    const canStartTinyStudy = !!selectedTinyStudySession && !tinyStudyLoading;
    const recentTinySessions = fileSessions.slice(0, 3);
    const featuredTinySession = selectedTinyStudySession || recentTinySessions[0] || null;
    const openTinyShelf = (sessionId?: string) => {
      if (sessionId) handleSelectTinyStudySession(sessionId);
      setTinyStudyViewMode('shelf');
      setReluctantView('tiny');
    };
    const openTinyLinear = (sessionId?: string) => {
      if (sessionId) handleSelectTinyStudySession(sessionId);
      setTinyStudyViewMode('linear');
      setReluctantView('tiny');
    };
    return (
      <div className="space-y-6">
        {reluctantView === 'home' ? (
          <>
            <section className="relative overflow-hidden rounded-lg border border-sky-200 bg-[#dff3f7] px-5 py-6 md:px-8 md:py-7">
              <div aria-hidden="true" className="absolute -bottom-10 -left-8 h-28 w-44 rotate-6 rounded-lg bg-[#f5c1b8]" />
              <div aria-hidden="true" className="absolute -right-8 -top-12 h-32 w-48 -rotate-6 rounded-lg bg-[#b9dfcc]" />
              <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase text-sky-700">Low Energy Mode</p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">今天不用学很多</h2>
                  <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-slate-600 md:text-base">
                    选一个让你好奇的地方就够了。你不用先打开 slides，也不用答题或证明自己学会了。
                  </p>
                </div>
                {featuredTinySession ? (
                  <button
                    type="button"
                    onClick={() => openTinyShelf(featuredTinySession.id)}
                    className="group flex min-w-0 items-center gap-4 rounded-lg border border-white bg-white/90 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {coverPreviews[featuredTinySession.id] ? (
                        <img
                          src={coverPreviews[featuredTinySession.id]}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FileText className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-sky-700">上次看到的资料</span>
                      <span className="mt-1 block truncate text-sm font-black text-slate-900">
                        {featuredTinySession.customTitle || featuredTinySession.fileName}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 group-hover:text-slate-900">
                        找个有意思的地方
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openTinyShelf()}
                    className="rounded-lg border border-white bg-white/90 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-slate-900">先选一份资料</span>
                        <span className="mt-1 block text-xs text-slate-500">我们从最不费劲的地方开始</span>
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">Choose a doorway</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">今天先从哪儿开始？</h3>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.55fr)]">
                <button
                  type="button"
                  onClick={() => openTinyShelf(featuredTinySession?.id)}
                  className="group grid min-h-[220px] overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md md:grid-cols-[220px_minmax(0,1fr)]"
                >
                  <div className="min-h-[180px] overflow-hidden bg-slate-100">
                    {featuredTinySession && coverPreviews[featuredTinySession.id] ? (
                      <img
                        src={coverPreviews[featuredTinySession.id]}
                        alt=""
                        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full min-h-[180px] items-center justify-center bg-[#edf4ff]">
                        <Sparkles className="h-9 w-9 text-indigo-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-between p-5 md:p-6">
                    <div>
                      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        推荐从这里开始
                      </span>
                      <h4 className="mt-4 text-xl font-black text-slate-950">先让 AI 替我翻一遍</h4>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">
                        不从第一页硬啃。先从资料里挑出几个反直觉的问题、实验或争论，你只选一个感兴趣的看。
                      </p>
                    </div>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-900">
                      找个有意思的入口
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openTinyLinear(featuredTinySession?.id)}
                  className="group flex min-h-[220px] flex-col justify-between rounded-lg border border-slate-200 bg-[#fff9e8] p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md md:p-6"
                >
                  <div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <h4 className="mt-5 text-xl font-black text-slate-950">从头听一小段</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      不挑入口，就从开头用最简单的大白话慢慢讲。一次只读一点点。
                    </p>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-900">
                    直接开始
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              </div>
            </section>

            {recentTinySessions.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className="text-base font-black text-slate-900">最近的资料</h3>
                  <button
                    type="button"
                    onClick={() => openTinyShelf()}
                    className="text-xs font-black text-slate-500 hover:text-slate-900"
                  >
                    查看全部
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {recentTinySessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => openTinyShelf(session.id)}
                      className="group flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                        {coverPreviews[session.id] ? (
                          <img src={coverPreviews[session.id]} alt="" className="h-full w-full object-cover object-top" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <FileText className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-900">
                          {session.customTitle || session.fileName}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">{formatDate(session.createdAt, language)}</span>
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 group-hover:text-slate-900">
                          看看有什么好玩的
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <p className="border-t border-slate-200 pt-4 text-xs font-semibold text-slate-400">
              慢慢来。以后这里还会加入“帮我挑最容易开始的资料”和“把今天任务缩到最小”。
            </p>
          </>
        ) : (
          <>
          <section className="rounded-lg border border-sky-100 bg-[#eef8fa] p-5 md:p-6">
            <p className="text-xs font-black uppercase text-sky-600">Low Energy Mode</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">只学一点点</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              选一份 PDF。你可以从有意思的地方开始，也可以从头听一小段。
            </p>
          </section>
          <section className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
            <aside className="rounded-lg border border-slate-200 bg-white p-5 h-fit">
              <button
                type="button"
                onClick={() => setReluctantView('home')}
                className="mb-4 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="w-4 h-4" />
                回到不想学
              </button>
              <h3 className="text-lg font-black text-slate-900">选一份 PDF</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                不会打开阅读页，只拿来讲一小段。
              </p>

              {!user ? (
                <button
                  type="button"
                  onClick={onLogin}
                  className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white"
                >
                  登录后选择资料
                </button>
              ) : fileSessions.length === 0 ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  资料库里还没有 PDF。可以先去资料库上传到云端。
                </div>
              ) : (
                <div className="mt-5 space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                  {fileSessions.map((session) => {
                    const active = session.id === tinySelectedSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => handleSelectTinyStudySession(session.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          active
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                        }`}
                      >
                        <span className="block truncate text-sm font-black">{session.customTitle || session.fileName}</span>
                        <span className={`mt-1 block text-xs ${active ? 'text-white/60' : 'text-slate-400'}`}>
                          {formatDate(session.createdAt, language)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            {tinyStudyViewMode === 'linear' ? (
            <section className="rounded-lg border border-slate-200 bg-white min-h-[560px] flex flex-col overflow-hidden">
              <div className="border-b border-slate-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-600">只学一点点</p>
                  <h3 className="mt-1 text-xl font-black text-slate-900">
                    {selectedTinyStudySession ? (selectedTinyStudySession.customTitle || selectedTinyStudySession.fileName) : '先选一份 PDF'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">最简单的大白话，一次只讲一小段。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTinyStudyViewMode('shelf')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    返回兴趣入口
                  </button>
                  <button
                    type="button"
                    onClick={() => runTinyStudyStep(tinyStudyTurns.length === 0 ? 'start' : 'next')}
                    disabled={!canStartTinyStudy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {tinyStudyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                    {tinyStudyTurns.length === 0 ? '开始只学一点点' : '继续下一小段'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-6 bg-slate-50/40">
                {tinyStudyTurns.length === 0 && !tinyStudyLoading ? (
                  <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                      <Coffee className="w-9 h-9 text-slate-300" />
                    </div>
                    <p className="mt-5 text-lg font-black text-slate-800">先不用打开资料</p>
                    <p className="mt-2 max-w-sm text-sm leading-7 text-slate-500">
                      选一份 PDF 后点开始，我只讲一小段。你愿意再看，我们再往后走。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tinyStudyTurns.map((turn, index) => (
                      <article key={turn.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-black text-slate-400">第 {index + 1} 小段</span>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                            {turn.action === 'next' ? '下一小段' : '开头'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-base leading-8 text-slate-700">{turn.text}</p>

                        {turn.followUps.length > 0 && (
                          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                            {turn.followUps.map((followUp) => (
                              <div key={followUp.id} className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                                <p className="mb-2 text-xs font-black text-indigo-600">
                                  {TINY_STUDY_FOLLOW_UP_LABELS[followUp.action]}
                                </p>
                                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{followUp.text}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {tinyStudyLoading && tinyStudyLoadingTargetId === turn.id && (
                          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 flex items-center gap-3 text-indigo-700">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm font-black">
                              正在{tinyStudyLoadingAction ? TINY_STUDY_FOLLOW_UP_LABELS[tinyStudyLoadingAction as Exclude<TinyStudyAction, 'start' | 'next'>] : '补充'}这段...
                            </span>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => runTinyStudyStep('simpler', turn.id)}
                            disabled={!canStartTinyStudy}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            这段讲白一点
                          </button>
                          <button
                            type="button"
                            onClick={() => runTinyStudyStep('deeper', turn.id)}
                            disabled={!canStartTinyStudy}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            这段多讲一点
                          </button>
                          <button
                            type="button"
                            onClick={() => runTinyStudyStep('example', turn.id)}
                            disabled={!canStartTinyStudy}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            换个例子
                          </button>
                        </div>
                      </article>
                    ))}
                    {tinyStudyLoading && !tinyStudyLoadingTargetId && (
                      <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center gap-3 text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-bold">正在用最简单的话讲给你听...</span>
                      </div>
                    )}
                  </div>
                )}

                {tinyStudyError && (
                  <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                    {tinyStudyError}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 bg-white p-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => runTinyStudyStep('next')}
                  disabled={!canStartTinyStudy || tinyStudyTurns.length === 0}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  继续下一小段
                </button>
                <button
                  type="button"
                  onClick={handleOpenTinyStudyMaterial}
                  disabled={!selectedTinyStudySession || openingSessionId !== null}
                  className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  打开资料
                </button>
              </div>
            </section>
            ) : renderTinyEntryPanel()}
          </section>
          </>
        )}
      </div>
    );
  };

  const renderEnergy = () => (
    <div className="space-y-6">
      <section className="rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-5 md:p-6">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-emerald-600">Energy Refill</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">能量补给</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            学不动的时候先来这里。一个帮你拆出第一步，一个陪你缓一缓。
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <TaskHug />
        <ChatHug />
      </section>
    </div>
  );

  const renderActiveTab = () => {
    if (activeTab === 'jointReview') return renderJointReview();
    if (activeTab === 'reluctant') return renderReluctant();
    if (activeTab === 'calendar') return renderCalendar();
    if (activeTab === 'memo') return renderMemo();
    if (activeTab === 'energy') return renderEnergy();
    if (activeTab === 'growth') return renderGrowth();
    if (activeTab === 'profile') return renderProfile();
    if (activeTab === 'settings') return renderSettings();
    return renderLibrary();
  };

  return (
    <div className="craft-dashboard min-h-screen text-slate-900 flex overflow-hidden">
      <aside className="craft-dashboard-sidebar hidden lg:flex w-72 shrink-0 border-r border-slate-200 flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <BookOpen className="w-5 h-5 text-slate-800" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-900 truncate">{text('逃课神器', 'Class Skip')}</p>
                <p className="text-xs text-slate-500 truncate">{user?.displayName || 'My Space'}</p>
              </div>
            </div>
            {user ? (
              <button type="button" onClick={onLogout} className="p-2 rounded-lg hover:bg-white" aria-label="退出登录">
                <LogOut className="w-4 h-4 text-slate-500" />
              </button>
            ) : (
              <button type="button" onClick={onLogin} className="p-2 rounded-lg hover:bg-white" aria-label="登录">
                <LogIn className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        <nav className="craft-dashboard-nav p-3 space-y-1">
          {[
            { id: 'library', icon: Cloud, label: text('资料库', 'Library') },
            { id: 'jointReview', icon: BookOpen, label: text('联合复习', 'Combined review') },
            { id: 'reluctant', icon: Coffee, label: text('我现在不想学', "I don't want to study") },
            { id: 'calendar', icon: CalendarDays, label: text('日历', 'Calendar') },
            { id: 'memo', icon: PencilLine, label: text('便签', 'Notes') },
            { id: 'energy', icon: Coffee, label: text('能量补给', 'Energy refill') },
            { id: 'growth', icon: Sparkles, label: text('我的成长', 'My growth') },
            { id: 'profile', icon: UserRound, label: text('关于我', 'About me') },
            { id: 'settings', icon: Settings2, label: text('设置', 'Settings') },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as DashboardTab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                activeTab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          ))}

          <div className="pt-2 mt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onOpenExamWorkspace}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-black bg-slate-900 text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              <span>{text('备考工作台', 'Exam workspace')}</span>
            </button>
          </div>
        </nav>

        <div className="mt-auto p-4 border-t border-slate-200">
          {currentFileName ? (
            <button
              type="button"
              onClick={onOpenCurrentStudy}
              className="w-full flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 p-3 text-left hover:border-slate-400 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-400 uppercase">{text('继续', 'Continue')}</span>
                <span className="block text-sm font-bold text-slate-800 truncate">{currentFileName}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ) : (
            <div className="rounded-lg bg-white/70 border border-slate-200 p-3 text-xs text-slate-500">
              {user
                ? (isSyncing ? text('同步中', 'Syncing') : text('云端已连接', 'Cloud connected'))
                : text('未登录', 'Signed out')}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
        {activeTab !== 'reluctant' && activeTab !== 'settings' && (
        <section className="craft-dashboard-hero border-b border-slate-200">
          <div className="relative px-5 md:px-8 py-6 md:py-8">
            <div className="lg:hidden flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white border border-white/70 flex items-center justify-center shadow-sm">
                  <BookOpen className="w-5 h-5 text-slate-800" />
                </div>
                <p className="font-black text-slate-900 truncate">{text('逃课神器', 'Class Skip')}</p>
              </div>
              <button
                type="button"
                onClick={user ? onLogout : onLogin}
                className="p-2 rounded-lg bg-white/80 border border-white"
                aria-label={user ? text('退出登录', 'Sign out') : text('登录', 'Sign in')}
              >
                {user ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-end">
              <div className="max-w-3xl">
                <p className="text-sm font-black text-slate-600 mb-3">{profile.companionName}</p>
                <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight text-slate-950">
                  {profile.welcomeLine}
                </h1>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {currentFileName && (
                    <button
                      type="button"
                      onClick={onOpenCurrentStudy}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
                    >
                      <BookOpen className="w-4 h-4" />
                      {text('继续', 'Continue')}
                    </button>
                  )}
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-bold border border-white/80 hover:border-slate-300 cursor-pointer">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isProcessing ? text('处理中', 'Processing') : text('打开资料', 'Open material')}
                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={onUpload} />
                  </label>
                </div>
              </div>

              <div className="craft-dashboard-companion rounded-lg p-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white border border-white flex items-center justify-center shadow-sm">
                    <div className={`w-11 h-11 rounded-full ${avatarTone.accent} flex items-center justify-center`}>
                      <UserRound className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{profile.companionName}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{profile.recentTrend}</p>
                  </div>
                  <button
                    type="button"
                    onClick={rotateWelcomeLine}
                    className="ml-auto p-2 rounded-lg bg-white/70 hover:bg-white shrink-0"
                    aria-label="换一句"
                    title="换一句"
                  >
                    <RefreshCcw className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        <div className="lg:hidden sticky top-0 z-20 bg-[#f7f8f6]/95 backdrop-blur border-b border-slate-200 px-3 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {[
              { id: 'library', icon: Cloud, label: text('资料库', 'Library') },
              { id: 'jointReview', icon: BookOpen, label: text('联合复习', 'Review') },
              { id: 'reluctant', icon: Coffee, label: text('不想学', 'Low energy') },
              { id: 'calendar', icon: CalendarDays, label: text('日历', 'Calendar') },
              { id: 'memo', icon: PencilLine, label: text('便签', 'Notes') },
              { id: 'energy', icon: Coffee, label: text('能量补给', 'Energy') },
              { id: 'growth', icon: Sparkles, label: text('成长', 'Growth') },
              { id: 'profile', icon: UserRound, label: text('关于我', 'About me') },
              { id: 'settings', icon: Settings2, label: text('设置', 'Settings') },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as DashboardTab)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
                  activeTab === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenExamWorkspace}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white"
            >
              <GraduationCap className="w-4 h-4" />
              {text('备考', 'Exam')}
            </button>
          </div>
        </div>

        <div className="craft-dashboard-content p-5 md:p-8 max-w-[1500px] mx-auto">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
};
