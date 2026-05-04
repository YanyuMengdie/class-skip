import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Exam, ExamMaterialLink, FilePersistedState, StudyFlowStep } from '@/types';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { ExamCenterPanel } from '@/components/ExamCenterPanel';
import { ExamDailyMaintenancePanel } from '@/components/ExamDailyMaintenancePanel';
import { StudyFlowPanel } from '@/components/StudyFlowPanel';

type Tab = 'exams' | 'daily' | 'flow';

interface ExamHubModalProps {
  open: boolean;
  onClose: () => void;
  user: User;
  initialTab?: Tab;
  fileHash: string | null;
  cloudSessionId: string | null;
  fileName: string | null;
  filePersistedState: FilePersistedState | null;
  onExecuteFlowStep: (step: StudyFlowStep) => void;
  onOpenReviewTool: (tool: 'examPrediction' | 'examSummary' | 'examTraps' | 'feynman' | 'flashcard' | 'quiz') => void;
  onBuildMaintenanceContent: (links: ExamMaterialLink[]) => Promise<string>;
}

export const ExamHubModal: React.FC<ExamHubModalProps> = ({
  open,
  onClose,
  user,
  initialTab = 'exams',
  fileHash,
  cloudSessionId,
  fileName,
  filePersistedState,
  onExecuteFlowStep,
  onOpenReviewTool,
  onBuildMaintenanceContent,
}) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [exams, setExams] = useState<Exam[]>([]);
  const [materials, setMaterials] = useState<ExamMaterialLink[]>([]);

  const refresh = useCallback(async () => {
    const [e, m] = await Promise.all([listExams(user), listExamMaterialLinks(user)]);
    setExams(e);
    setMaterials(m);
  }, [user]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      refresh();
    }
  }, [open, initialTab, refresh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[210] flex items-stretch justify-center bg-black/45 p-4 sm:p-8">
      <div className="bg-[#FFFBF7] rounded-2xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col border border-stone-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-4 shrink-0 border-b border-stone-100 pb-2">
          {(
            [
              ['exams', '考试管理'],
              ['daily', '今日学习'],
              ['flow', '情境流程'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                tab === id ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600 hover:bg-stone-200'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-2 rounded-xl hover:bg-stone-100"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === 'exams' && (
            <ExamCenterPanel
              user={user}
              onClose={onClose}
              exams={exams}
              materials={materials}
              onRefresh={refresh}
              fileHash={fileHash}
              cloudSessionId={cloudSessionId}
              fileName={fileName}
            />
          )}
          {tab === 'daily' && (
            <ExamDailyMaintenancePanel
              user={user}
              exams={exams}
              materials={materials}
              onClose={onClose}
              onOpenTool={onOpenReviewTool}
              onBuildMergedContent={onBuildMaintenanceContent}
            />
          )}
          {tab === 'flow' && (
            <StudyFlowPanel
              onClose={onClose}
              fileHash={fileHash}
              cloudSessionId={cloudSessionId}
              fileName={fileName}
              filePersistedState={filePersistedState}
              exams={exams}
              materials={materials}
              onExecuteStep={(step) => {
                onExecuteFlowStep(step);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
