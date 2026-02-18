
import React, { useRef, useEffect, useState } from 'react';
import { X, Send, Sparkles, BookOpen, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { ChatMessage } from '../types';

interface SideQuestPanelProps {
  isActive: boolean;
  anchorText: string;
  messages: ChatMessage[];
  onClose: () => void;
  onSend: (text: string) => void;
  isLoading: boolean;
}

export const SideQuestPanel: React.FC<SideQuestPanelProps> = ({
  isActive,
  anchorText,
  messages,
  onClose,
  onSend,
  isLoading
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed top-20 left-4 bottom-20 w-[420px] z-[9900] flex flex-col animate-in slide-in-from-left-10 duration-500 ease-out">
        {/* Glassmorphism Container */}
        <div className="flex-1 bg-slate-900/90 backdrop-blur-2xl border border-indigo-500/30 rounded-[32px] shadow-[0_0_50px_-10px_rgba(99,102,241,0.3)] flex flex-col overflow-hidden relative">
            
            {/* Decorative Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            
            {/* Header */}
            <div className="p-5 border-b border-indigo-500/20 bg-indigo-950/30 flex justify-between items-center relative z-10 shrink-0">
                <div className="flex items-center space-x-3 text-indigo-100">
                    <div className="bg-indigo-500/20 p-2 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                        <Sparkles className="w-5 h-5 text-indigo-300" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">Side Quest</div>
                        <h3 className="font-bold text-white text-base truncate max-w-[240px]">
                            {anchorText}
                        </h3>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="p-2 text-indigo-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar relative z-10">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-indigo-300/50 space-y-4">
                        <BookOpen className="w-12 h-12 opacity-50" />
                        <p className="text-sm font-medium">正在打开真理之门...</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] px-4 py-3 text-sm leading-relaxed rounded-2xl shadow-sm ${
                                msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-slate-800/80 border border-indigo-500/20 text-indigo-50 rounded-tl-none'
                            }`}>
                                <ReactMarkdown
                                    components={{
                                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                        strong: ({node, ...props}) => <strong className="text-indigo-300 font-bold" {...props} />
                                    }}
                                    remarkPlugins={[remarkMath, remarkGfm]}
                                    rehypePlugins={[rehypeKatex]}
                                    className="prose prose-invert prose-sm max-w-none prose-p:my-1"
                                >
                                    {msg.text}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-800/80 border border-indigo-500/20 rounded-2xl rounded-tl-none p-4 shadow-sm">
                            <div className="flex space-x-1.5">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-300"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-5 border-t border-indigo-500/20 bg-indigo-950/30 shrink-0 relative z-10">
                <div className="flex items-center space-x-2 bg-slate-900/50 p-1.5 rounded-full border border-indigo-500/30 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all shadow-inner">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="在这个支线中继续探索..."
                        className="flex-1 bg-transparent border-0 px-4 py-1.5 text-sm focus:ring-0 focus:outline-none text-indigo-100 placeholder:text-indigo-400/50"
                        disabled={isLoading}
                        autoFocus
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-900/50"
                    >
                        <Send className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};
