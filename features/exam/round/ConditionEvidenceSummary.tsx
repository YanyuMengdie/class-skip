import React from 'react';
import { buildConditionEvidence, buildPracticeEvidence, describeAnswerConditions, type ConditionEvidence } from './conditionEvidence';
import type { RoundAttempt, RoundLanguage } from './roundTypes';

/** Only submitted, reviewed answers describe practice; a question's format is not a success claim. */
export function PracticeEvidenceSummary({ attempts, objectiveId, conditionEvidence, practiceEvidence, language }: {
  attempts: RoundAttempt[]; objectiveId?: string; conditionEvidence?: ConditionEvidence;
  practiceEvidence?: ReturnType<typeof buildPracticeEvidence>; language: RoundLanguage;
}) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  if (!attempts.some(attempt => attempt.question.practiceVersion === 1)) return null;
  const evidence = practiceEvidence ?? buildPracticeEvidence(attempts, objectiveId, attempt => !conditionEvidence
    || conditionEvidence.observations.some(observation => observation.attemptId === attempt.id && observation.result !== 'uncertain'));
  const rows = [
    { key: 'basis', label: t('基础回顾', 'Foundation review'), bucket: evidence.basis,
      practiced: t('已练基础', 'Foundation practiced'), unchecked: t('本次未单独检查基础回顾', 'Foundation review was not checked separately') },
    { key: 'application', label: t('案例应用', 'Case application'), bucket: evidence.application,
      practiced: t('已做案例应用', 'Case application practiced'), unchecked: t('案例应用还没检查', 'Case application not checked') },
    { key: 'lowCueApplication', label: t('较少线索的案例', 'Cases with fewer cues'), bucket: evidence.lowCueApplication,
      practiced: t('已练较少线索的案例', 'Cases with fewer cues practiced'), unchecked: t('较少线索的案例还没检查', 'Cases with fewer cues not checked') },
  ];
  return <section className="study-practice-evidence" aria-label={t('这次练到了什么', 'What this practice checked')}>
    <h3>{t('这次练到了什么', 'What this practice checked')}</h3>
    <ul>{rows.map(({ key, label, bucket, practiced, unchecked }) => <li key={key} data-practice={key}>
      <strong>{label}</strong><div><p>{bucket.attempted.length ? `${practiced} · ${t(`${bucket.attempted.length} 次`, `${bucket.attempted.length} answers`)}` : unchecked}</p>
        {bucket.attempted.length > 0 && <small>{[
          bucket.independent.length ? t(`未借助额外帮助完成 ${bucket.independent.length} 次`, `${bucket.independent.length} completed without extra help`) : '',
          bucket.assisted.length ? t(`得到帮助后完成 ${bucket.assisted.length} 次`, `${bucket.assisted.length} completed with help`) : '',
          bucket.needsWork.length ? t(`仍有遗漏 ${bucket.needsWork.length} 次`, `${bucket.needsWork.length} still need work`) : '',
        ].filter(Boolean).join(' · ')}</small>}
      </div></li>)}</ul>
    <p className="study-practice-evidence-note">{t('记录这次实际练过什么，不需要逐项刷满，也不代表全部知识已掌握。', 'A record of reviewed practice, not a checklist to complete or a claim of full mastery.')}</p>
  </section>;
}

/** Conditions describe observed answers, not a ladder the learner must finish. */
export function ConditionEvidenceSummary({ attempts, objectiveId, evidence: suppliedEvidence, practiceEvidence, language }: {
  attempts: RoundAttempt[]; objectiveId?: string; evidence?: ConditionEvidence;
  practiceEvidence?: ReturnType<typeof buildPracticeEvidence>; language: RoundLanguage;
}) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const evidence = suppliedEvidence ?? buildConditionEvidence(attempts, objectiveId);
  const latest = [...evidence.observations].sort((a, b) => b.submittedAt - a.submittedAt)[0];
  if (!latest) return null;
  const labels = {
    4: t('点名概念', 'Concept named'), 3: t('给出范围', 'Topic range provided'),
    2: t('提供情境线索', 'Situation cue provided'), 1: t('未点名概念', 'Concept not named'),
  };
  return <>{(practiceEvidence || !suppliedEvidence || objectiveId) && <PracticeEvidenceSummary attempts={attempts} objectiveId={objectiveId} conditionEvidence={evidence} practiceEvidence={practiceEvidence} language={language} />}<details className="study-condition-evidence">
    <summary>{t('在什么提示条件下回答的？', 'What were the cue conditions?')}</summary>
    <p>{describeAnswerConditions(latest.conditions, language)}</p>
    <ul>{[...evidence.cueLevels].sort((a, b) => b.cueLevel - a.cueLevel).map(row => <li key={row.cueLevel}>
      <span>{labels[row.cueLevel]}</span>
      <span>{row.completedWithoutSupport.length ? t('有未借助额外帮助完成的记录', 'Completed without extra help')
        : row.completedWithSupport.length ? t('有借助帮助后完成的记录', 'Completed with extra help')
          : row.needsWork.length ? t('已有作答，仍有遗漏', 'Attempted; some points missing')
            : row.uncertain.length ? t('已有作答，结果待核对', 'Attempted; result needs review')
            : t('尚无可确认的完成记录', 'No confirmed completion recorded')}</span>
    </li>)}</ul>
    {evidence.legacyUnchecked.length > 0 && <p>{t('旧题的提示条件不明确，原答仍保留，暂不计入上面的条件记录。', 'Earlier answers are retained, but unreviewed cue conditions do not count in the records above.')}</p>}
    <small>{t('线索程度由 AI 核对；它不是难度分数。这些是实际作答记录，不要求逐项刷满。', 'Cue strength is reviewed by AI, not a difficulty score. These are observations, not a checklist to complete.')}</small>
  </details></>;
}
