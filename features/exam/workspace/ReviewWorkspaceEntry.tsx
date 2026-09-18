import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import type { WorkspaceUser as User } from '@/services/workspaceUser';
import type { CloudSession, ExamMaterialLink } from '@/types';
import { getUserSessions } from '@/services/firebase';
import { ReviewMaterialPicker } from '@/features/review/ReviewMaterialPicker';
import { createLectureReviewMaterial } from '@/features/exam/lib/lectureReviewScope';
import '@/features/review/review.css';

export function ReviewWorkspaceEntry({ user, currentMaterial, initialPick = false, onLecture, onExam, onBack, onLibrary }: {
  user: User;
  currentMaterial: ExamMaterialLink | null;
  initialPick?: boolean;
  onLecture: (material: ExamMaterialLink) => void;
  onExam: () => void;
  onBack: () => void;
  onLibrary: () => void;
}) {
  const [picking, setPicking] = useState(initialPick);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [useCurrent, setUseCurrent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!picking) return;
    let active = true;
    setLoading(true); setError('');
    getUserSessions(user).then(items => { if (active) setSessions(items); })
      .catch(() => { if (active) setError('资料目录暂时无法读取，请重试。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, picking, retry]);
  const start = () => {
    if (useCurrent && currentMaterial) { onLecture(currentMaterial); return; }
    const file = sessions.find(s => s.id === selectedId && s.type === 'file');
    if (!file) return;
    const material = createLectureReviewMaterial(user.uid, { cloudSessionId: file.id, fileName: file.fileName });
    if (material) onLecture(material);
  };
  return <div className="review-page">
    <header className="review-page-header">
      <div className="review-page-heading"><GraduationCap size={28} /><div><h1>复习工作台</h1><p>学完一讲，或为一场考试做准备。</p></div></div>
      <button type="button" className="review-back" onClick={onBack}><ArrowLeft size={16} />返回学习</button>
    </header>
    <main className="review-page-body"><div className="review-page-inner">
      {picking ? <>
        {currentMaterial && <div className="review-question-entry"><div><h3>接着复习当前讲义</h3><p>{currentMaterial.fileName}</p></div><button type="button" onClick={() => onLecture(currentMaterial)}>复习这一讲 <ArrowRight size={17} /></button></div>}
        <ReviewMaterialPicker sessions={sessions} loading={loading} error={error} signedIn toolLabel="复习一讲" singleSelection
          hasCurrentDoc={!!currentMaterial} currentDocName={currentMaterial?.fileName ?? null} currentSessionId={currentMaterial?.cloudSessionId}
          selectedIds={new Set(selectedId ? [selectedId] : [])} useCurrentDoc={useCurrent}
          onToggleFile={id => { setSelectedId(prev => prev === id ? '' : id); setUseCurrent(false); }}
          onToggleCurrent={() => { setUseCurrent(v => !v); setSelectedId(''); }}
          onBack={() => setPicking(false)} onStart={start} onRetry={() => setRetry(v => v + 1)} onLibrary={onLibrary}
        />
      </> : <>
        <div className="review-intro"><span className="review-eyebrow">REVIEW WORKSPACE</span><h2>这次，想复习什么？</h2><p>从一份讲义开始巩固，也可以围绕考试组织多份资料。</p></div>
        <div className="review-tool-grid">
          <button type="button" className="review-tool-card" onClick={() => setPicking(true)}><div className="review-tool-card-top"><BookOpen size={26} /><span>01</span></div><h3>复习一讲</h3><p>选一份 lecture，整理知识点，按主题练习，并保留每次作答记录。无需创建考试。</p><div className="review-tool-action">选择讲义 <ArrowRight size={17} /></div></button>
          <button type="button" className="review-tool-card" onClick={onExam}><div className="review-tool-card-top"><GraduationCap size={26} /><span>02</span></div><h3>准备考试</h3><p>选择一场考试，组织多份讲义，按考试范围复习。已有考试、材料和记录仍在这里。</p><div className="review-tool-action">选择考试 <ArrowRight size={17} /></div></button>
        </div>
        {currentMaterial && <div className="review-question-entry"><div><h3>刚刚学完这一讲？</h3><p>{currentMaterial.fileName}</p></div><button type="button" onClick={() => onLecture(currentMaterial)}>直接复习本讲 <ArrowRight size={17} /></button></div>}
        <p className="review-workspace-record-note">单讲复习与考试复习分别保留记录。选择资料不会自动生成知识点或题目。</p>
      </>}
    </div></main>
  </div>;
}
