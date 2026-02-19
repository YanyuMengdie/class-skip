import React, { useState, useEffect } from 'react';
import { X, Mic, FileText, Trash2, Edit2, Check, X as XIcon } from 'lucide-react';
import { LectureRecord } from '../types';

const formatLectureTime = (start: number, end?: number) => {
  const d = new Date(start);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  if (end != null) {
    const dur = Math.round((end - start) / 60000);
    return `${dateStr} · ${dur} 分钟`;
  }
  return dateStr;
};

const getLectureDisplayName = (lecture: LectureRecord) => {
  return lecture.name || formatLectureTime(lecture.startedAt, lecture.endedAt);
};

interface LectureTranscriptPageProps {
  lectureHistory: LectureRecord[];
  onClose: () => void;
  onOrganize?: (lecture: LectureRecord) => void;
  organizingId?: string | null;
  onDelete?: (lectureId: string) => void;
  onRename?: (lectureId: string, newName: string) => void;
}

export const LectureTranscriptPage: React.FC<LectureTranscriptPageProps> = ({
  lectureHistory,
  onClose,
  onOrganize,
  organizingId,
  onDelete,
  onRename
}) => {
  const [selected, setSelected] = useState<LectureRecord | null>(lectureHistory[0] ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (selected && lectureHistory.length > 0) {
      const updated = lectureHistory.find((l) => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [lectureHistory, selected?.id]);

  useEffect(() => {
    if (!selected && lectureHistory[0]) setSelected(lectureHistory[0]);
  }, [lectureHistory, selected]);

  const handleStartEdit = (lecture: LectureRecord) => {
    setEditingId(lecture.id);
    setEditingName(lecture.name || formatLectureTime(lecture.startedAt, lecture.endedAt));
  };

  const handleSaveEdit = () => {
    if (editingId && onRename && editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (lectureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm('确定要删除这堂课吗？删除后无法恢复。')) {
      onDelete(lectureId);
      if (selected?.id === lectureId) {
        const remaining = lectureHistory.filter(l => l.id !== lectureId);
        setSelected(remaining[0] || null);
      }
    }
  };

  const displaySummary = selected?.organizedSummary;

  return (
    <div className="fixed inset-0 z-[200] bg-[#FFFBF7] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white/90 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-100 text-rose-500">
            <FileText className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">上课录音文本</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-stone-100 text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 左侧：课堂列表 */}
        <div className="w-64 border-r border-stone-200 bg-white/50 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">课堂记录</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {lectureHistory.length === 0 ? (
              <p className="text-sm text-slate-400 px-2">暂无记录，上课并下课后会出现在这里</p>
            ) : (
              lectureHistory.map((lecture) => (
                <div
                  key={lecture.id}
                  onMouseEnter={() => setHoveredId(lecture.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative w-full px-3 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                    selected?.id === lecture.id
                      ? 'bg-rose-100 text-rose-800 font-medium'
                      : 'hover:bg-stone-100 text-slate-700'
                  }`}
                >
                  {editingId === lecture.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1 text-sm bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                        autoFocus
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit();
                        }}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="保存"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="p-1 text-slate-400 hover:bg-stone-100 rounded"
                        title="取消"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelected(lecture)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        <Mic className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="text-sm truncate">{getLectureDisplayName(lecture)}</span>
                      </button>
                      {(hoveredId === lecture.id || selected?.id === lecture.id) && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onRename && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(lecture);
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="重命名"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={(e) => handleDelete(lecture.id, e)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：转写全文 + 整理区 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selected ? (
            <>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      {editingId === selected.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="保存"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 text-slate-400 hover:bg-stone-100 rounded"
                            title="取消"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400">
                            {getLectureDisplayName(selected)}
                          </p>
                          {onRename && (
                            <button
                              onClick={() => handleStartEdit(selected)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="重命名"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {selected.transcript.length === 0
                        ? '（本堂课暂无转写内容）'
                        : selected.transcript.map((t) => t.text).join('')}
                    </div>
                  </div>

                  {(displaySummary != null && displaySummary !== '') || (onOrganize && organizingId === selected.id) ? (
                    <div className="pt-4 border-t border-stone-200">
                      <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-rose-500" />
                        AI 整理
                      </h3>
                      {organizingId === selected.id && !displaySummary ? (
                        <p className="text-slate-500 text-sm">正在整理...</p>
                      ) : (
                        <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed bg-rose-50/50 rounded-xl p-4">
                          {displaySummary}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {onOrganize && (
                <div className="shrink-0 px-6 py-4 border-t border-stone-200 bg-white/80">
                  <button
                    onClick={() => onOrganize(selected)}
                    disabled={organizingId === selected.id}
                    className="px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {organizingId === selected.id ? '整理中...' : '用 AI 整理这节课'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              左侧选择一堂课查看转写
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
