import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';

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

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const [timeString, setTimeString] = useState('');
  const [quote, setQuote] = useState('');

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="font-display text-slate-950 min-h-screen flex flex-col overflow-hidden fixed inset-0 z-[9999] bg-[#d3f0f6]">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute left-10 top-24 w-56 h-24 rounded-[50%] bg-white/70" />
        <div className="absolute right-14 top-32 w-72 h-24 rounded-[50%] bg-white/70" />
        <div className="absolute left-1/2 top-16 w-48 h-16 -translate-x-1/2 rounded-[50%] bg-white/60" />
        <div
          className="absolute left-0 bottom-0 w-full h-[34vh] bg-white"
          style={{ clipPath: 'polygon(0 38%, 8% 52%, 16% 35%, 25% 60%, 35% 48%, 44% 68%, 54% 45%, 64% 58%, 74% 40%, 86% 55%, 100% 34%, 100% 100%, 0 100%)' }}
        />
        <div
          className="absolute left-0 bottom-0 w-full h-[22vh] bg-[#e7dff7]"
          style={{ clipPath: 'polygon(0 42%, 12% 22%, 25% 44%, 39% 18%, 55% 52%, 70% 28%, 86% 48%, 100% 20%, 100% 100%, 0 100%)' }}
        />
        <div
          className="absolute right-0 bottom-0 w-[46vw] h-[28vh] bg-[#f6e48d]"
          style={{ clipPath: 'polygon(24% 28%, 100% 4%, 100% 100%, 0 100%)' }}
        />
      </div>

      <main className="flex flex-col flex-grow items-center justify-center px-6 py-12 relative z-10">
        <div className="absolute top-8 left-8 hidden md:flex items-center gap-3 rounded-lg bg-white/70 border border-white px-4 py-3 shadow-sm">
          <BookOpen className="w-5 h-5 text-slate-900" />
          <span className="font-black tracking-tight">逃课神器</span>
        </div>

        <div className="flex flex-col items-center max-w-5xl w-full text-center space-y-8 md:space-y-10">
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h1 className="text-7xl sm:text-8xl md:text-9xl lg:text-[10rem] font-black leading-none text-slate-950 select-none">
              {timeString}
            </h1>
          </div>

          <div className="animate-slide-up max-w-3xl px-4" style={{ animationDelay: '0.3s' }}>
            <p className="text-xl md:text-3xl text-slate-800 font-semibold leading-relaxed">
              {quote}
            </p>
          </div>

          <div className="animate-slide-up pt-4 md:pt-6" style={{ animationDelay: '0.5s' }}>
            <button
              onClick={onStart}
              className="group flex items-center justify-center gap-3 bg-slate-950 hover:bg-slate-800 text-white px-8 py-4 rounded-lg transition-all duration-300 shadow-lg shadow-slate-900/10 cursor-pointer"
            >
              <span className="text-base md:text-lg font-black">进入</span>
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
