import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CloudSession, Exam, ExamMaterialLink, FileHistoryItem } from '@/types';
import {
  createExam,
  addExamMaterialLink,
  addCalendarEvent,
  getUserSessions,
} from '@/services/firebase';
import { storageService } from '@/services/storageService';

export interface ExamLinkModalProps {
  user: User;
  open: boolean;
  onClose: () => void;
  exams: Exam[];
  onRefresh: () => void;
  /** 已有材料关联，用于客户端去重（避免重复写入 Firestore） */
  existingMaterials?: ExamMaterialLink[];
  /** 当前在主阅读器打开的文件（快捷关联） */
  fileHash?: string | null;
  cloudSessionId?: string | null;
  fileName: string | null;
}

function linkAlreadyExists(
  materials: ExamMaterialLink[],
  examId: string,
  spec:
    | { sourceType: 'fileHash'; fileHash: string }
    | { sourceType: 'sessionId'; cloudSessionId: string }
): boolean {
  return materials.some((m) => {
    if (m.examId !== examId) return false;
    if (spec.sourceType === 'fileHash') {
      return m.sourceType === 'fileHash' && m.fileHash === spec.fileHash;
    }
    return m.sourceType === 'sessionId' && m.cloudSessionId === spec.cloudSessionId;
  });
}

