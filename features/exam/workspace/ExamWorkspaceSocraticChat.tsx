import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import type {
  AtomCoverageByKc,
  ChatMessage,
  DisciplineBand,
  DocType,
  ExamChunkCitationSnapshot,
  ExamMaterialLink,
  ExamReviewScope,
  KcGlossaryEntry,
  KCScopedTutorContext,
  LearnerTurnQuality,
  LSAPContentMap,
  LSAPKnowledgeComponent,
  MultiKCScopedTutorContext,
  RetrievedChunk,
  ScaffoldingPhase,
  SocraticProbeMode,
} from '@/types';
import {
  analyzeKcUtteranceForAtoms,
  analyzeMultiKcUtteranceForAtoms,
  buildExamChunkCitationAppendix,
  buildExamScopedChunkCitationAppendix,
  chatWithAdaptiveTutor,
  classifyDocument,
  classifyLearnerTurn,
  defineTermInLectureContext,
} from '@/services/geminiService';
import { lookupKcIdByAtomId, type WorkspaceEvidenceAnnotation } from '@/features/exam/lib/examWorkspaceLsapKey';
import {
  deferRevisit,
  fallbackWorkspaceTurnId,
  findDueRevisit,
  makeWorkspaceTurnId,
  resolveRevisit,
  upsertEvidenceAnnotation,
} from '@/features/exam/lib/examLearningEvidence';
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
  /** 外部快捷入口：启动一段验证任务；闭卷类任务不再把长指令塞进输入框。 */
  usePrompt: (text: string, meta?: { id?: string; label?: string; description?: string }) => void;
  /** 整场考试对话交接：只填入可编辑草稿，不启动任务、不自动发送。 */
  setDraft: (text: string) => void;
  scrollToTurn: (turnId: string) => void;
  askRevisitNow: (annotationId: string) => void;
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
  /** V1：前台以知识块为锚点；底层仍可能是单 KC 或多 KC。 */
  focusLabel?: string;
  /** V2：当前知识块的理解目标，帮助空状态和快捷入口更像备考工具。 */
  focusKeyPoints?: string[];
  /** V4：整场闭卷收束判定时的内部路线参考；不直接展示给用户。 */
  routeClosureReference?: string;
  quickPrompts?: Array<{ id: string; label: string; text: string; description?: string }>;
  /** M3：锚定考点；null 为全卷模式（与 M3 前行为一致） */
  activeKc: LSAPKnowledgeComponent | null;
  workspaceAtomCoverage: AtomCoverageByKc;
  onAtomCoverageChange: (next: AtomCoverageByKc) => void;
  /** M5：持久化留痕（用于切换 KC 后恢复本条 session 的对话） */
  workspaceDialogueTranscript: WorkspaceDialogueTurn[];
  evidenceAnnotations: WorkspaceEvidenceAnnotation[];
  onEvidenceAnnotationsChange: (next: WorkspaceEvidenceAnnotation[]) => void;
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
  /** 当前复习块边界：用于把主证据锁在当前材料/页码范围，避免串台。 */
  reviewScope?: ExamReviewScope | null;
  /**
   * 阶段 2：父级 selectedKcIds.length === 0 时为 true，UI 应禁用输入框并显示「请先选择 KC」提示。
   * 不影响对话路径本身（对话仍由 activeKc 驱动）。
   */
  noKcSelected?: boolean;
  /**
   * 阶段 3：选中的 KC 列表（来自父级 selectedKcIds + workspaceLsapContentMap 解析）。
   * length === 1 时，selectedKcs[0] 与 activeKc 是同一对象，单 KC 路径仍由 activeKc 驱动；
   * length >= 2 时，activeKc 为 null，对话和 atom 分发走多选路径，使用本字段。
   */
  selectedKcs?: LSAPKnowledgeComponent[];
  /**
   * 阶段 3：完整的 LSAPContentMap，用于 mergeCoverageForKcs 内部 lookupKcIdByAtomId 反查。
   * 仅多选路径使用；为 null 时多选路径会跳过 atom 分发更新。
   */
  workspaceLsapContentMap?: LSAPContentMap | null;
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
 * 阶段 3：多选 KC（>=2）模式下，把 AI 返回的 coveredAtomIds 按各 atom 的所属 kc 分发更新。
 *
 * 与 mergeCoverageForKc 平级——单选走原函数（不动），多选走本函数。
 * 内部通过链式调用原 mergeCoverageForKc 完成多 KC 分发，**不修改原函数**。
 *
 * 三道防线（防 AI 幻觉 + 防归属错误，参照 PLAN.md §2 约束 C）：
 * 1. 白名单 = 选中 KC 的 atom id union；任何不在白名单的 atomId 直接丢弃。
 * 2. lookupKcIdByAtomId 反查（基于 LogicAtom 物理归属，禁止字符串解析）；找不到则跳过。
 * 3. 每组归属由 contentMap 中的 KC.atoms 物理位置决定，不靠 atomId 字符串前缀。
 */
function mergeCoverageForKcs(
  prev: AtomCoverageByKc,
  coveredAtomIds: string[],
  selectedKcs: LSAPKnowledgeComponent[],
  contentMap: LSAPContentMap
): AtomCoverageByKc {
  // 1. 白名单：所有选中 KC 的 atom id 合集
  const allowed = new Set<string>();
  for (const kc of selectedKcs) {
    for (const atom of kc.atoms ?? []) allowed.add(atom.id);
  }

  // 2. 白名单过滤（丢弃 AI 幻觉 + 选中 KC 之外的 atom）
  const valid = coveredAtomIds.filter((id) => allowed.has(id));
  if (valid.length === 0) return prev;

  // 3. 按 kcId 分组（用阶段 1 的 lookupKcIdByAtomId，禁止字符串解析）
  const byKc: Record<string, string[]> = {};
  for (const atomId of valid) {
    const kcId = lookupKcIdByAtomId(atomId, contentMap);
    if (!kcId) continue; // 防御性：理论上白名单已过滤
    if (!byKc[kcId]) byKc[kcId] = [];
    byKc[kcId].push(atomId);
  }

  // 4. 对每个 kcId 调用原 mergeCoverageForKc（链式不变性，不修改原函数）
  let result = prev;
  for (const [kcId, atomIds] of Object.entries(byKc)) {
    result = mergeCoverageForKc(result, kcId, atomIds);
  }
  return result;
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
    .map((t, index) => ({
      id: fallbackWorkspaceTurnId(t, index),
      role: t.role,
      text: t.text,
      timestamp: t.timestamp,
      ...(t.examChunkCitationSnapshot ? { examChunkCitationSnapshot: t.examChunkCitationSnapshot } : {}),
      ...(t.coveredAtomIds ? { coveredAtomIds: t.coveredAtomIds } : {}),
      ...(t.revisitAnnotationId ? { revisitAnnotationId: t.revisitAnnotationId } : {}),
      ...(t.revisitPhase ? { revisitPhase: t.revisitPhase } : {}),
    }));
}

