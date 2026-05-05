import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import type {
  AtomCoverageByKc,
  ChatMessage,
  DisciplineBand,
  DocType,
  ExamChunkCitationSnapshot,
  ExamMaterialLink,
  KcGlossaryEntry,
  KCScopedTutorContext,
  LearnerTurnQuality,
  LSAPKnowledgeComponent,
  RetrievedChunk,
  ScaffoldingPhase,
  SocraticProbeMode,
} from '@/types';
import {
  analyzeKcUtteranceForAtoms,
  buildExamChunkCitationAppendix,
  chatWithAdaptiveTutor,
  classifyDocument,
  classifyLearnerTurn,
  defineTermInLectureContext,
} from '@/services/geminiService';
import { buildKcGlossaryEntryId, extractBoldTermsFromMarkdown, normalizeTermKey } from '@/lib/text/extractBoldTermsFromMarkdown';
import { filterGlossaryTermCandidates } from '@/features/exam/lib/glossaryTermFilter';
import { computeScaffoldingPhase, heuristicQuality } from '@/lib/exam/scaffoldingClassifier';
import { computeNextProbeState } from '@/features/exam/lib/examWorkspaceOrchestrator';
import type { WorkspaceDialogueTurn } from '@/features/exam/lib/examWorkspaceLsapKey';
import {
  parseAssistantCitations,
  parseExamWorkspaceModelReply,
  parseOptsFromSnapshot,
} from '@/features/exam/lib/examWorkspaceCitations';
import { DEFAULT_TOP_K, EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS, retrieveCandidateChunks } from '@/features/exam/lib/examChunkRetrieval';
import { loadExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import type { OpenMaterialPageOptions } from '@/features/exam/workspace/ExamWorkspaceCitationBlock';
import { ExamWorkspaceAssistantMarkdown } from '@/features/exam/workspace/ExamWorkspaceAssistantMarkdown';

export interface ExamWorkspaceSocraticChatHandle {
  /** P3：滚动到指定 paragraphIndex 对应的块（data-exam-block-index） */
  scrollToParagraphBlock: (blockIndex: number) => void;
}

export interface ExamWorkspaceSocraticChatProps {
  /** 用于切换考试 / KC / 全卷时重置对话 */
  sessionKey: string;
  mergedContent: string;
  mergedLoading: boolean;
  mergedError: string | null;
  /** 未选考试或无关联材料 */
  contextBlocked: boolean;
  contextBlockedHint: string;
  disciplineBand: DisciplineBand;
  examTitle: string;
  /** M3：锚定考点；null 为全卷模式（与 M3 前行为一致） */
  activeKc: LSAPKnowledgeComponent | null;
  workspaceAtomCoverage: AtomCoverageByKc;
  onAtomCoverageChange: (next: AtomCoverageByKc) => void;
  /** M5：持久化留痕（用于切换 KC 后恢复本条 session 的对话） */
  workspaceDialogueTranscript: WorkspaceDialogueTurn[];
  /** M5：对话留痕（按 sessionKey 分段合并到 bundle） */
  onDialogueTranscriptChange?: (turns: WorkspaceDialogueTurn[], chatSessionKey: string) => void;
  /** 当前 KC 已收录术语（用于去重）；无 activeKc 时不使用 */
  kcGlossaryForActiveKc: KcGlossaryEntry[];
  onGlossaryAppend: (entries: KcGlossaryEntry[]) => void;
  onGlossaryDefiningChange?: (busy: boolean) => void;
  /** P1：本场关联材料（citations 校验 + 链钮展示文件名） */
  materials: ExamMaterialLink[];
  /** P1/P3：打开讲义预览；opts 含 quote（高亮）、paragraphIndex（回到段落） */
  onOpenMaterialPage: (materialId: string, page: number, opts?: OpenMaterialPageOptions) => void;
  /** 1-3：与 chunk 索引一致；为 null 时不做检索注入 */
  workspaceLsapKey: string | null;
  /** 开发调试：每轮用户发送后检索完成时回调（含空数组），便于对照模型引用 */
  onChunkRetrievalRound?: (payload: { retrieved: RetrievedChunk[]; indexEmpty?: boolean }) => void;
  /**
   * 1-4：仅在该材料的 chunk 上 BM25（需与「当前预览」等材料 id 对齐）；默认 null = 整场多材料检索。
   */
  chunkRetrievalMaterialLinkIdFilter?: string | null;
}

function atomProgressForKc(kc: LSAPKnowledgeComponent, cov: AtomCoverageByKc): { covered: number; total: number } {
  const atoms = kc.atoms ?? [];
  const total = atoms.length;
  if (total === 0) return { covered: 0, total: 0 };
  let covered = 0;
  for (const a of atoms) {
    if (cov[kc.id]?.[a.id] === true) covered++;
  }
  return { covered, total };
}

function mergeCoverageForKc(prev: AtomCoverageByKc, kcId: string, coveredIds: string[]): AtomCoverageByKc {
  const row = { ...(prev[kcId] ?? {}) };
  for (const id of coveredIds) {
    if (id) row[id] = true;
  }
  return { ...prev, [kcId]: row };
}

/**
 * 从 bundle 留痕中恢复当前 session 的消息。
 * - 优先：sessionKey 严格相等（新数据路径）。
 * - 兜底：无 sessionKey 的旧 turn，且 kcId 与当前锚定 KC 一致时纳入（全卷/无 KC 时不做兜底，避免串线）。
 */
function hydrateChatMessagesFromTranscript(
  transcript: WorkspaceDialogueTurn[],
  sessionKey: string,
  activeKcId: string | null
): ChatMessage[] {
  const strict = transcript.filter((t) => t.sessionKey === sessionKey);
  const source = strict.length > 0 ? strict : activeKcId
    ? transcript.filter((t) => !t.sessionKey && t.kcId === activeKcId)
    : [];
  return [...source]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((t) => ({
      role: t.role,
      text: t.text,
      timestamp: t.timestamp,
      ...(t.examChunkCitationSnapshot ? { examChunkCitationSnapshot: t.examChunkCitationSnapshot } : {}),
    }));
}

function mapChatMessagesToDialogueTurns(
  msgs: ChatMessage[],
  activeKc: LSAPKnowledgeComponent | null
): WorkspaceDialogueTurn[] {
  return msgs.map((m) => ({
    role: m.role,
    text: m.text,
    timestamp: m.timestamp,
    ...(activeKc ? { kcId: activeKc.id } : {}),
    ...(m.examChunkCitationSnapshot ? { examChunkCitationSnapshot: m.examChunkCitationSnapshot } : {}),
  }));
}

export const ExamWorkspaceSocraticChat = forwardRef<ExamWorkspaceSocraticChatHandle, ExamWorkspaceSocraticChatProps>(
  function ExamWorkspaceSocraticChat(
    {
      sessionKey,
      mergedContent,
      mergedLoading,
      mergedError,
      contextBlocked,
      contextBlockedHint,
      disciplineBand,
      examTitle,
      activeKc,
      workspaceAtomCoverage,
      onAtomCoverageChange,
      onDialogueTranscriptChange,
      workspaceDialogueTranscript,
      kcGlossaryForActiveKc,
      onGlossaryAppend,
      onGlossaryDefiningChange,
      materials,
      onOpenMaterialPage,
      workspaceLsapKey,
      onChunkRetrievalRound,
      chunkRetrievalMaterialLinkIdFilter,
    },
    ref
  ) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** 1-4：chunk 附录不可用时的轻提示（文末 JSON 降级），每轮发送覆盖 */
  const [citationPipelineHint, setCitationPipelineHint] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>('STEM');
  const classifyCacheRef = useRef<Map<string, DocType>>(new Map());

  const validMaterialIdSet = useMemo(() => new Set(materials.map((m) => m.id)), [materials]);

  /** P4：连续薄弱轮（weak/empty/partial）；好回答（strong）归零 */
  const consecutiveWeakStreakRef = useRef(0);
  const totalUserTurnsRef = useRef(0);
  const [debugScaffold, setDebugScaffold] = useState(false);
  const [lastScaffoldInfo, setLastScaffoldInfo] = useState<{
    phase: ScaffoldingPhase;
    quality: LearnerTurnQuality;
    streak: number;
    probeMode?: SocraticProbeMode;
  } | null>(null);

  /** 避免合并覆盖时用到过期的 workspaceAtomCoverage 闭包 */
  const workspaceAtomCoverageRef = useRef(workspaceAtomCoverage);
  useEffect(() => {
    workspaceAtomCoverageRef.current = workspaceAtomCoverage;
  }, [workspaceAtomCoverage]);

  /** M3 编排 */
  const probeModeRef = useRef<SocraticProbeMode>('direct');
  const bloomTargetRef = useRef<1 | 2 | 3>(1);
  const stressDoneForKcRef = useRef<Record<string, boolean>>({});
  const gapAtomIdsRef = useRef<string[]>([]);
  const lastAtomAnalyzeKeyRef = useRef<string>('');
  const activeKcIdForGlossaryRef = useRef<string | null>(null);
  const glossaryInflightRef = useRef(0);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  /** 1-3：本轮检索候选（与 model 消息上的 snapshot 同源用途；便于扩展） */
  const lastRetrievedChunksRef = useRef<RetrievedChunk[] | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      scrollToParagraphBlock: (blockIndex: number) => {
        const root = messagesScrollRef.current;
        if (!root) return;
        const el = root.querySelector(`[data-exam-block-index="${blockIndex}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    }),
    []
  );
  /** 避免把 workspaceDialogueTranscript 放进 hydration 依赖导致父级每次 setState 都重灌消息 */
  const workspaceDialogueTranscriptRef = useRef(workspaceDialogueTranscript);
  workspaceDialogueTranscriptRef.current = workspaceDialogueTranscript;
  /** 补灌 late transcript 时读取当前 session（不放进 effect 依赖，避免与 session 切换竞态） */
  const sessionKeyRef = useRef(sessionKey);
  const activeKcIdHydrateRef = useRef<string | null>(activeKc?.id ?? null);
  sessionKeyRef.current = sessionKey;
  activeKcIdHydrateRef.current = activeKc?.id ?? null;
  useEffect(() => {
    activeKcIdForGlossaryRef.current = activeKc?.id ?? null;
  }, [activeKc?.id]);

  /** 新消息或「思考中」出现时滚到底部 */
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, sending]);

  useEffect(() => {
    setDebugScaffold(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);

  useEffect(() => {
    setCitationPipelineHint(null);
  }, [sessionKey]);

  /**
   * 切换考试 / 学科带 / KC↔全卷：在绘制前灌入当前 sessionKey 对应留痕，保证与标题/侧栏锚定一致。
   * useLayoutEffect 先于 useEffect，避免与「仅 transcript 变更」的补灌互相覆盖时仍读到上一 session 的 prev。
   */
  useLayoutEffect(() => {
    setInput('');
    setSendError(null);
    consecutiveWeakStreakRef.current = 0;
    setLastScaffoldInfo(null);
    probeModeRef.current = 'direct';
    bloomTargetRef.current = 1;
    stressDoneForKcRef.current = {};
    gapAtomIdsRef.current = [];
    lastAtomAnalyzeKeyRef.current = '';

    const hydrated = hydrateChatMessagesFromTranscript(
      workspaceDialogueTranscriptRef.current,
      sessionKey,
      activeKc?.id ?? null
    );
    setMessages(hydrated);
    totalUserTurnsRef.current = hydrated.filter((m) => m.role === 'user').length;
    /** 与 setMessages 同相位回写 bundle，避免 M5 useEffect 晚一拍时用「上一 session 的 messages + 新 sessionKey」污染留痕 */
    if (onDialogueTranscriptChange) {
      onDialogueTranscriptChange(mapChatMessagesToDialogueTurns(hydrated, activeKc), sessionKey);
    }
  }, [sessionKey, activeKc?.id, onDialogueTranscriptChange]);

  /**
   * 仅当 workspaceDialogueTranscript 引用更新时：bundle 晚到、当前列表仍空则补灌。
   * 故意不把 sessionKey 放入依赖：session 切换已由 useLayoutEffect 处理；此处只服务「同一会话下 transcript 从空到有」。
   */
  useEffect(() => {
    const sk = sessionKeyRef.current;
    const aid = activeKcIdHydrateRef.current;
    const hydrated = hydrateChatMessagesFromTranscript(workspaceDialogueTranscript, sk, aid);
    if (hydrated.length === 0) return;
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      totalUserTurnsRef.current = hydrated.filter((m) => m.role === 'user').length;
      return hydrated;
    });
  }, [workspaceDialogueTranscript]);

  /** M5：messages 变更后同步留痕（上限由 App/truncate 处理） */
  useEffect(() => {
    if (!onDialogueTranscriptChange) return;
    const turns: WorkspaceDialogueTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
      timestamp: m.timestamp,
      ...(activeKc ? { kcId: activeKc.id } : {}),
      ...(m.examChunkCitationSnapshot ? { examChunkCitationSnapshot: m.examChunkCitationSnapshot } : {}),
    }));
    onDialogueTranscriptChange(turns, sessionKey);
  }, [messages, sessionKey, activeKc?.id, onDialogueTranscriptChange]);

  const classifyKey = useMemo(() => {
    const day = new Date().toDateString();
    return `${day}_${mergedContent.slice(0, 4000)}`;
  }, [mergedContent]);

  useEffect(() => {
    if (!mergedContent.trim()) {
      setDocType('STEM');
      return;
    }
    const cached = classifyCacheRef.current.get(classifyKey);
    if (cached) {
      setDocType(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = await classifyDocument(mergedContent.slice(0, 16000));
        if (cancelled) return;
        classifyCacheRef.current.set(classifyKey, t);
        setDocType(t);
      } catch {
        if (!cancelled) setDocType('STEM');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classifyKey, mergedContent]);

  const canSend =
    !contextBlocked &&
    !mergedLoading &&
    !mergedError &&
    mergedContent.trim().length > 0 &&
    !sending;

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !canSend) return;
    setSending(true);
    setSendError(null);

    let quality: LearnerTurnQuality = heuristicQuality(text);
    if (mergedContent.length < 50000 && text.length > 8 && quality === 'partial') {
      try {
        quality = await classifyLearnerTurn(text);
      } catch {
        /* 保持 heuristic */
      }
    }

    const prevStreak = consecutiveWeakStreakRef.current;
    const newStreak = quality === 'strong' ? 0 : prevStreak + 1;
    consecutiveWeakStreakRef.current = newStreak;

    totalUserTurnsRef.current += 1;
    const totalUserTurns = totalUserTurnsRef.current;

    const phase = computeScaffoldingPhase({
      quality,
      consecutiveWeakStreak: newStreak,
      totalUserTurns,
    });

    const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    const historyForApi = messages;

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    const baseScaffold = {
      quality,
      phase,
      consecutiveWeakStreak: newStreak,
      totalUserTurns,
    };

    let orch: ReturnType<typeof computeNextProbeState> | null = null;
    let kcCtx: KCScopedTutorContext | undefined;

    if (activeKc) {
      const cov = atomProgressForKc(activeKc, workspaceAtomCoverage);
      orch = computeNextProbeState({
        prevProbeMode: probeModeRef.current,
        prevBloomTarget: bloomTargetRef.current,
        quality,
        consecutiveWeakStreak: newStreak,
        covered: cov.covered,
        total: cov.total,
        stressDoneForKc: stressDoneForKcRef.current[activeKc.id] ?? false,
        phase,
      });
      kcCtx = {
        ...baseScaffold,
        kcId: activeKc.id,
        kcConcept: activeKc.concept,
        kcDefinition: activeKc.definition,
        atoms: activeKc.atoms ?? [],
        probeMode: orch.probeMode,
        bloomTarget: orch.bloomTarget,
        gapAtomIds: gapAtomIdsRef.current.length ? [...gapAtomIdsRef.current] : undefined,
      };
      setLastScaffoldInfo({ phase, quality, streak: newStreak, probeMode: orch.probeMode });
    } else {
      setLastScaffoldInfo({ phase, quality, streak: newStreak });
    }

    try {
      /**
       * 1-3 / 1-4：先探测 IndexedDB 是否有 chunk → 再 BM25（整场多材料，或 `chunkRetrievalMaterialLinkIdFilter` 单材料）。
       * 无索引 / 检索空 / 检索抛错：**不** 注入 `buildExamChunkCitationAppendix`；`chatWithAdaptiveTutor` 走 `else` 附加 `buildExamWorkspaceCitationInstruction`（与 chunk 附录 **互斥**）。
       */
      let examChunkCitationAppendix: string | undefined;
      let chunkSnapshot: ExamChunkCitationSnapshot | undefined;
      lastRetrievedChunksRef.current = null;
      setCitationPipelineHint(null);

      if (workspaceLsapKey?.trim()) {
        try {
          const indexChunks = await loadExamMaterialChunkIndex(workspaceLsapKey);
          const hasIndex = Boolean(indexChunks && indexChunks.length > 0);

          if (!hasIndex && materials.length > 0) {
            lastRetrievedChunksRef.current = null;
            onChunkRetrievalRound?.({ retrieved: [], indexEmpty: true });
            setCitationPipelineHint(
              '本场讲义 chunk 索引为空或尚未重建。定位引用已回退为文末 JSON（页码由模型估算，请核对原文）。'
            );
          } else if (hasIndex) {
            const lastAssistant = [...historyForApi].reverse().find((m) => m.role === 'model');
            const tail =
              lastAssistant?.text && lastAssistant.text.length > 0
                ? lastAssistant.text.slice(0, EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS)
                : '';
            const query = tail ? `${text}\n${tail}` : text;
            const retrieved = await retrieveCandidateChunks({
              workspaceKey: workspaceLsapKey,
              query,
              topK: DEFAULT_TOP_K,
              materialLinkIdFilter: chunkRetrievalMaterialLinkIdFilter ?? undefined,
            });
            lastRetrievedChunksRef.current = retrieved.length > 0 ? retrieved : null;
            onChunkRetrievalRound?.({ retrieved });
            if (retrieved.length > 0) {
              examChunkCitationAppendix = buildExamChunkCitationAppendix(retrieved);
              chunkSnapshot = {
                chunks: Object.fromEntries(
                  retrieved.map((r) => [
                    r.chunk.chunkId,
                    { materialLinkId: r.chunk.materialLinkId, page: r.chunk.page },
                  ])
                ),
              };
            } else if (materials.length > 0) {
              /** 有索引但 Top-K 为空（查询无关或筛选后无块）：与「无索引」相同降级策略 → 文末 JSON */
              setCitationPipelineHint(
                '本轮检索无命中（或「仅当前预览」下无可用 chunk）。定位引用已回退为文末 JSON，请核对页码。'
              );
            }
          }
        } catch (e) {
          console.warn('[examChunkCitation] chunk 索引加载或 retrieveCandidateChunks 失败', e);
          lastRetrievedChunksRef.current = null;
          onChunkRetrievalRound?.({ retrieved: [] });
          if (materials.length > 0) {
            setCitationPipelineHint('chunk 检索失败，已回退为文末 JSON 引用协议。');
          }
        }
      }

      const reply = await chatWithAdaptiveTutor(
        mergedContent,
        historyForApi,
        text,
        'tutoring',
        docType,
        undefined,
        disciplineBand,
        kcCtx ?? baseScaffold,
        materials,
        examChunkCitationAppendix
      );
      const modelMsg: ChatMessage = {
        role: 'model',
        text: reply,
        timestamp: Date.now(),
        ...(chunkSnapshot ? { examChunkCitationSnapshot: chunkSnapshot } : {}),
      };
      setMessages((prev) => [...prev, modelMsg]);

      if (activeKc && mergedContent.trim()) {
        const kcSnap = activeKc;
        const kcId = kcSnap.id;
        const snapshotGlossary = kcGlossaryForActiveKc;
        const glossaryParseOpts =
          chunkSnapshot != null
            ? {
                chunkCandidateIds: new Set(Object.keys(chunkSnapshot.chunks)),
                chunkById: new Map(Object.entries(chunkSnapshot.chunks)),
              }
            : null;
        const { displayText: replyForGlossary } = parseExamWorkspaceModelReply(reply, glossaryParseOpts);
        void (async () => {
          const candidates = filterGlossaryTermCandidates(extractBoldTermsFromMarkdown(replyForGlossary));
          const existing = new Set(snapshotGlossary.map((e) => normalizeTermKey(e.term)));
          const pending: string[] = [];
          for (const term of candidates) {
            const nk = normalizeTermKey(term);
            if (!nk || existing.has(nk)) continue;
            existing.add(nk);
            pending.push(term);
          }
          if (!pending.length) return;
          glossaryInflightRef.current += 1;
          if (glossaryInflightRef.current === 1) onGlossaryDefiningChange?.(true);
          try {
            for (let i = 0; i < pending.length; i += 2) {
              const chunk = pending.slice(i, i + 2);
              const part = await Promise.all(
                chunk.map(async (term) => {
                  if (activeKcIdForGlossaryRef.current !== kcId) return null;
                  const def = await defineTermInLectureContext(mergedContent, kcSnap, term);
                  if (activeKcIdForGlossaryRef.current !== kcId) return null;
                  if (!def?.trim()) return null;
                  const entry: KcGlossaryEntry = {
                    id: buildKcGlossaryEntryId(kcId, term),
                    kcId,
                    term,
                    definition: def.trim(),
                    firstSeenAt: Date.now(),
                  };
                  return entry;
                })
              );
              const ok = part.filter((x): x is KcGlossaryEntry => x != null);
              if (ok.length && activeKcIdForGlossaryRef.current === kcId) {
                onGlossaryAppend(ok);
              }
            }
          } finally {
            glossaryInflightRef.current -= 1;
            if (glossaryInflightRef.current <= 0) {
              glossaryInflightRef.current = 0;
              onGlossaryDefiningChange?.(false);
            }
          }
        })();
      }

      if (activeKc && orch) {
        bloomTargetRef.current = orch.bloomTarget;
        if (orch.probeMode === 'stress') {
          probeModeRef.current = 'direct';
          stressDoneForKcRef.current[activeKc.id] = true;
        } else {
          probeModeRef.current = orch.probeMode;
        }
      }

      if (activeKc?.atoms?.length) {
        const dedupeKey = `${activeKc.id}:${userMsg.timestamp}:${text}`;
        if (lastAtomAnalyzeKeyRef.current !== dedupeKey) {
          lastAtomAnalyzeKeyRef.current = dedupeKey;
          try {
            const { coveredAtomIds, gapAtomIds } = await analyzeKcUtteranceForAtoms(mergedContent, activeKc, text);
            gapAtomIdsRef.current = gapAtomIds;
            if (coveredAtomIds.length > 0) {
              onAtomCoverageChange(
                mergeCoverageForKc(workspaceAtomCoverageRef.current, activeKc.id, coveredAtomIds)
              );
            }
          } catch (e) {
            console.warn('analyzeKcUtteranceForAtoms', e);
          }
        }
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    mergedContent,
    messages,
    docType,
    disciplineBand,
    input,
    activeKc,
    workspaceAtomCoverage,
    onAtomCoverageChange,
    kcGlossaryForActiveKc,
    onGlossaryAppend,
    onGlossaryDefiningChange,
    materials,
    workspaceLsapKey,
    onChunkRetrievalRound,
    chunkRetrievalMaterialLinkIdFilter,
  ]);

  const emptyState = contextBlocked || mergedLoading || !!mergedError || !mergedContent.trim();

  const subtitle = activeKc
    ? `「${examTitle || '本场'}」· 锚定：${activeKc.concept}`
    : `${examTitle ? `「${examTitle}」` : '未选考试'} · 全卷（未锚定 KC）`;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      aria-label="本场苏格拉底对话复习"
    >
      <div className="shrink-0 border-b border-stone-100 px-4 py-3 bg-stone-50/80">
        <div className="flex items-center gap-2 text-slate-800">
          <MessageCircle className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <h2 className="text-sm font-bold">本场苏格拉底对话复习</h2>
            <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
            {debugScaffold && lastScaffoldInfo && (
              <p className="text-[10px] text-violet-700 font-mono mt-1">
                [debug] q={lastScaffoldInfo.quality} phase={lastScaffoldInfo.phase} streak={lastScaffoldInfo.streak}
                {lastScaffoldInfo.probeMode != null ? ` probe=${lastScaffoldInfo.probeMode}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {emptyState ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center text-sm text-slate-500 space-y-2">
            {contextBlocked && <p>{contextBlockedHint}</p>}
            {!contextBlocked && mergedLoading && (
              <p className="inline-flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                正在合并本场关联材料全文…
              </p>
            )}
            {!contextBlocked && !mergedLoading && mergedError && (
              <div className="space-y-1 text-rose-600">
                <p>{mergedError}</p>
                <p className="text-xs text-rose-700/90">
                  合并讲义失败时无法开始苏格拉底对话，避免模型在空/错误上下文中臆测；请检查材料或网络后重试。
                </p>
              </div>
            )}
            {!contextBlocked && !mergedLoading && !mergedError && !mergedContent.trim() && (
              <p>已选考试，但未能从关联材料读出文本。请检查本地是否曾打开过 PDF，或云端文件是否可下载。</p>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center space-y-3">
            {activeKc ? (
              <>
                <p className="text-slate-700 font-medium text-sm max-w-md">
                  用你自己的话解释：<span className="text-indigo-800 font-bold">{activeKc.concept}</span>
                  {activeKc.definition ? `（${activeKc.definition.slice(0, 120)}${activeKc.definition.length > 120 ? '…' : ''}）` : ''}
                </p>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                  对话将围绕当前选中考点；我会结合讲义与逻辑原子逐步追问。若尚未提取原子，仍可先围绕定义与材料讨论。
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-700 font-medium text-sm max-w-md">
                  用你自己的话说说：本场考试里，你最担心的一个考点是什么？
                </p>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                  我会在全卷范围内先问后讲；若需聚焦某一考点，请在左侧取消「全卷对话」并选择 KC。
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            ref={messagesScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-3"
          >
            {messages.map((m, i) => {
              const chunkOpts =
                m.role === 'model' && m.examChunkCitationSnapshot
                  ? parseOptsFromSnapshot(m.examChunkCitationSnapshot)
                  : null;
              const { displayText, citations } =
                m.role === 'model'
                  ? chunkOpts
                    ? parseExamWorkspaceModelReply(m.text, chunkOpts)
                    : parseAssistantCitations(m.text)
                  : { displayText: m.text, citations: [] };
              const safeCitations =
                m.role === 'model'
                  ? citations.filter((c) => validMaterialIdSet.has(c.materialId))
                  : [];
              return (
                <div
                  key={`${m.timestamp}-${i}`}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-md whitespace-pre-wrap'
                        : 'bg-stone-100 text-slate-800 rounded-bl-md border border-stone-200'
                    }`}
                  >
                    {m.role === 'user' ? (
                      m.text
                    ) : (
                      <ExamWorkspaceAssistantMarkdown
                        displayText={displayText}
                        citations={safeCitations}
                        materials={materials}
                        onOpenMaterialPage={onOpenMaterialPage}
                        msgAnchor={`msg-${m.timestamp}-${i}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-stone-50 border border-stone-200 text-slate-500 text-sm inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 思考中…
                </div>
              </div>
            )}
          </div>
        )}

        {sendError && <p className="shrink-0 px-4 text-xs text-rose-600">{sendError}</p>}
        {citationPipelineHint && (
          <p className="shrink-0 px-4 text-[11px] text-amber-800 bg-amber-50/90 border-t border-amber-100 py-2 leading-snug">
            {citationPipelineHint}
          </p>
        )}

        <div className="shrink-0 border-t border-stone-100 bg-white p-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={!canSend}
              placeholder={
                canSend
                  ? '输入你的想法或疑问…（Enter 发送，Shift+Enter 换行）'
                  : contextBlocked
                    ? '请先选择考试并关联材料'
                    : '等待材料合并完成…'
              }
              rows={3}
              className="flex-1 min-h-[72px] max-h-40 border border-stone-200 rounded-xl px-3 py-2 text-sm text-slate-800 disabled:bg-stone-100 disabled:text-slate-400 resize-y"
            />
            <button
              type="button"
              onClick={() => onSend()}
              disabled={!canSend || !input.trim()}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

ExamWorkspaceSocraticChat.displayName = 'ExamWorkspaceSocraticChat';
