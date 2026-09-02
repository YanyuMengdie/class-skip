import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Languages, Loader2, MessageCircle, RotateCcw, X } from 'lucide-react';
import type { AtomCoverageByKc, LSAPKnowledgeComponent } from '@/types';
import type {
  WorkspaceDialogueTurn,
  WorkspaceEvidenceAnnotation,
} from '@/features/exam/lib/examWorkspaceLsapKey';
import {
  fallbackWorkspaceTurnId,
  upsertEvidenceAnnotation,
} from '@/features/exam/lib/examLearningEvidence';

interface KnowledgeBlockEvidenceDrawerProps {
  open: boolean;
  title: string;
  kcs: LSAPKnowledgeComponent[];
  coverage: AtomCoverageByKc;
  transcript: WorkspaceDialogueTurn[];
  annotations: WorkspaceEvidenceAnnotation[];
  currentUserTurnCount: number;
  onAnnotationsChange: (next: WorkspaceEvidenceAnnotation[]) => void;
  onClose: () => void;
  onJumpToTurn: (turnId: string) => void;
  onAskNow: (annotation: WorkspaceEvidenceAnnotation) => void;
  onOpenSourcePage: (kc: LSAPKnowledgeComponent, page: number) => void;
  onEnhanceEvidence: () => Promise<void>;
  enhancingEvidence: boolean;
}

