/**
 * 递进阅读模式 — 每 module 对话框(铁律 7:视觉独立、数据全局)。
 *
 * 视觉行为(铁律 7):
 * - 默认折叠的「💬 提问」按钮,点击展开 chat 框
 * - 历史消息只显示 globalChatHistory.filter(m.askedInModuleId === moduleId)
 *
 * 数据行为(铁律 7):
 * - 用户发消息 → append 到 globalChatHistory(标 askedInModuleId = currentModuleId)
 * - 调 chatWithLayeredReadingTutor 时把**完整 globalChatHistory**(不过滤)转成 ChatMessage[] 发给 AI
 *   每条 user 消息加 [Module N: title] 前缀,让 AI 看到跨 module 上下文
 * - AI 回复后 → append 到 globalChatHistory(标 askedInModuleId = currentModuleId)
 *
 * 持久化(铁律 7):
 * - globalChatHistory 由 LayeredReadingPanel 通过 setLayeredReadingState 写入
 *   File/Cloud 持久化路径已在阶段 1 就位
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import type {
  ChatMessage,
  LayeredReadingChatMessage,
  LayeredReadingModule,
} from '@/types';
import { chatWithLayeredReadingTutor } from '@/services/geminiService';

export interface ModuleChatBoxProps {
  moduleId: string;
  /** 所有 modules,用于把 askedInModuleId 转成 [Module N: title] 前缀 */
  modules: LayeredReadingModule[];
  /** 全局对话历史(不过滤——铁律 7 数据全局) */
  globalChatHistory: LayeredReadingChatMessage[];
  /** 追加消息到全局历史 */
  onAppendChatMessage: (msg: LayeredReadingChatMessage) => void;
  /** PDF 数据源(优先 dataURL,fallback fullText) */
  fullText: string | null;
  pdfDataUrl: string | null;
}

/**
 * 把 LayeredReadingChatMessage 转成 services/geminiService 的 ChatMessage,
 * user 消息加 [Module N: storyTitle] 前缀,让 AI 看到跨 module 脉络。
 */
function buildChatMessageWithModulePrefix(
  m: LayeredReadingChatMessage,
  modules: LayeredReadingModule[]
): ChatMessage {
  if (m.role === 'user') {
    const idx = modules.findIndex((x) => x.id === m.askedInModuleId);
    const module1Based = idx >= 0 ? idx + 1 : '?';
    const title = idx >= 0 ? modules[idx].storyTitle : '?';
    return {
      role: 'user',
      text: `[Module ${module1Based}: ${title}]\n${m.content}`,
      timestamp: m.timestamp,
    };
  }
  // model 消息不加前缀(它本来就是 AI 的回答)
  return { role: 'model', text: m.content, timestamp: m.timestamp };
}

export const ModuleChatBox: React.FC<ModuleChatBoxProps> = ({
  moduleId,
  modules,
  globalChatHistory,
  onAppendChatMessage,
  fullText,
  pdfDataUrl,
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 视觉过滤:只展示当前 module 的对话(铁律 7 视觉独立) */
  const visibleMessages = useMemo(
    () => globalChatHistory.filter((m) => m.askedInModuleId === moduleId),
    [globalChatHistory, moduleId]
  );

  /** 当前 module 的对话回合数(用户问数,显示在按钮角标) */
  const userTurnCount = useMemo(
    () => visibleMessages.filter((m) => m.role === 'user').length,
    [visibleMessages]
  );

  const docSource = pdfDataUrl ?? fullText ?? '';
  const hasDoc = docSource.length > 0;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!hasDoc) {
      setError('未加载 PDF 内容,无法对话。');
      return;
    }
    setSending(true);
    setError(null);

    // 1. 构造用户消息,先 append 到全局历史(让用户立即看到自己说的)
    const now = Date.now();
    const userMsg: LayeredReadingChatMessage = {
      id: `chat-${now}-${Math.random().toString(36).slice(2, 7)}-u`,
      role: 'user',
      content: text,
      askedInModuleId: moduleId,
      timestamp: now,
    };
    onAppendChatMessage(userMsg);
    setInput('');

    // 2. 准备发给 AI 的 history(完整 globalChatHistory,不过滤;每条 user 加前缀)
    //    ⚠️ 关键:这里用的是闭包中的 globalChatHistory(不含本轮 userMsg),
    //    本轮 userMsg 通过 newMessage 参数单独传 —— 这是 chatWithLayeredReadingTutor 的契约
    const historyForApi = globalChatHistory.map((m) =>
      buildChatMessageWithModulePrefix(m, modules)
    );

    // 3. 本轮新消息也加 [Module N: title] 前缀
    const idx = modules.findIndex((x) => x.id === moduleId);
    const module1Based = idx >= 0 ? idx + 1 : '?';
    const title = idx >= 0 ? modules[idx].storyTitle : '?';
    const newMessageWithPrefix = `[Module ${module1Based}: ${title}]\n${text}`;

    try {
      const reply = await chatWithLayeredReadingTutor(
        docSource,
        historyForApi,
        newMessageWithPrefix
      );
      const aiMsg: LayeredReadingChatMessage = {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-m`,
        role: 'model',
        content: reply,
        askedInModuleId: moduleId,
        timestamp: Date.now(),
      };
      onAppendChatMessage(aiMsg);
    } catch (e) {
      console.error('ModuleChatBox handleSend', e);
      setError('对话失败,请重试。');
    } finally {
      setSending(false);
    }
  }, [
    input,
    sending,
    hasDoc,
    docSource,
    moduleId,
    modules,
    globalChatHistory,
    onAppendChatMessage,
  ]);

  return (
    <div className="border-t border-stone-100 bg-stone-50/50 mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-1.5 text-left text-xs text-slate-600 hover:text-slate-800 inline-flex items-center gap-1.5"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        <span>{open ? '收起提问' : '💬 提问'}</span>
        {userTurnCount > 0 && (
          <span className="text-[10px] text-stone-400">({userTurnCount} 轮)</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* 历史消息(仅当前 module) */}
          {visibleMessages.length === 0 ? (
            <p className="text-[11px] text-stone-400 py-1">在此 module 内提问 AI 都会记得。</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto bg-white rounded border border-stone-200 p-2">
              {visibleMessages.map((m) => (
                <div
                  key={m.id}
                  className={`text-xs ${
                    m.role === 'user' ? 'text-slate-700' : 'text-slate-600'
                  }`}
                >
                  <span className="font-bold mr-1">
                    {m.role === 'user' ? '你:' : 'AI:'}
                  </span>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              ))}
              {sending && (
                <div className="text-xs text-stone-500 inline-flex items-center gap-1.5 pt-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  AI 思考中…
                </div>
              )}
            </div>
          )}
          {/* 输入框 */}
          <div className="flex gap-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={hasDoc ? '在此 module 提问…(Enter 发送,Shift+Enter 换行)' : '未加载 PDF'}
              disabled={!hasDoc || sending}
              rows={2}
              className="flex-1 min-h-[40px] max-h-32 text-xs px-2 py-1.5 border border-stone-200 rounded bg-white resize-y disabled:bg-stone-100 disabled:text-stone-400"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!hasDoc || sending || !input.trim()}
              className="shrink-0 px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
};
