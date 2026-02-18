
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, MessageCircle, Play, Undo2, Sparkles, FileText, History } from 'lucide-react';
import { ChatMessage, Slide, PersonaSettings } from '../types';
import { generateRemStoryScript } from '../services/geminiService';

interface GalgameOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  slide: Slide | undefined;
  slides: Slide[]; // NEW: Receive all slides for context
  onNextSlide: () => void;
  onPrevSlide: () => void;
  chatHistory: ChatMessage[]; 
  onSendChat: (text: string) => void;
  isLoading: boolean; 
  fullText?: string | null;
  customAvatarUrl?: string | null; // Custom Avatar
  customBackgroundUrl?: string | null; // Custom Background
  personaSettings?: PersonaSettings; // Pass Persona Data
}

// REM ASSETS
// Default Background: Calm magical library
const DEFAULT_BACKGROUND_URL = "https://images.unsplash.com/photo-1507842217153-e21f40668bc9?q=80&w=2000&auto=format&fit=crop";
// Default Character: Generic Anime Girl
const DEFAULT_CHARACTER_URL = "https://aistudiocdn.com/anime-girl-blue-hair-maid.png"; 

export const GalgameOverlay: React.FC<GalgameOverlayProps> = ({
  isVisible,
  onClose,
  slide,
  slides,
  onNextSlide,
  onPrevSlide,
  fullText,
  customAvatarUrl,
  customBackgroundUrl,
  personaSettings
}) => {
  // --- STATE ---
  const [dialogueQueue, setDialogueQueue] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isScriptLoading, setIsScriptLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  
  // Feature: Summary Modal
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  
  // Display State
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typeIntervalRef = useRef<number | null>(null);

  // Defaults if no persona settings passed
  const charName = personaSettings?.charName || "AI 助教";

  // --- INITIALIZATION: FULL TEXT STORY GENERATION ---
  useEffect(() => {
    const initStory = async () => {
        // Trigger if visible, not loaded, and we have EITHER text OR slides (Vision)
        const hasContent = fullText || (slides && slides.length > 0);

        if (isVisible && !hasLoadedOnce && hasContent) {
            setIsScriptLoading(true);
            try {
                // Call the new service to generate the linear script
                // Pass fullText AND the slide images for Vision support
                // Pass persona settings to customize the voice
                const slideImages = slides.map(s => s.imageUrl);
                const script = await generateRemStoryScript(fullText || "", slideImages, personaSettings);
                setDialogueQueue(script);
                setCurrentLineIndex(0);
                setHasLoadedOnce(true);
            } catch (e) {
                console.error("Story generation failed", e);
                setDialogueQueue([`(${charName}低头) 对不起，${charName}好像没有看懂这本书...`]);
            } finally {
                setIsScriptLoading(false);
            }
        } else if (isVisible && !hasContent && !hasLoadedOnce) {
            // No text and no images available
             setDialogueQueue([`(${charName}疑惑) 诶？这本书好像是空白的呢？`]);
             setHasLoadedOnce(true);
        }
    };

    initStory();
  }, [isVisible, fullText, slides, hasLoadedOnce, personaSettings, charName]);

  // --- TYPING EFFECT ---
  useEffect(() => {
    // If loading, show nothing or loading text handled in render
    if (isScriptLoading) return;

    const currentFullText = dialogueQueue[currentLineIndex] || "";
    
    if (currentFullText) {
      setDisplayedText('');
      setIsTyping(true);
      let charIndex = 0;

      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);

      typeIntervalRef.current = window.setInterval(() => {
        setDisplayedText(prev => {
           if (charIndex >= currentFullText.length) return prev;
           return currentFullText.slice(0, charIndex + 1);
        });
        
        charIndex++;
        if (charIndex >= currentFullText.length) {
          setIsTyping(false);
          if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
        }
      }, 35); // Typing speed
    } else {
      setDisplayedText("");
      setIsTyping(false);
    }

    return () => {
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
    };
  }, [currentLineIndex, dialogueQueue, isScriptLoading]);

  // --- INTERACTION: ADVANCE OR SKIP ---
  const handleInteraction = () => {
    if (isScriptLoading) return;

    if (isTyping) {
      // 1. Instant complete
      if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
      setDisplayedText(dialogueQueue[currentLineIndex]);
      setIsTyping(false);
    } else {
      // 2. Next Line
      if (currentLineIndex < dialogueQueue.length - 1) {
        setCurrentLineIndex(prev => prev + 1);
      } else {
        // End of story, maybe loop or show "End"
      }
    }
  };

  const handleBack = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (currentLineIndex > 0) {
          if (typeIntervalRef.current) clearInterval(typeIntervalRef.current);
          setIsTyping(false);
          setCurrentLineIndex(prev => prev - 1);
      }
  };

  // --- EXIT HANDLER (Critical Fix) ---
  const handleExit = (e: React.MouseEvent) => {
      e.stopPropagation(); // Stop event bubbling to the container
      e.preventDefault();
      onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9990] bg-black text-white font-sans overflow-hidden select-none">
      
      {/* 1. Background Layer (FIX: Removed blur) */}
      <div className="absolute inset-0 z-0">
        <img 
            src={customBackgroundUrl || DEFAULT_BACKGROUND_URL} 
            alt="Background" 
            className="w-full h-full object-cover opacity-90 transform scale-105 transition-opacity duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/10 to-slate-900/40"></div>
      </div>

      {/* 2. Character Layer (FIX: Added mix-blend-multiply to remove white box) */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 h-[85vh] w-full flex justify-center items-end pointer-events-none">
         <img 
            src={customAvatarUrl || DEFAULT_CHARACTER_URL}
            alt="Character" 
            className={`h-full w-auto object-contain drop-shadow-[0_0_25px_rgba(100,181,246,0.3)] transition-transform duration-200 mix-blend-multiply ${isTyping ? 'animate-speaking-shake' : ''}`}
         />
      </div>

      {/* 3. Slide Mini-Map (Context Awareness) */}
      {slide && (
        <div className="absolute top-6 left-6 z-20 w-48 opacity-50 hover:opacity-100 transition-opacity bg-black/50 p-1 rounded-lg backdrop-blur-sm">
            <img src={slide.imageUrl} className="w-full rounded border border-white/20" alt="Context" />
        </div>
      )}

      {/* 4. EXIT BUTTON (Highest Priority) */}
      <button 
        onClick={handleExit}
        className="absolute top-6 right-6 z-[9999] px-6 py-2 bg-rose-500/20 hover:bg-rose-600/80 backdrop-blur-md border border-rose-500/50 rounded-full text-sm font-bold tracking-widest transition-all hover:scale-105 shadow-[0_0_15px_rgba(225,29,72,0.5)] cursor-pointer flex items-center gap-2"
      >
         <X className="w-4 h-4" />
         <span>退出伴读</span>
      </button>

      {/* 5. SUMMARY MODAL (New Feature) */}
      {isSummaryOpen && (
        <div 
            className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={(e) => { e.stopPropagation(); setIsSummaryOpen(false); }}
        >
            <div 
                className="bg-slate-900/90 border border-white/20 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div className="flex items-center space-x-3 text-white">
                        <div className="bg-[#4EA8DE] p-2 rounded-xl text-white shadow-lg shadow-[#4EA8DE]/20">
                            <History className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold tracking-wide">对话回顾</h3>
                            <p className="text-xs text-white/50">{charName} 的讲解记录</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsSummaryOpen(false)} 
                        className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {dialogueQueue.map((line, idx) => (
                        <div key={idx} className="flex gap-4 group">
                            <div className="min-w-[28px] h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/50 font-mono mt-0.5 group-hover:bg-[#4EA8DE] group-hover:text-white transition-colors">
                                {(idx + 1).toString()}
                            </div>
                            <div className="text-white/90 text-sm leading-relaxed tracking-wide pt-1">
                                {line}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* 6. Dialogue Box Layer (Clickable Area) */}
      <div 
        onClick={handleInteraction}
        className="absolute inset-0 z-[9900] flex flex-col justify-end pb-12 items-center cursor-pointer"
      >
          {/* Name Tag (Dynamic Name) */}
          <div className="w-[90%] max-w-5xl flex justify-start mb-[-2px] relative z-20 ml-10">
              <div className="bg-[#4EA8DE] text-white px-10 py-1.5 rounded-t-2xl font-bold text-xl tracking-widest transform -skew-x-12 shadow-[0_-4px_20px_rgba(78,168,222,0.4)] border-t border-l border-white/20">
                  {charName}
              </div>
          </div>
          
          {/* Main Box */}
          <div 
            className="bg-slate-900/85 backdrop-blur-xl border-2 border-[#4EA8DE]/50 rounded-3xl rounded-tl-none p-8 h-52 w-[90%] max-w-5xl shadow-[0_0_60px_rgba(78,168,222,0.15)] relative overflow-hidden group transition-all"
          >
              {/* Decorative Magic Circle Elements */}
              <div className="absolute -right-10 -bottom-10 w-40 h-40 border-[1px] border-white/5 rounded-full animate-spin-slow opacity-50"></div>
              
              {isScriptLoading ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                      <div className="flex items-center space-x-2 text-[#4EA8DE] animate-pulse">
                         <Sparkles className="w-6 h-6" />
                         {/* Dynamic Loading Text */}
                         <span className="text-lg font-bold tracking-widest">{charName}正在阅读全书...</span>
                      </div>
                      <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#4EA8DE] animate-progress w-full origin-left"></div>
                      </div>
                      <p className="text-xs text-white/40 font-mono">PROCESSING FULL TEXT CONTEXT...</p>
                  </div>
              ) : (
                  <div className="text-xl md:text-2xl leading-relaxed font-medium text-white/95 drop-shadow-md relative h-full font-serif flex items-start">
                      <span className="flex-1">{displayedText}</span>
                      
                      {/* Next Indicator */}
                      {!isTyping && currentLineIndex < dialogueQueue.length - 1 && (
                         <span className="absolute bottom-0 right-0 animate-bounce text-[#4EA8DE] text-2xl">▼</span>
                      )}
                      
                      {/* End Indicator & Summary Button */}
                      {!isTyping && currentLineIndex === dialogueQueue.length - 1 && (
                         <div className="absolute bottom-0 right-0 flex items-center space-x-4 animate-in slide-in-from-bottom-2 duration-500">
                             <div className="flex items-center space-x-2 text-[#4EA8DE] opacity-80">
                                 <span className="text-sm font-bold">讲解结束</span>
                                 <div className="w-2 h-2 bg-[#4EA8DE] rounded-full animate-pulse"></div>
                             </div>
                             
                             <button
                                onClick={(e) => { e.stopPropagation(); setIsSummaryOpen(true); }}
                                className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-[#4EA8DE] text-white border border-white/20 rounded-full transition-all shadow-lg hover:shadow-[#4EA8DE]/50 group"
                             >
                                 <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                 <span className="text-xs font-bold tracking-widest">📝 总结对话</span>
                             </button>
                         </div>
                      )}
                  </div>
              )}

              {/* BACK BUTTON (Only if > 0) */}
              {!isScriptLoading && currentLineIndex > 0 && (
                  <button 
                    onClick={handleBack}
                    className="absolute top-4 right-4 p-2 text-white/20 hover:text-[#4EA8DE] hover:bg-white/5 rounded-full transition-all"
                    title="上一句"
                  >
                      <Undo2 className="w-5 h-5" />
                  </button>
              )}
          </div>
          
          {/* Interaction Prompt (Subtle) */}
          {!isScriptLoading && (
            <div className="mt-4 text-white/30 text-xs font-bold tracking-[0.2em] animate-pulse">
                CLICK TO CONTINUE
            </div>
          )}
      </div>
    </div>
  );
};
