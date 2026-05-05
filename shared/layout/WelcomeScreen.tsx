
import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: () => void;
}

const QUOTES = [
  "Believe in yourself, you are doing great.",
  "The expert in anything was once a beginner.",
  "Don't watch the clock; do what it does. Keep going.",
  "Learning is a treasure that will follow its owner everywhere.",
  "Small progress is still progress.",
  "The beautiful thing about learning is that no one can take it away from you."
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const [timeString, setTimeString] = useState('');
  const [quote, setQuote] = useState('');

  useEffect(() => {
    // Random quote on mount
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

    // Clock logic
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    
    updateTime(); // Initial call
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="font-display bg-warm-gradient text-[#221610] dark:text-[#f8f6f6] min-h-screen flex flex-col overflow-hidden selection:bg-primary/20 selection:text-primary fixed inset-0 z-[9999]">
      {/* Main Content Container */}
      <main className="layout-container flex flex-col flex-grow items-center justify-center p-6 relative z-10">
        
        {/* Decorative subtle glow behind the clock for warmth */}
        <div aria-hidden="true" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>
        
        <div className="flex flex-col items-center max-w-4xl w-full text-center space-y-10 md:space-y-14">
          
          {/* Clock Section */}
          <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <h1 className="text-8xl md:text-9xl lg:text-[11rem] font-black tracking-tighter leading-none text-[#1b120d] dark:text-[#fcf9f8] drop-shadow-sm select-none">
              {timeString}
            </h1>
          </div>
          
          {/* Quote Section */}
          <div className="animate-slide-up max-w-2xl px-4" style={{ animationDelay: '0.3s' }}>
            <p className="text-xl md:text-2xl lg:text-3xl text-[#5d4e46] dark:text-[#d0c0b8] font-light italic leading-relaxed tracking-wide">
              "{quote}"
            </p>
          </div>
          
          {/* CTA Section */}
          <div className="animate-slide-up pt-4 md:pt-8" style={{ animationDelay: '0.5s' }}>
            <button 
              onClick={onStart}
              className="group flex items-center justify-center gap-3 bg-primary hover:bg-[#d95d22] text-[#fcf9f8] px-10 py-5 rounded-full transition-all duration-300 transform hover:scale-105 shadow-lg shadow-primary/20 hover:shadow-primary/40 cursor-pointer"
            >
              <span className="text-lg md:text-xl font-bold tracking-wide">Start Learning</span>
              {/* Using Lucide ArrowRight to match functionality of Material Symbol */}
              <ArrowRight className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
          
        </div>
      </main>
      
      {/* Subtle Footer Text */}
      <footer className="absolute bottom-6 w-full text-center animate-fade-in opacity-0" style={{ animationDelay: '1s', animationFillMode: 'forwards' }}>
        <p className="text-sm text-[#8c7b72] dark:text-[#887770] font-medium tracking-wider uppercase opacity-60">Study Companion</p>
      </footer>
    </div>
  );
};
