
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Sparkles, RefreshCw, Send, Image as ImageIcon, MessageSquare, X, Heart, HelpCircle, Highlighter, Plus, GripHorizontal, Move, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChatMessage } from '../types';
import { plainTextToHtmlWithSupSub, normalizeSelectionText, dedupeHtml } from '../utils/textUtils';
import { LoadingInteractiveContent } from './LoadingInteractiveContent';

interface ExplanationPanelProps {
  explanation: string | undefined;
  isLoadingExplanation: boolean;
  onRetryExplanation: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, image?: string) => void;
  isChatLoading: boolean;
  onNotebookAdd?: (text: string) => void;
  isImmersive?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// --- HELPER: Preprocess LaTeX Delimiters ---
const preprocessLaTeX = (text: string | undefined): string => {
  if (!text) return "";
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
    .replace(/\\\$/g, '$');
};

const GlossaryTooltip: React.FC<{ term: React.ReactNode; definition: string }> = ({ term, definition }) => {
  return (
    <span className="relative inline-block group cursor-help z-10 border-b border-dashed border-rose-400 text-slate-800 font-medium hover:bg-rose-50 transition-colors">
      {term}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white rounded-lg shadow-xl text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none transform origin-bottom scale-95 group-hover:scale-100 duration-200 z-50 text-left font-normal">
        <span className="flex items-start gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <span>{definition}</span>
        </span>
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></span>
      </span>
    </span>
  );
};

// --- MARKDOWN COMPONENTS ---
const MarkdownComponents: Components = {
    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4 leading-tight" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-lg font-bold text-slate-800 mt-6 mb-3 border-b border-slate-100 pb-2" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-2 my-4 text-slate-700 marker:text-slate-400" {...props} />,
    li: ({node, ...props}) => <li className="pl-1 leading-7" {...props} />,
    // Enhanced p tag for Visual Logic Flows
    p: ({node, children, ...props}) => {
      let textContent = '';
      React.Children.forEach(children, (child) => {
        if (typeof child === 'string') textContent += child;
        else if (child && typeof child === 'object' && 'props' in child && child.props.children) {
            if (typeof child.props.children === 'string') {
                textContent += child.props.children;
            } else if (Array.isArray(child.props.children)) {
                 child.props.children.forEach((c: any) => {
                     if (typeof c === 'string') textContent += c;
                 });
            }
        }
      });

      const isVisualFlow = textContent.includes('[') && textContent.includes(']') && (textContent.includes('➔') || textContent.includes('→'));

      if (isVisualFlow) {
        return (
          <div className="my-6 p-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border border-blue-100/60 rounded-xl shadow-sm overflow-x-auto snap-x cursor-grab active:cursor-grabbing scrollbar-hide">
             <div className="flex items-center gap-3 font-mono text-sm whitespace-nowrap min-w-max">
                {textContent.split(/(➔|→)/g).filter(s => s.trim()).map((chunk, i) => {
                    const trimmed = chunk.trim();
                    if (trimmed === '➔' || trimmed === '→') {
                        return <span key={i} className="text-blue-500/50 font-bold text-xl px-1 relative -top-[1px]">→</span>;
                    }
                    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        const content = trimmed.slice(1, -1);
                        return (
                          <span key={i} className="bg-white px-3.5 py-2 rounded-lg border border-blue-200/60 shadow-sm font-bold text-slate-700 snap-center flex items-center ring-1 ring-blue-50">
                            {content}
                          </span>
                        );
                    }
                    return <span key={i} className="text-slate-500 font-medium">{trimmed}</span>
                })}
             </div>
          </div>
        );
      }
      return <p className="mb-4 leading-7 text-slate-700" {...props}>{children}</p>;
    },
    code: ({node, ...props}) => <code className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
    a: ({node, ...props}) => {
        const { href, children } = props;
        if (href?.startsWith('glossary:')) {
            const definition = decodeURIComponent(href.replace('glossary:', ''));
            return <GlossaryTooltip term={children} definition={definition} />;
        }
        return <a {...props} className="text-blue-600 hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer" />;
    },
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

