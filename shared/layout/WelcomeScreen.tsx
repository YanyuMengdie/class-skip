import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';

interface WelcomeScreenProps {
  onStart: () => void;
}

const QUOTES = [
  '今天不用一口气变好，先回来就很好。',
  '慢一点也没关系，书房一直给你留着灯。',
  '先坐下，剩下的可以一页一页来。',
  '你走过的地方不会因为停顿就消失。',
  '小小地继续，也是在继续。',
  '把门打开，今天就已经开始了。',
];

const QUOTES_EN = [
  'You do not need to fix everything today. Coming back is already enough.',
  'Going slowly is fine. The light in your study is still on.',
  'Sit down first. We can take the rest one page at a time.',
  'A pause does not erase the distance you have already traveled.',
  'A small continuation is still a continuation.',
  'Open the door, and today has already begun.',
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const { language, text } = useAppLanguage();
  const [timeString, setTimeString] = useState('');
  const [quote, setQuote] = useState('');

  useEffect(() => {
    const quotes = language === 'en' ? QUOTES_EN : QUOTES;
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, [language]);

  return (
    <div className="editorial-welcome">
      <header className="editorial-welcome-header">
        <div className="editorial-welcome-brand">
          <span className="editorial-welcome-brand-mark" aria-hidden="true" />
          <span>{text('逃课神器', 'Class Skip')}</span>
        </div>
        <p className="editorial-meta text-right">
          {text('个人学习刊物', 'Personal Study Journal')}<br />
          {text('第二辑 · 日常阅读', 'Vol. II · Daily Reading')}
        </p>
      </header>

      <main className="editorial-welcome-main">
        <aside className="editorial-welcome-time" aria-label={text('当前时间', 'Current time')}>
          <span className="editorial-meta">Current time</span>
          <strong>{timeString}</strong>
        </aside>

        <section className="editorial-welcome-copy">
          <p className="editorial-meta">The reading room — 01</p>
          <h1>{quote}</h1>
          <div className="editorial-welcome-rule" aria-hidden="true" />
          <button onClick={onStart} className="editorial-primary-button group">
            <span>{text('进入书房', 'Enter the study')}</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </section>

        <span className="editorial-welcome-folio" aria-hidden="true">01</span>
      </main>
    </div>
  );
};
