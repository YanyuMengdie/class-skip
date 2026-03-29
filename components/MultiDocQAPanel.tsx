import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, Send, MessageCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { multiDocQAReply } from '../services/geminiService';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-2 border-b border-stone-200 first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-base font-bold text-slate-800 mt-3 mb-2 px-2 py-1.5 rounded-lg bg-stone-100" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-slate-700 mt-2 mb-1" {...props} />,
  p: ({ node, ...props }) => <p className="mb-2 leading-6 text-slate-700 text-sm" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-slate-800" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-stone-300 pl-3 py-1 my-2 text-slate-600 text-sm" {...props} />,
  code: ({ node, ...props }) => <code className="bg-stone-100 text-slate-700 px-1 py-0.5 rounded text-xs font-mono" {...props} />
};

const MULTI_DOC_QA_STORAGE_PREFIX = 'multiDocQA-';

export function getMultiDocQAConversationKey(docLabel: string, fileNames: string[] | null): string {
  if (fileNames && fileNames.length > 0) return [...fileNames].sort().join('|');
  return docLabel || 'default';
}

export function loadMultiDocQAMessages(conversationKey: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${MULTI_DOC_QA_STORAGE_PREFIX}${conversationKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMultiDocQAMessages(conversationKey: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(`${MULTI_DOC_QA_STORAGE_PREFIX}${conversationKey}`, JSON.stringify(messages));
  } catch (e) {
    console.warn('saveMultiDocQAMessages failed', e);
  }
}

interface MultiDocQAPanelProps {
  onClose: () => void;
  docContent: string;
  docLabel: string;
  /** 当前对话唯一键（同一组文档复用同一对话） */
  conversationKey: string;
  /** 初始消息（从本地恢复） */
  initialMessages: ChatMessage[];
  /** 对话更新时回调，用于持久化 */
  onMessagesChange: (messages: ChatMessage[]) => void;
}

export const MultiDocQAPanel: React.FC<MultiDocQAPanelProps> = ({
  onClose,
  docContent,
  docLabel,
  conversationKey,
  initialMessages,
  onMessagesChange
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [conversationKey, initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const persist = (next: ChatMessage[]) => {
    setMessages(next);
    onMessagesChange(next);
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || loading || !docContent?.trim()) return;

    setInputValue('');
    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    const next = [...messages, userMsg];
    persist(next);
    setLoading(true);

    try {
      const reply = await multiDocQAReply(docContent, docLabel, next, text);
      const modelMsg: ChatMessage = { role: 'model', text: reply, timestamp: Date.now() };
      persist([...next, modelMsg]);
    } catch {
      const errMsg: ChatMessage = { role: 'model', text: '抱歉，回答时遇到问题，请稍后重试。', timestamp: Date.now() };
      persist([...next, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = !docContent?.trim();

  return (
    <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in fade-in duration-200">
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/80">
        <div className="flex items-center gap-3 min-w-0">
          <MessageCircle className="w-6 h-6 text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-slate-800 text-xl">多文档问答</h1>
            <p className="text-sm text-slate-500 truncate">基于 {docLabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 rounded-xl hover:bg-stone-200 text-stone-500 hover:text-slate-700 transition-colors shrink-0"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {isEmpty ? (
          <p className="text-slate-500 text-sm text-center py-12">暂无文档内容，请先选择要复习的文档。</p>
        ) : messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-12">输入问题，我会根据文档内容回答。再次打开相同文档时会恢复本对话。</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={`${msg.timestamp}-${i}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-stone-100 text-slate-800 border border-stone-200'
                  }`}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm max-w-none text-inherit">
                      <ReactMarkdown
                        components={MarkdownComponents}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && (
          <div className="flex justify-start mt-4">
            <div className="rounded-2xl px-4 py-2.5 bg-stone-100 border border-stone-200 flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在回答…
            </div>
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="flex-shrink-0 p-4 border-t border-stone-200 bg-white">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="输入问题，按 Enter 发送..."
              className="flex-1 min-h-[44px] max-h-32 px-3 py-2.5 rounded-xl border border-stone-200 text-slate-700 placeholder-stone-400 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              rows={2}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !inputValue.trim()}
              className="self-end flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
