import React from 'react';
import { ArrowRight, BookOpen, ChevronDown, Layers3 } from 'lucide-react';
import type { LSAPKnowledgeComponent } from '@/types';
import { ConditionEvidenceSummary } from './ConditionEvidenceSummary';
import { describeAnswerConditions, summarizeQuestionConditions } from './conditionEvidence';
import { buildKnowledgeEvidence } from './roundState';
import type { RoundKnowledgeTarget, RoundLanguage, StudyRound } from './roundTypes';
import { pageLabel } from './roundScope';

interface Props {
  kcs: LSAPKnowledgeComponent[];
  targets: RoundKnowledgeTarget[];
  rounds: StudyRound[];
  pageCount: number;
  language: RoundLanguage;
  legacyCoverage: Record<string, Record<string, boolean>>;
  onOpenPage: (page: number, quote?: string) => void;
  onReveal: (kc: LSAPKnowledgeComponent) => void;
  onPractice: (kcId: string) => void;
}

export function KnowledgeChecklist({ kcs, targets, rounds, pageCount, language, legacyCoverage, onOpenPage, onReveal, onPractice }: Props) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const evidence = buildKnowledgeEvidence(targets, rounds);
  const pages = (values: number[] = []) => [...new Set(values)].filter(page => Number.isInteger(page) && page > 0 && page <= pageCount).sort((a, b) => a - b);
  const labels = {
    unchecked: t('尚未检查', 'Not checked'), needs_work: t('回答有遗漏', 'Some points missing'), assisted: t('帮助后说清', 'Explained with help'),
    recheck: t('可以间隔复查', 'Ready for a later check'), independent: t('有未借助额外帮助的记录', 'Answer without extra help recorded'), uncertain: t('条件或反馈待核对', 'Conditions or feedback under review'),
  };
  const atomCount = kcs.reduce((sum, kc) => sum + (kc.atoms?.length ?? 0), 0);
  return <section className="knowledge-checklist" aria-label={t('KC 知识点与逻辑原子', 'Knowledge components and logic atoms')}>
    <header><div><p className="knowledge-eyebrow">{t('这份讲义的复习清单', 'YOUR LECTURE KNOWLEDGE MAP')}</p><h2>{t('先知道要复习什么', 'See what you will review')}</h2><p>{t('展开知识点，查看组成它的具体要点与原文；每次作答会对应回这里。', 'Expand a knowledge component to see its specific points and sources. Answers are linked back here.')}</p></div><Layers3 size={30} /></header>
    <div className="knowledge-counts"><span><strong>{kcs.length}</strong> KC</span><span><strong>{atomCount}</strong> {t('个逻辑原子', 'logic atoms')}</span><span><strong>{evidence.filter(row => row.status === 'unchecked').length}</strong> {t('项可检查、尚未作答', 'ready, not checked')}</span></div>
    <p className="knowledge-help-note">{t('查看知识清单会记为相关内容帮助。旧记录保留，提示条件不明确的题目会标为待核对。', 'Viewing the knowledge map is recorded as related support. Earlier records remain available; unclear cue conditions are marked for review.')}</p>
    <div className="knowledge-kc-list">{kcs.map((kc, index) => {
      const kcPages = pages([...(kc.anchorPages ?? []), ...(kc.sourcePages ?? [])]);
      const localEvidence = evidence.filter(row => row.target.kcId === kc.id);
      const checked = localEvidence.filter(row => row.attempts.length > 0).length;
      return <details className="knowledge-kc" key={kc.id} onToggle={event => { if (event.target === event.currentTarget && event.currentTarget.open) onReveal(kc); }}>
        <summary><span className="knowledge-kc-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{language === 'zh' ? kc.conceptZh || kc.concept : kc.concept}</strong><span>{kcPages.length ? pageLabel(kcPages, language) : t('原文页码待补全', 'Source pages needed')} · {(kc.atoms ?? []).length} {t('个原子', 'atoms')} · {t(`${checked} 项有作答记录`, `${checked} with answer evidence`)}</span></div><ChevronDown size={17} /></summary>
        <div className="knowledge-kc-body">
          {language === 'zh' && kc.conceptZh && kc.conceptZh !== kc.concept && <p className="knowledge-original-term">{kc.concept}</p>}
          <p>{language === 'zh' ? kc.definitionZh || kc.definition : kc.definition}</p>
          {kc.reviewFocus && <p className="knowledge-focus">{kc.reviewFocus}</p>}
          <div className="knowledge-page-links">{kcPages.map(page => <button type="button" key={page} onClick={() => onOpenPage(page)}><BookOpen size={13} />{t(`第 ${page} 页`, `p. ${page}`)}</button>)}</div>
          {!kc.atoms?.length && <p className="knowledge-pending">{t('还没有可核对的逻辑原子。可以提取要点；材料没有写的内容会留空，不会凑数。', 'No source-backed atoms yet. Extract the points; unsupported content stays empty.')}</p>}
          <ol className="knowledge-atoms">{(kc.atoms ?? []).map(atom => {
            const row = localEvidence.find(item => item.target.atomId === atom.id);
            const atomPages = pages(atom.sourcePages);
            const knownPageCount = new Set(atom.sourcePages ?? []).size;
            const pageReady = atomPages.length > 0 && atomPages.length === knownPageCount;
            const descriptionReady = (atom.descriptionZh || atom.description || '').trim().length >= 2;
            const oldCovered = legacyCoverage[kc.id]?.[atom.id] === true;
            return <li key={atom.id}>
              <div className="knowledge-atom-heading"><strong>{language === 'zh' ? atom.labelZh || atom.label : atom.label}</strong><span className="knowledge-status" data-status={row?.status || 'pending'}>{row ? labels[row.status] : !descriptionReady ? t('要点待补全 · 暂不出题', 'Point needed · not tested') : pageReady ? t('需选齐支持页后检查', 'Select all supporting pages') : t('页码待补全 · 暂不出题', 'Source needed · not tested')}</span></div>
              <p>{language === 'zh' ? atom.descriptionZh || atom.description : atom.description}</p>
              <div className="knowledge-page-links">{atomPages.map(page => <button type="button" key={page} onClick={() => onOpenPage(page)}><BookOpen size={13} />{t(`原文第 ${page} 页`, `Source p. ${page}`)}</button>)}</div>
              {oldCovered && <small className="knowledge-legacy">{t('旧版对话曾记录覆盖此要点', 'Previously covered in an earlier conversation')}</small>}
              {!!row?.attempts.length && <ConditionEvidenceSummary attempts={row.attempts} evidence={row.conditionEvidence} practiceEvidence={row.practiceEvidence} language={language} />}
              {!!row?.attempts.length && <details className="knowledge-answer-evidence"><summary>{t(`查看 ${row.attempts.length} 次作答依据`, `View ${row.attempts.length} recorded answers`)}</summary>{row.attempts.map(attempt => {
                const objectiveIds = new Set(rounds.flatMap(round => round.blueprint.objectives.filter(objective => objective.knowledgeTarget?.id === row.target.id && objective.knowledgeTarget.contentKey === row.target.contentKey).map(objective => objective.id)));
                const criteria = attempt.question.criteria.filter(criterion => objectiveIds.has(criterion.objectiveId));
                const conditions = row.conditionEvidence.observations.find(item => item.attemptId === attempt.id)?.conditions;
                return <article key={attempt.id}><strong>{attempt.question.prompt}</strong><small>{new Date(attempt.submittedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-CA')} · {conditions ? describeAnswerConditions(conditions, language) : summarizeQuestionConditions(attempt, language)}</small><p className="round-original-answer">{attempt.answer}</p>{criteria.map(criterion => {
                  const result = attempt.evaluation?.items.find(item => item.criterionId === criterion.id);
                  return <p key={criterion.id}>{result?.feedback || t('反馈尚未完成', 'Feedback pending')}</p>;
                })}{attempt.dispute && !attempt.dispute.resolvedAt && <p>{t('异议待核对：', 'Issue under review: ')}{attempt.dispute.note}</p>}</article>;
              })}</details>}
            </li>;
          })}</ol>
          <button type="button" className="round-shell-button round-shell-primary" onClick={() => onPractice(kc.id)}>{t('复习这个知识点所在的块', 'Practice the block containing this KC')}<ArrowRight size={15} /></button>
        </div>
      </details>;
    })}</div>
  </section>;
}
