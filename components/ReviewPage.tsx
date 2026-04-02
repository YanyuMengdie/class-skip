import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, FileText, Loader2, Cloud, Library, Trash2, ChevronRight, RefreshCw } from 'lucide-react';
import { User } from 'firebase/auth';
import { getUserSessions, fetchSessionDetails, updateCloudSessionState } from '../services/firebase';
import { CloudSession } from '../types';
import { storageService } from '../services/storageService';
import { collectSavedArtifactsFromLocalHistory } from '../utils/collectSavedArtifactsFromLocalHistory';
import { collectSavedArtifactsFromCloudSessions } from '../utils/collectSavedArtifactsFromCloud';
import { mergeLocalAndCloudArtifacts, type MergedLibraryEntry } from '../utils/mergeArtifactLibraries';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META, formatSavedArtifactTime as formatTime } from '../utils/savedArtifactMeta';
import { ArtifactFullView } from './SavedArtifactPreview';

export type ReviewType =
  | 'quiz'
  | 'flashcard'
  | 'studyGuide'
  | 'examSummary'
  | 'feynman'
  | 'examTraps'
  | 'terminology'
  | 'trickyProfessor'
  | 'mindMap'
  | 'multiDocQA'
  | 'trapList';

type ReviewMainTab = 'generate' | 'library';

