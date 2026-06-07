import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Send, Square, ImagePlus, X, MessageCircle } from 'lucide-react';
import type { ChatMessage, DocType } from '@/types';
import { chatWithSkimAdaptiveTutor } from '@/services/geminiService';
import { getMessageImages } from '@/lib/chat/messageUtils';
import { readFileAsDataURL } from '@/lib/pdf/pdfUtils';

/**
 * 私教模式纯对话组件（阶段 3：受控版）。
 *
 * 设计要点：
 * - 纯对话单栏，**零略读元素**（无模块数 / 节奏 / 页码 / study map / stage / quiz）。
 * - 开场白「想学什么呀~」由 App 在新建会话时预置进 messages[0]（不走 API、不耗 token）。
 * - **放宽「无文档不可发」的 guard**：有文字输入 OR 有待发图片即可发送，不要求文档内容。
 * - 仅调用现成的 `chatWithSkimAdaptiveTutor`（mode 固定 'tutoring'、readingOptions 传 undefined）。
 * - **受控组件**：messages 读写走 App 传入的 props（按 id 定位会话，防跨 session 污染）；
 *   组件只本地自管 input / isChatLoading / pendingImages / abort。
 */

/** 前端预置开场白：纯 UI，不进 API history。App 新建会话时塞进 messages[0]，本组件发送时按此剔除。 */
export const TUTOR_OPENING_TEXT = '想学什么呀~';

/** 与 SkimPanel 同款气泡 markdown 样式（参照搬运，避免耦合改 SkimPanel） */
const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-slate-800 mt-5 mb-3 border-b border-stone-100 pb-2" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-base font-bold text-indigo-700 mt-4 mb-2" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-5 space-y-2 my-2 text-slate-700" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-5 space-y-2 my-2 text-slate-700" {...props} />,
  li: ({ node, ...props }) => <li className="pl-1 leading-relaxed" {...props} />,
  p: ({ node, ...props }) => <p className="mb-3 leading-7 text-slate-700" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-indigo-900 bg-indigo-50 px-1 rounded" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-indigo-300 pl-4 py-1 my-4 bg-stone-50 italic text-slate-600 rounded-r-lg" {...props} />,
  table: ({ node, ...props }) => (
    <div className="my-6 w-full overflow-x-auto rounded-xl border border-stone-200 shadow-sm bg-white">
      <table className="w-full text-left text-sm text-stone-600" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-stone-100 text-stone-700 font-bold uppercase tracking-wider text-xs" {...props} />,
  th: ({ node, ...props }) => <th className="px-4 py-3 border-b border-stone-200 whitespace-nowrap" {...props} />,
  td: ({ node, ...props }) => <td className="px-4 py-3 border-b border-stone-100 last:border-0" {...props} />,
  tr: ({ node, ...props }) => <tr className="hover:bg-stone-50/50 transition-colors" {...props} />,
};

export interface TutorChatProps {
  /** 受控：当前激活私教会话的消息（含 messages[0] 开场白） */
  messages: ChatMessage[];
  /** 受控：写回 App 的 tutorSessions（App 按 id 定位会话更新） */
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  /** 会话 docType，缺省 'STEM' */
  docType?: DocType;
  /** 本地 isChatLoading 上抛，供 App 标签栏「生成中锁切换」 */
  onLoadingChange?: (loading: boolean) => void;
  /**
   * STOP-2 ①：本会话对应 PDF 的 dataURL，由 App 解析后传入（活动会话=当前内存 pdfDataUrl；
   * 恢复会话=凭 cloudSessionId 重取）。每轮作 content 喂 AI（PDF vision），与略读完全一致。
   * 缺省 '' = 纯对话（无文件 / 取不到）。
   */
  materialContent?: string;
}

