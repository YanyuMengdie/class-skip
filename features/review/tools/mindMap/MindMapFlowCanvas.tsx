import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Background, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { X, Plus, Pencil, Trash2, Check, ChevronRight } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './mindMap.css';
import type { MindMapNode } from '@/types';
import { MIND_MAP_FLOW_NODE_TYPE, mindMapNodeToFlow, type MindMapFlowNodeData, type MindMapFlowNodeHandlers } from '@/features/review/lib/mindMap/mindMapFlowAdapter';
import { layoutFlowForest } from '@/features/review/lib/mindMap/mindMapElkLayout';
import { MindMapFlowNode } from './MindMapFlowNode';

export type MindMapFlowCanvasRef = {
  fitView: () => void;
  resetViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};
export type TreePart = {
  scope: string;
  tree: MindMapNode;
  suggestedByParent?: Record<string, MindMapNode[]>;
  handlers: MindMapFlowNodeHandlers;
};
type Props = { parts: TreePart[]; largeTreeThreshold?: number };
const nodeTypes = { [MIND_MAP_FLOW_NODE_TYPE]: MindMapFlowNode };

function NodeDetails({ data, onClose, onExpand }: { data: MindMapFlowNodeData; onClose: () => void; onExpand: () => void }) {
  const { node, depth, handlers } = data;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(node.label);
  const [english, setEnglish] = useState(node.labelEn ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!editing) { setLabel(node.label); setEnglish(node.labelEn ?? ''); }
  }, [node.label, node.labelEn, editing]);
  const suggestions = data.suggestedByParent?.[node.id] ?? [];
  return <aside className="mm-details" aria-label="节点详情" onKeyDown={(e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }}>
    <div className="mm-details-heading"><span>概念详情</span><button className="mm-icon" onClick={onClose} aria-label="关闭节点详情"><X size={18} /></button></div>
    {editing ? <form onSubmit={(e) => {
      e.preventDefault();
      if (!label.trim()) return;
      handlers.onUpdate(node.id, n => ({ ...n, label: label.trim(), labelEn: english.trim() }));
      setEditing(false);
    }}>
      <label className="mm-field">名称与内容<textarea autoFocus value={label} onChange={e => setLabel(e.target.value)} required /></label>
      <label className="mm-field">另一语言（可留空）<textarea value={english} onChange={e => setEnglish(e.target.value)} /></label>
      <div className="mm-actions"><button className="mm-primary" type="submit">保存</button><button className="mm-button" type="button" onClick={() => setEditing(false)}>取消</button></div>
    </form> : <><h2>{node.label}</h2>{node.labelEn && <p className="mm-detail-english">{node.labelEn}</p>}</>}
    <p className="mm-caption">这里显示已保存的完整节点内容。</p>
    {!!node.children?.length && <div className="mm-detail-section"><h3>{node.children.length} 个分支</h3><ul>{node.children.map(child => <li key={child.id}>{child.label}</li>)}</ul><button className="mm-text-button" onClick={onExpand}>在图中{data.expanded ? '收起' : '展开'}分支 <ChevronRight size={15} /></button></div>}
    <div className="mm-detail-section mm-actions">
      <button className="mm-button" onClick={() => setEditing(true)}><Pencil size={15} /> 编辑文字</button>
      <button className="mm-button" onClick={() => { if (!data.expanded) onExpand(); handlers.onAddChild(node.id); }}><Plus size={15} /> 添加分支</button>
      {depth > 0 && <button className="mm-button" onClick={() => handlers.onAddSibling(node.id)}><Plus size={15} /> 添加同级</button>}
      {depth > 0 && <button className="mm-text-button mm-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> 删除节点</button>}
    </div>
    {confirmDelete && <div className="mm-delete-confirm"><p>删除这个节点及其下方分支？</p><div className="mm-actions"><button className="mm-button mm-danger" onClick={() => { handlers.onDelete(node.id); onClose(); }}>删除</button><button className="mm-button" onClick={() => setConfirmDelete(false)}>保留</button></div></div>}
    {!!suggestions.length && <div className="mm-detail-section"><h3>建议补充</h3>{suggestions.map(suggestion => <div className="mm-suggestion" key={suggestion.id}><p>{suggestion.label}</p>{handlers.onApplySuggestion && <button className="mm-text-button" onClick={() => { if (!data.expanded) onExpand(); handlers.onApplySuggestion?.(node.id, suggestion); }}><Check size={15} /> 加入分支</button>}</div>)}</div>}
  </aside>;
}

