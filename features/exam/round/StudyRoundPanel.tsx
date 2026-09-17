import { authenticatedApiFetch } from '@/services/authenticatedApi';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, ArrowRight, BookOpen, Check, Clock3, Download, Flag, Lightbulb, MessageCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { answerFormatInstruction, hasReviewedPresentation } from './questionPresentation';
import { summarizeQuestionConditions } from './conditionEvidence';
import { ConditionEvidenceSummary, PracticeEvidenceSummary } from './ConditionEvidenceSummary';
import { answerFullyAddressed, feedbackNeedsReview, FeedbackAnswer } from './FeedbackAnswer';
import { createExamRoundAI } from './roundAI';
import { addSupport, advanceRound, applyEvaluation, buildRoundHistory, buildRoundReport, buildKnowledgeEvidence, createRound, disputeAttempt, endRound, getAnswerElapsedMs, hydrateRoundExposures, loadRoundStore, mergeRoundStore, pauseRound, recordEvaluationError, recordHelp, recordScopeExposure, recordStoreExposure, recordStoreScopeExposure, resolveDispute, resumeRound, saveRoundStore, submitRoundAnswer, updateDraft, upsertRound, RECHECK_DELAY_MS } from './roundState';
import type { RoundAI, RoundAttempt, RoundBlueprint, RoundCitation, RoundContext, RoundEvaluation, RoundHelpKind, RoundLanguage, RoundQuestion, RoundRecordStore, StudyRound } from './roundTypes';
import './studyRound.css';

export interface StudyRoundPanelProps {
  context: RoundContext;
  storageKey: string;
  language: RoundLanguage;
  onOpenSource: (citation: RoundCitation) => void;
  onRecordChange?: (round: StudyRound) => void;
  onStoreChange?: (store: RoundRecordStore) => void;
  sourceOpenedToken?: number;
  storeChangedToken?: number;
  memoryStore?: RoundRecordStore;
  onNextBlock?: () => void;
  onIndependentStart?: () => void;
  ai?: RoundAI;
}

const emptyStore = (): RoundRecordStore => ({ version: 1, rounds: [] });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const prose = (value: string) => <ReactMarkdown skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'br']}>{value}</ReactMarkdown>;
const uniqueSources = (sources: RoundCitation[]) => sources.filter((source, index) => sources.findIndex((item) => item.materialId === source.materialId && item.page === source.page) === index);
type StudyRoundProvider = 'gemini' | 'astra';
export type AstraConfiguration = 'checking' | 'ready' | 'missing' | 'unavailable';
const modelLabel = () => 'Gemini 3.8 Flash';
/** Select the current transport without rewriting historical model metadata. */
export const studyRoundProvider = (_blueprint: RoundBlueprint): StudyRoundProvider => 'gemini';

/** This local read exposes only availability; no key or paid model request enters the browser. */
export async function readAstraConfiguration(fetchStatus: typeof fetch = authenticatedApiFetch): Promise<Exclude<AstraConfiguration, 'checking'>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchStatus('/api/exam/gemini/status', { method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
    if (!response.ok) return 'unavailable';
    const status: unknown = await response.json();
    if (!status || typeof status !== 'object' || !('configured' in status) || !('model' in status)
      || typeof status.configured !== 'boolean' || status.model !== 'gemini-3.8-flash') return 'unavailable';
    return status.configured ? 'ready' : 'missing';
  } catch { return 'unavailable'; }
  finally { clearTimeout(timeout); }
}

/** Every new operation uses Gemini 3.8 Flash, including follow-ups on older rounds. */
export function studyRoundAIForRequest(_legacyProvider: StudyRoundProvider, configuration: AstraConfiguration, language: RoundLanguage, injected?: RoundAI): RoundAI {
  if (injected) return injected;
  if (configuration !== 'ready') throw new Error(language === 'en'
    ? configuration === 'missing' ? 'Configure your Gemini API key first.' : 'The local Gemini 3.8 Flash connection is not ready. Refresh its configuration status.'
    : configuration === 'missing' ? '先配置Gemini API密钥。' : 'Gemini 本地入口尚未就绪，请刷新配置状态。');
  return createExamRoundAI('gemini');
}

export function AstraConfigurationNotice({ configuration, language, onRefresh, busy = false }: {
  configuration: AstraConfiguration; language: RoundLanguage; onRefresh: () => void; busy?: boolean;
}) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  return <div className="study-round-model-status">
    <p role="status">{configuration === 'ready' ? t('已读取 Gemini 3.8 Flash 的 API 密钥，可以开始试用。', 'The Gemini 3.8 Flash API key is configured. You can try a round.')
      : configuration === 'checking' ? t('正在检查 Gemini 3.8 Flash 本地配置…', 'Checking local Gemini 3.8 Flash configuration…')
        : configuration === 'missing' ? t('先配置Gemini API密钥', 'Configure your Gemini API key first')
          : t('Gemini 本地入口暂不可用，请确认本地服务已启动。', 'The local Gemini 3.8 Flash connection is unavailable. Check that the local server is running.')}</p>
    {(configuration === 'missing' || configuration === 'unavailable') && <p className="study-round-model-setup">{t('在副本的 .env.local 文件中填写 GEMINI_API_KEY，保存后点击「刷新配置状态」。', 'Set GEMINI_API_KEY in the copy’s .env.local file, save it, then refresh the configuration status.')}</p>}
    <button type="button" disabled={busy || configuration === 'checking'} onClick={onRefresh}><RotateCcw size={13} />{t('刷新配置状态', 'Refresh configuration status')}</button>
  </div>;
}

export function StudyRoundModelChoice({ configuration, language, busy = false, onRefresh }: {
  configuration: AstraConfiguration; language: RoundLanguage;
  busy?: boolean; onRefresh: () => void;
}) {
  return <div className="study-round-model-choice">
    <span className="study-round-model-label">Gemini 3.8 Flash</span>
    {configuration !== 'ready' && <AstraConfigurationNotice configuration={configuration} language={language} onRefresh={onRefresh} busy={busy} />}
  </div>;
}

/** A paused draft can still be resumed, so its surrounding labels must not prime the answer. */
export function isIndependentPracticeStage(round: StudyRound | null | undefined): boolean {
  if (!round || !(round.phase === 'answering' || round.phase === 'paused' && round.resumePhase === 'answering')) return false;
  return round.questions.some(question => question.id === round.currentQuestionId && question.practiceVersion === 1);
}

export function PracticeDesignNotice({ design, language, submitted = false, onReveal }: {
  design: RoundBlueprint['practiceDesign']; language: RoundLanguage; submitted?: boolean; onReveal?: () => void;
}) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  if (design?.version !== 1) return null;
  if (design.caseAvailability === 'included' && design.preparationNote === 'stronger_cues') {
    return <p className="study-round-practice-note">{t('案例已准备好，这轮保留了较明确的题干线索。会按实际提示条件记录作答，之后可选择少些提示再练。', 'Your cases are ready with more explicit cues. Answers will be recorded under those actual conditions; you can choose fewer cues later.')}</p>;
  }
  if (design.caseAvailability !== 'limited') return null;
  if (!submitted) return <p className="study-round-practice-note">{t('这段材料适合的案例较少，本轮会搭配基础回顾。', 'This material supports fewer case tasks, so this round also includes foundation review.')}</p>;
  if (!design.limitation?.trim()) return null;
  return <details className="study-round-practice-limitation" onToggle={event => { if (event.currentTarget.open && event.target === event.currentTarget) onReveal?.(); }}>
    <summary>{t('这轮材料适合怎样的练习？', 'What practice does this material support?')}</summary>
    <div className="study-round-prose">{prose(design.limitation)}</div>
  </details>;
}

