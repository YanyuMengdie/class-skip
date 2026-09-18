/** View-only mapping: collapsed branches never remove saved source nodes. */
import type { Edge, Node } from '@xyflow/react';
import type { MindMapNode } from '@/types';
import { scopeMindMapNodeId } from './mindMapScope';

export const MIND_MAP_FLOW_NODE_TYPE = 'mindMap';
export type MindMapFlowNodeHandlers = {
  onUpdate: (id: string, updater: (n: MindMapNode) => MindMapNode) => void;
  onAddChild: (parentId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onApplySuggestion?: (parentId: string, node: MindMapNode) => void;
  onEdgeHover: (key: string | null) => void;
};
export type MindMapFlowNodeData = {
  node: MindMapNode;
  scope: string;
  depth: number;
  siblingIndex: number;
  width: number;
  height: number;
  handlers: MindMapFlowNodeHandlers;
  suggestedByParent?: Record<string, MindMapNode[]>;
  hoveredEdgeKey: string | null;
  expanded: boolean;
  onToggle?: (id: string) => void;
  onInspect?: (id: string) => void;
};
export function mindMapFlowNodeId(scope: string, nodeId: string): string {
  return scopeMindMapNodeId(scope, nodeId);
}

export function mindMapNodeToFlow(
  root: MindMapNode,
  scope: string,
  suggestedByParent: Record<string, MindMapNode[]> | undefined,
  handlers: MindMapFlowNodeHandlers,
  hoveredEdgeKey: string | null,
  expansion: Record<string, boolean> = {},
  onToggle?: (id: string) => void,
  onInspect?: (id: string) => void
): { nodes: Node<MindMapFlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<MindMapFlowNodeData>[] = [];
  const edges: Edge[] = [];
  const walk = (node: MindMapNode, depth: number, siblingIndex: number, parentId?: string) => {
    const id = mindMapFlowNodeId(scope, node.id);
    const expanded = expansion[id] ?? depth === 0;
    const width = depth === 0 ? 260 : 248;
    const height = node.labelEn?.trim() ? 114 : 86;
    nodes.push({
      id, type: MIND_MAP_FLOW_NODE_TYPE, position: { x: 0, y: 0 },
      width, height,
      data: { node, scope, depth, siblingIndex, width, height, handlers,
        suggestedByParent, hoveredEdgeKey, expanded, onToggle, onInspect }
    });
    if (parentId) edges.push({
      id: `${parentId}|${id}`, source: parentId, target: id, type: 'default',
      style: { stroke: '#a6b6a8', strokeWidth: 1.6 },
      animated: false, className: 'mind-map-edge'
    });
    if (expanded) (node.children ?? []).forEach((child, i) => walk(child, depth + 1, i, id));
  };
  walk(root, 0, -1);
  return { nodes, edges };
}
