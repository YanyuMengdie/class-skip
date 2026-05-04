import React, { useState } from 'react';
import { BookMarked, ChevronDown, ChevronUp } from 'lucide-react';
import type { KcGlossaryEntry, LSAPKnowledgeComponent } from '@/types';

export interface KcGlossarySidebarProps {
  activeKc: LSAPKnowledgeComponent | null;
  entries: KcGlossaryEntry[];
  loading?: boolean;
}

export const KcGlossarySidebar: React.FC<KcGlossarySidebarProps> = ({
  activeKc,
  entries,
  loading = false,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const noKc = !activeKc;

  return (
    <aside
      className="flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      aria-label="本考点考点释义"
    >
      <div className="shrink-0 border-b border-stone-100 px-3 py-2.5 bg-gradient-to-r from-amber-50/80 to-white">
        <div className="flex items-center gap-2 text-slate-800">
          <BookMarked className="w-4 h-4 text-amber-700 shrink-0" />
          <h2 className="text-sm font-bold">考点释义</h2>
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
          {noKc
            ? '全卷模式下不收录考点释义；请取消「全卷对话」并选择考点。'
            : `当前考点：${activeKc.concept}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading && entries.length === 0 && (
          <div className="space-y-2 animate-pulse">
            <div className="h-16 rounded-xl bg-stone-100" />
            <div className="h-16 rounded-xl bg-stone-100" />
          </div>
        )}
        {noKc && (
          <p className="text-xs text-slate-500 px-1 py-4 text-center leading-relaxed">锚定考点后，对话里出现的 **粗体术语** 将自动释义并显示在此。</p>
        )}
        {!noKc && entries.length === 0 && !loading && (
          <p className="text-xs text-slate-500 px-1 py-4 text-center leading-relaxed">对话中出现粗体术语后将自动收录。</p>
        )}
        {!noKc &&
          entries.map((e) => {
            const open = expandedId === e.id;
            return (
              <div
                key={e.id}
                className="rounded-xl border border-stone-100 bg-stone-50/80 p-2.5 text-left"
              >
                <p className="text-sm font-bold text-slate-900 leading-snug">{e.term}</p>
                <p
                  className={`text-[11px] text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap ${
                    open ? '' : 'line-clamp-3'
                  }`}
                >
                  {e.definition}
                </p>
                {e.definition.length > 120 && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : e.id)}
                    className="mt-1 text-[10px] font-bold text-indigo-600 inline-flex items-center gap-0.5 hover:underline"
                  >
                    {open ? (
                      <>
                        收起 <ChevronUp className="w-3 h-3" />
                      </>
                    ) : (
                      <>
                        展开 <ChevronDown className="w-3 h-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        {loading && entries.length > 0 && (
          <p className="text-[10px] text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5 text-center">正在生成释义…</p>
        )}
      </div>
    </aside>
  );
};
