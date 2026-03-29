import type { MindMapNode } from '../types';

export function getMindMapNodeLabel(node: MindMapNode): string {
  if (node.labelEn?.trim()) return `${node.labelEn}（${node.label}）`;
  return node.label;
}