type PromptMode = 'closed-book' | 'mini-integration' | 'whole-route';

type LocalChatMessage = ChatMessage & {
  localTaskPrompt?: boolean;
  localTaskMode?: PromptMode;
  coveredAtomIds?: string[];
  revisitAnnotationId?: string;
  revisitPhase?: 'question' | 'feedback';
};

function mapChatMessagesToDialogueTurns(
  msgs: LocalChatMessage[],
  activeKc: LSAPKnowledgeComponent | null
): WorkspaceDialogueTurn[] {
  return msgs
    .filter((m) => !m.localTaskPrompt)
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      timestamp: m.timestamp,
      ...(activeKc ? { kcId: activeKc.id } : {}),
      ...(m.examChunkCitationSnapshot ? { examChunkCitationSnapshot: m.examChunkCitationSnapshot } : {}),
      ...(m.coveredAtomIds ? { coveredAtomIds: m.coveredAtomIds } : {}),
      ...(m.revisitAnnotationId ? { revisitAnnotationId: m.revisitAnnotationId } : {}),
      ...(m.revisitPhase ? { revisitPhase: m.revisitPhase } : {}),
    }));
}

const CLOSED_BOOK_REBUILD_MARKER = '请进入「闭卷重建」模式';
const WHOLE_ROUTE_CLOSURE_MARKER = '请进入「整场闭卷收束」模式';
const MINI_INTEGRATION_MARKER = '请进入「小整合」模式';

type StagedPrompt = {
  id?: string;
  label: string;
  text: string;
  description?: string;
  mode: PromptMode;
};

function wantsGlobalContext(text: string): boolean {
  return /全局|整体|整场|前后|上下文|联系|关系|连接|衔接|对比|区别|相同|不同|module|模块|part|lecture|讲义|材料|串|复盘|总结|整合/i.test(
    text
  );
}

type PageWindow = { start: number; end: number };

function normalizePageWindow(window: PageWindow | null | undefined): PageWindow | null {
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end)) return null;
  const start = Math.max(1, Math.round(Math.min(window.start, window.end)));
  const end = Math.max(1, Math.round(Math.max(window.start, window.end)));
  return { start, end };
}

function extractMentionedPages(text: string): number[] {
  const pages = new Set<number>();
  const patterns = [
    /(?:第\s*)?(\d{1,4})\s*页/g,
    /\bp\.?\s*(\d{1,4})\b/gi,
    /\bpage\s*(\d{1,4})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const page = Number(match[1]);
      if (Number.isFinite(page) && page >= 1) pages.add(Math.round(page));
    }
  }
  return [...pages].sort((a, b) => a - b);
}

function dedupeRetrievedChunks(rows: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const result: RetrievedChunk[] = [];
  for (const row of rows) {
    const id = row.chunk.chunkId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(row);
  }
  return result;
}

async function retrieveForPageWindows(input: {
  workspaceKey: string;
  query: string;
  topK: number;
  materialLinkIdFilter?: string;
  windows: PageWindow[];
  padding?: number;
}): Promise<RetrievedChunk[]> {
  const windows = input.windows.map(normalizePageWindow).filter((w): w is PageWindow => Boolean(w));
  if (!windows.length) return [];
  const groups = await Promise.all(
    windows.map((window) =>
      retrieveCandidateChunks({
        workspaceKey: input.workspaceKey,
        query: input.query,
        topK: input.topK,
        materialLinkIdFilter: input.materialLinkIdFilter,
        pageRangeFilter: { ...window, padding: input.padding ?? 1 },
      })
    )
  );
  return dedupeRetrievedChunks(groups.flat()).slice(0, input.topK);
}

function isClosedBookRebuildRequest(text: string): boolean {
  return text.includes(CLOSED_BOOK_REBUILD_MARKER);
}

function isWholeRouteClosureRequest(text: string): boolean {
  return text.includes(WHOLE_ROUTE_CLOSURE_MARKER);
}

function getPromptMode(text: string): PromptMode | null {
  if (isClosedBookRebuildRequest(text)) return 'closed-book';
  if (isWholeRouteClosureRequest(text)) return 'whole-route';
  if (text.includes(MINI_INTEGRATION_MARKER)) return 'mini-integration';
  return null;
}

function getStagedPromptCopy(prompt: StagedPrompt): { title: string; body: string; placeholder: string } {
  if (prompt.mode === 'closed-book') {
    return {
      title: '闭卷讲一遍已准备好',
      body: '现在别看材料和提示，直接用自己的话复述这一块。我会判断是不是真的站住了。',
      placeholder: '直接写你的闭卷复述…',
    };
  }
  if (prompt.mode === 'mini-integration') {
    return {
      title: '小整合已准备好',
      body: '现在别看路线，试着说清最近几块之间的关系。我会看你是不是只懂单块。',
      placeholder: '写下这几块怎么连起来…',
    };
  }
  return {
    title: '整场收束已准备好',
    body: '现在别看材料、不看路线，直接重建整场材料的大图。我会判断整条路线是否站住。',
    placeholder: '写下整场材料的大图…',
  };
}