/** Synchronous because navigation does not wait for React cleanup or asynchronous writes. */
export function saveRoundOnLeave({ round, store, memoryStore, storageKey, now = Date.now() }: {
  round: StudyRound | null; store: RoundRecordStore; memoryStore?: RoundRecordStore; storageKey: string; now?: number;
}): { round: StudyRound | null; store: RoundRecordStore; changed: boolean; saved: boolean } {
  if (!round || round.phase !== 'answering') return { round, store, changed: false, saved: true };
  let nextStore = mergeRoundStore(store, memoryStore || emptyStore());
  let readable = true;
  try { nextStore = mergeRoundStore(nextStore, loadRoundStore(storageKey)); } catch { readable = false; }
  const latest = nextStore.rounds.find((item) => item.id === round.id);
  const current = latest && latest.updatedAt > round.updatedAt ? latest : round;
  // A newer submitted, paused, or ended record must not be overwritten by an old answering view.
  if (current.phase !== 'answering') return { round: current, store: nextStore, changed: false, saved: true };
  const paused = pauseRound(hydrateRoundExposures(current, nextStore.scopeExposures), Math.max(now, current.updatedAt));
  nextStore = upsertRound(nextStore, paused);
  let saved = false;
  try { if (readable) { saveRoundStore(storageKey, nextStore); saved = true; } } catch { /* Caller retains the complete in-memory record. */ }
  return { round: paused, store: nextStore, changed: true, saved };
}

export function listenForRoundLeave(target: EventTarget, save: () => void): () => void {
  // Never preventDefault or set returnValue: leaving does not require a confirmation dialog.
  target.addEventListener('pagehide', save);
  target.addEventListener('beforeunload', save);
  return () => {
    target.removeEventListener('pagehide', save);
    target.removeEventListener('beforeunload', save);
  };
}

