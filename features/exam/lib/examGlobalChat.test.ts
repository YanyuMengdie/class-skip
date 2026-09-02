import { describe, expect, it } from 'vitest';
import type { ExamMaterialLink, ExamMaterialTextChunk } from '@/types';
import {
  batchExamGlobalChunks,
  citationsFromCandidateIds,
  computeExamGlobalMaterialSignature,
  explicitlyRequestsExternalKnowledge,
  extractCitedChunkIds,
  findKnowledgeBlockCandidates,
  isBroadExamGlobalQuestion,
  selectExamGlobalCandidates,
} from '@/features/exam/lib/examGlobalChat';

function material(id: string, fileName: string): ExamMaterialLink {
  return {
    id,
    userId: 'user',
    examId: 'exam',
    sourceType: 'fileHash',
    fileHash: `hash-${id}`,
    fileName,
    addedAt: id.charCodeAt(0),
  };
}

function chunk(materialLinkId: string, page: number, text: string, chunkIndex = 0): ExamMaterialTextChunk {
  return {
    chunkId: `${materialLinkId}__p${page}__c${chunkIndex}`,
    materialLinkId,
    examId: 'exam',
    page,
    chunkIndex,
    text,
  };
}

describe('exam global chat helpers', () => {
  it('keeps the material signature stable across ordering and invalidates it on material changes', () => {
    const a = material('a', 'Lecture A.pdf');
    const b = material('b', 'Lecture B.pdf');
    expect(computeExamGlobalMaterialSignature([a, b])).toBe(computeExamGlobalMaterialSignature([b, a]));
    expect(computeExamGlobalMaterialSignature([a])).not.toBe(computeExamGlobalMaterialSignature([a, b]));
  });

  it('detects broad questions and only enables external knowledge on explicit requests', () => {
    expect(isBroadExamGlobalQuestion('把全部材料的共同主线串起来')).toBe(true);
    expect(isBroadExamGlobalQuestion('James-Lange theory 是什么')).toBe(false);
    expect(explicitlyRequestsExternalKnowledge('请结合材料外知识补充背景')).toBe(true);
    expect(explicitlyRequestsExternalKnowledge('请只根据讲义回答')).toBe(false);
  });

  it('batches on complete chunk boundaries without dropping pages', () => {
    const rows = [
      chunk('a', 1, 'a'.repeat(80)),
      chunk('a', 2, 'b'.repeat(80)),
      chunk('a', 3, 'c'.repeat(80)),
    ];
    const batches = batchExamGlobalChunks(rows, 180);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat().map((row) => row.page)).toEqual([1, 2, 3]);
  });

  it('adds representative evidence from every readable material for broad questions', () => {
    const materials = [material('a', 'Emotion Lecture.pdf'), material('b', 'Decision Lecture.pdf')];
    const rows = [
      chunk('a', 2, 'emotion theory evidence and bodily feedback'),
      chunk('b', 4, 'decision making evidence and somatic marker'),
    ];
    const results = selectExamGlobalCandidates(rows, materials, '这些材料共同的证据主线是什么？');
    expect(new Set(results.map((result) => result.chunk.materialLinkId))).toEqual(new Set(['a', 'b']));
  });

  it('rejects invented chunk citations and preserves valid evidence metadata', () => {
    const row = { chunk: chunk('a', 7, 'facial feedback evidence'), score: 2 };
    const parsed = extractCitedChunkIds('结论来自 †a__p7__c0†，不是 †invented†。', new Set(['a__p7__c0']));
    expect(parsed.citedChunkIds).toEqual(['a__p7__c0']);
    expect(parsed.displayText).not.toContain('†');
    const citations = citationsFromCandidateIds([row], new Map([['a', 'Lecture A.pdf']]), parsed.citedChunkIds);
    expect(citations).toEqual([expect.objectContaining({ materialName: 'Lecture A.pdf', page: 7 })]);
  });

  it('ranks a knowledge block by matching material and page window', () => {
    const citations = [{
      chunkId: 'a__p12__c0',
      materialLinkId: 'a',
      materialName: 'Lecture A.pdf',
      page: 12,
      excerpt: 'evidence',
    }];
    const blocks = [
      { id: 'wrong-page', title: '另一块', materialLinkId: 'a', pageWindows: [{ start: 1, end: 5 }] },
      { id: 'exact', title: '正确块', materialLinkId: 'a', pageWindows: [{ start: 10, end: 15 }] },
      { id: 'wrong-material', title: '其他材料', materialLinkId: 'b', pageWindows: [{ start: 10, end: 15 }] },
    ];
    expect(findKnowledgeBlockCandidates(citations, blocks).map((block) => block.id)).toEqual(['exact', 'wrong-page']);
  });
});
