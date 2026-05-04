import React from 'react';
import {
  BookOpen,
  FileText,
  AlertTriangle,
  MessageCircle,
  GraduationCap,
  BookMarked,
  GitBranch,
  HelpCircle,
  ListChecks
} from 'lucide-react';
import { SavedArtifactType } from '@/types';

export const SAVED_ARTIFACT_TYPE_META: Record<
  SavedArtifactType,
  { label: string; icon: React.ReactNode; bg: string }
> = {
  studyGuide: { label: '学习指南', icon: <BookOpen className="w-4 h-4" />, bg: 'bg-indigo-100 text-indigo-800' },
  examSummary: { label: '考前速览', icon: <FileText className="w-4 h-4" />, bg: 'bg-emerald-100 text-emerald-800' },
  examTraps: { label: '考点与陷阱', icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-rose-100 text-rose-800' },
  feynman: { label: '费曼检验', icon: <MessageCircle className="w-4 h-4" />, bg: 'bg-sky-100 text-sky-800' },
  trickyProfessor: { label: '刁钻教授', icon: <GraduationCap className="w-4 h-4" />, bg: 'bg-orange-100 text-orange-800' },
  terminology: { label: '术语定义', icon: <BookMarked className="w-4 h-4" />, bg: 'bg-cyan-100 text-cyan-800' },
  mindMap: { label: '思维导图', icon: <GitBranch className="w-4 h-4" />, bg: 'bg-teal-100 text-teal-800' },
  quiz: { label: '测验', icon: <HelpCircle className="w-4 h-4" />, bg: 'bg-violet-100 text-violet-800' },
  flashcard: { label: '闪卡', icon: <ListChecks className="w-4 h-4" />, bg: 'bg-amber-100 text-amber-800' },
  trapList: { label: '陷阱清单', icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-amber-100 text-amber-800' }
};

export function formatSavedArtifactTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