export const ExamLinkModal: React.FC<ExamLinkModalProps> = ({
  user,
  open,
  onClose,
  exams,
  onRefresh,
  existingMaterials = [],
  fileHash,
  cloudSessionId,
  fileName,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<CloudSession[]>([]);
  const [cloudSearch, setCloudSearch] = useState('');
  const [selectedCloudIds, setSelectedCloudIds] = useState<Set<string>>(new Set());
  const [localHistory, setLocalHistory] = useState<FileHistoryItem[]>([]);
  const [localHistoryError, setLocalHistoryError] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [selectedLocalHashes, setSelectedLocalHashes] = useState<Set<string>>(new Set());

  const canLinkCurrent = !!(fileName && (fileHash || cloudSessionId));

  const materialsForDedup = existingMaterials;

  useEffect(() => {
    if (!open) return;
    setLocalHistoryError(null);
    let cancelled = false;
    (async () => {
      try {
        const list = await storageService.getAllHistory();
        if (!cancelled) setLocalHistory(list);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setLocalHistory([]);
          setLocalHistoryError('无法读取本地上传记录（IndexedDB）。可改用云端列表或先在本应用打开过 PDF。');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await getUserSessions(user);
        if (cancelled) return;
        setCloudFiles(sessions.filter((s) => s.type === 'file' && !!s.fileUrl));
      } catch {
        if (!cancelled) setCloudFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, open]);

  useEffect(() => {
    if (!open) return;
    setSelectedCloudIds(new Set());
    setSelectedLocalHashes(new Set());
    setCloudSearch('');
    setLocalSearch('');
  }, [open]);

  const filteredCloudFiles = useMemo(() => {
    const kw = cloudSearch.trim().toLowerCase();
    if (!kw) return cloudFiles;
    return cloudFiles.filter((f) => f.fileName.toLowerCase().includes(kw));
  }, [cloudFiles, cloudSearch]);

  const filteredLocalHistory = useMemo(() => {
    const kw = localSearch.trim().toLowerCase();
    if (!kw) return localHistory;
    return localHistory.filter((h) => h.name.toLowerCase().includes(kw));
  }, [localHistory, localSearch]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleLocal = (hash: string) => {
    setSelectedLocalHashes((prev) => {
      const n = new Set(prev);
      if (n.has(hash)) n.delete(hash);
      else n.add(hash);
      return n;
    });
  };

  const handleCreateAndLink = async () => {
    if (!newTitle.trim() || !canLinkCurrent) return;
    setBusy(true);
    try {
      const examAt = newDate ? new Date(newDate + 'T12:00:00').getTime() : null;
      const exam = await createExam(user, { title: newTitle.trim(), examAt, color: '#8b5cf6' });
      if (examAt != null) {
        const d = new Date(examAt);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        try {
          await addCalendarEvent(user, {
            title: `[考试] ${exam.title}`,
            startTime: '09:00',
            endTime: '11:30',
            type: 'exam',
            dateStr,
            linkedExamId: exam.id,
          });
        } catch (_) {
          /* ignore */
        }
      }
      if (cloudSessionId) {
        await addExamMaterialLink(user, {
          examId: exam.id,
          sourceType: 'sessionId',
          cloudSessionId,
          fileName: fileName!,
        });
      } else if (fileHash) {
        await addExamMaterialLink(user, {
          examId: exam.id,
          sourceType: 'fileHash',
          fileHash,
          fileName: fileName!,
        });
      }
      setNewTitle('');
      setNewDate('');
      setCreating(false);
      onRefresh();
      alert('已创建考试并关联当前打开的文件');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLinkCurrentToSelected = async () => {
    if (!canLinkCurrent || selectedIds.size === 0) return;
    setBusy(true);
    let skipped = 0;
    let added = 0;
    const working: ExamMaterialLink[] = [...materialsForDedup];
    try {
      for (const examId of selectedIds) {
        if (cloudSessionId) {
          if (linkAlreadyExists(working, examId, { sourceType: 'sessionId', cloudSessionId })) {
            skipped++;
            continue;
          }
          const link = await addExamMaterialLink(user, {
            examId,
            sourceType: 'sessionId',
            cloudSessionId,
            fileName: fileName!,
          });
          working.push(link);
          added++;
        } else if (fileHash) {
          if (linkAlreadyExists(working, examId, { sourceType: 'fileHash', fileHash })) {
            skipped++;
            continue;
          }
          const link = await addExamMaterialLink(user, {
            examId,
            sourceType: 'fileHash',
            fileHash,
            fileName: fileName!,
          });
          working.push(link);
          added++;
        }
      }
      setSelectedIds(new Set());
      onRefresh();
      const parts = [`已关联 ${added} 条`];
      if (skipped) parts.push(`已跳过重复 ${skipped} 条`);
      alert(parts.join('；'));
      onClose();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLinkSelectedLocalFiles = async () => {
    if (selectedIds.size === 0 || selectedLocalHashes.size === 0) return;
    setBusy(true);
    let skipped = 0;
    let added = 0;
    const selectedItems = localHistory.filter((h) => selectedLocalHashes.has(h.hash));
    const working: ExamMaterialLink[] = [...materialsForDedup];
    try {
      for (const examId of selectedIds) {
        for (const item of selectedItems) {
          if (
            linkAlreadyExists(working, examId, {
              sourceType: 'fileHash',
              fileHash: item.hash,
            })
          ) {
            skipped++;
            continue;
          }
          const link = await addExamMaterialLink(user, {
            examId,
            sourceType: 'fileHash',
            fileHash: item.hash,
            fileName: item.name,
          });
          working.push(link);
          added++;
        }
      }
      setSelectedLocalHashes(new Set());
      onRefresh();
      const parts = [`已关联 ${added} 条`];
      if (skipped) parts.push(`已跳过重复 ${skipped} 条`);
      alert(parts.join('；'));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '关联本地文件失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleCloud = (id: string) => {
    setSelectedCloudIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleLinkSelectedCloudFiles = async () => {
    if (selectedIds.size === 0 || selectedCloudIds.size === 0) return;
    setBusy(true);
    let skipped = 0;
    let added = 0;
    const selectedFiles = cloudFiles.filter((f) => selectedCloudIds.has(f.id));
    const working: ExamMaterialLink[] = [...materialsForDedup];
    try {
      for (const examId of selectedIds) {
        for (const f of selectedFiles) {
          if (
            linkAlreadyExists(working, examId, {
              sourceType: 'sessionId',
              cloudSessionId: f.id,
            })
          ) {
            skipped++;
            continue;
          }
          const link = await addExamMaterialLink(user, {
            examId,
            sourceType: 'sessionId',
            cloudSessionId: f.id,
            fileName: f.customTitle?.trim() || f.fileName,
          });
          working.push(link);
          added++;
        }
      }
      setSelectedCloudIds(new Set());
      onRefresh();
      const parts = [`已关联 ${added} 条`];
      if (skipped) parts.push(`已跳过重复 ${skipped} 条`);
      alert(parts.join('；'));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '关联云端文件失败');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-stone-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-link-modal-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <div>
            <h3 id="exam-link-modal-title" className="font-bold text-slate-800">
              关联材料到考试
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              支持当前打开的文件、本地上传历史、云端文件 — 先勾选考试，再选择来源并关联。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-stone-100 shrink-0"
            aria-label="关闭关联材料对话框"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4 flex-1 min-h-0">
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-600">1. 选择已有考试（可多选）</p>
            <div
              className="max-h-36 overflow-y-auto border border-stone-100 rounded-xl divide-y divide-stone-50"
              role="group"
              aria-label="考试列表"
            >
              {exams.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">暂无考试，可在下方新建</p>
              ) : (
                exams.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="rounded border-stone-300"
                    />
                    <span className="text-sm text-slate-700 flex-1">{e.title}</span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: e.color || '#6366f1' }}
                    />
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 当前打开 */}
          <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2" aria-labelledby="link-source-current">
            <h4 id="link-source-current" className="text-xs font-bold text-indigo-900">
              当前打开的文件
            </h4>
            <p className="text-xs text-slate-600">
              <span className="text-slate-500">名称：</span>
              <span className="font-medium text-slate-800">{canLinkCurrent ? fileName : '（未在主界面打开 PDF）'}</span>
            </p>
            <button
              type="button"
              disabled={!canLinkCurrent || selectedIds.size === 0 || busy}
              onClick={handleLinkCurrentToSelected}
              className="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
              aria-label="将当前打开的文件关联到已选中的考试"
            >
              将当前打开的文件关联到选中考试
            </button>
          </section>

          {/* 本地历史 */}
          <section className="rounded-xl border border-amber-100 bg-amber-50/30 p-3 space-y-2" aria-labelledby="link-source-local">
            <h4 id="link-source-local" className="text-xs font-bold text-amber-900">
              本地上传过的 PDF（IndexedDB 历史）
            </h4>
            {localHistoryError && (
              <p className="text-xs text-amber-800 bg-amber-100 rounded-lg p-2">{localHistoryError}</p>
            )}
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="按文件名筛选"
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              aria-label="筛选本地上传历史文件名"
            />
            <div className="max-h-44 overflow-y-auto border border-stone-100 rounded-xl divide-y divide-stone-50 bg-white">
              {filteredLocalHistory.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">
                  {localHistory.length === 0 && !localHistoryError
                    ? '暂无本地历史。请曾用本应用打开过 PDF，或改用云端列表。'
                    : '无匹配文件'}
                </p>
              ) : (
                filteredLocalHistory.map((h) => (
                  <label
                    key={h.hash}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLocalHashes.has(h.hash)}
                      onChange={() => toggleLocal(h.hash)}
                      className="rounded border-stone-300"
                    />
                    <span className="text-sm text-slate-700 truncate flex-1" title={h.name}>
                      {h.name}
                    </span>
                  </label>
                ))
              )}
            </div>
            <button
              type="button"
              disabled={selectedIds.size === 0 || selectedLocalHashes.size === 0 || busy}
              onClick={handleLinkSelectedLocalFiles}
              className="w-full py-2 rounded-xl bg-amber-700 text-white text-sm font-bold disabled:opacity-40 hover:bg-amber-800"
              aria-label="将选中的本地上传文件关联到已选中的考试"
            >
              将选中本地文件关联到选中考试
            </button>
          </section>

          {/* 云端 */}
          <section className="rounded-xl border border-violet-100 bg-violet-50/30 p-3 space-y-2" aria-labelledby="link-source-cloud">
            <h4 id="link-source-cloud" className="text-xs font-bold text-violet-900">
              云端文件
            </h4>
            <input
              value={cloudSearch}
              onChange={(e) => setCloudSearch(e.target.value)}
              placeholder="搜索云端文件名"
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              aria-label="搜索云端文件名"
            />
            <div className="max-h-44 overflow-y-auto border border-stone-100 rounded-xl divide-y divide-stone-50 bg-white">
              {filteredCloudFiles.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">暂无可选云端文件</p>
              ) : (
                filteredCloudFiles.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCloudIds.has(f.id)}
                      onChange={() => toggleCloud(f.id)}
                      className="rounded border-stone-300"
                    />
                    <span className="text-sm text-slate-700 truncate flex-1">
                      {f.customTitle?.trim() || f.fileName}
                    </span>
                  </label>
                ))
              )}
            </div>
            <button
              type="button"
              disabled={selectedIds.size === 0 || selectedCloudIds.size === 0 || busy}
              onClick={handleLinkSelectedCloudFiles}
              className="w-full py-2 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40"
              aria-label="将选中的云端文件关联到已选中的考试"
            >
              将选中云端文件关联到选中考试
            </button>
          </section>

          <div className="border-t border-stone-100 pt-3">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-sm text-indigo-600 font-medium hover:underline"
                disabled={!canLinkCurrent}
                title={!canLinkCurrent ? '请先在主界面打开一份 PDF，或使用上方「本地 / 云端」关联到已有考试' : undefined}
              >
                + 新建考试并关联当前打开的文件
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="考试名称"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-slate-400">日期可空（待定），待定考试不参与今日自动排程</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="flex-1 py-2 rounded-lg border border-stone-200 text-sm"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!newTitle.trim() || !canLinkCurrent || busy}
                    onClick={handleCreateAndLink}
                    className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    创建并关联当前文件
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
