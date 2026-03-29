/** 多文档并排时避免 node id 在 Flow / 布局 key 中互相覆盖（MindMapNode.id 不变，仅运行时 key 加前缀） */
export const SCOPE_SEP = '\u2060doc\u2060';

export function scopeMindMapNodeId(scope: string, id: string): string {
  return scope ? `${scope}${SCOPE_SEP}${id}` : id;
}
