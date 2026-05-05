import type { Edge, Node } from '@xyflow/react';
// elkjs 浏览器 bundle（Vite 可直出）
import ELK from 'elkjs/lib/elk.bundled.js';
import type { MindMapFlowNodeData } from '@/features/review/lib/mindMap/mindMapFlowAdapter';

const elk = new ELK();

function collectElkPositions(elkNode: unknown, acc: Record<string, { x: number; y: number }>): void {
  if (!elkNode || typeof elkNode !== 'object') return;
  const n = elkNode as { id?: string; x?: number; y?: number; children?: unknown[] };
  if (n.id && typeof n.x === 'number' && typeof n.y === 'number') {
    acc[n.id] = { x: n.x, y: n.y };
  }
  if (Array.isArray(n.children)) {
    for (const c of n.children) collectElkPositions(c, acc);
  }
}

/**
 * 对一组 Flow 节点/边运行 ELK layered（右向），返回 id → position（与 React Flow 左上角一致）。
 */
export async function runElkLayoutOnFlow(
  nodes: Node<MindMapFlowNodeData>[],
  edges: Edge[]
): Promise<Record<string, { x: number; y: number }>> {
  if (nodes.length === 0) return {};

  const graph = {
    id: 'elk-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: Math.max(1, Math.ceil(n.data?.width ?? 120)),
      height: Math.max(1, Math.ceil(n.data?.height ?? 48))
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target]
    }))
  };

  const layout = await elk.layout(graph as Parameters<typeof elk.layout>[0]);
  const acc: Record<string, { x: number; y: number }> = {};
  collectElkPositions(layout, acc);
  return acc;
}

/**
 * 多棵子树纵向堆叠：每棵先 ELK，再平移到不重叠。
 */
export async function layoutFlowForest(
  parts: Array<{ nodes: Node<MindMapFlowNodeData>[]; edges: Edge[] }>
): Promise<{ positions: Record<string, { x: number; y: number }>; totalHeight: number; totalWidth: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  let yOff = 0;
  const gap = 48;
  let maxW = 400;

  for (const part of parts) {
    if (part.nodes.length === 0) continue;
    const local = await runElkLayoutOnFlow(part.nodes, part.edges);
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of part.nodes) {
      const p = local[n.id];
      if (!p) continue;
      const h = n.data?.height ?? 48;
      const w = n.data?.width ?? 120;
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + h);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + w);
    }
    if (!Number.isFinite(minY)) continue;
    const shiftX = -minX;
    const shiftY = -minY + yOff;
    for (const n of part.nodes) {
      const p = local[n.id];
      if (!p) continue;
      positions[n.id] = { x: p.x + shiftX, y: p.y + shiftY };
    }
    const blockH = maxY - minY;
    yOff += blockH + gap;
    maxW = Math.max(maxW, maxX - minX);
  }

  return { positions, totalHeight: Math.max(yOff - gap, 400), totalWidth: maxW };
}
