import type { ExamMaterialLink, ExamMaterialTextChunk, LSAPKnowledgeComponent, RetrievedChunk } from '@/types';
import { buildIndexFromChunks, searchBm25 } from '@/features/exam/lib/examChunkRetrieval';

export const EXAM_GLOBAL_CHAT_VERSION = 1 as const;
export const EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION = 'exam-global-map-v1';

export interface ExamGlobalCitation {
  chunkId: string;
  materialLinkId: string;
  materialName: string;
  page: number;
  excerpt: string;
}

export interface ExamGlobalChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  /** model 轮保存当时的原问题，供保存疑问、小测与知识块交接。 */
  questionText?: string;
  citations?: ExamGlobalCitation[];
  savedAsMemo?: boolean;
}

export interface ExamGlobalChatState {
  version: 1;
  examId: string;
  turns: ExamGlobalChatTurn[];
  rollingSummary?: string;
  summarizedThroughTurnId?: string;
  updatedAt: number;
}

export interface ExamGlobalPageItem {
  text: string;
  pages: number[];
}

export interface ExamGlobalConceptItem extends ExamGlobalPageItem {
  nameZh: string;
  nameEn?: string;
}

export interface ExamGlobalMaterialManifest {
  materialLinkId: string;
  fileName: string;
  summary: string;
  role: string;
  mainQuestions: ExamGlobalPageItem[];
  concepts: ExamGlobalConceptItem[];
  claims: ExamGlobalPageItem[];
  evidence: ExamGlobalPageItem[];
  limitations: ExamGlobalPageItem[];
}

export interface ExamGlobalMaterialConnection {
  title: string;
  description: string;
  kind: 'common_theme' | 'support' | 'conflict' | 'complement' | 'sequence';
  materialLinkIds: string[];
  pageRefs: Array<{ materialLinkId: string; pages: number[] }>;
}

export interface ExamGlobalUnavailableMaterial {
  materialLinkId: string;
  fileName: string;
  reason: string;
}

export interface ExamGlobalMaterialMemory {
  version: 1;
  analysisVersion: string;
  sourceSignature: string;
  materials: ExamGlobalMaterialManifest[];
  crossMaterialConnections: ExamGlobalMaterialConnection[];
  readyMaterialIds: string[];
  unavailableMaterials: ExamGlobalUnavailableMaterial[];
  status: 'preparing' | 'ready' | 'partial' | 'error';
  generatedAt: number;
}

export interface ExamGlobalKnowledgeBlockOption {
  id: string;
  title: string;
  materialLinkId: string | null;
  pageWindows: Array<{ start: number; end: number }>;
}

export type ExamGlobalQuizQuestionKind = 'choice' | 'short_answer' | 'concept';

export interface ExamGlobalQuizQuestion {
  id: string;
  kind: ExamGlobalQuizQuestionKind;
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
  citations: ExamGlobalCitation[];
}

export interface ExamGlobalQuiz {
  title: string;
  questions: ExamGlobalQuizQuestion[];
}

export interface ExamGlobalQuizFeedback {
  questionId: string;
  verdict: 'correct' | 'partial' | 'incorrect';
  feedback: string;
}

const CHAT_STORAGE_PREFIX = 'exam_global_chat_';
const MEMORY_STORAGE_PREFIX = 'exam_global_material_memory_';
const MAX_CHAT_TURNS = 160;
const MAX_CHAT_CHARS = 180_000;

function hashText(raw: string): string {
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = (h * 33) ^ raw.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function computeExamGlobalChatStorageKey(userId: string, examId: string): string {
  return `${CHAT_STORAGE_PREFIX}${hashText(`${userId}|${examId}`)}`;
}

export function computeExamGlobalMemoryStorageKey(userId: string, examId: string): string {
  return `${MEMORY_STORAGE_PREFIX}${hashText(`${userId}|${examId}`)}`;
}

export function computeExamGlobalMaterialSignature(materials: ExamMaterialLink[]): string {
  const raw = [...materials]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => `${m.id}:${m.sourceType}:${m.fileHash ?? ''}:${m.cloudSessionId ?? ''}:${m.addedAt}`)
    .join('|');
  return `${EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION}-${hashText(raw)}`;
}

