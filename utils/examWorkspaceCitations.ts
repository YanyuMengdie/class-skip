/**
 * P1/P3：从备考苏格拉底助手回复中解析末尾 JSON citations，并剥离 fenced 块供 Markdown 展示。
 * P3 可选字段向后兼容：无则行为同 P1。
 * 1-3：若提供 chunk 白名单快照，优先解析行内 †chunkId†（U+2020）与可选 citedChunkIds JSON；否则回退到仅 JSON citations。
 */

import type { ExamChunkCitationSnapshot } from '../types';

export interface ExamWorkspaceCitation {
  materialId: string;
  page: number;
  /** P3：与正文块级渲染顺序对应的 0-based 索引（p/h1–h6/li/blockquote/pre 依次编号） */
  paragraphIndex?: number;
  /** P3：PDF 内高亮用短摘录（≤120 字），须来自真实讲义 */
  quote?: string;
  /** P3 备选锚点（当前前端未强制使用） */
  anchorId?: string;
  /** P3 备选：脆弱，不推荐 */
  afterTextSnippet?: string;
}

export interface ParsedExamWorkspaceCitations {
  /** 供用户阅读的 Markdown（已移除 citations JSON 代码块） */
  displayText: string;
  /** 解析到的引用（调用方需再按本场 materials 过滤） */
  citations: ExamWorkspaceCitation[];
}

function tryParseCitationsObject(obj: unknown): ExamWorkspaceCitation[] | null {
  if (!obj || typeof obj !== 'object') return null;
  const raw = obj as { citations?: unknown };
  if (!Array.isArray(raw.citations)) return null;
  const out: ExamWorkspaceCitation[] = [];
  for (const c of raw.citations) {
    if (!c || typeof c !== 'object') continue;
    const mid = (c as { materialId?: unknown }).materialId;
    const pg = (c as { page?: unknown }).page;
    if (typeof mid !== 'string' || !mid.trim()) continue;
    const pageNum =
      typeof pg === 'number'
        ? Math.floor(pg)
        : typeof pg === 'string'
          ? parseInt(pg.replace(/\D/g, ''), 10)
          : NaN;
    if (!Number.isFinite(pageNum) || pageNum < 1) continue;
    const row: ExamWorkspaceCitation = { materialId: mid.trim(), page: pageNum };
    const pi = (c as { paragraphIndex?: unknown }).paragraphIndex;
    if (typeof pi === 'number' && Number.isFinite(pi) && pi >= 0) {
      row.paragraphIndex = Math.floor(pi);
    }
    const q = (c as { quote?: unknown }).quote;
    if (typeof q === 'string' && q.trim()) {
      row.quote = q.trim().slice(0, 120);
    }
    const aid = (c as { anchorId?: unknown }).anchorId;
    if (typeof aid === 'string' && aid.trim()) row.anchorId = aid.trim();
    const snip = (c as { afterTextSnippet?: unknown }).afterTextSnippet;
    if (typeof snip === 'string' && snip.trim()) row.afterTextSnippet = snip.trim().slice(0, 200);
    out.push(row);
  }
  return out;
}

/**
 * 从助手全文提取 ```json ... ``` 中的 citations；成功则剥离该代码块。
 * 解析失败时返回原文与空 citations，不抛错。
 */
export function parseAssistantCitations(raw: string): ParsedExamWorkspaceCitations {
  if (!raw || !raw.trim()) {
    return { displayText: raw, citations: [] };
  }

  const re = /```json\s*([\s\S]*?)```/gi;
  const blocks: { start: number; end: number; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    blocks.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
  }

  for (let i = blocks.length - 1; i >= 0; i--) {
    const { start, end, inner } = blocks[i];
    try {
      const obj = JSON.parse(inner.trim());
      const parsed = tryParseCitationsObject(obj);
      if (parsed != null) {
        const displayText = (raw.slice(0, start) + raw.slice(end)).replace(/\n{3,}/g, '\n\n').trimEnd();
        return { displayText, citations: parsed };
      }
    } catch {
      /* 尝试下一块 */
    }
  }

  return { displayText: raw, citations: [] };
}

