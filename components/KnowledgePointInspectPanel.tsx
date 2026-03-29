/**
 * M2：备考工作台「查看知识点」——KC 元数据 + 逻辑原子列表（只读）
 */
import React from 'react';
import { X } from 'lucide-react';
import type { LSAPKnowledgeComponent } from '../types';

export interface KnowledgePointInspectPanelProps {
  kc: LSAPKnowledgeComponent | null;
  open: boolean;
  onClose: () => void;
}

export const KnowledgePointInspectPanel: React.FC<KnowledgePointInspectPanelProps> = ({ kc, open, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kp-inspect-title"
        className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-stone-200 bg-[#FFFBF7] shadow-xl flex flex-col"
      >
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 bg-white/90">
          <h2 id="kp-inspect-title" className="text-lg font-bold text-indigo-950 leading-snug pr-2">
            {kc?.concept ?? '知识点'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl bg-stone-100 text-slate-600 hover:bg-stone-200"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          {!kc ? (
            <p className="text-slate-500">未选择考点。</p>
          ) : (
            <>
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">定义</h3>
                <p className="text-slate-800 leading-relaxed">{kc.definition || '—'}</p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">讲义页码</h3>
                <p className="text-slate-700 tabular-nums">
                  {(kc.sourcePages?.length ?? 0) > 0 ? kc.sourcePages!.join('、') : '—'}
                </p>
              </section>

              {kc.reviewFocus && (
                <section className="space-y-1.5">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">复习重点</h3>
                  <p className="text-slate-700 leading-relaxed">{kc.reviewFocus}</p>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">逻辑原子</h3>
                {(!kc.atoms || kc.atoms.length === 0) ? (
                  <p className="text-xs text-slate-500 bg-stone-50 border border-stone-100 rounded-xl px-3 py-2">
                    请先点击左侧「提取逻辑原子」生成本考点下的原子列表。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {kc.atoms.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5"
                      >
                        <p className="font-bold text-slate-800 text-sm">{a.label}</p>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
