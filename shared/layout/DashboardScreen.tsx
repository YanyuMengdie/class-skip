import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  PencilLine,
  Plus,
  RefreshCcw,
  Search,
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
  deleteCalendarEvent,
  deleteMemo,
  getCalendarEvents,
  getMemos,
  getUserSessions,
} from '@/services/firebase';
import { fetchFileFromUrl, renderPdfFirstPagePreview } from '@/lib/pdf/pdfUtils';
import { CalendarEvent, CloudSession, LearnerProfileAvatarTone, LearnerProfileNotebook, Memo } from '@/types';

type DashboardTab = 'library' | 'calendar' | 'memo' | 'growth' | 'profile';

interface DashboardScreenProps {
  user: FirebaseUser | null;
  isSyncing: boolean;
  isProcessing: boolean;
  currentFileName: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onRestoreSession: (session: CloudSession) => void | Promise<void>;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenCurrentStudy: () => void;
  profileNotebook: LearnerProfileNotebook;
  onProfileNotebookChange: (profile: LearnerProfileNotebook) => void;
}

const WELCOME_LINES = [
  '你回来了，我一直在这儿。',
  '今天不用证明什么，先坐下来就好。',
  '慢一点也没关系，我们可以接着上次的地方走。',
  '我记得你已经走过的路，不会因为停顿就忘掉。',
  '先打开一份资料，剩下的我们一页一页来。',
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

const formatDate = (value: unknown): string => {
  const ms = getTimestampMs(value);
  if (!ms) return '刚刚';
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  profileNotebook,
  onProfileNotebookChange,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('library');
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<'all' | string>('all');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(toLocalDateString(new Date()));
  const [newEventTitle, setNewEventTitle] = useState('');
  const [memoInput, setMemoInput] = useState('');
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [coverPreviews, setCoverPreviews] = useState<Record<string, string>>({});
  const requestedCoverIdsRef = useRef<Set<string>>(new Set());
  const profile = profileNotebook;

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setEvents([]);
      setMemos([]);
      return;
    }

    setLoadingSessions(true);
    getUserSessions(user)
      .then(setSessions)
      .finally(() => setLoadingSessions(false));

    setLoadingCalendar(true);
    getCalendarEvents(user)
      .then(setEvents)
      .finally(() => setLoadingCalendar(false));

    setLoadingMemos(true);
    getMemos(user)
      .then(setMemos)
      .finally(() => setLoadingMemos(false));
  }, [user]);

  const fileSessions = useMemo(
    () => sessions.filter((session) => session.type === 'file' && session.fileUrl),
    [sessions]
  );

  const folders = useMemo(
    () => sessions.filter((session) => session.type === 'folder'),
    [sessions]
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

  const updateProfile = <Key extends keyof LearnerProfileNotebook>(key: Key, value: LearnerProfileNotebook[Key]) => {
    onProfileNotebookChange({ ...profile, [key]: value, updatedAt: Date.now() });
  };

  const rotateWelcomeLine = () => {
    const current = WELCOME_LINES.indexOf(profile.welcomeLine);
    updateProfile('welcomeLine', WELCOME_LINES[(current + 1 + WELCOME_LINES.length) % WELCOME_LINES.length]);
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

  const renderLibrary = () => (
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
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setActiveFolderId(folder.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeFolderId === folder.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Folder className="w-4 h-4 shrink-0" />
                <span className="truncate">{folder.customTitle || folder.fileName}</span>
              </span>
              <span className="text-xs opacity-70">{folderCounts[folder.id] ?? 0}</span>
            </button>
          ))}
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
              {currentFileName ? `上次打开：${currentFileName}` : '选一份资料进去，学习页会接住你。'}
            </p>
          </div>
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
                className="group text-left bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:cursor-wait disabled:opacity-80"
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
                  <p className="mt-2 text-xs text-slate-500">{formatDate(session.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );

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
              {currentDate.getFullYear()} 年 {currentDate.getMonth() + 1} 月
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
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
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
              placeholder={user ? '新的日程' : '请先登录'}
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
                <span className="text-xs text-slate-400">{new Date(memo.createdAt).toLocaleDateString()}</span>
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
    const learningDays = new Set(fileSessions.map((session) => formatDate(session.createdAt))).size;
    const recentDocs = fileSessions.slice(0, 4);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: '资料', value: fileSessions.length, color: 'bg-sky-500' },
            { label: '回来过的天', value: learningDays, color: 'bg-emerald-500' },
            { label: '日程', value: events.length, color: 'bg-amber-500' },
            { label: '便签', value: memos.length, color: 'bg-rose-500' },
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

  const renderActiveTab = () => {
    if (activeTab === 'calendar') return renderCalendar();
    if (activeTab === 'memo') return renderMemo();
    if (activeTab === 'growth') return renderGrowth();
    if (activeTab === 'profile') return renderProfile();
    return renderLibrary();
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-slate-900 flex overflow-hidden">
      <aside className="hidden lg:flex w-72 shrink-0 border-r border-slate-200 bg-[#f1f3f1] flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <BookOpen className="w-5 h-5 text-slate-800" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-900 truncate">逃课神器</p>
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

        <nav className="p-3 space-y-1">
          {[
            { id: 'library', icon: Cloud, label: '资料库' },
            { id: 'calendar', icon: CalendarDays, label: '日历' },
            { id: 'memo', icon: PencilLine, label: '便签' },
            { id: 'growth', icon: Sparkles, label: '我的成长' },
            { id: 'profile', icon: UserRound, label: '关于我' },
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
        </nav>

        <div className="mt-auto p-4 border-t border-slate-200">
          {currentFileName ? (
            <button
              type="button"
              onClick={onOpenCurrentStudy}
              className="w-full flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 p-3 text-left hover:border-slate-400 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-xs font-black text-slate-400 uppercase">继续</span>
                <span className="block text-sm font-bold text-slate-800 truncate">{currentFileName}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ) : (
            <div className="rounded-lg bg-white/70 border border-slate-200 p-3 text-xs text-slate-500">
              {user ? (isSyncing ? '同步中' : '云端已连接') : '未登录'}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
        <section className="relative overflow-hidden border-b border-slate-200 bg-[#cbeef7]">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute left-10 top-20 w-52 h-20 rounded-[50%] bg-white/70" />
            <div className="absolute right-20 top-16 w-72 h-24 rounded-[50%] bg-white/70" />
            <div className="absolute left-0 bottom-0 w-full h-24 bg-white" style={{ clipPath: 'polygon(0 35%, 10% 50%, 18% 30%, 30% 62%, 44% 45%, 58% 66%, 73% 40%, 88% 55%, 100% 32%, 100% 100%, 0 100%)' }} />
          </div>

          <div className="relative px-5 md:px-8 py-6 md:py-8">
            <div className="lg:hidden flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white border border-white/70 flex items-center justify-center shadow-sm">
                  <BookOpen className="w-5 h-5 text-slate-800" />
                </div>
                <p className="font-black text-slate-900 truncate">逃课神器</p>
              </div>
              <button
                type="button"
                onClick={user ? onLogout : onLogin}
                className="p-2 rounded-lg bg-white/80 border border-white"
                aria-label={user ? '退出登录' : '登录'}
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
                      继续
                    </button>
                  )}
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-bold border border-white/80 hover:border-slate-300 cursor-pointer">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isProcessing ? '处理中' : '打开资料'}
                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={onUpload} />
                  </label>
                </div>
              </div>

              <div className={`rounded-lg bg-gradient-to-br ${avatarTone.bg} border border-white/80 p-5 shadow-sm`}>
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

        <div className="lg:hidden sticky top-0 z-20 bg-[#f7f8f6]/95 backdrop-blur border-b border-slate-200 px-3 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {[
              { id: 'library', icon: Cloud, label: '资料库' },
              { id: 'calendar', icon: CalendarDays, label: '日历' },
              { id: 'memo', icon: PencilLine, label: '便签' },
              { id: 'growth', icon: Sparkles, label: '成长' },
              { id: 'profile', icon: UserRound, label: '关于我' },
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
          </div>
        </div>

        <div className="p-5 md:p-8 max-w-[1500px] mx-auto">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
};
