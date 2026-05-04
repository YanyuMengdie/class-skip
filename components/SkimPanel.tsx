
import React, {
  useState,
  useRef,
  useEffect,
  useDeferredValue,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { StudyMap, ChatMessage, Prerequisite, QuizData, SkimStage, DocType } from '@/types';
import { Rocket, Send, Square, PencilLine, Map, MessageCircle, Bot, AlertCircle, HelpCircle, CheckCircle2, ShieldAlert, ArrowRight, BookOpen, BrainCircuit, Lightbulb, Lock, FlaskConical, Feather, SkipForward, Move, ListChecks, ClipboardList, Loader2, ChevronDown, Upload, Trash2 } from 'lucide-react';
import { chatWithSkimAdaptiveTutor, generateGatekeeperQuiz, generateModuleTakeaways, generateModuleQuiz } from '@/services/geminiService';

interface SkimPanelProps {
  studyMap: StudyMap | null;
  isLoading: boolean;
  onSwitchToDeep: () => void;
  fullText: string | null;
  pdfDataUrl?: string | null; // NEW: Raw PDF Data
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  topHeight: number;
  setTopHeight: React.Dispatch<React.SetStateAction<number>>;
  
  // Persisted state props
  stage: SkimStage;
  setStage: (stage: SkimStage) => void;
  quizData: QuizData | null;
  setQuizData: (data: QuizData | null) => void;
  
  // Doc Type
  docType: DocType;
  onToggleDocType: () => void;

  // Note Taking
  onNotebookAdd?: (text: string, category: 'skim') => void;

  /** 按所选模块数重新生成 studyMap（知识检查通过后可选） */
  onRegenerateStudyMap?: (moduleCount: number) => Promise<void>;
  /** 当前学习地图的模块数（用于判断是否需要重新生成） */
  studyMapModuleCount?: number | null;
}

const MarkdownComponents: Components = {
    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-lg font-bold text-slate-800 mt-5 mb-3 border-b border-stone-100 pb-2" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-base font-bold text-indigo-700 mt-4 mb-2" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-2 my-2 text-slate-700" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 space-y-2 my-2 text-slate-700" {...props} />,
    li: ({node, ...props}) => <li className="pl-1 leading-relaxed" {...props} />,
    p: ({node, ...props}) => <p className="mb-3 leading-7 text-slate-700" {...props} />,
    strong: ({node, ...props}) => <strong className="font-bold text-indigo-900 bg-indigo-50 px-1 rounded" {...props} />,
    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-300 pl-4 py-1 my-4 bg-stone-50 italic text-slate-600 rounded-r-lg" {...props} />,
    // --- TABLE STYLES ---
    table: ({node, ...props}) => (
      <div className="my-6 w-full overflow-x-auto rounded-xl border border-stone-200 shadow-sm bg-white">
        <table className="w-full text-left text-sm text-stone-600" {...props} />
      </div>
    ),
    thead: ({node, ...props}) => (
      <thead className="bg-stone-100 text-stone-700 font-bold uppercase tracking-wider text-xs" {...props} />
    ),
    th: ({node, ...props}) => (
      <th className="px-4 py-3 border-b border-stone-200 whitespace-nowrap" {...props} />
    ),
    td: ({node, ...props}) => (
      <td className="px-4 py-3 border-b border-stone-100 last:border-0" {...props} />
    ),
    tr: ({node, ...props}) => (
      <tr className="hover:bg-stone-50/50 transition-colors" {...props} />
    ),
};

/** 「发给导读」时追加在草稿前传给模型；用户气泡仍仅展示草稿原文 */
const SKIM_DRAFT_GUIDE_PREFIX =
  '【请点评我对本模块的理解（不用重复全文，可指出偏差与补充）】';

/** 略读草稿预览：KaTeX 解析失败时降级为纯文本，不抛错打断输入 */
class TakeawaysDraftMarkdownPreview extends Component<
  { markdown: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidUpdate(prev: { markdown: string }) {
    if (prev.markdown !== this.props.markdown) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[TakeawaysDraftMarkdownPreview]', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 font-sans">
          {this.props.markdown}
        </pre>
      );
    }
    return (
      <ReactMarkdown
        components={MarkdownComponents}
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        className="text-xs text-slate-700"
      >
        {this.props.markdown}
      </ReactMarkdown>
    );
  }
}

