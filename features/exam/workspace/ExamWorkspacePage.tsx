/**
 * M1 备考工作台：左栏 KC（含本场掌握度预测与考前预测入口）+ 中苏格拉底对话
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
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
} from 'lucide-react';
import type {
  AtomCoverageByKc,
  DisciplineBand,
  Exam,
  ExamMaterialLink,
  KcGlossaryEntry,
  LSAPContentMap,
  LSAPKnowledgeComponent,
  LSAPState,
  RetrievedChunk,
} from '@/types';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { ExamWorkspaceSocraticChat, type ExamWorkspaceSocraticChatHandle } from '@/features/exam/workspace/ExamWorkspaceSocraticChat';
import { KcGlossarySidebar } from '@/features/exam/workspace/KcGlossarySidebar';
import { KnowledgePointInspectPanel } from '@/features/exam/workspace/KnowledgePointInspectPanel';
import { WorkspaceKcProbeModal } from '@/features/exam/workspace/WorkspaceKcProbeModal';
import { WorkspaceEvidenceReportModal } from '@/features/exam/workspace/WorkspaceEvidenceReportModal';
import { ExamWorkspaceMaterialPreview } from '@/features/exam/workspace/ExamWorkspaceMaterialPreview';
import type { WorkspaceDialogueTurn } from '@/features/exam/lib/examWorkspaceLsapKey';
import { buildExamMaterialChunkIndexForLinks, findChunkById } from '@/features/exam/lib/examChunkIndex';
import { getExamChunkIndexStats, loadExamMaterialChunkIndex, saveExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import { DEFAULT_TOP_K, retrieveCandidateChunks } from '@/features/exam/lib/examChunkRetrieval';

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
  onExtractLogicAtoms: () => Promise<void>;
  workspaceAtomsGenerating: boolean;
  /** M3：原子覆盖更新（持久化由 App 完成） */
  onWorkspaceAtomCoverageChange: (next: AtomCoverageByKc) => void;
  /** M4：结业探测后提交 LSAPState（含 BKT / probeHistory / 预测分） */
  onWorkspaceLsapStateCommit: (next: LSAPState) => void;
  /** M5：对话留痕 + 报告 */
  workspaceDialogueTranscript: WorkspaceDialogueTurn[];
  workspaceLsapKey: string | null;
  onWorkspaceDialogueTranscriptChange: (turns: WorkspaceDialogueTurn[], chatSessionKey: string) => void;
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
  return [...kcs].sort((a, b) => (b.examWeight || 0) - (a.examWeight || 0));
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
  workspaceLsapKey,
  onWorkspaceDialogueTranscriptChange,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isMultiSelectMode = selectedKcIds.length >= 1;
  /** M3：勾选后对话不锚定 KC，行为同 M3 前；默认不勾选（锚定考点，默认第一项 KC） */
  const [wholeBookMode, setWholeBookMode] = useState(false);
  /** Tier3「满分细节」列表默认折叠；选中 Tier3 考点时自动展开以便看到选中态 */
  const [maxScoreDetailsOpen, setMaxScoreDetailsOpen] = useState(false);
  const [inspectKc, setInspectKc] = useState<LSAPKnowledgeComponent | null>(null);
  /** M4：结业探测弹窗 */
  const [probeKc, setProbeKc] = useState<LSAPKnowledgeComponent | null>(null);
  const [evidenceReportOpen, setEvidenceReportOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'chat' | 'glossary'>('chat');
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

  /** 备考引用 1-1：DEV 或 ?debug=1 时显示 chunk 索引重建与查询 */
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

  useEffect(() => {
    setShowChunkDebug(
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
    if (!kcsOrdered.length) {
      setSelectedKcId(null);
      return;
    }
    if (!wholeBookMode) {
      setSelectedKcId((prev) => {
        if (prev && kcsOrdered.some((k) => k.id === prev)) return prev;
        return kcsOrdered[0].id;
      });
    }
  }, [kcsOrdered, wholeBookMode]);

  useEffect(() => {
    if (wholeBookMode && mobileTab === 'glossary') setMobileTab('chat');
  }, [wholeBookMode, mobileTab]);

  useEffect(() => {
    if (wholeBookMode) setGlossaryDesktopOpen(false);
  }, [wholeBookMode]);

  const activeKcForChat = useMemo(() => {
    if (wholeBookMode || !workspaceLsapContentMap?.kcs?.length) return null;
    const id = selectedKcId ?? kcsOrdered[0]?.id;
    if (!id) return null;
    return workspaceLsapContentMap.kcs.find((k) => k.id === id) ?? null;
  }, [wholeBookMode, workspaceLsapContentMap, selectedKcId, kcsOrdered]);

  useEffect(() => {
    if (!activeKcForChat) setGlossaryDesktopOpen(false);
  }, [activeKcForChat]);

  const glossaryEntriesForActiveKc = useMemo(() => {
    if (!activeKcForChat) return [];
    return workspaceKcGlossary[activeKcForChat.id] ?? [];
  }, [activeKcForChat, workspaceKcGlossary]);

  const chatSessionKey = useMemo(() => {
    const kcPart = wholeBookMode ? 'whole' : (selectedKcId ?? kcsOrdered[0]?.id ?? 'none');
    return `${activeExamId ?? 'none'}_${disciplineBand}_${kcPart}`;
  }, [activeExamId, disciplineBand, wholeBookMode, selectedKcId, kcsOrdered]);

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

  const renderWorkspaceKcCard = (kc: LSAPKnowledgeComponent) => {
    const selected = selectedKcId === kc.id;
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
            onClick={() => setSelectedKcId(selected ? null : kc.id)}
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
        <div className="mb-2 flex shrink-0 flex-col gap-1">
          <PredictedScoreDisplay score={predictedScore} hasMap={!!workspaceLsapContentMap?.kcs?.length} />
          {scoreDeltaToast != null && scoreDeltaToast > 0 && (
            <p className="self-end text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 shadow-sm animate-pulse">
              预测分 +{scoreDeltaToast}
            </p>
          )}
        </div>
        <div className="mb-1 flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <ListTree className="w-3.5 h-3.5 shrink-0" aria-hidden />
              考点列表（KC）
            </h2>
            {kcPanelSummaryLine ? (
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">{kcPanelSummaryLine}</p>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspaceLsapContentMap && kcsGroupedByMaterial.length > 0 ? (
            <p className="mb-1 shrink-0 px-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              优先掌握（核心 + 重要）
            </p>
          ) : null}
          {kcsOrdered.length > 0 && (
            <label className="mb-2 flex shrink-0 cursor-pointer select-none items-center gap-2 text-[10px] text-slate-600">
              <input
                type="checkbox"
                className="rounded border-stone-300"
                checked={wholeBookMode}
                onChange={(e) => setWholeBookMode(e.target.checked)}
                aria-label="全卷对话（不锚定 KC）"
              />
              全卷对话（不锚定 KC）
            </label>
          )}
          {!workspaceLsapContentMap ? (
            <p className="shrink-0 py-2 text-xs text-slate-500">生成本场考点图谱后将在此列出考点。</p>
          ) : kcsGroupedByMaterial.length === 0 ? (
            <p className="shrink-0 py-2 text-xs text-slate-500">生成本场考点图谱后将在此列出考点。</p>
          ) : (
            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain pr-1"
              role="region"
              aria-label="按材料分组的考点列表"
            >
              {globalAllTier3 ? (
                <p className="text-[10px] text-slate-500 leading-relaxed px-0.5">
                  当前图谱考点均落在细节档。请展开下方「满分细节」浏览并选择考点；对话仍可正常锚定已选考点。
                </p>
              ) : (
                kcsGroupedWithTiers.map((group) => {
                  const headingId = `kc-pri-${String(group.key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                  const showEmptyHint = group.kind === 'material' && group.kcs.length === 0;
                  return (
                    <section key={`pri-${group.key}`} aria-labelledby={headingId} className="space-y-1.5">
                      <h3
                        id={headingId}
                        className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate px-0.5 sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-1 -mx-0.5 border-b border-stone-100/90"
                        title={group.title}
                      >
                        {group.title}
                      </h3>
                      {showEmptyHint ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed px-0.5">
                          暂无考点。可重新点击「生成本场考点图谱」，或检查材料是否过长被截断。
                        </p>
                      ) : group.kcsTier12.length === 0 && group.kcsTier3.length > 0 ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed px-0.5">
                          暂无核心/重要考点，见下方「满分细节」。
                        </p>
                      ) : (
                        <div role="list" className="space-y-1.5">
                          {group.kcsTier12.map((kc) => renderWorkspaceKcCard(kc))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}

              {totalTier3Count > 0 ? (
                <div className="mt-1 space-y-2 border-t border-stone-100 pt-3">
                  <button
                    type="button"
                    aria-expanded={maxScoreDetailsOpen}
                    aria-controls="workspace-kc-tier3-panel"
                    onClick={() => setMaxScoreDetailsOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50/90 px-2.5 py-2 text-left hover:bg-stone-100/90 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[11px] font-bold text-slate-600">满分细节</span>
                      <span className="text-[10px] text-slate-500 tabular-nums">共 {totalTier3Count} 个</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${maxScoreDetailsOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  <p className="text-[10px] text-slate-400 leading-relaxed px-0.5">
                    以下为相对细枝末节或低频点；建议先掌握上方核心与重要考点，再按需浏览。
                  </p>
                  {maxScoreDetailsOpen ? (
                    <div id="workspace-kc-tier3-panel" className="space-y-3 pt-1">
                      {kcsGroupedWithTiers.map((group) => {
                        if (group.kcsTier3.length === 0) return null;
                        const headingId = `kc-t3-${String(group.key).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                        return (
                          <section key={`t3-${group.key}`} aria-labelledby={headingId} className="space-y-1.5">
                            <h3
                              id={headingId}
                              className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate px-0.5 sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-1 -mx-0.5 border-b border-stone-100/90"
                              title={group.title}
                            >
                              {group.title}
                            </h3>
                            <div role="list" className="space-y-1.5">
                              {group.kcsTier3.map((kc) => renderWorkspaceKcCard(kc))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="mt-2 shrink-0 space-y-2 border-t border-stone-100 pt-3">
          <p className="text-[10px] text-slate-500 leading-snug px-0.5">
            考前预测优先第一份本地 fileHash；仅云端时将尝试恢复。
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
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {predictionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            进入考前预测
          </button>
        </div>
      </section>

      <div className="space-y-2 shrink-0">
        {activeExamId && materialsForActive.length === 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">本场暂无材料，请到考试中心关联。</p>
        )}
        <button
          type="button"
          disabled={!activeExamId || materialsForActive.length === 0 || workspaceLsapGenerating || mergedLoading}
          onClick={() => onGenerateWorkspaceLsap()}
          aria-busy={workspaceLsapGenerating}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {workspaceLsapGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          生成本场考点图谱
        </button>
        {workspaceLsapGenerating && workspaceLsapProgress && (
          <div
            className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 space-y-1.5"
            role="status"
            aria-live="polite"
          >
            <p className="text-[11px] font-bold text-violet-900 leading-snug">
              正在生成本场考点图谱：第 {workspaceLsapProgress.current} / {workspaceLsapProgress.total} 份 ·{' '}
              <span className="font-medium break-all">{workspaceLsapProgress.fileName}</span>
            </p>
            <div className="h-1.5 rounded-full bg-violet-200 overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.round((100 * workspaceLsapProgress.current) / workspaceLsapProgress.total))}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-violet-800/90">
              进度 {Math.min(100, Math.round((100 * workspaceLsapProgress.current) / workspaceLsapProgress.total))}%
            </p>
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
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-900 font-bold text-xs hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {workspaceAtomsGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Braces className="w-4 h-4" />}
          提取逻辑原子
        </button>
        {workspaceAtomsGenerating && workspaceAtomsProgress && (
          <div
            className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 space-y-1.5"
            role="status"
            aria-live="polite"
          >
            <p className="text-[11px] font-bold text-indigo-900 leading-snug">
              正在提取逻辑原子：第 {workspaceAtomsProgress.current} / {workspaceAtomsProgress.total} 份 ·{' '}
              <span className="font-medium break-all">{workspaceAtomsProgress.fileName}</span>
            </p>
            <div className="h-1.5 rounded-full bg-indigo-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, Math.round((100 * workspaceAtomsProgress.current) / workspaceAtomsProgress.total))}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-indigo-800/90">
              进度 {Math.min(100, Math.round((100 * workspaceAtomsProgress.current) / workspaceAtomsProgress.total))}%
            </p>
          </div>
        )}
        <p className="text-[10px] text-slate-500 leading-snug px-0.5">
          说明：考点图谱与逻辑原子均按每份关联材料分别抽取（旧版无材料归属的考点仍用整包合并）；单讲超长时正文上限已放宽。
        </p>
      </div>
    </div>
  );

  const chatColumn = (
    <div className="flex min-h-0 flex-1 min-w-0 flex-col gap-2 overflow-hidden">
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
            mergedContent={mergedContent}
            mergedLoading={mergedLoading}
            mergedError={mergedError}
            contextBlocked={contextBlocked}
            contextBlockedHint={contextBlockedHint}
            disciplineBand={disciplineBand}
            examTitle={activeExam?.title ?? ''}
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
            <h1 className="text-lg font-bold truncate">考试复习 · 备考工作台</h1>
            <p className="text-xs text-slate-500 hidden sm:block">本场合并讲义 · 考点 · 预测分（只读）· 苏格拉底对话</p>
          </div>
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
          <button
            type="button"
            disabled={!activeKcForChat || wholeBookMode}
            title={
              wholeBookMode
                ? '全卷模式下不收录考点释义'
                : !activeKcForChat
                  ? '请先锚定考点后再查看考点释义'
                  : undefined
            }
            aria-expanded={glossaryDesktopOpen}
            aria-controls="exam-workspace-kc-glossary-panel"
            onClick={() => setGlossaryDesktopOpen((o) => !o)}
            className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-50"
          >
            <BookMarked className="w-4 h-4 shrink-0" />
            {glossaryDesktopOpen ? '收起考点释义' : '展开考点释义'}
          </button>
          <button
            type="button"
            disabled={!workspaceLsapContentMap || !workspaceLsapState}
            title={!workspaceLsapContentMap ? '请先生成本场考点图谱' : undefined}
            onClick={() => setEvidenceReportOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            <FileText className="w-4 h-4" />
            学习证据
          </button>
          <button
            type="button"
            onClick={onOpenExamHub}
            className="text-sm font-bold text-violet-700 hover:underline"
          >
            考试中心
          </button>
          {showChunkDebug && (
            <button
              type="button"
              disabled={chunkIndexBusy || !workspaceLsapKey || materialsForActive.length === 0}
              onClick={() => void handleRebuildChunkIndex()}
              title="备考引用 1-1：按本场材料重建 PDF 文本 chunk 索引（IndexedDB）"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-bold text-slate-700 bg-stone-100 border border-stone-200 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {chunkIndexBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
              重建 chunk 索引
            </button>
          )}
        </div>
      </header>

      <KnowledgePointInspectPanel kc={inspectKc} open={!!inspectKc} onClose={() => setInspectKc(null)} />

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
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-1.5 lg:hidden mb-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setMobileTab('sidebar')}
                className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'sidebar' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
              >
                考点与材料
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'chat' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
              >
                预测分与对话
              </button>
              {activeKcForChat && (
                <button
                  type="button"
                  onClick={() => setMobileTab('glossary')}
                  aria-label="考点释义"
                  className={`flex-1 min-w-[100px] py-2 rounded-xl text-[11px] font-bold ${mobileTab === 'glossary' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
                >
                  考点释义
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
