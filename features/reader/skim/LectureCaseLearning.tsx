import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileSearch,
  Loader2,
  Lightbulb,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type {
  ChatMessage,
  LectureCaseEpisode,
  LectureCaseLearningState,
  LectureCaseProgress,
  SkimStudyStyle,
} from '@/types';
import {
  advanceLectureCase,
  analyzeLectureCaseFit,
  buildLectureCasePlan,
} from '@/services/geminiService';
import {
  applyLectureCaseCoverageUpdates,
  buildLectureCaseSourceSignature,
  createIdleLectureCaseState,
  createLectureCaseProgress,
  getLectureCaseCoverageCounts,
  passesStrictLectureCaseGate,
  validateLectureCaseManifest,
  validateLectureCasePlan,
} from './lectureCase';

type CaseStateSetter = React.Dispatch<React.SetStateAction<LectureCaseLearningState | null>>;

interface LectureCaseModeCardProps {
  state: LectureCaseLearningState | null;
  setState: CaseStateSetter;
  sourceId: string;
  pageStart: number;
  pageEnd: number;
  pageTexts: string[];
  pdfDataUrl?: string | null;
  pageRangeError?: string | null;
  onStudyStyleChange: (style: SkimStudyStyle) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const formatRange = (start: number, end: number) => start === end ? `第 ${start} 页` : `第 ${start}-${end} 页`;

// Lock synchronously: React's loading state alone cannot reject two clicks in
// the same render. A late result must also belong to this mounted source.
const useCaseRequest = (sourceSignature: string, onLoadingChange?: (loading: boolean) => void, owner?: object) => {
  const requestRef = useRef<AbortController | null>(null);
  const sourceRef = useRef({ sourceSignature, owner });
  const mountedRef = useRef(false);
  const loadingCallbackRef = useRef(onLoadingChange);
  const [isLoading, setIsLoading] = useState(false);
  sourceRef.current = { sourceSignature, owner };
  loadingCallbackRef.current = onLoadingChange;

  useLayoutEffect(() => {
    mountedRef.current = true;
    setIsLoading(false);
    return () => {
      mountedRef.current = false;
      const controller = requestRef.current;
      requestRef.current = null;
      controller?.abort();
      if (controller) loadingCallbackRef.current?.(false);
    };
  }, [sourceSignature, owner]);

  const startRequest = () => {
    if (!mountedRef.current || sourceRef.current.sourceSignature !== sourceSignature || sourceRef.current.owner !== owner || requestRef.current) return null;
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    loadingCallbackRef.current?.(true);
    return controller;
  };
  const isCurrentRequest = (controller: AbortController) => mountedRef.current
    && sourceRef.current.sourceSignature === sourceSignature
    && sourceRef.current.owner === owner
    && requestRef.current === controller
    && !controller.signal.aborted;
  const finishRequest = (controller: AbortController) => {
    if (requestRef.current !== controller) return;
    requestRef.current = null;
    if (mountedRef.current) setIsLoading(false);
    loadingCallbackRef.current?.(false);
  };
  const cancelRequest = () => {
    const controller = requestRef.current;
    requestRef.current = null;
    controller?.abort();
    if (mountedRef.current) setIsLoading(false);
    if (controller) loadingCallbackRef.current?.(false);
  };
  return { requestRef, isLoading, startRequest, isCurrentRequest, finishRequest, cancelRequest };
};

export const LectureCaseModeCard: React.FC<LectureCaseModeCardProps> = ({
  state,
  setState,
  sourceId,
  pageStart,
  pageEnd,
  pageTexts,
  pdfDataUrl,
  pageRangeError,
  onStudyStyleChange,
  onLoadingChange,
}) => {
  const signature = buildLectureCaseSourceSignature(sourceId, pageStart, pageEnd);
  const { requestRef, isLoading, startRequest, isCurrentRequest, finishRequest, cancelRequest } = useCaseRequest(signature, onLoadingChange);
  const current = state?.sourceSignature === signature ? state : null;
  const busy = isLoading || current?.status === 'analyzing' || current?.status === 'planning';
  const replaceDetection = (next: LectureCaseLearningState, controller: AbortController) => {
    setState(previous => !controller.signal.aborted && previous?.sourceSignature === signature ? next : previous);
  };

  useLayoutEffect(() => {
    // A request cannot survive leaving the component. Recover an interrupted
    // persisted detection rather than displaying a spinner without a request.
    setState(previous => previous?.sourceSignature === signature && (previous.status === 'analyzing' || previous.status === 'planning')
      ? createIdleLectureCaseState(signature, pageStart, pageEnd)
      : previous);
  }, [signature]);

  const detect = async () => {
    if (pageRangeError || busy || requestRef.current) return;
    if (state?.plan && !window.confirm('重新检测会清除当前推演的章节对话、覆盖状态和停留位置。PDF 注释、便签以及其他领读方式不会受影响。确定继续吗？')) return;
    const controller = startRequest();
    if (!controller) return;
    setState({
      ...createIdleLectureCaseState(signature, pageStart, pageEnd),
      status: 'analyzing',
    });
    try {
      const analysis = await analyzeLectureCaseFit({
        pdfDataUrl,
        pageTexts,
        pageStart,
        pageEnd,
        abortSignal: controller.signal,
      });
      if (!isCurrentRequest(controller)) return;
      const manifestValidation = validateLectureCaseManifest(analysis.manifest, pageStart, pageEnd);
      if (!manifestValidation.valid) throw new Error(`内容账本没有通过校验：${manifestValidation.errors[0]}`);
      const gate = passesStrictLectureCaseGate(analysis.report, analysis.manifest);
      if (!gate.valid) {
        replaceDetection({
          ...createIdleLectureCaseState(signature, pageStart, pageEnd),
          status: 'unsuitable',
          report: {
            ...analysis.report,
            unsuitableReasons: [...new Set([...analysis.report.unsuitableReasons, ...gate.errors])],
          },
          manifest: analysis.manifest,
        }, controller);
        return;
      }

      replaceDetection({
        ...createIdleLectureCaseState(signature, pageStart, pageEnd),
        status: 'planning',
        report: analysis.report,
        manifest: analysis.manifest,
      }, controller);
      let plan = await buildLectureCasePlan({ ...analysis, abortSignal: controller.signal });
      if (!isCurrentRequest(controller)) return;
      let planValidation = validateLectureCasePlan(plan, analysis.manifest);
      if (!planValidation.valid) {
        plan = await buildLectureCasePlan({
          ...analysis,
          validationFeedback: planValidation.errors.join('\n'),
          abortSignal: controller.signal,
        });
        if (!isCurrentRequest(controller)) return;
        planValidation = validateLectureCasePlan(plan, analysis.manifest);
      }
      if (!planValidation.valid) throw new Error(`推演计划两次校验失败：${planValidation.errors[0]}`);
      replaceDetection({
        ...createIdleLectureCaseState(signature, pageStart, pageEnd),
        status: 'suitable',
        report: analysis.report,
        manifest: analysis.manifest,
        plan,
        progress: createLectureCaseProgress(analysis.manifest),
      }, controller);
    } catch (error) {
      if (!isCurrentRequest(controller)) return;
      replaceDetection({
        ...createIdleLectureCaseState(signature, pageStart, pageEnd),
        status: 'error',
        errorMessage: error instanceof TypeError && /failed to fetch/i.test(error.message)
          ? '暂时无法连接 AI 服务。没有保存不完整结果，请检查本地服务或网络后重试。'
          : error instanceof Error ? error.message : '推演式检测失败，请重试。',
      }, controller);
    } finally {
      finishRequest(controller);
    }
  };

  const cancel = () => {
    cancelRequest();
    setState(previous => previous?.sourceSignature === signature ? createIdleLectureCaseState(signature, pageStart, pageEnd) : previous);
  };

  const start = () => {
    if (current?.status !== 'suitable' || !current.plan || !current.manifest) return;
    onStudyStyleChange('case');
  };

  const duplicateCount = current?.manifest?.pages.filter((page) => page.kind === 'duplicate').length ?? 0;
  const toolkitCount = current?.manifest?.units.filter((unit) => unit.narrativeRole === 'toolkit').length ?? 0;

  return (
    <section className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-black text-violet-900"><Scale className="h-4 w-4" />推演式领读</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">AI 先检查材料是否存在真实的贯穿问题、竞争主张与证据链。</p>
        </div>
        <span className="shrink-0 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-black text-violet-700">
          {current?.status === 'suitable' ? '适合' : current?.status === 'unsuitable' ? '不适合' : busy ? '检测中' : current?.status === 'error' ? '出错' : '尚未检测'}
        </span>
      </div>

      {!current || current.status === 'idle' ? (
        <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white/75 p-3">
          <p className="text-xs font-bold text-slate-700">当前范围：{formatRange(pageStart, pageEnd)}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">不会自动调用 AI。检测通过并完成内容审计后，才允许开始推演。</p>
          <button type="button" onClick={detect} disabled={!!pageRangeError} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-3.5 py-2 text-xs font-black text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45">
            <FileSearch className="h-4 w-4" />检测是否适合
          </button>
        </div>
      ) : busy ? (
        <div className="mt-4 rounded-xl border border-violet-100 bg-white/80 p-3">
          <p className="flex items-center gap-2 text-xs font-black text-violet-800"><Loader2 className="h-4 w-4 animate-spin" />{current.status === 'analyzing' ? '正在建立逐页内容账本…' : '适配通过，正在生成章节并检查遗漏…'}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">完成完整审计前不会开放推演，也不会边学边修改主线。</p>
          <button type="button" onClick={cancel} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-rose-600"><X className="h-3.5 w-3.5" />取消</button>
        </div>
      ) : current.status === 'suitable' && current.report && current.plan && current.manifest ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">贯穿问题</p>
            <p className="mt-1 text-sm font-black leading-6 text-slate-900">{current.report.centralQuestion}</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-600">{current.report.fitReasons.slice(0, 2).join('；')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-2"><p className="text-sm font-black text-violet-800">{current.plan.episodes.length}</p><p className="text-[10px] text-slate-400">推演章节</p></div>
            <div className="rounded-lg bg-white p-2"><p className="text-sm font-black text-violet-800">{Math.round(current.report.mappableRate * 100)}%</p><p className="text-[10px] text-slate-400">进入主线</p></div>
            <div className="rounded-lg bg-white p-2"><p className="text-sm font-black text-violet-800">{toolkitCount + duplicateCount}</p><p className="text-[10px] text-slate-400">工具/合并</p></div>
          </div>
          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {current.plan.episodes.map((episode) => (
              <div key={episode.id} className="rounded-lg border border-violet-100 bg-white px-3 py-2">
                <p className="text-xs font-black text-slate-800">{episode.index}. {episode.title}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{episode.role}</p>
              </div>
            ))}
          </div>
          <button type="button" onClick={start} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-violet-800"><Sparkles className="h-4 w-4" />开始推演</button>
          <button type="button" onClick={detect} className="mx-auto flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-violet-700"><RotateCcw className="h-3 w-3" />重新检测</button>
        </div>
      ) : current.status === 'unsuitable' && current.report ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-xs font-black text-amber-800"><AlertCircle className="h-4 w-4" />这段材料不适合推演式领读</p>
          <p className="mt-2 text-[11px] leading-5 text-amber-900">{current.report.unsuitableReasons.slice(0, 3).join('；') || '没有找到足够稳定的贯穿问题与证据关系。'}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onStudyStyleChange('continuous')} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">改用整段式</button>
            <button type="button" onClick={() => onStudyStyleChange('records')} className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">改用分段式</button>
            <button type="button" onClick={detect} className="ml-auto rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800">重试检测</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="flex items-center gap-2 text-xs font-black text-rose-800"><AlertCircle className="h-4 w-4" />检测发生技术错误</p>
          <p className="mt-2 text-[11px] leading-5 text-rose-700">{current.errorMessage || '没有保存不完整结果，请重试。'}</p>
          <button type="button" onClick={detect} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-black text-rose-700 shadow-sm">重试</button>
        </div>
      )}
    </section>
  );
};

