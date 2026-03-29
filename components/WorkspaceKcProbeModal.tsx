/**
 * M4：备考工作台 · 单 KC 结业探测（出题 → 作答 → 阅卷 → BKT + 预测分）
 *
 * bloomLevel：取 `Math.min(3, Math.max(1, kc.bloomTargetLevel))`，与 `generateLSAPProbeQuestion` 一致。
 * 有 `sourceLinkId` 时优先用单份材料文本出题/阅卷，与合并讲义一致时回退并提示。
 */
import React, { useEffect, useState } from 'react';
import { X, Loader2, ClipboardCheck } from 'lucide-react';
import type { LSAPContentMap, LSAPKnowledgeComponent, LSAPState, ProbeRecord } from '../types';
import {
  evaluateLSAPAnswer,
  generateLSAPProbeQuestion,
  type LSAPEvalResult,
  type LSAPProbeDocScope,
} from '../services/geminiService';
import { updateBKT } from '../utils/bkt';
import { computePredictedScore } from '../utils/lsapScore';
import { ConflictPageHint } from './WorkspaceEvidenceReportModal';

export function bloomLevelForWorkspaceProbe(kc: LSAPKnowledgeComponent): number {
  return Math.min(3, Math.max(1, kc.bloomTargetLevel ?? 1));
}

/** 从 `getDocContentForExamLink` 返回串首行 `【文件名】` 解析展示名 */
function parseBracketFileName(doc: string): string | null {
  const first = doc.trimStart().split('\n')[0]?.trim() ?? '';
  const m = first.match(/^【([^】]+)】$/);
  return m ? m[1].trim() : null;
}

export interface WorkspaceKcProbeModalProps {
  open: boolean;
  onClose: () => void;
  mergedContent: string;
  /** 按 linkId 取单份讲义（与 App 内 getDocContentForExamLink 同源） */
  onLoadProbeMaterialText?: (linkId: string) => Promise<string | null>;
  contentMap: LSAPContentMap;
  kc: LSAPKnowledgeComponent;
  workspaceLsapState: LSAPState;
  /** 提交阅卷并更新 BKT 后的完整 state（由 App 持久化） */
  onCommit: (next: LSAPState) => void;
}

