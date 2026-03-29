/**
 * 思维导图面板 — 第四步 — 档 B（中等：分层 + 预计算位置）
 *
 * 横向思维导图层次布局（Reingold–Tilford 思想：子树上下堆叠、父节点对齐子带垂直中心；深度决定水平层）。
 * 纯函数、无副作用；坐标与 MindMapPanel 画布局部 / SVG user 空间一致（未缩放 CSS px，原点在内容区左上角）。
 */

import type { MindMapNode } from '../types';

/** 单节点占位框（与 NodeBox + 右侧工具按钮行总宽一致，用于层间距与不重叠） */
export interface MindMapLayoutBox {
  x: number;
  y: number;
  /** NodeBox 宽度（连线锚在 pill 右缘） */
  nodeBoxWidth: number;
  nodeBoxHeight: number;
  /** 整行宽度 = nodeBoxWidth + toolbarWidth */
  rowWidth: number;
}

export interface MindMapLayoutResult {
  /** 节点 id -> 布局框（同一棵树内 id 唯一） */
  boxes: Record<string, MindMapLayoutBox>;
  contentWidth: number;
  contentHeight: number;
}

export interface MindMapLayoutOptions {
  padding: number;
  /** 相邻深度列之间的水平间隙（父行右缘 → 子列左缘） */
  horizontalGap: number;
  /** 兄弟子树之间的垂直间隙（验收建议 ≥8～12px） */
  verticalSiblingGap: number;
  nodeMinWidth: number;
  nodeMaxWidth: number;
  /** 右侧加子/同级/删除 按钮占位 */
  toolbarWidth: number;
  /** 估算用：约 13px 字、max-w-[260px] */
  charsPerLine: number;
  lineHeight: number;
}

export const DEFAULT_MIND_MAP_LAYOUT: MindMapLayoutOptions = {
  padding: 24,
  horizontalGap: 56,
  verticalSiblingGap: 12,
  nodeMinWidth: 120,
  nodeMaxWidth: 260,
  toolbarWidth: 88,
  charsPerLine: 22,
  lineHeight: 22
};

function getLabelText(node: MindMapNode): string {
  if (node.labelEn?.trim()) return `${node.labelEn}（${node.label}）`;
  return node.label || '';
}

/**
 * 按文本长度估算 NodeBox 尺寸（与 Tailwind max-w-[260px]、padding 大致一致）
 */
export function estimateNodeBox(
  node: MindMapNode,
  opts: MindMapLayoutOptions,
  extraHeight = 0
): { width: number; height: number } {
  const text = getLabelText(node);
  const lines = Math.max(1, Math.ceil(text.length / opts.charsPerLine));
  const w = Math.min(
    opts.nodeMaxWidth,
    Math.max(opts.nodeMinWidth, 72 + Math.min(text.length, 140) * 1.65)
  );
  const h = Math.max(40, lines * opts.lineHeight + 8 + extraHeight);
  return { width: w, height: h };
}

interface SubtreeSpan {
  top: number;
  bottom: number;
}

/**
 * 后序堆叠子树：兄弟子树在垂直方向首尾相接 + verticalSiblingGap；
 * 父节点 y 置于子树块几何垂直中心（RT 常见目标）。
 */