function buildLocalTaskPromptMessage(prompt: StagedPrompt): LocalChatMessage {
  const copy = getStagedPromptCopy(prompt);
  return {
    role: 'model',
    text: `${copy.title}\n${copy.body}`,
    timestamp: Date.now(),
    localTaskPrompt: true,
    localTaskMode: prompt.mode,
  };
}

function buildClosedBookEvaluationDirective(focusLabel?: string, focusKeyPoints: string[] = []): string {
  const focusLine = focusLabel ? `\n- 当前知识块：${focusLabel}` : '';
  const goalLines =
    focusKeyPoints.length > 0
      ? `\n- 本块最低目标：\n${focusKeyPoints.slice(0, 3).map((point) => `  · ${point}`).join('\n')}`
      : '';
  return `

【闭卷重建判定·本轮必须执行】
当前界面已经让学生进入闭卷复述；本轮用户文本就是学生在无提示状态下的闭卷答案。${focusLine}${goalLines}

请严格依据课程材料和当前知识块判断，不要因为学生说得流畅就默认掌握。必须在下面三档中选一档：
1. 无提示能重建：核心问题、主要关系/机制、例子基本站得住，没有重大混淆。
2. 少提示能补全：主线大致对，但缺一个关键关系、边界、证据或例子。
3. 需要回到支架讲解：偏题、空泛、关键机制错了，或基本只是在复述词语。

输出格式必须是：
**闭卷重建判定：<三档之一>**
- 已经站住：1 句
- 还缺：1 句
- 下一步：1 个非常小的动作

如果是“无提示能重建”，下一步应鼓励进入下一块或换例子；如果是“少提示能补全”，只给一个小提示或一个补问；如果是“需要回到支架讲解”，回到最小台阶讲解，但不要长篇讲完整答案。总字数控制在 260 字以内。`;
}

function buildWholeRouteClosureEvaluationDirective(routeClosureReference?: string): string {
  const reference = routeClosureReference?.trim()
    ? `\n\n【内部路线参考·不要直接展示给学生】\n${routeClosureReference.slice(0, 4000)}`
    : '';
  return `

【整场闭卷收束判定·本轮必须执行】
上一轮你已经要求学生闭卷重建整场材料；本轮用户文本就是学生在不看材料、不看路线状态下的整场复述。${reference}

请严格依据课程材料和内部路线参考判断，不要因为学生说得顺就默认整场掌握。必须在下面三档中选一档：
1. 整场路线站住：能说出大问题、主要块之间的推进关系、关键混淆点，整体结构基本成立。
2. 局部站住但连接缺失：单块内容有印象，但块与块之间的关系、顺序或总问题不清楚。
3. 需要回到路线整合：复述空泛、偏题、只列词语，或整场主线明显错误。

输出格式必须是：
**整场收束判定：<三档之一>**
- 已经站住：1 句
- 还缺：1 句
- 下一步：1 个非常小的动作

不要预测考试题；不要替学生重写完整总述。总字数控制在 280 字以内。`;
}

