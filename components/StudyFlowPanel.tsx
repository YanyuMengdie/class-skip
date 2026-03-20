import React, { useMemo, useState } from 'react';
import { X, ChevronRight, RotateCcw, Check } from 'lucide-react';
import type {
  MaterialFamiliarity,
  UrgencyBand,
  AffectState,
  StudyFlowStep,
  Exam,
  ExamMaterialLink,
  FilePersistedState,
} from '../types';
import { buildScenarioKey, inferFamiliarity, inferUrgencyForFile } from '../utils/studyFlowInference';
import { getTemplateForScenario } from '../data/studyFlowTemplates';

export interface StudyFlowPanelProps {
  onClose: () => void;
  fileHash: string | null;
  cloudSessionId: string | null;
  fileName: string | null;
  filePersistedState: FilePersistedState | null;
  exams: Exam[];
  materials: ExamMaterialLink[];
  onExecuteStep: (step: StudyFlowStep) => void;
  /** 疲惫时时长打折系数 */
  tiredFactor?: number;
}

export const StudyFlowPanel: React.FC<StudyFlowPanelProps> = ({
  onClose,
  fileHash,
  cloudSessionId,
  fileName,
  filePersistedState,
  exams,
  materials,
  onExecuteStep,
  tiredFactor = 0.6,
}) => {
  const inferredFam = useMemo(
    () => inferFamiliarity(fileHash || '', filePersistedState),
    [fileHash, filePersistedState]
  );
  const inferredUrg = useMemo(
    () => inferUrgencyForFile(fileHash || undefined, cloudSessionId || undefined, exams, materials),
    [fileHash, cloudSessionId, exams, materials]
  );

  const [fam, setFam] = useState<MaterialFamiliarity>(inferredFam);
  const [urg, setUrg] = useState<UrgencyBand>(inferredUrg);
  const [aff, setAff] = useState<AffectState>('good');
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const scenarioKey = buildScenarioKey(fam, urg, aff);
  const template = useMemo(() => getTemplateForScenario(scenarioKey), [scenarioKey]);

  const steps = useMemo(() => {
    return template.steps.map((s) =>
      aff === 'tired'
        ? { ...s, estimatedMinutes: Math.max(3, Math.round(s.estimatedMinutes * tiredFactor)) }
        : s
    );
  }, [template.steps, aff, tiredFactor]);

  const currentIndex = steps.findIndex((s) => !doneIds.has(s.id));
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;

  const reInfer = () => {
    setFam(inferredFam);
    setUrg(inferredUrg);
    setAff('good');
    setDoneIds(new Set());
  };

  const markDone = (id: string) => {
    setDoneIds((prev) => new Set(prev).add(id));
  };

  const skip = (id: string, skippable: boolean) => {
    if (!skippable) {
      window.alert('此步骤建议完成，若需跳过请先执行一次或换情境模板');
      return;
    }
    markDone(id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between shrink-0 mb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">情境化复习</h2>
          <p className="text-xs text-slate-500">{fileName ?? '未打开文件'}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100">
          <X className="w-5 h-5 text-stone-500" />
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 p-3 bg-white/80 space-y-2 mb-3 shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold text-slate-600">情境</span>
          <select
            value={fam}
            onChange={(e) => setFam(e.target.value as MaterialFamiliarity)}
            className="text-xs border rounded-lg px-2 py-1"
          >
            <option value="never_seen">材料：初次</option>
            <option value="learned_once">材料：学过一轮</option>
            <option value="reviewed_before">材料：较熟</option>
          </select>
          <select
            value={urg}
            onChange={(e) => setUrg(e.target.value as UrgencyBand)}
            className="text-xs border rounded-lg px-2 py-1"
          >
            <option value="d1_2">紧迫：1–2 天</option>
            <option value="d3_7">紧迫：3–7 天</option>
            <option value="d8_plus">紧迫：8 天以上</option>
            <option value="no_exam">无考试</option>
          </select>
          <select
            value={aff}
            onChange={(e) => setAff(e.target.value as AffectState)}
            className="text-xs border rounded-lg px-2 py-1"
          >
            <option value="good">状态：正常</option>
            <option value="tired">状态：疲惫（时长缩短）</option>
            <option value="anxious">状态：焦虑</option>
          </select>
          <button
            type="button"
            onClick={reInfer}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600"
          >
            <RotateCcw className="w-3 h-3" /> 重新推断
          </button>
        </div>
        <p className="text-xs text-violet-700 font-medium">{template.title}</p>
        <p className="text-[10px] text-slate-400">模板键：{scenarioKey}</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {steps.map((s, i) => {
          const done = doneIds.has(s.id);
          const active = currentStep?.id === s.id;
          return (
            <div
              key={s.id}
              className={`rounded-xl border p-3 transition-colors ${
                active
                  ? 'border-indigo-400 bg-indigo-50/50'
                  : done
                    ? 'border-stone-100 bg-stone-50 opacity-70'
                    : 'border-stone-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-slate-400 w-6">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.description}</p>
                  <p className="text-xs text-amber-800/90 mt-1 italic">「{s.reasonForUser}」</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    约 {s.estimatedMinutes} 分钟 · {s.action}
                    {s.target ? ` → ${s.target}` : ''}
                  </p>
                </div>
                {done && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
              </div>
              {!done && (
                <div className="flex flex-wrap gap-2 mt-2 ml-8">
                  <button
                    type="button"
                    onClick={() => onExecuteStep(s)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                  >
                    <ChevronRight className="w-3.5 h-3.5" /> 执行本步
                  </button>
                  <button
                    type="button"
                    onClick={() => skip(s.id, s.skippable)}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs text-slate-600"
                  >
                    跳过
                  </button>
                  <button
                    type="button"
                    onClick={() => markDone(s.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold"
                  >
                    标记完成
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
