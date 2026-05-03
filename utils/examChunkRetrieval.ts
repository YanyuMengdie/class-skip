/**
 * 备考引用管线 1-2：基于 1-1 chunk 索引的 Top-K 检索（主方案：Okapi BM25，无向量、无额外 npm 依赖）。
 *
 * **主方案**：内存内 Okapi BM25（Robertson–Walker 形式），score 为未归一化的非负实数，越大越相关。
 * **降级**：load 失败或内部异常时 `console.warn` 并返回 `[]`；空 query / 空索引返回 `[]`。
 * （未引入 Embedding API；若将来加向量检索，可并列得分再融合，本文件不实现。）
 *
 * **中文**：对 CJK 使用单字 token + 相邻二字 bigram，保证无分词库也能命中常见词组；英文/数字为整词。
 *
 * **query 来源（MVP 说明，供 1-3 接线）**：
 * - 默认：备考苏格拉底里用户发送前的一句 `userText`。
 * - 可选增强：`${userText}\n${assistantLastReply.slice(0, EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS)}`（见常量，备考苏格拉底与试检索共用）。
 *
 * **1-4 多材料**：同一 `workspaceKey` 下 IndexedDB 存 **本场全部已构建材料** 的 chunk；`chunk.materialLinkId` 区分 PDF；BM25 在 **合并后的 chunk 列表** 上检索，Top-K 可来自 **任意已索引材料**。可选 `materialLinkIdFilter` 将检索限制为单份材料（如「仅当前预览」）。
 */
import type { ExamMaterialTextChunk, RetrievedChunk } from '../types';
import { loadExamMaterialChunkIndex } from '../services/examChunkIndexStorage';

/** Top-K 默认值；可调用时覆盖 */
export const DEFAULT_TOP_K = 8;

/** 1-3：构造检索 query 时拼接「最近一条助手回复」的前缀长度（与试检索、苏格拉底注入共用） */
export const EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS = 300;

/** Okapi BM25 常见超参 */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

const RE_WORD = /[a-z0-9]+/g;
/** CJK 统一码块（含扩展 A 等常用汉字区，MVP 覆盖讲义正文） */
const RE_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * 将 query / 正文切为 BM25 词项：英文数字小写整词；汉字单字 + 相邻二字 bigram。
 */
export function tokenizeForBm25(text: string): string[] {
  const s = text.toLowerCase();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  RE_WORD.lastIndex = 0;
  while ((m = RE_WORD.exec(s)) !== null) {
    const gap = s.slice(lastEnd, m.index);
    pushCjkTokens(gap, out);
    out.push(m[0]!);
    lastEnd = m.index + m[0]!.length;
  }
  pushCjkTokens(s.slice(lastEnd), out);
  return out;
}

function pushCjkTokens(segment: string, out: string[]): void {
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (RE_CJK.test(ch)) {
      out.push(ch);
      if (i + 1 < segment.length) {
        const ch2 = segment[i + 1]!;
        if (RE_CJK.test(ch2)) out.push(ch + ch2);
      }
    }
  }
}

export interface Bm25ChunkIndex {
  chunks: ExamMaterialTextChunk[];
  /** 每篇文档（chunk）内词项频次 */
  docTermFreqs: Map<string, number>[];
  docLengths: number[];
  N: number;
  avgdl: number;
  /** 含该词项的文档数 */
  df: Map<string, number>;
}

/**
 * 由本场 chunk 列表构建内存 BM25 统计量（MVP：每次检索前全量构建；chunk 极大时可按 workspaceKey 缓存本结构）。
 */
export function buildIndexFromChunks(chunks: ExamMaterialTextChunk[]): Bm25ChunkIndex {
  const N = chunks.length;
  const docTermFreqs: Map<string, number>[] = [];
  const docLengths: number[] = [];
  const df = new Map<string, number>();

  for (let d = 0; d < N; d++) {
    const tokens = tokenizeForBm25(chunks[d]!.text);
    docLengths.push(tokens.length);
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    docTermFreqs.push(tf);
  }

  const sumLen = docLengths.reduce((a, b) => a + b, 0);
  const avgdl = N > 0 ? sumLen / N : 0;

  return { chunks, docTermFreqs, docLengths, N, avgdl, df };
}

function idfOkapi(N: number, df: number): number {
  return Math.log((N - df + 0.5) / (df + 0.5) + 1);
}

/** 单文档对 query 的 BM25 得分（query 可含重复 term，逐项累加） */
function scoreDoc(
  qTokens: string[],
  docIdx: number,
  index: Bm25ChunkIndex
): number {
  const { docTermFreqs, docLengths, N, avgdl, df } = index;
  const tfMap = docTermFreqs[docIdx]!;
  const dl = docLengths[docIdx] ?? 0;
  let s = 0;
  for (const term of qTokens) {
    const n = df.get(term);
    if (n == null || n === 0) continue;
    const idf = idfOkapi(N, n);
    const f = tfMap.get(term) ?? 0;
    if (f === 0) continue;
    const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / (avgdl || 1));
    s += idf * ((f * (BM25_K1 + 1)) / denom);
  }
  return s;
}

/**
 * 在已构建索引上检索；`query` 会先 trim，空串返回 `[]`。
 * 结果按 score 降序，同分按 chunkId 升序（确定性）。
 */
export function searchBm25(index: Bm25ChunkIndex, query: string, topK: number): RetrievedChunk[] {
  const q = query.trim();
  if (!q || index.N === 0) return [];

  const qTokens = tokenizeForBm25(q);
  if (qTokens.length === 0) return [];

  const scored: { chunk: ExamMaterialTextChunk; score: number }[] = [];
  for (let d = 0; d < index.N; d++) {
    const sc = scoreDoc(qTokens, d, index);
    if (sc > 0) {
      scored.push({ chunk: index.chunks[d]!, score: sc });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.chunkId.localeCompare(b.chunk.chunkId);
  });

  const k = Math.max(0, Math.min(topK, scored.length));
  return scored.slice(0, k).map((x) => ({ chunk: x.chunk, score: x.score }));
}

export interface RetrieveCandidateChunksInput {
  workspaceKey: string;
  query: string;
  /** 默认 DEFAULT_TOP_K */
  topK?: number;
  /** 1-4：仅在该 `ExamMaterialLink.id` 的 chunk 上检索；不设则检索本场索引内全部材料 */
  materialLinkIdFilter?: string | null;
}

/**
 * 加载本场 IndexedDB chunk 索引 → 建 BM25 → Top-K。
 * 空索引或空 query 返回 `[]`；异常时 warn 并返回 `[]`。
 */
export async function retrieveCandidateChunks(
  input: RetrieveCandidateChunksInput
): Promise<RetrievedChunk[]> {
  const topK = input.topK ?? DEFAULT_TOP_K;
  const q = (input.query ?? '').trim();
  if (!q || !input.workspaceKey) return [];

  try {
    let chunks = await loadExamMaterialChunkIndex(input.workspaceKey);
    if (!chunks || chunks.length === 0) return [];

    const fid = input.materialLinkIdFilter?.trim();
    if (fid) {
      chunks = chunks.filter((c) => c.materialLinkId === fid);
      /** 筛选后无块：等同「本轮无候选」，不抛错，由调用方走 1-4 文末 JSON 降级 */
      if (chunks.length === 0) return [];
    }

    const index = buildIndexFromChunks(chunks);
    return searchBm25(index, q, topK);
  } catch (e) {
    console.warn('[examChunkRetrieval] retrieveCandidateChunks failed', e);
    return [];
  }
}
