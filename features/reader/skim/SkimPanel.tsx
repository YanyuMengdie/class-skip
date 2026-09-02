
import React, {
  useState,
  useRef,
  useEffect,
  useDeferredValue,
  useMemo,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { StudyMap, ChatMessage, Prerequisite, QuizData, SkimStage, DocType, SkimContentType, SkimAuxiliaryMaterial, SkimAuxiliaryMaterialRole, SkimAuxiliaryUseMode, SkimReadingRoute, SkimReadingRouteNode, SkimReadingMessageAnchor, SkimReadingAnchorKind, CloudSession, SkimStudyStyle, SkimExplanationDepth, SkimExplanationStyle, SkimExplanationVariantKey, SkimModuleTakeaway, SkimRecordDeck, SkimRecordCardState, LectureCaseLearningState } from '@/types';
import { Rocket, Send, Square, PencilLine, Map, MessageCircle, Bot, AlertCircle, HelpCircle, CheckCircle2, ShieldAlert, ArrowRight, BookOpen, BrainCircuit, Lightbulb, Lock, FlaskConical, Feather, SkipForward, Move, ListChecks, ClipboardList, Loader2, ChevronDown, Upload, Trash2, ImagePlus, X, Maximize2, Minimize2, Folder, LayoutGrid, Link2, Plus, RefreshCw, Library, RotateCcw, Check } from 'lucide-react';
import { chatWithSkimAdaptiveTutor, generateContinuousLectureTurn, generateContinuousLectureVariant, generateLegacyRecordExplanationVariant, generateGatekeeperQuiz, generateModuleKnowledgeExtraction, generateModuleTakeaways, generateSkimReadingRoute } from '@/services/geminiService';
import { fetchFileFromUrl, readFileAsDataURL, extractPdfPageRange } from '@/lib/pdf/pdfUtils';
import { getMessageImages } from '@/lib/chat/messageUtils';
import { buildSkimRecordDeck, getNextSkimRecordCard, validateSkimReadingRoute } from './recordDeck';
import { LectureCaseModeCard, LectureCaseWorkspace } from './LectureCaseLearning';
import {
  createSkimExplanationState,
  createSkimExplanationStateFromLegacyMessage,
  getActiveSkimExplanationVariant,
  getDisplayedSkimMessageText,
  getSkimExplanationVariantKey,
  isLegacyRecordExplanationCandidate,
  resolveSkimExplanationPageBounds,
  shouldUseConnectedLectureExplanation,
  withActiveSkimExplanationVariant,
} from './skimExplanation';
import { formatSkimTakeawaysForNotebook } from './skimTakeaways';

interface SkimPanelProps {
  studyMap: StudyMap | null;
  isLoading: boolean;
  onSwitchToDeep: () => void;
  fullText: string | null;
  pdfDataUrl?: string | null; // NEW: Raw PDF Data
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  topHeight: number;
  setTopHeight: React.Dispatch<React.SetStateAction<number>>;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Persisted state props
  stage: SkimStage;
  setStage: (stage: SkimStage) => void;
  quizData: QuizData | null;
  setQuizData: (data: QuizData | null) => void;
  
  // Doc Type
  docType: DocType;
  onToggleDocType: () => void;

  // Note Taking
  onNotebookAdd?: (text: string, category: 'skim') => void;

  /** 按所选模块数重新生成 studyMap（知识检查通过后可选）；
   *  contentOverride 为页码裁剪后的小 PDF（方案 A：地图只覆盖选中页）；返回新 map 供调用方直接用，绕开旧闭包 */
  onRegenerateStudyMap?: (moduleCount: number, contentOverride?: string) => Promise<StudyMap | null>;
  /** 当前学习地图的模块数（用于判断是否需要重新生成） */
  studyMapModuleCount?: number | null;
  /** 文档总页数（= slides.length），用于页码范围上限校验；拿不到时不做上限校验 */
  totalPages?: number;

  // 略读多会话（阶段一）：原 SkimPanel 内部态（模块数/节奏/页码范围）提升到 App 的「激活会话」，按 props 喂入，
  // 这样切换标签时 SkimPanel 不卸载、各段也各记各的。
  moduleCount: number;
  setModuleCount: (count: number) => void;
  skimPace: 'module' | 'part';
  setSkimPace: (pace: 'module' | 'part') => void;
  /** 阶段二：内容类型受控 prop（与 moduleCount/skimPace 同款，由 App 的激活会话持有） */
  contentType: SkimContentType;
  onContentTypeChange: (next: SkimContentType) => void;
  auxiliaryMaterial?: SkimAuxiliaryMaterial | null;
  onAuxiliaryMaterialChange?: (next: SkimAuxiliaryMaterial | null) => void;
  readingRoute?: SkimReadingRoute | null;
  onReadingRouteChange?: (next: SkimReadingRoute | null) => void;
  currentPage?: number;
  onJumpToPage?: (page: number) => void;
  cloudSessions?: CloudSession[];
  currentCloudSessionId?: string | null;
  pageRangeStart: number | null;
  setPageRangeStart: (v: number | null) => void;
  pageRangeEnd: number | null;
  setPageRangeEnd: (v: number | null) => void;
  /** 内部 isChatLoading 上抛给 App，让标签栏在「生成中」锁住切换 + 新建 */
  onLoadingChange?: (loading: boolean) => void;
  /** 方案 A：true = 本段为「+」新建段，跳过诊断开场，studyMap=null 时也直接显示配置区 */
  skipDiagnosis?: boolean;
  /** 私教模式入口：点击切到独立 tutor viewMode（数据/逻辑全在 App 层，SkimPanel 只负责通知） */
  onStartTutorMode?: () => void;
  studyStyle: SkimStudyStyle;
  onStudyStyleChange: (next: SkimStudyStyle) => void;
  explanationDepth: SkimExplanationDepth;
  onExplanationDepthChange: (next: SkimExplanationDepth) => void;
  recordDeck?: SkimRecordDeck | null;
  onRecordDeckChange?: (next: SkimRecordDeck | null) => void;
  activeRecordCard?: SkimRecordCardState | null;
  pdfPageTexts?: string[];
  onOpenRecordShelf?: () => void;
  onCompleteRecord?: () => void;
  onUndoRecordComplete?: () => void;
  onOpenNextRecord?: () => void;
  caseLearning?: LectureCaseLearningState | null;
  onCaseLearningChange?: React.Dispatch<React.SetStateAction<LectureCaseLearningState | null>>;
  caseSourceId?: string;
}

/** 略读「页码范围」校验：返回错误文案，无错返回 null（含「全本」即两端皆空的情况） */
const getPageRangeError = (
  start: number | null,
  end: number | null,
  totalPages?: number
): string | null => {
  // 两端皆空 = 全本，合法
  if (start == null && end == null) return null;
  // 只填了一个
  if (start == null || end == null) return '请同时填写起始页和结束页（或都留空＝整本）';
  if (!Number.isInteger(start) || !Number.isInteger(end)) return '页码需为整数';
  if (start < 1 || end < 1) return '页码需 ≥ 1';
  // 仅当能拿到总页数时才做上限校验
  if (totalPages && totalPages > 0 && (start > totalPages || end > totalPages)) {
    return `页码不能超过总页数（${totalPages}）`;
  }
  if (start > end) return '起始页不能大于结束页';
  return null;
};

/** 略读配置区「页码范围」输入：Quiz 内联块与跳过弹窗两处共用，避免不一致 */
const PageRangeInput: React.FC<{
  start: number | null;
  end: number | null;
  onStartChange: (v: number | null) => void;
  onEndChange: (v: number | null) => void;
  totalPages?: number;
  /** 两处复用时用于隔离 input id，避免重复 id */
  idPrefix: string;
}> = ({ start, end, onStartChange, onEndChange, totalPages, idPrefix }) => {
  const error = getPageRangeError(start, end, totalPages);
  const parse = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.floor(n) : null;
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-stone-500">
        页码范围（留空＝整本{totalPages ? `，共 ${totalPages} 页` : ''}）
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-page-start`}
          type="number"
          min={1}
          max={totalPages || undefined}
          inputMode="numeric"
          value={start ?? ''}
          onChange={(e) => onStartChange(parse(e.target.value))}
          placeholder="起"
          className="w-20 py-2 rounded-lg border-2 border-stone-200 focus:border-indigo-300 px-3 text-slate-700 text-sm bg-white"
        />
        <span className="text-stone-400 text-sm">—</span>
        <input
          id={`${idPrefix}-page-end`}
          type="number"
          min={1}
          max={totalPages || undefined}
          inputMode="numeric"
          value={end ?? ''}
          onChange={(e) => onEndChange(parse(e.target.value))}
          placeholder="止"
          className="w-20 py-2 rounded-lg border-2 border-stone-200 focus:border-indigo-300 px-3 text-slate-700 text-sm bg-white"
        />
        <span className="text-xs text-stone-400">页</span>
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
};

type SkimReadingOptions = {
  skimGranularity?: 'fine' | 'standard' | 'coarse';
  studyMapBriefing?: string;
  moduleCount?: number;
  skimPace?: 'module' | 'part';
  auxiliaryMaterial?: {
    fileName: string;
    role: SkimAuxiliaryMaterialRole;
    useMode: SkimAuxiliaryUseMode;
    content: string;
  };
  recordScope?: {
    cardId: string;
    moduleIndex: number;
    partIndex?: number;
    title: string;
    moduleTitle: string;
    pageStart: number;
    pageEnd: number;
    summary: string;
    otherRecordDigests: Array<{
      moduleIndex: number;
      partIndex?: number;
      title: string;
      clarified: string[];
      unresolved: string[];
    }>;
  };
};

const AUXILIARY_ROLE_OPTIONS: Array<{ value: SkimAuxiliaryMaterialRole; label: string }> = [
  { value: 'reading', label: '课前阅读' },
  { value: 'paper', label: 'Paper' },
  { value: 'article', label: '文章' },
  { value: 'textbook', label: '教科书' },
  { value: 'other', label: '其他' },
];

const getAuxiliaryRoleLabel = (role: SkimAuxiliaryMaterialRole): string => (
  AUXILIARY_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? '辅助材料'
);

const normalizeGeneratedLineBreaks = (text: string): string => (
  text.replace(/<br\s*\/?>|&lt;br\s*\/?&gt;/gi, '\n')
);

const SKIM_VARIANT_LABELS: Record<SkimExplanationVariantKey, string> = {
  'simple-standard': '简单版',
  'simple-interesting': '简单·有意思',
  'normal-standard': '正常版',
  'normal-interesting': '正常·有意思',
};

const formatSkimPageRefs = (pages: number[]): string => {
  if (pages.length === 0) return '';
  if (pages.length === 1) return `第 ${pages[0]} 页`;
  const contiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  return contiguous ? `第 ${pages[0]}–${pages.at(-1)} 页` : `第 ${pages.join('、')} 页`;
};

type SkimRouteOutlineItem = {
  id: string;
  messageId: string;
  level: 'module' | 'part';
  messageIndex: number;
  kind: SkimReadingAnchorKind;
  number: number | null;
  parentNumber?: number;
  title: string;
  pageLabel?: string;
  routeNodeId?: string;
};

type SkimRouteDisplayItem = {
  id: string;
  messageId: string;
  level: 'module' | 'part';
  kind: SkimReadingAnchorKind;
  prefix: string;
  title: string;
  pageLabel?: string;
  messageIndex: number;
};

const createSkimMessageId = (): string => (
  `skim-message-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
);

const getStableMessageId = (message: ChatMessage, index: number): string => (
  message.id ?? `legacy-skim-message-${message.timestamp || 0}-${index}`
);

const getReadingAnchorPrefix = (kind: SkimReadingAnchorKind, index: number): string => {
  if (kind === 'section') return `Section ${index}`;
  if (kind === 'stage') return `Stage ${index}`;
  if (kind === 'naturalPart' || kind === 'paragraphGroup' || kind === 'part') return `Part ${index}`;
  return `Module ${index}`;
};

const isTopLevelReadingKind = (kind: SkimReadingAnchorKind): boolean => (
  kind === 'module' || kind === 'section' || kind === 'stage'
);

const getRouteNodeForAnchor = (
  route: SkimReadingRoute | null | undefined,
  anchor: Pick<SkimReadingMessageAnchor, 'kind' | 'index' | 'parentIndex' | 'routeNodeId'>
): SkimReadingRouteNode | null => {
  if (!route?.nodes?.length) return null;
  if (anchor.routeNodeId) {
    for (const node of route.nodes) {
      if (node.id === anchor.routeNodeId) return node;
      const child = (node.children ?? []).find((candidate) => candidate.id === anchor.routeNodeId);
      if (child) return child;
    }
  }
  if (isTopLevelReadingKind(anchor.kind)) {
    return route.nodes.find((node) => node.index === anchor.index) ?? null;
  }
  const parent = typeof anchor.parentIndex === 'number'
    ? route.nodes.find((node) => node.index === anchor.parentIndex)
    : null;
  return parent?.children?.find((node) => node.index === anchor.index) ?? null;
};

const getRouteNodePageLabel = (node: SkimReadingRouteNode | null): string | undefined => {
  if (!node) return undefined;
  if (node.pageLabel) return node.pageLabel;
  if (typeof node.pageStart !== 'number') return undefined;
  const end = typeof node.pageEnd === 'number' ? node.pageEnd : node.pageStart;
  return node.pageStart === end ? `${node.pageStart} 页` : `${node.pageStart}-${end} 页`;
};

const CHINESE_NUMERAL_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const parseLooseOutlineNumber = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed === '十') return 10;
  const tenIndex = trimmed.indexOf('十');
  if (tenIndex >= 0) {
    const before = trimmed.slice(0, tenIndex);
    const after = trimmed.slice(tenIndex + 1);
    const tens = before ? CHINESE_NUMERAL_MAP[before] ?? 1 : 1;
    const ones = after ? CHINESE_NUMERAL_MAP[after] ?? 0 : 0;
    return tens * 10 + ones;
  }
  return CHINESE_NUMERAL_MAP[trimmed] ?? null;
};

const cleanRouteOutlineTitle = (title: string | undefined): string => {
  const cleaned = (title ?? '')
    .replace(/\*\*/g, '')
    .replace(/\((?:Pages?|页码|第)?\s*\d+\s*[-–—]\s*\d+\s*(?:页|Pages?)?\)/gi, '')
    .replace(/（(?:Pages?|页码|第)?\s*\d+\s*[-–—]\s*\d+\s*(?:页|Pages?)?）/gi, '')
    .replace(/\bPages?\s*\d+\s*[-–—]\s*\d+\b/gi, '')
    .replace(/[：:：\-\s]+$/g, '')
    .trim();
  return cleaned || '未命名段落';
};

const extractRouteOutlinePageLabel = (line: string): string | undefined => {
  const match =
    line.match(/\((?:Pages?|页码|第)?\s*(\d+)\s*[-–—]\s*(\d+)\s*(?:页|Pages?)?\)/i) ??
    line.match(/（(?:Pages?|页码|第)?\s*(\d+)\s*[-–—]\s*(\d+)\s*(?:页|Pages?)?）/i) ??
    line.match(/\bPages?\s*(\d+)\s*[-–—]\s*(\d+)\b/i);
  if (!match) return undefined;
  return `${match[1]}-${match[2]} 页`;
};

const isLikelySkimStyleFollowUp = (text: string): boolean => (
  /(讲|说)?(浅|深|细|详细|简单|短|短点|大白话)|换个说法|重讲|再讲|没懂|不懂|听不懂|举例|例子|为什么|什么意思|这句|这一点|上面|刚刚|前面/.test(text)
);

const isFormalSkimRouteTrigger = (text: string | null, hasExistingOutline: boolean): boolean => {
  if (!text) return !hasExistingOutline;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return !hasExistingOutline;
  if (/前置知识已确认|结构化领读报告|开始正式|开始领读|开始带读|开始陪我顺序读懂/i.test(normalized)) {
    return true;
  }
  if (/^(继续|继续吧|继续。|继续！|继续!|next)$/i.test(normalized)) return true;
  if (isLikelySkimStyleFollowUp(normalized) && !/(下一个|下一段|下一\s*part|next\s*part|next\s*module)/i.test(normalized)) {
    return false;
  }
  return /(继续|下一段|下一个|下一\s*part|下一\s*module|next\s*part|next\s*module|往下|进入下)/i.test(normalized);
};

const getTopAnchorKind = (contentType: SkimContentType): SkimReadingAnchorKind => {
  if (contentType === 'paper') return 'section';
  if (contentType === 'article') return 'stage';
  return 'module';
};

const getChildAnchorKind = (contentType: SkimContentType): SkimReadingAnchorKind => {
  if (contentType === 'paper') return 'naturalPart';
  if (contentType === 'article') return 'paragraphGroup';
  return 'part';
};

