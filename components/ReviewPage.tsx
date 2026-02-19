import React, { useState, useEffect } from 'react';
import { X, BookOpen, FileText, Loader2, Cloud } from 'lucide-react';
import { User } from 'firebase/auth';
import { getUserSessions } from '../services/firebase';
import { CloudSession } from '../types';

export type ReviewType =
  | 'quiz'
  | 'flashcard'
  | 'studyGuide'
  | 'examSummary'
  | 'feynman'
  | 'examTraps'
  | 'terminology'
  | 'trickyProfessor'
  | 'trapList';

interface ReviewPageProps {
  user: User | null;
  hasCurrentDoc: boolean;
  currentDocName: string | null;
  onClose: () => void;
  onStartReview: (sessions: CloudSession[] | null, type: ReviewType) => void;
  trapCount?: number;
}

const REVIEW_OPTIONS: { type: ReviewType; label: string; color: string }[] = [
  { type: 'quiz', label: '测验', color: 'bg-violet-100 text-violet-800 hover:bg-violet-200' },
  { type: 'flashcard', label: '闪卡', color: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { type: 'studyGuide', label: '学习指南', color: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200' },
  { type: 'examSummary', label: '考前速览', color: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' },
  { type: 'feynman', label: '费曼检验', color: 'bg-sky-100 text-sky-800 hover:bg-sky-200' },
  { type: 'examTraps', label: '考点与陷阱', color: 'bg-rose-100 text-rose-800 hover:bg-rose-200' },
  { type: 'terminology', label: '术语精确定义', color: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200' },
  { type: 'trickyProfessor', label: '刁钻教授', color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' }
];

export const ReviewPage: React.FC<ReviewPageProps> = ({
  user,
  hasCurrentDoc,
  currentDocName,
  onClose,
  onStartReview,
  trapCount = 0
}) => {
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [useCurrentDoc, setUseCurrentDoc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fileSessions = sessions.filter((s) => s.type === 'file');
  const hasSelection = useCurrentDoc || selectedIds.size >= 1;

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    getUserSessions(user)
      .then(setSessions)
      .finally(() => setLoadingSessions(false));
  }, [user]);

  const toggleCloud = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!selectedIds.has(id)) setUseCurrentDoc(false);
  };

  const toggleCurrentDoc = () => {
    setUseCurrentDoc((prev) => !prev);
    if (!useCurrentDoc) setSelectedIds(new Set());
  };

  const handleStart = (type: ReviewType) => {
    if (!hasSelection) {
      alert('请至少选择一个文档');
      return;
    }
    if (useCurrentDoc && selectedIds.size === 0) {
      onStartReview(null, type);
      return;
    }
    const selected = fileSessions.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) {
      alert('请至少选择一个文档');
      return;
    }
    onStartReview(selected, type);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#FFFBF7] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white/95 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-100 text-indigo-500">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">复习</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-stone-100 text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        {/* 选择文档 */}
        <section className="mb-8">
          <h3 className="text-sm font-bold text-slate-600 mb-3">选择文档（至少一个）</h3>
          <div className="space-y-2">
            {hasCurrentDoc && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCurrentDoc}
                  onChange={toggleCurrentDoc}
                  className="rounded border-stone-300 text-indigo-600 w-4 h-4"
                />
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700 truncate">
                  当前已打开：{currentDocName || '未命名'}
                </span>
              </label>
            )}
            {!user ? (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 text-center text-slate-500 text-sm">
                登录后可选择云端文档
              </div>
            ) : loadingSessions ? (
              <div className="flex items-center justify-center py-8 text-indigo-500">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              fileSessions.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:bg-stone-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleCloud(s.id)}
                    className="rounded border-stone-300 text-indigo-600 w-4 h-4"
                  />
                  <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {s.customTitle || s.fileName}
                  </span>
                </label>
              ))
            )}
          </div>
        </section>

        {/* 选择复习方式 */}
        <section>
          <h3 className="text-sm font-bold text-slate-600 mb-3">选择复习方式</h3>
          <div className="grid grid-cols-2 gap-2">
            {REVIEW_OPTIONS.map(({ type, label, color }) => (
              <button
                key={type}
                onClick={() => handleStart(type)}
                disabled={!hasSelection}
                className={`py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleStart('trapList')}
            className="mt-2 text-amber-600 text-sm font-medium hover:underline"
          >
            我的陷阱清单{trapCount > 0 ? ` (${trapCount})` : ''}
          </button>
        </section>
      </div>
    </div>
  );
};