function annotationId(kind: WorkspaceEvidenceAnnotation['kind']): string {
  return `evidence-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasChinese(value: string | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '');
}

function normalizePages(pages: number[] | undefined): number[] {
  return Array.from(new Set((pages ?? []).filter((page) => Number.isFinite(page) && page >= 1)))
    .map((page) => Math.round(page))
    .sort((a, b) => a - b);
}

export const KnowledgeBlockEvidenceDrawer: React.FC<KnowledgeBlockEvidenceDrawerProps> = ({
  open,
  title,
  kcs,
  coverage,
  transcript,
  annotations,
  currentUserTurnCount,
  onAnnotationsChange,
  onClose,
  onJumpToTurn,
  onAskNow,
  onOpenSourcePage,
  onEnhanceEvidence,
  enhancingEvidence,
}) => {
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const kcIds = useMemo(() => new Set(kcs.map((kc) => kc.id)), [kcs]);
  const userTurns = useMemo(() => transcript
    .map((turn, index) => ({ turn, id: fallbackWorkspaceTurnId(turn, index) }))
    .filter(({ turn }) => turn.role === 'user' && (!turn.kcId || kcIds.has(turn.kcId))), [transcript, kcIds]);
  const missingBilingualEvidence = useMemo(() => kcs.some((kc) => (
    !kc.conceptZh || !kc.definitionZh || (kc.atoms ?? []).some((atom) => (
      !atom.labelZh || !atom.descriptionZh || (atom.sourcePages?.length ?? 0) === 0
    ))
  )), [kcs]);
  const titleZh = kcs[0]?.conceptZh
    ? `${kcs[0].conceptZh}${kcs.length > 1 ? ` 等 ${kcs.length} 个关键点` : ''}`
    : null;

  if (!open) return null;

  const setDisputed = (kcId: string, atomId: string, turnId?: string) => {
    const existing = annotations.find((annotation) => (
      annotation.kind === 'disputed' && annotation.kcId === kcId && annotation.atomId === atomId &&
      (annotation.turnId ?? '') === (turnId ?? '')
    ));
    if (existing) {
      onAnnotationsChange(annotations.filter((annotation) => annotation.id !== existing.id));
      if (editingAnnotationId === existing.id) setEditingAnnotationId(null);
      return;
    }
    const now = Date.now();
    onAnnotationsChange([...annotations, {
      id: annotationId('disputed'),
      kind: 'disputed',
      kcId,
      atomId,
      turnId,
      createdAt: now,
      updatedAt: now,
    }]);
  };

  const markNeedsReview = (kcId: string, atomId: string, turnId?: string) => {
    const now = Date.now();
    const next: WorkspaceEvidenceAnnotation = {
      id: annotationId('needs_review'),
      kind: 'needs_review',
      kcId,
      atomId,
      turnId,
      createdAt: now,
      updatedAt: now,
      revisitStatus: 'pending',
      deferUntilUserTurnCount: currentUserTurnCount + 2,
    };
    onAnnotationsChange(upsertEvidenceAnnotation(annotations, next));
  };

  const saveNote = (annotation: WorkspaceEvidenceAnnotation) => {
    onAnnotationsChange(annotations.map((item) => item.id === annotation.id
      ? { ...item, note: noteDraft.trim() || undefined, updatedAt: Date.now() }
      : item));
    setEditingAnnotationId(null);
    setNoteDraft('');
  };

  return (
    <div className="fixed inset-0 z-[96] flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/35" aria-label="关闭本块学习证据" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-stone-200 bg-[#fffdfa] shadow-2xl" aria-label="本块学习证据">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-indigo-500">本块学习证据</p>
            <h2 className="mt-1 truncate text-base font-black text-slate-900">{titleZh ?? title}</h2>
            {titleZh && <p className="mt-0.5 truncate text-xs font-bold text-indigo-700">EN · {title}</p>}
            <p className="mt-1 text-xs leading-5 text-slate-500">纠正只作为你的备注，不改变现有证据数字和理解状态。</p>
            {missingBilingualEvidence && (
              <button
                type="button"
                onClick={() => void onEnhanceEvidence()}
                disabled={enhancingEvidence}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
              >
                {enhancingEvidence ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                {enhancingEvidence ? '正在补全…' : '补全中英文与精确页码'}
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-stone-100 p-2 text-slate-500 hover:bg-stone-200" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {kcs.map((kc) => (
            <section key={kc.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-slate-900">{kc.conceptZh || (hasChinese(kc.concept) ? kc.concept : '中文名称待补全')}</h3>
              {!hasChinese(kc.concept) && <p className="mt-1 text-xs font-bold text-indigo-700">{kc.concept}</p>}
              <p className="mt-1 text-xs leading-5 text-slate-600">{kc.definitionZh || (hasChinese(kc.definition) ? kc.definition : '中文解释待补全')}</p>
              {!hasChinese(kc.definition) && kc.definition && <p className="mt-1 text-[11px] leading-5 text-slate-400">EN · {kc.definition}</p>}
              <div className="mt-3 space-y-3">
                {(kc.atoms ?? []).map((atom) => {
                  const covered = coverage[kc.id]?.[atom.id] === true;
                  const mappedTurns = userTurns.filter(({ turn }) => turn.coveredAtomIds?.includes(atom.id));
                  const legacy = covered && mappedTurns.length === 0;
                  const atomAnnotations = annotations.filter((annotation) => annotation.kcId === kc.id && annotation.atomId === atom.id);
                  const legacyDisputed = atomAnnotations.find((annotation) => annotation.kind === 'disputed' && !annotation.turnId);
                  const review = atomAnnotations.find((annotation) => annotation.kind === 'needs_review' && annotation.revisitStatus !== 'resolved');
                  const exactPages = normalizePages(atom.sourcePages);
                  const fallbackPages = exactPages.length > 0 ? [] : normalizePages([
                    ...(kc.anchorPages ?? []),
                    ...(kc.sourcePages ?? []),
                    ...(kc.relatedPages ?? []),
                  ]);
                  const displayPages = exactPages.length > 0 ? exactPages : fallbackPages;
                  return (
                    <article key={atom.id} className="rounded-xl border border-stone-100 bg-stone-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800">{atom.labelZh || (hasChinese(atom.label) ? atom.label : '中文标题待补全')}</p>
                          {!hasChinese(atom.label) && <p className="mt-0.5 text-[11px] font-bold text-indigo-700">EN · {atom.label}</p>}
                          <p className="mt-1 text-[11px] leading-5 text-slate-600">{atom.descriptionZh || (hasChinese(atom.description) ? atom.description : '中文解释待补全')}</p>
                          {!hasChinese(atom.description) && atom.description && <p className="mt-1 text-[11px] leading-5 text-slate-400">EN · {atom.description}</p>}
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${covered ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-slate-500'}`}>
                          {covered ? <CheckCircle2 className="h-3 w-3" /> : null}{covered ? '已计入' : '未覆盖'}
                        </span>
                      </div>

                      {displayPages.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500">
                            {exactPages.length > 0 ? '原文证据页' : '本知识点证据页（旧数据）'}
                          </span>
                          {displayPages.map((page) => (
                            <button
                              key={page}
                              type="button"
                              disabled={!kc.sourceLinkId}
                              onClick={() => onOpenSourcePage(kc, page)}
                              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-default disabled:border-stone-200 disabled:bg-stone-100 disabled:text-slate-500"
                              title={kc.sourceLinkId ? `打开 ${kc.sourceFileName || '原 PDF'} 第 ${page} 页` : '旧数据未保存材料关联，暂时无法跳转'}
                            >
                              {kc.sourceFileName ? `${kc.sourceFileName} · ` : ''}p.{page}
                            </button>
                          ))}
                        </div>
                      )}

                      {legacy && (
                        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                          旧版覆盖记录，未保存具体回答来源。
                        </div>
                      )}

                      {mappedTurns.map(({ turn, id }) => {
                        const disputed = atomAnnotations.find((annotation) => annotation.kind === 'disputed' && annotation.turnId === id);
                        return (
                          <div key={id} className="mt-2 rounded-lg border border-indigo-100 bg-white p-3">
                            <button type="button" onClick={() => onJumpToTurn(id)} className="block w-full text-left">
                              <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600"><MessageCircle className="h-3 w-3" />查看原对话 · {new Date(turn.timestamp).toLocaleString()}</span>
                              <span className="mt-1 line-clamp-3 block text-xs leading-5 text-slate-700">{turn.text}</span>
                            </button>
                            {disputed && (
                              <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                                <span className="font-bold">你已标注：这条证据不准确。</span>{disputed.note ? ` ${disputed.note}` : ''}
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" onClick={() => setDisputed(kc.id, atom.id, id)} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-100">
                                {disputed ? <span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" />撤销纠正</span> : '这条不准确'}
                              </button>
                              {disputed && (
                                <button type="button" onClick={() => { setEditingAnnotationId(disputed.id); setNoteDraft(disputed.note ?? ''); }} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-100">补充说明</button>
                              )}
                              <button type="button" onClick={() => markNeedsReview(kc.id, atom.id, id)} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100">其实不熟，稍后再问</button>
                            </div>
                          </div>
                        );
                      })}

                      {legacy && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setDisputed(kc.id, atom.id)} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-100">
                            {legacyDisputed ? '撤销纠正' : '这条不准确'}
                          </button>
                          {legacyDisputed && (
                            <button type="button" onClick={() => { setEditingAnnotationId(legacyDisputed.id); setNoteDraft(legacyDisputed.note ?? ''); }} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-100">补充说明</button>
                          )}
                          <button type="button" onClick={() => markNeedsReview(kc.id, atom.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100">其实不熟，稍后再问</button>
                        </div>
                      )}

                      {review && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800"><Clock3 className="h-3.5 w-3.5" />{review.revisitStatus === 'asked' ? '已回访，等待你的确认' : '待回看'}</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => onAskNow(review)} className="text-[11px] font-bold text-indigo-700 hover:underline">现在再问我</button>
                            <button type="button" onClick={() => onAnnotationsChange(annotations.filter((annotation) => annotation.id !== review.id))} className="text-[11px] font-bold text-slate-500 hover:underline">取消回访</button>
                          </div>
                        </div>
                      )}

                      {editingAnnotationId && atomAnnotations.some((annotation) => annotation.id === editingAnnotationId) && (
                        <div className="mt-2 rounded-lg border border-stone-200 bg-white p-2">
                          <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={2} placeholder="补充你为什么不认可这条证据（可选）" className="w-full resize-none rounded-lg border border-stone-200 px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-indigo-300" />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingAnnotationId(null)} className="text-[11px] font-bold text-slate-500">取消</button>
                            <button type="button" onClick={() => { const target = annotations.find((annotation) => annotation.id === editingAnnotationId); if (target) saveNote(target); }} className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">保存说明</button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
                {(kc.atoms ?? []).length === 0 && (
                  <p className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-xs text-slate-400">这一考点尚未提取逻辑原子。</p>
                )}
              </div>
            </section>
          ))}
          {kcs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-slate-500"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />当前知识块没有可展示的证据。</div>
          )}
        </div>
      </aside>
    </div>
  );
};
