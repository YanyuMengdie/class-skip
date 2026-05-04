import React from 'react';
import { BookOpen, Trash2, ChevronRight } from 'lucide-react';
import { SavedArtifact } from '@/types';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META, formatSavedArtifactTime as formatTime } from '@/utils/savedArtifactMeta';

export { ArtifactFullView } from '@/components/SavedArtifactPreview';
export type { ArtifactFullViewProps } from '@/components/SavedArtifactPreview';

interface StudioPanelProps {
  artifacts: SavedArtifact[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onDelete: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenQuiz?: () => void;
  onOpenFlashcard?: () => void;
  onOpenTrapList?: () => void;
}

export const StudioPanel: React.FC<StudioPanelProps> = ({
  artifacts,
  expandedId,
  onToggleExpand,
  onDelete,
  isCollapsed = false,
  onToggleCollapse,
  onOpenQuiz,
  onOpenFlashcard,
  onOpenTrapList
}) => {
  const expanded = artifacts.find((a) => a.id === expandedId);

  if (isCollapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-4 border-l border-stone-200 bg-stone-50/80 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex flex-col items-center gap-1 text-stone-500 hover:text-slate-700"
          title="展开已生成"
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-xs font-medium">{artifacts.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col border-l border-stone-200 bg-white shrink-0 flex-shrink-0">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-stone-100">
        <h3 className="text-sm font-bold text-slate-800">已生成</h3>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded text-stone-400 hover:text-slate-600"
            title="收起"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {artifacts.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            生成学习指南、考前速览等后会自动出现在这里
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {artifacts.map((a) => {
              const meta = TYPE_META[a.type];
              const isViewing = expandedId === a.id;
              return (
                <li key={a.id} className={`rounded-lg border overflow-hidden ${isViewing ? 'ring-2 ring-indigo-400 border-indigo-200 bg-indigo-50/30' : 'border-stone-100'}`}>
                  <div
                    className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-stone-50"
                    onClick={() => onToggleExpand(isViewing ? null : a.id)}
                  >
                    <span className={`p-1 rounded ${meta.bg}`}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        {a.sourceLabel && `${a.sourceLabel} · `}
                        {formatTime(a.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(a.id);
                      }}
                      className="p-1 rounded text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
