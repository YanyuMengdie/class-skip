import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen, PencilLine } from 'lucide-react';
import type { ExamMaterialLink } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import './moduleReview.css';

export function ModuleReviewChoice({
  material,
  onBack,
  onModules,
  onPractice,
}: {
  material: ExamMaterialLink;
  onBack: () => void;
  onModules: () => void;
  onPractice: () => void;
}) {
  const { text: t } = useAppLanguage();
  return (
    <div className="module-review-page">
      <header className="mr-header">
        <button onClick={onBack}>
          <ArrowLeft size={17} />
          {t('复习工作台', 'Review workspace')}
        </button>
        <div>
          <h1>{t('复习本讲', 'Review this lecture')}</h1>
          <p>{material.fileName}</p>
        </div>
      </header>
      <main className="mr-mode-wrap">
        <p className="mr-eyebrow">REVIEW THIS LECTURE</p>
        <h2>{t('这一讲，你想怎么复习？', 'How would you like to review this lecture?')}</h2>
        <div className="mr-mode-grid">
          <button className="mr-mode-card" onClick={onModules}>
            <BookOpen size={28} />
            <h3>{t('按 module 重学', 'Relearn by module')}</h3>
            <p>
              {t(
                '沿用领读分段，把每一块完整讲清楚，再做一整组英文课后练习。',
                'Reuse your reading modules, learn each one in full, then complete a substantial English assignment.',
              )}
            </p>
            <p>
              {t(
                '完整讲解 → 16 或 24 道题 → 批改、补学与订正',
                'Full lesson → 16 or 24 questions → Feedback, repair and corrections',
              )}
            </p>
            <strong>
              {t('进入重学', 'Start relearning')} <ArrowRight size={17} />
            </strong>
          </button>
          <button className="mr-mode-card" onClick={onPractice}>
            <PencilLine size={28} />
            <h3>{t('直接练习', 'Go straight to practice')}</h3>
            <p>
              {t(
                '继续使用现有知识清单、主题练习和整场材料对话，已有记录都在。',
                'Continue with the existing knowledge checklist, theme practice and material conversation. Your previous records remain available.',
              )}
            </p>
            <strong>
              {t('进入原复习方式', 'Open existing practice')} <ArrowRight size={17} />
            </strong>
          </button>
        </div>
      </main>
    </div>
  );
}
