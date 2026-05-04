/**
 * MindMapNode ↔ @xyflow/react 数据映射；边界在 MindMapPanel / Flow 画布内，不改 geminiService 契约。
 */
import type { Edge, Node } from '@xyflow/react';
import type { MindMapNode } from '@/types';
import { buildMindMapNodeMeta, estimateNodeBox, DEFAULT_MIND_MAP_LAYOUT } from '@/utils/mindMapLayout';
import { scopeMindMapNodeId } from '@/utils/mindMapScope';

export const MIND_MAP_FLOW_NODE_TYPE = 'mindMap';

export type MindMapFlowNodeData = {
  node: MindMapNode;
  scope: string;
  depth: number;
  siblingIndex: number;
  width: number;
  height: number;
  /** 由父层注入，供自定义节点内编辑 / 增删 */
  handlers: MindMapFlowNodeHandlers;
  suggestedByParent?: Record<string, MindMapNode[]>;
  hoveredEdgeKey: string | null;
};

export type MindMapFlowNodeHandlers = {
  onUpdate: (id: string, updater: (n: MindMapNode) => MindMapNode) => void;
  onAddChild: (parentId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onApplySuggestion?: (parentId: string, node: MindMapNode) => void;
  onEdgeHover: (key: string | null) => void;
};

/** 全局唯一 Flow id：与 scopeMindMapNodeId 一致（多文档天然区分） */
export function mindMapFlowNodeId(scope: string, nodeId: string): string {
  return scopeMindMapNodeId(scope, nodeId);
}

function buildSuggestionExtraHeight(suggestedByParent?: Record<string, MindMapNode[]>): Record<string, number> | undefined {
  if (!suggestedByParent) return undefined;
  const out: Record<string, number> = {};
  for (const [pid, nodes] of Object.entries(suggestedByParent)) {
    if (nodes?.length) out[pid] = 12 + nodes.length * 28;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 将单棵树转为 Flow nodes/edges；position 占位，由 ELK 结果覆盖。
 */
export function mindMapNodeToFlow(
  root: MindMapNode,
  scope: string,
  suggestedByParent: Record<string, MindMapNode[]> | undefined,
  handlers: MindMapFlowNodeHandlers,
  hoveredEdgeKey: string | null
): { nodes: Node<MindMapFlowNodeData>[]; edges: Edge[] } {
  const meta = buildMindMapNodeMeta(root);
  const extra = buildSuggestionExtraHeight(suggestedByParent);
  const nodes: Node<MindMapFlowNodeData>[] = [];
  const edges: Edge[] = [];

  const dimFor = (n: MindMapNode) => {
    const ex = extra?.[n.id] ?? 0;
    return estimateNodeBox(n, DEFAULT_MIND_MAP_LAYOUT, ex);
  };

  const walk = (n: MindMapNode, parentFlowId?: string) => {
    const id = mindMapFlowNodeId(scope, n.id);
    const m = meta.get(n.id) ?? { depth: 0, siblingIndex: -1 };
    const { width, height } = dimFor(n);
    const tw = DEFAULT_MIND_MAP_LAYOUT.toolbarWidth;
    const w = width + tw;
    const h = height;

    nodes.push({
      id,
      type: MIND_MAP_FLOW_NODE_TYPE,
      position: { x: 0, y: 0 },
      data: {
        node: n,
        scope,
        depth: m.depth,
        siblingIndex: m.siblingIndex,
        width: w,
        height: h,
        handlers,
        suggestedByParent,
        hoveredEdgeKey
      }
    });

    if (parentFlowId) {
      const eid = `${parentFlowId}|${id}`;
      edges.push({
        id: eid,
        source: parentFlowId,
        target: id,
        type: 'smoothstep',
        style: { stroke: 'rgba(148, 163, 184, 0.95)', strokeWidth: 1.45 },
        animated: false,
        className: 'mind-map-edge'
      });
    }

    for (const c of n.children || []) {
      walk(c, id);
    }
  };

  walk(root);
  return { nodes, edges };
}
