import React, { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { Plus, PenLine, Trash2, Check } from 'lucide-react';
import type { MindMapFlowNodeData } from '@/utils/mindMapFlowAdapter';
import { mindMapFlowNodeId } from '@/utils/mindMapFlowAdapter';
import { getMindMapNodeLabel } from '@/utils/mindMapLabel';
import type { MindMapNode } from '@/types';

const BRANCH_COLORS = [
  { bg: 'rgb(186 230 253)', border: 'rgb(56 189 248)' },
  { bg: 'rgb(167 243 208)', border: 'rgb(45 212 191)' },
  { bg: 'rgb(224 231 255)', border: 'rgb(129 140 248)' },
  { bg: 'rgb(254 249 195)', border: 'rgb(250 204 21)' },
  { bg: 'rgb(254 226 226)', border: 'rgb(248 113 113)' },
  { bg: 'rgb(240 249 255)', border: 'rgb(59 130 246)' }
];

function pillStyle(data: MindMapFlowNodeData): React.CSSProperties {
  const { node, depth, siblingIndex } = data;
  const isRoot = depth === 0;
  if (isRoot) {
    return { background: 'rgb(224 242 254)', border: '1px solid rgb(56 189 248)' };
  }
  if (depth === 1 && siblingIndex >= 0) {
    const c = BRANCH_COLORS[siblingIndex % BRANCH_COLORS.length];
    return { background: c.bg, border: `1px solid ${c.border}` };
  }
  return {
    border: '1px solid rgb(226 232 240)',
    background: 'rgb(248 250 252)',
    boxShadow: '0 1px 3px rgba(15,23,42,0.06)'
  };
}

export const MindMapFlowNode: React.FC<NodeProps<Node<MindMapFlowNodeData>>> = ({ data }) => {
  const { node, scope, depth, siblingIndex, width, height, handlers, suggestedByParent, hoveredEdgeKey } = data;
  const scopedId = mindMapFlowNodeId(scope, node.id);
  const suggestedForParent = suggestedByParent?.[node.id];
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(node.label);
  const isRoot = depth === 0;

  useEffect(() => {
    if (!editing) setLabel(node.label);
  }, [node.id, node.label, editing]);

  const isEdgeHighlight =
    hoveredEdgeKey &&
    (() => {
      const [a, b] = hoveredEdgeKey.split('|');
      return a === scopedId || b === scopedId;
    })();

  const saveLabel = () => {
    if (label.trim()) handlers.onUpdate(node.id, (n) => ({ ...n, label: label.trim() }));
    setEditing(false);
  };

  const innerW = Math.max(120, width - 88);

  return (
    <div
      className="relative"
      style={{ width, minHeight: height }}
      data-no-pan
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />

      <div className="flex flex-row items-start gap-1.5 group">
        {editing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => e.key === 'Enter' && saveLabel()}
            className="min-w-[120px] max-w-[280px] px-3 py-2 text-sm text-black border border-teal-400 rounded bg-white"
            style={
              isRoot
                ? { borderRadius: 10, background: 'rgb(187 247 208)', width: innerW }
                : { width: innerW }
            }
            autoFocus
          />
        ) : (
          <div onDoubleClick={() => setEditing(true)} className="cursor-text max-w-[260px]">
            <div
              className={
                `inline-flex items-center px-4 py-2 text-[13px] leading-snug font-medium text-slate-900 whitespace-normal break-words ` +
                `min-w-[120px] max-w-[260px] shrink-0 rounded-full shadow-sm shadow-sky-100 bg-white ` +
                `transition-transform transition-shadow duration-150 ` +
                `${isEdgeHighlight ? 'ring-2 ring-sky-400 shadow-md scale-[1.02]' : 'group-hover:shadow-md group-hover:-translate-y-0.5 hover:scale-[1.02]'} `
              }
              style={{ ...pillStyle(data), width: innerW, minHeight: height - 4 }}
            >
              {getMindMapNodeLabel(node)}
            </div>
          </div>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
          <button
            type="button"
            onClick={() => handlers.onAddChild(node.id)}
            className="p-1 rounded text-teal-600 hover:bg-teal-100"
            title="添加子节点"
            aria-label="添加子节点"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handlers.onAddSibling(node.id)}
            className="p-1 rounded text-stone-500 hover:bg-stone-100"
            title="添加同级"
            aria-label="添加同级"
          >
            <PenLine className="w-3.5 h-3.5" />
          </button>
          {node.id !== 'root' && (
            <button
              type="button"
              onClick={() => handlers.onDelete(node.id)}
              className="p-1 rounded text-rose-500 hover:bg-rose-100"
              title="删除"
              aria-label="删除节点"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {suggestedForParent && suggestedForParent.length > 0 && (
        <div className="mt-1.5 max-w-[min(260px,100%)] pl-3 border-l-2 border-amber-300 bg-amber-50/80 rounded-r py-1">
          <span className="text-xs text-amber-800 font-bold">AI 建议补充：</span>
          {suggestedForParent.map((s: MindMapNode) => (
            <div key={s.id} className="flex items-center gap-2 text-sm text-amber-900 mt-0.5">
              <span>{s.label}</span>
              {handlers.onApplySuggestion && (
                <button
                  type="button"
                  onClick={() => handlers.onApplySuggestion!(node.id, s)}
                  className="text-teal-600 hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> 应用
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