interface LectureCaseWorkspaceProps {
  advanceTurn?: typeof advanceLectureCase;
  state: LectureCaseLearningState;
  setState: CaseStateSetter;
  pageTexts: string[];
  onJumpToPage?: (page: number) => void;
  onExitToConfig: () => void;
  onLoadingChange?: (loading: boolean) => void;
}

const CASE_LEVEL_LABELS: Record<string, string> = {
  unseen: '尚未出现',
  introduced: '已出现',
  engaged: '已参与',
  verified: '已验证',
  needs_review: '需复习',
};

export const LectureCaseWorkspace: React.FC<LectureCaseWorkspaceProps> = ({
  advanceTurn = advanceLectureCase,
  state,
  setState,
  pageTexts,
  onJumpToPage,
  onExitToConfig,
  onLoadingChange,
}) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [coverageOpen, setCoverageOpen] = useState(false);
  const { requestRef, isLoading, startRequest, isCurrentRequest, finishRequest, cancelRequest } = useCaseRequest(state.sourceSignature, onLoadingChange, state.manifest);
  const requestEpisodeRef = useRef<string | null>(null);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const plan = state.plan;
  const manifest = state.manifest;
  const progress = state.progress;
  const activeEpisode = plan?.episodes.find((episode) => episode.id === state.activeEpisodeId) ?? null;
  const counts = useMemo(() => getLectureCaseCoverageCounts(progress), [progress]);
  const draftKey = `${state.sourceSignature}\u0000${activeEpisode?.id ?? ''}`;
  const input = drafts[draftKey] ?? '';
  const setInput = (value: string) => setDrafts(previous => ({ ...previous, [draftKey]: value }));

  useLayoutEffect(() => {
    if (requestRef.current && requestEpisodeRef.current !== state.activeEpisodeId) cancelRequest();
  }, [state.sourceSignature, state.activeEpisodeId]);

  useLayoutEffect(() => {
    setDrafts({});
  }, [state.sourceSignature, state.manifest]);

  const exitToConfig = () => {
    cancelRequest();
    onExitToConfig();
  };

  if (!plan || !manifest || !progress) {
    return <div className="grid h-full place-items-center bg-slate-50 p-6"><button type="button" onClick={exitToConfig} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white">推演数据不完整，返回配置</button></div>;
  }

  const updateEpisode = (episodeId: string, updater: (episode: LectureCaseEpisode) => LectureCaseEpisode) => {
    setState((previous) => previous?.plan && previous.sourceSignature === state.sourceSignature && previous.manifest === manifest ? ({
      ...previous,
      plan: { ...previous.plan, episodes: previous.plan.episodes.map((episode) => episode.id === episodeId ? updater(episode) : episode) },
    }) : previous);
  };

  const runTurn = (episode: LectureCaseEpisode, userMessage: string, appendUser = true, displayText = userMessage): boolean => {
    const controller = startRequest();
    if (!controller) return false;
    requestEpisodeRef.current = episode.id;
    const ownsTurn = () => isCurrentRequest(controller)
      && latestStateRef.current.activeEpisodeId === episode.id;
    const userEntry: ChatMessage = { id: `case-user-${Date.now()}`, role: 'user', text: displayText, timestamp: Date.now() };
    if (appendUser) updateEpisode(episode.id, (current) => ({ ...current, status: 'in_progress', messages: [...current.messages, userEntry] }));
    void (async () => {
      try {
        const result = await advanceTurn({
          plan,
          episode,
          progress,
          pageTexts,
          history: episode.messages,
          userMessage,
          abortSignal: controller.signal,
        });
        if (!ownsTurn()) return;
        const modelEntry: ChatMessage = {
          id: `case-model-${Date.now()}`,
          role: 'model',
          text: result.messageMarkdown,
          timestamp: Date.now(),
          casePageRefs: result.focusPages,
        };
        setState((previous) => {
          if (controller.signal.aborted || !previous?.plan || !previous.progress || previous.manifest !== manifest
            || previous.sourceSignature !== state.sourceSignature || previous.activeEpisodeId !== episode.id) return previous;
          const allowed = new Set(episode.unitIds);
          return {
            ...previous,
            progress: applyLectureCaseCoverageUpdates(previous.progress, result.coverageUpdates, allowed),
            plan: {
              ...previous.plan,
              episodes: previous.plan.episodes.map((current) => current.id === episode.id ? {
                ...current,
                status: 'in_progress',
                messages: [...current.messages, modelEntry],
                unresolvedQuestions: result.unresolvedQuestions,
                readyToComplete: result.episodeReadyToComplete,
                lastPage: result.focusPages[0] ?? current.lastPage,
              } : current),
            },
          };
        });
        if (result.focusPages[0]) onJumpToPage?.(result.focusPages[0]);
      } catch (error) {
        if (ownsTurn()) {
          updateEpisode(episode.id, (current) => controller.signal.aborted ? current : ({
            ...current,
            messages: [...current.messages, { id: `case-error-${Date.now()}`, role: 'model', text: '这一轮通信中断了，没有更新学习状态。请重试。', timestamp: Date.now() }],
          }));
        }
      } finally {
        if (requestRef.current === controller) requestEpisodeRef.current = null;
        finishRequest(controller);
      }
    })();
    return true;
  };

  const openEpisode = (episode: LectureCaseEpisode) => {
    if (requestRef.current) return;
    latestStateRef.current = { ...state, activeEpisodeId: episode.id };
    setState((previous) => previous?.sourceSignature === state.sourceSignature ? { ...previous, activeEpisodeId: episode.id } : previous);
    onJumpToPage?.(episode.lastPage || episode.pageRefs[0]);
    if (episode.messages.length === 0) {
      runTurn(episode, `请按本章计划开始领读。开场要求：${episode.openingPrompt}`, false);
    }
  };

  const returnToEpisodes = () => {
    cancelRequest();
    setState((previous) => previous?.sourceSignature === state.sourceSignature ? { ...previous, activeEpisodeId: null } : previous);
  };

  if (!activeEpisode) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f5f4f8]">
        <header className="border-b border-violet-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-base font-black text-slate-950"><Scale className="h-5 w-5 text-violet-700" />{plan.caseTitle}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-violet-800">{plan.centralQuestion}</p>
            </div>
            <button type="button" onClick={exitToConfig} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:text-violet-700">返回配置</button>
          </div>
          <button type="button" onClick={() => setCoverageOpen((value) => !value)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-left">
            <span><span className="block text-xs font-black text-violet-800">AI 替我记着什么</span><span className="text-[10px] text-slate-500">已出现 {counts.introduced} · 已参与 {counts.engaged} · 已验证 {counts.verified} · 需复习 {counts.needs_review}</span></span>
            <ChevronDown className={`h-4 w-4 text-violet-600 transition-transform ${coverageOpen ? 'rotate-180' : ''}`} />
          </button>
          {coverageOpen && <CoverageDetails state={state} />}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-3xl space-y-3">
            {plan.episodes.map((episode) => {
              const unfinishedPrereqs = episode.prerequisiteEpisodeIds
                .map((id) => plan.episodes.find((item) => item.id === id))
                .filter((item): item is LectureCaseEpisode => Boolean(item && item.status !== 'completed'));
              return (
                <article key={episode.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">第 {episode.index} 章 · {Math.min(...episode.pageRefs)}-{Math.max(...episode.pageRefs)} 页</p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">{episode.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{episode.role}</p>
                      <p className="mt-2 text-xs font-bold leading-5 text-violet-800">待解决：{episode.guidingQuestion}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${episode.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : episode.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{episode.status === 'completed' ? '已完成' : episode.status === 'in_progress' ? '进行中' : '未开始'}</span>
                  </div>
                  {unfinishedPrereqs.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-800">前置章节尚未处理：{unfinishedPrereqs.map((item) => item.title).join('、')}。仍然可以自由打开。</p>}
                  <button type="button" onClick={() => openEpisode(episode)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-800">{episode.status === 'not_started' ? '打开这一章' : '继续这一章'}<ArrowRight className="h-4 w-4" /></button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  const send = () => {
    const text = input.trim();
    if (!text) return;
    if (runTurn(activeEpisode, text)) setInput('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <header className="border-b border-violet-100 bg-violet-50/45 px-4 py-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={returnToEpisodes} title="返回章节目录" aria-label="返回章节目录" className="mt-0.5 rounded-lg border border-violet-100 bg-white p-2 text-violet-700"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase text-violet-600">第 {activeEpisode.index} 章 · {activeEpisode.pageRefs.join('、')} 页</p>
            <h2 className="mt-0.5 truncate text-sm font-black text-slate-900">{activeEpisode.title}</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-violet-800">{activeEpisode.guidingQuestion}</p>
          </div>
          <button type="button" onClick={() => setCoverageOpen((value) => !value)} className="rounded-lg border border-violet-100 bg-white px-2.5 py-2 text-[11px] font-black text-violet-700"><ClipboardCheck className="mr-1 inline h-3.5 w-3.5" />账本</button>
        </div>
        {coverageOpen && <CoverageDetails state={state} compact />}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {activeEpisode.messages.map((message, index) => (
          <div key={message.id ?? `${message.role}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-[88%]' : 'mr-auto max-w-[96%]'}>
            <div className={`rounded-2xl px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-slate-900 text-white' : 'border border-violet-100 bg-violet-50/45 text-slate-800'}`}>
              <div data-preserve-language="true">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{message.text}</ReactMarkdown>
              </div>
            </div>
            {message.role === 'model' && message.casePageRefs && message.casePageRefs.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {message.casePageRefs.map((page) => <button key={page} type="button" onClick={() => onJumpToPage?.(page)} className="rounded-full border border-violet-100 bg-white px-2.5 py-1 text-[10px] font-black text-violet-700"><BookOpen className="mr-1 inline h-3 w-3" />第 {page} 页</button>)}
              </div>
            )}
          </div>
        ))}
        {isLoading && <div className="flex items-center gap-2 text-xs font-bold text-violet-600"><Loader2 className="h-4 w-4 animate-spin" />正在整理这一轮证据…</div>}
      </div>

      <footer className="border-t border-slate-100 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" disabled={isLoading} onClick={() => runTurn(activeEpisode, '【给点提示】请只给一个能让我继续尝试的小提示，保留需要我自己想的那一步，不要直接揭晓答案。', true, '给点提示')} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-800 disabled:opacity-40"><Lightbulb className="mr-1 inline h-3.5 w-3.5" />给点提示</button>
          <button type="button" disabled={isLoading} onClick={() => runTurn(activeEpisode, '【先讲基础】我缺少理解当前问题需要的基础。请先用大白话直接讲清必要的术语、背景或先决知识，并给一个简短例子；讲完停下，不要继续追问或测试我，相关内容可标记需要复习。', true, '先讲基础')} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 disabled:opacity-40"><BookOpen className="mr-1 inline h-3.5 w-3.5" />先讲基础</button>
          <button type="button" disabled={isLoading} onClick={() => runTurn(activeEpisode, '【直接告诉我】请直接揭晓当前问题并讲清理由，讲完停下，不要接着追问或要求我再试；不要把它标记为已验证。', true, '直接告诉我')} className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-40"><Eye className="mr-1 inline h-3.5 w-3.5" />直接告诉我</button>
          <button type="button" disabled={isLoading} onClick={() => void runTurn(activeEpisode, '【我会了】记录我的自我确认，但除非我刚刚无提示答对，否则不要标记为已验证。', true, '我会了')} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 disabled:opacity-40"><Check className="mr-1 inline h-3.5 w-3.5" />我会了</button>
          <button type="button" disabled={!activeEpisode.readyToComplete || isLoading} onClick={() => { if (!requestRef.current) updateEpisode(activeEpisode.id, (episode) => ({ ...episode, status: 'completed' })); }} className="ml-auto rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-30"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />完成本章</button>
        </div>
        <div className="flex gap-2">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); send(); } }} placeholder="可以先猜一下、说说理由，也可以说“不知道”…" aria-label="你的想法或问题" rows={1} className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-300" />
          {isLoading ? <button type="button" onClick={cancelRequest} title="停止生成" aria-label="停止生成" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-800 text-white"><Square className="h-4 w-4" /></button>
            : <button type="button" onClick={send} disabled={!input.trim()} aria-label="发送想法" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-700 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>}
        </div>
      </footer>
    </section>
  );
};

const CoverageDetails: React.FC<{ state: LectureCaseLearningState; compact?: boolean }> = ({ state, compact = false }) => {
  const manifest = state.manifest;
  const progress = state.progress;
  if (!manifest || !progress) return null;
  const grouped = Object.entries(CASE_LEVEL_LABELS).map(([level, label]) => ({
    level,
    label,
    units: manifest.units.filter((unit) => (progress.units[unit.id]?.level ?? 'unseen') === level),
  }));
  const merged = manifest.pages.filter((page) => page.kind === 'duplicate' || page.kind === 'transition');
  return (
    <div className={`${compact ? 'mt-3 max-h-48' : 'mt-3 max-h-64'} overflow-y-auto rounded-xl border border-violet-100 bg-white p-3 text-left shadow-sm`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">覆盖范围 {state.pageStart}-{state.pageEnd} 页</p>
      <div className="mt-2 space-y-2">
        {grouped.map((group) => group.units.length > 0 && (
          <div key={group.level}>
            <p className="text-[11px] font-black text-slate-700">{group.label} · {group.units.length}</p>
            <p className="mt-0.5 text-[10px] leading-4 text-slate-500">{group.units.slice(0, compact ? 4 : 8).map((unit) => unit.title).join('、')}{group.units.length > (compact ? 4 : 8) ? '…' : ''}</p>
          </div>
        ))}
        {merged.length > 0 && <div><p className="text-[11px] font-black text-slate-700">已合并的重复/过渡页 · {merged.length}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{merged.slice(0, 5).map((page) => `第${page.page}页：${page.reason}`).join('；')}</p></div>}
      </div>
    </div>
  );
};