export const WorkspaceKcProbeModal: React.FC<WorkspaceKcProbeModalProps> = ({
  open,
  onClose,
  mergedContent,
  onLoadProbeMaterialText,
  contentMap,
  kc,
  workspaceLsapState,
  onCommit,
}) => {
  const [resolvingDoc, setResolvingDoc] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [probeDocContent, setProbeDocContent] = useState<string | null>(null);
  const [probeScopeOpts, setProbeScopeOpts] = useState<LSAPProbeDocScope | undefined>(undefined);
  const [usedFallbackMerged, setUsedFallbackMerged] = useState(false);
  const [probe, setProbe] = useState<{ question: string; sourceRef: string } | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    eval: LSAPEvalResult;
    prevScore: number;
    nextScore: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setResolvingDoc(false);
      setLoadingQuestion(false);
      setProbeDocContent(null);
      setProbeScopeOpts(undefined);
      setUsedFallbackMerged(false);
      setProbe(null);
      setUserAnswer('');
      setLoadError(null);
      setResult(null);
      setEvaluating(false);
      return;
    }

    let cancelled = false;
    setResolvingDoc(true);
    setLoadingQuestion(false);
    setLoadError(null);
    setProbe(null);
    setUserAnswer('');
    setResult(null);
    setProbeDocContent(null);
    setProbeScopeOpts(undefined);
    setUsedFallbackMerged(false);

    (async () => {
      const mergedOk = mergedContent.trim().length > 0;
      let doc = mergedContent;
      let fallback = false;
      let scope: LSAPProbeDocScope | undefined;

      if (kc.sourceLinkId && onLoadProbeMaterialText) {
        try {
          const single = await onLoadProbeMaterialText(kc.sourceLinkId);
          if (cancelled) return;
          if (single?.trim()) {
            doc = single;
            const display =
              kc.sourceFileName?.trim() || parseBracketFileName(single) || '本考点所属讲义';
            scope = { docIsSingleMaterial: true, materialDisplayName: display };
          } else {
            fallback = true;
          }
        } catch {
          if (cancelled) return;
          fallback = true;
        }
      } else {
        fallback = true;
      }

      if (cancelled) return;

      if (fallback && !mergedOk) {
        setLoadError('合并讲义为空，无法出题。');
        setResolvingDoc(false);
        return;
      }

      if (fallback) {
        doc = mergedContent;
        scope = undefined;
      }

      if (!doc.trim()) {
        setLoadError('讲义文本为空，无法出题。');
        setResolvingDoc(false);
        return;
      }

      setProbeDocContent(doc);
      setUsedFallbackMerged(fallback);
      setProbeScopeOpts(scope);
      setResolvingDoc(false);

      setLoadingQuestion(true);
      const bl = bloomLevelForWorkspaceProbe(kc);
      try {
        const res = await generateLSAPProbeQuestion(doc, contentMap, kc.id, bl, undefined, scope);
        if (cancelled) return;
        if (!res) {
          setLoadError('出题失败，请重试。');
          return;
        }
        setProbe(res);
      } catch {
        if (!cancelled) setLoadError('出题失败，请重试。');
      } finally {
        if (!cancelled) setLoadingQuestion(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, kc.id, kc.sourceLinkId, kc.sourceFileName, mergedContent, contentMap, onLoadProbeMaterialText]);

  const handleSubmit = async () => {
    if (!probe || !userAnswer.trim() || !probeDocContent?.trim()) return;
    setEvaluating(true);
    try {
      const evalRes = await evaluateLSAPAnswer(
        probeDocContent,
        kc.id,
        probe.question,
        userAnswer.trim(),
        probe.sourceRef,
        probeScopeOpts
      );
      if (!evalRes) {
        window.alert('阅卷失败，请重试。');
        return;
      }
      const correctForBKT = evalRes.correct === true || evalRes.correct === 'partial';
      const bloomLevel = bloomLevelForWorkspaceProbe(kc);
      const prevP = workspaceLsapState.bktState[kc.id] ?? 0;
      const newP = updateBKT(prevP, correctForBKT);

      const record: ProbeRecord = {
        kcId: kc.id,
        bloomLevel,
        question: probe.question,
        userAnswer: userAnswer.trim(),
        correct: evalRes.correct,
        evidence: evalRes.evidence,
        sourcePage: evalRes.conflictWithPage,
        timestamp: Date.now(),
      };

      const newBkt = { ...workspaceLsapState.bktState, [kc.id]: newP };
      const prevScore = computePredictedScore(contentMap, workspaceLsapState.bktState);
      const nextScore = computePredictedScore(contentMap, newBkt);

      const nextState: LSAPState = {
        ...workspaceLsapState,
        bktState: newBkt,
        probeHistory: [...workspaceLsapState.probeHistory, record],
        lastPredictedScore: nextScore,
        lastUpdated: Date.now(),
      };

      onCommit(nextState);
      setResult({ eval: evalRes, prevScore, nextScore });
    } catch {
      window.alert('阅卷失败，请重试。');
    } finally {
      setEvaluating(false);
    }
  };

  if (!open) return null;

  const correctLabel =
    result?.eval.correct === true ? '正确' : result?.eval.correct === 'partial' ? '部分正确' : '错误';

  const showFallbackHint =
    usedFallbackMerged && Boolean(kc.sourceLinkId) && Boolean(onLoadProbeMaterialText);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl border border-stone-200 bg-[#FFFBF7] shadow-2xl flex flex-col"
      >
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-stone-200 bg-white/95">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardCheck className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">结业探测</h2>
              <p className="text-[11px] text-slate-500 truncate">{kc.concept}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-100 text-slate-600 hover:bg-stone-200 shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          <p className="text-[11px] text-slate-500">
            布鲁姆层级：{bloomLevelForWorkspaceProbe(kc)}（由考点 bloomTargetLevel 约束在 1～3）
          </p>

          {showFallbackHint && (
            <p className="text-[11px] leading-snug text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
              未能加载该考点关联材料的单独文本，已改用本场合并讲义；题目与出处可能涉及多份材料。
            </p>
          )}

          {loadError && <p className="text-rose-600 text-sm">{loadError}</p>}

          {resolvingDoc && (
            <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
              <span>正在加载该考点所属讲义…</span>
            </div>
          )}

          {!resolvingDoc && loadingQuestion && (
            <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
              <span>正在出题…</span>
            </div>
          )}

          {!resolvingDoc && !loadingQuestion && probe && !result && (
            <>
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase mb-1">题干</h3>
                <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{probe.question}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase mb-1">参考出处</h3>
                <p className="text-xs text-slate-600 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100">
                  {probe.sourceRef}
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase mb-1">你的回答</h3>
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  rows={5}
                  disabled={evaluating}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-slate-800 resize-y min-h-[100px]"
                  placeholder="用你自己的话作答…"
                />
              </div>
              <button
                type="button"
                disabled={evaluating || !userAnswer.trim()}
                onClick={() => handleSubmit()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                提交阅卷
              </button>
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div
                className={`rounded-xl px-3 py-2 border ${
                  result.eval.correct === true
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : result.eval.correct === 'partial'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <p className="font-bold text-sm">结果：{correctLabel}</p>
                {result.eval.evidence && (
                  <p className="text-xs mt-1 leading-relaxed opacity-90">{result.eval.evidence}</p>
                )}
                {result.eval.conflictWithPage != null && (
                  <div className="mt-2">
                    <ConflictPageHint
                      page={result.eval.conflictWithPage}
                      variant={result.eval.correct === false ? 'strong' : 'default'}
                    />
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm">
                <p className="font-bold text-indigo-900">预测分</p>
                <p className="text-indigo-800 tabular-nums mt-1">
                  {result.prevScore} → <span className="font-black text-lg">{result.nextScore}</span>
                  {result.nextScore > result.prevScore && (
                    <span className="ml-2 text-emerald-700 font-bold">+{result.nextScore - result.prevScore}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-stone-200 text-slate-800 font-bold text-sm"
              >
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
