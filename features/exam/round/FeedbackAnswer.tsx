import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle } from 'lucide-react';
import { feedbackContractValid } from './feedbackContract';
import type { RoundAttempt, RoundCitation, RoundEvaluation, RoundLanguage } from './roundTypes';

export function feedbackNeedsReview(item: RoundAttempt, evaluation: RoundEvaluation): boolean {
  return !evaluation.questionValid || !feedbackContractValid(item.question, evaluation)
    || !!item.evaluationError || !!(item.dispute && !item.dispute.resolvedAt)
    || evaluation.items.length !== item.question.criteria.length
    || item.question.criteria.some(criterion => {
      const matches = evaluation.items.filter(result => result.criterionId === criterion.id);
      return matches.length !== 1 || matches[0].status === 'uncertain';
    });
}

export function answerFullyAddressed(item: RoundAttempt): boolean {
  return !!item.evaluation && !feedbackNeedsReview(item, item.evaluation)
    && item.evaluation.items.length > 0 && item.evaluation.items.every(result => result.status === 'met');
}

export function FeedbackAnswer({ attempt, evaluation, language, renderSources }: {
  attempt: RoundAttempt;
  evaluation: RoundEvaluation;
  language: RoundLanguage;
  renderSources: (sources: RoundCitation[]) => React.ReactNode;
}) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const needsReview = feedbackNeedsReview(attempt, evaluation);
  const guide = evaluation.questionValid && feedbackContractValid(attempt.question, evaluation) ? evaluation.answerGuide : undefined;
  const currentFormat = evaluation.feedbackVersion === 1;
  const covered = evaluation.items.filter(item => (item.status === 'met' || item.status === 'partial') && item.covered?.trim());
  const needed = evaluation.items.filter(item => item.status === 'partial' || item.status === 'missing');
  const allMet = evaluation.items.length > 0 && evaluation.items.every(item => item.status === 'met');
  const prose = (text: string) => <ReactMarkdown skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'br']}>{text}</ReactMarkdown>;
  const criterionDetails = <>{attempt.question.criteria.map(criterion => {
    const result = evaluation.items.find(item => item.criterionId === criterion.id);
    const status = needsReview ? 'uncertain' : result?.status || 'uncertain';
    const label = status === 'met' ? t('已回应', 'Addressed') : status === 'partial' ? t('部分回应', 'Partly addressed')
      : status === 'missing' ? t('尚未回应', 'Not addressed') : t('需要核对', 'Needs review');
    return <section key={criterion.id} className="study-round-criterion">
      <div className="study-round-criterion-heading"><h4>{criterion.requirement}</h4><span data-status={status}>{label}</span></div>
      {result?.answerQuote ? <blockquote><small>{t('你的原话', 'Your words')}</small>{result.answerQuote}</blockquote>
        : <p className="study-round-muted">{t('这条记录没有对应的原答摘录。', 'No answer quotation is recorded for this item.')}</p>}
      {result?.feedback && <p>{needsReview && <span className="study-round-muted">{t('原反馈文字（待核对）：', 'Original feedback, pending review: ')}</span>}{result.feedback}</p>}
      <details><summary>{t('查看材料中的检查依据', 'See the source requirement')}</summary><p>{criterion.expected}</p>{criterion.sources.map((citation, index) => <blockquote key={index}>{citation.quote}</blockquote>)}</details>
      {renderSources(criterion.sources)}
    </section>;
  })}</>;

  return <div className="study-round-evaluation">
    {!currentFormat && <p className="study-round-legacy-feedback">{t('这是旧版反馈，原答和逐项核对仍完整保留。', 'This is earlier feedback. Your original answer and item-by-item review are preserved.')}</p>}
    {needsReview && <div className="study-round-notice"><AlertCircle size={17} /><div>{!evaluation.questionValid
      ? t('这道题的依据需要重新确认，暂不判断回答是否满足要求。', 'The question’s source needs checking. No conclusion is drawn about your answer yet.')
      : t('这次回答的判定还需要核对，暂不确认已经通过或存在知识缺口。', 'This answer still needs review. Its success or a knowledge gap has not been established.')}
      {!evaluation.questionValid && evaluation.invalidReason ? ` ${evaluation.invalidReason}` : ''}</div></div>}
    {currentFormat && !needsReview && <>
      <section className="study-round-feedback-section study-round-covered"><h3>{t('你已经说对的', 'What you already got right')}</h3>
        {covered.length ? covered.map(item => <div key={item.criterionId} className="study-round-feedback-point"><div className="study-round-prose">{prose(item.covered!)}</div>
          {item.answerQuote && <blockquote><small>{t('你的原话', 'Your words')}</small>{item.answerQuote}</blockquote>}</div>)
          : <p className="study-round-muted">{t('这次原答中还没有可确认已回应的要点。', 'No addressed point could be confirmed in this answer yet.')}</p>}
      </section>
      <section className="study-round-feedback-section study-round-needed"><h3>{t('本题还需要补的', 'What this question still needs')}</h3>
        {allMet ? <p className="study-round-complete-answer">{t('你已经回应了本题的全部要求，不需要为了完整而再加细节。', 'You have addressed every requirement of this question. No extra detail is needed to make the answer complete.')}</p>
          : needed.map(item => <div key={item.criterionId} className="study-round-feedback-point"><div className="study-round-prose">{prose(item.needed || t('这一项的补充要求尚未整理完整，可查看逐项核对。', 'The required addition is not yet clear. See the item-by-item review.'))}</div></div>)}
      </section>
    </>}
    {guide && currentFormat && <>
      <section className="study-round-reference-answer"><h3>{t('一份简短完整的参考回答', 'A brief, complete reference answer')}</h3>
        <p className="study-round-reference-note">{t('这是一种合适的表达，不需要照背。用你自己的话说明同样的意思即可。', 'This is one suitable way to express the answer. You can use your own words; there is no need to memorize it.')}</p>
        <div className="study-round-prose">{prose(guide.referenceAnswer)}</div>{renderSources(guide.sources)}
      </section>
      {guide.optionalNotes.length > 0 && <details className="study-round-optional-notes"><summary>{t('想深入再看 · 不影响本题结果', 'Explore further · does not affect this result')}</summary>
        <p className="study-round-muted">{t('下面是可选延伸，不是本题缺少的要求，也不用补进这次回答。', 'These are optional extensions, not missing requirements. You do not need to add them to this answer.')}</p>
        {guide.optionalNotes.map((note, index) => <section key={index}><div className="study-round-prose">{prose(note.text)}</div>{renderSources(note.sources)}</section>)}
      </details>}
    </>}
    {currentFormat ? <details className="study-round-criterion-details"><summary>{t('查看逐项核对与原文依据', 'See the item-by-item review and sources')}</summary>{criterionDetails}</details>
      : <>{!needsReview && <p className="study-round-feedback-summary">{evaluation.summary}</p>}{criterionDetails}</>}
  </div>;
}
