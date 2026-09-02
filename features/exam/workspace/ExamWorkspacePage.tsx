/**
 * M1 备考工作台：左栏 KC（含本场掌握度预测与考前预测入口）+ 中苏格拉底对话
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  Calendar,
  GraduationCap,
  Loader2,
  Sparkles,
  ListTree,
  Braces,
  ClipboardCheck,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  X,
  Database,
  Search,
  ChevronDown,
  CheckCircle2,
  Circle,
  Layers3,
  ListChecks,
} from 'lucide-react';
import type {
  AtomCoverageByKc,
  DisciplineBand,
  Exam,
  ExamMaterialLink,
  ExamReviewScope,
  KcGlossaryEntry,
  LSAPContentMap,
  LSAPKnowledgeComponent,
  LSAPState,
  RetrievedChunk,
} from '@/types';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { ExamWorkspaceSocraticChat, type ExamWorkspaceSocraticChatHandle } from '@/features/exam/workspace/ExamWorkspaceSocraticChat';
import { ExamWorkspaceGlobalChat } from '@/features/exam/workspace/ExamWorkspaceGlobalChat';
import { KcGlossarySidebar } from '@/features/exam/workspace/KcGlossarySidebar';
import { KnowledgePointInspectPanel } from '@/features/exam/workspace/KnowledgePointInspectPanel';
import { WorkspaceKcProbeModal } from '@/features/exam/workspace/WorkspaceKcProbeModal';
import { WorkspaceEvidenceReportModal } from '@/features/exam/workspace/WorkspaceEvidenceReportModal';
import { KnowledgeBlockEvidenceDrawer } from '@/features/exam/workspace/KnowledgeBlockEvidenceDrawer';
import { ExamWorkspaceMaterialPreview } from '@/features/exam/workspace/ExamWorkspaceMaterialPreview';
import type { WorkspaceDialogueTurn, WorkspaceEvidenceAnnotation } from '@/features/exam/lib/examWorkspaceLsapKey';
import { pendingRevisitCount } from '@/features/exam/lib/examLearningEvidence';
import { buildExamMaterialChunkIndexForLinks, findChunkById } from '@/features/exam/lib/examChunkIndex';
import { getExamChunkIndexStats, loadExamMaterialChunkIndex, saveExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import { DEFAULT_TOP_K, retrieveCandidateChunks } from '@/features/exam/lib/examChunkRetrieval';
import type { ExamGlobalKnowledgeBlockOption } from '@/features/exam/lib/examGlobalChat';

export interface ExamWorkspacePageProps {
  user: User;
  activeExamId: string | null;
  onActiveExamIdChange: (id: string | null) => void;
  onBack: () => void;
  onOpenExamHub: () => void;
  onEnterExamPrediction: (links: ExamMaterialLink[]) => void | Promise<void>;
  onLoadMergedContent: (links: ExamMaterialLink[]) => Promise<string>;
  /** 结业探测：按材料 linkId 取单份讲义文本（与 App 内 getDocContentForExamLink 同源）；取不到时由弹窗回退 merged */
  onLoadProbeMaterialText?: (linkId: string) => Promise<string | null>;
  /** M1：本场 LSAP（与当前 PDF 的 lsap 独立） */
  workspaceLsapContentMap: LSAPContentMap | null;
  workspaceLsapState: LSAPState | null;
  predictedScore: number | null;
  onGenerateWorkspaceLsap: () => Promise<void>;
  workspaceLsapGenerating: boolean;
  /** P1：按材料逐份生成考点图谱时的进度（current/total + 当前文件名） */
  workspaceLsapProgress: { current: number; total: number; fileName: string } | null;
  /** P2：按材料逐份提取逻辑原子时的进度 */
  workspaceAtomsProgress: { current: number; total: number; fileName: string } | null;
  /** M2：逻辑原子覆盖（只读展示 x/y） */
  workspaceAtomCoverage: AtomCoverageByKc;
  onExtractLogicAtoms: (options?: { preserveExistingAtoms?: boolean }) => Promise<void>;
  workspaceAtomsGenerating: boolean;
  /** M3：原子覆盖更新（持久化由 App 完成） */
  onWorkspaceAtomCoverageChange: (next: AtomCoverageByKc) => void;
  /** M4：结业探测后提交 LSAPState（含 BKT / probeHistory / 预测分） */
  onWorkspaceLsapStateCommit: (next: LSAPState) => void;
  /** M5：对话留痕 + 报告 */
  workspaceDialogueTranscript: WorkspaceDialogueTurn[];
  workspaceEvidenceAnnotations: WorkspaceEvidenceAnnotation[];
  workspaceLsapKey: string | null;
  onWorkspaceDialogueTranscriptChange: (turns: WorkspaceDialogueTurn[], chatSessionKey: string) => void;
  onWorkspaceEvidenceAnnotationsChange: (next: WorkspaceEvidenceAnnotation[]) => void;
  /** KC 考点释义（按 kcId 存于 App，此处按当前考点过滤展示） */
  workspaceKcGlossary: Record<string, KcGlossaryEntry[]>;
  onWorkspaceGlossaryAppend: (entries: KcGlossaryEntry[]) => void;
  /** P0：备考台讲义预览 — 解析单条材料为可渲染的 PDF File（云端拉取 / 当前打开本地 PDF） */
  resolveExamMaterialPdf: (link: ExamMaterialLink) => Promise<File | null>;
}

function sortMaterialLinks(links: ExamMaterialLink[]): ExamMaterialLink[] {
  return [...links].sort((a, b) => {
    const sa = a.sortIndex ?? a.addedAt;
    const sb = b.sortIndex ?? b.addedAt;
    return sa - sb;
  });
}

function kcListOrdered(kcs: LSAPKnowledgeComponent[]): LSAPKnowledgeComponent[] {
  return [...kcs].sort((a, b) => {
    const ap = getKcPageRange(a)?.start ?? Number.MAX_SAFE_INTEGER;
    const bp = getKcPageRange(b)?.start ?? Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return (b.examWeight || 0) - (a.examWeight || 0);
  });
}

/**
 * 考点展示分档（方案 A）。`examWeight` 非 4/5 或为 undefined/null/其它值时归入 Tier3（细节），保守处理。
 */
function getTierFromExamWeight(w: number | undefined | null): 1 | 2 | 3 {
  if (w === 5) return 1;
  if (w === 4) return 2;
  if (w === 1 || w === 2 || w === 3) return 3;
  return 3;
}

function atomCoverageCounts(kc: LSAPKnowledgeComponent, cov: AtomCoverageByKc): { covered: number; total: number } {
  const atoms = kc.atoms ?? [];
  const total = atoms.length;
  if (total === 0) return { covered: 0, total: 0 };
  let covered = 0;
  for (const a of atoms) {
    if (cov[kc.id]?.[a.id] === true) covered++;
  }
  return { covered, total };
}

type UnderstandingStatus = 'not_started' | 'recognition' | 'explanation' | 'transfer' | 'mastered';
type KnowledgeBlockFilter = 'all' | 'todo' | 'ready';
type PageWindow = { start: number; end: number };

interface ReviewKnowledgeBlock {
  id: string;
  materialKey: string;
  title: string;
  materialTitle: string;
  sourceKcs: LSAPKnowledgeComponent[];
  pageWindows: PageWindow[];
  pageLabel: string | null;
}

interface KnowledgeBlockLectureGroup {
  key: string;
  title: string;
  blocks: ReviewKnowledgeBlock[];
  total: number;
  ready: number;
}

