import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { MindMapNode } from '@/types';
import { MIND_MAP_FLOW_NODE_TYPE, mindMapNodeToFlow, type MindMapFlowNodeData, type MindMapFlowNodeHandlers } from '@/features/review/lib/mindMap/mindMapFlowAdapter';
import { layoutFlowForest } from '@/features/review/lib/mindMap/mindMapElkLayout';
import { MindMapFlowNode } from '@/features/review/tools/mindMap/MindMapFlowNode';

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
  /** 每棵树独立回调（多文档时更新对应 perDoc） */
  handlers: MindMapFlowNodeHandlers;
};

type MindMapFlowCanvasProps = {
  parts: TreePart[];
  /** 节点数超过此值时显示轻提示 */
  largeTreeThreshold?: number;
};

const nodeTypes = { [MIND_MAP_FLOW_NODE_TYPE]: MindMapFlowNode };

const MindMapFlowInner = forwardRef<MindMapFlowCanvasRef, MindMapFlowCanvasProps>(function MindMapFlowInner(
  { parts, largeTreeThreshold = 200 },
  ref
) {
  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow();
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MindMapFlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [fitToken, setFitToken] = useState(0);
  const layoutVersionRef = useRef(0);
  const partsRef = useRef(parts);
  partsRef.current = parts;

  const partsKey = useMemo(
    () =>
      JSON.stringify(
        parts.map((p) => ({
          scope: p.scope,
          tree: p.tree,
          sug: p.suggestedByParent ? Object.keys(p.suggestedByParent) : []
        }))
      ),
    [parts]
  );

  useImperativeHandle(
    ref,
    () => ({
      fitView: () => fitView({ padding: 0.15, duration: 200 }),
      resetViewport: () => setViewport({ x: 0, y: 0, zoom: 1 }),
      zoomIn: () => zoomIn({ duration: 200 }),
      zoomOut: () => zoomOut({ duration: 200 })
    }),
    [fitView, setViewport, zoomIn, zoomOut]
  );

  useEffect(() => {
    let cancelled = false;
    const v = ++layoutVersionRef.current;

    const run = async () => {
      if (parts.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const combined = partsRef.current.map((p) =>
        mindMapNodeToFlow(p.tree, p.scope, p.suggestedByParent, p.handlers, null)
      );

      try {
        const { positions } = await layoutFlowForest(combined);
        if (cancelled || v !== layoutVersionRef.current) return;

        const mergedNodes: Node<MindMapFlowNodeData>[] = [];
        for (const c of combined) {
          for (const n of c.nodes) {
            const pos = positions[n.id] ?? { x: 0, y: 0 };
            mergedNodes.push({
              ...n,
              position: pos,
              data: {
                ...n.data,
                hoveredEdgeKey: null
              }
            });
          }
        }
        const mergedEdges: Edge[] = combined.flatMap((c) => c.edges);

        setNodes(mergedNodes);
        setEdges(mergedEdges);
        setFitToken((t) => t + 1);
      } catch (e) {
        console.error('ELK layout failed', e);
      }
    };

    const t = window.setTimeout(run, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [partsKey, setNodes, setEdges]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const part = partsRef.current.find((p) => p.scope === n.data.scope);
        return {
          ...n,
          data: {
            ...n.data,
            hoveredEdgeKey,
            handlers: part?.handlers ?? n.data.handlers
          }
        };
      })
    );
  }, [hoveredEdgeKey, setNodes]);

  useEffect(() => {
    if (fitToken === 0) return;
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 200 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitToken, fitView]);

  const totalNodes = nodes.length;
  const showLargeHint = totalNodes >= largeTreeThreshold;

  return (
    <div className="absolute inset-0 bg-slate-50">
      {showLargeHint && (
        <div className="absolute top-2 left-2 z-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs px-2 py-1 max-w-sm pointer-events-none">
          节点较多（{totalNodes}），若卡顿可适当缩小视口或分批编辑。
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnScroll={false}
        zoomOnPinch
        panOnDrag
        minZoom={0.15}
        maxZoom={2}
        onEdgeMouseEnter={(_, e) => {
          setHoveredEdgeKey(e.id);
          partsRef.current[0]?.handlers.onEdgeHover(e.id);
        }}
        onEdgeMouseLeave={() => {
          setHoveredEdgeKey(null);
          partsRef.current[0]?.handlers.onEdgeHover(null);
        }}
        fitView={false}
      >
        <Background gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="!bg-white/95 !border-stone-200 !shadow-md" />
        <MiniMap className="!bg-white/90 !border-stone-200" nodeStrokeWidth={2} zoomable pannable />
      </ReactFlow>
    </div>
  );
});

export const MindMapFlowCanvas = forwardRef<MindMapFlowCanvasRef, MindMapFlowCanvasProps>(function MindMapFlowCanvas(
  props,
  ref
) {
  return (
    <ReactFlowProvider>
      <MindMapFlowInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});