const extractSkimReadingAnchors = (
  text: string,
  messageId: string,
  contentType: SkimContentType,
  initialParentNumber?: number
): SkimReadingMessageAnchor[] => {
  const lines = normalizeGeneratedLineBreaks(text)
    .split('\n')
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*/g, '')
      .trim())
    .filter(Boolean);

  const anchors: SkimReadingMessageAnchor[] = [];
  const seen = new Set<string>();
  let parentNumber = initialParentNumber;

  for (const line of lines) {
    const topMatch =
      line.match(/^(?:Module|MODULE)\s*([0-9]+)\s*[:：.、·-]?\s*(.*)$/i) ??
      line.match(/^(?:Section|SECTION)\s*([0-9]+)\s*[:：.、·-]?\s*(.*)$/i) ??
      line.match(/^(?:Stage|STAGE)\s*([0-9]+)\s*[:：.、·-]?\s*(.*)$/i) ??
      line.match(/^模块\s*([0-9一二三四五六七八九十两]+)\s*[:：.、·-]?\s*(.*)$/i) ??
      line.match(/^第\s*([0-9一二三四五六七八九十两]+)\s*(?:个)?\s*(?:module|模块|section|节|stage|阶段)\s*[:：.、·-]?\s*(.*)$/i);
    if (topMatch && !/总结|takeaway|恭喜|完成|回顾/i.test(line)) {
      const index = parseLooseOutlineNumber(topMatch[1]);
      if (index != null) {
        parentNumber = index;
        const kind = getTopAnchorKind(contentType);
        const key = `${kind}-${index}`;
        if (!seen.has(key)) {
          seen.add(key);
          anchors.push({
            id: `${messageId}-${kind}-${index}`,
            kind,
            index,
            title: cleanRouteOutlineTitle(topMatch[2]),
            pageLabel: extractRouteOutlinePageLabel(line),
          });
        }
      }
      continue;
    }

    const partMatch =
      line.match(/^(?:Part|PART)\s*([0-9]+)\s*[:：.、·-]?\s*(.*)$/i) ??
      line.match(/^第\s*([0-9一二三四五六七八九十两]+)\s*(?:个)?\s*(?:part|部分|段)\s*[:：.、·-]?\s*(.*)$/i);
    if (partMatch) {
      const index = parseLooseOutlineNumber(partMatch[1]);
      if (index != null) {
        const kind = getChildAnchorKind(contentType);
        const key = `${kind}-${parentNumber ?? 'x'}-${index}`;
        if (!seen.has(key)) {
          seen.add(key);
          anchors.push({
            id: `${messageId}-${kind}-${parentNumber ?? 'x'}-${index}`,
            kind,
            index,
            ...(typeof parentNumber === 'number' ? { parentIndex: parentNumber } : {}),
            title: cleanRouteOutlineTitle(partMatch[2]),
            pageLabel: extractRouteOutlinePageLabel(line),
          });
        }
      }
    }
  }

  return anchors;
};

const createAnchorFromRouteNode = (
  node: SkimReadingRouteNode,
  messageId: string,
  parentIndex?: number
): SkimReadingMessageAnchor => ({
  id: `${messageId}-${node.id}`,
  kind: node.kind,
  index: node.index,
  ...(typeof parentIndex === 'number' ? { parentIndex } : {}),
  title: node.title,
  pageLabel: getRouteNodePageLabel(node),
  routeNodeId: node.id,
});

const getNextPlannedReadingAnchors = (
  route: SkimReadingRoute | null | undefined,
  existingItems: SkimRouteOutlineItem[],
  messageId: string,
  contentType: SkimContentType,
  skimPace: 'module' | 'part'
): SkimReadingMessageAnchor[] => {
  if (!route?.nodes?.length) return [];

  if (contentType === 'lecture' && skimPace === 'module') {
    const nextNode = route.nodes.find((node) => (
      !existingItems.some((item) => item.routeNodeId === node.id || (
        isTopLevelReadingKind(item.kind) && item.number === node.index
      ))
    ));
    return nextNode ? [createAnchorFromRouteNode(nextNode, messageId)] : [];
  }

  for (const parent of route.nodes) {
    const children = parent.children ?? [];
    if (children.length === 0) {
      const alreadyUsed = existingItems.some((item) => (
        item.routeNodeId === parent.id || (
          isTopLevelReadingKind(item.kind) && item.number === parent.index
        )
      ));
      if (!alreadyUsed) return [createAnchorFromRouteNode(parent, messageId)];
      continue;
    }

    const nextChild = children.find((child) => (
      !existingItems.some((item) => (
        item.routeNodeId === child.id || (
          !isTopLevelReadingKind(item.kind) &&
          item.parentNumber === parent.index &&
          item.number === child.index
        )
      ))
    ));
    if (!nextChild) continue;

    const parentAlreadyUsed = existingItems.some((item) => (
      item.routeNodeId === parent.id || (
        isTopLevelReadingKind(item.kind) && item.number === parent.index
      )
    ));
    return [
      ...(!parentAlreadyUsed ? [createAnchorFromRouteNode(parent, messageId)] : []),
      createAnchorFromRouteNode(nextChild, messageId, parent.index),
    ];
  }

  return [];
};

const getOutlineDedupeKey = (
  anchor: Pick<SkimReadingMessageAnchor, 'kind' | 'index' | 'parentIndex' | 'routeNodeId'>
): string => (
  anchor.routeNodeId ?? `${anchor.kind}-${anchor.parentIndex ?? 'root'}-${anchor.index}`
);

const countFormalSkimResponses = (messages: ChatMessage[]): number => {
  let previousUserText: string | null = null;
  let count = 0;

  messages.forEach((message) => {
    if (message.role === 'user') {
      previousUserText = message.text;
      return;
    }
    const isFormal =
      message.skimReadingFormal === true ||
      !!message.skimReadingAnchors?.length ||
      isFormalSkimRouteTrigger(previousUserText, count > 0);
    if (isFormal) count += 1;
  });

  return count;
};

const resolveFormalSkimReadingAnchors = ({
  text,
  messageId,
  contentType,
  skimPace,
  readingRoute,
  existingItems,
  currentParentNumber,
}: {
  text: string;
  messageId: string;
  contentType: SkimContentType;
  skimPace: 'module' | 'part';
  readingRoute?: SkimReadingRoute | null;
  existingItems: SkimRouteOutlineItem[];
  currentParentNumber?: number;
}): SkimReadingMessageAnchor[] => {
  let anchors = extractSkimReadingAnchors(
    text,
    messageId,
    contentType,
    currentParentNumber
  );

  // 回复里明确写出的 Module/Part 才是事实；规划路线只负责为无标题的正式回复补标签。
  if (anchors.length === 0) {
    anchors = getNextPlannedReadingAnchors(
      readingRoute,
      existingItems,
      messageId,
      contentType,
      skimPace
    );
  }

  if (contentType === 'lecture' && skimPace === 'module') {
    anchors = anchors.filter((anchor) => isTopLevelReadingKind(anchor.kind));
  }

  return anchors.map((anchor) => {
    const routeNode = getRouteNodeForAnchor(readingRoute, anchor);
    return {
      ...anchor,
      ...(routeNode ? {
        routeNodeId: routeNode.id,
        title: anchor.title === '未命名段落' ? routeNode.title : anchor.title,
        pageLabel: anchor.pageLabel ?? getRouteNodePageLabel(routeNode),
      } : {}),
    };
  });
};

const buildSkimRouteOutline = (
  messages: ChatMessage[],
  contentType: SkimContentType,
  skimPace: 'module' | 'part',
  readingRoute?: SkimReadingRoute | null
): SkimRouteOutlineItem[] => {
  const items: SkimRouteOutlineItem[] = [];
  let previousUserText: string | null = null;
  let currentParentNumber: number | undefined;
  let formalResponseCount = 0;
  const seen = new Set<string>();

  messages.forEach((message, index) => {
    if (message.role === 'user') {
      previousUserText = message.text;
      return;
    }

    const messageId = getStableMessageId(message, index);
    const isFormal =
      message.skimReadingFormal === true ||
      !!message.skimReadingAnchors?.length ||
      isFormalSkimRouteTrigger(previousUserText, formalResponseCount > 0);
    if (!isFormal) return;

    let anchors = message.skimReadingAnchors?.length
      ? message.skimReadingAnchors.map((anchor) => {
          const routeNode = getRouteNodeForAnchor(readingRoute, anchor);
          return {
            ...anchor,
            ...(routeNode ? {
              routeNodeId: routeNode.id,
              title: anchor.title === '未命名段落' ? routeNode.title : anchor.title,
              pageLabel: anchor.pageLabel ?? getRouteNodePageLabel(routeNode),
            } : {}),
          };
        })
      : resolveFormalSkimReadingAnchors({
          text: message.text,
          messageId,
          contentType,
          skimPace,
          readingRoute,
          existingItems: items,
          currentParentNumber,
        });

    if (contentType === 'lecture' && skimPace === 'module') {
      anchors = anchors.filter((anchor) => isTopLevelReadingKind(anchor.kind));
    }

    anchors.forEach((anchor) => {
      const enrichedAnchor = anchor;
      if (isTopLevelReadingKind(enrichedAnchor.kind)) {
        currentParentNumber = enrichedAnchor.index;
      }

      const key = getOutlineDedupeKey(enrichedAnchor);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: enrichedAnchor.id,
        messageId,
        level: isTopLevelReadingKind(enrichedAnchor.kind) ? 'module' : 'part',
        messageIndex: index,
        kind: enrichedAnchor.kind,
        number: enrichedAnchor.index,
        parentNumber: enrichedAnchor.parentIndex,
        title: enrichedAnchor.title,
        pageLabel: enrichedAnchor.pageLabel,
        routeNodeId: enrichedAnchor.routeNodeId,
      });
    });
    formalResponseCount += 1;
  });

  return items;
};

const buildTableAnnotationHtml = (table: HTMLTableElement): string => {
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.removeAttribute('class');
  clone.setAttribute(
    'style',
    'width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;line-height:1.5;color:#1f2937;'
  );

  clone.querySelectorAll('thead').forEach((thead) => {
    thead.removeAttribute('class');
    thead.setAttribute('style', 'background:#f5f5f4;');
  });
  clone.querySelectorAll('tr').forEach((row) => {
    row.removeAttribute('class');
  });
  clone.querySelectorAll('th').forEach((cell) => {
    cell.removeAttribute('class');
    cell.setAttribute(
      'style',
      'border-bottom:1px solid #d6d3d1;padding:10px 12px;text-align:left;vertical-align:top;font-weight:700;color:#44403c;'
    );
  });
  clone.querySelectorAll('td').forEach((cell) => {
    cell.removeAttribute('class');
    cell.setAttribute(
      'style',
      'border-bottom:1px solid #e7e5e4;padding:12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;'
    );
  });
  clone.querySelectorAll('p').forEach((paragraph) => {
    paragraph.setAttribute('style', `${paragraph.getAttribute('style') || ''};margin:0 0 8px;`);
  });

  return `<div data-skim-table-note="true" style="width:100%;overflow:auto;">${clone.outerHTML}</div>`;
};

const handleMarkdownTableDragStart = (event: React.DragEvent<HTMLElement>) => {
  const wrapper = event.currentTarget.closest('[data-skim-table-wrapper="true"]');
  const table = wrapper?.querySelector('table');
  if (!table) return;

  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/html', buildTableAnnotationHtml(table));
  event.dataTransfer.setData('text/plain', table.innerText);
};

const AUXILIARY_USE_MODE_OPTIONS: Array<{ value: SkimAuxiliaryUseMode; label: string; hint: string }> = [
  { value: 'necessary', label: '只在必要时引用', hint: '最稳，不硬凑。' },
  { value: 'active', label: '积极关联', hint: '更主动找联系。' },
];

const buildFolderCounts = (sessions: CloudSession[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    if (session.type === 'file' && session.parentId) counts[session.parentId] = (counts[session.parentId] ?? 0) + 1;
  }
  return counts;
};

const MarkdownComponents: Components = {
    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-slate-900 mt-6 mb-4" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-lg font-bold text-slate-800 mt-5 mb-3 border-b border-stone-100 pb-2" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-base font-bold text-indigo-700 mt-4 mb-2" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 space-y-2 my-2 text-slate-700 [td_&]:my-1 [td_&]:space-y-1" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 space-y-2 my-2 text-slate-700 [td_&]:my-1 [td_&]:space-y-1" {...props} />,
    li: ({node, ...props}) => <li className="pl-1 leading-relaxed [td_&]:leading-6" {...props} />,
    strong: ({node, ...props}) => <strong className="font-bold text-indigo-900 bg-indigo-50 px-1 rounded" {...props} />,
    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-300 pl-4 py-1 my-4 bg-stone-50 italic text-slate-600 rounded-r-lg" {...props} />,
    // --- TABLE STYLES ---
    table: ({node, ...props}) => (
      <div data-skim-table-wrapper="true" className="group/skim-table relative my-5 w-full rounded-xl border border-stone-200 bg-white shadow-sm">
        <div
          role="button"
          tabIndex={0}
          draggable
          title="拖到左侧页面，生成表格笔记"
          onDragStart={handleMarkdownTableDragStart}
          className="absolute right-2 top-2 z-10 inline-flex cursor-grab select-none items-center gap-1 rounded-lg bg-slate-900/90 px-2 py-1 text-[11px] font-bold text-white shadow-lg opacity-0 transition-opacity active:cursor-grabbing group-hover/skim-table:opacity-100"
        >
          <Move className="h-3 w-3" />
          拖到页面
        </div>
        <div className="w-full overflow-x-auto overflow-y-hidden rounded-xl custom-scrollbar">
          <table className="min-w-[720px] border-collapse text-left text-sm text-stone-700" {...props} />
        </div>
      </div>
    ),
    p: ({node, ...props}) => <p className="mb-3 leading-7 text-slate-700 [td_&]:mb-1 [td_&]:leading-6 [th_&]:mb-0 [th_&]:leading-5" {...props} />,
    thead: ({node, ...props}) => (
      <thead className="bg-stone-100 text-xs font-bold text-stone-700" {...props} />
    ),
    th: ({node, ...props}) => (
      <th className="min-w-[180px] border-b border-r border-stone-200 px-4 py-3 align-top leading-5 last:border-r-0" {...props} />
    ),
    td: ({node, ...props}) => (
      <td className="min-w-[180px] border-b border-r border-stone-100 px-4 py-3 align-top leading-6 break-words last:border-r-0" {...props} />
    ),
    tr: ({node, ...props}) => (
      <tr className="hover:bg-stone-50/50 transition-colors" {...props} />
    ),
};

/** 「发给导读」时追加在草稿前传给模型；用户气泡仍仅展示草稿原文 */
const SKIM_DRAFT_GUIDE_PREFIX =
  '【请点评我对本模块的理解（不用重复全文，可指出偏差与补充）】';

/** 略读草稿预览：KaTeX 解析失败时降级为纯文本，不抛错打断输入 */
class TakeawaysDraftMarkdownPreview extends Component<
  { markdown: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidUpdate(prev: { markdown: string }) {
    if (prev.markdown !== this.props.markdown) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[TakeawaysDraftMarkdownPreview]', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 font-sans">
          {this.props.markdown}
        </pre>
      );
    }
    return (
      <div data-preserve-language="true">
        <ReactMarkdown
          components={MarkdownComponents}
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
          className="text-xs text-slate-700"
        >
          {this.props.markdown}
        </ReactMarkdown>
      </div>
    );
  }
}