const MindMapFlowInner = forwardRef<MindMapFlowCanvasRef, Props>(function MindMapFlowInner({ parts }, ref) {
  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MindMapFlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const anchorRef = useRef<string | null>(null);
  const positioned = useRef(false);
  const partsKey = useMemo(() => JSON.stringify(parts.map(p => ({ scope: p.scope, tree: p.tree, suggestions: p.suggestedByParent }))), [parts]);

  const toggle = useCallback((id: string) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (!node) return;
    anchorRef.current = id;
    setExpansion(prev => ({ ...prev, [id]: !node.data.expanded }));
  }, []);
  const inspect = useCallback((id: string) => { anchorRef.current = id; setSelectedId(id); }, []);

  useImperativeHandle(ref, () => ({
    fitView: () => { void fitView({ padding: 0.18, duration: 250, maxZoom: 1 }); },
    resetViewport: () => { positioned.current = false; anchorRef.current = null; setExpansion({}); setSelectedId(null); setResetToken(t => t + 1); },
    zoomIn: () => { void zoomIn({ duration: 180 }); },
    zoomOut: () => { void zoomOut({ duration: 180 }); }
  }), [fitView, zoomIn, zoomOut]);

  useEffect(() => {
    let cancelled = false;
    const combined = partsRef.current.map(p => mindMapNodeToFlow(p.tree, p.scope, p.suggestedByParent, p.handlers, null, expansion, toggle, inspect));
    const apply = (positions: Record<string, { x: number; y: number }>) => {
      if (cancelled) return;
      const oldAnchor = positioned.current ? nodesRef.current.find(n => n.id === anchorRef.current) ?? nodesRef.current[0] : undefined;
      const newAnchor = oldAnchor && positions[oldAnchor.id];
      const dx = oldAnchor && newAnchor ? oldAnchor.position.x - newAnchor.x : 0;
      const dy = oldAnchor && newAnchor ? oldAnchor.position.y - newAnchor.y : 0;
      const next = combined.flatMap(c => c.nodes).map(n => {
        const p = positions[n.id] ?? { x: 0, y: 0 };
        return { ...n, position: { x: p.x + dx, y: p.y + dy } };
      });
      setNodes(next);
      setEdges(combined.flatMap(c => c.edges));
      setSelectedId(id => next.some(n => n.id === id) ? id : null);
      if (!positioned.current && next.length) {
        positioned.current = true;
        // Start at readable scale, centered on the first topic, never fit a tall tree automatically.
        const root = next[0];
        const h = host.current?.clientHeight ?? 600;
        const w = host.current?.clientWidth ?? 900;
        const zoom = w < 600 ? 0.85 : 1;
        void setViewport({ x: w < 600 ? 28 : 64, y: h / 2 - (root.position.y + root.data.height / 2) * zoom, zoom });
      }
    };
    setLayoutError(false);
    layoutFlowForest(combined).then(result => apply(result.positions)).catch(() => {
      if (cancelled) return;
      setLayoutError(true);
      // Keep the map usable even if the automatic layout cannot finish.
      const positions: Record<string, { x: number; y: number }> = {};
      let offset = 0;
      combined.forEach(part => {
        const children = new Map<string, string[]>();
        part.edges.forEach(e => children.set(e.source, [...(children.get(e.source) ?? []), e.target]));
        let row = offset;
        const place = (id: string, depth: number): number => {
          const ys = (children.get(id) ?? []).map(child => place(child, depth + 1));
          const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : (row++ * 150);
          positions[id] = { x: depth * 340, y };
          return y;
        };
        if (part.nodes[0]) place(part.nodes[0].id, 0);
        offset = row + 1;
      });
      apply(positions);
    });
    return () => { cancelled = true; };
  }, [partsKey, expansion, resetToken, toggle, inspect, setNodes, setEdges, setViewport]);

  const selected = nodes.find(n => n.id === selectedId);
  const selectedPart = selected && parts.find(p => p.scope === selected.data.scope);
  return <div className="mm-workspace">
    <div className="mm-canvas" ref={host}>
      <div className="mm-canvas-hint">点击概念看详情 · 箭头展开分支 · 拖动画布{layoutError && <span>已使用简化排版</span>}</div>
      <ReactFlow nodes={nodes.map(n => ({ ...n, selected: n.id === selectedId }))} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable
        onNodeClick={(_, node) => inspect(node.id)} onPaneClick={() => setSelectedId(null)}
        deleteKeyCode={null} zoomOnScroll zoomOnPinch panOnDrag minZoom={0.15} maxZoom={2} fitView={false}>
        <Background gap={28} size={1} color="#d7dcd1" />
      </ReactFlow>
    </div>
    {selected && <NodeDetails key={selected.id} data={{ ...selected.data, handlers: selectedPart?.handlers ?? selected.data.handlers, suggestedByParent: selectedPart?.suggestedByParent }} onClose={() => setSelectedId(null)} onExpand={() => toggle(selected.id)} />}
  </div>;
});

export const MindMapFlowCanvas = forwardRef<MindMapFlowCanvasRef, Props>(function MindMapFlowCanvas(props, ref) {
  return <ReactFlowProvider><MindMapFlowInner {...props} ref={ref} /></ReactFlowProvider>;
});