const DAGGER_PAIR = /†([^†]+)†/g;

export function parseOptsFromSnapshot(s: ExamChunkCitationSnapshot): {
  chunkCandidateIds: Set<string>;
  chunkById: Map<string, { materialLinkId: string; page: number }>;
} {
  const chunkById = new Map<string, { materialLinkId: string; page: number }>(Object.entries(s.chunks));
  return { chunkCandidateIds: new Set(Object.keys(s.chunks)), chunkById };
}

/**
 * 1-3：合并解析 †chunkId†、可选 ```json { "citedChunkIds": [...] } ```、以及旧版 citations JSON。
 * 优先级：chunk 协议（† 与 citedChunkIds）> 旧版 ```json``` citations；仅当本轮无有效 chunk 引用时回退旧版。
 */
export function parseExamWorkspaceModelReply(
  raw: string,
  opts: { chunkCandidateIds: Set<string>; chunkById: Map<string, { materialLinkId: string; page: number }> } | null
): ParsedExamWorkspaceCitations {
  if (!opts || opts.chunkCandidateIds.size === 0) {
    const parsed = parseAssistantCitations(raw);
    /** 无 chunk 白名单时仍剥离 †…†，避免暗号残留在用户可见正文 */
    const displayText = parsed.displayText.replace(DAGGER_PAIR, '').replace(/\n{3,}/g, '\n\n').trimEnd();
    return { displayText, citations: parsed.citations };
  }

  const { chunkCandidateIds, chunkById } = opts;
  const chunkCits: ExamWorkspaceCitation[] = [];
  const seen = new Set<string>();

  const pushFromId = (cid: string) => {
    if (!chunkCandidateIds.has(cid) || !chunkById.has(cid)) {
      console.warn('[examChunkCitation] 丢弃不在本轮白名单的 chunk 引用', cid);
      return;
    }
    const ch = chunkById.get(cid)!;
    const key = `${ch.materialLinkId}-${ch.page}`;
    if (seen.has(key)) return;
    seen.add(key);
    chunkCits.push({ materialId: ch.materialLinkId, page: ch.page });
  };

  DAGGER_PAIR.lastIndex = 0;
  let t = raw.replace(DAGGER_PAIR, (_full, g1: string) => {
    pushFromId(String(g1).trim());
    return '';
  });

  const citedChunkRe = /```json\s*([\s\S]*?)```/gi;
  const toRemove: { start: number; end: number }[] = [];
  let jm: RegExpExecArray | null;
  citedChunkRe.lastIndex = 0;
  while ((jm = citedChunkRe.exec(t)) !== null) {
    const inner = jm[1]?.trim() ?? '';
    if (!inner.includes('citedChunkIds')) continue;
    try {
      const obj = JSON.parse(inner) as { citedChunkIds?: unknown };
      if (obj && typeof obj === 'object' && Array.isArray(obj.citedChunkIds)) {
        for (const id of obj.citedChunkIds) {
          if (typeof id === 'string') pushFromId(id.trim());
        }
        toRemove.push({ start: jm.index, end: jm.index + jm[0].length });
      }
    } catch {
      /* 非 citedChunkIds 块留给 parseAssistantCitations */
    }
  }
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const r = toRemove[i]!;
    t = t.slice(0, r.start) + t.slice(r.end);
  }
  t = t.replace(/\n{3,}/g, '\n\n').trimEnd();

  if (chunkCits.length > 0) {
    const parsed = parseAssistantCitations(t);
    return { displayText: parsed.displayText, citations: chunkCits };
  }

  /** 本轮曾注入白名单但模型未输出任何合法 chunk 引用时，仍用已剥离 † / citedChunkIds 块的 `t` 再走旧版 JSON citations */
  return parseAssistantCitations(t);
}