export const SkimPanel: React.FC<SkimPanelProps> = ({
  studyMap,
  isLoading,
  onSwitchToDeep,
  fullText,
  pdfDataUrl,
  messages,
  setMessages,
  topHeight,
  setTopHeight,
  focusMode,
  setFocusMode,
  stage,
  setStage,
  quizData,
  setQuizData,
  docType,
  onToggleDocType,
  onNotebookAdd,
  onRegenerateStudyMap,
  studyMapModuleCount = null,
  totalPages,
  // 略读多会话（阶段一）：以下原内部态改为受控 props。别名回旧内部名，使既有用法零改动。
  moduleCount: selectedModuleCount,
  setModuleCount: setSelectedModuleCount,
  skimPace,
  setSkimPace,
  contentType: skimContentType,
  onContentTypeChange: setSkimContentType,
  auxiliaryMaterial,
  onAuxiliaryMaterialChange,
  readingRoute = null,
  onReadingRouteChange,
  cloudSessions = [],
  currentCloudSessionId = null,
  pageRangeStart,
  setPageRangeStart,
  pageRangeEnd,
  setPageRangeEnd,
  onLoadingChange,
  skipDiagnosis = false,
  onStartTutorMode,
  studyStyle,
  onStudyStyleChange,
  explanationDepth,
  onExplanationDepthChange,
  recordDeck = null,
  onRecordDeckChange,
  activeRecordCard = null,
  pdfPageTexts = [],
  currentPage = 1,
  onJumpToPage,
  onOpenRecordShelf,
  onCompleteRecord,
  onUndoRecordComplete,
  onOpenNextRecord,
  caseLearning = null,
  onCaseLearningChange,
  caseSourceId = 'local-document',
}) => {
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [variantLoadingMessageId, setVariantLoadingMessageId] = useState<string | null>(null);
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const [explanationGenerationError, setExplanationGenerationError] = useState<string | null>(null);
  const [localPrereqs, setLocalPrereqs] = useState<Prerequisite[]>([]);

  // Quiz State
  const [quizSelectedOption, setQuizSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isRegeneratingMap, setIsRegeneratingMap] = useState(false);
  const [isGeneratingRoute, setIsGeneratingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const recordOpeningStartedRef = useRef<string | null>(null);
  const [showGranularityModal, setShowGranularityModal] = useState(false);
  const [routeBriefingOpen, setRouteBriefingOpen] = useState(false);
  const [routeOutlineOpen, setRouteOutlineOpen] = useState(true);
  const [activeRouteItemId, setActiveRouteItemId] = useState<string | null>(null);
  /** 阶段4b 防线：paper/文章模式下原文（pdfDataUrl）未就位时的友好提示，挡住"开始陪读" */
  const [companionGuardNotice, setCompanionGuardNotice] = useState<string | null>(null);
  const [auxiliaryPickerOpen, setAuxiliaryPickerOpen] = useState(false);
  const [auxiliaryFolderId, setAuxiliaryFolderId] = useState<'all' | string>('all');
  const [auxiliaryContent, setAuxiliaryContent] = useState<string | null>(null);
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(false);
  const [auxiliaryError, setAuxiliaryError] = useState<string | null>(null);
  // 阶段 2：内容类型改为受控 prop（contentType / onContentTypeChange），由 App 的激活会话持有并持久化。
  // 上方解构已把它们别名回 skimContentType / setSkimContentType，故下方控件 JSX 零改动。
  const CONTENT_TYPE_OPTIONS: { value: SkimContentType; label: string }[] = [
    { value: 'lecture', label: 'Lecture / 讲义' },
    { value: 'paper', label: '论文 / Paper' },
    { value: 'article', label: '文章' },
  ];
  const MODULE_OPTIONS = [2, 3, 4, 5, 6, 7];
  const pageRangeError = getPageRangeError(pageRangeStart, pageRangeEnd, totalPages);
  const configuredRangeStart = pageRangeStart ?? 1;
  const configuredRangeEnd = pageRangeEnd ?? totalPages ?? pdfPageTexts.length;
  const auxiliaryFolders = useMemo(
    () => cloudSessions.filter((session) => session.type === 'folder'),
    [cloudSessions]
  );
  const auxiliaryFileSessions = useMemo(
    () => cloudSessions.filter((session) => (
      session.type === 'file' && session.fileUrl && session.id !== currentCloudSessionId
    )),
    [cloudSessions, currentCloudSessionId]
  );
  const auxiliaryFolderCounts = useMemo(
    () => buildFolderCounts(auxiliaryFileSessions),
    [auxiliaryFileSessions]
  );
  const visibleAuxiliaryFiles = useMemo(
    () => auxiliaryFileSessions.filter((session) => (
      auxiliaryFolderId === 'all' || session.parentId === auxiliaryFolderId
    )),
    [auxiliaryFileSessions, auxiliaryFolderId]
  );
  const routeOutlineItems = useMemo(
    () => buildSkimRouteOutline(messages, skimContentType, skimPace, readingRoute),
    [messages, readingRoute, skimContentType, skimPace]
  );
  const displayRouteOutlineItems = useMemo<SkimRouteDisplayItem[]>(() => (
    routeOutlineItems.map((item) => ({
      id: item.id,
      messageId: item.messageId,
      level: item.level,
      kind: item.kind,
      prefix: getReadingAnchorPrefix(item.kind, item.number ?? 0),
      title: item.title,
      pageLabel: item.pageLabel,
      messageIndex: item.messageIndex,
    }))
  ), [routeOutlineItems]);
  const latestRouteItem = displayRouteOutlineItems.at(-1) ?? null;
  const nextRecordCard = activeRecordCard && recordDeck
    ? getNextSkimRecordCard(recordDeck, activeRecordCard.id)
    : null;
  const selectedAuxiliaryRole = auxiliaryMaterial?.role ?? 'reading';
  const selectedAuxiliaryUseMode = auxiliaryMaterial?.useMode ?? 'necessary';
  useEffect(() => {
    if (auxiliaryFolderId === 'all') return;
    if (auxiliaryFolders.some((folder) => folder.id === auxiliaryFolderId)) return;
    setAuxiliaryFolderId('all');
  }, [auxiliaryFolderId, auxiliaryFolders]);

  useEffect(() => {
    if (!auxiliaryMaterial) {
      setAuxiliaryContent(null);
      setAuxiliaryLoading(false);
      setAuxiliaryError(null);
      return;
    }

    const session = auxiliaryFileSessions.find((item) => item.id === auxiliaryMaterial.cloudSessionId);
    if (!session?.fileUrl) {
      setAuxiliaryContent(null);
      setAuxiliaryLoading(false);
      setAuxiliaryError('找不到这份辅助材料，请重新选择。');
      return;
    }

    let cancelled = false;
    setAuxiliaryLoading(true);
    setAuxiliaryError(null);

    (async () => {
      try {
        const file = await fetchFileFromUrl(session.fileUrl, session.fileName || auxiliaryMaterial.fileName);
        const dataUrl = await readFileAsDataURL(file);
        if (!cancelled) setAuxiliaryContent(dataUrl);
      } catch (error) {
        console.warn('辅助材料读取失败', error);
        if (!cancelled) {
          setAuxiliaryContent(null);
          setAuxiliaryError('辅助材料加载失败，领读会先按当前 PDF 继续。');
        }
      } finally {
        if (!cancelled) setAuxiliaryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auxiliaryMaterial?.cloudSessionId, auxiliaryMaterial?.fileName, auxiliaryFileSessions]);
  const contentTypeSelector = (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-stone-500">你读的是什么？</label>
      <div className="grid grid-cols-3 gap-2">
        {CONTENT_TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSkimContentType(value)}
            className={`py-2 px-2 rounded-xl text-xs font-bold border-2 transition-all ${
              skimContentType === value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-stone-200 hover:border-indigo-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  const studyStyleSelector = skimContentType === 'lecture' ? (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-stone-500">学习方式</label>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
        <button
          type="button"
          onClick={() => onStudyStyleChange('continuous')}
          className={`rounded-lg px-3 py-2.5 text-left transition-colors ${studyStyle === 'continuous'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="block text-xs font-black">整段式学习</span>
          <span className="mt-0.5 block text-[10px] leading-4 opacity-70">保留现在的连续领读对话</span>
        </button>
        <button
          type="button"
          onClick={() => onStudyStyleChange('records')}
          className={`rounded-lg px-3 py-2.5 text-left transition-colors ${studyStyle === 'records'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs font-black"><Library className="h-3.5 w-3.5" />分段式（唱片）</span>
          <span className="mt-0.5 block text-[10px] leading-4 opacity-80">先选 Module / Part，再进入学习</span>
        </button>
      </div>
      {onCaseLearningChange && configuredRangeEnd >= configuredRangeStart && (
        <LectureCaseModeCard
          state={caseLearning}
          setState={onCaseLearningChange}
          sourceId={caseSourceId}
          pageStart={configuredRangeStart}
          pageEnd={configuredRangeEnd}
          pageTexts={pdfPageTexts}
          pdfDataUrl={pdfDataUrl}
          pageRangeError={pageRangeError}
          onStudyStyleChange={onStudyStyleChange}
          onLoadingChange={onLoadingChange}
        />
      )}
    </div>
  ) : null;
  const auxiliaryMaterialSelector = (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
            <Link2 className="h-3.5 w-3.5" />
            联合辅助材料（可选）
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            当前 PDF 仍是主线，辅助材料只作为课前阅读、paper 或文章背景。
          </p>
        </div>
        {auxiliaryMaterial && onAuxiliaryMaterialChange && (
          <button
            type="button"
            onClick={() => onAuxiliaryMaterialChange(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white hover:text-rose-500"
          >
            移除
          </button>
        )}
      </div>

      {auxiliaryMaterial ? (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
          <p className="truncate text-sm font-bold text-slate-800">{auxiliaryMaterial.fileName}</p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {auxiliaryLoading
              ? '正在准备辅助材料...'
              : auxiliaryError
                ? auxiliaryError
                : '已准备好，领读时会在相关处补充。'}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedAuxiliaryRole}
              onChange={(event) => onAuxiliaryMaterialChange?.({ ...auxiliaryMaterial, role: event.target.value as SkimAuxiliaryMaterialRole, useMode: selectedAuxiliaryUseMode })}
              className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-300"
            >
              {AUXILIARY_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAuxiliaryPickerOpen(true)}
              className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              更换
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {AUXILIARY_USE_MODE_OPTIONS.map((option) => {
              const active = selectedAuxiliaryUseMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onAuxiliaryMaterialChange?.({ ...auxiliaryMaterial, useMode: option.value })}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-stone-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50/50'
                  }`}
                >
                  <span className="block text-[11px] font-bold">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{option.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">
            这个设置只影响之后生成的领读内容。
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAuxiliaryPickerOpen(true)}
          disabled={!onAuxiliaryMaterialChange}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          选择辅助材料
        </button>
      )}
    </div>
  );
  const pageRangeLabel =
    pageRangeStart != null && pageRangeEnd != null
      ? `${pageRangeStart}-${pageRangeEnd} 页`
      : '整份资料';
  useEffect(() => {
    setRouteError(null);
  }, [skimContentType, pageRangeLabel, selectedModuleCount, skimPace, studyStyle]);
  const buildAuxiliaryReadingOption = (): SkimReadingOptions['auxiliaryMaterial'] | undefined => {
    if (!auxiliaryMaterial || !auxiliaryContent) return undefined;
    return {
      fileName: auxiliaryMaterial.fileName,
      role: auxiliaryMaterial.role,
      useMode: auxiliaryMaterial.useMode ?? 'necessary',
      content: auxiliaryContent,
    };
  };
  const buildLectureReadingOptions = (effectiveMap: StudyMap | null = studyMap): SkimReadingOptions | undefined => {
    if (skimContentType !== 'lecture') return undefined;
    if (studyStyle === 'records' && activeRecordCard) {
      const otherRecordDigests = recordDeck
        ? recordDeck.orderedCardIds
            .filter((cardId) => cardId !== activeRecordCard.id)
            .map((cardId) => recordDeck.cards[cardId])
            .filter((card): card is SkimRecordCardState => Boolean(card?.digest))
            .map((card) => ({
              moduleIndex: card.moduleIndex,
              ...(card.partIndex == null ? {} : { partIndex: card.partIndex }),
              title: card.title,
              clarified: card.digest?.clarified ?? [],
              unresolved: card.digest?.unresolved ?? [],
            }))
        : [];
      return {
        auxiliaryMaterial: buildAuxiliaryReadingOption(),
        recordScope: {
          cardId: activeRecordCard.id,
          moduleIndex: activeRecordCard.moduleIndex,
          ...(activeRecordCard.partIndex == null ? {} : { partIndex: activeRecordCard.partIndex }),
          title: activeRecordCard.title,
          moduleTitle: activeRecordCard.moduleTitle,
          pageStart: activeRecordCard.pageStart,
          pageEnd: activeRecordCard.pageEnd,
          summary: activeRecordCard.summary,
          otherRecordDigests,
        },
      };
    }
    return {
      moduleCount: selectedModuleCount,
      studyMapBriefing: effectiveMap?.initialBriefing,
      skimPace,
      auxiliaryMaterial: buildAuxiliaryReadingOption(),
    };
  };
  const routeMatchesCurrentSetup = (route: SkimReadingRoute | null | undefined): boolean => {
    if (!route || route.kind !== skimContentType) return false;
    if (route.pageRangeLabel && route.pageRangeLabel !== pageRangeLabel) return false;
    if (skimContentType !== 'lecture') return true;
    return route.moduleCount === selectedModuleCount && route.skimPace === skimPace;
  };
  const recordRangeStart = pageRangeStart ?? 1;
  const recordRangeEnd = pageRangeEnd ?? totalPages ?? pdfPageTexts.length;
  const buildPageIndexedText = (): string => {
    if (pdfPageTexts.length === 0 || recordRangeEnd < recordRangeStart) return '';
    return pdfPageTexts
      .slice(recordRangeStart - 1, recordRangeEnd)
      .map((pageText, index) => `[应用内第 ${recordRangeStart + index} 页]\n${pageText?.trim() || '（本页没有可提取文字，请结合 PDF 画面判断。）'}`)
      .join('\n\n')
      .slice(0, 150000);
  };
  const buildPageRangeContentOverride = async (): Promise<string | undefined> => {
    if (
      skimContentType === 'lecture' &&
      pageRangeStart != null &&
      pageRangeEnd != null &&
      !pageRangeError &&
      pdfDataUrl?.startsWith('data:application/pdf')
    ) {
      try {
        return await extractPdfPageRange(pdfDataUrl, pageRangeStart, pageRangeEnd);
      } catch (error) {
        console.error('页码裁剪失败，回退整本', error);
      }
    }
    return undefined;
  };
  const ensureSkimReadingRoute = async (
    contentOverride?: string,
    effectiveMap: StudyMap | null = studyMap,
    force = false
  ): Promise<SkimReadingRoute | null> => {
    if (!onReadingRouteChange) return null;
    if (!force && routeMatchesCurrentSetup(readingRoute)) {
      if (studyStyle !== 'records') return readingRoute ?? null;
      if (readingRoute) {
        const validation = validateSkimReadingRoute(readingRoute, recordRangeStart, recordRangeEnd);
        if (validation.valid) {
          if (!recordDeck && onRecordDeckChange) {
            onRecordDeckChange(buildSkimRecordDeck(readingRoute, skimPace));
          }
          return readingRoute;
        }
      }
      // 唱片架不能沿用页码不可靠的旧路线，继续进入下方的重新生成与修复流程。
    }
    const content = contentOverride ?? (pdfDataUrl || fullText);
    if (!content) {
      if (force) setRouteError('还没拿到可用的原文内容，稍后再试一次。');
      return null;
    }

    setIsGeneratingRoute(true);
    setRouteError(null);
    try {
      const routeOptions = {
        contentType: skimContentType,
        docType,
        moduleCount: skimContentType === 'lecture' ? selectedModuleCount : undefined,
        skimPace: skimContentType === 'lecture' ? skimPace : undefined,
        pageRangeLabel,
        studyMapBriefing: effectiveMap?.initialBriefing,
        ...(studyStyle === 'records' ? {
          strictPageRanges: true,
          pageIndexedText: buildPageIndexedText(),
        } : {}),
      };
      let route = await generateSkimReadingRoute(content, routeOptions);
      if (studyStyle === 'records') {
        let validation = route
          ? validateSkimReadingRoute(route, recordRangeStart, recordRangeEnd)
          : { valid: false, errors: ['模型没有返回路线。'] };
        if (!validation.valid) {
          route = await generateSkimReadingRoute(content, {
            ...routeOptions,
            validationFeedback: validation.errors.join('\n'),
          });
          validation = route
            ? validateSkimReadingRoute(route, recordRangeStart, recordRangeEnd)
            : { valid: false, errors: ['自动修复后仍没有返回路线。'] };
        }
        if (!route || !validation.valid) {
          setRouteError(`没有生成可靠的唱片页码，请重新规划。${validation.errors[0] ? ` ${validation.errors[0]}` : ''}`);
          return null;
        }
        onReadingRouteChange(route);
        onRecordDeckChange?.(buildSkimRecordDeck(route, skimPace));
        setRouteError(null);
        return route;
      }
      if (route) {
        onReadingRouteChange(route);
        setRouteError(null);
        return route;
      } else {
        setRouteError('这次没有生成出可用目录，可以稍后再试。');
      }
    } catch (error) {
      console.warn('生成领读路线失败，继续使用普通领读。', error);
      setRouteError(studyStyle === 'records' ? '唱片路线生成失败，没有改动原来的领读。' : '目录生成失败，当前聊天不会受影响。');
    } finally {
      setIsGeneratingRoute(false);
    }
    return null;
  };
  const handleReplanReadingRoute = async () => {
    if (pageRangeError) return;
    if (
      studyStyle === 'records'
      && recordDeck
      && !window.confirm('重新规划会删除当前唱片的学习状态、独立对话、停留位置和学习摘要。PDF 便签、注释、页面评论、整段式领读和导出记录不会受影响。确定继续吗？')
    ) return;
    setRouteOutlineOpen(true);
    const contentOverride = await buildPageRangeContentOverride();
    await ensureSkimReadingRoute(contentOverride, studyMap, true);
  };
  const routeNeedsRefresh = !!readingRoute && !routeMatchesCurrentSetup(readingRoute);
  const routeStatusHint = isGeneratingRoute
    ? '正在规划后续主线'
    : routeNeedsRefresh
      ? '配置已变化，建议重规划后续'
      : displayRouteOutlineItems.length > 0
        ? `已记录 ${displayRouteOutlineItems.length} 个正式讲解位置`
        : '正式开始或继续后，会在这里记录可返回的位置';
  const statusPanelStyle =
    stage === 'quiz'
      ? { height: '100%' }
      : stage === 'reading'
        ? undefined
        : { height: `${topHeight}%` };

  // “看要点”只是一层临时回看/提取，不参与领读进度或掌握状态。
  const [moduleTakeaways, setModuleTakeaways] = useState<SkimModuleTakeaway[] | null>(null);
  const [takeawaysPanelOpen, setTakeawaysPanelOpen] = useState(false);
  const [takeawaysSourceKey, setTakeawaysSourceKey] = useState<string | null>(null);
  const [takeawaysLoading, setTakeawaysLoading] = useState(false);
  const [takeawaysError, setTakeawaysError] = useState<string | null>(null);
  const [knowledgeExtractionLoading, setKnowledgeExtractionLoading] = useState(false);
  const [knowledgeExtractionError, setKnowledgeExtractionError] = useState<string | null>(null);

  /** 本模块要点「自整理」草稿：按每次成功生成要点分配新键，仅存内存 */
  const nextTakeawaysDraftIdRef = useRef(0);
  const [activeTakeawaysDraftId, setActiveTakeawaysDraftId] = useState<number | null>(null);
  const [takeawaysDrafts, setTakeawaysDrafts] = useState<Record<number, string>>({});
  const [takeawaysWriteOpen, setTakeawaysWriteOpen] = useState(false);
  const [notebookDraftHint, setNotebookDraftHint] = useState(false);
  const takeawaysDraftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const draftToGuideLockRef = useRef(false);
  const notebookHintTimerRef = useRef<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);
  /** 略读对话：取消进行中的 `chatWithSkimAdaptiveTutor`（与 `@google/genai` 的 `config.abortSignal` 对齐） */
  const skimAbortControllerRef = useRef<AbortController | null>(null);
  const variantAbortControllerRef = useRef<AbortController | null>(null);
  /** SDK 偶发在 abort 后仍 resolve 时，与 `signal.aborted` 双保险，避免误追加助手气泡 */
  const skimGenerationCancelledRef = useRef(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const isExplanationBusy = isChatLoading
    || variantLoadingMessageId !== null
    || takeawaysLoading
    || knowledgeExtractionLoading;

  // Text Selection State
  const [selectionRect, setSelectionRect] = useState<{top: number, left: number} | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const selectionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (studyMap && localPrereqs.length === 0) {
        setLocalPrereqs(studyMap.prerequisites);
    }
  }, [studyMap]);

  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || routeOutlineItems.length === 0) {
      setActiveRouteItemId(null);
      return;
    }

    const updateActiveRouteItem = () => {
      let active = routeOutlineItems[0]?.id ?? null;
      const containerTop = container.getBoundingClientRect().top;
      routeOutlineItems.forEach((item) => {
        const node = messageRefs.current[item.messageId];
        if (node && node.getBoundingClientRect().top <= containerTop + 140) {
          active = item.id;
        }
      });
      setActiveRouteItemId(active);
    };

    updateActiveRouteItem();
    container.addEventListener('scroll', updateActiveRouteItem, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveRouteItem);
  }, [routeOutlineItems]);

  // 把「生成中」上抛给 App：标签栏据此锁切换 + 新建（阶段一并发策略）。
  // 含 isRegeneratingMap / isGeneratingRoute：因「开始领读」会先重算地图/路线(数秒)再发首条消息，这段窗口若被切走，
  // 后续 setStage/setMessages 会落到切换后的会话 → 串台。一并锁住才真正「切换不串台」。
  useEffect(() => {
    onLoadingChange?.(isExplanationBusy || isRegeneratingMap || isGeneratingRoute);
  }, [isExplanationBusy, isRegeneratingMap, isGeneratingRoute, onLoadingChange]);

  useEffect(() => {
    return () => {
      if (notebookHintTimerRef.current != null) {
        window.clearTimeout(notebookHintTimerRef.current);
      }
      variantAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!takeawaysWriteOpen) return;
    const id = requestAnimationFrame(() => takeawaysDraftTextareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [takeawaysWriteOpen]);

  // --- SELECTION LOGIC (Similar to ExplanationPanel) ---
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isResizingRef.current) return;

      if (selectionTimerRef.current) {
        window.clearTimeout(selectionTimerRef.current);
      }

      selectionTimerRef.current = window.setTimeout(() => {
        const selection = window.getSelection();
        
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          setSelectionRect(null);
          setSelectedText('');
          return;
        }

        if (containerRef.current && containerRef.current.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          if (rect.width > 0) {
              setSelectedText(selection.toString().trim());
              setSelectionRect({
                  top: rect.top - 45,
                  left: rect.left + (rect.width / 2)
              });
          }
        } else {
          setSelectionRect(null);
          setSelectedText('');
        }
      }, 150);
    };

    document.addEventListener('mouseup', handleSelectionChange);
    
    const onScroll = () => {
        if(selectionRect) setSelectionRect(null);
    };
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      window.removeEventListener('scroll', onScroll, true);
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    };
  }, [selectionRect]);

  const takeawaysDraftText =
    activeTakeawaysDraftId != null ? takeawaysDrafts[activeTakeawaysDraftId] ?? '' : '';
  const deferredTakeawaysPreview = useDeferredValue(takeawaysDraftText);

  const handleAddToNotebook = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    if (selectedText && onNotebookAdd) {
        onNotebookAdd(selectedText, 'skim');
        setSelectionRect(null);
        setSelectedText('');
        window.getSelection()?.removeAllRanges();
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'row-resize';
  };

  const onResize = (e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - containerRect.top;
    const newPercentage = (relativeY / containerRect.height) * 100;
    if (newPercentage > 15 && newPercentage < 85) {
      setTopHeight(newPercentage);
    }
  };

  const stopResize = () => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
  };

  const togglePrereq = (id: string) => {
    setLocalPrereqs(prev => prev.map(p => p.id === id ? { ...p, mastered: !p.mastered } : p));
  };

  const startAdaptiveLearning = async () => {
      // Prioritize Vision Data
      const content = pdfDataUrl || fullText;
      if (!content) return;

      const unmastered = localPrereqs.filter(p => !p.mastered);
      
      let initialPrompt = "";
      if (unmastered.length > 0) {
          setStage('tutoring');
          initialPrompt = `我已经掌握了部分基础，但以下概念我还不清楚：${unmastered.map(p => p.concept).join(', ')}。请使用费曼技巧逐一为我补课，每一项补习后请询问我是否理解清楚。注意：请先不要讲正文，只讲前置知识。`;
          await handleSend(initialPrompt, 'tutoring');
      } else {
          // If all mastered, go straight to Quiz
          triggerQuiz();
      }
  };

  const triggerQuiz = async () => {
      // Prioritize Vision Data
      const content = pdfDataUrl || fullText;
      if (!content || !studyMap) return;

      setStage('quiz');
      setQuizData(null); 
      setQuizSelectedOption(null);
      setQuizSubmitted(false);
      
      // No prompt sent to chat yet. We fetch quiz data.
      setIsChatLoading(true); 
      const data = await generateGatekeeperQuiz(content, studyMap.topic);
      setQuizData(data);
      setIsChatLoading(false);
  };

  const submitQuiz = () => {
      setQuizSubmitted(true);
  };

  /**
   * 正式领读开场。裁剪内容与「有效 map」均由调用方显式传入：
   * - contentOverride：页码裁剪后的小 PDF（无则走全本）；
   * - effectiveMap：本次略读真正使用的 map（重算后的新 map），不传则回退当前 studyMap 闭包。
   * 这样 studyMapBriefing 与 moduleCount、裁剪内容三者一致，不再读到「重算前」的旧地图。
   */
  const startFormalReading = async (contentOverride?: string, effectiveMap?: StudyMap | null) => {
      setStage('reading');
      const routePromise = ensureSkimReadingRoute(contentOverride, effectiveMap ?? studyMap);
      if (studyStyle === 'records') {
          await routePromise;
          return;
      }
      await handleSend(docType === 'STEM'
          ? "前置知识已确认，请输出本文的【逻辑路线图】与【核心结构】，并开始正式带读。"
          : "请生成结构化领读报告，并开始正式带读。",
      'reading', buildLectureReadingOptions(effectiveMap ?? studyMap),
      undefined, contentOverride);
      await routePromise;
  };

  const needRegenerate = onRegenerateStudyMap && (studyMapModuleCount == null || studyMapModuleCount !== selectedModuleCount);

  /**
   * 阶段4b：paper/文章「顺序陪读」开场。跳过 studyMap（不调 onRegenerateStudyMap）、不裁页码、不传 lecture readingOptions；
   * 仅切到 reading 阶段并发一条中性开场，由 PAPER/ARTICLE_COMPANION_PROMPT 的开场规则驱动「先讲整篇梗概再停下等继续」。
   */
  const startCompanionReading = async () => {
      setStage('reading');
      const routePromise = ensureSkimReadingRoute(pdfDataUrl || fullText || undefined, null);
      await handleSend(
          '请开始陪我顺序读懂这篇材料。',
          'reading',
          undefined,   // 不传 lecture readingOptions（无 module 数/节奏/briefing 后缀）
          undefined,
          undefined,   // 不裁页码，整篇喂入
      );
      await routePromise;
  };

  const handleStartWithModuleCount = async () => {
      // 阶段4b：paper/文章 → 守住「完整原文」防线 + 跳过 studyMap，直达顺序陪读
      if (skimContentType !== 'lecture') {
          // 防线：pdfDataUrl 为空时只能退回截断的 fullText → 不开讲，提示稍后重试（不关 modal、不进 reading）
          if (!pdfDataUrl) {
              setCompanionGuardNotice('📄 原文还在加载中，请稍候片刻再开始陪读');
              return;
          }
          setCompanionGuardNotice(null);
          setShowGranularityModal(false);
          await startCompanionReading();
          return;
      }
      if (pageRangeError) return; // 页码范围非法时不启动（按钮也已 disabled，此处双保险）
      setShowGranularityModal(false);

      // 先裁剪一次，得到这次略读的「唯一内容」（地图重算 + 领读对话 + 稳定路线共用同一份）
      const contentOverride = await buildPageRangeContentOverride();

      let freshMap: StudyMap | null = studyMap; // 默认沿用现有
      if (needRegenerate) {
          setIsRegeneratingMap(true);
          // 把裁剪内容传给重算；拿回新 map 直接用，不依赖 setState 后的闭包
          freshMap = (await onRegenerateStudyMap?.(selectedModuleCount, contentOverride)) ?? studyMap;
          setIsRegeneratingMap(false);
      }

      startFormalReading(contentOverride, freshMap); // 裁剪内容 + 新 map 显式传下去
  };

  const handleSkipToReading = () => {
      if (onRegenerateStudyMap) {
          setShowGranularityModal(true);
          return;
      }
      startFormalReading();
  };

  const handleStopSkimChat = () => {
      skimGenerationCancelledRef.current = true;
      skimAbortControllerRef.current?.abort();
      variantAbortControllerRef.current?.abort();
      setIsChatLoading(false);
      setVariantLoadingMessageId(null);
  };

  const handleJumpToRouteItem = (item: SkimRouteDisplayItem) => {
      const container = chatContainerRef.current;
      const node = messageRefs.current[item.messageId];
      if (!container || !node) return;
      const targetTop =
        container.scrollTop +
        node.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        12;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      setActiveRouteItemId(item.id);
  };

  const handleReturnToLatestReading = () => {
      if (latestRouteItem) handleJumpToRouteItem(latestRouteItem);
  };

  /** 仅在重开正式领读上下文时清空（编辑重发/显式 readingOptions 开场） */
  const resetReadingModuleArtifacts = () => {
      setModuleTakeaways(null);
      setTakeawaysPanelOpen(false);
      setTakeawaysSourceKey(null);
      setTakeawaysError(null);
      setKnowledgeExtractionError(null);
  };

  // “看要点”是当前对话的临时视图；切换整段式/唱片或换唱片时不能串用上一份内容。
  useEffect(() => {
      setModuleTakeaways(null);
      setTakeawaysPanelOpen(false);
      setTakeawaysSourceKey(null);
      setTakeawaysError(null);
      setKnowledgeExtractionError(null);
      setTakeawaysWriteOpen(false);
  }, [studyStyle, activeRecordCard?.id]);

  /**
   * 从任意一条 user 消息起「编辑并重发」：丢弃该条及之后所有消息，回填原文；不发请求。
   * loading 时先 `handleStopSkimChat`，避免异步仍追加 model。
   * 删除 ≥2 条时用 `window.confirm` 提示（避免误触大量删历史）。
   */
  const handleEditUserMessageAtIndex = (idx: number) => {
      if (idx < 0 || idx >= messages.length || messages[idx].role !== 'user') return;
      if (variantLoadingMessageId !== null) return;

      if (isChatLoading) {
          handleStopSkimChat();
      }

      const toDeleteCount = messages.length - idx;
      if (toDeleteCount >= 2) {
          if (!window.confirm(`将删除此后 ${toDeleteCount} 条对话，确定吗？`)) return;
      }

      const textToEdit = messages[idx].text;
      setMessages((prev) => {
          if (idx >= prev.length || prev[idx].role !== 'user') return prev;
          return prev.slice(0, idx);
      });
      resetReadingModuleArtifacts();
      setInput(textToEdit);
      requestAnimationFrame(() => {
          chatInputRef.current?.focus();
      });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      try {
          const dataURLs = await Promise.all(Array.from(files).map((file) => readFileAsDataURL(file)));
          setPendingImages((prev) => [...prev, ...dataURLs]);
      } catch (err) {
          console.error('Failed to read image(s):', err);
      } finally {
          // 清空 input.value,否则同一批文件选第二次不会触发 onChange
          e.target.value = '';
      }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      // 先收集所有 image/* 文件(剪贴板理论上可同时含多图)
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) imageFiles.push(file);
          }
      }
      if (imageFiles.length === 0) {
          // 没有图,不 preventDefault,浏览器走默认文字粘贴
          return;
      }
      // 找到至少一张图就吃掉粘贴事件,忽略附带文字(避免 OCR 工具的图+文字副产物)
      e.preventDefault();
      Promise.all(imageFiles.map((file) => readFileAsDataURL(file)))
          .then((dataUrls) => setPendingImages((prev) => [...prev, ...dataUrls]))
          .catch((err) => console.error('Failed to read pasted image(s):', err));
  };

  const handleSend = async (
      textOverride?: string,
      forceMode?: 'tutoring' | 'reading',
      readingOptions?: SkimReadingOptions,
      sendOpts?: { appendUserWhenOverride?: boolean; tutorUserText?: string },
      /** 页码范围裁剪后的小 PDF；提供时替代整本（pdfDataUrl||fullText）喂给 AI */
      contentOverride?: string
  ) => {
      const raw = textOverride ?? input;
      const trimmed = raw.trim();
      // CRITICAL: Prioritize PDF Vision Data over Text to avoid hallucination on scanned docs
      const content = contentOverride ?? (pdfDataUrl || fullText);

      if ((!trimmed && pendingImages.length === 0) || !content || isExplanationBusy) return;

      const payloadForTutor = sendOpts?.tutorUserText ?? trimmed;
      const modeToUse = forceMode || (stage === 'reading' ? 'reading' : 'tutoring');
      const usesConnectedLectureExplanation = shouldUseConnectedLectureExplanation(
        modeToUse,
        studyStyle,
        skimContentType,
        Boolean(activeRecordCard),
      );
      const explanationPageBounds = resolveSkimExplanationPageBounds(
        configuredRangeStart,
        configuredRangeEnd,
        studyStyle === 'records' ? activeRecordCard : null,
      );
      const isKnowledgeExtractionAnswer = messages.at(-1)?.skimKnowledgeExtraction === true;
      const formalResponseCount = countFormalSkimResponses(messages);
      const isFormalReadingAdvance =
        studyStyle === 'continuous' &&
        modeToUse === 'reading' &&
        isFormalSkimRouteTrigger(trimmed, formalResponseCount > 0);

      const shouldResetReadingArtifacts = forceMode === 'reading' && readingOptions != null;
      if (shouldResetReadingArtifacts) {
        // 仅正式领读开场（携带整块 readingOptions）时重置
        resetReadingModuleArtifacts();
      }

      // 本轮发送给 AI 的当前图(仅用户主动 send 路径填充,textOverride 路径保持空)
      let imagesToSend: string[] = [];

      if (!textOverride) {
          const userMsg: ChatMessage = {
              id: createSkimMessageId(),
              role: 'user',
              text: trimmed,
              ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
              timestamp: Date.now(),
          };
          setMessages(prev => [...prev, userMsg]);
          setInput('');
          if (chatInputRef.current) {
              chatInputRef.current.style.height = 'auto';
          }
          imagesToSend = pendingImages; // 快照"清空前"的图,确保本轮 AI 看得到
          setPendingImages([]);
      } else if (sendOpts?.appendUserWhenOverride) {
          const userMsg: ChatMessage = {
              id: createSkimMessageId(),
              role: 'user',
              text: trimmed,
              timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, userMsg]);
      }
      
      skimGenerationCancelledRef.current = false;
      const abortController = new AbortController();
      skimAbortControllerRef.current = abortController;
      setIsChatLoading(true);
      setExplanationGenerationError(null);

      try {
          const skimReadingOpts =
            forceMode === 'reading' && readingOptions != null
              ? readingOptions
              : modeToUse === 'reading'
                ? buildLectureReadingOptions()
                : undefined;
          const displayedHistory = usesConnectedLectureExplanation
            ? messages.map((message) => ({ ...message, text: getDisplayedSkimMessageText(message) }))
            : messages;
          let response: string;
          let explanationDraft: Awaited<ReturnType<typeof generateContinuousLectureTurn>> | null = null;
          if (usesConnectedLectureExplanation) {
            explanationDraft = await generateContinuousLectureTurn({
              // 连接式讲解必须看到原 PDF，避免页码范围裁剪后 PDF 自身从 1 重新编号。
              docContent: pdfDataUrl || content,
              history: displayedHistory,
              newMessage: payloadForTutor,
              docType,
              readingOptions: skimReadingOpts,
              depth: explanationDepth,
              pageStart: explanationPageBounds.pageStart,
              pageEnd: explanationPageBounds.pageEnd,
              turnIntent: isKnowledgeExtractionAnswer ? 'knowledge-extraction-feedback' : 'standard',
              abortSignal: abortController.signal,
              userImagesBase64: imagesToSend,
            });
            response = explanationDraft.messageMarkdown;
          } else {
            // paper/article 与辅导继续走原服务，不接入 Lecture 讲解深度协议。
            response = await chatWithSkimAdaptiveTutor(
              content,
              displayedHistory,
              payloadForTutor,
              modeToUse,
              docType,
              skimReadingOpts,
              abortController.signal,
              imagesToSend,
              skimContentType
            );
          }
          if (abortController.signal.aborted || skimGenerationCancelledRef.current) return;
          const normalizedResponse = normalizeGeneratedLineBreaks(response);
          const messageId = createSkimMessageId();
          const latestParentNumber = routeOutlineItems
            .filter((item) => isTopLevelReadingKind(item.kind))
            .at(-1)?.number ?? undefined;
          const anchors = isFormalReadingAdvance
            ? resolveFormalSkimReadingAnchors({
                text: normalizedResponse,
                messageId,
                contentType: skimContentType,
                skimPace,
                readingRoute,
                existingItems: routeOutlineItems,
                currentParentNumber: latestParentNumber ?? undefined,
              })
            : [];
          const aiMsg: ChatMessage = {
              id: messageId,
              role: 'model',
              text: normalizedResponse,
              timestamp: Date.now(),
              ...(isFormalReadingAdvance ? {
                  skimReadingFormal: true,
                  skimReadingAnchors: anchors,
              } : {}),
              ...(explanationDraft?.responseKind === 'explanation' ? {
                skimExplanation: createSkimExplanationState(
                  { ...explanationDraft, messageMarkdown: normalizedResponse },
                  explanationDepth,
                ),
              } : {}),
              ...(isKnowledgeExtractionAnswer ? { skimKnowledgeExtractionFeedback: true } : {}),
          };
          setMessages(prev => [...prev, aiMsg]);
      } catch (e) {
          if (abortController.signal.aborted || skimGenerationCancelledRef.current) return;
          const isAbort =
              e instanceof DOMException && e.name === 'AbortError'
              || (typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError');
          if (isAbort) return;
          console.error(e);
          if (usesConnectedLectureExplanation) {
            setExplanationGenerationError('这次连接式讲解没有通过内容或页码校验。原对话没有被覆盖，可以重试。');
          }
      } finally {
          setIsChatLoading(false);
          if (skimAbortControllerRef.current === abortController) {
              skimAbortControllerRef.current = null;
          }
      }
  };

  const handleSelectExplanationVariant = (
    messageId: string,
    key: SkimExplanationVariantKey,
  ) => {
    if (isExplanationBusy) return;
    setMessages((previous) => previous.map((message, index) => (
      getStableMessageId(message, index) === messageId
        ? withActiveSkimExplanationVariant(message, key)
        : message
    )));
  };

  const handleBootstrapLegacyRecordExplanation = async (
    messageId: string,
    targetDepth: SkimExplanationDepth,
    targetStyle: SkimExplanationStyle,
  ) => {
    if (
      isExplanationBusy
      || studyStyle !== 'records'
      || skimContentType !== 'lecture'
      || stage !== 'reading'
      || !activeRecordCard
    ) return;
    const messageIndex = messages.findIndex((message, index) => getStableMessageId(message, index) === messageId);
    const sourceMessage = messageIndex >= 0 ? messages[messageIndex] : null;
    if (!sourceMessage || !isLegacyRecordExplanationCandidate(sourceMessage)) return;
    const content = pdfDataUrl || fullText;
    if (!content) {
      setVariantErrors((previous) => ({ ...previous, [messageId]: '原 PDF 尚未就绪，暂时不能生成另一个讲法。' }));
      return;
    }

    const abortController = new AbortController();
    variantAbortControllerRef.current = abortController;
    setVariantLoadingMessageId(messageId);
    setVariantErrors((previous) => {
      const next = { ...previous };
      delete next[messageId];
      return next;
    });
    try {
      const draft = await generateLegacyRecordExplanationVariant({
        docContent: content,
        legacyMessageMarkdown: sourceMessage.text,
        targetDepth,
        targetStyle,
        pageStart: activeRecordCard.pageStart,
        pageEnd: activeRecordCard.pageEnd,
        recordTitle: activeRecordCard.title,
        abortSignal: abortController.signal,
      });
      if (abortController.signal.aborted) return;
      const normalizedDraft = {
        ...draft,
        messageMarkdown: normalizeGeneratedLineBreaks(draft.messageMarkdown),
      };
      setMessages((previous) => previous.map((message, index) => {
        if (
          getStableMessageId(message, index) !== messageId
          || !isLegacyRecordExplanationCandidate(message)
        ) return message;
        return {
          ...message,
          skimExplanation: createSkimExplanationStateFromLegacyMessage(
            message.text,
            normalizedDraft,
            targetDepth,
            targetStyle,
          ),
        };
      }));
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
        || (typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === 'AbortError');
      if (!isAbort) {
        console.error(error);
        setVariantErrors((previous) => ({
          ...previous,
          [messageId]: '这条旧唱片讲解暂时没有建立好内容骨架。原消息不受影响，可以重试。',
        }));
      }
    } finally {
      if (variantAbortControllerRef.current === abortController) {
        variantAbortControllerRef.current = null;
      }
      setVariantLoadingMessageId((current) => current === messageId ? null : current);
    }
  };

  const handleGenerateExplanationVariant = async (
    messageId: string,
    targetDepth: SkimExplanationDepth,
    targetStyle: SkimExplanationStyle,
  ) => {
    if (
      isExplanationBusy
      || !shouldUseConnectedLectureExplanation('reading', studyStyle, skimContentType, Boolean(activeRecordCard))
      || stage !== 'reading'
    ) return;
    const targetKey = getSkimExplanationVariantKey(targetDepth, targetStyle);
    const messageIndex = messages.findIndex((message, index) => getStableMessageId(message, index) === messageId);
    const sourceMessage = messageIndex >= 0 ? messages[messageIndex] : null;
    const explanation = sourceMessage?.skimExplanation;
    if (!explanation) return;
    if (explanation.variants[targetKey]) {
      handleSelectExplanationVariant(messageId, targetKey);
      return;
    }
    const content = pdfDataUrl || fullText;
    if (!content) {
      setVariantErrors((previous) => ({ ...previous, [messageId]: '原 PDF 尚未就绪，暂时不能生成另一个讲法。' }));
      return;
    }

    const abortController = new AbortController();
    variantAbortControllerRef.current = abortController;
    setVariantLoadingMessageId(messageId);
    setVariantErrors((previous) => {
      const next = { ...previous };
      delete next[messageId];
      return next;
    });
    try {
      const explanationPageBounds = resolveSkimExplanationPageBounds(
        configuredRangeStart,
        configuredRangeEnd,
        studyStyle === 'records' ? activeRecordCard : null,
      );
      const draft = await generateContinuousLectureVariant({
        docContent: content,
        explanation,
        targetDepth,
        targetStyle,
        pageStart: explanationPageBounds.pageStart,
        pageEnd: explanationPageBounds.pageEnd,
        ...(studyStyle === 'records' && activeRecordCard ? {
          recordScope: {
            title: activeRecordCard.title,
            pageStart: activeRecordCard.pageStart,
            pageEnd: activeRecordCard.pageEnd,
          },
        } : {}),
        abortSignal: abortController.signal,
      });
      if (abortController.signal.aborted) return;
      setMessages((previous) => previous.map((message, index) => {
        if (getStableMessageId(message, index) !== messageId || !message.skimExplanation) return message;
        const current = message.skimExplanation;
        const normalizedMarkdown = normalizeGeneratedLineBreaks(draft.messageMarkdown);
        const pageRefs = Array.from(new Set(draft.pageRefs)).sort((a, b) => a - b);
        return {
          ...message,
          skimExplanation: {
            ...current,
            activeVariantKey: targetKey,
            sourcePageRefs: Array.from(new Set([...current.sourcePageRefs, ...pageRefs])).sort((a, b) => a - b),
            variants: {
              ...current.variants,
              [targetKey]: {
                key: targetKey,
                depth: targetDepth,
                style: targetStyle,
                messageMarkdown: normalizedMarkdown,
                coveredSpineItemIds: draft.coveredSpineItemIds,
                deferredSpineItemIds: draft.deferredSpineItemIds,
                pageRefs,
                createdAt: Date.now(),
              },
            },
          },
        };
      }));
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
        || (typeof error === 'object' && error !== null && 'name' in error && (error as { name: string }).name === 'AbortError');
      if (!isAbort) {
        console.error(error);
        setVariantErrors((previous) => ({
          ...previous,
          [messageId]: '这个版本没有通过内容或页码校验。原版本仍然保留，可以重试。',
        }));
      }
    } finally {
      if (variantAbortControllerRef.current === abortController) {
        variantAbortControllerRef.current = null;
      }
      setVariantLoadingMessageId((current) => current === messageId ? null : current);
    }
  };

  useEffect(() => {
      if (studyStyle !== 'records' || recordDeck?.view !== 'reader' || !activeRecordCard) {
          recordOpeningStartedRef.current = null;
          return;
      }
      if (messages.length > 0) {
          recordOpeningStartedRef.current = activeRecordCard.id;
          return;
      }
      if (isChatLoading || recordOpeningStartedRef.current === activeRecordCard.id) return;

      recordOpeningStartedRef.current = activeRecordCard.id;
      const levelLabel = activeRecordCard.partIndex == null
        ? `Module ${activeRecordCard.moduleIndex}`
        : `Module ${activeRecordCard.moduleIndex} 的 Part ${activeRecordCard.partIndex}`;
      void handleSend(
        `请开始这张唱片的正式领读。当前范围是${levelLabel}「${activeRecordCard.title}」，应用内第 ${activeRecordCard.pageStart}-${activeRecordCard.pageEnd} 页。先说明这段在整份 Lecture 中的位置，再开始讲当前唱片；不要越过本唱片范围，也不要一次讲下一张唱片。`,
        'reading',
        buildLectureReadingOptions(),
        { appendUserWhenOverride: false }
      );
  }, [activeRecordCard?.id, messages.length, recordDeck?.view, studyStyle]);

  const handleShowTakeaways = async () => {
      if (messages.length === 0 || isExplanationBusy) return;
      const recordTakeawayScope = studyStyle === 'records' && activeRecordCard
        ? {
            id: activeRecordCard.id,
            title: activeRecordCard.title,
            pageStart: activeRecordCard.pageStart,
            pageEnd: activeRecordCard.pageEnd,
          }
        : null;
      const takeawayPageStart = recordTakeawayScope ? recordTakeawayScope.pageStart : configuredRangeStart;
      const takeawayPageEnd = recordTakeawayScope
        ? recordTakeawayScope.pageEnd
        : Math.max(configuredRangeStart, configuredRangeEnd || configuredRangeStart);
      const sourceKey = messages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => (
          message.role === 'model'
          && !message.skimKnowledgeExtraction
          && !message.skimKnowledgeExtractionFeedback
        ))
        .map(({ message, index }) => `${getStableMessageId(message, index)}:${message.skimExplanation?.activeVariantKey ?? 'base'}`)
        .join('|');
      const scopedSourceKey = `${recordTakeawayScope ? `record:${recordTakeawayScope.id}` : 'continuous'}|${sourceKey}`;
      setTakeawaysPanelOpen(true);
      setTakeawaysError(null);
      setKnowledgeExtractionError(null);
      if (moduleTakeaways && takeawaysSourceKey === scopedSourceKey) return;
      setTakeawaysLoading(true);
      setModuleTakeaways(null);
      try {
          const list = await generateModuleTakeaways(messages, docType, {
              pageStart: takeawayPageStart,
              pageEnd: takeawayPageEnd,
              ...(recordTakeawayScope ? {
                recordScope: {
                  title: recordTakeawayScope.title,
                  pageStart: recordTakeawayScope.pageStart,
                  pageEnd: recordTakeawayScope.pageEnd,
                },
              } : {}),
          });
          if (list.length === 0) {
              setTakeawaysError('暂时没有整理出可靠要点。再读一小段后可以重试。');
              return;
          }
          setModuleTakeaways(list);
          setTakeawaysSourceKey(scopedSourceKey);
          nextTakeawaysDraftIdRef.current += 1;
          const draftId = nextTakeawaysDraftIdRef.current;
          setTakeawaysDrafts((prev) => ({ ...prev, [draftId]: '' }));
          setActiveTakeawaysDraftId(draftId);
          setTakeawaysWriteOpen(false);
      } catch (e) {
          console.error(e);
          setTakeawaysError('这次没有整理成功，原对话不会受影响，可以重试。');
      } finally {
          setTakeawaysLoading(false);
      }
  };

  const handleStartKnowledgeExtraction = async () => {
      if (!moduleTakeaways || isExplanationBusy) return;
      setKnowledgeExtractionLoading(true);
      setKnowledgeExtractionError(null);
      try {
          const prompt = await generateModuleKnowledgeExtraction(moduleTakeaways);
          if (!prompt) {
              setKnowledgeExtractionError('这次没有生成出合适的小题，可以再试一次。');
              return;
          }
          setTakeawaysPanelOpen(false);
          setMessages((previous) => [...previous, {
              id: createSkimMessageId(),
              role: 'model',
              text: prompt,
              timestamp: Date.now(),
              skimKnowledgeExtraction: true,
          }]);
      } catch (e) {
          console.error(e);
          setKnowledgeExtractionError('这次没有生成出合适的小题，可以再试一次。');
      } finally {
          setKnowledgeExtractionLoading(false);
      }
  };

  const updateTakeawaysDraft = (value: string) => {
      if (activeTakeawaysDraftId == null) return;
      const id = activeTakeawaysDraftId;
      setTakeawaysDrafts((prev) => ({ ...prev, [id]: value }));
  };

  const handleUploadTakeawaysDraft = () => {
      if (!onNotebookAdd || activeTakeawaysDraftId == null) return;
      const body = takeawaysDraftText.trim();
      if (!body) return;
      const topicLine = studyMap?.topic ? ` · ${studyMap.topic}` : '';
      onNotebookAdd(`【本模块自整理】${topicLine}\n${body}`, 'skim');
      setNotebookDraftHint(true);
      if (notebookHintTimerRef.current != null) {
        window.clearTimeout(notebookHintTimerRef.current);
      }
      notebookHintTimerRef.current = window.setTimeout(() => {
        setNotebookDraftHint(false);
        notebookHintTimerRef.current = null;
      }, 1500);
  };

  const handleSendDraftToGuide = async () => {
      const body = takeawaysDraftText.trim();
      if (!body || isChatLoading) return;
      if (draftToGuideLockRef.current) return;
      draftToGuideLockRef.current = true;
      try {
        const payloadForTutor = `${SKIM_DRAFT_GUIDE_PREFIX}\n\n${body}`;
        await handleSend(body, undefined, undefined, {
          appendUserWhenOverride: true,
          tutorUserText: payloadForTutor,
        });
      } finally {
        draftToGuideLockRef.current = false;
      }
  };

  const handleClearTakeawaysDraft = () => {
      if (activeTakeawaysDraftId == null) return;
      if (!window.confirm('确定清空本块自整理草稿？此操作不可撤销。')) return;
      const id = activeTakeawaysDraftId;
      setTakeawaysDrafts((prev) => ({ ...prev, [id]: '' }));
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white border-l border-stone-100">
        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-100 to-teal-50 rounded-2xl flex items-center justify-center animate-bounce mb-6 shadow-indigo-100 shadow-lg">
           <Map className="w-8 h-8 text-indigo-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">正在扫描文档基因...</h3>
        <p className="text-sm text-slate-400 text-center max-w-[240px] leading-relaxed">正在进行预飞检查，识别前置知识与逻辑架构。</p>
      </div>
    );
  }

  if (studyStyle === 'case' && caseLearning?.status === 'suitable' && onCaseLearningChange) {
    return (
      <LectureCaseWorkspace
        state={caseLearning}
        setState={onCaseLearningChange}
        pageTexts={pdfPageTexts}
        onJumpToPage={onJumpToPage}
        onExitToConfig={() => {
          onStudyStyleChange('continuous');
          setStage('diagnosis');
        }}
        onLoadingChange={onLoadingChange}
      />
    );
  }

  if (studyStyle === 'records' && recordDeck?.view === 'shelf') {
    const cards = recordDeck.orderedCardIds.map((id) => recordDeck.cards[id]).filter(Boolean);
    const completedCount = cards.filter((card) => card.status === 'completed').length;
    const inProgressCount = cards.filter((card) => card.status === 'in_progress').length;
    return (
      <div className="flex h-full flex-col border-l border-stone-100 bg-white">
        <div className="border-b border-stone-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600">
              <Library className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">Lecture 唱片架</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">选一段再进入原来的 PDF 与领读界面</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 py-8">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/55 p-5">
            <p className="text-xs font-black uppercase text-indigo-600">这次的分段</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{cards.length} 张唱片</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-white px-2 py-3">
                <p className="text-lg font-black text-slate-800">{cards.length - completedCount - inProgressCount}</p>
                <p className="text-[10px] font-bold text-slate-400">未开始</p>
              </div>
              <div className="rounded-md bg-white px-2 py-3">
                <p className="text-lg font-black text-amber-600">{inProgressCount}</p>
                <p className="text-[10px] font-bold text-slate-400">学习中</p>
              </div>
              <div className="rounded-md bg-white px-2 py-3">
                <p className="text-lg font-black text-emerald-600">{completedCount}</p>
                <p className="text-[10px] font-bold text-slate-400">已学完</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              从左侧横向浏览唱片。打开后会恢复那一段自己的页码、对话和未解决问题；切换唱片不会串台。
            </p>
          </div>
          {routeError && (
            <p className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{routeError}</p>
          )}
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={handleReplanReadingRoute}
              disabled={isGeneratingRoute || isChatLoading || !onReadingRouteChange || !(pdfDataUrl || fullText) || !!pageRangeError}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-indigo-200 bg-white px-4 py-3 text-sm font-black text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {isGeneratingRoute ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新规划唱片
            </button>
            <button
              type="button"
              onClick={() => onStudyStyleChange('continuous')}
              disabled={isGeneratingRoute || isChatLoading}
              className="rounded-md bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
            >
              切回整段式学习
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full bg-[#fffefb] border-l border-stone-100 flex flex-col relative overflow-hidden">
      
      {/* Selection Popover */}
      {selectionRect && (
        <div 
            className="fixed z-[100] transform -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150 flex items-center space-x-2"
            style={{ top: selectionRect.top, left: selectionRect.left }}
        >
            <button
                onMouseDown={handleAddToNotebook}
                className="flex items-center space-x-1 bg-indigo-600 text-white px-3 py-1.5 rounded-full shadow-2xl ring-4 ring-white/50 hover:bg-indigo-700 hover:scale-105 transition-all cursor-pointer"
                title="保存到领读笔记"
            >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="text-xs font-bold whitespace-nowrap ml-1">记领读笔记</span>
            </button>
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-indigo-600 absolute left-1/2 -translate-x-1/2 -bottom-2 pointer-events-none"></div>
        </div>
      )}

      {/* 1. TOP AREA: Diagnosis / Status / Quiz / compact reading route */}
      {(stage === 'quiz' || stage !== 'reading' || !focusMode) && (
      <div style={statusPanelStyle} className={`${stage === 'reading' ? 'shrink-0 bg-white' : 'overflow-y-auto custom-scrollbar bg-stone-50/30'} relative flex flex-col transition-all duration-500`}>
        <div className={`${stage === 'reading' ? 'p-5' : 'p-4 sticky top-0'} bg-white/95 backdrop-blur-sm z-10 border-b border-stone-100 flex items-center justify-between shrink-0 shadow-sm`}>
            <div className="flex items-center space-x-2">
                <div className={`p-1.5 rounded-lg transition-colors ${
                    stage === 'diagnosis' ? 'bg-amber-100 text-amber-600' :
                    stage === 'tutoring' ? 'bg-rose-100 text-rose-600' : 
                    stage === 'quiz' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                    {stage === 'diagnosis' ? <Map className="w-4 h-4" /> :
                     stage === 'tutoring' ? <BrainCircuit className="w-4 h-4" /> :
                     stage === 'quiz' ? <ShieldAlert className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                </div>
                <div className="flex flex-col">
                   {/* UNIFIED TITLE */}
                   <h2 className="font-bold text-slate-800 text-base leading-tight">📖 智能导读</h2>
                   
                   {/* SIMPLE STATUS BADGE */}
                   <div className="flex items-center mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        stage === 'diagnosis' ? 'bg-amber-50 text-amber-600' :
                        stage === 'tutoring' ? 'bg-rose-50 text-rose-600' :
                        stage === 'quiz' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                          {stage === 'diagnosis' && (skipDiagnosis && !studyMap ? "待配置" : "全书扫描中...")}
                          {stage === 'tutoring' && "AI 补习中"}
                          {stage === 'quiz' && "知识点确认"}
                          {stage === 'reading' && "正在领读"}
                      </span>
                   </div>
                </div>
            </div>
            
            {/* Doc Mode Toggle (Only Visible in Reading) */}
            {stage === 'reading' && (
                <button 
                    onClick={onToggleDocType}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center space-x-1 transition-colors border ${
                        docType === 'STEM' 
                        ? 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100' 
                        : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'
                    }`}
                    title="切换导读模式"
                >
                    {docType === 'STEM' ? <FlaskConical className="w-3 h-3" /> : <Feather className="w-3 h-3" />}
                    <span>{docType === 'STEM' ? '理科模式' : '社科模式'}</span>
                </button>
            )}
        </div>
        
        <div className={`${stage === 'reading' ? 'p-3' : 'p-6'} space-y-6 flex-1`}>
            {/* STAGE: DIAGNOSIS — 方案 A：新建段（skipDiagnosis 且尚无 studyMap）跳过诊断，直接进配置区。
                map 留到点「开始领读」时由 handleStartWithModuleCount→onRegenerateStudyMap 按所选范围生成。 */}
            {stage === 'diagnosis' && !studyMap && skipDiagnosis && onRegenerateStudyMap && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm space-y-4">
                        <div className="flex items-start space-x-3">
                            <Rocket className="w-5 h-5 text-indigo-400 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-slate-700">配置这段领读</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {skimContentType === 'lecture'
                                        ? '选模块数、节奏与页码范围，点「开始领读」即按所选范围生成本段学习地图并开始。'
                                        : '将从头开始顺序陪读整篇，点「开始领读」即可（AI 会先讲整篇梗概再停下等你说「继续」）。'}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            {contentTypeSelector}
                            {studyStyleSelector}
                            {auxiliaryMaterialSelector}
                            {/* 阶段4b：module 数/节奏/页码范围仅 lecture 模式显示；paper/文章走顺序陪读，无这些概念 */}
                            {skimContentType === 'lecture' && (
                              <>
                            <label className="text-xs text-stone-500 mb-1">用几个模块解读本文（2～7）</label>
                            <select
                                value={selectedModuleCount}
                                onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
                                className="w-full py-2.5 rounded-xl border-2 border-stone-200 focus:border-indigo-300 px-4 text-slate-700 text-sm font-medium bg-white"
                            >
                                {MODULE_OPTIONS.map((n) => (
                                    <option key={n} value={n}>{n} 个模块</option>
                                ))}
                            </select>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-stone-500">节奏</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="skim-pace-fresh"
                                            value="module"
                                            checked={skimPace === 'module'}
                                            onChange={() => setSkimPace('module')}
                                            className="accent-indigo-600"
                                        />
                                        <span className="text-sm text-slate-700">一次一个 module</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="skim-pace-fresh"
                                            value="part"
                                            checked={skimPace === 'part'}
                                            onChange={() => setSkimPace('part')}
                                            className="accent-indigo-600"
                                        />
                                        <span className="text-sm text-slate-700">一次一个 part</span>
                                    </label>
                                </div>
                            </div>
                            <PageRangeInput
                                start={pageRangeStart}
                                end={pageRangeEnd}
                                onStartChange={setPageRangeStart}
                                onEndChange={setPageRangeEnd}
                                totalPages={totalPages}
                                idPrefix="skim-fresh"
                            />
                              </>
                            )}
                            {skimContentType !== 'lecture' && companionGuardNotice && (
                                <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    {companionGuardNotice}
                                </p>
                            )}
                            <button
                                onClick={handleStartWithModuleCount}
                                disabled={skimContentType === 'lecture' && !!pageRangeError}
                                className="w-full py-3 mt-1 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                开始领读
                            </button>
                            {/* 私教模式入口：不走略读那套（无地图/阶段/页码），切到 App 的独立 tutor viewMode */}
                            {onStartTutorMode && (
                                <button
                                    type="button"
                                    onClick={onStartTutorMode}
                                    className="w-full py-3 bg-white text-indigo-700 border-2 border-indigo-200 rounded-xl font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    私教模式（纯对话）
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STAGE: DIAGNOSIS (Checklist) */}
            {stage === 'diagnosis' && studyMap && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="mb-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">主题领域 (Topic)</h3>
                        <p className="text-lg font-extrabold text-slate-800">{studyMap.topic}</p>
                    </div>
                    
                    <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm space-y-4">
                        <div className="flex items-start space-x-3">
                            <HelpCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-slate-700">阅读前准备</p>
                                <p className="text-xs text-slate-400 mt-0.5">勾选你已掌握的概念。没勾选的部分我会为你快速补课。</p>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            {localPrereqs.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => togglePrereq(p.id)}
                                    className={`w-full flex items-center space-x-3 p-3 rounded-xl border transition-all text-left ${
                                        p.mastered 
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                        : 'bg-stone-50 border-stone-200 text-slate-600 hover:border-indigo-200'
                                    }`}
                                >
                                    <div className={`shrink-0 transition-colors ${p.mastered ? 'text-emerald-500' : 'text-stone-300'}`}>
                                        <CheckCircle2 className={`w-5 h-5 ${p.mastered ? 'fill-emerald-100' : ''}`} />
                                    </div>
                                    <span className="text-sm font-bold">{p.concept}</span>
                                </button>
                            ))}
                        </div>
                        
                        <div className="space-y-3 pt-2">
                            <button
                                onClick={startAdaptiveLearning}
                                className="w-full py-3 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-700 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                            >
                                <Rocket className="w-4 h-4" />
                                <span>{localPrereqs.every(p => p.mastered) ? "开始挑战 (Quiz)" : "开始自适应补习"}</span>
                            </button>
                            
                            {/* SKIP BUTTON */}
                            <button
                                onClick={handleSkipToReading}
                                className="w-full py-2.5 bg-white border border-stone-200 text-stone-500 rounded-xl text-xs font-bold hover:bg-stone-50 hover:text-stone-700 transition-all flex items-center justify-center space-x-2"
                            >
                                <SkipForward className="w-3.5 h-3.5" />
                                <span>我已掌握，直接开始全文导读</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STAGE: TUTORING */}
            {stage === 'tutoring' && (
                <div className="animate-in fade-in">
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-4 flex items-start space-x-3">
                        <BrainCircuit className="w-5 h-5 text-rose-500 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-rose-700">递归补习中...</h4>
                            <p className="text-xs text-rose-600 mt-1">AI 正在为你讲解未掌握的前置知识。当你觉得都懂了，点击下方按钮开始挑战。</p>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <button
                            onClick={triggerQuiz}
                            className="w-full py-3 bg-white border-2 border-slate-800 text-slate-800 rounded-xl text-sm font-bold hover:bg-slate-800 hover:text-white transition-all flex items-center justify-center space-x-2 shadow-sm"
                        >
                            <span>我准备好接受挑战了</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>

                         {/* SKIP BUTTON (Tutoring) */}
                        <button
                            onClick={handleSkipToReading}
                            className="w-full py-2 text-stone-400 text-xs font-bold hover:text-stone-600 transition-colors flex items-center justify-center"
                        >
                            跳过所有，直接开始阅读
                        </button>
                    </div>
                </div>
            )}

            {/* STAGE: QUIZ */}
            {stage === 'quiz' && (
                <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto animate-in zoom-in-95 duration-500 relative">
                    {/* Skip Button (Quiz - Top Right) */}
                    <button
                        onClick={handleSkipToReading}
                        className="absolute -top-10 right-0 text-stone-400 hover:text-slate-600 text-xs font-bold flex items-center space-x-1 px-3 py-1.5 rounded-full hover:bg-stone-100 transition-all"
                    >
                        <span>跳过测验</span>
                        <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    {!quizData ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                <ShieldAlert className="w-8 h-8 text-violet-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">生成逻辑挑战中...</h3>
                            <p className="text-sm text-slate-400">正在生成针对前置知识的逻辑推导题 (Logic Gatekeeper)。</p>
                            <button
                                onClick={handleSkipToReading}
                                className="mt-4 text-xs text-violet-500 hover:text-violet-700 underline font-medium"
                            >
                                不等了，直接开始
                            </button>
                        </div>
                    ) : (
                        <div className="w-full bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
                            <div className="bg-slate-800 p-6 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3"></div>
                                <div className="flex items-center space-x-2 mb-2 opacity-80">
                                    <ShieldAlert className="w-4 h-4" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Logic Gatekeeper Quiz</span>
                                </div>
                                <h3 className="text-lg font-bold leading-snug">{quizData.question}</h3>
                            </div>

                            <div className="p-6 space-y-3">
                                {quizData.options.map((opt, idx) => {
                                    const isSelected = quizSelectedOption === idx;
                                    const isCorrect = idx === quizData.correctIndex;
                                    const showResult = quizSubmitted;
                                    
                                    let btnClass = "border-stone-200 hover:border-violet-300 hover:bg-violet-50 text-slate-600";
                                    if (isSelected) btnClass = "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-500";
                                    
                                    if (showResult) {
                                        if (isCorrect) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500";
                                        else if (isSelected && !isCorrect) btnClass = "border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500 opacity-60";
                                        else btnClass = "border-stone-100 text-stone-300 opacity-50";
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            disabled={quizSubmitted}
                                            onClick={() => setQuizSelectedOption(idx)}
                                            className={`w-full text-left p-4 rounded-xl border transition-all text-sm font-medium flex items-center justify-between group ${btnClass}`}
                                        >
                                            <span>{opt}</span>
                                            {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                            {showResult && isSelected && !isCorrect && <AlertCircle className="w-5 h-5 text-rose-500" />}
                                        </button>
                                    );
                                })}

                                {!quizSubmitted ? (
                                    <button
                                        onClick={submitQuiz}
                                        disabled={quizSelectedOption === null}
                                        className="w-full mt-4 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-200"
                                    >
                                        提交答案
                                    </button>
                                ) : (
                                    <div className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                                        <div className={`p-4 rounded-xl mb-4 text-sm leading-relaxed ${
                                            quizSelectedOption === quizData.correctIndex ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                                        }`}>
                                            <div className="font-bold mb-1 flex items-center">
                                                <Lightbulb className="w-4 h-4 mr-2" />
                                                {quizSelectedOption === quizData.correctIndex ? "回答正确！🎉" : "逻辑有误"}
                                            </div>
                                            {quizData.explanation}
                                        </div>
                                        {onRegenerateStudyMap && quizSelectedOption === quizData.correctIndex ? (
                                            <>
                                                <p className="text-xs font-bold text-stone-500 mb-2">选择模块数</p>
                                                {isRegeneratingMap ? (
                                                    <div className="flex items-center justify-center gap-2 py-4 text-stone-500 text-sm">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        <span>正在按所选模块数重新划分…</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-2">
                                                        {studyStyleSelector}
                                                        {auxiliaryMaterialSelector}
                                                        <label className="text-xs text-stone-500 mb-1">用几个模块解读本文（2～7）</label>
                                                        <select
                                                            value={selectedModuleCount}
                                                            onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
                                                            className="w-full py-2.5 rounded-xl border-2 border-stone-200 focus:border-indigo-300 px-4 text-slate-700 text-sm font-medium bg-white"
                                                        >
                                                            {MODULE_OPTIONS.map((n) => (
                                                                <option key={n} value={n}>{n} 个模块</option>
                                                            ))}
                                                        </select>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-xs text-stone-500">节奏</label>
                                                            <div className="flex gap-4">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name="skim-pace-quiz"
                                                                        value="module"
                                                                        checked={skimPace === 'module'}
                                                                        onChange={() => setSkimPace('module')}
                                                                        className="accent-indigo-600"
                                                                    />
                                                                    <span className="text-sm text-slate-700">一次一个 module</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name="skim-pace-quiz"
                                                                        value="part"
                                                                        checked={skimPace === 'part'}
                                                                        onChange={() => setSkimPace('part')}
                                                                        className="accent-indigo-600"
                                                                    />
                                                                    <span className="text-sm text-slate-700">一次一个 part</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                        <PageRangeInput
                                                            start={pageRangeStart}
                                                            end={pageRangeEnd}
                                                            onStartChange={setPageRangeStart}
                                                            onEndChange={setPageRangeEnd}
                                                            totalPages={totalPages}
                                                            idPrefix="skim-quiz"
                                                        />
                                                        <button
                                                            onClick={handleStartWithModuleCount}
                                                            disabled={!!pageRangeError}
                                                            className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center space-x-2 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <span>{needRegenerate ? '按此模块数重新生成并开始领读' : '开始领读'}</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => startFormalReading()}
                                                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all flex items-center justify-center space-x-2 shadow-xl"
                                            >
                                                {quizSelectedOption === quizData.correctIndex ? <Lock className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                                                <span>确认开始正式学习</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STAGE: READING */}
            {stage === 'reading' && studyStyle === 'continuous' && studyMap && skimContentType === 'lecture' && (
                <div className="animate-in fade-in">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <Map className="w-4 h-4 text-indigo-600 shrink-0" />
                                    <h4 className="text-xs font-bold text-indigo-700">当前领读路线</h4>
                                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-indigo-600 border border-indigo-100">
                                        {selectedModuleCount} 个 module
                                    </span>
                                </div>
                                <p className="mt-1 mb-0 text-sm font-bold text-slate-800 leading-snug truncate">
                                    {studyMap.topic || '按当前资料结构带你读'}
                                </p>
                                <p className="mt-1 mb-0 text-xs text-slate-500">
                                    {pageRangeLabel} · {skimPace === 'part' ? '按 part 推进' : '按 module 推进'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRouteBriefingOpen((v) => !v)}
                                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                                aria-expanded={routeBriefingOpen}
                            >
                                <span>{routeBriefingOpen ? '收起' : '查看路线'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${routeBriefingOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        {routeBriefingOpen && (
                            <div className="mt-3 rounded-lg bg-white/80 border border-indigo-100 p-3 animate-in fade-in slide-in-from-top-1">
                                <p className="m-0 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                                    {studyMap.initialBriefing}
                                </p>
                            </div>
                        )}
                    </div>
                    {localPrereqs.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {localPrereqs.map(p => (
                                <div key={p.id} className="text-[10px] font-bold px-2 py-1 rounded-full border bg-emerald-50 border-emerald-100 text-emerald-600">
                                    ✓ {p.concept}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
      )}

      {/* DRAGGABLE SPLITTER (Hidden in Quiz / Focus / compact Reading mode) */}
      {stage !== 'quiz' && stage !== 'reading' && !focusMode && (
          <div 
            onMouseDown={startResize}
            className="h-2 bg-stone-100 border-y border-stone-200 cursor-row-resize flex items-center justify-center hover:bg-indigo-50 transition-colors z-40 shrink-0 select-none group"
          >
             <div className="w-10 h-0.5 rounded-full bg-stone-300 group-hover:bg-indigo-400"></div>
          </div>
      )}

      {/* 2. BOTTOM HALF: Chat (Hidden in Quiz Mode) */}
      {stage !== 'quiz' && (
      <div className="flex-1 flex flex-col min-h-0 bg-white relative z-20">
        <div className="p-4 border-b border-stone-50 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center space-x-2">
                <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                    <Bot className="w-4 h-4" />
                </div>
                <div>
                    <span className="font-bold text-slate-700 text-sm">
                        {stage === 'tutoring' ? 'AI 补习助手' : '深度领读'}
                    </span>
                    {stage === 'reading' && (
                        <p className="text-[11px] text-slate-400 mt-0.5">跟着主线读，卡住再问。</p>
                    )}
                </div>
            </div>
            {stage === 'reading' && (
              <div className="flex items-center gap-1.5">
                {(studyStyle === 'continuous' || (studyStyle === 'records' && activeRecordCard)) && skimContentType === 'lecture' && (
                  <div className="flex items-center gap-1 rounded-xl border border-indigo-100 bg-indigo-50/60 p-1" aria-label="讲解深度">
                    <span className="hidden px-1 text-[10px] font-bold text-indigo-500 xl:inline">讲解深度</span>
                    {(['simple', 'normal'] as const).map((depth) => (
                      <button
                        key={depth}
                        type="button"
                        onClick={() => onExplanationDepthChange(depth)}
                        disabled={isExplanationBusy}
                        aria-pressed={explanationDepth === depth}
                        title="只影响之后新生成的讲解，已有消息不会自动改变"
                        className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${explanationDepth === depth
                          ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                          : 'text-slate-500 hover:bg-white/70 hover:text-indigo-600'
                        }`}
                      >
                        {depth === 'simple' ? '简单讲' : '正常讲'}
                      </button>
                    ))}
                  </div>
                )}
                {activeRecordCard && (
                  <button
                    type="button"
                    onClick={onOpenRecordShelf}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    <Library className="h-3.5 w-3.5" />
                    <span>唱片架</span>
                  </button>
                )}
                {(studyStyle === 'continuous' || (studyStyle === 'records' && activeRecordCard)) && skimContentType === 'lecture' && (
                  <button
                      type="button"
                      onClick={() => void handleShowTakeaways()}
                      disabled={isExplanationBusy || messages.length === 0}
                      title={messages.length === 0
                        ? '开始领读后可以看要点'
                        : studyStyle === 'records'
                          ? '回看当前唱片已经讲过的内容'
                          : '回看当前领读已经讲过的内容'}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                      {takeawaysLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />}
                      <span>看要点</span>
                  </button>
                )}
                <button
                    type="button"
                    onClick={() => setFocusMode((v) => !v)}
                    title={focusMode ? '退出放大领读' : '放大领读'}
                    aria-label={focusMode ? '退出放大领读' : '放大领读'}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                >
                    {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            )}
        </div>

        {activeRecordCard && (
          <div className="shrink-0 border-b border-indigo-100 bg-indigo-50/45 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-indigo-600">
                  Module {activeRecordCard.moduleIndex}{activeRecordCard.partIndex == null ? '' : ` · Part ${activeRecordCard.partIndex}`}
                </p>
                <p className="mt-1 truncate text-sm font-black text-slate-800">{activeRecordCard.title}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">第 {activeRecordCard.pageStart}-{activeRecordCard.pageEnd} 页 · 当前停在第 {currentPage} 页</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${activeRecordCard.status === 'completed'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                {activeRecordCard.status === 'completed' ? '已学完' : '学习中'}
              </span>
            </div>
          </div>
        )}

        {stage === 'reading' && studyStyle === 'continuous' && (displayRouteOutlineItems.length > 0 || isGeneratingRoute || routeError || !!onReadingRouteChange) && (
            <div className="shrink-0 border-b border-indigo-100 bg-indigo-50/45 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setRouteOutlineOpen((v) => !v)}
                        className="flex min-w-0 items-center gap-2 text-left"
                        aria-expanded={routeOutlineOpen}
                    >
                        <Map className="h-4 w-4 shrink-0 text-indigo-600" />
                        <div className="min-w-0">
                            <p className="m-0 text-xs font-bold text-indigo-700">领读目录</p>
                            <p className="m-0 truncate text-[11px] text-slate-500">
                                {routeStatusHint}
                            </p>
                        </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={handleReplanReadingRoute}
                            disabled={isGeneratingRoute || isChatLoading || !onReadingRouteChange || !(pdfDataUrl || fullText) || !!pageRangeError}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                            title="只重规划后续领读路线，不改动已经生成的消息书签"
                        >
                            {isGeneratingRoute ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            <span>{readingRoute ? '重规划后续' : '规划后续'}</span>
                        </button>
                        {latestRouteItem && activeRouteItemId !== latestRouteItem.id && (
                            <button
                                type="button"
                                onClick={handleReturnToLatestReading}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-white px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
                                title="回到最近一次正式领读消息"
                            >
                                <SkipForward className="h-3.5 w-3.5" />
                                <span>回到进度</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setRouteOutlineOpen((v) => !v)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-white px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                            <span>{routeOutlineOpen ? '收起' : isGeneratingRoute ? '规划中' : `${displayRouteOutlineItems.length} 个位置`}</span>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${routeOutlineOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>
                {routeOutlineOpen && (
                    <div className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                        {routeNeedsRefresh && (
                            <div className="rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-[11px] font-medium leading-5 text-amber-800">
                                后续路线来自旧配置；已读消息书签不会改变，可点「重规划后续」更新接下来的安排。
                            </div>
                        )}
                        {routeError && (
                            <div className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-[11px] font-medium leading-5 text-rose-700">
                                {routeError}
                            </div>
                        )}
                        {isGeneratingRoute && displayRouteOutlineItems.length === 0 && (
                            <div className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-[11px] font-bold text-indigo-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                正在规划后续领读路线...
                            </div>
                        )}
                        {!isGeneratingRoute && displayRouteOutlineItems.length === 0 && (
                            <div className="rounded-lg bg-white/70 px-2.5 py-2 text-[11px] font-medium leading-5 text-slate-500">
                                还没有正式讲解位置。开始领读或点“继续”后，Module / Part 会自动记录在这里。
                            </div>
                        )}
                        {displayRouteOutlineItems.map((item) => {
                            const isActive = activeRouteItemId === item.id;
                            const isLatest = latestRouteItem?.id === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleJumpToRouteItem(item)}
                                    aria-current={isActive ? 'true' : undefined}
                                    className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                                        isActive
                                            ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-100'
                                            : 'text-slate-600 hover:bg-white/75 hover:text-indigo-700'
                                    } ${item.level === 'part' ? 'pl-5' : ''}`}
                                >
                                    <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-indigo-200'}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-bold">
                                            {item.prefix}
                                            <span className="font-semibold text-slate-500"> · {item.title}</span>
                                            {isActive && (
                                                <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-700">
                                                    正在查看
                                                </span>
                                            )}
                                            {isLatest && (
                                                <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                                                    当前进度
                                                </span>
                                            )}
                                        </span>
                                        {item.pageLabel && (
                                            <span className="mt-0.5 block text-[10px] font-medium text-slate-400">
                                                {item.pageLabel}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        )}

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-white">
             {messages.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-stone-300 space-y-4 opacity-70">
                     <div className="p-4 bg-stone-50 rounded-full">
                         <MessageCircle className="w-10 h-10" />
                     </div>
                     <p className="text-xs font-bold text-stone-400">
                       {activeRecordCard ? '正在准备这张唱片的专属领读…' : '请先在上方完成【知识准备】'}
                     </p>
                 </div>
             ) : (
                 <>
                 {messages.map((msg, idx) => {
                    const messageId = getStableMessageId(msg, idx);
                    const activeExplanationVariant = getActiveSkimExplanationVariant(msg);
                    const explanationState = msg.skimExplanation;
                    const displayedText = getDisplayedSkimMessageText(msg);
                    const deferredItems = activeExplanationVariant && explanationState
                      ? activeExplanationVariant.deferredSpineItemIds
                          .map((id) => explanationState.spineItems.find((item) => item.id === id))
                          .filter((item): item is NonNullable<typeof item> => Boolean(item))
                      : [];
                    const availableVariantKeys = explanationState
                      ? (Object.keys(explanationState.variants) as SkimExplanationVariantKey[])
                          .filter((key) => Boolean(explanationState.variants[key]))
                      : [];
                    const isThisVariantLoading = variantLoadingMessageId === messageId;
                    const isLegacyRecordExplanation = Boolean(
                      studyStyle === 'records'
                      && activeRecordCard
                      && stage === 'reading'
                      && isLegacyRecordExplanationCandidate(msg)
                    );
                    return (
                    <div
                        key={messageId}
                        ref={(node) => {
                            messageRefs.current[messageId] = node;
                        }}
                        className={`flex scroll-mt-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`relative max-w-[90%] px-4 py-3 text-sm shadow-sm transition-all ${
                            msg.role === 'user'
                            ? 'group bg-amber-100 text-amber-900 rounded-2xl rounded-tr-none shadow-sm'
                            : 'bg-stone-50 text-slate-700 border border-stone-100 rounded-2xl rounded-tl-none'
                        }`}
                        >
                            {msg.role === 'user' && stage !== 'diagnosis' && stage !== 'quiz' && (
                                <button
                                    type="button"
                                    title="编辑并重发"
                                    aria-label="编辑并重发"
                                    onClick={() => handleEditUserMessageAtIndex(idx)}
                                    disabled={variantLoadingMessageId !== null}
                                    className="absolute top-1.5 right-1.5 z-10 rounded-md bg-indigo-700/90 p-1.5 text-white opacity-0 shadow-sm transition-opacity hover:bg-indigo-800 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/60 min-h-[32px] min-w-[32px] flex items-center justify-center"
                                >
                                    <PencilLine className="w-3.5 h-3.5" aria-hidden />
                                </button>
                            )}
                            {getMessageImages(msg).map((img, imgIdx) => (
                                <img
                                    key={imgIdx}
                                    src={img}
                                    alt="用户上传"
                                    className="max-w-full rounded-lg mb-2"
                                />
                            ))}
                            {explanationState && activeExplanationVariant && availableVariantKeys.length > 1 && (
                              <div className="mb-3 flex flex-wrap gap-1.5 border-b border-indigo-100 pb-2">
                                {availableVariantKeys.map((key) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleSelectExplanationVariant(messageId, key)}
                                    disabled={isExplanationBusy}
                                    aria-pressed={explanationState.activeVariantKey === key}
                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${explanationState.activeVariantKey === key
                                      ? 'border-indigo-200 bg-indigo-100 text-indigo-700'
                                      : 'border-stone-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                                    }`}
                                  >
                                    {SKIM_VARIANT_LABELS[key]}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div data-preserve-language="true">
                              <ReactMarkdown
                                  components={MarkdownComponents}
                                  remarkPlugins={[remarkMath, remarkGfm]}
                                  rehypePlugins={[rehypeKatex]}
                                  className={msg.role === 'user' ? 'prose-invert' : ''}
                              >
                                  {normalizeGeneratedLineBreaks(displayedText)}
                              </ReactMarkdown>
                            </div>
                            {explanationState && activeExplanationVariant && deferredItems.length > 0 && (
                              <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
                                <summary className="cursor-pointer text-xs font-bold text-amber-800 marker:text-amber-500">
                                  AI 暂时替你记着 {deferredItems.length} 项
                                </summary>
                                <div className="mt-2 space-y-2 border-t border-amber-100 pt-2">
                                  {deferredItems.map((item) => (
                                    <div key={item.id} className="text-xs leading-5 text-slate-600">
                                      <p className="m-0 font-bold text-slate-700">
                                        {item.titleZh}{item.titleEn ? `（${item.titleEn}）` : ''}
                                      </p>
                                      <p className="m-0">{item.summary}</p>
                                      {item.pageRefs.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => onJumpToPage?.(item.pageRefs[0])}
                                          disabled={!onJumpToPage}
                                          className="mt-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:cursor-default"
                                        >
                                          原文{formatSkimPageRefs(item.pageRefs)}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                            {explanationState && activeExplanationVariant && (
                              <div className="mt-3 border-t border-stone-200 pt-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateExplanationVariant(
                                      messageId,
                                      activeExplanationVariant.depth === 'simple' ? 'normal' : 'simple',
                                      activeExplanationVariant.style,
                                    )}
                                    disabled={isExplanationBusy}
                                    className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {activeExplanationVariant.depth === 'simple' ? '展开成正常难度' : '压缩成简单版'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateExplanationVariant(
                                      messageId,
                                      activeExplanationVariant.depth,
                                      activeExplanationVariant.style === 'standard' ? 'interesting' : 'standard',
                                    )}
                                    disabled={isExplanationBusy}
                                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Lightbulb className="h-3 w-3" />
                                    {activeExplanationVariant.style === 'standard' ? '换个有意思的讲法' : '回到标准讲法'}
                                  </button>
                                  {explanationState.sourcePageRefs.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => onJumpToPage?.(explanationState.sourcePageRefs[0])}
                                      disabled={!onJumpToPage || isExplanationBusy}
                                      className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-stone-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      原文{formatSkimPageRefs(explanationState.sourcePageRefs)}
                                    </button>
                                  )}
                                  {isThisVariantLoading && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />正在连接同一条主线…
                                    </span>
                                  )}
                                </div>
                                {variantErrors[messageId] && (
                                  <p className="mb-0 mt-2 text-[11px] font-medium text-rose-600">{variantErrors[messageId]}</p>
                                )}
                              </div>
                            )}
                            {isLegacyRecordExplanation && activeRecordCard && (
                              <div className="mt-3 border-t border-stone-200 pt-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleBootstrapLegacyRecordExplanation(messageId, 'simple', 'standard')}
                                    disabled={isExplanationBusy}
                                    className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    压缩成简单版
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleBootstrapLegacyRecordExplanation(messageId, 'normal', 'interesting')}
                                    disabled={isExplanationBusy}
                                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Lightbulb className="h-3 w-3" />
                                    换个有意思的讲法
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onJumpToPage?.(activeRecordCard.pageStart)}
                                    disabled={!onJumpToPage || isExplanationBusy}
                                    className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-stone-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    原文第 {activeRecordCard.pageStart}{activeRecordCard.pageEnd !== activeRecordCard.pageStart ? `–${activeRecordCard.pageEnd}` : ''} 页
                                  </button>
                                  {isThisVariantLoading && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />正在连接同一条主线…
                                    </span>
                                  )}
                                </div>
                                {variantErrors[messageId] && (
                                  <p className="mb-0 mt-2 text-[11px] font-medium text-rose-600">{variantErrors[messageId]}</p>
                                )}
                              </div>
                            )}
                        </div>
                    </div>
                    );
                 })}

                 {/* “看要点”：Lecture 整段式与当前唱片中的轻量回看与临时提取。 */}
                 {stage === 'reading' && takeawaysPanelOpen && skimContentType === 'lecture' && (studyStyle === 'continuous' || (studyStyle === 'records' && activeRecordCard)) && (
                     <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="flex items-start justify-between gap-3">
                             <div className="flex min-w-0 items-start gap-2 text-amber-900">
                                 <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
                                 <div>
                                     <p className="m-0 text-sm font-black">{studyStyle === 'records' ? '这张唱片讲过的要点' : '刚才讲过的要点'}</p>
                                     <p className="m-0 mt-0.5 text-[11px] font-medium text-amber-800/70">
                                       {studyStyle === 'records' ? '只整理当前唱片对话里实际出现过的内容。' : '只整理你在当前领读里实际看过的内容。'}
                                     </p>
                                 </div>
                             </div>
                             <button
                                 type="button"
                                 onClick={() => setTakeawaysPanelOpen(false)}
                                 disabled={takeawaysLoading || knowledgeExtractionLoading}
                                 aria-label="关闭要点"
                                 className="rounded-lg p-1 text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                             >
                                 <X className="h-4 w-4" />
                             </button>
                         </div>

                         {takeawaysLoading ? (
                             <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-white/80 px-3 py-4 text-xs font-bold text-amber-800">
                                 <Loader2 className="h-4 w-4 animate-spin" />正在把已经讲过的内容整理成要点…
                             </div>
                         ) : takeawaysError && !moduleTakeaways ? (
                             <div className="rounded-xl border border-rose-100 bg-white/80 p-3">
                                 <p className="m-0 text-xs font-medium text-rose-600">{takeawaysError}</p>
                                 <button
                                     type="button"
                                     onClick={() => void handleShowTakeaways()}
                                     className="mt-2 text-xs font-bold text-amber-800 hover:underline"
                                 >
                                     重试
                                 </button>
                             </div>
                         ) : moduleTakeaways ? (
                           <>
                             <div className="space-y-2">
                                 {moduleTakeaways.filter((item) => item.status === 'explained').map((item) => (
                                     <article key={item.id} className="rounded-xl border border-amber-100 bg-white/90 p-3 shadow-sm">
                                         <div className="flex items-start justify-between gap-3">
                                             <h4 className="m-0 text-sm font-black text-slate-800">
                                                 {item.titleZh}{item.titleEn ? <span className="ml-1 font-bold text-slate-500">({item.titleEn})</span> : null}
                                             </h4>
                                             {item.pageRefs.length > 0 ? (
                                                 <button
                                                     type="button"
                                                     onClick={() => onJumpToPage?.(item.pageRefs[0])}
                                                     disabled={!onJumpToPage}
                                                     className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 disabled:cursor-default"
                                                 >
                                                     原文{formatSkimPageRefs(item.pageRefs)}
                                                 </button>
                                             ) : (
                                                 <span className="shrink-0 text-[10px] font-medium text-slate-400">旧对话无页码</span>
                                             )}
                                         </div>
                                         <p className="m-0 mt-2 text-xs leading-5 text-slate-700"><span className="font-bold text-amber-800">大白话：</span>{item.plainLanguage}</p>
                                         <p className="m-0 mt-1 text-xs leading-5 text-slate-500"><span className="font-bold text-slate-600">它在这里的作用：</span>{item.connection}</p>
                                     </article>
                                 ))}
                             </div>

                             {moduleTakeaways.some((item) => item.status === 'deferred') && (
                                 <details className="rounded-xl border border-amber-200 bg-amber-100/50 px-3 py-2">
                                     <summary className="cursor-pointer text-xs font-bold text-amber-900 marker:text-amber-600">
                                         AI 暂时替你记着 {moduleTakeaways.filter((item) => item.status === 'deferred').length} 项
                                     </summary>
                                     <p className="mb-2 mt-1 text-[10px] font-medium text-amber-800/70">这些内容还没有正式展开，不会拿来考你。</p>
                                     <div className="space-y-2 border-t border-amber-200 pt-2">
                                         {moduleTakeaways.filter((item) => item.status === 'deferred').map((item) => (
                                             <div key={item.id} className="rounded-lg bg-white/70 p-2 text-xs text-slate-600">
                                                 <p className="m-0 font-bold text-slate-700">{item.titleZh}{item.titleEn ? ` (${item.titleEn})` : ''}</p>
                                                 <p className="m-0 mt-1 leading-5">{item.plainLanguage}</p>
                                                 {item.pageRefs.length > 0 && (
                                                     <button
                                                         type="button"
                                                         onClick={() => onJumpToPage?.(item.pageRefs[0])}
                                                         disabled={!onJumpToPage}
                                                         className="mt-1 text-[10px] font-bold text-indigo-600 hover:underline disabled:cursor-default"
                                                     >
                                                         原文{formatSkimPageRefs(item.pageRefs)}
                                                     </button>
                                                 )}
                                             </div>
                                         ))}
                                     </div>
                                 </details>
                             )}

                             <div className="flex flex-wrap gap-2 pt-1">
                                 <button
                                     type="button"
                                     onClick={() => {
                                         const text = formatSkimTakeawaysForNotebook(moduleTakeaways);
                                         navigator.clipboard.writeText(text).catch(() => {});
                                         if (onNotebookAdd) onNotebookAdd(`【${studyStyle === 'records' ? '本张唱片' : '本次领读'}要点】\n${text}`, 'skim');
                                     }}
                                     className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                                 >
                                     <ClipboardList className="h-3.5 w-3.5" />
                                     {onNotebookAdd ? '复制并记到笔记' : '复制要点'}
                                 </button>
                                 <button
                                     type="button"
                                     id="skim-takeaways-write-toggle"
                                     onClick={() => setTakeawaysWriteOpen((o) => !o)}
                                     aria-expanded={takeawaysWriteOpen}
                                     aria-controls="skim-takeaways-write-panel"
                                     className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"
                                 >
                                     <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${takeawaysWriteOpen ? 'rotate-180' : ''}`} aria-hidden />
                                     <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                     我要写笔记
                                 </button>
                                 <button
                                     type="button"
                                     onClick={() => void handleStartKnowledgeExtraction()}
                                     disabled={knowledgeExtractionLoading || !moduleTakeaways.some((item) => item.status === 'explained')}
                                     className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                 >
                                     {knowledgeExtractionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                                     合上要点，考考我
                                 </button>
                             </div>
                             {knowledgeExtractionError && (
                                 <p className="m-0 text-[11px] font-medium text-rose-600" role="status">{knowledgeExtractionError}</p>
                             )}

                             {takeawaysWriteOpen && activeTakeawaysDraftId != null && (
                             <div
                                 id="skim-takeaways-write-panel"
                                 role="region"
                                 aria-labelledby="skim-takeaways-write-toggle"
                                 className="mt-1 space-y-3 border-t border-amber-200/80 pt-3"
                             >
                                 <textarea
                                     ref={takeawaysDraftTextareaRef}
                                     id="skim-takeaways-draft-input"
                                     value={takeawaysDraftText}
                                     onChange={(e) => updateTakeawaysDraft(e.target.value)}
                                     rows={5}
                                     placeholder="用自己的话整理，支持数学公式（如行内 $x^2$、块级 $$\int_0^1 f$$，见下方预览）"
                                     lang="zh-Hans"
                                     autoComplete="off"
                                     aria-label="本模块自整理笔记草稿"
                                     className="min-h-[120px] w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                     spellCheck
                                 />
                                 <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                                     <button
                                         type="button"
                                         onClick={handleUploadTakeawaysDraft}
                                         disabled={!onNotebookAdd || !takeawaysDraftText.trim()}
                                         title={
                                             !onNotebookAdd
                                                 ? '未连接学习手帐'
                                                 : !takeawaysDraftText.trim()
                                                   ? '请先输入内容再保存'
                                                   : undefined
                                         }
                                         aria-disabled={!onNotebookAdd || !takeawaysDraftText.trim()}
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-0"
                                     >
                                         <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden />
                                         保存到学习手帐
                                     </button>
                                     <button
                                         type="button"
                                         onClick={() => void handleSendDraftToGuide()}
                                         disabled={isChatLoading || !takeawaysDraftText.trim()}
                                         title={!takeawaysDraftText.trim() ? '请先输入内容' : undefined}
                                         aria-busy={isChatLoading}
                                         aria-disabled={isChatLoading || !takeawaysDraftText.trim()}
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-0"
                                     >
                                         {isChatLoading ? (
                                             <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                         ) : (
                                             <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                         )}
                                         把这段发给导读
                                     </button>
                                     <button
                                         type="button"
                                         onClick={handleClearTakeawaysDraft}
                                         disabled={!takeawaysDraftText}
                                         title="清空当前草稿"
                                         className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-0"
                                     >
                                         <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                         清空本块草稿
                                     </button>
                                 </div>
                                 {notebookDraftHint ? (
                                     <p className="text-[11px] font-medium text-emerald-700" role="status" aria-live="polite">
                                         已追加到学习手帐（领读）
                                     </p>
                                 ) : null}
                                 <div className="rounded-xl border border-amber-100 bg-white/95 p-3 shadow-sm">
                                     <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                         <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900/70">
                                             预览（只读）
                                         </span>
                                         {takeawaysDraftText.trim() &&
                                         deferredTakeawaysPreview !== takeawaysDraftText ? (
                                             <span className="text-[10px] text-slate-400">预览略延迟更新…</span>
                                         ) : null}
                                     </div>
                                     <div className="max-h-48 min-h-[2.5rem] overflow-y-auto custom-scrollbar text-left">
                                         {takeawaysDraftText.trim() ? (
                                             <TakeawaysDraftMarkdownPreview
                                                 markdown={
                                                     deferredTakeawaysPreview.trim()
                                                         ? deferredTakeawaysPreview
                                                         : takeawaysDraftText
                                                 }
                                             />
                                         ) : (
                                             <p className="text-xs italic text-slate-400">
                                                 输入后在此预览 Markdown 与公式
                                             </p>
                                         )}
                                     </div>
                                 </div>
                                 <p className="text-[10px] leading-snug text-slate-500">
                                     刷新页面后本块草稿会清空（未保存到学习手帐的内容不保留）。
                                 </p>
                             </div>
                             )}
                           </>
                         ) : null}
                     </div>
                 )}

                 </>
             )}
             {isChatLoading && (
                 <div className="flex justify-start">
                     <div className="bg-stone-50 border border-stone-100 rounded-2xl rounded-tl-none p-3 shadow-sm">
                         <div className="flex space-x-1">
                             <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
                             <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                             <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-300"></div>
                         </div>
                     </div>
                 </div>
             )}
        </div>

        <div className="p-4 border-t border-stone-50 bg-white shrink-0 space-y-2">
            {explanationGenerationError && stage === 'reading' && studyStyle === 'continuous' && skimContentType === 'lecture' && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                <span>{explanationGenerationError}</span>
                <button type="button" onClick={() => setExplanationGenerationError(null)} className="shrink-0 text-rose-500 hover:text-rose-800" aria-label="关闭错误提示">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {activeRecordCard && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/45 px-3 py-2">
                <div>
                  <p className="text-xs font-black text-slate-800">
                    {activeRecordCard.status === 'completed' ? '这张唱片已标记为学完' : '学完由你自己决定'}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    这只代表学过了，不代表考试层面已经掌握。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeRecordCard.status === 'completed' ? (
                    <>
                      <button type="button" onClick={onUndoRecordComplete} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        <RotateCcw className="h-3.5 w-3.5" />撤销
                      </button>
                      <button type="button" className="rounded-md border border-indigo-100 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-600">留在这里</button>
                      <button type="button" onClick={onOpenRecordShelf} className="rounded-md border border-indigo-100 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50">返回唱片架</button>
                      {nextRecordCard && (
                        <button type="button" onClick={onOpenNextRecord} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-indigo-700">
                          下一张<ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={onOpenRecordShelf} className="rounded-md border border-indigo-100 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50">返回唱片架</button>
                      <button type="button" onClick={onCompleteRecord} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" />我学完了
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* 隐藏的文件选择器:由"图片"按钮触发 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleImageSelect}
            />
            {/* 图片预览(选了图但还没发);多图横向 flex,每张独立 × */}
            {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative">
                            <img src={img} alt={`待发送图片 ${idx + 1}`} className="max-h-24 rounded-lg border border-stone-200" />
                            <button
                                type="button"
                                onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                                title="移除图片"
                                aria-label="移除图片"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center space-x-2 bg-stone-50 p-1.5 rounded-full border border-stone-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <textarea
                    ref={chatInputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    onPaste={handlePaste}
                    placeholder={stage === 'tutoring' ? "回答 AI 的追问或说‘我不懂’..." : "与导读 AI 交流..."}
                    className="flex-1 bg-transparent border-0 px-4 py-1.5 text-sm focus:ring-0 focus:outline-none text-slate-700 placeholder:text-stone-400 resize-none overflow-y-auto max-h-[120px]"
                    disabled={isExplanationBusy || stage === 'diagnosis'}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExplanationBusy || stage === 'diagnosis'}
                    title="添加图片"
                    aria-label="添加图片"
                    className="p-2 text-stone-500 hover:text-amber-700 hover:bg-stone-100 disabled:opacity-40 rounded-full transition-colors shrink-0"
                >
                    <ImagePlus className="w-4 h-4" />
                </button>
                {isExplanationBusy ? (
                    <button
                        type="button"
                        onClick={handleStopSkimChat}
                        title="停止生成"
                        className="p-2 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-all shadow-md flex items-center gap-1 px-3"
                    >
                        <Square className="w-3 h-3 fill-current" />
                        <span className="text-xs font-bold">停止</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={!input.trim() || stage === 'diagnosis'}
                        className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
                    >
                        <Send className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                )}
            </div>
        </div>

      </div>
      )}

      {/* 选择模块数弹层（跳过测验/直接阅读时弹出） */}
      {showGranularityModal && onRegenerateStudyMap && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-3">
          <div
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
            style={{ maxHeight: 'calc(100% - 1.5rem)' }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-800">{skimContentType === 'lecture' ? '配置这段领读' : '开始顺序陪读'}</h3>
                <p className="mt-1 text-xs leading-5 text-stone-500">{skimContentType === 'lecture' ? '先确认主要设置，需要时再展开其他选项。' : '将从头开始顺序陪读整篇。'}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGranularityModal(false)}
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-stone-100 hover:text-slate-700"
                aria-label="关闭领读配置"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="flex flex-col gap-3">
              {contentTypeSelector}
              {studyStyleSelector}
              <details className="group rounded-xl border border-indigo-100 bg-indigo-50/30">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-xs font-bold text-indigo-800 marker:content-none">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">联合辅助材料{auxiliaryMaterial ? ` · ${auxiliaryMaterial.fileName}` : '（可选）'}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-indigo-100 p-2">{auxiliaryMaterialSelector}</div>
              </details>
              {/* 阶段4b：module 数/节奏/页码范围仅 lecture 模式显示 */}
              {skimContentType === 'lecture' && (
                <>
              <details className="group rounded-xl border border-stone-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-xs font-bold text-slate-700 marker:content-none">
                  <span>分段设置</span>
                  <span className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                    {selectedModuleCount} 个模块 · 一次一个 {skimPace}
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="space-y-3 border-t border-stone-100 p-3">
                  <select
                    value={selectedModuleCount}
                    onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
                    className="w-full rounded-xl border-2 border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 focus:border-indigo-300"
                  >
                    {MODULE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} 个模块</option>
                    ))}
                  </select>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-stone-500">节奏</label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="skim-pace-modal"
                          value="module"
                          checked={skimPace === 'module'}
                          onChange={() => setSkimPace('module')}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700">一次一个 module</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="skim-pace-modal"
                          value="part"
                          checked={skimPace === 'part'}
                          onChange={() => setSkimPace('part')}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-slate-700">一次一个 part</span>
                      </label>
                    </div>
                  </div>
                </div>
              </details>
              <PageRangeInput
                start={pageRangeStart}
                end={pageRangeEnd}
                onStartChange={setPageRangeStart}
                onEndChange={setPageRangeEnd}
                totalPages={totalPages}
                idPrefix="skim-modal"
              />
                </>
              )}
              {skimContentType !== 'lecture' && companionGuardNotice && (
                <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {companionGuardNotice}
                </p>
              )}
              </div>
            </div>

            <div className="shrink-0 border-t border-stone-100 bg-white px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
              <button
                  onClick={handleStartWithModuleCount}
                  disabled={skimContentType === 'lecture' && !!pageRangeError}
                  className="w-full rounded-xl bg-slate-800 py-3 font-bold text-white transition-all hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {skimContentType !== 'lecture' ? '开始领读' : needRegenerate ? '按当前设置重新生成并开始' : '开始领读'}
                </button>
            </div>
          </div>
        </div>
      )}

      {auxiliaryPickerOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">选择辅助材料</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  只会挂到当前这段领读配置里，不会打开这份 PDF。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuxiliaryPickerOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                aria-label="关闭选择辅助材料"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)]">
              <aside className="border-b border-stone-100 bg-stone-50 p-3 md:border-b-0 md:border-r">
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1 custom-scrollbar md:max-h-[56vh]">
                  <button
                    type="button"
                    onClick={() => setAuxiliaryFolderId('all')}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                      auxiliaryFolderId === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <LayoutGrid className="h-4 w-4 shrink-0" />
                      <span className="truncate">全部资料</span>
                    </span>
                    <span className="opacity-70">{auxiliaryFileSessions.length}</span>
                  </button>
                  {auxiliaryFolders.map((folder) => {
                    const active = auxiliaryFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => setAuxiliaryFolderId(folder.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${
                          active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Folder className="h-4 w-4 shrink-0" />
                          <span className="truncate">{folder.customTitle || folder.fileName}</span>
                        </span>
                        <span className="opacity-70">{auxiliaryFolderCounts[folder.id] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-h-0 p-3">
                <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {visibleAuxiliaryFiles.length === 0 ? (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center">
                      <BookOpen className="h-7 w-7 text-stone-300" />
                      <p className="mt-3 text-sm font-bold text-slate-600">这里还没有可选 PDF</p>
                      <p className="mt-1 text-xs text-slate-400">当前正在读的 PDF 不会出现在辅助材料列表里。</p>
                    </div>
                  ) : (
                    visibleAuxiliaryFiles.map((session) => {
                      const selected = auxiliaryMaterial?.cloudSessionId === session.id;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            onAuxiliaryMaterialChange?.({
                              cloudSessionId: session.id,
                              fileName: session.customTitle || session.fileName,
                              role: auxiliaryMaterial?.role ?? 'reading',
                              useMode: auxiliaryMaterial?.useMode ?? 'necessary',
                            });
                            setAuxiliaryPickerOpen(false);
                          }}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            selected ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-800">{session.customTitle || session.fileName}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {selected ? `当前已联合 · ${getAuxiliaryRoleLabel(auxiliaryMaterial?.role ?? 'reading')}` : '点击设为辅助材料'}
                              </p>
                            </div>
                            {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 正在重新划分模块时的 loading */}
      {isRegeneratingMap && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="flex items-center gap-2 text-stone-600 text-sm font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>正在按所选模块数重新划分…</span>
          </div>
        </div>
      )}
    </div>
  );
};
