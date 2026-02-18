import React, { useState } from 'react';
import { X, Star, Lightbulb, FileText, AlertTriangle, Target, Flame, Sparkles, Plus, Trash2 } from 'lucide-react';
import { MarkType, MarkPriority, PageMark } from '../types';

interface PageMarkPanelProps {
  pageNumber: number;
  existingMarks: PageMark[];
  onSave: (marks: PageMark[]) => void;
  onClose: () => void;
}

const MARK_TYPES: Array<{ id: MarkType; label: string; icon: React.ReactNode; color: string }> = [
  { id: 'core', label: '核心概念', icon: <Lightbulb className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'formula', label: '公式定理', icon: <FileText className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'example', label: '例题案例', icon: <Target className="w-4 h-4" />, color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'trap', label: '易错点', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'exam', label: '考试重点', icon: <Star className="w-4 h-4" />, color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'difficult', label: '难点', icon: <Flame className="w-4 h-4" />, color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'summary', label: '总结要点', icon: <Sparkles className="w-4 h-4" />, color: 'bg-amber-100 text-amber-700 border-amber-200' },
];

export const PageMarkPanel: React.FC<PageMarkPanelProps> = ({
  pageNumber,
  existingMarks,
  onSave,
  onClose
}) => {
  const [selectedTypes, setSelectedTypes] = useState<MarkType[]>(existingMarks.flatMap(m => m.types));
  const [priority, setPriority] = useState<MarkPriority>(existingMarks[0]?.priority || 'medium');
  const [note, setNote] = useState(existingMarks[0]?.note || '');
  const [customTypeName, setCustomTypeName] = useState(existingMarks.find(m => m.types.includes('custom'))?.customTypeName || '');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const toggleType = (type: MarkType) => {
    if (type === 'custom') {
      setShowCustomInput(!showCustomInput);
      if (!selectedTypes.includes('custom')) {
        setSelectedTypes([...selectedTypes, 'custom']);
      } else {
        setSelectedTypes(selectedTypes.filter(t => t !== 'custom'));
      }
    } else {
      setSelectedTypes(prev => 
        prev.includes(type) 
          ? prev.filter(t => t !== type)
          : [...prev, type]
      );
    }
  };

  const handleSave = () => {
    if (selectedTypes.length === 0) {
      onSave([]);
      onClose();
      return;
    }

    // 合并为一个或多个标记（如果包含自定义类型，需要单独处理）
    const marks: PageMark[] = [];
    
    if (selectedTypes.includes('custom') && customTypeName.trim()) {
      marks.push({
        id: `mark-${Date.now()}-custom`,
        pageNumber,
        types: ['custom'],
        priority,
        customTypeName: customTypeName.trim(),
        note: note.trim() || undefined,
        createdAt: Date.now()
      });
    }

    const standardTypes = selectedTypes.filter(t => t !== 'custom');
    if (standardTypes.length > 0) {
      marks.push({
        id: `mark-${Date.now()}-standard`,
        pageNumber,
        types: standardTypes,
        priority,
        note: note.trim() || undefined,
        createdAt: Date.now()
      });
    }

    onSave(marks);
    onClose();
  };

  const handleDelete = () => {
    onSave([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            标记第 {pageNumber} 页
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 类型选择 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">标记类型（可多选）</label>
            <div className="grid grid-cols-2 gap-2">
              {MARK_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    selectedTypes.includes(type.id)
                      ? `${type.color} border-current`
                      : 'bg-stone-50 border-stone-200 text-slate-600 hover:border-stone-300'
                  }`}
                >
                  {type.icon}
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
            
            {/* 自定义类型输入 */}
            {showCustomInput && (
              <div className="mt-3 p-3 bg-stone-50 rounded-xl border border-stone-200">
                <input
                  type="text"
                  value={customTypeName}
                  onChange={e => setCustomTypeName(e.target.value)}
                  placeholder="输入自定义类型名称..."
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
                />
              </div>
            )}
          </div>

          {/* 优先级 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">优先级</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as MarkPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    priority === p
                      ? p === 'high' ? 'bg-red-100 text-red-700 border-2 border-red-300' :
                        p === 'medium' ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' :
                        'bg-stone-100 text-stone-700 border-2 border-stone-300'
                      : 'bg-stone-50 text-slate-600 border-2 border-transparent hover:border-stone-200'
                  }`}
                >
                  {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                </button>
              ))}
            </div>
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">备注（可选）</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="添加备注..."
              rows={3}
              maxLength={200}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none"
            />
            <p className="text-xs text-stone-400 mt-1 text-right">{note.length}/200</p>
          </div>
        </div>

        <div className="p-4 border-t border-stone-100 flex items-center justify-between gap-3 shrink-0">
          {existingMarks.length > 0 && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-bold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              删除标记
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-stone-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={selectedTypes.length === 0 || (selectedTypes.includes('custom') && !customTypeName.trim())}
              className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
