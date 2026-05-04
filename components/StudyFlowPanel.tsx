import React, { useMemo, useState } from 'react';
import { X, ChevronRight, RotateCcw, Check } from 'lucide-react';
import type {
  MaterialFamiliarity,
  UrgencyBand,
  LearnerMood,
  StudyFlowStep,
  Exam,
  ExamMaterialLink,
  FilePersistedState,
} from '@/types';
import { buildExtendedScenarioKey, inferFamiliarity, inferUrgencyForFile } from '@/utils/studyFlowInference';
import { getTemplateForScenario } from '@/data/studyFlowTemplates';

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
  /** P1：与保温流 LearnerMood 对齐；旧 UI「疲惫」≈ dont_want，「焦虑」≈ want_anxious */
  const [learnerMood, setLearnerMood] = useState<LearnerMood>('normal');
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const scenarioKey = buildExtendedScenarioKey(fam, urg, learnerMood);
  const template = useMemo(() => getTemplateForScenario(scenarioKey), [scenarioKey]);

  const steps = useMemo(() => {
    const factor =
      learnerMood === 'dont_want' ? tiredFactor : learnerMood === 'want_anxious' ? 0.85 : 1;
    return template.steps.map((s) =>
      factor < 1 ? { ...s, estimatedMinutes: Math.max(3, Math.round(s.estimatedMinutes * factor)) } : s
    );
  }, [template.steps, learnerMood, tiredFactor]);

  const currentIndex = steps.findIndex((s) => !doneIds.has(s.id));
  const currentStep = currentIndex >= 0 ? steps[currentIndex] : null;
  const completedCount = doneIds.size;
  const totalEstimatedMinutes = steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);

  const reInfer = () => {
    setFam(inferredFam);
    setUrg(inferredUrg);
    setLearnerMood('normal');
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
            value={learnerMood}
            onChange={(e) => setLearnerMood(e.target.value as LearnerMood)}
            className="text-xs border rounded-lg px-2 py-1"
          >
            <option value="normal">心态：正常</option>
            <option value="dont_want">心态：不想学（时长缩短）</option>
            <option value="want_anxious">心态：想学但焦虑</option>
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
        {(learnerMood === 'want_anxious' || learnerMood === 'dont_want') && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-amber-800 font-medium">
              当前状态建议先做情绪/精力恢复，再继续学习。
            </span>
            <button
              type="button"
              onClick={() =>
                onExecuteStep({
                  id: 'quick-rest',
                  order: 0,
                  label: '进入能量补给站',
                  description: '缓解焦虑/疲惫后再学',
                  action: 'rest',
                  target: 'break',
                  estimatedMinutes: 5,
                  skippable: true,
                  reasonForUser: '先稳住状态，学习效率更高',
                })
              }
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold"
            >
              进入能量补给站（推荐）
            </button>
            <button
              type="button"
              onClick={() => undefined}
              className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs"
            >
              继续学习流程
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {!currentStep && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-2">
            <p className="text-base font-bold text-emerald-800">今天的情境流程已完成</p>
            <p className="text-sm text-emerald-700 mt-1">
              完成 {completedCount}/{steps.length} 步，预计投入约 {totalEstimatedMinutes} 分钟。你做得很好，继续保持。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-bold"
              >
                完成
              </button>
              <button
                type="button"
                onClick={reInfer}
                className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 text-sm"
              >
                再来一轮
              </button>
            </div>
          </div>
        )}
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