export const TutorChat: React.FC<TutorChatProps> = ({
  messages,
  setMessages,
  docType = 'STEM',
  onLoadingChange,
  materialContent = '',
}) => {
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const generationCancelledRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 新消息 / loading 变化时滚到底
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  // 上抛 loading 给 App（标签栏锁切换）
  useEffect(() => {
    onLoadingChange?.(isChatLoading);
  }, [isChatLoading, onLoadingChange]);
  // 卸载（如返回退出私教）时复位 loading 标志，避免标签栏残留锁定
  useEffect(() => () => onLoadingChange?.(false), [onLoadingChange]);

  /** 选图（参照 SkimPanel.handleImageSelect） */
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const dataURLs = await Promise.all(Array.from(files).map((file) => readFileAsDataURL(file)));
      setPendingImages((prev) => [...prev, ...dataURLs]);
    } catch (err) {
      console.error('Failed to read image(s):', err);
    } finally {
      e.target.value = '';
    }
  };

  /** 粘贴图片（参照 SkimPanel.handlePaste） */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    Promise.all(imageFiles.map((file) => readFileAsDataURL(file)))
      .then((dataUrls) => setPendingImages((prev) => [...prev, ...dataUrls]))
      .catch((err) => console.error('Failed to read pasted image(s):', err));
  };

  /** 中断生成（参照 SkimPanel.handleStopSkimChat） */
  const handleStop = () => {
    generationCancelledRef.current = true;
    abortControllerRef.current?.abort();
    setIsChatLoading(false);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    // 🔴 放宽 guard：无文档也可发；有文字 OR 有待发图片即可。不要求文档内容。
    if ((!trimmed && pendingImages.length === 0) || isChatLoading) return;

    // history = 已交换的真实轮次，剔除纯前端开场白（不把这条假 model 句喂给 API）
    const history =
      messages[0]?.role === 'model' && messages[0]?.text === TUTOR_OPENING_TEXT
        ? messages.slice(1)
        : messages;

    const userMsg: ChatMessage = {
      role: 'user',
      text: trimmed,
      ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
      timestamp: Date.now(),
    };
    const imagesToSend = pendingImages; // 快照「清空前」的图，确保本轮 AI 看得到
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (chatInputRef.current) chatInputRef.current.style.height = 'auto';
    setPendingImages([]);

    generationCancelledRef.current = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsChatLoading(true);

    try {
      const response = await chatWithSkimAdaptiveTutor(
        materialContent, // STOP-2 ①：本会话 PDF 的 dataURL（vision），与略读 content=pdfDataUrl 一致；'' 时纯对话
        history,
        trimmed,
        'tutoring', // tutor 固定 tutoring
        docType, // 会话 docType（默认 'STEM'）
        undefined, // readingOptions：tutoring 模式零依赖
        abortController.signal,
        imagesToSend,
      );
      if (abortController.signal.aborted || generationCancelledRef.current) return;
      setMessages((prev) => [...prev, { role: 'model', text: response, timestamp: Date.now() }]);
    } catch (e) {
      if (abortController.signal.aborted || generationCancelledRef.current) return;
      const isAbort =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError');
      if (isAbort) return;
      console.error(e);
    } finally {
      setIsChatLoading(false);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶栏：标题（返回略读靠点上方略读标签，无需独立返回键） */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 shrink-0">
        <div className="p-1.5 rounded-lg bg-violet-100 text-violet-600">
          <MessageCircle className="w-4 h-4" />
        </div>
        <span className="text-sm font-bold text-slate-700">私教模式</span>
      </div>

      {/* 消息列表 */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-white">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`relative max-w-[90%] px-4 py-3 text-sm shadow-sm transition-all ${
                msg.role === 'user'
                  ? 'bg-amber-100 text-amber-900 rounded-2xl rounded-tr-none'
                  : 'bg-stone-50 text-slate-700 border border-stone-100 rounded-2xl rounded-tl-none'
              }`}
            >
              {getMessageImages(msg).map((img, imgIdx) => (
                <img key={imgIdx} src={img} alt="用户上传" className="max-w-full rounded-lg mb-2" />
              ))}
              {msg.text && (
                <ReactMarkdown
                  components={MarkdownComponents}
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                  className={msg.role === 'user' ? 'prose-invert' : ''}
                >
                  {msg.text}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-stone-50 border border-stone-100 rounded-2xl rounded-tl-none p-3 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="p-4 border-t border-stone-50 bg-white shrink-0 space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />

        {/* 待发图片预览 */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative">
                <img src={img} alt={`待发送图片 ${idx + 1}`} className="max-h-24 rounded-lg border border-stone-200" />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                  title="移除图片"
                  aria-label="移除图片"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2 bg-stone-50 p-1.5 rounded-full border border-stone-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <textarea
            ref={chatInputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={handlePaste}
            placeholder="想学什么、想聊什么都行…"
            className="flex-1 bg-transparent border-0 px-4 py-1.5 text-sm focus:ring-0 focus:outline-none text-slate-700 placeholder:text-stone-400 resize-none overflow-y-auto max-h-[120px]"
            disabled={isChatLoading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isChatLoading}
            title="添加图片"
            aria-label="添加图片"
            className="p-2 text-stone-500 hover:text-amber-700 hover:bg-stone-100 disabled:opacity-40 rounded-full transition-colors shrink-0"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          {isChatLoading ? (
            <button
              type="button"
              onClick={handleStop}
              title="停止生成"
              className="p-2 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-all shadow-md flex items-center gap-1 px-3"
            >
              <Square className="w-3 h-3 fill-current" />
              <span className="text-xs font-bold">停止</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() && pendingImages.length === 0}
              className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorChat;