export function StudyRoundPanel({ context, storageKey, language, onOpenSource, onRecordChange, onStoreChange, sourceOpenedToken = 0, storeChangedToken = 0, memoryStore, onNextBlock, onIndependentStart, ai }: StudyRoundPanelProps) {
  const t = (zh: string, en: string) => language === 'en' ? en : zh;
  const initial = useMemo(() => {
    try { return { store: mergeRoundStore(loadRoundStore(storageKey), memoryStore || emptyStore()), error: '' }; }
    catch { return { store: memoryStore || emptyStore(), error: t('这台设备的学习记录暂时无法读取。新记录将先保留在当前页面，请导出备份。', 'Saved records could not be read. New work will stay on this page; export a backup.') }; }
  }, [storageKey]);
  const [store, setStore] = useState(initial.store);
  const storeRef = useRef(initial.store);
  const canWriteStore = useRef(!initial.error);
  const matching = (records: RoundRecordStore) => records.rounds.filter((item) => item.blueprint.scope.id === context.scope.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const [round, setRound] = useState<StudyRound | null>(() => { const available = matching(initial.store); const selected = available.find((item) => item.phase !== 'ended') || available[0]; return selected ? hydrateRoundExposures(selected, initial.store.scopeExposures) : null; });
  const roundRef = useRef(round);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.closest('.round-workspace-content')?.scrollTo({ top: 0 });
  }, [round?.currentQuestionId, round?.phase]);
  const [storageError, setStorageError] = useState(initial.error);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [planStage, setPlanStage] = useState<'generating' | 'reviewing' | 'repairing'>('generating');
  const [budget, setBudget] = useState(6);
  const [timeLimit, setTimeLimit] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [blueprint, setBlueprint] = useState<RoundBlueprint | null>(null);
  const provider: StudyRoundProvider = 'gemini';
  const [astraConfiguration, setAstraConfiguration] = useState<AstraConfiguration>(ai ? 'ready' : 'checking');
  const configurationRequest = useRef(0);
  const [recheck, setRecheck] = useState(context.scope.mode === 'recheck' && matching(initial.store).some((item) => item.attempts.length > 0));
  const [disputeNotes, setDisputeNotes] = useState<Record<string, string>>({});
  const [rechecks, setRechecks] = useState<Record<string, RoundEvaluation>>({});
  const generation = useRef(0);
  const mounted = useRef(true);
  const sourceToken = useRef(sourceOpenedToken);
  const memoryRef = useRef(memoryStore);
  memoryRef.current = memoryStore;
  const callbacks = useRef({ onRecordChange, onStoreChange, onIndependentStart });
  callbacks.current = { onRecordChange, onStoreChange, onIndependentStart };
  const refreshAstraConfiguration = async () => {
    const request = ++configurationRequest.current;
    setAstraConfiguration('checking');
    const next = ai ? 'ready' : await readAstraConfiguration();
    if (mounted.current && configurationRequest.current === request) setAstraConfiguration(next);
  };
  useEffect(() => { void refreshAstraConfiguration(); }, [ai]);
  const canRequest = (_selected: StudyRoundProvider) => !!ai || astraConfiguration === 'ready';
  const requestAI = (selected: StudyRoundProvider) => studyRoundAIForRequest(selected, astraConfiguration, language, ai);
  const requestUnavailable = !!round && !canRequest(studyRoundProvider(round.blueprint));

  useEffect(() => {
    mounted.current = true;
    setRound(roundRef.current);
    const pauseBeforeLeaving = () => {
      generation.current += 1;
      const result = saveRoundOnLeave({ round: roundRef.current, store: storeRef.current, memoryStore: memoryRef.current, storageKey });
      roundRef.current = result.round;
      storeRef.current = result.store;
      if (mounted.current) {
        setRound(result.round);
        setStore(result.store);
        setBusy('');
        if (!result.saved) setStorageError(t('离开前的自动保存失败。记录仍在当前页面，请导出备份。', 'Autosave before leaving failed. Keep this page open and export a backup.'));
      }
      if (result.changed) {
        callbacks.current.onStoreChange?.(result.store);
        if (result.round) callbacks.current.onRecordChange?.(result.round);
      }
    };
    const removeListeners = listenForRoundLeave(window, pauseBeforeLeaving);
    return () => {
      mounted.current = false;
      removeListeners();
      pauseBeforeLeaving();
    };
  }, []);
  useEffect(() => {
    if (round?.phase !== 'answering') return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [round?.phase, round?.currentQuestionId]);

  const synchronize = () => {
    let nextStore = mergeRoundStore(storeRef.current, memoryRef.current || emptyStore());
    try { nextStore = mergeRoundStore(nextStore, loadRoundStore(storageKey)); canWriteStore.current = true; }
    catch { canWriteStore.current = false; setStorageError(t('暂时无法读取已有记录，当前内容先保留在页面里。请导出备份。', 'Saved records cannot be read. Keep this page open and export a backup.')); }
    storeRef.current = nextStore;
    setStore(nextStore);
    if (roundRef.current) {
      const saved = nextStore.rounds.find((item) => item.id === roundRef.current!.id);
      const current = saved && saved.updatedAt > roundRef.current.updatedAt ? saved : roundRef.current;
      roundRef.current = hydrateRoundExposures(current, nextStore.scopeExposures);
      setRound(roundRef.current);
    }
    return nextStore;
  };
  const persist = (nextStore: RoundRecordStore) => {
    storeRef.current = nextStore;
    setStore(nextStore);
    try { if (!canWriteStore.current) throw new Error('Existing records were not readable'); saveRoundStore(storageKey, nextStore); setStorageError(''); }
    catch { setStorageError(t('自动保存失败，记录目前只在这个页面里。离开或刷新前，请导出本轮记录。', 'Autosave failed. Your work is only on this page. Export it before leaving or refreshing.')); }
    callbacks.current.onStoreChange?.(nextStore);
  };
  const commit = (next: StudyRound) => {
    const latest = synchronize();
    const hydrated = hydrateRoundExposures(next, latest.scopeExposures);
    const nextStore = upsertRound(latest, hydrated);
    const kept = nextStore.rounds.find((item) => item.id === hydrated.id) || hydrated;
    roundRef.current = kept;
    setRound(kept);
    persist(nextStore);
    callbacks.current.onRecordChange?.(kept);
    return kept;
  };
  const currentRound = () => { synchronize(); return roundRef.current; };
  const expose = (kind: RoundHelpKind) => {
    const current = currentRound();
    if (current) commit(recordScopeExposure(current, kind));
    else persist(recordStoreScopeExposure(storeRef.current, context.scope, kind));
  };

  useEffect(() => {
    if (sourceToken.current === sourceOpenedToken) return;
    sourceToken.current = sourceOpenedToken;
    expose('source');
  }, [sourceOpenedToken]);
  useEffect(() => { synchronize(); }, [storeChangedToken]);

  const cancelPending = () => { generation.current += 1; setBusy(''); setError(''); };
  const beginRequest = (kind: string) => { setBusy(kind); setError(''); return ++generation.current; };
  const live = (request: number, id?: string) => mounted.current && generation.current === request && (!id || roundRef.current?.id === id);
  const finishRequest = (request: number) => { if (live(request)) setBusy(''); };
  const question = round?.questions.find((item) => item.id === round.currentQuestionId);
  const attempt = round?.attempts.find((item) => item.question.id === round.currentQuestionId);
  const history = useMemo(() => buildRoundHistory(store.rounds, context.scope, store.scopeExposures), [store, context.scope]);
  const previousRounds = store.rounds.filter((item) => item.blueprint.scope.id === context.scope.id && item.id !== round?.id);
  const previousAt = Math.max(0, ...previousRounds.flatMap((item) => item.attempts.map((answer) => answer.submittedAt)));
  const sameScopeLatestAt = Math.max(0, ...store.rounds.filter((item) => item.blueprint.scope.id === context.scope.id).flatMap((item) => item.attempts.map((answer) => answer.submittedAt)));
  const formatElapsed = (value: number) => { const seconds = Math.floor(Math.max(0, value) / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; };
  const attemptTime = (item: RoundAttempt) => item.elapsedMs === undefined ? t('未记录用时', 'Time not recorded') : `${t('用时', 'Time')} ${formatElapsed(item.elapsedMs)}${item.timeLimitSeconds ? ` · ${item.elapsedMs > item.timeLimitSeconds * 1000 ? t('超出自选时限', 'Over your chosen limit') : t('在自选时限内', 'Within your chosen limit')} ${formatElapsed(item.timeLimitSeconds * 1000)}` : ` · ${t('未设时限', 'No time limit')}`}`;
  const formatDate = (value: number) => new Intl.DateTimeFormat(language === 'en' ? 'en-CA' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
  const formatGap = (value: number, until = Date.now()) => {
    const days = Math.floor(Math.max(0, until - value) / 86400000);
    return days === 0 ? t('不足 1 天', 'less than 1 day') : t(`${days} 天`, `${days} day${days === 1 ? '' : 's'}`);
  };

  const exportRecords = () => {
    const blob = new Blob([JSON.stringify(storeRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `study-round-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openSource = (citation: RoundCitation) => {
    const nextStore = recordStoreExposure(synchronize(), [{ materialId: citation.materialId, pages: [citation.page] }], 'source');
    persist(nextStore);
    if (roundRef.current) commit(hydrateRoundExposures(roundRef.current, nextStore.scopeExposures));
    onOpenSource(citation);
  };
  const sources = (citations: RoundCitation[]) => <div className="study-round-sources">{uniqueSources(citations).map((citation) => {
    const materialIndex = context.scope.materials.findIndex((item) => item.materialId === citation.materialId);
    const title = isIndependentPracticeStage(round)
      ? t(`资料 ${materialIndex + 1 || 1}`, `Source ${materialIndex + 1 || 1}`)
      : context.scope.materials[materialIndex]?.title || t('资料', 'Source');
    return <button type="button" key={`${citation.materialId}:${citation.page}`} onClick={() => openSource(citation)} title={`${title} · ${t('第', 'p.')} ${citation.page} ${t('页', '')}`}><BookOpen size={14} />{context.scope.materials.length > 1 ? `${title} · ` : ''}{t(`第 ${citation.page} 页`, `p. ${citation.page}`)}</button>;
  })}</div>;

  const prepare = async () => {
    if (busy || blueprint || !canRequest(provider)) return;
    callbacks.current.onIndependentStart?.();
    const currentStore = synchronize();
    const request = beginRequest('plan');
    setPlanStage('generating');
    try {
      const next = await requestAI(provider).plan({ ...context, scope: { ...context.scope, mode: recheck ? 'recheck' : context.scope.mode === 'integrated' ? 'integrated' : 'practice' } }, { maxAttempts: budget, history: buildRoundHistory(currentStore.rounds, context.scope, currentStore.scopeExposures), language,
        onProgress: stage => { if (live(request)) setPlanStage(stage); } });
      if (!ai && (!next.model || next.model.provider !== provider)) throw new Error(t('生成方案未使用 Astra，请重新准备。', 'The plan did not use Astra. Please prepare it again.'));
      if (!next.questions.length || next.questions.some(item => !hasReviewedPresentation(item))) throw new Error(t('题目尚未完成提示核对。', 'Question cue review is not complete.'));
      if (live(request)) setBlueprint({ ...next, answerTimeLimitSeconds: timeLimit || undefined });
    } catch (cause) { if (live(request)) setError(errorMessage(cause)); }
    finally { finishRequest(request); }
  };
  const start = () => {
    if (!blueprint || !canRequest(studyRoundProvider(blueprint))) return;
    cancelPending();
    callbacks.current.onIndependentStart?.();
    try {
      if (blueprint.questions.some(item => !hasReviewedPresentation(item))) throw new Error(t('请重新准备这轮题目。', 'Please prepare this round again.'));
      const currentStore = synchronize();
      const next = createRound({ ...blueprint, answerTimeLimitSeconds: timeLimit || undefined }, buildRoundHistory(currentStore.rounds, context.scope, currentStore.scopeExposures));
      commit(next);
      setBlueprint(null);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const newRound = (asRecheck: boolean) => {
    cancelPending();
    // Preserve an unfinished legacy draft when choosing a newly reviewed round.
    if (roundRef.current?.phase === 'answering') commit(pauseRound(roundRef.current));
    setBlueprint(null);
    setRecheck(asRecheck && matching(storeRef.current).some((item) => item.attempts.length > 0));
    setRound(null);
    roundRef.current = null;
  };

  const evaluate = async (submitted: StudyRound, submittedAttempt: RoundAttempt) => {
    const request = beginRequest('evaluate');
    try {
      const evaluation = await requestAI(studyRoundProvider(submitted.blueprint)).evaluate(context, submittedAttempt.question, submittedAttempt.answer, { language });
      if (live(request, submitted.id)) {
        let nextRound = applyEvaluation(roundRef.current!, submittedAttempt.id, evaluation);
        if (nextRound.phase === 'feedback' && nextRound.attempts.length >= nextRound.blueprint.maxAttempts) nextRound = advanceRound(nextRound);
        commit(nextRound);
      }
    } catch (cause) {
      if (live(request, submitted.id)) commit(recordEvaluationError(roundRef.current!, submittedAttempt.id, t('反馈暂时没有生成，可以重试。重试不会再占用作答次数。', 'Feedback could not be generated. Retry without using another attempt.') + ' ' + errorMessage(cause)));
    } finally { finishRequest(request); }
  };
  const submit = () => {
    const current = currentRound();
    if (!current || busy || current.phase !== 'answering' || !current.draft.trim() || !canRequest(studyRoundProvider(current.blueprint))) return;
    try {
      const submitted = commit(submitRoundAnswer(current, current.draft.trim()));
      const latest = submitted.attempts[submitted.attempts.length - 1];
      if (latest) void evaluate(submitted, latest);
    } catch (cause) { setError(errorMessage(cause)); }
  };
  const getSupport = async (kind: 'hint' | 'explanation') => {
    const current = currentRound();
    const currentQuestion = current?.questions.find((item) => item.id === current.currentQuestionId);
    if (!current || !currentQuestion || busy || current.phase !== 'answering' || !canRequest(studyRoundProvider(current.blueprint))) return;
    const exposed = commit(recordHelp(current, kind));
    const request = beginRequest(kind);
    try {
      const support = await requestAI(studyRoundProvider(current.blueprint)).support(context, currentQuestion, exposed.draft, kind, language);
      if (live(request, current.id) && roundRef.current?.currentQuestionId === currentQuestion.id && roundRef.current.phase === 'answering') commit(addSupport(roundRef.current, { ...support, questionId: currentQuestion.id, kind, at: Date.now() }));
    } catch (cause) { if (live(request, current.id)) setError(t('这次帮助没有加载出来，可以再试一次。', 'This help could not be loaded. You can try again.') + ' ' + errorMessage(cause)); }
    finally { finishRequest(request); }
  };
  const next = async (diagnostic: boolean, reduceCues = false) => {
    const current = currentRound();
    if (!current || busy) return;
    const move = (nextRound: StudyRound) => {
      if (nextRound.phase === 'answering') callbacks.current.onIndependentStart?.();
      commit(nextRound);
    };
    if (!diagnostic) { try { move(advanceRound(current)); } catch (cause) { setError(errorMessage(cause)); } return; }
    const request = beginRequest('followup');
    try {
      const followUp = await requestAI(studyRoundProvider(current.blueprint)).followUp(context, current, language, reduceCues ? { reduceCues: true } : undefined);
      if (live(request, current.id)) {
        const latest = currentRound()!;
        const report = buildRoundReport(latest);
        const allChecked = report.rows.length > 0 && report.independent.length === report.rows.length
          && latest.attempts.every((item) => item.evaluation && !item.evaluationError && (!item.dispute || item.dispute.resolvedAt));
        move(!followUp && allChecked ? { ...endRound(latest), endReason: 'completed' } : advanceRound(latest, followUp || undefined));
      }
    } catch (cause) { if (live(request, current.id)) setError(t('补充问题还没准备好，可以重试或结束本轮。', 'The follow-up could not be prepared. Retry or finish this round.') + ' ' + errorMessage(cause)); }
    finally { finishRequest(request); }
  };
  const resume = () => {
    const current = currentRound();
    if (!current) return;
    cancelPending();
    commit(resumeRound(current));
  };
  const recordHistoryExposure = () => {
    expose('feedback');
  };
  const recordDispute = (item: RoundAttempt) => {
    const current = roundRef.current;
    const note = disputeNotes[item.id]?.trim();
    if (!current || !note) return;
    commit(disputeAttempt(current, item.id, note));
    setRechecks((values) => { const nextValues = { ...values }; delete nextValues[item.id]; return nextValues; });
  };
  const recheckDispute = async (item: RoundAttempt) => {
    const current = roundRef.current;
    if (!current || !item.dispute || busy) return;
    const request = beginRequest(`dispute:${item.id}`);
    try {
      const evaluation = await requestAI(studyRoundProvider(current.blueprint)).evaluate(context, item.question, item.answer, { language, dispute: item.dispute.note });
      if (live(request, current.id)) setRechecks((values) => ({ ...values, [item.id]: evaluation }));
    } catch (cause) { if (live(request, current.id)) setError(t('重新核对失败，异议仍保留，可以重试。', 'The review failed. Your dispute is still recorded; retry any time.') + ' ' + errorMessage(cause)); }
    finally { finishRequest(request); }
  };

  const evaluationBody = (item: RoundAttempt, evaluation: RoundEvaluation) => <FeedbackAnswer attempt={item} evaluation={evaluation} language={language} renderSources={sources} />;
  const refreshFeedback = (item: RoundAttempt) => item.evaluation && item.evaluation.feedbackVersion !== 1 && <div className="study-round-refresh-feedback">
    {item.evaluationError && <p role="alert" className="study-round-notice">{item.evaluationError}</p>}
    <button type="button" disabled={!!busy || requestUnavailable} onClick={() => { const current = currentRound(); if (current?.attempts.some(attempt => attempt.id === item.id)) void evaluate(current, item); }}><RotateCcw size={15} />{t('按新方式整理反馈', 'Reorganize this feedback')}</button>
    <p className="study-round-muted">{t('重新核对这份原答，不另提交，也不增加作答次数。', 'Reviews this original answer without another submission or attempt.')}</p>
  </div>;

  const disputeControls = (item: RoundAttempt) => <details className="study-round-dispute"><summary><Flag size={14} />{item.dispute && !item.dispute.resolvedAt ? t('这次反馈有待核对', 'Feedback under review') : t('这次反馈有问题？', 'Something wrong with this feedback?')}</summary>
    {item.dispute && <p className="study-round-muted">{item.dispute.note} · {item.dispute.resolvedAt ? t('已由你认可核对结果', 'Review accepted by you') : t('核对前暂不计入独立证据', 'Excluded from independent evidence pending review')}</p>}
    <div className="study-round-dispute-options">{[[t('题目越界', 'Outside the scope'), t('题目超出了所选材料的范围。', 'The question goes beyond the selected material.')], [t('依据不对', 'Wrong source'), t('这次反馈引用的材料依据不对。', 'The feedback uses the wrong source evidence.')], [t('回答被误解', 'Answer misunderstood'), t('这次反馈误解了我的回答。', 'The feedback misunderstood my answer.')]].map(([label, value]) => <button type="button" key={label} onClick={() => setDisputeNotes((notes) => ({ ...notes, [item.id]: value }))}>{label}</button>)}</div>
    <label className="study-round-sr-only" htmlFor={`round-dispute-${item.id}`}>{t('说明异议', 'Describe the issue')}</label><textarea id={`round-dispute-${item.id}`} rows={2} value={disputeNotes[item.id] || ''} onChange={(event) => setDisputeNotes((notes) => ({ ...notes, [item.id]: event.target.value }))} placeholder={t('可以补充哪里不对……', 'Tell us what seems wrong…')} />
    <div className="study-round-actions"><button type="button" disabled={!!busy || !disputeNotes[item.id]?.trim()} onClick={() => recordDispute(item)}>{t('记录异议', 'Record issue')}</button>{item.dispute && !item.dispute.resolvedAt && <button type="button" disabled={!!busy || requestUnavailable} onClick={() => void recheckDispute(item)}><RotateCcw size={15} />{t('按原文重新核对', 'Review against the source')}</button>}</div>
    {rechecks[item.id] && <div className="study-round-review-preview"><h4>{t('重新核对的结果', 'Revised feedback')}</h4>{evaluationBody(item, rechecks[item.id])}<button type="button" className="study-round-primary" disabled={!!busy} onClick={() => { if (roundRef.current) commit(resolveDispute(roundRef.current, item.id, rechecks[item.id])); setRechecks((values) => { const copy = { ...values }; delete copy[item.id]; return copy; }); }}><Check size={16} />{t('我认可这次核对', 'I accept this review')}</button><p className="study-round-muted">{t('如果仍有问题，可以补充异议后再次核对。', 'If it still seems wrong, update your issue and review again.')}</p></div>}
  </details>;

  const pastAnswers = (items: StudyRound[]) => <div className="study-round-history">{items.filter((item) => item.attempts.length).sort((a, b) => b.startedAt - a.startedAt).map((item) => <details key={item.id} onToggle={(event) => { if (event.currentTarget.open && event.target === event.currentTarget) recordHistoryExposure(); }}>
    <summary>{formatDate(item.startedAt)} · {t(`${item.attempts.length} 次作答`, `${item.attempts.length} attempts`)}</summary>
    {item.attempts.map((answer, index) => <article className="study-round-history-answer" key={answer.id}>
      <h4>{index + 1}. {answer.question.prompt}</h4>
      <p className="study-round-muted">{formatDate(answer.submittedAt)} · {attemptTime(answer)} · {summarizeQuestionConditions(answer, language)}</p>
      <div className="study-round-original-answer">{answer.answer}</div>
      {answer.evaluation ? evaluationBody(answer, answer.evaluation) : <div><p>{answer.evaluationError || t('尚未获得反馈', 'Feedback not yet available')}</p>{round?.id === item.id && <button type="button" disabled={!!busy || requestUnavailable} onClick={() => { if (roundRef.current) void evaluate(roundRef.current, answer); }}>{t('重试反馈，不重复计次', 'Retry feedback, no extra attempt')}</button>}</div>}
      {answer.helpEvents.length > 0 && <details><summary>{t('查看帮助记录', 'Help history')}</summary><ul>{answer.helpEvents.map((event) => <li key={event.id}>{formatDate(event.at)} · {helpLabel(event.kind)}</li>)}</ul></details>}
      {round?.id === item.id && answer.evaluation && <>{refreshFeedback(answer)}{disputeControls(answer)}</>}
    </article>)}
  </details>)}</div>;
  const helpLabel = (kind: RoundHelpKind) => ({ source: t('看过原文', 'Source viewed'), hint: t('用过提示', 'Hint used'), explanation: t('看过讲解', 'Explanation viewed'), feedback: t('看过反馈', 'Feedback viewed') })[kind];
  const currentSupports = round?.supports.filter((item) => item.questionId === question?.id) || [];
  const questionPages = new Set(question?.criteria.flatMap((criterion) => criterion.sources.map((citation) => JSON.stringify([citation.materialId, citation.page]))) || []);
  const hasHelp = !!round?.currentHelp.length || !!round?.exposures.some((exposure) => {
    if (Date.now() - exposure.at >= RECHECK_DELAY_MS) return false;
    try { const pages = JSON.parse(exposure.targetKey).pages; return Array.isArray(pages) && pages.some((page: string) => questionPages.has(page)); }
    catch { return false; }
  });
  const answerElapsed = round ? getAnswerElapsedMs(round, clockNow) : 0;
  const chosenLimit = round?.blueprint.answerTimeLimitSeconds;
  const overTime = !!chosenLimit && answerElapsed > chosenLimit * 1000;
  const timedAttempts = round?.attempts.filter((item) => item.elapsedMs !== undefined) || [];
  const report = round?.phase === 'ended' ? buildRoundReport(round, store.rounds.filter((item) => item.id !== round.id)) : null;
  const lastAttempt = round?.attempts.at(-1);
  const knowledgeEvidence = buildKnowledgeEvidence(context.scope.knowledgeTargets ?? [], store.rounds);
  const uncheckedAtoms = knowledgeEvidence.filter(row => row.status === 'unchecked').length;
  const exercise = question?.practiceVersion === 1 && hasReviewedPresentation(question) ? question.audit?.exercise : undefined;
  const exerciseLabel = exercise && ({
    direct: t('基础回顾', 'Foundation review'), case: t('案例分析', 'Case analysis'), compare: t('比较解释', 'Compare and explain'),
    predict: t('预测变化', 'Predict a change'), data: t('解读结果', 'Interpret results'),
  })[exercise.taskType];

  return <section ref={panelRef} className="study-round" aria-label={t('本轮学习', 'Study round')}>
    {storageError && <div role="alert" className="study-round-storage-error"><AlertCircle size={18} /><div><strong>{t('记录尚未安全保存', 'Records are not safely saved')}</strong><p>{storageError}</p><button type="button" onClick={exportRecords}><Download size={15} />{t('导出记录备份', 'Export backup')}</button></div></div>}
    {error && <div role="alert" className="study-round-notice"><AlertCircle size={18} /><p>{error}</p></div>}
    {!round ? <div className="study-round-preparation">
      <p className="study-round-eyebrow">{recheck ? t('再检查一次', 'CHECK AGAIN') : t('把知识用起来', 'PUT YOUR KNOWLEDGE TO USE')}</p><h2>{t('准备这一轮练习', 'Prepare a practice round')}</h2><p className="study-round-intro">{t('把理解用在具体情境里，再一起看哪些理由已经说清楚、哪些还需要补上。', 'Use your understanding in a situation, then see which reasons are clear and what still needs work.')}</p>
      {sameScopeLatestAt > 0 && <p className="study-round-history-note">{t('上次同范围作答：', 'Last attempt in this scope: ')}{formatDate(sameScopeLatestAt)} · {t('距今', '')} {formatGap(sameScopeLatestAt)}</p>}
      <p className="study-round-session-note">{t('材料支持时，本轮以应用为主，也会换用比较、预测或解读结果。用自己的话说明理由就好，答完这一轮可以停。', 'When the material supports it, this round focuses on application, with comparisons, predictions or results to interpret. Explain your reasons in your own words; you can stop after the round.')}</p>
      <StudyRoundModelChoice configuration={astraConfiguration} language={language}
        busy={!!busy} onRefresh={() => void refreshAstraConfiguration()} />
      <details className="study-round-options"><summary>{t(`本轮设置 · 最多 ${budget} 次回答 · ${timeLimit ? `每题 ${timeLimit / 60} 分钟` : '不限时'}`, `Round settings · up to ${budget} answers · ${timeLimit ? `${timeLimit / 60} min per question` : 'untimed'}`)}</summary>
      <fieldset className="study-round-budget" disabled={!!busy || !!blueprint}><legend>{t('这一轮，最多回答几次？', 'How many attempts this round?')}</legend><div>{[4, 6, 8].map((value) => <button type="button" key={value} aria-pressed={budget === value} onClick={() => setBudget(value)}>{value}<small>{t('次', 'attempts')}</small></button>)}</div><p>{t('追问和重测也算一次。随时可以暂停或结束。', 'Follow-ups and rechecks also count. Pause or stop whenever you need.')}</p></fieldset>
      <fieldset className="study-round-time-choice" disabled={!!busy}><legend>{t('给每道题一个时间参照？', 'Set a time reference for each question?')}</legend><div>{[0, 180, 300].map((seconds) => <button type="button" key={seconds} aria-pressed={timeLimit === seconds} onClick={() => setTimeLimit(seconds)}>{seconds === 0 ? t('不限时', 'No limit') : t(`${seconds / 60} 分钟`, `${seconds / 60} minutes`)}</button>)}</div><p>{t('默认不限时。到了也可以继续，不会自动提交；暂停时不计时。', 'No limit by default. You can keep going after the time; nothing submits automatically. Pauses do not count.')}</p></fieldset>
      </details>

      {blueprint ? <div className="study-round-plan"><div className="study-round-section-heading"><h3>{t('本轮已准备好', 'Your round is ready')}</h3><span>{t(`${blueprint.questions.length} 道题 · ${blueprint.objectives.length} 个要点`, `${blueprint.questions.length} questions · ${blueprint.objectives.length} points`)}</span></div><PracticeDesignNotice design={blueprint.practiceDesign} language={language} /><div className="study-round-actions"><button type="button" className="study-round-primary" disabled={!canRequest(studyRoundProvider(blueprint))} onClick={start}><Play size={16} />{t('开始这一轮', 'Start this round')}</button><button type="button" onClick={() => setBlueprint(null)}>{t('调整次数', 'Change attempt limit')}</button></div><p className="study-round-muted">{t('作答前显示题目和形式要求，具体核对要点会在提交后展开。', 'Before answering, you see the task and format instructions. Detailed criteria appear after submission.')}</p></div> : <button type="button" className="study-round-primary" disabled={!!busy || !canRequest(provider) || !context.pages.some((page) => page.text.trim())} onClick={() => void prepare()}>{busy === 'plan' ? <span className="study-round-spinner" /> : <ArrowRight size={17} />}{busy === 'plan' ? planStage === 'repairing' ? t('正在调整案例题，无需再次点击…', 'Adjusting the cases; no need to click again…') : planStage === 'reviewing' ? t('正在核对题目和原文…', 'Checking questions against sources…') : t('正在准备题目…', 'Preparing questions…') : t('准备这一轮', 'Prepare this round')}</button>}
      {!context.pages.some((page) => page.text.trim()) && <p className="study-round-muted">{t('所选页还没有可读取的文字，请先换一段材料。', 'These pages have no readable text. Choose another source range.')}</p>}
      {history.previousQuestions.length > 0 && <p className="study-round-muted">{t('会参考以前的问题，尽量换个问法或情境检查。', 'Earlier questions will inform new wording or situations for this round.')}</p>}
      {store.rounds.some((item) => item.blueprint.scope.id === context.scope.id && item.attempts.length) && <details className="study-round-history-wrap"><summary>{t('之前的完整作答', 'Previous full answers')}</summary>{pastAnswers(store.rounds.filter((item) => item.blueprint.scope.id === context.scope.id))}</details>}
    </div> : <>
      <header className="study-round-toolbar"><div><span className="study-round-eyebrow">{round.phase === 'ended' ? t('本轮已结束', 'ROUND FINISHED') : round.phase === 'paused' ? t('已暂停', 'PAUSED') : t('本轮学习', 'CURRENT ROUND')}</span><span className="study-round-model-label">{modelLabel()}</span><span className="study-round-attempt-counter">{t(`已提交 ${round.attempts.length} / ${round.blueprint.maxAttempts} 次`, `${round.attempts.length} / ${round.blueprint.maxAttempts} attempts submitted`)}</span></div><div className="study-round-toolbar-actions">{round.phase !== 'ended' && <><button type="button" onClick={() => { if (round.phase === 'paused') { resume(); return; } cancelPending(); if (roundRef.current) commit(pauseRound(roundRef.current)); }}>{round.phase === 'paused' ? <Play size={15} /> : <Pause size={15} />}{round.phase === 'paused' ? t('继续', 'Resume') : t('暂停', 'Pause')}</button><button type="button" onClick={() => { cancelPending(); if (roundRef.current) commit(endRound(roundRef.current)); }}>{t('结束本轮', 'Finish round')}</button></>}<button type="button" onClick={exportRecords} aria-label={t('导出完整记录', 'Export full records')} title={t('导出完整记录', 'Export full records')}><Download size={16} /></button></div></header>
      {astraConfiguration !== 'ready' && <AstraConfigurationNotice configuration={astraConfiguration} language={language} onRefresh={() => void refreshAstraConfiguration()} busy={!!busy} />}
      {previousAt > 0 && <p className="study-round-history-note">{t('上次同范围作答', 'Previous attempt in this scope')} {formatDate(previousAt)} · {t('间隔', 'Gap:')} {formatGap(previousAt, round.startedAt)}</p>}
      {(round.phase === 'answering' || round.phase === 'paused') && question && !hasReviewedPresentation(question) ? <div className="study-round-legacy-question"><AlertCircle size={25} /><h2>{t('这轮旧题需要重新整理', 'This older round needs fresh questions')}</h2><p>{t('旧题可能在作答前展示过内容提示，暂不再用来检查独立回忆。原来的作答、反馈和草稿都保留。', 'Earlier questions may have exposed answer content before submission. They are retained with your answers and draft, but are not used to check unaided recall.')}</p>{round.draft && <details><summary>{t('查看保留的草稿', 'View your saved draft')}</summary><p className="study-round-original-answer">{round.draft}</p></details>}<button type="button" className="study-round-primary" onClick={() => newRound(false)}>{t('保留记录，准备新一轮', 'Keep records and prepare a new round')}<ArrowRight size={16} /></button></div> : round.phase === 'paused' ? <div className="study-round-pause"><Pause size={30} /><h2>{t('先歇一会儿', 'Take a breather')}</h2><p>{storageError ? t('草稿和帮助记录暂留在当前页面，请先导出备份。', 'Your draft and help history are on this page. Export a backup.') : t('草稿、作答和用过的帮助都已保留在这台设备。', 'Your draft, answers, and help history are saved on this device.')}</p><button type="button" className="study-round-primary" onClick={resume}><Play size={16} />{t('从这里继续', 'Continue from here')}</button></div> : round.phase === 'ended' && report ? <div className="study-round-report">
        <p className="study-round-eyebrow">{t('留下这一轮的真实记录', 'WHAT THIS ROUND SHOWED')}</p><h2>{t('这次，走到了这里', 'Here is where you got to')}</h2><p className="study-round-intro">{round.endReason === 'budget' ? t('已用完本轮作答次数。下面只记录这些回答能说明的情况。', 'This round’s attempt limit is reached. The record below reflects these answers.') : t('下面按检查方向整理。没有回答到的内容，会留在“还没检查”。', 'Results are grouped by area. Anything not answered remains unchecked.')}</p>
        {lastAttempt?.evaluation && <section className="study-round-final-feedback"><h3>{t('最后一次作答的反馈', 'Feedback on your last answer')}</h3><p className="study-round-muted">{lastAttempt.question.prompt}</p>{evaluationBody(lastAttempt, lastAttempt.evaluation)}{refreshFeedback(lastAttempt)}</section>}
        {round.attempts.length > 0 && <PracticeDesignNotice design={round.blueprint.practiceDesign} language={language} submitted onReveal={() => expose('explanation')} />}
        <div className="study-round-report-time"><Clock3 size={16} /><span>{timedAttempts.length ? t(`已记录 ${timedAttempts.length} 次作答用时，共 ${formatElapsed(timedAttempts.reduce((total, item) => total + (item.elapsedMs || 0), 0))}（暂停不计）`, `Time recorded for ${timedAttempts.length} answers: ${formatElapsed(timedAttempts.reduce((total, item) => total + (item.elapsedMs || 0), 0))} total, excluding pauses`) : t('本轮还没有已提交的作答用时记录。', 'No submitted-answer time is recorded for this round.')}</span>{timedAttempts.some((item) => item.timeLimitSeconds && item.elapsedMs! > item.timeLimitSeconds * 1000) && <span className="study-round-time-over-label">{t(`${timedAttempts.filter((item) => item.timeLimitSeconds && item.elapsedMs! > item.timeLimitSeconds * 1000).length} 次超出自选时限`, `${timedAttempts.filter((item) => item.timeLimitSeconds && item.elapsedMs! > item.timeLimitSeconds * 1000).length} over the chosen limit`)}</span>}</div>
        {!!knowledgeEvidence.length && <p className="study-round-history-note">{t(`这份复习块还有 ${uncheckedAtoms} 个原子尚未检查；本轮结束不代表整个 KC 已掌握。`, `${uncheckedAtoms} atoms in this block remain unchecked. Finishing this round does not establish mastery of the entire KC.`)}</p>}
        <div className="study-round-report-counts">{[[t('未借助额外帮助', 'Without extra help'), report.independent.length], [t('支持后说清', 'With support'), report.assisted.length], [t('还需补上', 'Needs work'), report.needsWork.length], [t('还没检查', 'Unchecked'), report.unchecked.length], [t('暂不确定', 'Uncertain'), report.uncertain.length]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
        <div className="study-round-evidence">{report.rows.map((row) => <section key={row.objective.id}><div><span className="study-round-evidence-dot" data-status={row.status} /><h3>{row.objective.label}</h3></div><p>{({ independent: t('在这次题目条件下，未借助额外帮助完成。', 'Completed under this question’s conditions without extra help.'), assisted: t('在提示、讲解或相关内容支持后说清楚。', 'Explained after hints, explanation, or related support.'), needs_work: t('已经检查，仍有需要补上的部分。', 'Checked; some parts still need work.'), unchecked: t('本轮还没有检查到。', 'Not checked in this round.'), uncertain: t('题目提示条件、依据或反馈仍需核对。', 'Cue conditions, sources or feedback still need review.') })[row.status]}{row.attempts.length > 0 && <span className="study-round-cue-note">{summarizeQuestionConditions(row.attempts[row.attempts.length - 1], language, row.objective.id)}</span>}{row.delayedCheck && <span className="study-round-delayed-label">{t('间隔后复查', 'Checked after a delay')}</span>}</p>{sources(row.objective.sources)}<ConditionEvidenceSummary attempts={row.attempts} objectiveId={row.objective.id} language={language} /></section>)}</div>
        <div className="study-round-next-step"><h3>{t('下一小步', 'A small next step')}</h3><p>{language === 'en' ? (report.needsWork.length ? 'Return to one area that needs work, then try a fresh question.' : report.uncertain.length ? 'Review the disputed evidence before drawing a conclusion.' : report.unchecked.length ? 'Choose one unchecked area for the next round.' : 'Come back after a break and check with a new question.') : report.nextStep}</p><div className="study-round-actions">{!!knowledgeEvidence.length && <button type="button" className="study-round-primary" onClick={() => newRound(false)}>{t(uncheckedAtoms ? `继续检查其他要点（${uncheckedAtoms} 项未查）` : '按记录安排下一轮', uncheckedAtoms ? `Check other points (${uncheckedAtoms} unchecked)` : 'Plan from the knowledge record')}<ArrowRight size={16} /></button>}<button type="button" className="study-round-primary" onClick={() => newRound(true)}>{t('换个问题再检查', 'Check with a new question')}<ArrowRight size={16} /></button>{onNextBlock && <button type="button" onClick={onNextBlock}>{t('看看下一个复习块', 'See the next block')}</button>}</div><p className="study-round-muted">{t('稍后再来时，会显示实际间隔；现在继续不会算作间隔复查。', 'A later visit will show the actual interval. Continuing now is not a delayed recheck.')}</p></div>
        <details className="study-round-history-wrap"><summary>{t('展开完整原答与反馈', 'Full answers and feedback')}</summary>{pastAnswers([round])}</details>{previousRounds.some((item) => item.attempts.length) && <details className="study-round-history-wrap"><summary>{t('之前的轮次', 'Earlier rounds')}</summary>{pastAnswers(previousRounds)}</details>}
      </div> : question ? <div className="study-round-task" key={question.id}>
        <div className="study-round-question-meta"><span>{exerciseLabel || t('先把你的理解完整说出来', 'PUT YOUR UNDERSTANDING INTO WORDS')}</span><span>{t('先独立想一想，卡住时可以用提示', 'Try it first; hints are available if needed')}</span></div>{question.presentationScopeTitle && <p className="study-round-frozen-topic">{question.presentationScopeTitle}</p>}
        {exercise ? <><h2 className="study-round-sr-only">{t('本题任务', 'Your task')}</h2>{exercise.hypothetical && <p className="study-round-hypothetical">{t('假设情境', 'Hypothetical situation')}</p>}<div className="study-round-case-prompt study-round-prose">{prose(question.prompt)}</div></> : <h2>{question.prompt}</h2>}
        {hasReviewedPresentation(question) && <p className="study-round-format-instruction">{answerFormatInstruction(question.answerFormat!, language)}</p>}
        {round.phase === 'answering' && <div className={`study-round-clock ${overTime ? 'is-over' : ''}`}><div><Clock3 size={16} /><span>{t('本题用时', 'Time on this question')}</span><strong role="timer" aria-live="off">{formatElapsed(answerElapsed)}</strong><span>{chosenLimit ? t(`自选时限 ${chosenLimit / 60} 分钟`, `Your limit: ${chosenLimit / 60} minutes`) : t('未设时限', 'No time limit')}</span></div>{overTime && <p role="status">{t('已到自己设定的时间，可以继续把答案写完整。', 'Your chosen time is up. You can keep going and finish your answer.')}</p>}</div>}
        {round.phase === 'answering' ? <><label className="study-round-answer-label" htmlFor={`study-round-answer-${round.id}`}>{t('你的回答', 'Your answer')}<span>{t('可以先写不完整的草稿', 'A rough draft is fine')}</span></label><textarea id={`study-round-answer-${round.id}`} className="study-round-answer" value={round.draft} onChange={(event) => { if (roundRef.current) commit(updateDraft(roundRef.current, event.target.value)); }} placeholder={t('用自己的话讲。卡住的地方也可以直接写出来。', 'Use your own words. You can say where you are unsure.')} rows={8} />
          <div className="study-round-answer-footer"><span className="study-round-muted">{storageError ? t('尚未安全保存', 'Not safely saved') : t('草稿保存在这台设备', 'Draft saved on this device')}</span><button type="button" className="study-round-primary" disabled={!!busy || requestUnavailable || !round.draft.trim()} onClick={submit}>{t('提交完整回答', 'Submit answer')}<ArrowRight size={16} /></button></div>
          <div className="study-round-help"><div><h3>{t('卡住也可以先借一点力', 'A little support is okay')}</h3><p>{hasHelp ? t('本次已有支持记录；接下来检查的是支持后的理解。', 'Support is recorded for this attempt. The next answer checks understanding with that support.') : t('不用勉强先答。看过帮助后，这次会如实记为支持后的检查。', 'You can get help before answering. This attempt will then be recorded as supported.')}</p></div><div className="study-round-actions"><button type="button" disabled={!!busy || requestUnavailable} onClick={() => void getSupport('hint')}><Lightbulb size={16} />{t('给一点提示', 'A small hint')}</button><button type="button" disabled={!!busy || requestUnavailable} onClick={() => void getSupport('explanation')}><MessageCircle size={16} />{t('先讲给我', 'Explain it first')}</button>{sources(question.criteria.flatMap((criterion) => criterion.sources))}</div></div>
          {currentSupports.map((support, index) => <section key={`${support.at}:${index}`} className="study-round-support"><h3>{support.kind === 'hint' ? t('一点提示', 'A small hint') : t('先一起理一理', 'Let’s work through it')}</h3><div className="study-round-prose">{prose(support.text)}</div>{sources(support.sources)}</section>)}
        </> : attempt && <div className="study-round-feedback"><p className="study-round-attempt-time"><Clock3 size={14} />{attemptTime(attempt)}</p><p className="study-round-condition-line">{summarizeQuestionConditions(attempt, language)}</p><details className="study-round-submitted-answer" open><summary>{t('你提交的完整回答', 'Your submitted answer')}</summary><div className="study-round-original-answer">{attempt.answer}</div></details>
          {attempt.evaluation ? <>{evaluationBody(attempt, attempt.evaluation)}<PracticeEvidenceSummary attempts={[attempt]} language={language} /><PracticeDesignNotice design={round.blueprint.practiceDesign} language={language} submitted onReveal={() => expose('explanation')} />{refreshFeedback(attempt)}{disputeControls(attempt)}
            <div className="study-round-feedback-actions"><button type="button" className="study-round-primary" disabled={!!busy} onClick={() => void next(false)}>{t('继续下一题', 'Continue to the next question')}<ArrowRight size={16} /></button><button type="button" disabled={!!busy || requestUnavailable} onClick={() => void next(true)}>{answerFullyAddressed(attempt) ? t('再练一道（可选）', 'More practice (optional)') : feedbackNeedsReview(attempt, attempt.evaluation) ? t('换个问题核对（可选）', 'Check with another question (optional)') : t('针对未回应的点再试（可选）', 'Practice the missing points (optional)')}</button>{hasReviewedPresentation(question) && question.cueLevel > 1 && round.attempts.length < round.blueprint.maxAttempts && <button type="button" disabled={!!busy || requestUnavailable} onClick={() => void next(true, true)}>{t('少些提示再试（可选）', 'Try with fewer cues (optional)')}</button>}</div><p className="study-round-muted">{t('减少提示会保留同一知识点、推理要求和情境。刚看过的讲解与反馈仍会记为帮助。', 'A cue-reduced retry keeps the same knowledge, reasoning and situation. Recent explanations and feedback still count as support.')}</p><p className="study-round-muted">{t('每次提交都占用本轮的一次作答。反馈和重试反馈不额外计次。', 'Each submitted answer uses one attempt. Reading or retrying feedback does not.')}</p></> : busy !== 'evaluate' && <div role="alert" className="study-round-notice"><AlertCircle size={18} /><div><p>{attempt.evaluationError || t('这次回答已记录，反馈还没有完成。', 'Your answer is recorded; feedback is not complete.')}</p><button type="button" disabled={!!busy || requestUnavailable} onClick={() => { if (roundRef.current) void evaluate(roundRef.current, attempt); }}><RotateCcw size={15} />{t('重试反馈，不重复计次', 'Retry feedback, no extra attempt')}</button></div></div>}
        </div>}
      </div> : <div className="study-round-notice"><p>{t('这轮没有可继续的问题，可以结束并查看记录。', 'There are no questions to continue. Finish to view your record.')}</p><button type="button" onClick={() => { if (roundRef.current) commit(endRound(roundRef.current)); }}>{t('查看本轮记录', 'View round record')}</button></div>}
    </>}
    {busy && busy !== 'plan' && <div className="study-round-working" role="status"><span className="study-round-spinner" />{busy === 'evaluate' ? t('正在对照原文逐项看你的回答…', 'Comparing your answer with the source…') : busy === 'hint' ? t('正在找一个够用的小提示…', 'Finding a useful small hint…') : busy === 'explanation' ? t('正在按原文整理讲解…', 'Preparing a source-based explanation…') : busy === 'followup' ? t('正在准备下一次检查…', 'Preparing the next check…') : t('正在按你的异议重新核对…', 'Reviewing your concern against the source…')}</div>}
  </section>;
}

export default StudyRoundPanel;
