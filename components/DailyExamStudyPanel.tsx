import React, { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Clock, Play } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { DailySegment, Exam, ExamMaterialLink } from '../types';
import {
  getDailyPlanCache,
  setDailyPlanCache,
  deleteDailyPlanCache,
} from '../services/firebase';
import { buildDailyPlan, type FilePlanMeta } from '../utils/examSchedule';
import { storageService } from '../services/storageService';

const BUDGET_LS = 'examDailyBudgetMinutes';

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weakKcFromLsap(
  bkt: Record<string, number> | undefined,
  kcIds: string[]
): string | undefined {
  if (!bkt || kcIds.length === 0) return undefined;
  let worst = kcIds[0];
  let worstP = bkt[worst] ?? 1;
  for (const id of kcIds) {
    const p = bkt[id] ?? 0;
    if (p < worstP) {
      worstP = p;
      worst = id;
    }
  }
  return worstP < 0.55 ? worst : undefined;
}

interface DailyExamStudyPanelProps {
  user: User;
  onClose: () => void;
  exams: Exam[];
  materials: ExamMaterialLink[];
  onNavigateSegment: (segment: DailySegment) => void;
}

export const DailyExamStudyPanel: React.FC<DailyExamStudyPanelProps> = ({
  user,
  onClose,
  exams,
  materials,
  onNavigateSegment,
}) => {
  const dateStr = useMemo(() => localDateStr(), []);
  const [budget, setBudget] = useState(() => {
    const v = Number(localStorage.getItem(BUDGET_LS));
    return Number.isFinite(v) && v >= 5 ? v : 30;
  });
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [segments, setSegments] = useState<DailySegment[]>([]);
  const [loading, setLoading] = useState(true);

  const materialsByExam = useMemo(() => {
    const m = new Map<string, ExamMaterialLink[]>();
    materials.forEach((x) => {
      const arr = m.get(x.examId) || [];
      arr.push(x);
      m.set(x.examId, arr);
    });
    return m;
  }, [materials]);

  useEffect(() => {
    const schedulable = exams.filter((e) => e.examAt != null).map((e) => e.id);
    setSelectedExamIds((prev) => {
      const valid = new Set(exams.map((e) => e.id));
      const kept = prev.filter((id) => valid.has(id));
      return kept.length > 0 ? kept : schedulable;
    });
  }, [exams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cached = await getDailyPlanCache(user.uid, dateStr);
        if (cancelled) return;
        if (cached?.segments?.length) {
          setSegments(cached.segments);
          setSelectedExamIds(cached.selectedExamIds);
          if (typeof cached.budgetMinutes === 'number' && cached.budgetMinutes >= 5) {
            setBudget(cached.budgetMinutes);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid, dateStr]);

  const runBuildAndSave = async (clearRemote: boolean) => {
    if (clearRemote) await deleteDailyPlanCache(user, dateStr);
    localStorage.setItem(BUDGET_LS, String(budget));

    const fileMeta = new Map<string, FilePlanMeta>();
    const uniqHashes = new Set(
      materials.filter((m) => m.sourceType === 'fileHash' && m.fileHash).map((m) => m.fileHash!)
    );
    for (const h of uniqHashes) {
      const item = await storageService.getFileState(h);
      if (!item?.state) continue;
      const slideLike = Object.keys(item.state.explanations || {}).length;
      const pageApprox = Math.max(1, slideLike, (item.state.currentIndex ?? 0) + 5);
      const map = item.state.lsapContentMap;
      const st = item.state.lsapState;
      const kcIds = map?.kcs?.map((k) => k.id) || [];
      const weak = weakKcFromLsap(st?.bktState, kcIds);
      fileMeta.set(h, {
        pageCount: pageApprox,
        lastIndex: item.state.currentIndex,
        weakKcId: weak,
      });
    }

    const next = buildDailyPlan({
      now: new Date(),
      selectedExamIds,
      exams,
      materialsByExamId: materialsByExam,
      budgetMinutes: budget,
      fileMeta,
    });

    setSegments(next);
    await setDailyPlanCache(user, {
      date: dateStr,
      selectedExamIds,
      segments: next,
      generatedAt: Date.now(),
      budgetMinutes: budget,
      version: 1,
    });
  };

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalMin = segments.reduce((s, x) => s + x.estimatedMinutes, 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between shrink-0 mb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">今日学习</h2>
          <p className="text-xs text-slate-500">{dateStr}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100">
          <X className="w-5 h-5 text-stone-500" />
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 p-3 bg-white/80 space-y-3 mb-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Clock className="w-4 h-4 text-indigo-500" />
            今日预算（分钟）
            <input
              type="number"
              min={5}
              max={180}
              value={budget}
              onChange={(e) => setBudget(Math.max(5, Number(e.target.value) || 30))}
              className="w-16 border border-stone-200 rounded-lg px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => runBuildAndSave(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重新生成今日计划
          </button>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500 mb-1">今天要复习的考试</p>
          <div className="flex flex-wrap gap-2">
            {exams.length === 0 ? (
              <span className="text-xs text-slate-400">请先在「考试」页创建</span>
            ) : (
              exams.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-1 text-xs bg-stone-50 px-2 py-1 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedExamIds.includes(e.id)}
                    onChange={() => toggleExam(e.id)}
                  />
                  <span className="w-2 h-2 rounded-full" style={{ background: e.color || '#999' }} />
                  {e.title}
                  {e.examAt == null && <span className="text-amber-600">（未定日）</span>}
                </label>
              ))
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">片段合计约 {totalMin} 分钟 · 目标预算 {budget}</p>
        {loading && <p className="text-xs text-slate-400">正在加载今日缓存…</p>}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {!loading && segments.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-slate-400 text-sm">
              暂无今日片段。请确认考试已设日期、已关联材料，并点击「重新生成今日计划」。
            </p>
            <button
              type="button"
              onClick={() => runBuildAndSave(false)}
              className="text-sm font-bold text-indigo-600 hover:underline"
            >
              立即生成
            </button>
          </div>
        ) : (
          segments.map((seg) => (
            <div
              key={seg.id}
              className="rounded-xl border border-stone-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm">{seg.title}</p>
                <p className="text-xs text-slate-500 truncate">{seg.fileName}</p>
                {seg.description && <p className="text-xs text-slate-400 mt-0.5">{seg.description}</p>}
                <p className="text-[10px] text-indigo-600 mt-1">
                  {seg.examTitle} · {seg.estimatedMinutes} 分钟 · {seg.kind}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSegment(seg)}
                className="shrink-0 flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                <Play className="w-4 h-4" /> 开始
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