const MarkdownView = React.memo(({ content }: { content: string }) => {
    const processedContent = preprocessLaTeX(content);
    return (
        <div className="select-text font-sans text-base">
            <ReactMarkdown 
                components={MarkdownComponents}
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
}, (prev, next) => prev.content === next.content);


export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({ 
  explanation, 
  isLoadingExplanation, 
  onRetryExplanation,
  chatMessages,
  onSendChat,
  isChatLoading,
  onNotebookAdd,
  isImmersive = false,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [inputText, setInputText] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  
  // --- RESIZE STATE ---
  const [topHeight, setTopHeight] = useState(60); 
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  // Text Selection State
  const [selectionRect, setSelectionRect] = useState<{top: number, left: number} | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedHtml, setSelectedHtml] = useState<string>(''); // 新增：保存 HTML 格式
  const selectionTimerRef = useRef<number | null>(null);

  // Fix Bug 1: Scoped scrolling to prevent global window jump
  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  // --- RESIZE LOGIC ---
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none'; 
  };

  const onResize = (e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top;
    const newPercentage = (relativeY / containerRect.height) * 100;

    if (newPercentage > 20 && newPercentage < 80) {
      setTopHeight(newPercentage);
    }
  };

  const stopResize = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // --- SELECTION LOGIC ---
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
          setSelectedHtml('');
          return;
        }

        if (explanationRef.current && explanationRef.current.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          if (rect.width > 0) {
              const raw = selection.toString();
              const text = normalizeSelectionText(raw);
              setSelectedText(text);
              
              // 获取选中区域的 HTML 内容（保留格式）
              const container = document.createElement('div');
              container.appendChild(range.cloneContents());
              
              // 清理 HTML：保留格式但去除不需要的样式和类名
              let html = container.innerHTML;
              
              // 先保护 KaTeX 公式（避免被后续处理破坏）
              // KaTeX 可能包含嵌套结构，需要匹配完整的公式块
              const katexMatches: string[] = [];
              // 匹配包含 katex 类的 span 及其所有嵌套内容
              const katexPattern = /<span[^>]*class="[^"]*katex[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
              html = html.replace(katexPattern, (match) => {
                katexMatches.push(match);
                return `__KATEX_PLACEHOLDER_${katexMatches.length - 1}__`;
              });
              
              // 保护上标和下标格式（如 b⁻, a⁺ 等）
              // 需要保护包含上标/下标字符的 <span> 标签，以及 <sup>/<sub> 标签
              const superscriptMatches: string[] = [];
              const subscriptMatches: string[] = [];
              
              // 先保护包含上标字符的 <span> 标签（react-markdown 可能会将上标字符包裹在 span 中）
              // 匹配包含上标字符的 span：如 <span>⁻</span> 或 <span class="...">b⁻</span> 或 <span>a⁻,b⁻,c⁻</span>
              // 先收集所有匹配，然后从后往前替换，避免索引错乱
              const superscriptSpanPattern = /<span[^>]*>[\s\S]*?[\u2070-\u207F\u00B2\u00B3\u00B9][\s\S]*?<\/span>/gi;
              const superscriptSpans: Array<{ match: string; index: number }> = [];
              let match;
              // 重置正则表达式的 lastIndex，确保从头开始匹配
              superscriptSpanPattern.lastIndex = 0;
              while ((match = superscriptSpanPattern.exec(html)) !== null) {
                if (!match[0].includes('__KATEX_PLACEHOLDER_')) {
                  superscriptSpans.push({ match: match[0], index: match.index });
                }
              }
              // 从后往前替换，避免索引错乱
              superscriptSpans.reverse().forEach(({ match: spanMatch }) => {
                superscriptMatches.push(spanMatch);
                html = html.replace(spanMatch, `__SUPERSCRIPT_PLACEHOLDER_${superscriptMatches.length - 1}__`);
              });
              
              // 匹配 <sup> 标签及其内容
              const supTagPattern = /<sup[^>]*>.*?<\/sup>/gi;
              html = html.replace(supTagPattern, (match) => {
                if (!match.includes('__SUPERSCRIPT_PLACEHOLDER_')) {
                  superscriptMatches.push(match);
                  return `__SUPERSCRIPT_PLACEHOLDER_${superscriptMatches.length - 1}__`;
                }
                return match;
              });
              
              // 保护包含下标字符的 <span> 标签
              const subscriptSpanPattern = /<span[^>]*>[\s\S]*?[\u2080-\u208F][\s\S]*?<\/span>/gi;
              const subscriptSpans: Array<{ match: string; index: number }> = [];
              while ((match = subscriptSpanPattern.exec(html)) !== null) {
                const spanMatch = match[0];
                if (!spanMatch.includes('__KATEX_PLACEHOLDER_') && !spanMatch.includes('__SUPERSCRIPT_PLACEHOLDER_')) {
                  subscriptSpans.push({ match: spanMatch, index: match.index });
                }
              }
              // 从后往前替换
              subscriptSpans.reverse().forEach(({ match: spanMatch }) => {
                subscriptMatches.push(spanMatch);
                html = html.replace(spanMatch, `__SUBSCRIPT_PLACEHOLDER_${subscriptMatches.length - 1}__`);
              });
              
              // 匹配 <sub> 标签及其内容
              const subTagPattern = /<sub[^>]*>.*?<\/sub>/gi;
              html = html.replace(subTagPattern, (match) => {
                if (!match.includes('__SUBSCRIPT_PLACEHOLDER_')) {
                  subscriptMatches.push(match);
                  return `__SUBSCRIPT_PLACEHOLDER_${subscriptMatches.length - 1}__`;
                }
                return match;
              });
              
              // 保留换行：将 <p>、<div> 转换为换行，但保留 <br>
              html = html
                .replace(/<\/p>/gi, '<br>')
                .replace(/<p[^>]*>/gi, '')
                .replace(/<\/div>/gi, '<br>')
                .replace(/<div[^>]*>/gi, '')
                .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '<br>'); // 合并连续的 <br>
              
              // 保留内联格式：<strong>、<em>、<code>（但去除样式和类名）
              html = html
                .replace(/<strong[^>]*>/gi, '<strong>')
                .replace(/<\/strong>/gi, '</strong>')
                .replace(/<em[^>]*>/gi, '<em>')
                .replace(/<\/em>/gi, '</em>')
                .replace(/<code[^>]*>/gi, '<code>')
                .replace(/<\/code>/gi, '</code>');
              
              // 处理普通 <span>：保留内容但去除样式（跳过已保护的 katex、上标、下标 placeholder）
              html = html.replace(/<span[^>]*>(.*?)<\/span>/gi, (match, content) => {
                // 如果是 placeholder，不处理
                if (match.includes('__KATEX_PLACEHOLDER_') || 
                    match.includes('__SUPERSCRIPT_PLACEHOLDER_') || 
                    match.includes('__SUBSCRIPT_PLACEHOLDER_')) {
                  return match;
                }
                // 如果内容包含上标或下标字符，保留 <span> 标签但清理样式和类名
                if (/[\u2070-\u207F\u00B2\u00B3\u00B9\u2080-\u208F]/.test(content)) {
                  // 清理样式和类名，但保留标签结构
                  return match.replace(/style="[^"]*"/gi, '').replace(/style='[^']*'/gi, '')
                             .replace(/class="[^"]*"/gi, '').replace(/class='[^']*'/gi, '')
                             .replace(/id="[^"]*"/gi, '').replace(/id='[^']*'/gi, '');
                }
                return content;
              });
              
              // 去除其他不需要的标签和属性
              html = html
                .replace(/<a[^>]*>/gi, '') // 移除链接标签（保留内容）
                .replace(/<\/a>/gi, '');
              
              // 移除样式和类名（placeholder 是纯文本，不会被这些正则匹配）
              // 注意：这些操作不会影响 placeholder 字符串本身
              html = html.replace(/style="[^"]*"/gi, '');
              html = html.replace(/style='[^']*'/gi, '');
              html = html.replace(/class="[^"]*"/gi, '');
              html = html.replace(/class='[^']*'/gi, '');
              html = html.replace(/id="[^"]*"/gi, '');
              html = html.replace(/id='[^']*'/gi, '');
              
              // 恢复 KaTeX 公式（在清理完成后）
              katexMatches.forEach((match, idx) => {
                html = html.replace(`__KATEX_PLACEHOLDER_${idx}__`, match);
              });
              
              // 恢复上标和下标（在清理完成后）
              superscriptMatches.forEach((match, idx) => {
                html = html.replace(`__SUPERSCRIPT_PLACEHOLDER_${idx}__`, match);
              });
              subscriptMatches.forEach((match, idx) => {
                html = html.replace(`__SUBSCRIPT_PLACEHOLDER_${idx}__`, match);
              });
              
              // 清理多余的空白和换行（但保留公式周围的必要空格）
              html = html
                .replace(/\s+/g, ' ') // 多个空格合并为一个
                .replace(/<br>\s*<br>/gi, '<br>') // 多个 <br> 合并
                .trim();
              
              // 如果没有有效的 HTML 标签，使用纯文本并保留换行及上标/下标（与拖拽便签显示一致）
              if (!/<[^>]+>/.test(html)) {
                html = plainTextToHtmlWithSupSub(text);
              }
              
              setSelectedHtml(html);
              setSelectionRect({
                  top: rect.top - 45,
                  left: rect.left + (rect.width / 2)
              });
          }
        } else {
          setSelectionRect(null);
          setSelectedText('');
          setSelectedHtml('');
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

  // --- ACTION HANDLERS ---
  
  const handleDragStart = (e: React.DragEvent) => {
      if (selectedText) {
          // 同时传递纯文本和 HTML 格式；无 HTML 时用带上标/下标的转换，与「选中平移」格式一致
          e.dataTransfer.setData("text/plain", selectedText);
          e.dataTransfer.setData("text/html", selectedHtml || plainTextToHtmlWithSupSub(selectedText));
          e.dataTransfer.effectAllowed = "copy";
      }
  };

  const handleAddToNotebook = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    if (selectedText && onNotebookAdd) {
        const content = selectedHtml
          ? dedupeHtml(selectedHtml)
          : plainTextToHtmlWithSupSub(normalizeSelectionText(selectedText));
        onNotebookAdd(content);
        setSelectionRect(null);
        setSelectedText('');
        setSelectedHtml('');
        window.getSelection()?.removeAllRanges();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setPastedImage(event.target.result as string);
            }
          };
          reader.readAsDataURL(blob);
        }
        return;
      }
    }
  };

  const handleSend = () => {
    if ((!inputText.trim() && !pastedImage) || isChatLoading) return;
    onSendChat(inputText, pastedImage || undefined);
    setInputText('');
    setPastedImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
    setInputText(target.value);
  };

  // --- COLLAPSED STATE RENDER ---
  if (isCollapsed && isImmersive && onToggleCollapse) {
      return (
          <div className="h-full w-full flex flex-col items-center pt-4 bg-stone-50 border-l border-stone-200">
              <button 
                onClick={onToggleCollapse}
                className="p-2 hover:bg-stone-200 rounded-full text-stone-500 mb-4"
                title="展开面板"
              >
                  <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="writing-vertical-rl text-stone-400 font-bold tracking-widest text-xs uppercase select-none">
                  AI Explanation
              </div>
          </div>
      );
  }

  // --- NORMAL STATE RENDER ---
  return (
    <div ref={containerRef} className={`flex-1 bg-[#FFFBF7] h-full flex flex-col ${isImmersive ? 'w-full' : 'min-w-[380px] max-w-[650px] border-l border-stone-100 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.03)]'} relative z-20`}>
      
      {/* Immersive Collapse Button */}
      {isImmersive && onToggleCollapse && (
          <div className="absolute top-4 left-2 z-50">
               <button 
                onClick={onToggleCollapse}
                className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600"
                title="收起面板"
               >
                   <ChevronRight className="w-4 h-4" />
               </button>
          </div>
      )}

      {/* Floating Action Menu */}
      {selectionRect && (
        <div 
            className="fixed z-[100] transform -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150 flex items-center space-x-2"
            style={{ top: selectionRect.top, left: selectionRect.left }}
        >
            <div 
                draggable
                onDragStart={handleDragStart}
                className="flex items-center space-x-1 bg-slate-900 text-white px-3 py-1.5 rounded-full shadow-2xl ring-4 ring-white/50 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
                title="拖拽到左侧生成便签"
            >
                <Move className="w-3.5 h-3.5" />
                <span className="text-xs font-bold whitespace-nowrap ml-1">拖拽便签</span>
            </div>

            <button
                onMouseDown={handleAddToNotebook}
                className="flex items-center space-x-1 bg-amber-500 text-white px-3 py-1.5 rounded-full shadow-2xl ring-4 ring-white/50 hover:bg-amber-600 hover:scale-105 transition-all cursor-pointer"
                title="保存到下方笔记本"
            >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="text-xs font-bold whitespace-nowrap ml-1">记笔记</span>
            </button>
            
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-slate-900 absolute left-1/2 -translate-x-1/2 -bottom-2 pointer-events-none"></div>
        </div>
      )}

      {/* TOP HALF: AI Explanation (Resizable) */}
      <div style={{ height: `${topHeight}%` }} className="flex flex-col min-h-0 overflow-hidden relative bg-white">
        <div className={`p-5 flex items-center justify-between bg-white/50 backdrop-blur-sm z-10 border-b border-stone-50 ${isImmersive ? 'pl-10' : ''}`}>
          <div className="flex items-center space-x-2.5">
            <div className="bg-rose-100 p-1.5 rounded-lg text-rose-500">
                <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-slate-700 text-base">AI 核心讲解</h2>
          </div>
          {!isLoadingExplanation && explanation && (
              <button 
                  onClick={onRetryExplanation} 
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all"
                  title="重新生成讲解"
              >
                  <RefreshCw className="w-4 h-4" />
              </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white" ref={explanationRef}>
          {isLoadingExplanation ? (
            <LoadingInteractiveContent />
          ) : explanation ? (
            <div className="p-8 max-w-none">
                <MarkdownView content={explanation} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-stone-300">
                <div className="w-24 h-24 bg-stone-100 rounded-full mb-4 opacity-50"></div>
                <div className="w-40 h-4 bg-stone-100 rounded-full mb-2 opacity-50"></div>
                <div className="w-24 h-4 bg-stone-100 rounded-full opacity-50"></div>
            </div>
          )}
        </div>
      </div>

      {/* RESIZE SPLITTER */}
      <div 
        onMouseDown={startResize}
        className="h-3 bg-stone-100 border-y border-stone-200 cursor-row-resize flex items-center justify-center hover:bg-rose-50 transition-colors z-40 shrink-0 select-none shadow-sm group"
        title="拖动调整高度"
      >
         <div className="w-12 h-1 rounded-full bg-stone-300/80 flex items-center justify-center group-hover:bg-rose-300 transition-colors">
            <GripHorizontal className="w-3 h-3 text-stone-400 group-hover:text-rose-500" />
         </div>
      </div>

      {/* BOTTOM HALF: Q&A (Flex fills remaining space) */}
      <div className="flex-1 flex flex-col min-h-0 bg-white relative z-30">
        <div className="p-4 flex items-center space-x-2 border-b border-stone-50 shrink-0">
            <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-500">
                <MessageSquare className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-700">有什么不懂的吗？</span>
        </div>
        
        {/* Chat History */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-stone-50/30"
        >
            {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-2 opacity-60">
                    <p className="text-xs font-bold bg-stone-100 px-3 py-1 rounded-full">Q&A 区域</p>
                    <p className="text-sm text-center">这里可以随时提问哦 ✨<br/>支持截图粘贴</p>
                </div>
            ) : (
                chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-4 py-3 text-sm shadow-sm transition-all ${
                            msg.role === 'user' 
                            ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-2xl rounded-tr-none' 
                            : 'bg-white text-slate-600 border border-stone-100 rounded-2xl rounded-tl-none shadow-stone-100'
                        }`}>
                            {msg.image && (
                                <img src={msg.image} alt="User upload" className="max-w-full h-auto rounded-xl mb-2 border-2 border-white/20" />
                            )}
                            <ReactMarkdown 
                                className="prose prose-sm max-w-none prose-invert:text-white prose-p:my-0"
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                components={MarkdownComponents} // Use enhanced components for chat too
                            >
                                {preprocessLaTeX(msg.text)}
                            </ReactMarkdown>
                        </div>
                    </div>
                ))
            )}
            {isChatLoading && (
                <div className="flex justify-start">
                    <div className="bg-white border border-stone-100 rounded-2xl rounded-tl-none p-4 shadow-sm">
                        <div className="flex space-x-1.5">
                            <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-150"></div>
                            <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-300"></div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Chat Input */}
        <div className="p-4 pt-2 border-t border-stone-50 bg-white">
            {pastedImage && (
                <div className="relative inline-block mb-3 animate-in fade-in slide-in-from-bottom-2">
                    <img src={pastedImage} alt="Pasted" className="h-20 w-auto rounded-xl border-2 border-stone-200 shadow-sm" />
                    <button 
                        onClick={() => setPastedImage(null)}
                        className="absolute -top-2 -right-2 bg-white text-rose-500 rounded-full p-1 shadow-md hover:scale-110 transition-transform"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
            <div className="flex items-end space-x-2 bg-stone-50 p-2 rounded-3xl border border-stone-100 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-200 transition-all">
                <div className="relative flex-1">
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={autoResizeTextarea}
                        onPaste={handlePaste}
                        onKeyDown={handleKeyDown}
                        placeholder="输入问题..."
                        className="w-full bg-transparent border-0 rounded-xl px-3 py-2 text-sm focus:ring-0 text-slate-700 placeholder:text-stone-400 resize-none max-h-[200px] min-h-[40px]"
                        rows={1}
                        disabled={isChatLoading}
                    />
                </div>
                <button 
                    onClick={handleSend}
                    disabled={(!inputText.trim() && !pastedImage) || isChatLoading}
                    className="p-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                    <Send className="w-4 h-4 ml-0.5" />
                </button>
            </div>
            <div className="text-[10px] text-stone-400 mt-2 flex items-center justify-center">
               <ImageIcon className="w-3 h-3 mr-1" /> 支持粘贴截图提问
            </div>
        </div>

      </div>
    </div>
  );
};
