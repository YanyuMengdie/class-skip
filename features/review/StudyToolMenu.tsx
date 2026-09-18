import React, { useState } from 'react';
import { ArrowRight, BookOpen, Layers, GitBranch, PencilLine, ChevronLeft, MessageCircle, ClipboardList, History } from 'lucide-react';
import type { ReviewType } from './ReviewPage';
import './review.css';

export const REVIEW_TOOL_LABELS: Partial<Record<ReviewType, string>> = {
  practice: '练一练', studyGuide: '复习笔记', quiz: '做题', caseQuiz: '案例应用', feynman: '自己讲清楚',
  flashcard: '闪卡', mindMap: '思维导图', multiDocQA: '多文档问答', trapList: '错题本',
};

/** Choosing a tool only chooses the next screen; it never generates content. */
export function StudyToolMenu({ onSelect, disabled = false, trapCount = 0, allowMultiDocQA = false, selectMaterialsFirst = false, initialPractice = false }: {
  onSelect: (type: ReviewType) => void; disabled?: boolean; trapCount?: number; allowMultiDocQA?: boolean; selectMaterialsFirst?: boolean; initialPractice?: boolean;
}) {
  const [practice, setPractice] = useState(initialPractice);
  const choices = practice ? [
    { type: 'quiz' as const, title: '做题', description: '用选择题检查理解，可选综合练习、概念辨析或案例应用。', icon: ClipboardList },
    { type: 'feynman' as const, title: '自己讲清楚', description: '先用自己的话回答，再看反馈和参考答案。', icon: MessageCircle },
    { type: 'trapList' as const, title: `错题本 · ${trapCount}`, description: '回顾以前保存的错题与解析，不需要重新选择资料。', icon: History },
  ] : [
    { type: 'studyGuide' as const, title: '复习笔记', description: '把要点、详细解释、术语和容易混淆的地方整理在一起。', icon: BookOpen },
    { type: 'practice' as const, title: '练一练', description: '做题、分析案例，或试着自己讲清楚，看看哪里还需要补上。', icon: PencilLine },
    { type: 'flashcard' as const, title: '闪卡', description: '快速回忆一个概念，也可以把笔记里的知识点做成卡片。', icon: Layers },
    { type: 'mindMap' as const, title: '思维导图', description: '看清这一份资料的结构，以及知识点之间的联系。', icon: GitBranch },
  ];
  return <div className="study-tools-menu">
    {disabled && <p role="status" className="review-notice">尚未选中资料，因此无法打开需要资料的学习工具。请先选择资料；错题本仍可查看。</p>}
    {practice && <button type="button" onClick={() => setPractice(false)} className="review-back"><ChevronLeft size={16} />返回学习工具</button>}
    <div className="review-section-label"><span>{practice ? '想怎么检查自己的理解？' : '这次想怎么学？'}</span><span>{practice ? '选一种练法，再挑资料' : '先选工具，再挑资料'}</span></div>
    <div className={`review-tool-grid${practice ? ' is-practice' : ''}`}>
      {choices.map(({ type, title, description, icon: Icon }, i) => <button type="button" key={type} disabled={disabled && type !== 'practice' && type !== 'trapList'} onClick={() => type === 'practice' && !selectMaterialsFirst ? setPractice(true) : onSelect(type)} className="review-tool-card">
        <div className="review-tool-card-top"><Icon size={25} strokeWidth={1.5} /><span>0{i + 1}</span></div>
        <h3>{title}</h3><p>{description}</p>
        <div className="review-tool-action">{type === 'practice' && !selectMaterialsFirst ? '选择练习方式' : type === 'trapList' ? '查看错题' : '选择资料'}<ArrowRight size={17} /></div>
      </button>)}
    </div>
    {selectMaterialsFirst && <button type="button" className="review-back" onClick={() => onSelect('trapList')}><History size={16} />直接查看错题本（{trapCount}）</button>}
    {allowMultiDocQA && <div className="review-question-entry"><div><h3>想联系几份资料一起问？</h3><p>选择多份资料，保留原来的问答记录。</p></div><button type="button" disabled={disabled} onClick={() => onSelect('multiDocQA')}>多文档问答 <ArrowRight size={17} /></button></div>}
  </div>;
}
