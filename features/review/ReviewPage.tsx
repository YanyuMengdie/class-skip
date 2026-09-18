import { isLocalId } from '@/services/localWorkspace';
import { isLocalUser } from '@/services/workspaceUser';
import { allReviewCaches, loadReviewCache, saveReviewCache } from './lib/reviewCache';
import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, Loader2, Library, Trash2, ChevronRight, RefreshCw } from 'lucide-react';
import type { WorkspaceUser as User } from '@/services/workspaceUser';
import { getUserSessions, fetchSessionDetails, updateCloudSessionState } from '@/services/firebase';
import { CloudSession } from '@/types';
import { storageService } from '@/services/storageService';
import { collectSavedArtifactsFromLocalHistory } from '@/features/review/lib/artifacts/collectSavedArtifactsFromLocalHistory';
import { collectSavedArtifactsFromCloudSessions } from '@/features/review/lib/artifacts/collectSavedArtifactsFromCloud';
import { mergeLocalAndCloudArtifacts, type MergedLibraryEntry } from '@/features/review/lib/artifacts/mergeArtifactLibraries';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META, formatSavedArtifactTime as formatTime } from '@/shared/lib/savedArtifactMeta';
import { ArtifactFullView } from '@/shared/studio/SavedArtifactPreview';

import { StudyToolMenu, REVIEW_TOOL_LABELS } from './StudyToolMenu';
import { ReviewMaterialPicker } from './ReviewMaterialPicker';
import './review.css';

