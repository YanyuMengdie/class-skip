import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { mindMapFlowNodeId, type MindMapFlowNodeData } from '@/features/review/lib/mindMap/mindMapFlowAdapter';

// Presentation only; the original text remains intact in the details and saved map.
function compactLabel(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const heading = clean.split(/[：:。；;]/)[0];
  if (heading.length >= 4 && heading.length <= limit) return heading;
  return `${clean.slice(0, limit - 1)}…`;
}

export const MindMapFlowNode: React.FC<NodeProps<Node<MindMapFlowNodeData>>> = ({ data, selected }) => {
  const { node, scope, depth, width, height, expanded, onToggle, onInspect } = data;
  const id = mindMapFlowNodeId(scope, node.id);
  const count = node.children?.length ?? 0;
  return (
    <div className={`mm-node ${depth === 0 ? 'mm-node-root' : depth === 1 ? 'mm-node-branch' : ''} ${selected ? 'is-selected' : ''}`} style={{ width, height }}>
      <Handle type="target" position={Position.Left} className="mm-handle" />
      <Handle type="source" position={Position.Right} className="mm-handle" />
      <button type="button" className="mm-node-label nodrag nopan" onClick={() => onInspect?.(id)} title="查看完整内容" aria-label={`查看 ${node.label}`}>
        <span>{compactLabel(node.label, 54)}</span>
        {node.labelEn?.trim() && <small>{compactLabel(node.labelEn, 74)}</small>}
      </button>
      {count > 0 && <button type="button" className="mm-branch-toggle nodrag nopan" onClick={(e) => { e.stopPropagation(); onToggle?.(id); }} aria-expanded={expanded} aria-label={`${expanded ? '收起' : '展开'} ${node.label} 的 ${count} 个分支`} title={expanded ? '收起分支' : `展开 ${count} 个分支`}>
        {expanded ? <ChevronLeft size={14} /> : <><span>{count}</span><ChevronRight size={12} /></>}
      </button>}
    </div>
  );
};