interface ReviewPageProps {
  user: User | null;
  hasCurrentDoc: boolean;
  currentDocName: string | null;
  onClose: () => void;
  onStartReview: (sessions: CloudSession[] | null, type: ReviewType) => void;
  trapCount?: number;
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  user,
  hasCurrentDoc,
  currentDocName,
  onClose,
  onStartReview,
  trapCount = 0
}) => {
  const [mainTab, setMainTab] = useState<ReviewMainTab>('generate');
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [useCurrentDoc, setUseCurrentDoc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [libraryEntries, setLibraryEntries] = useState<MergedLibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<MergedLibraryEntry | null>(null);

  const fileSessions = sessions.filter((s) => s.type === 'file');
  const hasSelection = useCurrentDoc || selectedIds.size >= 1;

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const items = await storageService.getAllHistory();
      const local = collectSavedArtifactsFromLocalHistory(items);
      if (!user) {
        setLibraryEntries(mergeLocalAndCloudArtifacts(local, []));
        return;
      }
      const sess = await getUserSessions(user);
      const cloudEntries = await collectSavedArtifactsFromCloudSessions(user, sess);
      setLibraryEntries(mergeLocalAndCloudArtifacts(local, cloudEntries));
    } finally {
      setLibraryLoading(false);
    }
  }, [user]);

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

  useEffect(() => {
    if (mainTab === 'library') {
      void refreshLibrary();
    }
  }, [mainTab, refreshLibrary]);

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

  const handleDeleteLibraryEntry = async (e: React.MouseEvent, entry: MergedLibraryEntry) => {
    e.stopPropagation();
    try {
      if (entry.provenance === 'local') {
        const item = await storageService.getFileState(entry.sourceHash);
        if (!item?.state) return;
        item.state.savedArtifacts = (item.state.savedArtifacts ?? []).filter((a) => a.id !== entry.artifact.id);
        await storageService.saveFileState(item);
      } else {
        const detail = await fetchSessionDetails(entry.cloudSessionId);
        const next = (detail.savedArtifacts ?? []).filter((a) => a.id !== entry.artifact.id);
        await updateCloudSessionState(entry.cloudSessionId, { savedArtifacts: next });
      }
      setLibraryEntries((prev) => prev.filter((x) => x.artifact.id !== entry.artifact.id));
      if (previewEntry?.artifact.id === entry.artifact.id) setPreviewEntry(null);
    } catch {
      /* quiet */
    }
  };

  const libraryRowKey = (entry: MergedLibraryEntry) =>
    entry.provenance === 'local' ? `l-${entry.sourceHash}-${entry.artifact.id}` : `c-${entry.cloudSessionId}-${entry.artifact.id}`;

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

      <div className="shrink-0 px-6 pt-4 pb-2 border-b border-stone-100 bg-white/80">
        <div className="max-w-2xl mx-auto w-full flex gap-2">
          <button
            type="button"
            onClick={() => setMainTab('generate')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold transition-colors ${
              mainTab === 'generate' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
            }`}
          >
            生成 / 学习方式
          </button>
          <button
            type="button"
            onClick={() => setMainTab('library')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
              mainTab === 'library' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
            }`}
          >
            <Library className="w-4 h-4" />
            已生成库
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full min-h-0">
        {mainTab === 'generate' ? (
          <>
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

            <section>
              <h3 className="text-sm font-bold text-slate-600 mb-3">选择喜欢的学习方式</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">巩固记忆</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleStart('flashcard')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-100 text-amber-800 hover:bg-amber-200">闪卡</button>
                    <button onClick={() => handleStart('studyGuide')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-100 text-indigo-800 hover:bg-indigo-200">学习指南</button>
                    <button onClick={() => handleStart('terminology')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-cyan-100 text-cyan-800 hover:bg-cyan-200">术语精确定义</button>
                    <button onClick={() => handleStart('mindMap')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-teal-100 text-teal-800 hover:bg-teal-200">思维导图</button>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">自我检测</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleStart('quiz')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-violet-100 text-violet-800 hover:bg-violet-200">测验</button>
                    <button onClick={() => handleStart('feynman')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-sky-100 text-sky-800 hover:bg-sky-200">费曼检验</button>
                    <button onClick={() => handleStart('trickyProfessor')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-orange-100 text-orange-800 hover:bg-orange-200">刁钻教授</button>
                    <button onClick={() => handleStart('trapList')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-amber-100 text-amber-800 hover:bg-amber-200 col-span-2">我的陷阱清单{trapCount > 0 ? ` (${trapCount})` : ''}</button>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">考前冲刺</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleStart('examSummary')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-100 text-emerald-800 hover:bg-emerald-200">考前速览</button>
                    <button onClick={() => handleStart('examTraps')} disabled={!hasSelection} className="py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-rose-100 text-rose-800 hover:bg-rose-200">考点与陷阱</button>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">自由问答</h4>
                  <button onClick={() => handleStart('multiDocQA')} disabled={!hasSelection} className="w-full py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-100 text-indigo-800 hover:bg-indigo-200">多文档问答</button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-600">本机 + 云端已保存的生成内容</h3>
                <p className="text-xs text-slate-500 mt-1">
                  本地来自 IndexedDB；登录后汇总各云端 PDF 会话中已同步的条目。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshLibrary()}
                disabled={libraryLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-stone-100 text-slate-700 hover:bg-stone-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${libraryLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
            {!user && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                登录后可在此汇总云端已同步的生成内容（与仅本机列表合并展示）。
              </p>
            )}
            {libraryLoading ? (
              <div className="flex items-center justify-center py-16 text-indigo-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : libraryEntries.length === 0 ? (
              <div className="p-8 rounded-xl border border-stone-200 bg-white text-center text-slate-500 text-sm">
                暂无已生成条目。在阅读页用学习工具生成内容后会写入本机；若已登录并同步云端，亦会出现在此。
              </div>
            ) : (
              <ul className="space-y-2">
                {libraryEntries.map((entry) => {
                  const meta = TYPE_META[entry.artifact.type];
                  const provLabel = entry.provenance === 'local' ? '本机' : '云端';
                  const provClass =
                    entry.provenance === 'local' ? 'bg-stone-200 text-stone-700' : 'bg-sky-100 text-sky-800';
                  const subtitle =
                    entry.provenance === 'local'
                      ? `来自本机：${entry.sourceFileName}`
                      : `来自云端：${entry.sourceDisplayName}`;
                  const debugId =
                    entry.provenance === 'cloud'
                      ? `${entry.cloudSessionId.slice(0, 8)}…`
                      : null;
                  return (
                    <li
                      key={libraryRowKey(entry)}
                      className="rounded-xl border border-stone-200 bg-white overflow-hidden hover:border-indigo-200 transition-colors"
                    >
                      <div
                        className="flex items-center gap-2 px-3 py-3 cursor-pointer hover:bg-stone-50"
                        onClick={() => setPreviewEntry(entry)}
                      >
                        <span className={`p-1.5 rounded-lg shrink-0 ${meta.bg}`}>{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${provClass}`}>{provLabel}</span>
                            <span className="text-xs font-semibold text-indigo-600">{meta.label}</span>
                          </div>
                          <div className="text-sm font-medium text-slate-800 truncate">{entry.artifact.title}</div>
                          <div className="text-xs text-slate-500 truncate">{subtitle}</div>
                          {debugId && (
                            <div className="text-[10px] font-mono text-stone-400 truncate">会话 {debugId}</div>
                          )}
                          {entry.artifact.sourceLabel?.trim() ? (
                            <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{entry.artifact.sourceLabel}</div>
                          ) : null}
                          <div className="text-xs text-slate-400 mt-0.5">{formatTime(entry.artifact.createdAt)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteLibraryEntry(e, entry)}
                          className="p-2 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 shrink-0"
                          title={entry.provenance === 'local' ? '从本机档案删除' : '从云端会话删除'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {previewEntry && (
        <div className="fixed inset-0 z-[220] flex justify-end bg-black/40" role="presentation">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭预览背景" onClick={() => setPreviewEntry(null)} />
          <div className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="shrink-0 px-4 py-2 border-b border-stone-100 bg-stone-50/90 text-xs text-slate-600">
              {previewEntry.provenance === 'local' ? (
                <>
                  <span className="font-semibold text-stone-700">本机</span>
                  <span className="mx-2">·</span>
                  <span className="truncate">{previewEntry.sourceFileName}</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-sky-800">云端</span>
                  <span className="mx-2">·</span>
                  <span className="truncate">{previewEntry.sourceDisplayName}</span>
                  <span className="font-mono text-stone-400 ml-2 text-[10px]">{previewEntry.cloudSessionId.slice(0, 10)}…</span>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <ArtifactFullView artifact={previewEntry.artifact} onClose={() => setPreviewEntry(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
