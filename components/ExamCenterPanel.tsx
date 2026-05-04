import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Calendar, ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { DisciplineBand, Exam, ExamMaterialLink } from '@/types';
import { createExam, deleteExam, removeExamMaterialLink, updateExam, addCalendarEvent } from '@/services/firebase';
import { ExamLinkModal } from '@/components/ExamLinkModal';

interface ExamCenterPanelProps {
  user: User;
  onClose: () => void;
  exams: Exam[];
  materials: ExamMaterialLink[];
  onRefresh: () => void;
  /** 当前文档（用于一键打开关联弹窗） */
  fileHash?: string | null;
  cloudSessionId?: string | null;
  fileName?: string | null;
}

export const ExamCenterPanel: React.FC<ExamCenterPanelProps> = ({
  user,
  onClose,
  exams,
  materials,
  onRefresh,
  fileHash,
  cloudSessionId,
  fileName,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [linkOpen, setLinkOpen] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamDiscipline, setNewExamDiscipline] = useState<DisciplineBand>('unspecified');

  const byExam = useMemo(() => {
    const m = new Map<string, ExamMaterialLink[]>();
    materials.forEach((x) => {
      const arr = m.get(x.examId) || [];
      arr.push(x);
      m.set(x.examId, arr);
    });
    return m;
  }, [materials]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleDeleteExam = async (exam: Exam) => {
    if (!window.confirm(`确定删除「${exam.title}」及其材料关联？`)) return;
    try {
      await deleteExam(user, exam.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleRemoveMaterial = async (link: ExamMaterialLink) => {
    if (!window.confirm('移除该材料与此考试的关联？')) return;
    try {
      await removeExamMaterialLink(user, link.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '移除失败');
    }
  };

  const handleCreateExam = async () => {
    if (!newExamTitle.trim()) return;
    try {
      const examAt = newExamDate ? new Date(newExamDate + 'T12:00:00').getTime() : null;
      const exam = await createExam(user, {
        title: newExamTitle.trim(),
        examAt,
        color: '#6366f1',
        disciplineBand: newExamDiscipline,
      });
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
          /* 日历写入失败不阻塞创建 */
        }
      }
      setNewExamTitle('');
      setNewExamDate('');
      setNewExamDiscipline('unspecified');
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between shrink-0 mb-3">
        <h2 className="text-lg font-bold text-slate-800">我的考试</h2>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <p className="text-[10px] text-slate-500 max-w-[200px] leading-snug hidden xl:block" title="在弹窗中可从本地上传历史或云端选择 PDF">
            支持本地历史与云端文件
          </p>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-100 text-indigo-800 text-xs font-bold"
            aria-label="关联材料：可选择本地上传历史、云端文件或当前打开的文件"
            title="关联材料到考试：支持本地上传过的 PDF、云端文件、以及当前打开的文件"
          >
            <Link2 className="w-3.5 h-3.5" /> 关联材料
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100">
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 p-3 bg-white/80 space-y-2 mb-4 shrink-0">
        <p className="text-xs font-bold text-slate-500">新建考试</p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            value={newExamTitle}
            onChange={(e) => setNewExamTitle(e.target.value)}
            placeholder="标题，如期中考试"
            className="flex-1 min-w-[120px] border border-stone-200 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={newExamDiscipline}
            onChange={(e) => setNewExamDiscipline(e.target.value as DisciplineBand)}
            className="border border-stone-200 rounded-lg px-2 py-2 text-xs min-w-[140px]"
            title="学科带（影响保温闪卡教学法）"
          >
            <option value="unspecified">学科：未设置</option>
            <option value="humanities_social">文科与社会科学</option>
            <option value="business_mgmt">商业与管理</option>
            <option value="stem">STEM</option>
            <option value="arts_creative">艺术与创意</option>
          </select>
          <input
            type="date"
            value={newExamDate}
            onChange={(e) => setNewExamDate(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreateExam}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold"
          >
            <Plus className="w-4 h-4" /> 添加
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {exams.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">还没有考试，先新建一场吧</p>
        ) : (
          exams.map((exam) => {
            const open = expanded.has(exam.id);
            const mats = byExam.get(exam.id) || [];
            return (
              <div
                key={exam.id}
                className="rounded-xl border border-stone-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(exam.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50 text-left"
                >
                  {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: exam.color || '#6366f1' }}
                  />
                  <span className="font-medium text-slate-800 flex-1">{exam.title}</span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {exam.examAt == null
                      ? '日期待定'
                      : new Date(exam.examAt).toLocaleDateString('zh-CN')}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExam(exam);
                    }}
                    className="p-1 rounded hover:bg-rose-50 text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
                {open && (
                  <div className="px-3 pb-3 pt-0 border-t border-stone-50">
                    <EditableExamMeta user={user} exam={exam} onSaved={onRefresh} />
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 mb-1">已关联材料</p>
                    {mats.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">暂无，用「关联当前文件」添加</p>
                    ) : (
                      <ul className="space-y-1">
                        {mats.map((l) => (
                          <li
                            key={l.id}
                            className="flex items-center justify-between text-xs bg-stone-50 rounded-lg px-2 py-1.5"
                          >
                            <span className="truncate text-slate-700">{l.fileName}</span>
                            <span className="text-stone-400 shrink-0 mx-1">
                              {l.sourceType === 'fileHash' ? '本地' : '云'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMaterial(l)}
                              className="text-rose-500 hover:underline shrink-0"
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ExamLinkModal
        user={user}
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        exams={exams}
        onRefresh={onRefresh}
        existingMaterials={materials}
        fileHash={fileHash}
        cloudSessionId={cloudSessionId}
        fileName={fileName ?? null}
      />
    </div>
  );
};

const EditableExamMeta: React.FC<{
  user: User;
  exam: Exam;
  onSaved: () => void;
}> = ({ user, exam, onSaved }) => {
  const [title, setTitle] = useState(exam.title);
  const [dateStr, setDateStr] = useState(
    exam.examAt != null ? new Date(exam.examAt).toISOString().slice(0, 10) : ''
  );
  const [disciplineBand, setDisciplineBand] = useState<DisciplineBand>(exam.disciplineBand ?? 'unspecified');

  useEffect(() => {
    setTitle(exam.title);
    setDateStr(exam.examAt != null ? new Date(exam.examAt).toISOString().slice(0, 10) : '');
    setDisciplineBand(exam.disciplineBand ?? 'unspecified');
  }, [exam.id, exam.title, exam.examAt, exam.disciplineBand]);

  const save = async () => {
    try {
      await updateExam(user, exam.id, {
        title: title.trim() || exam.title,
        examAt: dateStr ? new Date(dateStr + 'T12:00:00').getTime() : null,
        disciplineBand,
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-center mt-2 pt-2 border-t border-dashed border-stone-100">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border border-stone-200 rounded px-2 py-1 text-xs flex-1 min-w-[100px]"
      />
      <select
        value={disciplineBand}
        onChange={(e) => setDisciplineBand(e.target.value as DisciplineBand)}
        className="border border-stone-200 rounded px-2 py-1 text-xs min-w-[130px]"
        title="学科带"
      >
        <option value="unspecified">学科：未设置</option>
        <option value="humanities_social">文科与社会科学</option>
        <option value="business_mgmt">商业与管理</option>
        <option value="stem">STEM</option>
        <option value="arts_creative">艺术与创意</option>
      </select>
      <input
        type="date"
        value={dateStr}
        onChange={(e) => setDateStr(e.target.value)}
        className="border border-stone-200 rounded px-2 py-1 text-xs"
      />
      <button type="button" onClick={save} className="text-xs font-bold text-indigo-600 hover:underline">
        保存修改
      </button>
    </div>
  );
};
