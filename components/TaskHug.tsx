import React, { useState, useEffect, useRef } from 'react';
import { Zap, ArrowRight, CheckCircle2, Circle, Play, Pause, RotateCcw, Sparkles, Send } from 'lucide-react';
import { runTaskHugAgent, runTaskHugChat, TaskHugResponse } from '../services/geminiService';
import { ChatMessage } from '../types';

export const TaskHug: React.FC = () => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState<TaskHugResponse | null>(null);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes default
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    let interval: number;
    if (isTimerActive && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timeLeft]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, plan]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input;
    setInput('');
    setIsLoading(true);

    // Add user message to UI immediately
    const userMsg: ChatMessage = { role: 'user', text: userText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      if (!plan) {
        // Mode 1: Initial Breakdown (Agent)
        const result = await runTaskHugAgent(userText);
        setPlan(result);
        setCompletedSteps(new Array(result.steps.length).fill(false));
        setTimeLeft(120);
        
        // Add AI response from the JSON
        const aiMsg: ChatMessage = { role: 'model', text: result.message, timestamp: Date.now() };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        // Mode 2: Ongoing Chat (Chat)
        const responseText = await runTaskHugChat(messages, userText, plan.steps);
        const aiMsg: ChatMessage = { role: 'model', text: responseText, timestamp: Date.now() };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (e) {
      console.error(e);
      // Optional: Add error message to chat
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStep = (index: number) => {
    const newSteps = [...completedSteps];
    newSteps[index] = !newSteps[index];
    setCompletedSteps(newSteps);
  };

  const reset = () => {
    setPlan(null);
    setInput('');
    setCompletedSteps([]);
    setMessages([]);
    setIsTimerActive(false);
    setTimeLeft(120);
  };

  const allDone = completedSteps.length > 0 && completedSteps.every(Boolean);

  return (
    <div className="bg-white rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden flex flex-col h-[650px] w-full max-w-lg mx-auto relative group">
      {/* Decorative gradient blob */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-full mix-blend-multiply filter blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>

      {/* Header */}
      <div className="p-8 pb-4 relative z-10 flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600 shadow-sm">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Task Hug</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">微启动助手</p>
          </div>
        </div>
        {plan && (
             <button onClick={reset} className="text-xs font-bold text-slate-300 hover:text-rose-400 transition-colors px-3 py-1.5 bg-stone-50 rounded-full">
                 结束目标
             </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4 relative z-10 custom-scrollbar flex flex-col">
        {!plan && messages.length === 0 ? (
          // Empty State
          <div className="flex-1 flex flex-col justify-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="space-y-4">
               <h3 className="text-3xl font-bold text-slate-700 leading-tight">
                 今天想做什么？<br/>
                 <span className="text-lg font-medium text-slate-400">不用太宏大，告诉我第一步就好。</span>
               </h3>
             </div>

             {/* Pre-canned options */}
             <div className="grid gap-4">
                 <button onClick={() => setInput("想看完 Lecture 8，但完全不想动...")} className="text-left p-4 rounded-3xl border border-stone-100 bg-stone-50 hover:bg-white hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all text-sm text-slate-600 font-medium group">
                     "想看完 Lecture 8，但完全不想动..."
                     <ArrowRight className="w-4 h-4 inline-block ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                 </button>
                 <button onClick={() => setInput("好多页没看，感觉压力好大...")} className="text-left p-4 rounded-3xl border border-stone-100 bg-stone-50 hover:bg-white hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all text-sm text-slate-600 font-medium group">
                     "好多页没看，感觉压力好大..."
                     <ArrowRight className="w-4 h-4 inline-block ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                 </button>
             </div>
          </div>
        ) : (
          // Active Chat + Dashboard State
          <div className="space-y-6 pb-20">
            
            {/* 1. Dashboard Widget (Pinned at top of content flow) */}
            {plan && (
                <div className="bg-white rounded-3xl border border-stone-100 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] p-5 space-y-5 animate-in fade-in slide-in-from-top-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-300 to-teal-300"></div>
                    
                    {/* Progress Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-dashed border-stone-100">
                        <div className="flex items-center space-x-2 text-sm font-bold text-slate-700">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                            <span>微行动清单</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">{completedSteps.filter(Boolean).length}/{plan.steps.length}</span>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                        {plan.steps.map((step, idx) => (
                        <button
                            key={idx}
                            onClick={() => toggleStep(idx)}
                            className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-start space-x-3 text-sm font-medium ${
                            completedSteps[idx] 
                                ? 'bg-stone-50 text-stone-400 line-through decoration-stone-300' 
                                : 'bg-white border border-stone-100 hover:border-emerald-200 hover:shadow-sm text-slate-700'
                            }`}
                        >
                            <div className={`mt-0.5 flex-shrink-0 transition-colors ${completedSteps[idx] ? 'text-emerald-400' : 'text-stone-300'}`}>
                            {completedSteps[idx] ? <CheckCircle2 className="w-5 h-5 fill-emerald-100" /> : <Circle className="w-5 h-5" />}
                            </div>
                            <span>{step}</span>
                        </button>
                        ))}
                    </div>

                    {/* Timer Widget */}
                    <div className="bg-slate-800 rounded-2xl p-4 text-white flex items-center justify-between shadow-lg shadow-slate-200">
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">专注计时</div>
                            <div className="text-2xl font-mono font-bold tracking-widest text-emerald-300">{formatTime(timeLeft)}</div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button 
                                onClick={() => {
                                    setTimeLeft(120);
                                    setIsTimerActive(false);
                                }}
                                className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => setIsTimerActive(!isTimerActive)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
                                    isTimerActive ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-900/30' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-900/30'
                                }`}
                            >
                                {isTimerActive ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                            </button>
                        </div>
                    </div>
                    
                    {allDone && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in z-20">
                             <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2 animate-bounce">
                                <Sparkles className="w-8 h-8 text-emerald-500" />
                             </div>
                            <div className="text-center text-sm text-emerald-600 font-bold">
                                🎉 太棒了！第一步已经完成！
                            </div>
                            <button onClick={reset} className="mt-4 px-6 py-2 bg-emerald-500 text-white rounded-full text-sm font-bold shadow-lg shadow-emerald-200 hover:scale-105 transition-transform">
                                下一个目标
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 2. Chat Stream */}
            <div className="space-y-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div 
                        className={`max-w-[85%] rounded-3xl px-5 py-3.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === 'user' 
                            ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-br-none shadow-emerald-100' 
                            : 'bg-white text-slate-700 border border-stone-100 rounded-bl-none shadow-stone-100'
                        }`}
                        >
                        {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-stone-100 rounded-3xl rounded-bl-none px-5 py-4 shadow-sm">
                            <div className="flex space-x-1.5">
                                <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce delay-150"></div>
                                <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce delay-300"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-5 bg-white border-t border-stone-50 z-20 absolute bottom-0 w-full backdrop-blur-md bg-white/90">
        <div className="flex items-center space-x-2 relative bg-stone-50 p-1.5 rounded-[24px] border border-stone-100 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={plan ? "还可以跟我聊聊你的进度..." : "输入你的目标..."}
            className="flex-1 bg-transparent border-0 px-4 py-2 text-sm focus:ring-0 focus:outline-none text-slate-700 placeholder:text-stone-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-800 transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};