import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clock3, FileText, GraduationCap, History, Layers3, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';
import type { AtomCoverageByKc, Exam, ExamMaterialLink, KcGlossaryEntry, LSAPContentMap, LSAPState } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { extractPdfText } from '@/lib/pdf/pdfUtils';
import type { WorkspaceDialogueTurn, WorkspaceEvidenceAnnotation } from '@/features/exam/lib/examWorkspaceLsapKey';
import { ExamWorkspaceGlobalChat } from './ExamWorkspaceGlobalChat';
import { ExamWorkspaceMaterialPreview } from './ExamWorkspaceMaterialPreview';
import { KnowledgeChecklist } from '@/features/exam/round/KnowledgeChecklist';
import type { PrepareLectureKnowledgeOptions } from '@/features/exam/round/lectureKnowledge';
import { summarizeQuestionConditions } from '@/features/exam/round/conditionEvidence';
import { resumeRoundContext } from '@/features/exam/round/resumeRoundContext';
import { useThemePlan } from '@/features/exam/round/useThemePlan';
import { isIndependentPracticeStage, StudyRoundPanel } from '@/features/exam/round/StudyRoundPanel';
import { buildStudyBlocks, createRoundContext, getMaterialKcs, pageLabel, roundTouchesBlock, roundWorkspaceStorageKey } from '@/features/exam/round/roundScope';
import { buildRoundReport, loadRoundStore, mergeRoundStore, recordStoreExposure, saveRoundStore, upsertRound } from '@/features/exam/round/roundState';
import type { RoundCitation, RoundContext, RoundHelpKind, RoundRecordStore, StudyRound } from '@/features/exam/round/roundTypes';
import '@/features/exam/round/roundWorkspace.css';

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
  onPrepareLectureKnowledge: (options: PrepareLectureKnowledgeOptions) => Promise<void>;
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


