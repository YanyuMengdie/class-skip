import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical, Plus, Trash2, GripHorizontal, ChevronDown } from 'lucide-react';
import { SlidePageComment } from '../types';

const DEFAULT_BOX_HEIGHT = 80;
const MIN_BOX_HEIGHT = 56;
const MAX_BOX_HEIGHT = 400;

interface SlidePageCommentsProps {
  slideId: string | null;
  comments: SlidePageComment[];
  onAdd: () => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onResize?: (id: string, height: number) => void;
  /** 点击收起时调用，隐藏本页注释区域 */
  onCollapse?: () => void;
}

export const SlidePageComments: React.FC<SlidePageCommentsProps> = ({
  slideId,
  comments,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  onResize,
  onCollapse,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [focusNextAdded, setFocusNextAdded] = useState(false);
  const prevLengthRef = useRef(comments.length);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const resizingIdRef = useRef<string | null>(null);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingIdRef.current || !onResizeRef.current) return;
    const delta = e.clientY - resizeStartY.current;
    const newHeight = Math.max(MIN_BOX_HEIGHT, Math.min(MAX_BOX_HEIGHT, resizeStartHeight.current + delta));
    onResizeRef.current!(resizingIdRef.current, newHeight);
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (!resizingIdRef.current) return;
    resizingIdRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove, true);
    document.removeEventListener('mouseup', handleResizeEnd, true);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleResizeMove]);

  const handleResizeStart = (e: React.MouseEvent, comment: SlidePageComment) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onResize) return;
    resizingIdRef.current = comment.id;
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = comment.height ?? DEFAULT_BOX_HEIGHT;
    document.addEventListener('mousemove', handleResizeMove, true);
    document.addEventListener('mouseup', handleResizeEnd, true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove, true);
      document.removeEventListener('mouseup', handleResizeEnd, true);
    };
  }, []);

  const sortedComments = [...comments].sort((a, b) => a.orderIndex - b.orderIndex);

  useEffect(() => {
    if (focusNextAdded && sortedComments.length > prevLengthRef.current) {
      const last = sortedComments[sortedComments.length - 1];
      if (last && inputRefs.current[last.id]) {
        inputRefs.current[last.id]?.focus();
      }
      setFocusNextAdded(false);
    }
    prevLengthRef.current = sortedComments.length;
  }, [focusNextAdded, sortedComments.length]);

  const handleAdd = () => {
    onAdd();
    setFocusNextAdded(true);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if ((e.target as HTMLElement).closest?.('[data-resize-handle]')) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.setData('application/x-index', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index);
  };

  const handleDragLeave = () => setDragOverIndex(null);

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);
    if (fromIndex !== null && fromIndex !== toIndex) onReorder(fromIndex, toIndex);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (!slideId) return null;

  return (
    <div className="w-full h-full border-t border-stone-300 bg-stone-100/80 flex flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-stone-200 bg-stone-50/70">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">本页注释</span>
        </div>
        <div className="flex items-center gap-2">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200 text-[11px] font-medium transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              收起到底部
            </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 hover:border-stone-300 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            创建文本框
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 py-2 space-y-2">
        {sortedComments.length === 0 ? (
          <p className="text-xs text-stone-400 py-2 text-center">点击上方按钮添加本页注释</p>
        ) : (
          sortedComments.map((comment, index) => (
            <div
              key={comment.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={{ minHeight: comment.height ?? DEFAULT_BOX_HEIGHT }}
              className={`flex flex-col rounded-lg border bg-white shadow-sm transition-all ${
                draggedIndex === index ? 'opacity-50' : ''
              } ${dragOverIndex === index ? 'ring-2 ring-amber-400 border-amber-300' : 'border-stone-200'}`}
            >
              <div className="flex items-stretch flex-1 min-h-0 gap-2">
                <div
                  className="flex-shrink-0 flex items-center pl-2 cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                <textarea
                  ref={(el) => { inputRefs.current[comment.id] = el; }}
                  value={comment.text}
                  onChange={(e) => onUpdate(comment.id, e.target.value)}
                  placeholder="写点什么..."
                  className="flex-1 min-h-[44px] py-2 pr-2 text-sm text-stone-700 placeholder-stone-400 resize-none border-0 bg-transparent focus:outline-none focus:ring-0"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => onDelete(comment.id)}
                  className="flex-shrink-0 p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-r-lg transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {onResize && (
                <div
                  data-resize-handle
                  onMouseDown={(e) => handleResizeStart(e, comment)}
                  className="flex-shrink-0 h-4 flex items-center justify-center cursor-row-resize hover:bg-amber-50 active:bg-amber-100 rounded-b-lg border-t border-stone-200 select-none group relative z-10"
                  title="拖动调节高度"
                >
                  <GripHorizontal className="w-5 h-5 text-stone-400 group-hover:text-amber-500 pointer-events-none" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