export function truncateExamGlobalTurns(turns: ExamGlobalChatTurn[]): ExamGlobalChatTurn[] {
  const next = turns.slice(-MAX_CHAT_TURNS);
  let chars = next.reduce((sum, turn) => sum + turn.text.length, 0);
  while (chars > MAX_CHAT_CHARS && next.length > 0) {
    chars -= next[0]!.text.length;
    next.shift();
  }
  return next;
}

export function loadExamGlobalChatState(userId: string, examId: string): ExamGlobalChatState {
  const empty: ExamGlobalChatState = {
    version: EXAM_GLOBAL_CHAT_VERSION,
    examId,
    turns: [],
    updatedAt: Date.now(),
  };
  if (typeof localStorage === 'undefined') return empty;
  try {
    const raw = localStorage.getItem(computeExamGlobalChatStorageKey(userId, examId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<ExamGlobalChatState>;
    if (parsed.version !== 1 || parsed.examId !== examId || !Array.isArray(parsed.turns)) return empty;
    return {
      version: 1,
      examId,
      turns: truncateExamGlobalTurns(parsed.turns.filter((turn): turn is ExamGlobalChatTurn => (
        Boolean(turn) && typeof turn.id === 'string' && (turn.role === 'user' || turn.role === 'model') && typeof turn.text === 'string'
      ))),
      ...(typeof parsed.rollingSummary === 'string' ? { rollingSummary: parsed.rollingSummary } : {}),
      ...(typeof parsed.summarizedThroughTurnId === 'string'
        ? { summarizedThroughTurnId: parsed.summarizedThroughTurnId }
        : {}),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return empty;
  }
}

export function saveExamGlobalChatState(userId: string, state: ExamGlobalChatState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(computeExamGlobalChatStorageKey(userId, state.examId), JSON.stringify({
      ...state,
      turns: truncateExamGlobalTurns(state.turns),
      updatedAt: Date.now(),
    }));
  } catch (error) {
    console.warn('[examGlobalChat] save chat failed', error);
  }
}

export function loadExamGlobalMaterialMemory(
  userId: string,
  examId: string,
  sourceSignature: string
): ExamGlobalMaterialMemory | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(computeExamGlobalMemoryStorageKey(userId, examId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExamGlobalMaterialMemory;
    if (
      parsed?.version !== 1 ||
      parsed.analysisVersion !== EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION ||
      parsed.sourceSignature !== sourceSignature ||
      !Array.isArray(parsed.materials)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveExamGlobalMaterialMemory(userId: string, examId: string, memory: ExamGlobalMaterialMemory): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(computeExamGlobalMemoryStorageKey(userId, examId), JSON.stringify(memory));
  } catch (error) {
    console.warn('[examGlobalChat] save material memory failed', error);
  }
}

export function explicitlyRequestsExternalKnowledge(text: string): boolean {
  if (/(不要|不需要|禁止|别用|只根据|仅根据).{0,12}(材料外|讲义外|课外|外部知识|通识)/i.test(text)) return false;
  return /(材料外|讲义外|课外|补充背景|外部知识|结合通识|你知道的|不局限于材料|outside (the )?(materials|lecture)|external knowledge)/i.test(text);
}

export function isBroadExamGlobalQuestion(text: string): boolean {
  return /(整体|全部材料|这些材料|共同|主线|全局|跨材料|比较|对比|异同|联系|关系|综合|串起来|overview|overall|compare|across)/i.test(text);
}

export function batchExamGlobalChunks(
  chunks: ExamMaterialTextChunk[],
  maxChars = 55_000
): ExamMaterialTextChunk[][] {
  const sorted = [...chunks].sort((a, b) => a.page - b.page || a.chunkIndex - b.chunkIndex);
  const batches: ExamMaterialTextChunk[][] = [];
  let current: ExamMaterialTextChunk[] = [];
  let chars = 0;
  for (const chunk of sorted) {
    const cost = chunk.text.length + 80;
    if (current.length > 0 && chars + cost > maxChars) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(chunk);
    chars += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function dedupeRetrieved(rows: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.chunk.chunkId)) return false;
    seen.add(row.chunk.chunkId);
    return true;
  });
}

/**
 * 全局对话检索：窄问题按全场 BM25；广泛问题补足每份材料的代表片段；点名文件时优先该文件。
 */
export function selectExamGlobalCandidates(
  chunks: ExamMaterialTextChunk[],
  materials: ExamMaterialLink[],
  query: string,
  maxCandidates = 18
): RetrievedChunk[] {
  if (!chunks.length || !query.trim()) return [];
  const globalRows = searchBm25(buildIndexFromChunks(chunks), query, 10);
  const lower = query.toLowerCase();
  const named = materials.filter((material) => {
    const full = material.fileName.toLowerCase();
    const stem = full.replace(/\.pdf$/i, '');
    return (stem.length >= 4 && lower.includes(stem)) || lower.includes(full);
  });

  const namedRows = named.flatMap((material) => {
    const scoped = chunks.filter((chunk) => chunk.materialLinkId === material.id);
    return scoped.length ? searchBm25(buildIndexFromChunks(scoped), query, 8) : [];
  });

  const broadRows = isBroadExamGlobalQuestion(query)
    ? materials.flatMap((material) => {
        const scoped = chunks.filter((chunk) => chunk.materialLinkId === material.id);
        if (!scoped.length) return [];
        const hits = searchBm25(buildIndexFromChunks(scoped), query, 2);
        if (hits.length) return hits;
        return scoped.slice(0, 1).map((chunk) => ({ chunk, score: 0 }));
      })
    : [];

  return dedupeRetrieved([...namedRows, ...globalRows, ...broadRows]).slice(0, maxCandidates);
}

export function citationsFromCandidateIds(
  candidateRows: RetrievedChunk[],
  materialNames: Map<string, string>,
  citedChunkIds: string[]
): ExamGlobalCitation[] {
  const allowed = new Map(candidateRows.map((row) => [row.chunk.chunkId, row.chunk]));
  const seen = new Set<string>();
  const out: ExamGlobalCitation[] = [];
  for (const id of citedChunkIds) {
    const chunk = allowed.get(id);
    if (!chunk) continue;
    const key = `${chunk.materialLinkId}:${chunk.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      chunkId: chunk.chunkId,
      materialLinkId: chunk.materialLinkId,
      materialName: materialNames.get(chunk.materialLinkId) ?? chunk.materialLinkId,
      page: chunk.page,
      excerpt: chunk.text.replace(/\s+/g, ' ').trim().slice(0, 360),
    });
  }
  return out;
}

export function extractCitedChunkIds(raw: string, allowedIds: Set<string>): { displayText: string; citedChunkIds: string[] } {
  const seen = new Set<string>();
  const citedChunkIds: string[] = [];
  const displayText = raw.replace(/†([^†]+)†/g, (_match, value: string) => {
    const id = String(value).trim();
    if (allowedIds.has(id) && !seen.has(id)) {
      seen.add(id);
      citedChunkIds.push(id);
    }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { displayText, citedChunkIds };
}

export function findKnowledgeBlockCandidates(
  citations: ExamGlobalCitation[],
  blocks: ExamGlobalKnowledgeBlockOption[]
): ExamGlobalKnowledgeBlockOption[] {
  const scored = blocks.map((block) => {
    let score = 0;
    for (const citation of citations) {
      if (!block.materialLinkId || block.materialLinkId !== citation.materialLinkId) continue;
      score += 2;
      if (block.pageWindows.some((window) => citation.page >= window.start && citation.page <= window.end)) score += 5;
    }
    return { block, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score || a.block.title.localeCompare(b.block.title));
  return scored.slice(0, 6).map((row) => row.block);
}

export function buildRouteHintsForMaterial(
  materialLinkId: string,
  kcs: LSAPKnowledgeComponent[] | undefined
): string[] {
  return (kcs ?? [])
    .filter((kc) => kc.sourceLinkId === materialLinkId)
    .slice(0, 40)
    .map((kc) => {
      const pages = [...new Set([...(kc.anchorPages ?? []), ...(kc.sourcePages ?? []), ...(kc.relatedPages ?? [])])]
        .filter((page) => Number.isInteger(page) && page > 0)
        .sort((a, b) => a - b);
      return `${kc.concept}${kc.definition ? `：${kc.definition}` : ''}${pages.length ? `（p.${pages.join(',')}）` : ''}`;
    });
}

export function makeExamGlobalTurnId(prefix: 'user' | 'model'): string {
  return `exam-global-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
