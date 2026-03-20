import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Exam } from '../types';
import { createExam, addExamMaterialLink, addCalendarEvent } from '../services/firebase';

export interface ExamLinkModalProps {
  user: User;
  open: boolean;
  onClose: () => void;
  exams: Exam[];
  onRefresh: () => void;
  /** 当前打开的本地文件 */
  fileHash?: string | null;
  cloudSessionId?: string | null;
  fileName: string | null;
}

export const ExamLinkModal: React.FC<ExamLinkModalProps> = ({
  user,
  open,
  onClose,
  exams,
  onRefresh,
  fileHash,
  cloudSessionId,
  fileName,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const canLink = !!(fileName && (fileHash || cloudSessionId));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleCreateAndLink = async () => {
    if (!newTitle.trim() || !canLink) return;
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
      alert('已创建考试并关联当前文件');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLinkSelected = async () => {
    if (!canLink || selectedIds.size === 0) return;
    setBusy(true);
    try {
      for (const examId of selectedIds) {
        if (cloudSessionId) {
          await addExamMaterialLink(user, {
            examId,
            sourceType: 'sessionId',
            cloudSessionId,
            fileName: fileName!,
          });
        } else if (fileHash) {
          await addExamMaterialLink(user, {
            examId,
            sourceType: 'fileHash',
            fileHash,
            fileName: fileName!,
          });
        }
      }
      setSelectedIds(new Set());
      onRefresh();
      alert('已关联到选中的考试');
      onClose();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-stone-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <h3 className="font-bold text-slate-800">关联到考试</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-stone-100">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          {!canLink && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">请先打开一份 PDF（本地或云端）。</p>
          )}
          <p className="text-xs text-slate-500">
            当前文件：<span className="font-medium text-slate-800">{fileName ?? '—'}</span>
          </p>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-600">选择已有考试（可多选）</p>
            <div className="max-h-40 overflow-y-auto border border-stone-100 rounded-xl divide-y divide-stone-50">
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
            <button
              type="button"
              disabled={!canLink || selectedIds.size === 0 || busy}
              onClick={handleLinkSelected}
              className="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
            >
              关联到选中考试
            </button>
          </div>

          <div className="border-t border-stone-100 pt-3">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-sm text-indigo-600 font-medium hover:underline"
              >
                + 新建考试并关联当前文件
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
                    disabled={!newTitle.trim() || !canLink || busy}
                    onClick={handleCreateAndLink}
                    className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    创建并关联
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