/** KC/atom structure drives finite rounds; previous conversations and estimates remain historical records. */
export const ExamWorkspacePage: React.FC<ExamWorkspacePageProps> = (props) => {
  const { user, activeExamId, onActiveExamIdChange, onBack, onOpenExamHub, resolveExamMaterialPdf,
    workspaceLsapContentMap, workspaceDialogueTranscript, workspaceLsapKey } = props;
  const { language: appLanguage, text } = useAppLanguage();
  const language = appLanguage === 'en' ? 'en' : 'zh';
  const [exams, setExams] = useState<Exam[]>([]);
  const [allMaterials, setAllMaterials] = useState<ExamMaterialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [knowledgeError, setKnowledgeError] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [textsByIdentity, setTextsByIdentity] = useState<Record<string, string[]>>({});
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfRetry, setPdfRetry] = useState(0);
  const [mode, setMode] = useState<'knowledge' | 'round' | 'global'>('round');
  const [historicalContext, setHistoricalContext] = useState<RoundContext | null>(null);
  const [combinedIds, setCombinedIds] = useState<string[]>([]);
  const [combining, setCombining] = useState(false);
  const [combinedActive, setCombinedActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewJump, setPreviewJump] = useState<{ linkId: string; page: number; requestId: number; quote?: string } | null>(null);
  const [storeChangedToken, setStoreChangedToken] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileBlocksOpen, setMobileBlocksOpen] = useState(false);
  const [revealedThemeNamesFor, setRevealedThemeNamesFor] = useState('');
  const [records, setRecords] = useState<RoundRecordStore>({ version: 1, rounds: [] });
  const [recordError, setRecordError] = useState('');
  const [recordsKey, setRecordsKey] = useState('');
  const recordsOwner = useRef('');
  const pdfRequests = useRef(new Map<string, Promise<string[]>>());
  const requestSerial = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [loadedPreference, setLoadedPreference] = useState('');
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const storageKey = useMemo(() => roundWorkspaceStorageKey(user.uid, activeExamId || 'none'), [user.uid, activeExamId]);
  const preferenceKey = `${storageKey}:view`;
  const materials = useMemo(() => allMaterials.filter((item) => item.examId === activeExamId)
    .sort((a, b) => (a.sortIndex ?? a.addedAt) - (b.sortIndex ?? b.addedAt)), [allMaterials, activeExamId]);
  const pdfIdentity = useCallback((material: ExamMaterialLink) => `${user.uid}:${material.id}:${material.fileHash || ''}:${material.cloudSessionId || ''}`, [user.uid]);
  const textsByMaterial = useMemo(() => Object.fromEntries(materials.flatMap(material => {
    const pages = textsByIdentity[pdfIdentity(material)];
    return pages ? [[material.id, pages]] : [];
  })), [materials, textsByIdentity, pdfIdentity]);
  const activeExam = exams.find((exam) => exam.id === activeExamId);
  const activeMaterial = materials.find((item) => item.id === materialId) ?? materials[0] ?? null;

  const refresh = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [nextExams, nextMaterials] = await Promise.all([listExams(user), listExamMaterialLinks(user)]);
      setExams(nextExams); setAllMaterials(nextMaterials);
      if ((!activeExamId || !nextExams.some((exam) => exam.id === activeExamId)) && nextExams[0]) onActiveExamIdChange(nextExams[0].id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : text('考试资料暂时没能加载，请重试。', 'Could not load exam materials. Please retry.'));
    } finally { setLoading(false); }
  }, [user, activeExamId, onActiveExamIdChange, text]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    setPreviewOpen(false); setCombinedActive(false); setCombining(false); setCombinedIds([]); setMode('round'); setHistoricalContext(null); setKnowledgeError('');
    setRecordError('');
    recordsOwner.current = storageKey;
    setRecordsKey(storageKey);
    try { const loaded = loadRoundStore(storageKey); recordsRef.current = loaded; setRecords(loaded); }
    catch (error) { recordsRef.current = { version: 1, rounds: [] }; setRecords(recordsRef.current); setRecordError(error instanceof Error ? error.message : text('复习记录暂时无法读取。', 'Study records could not be read.')); }
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
      setMaterialId(typeof saved.materialId === 'string' ? saved.materialId : '');
      setBlockId(typeof saved.blockId === 'string' ? saved.blockId : '');
    } catch { setMaterialId(''); setBlockId(''); }
    setLoadedPreference(preferenceKey);
  }, [storageKey, preferenceKey, text]);

  useEffect(() => {
    if (loadedPreference !== preferenceKey) return;
    try { localStorage.setItem(preferenceKey, JSON.stringify({ materialId: activeMaterial?.id ?? '', blockId })); }
    catch { /* This remembers navigation only; evidence persistence errors are surfaced by StudyRoundPanel. */ }
  }, [preferenceKey, loadedPreference, activeMaterial?.id, blockId]);

  useEffect(() => {
    if (!activeMaterial) { setPdfLoading(false); return; }
    let cancelled = false;
    const key = pdfIdentity(activeMaterial);
    setPdfError('');
    if (textsByIdentity[key]) { setPdfLoading(false); return; }
    setPdfLoading(true);
    let request = pdfRequests.current.get(key);
    if (!request) {
      request = (async () => {
        const file = await resolveExamMaterialPdf(activeMaterial);
        if (!file) throw new Error(text('暂时无法取得这份 PDF。请从资料库重新打开或重新关联后再试。', 'This PDF is unavailable. Open it in the library or link it again.'));
        const pages = await extractPdfText(file);
        if (!pages.length) throw new Error(text('没有读到 PDF 页面，请检查文件。', 'No PDF pages could be read.'));
        return pages;
      })();
      pdfRequests.current.set(key, request);
      request.catch(() => pdfRequests.current.delete(key));
    }
    request.then((pages) => {
      if (!cancelled) setTextsByIdentity((prev) => ({ ...prev, [key]: pages }));
    }).catch((error) => {
      if (!cancelled) setPdfError(error instanceof Error ? error.message : text('读取 PDF 失败。', 'Could not read PDF.'));
    }).finally(() => { if (!cancelled) setPdfLoading(false); });
    return () => { cancelled = true; };
  }, [activeMaterial, resolveExamMaterialPdf, pdfRetry, textsByIdentity, pdfIdentity, text]);

  const lectureKcs = useMemo(() => activeMaterial ? getMaterialKcs(activeMaterial, workspaceLsapContentMap?.kcs ?? []) : [], [activeMaterial, workspaceLsapContentMap]);
  const atomCount = lectureKcs.reduce((sum, kc) => sum + (kc.atoms?.length ?? 0), 0);
  const knowledgeBusy = props.workspaceLsapGenerating || props.workspaceAtomsGenerating;
  const knowledgeProgress = props.workspaceLsapProgress || props.workspaceAtomsProgress;
  const lecturePages = activeMaterial ? textsByMaterial[activeMaterial.id] ?? [] : [];
  const pageCount = lecturePages.length;
  const themes = useThemePlan(storageKey, activeMaterial, lectureKcs, lecturePages, language,
    !knowledgeBusy && atomCount > 0 && pageCount > 0);
  const legacyBlocks = useMemo(() => activeMaterial ? buildStudyBlocks(activeMaterial, pageCount,
    lectureKcs, language) : [], [activeMaterial, pageCount, lectureKcs, language]);
  const blocks = useMemo(() => activeMaterial && themes.plan
    ? buildStudyBlocks(activeMaterial, pageCount, lectureKcs, language, themes.plan) : legacyBlocks,
  [activeMaterial, pageCount, lectureKcs, language, themes.plan, legacyBlocks]);
  const activeBlock = blocks.find((block) => block.id === blockId) ?? blocks[0] ?? null;
  const allLectureTargets = useMemo(() => {
    if (!blocks.length) return [];
    try { return createRoundContext(blocks, textsByMaterial, 'integrated', language).scope.knowledgeTargets ?? []; }
    catch { return []; }
  }, [blocks, textsByMaterial, language]);
  const blockContextIds = useMemo(() => new Map(blocks.map(block => {
    try { return [block.id, createRoundContext([block], textsByMaterial, 'practice', language).scope.id]; }
    catch { return [block.id, '']; }
  })), [blocks, textsByMaterial, language]);
  const resumableContexts = useMemo(() => new Map(records.rounds.flatMap(round => {
    const savedContext = resumeRoundContext(round, [blocks, legacyBlocks], textsByMaterial, language);
    return savedContext ? [[round.id, savedContext] as const] : [];
  })), [records.rounds, blocks, legacyBlocks, textsByMaterial, language]);
  const mappedPages = new Set(blocks.flatMap(block => block.pages));
  const unassignedPages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(page => !mappedPages.has(page));
  const prepareKnowledge = async (stage: PrepareLectureKnowledgeOptions['stage']) => {
    if (!activeMaterial || !pageCount || knowledgeBusy) return;
    setKnowledgeError(''); setMode('knowledge'); setHistoricalContext(null);
    try { await props.onPrepareLectureKnowledge({ materialId: activeMaterial.id, pageTexts: textsByMaterial[activeMaterial.id], stage }); }
    catch (error) { setKnowledgeError(error instanceof Error ? error.message : text('提取没有完成，原有清单已保留。', 'Extraction did not finish. Your previous map is retained.')); }
  };

  const contextResult = useMemo(() => {
    if (!activeBlock) return { context: null, error: '' };
    try {
      const chosen = combinedActive ? blocks.filter((block) => combinedIds.includes(block.id)) : [activeBlock];
      return { context: createRoundContext(chosen, textsByMaterial, combinedActive ? 'integrated' : 'practice', language), error: '' };
    } catch (error) { return { context: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [activeBlock, blocks, combinedActive, combinedIds, textsByMaterial, language]);
  const context = historicalContext ?? contextResult.context;
  const matchingRounds = records.rounds.filter(round => round.blueprint.scope.id === context?.scope.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleRound = matchingRounds.find(round => round.phase !== 'ended') ?? matchingRounds[0];
  const neutralScope = mode === 'round' && isIndependentPracticeStage(visibleRound);
  const practiceQuestionKey = neutralScope ? `${visibleRound.id}:${visibleRound.currentQuestionId}` : '';
  const hideThemeNames = neutralScope && revealedThemeNamesFor !== practiceQuestionKey;
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [mode, activeBlock?.id, historicalContext?.scope.id]);
  const globalBlocks = useMemo(() => blocks.map((block) => ({ id: block.id, title: block.title, materialLinkId: block.materialId,
    pageWindows: block.pages.reduce<Array<{ start: number; end: number }>>((windows, page) => { const last = windows[windows.length - 1]; if (last && last.end + 1 === page) last.end = page; else windows.push({ start: page, end: page }); return windows; }, []) })), [blocks]);
  const selectionCount = combinedIds.filter((id) => blocks.some((block) => block.id === id)).length;

  const selectBlock = (id: string) => {
    setBlockId(id); setHistoricalContext(null); setCombinedActive(false); setPreviewOpen(false); setMobileBlocksOpen(false);
  };
  const openCitation = useCallback((citation: RoundCitation) => {
    if (!materials.some((item) => item.id === citation.materialId)) return;
    requestSerial.current += 1;
    setPreviewJump({ linkId: citation.materialId, page: citation.page, quote: citation.quote, requestId: requestSerial.current });
    setPreviewOpen(true);
  }, [materials]);
  const openOutsideSource = (material: string, page: number, quote = '') => {
    openCitation({ materialId: material, page, quote });
  };
  const onRecordChange = useCallback((round: StudyRound) => {
    if (recordsOwner.current !== storageKey) return;
    const next = upsertRound(recordsRef.current, round);
    recordsRef.current = next;
    setRecords(next);
  }, [storageKey]);
  const onStoreChange = useCallback((store: RoundRecordStore) => {
    if (recordsOwner.current !== storageKey) return;
    const next = mergeRoundStore(recordsRef.current, store);
    recordsRef.current = next;
    setRecords(next);
  }, [storageKey]);
  const persistExposure = useCallback((selected: { materialId: string; pages: number[]; allPages?: true }[], kind: RoundHelpKind) => {
    if (!selected.length) return;
    let latest: RoundRecordStore = recordsOwner.current === storageKey ? recordsRef.current : { version: 1, rounds: [] };
    let readable = true;
    try { latest = mergeRoundStore(latest, loadRoundStore(storageKey)); }
    catch { readable = false; }
    const next = recordStoreExposure(latest, selected, kind);
    recordsRef.current = next;
    setRecords(next);
    try {
      if (!readable) throw new Error('Unreadable previous records');
      saveRoundStore(storageKey, next);
      setRecordError('');
    } catch {
      setRecordError(text('帮助记录暂存于本页面，无法写入设备；刷新前请在短轮中导出记录。', 'Help history is kept on this page but could not be saved. Export from the study round before refreshing.'));
    }
    setStoreChangedToken(value => value + 1);
  }, [storageKey, text]);
  const knowledgeVisit = useRef('');
  useEffect(() => {
    if (mode !== 'knowledge') { knowledgeVisit.current = ''; return; }
    if (!activeMaterial || !lectureKcs.length) return;
    const identity = `${storageKey}:${activeMaterial.id}:${lectureKcs.map(kc => kc.id).join('|')}`;
    if (knowledgeVisit.current === identity) return;
    knowledgeVisit.current = identity;
    // Even collapsed KC names may contain a conclusion; visiting the list is recorded as support.
    const pages = [...new Set(lectureKcs.flatMap(kc => [...(kc.sourcePages ?? []), ...(kc.anchorPages ?? []), ...(kc.atoms ?? []).flatMap(atom => atom.sourcePages ?? [])]))].filter(page => page > 0);
    persistExposure([{ materialId: activeMaterial.id, pages, ...(pages.length ? {} : { allPages: true as const }) }], 'explanation');
  }, [mode, activeMaterial?.id, lectureKcs, storageKey, persistExposure]);
  const onPageViewed = useCallback((materialId: string, page: number) => persistExposure([{ materialId, pages: [page] }], 'source'), [persistExposure]);
  const recordWholeChatExposure = () => persistExposure(materials.map(material => ({ materialId: material.id, pages: [], allPages: true as const })), 'feedback');
  const closeForIndependent = useCallback(() => { setPreviewOpen(false); setHistoryOpen(false); setRevealedThemeNamesFor(''); }, []);
  const revealThemeNames = () => {
    if (!activeMaterial || !practiceQuestionKey) return;
    // All visible theme names belong to this lecture; preserve help only for their source pages.
    persistExposure([{ materialId: activeMaterial.id, pages: [...new Set(blocks.flatMap(block => block.pages))] }], 'explanation');
    setRevealedThemeNamesFor(practiceQuestionKey);
  };
  useEffect(() => {
    if (!historyOpen && !previewOpen && !mobileBlocksOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHistoryOpen(false); setPreviewOpen(false); setMobileBlocksOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [historyOpen, previewOpen, mobileBlocksOpen]);
  const nextBlock = () => {
    const index = blocks.findIndex((block) => block.id === activeBlock?.id);
    if (index >= 0 && index + 1 < blocks.length) selectBlock(blocks[index + 1].id);
  };

  return (
    <div className="round-workspace">
      <header className="round-workspace-header">
        <button type="button" className="round-shell-button round-shell-quiet" onClick={onBack}><ArrowLeft size={17} />{text('返回学习', 'Back to study')}</button>
        <div className="round-workspace-brand"><GraduationCap size={25} /><div><h1>{text('备考工作台', 'Exam workspace')}</h1><p>{text('每次练一小块，把答案自己讲完整。', 'One small block. One complete answer of your own.')}</p></div></div>
        <div className="round-workspace-header-actions">
          <button className="round-shell-button round-shell-quiet" type="button" onClick={() => { if (neutralScope) persistExposure(records.rounds.flatMap(round => round.blueprint.scope.materials), 'feedback'); setHistoryOpen(true); }}><History size={16} />{text('复习记录', 'Records')}</button>
          <button className="round-shell-button" type="button" onClick={onOpenExamHub}>{text('管理考试与资料', 'Manage exams & materials')}</button>
        </div>
      </header>
      {loadError && <div className="round-shell-error" role="alert">{loadError}<button onClick={() => void refresh()}>{text('重试', 'Retry')}</button></div>}
      {recordError && <div className="round-shell-error" role="alert">{recordError}</div>}
      <div className="round-workspace-body">
        <aside className={`round-workspace-sidebar ${mobileBlocksOpen ? 'is-open' : ''}`}>
          <div className="round-sidebar-mobile-heading"><strong>{text('选择复习块', 'Choose a block')}</strong><button aria-label={text('关闭', 'Close')} onClick={() => setMobileBlocksOpen(false)}><X size={20} /></button></div>
          <label className="round-shell-label">{text('这次准备哪场考试', 'Exam')}<select disabled={knowledgeBusy} aria-label={text('选择考试', 'Select exam')} value={activeExamId ?? ''} onChange={(event) => onActiveExamIdChange(event.target.value)}>
            <option value="" disabled>{loading ? text('正在加载…', 'Loading…') : text('选择考试', 'Select exam')}</option>
            {exams.map((exam, index) => <option key={exam.id} value={exam.id}>{neutralScope ? text(`考试 ${index + 1}`, `Exam ${index + 1}`) : exam.title}</option>)}
          </select></label>
          <label className="round-shell-label">{text('当前讲义', 'Lecture')}<select disabled={knowledgeBusy} aria-label={text('选择讲义', 'Select lecture')} value={activeMaterial?.id ?? ''} onChange={(event) => { setMaterialId(event.target.value); setBlockId(''); setKnowledgeError(''); setMode('round'); setHistoricalContext(null); setCombinedIds([]); setCombinedActive(false); setCombining(false); setPreviewOpen(false); }}>
            <option value="" disabled>{text('选择 PDF', 'Select PDF')}</option>
            {materials.map((material, index) => <option key={material.id} value={material.id}>{neutralScope ? text(`讲义 ${index + 1}`, `Lecture ${index + 1}`) : material.fileName}</option>)}
          </select></label>
          <div className="round-sidebar-heading"><span>{text('按主题复习', 'Review by theme')}</span><span>{themes.plan ? text(`${blocks.length} 个主题`, `${blocks.length} themes`) : '—'}</span></div>
          <p className="round-sidebar-note">{text('把相关知识点放在一起，一轮从主题里选几个要点来练。', 'Related concepts together. Each round checks a few points within one theme.')}</p>
          {neutralScope && <div className="round-scope-privacy-note"><p>{hideThemeNames ? text('作答时先收起主题名称，避免提前给出线索。仍可按编号或页码换块。', 'Theme names are tucked away while answering. You can still switch by number or page.') : text('已查看主题名称，相关页面会保留帮助记录。', 'Theme names were viewed; help is recorded for their source pages.')}</p><button type="button" className="round-shell-button" aria-expanded={!hideThemeNames} onClick={() => hideThemeNames ? revealThemeNames() : setRevealedThemeNamesFor('')}>{hideThemeNames ? text('查看主题名称（记帮助）', 'Show theme names (records help)') : text('收起主题名称', 'Hide theme names')}</button></div>}
          <div className="round-block-list">
            {pdfLoading && <div className="round-shell-loading"><Loader2 className="animate-spin" size={19} />{text('正在读取讲义页码…', 'Reading PDF pages…')}</div>}
            {themes.busy && !themes.plan && <div className="round-shell-loading"><Loader2 className="animate-spin" size={19} />{text('正在把知识点整理成主题…', 'Organizing concepts into themes…')}</div>}
            {(themes.plan ? blocks : []).map((block, index) => {
              const blockTitle = hideThemeNames ? text(`复习块 ${index + 1}`, `Study block ${index + 1}`) : block.title;
              const related = records.rounds.filter((round) => roundTouchesBlock(round, block));
              const last = related.sort((a, b) => b.updatedAt - a.updatedAt)[0];
              const report = last ? buildRoundReport(last, records.rounds) : null;
              const status = !last ? text('从这里开始', 'Start here') : last.blueprint.scope.id !== blockContextIds.get(block.id)
                ? text('已有相关作答记录', 'Related answers saved') : last.phase !== 'ended'
                ? last.phase === 'paused' ? text('已暂停 · 可续接', 'Paused · resume') : text('正在练习 · 可续接', 'In progress · resume')
                : report?.uncertain.length ? text('有待核对的回答', 'Some answers need review') : report?.needsWork.length ? text('有具体内容待补练', 'Some tasks need practice')
                  : text('有本次作答记录', 'Answer record available');
              return <div className={`round-block-card ${activeBlock?.id === block.id && !combinedActive ? 'is-active' : ''}`} key={block.id}>
                {combining && <input type="checkbox" aria-label={text(`综合练习：${blockTitle}`, `Combine: ${blockTitle}`)} checked={combinedIds.includes(block.id)} disabled={!combinedIds.includes(block.id) && selectionCount >= 3} onChange={(event) => setCombinedIds((ids) => event.target.checked ? [...ids, block.id] : ids.filter((id) => id !== block.id))} />}
                <button type="button" className="round-block-select" onClick={() => { selectBlock(block.id); setMode('round'); }}>
                  <span className="round-block-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="round-block-text"><strong>{blockTitle}</strong><span>{block.pages.length ? pageLabel(block.pages, language) : text('页码待补全', 'Source pages needed')}</span><span>{text(`${block.kcs.length} 个相关知识点`, `${block.kcs.length} related concepts`)}</span><small>{status}</small></span>
                  <ChevronRight size={16} />
                </button>
              </div>;
            })}
          </div>
          {themes.plan && blocks.length > 1 && <div className="round-combine-controls">
            <button type="button" className="round-shell-button" onClick={() => { setCombining((value) => !value); setCombinedActive(false); }}><Layers3 size={16} />{combining ? text('取消选择', 'Cancel selection') : text('组合几块做输出', 'Combine blocks')}</button>
            {combining && <><p>{text('选 2–3 块，明确范围后再综合练习。', 'Select 2–3 blocks for an explicitly scoped combined round.')}</p><button type="button" className="round-shell-button round-shell-primary" disabled={selectionCount < 2} onClick={() => { setCombinedActive(true); setHistoricalContext(null); setMode('round'); setPreviewOpen(false); setMobileBlocksOpen(false); }}>{text(`开始综合 · ${selectionCount} 块`, `Combine ${selectionCount} blocks`)}<ArrowRight size={16} /></button></>}
          </div>}
          <div className="round-sidebar-footer"><span>{text('没有样题也能开始。', 'No sample exam required.')}</span><small>{text('记录讲义范围内的作答表现，不预测考分。', 'Records lecture-grounded performance, not predicted exam scores.')}</small></div>
        </aside>
        <main className="round-workspace-main">
          <div className="round-workspace-toolbar">
            <button className="round-shell-button round-mobile-blocks-button" onClick={() => setMobileBlocksOpen(true)}><Layers3 size={16} />{text('复习块', 'Blocks')}</button>
            <div className="round-workspace-tabs" role="tablist" aria-label={text('工作台用途', 'Workspace activity')}>
              <button type="button" role="tab" aria-selected={mode === 'knowledge'} onClick={() => setMode('knowledge')} className={mode === 'knowledge' ? 'is-active' : ''}><Layers3 size={16} />{text('知识清单', 'Knowledge map')}</button>
              <button type="button" role="tab" aria-selected={mode === 'round'} onClick={() => setMode('round')} className={mode === 'round' ? 'is-active' : ''}><BookOpen size={16} />{text('主题复习', 'Theme practice')}</button>
              <button type="button" role="tab" aria-selected={mode === 'global'} onClick={() => { recordWholeChatExposure(); setMode('global'); setPreviewOpen(false); }} className={mode === 'global' ? 'is-active' : ''}><MessageCircle size={16} />{text('整场材料对话', 'All-material chat')}</button>
            </div>
            <button type="button" className="round-shell-button round-shell-quiet" disabled={!activeMaterial} onClick={() => {
              if (previewOpen) { setPreviewOpen(false); return; }
              if (activeMaterial) openOutsideSource(activeMaterial.id, activeBlock?.pages[0] ?? 1);
            }}><FileText size={16} />{previewOpen ? text('收起原文', 'Close source') : text('查看原文', 'View source')}</button>
          </div>
          {activeMaterial && (mode === 'knowledge' || !atomCount || knowledgeBusy) && <section className="knowledge-structure-bar" aria-label={text('知识提取步骤', 'Knowledge preparation')}>
            <div className="knowledge-steps"><span data-ready={lectureKcs.length > 0}><b>1</b>{text('提取 KC', 'Extract KCs')}<small>{lectureKcs.length || '—'}</small></span><ChevronRight size={14} /><span data-ready={atomCount > 0}><b>2</b>{text('逻辑原子', 'Logic atoms')}<small>{atomCount || '—'}</small></span><ChevronRight size={14} /><span data-ready={blocks.length > 0}><b>3</b>{text('按主题复习', 'Review by theme')}</span></div>
            <div className="knowledge-prepare-actions"><button type="button" className="round-shell-button" disabled={knowledgeBusy || !pageCount} onClick={() => void prepareKnowledge('kc')}>{props.workspaceLsapGenerating ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}{lectureKcs.length ? text('重新提取 KC', 'Extract KCs again') : text('提取本讲义 KC', 'Extract lecture KCs')}</button><button type="button" className="round-shell-button round-shell-primary" disabled={knowledgeBusy || !lectureKcs.length || !pageCount} onClick={() => void prepareKnowledge('atoms')}>{props.workspaceAtomsGenerating ? <Loader2 className="animate-spin" size={15} /> : <Layers3 size={15} />}{atomCount ? text('补全逻辑原子与页码', 'Complete atoms & pages') : text('提取逻辑原子', 'Extract logic atoms')}</button>{atomCount > 0 && <button type="button" className="round-shell-button" disabled={knowledgeBusy || themes.busy} onClick={themes.regenerate}><RefreshCw size={15} />{themes.busy ? text('正在整理主题…', 'Organizing themes…') : text('重新整理主题', 'Regroup themes')}</button>}</div>
            {knowledgeBusy ? <p role="status">{text('正在从原文整理', 'Reading the source')} {knowledgeProgress ? `${knowledgeProgress.current}/${knowledgeProgress.total} · ${knowledgeProgress.fileName}` : '…'}</p> : <p>{text('提取只处理当前讲义；重新提取会替换其知识清单，既有作答与旧 BKT 记录保留。', 'Extraction only changes this lecture’s map. Existing answers and earlier BKT records are retained.')}</p>}
          </section>}
          {knowledgeError && <div className="round-shell-error" role="alert">{knowledgeError}</div>}
          {themes.error && <div className="round-shell-error" role="alert">{themes.error}<button type="button" disabled={themes.busy} onClick={themes.regenerate}>{text('重试分组', 'Retry grouping')}</button></div>}
          {mode === 'round' && context && (themes.plan || historicalContext) && <div className="round-scope-ribbon"><span>{neutralScope ? text('当前讲义', 'Current lecture') : activeMaterial?.fileName}</span><strong>{historicalContext ? text('继续之前的原定范围', 'Continue the original scope') : combinedActive ? text(`综合 ${selectionCount} 个主题`, `${selectionCount} themes combined`) : pageLabel(activeBlock?.pages ?? [], language)}</strong><span>{text('按各知识点的原文出题', 'Questions follow each concept’s sources')}</span></div>}
          {mode === 'round' && context && (themes.plan || historicalContext) && context.pages.some(page => !page.text.trim()) && <p className="round-source-coverage-note">{text('部分页面没有可读取文字，图像中的内容尚未纳入出题；可在原文中查看。', 'Some pages have no readable text. Image content is not covered; open the source to inspect it.')}</p>}
          <div className="round-workspace-stage">
            <div ref={contentRef} className="round-workspace-content">
              {loading && !exams.length ? <div className="round-shell-empty"><Loader2 className="animate-spin" />{text('正在打开备考工作台…', 'Opening your workspace…')}</div>
                : !activeExamId || !materials.length ? <div className="round-shell-empty"><BookOpen size={40} /><h2>{text('先选一份要复习的讲义', 'Choose a lecture to review')}</h2><p>{text('在考试中心关联 PDF，回来就能按小块开始。无需先准备样题，也无需先生成整场题库。', 'Link a PDF in the exam center and return to start with one small block. No sample exam or full question bank needed.')}</p><button className="round-shell-button round-shell-primary" onClick={onOpenExamHub}>{text('关联考试资料', 'Link exam materials')}<ArrowRight size={17} /></button></div>
                : pdfError ? <div className="round-shell-empty" role="alert"><FileText size={36} /><p>{pdfError}</p><button className="round-shell-button" onClick={() => setPdfRetry((n) => n + 1)}><RefreshCw size={16} />{text('重新读取', 'Try again')}</button></div>
                : mode === 'global' && activeExam ? <div className="round-global-container"><p className="round-global-note">{text('这里可以讨论全部考试资料；对话不会自动计为短轮的独立验证。', 'Discuss all exam materials here. This conversation is not automatically counted as independent round evidence.')}</p><ExamWorkspaceGlobalChat key={`${user.uid}:${activeExamId}`} user={user} examId={activeExamId} examTitle={activeExam.title} materials={materials} workspaceKey={workspaceLsapKey} contentMap={workspaceLsapContentMap} knowledgeBlocks={globalBlocks} resolveExamMaterialPdf={resolveExamMaterialPdf} onOpenMaterialPage={(id, page, options) => openOutsideSource(id, page, options?.quote)} onHandoffToKnowledgeBlock={(id) => { selectBlock(id); setMode('round'); }} /></div>
                : mode === 'knowledge' || !lectureKcs.length ? <>
                  {lectureKcs.length > 0 ? <KnowledgeChecklist kcs={lectureKcs} targets={allLectureTargets} rounds={records.rounds} pageCount={pageCount} language={language} legacyCoverage={props.workspaceAtomCoverage}
                    onOpenPage={(page, quote) => { if (activeMaterial) openOutsideSource(activeMaterial.id, page, quote); }}
                    onReveal={(kc) => { if (activeMaterial) { const pages = [...new Set([...(kc.sourcePages ?? []), ...(kc.anchorPages ?? []), ...(kc.atoms ?? []).flatMap(atom => atom.sourcePages ?? [])])]; persistExposure([{ materialId: activeMaterial.id, pages, ...(pages.length ? {} : { allPages: true as const }) }], 'explanation'); } }}
                    onPractice={(kcId) => { const target = blocks.find(block => block.kcs.some(kc => kc.id === kcId)); if (target) { selectBlock(target.id); setMode('round'); } }} />
                    : <div className="round-shell-empty"><Layers3 size={38} /><h2>{text('先提取这份讲义的知识点', 'Start with this lecture’s knowledge map')}</h2><p>{text('先整理 KC，再拆成有原文依据的逻辑原子。复习块、题目和作答记录都会围绕同一份清单展开。', 'Extract KCs, then their source-backed logic atoms. Blocks, questions and answer records will share this map.')}</p><button type="button" className="round-shell-button round-shell-primary" disabled={!pageCount || knowledgeBusy} onClick={() => void prepareKnowledge('kc')}>{text('提取本讲义 KC', 'Extract lecture KCs')}<ArrowRight size={16} /></button></div>}
                  {lectureKcs.length > 0 && unassignedPages.length > 0 && <details className="knowledge-unmapped"><summary>{text(`${unassignedPages.length} 页尚未对应到 KC`, `${unassignedPages.length} pages are not mapped to a KC`)}</summary><p>{text('可能是封面、参考资料，也可能有遗漏。可以打开核对；这些页不会被默认为已经复习。', 'These may be cover or reference pages, or missing points. Inspect them here; they are not counted as reviewed.')}</p><div className="knowledge-page-links">{unassignedPages.map(page => <button key={page} type="button" onClick={() => { if (activeMaterial) openOutsideSource(activeMaterial.id, page); }}>{text(`第 ${page} 页`, `p. ${page}`)}</button>)}</div></details>}
                </>
                : !themes.plan && atomCount > 0 && !historicalContext ? <div className="round-shell-empty round-theme-loading">{themes.busy || pdfLoading ? <Loader2 className="animate-spin" size={30} /> : <Layers3 size={34} />}<h2>{pdfLoading ? text('正在读取讲义…', 'Reading the lecture…') : themes.busy ? text('把相关知识点放到一起', 'Bringing related concepts together') : text('主题还没整理好', 'Themes are not ready yet')}</h2><p>{text('根据讲义内容整理几个复习主题，保留每个知识点和原文位置。', 'Organizing review themes from the lecture while keeping every concept and its source pages.')}</p>{!themes.busy && !pdfLoading && <button type="button" className="round-shell-button round-shell-primary" onClick={themes.regenerate}>{text('整理主题', 'Organize themes')}</button>}<button type="button" className="round-shell-button" onClick={() => setMode('knowledge')}>{text('先看完整知识清单', 'View the full knowledge map')}</button></div>
                : context ? <><StudyRoundPanel key={`${storageKey}:${context.scope.id}`} context={context} storageKey={storageKey} language={language} onOpenSource={openCitation} onRecordChange={onRecordChange} onStoreChange={onStoreChange} memoryStore={recordsKey === storageKey ? records : undefined} storeChangedToken={storeChangedToken} onIndependentStart={closeForIndependent} onNextBlock={!historicalContext && !combinedActive && activeBlock && blocks.indexOf(activeBlock) < blocks.length - 1 ? nextBlock : undefined} /></>
                : <div className="round-shell-empty">{pdfLoading ? <Loader2 className="animate-spin" size={28} /> : <FileText size={36} />}<p>{contextResult.error || text('请先提取逻辑原子并补全其原文页码。', 'Extract the logic atoms and their source pages first.')}</p>{activeMaterial && <button className="round-shell-button round-shell-primary" disabled={knowledgeBusy || !lectureKcs.length || !pageCount} onClick={() => void prepareKnowledge('atoms')}>{text('提取或补全逻辑原子', 'Extract or complete logic atoms')}</button>}{contextResult.error && activeMaterial && !!activeBlock?.pages.length && <button className="round-shell-button" onClick={() => openOutsideSource(activeMaterial.id, activeBlock?.pages[0] ?? 1)}>{text('先看原页', 'View the original pages')}</button>}</div>}
            </div>
            {previewOpen && <aside className="round-source-panel" aria-label={text('原文预览', 'Source preview')}>
              <div className="round-source-heading"><div><strong>{text('讲义原文', 'Original source')}</strong><small>{text('返回后保留答案；查看原文会记录为帮助。', 'Your answer is retained. Viewing a source counts as help.')}</small></div><button type="button" aria-label={text('关闭原文，回到原题', 'Close source and return to the question')} onClick={() => setPreviewOpen(false)}><X size={20} /></button></div>
              <ExamWorkspaceMaterialPreview materials={materials} resolveExamMaterialPdf={resolveExamMaterialPdf} previewJumpRequest={previewJump} onPageViewed={onPageViewed} className="min-h-0 flex-1 flex flex-col" canvasScrollClassName="flex-1 min-h-0" onBackToParagraph={() => setPreviewOpen(false)} />
            </aside>}
          </div>
        </main>
      </div>
      {historyOpen && <div className="round-record-backdrop" role="presentation" onClick={() => setHistoryOpen(false)}><section className="round-record-sheet" role="dialog" aria-modal="true" aria-label={text('复习记录', 'Study records')} onClick={(event) => event.stopPropagation()}>
        <header><div><h2>{text('复习记录', 'Study records')}</h2><p>{text('保留每次作答条件，不把旧覆盖值换成新掌握结论。', 'Each record retains its conditions; old coverage values are not converted into mastery claims.')}</p></div><button aria-label={text('关闭记录', 'Close records')} onClick={() => setHistoryOpen(false)}><X /></button></header>
        <div className="round-record-list">
          {records.rounds.length === 0 && <p className="round-sidebar-note">{text('还没有短轮记录。开始第一轮后，草稿、帮助和反馈会一起保留。', 'No rounds yet. Drafts, help and feedback will be kept together.')}</p>}
          {[...records.rounds].sort((a, b) => b.updatedAt - a.updatedAt).map((round) => {
            const report = buildRoundReport(round, records.rounds);
            return <details key={round.id} onToggle={event => { if (event.currentTarget.open) persistExposure(round.blueprint.scope.materials, 'feedback'); }}><summary><div><strong>{round.blueprint.scope.title}</strong><span>{new Date(round.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')} · {round.attempts.length}/{round.blueprint.maxAttempts} {text('次作答', 'answers')}</span></div><span>{round.phase === 'ended' ? text('本轮结束', 'Round ended') : resumableContexts.has(round.id) ? text('可继续', 'Can resume') : text('历史范围保留', 'Original scope retained')}</span></summary>
              <div className="round-record-detail">{resumableContexts.has(round.id) && <button type="button" className="round-shell-button round-shell-primary" onClick={() => { setHistoricalContext(resumableContexts.get(round.id)!); setCombinedActive(false); setMode('round'); setHistoryOpen(false); setPreviewOpen(false); }}>{text('继续这轮原来的范围', 'Continue this original round')}<ArrowRight size={16} /></button>}{round.draft && <p className="round-original-answer">{text('保留的草稿：', 'Saved draft: ')}{round.draft}</p>}<p>{language === 'zh' ? report.nextStep : 'Review the recorded answers below, including untested and disputed items.'}</p><p>{text(`当前题目条件下未借助额外帮助完成 ${report.independent.length} 项 · 得到帮助 ${report.assisted.length} 项 · 尚未检查 ${report.unchecked.length} 项`, `${report.independent.length} completed without extra help under these question conditions · ${report.assisted.length} assisted · ${report.unchecked.length} unchecked`)}</p>
                {round.attempts.map((attempt) => <article key={attempt.id}><strong>{attempt.question.prompt}</strong><p className="round-original-answer">{attempt.answer}</p><small>{summarizeQuestionConditions(attempt, language)}</small><p>{attempt.evaluation?.summary ?? text('评价尚未完成', 'Evaluation pending')}</p>{attempt.dispute && !attempt.dispute.resolvedAt && <small>{text('这条判断待核对：', 'Disputed: ')}{attempt.dispute.note}</small>}</article>)}
              </div></details>;
          })}
          {workspaceDialogueTranscript.length > 0 && <details onToggle={event => { if (event.currentTarget.open) recordWholeChatExposure(); }}><summary><strong>{text('旧版对话记录', 'Earlier conversations')}</strong><span>{workspaceDialogueTranscript.length}</span></summary><div className="round-record-detail"><p>{text('旧记录仅供回看，没有足够的作答条件信息，不计入新的独立验证。', 'These conversations lack the required attempt conditions and are retained for reference only.')}</p>{workspaceDialogueTranscript.map((turn, index) => <article key={turn.id || `${turn.timestamp}:${index}`}><small>{turn.role === 'user' ? text('我的回答', 'My answer') : 'AI'} · {new Date(turn.timestamp).toLocaleString()}</small><p className="round-original-answer">{turn.text}</p></article>)}</div></details>}
        </div>
      </section></div>}
    </div>
  );
};