function layoutSubtree(
  node: MindMapNode,
  depth: number,
  x: number,
  yCursor: number,
  opts: MindMapLayoutOptions,
  extraHeightById: Record<string, number> | undefined,
  boxes: Record<string, MindMapLayoutBox>
): SubtreeSpan {
  const extra = extraHeightById?.[node.id] ?? 0;
  const { width: bw, height: bh } = estimateNodeBox(node, opts, extra);
  const rowW = bw + opts.toolbarWidth;

  const children = node.children && node.children.length > 0 ? node.children : null;
  if (!children) {
    const y = yCursor;
    boxes[node.id] = {
      x,
      y,
      nodeBoxWidth: bw,
      nodeBoxHeight: bh,
      rowWidth: rowW
    };
    return { top: y, bottom: y + bh };
  }

  let curY = yCursor;
  let minTop = Infinity;
  let maxBot = -Infinity;
  const childX = x + rowW + opts.horizontalGap;

  for (const c of children) {
    const span = layoutSubtree(c, depth + 1, childX, curY, opts, extraHeightById, boxes);
    minTop = Math.min(minTop, span.top);
    maxBot = Math.max(maxBot, span.bottom);
    curY = span.bottom + opts.verticalSiblingGap;
  }

  const blockMid = (minTop + maxBot) / 2;
  const py = blockMid - bh / 2;
  boxes[node.id] = {
    x,
    y: py,
    nodeBoxWidth: bw,
    nodeBoxHeight: bh,
    rowWidth: rowW
  };

  const pTop = Math.min(minTop, py);
  const pBot = Math.max(maxBot, py + bh);
  return { top: pTop, bottom: pBot };
}

function normalizeBoxes(boxes: Record<string, MindMapLayoutBox>, opts: MindMapLayoutOptions): MindMapLayoutResult {
  let minX = Infinity;
  let minY = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  for (const b of Object.values(boxes)) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxR = Math.max(maxR, b.x + b.rowWidth);
    maxB = Math.max(maxB, b.y + b.nodeBoxHeight);
  }
  if (!Number.isFinite(minX)) {
    return { boxes: {}, contentWidth: opts.padding * 2, contentHeight: opts.padding * 2 };
  }
  const dx = opts.padding - minX;
  const dy = opts.padding - minY;
  const out: Record<string, MindMapLayoutBox> = {};
  for (const [id, b] of Object.entries(boxes)) {
    out[id] = {
      ...b,
      x: b.x + dx,
      y: b.y + dy
    };
  }
  const contentWidth = maxR - minX + opts.padding * 2;
  const contentHeight = maxB - minY + opts.padding * 2;
  return { boxes: out, contentWidth, contentHeight };
}

/**
 * 计算一棵树的绝对布局（根在左，向右展开；深度越大 x 越大）。
 */
export function computeMindMapLayout(
  root: MindMapNode,
  opts: MindMapLayoutOptions = DEFAULT_MIND_MAP_LAYOUT,
  extraHeightById?: Record<string, number>
): MindMapLayoutResult {
  const raw: Record<string, MindMapLayoutBox> = {};
  layoutSubtree(root, 0, 0, 0, opts, extraHeightById, raw);
  return normalizeBoxes(raw, opts);
}

/** DFS 扁平化（稳定顺序） */
export function flattenMindMapNodes(root: MindMapNode): MindMapNode[] {
  const out: MindMapNode[] = [];
  const walk = (n: MindMapNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

/** depth；仅深度 1 的节点使用 siblingIndex 作分支色，更深节点为 -1（与原先 EditableNode 一致） */
export function buildMindMapNodeMeta(root: MindMapNode): Map<
  string,
  { depth: number; siblingIndex: number }
> {
  const map = new Map<string, { depth: number; siblingIndex: number }>();
  const walk = (n: MindMapNode, depth: number, rootBranchIdx: number) => {
    const siblingIndex = depth === 1 ? rootBranchIdx : -1;
    map.set(n.id, { depth, siblingIndex });
    n.children?.forEach((c, i) => {
      const rb = depth === 0 ? i : rootBranchIdx;
      walk(c, depth + 1, rb);
    });
  };
  walk(root, 0, -1);
  return map;
}

/** 与第三步 SVG 中 NodePosition 一致：cx/cy 为几何中心 */
export function layoutBoxToNodePosition(box: MindMapLayoutBox): {
  cx: number;
  cy: number;
  width: number;
  height: number;
} {
  return {
    cx: box.x + box.nodeBoxWidth / 2,
    cy: box.y + box.nodeBoxHeight / 2,
    width: box.nodeBoxWidth,
    height: box.nodeBoxHeight
  };
}
