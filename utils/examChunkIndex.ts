/**
 * 备考引用管线 1-1：PDF → 按页文本 → 切块 → 稳定 chunkId（无向量、无检索）。
 *
 * **1-4 多材料**：对 `buildExamMaterialChunkIndexForLinks` 传入的 **排序后材料列表逐份** 处理；每份 PDF 独立切块，`chunkId` 前缀为 `materialLinkId`，故 **跨 PDF 全局唯一**。持久化时同一场 `workspaceKey` 下为 **单条记录合并所有材料的 chunk 数组**（非「每文件一条」），与 `retrieveCandidateChunks` 整场检索一致。
 */
import type { ExamMaterialLink, ExamMaterialTextChunk } from '@/types';
import { extractPdfText } from '@/utils/pdfUtils';

/** 单块最大字符数（页内超过则滑动切分） */
export const EXAM_CHUNK_MAX_CHARS = 1000;

/** 相邻块重叠字符数，避免硬切断句子中间语义 */
export const EXAM_CHUNK_OVERLAP_CHARS = 80;

/**
 * 稳定 chunkId：`materialLinkId__p{page}__c{chunkIndex}`，page 为 1-based，chunkIndex 页内 0-based。
 */
export function makeExamChunkId(materialLinkId: string, page1Based: number, chunkIndex: number): string {
  return `${materialLinkId}__p${page1Based}__c${chunkIndex}`;
}

/**
 * 将单页全文切为若干块。空页返回 []。
 * 策略：先 trim 整页；长度 ≤ MAX 则一块；否则滑动窗口，步长约 (MAX - OVERLAP)。
 */
export function splitPageTextIntoChunks(
  pageText: string,
  page1Based: number,
  materialLinkId: string,
  examId: string,
  now = Date.now()
): ExamMaterialTextChunk[] {
  const t = pageText.replace(/\r\n/g, '\n').trim();
  if (!t) return [];

  const out: ExamMaterialTextChunk[] = [];
  if (t.length <= EXAM_CHUNK_MAX_CHARS) {
    out.push({
      chunkId: makeExamChunkId(materialLinkId, page1Based, 0),
      materialLinkId,
      examId,
      page: page1Based,
      chunkIndex: 0,
      text: t,
      createdAt: now,
    });
    return out;
  }

  let chunkIndex = 0;
  let pos = 0;
  while (pos < t.length) {
    const end = Math.min(pos + EXAM_CHUNK_MAX_CHARS, t.length);
    const slice = t.slice(pos, end);
    const text = slice.trim();
    if (text.length > 0) {
      out.push({
        chunkId: makeExamChunkId(materialLinkId, page1Based, chunkIndex),
        materialLinkId,
        examId,
        page: page1Based,
        chunkIndex,
        text,
        createdAt: now,
      });
      chunkIndex++;
    }
    if (end >= t.length) break;
    const nextPos = Math.max(pos + 1, end - EXAM_CHUNK_OVERLAP_CHARS);
    pos = nextPos;
  }
  return out;
}

export interface BuildExamChunkIndexResult {
  chunks: ExamMaterialTextChunk[];
  skippedLinks: { id: string; fileName: string; reason: string }[];
}

/**
 * 对排序后的本场材料列表逐份拉 File（与 App.resolveExamMaterialPdf 同源回调）→ extractPdfText → 切块。
 * 无法取得 File 的材料跳过并 warn，不阻塞其它材料。
 *
 * **1-4 部分材料未索引**：持久化结果仅含成功材料的 chunk；BM25 只在已写入的块上检索；Top-K 为空时与「无索引」相同降级（文末 JSON），**不** 伪造 chunkId。
 */
export async function buildExamMaterialChunkIndexForLinks(
  links: ExamMaterialLink[],
  resolvePdf: (link: ExamMaterialLink) => Promise<File | null>
): Promise<BuildExamChunkIndexResult> {
  const chunks: ExamMaterialTextChunk[] = [];
  const skippedLinks: { id: string; fileName: string; reason: string }[] = [];
  const now = Date.now();

  for (const link of links) {
    const file = await resolvePdf(link);
    if (!file) {
      console.warn('[examChunkIndex] 跳过材料（无法取得 PDF File）', link.id, link.fileName);
      skippedLinks.push({ id: link.id, fileName: link.fileName, reason: 'no_file' });
      continue;
    }
    let texts: string[];
    try {
      texts = await extractPdfText(file);
    } catch (e) {
      console.warn('[examChunkIndex] extractPdfText 失败', link.id, e);
      skippedLinks.push({ id: link.id, fileName: link.fileName, reason: 'extract_failed' });
      continue;
    }

    for (let i = 0; i < texts.length; i++) {
      const page = i + 1;
      const pageChunks = splitPageTextIntoChunks(texts[i] ?? '', page, link.id, link.examId, now);
      chunks.push(...pageChunks);
    }

    if (texts.length === 0 && file.size > 0) {
      console.warn('[examChunkIndex] 材料无文本层（可能为扫描件）', link.id, link.fileName);
    }
  }

  return { chunks, skippedLinks };
}

export function findChunkById(chunks: ExamMaterialTextChunk[], chunkId: string): ExamMaterialTextChunk | undefined {
  return chunks.find((c) => c.chunkId === chunkId);
}
