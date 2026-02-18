import React, { useState, useRef, useEffect } from 'react';
import { Send, Heart, Coffee, Cloud, Wand2, MessageCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { runChatHugAgent } from '../services/geminiService';

type HugMode = 'emotional' | 'casual' | 'mindfulness' | 'coax' | null;

export const ChatHug: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<HugMode>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleModeSelect = async (selectedMode: HugMode) => {
    setMode(selectedMode);
    let initialText = "";
    
    // Auto-trigger first message from AI based on mode
    switch(selectedMode) {
      case 'emotional': initialText = "我想倾诉，我有点难受。"; break;
      case 'casual': initialText = "咱们随便聊聊吧，给我讲个笑话？"; break;
      case 'mindfulness': initialText = "带我做个深呼吸吧，我脑子太乱了。"; break;
      case 'coax': initialText = "我不想学了，想放弃。"; break;
    }

    setIsLoading(true);
    const userMsg: ChatMessage = { role: 'user', text: initialText, timestamp: Date.now() };
    setMessages([userMsg]);

    try {
      const response = await runChatHugAgent([], initialText, selectedMode!);
      setMessages([userMsg, { role: 'model', text: response, timestamp: Date.now() }]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !mode) return;

    const userText = input;
    setInput('');
    
    const newHistory = [...messages, { role: 'user', text: userText, timestamp: Date.now() } as ChatMessage];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      const response = await runChatHugAgent(messages, userText, mode);
      setMessages([...newHistory, { role: 'model', text: response, timestamp: Date.now() } as ChatMessage]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setMode(null);
    setInput('');
  };

  if (!mode) {
    return (
      <div className="bg-white rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden flex flex-col h-[650px] w-full max-w-lg mx-auto p-8 relative">
        <div className="absolute top-0 left-0 w-80 h-80 bg-gradient-to-br from-rose-100 to-pink-50 rounded-full mix-blend-multiply filter blur-3xl opacity-60 -translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
        
        <div className="text-center mb-10 relative z-10">
          <div className="bg-rose-50 p-4 rounded-[28px] w-24 h-24 flex items-center justify-center mx-auto mb-6 shadow-sm shadow-rose-100">
            <Heart className="w-12 h-12 text-rose-400 fill-rose-100" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight">Chat Hug</h2>
          <p className="text-slate-500 font-medium">不想学了没关系，选一个模式，<br/>我来陪你。</p>
        </div>

        <div className="grid grid-cols-1 gap-4 relative z-10 overflow-y-auto pr-2 custom-scrollbar pb-4">
          <button onClick={() => handleModeSelect('emotional')} className="p-5 bg-white hover:bg-rose-50 rounded-[28px] border border-stone-100 hover:border-rose-200 transition-all text-left flex items-center space-x-5 group shadow-sm hover:shadow-lg hover:shadow-rose-50 group">
            <div className="bg-rose-100 p-3.5 rounded-2xl group-hover:scale-110 transition-transform"><MessageCircle className="w-7 h-7 text-rose-500" /></div>
            <div>
              <div className="font-bold text-slate-700 text-lg group-hover:text-rose-600 transition-colors">情绪陪伴</div>
              <div className="text-xs text-slate-400 mt-1 font-bold">我想被理解，不要催我</div>
            </div>
          </button>

          <button onClick={() => handleModeSelect('casual')} className="p-5 bg-white hover:bg-orange-50 rounded-[28px] border border-stone-100 hover:border-orange-200 transition-all text-left flex items-center space-x-5 group shadow-sm hover:shadow-lg hover:shadow-orange-50 group">
            <div className="bg-orange-100 p-3.5 rounded-2xl group-hover:scale-110 transition-transform"><Coffee className="w-7 h-7 text-orange-500" /></div>
            <div>
              <div className="font-bold text-slate-700 text-lg group-hover:text-orange-600 transition-colors">随便聊聊</div>
              <div className="text-xs text-slate-400 mt-1 font-bold">扯淡、八卦、放松一下</div>
            </div>
          </button>

          <button onClick={() => handleModeSelect('mindfulness')} className="p-5 bg-white hover:bg-sky-50 rounded-[28px] border border-stone-100 hover:border-sky-200 transition-all text-left flex items-center space-x-5 group shadow-sm hover:shadow-lg hover:shadow-sky-50 group">
            <div className="bg-sky-100 p-3.5 rounded-2xl group-hover:scale-110 transition-transform"><Cloud className="w-7 h-7 text-sky-500" /></div>
            <div>
              <div className="font-bold text-slate-700 text-lg group-hover:text-sky-600 transition-colors">正念暂停</div>
              <div className="text-xs text-slate-400 mt-1 font-bold">静静坐一分钟，只呼吸</div>
            </div>
          </button>

          <button onClick={() => handleModeSelect('coax')} className="p-5 bg-white hover:bg-violet-50 rounded-[28px] border border-stone-100 hover:border-violet-200 transition-all text-left flex items-center space-x-5 group shadow-sm hover:shadow-lg hover:shadow-violet-50 group">
            <div className="bg-violet-100 p-3.5 rounded-2xl group-hover:scale-110 transition-transform"><Wand2 className="w-7 h-7 text-violet-500" /></div>
            <div>
              <div className="font-bold text-slate-700 text-lg group-hover:text-violet-600 transition-colors">哄哄我回去</div>
              <div className="text-xs text-slate-400 mt-1 font-bold">温柔地给我一点力量</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden flex flex-col h-[650px] w-full max-w-lg mx-auto relative">
      {/* Header */}
      <div className={`p-6 border-b border-white/50 flex justify-between items-center transition-colors relative z-10 ${
        mode === 'emotional' ? 'bg-rose-50' :
        mode === 'casual' ? 'bg-orange-50' :
        mode === 'mindfulness' ? 'bg-sky-50' : 'bg-violet-50'
      }`}>
        <div className="flex items-center space-x-3">
           <div className="bg-white/60 p-2 rounded-2xl backdrop-blur-sm">
            {mode === 'emotional' && <MessageCircle className="w-6 h-6 text-rose-500" />}
            {mode === 'casual' && <Coffee className="w-6 h-6 text-orange-500" />}
            {mode === 'mindfulness' && <Cloud className="w-6 h-6 text-sky-500" />}
            {mode === 'coax' && <Wand2 className="w-6 h-6 text-violet-500" />}
           </div>
           <span className="font-bold text-slate-700 text-lg">Chat Hug</span>
        </div>
        <button onClick={resetChat} className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white/60 px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors">结束对话</button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 bg-white space-y-6 custom-scrollbar pb-24 relative z-0">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded-3xl px-5 py-3.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-slate-800 text-white rounded-br-none shadow-slate-200' 
                  : 'bg-stone-50 text-slate-700 border border-stone-100 rounded-bl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-stone-50 border border-stone-100 rounded-3xl rounded-bl-none px-5 py-4 shadow-sm">
               <div className="flex space-x-1.5">
                 <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-150"></div>
                 <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-300"></div>
               </div>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-5 bg-white border-t border-stone-50 absolute bottom-0 w-full z-20 backdrop-blur-md bg-white/90">
        <div className="flex items-center space-x-2 relative bg-stone-50 p-1.5 rounded-[24px] border border-stone-100 focus-within:ring-2 focus-within:ring-stone-200 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="说点什么..."
            className="flex-1 bg-transparent border-0 px-4 py-2 text-sm focus:ring-0 focus:outline-none text-slate-700 placeholder:text-stone-400"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-slate-200"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};