const UNDERSTANDING_STATUS_META: Record<UnderstandingStatus, { label: string; nextAction: string; className: string }> = {
  not_started: {
    label: '未开始',
    nextAction: '先关掉材料讲一遍',
    className: 'bg-stone-100 text-slate-500 border-stone-200',
  },
  recognition: {
    label: '看起来懂',
    nextAction: '确认能不能自己解释',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  explanation: {
    label: '能解释',
    nextAction: '换个例子验证',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  transfer: {
    label: '能连接/迁移',
    nextAction: '找边界或做输出',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  mastered: {
    label: '已掌握',
    nextAction: '保持回炉即可',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

const KNOWLEDGE_BLOCK_FILTERS: Array<{ id: KnowledgeBlockFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'todo', label: '待理解' },
  { id: 'ready', label: '可输出' },
];

function isBlockReady(status: UnderstandingStatus): boolean {
  return status === 'transfer' || status === 'mastered';
}

const REVIEW_BLOCK_TARGET_PAGE_SPAN = 12;
const REVIEW_BLOCK_HARD_PAGE_SPAN = 15;
const REVIEW_BLOCK_SOFT_MAX_KCS = 6;
const REVIEW_BLOCK_LARGE_GAP = 4;

function normalizePageList(pages: Array<number | undefined> | undefined): number[] {
  return Array.from(
    new Set(
      (pages ?? [])
        .map((page) => Number(page))
        .filter((page) => Number.isFinite(page) && page >= 1)
        .map((page) => Math.round(page))
    )
  ).sort((a, b) => a - b);
}

function getEvidencePagesForKc(kc: LSAPKnowledgeComponent): number[] {
  const anchorPages = normalizePageList(kc.anchorPages);
  const sourcePages = normalizePageList(kc.sourcePages);
  const directPages = normalizePageList([...anchorPages, ...sourcePages]);
  if (directPages.length > 0) return directPages;
  return normalizePageList(kc.relatedPages);
}

function buildPageWindowsFromPages(pages: number[]): PageWindow[] {
  const normalized = normalizePageList(pages);
  if (normalized.length === 0) return [];
  const windows: PageWindow[] = [];
  for (const page of normalized) {
    const last = windows[windows.length - 1];
    if (last && page <= last.end + 1) {
      last.end = Math.max(last.end, page);
    } else {
      windows.push({ start: page, end: page });
    }
  }
  return windows;
}

function getPageWindowsFromKcs(kcs: LSAPKnowledgeComponent[]): PageWindow[] {
  return buildPageWindowsFromPages(kcs.flatMap(getEvidencePagesForKc));
}

function formatPageWindowsLabel(windows: PageWindow[]): string | null {
  if (windows.length === 0) return null;
  const visible = windows.slice(0, 5);
  const label = visible
    .map((w) => (w.start === w.end ? `${w.start}` : `${w.start}-${w.end}`))
    .join('、');
  const suffix = windows.length > visible.length ? ' 等' : '';
  return `第 ${label}${suffix} 页`;
}

function getKcPageRange(kc: LSAPKnowledgeComponent): PageWindow | null {
  const pages = getEvidencePagesForKc(kc);
  if (pages.length === 0) return null;
  return { start: Math.min(...pages), end: Math.max(...pages) };
}

function getKcStartPage(kc: LSAPKnowledgeComponent): number {
  return getKcPageRange(kc)?.start ?? Number.MAX_SAFE_INTEGER;
}

function getKcEndPage(kc: LSAPKnowledgeComponent): number {
  return getKcPageRange(kc)?.end ?? getKcStartPage(kc);
}

function getPageSpanFromKcs(kcs: LSAPKnowledgeComponent[]): number | null {
  const ranges = kcs.map(getKcPageRange).filter((r): r is { start: number; end: number } => Boolean(r));
  if (ranges.length === 0) return null;
  const start = Math.min(...ranges.map((r) => r.start));
  const end = Math.max(...ranges.map((r) => r.end));
  return end - start + 1;
}

function getPageRangeFromKcs(kcs: LSAPKnowledgeComponent[]): PageWindow | null {
  const ranges = kcs.map(getKcPageRange).filter((r): r is { start: number; end: number } => Boolean(r));
  if (ranges.length === 0) return null;
  return {
    start: Math.min(...ranges.map((r) => r.start)),
    end: Math.max(...ranges.map((r) => r.end)),
  };
}

function buildKnowledgeBlockTitle(kcs: LSAPKnowledgeComponent[], fallbackIndex: number): string {
  const concepts = kcs.map((kc) => kc.concept.trim()).filter(Boolean);
  if (concepts.length === 0) return `知识块 ${fallbackIndex + 1}`;
  if (concepts.length === 1) return concepts[0];
  if (concepts.length === 2) return `${concepts[0]} / ${concepts[1]}`;
  return `${concepts[0]} 等 ${concepts.length} 个关键点`;
}

function buildKnowledgeBlocksFromGroups(
  groups: Array<{ key: string; title: string; kcs: LSAPKnowledgeComponent[]; kind: 'material' | 'unassigned' }>
): ReviewKnowledgeBlock[] {
  const blocks: ReviewKnowledgeBlock[] = [];
  for (const group of groups) {
    const ordered = [...group.kcs].sort((a, b) => {
      const ap = getKcStartPage(a);
      const bp = getKcStartPage(b);
      if (ap !== bp) return ap - bp;
      return (b.examWeight || 0) - (a.examWeight || 0);
    });

    let current: LSAPKnowledgeComponent[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const blockIndex = blocks.length;
      const ids = current.map((kc) => kc.id).join('__');
      const pageWindows = getPageWindowsFromKcs(current);
      blocks.push({
        id: `kb__${group.key}__${blockIndex}__${ids}`,
        materialKey: group.key,
        title: buildKnowledgeBlockTitle(current, blockIndex),
        materialTitle: group.title,
        sourceKcs: current,
        pageWindows,
        pageLabel: formatPageWindowsLabel(pageWindows),
      });
      current = [];
    };

    for (const kc of ordered) {
      const firstPage = getKcPageRange(kc)?.start ?? null;
      const currentRange = getPageRangeFromKcs(current);
      const currentStart = currentRange?.start ?? null;
      const currentEnd = currentRange?.end ?? null;
      const currentSpan = getPageSpanFromKcs(current);
      const nextSpan =
        currentStart != null && currentEnd != null && firstPage != null
          ? Math.max(currentEnd, getKcEndPage(kc)) - Math.min(currentStart, firstPage) + 1
          : null;
      const gapFromCurrent = currentEnd != null && firstPage != null ? firstPage - currentEnd : 0;
      const exceedsHardSpan = nextSpan != null && nextSpan > REVIEW_BLOCK_HARD_PAGE_SPAN;
      const hasReachedComfortSpan = currentSpan != null && currentSpan >= REVIEW_BLOCK_TARGET_PAGE_SPAN;
      const shouldRespectTopicGap =
        current.length >= 2 && hasReachedComfortSpan && gapFromCurrent > REVIEW_BLOCK_LARGE_GAP;
      const tooManyKcsForOneReviewBlock = current.length >= REVIEW_BLOCK_SOFT_MAX_KCS && (currentSpan == null || currentSpan >= 6);

      if (current.length > 0 && (exceedsHardSpan || shouldRespectTopicGap || tooManyKcsForOneReviewBlock)) {
        flush();
      }
      current.push(kc);
    }
    flush();
  }
  return blocks;
}

function getBlockCoverage(block: ReviewKnowledgeBlock, cov: AtomCoverageByKc): { covered: number; total: number; ratio: number } {
  let covered = 0;
  let total = 0;
  for (const kc of block.sourceKcs) {
    const counts = atomCoverageCounts(kc, cov);
    covered += counts.covered;
    total += counts.total;
  }
  return { covered, total, ratio: total > 0 ? covered / total : 0 };
}

function getBlockUnderstandingStatus(
  block: ReviewKnowledgeBlock,
  cov: AtomCoverageByKc,
  state: LSAPState | null
): UnderstandingStatus {
  const coverage = getBlockCoverage(block, cov);
  const bktValues = block.sourceKcs
    .map((kc) => state?.bktState[kc.id])
    .filter((v): v is number => typeof v === 'number');
  const avgBkt = bktValues.length ? bktValues.reduce((sum, v) => sum + v, 0) / bktValues.length : 0;
  const probeCount = state?.probeHistory.filter((p) => block.sourceKcs.some((kc) => kc.id === p.kcId)).length ?? 0;

  if (avgBkt >= 0.78) return 'mastered';
  if (coverage.ratio >= 0.75 || avgBkt >= 0.58) return 'transfer';
  if (coverage.ratio >= 0.4 || avgBkt >= 0.35) return 'explanation';
  if (coverage.covered > 0 || probeCount > 0) return 'recognition';
  return 'not_started';
}

function uniqueNonEmpty(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function getBlockMasteryGoals(block: ReviewKnowledgeBlock): string[] {
  const concepts = block.sourceKcs.map((kc) => kc.concept).filter(Boolean);
  const reviewFocuses = block.sourceKcs.map((kc) => kc.reviewFocus).filter(Boolean);
  const atomLabels = block.sourceKcs.flatMap((kc) => kc.atoms ?? []).map((atom) => atom.label);

  return uniqueNonEmpty([
    concepts.length > 1
      ? `能说清 ${concepts.slice(0, 3).join('、')} 之间的关系`
      : concepts[0]
        ? `能用自己的话解释「${concepts[0]}」`
        : null,
    reviewFocuses[0] ? `能抓住：${reviewFocuses[0]}` : null,
    atomLabels[0] ? `能补上关键机制：${atomLabels.slice(0, 2).join('；')}` : null,
    block.pageLabel ? `能回到材料 ${block.pageLabel} 找到依据` : null,
  ]).slice(0, 3);
}

function getClosedBookRebuildPrompt(block: ReviewKnowledgeBlock): string {
  const title = block.title;
  const pageHint = block.pageLabel ? `，来源页码是${block.pageLabel}` : '';
  return `请进入「闭卷重建」模式，围绕「${title}」${pageHint}来验证我是不是真的懂。

本轮你不要讲解、不要给答案、不要提示、不要总结材料，也不要先列知识点。
请只用不超过 120 字告诉我：先关掉材料和提示，然后用自己的话复述这一块，至少包括：
1. 这一块在解决什么问题；
2. 核心关系或机制是什么；
3. 一个我自己能举出的例子。`;
}

function getBlockQuickPrompts(block: ReviewKnowledgeBlock) {
  const title = block.title;
  return [
    {
      id: 'closed-book-rebuild',
      label: '闭卷讲一遍',
      description: '先不看材料、不听提示，用自己的话重建这一块。',
      text: getClosedBookRebuildPrompt(block),
    },
    {
      id: 'probe',
      label: '先问我一个问题',
      description: '让 AI 先提问，不直接讲答案。',
      text: `请围绕「${title}」先不要讲答案，只问我一个最能暴露我懂没懂的问题。等我回答后，再指出我哪里没讲清。`,
    },
    {
      id: 'transfer',
      label: '换个例子考我',
      description: '用新情境检查是不是只会背材料。',
      text: `请基于「${title}」给我一个新情境或小反例，让我判断应该怎么解释。先出题，不要直接给答案。`,
    },
    {
      id: 'answer-outline',
      label: '整理成答案骨架',
      description: '不猜题，只把这一块变成可写出来的结构。',
      text: `请把「${title}」整理成考试里可以写出来的答案骨架。不要猜老师会怎么考，只基于材料告诉我应该怎样组织解释。`,
    },
  ];
}

function getMiniIntegrationPrompt(
  blocks: ReviewKnowledgeBlock[],
  activeIndex: number
): { id: string; label: string; text: string; description: string } | null {
  if (blocks.length < 3 || activeIndex < 2) return null;
  const endIndex = Math.min(blocks.length - 1, Math.floor((activeIndex + 1) / 3) * 3 - 1);
  if (endIndex < 2) return null;
  const startIndex = Math.max(0, endIndex - 2);
  const group = blocks.slice(startIndex, endIndex + 1);
  if (group.length < 3) return null;
  const routeLines = group
    .map((block, index) => `${startIndex + index + 1}. ${block.title}${block.pageLabel ? `（${block.pageLabel}）` : ''}`)
    .join('\n');

  return {
    id: `mini-integration-${startIndex}-${endIndex}`,
    label: '小整合',
    description: '把最近 3 个知识块串成一个更大的问题，防止只会单块。',
    text: `请进入「小整合」模式，围绕下面 3 个知识块，验证我是否知道它们之间的关系。

${routeLines}

本轮你不要替我总结，不要讲答案，不要提示，也不要展开材料。
请只用不超过 120 字让我闭卷回答：
1. 这 3 块合起来在解决什么更大的问题；
2. 它们之间是什么顺序或关系；
3. 如果考试要求我写一段综合解释，我会怎么开头。`,
  };
}

function getRouteClosureReference(blocks: ReviewKnowledgeBlock[]): string {
  return blocks
    .map((block, index) => `${index + 1}. ${block.title}${block.pageLabel ? `（${block.pageLabel}）` : ''}`)
    .join('\n');
}

function getRouteWrapUpPrompt(blocks: ReviewKnowledgeBlock[], remainingCount: number): { id: string; label: string; text: string; description: string } | null {
  if (blocks.length === 0 || remainingCount > 0) return null;
  return {
    id: 'route-closed-book-wrap-up',
    label: '整场收束',
    description: '所有知识块可输出后，不看路线重建整场材料的大图。',
    text: `请进入「整场闭卷收束」模式，验证我是否真的能把整场材料串起来。

本轮你不要替我总结，不要展示路线，不要给答案，不要提示，也不要预测考试。
请只用不超过 120 字让我关闭材料、关闭路线，然后闭卷回答：
1. 整场材料到底在讲一个什么大问题；
2. 主要知识块之间如何一步步连起来；
3. 哪几处最容易混淆；
4. 如果考试让我写一段总述，我会怎么开头。`,
  };
}

function getBlockCompletionChecks(status: UnderstandingStatus, coverage: { covered: number; total: number }) {
  const ready = isBlockReady(status);
  return [
    {
      label: '能不看材料讲出这块在整场里的作用',
      done: status !== 'not_started' && status !== 'recognition',
    },
    {
      label: '能换一个例子或反例仍然解释得通',
      done: ready,
    },
    {
      label: '能整理成考试里可写出来的答案骨架',
      done: ready || (coverage.total > 0 && coverage.covered / coverage.total >= 0.6),
    },
  ];
}

function UnderstandingProgressDisplay({
  blocks,
  cov,
  state,
}: {
  blocks: ReviewKnowledgeBlock[];
  cov: AtomCoverageByKc;
  state: LSAPState | null;
}) {
  const counts: Record<UnderstandingStatus, number> = {
    not_started: 0,
    recognition: 0,
    explanation: 0,
    transfer: 0,
    mastered: 0,
  };
  for (const block of blocks) counts[getBlockUnderstandingStatus(block, cov, state)] += 1;
  const ready = counts.transfer + counts.mastered;
  return (
    <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-white p-3">
      <div className="flex items-start gap-2">
        <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-slate-800">理解进度</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {blocks.length > 0
              ? `${ready} / ${blocks.length} 个复习块达到迁移或掌握`
              : '生成知识块路线后，这里会显示真正理解进度。'}
          </p>
        </div>
      </div>
      {blocks.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] font-bold text-slate-600">
          <span>未开始 {counts.not_started}</span>
          <span>看起来懂 {counts.recognition}</span>
          <span>能解释 {counts.explanation}</span>
          <span>能迁移 {counts.transfer}</span>
          <span className="col-span-2 text-emerald-700">已掌握 {counts.mastered}</span>
        </div>
      )}
    </div>
  );
}

/** 只读预测分：紧凑横条（小圆环 + 两行文案，高度较旧版明显降低） */
function PredictedScoreDisplay({ score, hasMap }: { score: number | null; hasMap: boolean }) {
  const pct = score ?? 0;
  const vb = 56;
  const cx = vb / 2;
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const desc = hasMap
    ? '基于掌握度模型加权；完成考前预测中的探测后将更新。初始未探测时分数可能偏低。'
    : '请先在左侧「生成本场考点图谱」。';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-white shrink-0">
      <div className="relative h-14 w-14 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${vb} ${vb}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e7e5e4" strokeWidth="5" />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="#4f46e5"
            strokeWidth="5"
            strokeDasharray={c}
            strokeDashoffset={hasMap ? offset : c}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-black leading-none text-indigo-900 tabular-nums">{hasMap ? pct : '—'}</span>
          <span className="mt-0.5 text-[8px] font-bold text-indigo-600/80">预测分</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-slate-800">本场掌握度预测</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500" title={desc}>
          {desc}
        </p>
      </div>
    </div>
  );
}

export const ExamWorkspacePage: React.FC<ExamWorkspacePageProps> = ({
  user,
  activeExamId,
  onActiveExamIdChange,
  onBack,
  onOpenExamHub,
  onEnterExamPrediction,
  onLoadMergedContent,
  onLoadProbeMaterialText,
  workspaceLsapContentMap,
  workspaceLsapState,
  predictedScore,
  onGenerateWorkspaceLsap,
  workspaceLsapGenerating,
  workspaceLsapProgress,
  workspaceAtomsProgress,
  workspaceAtomCoverage,
  onExtractLogicAtoms,
  workspaceAtomsGenerating,
  onWorkspaceAtomCoverageChange,
  onWorkspaceLsapStateCommit,
  workspaceDialogueTranscript,
  workspaceEvidenceAnnotations,
  workspaceLsapKey,
  onWorkspaceDialogueTranscriptChange,
  onWorkspaceEvidenceAnnotationsChange,
  workspaceKcGlossary,
  onWorkspaceGlossaryAppend,
  resolveExamMaterialPdf,
}) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [materials, setMaterials] = useState<ExamMaterialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [predictionBusy, setPredictionBusy] = useState(false);

  const [mergedContent, setMergedContent] = useState('');
  const [mergedLoading, setMergedLoading] = useState(false);
  const [mergedError, setMergedError] = useState<string | null>(null);

  const [selectedKcId, setSelectedKcId] = useState<string | null>(null);
  /**
   * 多选 KC 对话（阶段 1：仅声明，本阶段不被任何 effect/UI/handler 消费；
   * 阶段 2 接入 toggle 交互；阶段 3 接通对话与 atom coverage 分发）。
   * 与 selectedKcId 并存——单 KC 路径仍以 selectedKcId 为唯一驱动源。
   * 详见 docs/plans/MULTISELECT_KC_PLAN.md §3 阶段 1。
   */
  const [selectedKcIds, setSelectedKcIds] = useState<string[]>([]);
  const [selectedKnowledgeBlockId, setSelectedKnowledgeBlockId] = useState<string | null>(null);
  const [selectedKnowledgeBlockLectureKey, setSelectedKnowledgeBlockLectureKey] = useState<string | null>(null);
  const [knowledgeBlockFilter, setKnowledgeBlockFilter] = useState<KnowledgeBlockFilter>('all');
  const [activeKnowledgeBlockBriefCollapsed, setActiveKnowledgeBlockBriefCollapsed] = useState(false);
  const isMultiSelectMode = selectedKcIds.length >= 2;
  /** Tier3「满分细节」列表默认折叠；选中 Tier3 考点时自动展开以便看到选中态 */
  const [maxScoreDetailsOpen, setMaxScoreDetailsOpen] = useState(false);
  const [inspectKc, setInspectKc] = useState<LSAPKnowledgeComponent | null>(null);
  /** M4：结业探测弹窗 */
  const [probeKc, setProbeKc] = useState<LSAPKnowledgeComponent | null>(null);
  const [evidenceReportOpen, setEvidenceReportOpen] = useState(false);
  const [knowledgeBlockEvidenceOpen, setKnowledgeBlockEvidenceOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'chat' | 'glossary'>('chat');
  const [workspaceMode, setWorkspaceMode] = useState<'knowledge' | 'global'>('knowledge');
  const [pendingKnowledgeDraft, setPendingKnowledgeDraft] = useState<{ blockId: string; text: string } | null>(null);
  /** 大屏（lg+）是否展开右侧考点释义侧栏；与 mobileTab 独立，小屏仍用 tab 切换 */
  const [glossaryDesktopOpen, setGlossaryDesktopOpen] = useState(false);
  /** P0：大屏默认折叠讲义预览列，避免挤占对话区 */
  const [materialPreviewDesktopOpen, setMaterialPreviewDesktopOpen] = useState(false);
  /** 小屏：底部 Sheet 展示同一预览组件 */
  const [materialPreviewMobileOpen, setMaterialPreviewMobileOpen] = useState(false);
  /** P1：AI 引用链钮 → 与预览组件同步材料/页码（requestId 区分重复点击） */
  const previewJumpReqIdRef = useRef(0);
  const chatRef = useRef<ExamWorkspaceSocraticChatHandle>(null);
  const [previewJumpRequest, setPreviewJumpRequest] = useState<{
    linkId: string;
    page: number;
    requestId: number;
    /** P3 B：PDF 文本高亮摘录 */
    quote?: string;
    /** P3 C：回到对话锚点 */
    paragraphIndex?: number;
  } | null>(null);
  const [glossarySidebarLoading, setGlossarySidebarLoading] = useState(false);
  const [scoreDeltaToast, setScoreDeltaToast] = useState<number | null>(null);
  const prevPredictedRef = useRef<number | null>(null);

  /** 备考引用 1-1：DEV 或 ?debug=1 时允许打开 chunk 索引调试；默认不展开，避免挤占工作台 */
  const [chunkDebugAvailable, setChunkDebugAvailable] = useState(false);
  const [showChunkDebug, setShowChunkDebug] = useState(false);
  const [chunkIndexBusy, setChunkIndexBusy] = useState(false);
  const [chunkIndexMsg, setChunkIndexMsg] = useState<string | null>(null);
  const [chunkDebugId, setChunkDebugId] = useState('');
  const [chunkDebugPreview, setChunkDebugPreview] = useState<{
    materialLinkId: string;
    page: number;
    text500: string;
  } | null>(null);

  /** 备考引用 1-2：试检索（BM25 Top-K） */
  const [chunkRetrievalQuery, setChunkRetrievalQuery] = useState('');
  const [chunkRetrievalBusy, setChunkRetrievalBusy] = useState(false);
  const [chunkRetrievalResults, setChunkRetrievalResults] = useState<RetrievedChunk[] | null>(null);
  /** 1-3 调试：备考苏格拉底上一轮注入的 Top-K（与试检索独立） */
  const [lastSocraticChunkRetrieval, setLastSocraticChunkRetrieval] = useState<RetrievedChunk[] | null>(null);
  /** 1-4：debug 索引统计（已索引材料数、总 chunk） */
  const [chunkIndexStats, setChunkIndexStats] = useState<Awaited<ReturnType<typeof getExamChunkIndexStats>>>(null);
  /** 1-4：仅检索当前预览对应材料（需已有一次预览/链钮定位的 linkId） */
  const [chunkSearchOnlyPreviewMaterial, setChunkSearchOnlyPreviewMaterial] = useState(false);
  const autoChunkIndexKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setChunkDebugAvailable(
      import.meta.env.DEV ||
        (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1')
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [e, m] = await Promise.all([listExams(user), listExamMaterialLinks(user)]);
      setExams(e);
      setMaterials(m);
    } catch (err) {
      console.error(err);
      setExams([]);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** M4：预测分上升时短暂提示 +Δ（换考试时重置基准，避免误报） */
  useEffect(() => {
    prevPredictedRef.current = null;
  }, [activeExamId]);

  useEffect(() => {
    if (predictedScore == null) {
      prevPredictedRef.current = null;
      return;
    }
    const prev = prevPredictedRef.current;
    prevPredictedRef.current = predictedScore;
    if (prev != null && predictedScore > prev) {
      setScoreDeltaToast(predictedScore - prev);
      const t = window.setTimeout(() => setScoreDeltaToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [predictedScore]);

  useEffect(() => {
    if (!activeExamId || exams.length === 0) return;
    if (!exams.some((x) => x.id === activeExamId)) {
      onActiveExamIdChange(null);
    }
  }, [activeExamId, exams, onActiveExamIdChange]);

  const materialsForActive = useMemo(() => {
    if (!activeExamId) return [];
    return sortMaterialLinks(materials.filter((x) => x.examId === activeExamId));
  }, [activeExamId, materials]);

  const onOpenMaterialPage = useCallback(
    (materialId: string, page: number, opts?: { quote?: string; paragraphIndex?: number }) => {
      if (!materialsForActive.some((m) => m.id === materialId)) return;
      const p = Math.max(1, Math.floor(page));
      previewJumpReqIdRef.current += 1;
      setPreviewJumpRequest({
        linkId: materialId,
        page: p,
        requestId: previewJumpReqIdRef.current,
        quote: opts?.quote,
        paragraphIndex: opts?.paragraphIndex,
      });
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        setMaterialPreviewMobileOpen(true);
      } else {
        setMaterialPreviewDesktopOpen(true);
        setMaterialPreviewMobileOpen(false);
      }
    },
    [materialsForActive]
  );

  const handleBackToParagraph = useCallback(() => {
    const pi = previewJumpRequest?.paragraphIndex;
    if (pi == null) return;
    chatRef.current?.scrollToParagraphBlock(pi);
  }, [previewJumpRequest?.paragraphIndex]);

  const activeExam = useMemo(() => exams.find((e) => e.id === activeExamId) ?? null, [exams, activeExamId]);

  const disciplineBand: DisciplineBand = activeExam?.disciplineBand ?? 'unspecified';

  const kcsOrdered = useMemo(
    () => (workspaceLsapContentMap?.kcs?.length ? kcListOrdered(workspaceLsapContentMap.kcs) : []),
    [workspaceLsapContentMap]
  );

  /**
   * 按已关联材料分组：每份材料必有一节（0 个 KC 时仍显示分组 + 空态）；组内 kcListOrdered。
   * 无本场材料时，全部 KC 归入「未归属材料」一节（仅当有 KC 时渲染该节）。
   */
  const kcsGroupedByMaterial = useMemo(() => {
    if (!workspaceLsapContentMap) {
      return [] as Array<{ key: string; title: string; kcs: LSAPKnowledgeComponent[]; kind: 'material' | 'unassigned' }>;
    }

    const allKcs = workspaceLsapContentMap.kcs ?? [];

    if (materialsForActive.length === 0) {
      if (allKcs.length === 0) return [];
      return [
        {
          key: '__unassigned__',
          title: '未归属材料（本场合并 / 旧数据）',
          kcs: kcListOrdered(allKcs),
          kind: 'unassigned' as const,
        },
      ];
    }

    const byLinkId = new Map<string, LSAPKnowledgeComponent[]>();
    for (const m of materialsForActive) {
      byLinkId.set(m.id, []);
    }

    const orphans: LSAPKnowledgeComponent[] = [];
    for (const kc of allKcs) {
      const sid = kc.sourceLinkId;
      if (sid && byLinkId.has(sid)) {
        byLinkId.get(sid)!.push(kc);
      } else {
        orphans.push(kc);
      }
    }

    const groups: Array<{ key: string; title: string; kcs: LSAPKnowledgeComponent[]; kind: 'material' | 'unassigned' }> = [];
    for (const m of materialsForActive) {
      const raw = byLinkId.get(m.id) ?? [];
      groups.push({
        key: m.id,
        title: m.fileName,
        kcs: kcListOrdered(raw),
        kind: 'material',
      });
    }

    const orphanOrdered = kcListOrdered(orphans);
    if (orphanOrdered.length > 0) {
      groups.push({
        key: '__unassigned__',
        title: '未归属材料（本场合并 / 旧数据）',
        kcs: orphanOrdered,
        kind: 'unassigned',
      });
    }

    return groups;
  }, [workspaceLsapContentMap, materialsForActive]);

  const knowledgeBlocks = useMemo(
    () => buildKnowledgeBlocksFromGroups(kcsGroupedByMaterial),
    [kcsGroupedByMaterial]
  );

  const globalKnowledgeBlockOptions = useMemo<ExamGlobalKnowledgeBlockOption[]>(() => knowledgeBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    materialLinkId: materialsForActive.some((material) => material.id === block.materialKey)
      ? block.materialKey
      : null,
    pageWindows: block.pageWindows,
  })), [knowledgeBlocks, materialsForActive]);

  const activeKnowledgeBlock = useMemo(
    () => knowledgeBlocks.find((block) => block.id === selectedKnowledgeBlockId) ?? null,
    [knowledgeBlocks, selectedKnowledgeBlockId]
  );

  const activeKnowledgeBlockIndex = useMemo(
    () => knowledgeBlocks.findIndex((block) => block.id === selectedKnowledgeBlockId),
    [knowledgeBlocks, selectedKnowledgeBlockId]
  );

  useEffect(() => {
    setKnowledgeBlockEvidenceOpen(false);
  }, [activeKnowledgeBlock?.id]);

  useEffect(() => {
    if (workspaceMode !== 'knowledge' || !pendingKnowledgeDraft) return;
    if (selectedKnowledgeBlockId !== pendingKnowledgeDraft.blockId) return;
    const timer = window.setTimeout(() => {
      chatRef.current?.setDraft(pendingKnowledgeDraft.text);
      setPendingKnowledgeDraft(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceMode, pendingKnowledgeDraft, selectedKnowledgeBlockId]);

  const activeReviewScope = useMemo<ExamReviewScope | null>(() => {
    if (!activeKnowledgeBlock) return null;
    const materialLinkId = materialsForActive.some((m) => m.id === activeKnowledgeBlock.materialKey)
      ? activeKnowledgeBlock.materialKey
      : null;
    return {
      title: activeKnowledgeBlock.title,
      materialLinkId,
      materialTitle: activeKnowledgeBlock.materialTitle,
      pageRange: getPageRangeFromKcs(activeKnowledgeBlock.sourceKcs),
      pageWindows: activeKnowledgeBlock.pageWindows,
      pageLabel: activeKnowledgeBlock.pageLabel,
      sourceKcs: activeKnowledgeBlock.sourceKcs,
    };
  }, [activeKnowledgeBlock, materialsForActive]);

  const filteredKnowledgeBlocks = useMemo(() => {
    if (knowledgeBlockFilter === 'all') return knowledgeBlocks;
    return knowledgeBlocks.filter((block) => {
      const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
      const ready = isBlockReady(status);
      return knowledgeBlockFilter === 'ready' ? ready : !ready;
    });
  }, [knowledgeBlocks, knowledgeBlockFilter, workspaceAtomCoverage, workspaceLsapState]);

  const knowledgeBlockLectureProgress = useMemo(() => {
    const progress = new Map<string, { total: number; ready: number }>();
    for (const block of knowledgeBlocks) {
      const prev = progress.get(block.materialKey) ?? { total: 0, ready: 0 };
      const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
      progress.set(block.materialKey, {
        total: prev.total + 1,
        ready: prev.ready + (isBlockReady(status) ? 1 : 0),
      });
    }
    return progress;
  }, [knowledgeBlocks, workspaceAtomCoverage, workspaceLsapState]);

  const knowledgeBlockLectureGroups = useMemo<KnowledgeBlockLectureGroup[]>(() => {
    const groups: KnowledgeBlockLectureGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const block of knowledgeBlocks) {
      const key = block.materialKey;
      let groupIndex = indexByKey.get(key);
      if (groupIndex == null) {
        const progress = knowledgeBlockLectureProgress.get(key) ?? { total: 0, ready: 0 };
        groupIndex = groups.length;
        indexByKey.set(key, groupIndex);
        groups.push({
          key,
          title: block.materialTitle,
          blocks: [],
          total: progress.total,
          ready: progress.ready,
        });
      }
      groups[groupIndex].blocks.push(block);
    }
    return groups;
  }, [knowledgeBlocks, knowledgeBlockLectureProgress]);

  const filteredKnowledgeBlockGroups = useMemo<KnowledgeBlockLectureGroup[]>(() => {
    const groups: KnowledgeBlockLectureGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const block of filteredKnowledgeBlocks) {
      const key = block.materialKey;
      let groupIndex = indexByKey.get(key);
      if (groupIndex == null) {
        const progress = knowledgeBlockLectureProgress.get(key) ?? { total: 0, ready: 0 };
        groupIndex = groups.length;
        indexByKey.set(key, groupIndex);
        groups.push({
          key,
          title: block.materialTitle,
          blocks: [],
          total: progress.total,
          ready: progress.ready,
        });
      }
      groups[groupIndex].blocks.push(block);
    }
    return groups;
  }, [filteredKnowledgeBlocks, knowledgeBlockLectureProgress]);

  const activeKnowledgeBlockLectureGroup = useMemo(() => {
    return (
      knowledgeBlockLectureGroups.find((group) => group.key === selectedKnowledgeBlockLectureKey) ??
      (activeKnowledgeBlock
        ? knowledgeBlockLectureGroups.find((group) => group.key === activeKnowledgeBlock.materialKey)
        : null) ??
      knowledgeBlockLectureGroups[0] ??
      null
    );
  }, [knowledgeBlockLectureGroups, selectedKnowledgeBlockLectureKey, activeKnowledgeBlock]);

  const activeLectureBlocks = activeKnowledgeBlockLectureGroup?.blocks ?? [];
  const activeKnowledgeBlockLectureIndex = activeKnowledgeBlock
    ? activeLectureBlocks.findIndex((block) => block.id === activeKnowledgeBlock.id)
    : -1;

  const nextRecommendedBlock = useMemo(() => {
    if (knowledgeBlocks.length === 0) return null;
    return (
      knowledgeBlocks.find((block) => {
        const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
        return !isBlockReady(status);
      }) ?? knowledgeBlocks[0]
    );
  }, [knowledgeBlocks, workspaceAtomCoverage, workspaceLsapState]);

  const remainingKnowledgeBlockCount = useMemo(
    () =>
      knowledgeBlocks.filter((block) => {
        const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
        return !isBlockReady(status);
      }).length,
    [knowledgeBlocks, workspaceAtomCoverage, workspaceLsapState]
  );

  const readyKnowledgeBlockCount = knowledgeBlocks.length - remainingKnowledgeBlockCount;
  const routeCompletionPercent =
    knowledgeBlocks.length > 0 ? Math.round((readyKnowledgeBlockCount / knowledgeBlocks.length) * 100) : 0;
  const activeLectureRemainingBlockCount = useMemo(
    () =>
      activeLectureBlocks.filter((block) => {
        const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
        return !isBlockReady(status);
      }).length,
    [activeLectureBlocks, workspaceAtomCoverage, workspaceLsapState]
  );
  const activeLectureReadyBlockCount = activeLectureBlocks.length - activeLectureRemainingBlockCount;
  const activeLectureCompletionPercent =
    activeLectureBlocks.length > 0 ? Math.round((activeLectureReadyBlockCount / activeLectureBlocks.length) * 100) : 0;

  const nextRecommendedBlockInLecture = useMemo(() => {
    if (activeLectureBlocks.length === 0) return null;
    return (
      activeLectureBlocks.find((block) => {
        const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
        return !isBlockReady(status);
      }) ?? activeLectureBlocks[0]
    );
  }, [activeLectureBlocks, workspaceAtomCoverage, workspaceLsapState]);

  const activeKnowledgeBlockGoals = useMemo(
    () => (activeKnowledgeBlock ? getBlockMasteryGoals(activeKnowledgeBlock) : []),
    [activeKnowledgeBlock]
  );

  const activeKnowledgeBlockQuickPrompts = useMemo(
    () => (activeKnowledgeBlock ? getBlockQuickPrompts(activeKnowledgeBlock) : []),
    [activeKnowledgeBlock]
  );

  const miniIntegrationPrompt = useMemo(
    () => getMiniIntegrationPrompt(activeLectureBlocks, activeKnowledgeBlockLectureIndex),
    [activeLectureBlocks, activeKnowledgeBlockLectureIndex]
  );

  const routeClosureReference = useMemo(() => getRouteClosureReference(knowledgeBlocks), [knowledgeBlocks]);

  const routeWrapUpPrompt = useMemo(
    () => getRouteWrapUpPrompt(knowledgeBlocks, remainingKnowledgeBlockCount),
    [knowledgeBlocks, remainingKnowledgeBlockCount]
  );

  const examWorkspaceQuickPrompts = useMemo(
    () => [
      ...activeKnowledgeBlockQuickPrompts,
      ...(miniIntegrationPrompt ? [miniIntegrationPrompt] : []),
      ...(routeWrapUpPrompt ? [routeWrapUpPrompt] : []),
    ],
    [activeKnowledgeBlockQuickPrompts, miniIntegrationPrompt, routeWrapUpPrompt]
  );

  /** 渲染层拆分 Tier12 / Tier3；组内顺序与 `group.kcs`（kcListOrdered）一致 */
  const kcsGroupedWithTiers = useMemo(
    () =>
      kcsGroupedByMaterial.map((g) => ({
        ...g,
        kcsTier12: g.kcs.filter((kc) => {
          const t = getTierFromExamWeight(kc.examWeight);
          return t === 1 || t === 2;
        }),
        kcsTier3: g.kcs.filter((kc) => getTierFromExamWeight(kc.examWeight) === 3),
      })),
    [kcsGroupedByMaterial]
  );

  const globalAllTier3 = useMemo(
    () =>
      !!workspaceLsapContentMap?.kcs?.length &&
      workspaceLsapContentMap.kcs.every((k) => getTierFromExamWeight(k.examWeight) === 3),
    [workspaceLsapContentMap]
  );

  const totalTier3Count = useMemo(() => {
    if (!workspaceLsapContentMap?.kcs?.length) return 0;
    return workspaceLsapContentMap.kcs.reduce(
      (n, k) => n + (getTierFromExamWeight(k.examWeight) === 3 ? 1 : 0),
      0
    );
  }, [workspaceLsapContentMap]);

  /** 考点区摘要：仅在有图谱时展示；有考点时追加核心/重要/细节计数 */
  const kcPanelSummaryLine = useMemo(() => {
    if (!workspaceLsapContentMap) return null;
    const all = workspaceLsapContentMap.kcs ?? [];
    const m = all.length;
    let core = 0;
    let important = 0;
    let detail = 0;
    for (const k of all) {
      const t = getTierFromExamWeight(k.examWeight);
      if (t === 1) core++;
      else if (t === 2) important++;
      else detail++;
    }
    const tierSuffix = m > 0 ? ` · 核心 ${core} · 重要 ${important} · 细节 ${detail}` : '';
    if (materialsForActive.length > 0) {
      return `本场 ${materialsForActive.length} 份材料 · 共 ${m} 个考点${tierSuffix}`;
    }
    if (m > 0) {
      return `共 ${m} 个考点${tierSuffix}`;
    }
    return null;
  }, [workspaceLsapContentMap, materialsForActive]);

  useEffect(() => {
    if (!selectedKcId || !workspaceLsapContentMap?.kcs?.length) return;
    const kc = workspaceLsapContentMap.kcs.find((k) => k.id === selectedKcId);
    if (kc && getTierFromExamWeight(kc.examWeight) === 3) {
      setMaxScoreDetailsOpen(true);
    }
  }, [selectedKcId, workspaceLsapContentMap]);

  useEffect(() => {
    if (knowledgeBlocks.length === 0) {
      setSelectedKnowledgeBlockId((prev) => (prev == null ? prev : null));
      return;
    }
    setSelectedKnowledgeBlockId((prev) =>
      prev && knowledgeBlocks.some((block) => block.id === prev) ? prev : knowledgeBlocks[0].id
    );
  }, [knowledgeBlocks]);

  useEffect(() => {
    if (knowledgeBlockLectureGroups.length === 0) {
      setSelectedKnowledgeBlockLectureKey((prev) => (prev == null ? prev : null));
      return;
    }
    setSelectedKnowledgeBlockLectureKey((prev) =>
      prev && knowledgeBlockLectureGroups.some((group) => group.key === prev) ? prev : knowledgeBlockLectureGroups[0].key
    );
  }, [knowledgeBlockLectureGroups]);

  useEffect(() => {
    if (!activeKnowledgeBlock) return;
    const ids = activeKnowledgeBlock.sourceKcs.map((kc) => kc.id);
    setSelectedKcIds((prev) => {
      if (prev.length === ids.length && prev.every((id, index) => id === ids[index])) return prev;
      return ids;
    });
  }, [activeKnowledgeBlock]);

  /**
   * 多选 KC：默认 seed + 失效项过滤。
   * - 当 kcsOrdered 为空时清空 selectedKcIds
   * - 当 selectedKcIds 为空且 kcsOrdered 非空时，seed 为 [第一项]（与原"自动选第一个 KC"语义等价）
   * - 当 selectedKcIds 含已不存在的 KC（图谱重生成等）时，过滤掉
   */
  useEffect(() => {
    if (!kcsOrdered.length) {
      setSelectedKcIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setSelectedKcIds((prev) => {
      const validIds = new Set(kcsOrdered.map((k) => k.id));
      const filtered = prev.filter((id) => validIds.has(id));
      if (knowledgeBlocks.length > 0) {
        if (filtered.length === prev.length) return prev;
        return filtered;
      }
      if (filtered.length === 0) return [kcsOrdered[0].id];
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [kcsOrdered, knowledgeBlocks.length]);

  /**
   * selectedKcIds → selectedKcId 兼容同步（PLAN §2.1 兼容策略）。
   * length === 1 时同步等于该 id（让现有单 KC 路径继续工作）；
   * length === 0 或 >= 2 时，selectedKcId = null。
   */
  useEffect(() => {
    setSelectedKcId(selectedKcIds.length === 1 ? selectedKcIds[0] : null);
  }, [selectedKcIds]);

  const activeKcForChat = useMemo(() => {
    if (!workspaceLsapContentMap?.kcs?.length) return null;
    if (selectedKcIds.length !== 1) return null;
    return workspaceLsapContentMap.kcs.find((k) => k.id === selectedKcIds[0]) ?? null;
  }, [workspaceLsapContentMap, selectedKcIds]);

  /**
   * 阶段 3：解析 selectedKcIds 为 KC 对象数组（保持 contentMap 中的原序）。
   * - length === 0：[]（input 已禁用）
   * - length === 1：[活跃 KC]，但单 KC 路径仍由 activeKcForChat 驱动
   * - length >= 2：多选路径，SocraticChat 会用本数组构造 multiKcCtx 并分发 atom 覆盖
   */
  const selectedKcs = useMemo(() => {
    if (!workspaceLsapContentMap?.kcs?.length || selectedKcIds.length === 0) return [];
    const idSet = new Set(selectedKcIds);
    return workspaceLsapContentMap.kcs.filter((k) => idSet.has(k.id));
  }, [workspaceLsapContentMap, selectedKcIds]);

  useEffect(() => {
    if (!activeKcForChat) setGlossaryDesktopOpen(false);
  }, [activeKcForChat]);

  const glossaryEntriesForActiveKc = useMemo(() => {
    if (!activeKcForChat) return [];
    return workspaceKcGlossary[activeKcForChat.id] ?? [];
  }, [activeKcForChat, workspaceKcGlossary]);

  const chatSessionKey = useMemo(() => {
    const kcPart =
      selectedKcIds.length === 0
        ? 'none'
        : isMultiSelectMode
          ? `multi_${selectedKcIds.slice().sort().join('+')}`
          : selectedKcIds[0];
    return `${activeExamId ?? 'none'}_${disciplineBand}_${kcPart}`;
  }, [activeExamId, disciplineBand, selectedKcIds, isMultiSelectMode]);

  useEffect(() => {
    setLastSocraticChunkRetrieval(null);
  }, [chatSessionKey]);

  const refreshChunkIndexStats = useCallback(async () => {
    if (!workspaceLsapKey) {
      setChunkIndexStats(null);
      return;
    }
    try {
      const s = await getExamChunkIndexStats(workspaceLsapKey);
      setChunkIndexStats(s);
    } catch {
      setChunkIndexStats(null);
    }
  }, [workspaceLsapKey]);

  useEffect(() => {
    if (!showChunkDebug || !workspaceLsapKey) {
      setChunkIndexStats(null);
      return;
    }
    void refreshChunkIndexStats();
  }, [showChunkDebug, workspaceLsapKey, refreshChunkIndexStats, chunkIndexMsg]);

  const lastRetrievalMaterialDistribution = useMemo(() => {
    if (!lastSocraticChunkRetrieval?.length) return null;
    const m = new Map<string, number>();
    for (const r of lastSocraticChunkRetrieval) {
      const id = r.chunk.materialLinkId;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [lastSocraticChunkRetrieval]);

  useEffect(() => {
    if (!activeExamId || materialsForActive.length === 0) {
      setMergedContent('');
      setMergedError(null);
      setMergedLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setMergedLoading(true);
      setMergedError(null);
      try {
        const text = await onLoadMergedContent(materialsForActive);
        if (!cancelled) setMergedContent(text);
      } catch (e) {
        if (!cancelled) setMergedError(e instanceof Error ? e.message : '合并材料失败');
      } finally {
        if (!cancelled) setMergedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeExamId, materialsForActive, onLoadMergedContent]);

  const formatExamDate = (ts: number | null) => {
    if (ts == null) return '日期待定';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handlePredictionClick = async () => {
    if (!activeExamId || materialsForActive.length === 0) return;
    setPredictionBusy(true);
    try {
      await onEnterExamPrediction(materialsForActive);
    } finally {
      setPredictionBusy(false);
    }
  };

  const handleRebuildChunkIndex = useCallback(async () => {
    if (!workspaceLsapKey) {
      setChunkIndexMsg('workspaceKey 未就绪（请确认本场有材料）。');
      return;
    }
    if (materialsForActive.length === 0) {
      setChunkIndexMsg('本场无关联材料。');
      return;
    }
    setChunkIndexBusy(true);
    setChunkIndexMsg(null);
    setChunkDebugPreview(null);
    try {
      const { chunks, skippedLinks } = await buildExamMaterialChunkIndexForLinks(
        materialsForActive,
        resolveExamMaterialPdf
      );
      await saveExamMaterialChunkIndex(workspaceLsapKey, chunks);
      const ids = chunks.map((c) => c.chunkId);
      const sample: string[] = [];
      while (sample.length < Math.min(3, ids.length)) {
        const pick = ids[Math.floor(Math.random() * ids.length)]!;
        if (!sample.includes(pick)) sample.push(pick);
      }
      console.log(
        `[examChunkIndex] 本场 chunk 数=${chunks.length}，跳过材料=${skippedLinks.length}`,
        '示例 chunkId:',
        sample
      );
      setChunkIndexMsg(`已写入 ${chunks.length} 条 chunk（跳过 ${skippedLinks.length} 份材料）`);
      void refreshChunkIndexStats();
    } catch (e) {
      setChunkIndexMsg(e instanceof Error ? e.message : '重建失败');
    } finally {
      setChunkIndexBusy(false);
    }
  }, [workspaceLsapKey, materialsForActive, resolveExamMaterialPdf, refreshChunkIndexStats]);

  useEffect(() => {
    if (!workspaceLsapKey || materialsForActive.length === 0 || !workspaceLsapContentMap) return;
    const materialSignature = materialsForActive
      .map((m) => `${m.id}:${m.fileHash ?? m.cloudSessionId ?? m.addedAt}`)
      .join('|');
    const runKey = `${workspaceLsapKey}:${materialSignature}`;
    let cancelled = false;

    void (async () => {
      try {
        const stats = await getExamChunkIndexStats(workspaceLsapKey);
        const indexedIds = new Set(stats?.distinctMaterialLinkIds ?? []);
        const hasMissingMaterial = materialsForActive.some((m) => !indexedIds.has(m.id));
        if (stats && stats.totalChunks > 0 && !hasMissingMaterial) return;
        if (autoChunkIndexKeyRef.current === runKey) return;
        autoChunkIndexKeyRef.current = runKey;

        const { chunks, skippedLinks } = await buildExamMaterialChunkIndexForLinks(
          materialsForActive,
          resolveExamMaterialPdf
        );
        if (cancelled) return;
        await saveExamMaterialChunkIndex(workspaceLsapKey, chunks);
        if (cancelled) return;
        if (chunks.length > 0 || skippedLinks.length > 0) {
          setChunkIndexMsg(`已自动准备 ${chunks.length} 条材料索引（跳过 ${skippedLinks.length} 份材料）`);
        }
        void refreshChunkIndexStats();
      } catch (e) {
        console.warn('[examChunkIndex] auto build failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLsapKey, materialsForActive, workspaceLsapContentMap, resolveExamMaterialPdf, refreshChunkIndexStats]);

  const handleChunkDebugLookup = useCallback(async () => {
    if (!workspaceLsapKey || !chunkDebugId.trim()) return;
    setChunkIndexMsg(null);
    try {
      const chunks = await loadExamMaterialChunkIndex(workspaceLsapKey);
      if (!chunks || chunks.length === 0) {
        setChunkDebugPreview(null);
        setChunkIndexMsg('本地无索引，请先点击「重建本场 chunk 索引」');
        return;
      }
      const found = findChunkById(chunks, chunkDebugId.trim());
      if (!found) {
        setChunkDebugPreview(null);
        setChunkIndexMsg('未找到该 chunkId');
        return;
      }
      setChunkDebugPreview({
        materialLinkId: found.materialLinkId,
        page: found.page,
        text500: found.text.slice(0, 500),
      });
    } catch (e) {
      setChunkDebugPreview(null);
      setChunkIndexMsg(e instanceof Error ? e.message : '查询失败');
    }
  }, [workspaceLsapKey, chunkDebugId]);

  const handleChunkTrialRetrieve = useCallback(async () => {
    if (!workspaceLsapKey || !chunkRetrievalQuery.trim()) {
      setChunkRetrievalResults([]);
      return;
    }
    setChunkRetrievalBusy(true);
    try {
      const filterId =
        chunkSearchOnlyPreviewMaterial && previewJumpRequest?.linkId ? previewJumpRequest.linkId : undefined;
      const rows = await retrieveCandidateChunks({
        workspaceKey: workspaceLsapKey,
        query: chunkRetrievalQuery,
        materialLinkIdFilter: filterId,
      });
      setChunkRetrievalResults(rows);
    } finally {
      setChunkRetrievalBusy(false);
    }
  }, [workspaceLsapKey, chunkRetrievalQuery, chunkSearchOnlyPreviewMaterial, previewJumpRequest?.linkId]);

  const firstLink = materialsForActive[0];
  const hasLocalHash = materialsForActive.some((l) => l.sourceType === 'fileHash' && l.fileHash);
  const hasCloudOnly =
    materialsForActive.length > 0 &&
    !hasLocalHash &&
    materialsForActive.some((l) => l.sourceType === 'sessionId' && l.cloudSessionId);

  const contextBlocked = !activeExamId || materialsForActive.length === 0;
  const contextBlockedHint = !activeExamId
    ? '请先选择一场考试。'
    : '本场尚未关联材料。请打开「考试中心」为该考试添加 PDF。';

  const selectKnowledgeBlock = (block: ReviewKnowledgeBlock) => {
    setSelectedKnowledgeBlockLectureKey(block.materialKey);
    setSelectedKnowledgeBlockId(block.id);
    setSelectedKcIds(block.sourceKcs.map((kc) => kc.id));
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileTab('chat');
    }
  };

  const handleGlobalHandoffToKnowledgeBlock = (blockId: string, draft: string) => {
    const block = knowledgeBlocks.find((candidate) => candidate.id === blockId);
    if (!block) return;
    setPendingKnowledgeDraft({ blockId, text: draft });
    selectKnowledgeBlock(block);
    setWorkspaceMode('knowledge');
    setMobileTab('chat');
  };

  const selectKnowledgeBlockLecture = (lectureKey: string) => {
    const group = knowledgeBlockLectureGroups.find((item) => item.key === lectureKey);
    if (!group || group.blocks.length === 0) return;
    const target =
      group.blocks.find((block) => {
        const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
        return !isBlockReady(status);
      }) ?? group.blocks[0];
    selectKnowledgeBlock(target);
  };

  const openKnowledgeBlockSource = (block: ReviewKnowledgeBlock) => {
    const sourceKc = block.sourceKcs.find((kc) => kc.sourceLinkId && getEvidencePagesForKc(kc)[0] != null);
    const page = sourceKc ? getEvidencePagesForKc(sourceKc)[0] : null;
    if (!sourceKc?.sourceLinkId || page == null) return;
    onOpenMaterialPage(sourceKc.sourceLinkId, page);
  };

  const jumpKnowledgeBlockByOffset = (offset: number) => {
    const scope = activeLectureBlocks.length > 0 ? activeLectureBlocks : knowledgeBlocks;
    if (scope.length === 0) return;
    const currentIndex =
      activeLectureBlocks.length > 0 && activeKnowledgeBlockLectureIndex >= 0
        ? activeKnowledgeBlockLectureIndex
        : activeKnowledgeBlockIndex >= 0
          ? activeKnowledgeBlockIndex
          : 0;
    const nextIndex = Math.min(scope.length - 1, Math.max(0, currentIndex + offset));
    const next = scope[nextIndex];
    if (next) selectKnowledgeBlock(next);
  };

  const startClosedBookRebuild = (block: ReviewKnowledgeBlock) => {
    chatRef.current?.usePrompt(getClosedBookRebuildPrompt(block), {
      id: `closed-book-${block.id}`,
      label: '闭卷讲一遍',
      description: '先不看材料、不听提示，用自己的话重建这一块。',
    });
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileTab('chat');
    }
  };

  const renderRouteStatusPanel = () => {
    if (knowledgeBlocks.length === 0) return null;
    const lectureScoped = Boolean(activeKnowledgeBlockLectureGroup && activeLectureBlocks.length > 0);
    const allReady = lectureScoped ? activeLectureRemainingBlockCount === 0 : remainingKnowledgeBlockCount === 0;
    const focusBlock = allReady ? null : lectureScoped ? nextRecommendedBlockInLecture : nextRecommendedBlock;
    const status = focusBlock
      ? getBlockUnderstandingStatus(focusBlock, workspaceAtomCoverage, workspaceLsapState)
      : null;
    const statusMeta = status ? UNDERSTANDING_STATUS_META[status] : null;
    const selected = focusBlock?.id === selectedKnowledgeBlockId;
    const routeIndex = focusBlock
      ? lectureScoped
        ? activeLectureBlocks.findIndex((block) => block.id === focusBlock.id)
        : knowledgeBlocks.findIndex((block) => block.id === focusBlock.id)
      : -1;
    const statusScopeLabel = lectureScoped ? '本节状态' : '路线状态';
    const totalInScope = lectureScoped ? activeLectureBlocks.length : knowledgeBlocks.length;
    const readyInScope = lectureScoped ? activeLectureReadyBlockCount : readyKnowledgeBlockCount;
    const remainingInScope = lectureScoped ? activeLectureRemainingBlockCount : remainingKnowledgeBlockCount;
    const completionInScope = lectureScoped ? activeLectureCompletionPercent : routeCompletionPercent;

    return (
      <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">{statusScopeLabel}</p>
              <h3 className="mt-0.5 line-clamp-2 text-sm font-black leading-snug text-slate-900">
                {allReady
                  ? lectureScoped
                    ? '这一节已可输出'
                    : '所有知识块已可输出'
                  : `下一步：${focusBlock?.title ?? '继续推进路线'}`}
              </h3>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">
                {routeIndex >= 0 ? `${lectureScoped ? '本节' : '全场'}第 ${routeIndex + 1} / ${totalInScope} 块 · ` : ''}
                可输出 {readyInScope} · 待理解 {remainingInScope}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-black tabular-nums text-white">
            {completionInScope}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${completionInScope}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {statusMeta && status && focusBlock ? (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>
                {isBlockReady(status) ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                {statusMeta.label}
              </span>
              <button
                type="button"
                disabled={selected}
                onClick={() => selectKnowledgeBlock(focusBlock)}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:cursor-default disabled:bg-emerald-200"
              >
                {selected ? '正在看' : '跳到这一块'}
                {!selected && <ArrowRight className="h-3 w-3" />}
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              {lectureScoped ? '本节可以收尾' : '可以整场收尾'}
            </span>
          )}
        </div>
      </section>
    );
  };

  const renderActiveKnowledgeBlockBrief = () => {
    if (!activeKnowledgeBlock) return null;
    const status = getBlockUnderstandingStatus(activeKnowledgeBlock, workspaceAtomCoverage, workspaceLsapState);
    const statusMeta = UNDERSTANDING_STATUS_META[status];
    const coverage = getBlockCoverage(activeKnowledgeBlock, workspaceAtomCoverage);
    const pendingCount = pendingRevisitCount(workspaceEvidenceAnnotations, activeKnowledgeBlock.sourceKcs.map((kc) => kc.id));
    const completionChecks = getBlockCompletionChecks(status, coverage);
    const canOpenSource = activeKnowledgeBlock.sourceKcs.some((kc) => kc.sourceLinkId && getEvidencePagesForKc(kc)[0] != null);
    const currentLectureTitle = activeKnowledgeBlockLectureGroup?.title ?? activeKnowledgeBlock.materialTitle;
    const lecturePositionLabel =
      activeKnowledgeBlockLectureIndex >= 0 && activeLectureBlocks.length > 0
        ? `本节第 ${activeKnowledgeBlockLectureIndex + 1} / ${activeLectureBlocks.length} 块`
        : null;
    const globalPositionLabel =
      activeKnowledgeBlockIndex >= 0 ? `全场第 ${activeKnowledgeBlockIndex + 1} / ${knowledgeBlocks.length} 块` : null;
    const canGoPrevInLecture = activeKnowledgeBlockLectureIndex > 0;
    const canGoNextInLecture =
      activeKnowledgeBlockLectureIndex >= 0 && activeKnowledgeBlockLectureIndex < activeLectureBlocks.length - 1;

    if (activeKnowledgeBlockBriefCollapsed) {
      return (
        <section className="shrink-0 rounded-2xl border border-indigo-100 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="shrink-0 text-[10px] font-black uppercase tracking-wide text-indigo-500">当前知识块</p>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>
                  {status === 'transfer' || status === 'mastered' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {statusMeta.label}
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="min-w-0 max-w-full truncate text-sm font-black leading-snug text-slate-900">
                  {activeKnowledgeBlock.title}
                </h2>
                <span className="shrink-0 text-[11px] font-medium text-slate-500">
                  {lecturePositionLabel ?? globalPositionLabel}
                  {activeKnowledgeBlock.pageLabel ? ` · ${activeKnowledgeBlock.pageLabel}` : ''}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400" title={currentLectureTitle}>
                {currentLectureTitle}
              </p>
            </div>
            <button type="button" onClick={() => setKnowledgeBlockEvidenceOpen(true)} className="hidden shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums text-indigo-600 hover:bg-indigo-50 sm:inline-flex">
              证据 {coverage.covered}/{coverage.total || '—'}{pendingCount > 0 ? ` · 待回看 ${pendingCount}` : ''}
            </button>
            <button
              type="button"
              disabled={!canGoPrevInLecture}
              onClick={() => jumpKnowledgeBlockByOffset(-1)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一块
            </button>
            <button
              type="button"
              disabled={!canGoNextInLecture}
              onClick={() => jumpKnowledgeBlockByOffset(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一块
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setActiveKnowledgeBlockBriefCollapsed(false)}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
            >
              展开
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="shrink-0 rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm">
        {knowledgeBlockLectureGroups.length > 1 && (
          <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-500">当前 lecture</span>
              <select
                value={activeKnowledgeBlockLectureGroup?.key ?? ''}
                onChange={(e) => selectKnowledgeBlockLecture(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
              >
                {knowledgeBlockLectureGroups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.title}（{group.ready}/{group.total} 可输出）
                  </option>
                ))}
              </select>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
                {activeKnowledgeBlockLectureGroup?.total
                  ? Math.round((activeKnowledgeBlockLectureGroup.ready / activeKnowledgeBlockLectureGroup.total) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-indigo-500">当前知识块</p>
            <h2 className="mt-1 line-clamp-2 text-base font-black leading-snug text-slate-900">
              {activeKnowledgeBlock.title}
            </h2>
            <p className="mt-1 truncate text-[11px] font-medium text-slate-500" title={activeKnowledgeBlock.materialTitle}>
              {lecturePositionLabel ?? globalPositionLabel}
              {globalPositionLabel && lecturePositionLabel ? ` · ${globalPositionLabel}` : ''}
              {' · '}
              {currentLectureTitle}
              {activeKnowledgeBlock.pageLabel ? ` · ${activeKnowledgeBlock.pageLabel}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${statusMeta.className}`}>
                {status === 'transfer' || status === 'mastered' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                {statusMeta.label}
              </span>
              <button
                type="button"
                aria-expanded={true}
                onClick={() => setActiveKnowledgeBlockBriefCollapsed(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-stone-50"
              >
                收起
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </button>
            </div>
            <button type="button" onClick={() => setKnowledgeBlockEvidenceOpen(true)} className="rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums text-indigo-600 hover:bg-indigo-50">
              证据 {coverage.covered}/{coverage.total || '—'}{pendingCount > 0 ? ` · 待回看 ${pendingCount}` : ''}
            </button>
          </div>
        </div>

        {activeKnowledgeBlockGoals.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {activeKnowledgeBlockGoals.map((goal) => (
              <div key={goal} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2">
                <p className="text-xs leading-relaxed text-slate-700">{goal}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/70 px-3 py-2">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">本块完成标准</p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {completionChecks.map((check) => (
              <div key={check.label} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                {check.done ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                )}
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canOpenSource}
            onClick={() => openKnowledgeBlockSource(activeKnowledgeBlock)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BookOpen className="h-3.5 w-3.5" />
            打开材料依据
          </button>
          <button
            type="button"
            disabled={!workspaceLsapState || !mergedContent.trim() || mergedLoading || !!mergedError || !activeKnowledgeBlock.sourceKcs[0]}
            onClick={() => activeKnowledgeBlock.sourceKcs[0] && setProbeKc(activeKnowledgeBlock.sourceKcs[0])}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            做一次理解探测
          </button>
          <button
            type="button"
            disabled={!mergedContent.trim() || mergedLoading || !!mergedError}
            onClick={() => startClosedBookRebuild(activeKnowledgeBlock)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            闭卷讲一遍
          </button>
          <span className="text-[11px] text-slate-400">{statusMeta.nextAction}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={!canGoPrevInLecture}
              onClick={() => jumpKnowledgeBlockByOffset(-1)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一块
            </button>
            <button
              type="button"
              disabled={!canGoNextInLecture}
              onClick={() => jumpKnowledgeBlockByOffset(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一块
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
    );
  };

  const renderKnowledgeBlockCard = (block: ReviewKnowledgeBlock, index: number) => {
    const selected = block.id === selectedKnowledgeBlockId;
    const status = getBlockUnderstandingStatus(block, workspaceAtomCoverage, workspaceLsapState);
    const statusMeta = UNDERSTANDING_STATUS_META[status];
    const coverage = getBlockCoverage(block, workspaceAtomCoverage);
    const ready = status === 'transfer' || status === 'mastered';
    const keyConcepts = block.sourceKcs.slice(0, 3);
    return (
      <article
        key={block.id}
        className={`rounded-2xl border p-3 transition-colors ${
          selected
            ? 'border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-200'
            : 'border-stone-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
        }`}
      >
        <button type="button" onClick={() => selectKnowledgeBlock(block)} className="w-full text-left">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-black text-white">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-black leading-snug text-slate-900">{block.title}</h3>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}
                >
                  {ready ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  {statusMeta.label}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500" title={block.materialTitle}>
                {block.materialTitle}
                {block.pageLabel ? ` · ${block.pageLabel}` : ''}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            {keyConcepts.map((kc) => (
              <p key={kc.id} className="line-clamp-1 text-[11px] leading-snug text-slate-600">
                <span className="font-bold text-slate-800">{kc.concept}</span>
                {kc.reviewFocus ? `：${kc.reviewFocus}` : ''}
              </p>
            ))}
            {block.sourceKcs.length > keyConcepts.length && (
              <p className="text-[10px] font-bold text-slate-400">另含 {block.sourceKcs.length - keyConcepts.length} 个相关关键点</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2">
            <span className="text-[10px] font-bold text-slate-500">{statusMeta.nextAction}</span>
            <span className="text-[10px] tabular-nums text-slate-500">
              证据 {coverage.covered}/{coverage.total || '—'}
            </span>
          </div>
        </button>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {block.sourceKcs[0] && (
            <button
              type="button"
              onClick={() => setInspectKc(block.sourceKcs[0])}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              查看组成
            </button>
          )}
          {block.sourceKcs[0] && (
            <button
              type="button"
              disabled={!workspaceLsapState || !mergedContent.trim() || mergedLoading || !!mergedError}
              onClick={() => setProbeKc(block.sourceKcs[0])}
              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-700 hover:text-violet-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
            >
              <ClipboardCheck className="h-3 w-3 shrink-0" aria-hidden />
              理解探测
            </button>
          )}
        </div>
      </article>
    );
  };

  const renderWorkspaceKcCard = (kc: LSAPKnowledgeComponent) => {
    const selected = selectedKcIds.includes(kc.id);
    const { covered, total } = atomCoverageCounts(kc, workspaceAtomCoverage);
    const atomTotal = kc.atoms?.length ?? 0;
    return (
      <div key={kc.id} role="listitem">
        <div
          className={`w-full rounded-xl border px-3 py-2 transition-colors ${
            selected ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-stone-100 bg-stone-50/80'
          }`}
        >
          <button
            type="button"
            onClick={() =>
              setSelectedKcIds((prev) =>
                prev.includes(kc.id) ? prev.filter((id) => id !== kc.id) : [...prev, kc.id]
              )
            }
            className="w-full text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-slate-800 line-clamp-2 flex-1 min-w-0">{kc.concept}</p>
              <span className="text-[10px] tabular-nums text-slate-500 shrink-0">
                {atomTotal === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <>
                    {covered}/{total}
                  </>
                )}
              </span>
            </div>
            {kc.reviewFocus && (
              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{kc.reviewFocus}</p>
            )}
            {atomTotal === 0 && <p className="text-[10px] text-slate-400 mt-0.5">待提取原子</p>}
            <p className="text-[10px] text-slate-400 mt-1">未探测</p>
          </button>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInspectKc(kc);
              }}
              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              查看知识点
            </button>
            <button
              type="button"
              disabled={!workspaceLsapState || !mergedContent.trim() || mergedLoading || !!mergedError}
              title={!workspaceLsapState ? '请先生成本场考点图谱以启用 BKT' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setProbeKc(kc);
              }}
              className="text-[10px] font-bold text-violet-700 hover:text-violet-900 hover:underline inline-flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
            >
              <ClipboardCheck className="w-3 h-3 shrink-0" aria-hidden />
              结业探测
            </button>
          </div>
          {atomTotal > 0 && covered / atomTotal >= 0.85 && (
            <p className="text-[9px] text-emerald-700 mt-1 leading-snug">
              原子覆盖较高，可做结业探测巩固预测分（可选）
            </p>
          )}
        </div>
      </div>
    );
  };

  const leftColumn = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3 shrink-0">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">当前备考考试</h2>
        <select
          className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white"
          value={activeExamId ?? ''}
          onChange={(e) => onActiveExamIdChange(e.target.value || null)}
        >
          <option value="">— 请选择 —</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
              {e.examAt != null ? ` · ${formatExamDate(e.examAt)}` : ''}
            </option>
          ))}
        </select>
        {activeExam && (
          <div className="rounded-xl bg-stone-50 p-3 space-y-1 text-xs">
            <p className="font-bold text-slate-800">{activeExam.title}</p>
            <p className="flex items-center gap-2 text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {formatExamDate(activeExam.examAt)}
            </p>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 shrink-0 space-y-3">
          <UnderstandingProgressDisplay
            blocks={knowledgeBlocks}
            cov={workspaceAtomCoverage}
            state={workspaceLsapState}
          />
          {scoreDeltaToast != null && scoreDeltaToast > 0 && (
            <p className="self-end text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 shadow-sm animate-pulse">
              理解预测 +{scoreDeltaToast}
            </p>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <ListTree className="h-3.5 w-3.5 shrink-0" aria-hidden />
              知识块路线
            </h2>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              {workspaceLsapContentMap
                ? `本场 ${materialsForActive.length} 份材料 · ${knowledgeBlocks.length} 个复习块 · 后台 ${kcsOrdered.length} 个关键点`
                : '先生成路线，系统会把细碎考点合并成更适合复习的一块块内容。'}
            </p>
          </div>
          {renderRouteStatusPanel()}
          {knowledgeBlocks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {KNOWLEDGE_BLOCK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setKnowledgeBlockFilter(filter.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    knowledgeBlockFilter === filter.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-stone-200 bg-white text-slate-600 hover:bg-stone-50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!workspaceLsapContentMap ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
              <Layers3 className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">还没有知识块路线</p>
              <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-500">
                选择考试和材料后，先生成一条能拿来复习的路线。
              </p>
            </div>
          ) : knowledgeBlocks.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
              <p className="text-sm font-bold text-slate-700">这场考试暂时没有可用知识块</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">可以重新生成路线，或检查材料是否成功关联。</p>
            </div>
          ) : filteredKnowledgeBlocks.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
              <p className="text-sm font-bold text-slate-700">
                {knowledgeBlockFilter === 'ready' ? '还没有可输出的知识块' : '当前筛选下没有知识块'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                可以切回“全部”，或者先做一轮理解验证。
              </p>
            </div>
          ) : (
            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain pr-1"
              role="region"
              aria-label="知识块路线"
            >
              {filteredKnowledgeBlockGroups.map((group) => (
                <section key={group.key} className="space-y-2" aria-label={`${group.title} 的知识块`}>
                  <button
                    type="button"
                    onClick={() => selectKnowledgeBlockLecture(group.key)}
                    className={`sticky top-0 z-10 w-full rounded-xl border px-3 py-2 text-left shadow-sm backdrop-blur transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.99] ${
                      activeKnowledgeBlockLectureGroup?.key === group.key
                        ? 'border-indigo-200 bg-indigo-50/95'
                        : 'border-stone-100 bg-white/95 hover:border-indigo-100 hover:bg-indigo-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-xs font-black leading-snug text-slate-800" title={group.title}>
                          {group.title}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                          本节 {group.total} 块 · 可输出 {group.ready}
                          {knowledgeBlockFilter !== 'all' ? ` · 当前显示 ${group.blocks.length}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
                        {group.total > 0 ? Math.round((group.ready / group.total) * 100) : 0}%
                      </span>
                    </div>
                    {activeKnowledgeBlockLectureGroup?.key === group.key && (
                      <p className="mt-1 text-[10px] font-bold text-indigo-700">正在复习这一节</p>
                    )}
                  </button>
                  <div className="space-y-3">
                    {group.blocks.map((block) =>
                      renderKnowledgeBlockCard(
                        block,
                        Math.max(0, knowledgeBlocks.findIndex((candidate) => candidate.id === block.id))
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 shrink-0 space-y-2 border-t border-stone-100 pt-3">
          {activeExamId && materialsForActive.length === 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">本场暂无材料，请到考试中心关联。</p>
          )}
          <button
            type="button"
            disabled={!activeExamId || materialsForActive.length === 0 || workspaceLsapGenerating || mergedLoading}
            onClick={() => onGenerateWorkspaceLsap()}
            aria-busy={workspaceLsapGenerating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {workspaceLsapGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {workspaceLsapContentMap ? '重新生成知识块路线' : '生成知识块路线'}
          </button>
          {workspaceLsapGenerating && workspaceLsapProgress && (
            <div
              className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 space-y-1.5"
              role="status"
              aria-live="polite"
            >
              <p className="text-[11px] font-bold text-violet-900 leading-snug">
                正在生成路线：第 {workspaceLsapProgress.current} / {workspaceLsapProgress.total} 份 ·{' '}
                <span className="font-medium break-all">{workspaceLsapProgress.fileName}</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-violet-200">
                <div
                  className="h-full bg-violet-600 transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((100 * workspaceLsapProgress.current) / workspaceLsapProgress.total))}%`,
                  }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={
              !workspaceLsapContentMap ||
              !workspaceLsapContentMap.kcs?.length ||
              workspaceAtomsGenerating ||
              workspaceLsapGenerating ||
              mergedLoading
            }
            onClick={() => onExtractLogicAtoms()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {workspaceAtomsGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Braces className="h-4 w-4" />}
            增强理解检查
          </button>
          {workspaceAtomsGenerating && workspaceAtomsProgress && (
            <div
              className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 space-y-1.5"
              role="status"
              aria-live="polite"
            >
              <p className="text-[11px] font-bold text-indigo-900 leading-snug">
                正在增强理解检查：第 {workspaceAtomsProgress.current} / {workspaceAtomsProgress.total} 份 ·{' '}
                <span className="font-medium break-all">{workspaceAtomsProgress.fileName}</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-indigo-200">
                <div
                  className="h-full bg-indigo-600 transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((100 * workspaceAtomsProgress.current) / workspaceAtomsProgress.total))}%`,
                  }}
                />
              </div>
            </div>
          )}

          <details className="rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-bold text-slate-500">旧版工具（暂放旁边）</summary>
            <div className="mt-2 space-y-2">
              <PredictedScoreDisplay score={predictedScore} hasMap={!!workspaceLsapContentMap?.kcs?.length} />
              <p className="text-[10px] text-slate-500 leading-snug px-0.5">
                这部分还保留，但不再作为主复习路径。
              </p>
              {hasCloudOnly && (
                <p className="text-[10px] text-amber-900 bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-200 leading-snug">
                  关联均为云端时，请先恢复 PDF 或检查网络。
                </p>
              )}
              {materialsForActive.length > 0 && firstLink?.sourceType === 'fileHash' && (
                <p className="text-[10px] text-slate-500 px-0.5 truncate" title={firstLink.fileName}>
                  优先：{firstLink.fileName}
                </p>
              )}
              <button
                type="button"
                disabled={!activeExamId || materialsForActive.length === 0 || predictionBusy}
                aria-busy={predictionBusy}
                onClick={handlePredictionClick}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {predictionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                进入旧版考前预测
              </button>
            </div>
          </details>
        </div>
      </section>

    </div>
  );

  const chatColumn = (
    <div className="flex min-h-0 flex-1 min-w-0 flex-col gap-2 overflow-hidden">
      {renderActiveKnowledgeBlockBrief()}
      <div className="flex min-h-0 flex-1 min-w-0 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-3">
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:min-w-[min(100%,360px)] ${
            mobileTab === 'glossary' ? 'max-lg:hidden' : 'max-lg:flex'
          } lg:flex`}
        >
          <ExamWorkspaceSocraticChat
            ref={chatRef}
            key={chatSessionKey}
            sessionKey={chatSessionKey}
            workspaceDialogueTranscript={workspaceDialogueTranscript}
            evidenceAnnotations={workspaceEvidenceAnnotations}
            onEvidenceAnnotationsChange={onWorkspaceEvidenceAnnotationsChange}
            mergedContent={mergedContent}
            mergedLoading={mergedLoading}
            mergedError={mergedError}
            contextBlocked={contextBlocked}
            contextBlockedHint={contextBlockedHint}
            disciplineBand={disciplineBand}
            examTitle={activeExam?.title ?? ''}
            focusLabel={activeKnowledgeBlock?.title}
            focusKeyPoints={activeKnowledgeBlockGoals}
            routeClosureReference={routeClosureReference}
            quickPrompts={examWorkspaceQuickPrompts}
            activeKc={activeKcForChat}
            workspaceAtomCoverage={workspaceAtomCoverage}
            onAtomCoverageChange={onWorkspaceAtomCoverageChange}
            onDialogueTranscriptChange={onWorkspaceDialogueTranscriptChange}
            kcGlossaryForActiveKc={glossaryEntriesForActiveKc}
            onGlossaryAppend={onWorkspaceGlossaryAppend}
            onGlossaryDefiningChange={setGlossarySidebarLoading}
            materials={materialsForActive}
            onOpenMaterialPage={onOpenMaterialPage}
            workspaceLsapKey={workspaceLsapKey}
            onChunkRetrievalRound={({ retrieved }) => {
              setLastSocraticChunkRetrieval(retrieved.length > 0 ? retrieved : null);
            }}
            chunkRetrievalMaterialLinkIdFilter={
              chunkSearchOnlyPreviewMaterial && previewJumpRequest?.linkId ? previewJumpRequest.linkId : null
            }
            reviewScope={activeReviewScope}
            noKcSelected={selectedKcIds.length === 0}
            selectedKcs={selectedKcs}
            workspaceLsapContentMap={workspaceLsapContentMap}
          />
        </div>
        {/* P0：讲义预览（大屏默认折叠；与对话、考点释义并排） */}
        {materialPreviewDesktopOpen && (
          <div className="hidden h-full min-h-0 w-full shrink-0 flex-col overflow-hidden lg:flex lg:w-[min(100%,380px)] lg:min-w-[260px] lg:max-w-[380px] lg:flex-none">
            <ExamWorkspaceMaterialPreview
              materials={materialsForActive}
              resolveExamMaterialPdf={resolveExamMaterialPdf}
              previewJumpRequest={previewJumpRequest}
              onBackToParagraph={previewJumpRequest?.paragraphIndex != null ? handleBackToParagraph : undefined}
              className="min-h-0 flex-1 flex flex-col"
            />
          </div>
        )}
        <div
          id="exam-workspace-kc-glossary-panel"
          className={`flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col lg:w-[min(100%,240px)] lg:min-w-[220px] lg:max-w-[240px] ${
            mobileTab === 'glossary' ? 'max-lg:flex' : 'max-lg:hidden'
          } ${glossaryDesktopOpen ? 'lg:flex' : 'lg:hidden'}`}
        >
          <KcGlossarySidebar
            activeKc={activeKcForChat}
            entries={glossaryEntriesForActiveKc}
            loading={glossarySidebarLoading}
          />
        </div>
      </div>
    </div>
  );

  const globalChatColumn = activeExamId && activeExam ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ExamWorkspaceGlobalChat
          key={`exam-global-${activeExamId}`}
          user={user}
          examId={activeExamId}
          examTitle={activeExam.title}
          materials={materialsForActive}
          workspaceKey={workspaceLsapKey}
          contentMap={workspaceLsapContentMap}
          knowledgeBlocks={globalKnowledgeBlockOptions}
          resolveExamMaterialPdf={resolveExamMaterialPdf}
          onOpenMaterialPage={onOpenMaterialPage}
          onHandoffToKnowledgeBlock={handleGlobalHandoffToKnowledgeBlock}
        />
      </div>
      {materialPreviewDesktopOpen && (
        <div className="hidden h-full min-h-0 w-full shrink-0 flex-col overflow-hidden lg:flex lg:w-[min(100%,420px)] lg:min-w-[280px] lg:max-w-[420px] lg:flex-none">
          <ExamWorkspaceMaterialPreview
            materials={materialsForActive}
            resolveExamMaterialPdf={resolveExamMaterialPdf}
            previewJumpRequest={previewJumpRequest}
            className="min-h-0 flex-1 flex flex-col"
          />
        </div>
      )}
    </div>
  ) : null;

  return (
    /* 视口高度 + overflow-hidden：避免对话撑开整页；main 内 flex-1 min-h-0 链传递到消息列表 */
    <div
      className={`flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#FFFBF7] ${
        showChunkDebug ? 'pb-[min(56vh,420px)] max-lg:pb-[min(60vh,420px)]' : ''
      }`}
    >
      <header className="shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-100 text-slate-700 text-sm font-bold hover:bg-stone-200"
        >
          <ArrowLeft className="w-4 h-4" />
          返回学习界面
        </button>
        <div className="flex items-center gap-2 text-slate-800 min-w-0">
          <GraduationCap className="w-6 h-6 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              备考工作台 · {workspaceMode === 'knowledge' ? '知识块理解' : '整场考试对话'}
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {workspaceMode === 'knowledge' ? '知识块路线 · 理解验证 · 材料证据' : '全部考试材料 · 自由提问 · 原文页码'}
            </p>
          </div>
        </div>
        <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1" role="tablist" aria-label="备考工作台模式">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'knowledge'}
            onClick={() => setWorkspaceMode('knowledge')}
            className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${workspaceMode === 'knowledge' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            知识块理解
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === 'global'}
            onClick={() => setWorkspaceMode('global')}
            className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${workspaceMode === 'global' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            整场考试对话
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMaterialPreviewDesktopOpen((o) => !o)}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-slate-700 bg-white border border-stone-200 hover:bg-stone-50"
            title={materialPreviewDesktopOpen ? '收起侧栏讲义预览' : '展开侧栏讲义预览'}
          >
            {materialPreviewDesktopOpen ? (
              <PanelRightClose className="w-4 h-4 shrink-0" />
            ) : (
              <PanelRightOpen className="w-4 h-4 shrink-0" />
            )}
            {materialPreviewDesktopOpen ? '收起讲义预览' : '展开讲义预览'}
          </button>
          <button
            type="button"
            onClick={() => setMaterialPreviewMobileOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-slate-700 bg-white border border-stone-200 hover:bg-stone-50"
          >
            <FileText className="w-4 h-4 shrink-0" />
            讲义预览
          </button>
          {workspaceMode === 'knowledge' && <button
            type="button"
            disabled={!activeKcForChat}
            title={!activeKcForChat ? '请选择单个关键点后再查看术语释义' : undefined}
            aria-expanded={glossaryDesktopOpen}
            aria-controls="exam-workspace-kc-glossary-panel"
            onClick={() => setGlossaryDesktopOpen((o) => !o)}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-50"
          >
            <BookMarked className="w-4 h-4 shrink-0" />
            {glossaryDesktopOpen ? '收起术语释义' : '展开术语释义'}
          </button>}
          {workspaceMode === 'knowledge' && <button
            type="button"
            disabled={!workspaceLsapContentMap || !workspaceLsapState}
            title={!workspaceLsapContentMap ? '请先生成本场考点图谱' : undefined}
            onClick={() => setEvidenceReportOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            <FileText className="w-4 h-4" />
            学习证据
          </button>}
          <button
            type="button"
            onClick={onOpenExamHub}
            className="text-sm font-bold text-violet-700 hover:underline"
          >
            考试中心
          </button>
          {chunkDebugAvailable && (
            <button
              type="button"
              onClick={() => setShowChunkDebug((open) => !open)}
              aria-expanded={showChunkDebug}
              title={showChunkDebug ? '收起 chunk 调试面板' : '打开 chunk 调试面板'}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-slate-700 bg-stone-100 border border-stone-200 hover:bg-stone-200"
            >
              <Database className="w-4 h-4 shrink-0" />
              {showChunkDebug ? '收起 chunk 调试' : 'chunk 调试'}
            </button>
          )}
        </div>
      </header>

      <KnowledgePointInspectPanel kc={inspectKc} open={!!inspectKc} onClose={() => setInspectKc(null)} />

      {activeKnowledgeBlock && (
        <KnowledgeBlockEvidenceDrawer
          open={knowledgeBlockEvidenceOpen}
          title={activeKnowledgeBlock.title}
          kcs={activeKnowledgeBlock.sourceKcs}
          coverage={workspaceAtomCoverage}
          transcript={workspaceDialogueTranscript}
          annotations={workspaceEvidenceAnnotations}
          currentUserTurnCount={workspaceDialogueTranscript.filter((turn) => turn.role === 'user' && turn.sessionKey === chatSessionKey).length}
          onAnnotationsChange={onWorkspaceEvidenceAnnotationsChange}
          onClose={() => setKnowledgeBlockEvidenceOpen(false)}
          onJumpToTurn={(turnId) => {
            setKnowledgeBlockEvidenceOpen(false);
            requestAnimationFrame(() => chatRef.current?.scrollToTurn(turnId));
          }}
          onAskNow={(annotation) => {
            setKnowledgeBlockEvidenceOpen(false);
            requestAnimationFrame(() => chatRef.current?.askRevisitNow(annotation.id));
          }}
          onOpenSourcePage={(kc, page) => {
            if (!kc.sourceLinkId) return;
            setKnowledgeBlockEvidenceOpen(false);
            onOpenMaterialPage(kc.sourceLinkId, page);
          }}
          onEnhanceEvidence={() => onExtractLogicAtoms({ preserveExistingAtoms: true })}
          enhancingEvidence={workspaceAtomsGenerating}
        />
      )}

      {evidenceReportOpen && workspaceLsapContentMap && workspaceLsapState && (
        <WorkspaceEvidenceReportModal
          open
          onClose={() => setEvidenceReportOpen(false)}
          examTitle={activeExam?.title ?? ''}
          workspaceKeyShort={workspaceLsapKey ? workspaceLsapKey.slice(-12) : '—'}
          contentMap={workspaceLsapContentMap}
          state={workspaceLsapState}
          predictedScore={predictedScore}
          dialogueTranscript={workspaceDialogueTranscript}
        />
      )}

      {probeKc && workspaceLsapContentMap && workspaceLsapState && (
        <WorkspaceKcProbeModal
          open
          onClose={() => setProbeKc(null)}
          mergedContent={mergedContent}
          onLoadProbeMaterialText={onLoadProbeMaterialText}
          contentMap={workspaceLsapContentMap}
          kc={probeKc}
          workspaceLsapState={workspaceLsapState}
          onCommit={(next) => {
            onWorkspaceLsapStateCommit(next);
          }}
        />
      )}

      <main className="mx-auto flex min-h-0 w-full max-w-[min(100%,1600px)] flex-1 flex-col overflow-hidden p-4 sm:p-5 lg:p-6 xl:p-8 2xl:px-10">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
            加载考试与材料…
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center space-y-4 max-w-xl mx-auto">
            <p className="text-slate-600">还没有创建任何考试。</p>
            <p className="text-sm text-slate-500">请先在考试中心创建考试，并为考试关联 PDF（本地或云端）。</p>
            <button
              type="button"
              onClick={onOpenExamHub}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm"
            >
              去创建考试并关联 PDF
            </button>
          </div>
        ) : workspaceMode === 'global' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {globalChatColumn}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-1.5 lg:hidden mb-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setMobileTab('sidebar')}
                className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'sidebar' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
              >
                知识块路线
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'chat' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
              >
                理解验证
              </button>
              {activeKcForChat && (
                <button
                  type="button"
                  onClick={() => setMobileTab('glossary')}
                  aria-label="术语释义"
                  className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'glossary' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
                >
                  术语释义
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:gap-6 xl:gap-8">
              <aside
                className={`flex min-h-0 flex-col overflow-y-auto max-lg:min-h-0 max-lg:flex-1 lg:w-[min(100%,280px)] lg:shrink-0 ${
                  mobileTab === 'sidebar' ? 'flex' : 'hidden'
                } lg:flex`}
              >
                {leftColumn}
              </aside>

              <section
                className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
                  mobileTab === 'sidebar' ? 'hidden' : 'flex'
                } lg:flex`}
              >
                {chatColumn}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* 小屏：讲义预览底部 Sheet（与桌面侧栏共用组件） */}
      {showChunkDebug && (
        <div className="fixed bottom-0 left-0 right-0 z-[90] border-t border-stone-200 bg-white/95 px-3 py-2 text-xs shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur max-h-[min(52vh,480px)] overflow-y-auto">
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="font-bold text-slate-700">chunk 索引（debug）</span>
              <button
                type="button"
                onClick={() => setShowChunkDebug(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-stone-50"
              >
                <X className="h-3 w-3" />
                收起
              </button>
              <button
                type="button"
                disabled={chunkIndexBusy || !workspaceLsapKey || materialsForActive.length === 0}
                onClick={() => void handleRebuildChunkIndex()}
                className="sm:hidden inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
              >
                {chunkIndexBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                重建本场 chunk 索引
              </button>
              {chunkIndexMsg && <span className="text-slate-600 break-words">{chunkIndexMsg}</span>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xl">
              <label className="text-[10px] font-bold text-slate-500">按 chunkId 查询（materialLinkId__p页__c序号）</label>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2 py-1.5 font-mono text-[11px]"
                  value={chunkDebugId}
                  onChange={(e) => setChunkDebugId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleChunkDebugLookup();
                  }}
                  placeholder="例如 xxx__p1__c0"
                />
                <button
                  type="button"
                  onClick={() => void handleChunkDebugLookup()}
                  className="shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-stone-50"
                >
                  查询
                </button>
              </div>
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
              {chunkIndexStats != null && (
                <span>
                  已索引材料 <strong className="text-slate-800">{chunkIndexStats.distinctMaterialLinkIds.length}</strong> 份 · 总 chunk{' '}
                  <strong className="text-slate-800">{chunkIndexStats.totalChunks}</strong>
                </span>
              )}
              <label className="inline-flex cursor-pointer select-none items-center gap-1.5">
                <input
                  type="checkbox"
                  className="rounded border-stone-300"
                  checked={chunkSearchOnlyPreviewMaterial}
                  onChange={(e) => setChunkSearchOnlyPreviewMaterial(e.target.checked)}
                />
                仅检索当前预览材料
              </label>
              {chunkSearchOnlyPreviewMaterial && !previewJumpRequest?.linkId && (
                <span className="text-amber-800">请先打开预览或点链钮定位某一 PDF</span>
              )}
            </div>
          </div>
          {chunkDebugPreview && (
            <div className="mx-auto mt-2 max-w-6xl rounded-lg border border-stone-100 bg-stone-50 p-2 text-[11px] text-slate-700">
              <p>
                <span className="font-bold">materialLinkId：</span>
                <span className="break-all font-mono">{chunkDebugPreview.materialLinkId}</span>
              </p>
              <p>
                <span className="font-bold">page：</span> {chunkDebugPreview.page}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">
                <span className="font-bold">text（前 500 字）：</span>
                {chunkDebugPreview.text500}
              </p>
            </div>
          )}

          <div className="mx-auto mt-3 max-w-6xl border-t border-stone-100 pt-3">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
              <Search className="h-3.5 w-3.5 shrink-0" />
              试检索（BM25 Top-K，默认 8）
              <span className="font-normal text-slate-400">
                （MVP：query 为手动输入；1-3 可改为「用户当前输入」或拼接助手回复前 200 字）
              </span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500">query</label>
                <textarea
                  className="min-h-[56px] w-full resize-y rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-slate-800"
                  value={chunkRetrievalQuery}
                  onChange={(e) => setChunkRetrievalQuery(e.target.value)}
                  placeholder="输入课程关键词或句子…"
                />
              </div>
              <button
                type="button"
                disabled={chunkRetrievalBusy || !workspaceLsapKey || !chunkRetrievalQuery.trim()}
                onClick={() => void handleChunkTrialRetrieve()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 disabled:opacity-40"
              >
                {chunkRetrievalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                试检索
              </button>
            </div>
            {chunkRetrievalResults && chunkRetrievalResults.length > 0 && (
              <ul className="mt-2 max-h-[28vh] space-y-2 overflow-y-auto rounded-lg border border-indigo-100 bg-indigo-50/40 p-2 text-[11px] text-slate-700">
                {chunkRetrievalResults.map((r, i) => (
                  <li key={r.chunk.chunkId} className="rounded border border-stone-100 bg-white p-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-600">
                      <span>
                        <span className="font-bold text-slate-500">#</span>
                        {i + 1}
                      </span>
                      <span className="break-all">
                        <span className="font-bold text-slate-500">chunkId</span> {r.chunk.chunkId}
                      </span>
                      <span>
                        <span className="font-bold text-slate-500">score</span> {r.score.toFixed(4)}
                      </span>
                      <span>
                        <span className="font-bold text-slate-500">page</span> {r.chunk.page}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                      {r.chunk.text.slice(0, 200)}
                      {r.chunk.text.length > 200 ? '…' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {chunkRetrievalResults && chunkRetrievalResults.length === 0 && chunkRetrievalQuery.trim() && !chunkRetrievalBusy && (
              <p className="mt-2 text-[11px] text-slate-500">无命中（请先重建索引，或换关键词）。</p>
            )}

            {lastSocraticChunkRetrieval && lastSocraticChunkRetrieval.length > 0 && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-[10px] text-slate-700">
                <p className="mb-1.5 font-bold text-emerald-900">
                  上一轮苏格拉底注入（Top-{Math.min(DEFAULT_TOP_K, lastSocraticChunkRetrieval.length)}，chunkId + score）
                </p>
                {lastRetrievalMaterialDistribution && lastRetrievalMaterialDistribution.size > 0 && (
                  <p className="mb-1.5 font-medium text-emerald-900/95">
                    <span className="font-bold">material 分布：</span>
                    {[...lastRetrievalMaterialDistribution.entries()].map(([id, n]) => {
                      const fn = materialsForActive.find((m) => m.id === id)?.fileName ?? id;
                      const short = fn.length > 28 ? `${fn.slice(0, 26)}…` : fn;
                      return (
                        <span key={id} className="mr-2 inline-block">
                          {short} ×{n}
                        </span>
                      );
                    })}
                  </p>
                )}
                <ul className="max-h-[22vh] space-y-1 overflow-y-auto font-mono text-[10px] break-all">
                  {lastSocraticChunkRetrieval.map((r) => (
                    <li key={r.chunk.chunkId}>
                      <span className="tabular-nums text-slate-500">{r.score.toFixed(4)}</span> <span className="text-slate-800">{r.chunk.chunkId}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {materialPreviewMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[100] flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="讲义预览"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMaterialPreviewMobileOpen(false)}
            aria-label="关闭讲义预览"
          />
          <div className="relative flex max-h-[88vh] min-h-[36vh] flex-col overflow-hidden rounded-t-2xl border-t border-stone-200 bg-[#FFFBF7] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-3">
              <span className="text-sm font-bold text-slate-800">讲义预览（P0 手动）</span>
              <button
                type="button"
                onClick={() => setMaterialPreviewMobileOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-stone-100"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <ExamWorkspaceMaterialPreview
                materials={materialsForActive}
                resolveExamMaterialPdf={resolveExamMaterialPdf}
                previewJumpRequest={previewJumpRequest}
                onBackToParagraph={previewJumpRequest?.paragraphIndex != null ? handleBackToParagraph : undefined}
                className="h-full min-h-0 border-0 shadow-none flex flex-col"
                canvasScrollClassName="flex-1 min-h-0 max-h-[min(72vh,640px)]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
