import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Coffee, X, Download, StickyNote, GripHorizontal, Minus, Plus, Scaling, Move, Bold, ZoomIn, ZoomOut, Maximize2, ChevronDown } from 'lucide-react';
import { Slide, SlideAnnotation } from '../types';

interface SlideViewerProps {
  slide: Slide | undefined;
  annotations: SlideAnnotation[];
  onAddAnnotation: (text: string, x: number, y: number) => void;
  onUpdateAnnotation: (id: string, updates: Partial<SlideAnnotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  onExportPDF: () => void;
  onRequestUpload?: () => void;
  isImmersive?: boolean;
}

const COLORS = [
  { hex: '#111827', name: 'Dark' },   // slate-900
  { hex: '#f59e0b', name: 'Amber' },  // amber-500
  { hex: '#ec4899', name: 'Pink' },   // pink-500
  { hex: '#3b82f6', name: 'Blue' },   // blue-500
];

export const SlideViewer: React.FC<SlideViewerProps> = ({ 
  slide, 
  annotations = [], 
  onAddAnnotation, 
  onUpdateAnnotation, 
  onDeleteAnnotation,
  onExportPDF,
  onRequestUpload: _onRequestUpload,
  isImmersive = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Zoom State
  const [zoom, setZoom] = useState(1);

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Refs
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const initialNote = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Reset zoom when slide changes or immersive mode changes
  useEffect(() => {
    setZoom(1);
  }, [slide, isImmersive]);

  // 初始化编辑内容：只在进入编辑模式时设置一次
  useEffect(() => {
    if (editingId && editorRef.current) {
      const currentNote = annotations.find(n => n.id === editingId);
      if (currentNote && editorRef.current.innerHTML !== currentNote.text) {
        editorRef.current.innerHTML = currentNote.text;
      }
      // 聚焦并移动光标到末尾
      editorRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editingId, annotations]);

  // --- DROP ZONE ---
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragOver(true); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!slide || !containerRef.current) return;
    
    // 优先获取 HTML 格式，如果没有则使用纯文本
    let content = e.dataTransfer.getData("text/html");
    const plainText = e.dataTransfer.getData("text/plain");
    
    if (!content && plainText) {
      // 如果没有 HTML，将纯文本转换为 HTML（保留换行）
      content = plainText.replace(/\n/g, '<br>');
    }
    
    if (!content) return;

    // We need to calculate position relative to the SCALED content
    const rect = containerRef.current.getBoundingClientRect();
    
    // Position inside the element (0-width, 0-height)
    // Even if scaled, the internal percentage logic works if we map correctly
    // The drop event gives client coordinates. The rect gives visual coordinates.
    // The relative position inside visual rect is (client - rect.left).
    // Percentage = (relative / rect.width) * 100.
    // This works perfectly regardless of CSS transform or scale!
    
    const x = Math.max(5, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    onAddAnnotation(content, x, y);
  };

  // --- ZOOM CONTROLS ---
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleFitWidth = () => setZoom(1);

  // --- ANNOTATION DRAG/RESIZE LOGIC ---
  const handleDragStart = (e: React.MouseEvent, note: SlideAnnotation) => {
    if (e.button !== 0) return;
    if (editingId === note.id) return;
    
    e.stopPropagation();
    
    setActiveNoteId(note.id);
    setIsResizing(false);

    if (editingId && editingId !== note.id) {
        saveEdit(); 
    }

    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    initialNote.current = { x: note.x, y: note.y, w: note.width || 240, h: note.height || 100 };

    const onMove = (ev: MouseEvent) => {
        if (!containerRef.current) return;
        
        // Rect of the slide container (visual)
        const rect = containerRef.current.getBoundingClientRect();
        
        const deltaX = ev.clientX - dragStartMouse.current.x;
        const deltaY = ev.clientY - dragStartMouse.current.y;
        
        // Convert pixel delta to percentage based on CURRENT VISUAL SIZE
        // This ensures dragging feels 1:1 with mouse movement even when zoomed
        const deltaXPercent = (deltaX / rect.width) * 100;
        const deltaYPercent = (deltaY / rect.height) * 100;
        
        let newX = initialNote.current.x + deltaXPercent;
        let newY = initialNote.current.y + deltaYPercent;
        newX = Math.max(0, Math.min(95, newX));
        newY = Math.max(0, Math.min(95, newY));

        onUpdateAnnotation(note.id, { x: newX, y: newY });
    };

    const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleResizeStart = (e: React.MouseEvent, note: SlideAnnotation) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveNoteId(note.id); 
    setIsResizing(true);
    
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    initialNote.current = { x: note.x, y: note.y, w: note.width || 240, h: note.height || 100 };

    // Need to account for zoom scale in resizing too?
    // Not directly, but since we are changing Pixel width, we might need to adjust delta by scale factor 
    // to match mouse movement speed if the container is scaled via transform.
    // However, in this implementation we are setting the width of the container via style={{ width: zoom * 100% }}.
    // So 1px mouse move is 1px on screen, but the annotation width is absolute pixels inside the container.
    // If the container is effectively larger, the annotation pixel width stays same visually? 
    // Wait, the annotation width is in PX. 
    
    const onMove = (ev: MouseEvent) => {
        const deltaX = ev.clientX - dragStartMouse.current.x;
        const deltaY = ev.clientY - dragStartMouse.current.y;
        
        // Adjust delta by zoom level to make resize feel natural if we were using transform: scale.
        // But here we are just changing container width.
        // If zoom is 2.0, everything is 2x bigger visually. 
        // A 10px mouse move covers "5px" of unscaled content space? 
        // Actually, let's divide by zoom to keep 1:1 tracking.
        
        const effectiveDeltaX = deltaX / zoom;
        const effectiveDeltaY = deltaY / zoom;

        const newW = Math.max(120, initialNote.current.w + effectiveDeltaX);
        const newH = Math.max(60, initialNote.current.h + effectiveDeltaY);
        
        onUpdateAnnotation(note.id, { width: newW, height: newH });
    };

    const onUp = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // --- EDITING LOGIC ---
  const handleDoubleClick = (e: React.MouseEvent, note: SlideAnnotation) => {
      e.stopPropagation();
      setEditingId(note.id);
      setActiveNoteId(note.id);
  };

  const saveEdit = () => {
      if (editingId && editorRef.current) {
          onUpdateAnnotation(editingId, { text: editorRef.current.innerHTML });
          setEditingId(null);
      } else if (editingId) {
          setEditingId(null);
      }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          saveEdit();
      }
      // 阻止 Escape 键的默认行为，但允许其他键正常编辑
      if (e.key === 'Escape') {
          e.preventDefault();
          saveEdit();
      }
  };

  const handleEditorInput = () => {
      // 实时更新内容（可选，如果不需要实时更新可以移除）
      // 这里不更新状态，只在保存时更新，避免频繁渲染
  };

  const handleEditorBlur = () => {
      // 失去焦点时自动保存
      if (editingId) {
          saveEdit();
      }
  };

  // --- RICH TEXT HELPERS ---
  const applyStyleToSelection = (type: 'bold' | 'color' | 'fontSize', value?: any): boolean => {
    if (!editorRef.current) return false;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return false;

    if (type === 'bold') {
        document.execCommand('bold', false);
    } else if (type === 'color') {
        document.execCommand('foreColor', false, value);
    } else if (type === 'fontSize') {
        const span = document.createElement("span");
        span.style.fontSize = `${value}px`;
        try { range.surroundContents(span); } catch (e) { return false; }
    }
    return true;
  };

  // --- TOOLBAR ACTIONS ---
  const handleFontSize = (e: React.MouseEvent, note: SlideAnnotation, delta: number) => {
      e.stopPropagation(); e.preventDefault();
      const isEditingThis = editingId === note.id;
      const currentGlobalSize = note.fontSize || 14;
      const newGlobalSize = Math.max(12, Math.min(48, currentGlobalSize + delta));
      if (isEditingThis) {
          const handled = applyStyleToSelection('fontSize', newGlobalSize);
          if (handled) return;
      }
      onUpdateAnnotation(note.id, { fontSize: newGlobalSize });
  };

  const handleBold = (e: React.MouseEvent, note: SlideAnnotation) => {
      e.stopPropagation(); e.preventDefault();
      const isEditingThis = editingId === note.id;
      if (isEditingThis) {
          const handled = applyStyleToSelection('bold');
          if (handled) return;
      }
      onUpdateAnnotation(note.id, { isBold: !note.isBold });
  };

  const handleColor = (e: React.MouseEvent, note: SlideAnnotation, color: string) => {
      e.stopPropagation(); e.preventDefault();
      const isEditingThis = editingId === note.id;
      if (isEditingThis) {
          const handled = applyStyleToSelection('color', color);
          if (handled) return;
      }
      onUpdateAnnotation(note.id, { color });
  };

  const handleBgClick = () => {
      if (editingId) saveEdit();
      setActiveNoteId(null);
  };

  // CSS Styles for the Container based on Mode
  // If immersive, we want a "Preview" like look: Gray bg, centered content, shadow
  const containerClasses = isImmersive 
    ? "bg-[#E5E7EB] w-full h-full overflow-auto flex items-start justify-center p-8 relative"
    : `flex-1 h-full flex items-center justify-center p-8 overflow-hidden relative transition-colors duration-200 ${isDragOver ? 'bg-amber-50 ring-4 ring-inset ring-amber-300' : 'bg-[#FFFBF7]'}`;

  // If normal mode, we constrain strictly to viewport. If immersive, we allow overflow for zoom.
  // We use `min-h-min` and `min-w-min` in a flex container to allow centering when smaller than viewport,
  // but expansion when larger.
  
  return (
    <div 
        className={containerClasses}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleBgClick} 
    >
      {!isImmersive && <div className="absolute inset-0 bg-[radial-gradient(#E2E8F0_1px,transparent_1px)] [background-size:20px_20px] opacity-60 pointer-events-none" />}
      
      {/* ZOOM CONTROLS (Floating in Immersive) */}
      {slide && (
          <div className={`absolute z-50 flex items-center space-x-2 ${isImmersive ? 'bottom-6 left-1/2 -translate-x-1/2 bg-white/90 shadow-lg px-4 py-2 rounded-full border border-stone-200' : 'top-6 right-6'}`}>
              
              {isImmersive && (
                  <>
                    <button onClick={handleZoomOut} className="p-1.5 hover:bg-stone-100 rounded-full text-slate-600"><ZoomOut className="w-4 h-4" /></button>
                    <span className="text-xs font-mono font-bold text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1.5 hover:bg-stone-100 rounded-full text-slate-600"><ZoomIn className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-stone-300 mx-1"></div>
                    <button onClick={handleFitWidth} className="p-1.5 hover:bg-stone-100 rounded-full text-slate-600" title="适合宽度"><Maximize2 className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-stone-300 mx-1"></div>
                  </>
              )}

              <button 
                onClick={(e) => { e.stopPropagation(); onExportPDF(); }}
                className={`${isImmersive ? 'text-slate-600 hover:text-slate-900 p-1.5' : 'bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-xl'} flex items-center space-x-2 transition-all font-bold text-sm`}
                title="导出笔记版 PDF"
              >
                  <Download className="w-4 h-4" />
                  {!isImmersive && <span>导出笔记版 PDF</span>}
              </button>
          </div>
      )}

      {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center z-40 bg-amber-100/50 backdrop-blur-sm pointer-events-none border-4 border-dashed border-amber-400 m-4 rounded-3xl">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center space-x-3 text-amber-600 animate-bounce">
                  <StickyNote className="w-8 h-8" />
                  <span className="text-xl font-bold">松手添加笔记</span>
              </div>
          </div>
      )}

      {slide ? (
        // Inner Wrapper for centering and scaling
        <div className={`relative transition-transform duration-100 ease-out origin-top ${isImmersive ? 'mt-4 mb-20' : 'w-full h-full flex items-center justify-center p-4'}`}>
          <div 
            ref={containerRef} 
            className={`relative shadow-2xl bg-white ${isImmersive ? '' : 'max-w-full max-h-full rounded-xl border-[6px] border-white'}`}
            style={{
                width: isImmersive ? `${zoom * 100}%` : 'auto',
                // For immersive, allow natural height. For normal, constrain.
            }}
          >
             <img
              src={slide.imageUrl}
              alt={`Slide ${slide.pageNumber}`}
              className={`${isImmersive ? 'w-full h-auto' : 'max-w-full max-h-[calc(100vh-160px)]'} object-contain bg-white pointer-events-none select-none block`}
            />

            {annotations.map((note) => {
                const isActive = activeNoteId === note.id;
                const isEditing = editingId === note.id;
                
                // Scale annotation fonts/dimensions inversely if we were transforming, but we are scaling container width.
                // So visual size of font increases with zoom automatically.
                
                return (
                <div
                    key={note.id}
                    className={`absolute rounded-lg shadow-lg border backdrop-blur-sm flex flex-col group transition-all ${
                        isActive 
                            ? 'z-50 shadow-2xl ring-2 ring-blue-400 border-amber-300' 
                            : 'z-20 hover:z-30 border-amber-200/50'
                    }`}
                    style={{
                        left: `${note.x}%`,
                        top: `${note.y}%`,
                        width: `${note.width || 240}px`, 
                        height: `${note.height || 100}px`,
                        backgroundColor: 'rgba(255, 252, 235, 0.95)',
                        transform: 'translate(-5px, -5px)', // Center the anchor point slightly
                        cursor: isEditing ? 'text' : 'grab'
                    }}
                    onMouseDown={(e) => handleDragStart(e, note)}
                    onDoubleClick={(e) => handleDoubleClick(e, note)}
                >
                    {/* Toolbar (Visible on Hover or Active) */}
                    {(isActive) && (
                    <div 
                        className="absolute -top-11 left-0 flex items-center space-x-1 bg-slate-800 rounded-lg p-1.5 shadow-xl z-[60]"
                        onMouseDown={(e) => e.stopPropagation()} 
                    >
                        {/* Font Size */}
                        <button onMouseDown={(e) => handleFontSize(e, note, -2)} className="text-white hover:bg-slate-600 p-1 rounded"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="text-xs text-white font-mono w-6 text-center">{note.fontSize || 14}</span>
                        <button onMouseDown={(e) => handleFontSize(e, note, 2)} className="text-white hover:bg-slate-600 p-1 rounded"><Plus className="w-3.5 h-3.5" /></button>
                        
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>

                        {/* Bold */}
                        <button 
                            onMouseDown={(e) => handleBold(e, note)}
                            className={`p-1 rounded ${note.isBold ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            <Bold className="w-3.5 h-3.5" />
                        </button>
                        
                        <div className="w-px h-4 bg-slate-600 mx-1"></div>

                        {/* Colors */}
                        <div className="flex space-x-1 px-1">
                            {COLORS.map(c => (
                                <button
                                    key={c.name}
                                    onMouseDown={(e) => handleColor(e, note, c.hex)}
                                    className={`w-3 h-3 rounded-full border border-slate-600 ${note.color === c.hex ? 'ring-2 ring-white scale-110' : ''}`}
                                    style={{ backgroundColor: c.hex }}
                                />
                            ))}
                        </div>

                        <div className="w-px h-4 bg-slate-600 mx-1"></div>

                        {/* Delete */}
                        <button onMouseDown={(e) => { e.stopPropagation(); onDeleteAnnotation(note.id); }} className="text-rose-400 hover:bg-rose-900/50 p-1 rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    )}

                    {/* CONTENT */}
                    <div 
                        className="p-3 w-full h-full font-medium leading-relaxed overflow-auto"
                        style={{ 
                            fontSize: `${note.fontSize || 14}px`, 
                            color: note.color || '#111827',
                            fontWeight: note.isBold ? 'bold' : 'normal',
                            lineHeight: '1.5',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word'
                        }}
                    >
                        {isEditing ? (
                            <div
                                ref={editorRef}
                                contentEditable
                                suppressContentEditableWarning
                                className="w-full h-full bg-transparent focus:outline-none p-0 m-0 border-none cursor-text select-text"
                                style={{ 
                                    fontSize: 'inherit', 
                                    color: 'inherit',
                                    fontWeight: 'inherit',
                                    lineHeight: 'inherit',
                                    fontFamily: 'inherit',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'break-word'
                                }}
                                onKeyDown={handleEditorKeyDown}
                                onInput={handleEditorInput}
                                onBlur={handleEditorBlur}
                                onMouseDown={(e) => e.stopPropagation()}
                                // 移除 dangerouslySetInnerHTML，改用 useEffect 初始化
                            />
                        ) : (
                            <div 
                                className="w-full h-full select-none pointer-events-none"
                                style={{ 
                                    whiteSpace: 'pre-wrap', 
                                    wordBreak: 'break-word',
                                    overflowWrap: 'break-word',
                                    // 确保 KaTeX 公式不会被拆分
                                    overflow: 'auto'
                                }}
                                dangerouslySetInnerHTML={{ __html: note.text }} 
                            />
                        )}
                    </div>

                    {/* RESIZE HANDLE */}
                    {!isEditing && (
                        <div 
                            className={`absolute bottom-0 right-0 p-2 cursor-nwse-resize transition-opacity z-[60] hover:bg-amber-100 rounded-tl-lg ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            onMouseDown={(e) => handleResizeStart(e, note)}
                        >
                            <Scaling className="w-4 h-4 text-amber-500 fill-amber-100" />
                        </div>
                    )}
                </div>
                );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center z-10 flex flex-col items-center gap-8">
          <div className="max-w-md bg-white/60 backdrop-blur-sm p-10 rounded-[32px] border border-white shadow-xl">
            <div className="bg-white p-6 rounded-full shadow-sm inline-block mb-6 ring-8 ring-amber-50">
              <Coffee className="w-12 h-12 text-amber-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">还没有课件哦</h3>
            <p className="text-slate-500 mb-6 leading-relaxed">请上传 PDF 开始使用</p>
            <div className="inline-flex items-center px-5 py-2.5 bg-white border border-stone-200 rounded-full text-xs font-bold text-stone-400 shadow-sm">
              支持 PDF, PNG, JPG
            </div>
          </div>
          <p className="text-xs font-semibold text-stone-400 tracking-widest flex items-center gap-1">
            SCROLL DOWN
            <ChevronDown className="w-4 h-4" />
          </p>
        </div>
      )}
    </div>
  );
};