function buildMiniIntegrationEvaluationDirective(promptText?: string): string {
  const reference = promptText?.trim()
    ? `\n\n【内部小整合任务参考·不要直接展示给学生】\n${promptText.slice(0, 2600)}`
    : '';
  return `

【小整合判定·本轮必须执行】
当前界面已经让学生进入“小整合”模式；本轮用户文本就是学生在不看路线状态下，对最近几个知识块关系的回答。${reference}

请判断学生是不是只会单块，还是已经能把几个块连成一个更大的问题。必须在下面三档中选一档：
1. 关系站住：能说出这几块共同解决的大问题，以及它们之间的顺序、对照或因果关系。
2. 单块懂但连接弱：每块有印象，但块与块之间为什么挨着、如何推进还不清楚。
3. 需要回到单块：回答空泛、偏题，或只列词语，无法说明关系。

输出格式必须是：
**小整合判定：<三档之一>**
- 已经站住：1 句
- 还缺：1 句
- 下一步：1 个非常小的动作

不要替学生总结完整答案，不要长篇讲解。总字数控制在 260 字以内。`;
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
      focusLabel,
      focusKeyPoints = [],
      routeClosureReference,
      quickPrompts = [],
      activeKc,
      workspaceAtomCoverage,
      onAtomCoverageChange,
      onDialogueTranscriptChange,
      workspaceDialogueTranscript,
      evidenceAnnotations,
      onEvidenceAnnotationsChange,
      kcGlossaryForActiveKc,
      onGlossaryAppend,
      onGlossaryDefiningChange,
      materials,
      onOpenMaterialPage,
      workspaceLsapKey,
      onChunkRetrievalRound,
      chunkRetrievalMaterialLinkIdFilter,
      reviewScope = null,
      noKcSelected = false,
      selectedKcs = [],
      workspaceLsapContentMap = null,
    },
    ref
  ) {
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 1-4：chunk 附录不可用时的轻提示（文末 JSON 降级），每轮发送覆盖 */
  const [citationPipelineHint, setCitationPipelineHint] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>('STEM');
  const [closedBookAwaitingAnswer, setClosedBookAwaitingAnswer] = useState(false);
  const [wholeRouteClosureAwaitingAnswer, setWholeRouteClosureAwaitingAnswer] = useState(false);
  const [stagedPrompt, setStagedPrompt] = useState<StagedPrompt | null>(null);
  const [reviewPickerMessageId, setReviewPickerMessageId] = useState<string | null>(null);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
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
  const evidenceAnnotationsRef = useRef(evidenceAnnotations);
  useEffect(() => {
    evidenceAnnotationsRef.current = evidenceAnnotations;
  }, [evidenceAnnotations]);

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

  const stagePrompt = useCallback(
    (text: string, meta?: { id?: string; label?: string; description?: string }): boolean => {
      const mode = getPromptMode(text);
      if (!mode) return false;
      const nextPrompt: StagedPrompt = {
        id: meta?.id,
        label: meta?.label ?? (mode === 'closed-book' ? '闭卷讲一遍' : mode === 'mini-integration' ? '小整合' : '整场收束'),
        text,
        description: meta?.description,
        mode,
      };
      setStagedPrompt(nextPrompt);
      const taskMsg = buildLocalTaskPromptMessage(nextPrompt);
      setMessages((prev) =>
        prev.at(-1)?.localTaskPrompt ? [...prev.slice(0, -1), taskMsg] : [...prev, taskMsg]
      );
      setInput('');
      setSendError(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return true;
    },
    []
  );

  const usePromptDraft = useCallback((text: string, meta?: { id?: string; label?: string; description?: string }) => {
    if (stagePrompt(text, meta)) return;
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [stagePrompt]);

  const clearStagedPrompt = useCallback(() => {
    setStagedPrompt(null);
    setReviewPickerMessageId(null);
    setEvidenceNotice(null);
    setMessages((prev) => (prev.at(-1)?.localTaskPrompt ? prev.slice(0, -1) : prev));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToParagraphBlock: (blockIndex: number) => {
        const root = messagesScrollRef.current;
        if (!root) return;
        const el = root.querySelector(`[data-exam-block-index="${blockIndex}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      usePrompt: usePromptDraft,
      setDraft: (text: string) => {
        setStagedPrompt(null);
        setInput(text);
        setSendError(null);
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
      scrollToTurn: (turnId: string) => {
        const root = messagesScrollRef.current;
        if (!root) return;
        root.querySelector(`[data-workspace-turn-id="${CSS.escape(turnId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      askRevisitNow: (annotationId: string) => {
        const annotation = evidenceAnnotationsRef.current.find((item) => item.id === annotationId);
        if (!annotation) return;
        const kc = workspaceLsapContentMap?.kcs.find((item) => item.id === annotation.kcId)
          ?? selectedKcs.find((item) => item.id === annotation.kcId)
          ?? (activeKc?.id === annotation.kcId ? activeKc : null);
        const atom = kc?.atoms?.find((item) => item.id === annotation.atomId);
        if (!atom) return;
        const now = Date.now();
        const nextAnnotations = evidenceAnnotationsRef.current.map((item) => item.id === annotationId
          ? { ...item, revisitStatus: 'asked' as const, lastPromptedAt: now, updatedAt: now }
          : item);
        evidenceAnnotationsRef.current = nextAnnotations;
        onEvidenceAnnotationsChange(nextAnnotations);
        setMessages((prev) => [...prev, {
          id: makeWorkspaceTurnId(now),
          role: 'model',
          timestamp: now,
          revisitAnnotationId: annotationId,
          revisitPhase: 'question',
          text: `我们现在回访一下你标记为不太熟的「${atom.label}」。先别看材料：请换一种说法解释它，并说明它在什么情况下成立或不成立。`,
        }]);
      },
    }),
    [activeKc, onEvidenceAnnotationsChange, selectedKcs, usePromptDraft, workspaceLsapContentMap]
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
    setStagedPrompt(null);
    setClosedBookAwaitingAnswer(false);
    setWholeRouteClosureAwaitingAnswer(false);
    setReviewPickerMessageId(null);
    setEvidenceNotice(null);
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
    const turns = mapChatMessagesToDialogueTurns(messages, activeKc);
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
    !sending &&
    !noKcSelected;

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !canSend) return;
    setSending(true);
    setSendError(null);
    const activeStagedPrompt = stagedPrompt;
    const startsClosedBookRebuild = isClosedBookRebuildRequest(text);
    const startsWholeRouteClosure = isWholeRouteClosureRequest(text);
    const shouldEvaluateClosedBook =
      activeStagedPrompt?.mode === 'closed-book' ||
      (closedBookAwaitingAnswer && !startsClosedBookRebuild && !startsWholeRouteClosure);
    const shouldEvaluateMiniIntegration = activeStagedPrompt?.mode === 'mini-integration';
    const shouldEvaluateWholeRouteClosure =
      activeStagedPrompt?.mode === 'whole-route' ||
      (wholeRouteClosureAwaitingAnswer && !startsWholeRouteClosure && !startsClosedBookRebuild);
    if (shouldEvaluateClosedBook) {
      setClosedBookAwaitingAnswer(false);
    }
    if (shouldEvaluateWholeRouteClosure) {
      setWholeRouteClosureAwaitingAnswer(false);
    }

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

    const userTimestamp = Date.now();
    const userMsg: LocalChatMessage = { id: makeWorkspaceTurnId(userTimestamp), role: 'user', text, timestamp: userTimestamp };
    const historyForApi = messages.filter((m) => !m.localTaskPrompt);

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStagedPrompt(null);

    const attachCoveredAtomsToUserTurn = (coveredAtomIds: string[]) => {
      if (!coveredAtomIds.length) return;
      const uniqueIds = [...new Set(coveredAtomIds)];
      setMessages((prev) => prev.map((message) => message.id === userMsg.id
        ? { ...message, coveredAtomIds: uniqueIds }
        : message));
    };

    const baseScaffold = {
      quality,
      phase,
      consecutiveWeakStreak: newStreak,
      totalUserTurns,
    };

    let orch: ReturnType<typeof computeNextProbeState> | null = null;
    let kcCtx: KCScopedTutorContext | undefined;
    let multiKcCtx: MultiKCScopedTutorContext | undefined;

    if (activeKc) {
      // 单选路径（length === 1）：完全保留原行为
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
        reviewScope,
      };
      setLastScaffoldInfo({ phase, quality, streak: newStreak, probeMode: orch.probeMode });
    } else if (selectedKcs.length >= 2) {
      // 多选路径（length >= 2，阶段 3 新增）
      multiKcCtx = {
        ...baseScaffold,
        kcs: selectedKcs,
        reviewScope,
      };
      setLastScaffoldInfo({ phase, quality, streak: newStreak });
    } else {
      // length === 0：理论上 canSend 已 disable 输入框，不应到达
      setLastScaffoldInfo({ phase, quality, streak: newStreak });
    }

    try {
      /**
       * chunk 引用：有当前复习块时，主证据锁在当前材料/页码附近；全局证据只作为明确标注的旁支。
       */
      let examChunkCitationAppendix: string | undefined;
      let chunkSnapshot: ExamChunkCitationSnapshot | undefined;
      lastRetrievedChunksRef.current = null;
      setCitationPipelineHint(null);

      if (workspaceLsapKey?.trim()) {
        try {
          const indexChunks = await loadExamMaterialChunkIndex(workspaceLsapKey);
          const hasIndex = Boolean(indexChunks && indexChunks.length > 0);
          const scopedMaterialLinkId =
            chunkRetrievalMaterialLinkIdFilter?.trim() || reviewScope?.materialLinkId?.trim() || undefined;
          const scopedPageRange =
            scopedMaterialLinkId && reviewScope?.materialLinkId === scopedMaterialLinkId
              ? reviewScope?.pageRange ?? null
              : null;
          const scopedPageWindows =
            scopedMaterialLinkId && reviewScope?.materialLinkId === scopedMaterialLinkId
              ? (reviewScope?.pageWindows?.length
                  ? reviewScope.pageWindows
                  : scopedPageRange
                    ? [scopedPageRange]
                    : [])
              : [];

          if (!hasIndex && materials.length > 0) {
            lastRetrievedChunksRef.current = null;
            onChunkRetrievalRound?.({ retrieved: [], indexEmpty: true });
            setCitationPipelineHint(
              reviewScope
                ? '材料索引还没准备好，本轮不会猜页码；我会先按当前知识块边界回答。'
                : '本场讲义 chunk 索引为空或尚未重建。定位引用已回退为文末 JSON（页码由模型估算，请核对原文）。'
            );
          } else if (hasIndex) {
            const lastAssistant = [...historyForApi].reverse().find((m) => m.role === 'model');
            const tail =
              lastAssistant?.text && lastAssistant.text.length > 0
                ? lastAssistant.text.slice(0, EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS)
                : '';
            const queryBase = activeStagedPrompt?.text ? `${text}\n${activeStagedPrompt.text}` : text;
            const query = tail ? `${queryBase}\n${tail}` : queryBase;

            if (reviewScope) {
              const mentionedPages = extractMentionedPages(queryBase);
              const mentionedPageRows =
                scopedMaterialLinkId && mentionedPages.length > 0
                  ? await retrieveForPageWindows({
                      workspaceKey: workspaceLsapKey,
                      query: queryBase,
                      topK: DEFAULT_TOP_K,
                      materialLinkIdFilter: scopedMaterialLinkId,
                      windows: mentionedPages.map((page) => ({ start: page, end: page })),
                      padding: 1,
                    })
                  : [];

              const scopeRows =
                scopedMaterialLinkId && scopedPageWindows.length > 0
                  ? await retrieveForPageWindows({
                      workspaceKey: workspaceLsapKey,
                      query,
                      topK: DEFAULT_TOP_K,
                      materialLinkIdFilter: scopedMaterialLinkId,
                      windows: scopedPageWindows,
                      padding: 1,
                    })
                  : [];

              const sameMaterialRows = scopedMaterialLinkId
                ? await retrieveCandidateChunks({
                    workspaceKey: workspaceLsapKey,
                    query,
                    topK: DEFAULT_TOP_K,
                    materialLinkIdFilter: scopedMaterialLinkId,
                  })
                : await retrieveCandidateChunks({
                    workspaceKey: workspaceLsapKey,
                    query,
                    topK: DEFAULT_TOP_K,
                  });

              const primary = dedupeRetrievedChunks([
                ...mentionedPageRows,
                ...scopeRows,
                ...sameMaterialRows,
              ]).slice(0, DEFAULT_TOP_K);

              const shouldFetchGlobal =
                wantsGlobalContext(queryBase) ||
                activeStagedPrompt?.mode === 'mini-integration' ||
                activeStagedPrompt?.mode === 'whole-route';
              const global = shouldFetchGlobal
                ? dedupeRetrievedChunks(
                    await retrieveCandidateChunks({
                      workspaceKey: workspaceLsapKey,
                      query,
                      topK: 3,
                    })
                  ).filter(
                    (row) =>
                      row.chunk.materialLinkId !== scopedMaterialLinkId &&
                      !primary.some((p) => p.chunk.chunkId === row.chunk.chunkId)
                  )
                : [];

              const retrieved = dedupeRetrievedChunks([...primary, ...global]);
              lastRetrievedChunksRef.current = retrieved.length > 0 ? retrieved : null;
              onChunkRetrievalRound?.({ retrieved });
              if (retrieved.length > 0) {
                examChunkCitationAppendix = buildExamScopedChunkCitationAppendix({
                  scope: reviewScope,
                  primary,
                  global,
                });
                chunkSnapshot = {
                  chunks: Object.fromEntries(
                    retrieved.map((r) => [
                      r.chunk.chunkId,
                      { materialLinkId: r.chunk.materialLinkId, page: r.chunk.page },
                    ])
                  ),
                };
              } else {
                setCitationPipelineHint('当前块附近没有命中可定位证据；本轮不会猜页码，会先按当前知识块边界回答。');
              }
            } else {
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
                setCitationPipelineHint(
                  '本轮检索无命中（或「仅当前预览」下无可用 chunk）。定位引用已回退为文末 JSON，请核对页码。'
                );
              }
            }
          }
        } catch (e) {
          console.warn('[examChunkCitation] chunk 索引加载或 retrieveCandidateChunks 失败', e);
          lastRetrievedChunksRef.current = null;
          onChunkRetrievalRound?.({ retrieved: [] });
          if (materials.length > 0) {
            setCitationPipelineHint(
              reviewScope ? 'chunk 检索失败，本轮不会猜页码；我会先按当前知识块边界回答。' : 'chunk 检索失败，已回退为文末 JSON 引用协议。'
            );
          }
        }
      }

      let messageForModel = shouldEvaluateWholeRouteClosure
        ? text + buildWholeRouteClosureEvaluationDirective(routeClosureReference)
        : shouldEvaluateClosedBook
          ? text + buildClosedBookEvaluationDirective(focusLabel, focusKeyPoints)
          : shouldEvaluateMiniIntegration
            ? text + buildMiniIntegrationEvaluationDirective(activeStagedPrompt?.text)
            : text;

      const lastRegularMessage = [...messages].reverse().find((message) => !message.localTaskPrompt);
      const answeringRevisit = lastRegularMessage?.role === 'model' && lastRegularMessage.revisitPhase === 'question' && lastRegularMessage.revisitAnnotationId
        ? evidenceAnnotationsRef.current.find((annotation) => (
            annotation.id === lastRegularMessage.revisitAnnotationId &&
            annotation.kind === 'needs_review' &&
            annotation.revisitStatus === 'asked'
          )) ?? null
        : null;
      const revisitKcIds = reviewScope?.sourceKcs.map((kc) => kc.id)
        ?? (selectedKcs.length > 0 ? selectedKcs.map((kc) => kc.id) : activeKc ? [activeKc.id] : []);
      const relevantEvidenceNotes = evidenceAnnotationsRef.current
        .filter((annotation) => revisitKcIds.includes(annotation.kcId) && (
          annotation.kind === 'disputed' || annotation.revisitStatus !== 'resolved'
        ))
        .slice(0, 12)
        .map((annotation) => {
          const kc = workspaceLsapContentMap?.kcs.find((item) => item.id === annotation.kcId)
            ?? reviewScope?.sourceKcs.find((item) => item.id === annotation.kcId)
            ?? selectedKcs.find((item) => item.id === annotation.kcId);
          const atom = kc?.atoms?.find((item) => item.id === annotation.atomId);
          const label = atom?.label ?? annotation.atomId;
          return annotation.kind === 'disputed'
            ? `- 用户不认可“${label}”的既有证据${annotation.note ? `：${annotation.note}` : '。'}`
            : `- 用户把“${label}”标记为不太熟，仍待回看。`;
        });
      if (relevantEvidenceNotes.length > 0) {
        messageForModel += `\n\n【用户对学习证据的备注】\n${relevantEvidenceNotes.join('\n')}\n这些备注不改变系统覆盖数字，但回答时不要把被用户质疑或待回看的内容说成已经牢固掌握。`;
      }
      const dueRevisit = answeringRevisit
        ? null
        : findDueRevisit(evidenceAnnotationsRef.current, revisitKcIds, totalUserTurns);
      const revisitForThisReply = answeringRevisit ?? dueRevisit;
      if (revisitForThisReply) {
        const revisitKc = workspaceLsapContentMap?.kcs.find((kc) => kc.id === revisitForThisReply.kcId)
          ?? selectedKcs.find((kc) => kc.id === revisitForThisReply.kcId)
          ?? (activeKc?.id === revisitForThisReply.kcId ? activeKc : null);
        const revisitAtom = revisitKc?.atoms?.find((atom) => atom.id === revisitForThisReply.atomId);
        if (revisitAtom) {
          messageForModel += answeringRevisit
            ? `\n\n【待回看回答反馈】用户正在回答此前对“${revisitAtom.label}”的回访。先简短判断这次回答，再停下；不要自动宣布用户已经掌握，也不要继续提出第二个问题，界面会让用户自己选择“现在可以了”或“还是不熟”。`
            : `\n\n【稍后回访】用户此前主动把“${revisitAtom.label}”标记为不太熟。简短回应当前输入后，只针对这个知识点提出一个与原问法不同的具体问题或情境；不要提前给答案，不要同时追问其他知识点。知识点说明：${revisitAtom.description}`;
        }
      }

      const materialsForLooseCitationFallback = reviewScope && !examChunkCitationAppendix ? [] : materials;

      const reply = await chatWithAdaptiveTutor(
        mergedContent,
        historyForApi,
        messageForModel,
        'tutoring',
        docType,
        undefined,
        disciplineBand,
        kcCtx ?? multiKcCtx ?? baseScaffold,
        materialsForLooseCitationFallback,
        examChunkCitationAppendix
      );
      const modelTimestamp = Date.now();
      const modelMsg: LocalChatMessage = {
        id: makeWorkspaceTurnId(modelTimestamp),
        role: 'model',
        text: reply,
        timestamp: modelTimestamp,
        ...(chunkSnapshot ? { examChunkCitationSnapshot: chunkSnapshot } : {}),
        ...(revisitForThisReply ? { revisitAnnotationId: revisitForThisReply.id } : {}),
        ...(revisitForThisReply ? { revisitPhase: answeringRevisit ? 'feedback' as const : 'question' as const } : {}),
      };
      setMessages((prev) => [...prev, modelMsg]);
      if (dueRevisit) {
        const now = Date.now();
        const nextAnnotations = evidenceAnnotationsRef.current.map((annotation) => annotation.id === dueRevisit.id
          ? { ...annotation, revisitStatus: 'asked' as const, lastPromptedAt: now, updatedAt: now }
          : annotation);
        evidenceAnnotationsRef.current = nextAnnotations;
        onEvidenceAnnotationsChange(nextAnnotations);
      }
      setClosedBookAwaitingAnswer(startsClosedBookRebuild);
      setWholeRouteClosureAwaitingAnswer(startsWholeRouteClosure);

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
        // 单选路径（length === 1）：完全保留原行为
        const dedupeKey = `${activeKc.id}:${userMsg.timestamp}:${text}`;
        if (lastAtomAnalyzeKeyRef.current !== dedupeKey) {
          lastAtomAnalyzeKeyRef.current = dedupeKey;
          try {
            const { coveredAtomIds, gapAtomIds } = await analyzeKcUtteranceForAtoms(mergedContent, activeKc, text);
            gapAtomIdsRef.current = gapAtomIds;
            if (coveredAtomIds.length > 0) {
              attachCoveredAtomsToUserTurn(coveredAtomIds);
              onAtomCoverageChange(
                mergeCoverageForKc(workspaceAtomCoverageRef.current, activeKc.id, coveredAtomIds)
              );
            }
          } catch (e) {
            console.warn('analyzeKcUtteranceForAtoms', e);
          }
        }
      } else if (
        selectedKcs.length >= 2 &&
        workspaceLsapContentMap &&
        selectedKcs.some((kc) => (kc.atoms?.length ?? 0) > 0)
      ) {
        // 多选路径（length >= 2，阶段 3 新增）：单次 AI 调用获取跨 KC 的 atom 覆盖，按 kcId 分发更新
        const sortedSelectedIds = selectedKcs.map((k) => k.id).sort().join('+');
        const dedupeKey = `multi:${sortedSelectedIds}:${userMsg.timestamp}:${text}`;
        if (lastAtomAnalyzeKeyRef.current !== dedupeKey) {
          lastAtomAnalyzeKeyRef.current = dedupeKey;
          try {
            const { coveredAtomIds } = await analyzeMultiKcUtteranceForAtoms(
              mergedContent,
              selectedKcs,
              text
            );
            // 多选模式不维护 gapAtomIdsRef（单 KC 的 probeMode 编排概念不适用多选）
            if (coveredAtomIds.length > 0) {
              attachCoveredAtomsToUserTurn(coveredAtomIds);
              onAtomCoverageChange(
                mergeCoverageForKcs(
                  workspaceAtomCoverageRef.current,
                  coveredAtomIds,
                  selectedKcs,
                  workspaceLsapContentMap
                )
              );
            }
          } catch (e) {
            console.warn('analyzeMultiKcUtteranceForAtoms', e);
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
    reviewScope,
    selectedKcs,
    workspaceLsapContentMap,
    closedBookAwaitingAnswer,
    wholeRouteClosureAwaitingAnswer,
    stagedPrompt,
    focusLabel,
    focusKeyPoints,
    routeClosureReference,
    onEvidenceAnnotationsChange,
  ]);

  const evidenceKcs = reviewScope?.sourceKcs?.length
    ? reviewScope.sourceKcs
    : selectedKcs.length > 0
      ? selectedKcs
      : activeKc
        ? [activeKc]
        : [];
  const evidenceAtoms = evidenceKcs.flatMap((kc) => (kc.atoms ?? []).map((atom) => ({ kc, atom })));

  const markAtomForReview = (atomId: string, sourceTurnId?: string) => {
    const match = evidenceAtoms.find(({ atom }) => atom.id === atomId);
    if (!match) return;
    const now = Date.now();
    const currentUserTurnCount = messages.filter((message) => message.role === 'user' && !message.localTaskPrompt).length;
    const nextAnnotation: WorkspaceEvidenceAnnotation = {
      id: `evidence-needs_review-${now}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'needs_review',
      kcId: match.kc.id,
      atomId,
      turnId: sourceTurnId,
      createdAt: now,
      updatedAt: now,
      revisitStatus: 'pending',
      deferUntilUserTurnCount: currentUserTurnCount + 2,
    };
    const next = upsertEvidenceAnnotation(evidenceAnnotationsRef.current, nextAnnotation);
    evidenceAnnotationsRef.current = next;
    onEvidenceAnnotationsChange(next);
    setReviewPickerMessageId(null);
    setEvidenceNotice(`记下了：“${match.atom.label}”稍后换一种问法再确认。`);
  };

  const updateRevisitAfterFeedback = (annotationId: string, resolved: boolean) => {
    const currentUserTurnCount = messages.filter((message) => message.role === 'user' && !message.localTaskPrompt).length;
    const next = resolved
      ? resolveRevisit(evidenceAnnotationsRef.current, annotationId)
      : deferRevisit(evidenceAnnotationsRef.current, annotationId, currentUserTurnCount);
    evidenceAnnotationsRef.current = next;
    onEvidenceAnnotationsChange(next);
    setEvidenceNotice(resolved ? '已完成这次回访。' : '保留为不太熟，稍后还会再问。');
  };

  const emptyState = contextBlocked || mergedLoading || !!mergedError || !mergedContent.trim();

  const subtitle = focusLabel
    ? `「${examTitle || '本场'}」· 知识块：${focusLabel}`
    : activeKc
      ? `「${examTitle || '本场'}」· 锚定：${activeKc.concept}`
      : `${examTitle ? `「${examTitle}」` : '未选考试'} · 全卷（未锚定知识块）`;
  const stagedPromptCopy = stagedPrompt ? getStagedPromptCopy(stagedPrompt) : null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      aria-label="理解验证对话"
    >
      <div className="shrink-0 border-b border-stone-100 px-4 py-3 bg-stone-50/80">
        <div className="flex items-center gap-2 text-slate-800">
          <MessageCircle className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <h2 className="text-sm font-bold">理解验证对话</h2>
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
            {focusLabel ? (
              <>
                <p className="text-slate-700 font-medium text-sm max-w-md">
                  先别看答案，用你自己的话讲清楚：
                  <span className="text-indigo-800 font-bold">{focusLabel}</span>
                </p>
                {focusKeyPoints.length > 0 && (
                  <div className="max-w-md rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-left">
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-500">这块至少要能做到</p>
                    <ul className="space-y-1.5 text-xs leading-relaxed text-slate-700">
                      {focusKeyPoints.slice(0, 3).map((point) => (
                        <li key={point} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                  我会检查你是否真的理解这一块：能不能解释、连接到材料、换个例子也说得通。
                </p>
              </>
            ) : activeKc ? (
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
                  我会在全卷范围内先问后讲；若需聚焦，请先在左侧选择一个知识块。
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
              const isTaskPrompt = Boolean(m.localTaskPrompt);
              const chunkOpts =
                m.role === 'model' && !isTaskPrompt && m.examChunkCitationSnapshot
                  ? parseOptsFromSnapshot(m.examChunkCitationSnapshot)
                  : null;
              const { displayText, citations } =
                m.role === 'model' && !isTaskPrompt
                  ? chunkOpts
                    ? parseExamWorkspaceModelReply(m.text, chunkOpts)
                    : parseAssistantCitations(m.text)
                  : { displayText: m.text, citations: [] };
              const safeCitations =
                m.role === 'model'
                  ? citations.filter((c) => validMaterialIdSet.has(c.materialId))
                  : [];
              const previousUserMessage = m.role === 'model'
                ? [...messages.slice(0, i)].reverse().find((message) => message.role === 'user' && !message.localTaskPrompt)
                : null;
              const candidateAtomIds = previousUserMessage?.coveredAtomIds?.length
                ? previousUserMessage.coveredAtomIds.filter((atomId) => evidenceAtoms.some(({ atom }) => atom.id === atomId))
                : evidenceAtoms.map(({ atom }) => atom.id);
              return (
                <div
                  key={`${m.timestamp}-${i}`}
                  data-workspace-turn-id={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-md whitespace-pre-wrap'
                        : isTaskPrompt
                          ? 'border border-indigo-100 bg-indigo-50/80 text-slate-700 rounded-bl-md shadow-sm'
                          : 'bg-stone-100 text-slate-800 rounded-bl-md border border-stone-200'
                    }`}
                  >
                    {m.role === 'user' ? (
                      m.text
                    ) : isTaskPrompt ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-indigo-800">{m.text.split('\n')[0]}</p>
                        <p className="text-xs leading-relaxed text-slate-600">{m.text.split('\n').slice(1).join('\n')}</p>
                      </div>
                    ) : (
                      <div>
                        <ExamWorkspaceAssistantMarkdown
                          displayText={displayText}
                          citations={safeCitations}
                          materials={materials}
                          onOpenMaterialPage={onOpenMaterialPage}
                          msgAnchor={`msg-${m.timestamp}-${i}`}
                        />
                        {m.revisitAnnotationId && m.revisitPhase === 'feedback' ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-2">
                            <span className="text-[11px] font-bold text-slate-500">这次回访之后：</span>
                            <button type="button" onClick={() => updateRevisitAfterFeedback(m.revisitAnnotationId!, true)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">现在可以了</button>
                            <button type="button" onClick={() => updateRevisitAfterFeedback(m.revisitAnnotationId!, false)} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">还是不熟</button>
                          </div>
                        ) : !m.revisitAnnotationId && candidateAtomIds.length > 0 ? (
                          <div className="mt-3 border-t border-stone-200 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (candidateAtomIds.length === 1) markAtomForReview(candidateAtomIds[0]!, previousUserMessage?.id);
                                else setReviewPickerMessageId((current) => current === m.id ? null : (m.id ?? `${m.timestamp}-${i}`));
                              }}
                              className="text-[11px] font-bold text-amber-700 hover:text-amber-900"
                            >
                              这一点不太熟，稍后再问我
                            </button>
                            {reviewPickerMessageId === (m.id ?? `${m.timestamp}-${i}`) && (
                              <div className="mt-2 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                <p className="text-[10px] font-bold text-amber-800">选择要稍后回访的知识点</p>
                                {candidateAtomIds.map((atomId) => {
                                  const item = evidenceAtoms.find(({ atom }) => atom.id === atomId);
                                  return item ? (
                                    <button key={atomId} type="button" onClick={() => markAtomForReview(atomId, previousUserMessage?.id)} className="block w-full rounded-lg bg-white px-2.5 py-2 text-left text-[11px] font-bold text-slate-700 hover:bg-amber-100">
                                      {item.atom.label}
                                    </button>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
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
        {evidenceNotice && (
          <div className="shrink-0 flex items-center justify-between gap-3 border-t border-amber-100 bg-amber-50/90 px-4 py-2 text-[11px] font-medium text-amber-800">
            <span>{evidenceNotice}</span>
            <button type="button" onClick={() => setEvidenceNotice(null)} className="font-bold text-amber-700 hover:text-amber-950">知道了</button>
          </div>
        )}
        {citationPipelineHint && (
          <p className="shrink-0 px-4 text-[11px] text-amber-800 bg-amber-50/90 border-t border-amber-100 py-2 leading-snug">
            {citationPipelineHint}
          </p>
        )}

        <div className="shrink-0 border-t border-stone-100 bg-white p-3">
          {stagedPrompt && stagedPromptCopy && (
            <div className="mb-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 transition-[opacity,transform] duration-200 ease-out">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[11px] font-bold text-indigo-800">
                  当前验证：{stagedPrompt.label}，写完发送即可
                </p>
                <button
                  type="button"
                  onClick={clearStagedPrompt}
                  className="shrink-0 rounded-full p-1 text-slate-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-white hover:text-slate-700 active:scale-95"
                  aria-label="取消当前验证模式"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {closedBookAwaitingAnswer && (
            <p className="mb-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-medium leading-snug text-emerald-800">
              闭卷模式：下一条请直接复述这一块，我会按“无提示能重建 / 少提示能补全 / 需要回到支架讲解”来判定。
            </p>
          )}
          {wholeRouteClosureAwaitingAnswer && (
            <p className="mb-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-medium leading-snug text-violet-800">
              整场收束：下一条请不看材料、不看路线，直接复述整场材料的大图。我会判断整场路线是否站住。
            </p>
          )}
          {!emptyState && quickPrompts.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">验证入口</span>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  disabled={!canSend}
                  title={prompt.description}
                  onClick={() => usePromptDraft(prompt.text, prompt)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
                    stagedPrompt?.id === prompt.id
                      ? 'border-indigo-300 bg-indigo-100 text-indigo-800 shadow-sm'
                      : 'border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
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
                stagedPromptCopy
                  ? stagedPromptCopy.placeholder
                  : canSend
                  ? '输入你的想法或疑问…（Enter 发送，Shift+Enter 换行）'
                  : noKcSelected
                    ? '请先选择知识块'
                    : contextBlocked
                      ? '请先选择考试并关联材料'
                      : '等待材料合并完成…'
              }
              rows={3}
              className="flex-1 min-h-[72px] max-h-40 resize-y rounded-xl border border-stone-200 px-3 py-2 text-sm text-slate-800 transition-[border-color,box-shadow] duration-150 ease-out focus:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-50 disabled:bg-stone-100 disabled:text-slate-400"
            />
            <button
              type="button"
              onClick={() => onSend()}
              disabled={!canSend || !input.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-indigo-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
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
