import { useEffect, useRef, useState } from 'react';
import './studyBookLoader.css';

/** Decorative waiting illustration; the surrounding UI supplies the status text. */
export function StudyBookLoader({ size = 'regular' }: { size?: 'regular' | 'compact' }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    let disposed = false;
    let inViewport = typeof IntersectionObserver === 'undefined';
    const updateAnimation = () => {
      if (!disposed) setIsAnimating(inViewport && !document.hidden);
    };
    const observer = typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(([entry]) => {
        inViewport = Boolean(entry?.isIntersecting);
        updateAnimation();
      }, { threshold: 0.01 });

    observer?.observe(element);
    document.addEventListener('visibilitychange', updateAnimation);
    updateAnimation();

    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateAnimation);
    };
  }, []);

  return (
    <span
      ref={rootRef}
      className={`reluctant-book-loader reluctant-book-loader--${size}`}
      data-animating={isAnimating ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className="reluctant-book-loader__scene">
        <span className="reluctant-book-loader__shadow" />
        <span className="reluctant-book-loader__book">
          <span className="reluctant-book-loader__cover" />
          <span className="reluctant-book-loader__page reluctant-book-loader__page--left">
            <i /><i /><i />
          </span>
          <span className="reluctant-book-loader__page reluctant-book-loader__page--right">
            <i /><i /><i />
          </span>
          <span className="reluctant-book-loader__page reluctant-book-loader__page--turn">
            <i /><i /><i />
          </span>
          <span className="reluctant-book-loader__spine" />
          <span className="reluctant-book-loader__ribbon" />
        </span>
      </span>
    </span>
  );
}