export type ReviewType =
  | 'practice'
  | 'caseQuiz'
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
  currentSessionId?: string | null;
  onLogin?: () => void;
  onLibrary?: () => void;
  onClose: () => void;
  onStartReview: (sessions: CloudSession[] | null, type: ReviewType) => void;
  onRemoveSavedArtifact?: (id: string) => void;
  trapCount?: number;
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  user,
  hasCurrentDoc,
  currentDocName,
  currentSessionId,
  onLogin,
  onLibrary,
  onClose,
  onStartReview,
  onRemoveSavedArtifact,
  trapCount = 0
}) => {
  const [mainTab, setMainTab] = useState<ReviewMainTab>('generate');
  const [selectedTool, setSelectedTool] = useState<ReviewType | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [reloadSessions, setReloadSessions] = useState(0);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [useCurrentDoc, setUseCurrentDoc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [libraryEntries, setLibraryEntries] = useState<MergedLibraryEntry[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<MergedLibraryEntry | null>(null);

  const fileSessions = sessions.filter((s) => s.type === 'file');
  const hasSelection = (useCurrentDoc && hasCurrentDoc) || fileSessions.some(s => selectedIds.has(s.id));

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const items = await storageService.getAllHistory();
      const local = collectSavedArtifactsFromLocalHistory(items);
      const cached = await allReviewCaches(user?.uid ?? 'local').catch(() => []);
      const knownIds = new Set(local.map(entry => entry.artifact.id));
      for (const record of cached) for (const artifact of record.artifacts) {
        if (knownIds.has(artifact.id)) continue;
        knownIds.add(artifact.id);
        local.push({ provenance: 'local', artifact, sourceHash: `review-cache:${record.key}`, sourceFileName: artifact.sourceLabel || '联合复习' });
      }
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
    let active = true;
    setSessions([]); setSessionError(''); setSelectedIds(new Set()); setUseCurrentDoc(false);
    if (!user) { setLoadingSessions(false); return; }
    setLoadingSessions(true);
    getUserSessions(user)
      .then(value => { if (active) setSessions(value); })
      .catch(() => { if (active) setSessionError('文件夹暂时没有读取成功，请重试。'); })
      .finally(() => { if (active) setLoadingSessions(false); });
    return () => { active = false; };
  }, [user, reloadSessions]);

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
      if (entry.provenance === 'local' && entry.sourceHash.startsWith('review-cache:')) {
        const record = await loadReviewCache(entry.sourceHash.slice('review-cache:'.length));
        if (record) await saveReviewCache({ ...record, artifacts: record.artifacts.filter(a => a.id !== entry.artifact.id) });
      } else if (entry.provenance === 'local') {
        const item = await storageService.getFileState(entry.sourceHash);
        if (!item?.state) return;
        item.state.savedArtifacts = (item.state.savedArtifacts ?? []).filter((a) => a.id !== entry.artifact.id);
        await storageService.saveFileState(item);
      } else {
        const detail = await fetchSessionDetails(entry.cloudSessionId);
        const next = (detail.savedArtifacts ?? []).filter((a) => a.id !== entry.artifact.id);
        await updateCloudSessionState(entry.cloudSessionId, { savedArtifacts: next });
      }
      // Remove the local cache copy too, so opening the source cannot resurrect it.
      for (const cache of await allReviewCaches(user?.uid ?? 'local')) {
        if (cache.artifacts.some(a => a.id === entry.artifact.id)) await saveReviewCache({ ...cache, artifacts: cache.artifacts.filter(a => a.id !== entry.artifact.id) });
      }
      onRemoveSavedArtifact?.(entry.artifact.id);
      setLibraryEntries((prev) => prev.filter((x) => x.artifact.id !== entry.artifact.id));
      if (previewEntry?.artifact.id === entry.artifact.id) setPreviewEntry(null);
    } catch {
      /* quiet */
    }
  };

  const libraryRowKey = (entry: MergedLibraryEntry) =>
    entry.provenance === 'local' ? `l-${entry.sourceHash}-${entry.artifact.id}` : `c-${entry.cloudSessionId}-${entry.artifact.id}`;

  return (
    <div className="review-page">
      <header className="review-page-header">
        <div className="review-page-heading"><BookOpen size={25} strokeWidth={1.5} /><div><h1>学习工具</h1><p>先选一种方式，再挑这次要用的资料。</p></div></div>
        <button type="button" onClick={onClose} className="review-close"><X size={17} />返回学习</button>
      </header>
      <nav className="review-tabs" role="tablist" aria-label="学习工具与已有内容">
        <button type="button" role="tab" aria-selected={mainTab === 'generate'} onClick={() => setMainTab('generate')}>学习工具</button>
        <button type="button" role="tab" aria-selected={mainTab === 'library'} onClick={() => setMainTab('library')}><Library size={17} />已保存的内容</button>
      </nav>
      <div className="review-page-body"><div className="review-page-inner">
        {mainTab === 'generate' ? (
          selectedTool ? <ReviewMaterialPicker
            key={selectedTool}
            toolLabel={REVIEW_TOOL_LABELS[selectedTool] || '学习工具'}
            sessions={sessions} loading={loadingSessions} error={sessionError} signedIn={!!user}
            hasCurrentDoc={hasCurrentDoc} currentDocName={currentDocName} currentSessionId={currentSessionId}
            selectedIds={selectedIds} useCurrentDoc={useCurrentDoc}
            onToggleFile={toggleCloud} onToggleCurrent={toggleCurrentDoc}
            onBack={() => setSelectedTool(null)} onStart={() => handleStart(selectedTool)}
            onRetry={() => setReloadSessions(n => n + 1)} onLogin={onLogin} onLibrary={onLibrary}
          /> : <>
            <section className="review-intro"><span className="review-eyebrow">STUDY TOOLS · 学习工具</span><h2>把知识整理好，再练一练。</h2><p>选一种适合现在的方式。资料等会儿再挑，已有内容也可以接着用。</p></section>
            <StudyToolMenu trapCount={trapCount} allowMultiDocQA selectMaterialsFirst onSelect={(type) => {
              if (type === 'trapList') { onStartReview(null, type); return; }
              setSelectedIds(new Set()); setUseCurrentDoc(false); setSelectedTool(type);
            }} />
          </>
        ) : (
          <section className="review-library">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-600">{isLocalUser(user) ? '本机已保存的生成内容' : '本机 + 云端已保存的生成内容'}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  以前保存的笔记、练习和导图都在这里；可在资料库切换本机或账号资料。
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
                  const localEntry = entry.provenance === 'local' || isLocalId(entry.cloudSessionId);
                  const provLabel = localEntry ? '本机' : '云端';
                  const provClass =
                    localEntry ? 'bg-stone-200 text-stone-700' : 'bg-sky-100 text-sky-800';
                  const subtitle =
                    entry.provenance === 'local'
                      ? `来自本机：${entry.sourceFileName}`
                      : `来自${localEntry ? '本机' : '云端'}：${entry.sourceDisplayName}`;
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
                          {entry.artifact.sourceLabel?.trim() ? (
                            <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{entry.artifact.sourceLabel}</div>
                          ) : null}
                          <div className="text-xs text-slate-400 mt-0.5">{formatTime(entry.artifact.createdAt)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteLibraryEntry(e, entry)}
                          className="p-2 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 shrink-0"
                          title={localEntry ? '从本机资料删除' : '从云端资料删除'}
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
      </div></div>

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
                  <span className="font-semibold text-sky-800">{isLocalId(previewEntry.cloudSessionId) ? '本机' : '云端'}</span>
                  <span className="mx-2">·</span>
                  <span className="truncate">{previewEntry.sourceDisplayName}</span>

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
