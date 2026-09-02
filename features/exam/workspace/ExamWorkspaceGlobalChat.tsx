import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  Layers3,
  Loader2,
  MessageCircle,
  RotateCcw,
  Save,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { ExamMaterialLink, ExamMaterialTextChunk, LSAPContentMap } from '@/types';
import { addMemo } from '@/services/firebase';
import { buildExamMaterialChunkIndexForLinks } from '@/features/exam/lib/examChunkIndex';
import { loadExamMaterialChunkIndex, saveExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import { ExamWorkspaceAssistantMarkdown } from '@/features/exam/workspace/ExamWorkspaceAssistantMarkdown';
import type { OpenMaterialPageOptions } from '@/features/exam/workspace/ExamWorkspaceCitationBlock';
import {
  batchExamGlobalChunks,
  buildRouteHintsForMaterial,
  citationsFromCandidateIds,
  computeExamGlobalMaterialSignature,
  explicitlyRequestsExternalKnowledge,
  extractCitedChunkIds,
  findKnowledgeBlockCandidates,
  loadExamGlobalChatState,
  loadExamGlobalMaterialMemory,
  makeExamGlobalTurnId,
  saveExamGlobalChatState,
  saveExamGlobalMaterialMemory,
  selectExamGlobalCandidates,
  truncateExamGlobalTurns,
  EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION,
  type ExamGlobalChatState,
  type ExamGlobalChatTurn,
  type ExamGlobalCitation,
  type ExamGlobalKnowledgeBlockOption,
  type ExamGlobalMaterialManifest,
  type ExamGlobalMaterialMemory,
  type ExamGlobalQuiz,
  type ExamGlobalQuizFeedback,
} from '@/features/exam/lib/examGlobalChat';
import {
  chatWithExamGlobalAssistant,
  generateExamGlobalMaterialConnections,
  generateExamGlobalMaterialManifest,
  generateExamGlobalQuiz,
  gradeExamGlobalQuiz,
  summarizeExamGlobalConversation,
} from '@/services/geminiService';

export interface ExamWorkspaceGlobalChatProps {
  user: User;
  examId: string;
  examTitle: string;
  materials: ExamMaterialLink[];
  workspaceKey: string | null;
  contentMap: LSAPContentMap | null;
  knowledgeBlocks: ExamGlobalKnowledgeBlockOption[];
  resolveExamMaterialPdf: (link: ExamMaterialLink) => Promise<File | null>;
  onOpenMaterialPage: (materialId: string, page: number, opts?: OpenMaterialPageOptions) => void;
  onHandoffToKnowledgeBlock: (blockId: string, draft: string) => void;
}

const EMPTY_SUGGESTIONS = [
  '这些材料共同在讲什么？',
  '比较不同材料对同一个理论的说法',
  '帮我定位一个概念出现在哪里',
  '把我接下来问的问题整理成考试答案',
];

function materialBatchText(chunks: ExamMaterialTextChunk[]): string {
  return chunks.map((chunk) => `[PDF p.${chunk.page} · ${chunk.chunkId}]\n${chunk.text}`).join('\n\n');
}

function conciseMaterialMemory(memory: ExamGlobalMaterialMemory | null): string {
  if (!memory) return JSON.stringify({ status: 'preparing', note: '全局材料地图仍在准备' });
  return JSON.stringify({
    materials: memory.materials,
    connections: memory.crossMaterialConnections,
    status: memory.status,
    unavailableMaterials: memory.unavailableMaterials,
  });
}

function buildSyntheticMaterials(
  current: ExamMaterialLink[],
  turn: ExamGlobalChatTurn,
  userId: string,
  examId: string,
): ExamMaterialLink[] {
  const byId = new Map(current.map((material) => [material.id, material]));
  for (const citation of turn.citations ?? []) {
    if (byId.has(citation.materialLinkId)) continue;
    byId.set(citation.materialLinkId, {
      id: citation.materialLinkId,
      userId,
      examId,
      sourceType: 'fileHash',
      fileName: `${citation.materialName}（已移除）`,
      addedAt: turn.timestamp,
    });
  }
  return [...byId.values()];
}

function makeHandoffDraft(turn: ExamGlobalChatTurn): string {
  const source = (turn.citations ?? [])
    .map((citation) => `${citation.materialName} p.${citation.page}`)
    .join('、');
  return `我在“整场考试对话”里问了：\n${turn.questionText ?? ''}\n\n全局回答给我的思路：\n${turn.text.slice(0, 1400)}\n\n材料定位：${source || '暂无精确页码'}\n\n请从这个困惑开始验证我的理解，不要因为上面有一段回答就默认我已经会了。`;
}

function buildMemoText(examTitle: string, turn: ExamGlobalChatTurn): string {
  const sources = (turn.citations ?? []).map((citation) => `- ${citation.materialName} · 第 ${citation.page} 页`).join('\n');
  return `【${examTitle} · 我的疑问】\n\n问题：\n${turn.questionText ?? '（未保存原问题）'}\n\nAI整理：\n${turn.text.slice(0, 1800)}\n\n材料定位：\n${sources || '- 暂无可定位证据'}`;
}

export const ExamWorkspaceGlobalChat: React.FC<ExamWorkspaceGlobalChatProps> = ({
  user,
  examId,
  examTitle,
  materials,
  workspaceKey,
  contentMap,
  knowledgeBlocks,
  resolveExamMaterialPdf,
  onOpenMaterialPage,
  onHandoffToKnowledgeBlock,
}) => {
  const sourceSignature = useMemo(() => computeExamGlobalMaterialSignature(materials), [materials]);
  const [chatState, setChatState] = useState<ExamGlobalChatState>(() => loadExamGlobalChatState(user.uid, examId));
  const [memory, setMemory] = useState<ExamGlobalMaterialMemory | null>(() => (
    loadExamGlobalMaterialMemory(user.uid, examId, sourceSignature)
  ));
  const [chunks, setChunks] = useState<ExamMaterialTextChunk[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [prepareMessage, setPrepareMessage] = useState('正在读取考试材料…');
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeExamRef = useRef(examId);
  const [evidenceTurn, setEvidenceTurn] = useState<ExamGlobalChatTurn | null>(null);
  const [handoffTurn, setHandoffTurn] = useState<ExamGlobalChatTurn | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [memoBusyId, setMemoBusyId] = useState<string | null>(null);
  const [quizTurn, setQuizTurn] = useState<ExamGlobalChatTurn | null>(null);
  const [quiz, setQuiz] = useState<ExamGlobalQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizFeedback, setQuizFeedback] = useState<ExamGlobalQuizFeedback[]>([]);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const materialNameMap = useMemo(() => new Map(materials.map((material) => [material.id, material.fileName])), [materials]);
  const currentMaterialIds = useMemo(() => new Set(materials.map((material) => material.id)), [materials]);
  const indexedMaterialIds = useMemo(() => new Set(chunks.map((chunk) => chunk.materialLinkId)), [chunks]);
  const availableCount = materials.filter((material) => indexedMaterialIds.has(material.id)).length;
  const unavailable = useMemo(
    () => preparing && chunks.length === 0
      ? []
      : materials.filter((material) => !indexedMaterialIds.has(material.id)),
    [materials, indexedMaterialIds, preparing, chunks.length]
  );
  const mapNeedsRetry = Boolean(
    !preparing &&
    memory?.status === 'partial' &&
    (memory.materials.length < availableCount || unavailable.length === 0)
  );

  useEffect(() => {
    activeExamRef.current = examId;
    sendAbortRef.current?.abort();
    setChatState(loadExamGlobalChatState(user.uid, examId));
    setMemory(loadExamGlobalMaterialMemory(user.uid, examId, sourceSignature));
    setChunks([]);
    setInput('');
    setSendError(null);
    setLastFailedQuestion(null);
    setEvidenceTurn(null);
    setHandoffTurn(null);
    setQuizTurn(null);
    setQuiz(null);
  }, [examId, sourceSignature, user.uid]);

  useEffect(() => {
    saveExamGlobalChatState(user.uid, chatState);
  }, [chatState, user.uid]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    requestAnimationFrame(() => { node.scrollTop = node.scrollHeight; });
  }, [chatState.turns.length, sending]);

  useEffect(() => {
    if (!workspaceKey || !materials.length) {
      setPreparing(false);
      setChunks([]);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const cached = loadExamGlobalMaterialMemory(user.uid, examId, sourceSignature);
    if (cached) setMemory(cached);

    void (async () => {
      setPreparing(true);
      setPrepareError(null);
      setPrepareMessage('正在检查全部考试材料…');
      try {
        let indexed = await loadExamMaterialChunkIndex(workspaceKey) ?? [];
        const existingIds = new Set(indexed.map((chunk) => chunk.materialLinkId));
        if (materials.some((material) => !existingIds.has(material.id))) {
          setPrepareMessage('正在建立逐页材料索引…');
          const built = await buildExamMaterialChunkIndexForLinks(materials, resolveExamMaterialPdf);
          if (cancelled) return;
          indexed = built.chunks;
          await saveExamMaterialChunkIndex(workspaceKey, indexed);
        }
        if (cancelled) return;
        setChunks(indexed);

        const byMaterial = new Map<string, ExamMaterialTextChunk[]>();
        for (const chunk of indexed) {
          const rows = byMaterial.get(chunk.materialLinkId) ?? [];
          rows.push(chunk);
          byMaterial.set(chunk.materialLinkId, rows);
        }
        const unavailableRows = materials.filter((material) => !(byMaterial.get(material.id)?.length)).map((material) => ({
          materialLinkId: material.id,
          fileName: material.fileName,
          reason: '无法读取 PDF，或材料没有可提取的文本层',
        }));

        const readyMaterials = materials.filter((material) => byMaterial.has(material.id));
        const cacheUsable = Boolean(
          cached &&
          cached.materials.length === readyMaterials.length &&
          (cached.status === 'ready' || (cached.status === 'partial' && unavailableRows.length > 0))
        );
        if (cached && cacheUsable) {
          setMemory({
            ...cached,
            readyMaterialIds: materials.filter((material) => byMaterial.has(material.id)).map((material) => material.id),
            unavailableMaterials: unavailableRows,
            status: unavailableRows.length ? 'partial' : cached.status,
          });
          return;
        }

        const manifests: ExamGlobalMaterialManifest[] = [];
        let mapHadFailure = false;
        for (let i = 0; i < readyMaterials.length; i++) {
          const material = readyMaterials[i]!;
          const materialChunks = byMaterial.get(material.id) ?? [];
          setPrepareMessage(`正在整理全局材料地图：${i + 1}/${readyMaterials.length} · ${material.fileName}`);
          try {
            const batches = batchExamGlobalChunks(materialChunks).map((batch) => ({
              text: materialBatchText(batch),
              pages: [...new Set(batch.map((chunk) => chunk.page))],
            }));
            manifests.push(await generateExamGlobalMaterialManifest({
              materialLinkId: material.id,
              fileName: material.fileName,
              batches,
              routeHints: buildRouteHintsForMaterial(material.id, contentMap?.kcs),
              abortSignal: controller.signal,
            }));
            if (cancelled) return;
            setMemory({
              version: 1,
              analysisVersion: EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION,
              sourceSignature,
              materials: [...manifests],
              crossMaterialConnections: [],
              readyMaterialIds: readyMaterials.map((row) => row.id),
              unavailableMaterials: unavailableRows,
              status: 'preparing',
              generatedAt: Date.now(),
            });
          } catch (error) {
            if (controller.signal.aborted) return;
            mapHadFailure = true;
            console.warn('[examGlobalChat] material manifest failed', material.id, error);
          }
        }

        let connections = [] as Awaited<ReturnType<typeof generateExamGlobalMaterialConnections>>;
        if (manifests.length > 1) {
          setPrepareMessage('正在连接不同材料之间的关系…');
          try {
            connections = await generateExamGlobalMaterialConnections({ manifests, abortSignal: controller.signal });
          } catch (error) {
            if (controller.signal.aborted) return;
            mapHadFailure = true;
            console.warn('[examGlobalChat] connection synthesis failed', error);
          }
        }
        if (cancelled) return;
        const finalMemory: ExamGlobalMaterialMemory = {
          version: 1,
          analysisVersion: EXAM_GLOBAL_MATERIAL_ANALYSIS_VERSION,
          sourceSignature,
          materials: manifests,
          crossMaterialConnections: connections,
          readyMaterialIds: readyMaterials.map((material) => material.id),
          unavailableMaterials: unavailableRows,
          status: readyMaterials.length === 0
            ? 'error'
            : unavailableRows.length > 0 || mapHadFailure || manifests.length < readyMaterials.length
              ? 'partial'
              : 'ready',
          generatedAt: Date.now(),
        };
        setMemory(finalMemory);
        saveExamGlobalMaterialMemory(user.uid, examId, finalMemory);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        setPrepareError(error instanceof Error ? error.message : '准备考试材料失败');
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workspaceKey, materials, resolveExamMaterialPdf, user.uid, examId, sourceSignature, contentMap, prepareAttempt]);

  const maybeRefreshSummary = useCallback((turns: ExamGlobalChatTurn[]) => {
    if (turns.length < 26) return;
    const older = turns.slice(0, -18);
    const lastOlder = older[older.length - 1];
    if (!lastOlder || lastOlder.id === chatState.summarizedThroughTurnId) return;
    const examAtStart = examId;
    void summarizeExamGlobalConversation({ previousSummary: chatState.rollingSummary, turns: older })
      .then((summary) => {
        if (activeExamRef.current !== examAtStart) return;
        setChatState((prev) => ({
          ...prev,
          rollingSummary: summary,
          summarizedThroughTurnId: lastOlder.id,
          updatedAt: Date.now(),
        }));
      })
      .catch((error) => console.warn('[examGlobalChat] summarize failed', error));
  }, [chatState.rollingSummary, chatState.summarizedThroughTurnId, examId]);

  const submitQuestion = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || sending || availableCount === 0) return;
    const controller = new AbortController();
    sendAbortRef.current = controller;
    setSending(true);
    setSendError(null);
    setLastFailedQuestion(null);
    const userTurn: ExamGlobalChatTurn = {
      id: makeExamGlobalTurnId('user'),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    const history = chatState.turns;
    setChatState((prev) => ({ ...prev, turns: truncateExamGlobalTurns([...prev.turns, userTurn]), updatedAt: Date.now() }));
    setInput('');
    try {
      const candidates = selectExamGlobalCandidates(chunks, materials, text);
      const raw = await chatWithExamGlobalAssistant({
        examTitle,
        materialMemoryJson: conciseMaterialMemory(memory),
        unavailableMaterialNames: unavailable.map((material) => material.fileName),
        retrievedChunks: candidates.map((row) => ({
          chunkId: row.chunk.chunkId,
          materialLinkId: row.chunk.materialLinkId,
          materialName: materialNameMap.get(row.chunk.materialLinkId) ?? row.chunk.materialLinkId,
          page: row.chunk.page,
          text: row.chunk.text,
        })),
        recentTurns: history,
        rollingSummary: chatState.rollingSummary,
        userMessage: text,
        allowExternalKnowledge: explicitlyRequestsExternalKnowledge(text),
        materialMapComplete: memory?.status === 'ready',
        abortSignal: controller.signal,
      });
      const parsed = extractCitedChunkIds(raw, new Set(candidates.map((row) => row.chunk.chunkId)));
      const citations = citationsFromCandidateIds(candidates, materialNameMap, parsed.citedChunkIds);
      const modelTurn: ExamGlobalChatTurn = {
        id: makeExamGlobalTurnId('model'),
        role: 'model',
        text: parsed.displayText,
        timestamp: Date.now(),
        questionText: text,
        citations,
      };
      const nextTurns = truncateExamGlobalTurns([...history, userTurn, modelTurn]);
      setChatState((prev) => ({ ...prev, turns: nextTurns, updatedAt: Date.now() }));
      maybeRefreshSummary(nextTurns);
    } catch (error) {
      if (controller.signal.aborted) {
        setChatState((prev) => ({ ...prev, turns: prev.turns.filter((turn) => turn.id !== userTurn.id), updatedAt: Date.now() }));
        setInput(text);
        return;
      }
      setChatState((prev) => ({ ...prev, turns: prev.turns.filter((turn) => turn.id !== userTurn.id), updatedAt: Date.now() }));
      setSendError(error instanceof Error ? error.message : '回答生成失败');
      setLastFailedQuestion(text);
      setInput(text);
    } finally {
      if (sendAbortRef.current === controller) sendAbortRef.current = null;
      setSending(false);
    }
  }, [sending, availableCount, chatState, chunks, materials, examTitle, memory, unavailable, materialNameMap, maybeRefreshSummary]);

  const clearConversation = () => {
    if (!chatState.turns.length) return;
    if (!window.confirm('确定真正清空这场考试的整场对话吗？材料地图不会被删除，但聊天记录无法恢复。')) return;
    setChatState({ version: 1, examId, turns: [], updatedAt: Date.now() });
    setSendError(null);
    setLastFailedQuestion(null);
  };

  const saveQuestion = async (turn: ExamGlobalChatTurn) => {
    if (turn.savedAsMemo || memoBusyId) return;
    setMemoBusyId(turn.id);
    setActionMessage(null);
    try {
      await addMemo(user, buildMemoText(examTitle, turn));
      setChatState((prev) => ({
        ...prev,
        turns: prev.turns.map((row) => row.id === turn.id ? { ...row, savedAsMemo: true } : row),
        updatedAt: Date.now(),
      }));
      setActionMessage('已经保存到便签。');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setMemoBusyId(null);
    }
  };

  const beginHandoff = (turn: ExamGlobalChatTurn) => {
    const candidates = findKnowledgeBlockCandidates(turn.citations ?? [], knowledgeBlocks);
    if (!candidates.length) {
      setActionMessage(knowledgeBlocks.length ? '没有找到与这些页码匹配的知识块。' : '请先生成知识块路线，再把问题带过去复习。');
      return;
    }
    if (candidates.length === 1) {
      onHandoffToKnowledgeBlock(candidates[0]!.id, makeHandoffDraft(turn));
      return;
    }
    setHandoffTurn(turn);
  };

  const openQuiz = async (turn: ExamGlobalChatTurn) => {
    if (!(turn.citations?.length)) return;
    setQuizTurn(turn);
    setQuiz(null);
    setQuizAnswers({});
    setQuizFeedback([]);
    setQuizError(null);
    setQuizBusy(true);
    try {
      setQuiz(await generateExamGlobalQuiz({
        questionText: turn.questionText ?? '',
        answerText: turn.text,
        citations: turn.citations,
      }));
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : '小测生成失败');
    } finally {
      setQuizBusy(false);
    }
  };

  const submitQuiz = async () => {
    if (!quiz) return;
    setQuizBusy(true);
    setQuizError(null);
    try {
      setQuizFeedback(await gradeExamGlobalQuiz({ quiz, answers: quizAnswers }));
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : '核对失败，请重试。');
    } finally {
      setQuizBusy(false);
    }
  };

  const handoffCandidates = handoffTurn ? findKnowledgeBlockCandidates(handoffTurn.citations ?? [], knowledgeBlocks) : [];
  const canSend = availableCount > 0 && !sending && Boolean(input.trim());

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" aria-label="整场考试对话">
      <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-slate-900">{examTitle || '整场考试对话'}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                已关联 {materials.length} 份 · 当前可用 {availableCount}/{materials.length} 份
                {memory?.status === 'ready' ? ' · 全局材料地图已完成' : preparing ? ' · 地图准备中' : memory?.status === 'partial' ? ' · 地图部分完成' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearConversation}
            disabled={!chatState.turns.length || sending}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空对话
          </button>
        </div>
        {(preparing || prepareError || unavailable.length > 0 || mapNeedsRetry) && (
          <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${prepareError || unavailable.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-violet-100 bg-violet-50 text-violet-800'}`}>
            {preparing && <p className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{prepareMessage}</p>}
            {prepareError && <p className="flex flex-wrap items-center justify-between gap-2"><span>{prepareError}</span><button type="button" onClick={() => setPrepareAttempt((attempt) => attempt + 1)} className="font-black underline">重试准备</button></p>}
            {unavailable.length > 0 && (
              <p>暂不可用：{unavailable.map((material) => material.fileName).join('、')}。对话只会使用其余材料。</p>
            )}
            {mapNeedsRetry && <p className="flex flex-wrap items-center justify-between gap-2"><span>全局材料地图有一部分没有整理完成；现在仍可依据原文片段聊天。</span><button type="button" onClick={() => setPrepareAttempt((attempt) => attempt + 1)} className="font-black underline">重试地图</button></p>}
          </div>
        )}
      </div>

      <div ref={messagesRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6">
        {chatState.turns.length === 0 && !sending ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-2xl bg-violet-50 p-3 text-violet-600"><Layers3 className="h-7 w-7" /></div>
            <h3 className="text-base font-black text-slate-900">把所有考试材料放在同一个对话里</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">直接问就好。回答默认只依据当前材料，并给出可以打开的 PDF 页码；这里的聊天不会改变掌握度或学习证据。</p>
            <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
              {EMPTY_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-xs font-bold text-slate-700 hover:border-violet-200 hover:bg-violet-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatState.turns.map((turn) => {
            if (turn.role === 'user') {
              return <div key={turn.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-3 text-sm leading-relaxed text-white shadow-sm">{turn.text}</div>;
            }
            const turnMaterials = buildSyntheticMaterials(materials, turn, user.uid, examId);
            const citations = (turn.citations ?? []).map((citation) => ({
              materialId: citation.materialLinkId,
              page: citation.page,
              quote: citation.excerpt.slice(0, 120),
            }));
            return (
              <div key={turn.id} className="max-w-[96%] rounded-2xl rounded-bl-md border border-stone-200 bg-stone-50/80 px-4 py-3 shadow-sm">
                <ExamWorkspaceAssistantMarkdown
                  displayText={turn.text}
                  citations={citations}
                  materials={turnMaterials}
                  onOpenMaterialPage={(materialId, page, opts) => {
                    if (!currentMaterialIds.has(materialId)) return;
                    onOpenMaterialPage(materialId, page, opts);
                  }}
                  msgAnchor={turn.id}
                />
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-200 pt-2">
                  <button type="button" onClick={() => setEvidenceTurn(turn)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white">
                    <FileText className="h-3.5 w-3.5" />查看材料证据
                  </button>
                  <button type="button" onClick={() => beginHandoff(turn)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white">
                    <BookOpen className="h-3.5 w-3.5" />带到知识块复习
                  </button>
                  <button type="button" disabled={turn.savedAsMemo || memoBusyId === turn.id} onClick={() => void saveQuestion(turn)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-white disabled:opacity-50">
                    {memoBusyId === turn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : turn.savedAsMemo ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    {turn.savedAsMemo ? '已保存疑问' : '保存为我的疑问'}
                  </button>
                  <button type="button" disabled={!turn.citations?.length} title={!turn.citations?.length ? '先定位到材料证据，才能据此出题' : undefined} onClick={() => void openQuiz(turn)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-40">
                    <CircleHelp className="h-3.5 w-3.5" />根据这个问题考考我
                  </button>
                </div>
              </div>
            );
          })
        )}
        {sending && <div className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在对照全部材料回答…</div>}
      </div>

      <div className="shrink-0 border-t border-stone-100 bg-white px-4 py-3">
        {actionMessage && <p className="mb-2 text-[11px] font-medium text-violet-700">{actionMessage}</p>}
        {sendError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            <span>{sendError}</span>
            {lastFailedQuestion && <button type="button" onClick={() => void submitQuestion(lastFailedQuestion)} className="font-bold underline">重试</button>}
          </div>
        )}
        {availableCount === 0 && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">至少需要一份可读取的考试材料才能开始对话。</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void submitQuestion(input);
              }
            }}
            disabled={availableCount === 0 || sending}
            placeholder={availableCount > 0 ? '问这场考试的任何问题…（Enter 发送，Shift+Enter 换行）' : '等待材料准备完成…'}
            className="min-h-[52px] max-h-36 min-w-0 flex-1 resize-y rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:bg-stone-50"
          />
          {sending ? (
            <button type="button" onClick={() => sendAbortRef.current?.abort()} className="inline-flex h-[52px] shrink-0 items-center gap-1.5 rounded-xl bg-slate-700 px-4 text-sm font-bold text-white hover:bg-slate-800"><Square className="h-4 w-4" />停止</button>
          ) : (
            <button type="button" disabled={!canSend} onClick={() => void submitQuestion(input)} className="inline-flex h-[52px] shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40"><Send className="h-4 w-4" />发送</button>
          )}
        </div>
      </div>

      {evidenceTurn && (
        <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-modal="true" aria-label="材料证据">
          <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setEvidenceTurn(null)} aria-label="关闭" />
          <aside className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
              <div><p className="text-xs font-black text-violet-600">本条回答的材料证据</p><h3 className="mt-1 text-base font-black text-slate-900">{evidenceTurn.questionText || '整场考试对话'}</h3></div>
              <button type="button" onClick={() => setEvidenceTurn(null)} className="rounded-lg p-2 text-slate-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {(evidenceTurn.citations ?? []).length ? (evidenceTurn.citations ?? []).map((citation) => {
                const removed = !currentMaterialIds.has(citation.materialLinkId);
                return (
                  <button key={`${citation.chunkId}-${citation.page}`} type="button" disabled={removed} onClick={() => { onOpenMaterialPage(citation.materialLinkId, citation.page, { quote: citation.excerpt.slice(0, 120) }); setEvidenceTurn(null); }} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-left hover:border-violet-200 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-65">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-slate-800">{citation.materialName}</span><span className="shrink-0 text-[11px] font-bold text-violet-700">p.{citation.page}</span></div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{citation.excerpt}</p>
                    {removed && <p className="mt-2 text-[10px] font-bold text-amber-700">材料已从当前考试移除，历史定位仅供留痕</p>}
                  </button>
                );
              }) : <div className="rounded-xl border border-dashed border-stone-200 p-5 text-center text-sm text-slate-500">这条回答没有命中可定位的材料证据。</div>}
            </div>
          </aside>
        </div>
      )}

      {handoffTurn && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="选择知识块">
          <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setHandoffTurn(null)} aria-label="关闭" />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-base font-black text-slate-900">带到哪个知识块复习？</h3><button type="button" onClick={() => setHandoffTurn(null)} className="rounded-lg p-2 text-slate-500 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
            <p className="mt-1 text-xs text-slate-500">系统根据本条回答的材料和页码找到了这些候选。只会填入草稿，不会自动发送。</p>
            <div className="mt-4 space-y-2">
              {handoffCandidates.map((block) => (
                <button key={block.id} type="button" onClick={() => { onHandoffToKnowledgeBlock(block.id, makeHandoffDraft(handoffTurn)); setHandoffTurn(null); }} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-3 text-left hover:border-violet-200 hover:bg-violet-50"><span className="text-sm font-bold text-slate-800">{block.title}</span><ChevronRight className="h-4 w-4 text-slate-400" /></button>
              ))}
            </div>
          </div>
        </div>
      )}

      {quizTurn && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="轻量小测">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setQuizTurn(null)} aria-label="关闭" />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><p className="text-xs font-black text-violet-600">不计入掌握度的轻量提取</p><h3 className="mt-1 text-base font-black text-slate-900">{quiz?.title ?? '根据这个问题考考我'}</h3></div><button type="button" onClick={() => setQuizTurn(null)} className="rounded-lg p-2 text-slate-500 hover:bg-stone-100"><X className="h-5 w-5" /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {quizBusy && !quiz ? <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />正在根据材料证据出题…</div> : null}
              {quizError && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{quizError}</div>}
              {quiz && <div className="space-y-5">{quiz.questions.map((question, index) => {
                const feedback = quizFeedback.find((row) => row.questionId === question.id);
                return <section key={question.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="text-sm font-black text-slate-900">{index + 1}. {question.prompt}</p>{question.kind === 'choice' && question.options?.length ? <div className="mt-3 space-y-2">{question.options.map((option) => <label key={option} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700"><input type="radio" name={question.id} value={option} checked={quizAnswers[question.id] === option} onChange={() => setQuizAnswers((prev) => ({ ...prev, [question.id]: option }))} className="mt-1" />{option}</label>)}</div> : <textarea value={quizAnswers[question.id] ?? ''} onChange={(event) => setQuizAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))} placeholder="用自己的话回答…" className="mt-3 min-h-20 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300" />}{feedback && <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${feedback.verdict === 'correct' ? 'bg-emerald-50 text-emerald-800' : feedback.verdict === 'partial' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'}`}><p className="font-black">{feedback.verdict === 'correct' ? '答对了' : feedback.verdict === 'partial' ? '部分站住' : '还需要补一点'}</p><p className="mt-1 leading-relaxed">{feedback.feedback}</p><div className="mt-2 flex flex-wrap gap-1">{question.citations.map((citation) => <button key={citation.chunkId} type="button" onClick={() => onOpenMaterialPage(citation.materialLinkId, citation.page)} className="rounded border border-current/20 bg-white/60 px-1.5 py-0.5 text-[10px] font-bold">{citation.materialName} p.{citation.page}</button>)}</div></div>}</section>;
              })}</div>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 px-5 py-3">
              {quiz && <button type="button" disabled={quizBusy} onClick={() => void openQuiz(quizTurn)} className="inline-flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-stone-50"><RotateCcw className="h-3.5 w-3.5" />换一组</button>}
              {quiz && !quizFeedback.length && <button type="button" disabled={quizBusy || quiz.questions.some((question) => !quizAnswers[question.id]?.trim())} onClick={() => void submitQuiz()} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{quizBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}提交核对</button>}
              {quizFeedback.length > 0 && <button type="button" onClick={() => setQuizTurn(null)} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white">完成</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