export const SkimPanel: React.FC<SkimPanelProps> = ({
  studyMap,
  isLoading,
  onSwitchToDeep,
  fullText,
  pdfDataUrl,
  messages,
  setMessages,
  topHeight,
  setTopHeight,
  stage,
  setStage,
  quizData,
  setQuizData,
  docType,
  onToggleDocType,
  onNotebookAdd,
  onRegenerateStudyMap,
  studyMapModuleCount = null,
}) => {
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [localPrereqs, setLocalPrereqs] = useState<Prerequisite[]>([]);
  
  // Quiz State
  const [quizSelectedOption, setQuizSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isRegeneratingMap, setIsRegeneratingMap] = useState(false);
  const [showGranularityModal, setShowGranularityModal] = useState(false);
  const [selectedModuleCount, setSelectedModuleCount] = useState<number>(4);
  const MODULE_OPTIONS = [2, 3, 4, 5, 6, 7];

  // 本模块要点 & 模块小题（reading 阶段）
  const [moduleTakeaways, setModuleTakeaways] = useState<string[] | null>(null);
  const [moduleQuiz, setModuleQuiz] = useState<QuizData[] | null>(null);
  const [takeawaysLoading, setTakeawaysLoading] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [moduleQuizIndex, setModuleQuizIndex] = useState(0);
  const [moduleQuizSelected, setModuleQuizSelected] = useState<number | null>(null);
  const [moduleQuizSubmitted, setModuleQuizSubmitted] = useState(false);

  /** 本模块要点「自整理」草稿：按每次成功生成要点分配新键，仅存内存 */
  const nextTakeawaysDraftIdRef = useRef(0);
  const [activeTakeawaysDraftId, setActiveTakeawaysDraftId] = useState<number | null>(null);
  const [takeawaysDrafts, setTakeawaysDrafts] = useState<Record<number, string>>({});
  const [takeawaysWriteOpen, setTakeawaysWriteOpen] = useState(false);
  const [notebookDraftHint, setNotebookDraftHint] = useState(false);
  const takeawaysDraftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const draftToGuideLockRef = useRef(false);
  const notebookHintTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  /** 略读对话：取消进行中的 `chatWithSkimAdaptiveTutor`（与 `@google/genai` 的 `config.abortSignal` 对齐） */
  const skimAbortControllerRef = useRef<AbortController | null>(null);
  /** SDK 偶发在 abort 后仍 resolve 时，与 `signal.aborted` 双保险，避免误追加助手气泡 */
  const skimGenerationCancelledRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Text Selection State
  const [selectionRect, setSelectionRect] = useState<{top: number, left: number} | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const selectionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (studyMap && localPrereqs.length === 0) {
        setLocalPrereqs(studyMap.prerequisites);
    }
  }, [studyMap]);

  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  useEffect(() => {
    return () => {
      if (notebookHintTimerRef.current != null) {
        window.clearTimeout(notebookHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!takeawaysWriteOpen) return;
    const id = requestAnimationFrame(() => takeawaysDraftTextareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [takeawaysWriteOpen]);

  // --- SELECTION LOGIC (Similar to ExplanationPanel) ---
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isResizingRef.current) return;

      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
      }

      selectionTimerRef.current = window.setTimeout(() => {
        const selection = window.getSelection();
        
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          setSelectionRect(null);
          setSelectedText('');
          return;
        }

        if (containerRef.current && containerRef.current.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          if (rect.width > 0) {
              setSelectedText(selection.toString().trim());
              setSelectionRect({
                  top: rect.top - 45,
                  left: rect.left + (rect.width / 2)
              });
          }
        } else {
          setSelectionRect(null);
          setSelectedText('');
        }
      }, 150);
    };

    document.addEventListener('mouseup', handleSelectionChange);
    
    const onScroll = () => {
        if(selectionRect) setSelectionRect(null);
    };
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      window.removeEventListener('scroll', onScroll, true);
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    };
  }, [selectionRect]);

  const takeawaysDraftText =
    activeTakeawaysDraftId != null ? takeawaysDrafts[activeTakeawaysDraftId] ?? '' : '';
  const deferredTakeawaysPreview = useDeferredValue(takeawaysDraftText);

  const handleAddToNotebook = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    if (selectedText && onNotebookAdd) {
        onNotebookAdd(selectedText, 'skim');
        setSelectionRect(null);
        setSelectedText('');
        window.getSelection()?.removeAllRanges();
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'row-resize';
  };

  const onResize = (e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top;
    const newPercentage = (relativeY / containerRect.height) * 100;
    if (newPercentage > 15 && newPercentage < 85) {
      setTopHeight(newPercentage);
    }
  };

  const stopResize = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
  };

  const togglePrereq = (id: string) => {
    setLocalPrereqs(prev => prev.map(p => p.id === id ? { ...p, mastered: !p.mastered } : p));
  };

  const startAdaptiveLearning = async () => {
      // Prioritize Vision Data
      const content = pdfDataUrl || fullText;
      if (!content) return;

      const unmastered = localPrereqs.filter(p => !p.mastered);
      
      let initialPrompt = "";
      if (unmastered.length > 0) {
          setStage('tutoring');
          initialPrompt = `我已经掌握了部分基础，但以下概念我还不清楚：${unmastered.map(p => p.concept).join(', ')}。请使用费曼技巧逐一为我补课，每一项补习后请询问我是否理解清楚。注意：请先不要讲正文，只讲前置知识。`;
          await handleSend(initialPrompt, 'tutoring');
      } else {
          // If all mastered, go straight to Quiz
          triggerQuiz();
      }
  };

  const triggerQuiz = async () => {
      // Prioritize Vision Data
      const content = pdfDataUrl || fullText;
      if (!content || !studyMap) return;

      setStage('quiz');
      setQuizData(null); 
      setQuizSelectedOption(null);
      setQuizSubmitted(false);
      
      // No prompt sent to chat yet. We fetch quiz data.
      setIsChatLoading(true); 
      const data = await generateGatekeeperQuiz(content, studyMap.topic);
      setQuizData(data);
      setIsChatLoading(false);
  };

  const submitQuiz = () => {
      setQuizSubmitted(true);
  };

  const startFormalReading = async () => {
      setStage('reading');
      await handleSend(docType === 'STEM' 
          ? "前置知识已确认，请输出本文的【逻辑路线图】与【核心结构】，并开始正式带读。"
          : "请生成深度略读报告 (Deep Skim Report)。", 
      'reading', { moduleCount: selectedModuleCount, studyMapBriefing: studyMap?.initialBriefing });
  };

  const needRegenerate = onRegenerateStudyMap && (studyMapModuleCount == null || studyMapModuleCount !== selectedModuleCount);

  const handleStartWithModuleCount = async () => {
      setShowGranularityModal(false);
      if (needRegenerate) {
          setIsRegeneratingMap(true);
          await onRegenerateStudyMap?.(selectedModuleCount);
          setIsRegeneratingMap(false);
      }
      startFormalReading();
  };

  const handleSkipToReading = () => {
      if (onRegenerateStudyMap) {
          setShowGranularityModal(true);
          return;
      }
      startFormalReading();
  };

  const handleStopSkimChat = () => {
      skimGenerationCancelledRef.current = true;
      skimAbortControllerRef.current?.abort();
      setIsChatLoading(false);
  };

  /** 仅在重开正式领读上下文时清空（编辑重发/显式 readingOptions 开场） */
  const resetReadingModuleArtifacts = () => {
      setModuleTakeaways(null);
      setModuleQuiz(null);
      setModuleQuizIndex(0);
      setModuleQuizSelected(null);
      setModuleQuizSubmitted(false);
  };

  /**
   * 从任意一条 user 消息起「编辑并重发」：丢弃该条及之后所有消息，回填原文；不发请求。
   * loading 时先 `handleStopSkimChat`，避免异步仍追加 model。
   * 删除 ≥2 条时用 `window.confirm` 提示（避免误触大量删历史）。
   */
  const handleEditUserMessageAtIndex = (idx: number) => {
      if (idx < 0 || idx >= messages.length || messages[idx].role !== 'user') return;

      if (isChatLoading) {
          handleStopSkimChat();
      }

      const toDeleteCount = messages.length - idx;
      if (toDeleteCount >= 2) {
          if (!window.confirm(`将删除此后 ${toDeleteCount} 条对话，确定吗？`)) return;
      }

      const textToEdit = messages[idx].text;
      setMessages((prev) => {
          if (idx >= prev.length || prev[idx].role !== 'user') return prev;
          return prev.slice(0, idx);
      });
      resetReadingModuleArtifacts();
      setInput(textToEdit);
      requestAnimationFrame(() => {
          chatInputRef.current?.focus();
      });
  };

  const handleSend = async (
      textOverride?: string,
      forceMode?: 'tutoring' | 'reading',
      readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number },
      sendOpts?: { appendUserWhenOverride?: boolean; tutorUserText?: string }
  ) => {
      const raw = textOverride ?? input;
      const trimmed = raw.trim();
      // CRITICAL: Prioritize PDF Vision Data over Text to avoid hallucination on scanned docs
      const content = pdfDataUrl || fullText;

      if (!trimmed || !content || isChatLoading) return;

      const payloadForTutor = sendOpts?.tutorUserText ?? trimmed;

      const shouldResetReadingArtifacts = forceMode === 'reading' && readingOptions != null;
      if (shouldResetReadingArtifacts) {
        // 仅正式领读开场（携带整块 readingOptions）时重置
        resetReadingModuleArtifacts();
      }
      
      if (!textOverride) {
          const userMsg: ChatMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
          setMessages(prev => [...prev, userMsg]);
          setInput('');
      } else if (sendOpts?.appendUserWhenOverride) {
          const userMsg: ChatMessage = { role: 'user', text: trimmed, timestamp: Date.now() };
          setMessages((prev) => [...prev, userMsg]);
      }
      
      skimGenerationCancelledRef.current = false;
      const abortController = new AbortController();
      skimAbortControllerRef.current = abortController;
      setIsChatLoading(true);

      try {
          const modeToUse = forceMode || (stage === 'reading' ? 'reading' : 'tutoring');
          const skimReadingOpts =
            forceMode === 'reading' && readingOptions != null ? readingOptions : undefined;
          // Pass the content (PDF or Text) to the service; readingOptions only for reading mode
          const response = await chatWithSkimAdaptiveTutor(
            content,
            messages,
            payloadForTutor,
            modeToUse,
            docType,
            skimReadingOpts,
            abortController.signal
          );
          if (abortController.signal.aborted || skimGenerationCancelledRef.current) return;
          const aiMsg: ChatMessage = { role: 'model', text: response, timestamp: Date.now() };
          setMessages(prev => [...prev, aiMsg]);
      } catch (e) {
          if (abortController.signal.aborted || skimGenerationCancelledRef.current) return;
          const isAbort =
              e instanceof DOMException && e.name === 'AbortError'
              || (typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError');
          if (isAbort) return;
          console.error(e);
      } finally {
          setIsChatLoading(false);
          if (skimAbortControllerRef.current === abortController) {
              skimAbortControllerRef.current = null;
          }
      }
  };

  const handleShowTakeaways = async () => {
      if (messages.length === 0 || takeawaysLoading) return;
      setTakeawaysLoading(true);
      setModuleTakeaways(null);
      setModuleQuiz(null);
      try {
          const list = await generateModuleTakeaways(messages, docType);
          setModuleTakeaways(list.length > 0 ? list : ['暂无提炼要点，可继续与导读交流后重试。']);
          nextTakeawaysDraftIdRef.current += 1;
          const draftId = nextTakeawaysDraftIdRef.current;
          setTakeawaysDrafts((prev) => ({ ...prev, [draftId]: '' }));
          setActiveTakeawaysDraftId(draftId);
          setTakeawaysWriteOpen(false);
      } catch (e) {
          console.error(e);
          setModuleTakeaways(['生成失败，请重试。']);
          nextTakeawaysDraftIdRef.current += 1;
          const draftId = nextTakeawaysDraftIdRef.current;
          setTakeawaysDrafts((prev) => ({ ...prev, [draftId]: '' }));
          setActiveTakeawaysDraftId(draftId);
          setTakeawaysWriteOpen(false);
      } finally {
          setTakeawaysLoading(false);
      }
  };

  const handleGenerateModuleQuiz = async () => {
      if (quizLoading) return;
      setQuizLoading(true);
      setModuleQuiz(null);
      setModuleQuizIndex(0);
      setModuleQuizSelected(null);
      setModuleQuizSubmitted(false);
      try {
          const takeawaysText = moduleTakeaways?.join('\n');
          const items = await generateModuleQuiz(messages, takeawaysText);
          setModuleQuiz(items.length > 0 ? items : null);
      } catch (e) {
          console.error(e);
      } finally {
          setQuizLoading(false);
      }
  };

  const updateTakeawaysDraft = (value: string) => {
      if (activeTakeawaysDraftId == null) return;
      const id = activeTakeawaysDraftId;
      setTakeawaysDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const handleUploadTakeawaysDraft = () => {
      if (!onNotebookAdd || activeTakeawaysDraftId == null) return;
      const body = takeawaysDraftText.trim();
      if (!body) return;
      const topicLine = studyMap?.topic ? ` · ${studyMap.topic}` : '';
      onNotebookAdd(`【本模块自整理】${topicLine}\n${body}`, 'skim');
      setNotebookDraftHint(true);
      if (notebookHintTimerRef.current != null) {
        window.clearTimeout(notebookHintTimerRef.current);
      }
      notebookHintTimerRef.current = window.setTimeout(() => {
        setNotebookDraftHint(false);
        notebookHintTimerRef.current = null;
      }, 1500);
  };

  const handleSendDraftToGuide = async () => {
      const body = takeawaysDraftText.trim();
      if (!body || isChatLoading) return;
      if (draftToGuideLockRef.current) return;
      draftToGuideLockRef.current = true;
      try {
        const payloadForTutor = `${SKIM_DRAFT_GUIDE_PREFIX}\n\n${body}`;
        await handleSend(body, undefined, undefined, {
          appendUserWhenOverride: true,
          tutorUserText: payloadForTutor,
        });
      } finally {
        draftToGuideLockRef.current = false;
      }
  };

  const handleClearTakeawaysDraft = () => {
      if (activeTakeawaysDraftId == null) return;
      if (!window.confirm('确定清空本块自整理草稿？此操作不可撤销。')) return;
      const id = activeTakeawaysDraftId;
      setTakeawaysDrafts((prev) => ({ ...prev, [id]: '' }));
  };

  const currentModuleQuestion = moduleQuiz && moduleQuiz[moduleQuizIndex];
  const finishModuleQuiz = () => {
      setModuleQuiz(null);
      setModuleQuizIndex(0);
      setModuleQuizSelected(null);
      setModuleQuizSubmitted(false);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white border-l border-stone-100">
        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-100 to-teal-50 rounded-2xl flex items-center justify-center animate-bounce mb-6 shadow-indigo-100 shadow-lg">
           <Map className="w-8 h-8 text-indigo-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">正在扫描文档基因...</h3>
        <p className="text-sm text-slate-400 text-center max-w-[240px] leading-relaxed">正在进行预飞检查，识别前置知识与逻辑架构。</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full bg-white border-l border-stone-100 flex flex-col relative overflow-hidden">
      
      {/* Selection Popover */}
      {selectionRect && (
        <div 
            className="fixed z-[100] transform -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150 flex items-center space-x-2"
            style={{ top: selectionRect.top, left: selectionRect.left }}
        >
            <button
                onMouseDown={handleAddToNotebook}
                className="flex items-center space-x-1 bg-indigo-600 text-white px-3 py-1.5 rounded-full shadow-2xl ring-4 ring-white/50 hover:bg-indigo-700 hover:scale-105 transition-all cursor-pointer"
                title="保存到略读笔记"
            >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="text-xs font-bold whitespace-nowrap ml-1">记略读笔记</span>
            </button>
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-indigo-600 absolute left-1/2 -translate-x-1/2 -bottom-2 pointer-events-none"></div>
        </div>
      )}

      {/* 1. TOP HALF: Diagnosis / Status / Quiz / Structure */}
      <div style={{ height: stage === 'quiz' ? '100%' : `${topHeight}%` }} className={`overflow-y-auto custom-scrollbar relative bg-stone-50/30 flex flex-col transition-all duration-500`}>
        <div className="p-4 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-stone-100 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center space-x-2">
                <div className={`p-1.5 rounded-lg transition-colors ${
                    stage === 'diagnosis' ? 'bg-amber-100 text-amber-600' :
                    stage === 'tutoring' ? 'bg-rose-100 text-rose-600' : 
                    stage === 'quiz' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                    {stage === 'diagnosis' ? <Map className="w-4 h-4" /> :
                     stage === 'tutoring' ? <BrainCircuit className="w-4 h-4" /> :
                     stage === 'quiz' ? <ShieldAlert className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                </div>
                <div className="flex flex-col">
                   {/* UNIFIED TITLE */}
                   <h2 className="font-bold text-slate-800 text-base leading-tight">📖 智能导读</h2>
                   
                   {/* SIMPLE STATUS BADGE */}
                   <div className="flex items-center mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        stage === 'diagnosis' ? 'bg-amber-50 text-amber-600' :
                        stage === 'tutoring' ? 'bg-rose-50 text-rose-600' :
                        stage === 'quiz' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                          {stage === 'diagnosis' && "全书扫描中..."}
                          {stage === 'tutoring' && "AI 补习中"}
                          {stage === 'quiz' && "知识点确认"}
                          {stage === 'reading' && "正在领读"}
                      </span>
                   </div>
                </div>
            </div>
            
            {/* Doc Mode Toggle (Only Visible in Reading) */}
            {stage === 'reading' && (
                <button 
                    onClick={onToggleDocType}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center space-x-1 transition-colors border ${
                        docType === 'STEM' 
                        ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' 
                        : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'
                    }`}
                    title="切换导读模式"
                >
                    {docType === 'STEM' ? <FlaskConical className="w-3 h-3" /> : <Feather className="w-3 h-3" />}
                    <span>{docType === 'STEM' ? '理科模式' : '社科模式'}</span>
                </button>
            )}
        </div>
        
        <div className="p-6 space-y-6 flex-1">
            {/* STAGE: DIAGNOSIS (Checklist) */}
            {stage === 'diagnosis' && studyMap && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="mb-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">主题领域 (Topic)</h3>
                        <p className="text-lg font-extrabold text-slate-800">{studyMap.topic}</p>
                    </div>
                    
                    <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm space-y-4">
                        <div className="flex items-start space-x-3">
                            <HelpCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-slate-700">阅读前准备</p>
                                <p className="text-xs text-slate-400 mt-0.5">勾选你已掌握的概念。没勾选的部分我会为你快速补课。</p>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {localPrereqs.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => togglePrereq(p.id)}
                                    className={`w-full flex items-center space-x-3 p-3 rounded-xl border transition-all text-left ${
                                        p.mastered 
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                        : 'bg-stone-50 border-stone-200 text-slate-600 hover:border-indigo-200'
                                    }`}
                                >
                                    <div className={`shrink-0 transition-colors ${p.mastered ? 'text-emerald-500' : 'text-stone-300'}`}>
                                        <CheckCircle2 className={`w-5 h-5 ${p.mastered ? 'fill-emerald-100' : ''}`} />
                                    </div>
                                    <span className="text-sm font-bold">{p.concept}</span>
                                </button>
                            ))}
                        </div>
                        
                        <div className="space-y-3 pt-2">
                            <button
                                onClick={startAdaptiveLearning}
                                className="w-full py-3 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-700 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                            >
                                <Rocket className="w-4 h-4" />
                                <span>{localPrereqs.every(p => p.mastered) ? "开始挑战 (Quiz)" : "开始自适应补习"}</span>
                            </button>
                            
                            {/* SKIP BUTTON */}
                            <button
                                onClick={handleSkipToReading}
                                className="w-full py-2.5 bg-white border border-stone-200 text-stone-500 rounded-xl text-xs font-bold hover:bg-stone-50 hover:text-stone-700 transition-all flex items-center justify-center space-x-2"
                            >
                                <SkipForward className="w-3.5 h-3.5" />
                                <span>我已掌握，直接开始全文导读</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STAGE: TUTORING */}
            {stage === 'tutoring' && (
                <div className="animate-in fade-in">
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-4 flex items-start space-x-3">
                        <BrainCircuit className="w-5 h-5 text-rose-500 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-rose-700">递归补习中...</h4>
                            <p className="text-xs text-rose-600 mt-1">AI 正在为你讲解未掌握的前置知识。当你觉得都懂了，点击下方按钮开始挑战。</p>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <button
                            onClick={triggerQuiz}
                            className="w-full py-3 bg-white border-2 border-slate-800 text-slate-800 rounded-xl text-sm font-bold hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center space-x-2 shadow-sm"
                        >
                            <span>我准备好接受挑战了</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>

                         {/* SKIP BUTTON (Tutoring) */}
                        <button
                            onClick={handleSkipToReading}
                            className="w-full py-2 text-stone-400 text-xs font-bold hover:text-stone-600 transition-colors flex items-center justify-center"
                        >
                            跳过所有，直接开始阅读
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE: QUIZ */}
            {stage === 'quiz' && (
                <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto animate-in zoom-in-95 duration-500 relative">
                    {/* Skip Button (Quiz - Top Right) */}
                    <button
                        onClick={handleSkipToReading}
                        className="absolute -top-10 right-0 text-stone-400 hover:text-slate-600 text-xs font-bold flex items-center space-x-1 px-3 py-1.5 rounded-full hover:bg-stone-100 transition-all"
                    >
                        <span>跳过测验</span>
                        <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    {!quizData ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                <ShieldAlert className="w-8 h-8 text-violet-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">生成逻辑挑战中...</h3>
                            <p className="text-sm text-slate-400">正在生成针对前置知识的逻辑推导题 (Logic Gatekeeper)。</p>
                            <button
                                onClick={handleSkipToReading}
                                className="mt-4 text-xs text-violet-500 hover:text-violet-700 underline font-medium"
                            >
                                不等了，直接开始
                            </button>
                        </div>
                    ) : (
                        <div className="w-full bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
                            <div className="bg-slate-800 p-6 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3"></div>
                                <div className="flex items-center space-x-2 mb-2 opacity-80">
                                    <ShieldAlert className="w-4 h-4" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Logic Gatekeeper Quiz</span>
                                </div>
                                <h3 className="text-lg font-bold leading-snug">{quizData.question}</h3>
                            </div>

                            <div className="p-6 space-y-3">
                                {quizData.options.map((opt, idx) => {
                                    const isSelected = quizSelectedOption === idx;
                                    const isCorrect = idx === quizData.correctIndex;
                                    const showResult = quizSubmitted;
                                    
                                    let btnClass = "border-stone-200 hover:border-violet-300 hover:bg-violet-50 text-slate-600";
                                    if (isSelected) btnClass = "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500";
                                    
                                    if (showResult) {
                                        if (isCorrect) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500";
                                        else if (isSelected && !isCorrect) btnClass = "border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500 opacity-60";
                                        else btnClass = "border-stone-100 text-stone-300 opacity-50";
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            disabled={quizSubmitted}
                                            onClick={() => setQuizSelectedOption(idx)}
                                            className={`w-full text-left p-4 rounded-xl border transition-all text-sm font-medium flex items-center justify-between group ${btnClass}`}
                                        >
                                            <span>{opt}</span>
                                            {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                            {showResult && isSelected && !isCorrect && <AlertCircle className="w-5 h-5 text-rose-500" />}
                                        </button>
                                    );
                                })}

                                {!quizSubmitted ? (
                                    <button
                                        onClick={submitQuiz}
                                        disabled={quizSelectedOption === null}
                                        className="w-full mt-4 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-200"
                                    >
                                        提交答案
                                    </button>
                                ) : (
                                    <div className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                                        <div className={`p-4 rounded-xl mb-4 text-sm leading-relaxed ${
                                            quizSelectedOption === quizData.correctIndex ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                                        }`}>
                                            <div className="font-bold mb-1 flex items-center">
                                                <Lightbulb className="w-4 h-4 mr-2" />
                                                {quizSelectedOption === quizData.correctIndex ? "回答正确！🎉" : "逻辑有误"}
                                            </div>
                                            {quizData.explanation}
                                        </div>
                                        {onRegenerateStudyMap && quizSelectedOption === quizData.correctIndex ? (
                                            <>
                                                <p className="text-xs font-bold text-stone-500 mb-2">选择模块数</p>
                                                {isRegeneratingMap ? (
                                                    <div className="flex items-center justify-center gap-2 py-4 text-stone-500 text-sm">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        <span>正在按所选模块数重新划分…</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-xs text-stone-500 mb-1">用几个模块解读本文（2～7）</label>
                                                        <select
                                                            value={selectedModuleCount}
                                                            onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
                                                            className="w-full py-2.5 rounded-xl border-2 border-stone-200 focus:border-indigo-300 px-4 text-slate-700 text-sm font-medium bg-white"
                                                        >
                                                            {MODULE_OPTIONS.map((n) => (
                                                                <option key={n} value={n}>{n} 个模块</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={handleStartWithModuleCount}
                                                            className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center space-x-2 shadow-xl"
                                                        >
                                                            <span>{needRegenerate ? '按此模块数重新生成并开始领读' : '开始领读'}</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={startFormalReading}
                                                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center space-x-2 shadow-xl"
                                            >
                                                {quizSelectedOption === quizData.correctIndex ? <Lock className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                                                <span>确认开始正式学习</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STAGE: READING */}
            {stage === 'reading' && studyMap && (
                <div className="prose prose-sm max-w-none prose-p:my-2 animate-in fade-in">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
                        <div className="flex items-center space-x-2 mb-2">
                            <Map className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-bold text-indigo-600 uppercase">学习地图</h4>
                        </div>
                        <p className="text-slate-700 m-0 leading-relaxed font-medium">{studyMap.initialBriefing}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {localPrereqs.map(p => (
                            <div key={p.id} className="text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-50 border-emerald-100 text-emerald-600">
                                ✓ {p.concept}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* DRAGGABLE SPLITTER (Hidden in Quiz Mode) */}
      {stage !== 'quiz' && (
          <div 
            onMouseDown={startResize}
            className="h-2 bg-stone-100 border-y border-stone-200 cursor-row-resize flex items-center justify-center hover:bg-indigo-50 transition-colors z-40 shrink-0 select-none group"
          >
             <div className="w-10 h-0.5 rounded-full bg-stone-300 group-hover:bg-indigo-400"></div>
          </div>
      )}

      {/* 2. BOTTOM HALF: Chat (Hidden in Quiz Mode) */}
      {stage !== 'quiz' && (
      <div className="flex-1 flex flex-col min-h-0 bg-white relative z-20">
        <div className="p-3 border-b border-stone-50 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center space-x-2">
                <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                    <Bot className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-700 text-sm">
                    {stage === 'tutoring' ? 'AI 补习助手' : '🧠 深度领读'}
                </span>
            </div>
        </div>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-white">
             {messages.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-stone-300 space-y-4 opacity-70">
                     <div className="p-4 bg-stone-50 rounded-full">
                         <MessageCircle className="w-10 h-10" />
                     </div>
                     <p className="text-xs font-bold text-stone-400">请先在上方完成【知识准备】</p>
                 </div>
             ) : (
                 <>
                 {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`relative max-w-[90%] px-4 py-3 text-sm shadow-sm transition-all ${
                            msg.role === 'user'
                            ? 'group bg-indigo-600 text-white rounded-2xl rounded-tr-none shadow-indigo-100'
                            : 'bg-stone-50 text-slate-700 border border-stone-100 rounded-2xl rounded-tl-none'
                        }`}
                        >
                            {msg.role === 'user' && stage !== 'diagnosis' && stage !== 'quiz' && (
                                <button
                                    type="button"
                                    title="编辑并重发"
                                    aria-label="编辑并重发"
                                    onClick={() => handleEditUserMessageAtIndex(idx)}
                                    className="absolute top-1.5 right-1.5 z-10 rounded-md bg-indigo-700/90 p-1.5 text-white opacity-0 shadow-sm transition-opacity hover:bg-indigo-800 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/60 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                >
                                    <PencilLine className="w-3.5 h-3.5" aria-hidden />
                                </button>
                            )}
                            <ReactMarkdown 
                                components={MarkdownComponents}
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                className={msg.role === 'user' ? 'prose-invert' : ''}
                            >
                                {msg.text}
                            </ReactMarkdown>
                        </div>
                    </div>
                 ))}

                 {/* 本模块要点卡片（reading 阶段） */}
                 {stage === 'reading' && moduleTakeaways !== null && (
                     <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="flex items-center gap-2 text-amber-800 font-bold">
                             <ListChecks className="w-4 h-4" />
                             <span>本模块要点 (Takeaways)</span>
                         </div>
                         <ul className="list-decimal list-inside space-y-2 text-sm text-slate-700">
                             {moduleTakeaways.map((item, i) => (
                                 <li key={i} className="leading-relaxed">{item}</li>
                             ))}
                         </ul>
                         <div className="flex flex-wrap gap-2 pt-2">
                             <button
                                 type="button"
                                 onClick={() => {
                                     const text = moduleTakeaways.join('\n');
                                     navigator.clipboard.writeText(text).catch(() => {});
                                     if (onNotebookAdd) onNotebookAdd(`【本模块要点】\n${text}`, 'skim');
                                 }}
                                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors"
                             >
                                 <ClipboardList className="w-3.5 h-3.5" />
                                 复制并记到笔记
                             </button>
                             <button
                                 type="button"
                                 id="skim-takeaways-write-toggle"
                                 onClick={() => setTakeawaysWriteOpen((o) => !o)}
                                 aria-expanded={takeawaysWriteOpen}
                                 aria-controls="skim-takeaways-write-panel"
                                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-colors"
                             >
                                 <ChevronDown
                                     className={`w-3.5 h-3.5 shrink-0 transition-transform ${takeawaysWriteOpen ? 'rotate-180' : ''}`}
                                     aria-hidden
                                 />
                                 <PencilLine className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                 我要写笔记
                             </button>
                             <button
                                 type="button"
                                 onClick={handleGenerateModuleQuiz}
                                 disabled={quizLoading}
                                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                             >
                                 {quizLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                                 针对本模块生成小题
                             </button>
                         </div>
                         {takeawaysWriteOpen && activeTakeawaysDraftId != null && (
                             <div
                                 id="skim-takeaways-write-panel"
                                 role="region"
                                 aria-labelledby="skim-takeaways-write-toggle"
                                 className="mt-1 space-y-3 border-t border-amber-200/80 pt-3"
                             >
                                 <textarea
                                     ref={takeawaysDraftTextareaRef}
                                     id="skim-takeaways-draft-input"
                                     value={takeawaysDraftText}
                                     onChange={(e) => updateTakeawaysDraft(e.target.value)}
                                     rows={5}
                                     placeholder="用自己的话整理，支持数学公式（如行内 $x^2$、块级 $$\int_0^1 f$$，见下方预览）"
                                     lang="zh-Hans"
                                     autoComplete="off"
                                     aria-label="本模块自整理笔记草稿"
                                     className="min-h-[120px] w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                     spellCheck
                                 />
                                 <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                                     <button
                                         type="button"
                                         onClick={handleUploadTakeawaysDraft}
                                         disabled={!onNotebookAdd || !takeawaysDraftText.trim()}
                                         title={
                                             !onNotebookAdd
                                                 ? '未连接学习手帐'
                                                 : !takeawaysDraftText.trim()
                                                   ? '请先输入内容再保存'
                                                   : undefined
                                         }
                                         aria-disabled={!onNotebookAdd || !takeawaysDraftText.trim()}
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-0"
                                     >
                                         <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                         保存到学习手帐
                                     </button>
                                     <button
                                         type="button"
                                         onClick={() => void handleSendDraftToGuide()}
                                         disabled={isChatLoading || !takeawaysDraftText.trim()}
                                         title={!takeawaysDraftText.trim() ? '请先输入内容' : undefined}
                                         aria-busy={isChatLoading}
                                         aria-disabled={isChatLoading || !takeawaysDraftText.trim()}
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-0"
                                     >
                                         {isChatLoading ? (
                                             <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                         ) : (
                                             <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                         )}
                                         把这段发给导读
                                     </button>
                                     <button
                                         type="button"
                                         onClick={handleClearTakeawaysDraft}
                                         disabled={!takeawaysDraftText}
                                         title="清空当前草稿"
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-0"
                                     >
                                         <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                         清空本块草稿
                                     </button>
                                 </div>
                                 {notebookDraftHint ? (
                                     <p className="text-[11px] font-medium text-emerald-700" role="status" aria-live="polite">
                                         已追加到学习手帐（略读）
                                     </p>
                                 ) : null}
                                 <div className="rounded-xl border border-amber-100 bg-white/95 p-3 shadow-sm">
                                     <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                         <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900/70">
                                             预览（只读）
                                         </span>
                                         {takeawaysDraftText.trim() &&
                                         deferredTakeawaysPreview !== takeawaysDraftText ? (
                                             <span className="text-[10px] text-slate-400">预览略延迟更新…</span>
                                         ) : null}
                                     </div>
                                     <div className="max-h-48 min-h-[2.5rem] overflow-y-auto custom-scrollbar text-left">
                                         {takeawaysDraftText.trim() ? (
                                             <TakeawaysDraftMarkdownPreview
                                                 markdown={
                                                     deferredTakeawaysPreview.trim()
                                                         ? deferredTakeawaysPreview
                                                         : takeawaysDraftText
                                                 }
                                             />
                                         ) : (
                                             <p className="text-xs italic text-slate-400">
                                                 输入后在此预览 Markdown 与公式
                                             </p>
                                         )}
                                     </div>
                                 </div>
                                 <p className="text-[10px] leading-snug text-slate-500">
                                     刷新页面后本块草稿会清空（未保存到学习手帐的内容不保留）。
                                 </p>
                             </div>
                         )}
                     </div>
                 )}

                 {/* 本模块小题（2–3 道，逐题展示） */}
                 {stage === 'reading' && moduleQuiz && moduleQuiz.length > 0 && currentModuleQuestion && (
                     <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/80 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="flex items-center justify-between text-violet-800 font-bold text-sm">
                             <span>本模块小题 ({moduleQuizIndex + 1}/{moduleQuiz.length})</span>
                             <button type="button" onClick={finishModuleQuiz} className="text-xs font-medium text-violet-600 hover:underline">做完了，继续学习</button>
                         </div>
                         <p className="text-slate-800 font-medium">{currentModuleQuestion.question}</p>
                         <div className="space-y-2">
                             {currentModuleQuestion.options.map((opt, idx) => {
                                 const isSelected = moduleQuizSelected === idx;
                                 const isCorrect = idx === currentModuleQuestion.correctIndex;
                                 const showResult = moduleQuizSubmitted;
                                 let btnClass = "border-stone-200 hover:border-violet-300 hover:bg-violet-100/50 text-slate-700";
                                 if (isSelected) btnClass = "border-violet-500 bg-violet-100 text-violet-800 ring-1 ring-violet-500";
                                 if (showResult) {
                                     if (isCorrect) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-800";
                                     else if (isSelected && !isCorrect) btnClass = "border-rose-500 bg-rose-50 text-rose-800";
                                     else btnClass = "border-stone-100 text-stone-400";
                                 }
                                 return (
                                     <button
                                         key={idx}
                                         disabled={moduleQuizSubmitted}
                                         onClick={() => setModuleQuizSelected(idx)}
                                         className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${btnClass}`}
                                     >
                                         {opt}
                                         {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 inline-block ml-2 text-emerald-500" />}
                                         {showResult && isSelected && !isCorrect && <AlertCircle className="w-4 h-4 inline-block ml-2 text-rose-500" />}
                                     </button>
                                 );
                             })}
                         </div>
                         {!moduleQuizSubmitted ? (
                             <button
                                 onClick={() => setModuleQuizSubmitted(true)}
                                 disabled={moduleQuizSelected === null}
                                 className="w-full py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                             >
                                 提交答案
                             </button>
                         ) : (
                             <div className="space-y-2">
                                 <div className="p-3 rounded-xl bg-white/80 text-sm text-slate-700 border border-violet-100">
                                     <span className="font-bold text-violet-700">解析：</span> {currentModuleQuestion.explanation}
                                 </div>
                                 <div className="flex gap-2">
                                     <button
                                         type="button"
                                         onClick={() => { setModuleQuizIndex(i => Math.max(0, i - 1)); setModuleQuizSelected(null); setModuleQuizSubmitted(false); }}
                                         disabled={moduleQuizIndex === 0}
                                         className="flex-1 py-2 rounded-xl border border-violet-200 text-violet-700 text-sm font-medium hover:bg-violet-100 disabled:opacity-50"
                                     >
                                         上一题
                                     </button>
                                     {moduleQuizIndex < moduleQuiz.length - 1 ? (
                                         <button
                                             type="button"
                                             onClick={() => { setModuleQuizIndex(i => i + 1); setModuleQuizSelected(null); setModuleQuizSubmitted(false); }}
                                             className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700"
                                         >
                                             下一题
                                         </button>
                                     ) : (
                                         <button type="button" onClick={finishModuleQuiz} className="flex-1 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-900">
                                             完成，继续学习
                                         </button>
                                     )}
                                 </div>
                             </div>
                         )}
                     </div>
                 )}

                 </>
             )}
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

        <div className="p-4 border-t border-stone-50 bg-white shrink-0 space-y-2">
            {stage === 'reading' && messages.length > 0 && (
                <button
                    type="button"
                    onClick={handleShowTakeaways}
                    disabled={takeawaysLoading || isChatLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 text-sm font-bold hover:bg-amber-200 disabled:opacity-50 transition-colors"
                >
                    {takeawaysLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
                    <span>本模块读完了，看要点</span>
                </button>
            )}
            <div className="flex items-center space-x-2 bg-stone-50 p-1.5 rounded-full border border-stone-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <input
                    ref={chatInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={stage === 'tutoring' ? "回答 AI 的追问或说‘我不懂’..." : "与导读 AI 交流..."}
                    className="flex-1 bg-transparent border-0 px-4 py-1.5 text-sm focus:ring-0 focus:outline-none text-slate-700 placeholder:text-stone-400"
                    disabled={isChatLoading || stage === 'diagnosis'}
                />
                {isChatLoading ? (
                    <button
                        type="button"
                        onClick={handleStopSkimChat}
                        title="停止生成"
                        className="p-2 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-all shadow-md flex items-center gap-1 px-3"
                    >
                        <Square className="w-3 h-3 fill-current" />
                        <span className="text-xs font-bold">停止</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={!input.trim() || stage === 'diagnosis'}
                        className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
                    >
                        <Send className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                )}
            </div>
        </div>

      </div>
      )}

      {/* 选择模块数弹层（跳过测验/直接阅读时弹出） */}
      {showGranularityModal && onRegenerateStudyMap && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">选择模块数</h3>
            <p className="text-xs text-stone-500">用几个模块解读本文（2～7），选完后即开始领读。</p>
            <div className="flex flex-col gap-2">
              <select
                value={selectedModuleCount}
                onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
                className="w-full py-2.5 rounded-xl border-2 border-stone-200 focus:border-indigo-300 px-4 text-slate-700 text-sm font-medium bg-white"
              >
                {MODULE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} 个模块</option>
                ))}
              </select>
              <button
                onClick={handleStartWithModuleCount}
                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
              >
                {needRegenerate ? '按此模块数重新生成并开始领读' : '开始领读'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 正在重新划分模块时的 loading */}
      {isRegeneratingMap && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="flex items-center gap-2 text-stone-600 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>正在按所选模块数重新划分…</span>
          </div>
        </div>
      )}
    </div>
  );
};
