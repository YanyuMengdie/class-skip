import React, { useEffect, useRef, useState } from 'react';
import type { AppLanguage } from '@/types';
import './studyCompanionCat.css';

interface StudyCompanionCatProps {
  language: AppLanguage;
}

type CatPose = 'hidden' | 'peek' | 'sleep';

export function StudyCompanionCat({ language }: StudyCompanionCatProps) {
  const [pose, setPose] = useState<CatPose>('hidden');
  const [greeting, setGreeting] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEnglish = language === 'en';

  useEffect(() => () => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
  }, []);

  const greetCat = () => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    setPose('peek');
    // Restart the blink without moving focus or making repeated clicks queue up.
    setGreeting((value) => value + 1);
    settleTimer.current = setTimeout(() => {
      setPose('sleep');
      settleTimer.current = null;
    }, 3100);
  };

  const label = isEnglish ? 'Say hello to the cat behind the books' : '和书后的小猫打个招呼';
  const caption = pose === 'hidden'
    ? (isEnglish ? 'A little hello?' : '点点小耳朵')
    : pose === 'peek'
      ? (isEnglish ? 'Here with you' : '陪你待一会儿')
      : (isEnglish ? 'Take your time' : '慢慢来就好');

  return (
    <button
      type="button"
      className="study-companion-cat"
      data-pose={pose}
      aria-label={label}
      title={label}
      onClick={greetCat}
    >
      <span className="study-companion-cat__scene" aria-hidden="true">
        <span className="study-companion-cat__cat">
          <span className="study-companion-cat__ear study-companion-cat__ear--left" />
          <span className="study-companion-cat__ear study-companion-cat__ear--right" />
          <span className="study-companion-cat__head">
            <span className="study-companion-cat__stripe" />
            <span key={greeting} className="study-companion-cat__eyes"><i /><i /></span>
            <span className="study-companion-cat__nose" />
            <span className="study-companion-cat__mouth" />
            <span className="study-companion-cat__whiskers study-companion-cat__whiskers--left" />
            <span className="study-companion-cat__whiskers study-companion-cat__whiskers--right" />
          </span>
        </span>
        <span className="study-companion-cat__books">
          <span className="study-companion-cat__book study-companion-cat__book--top">{isEnglish ? 'A little at a time' : '今天先学一点'}</span>
          <span className="study-companion-cat__book study-companion-cat__book--bottom">{isEnglish ? 'Slow days' : '慢 慢 来'}</span>
        </span>
        <span className="study-companion-cat__paws"><i /><i /></span>
        <span className="study-companion-cat__sign">{pose === 'sleep' ? 'z' : '?'}</span>
      </span>
      <span className="study-companion-cat__caption" aria-hidden="true">{caption}</span>
    </button>
  );
}
