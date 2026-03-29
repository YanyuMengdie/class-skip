import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, Target, ChevronDown, ChevronRight, BookOpen, RotateCcw, Send, FileText, ListChecks, ClipboardCheck } from 'lucide-react';
import {
  generateLSAPContentMap,
  generateLSAPProbeQuestion,
  evaluateLSAPAnswer,
  generateLSAPTargetedTeaching,
  answerLSAPTeachingQuestion,
  type LSAPProbeDocScope,
  LSAPProbeResult,
  LSAPEvalResult
} from '../services/geminiService';
import { updateBKT } from '../utils/bkt';
import type { LSAPContentMap, LSAPState, ProbeRecord, LSAPBKTState, LSAPKnowledgeComponent } from '../types';
import { computePredictedScore } from '../utils/lsapScore';

interface ExamPredictionPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  contentKey: string;
  /** 当前复习的文档显示名（用于教学时标出「哪个 PDF 第几页」） */
  displayFileName?: string;
  /** 跳转到讲义某页（1-based），便于教学时看 slide */
  onJumpToPage?: (pageNumber: number) => void;
  initialContentMap?: LSAPContentMap | null;
  initialLSAPState?: LSAPState | null;
  /** 外部引导：打开后选中指定考点（如每日计划 lsap_probe） */
  initialKCId?: string | null;
  onSaveState?: (contentMap: LSAPContentMap, state: LSAPState) => void;
}

const TeachingMarkdown: React.CSSProperties = {
  fontSize: '0.875rem',
  lineHeight: 1.6,
  color: '#334155'
};

const MASTERY_THRESHOLD = 0.6;

export const ExamPredictionPanel: React.FC<ExamPredictionPanelProps> = ({
  onClose,
  pdfContent,
  contentKey,
  displayFileName = '当前文档',
  onJumpToPage,
  initialContentMap,
  initialLSAPState,
  initialKCId,
  onSaveState
}) => {
  const [contentMap, setContentMap] = useState<LSAPContentMap | null>(initialContentMap ?? null);
  const [bktState, setBktState] = useState<LSAPBKTState>(initialLSAPState?.bktState ?? {});
  const [probeHistory, setProbeHistory] = useState<ProbeRecord[]>(initialLSAPState?.probeHistory ?? []);
  const [isLoadingMap, setIsLoadingMap] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentKCIndex, setCurrentKCIndex] = useState(0);
  const [currentBloomLevel, setCurrentBloomLevel] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState<LSAPProbeResult | null>(null);
  const [currentSourceRef, setCurrentSourceRef] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [lastScoreDelta, setLastScoreDelta] = useState<{ delta: number; concept: string } | null>(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

  /** 判错/部分正确后是否显示「进入教学」选项 */
  const [showTeachingOffer, setShowTeachingOffer] = useState(false);
  const [lastEvalResult, setLastEvalResult] = useState<LSAPEvalResult | null>(null);
  const [lastWrongKC, setLastWrongKC] = useState<LSAPKnowledgeComponent | null>(null);
  /** 针对性教学视图 */
  const [teachingActive, setTeachingActive] = useState(false);
  const [teachingKC, setTeachingKC] = useState<LSAPKnowledgeComponent | null>(null);
  const [teachingEvidence, setTeachingEvidence] = useState('');
  const [teachingSourcePages, setTeachingSourcePages] = useState<number[]>([]);
  const [teachingContent, setTeachingContent] = useState<string | null>(null);
  const [teachingLoading, setTeachingLoading] = useState(false);
  /** 教学内追问对话 */
  const [teachingChatMessages, setTeachingChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [teachingChatInput, setTeachingChatInput] = useState('');
  const [teachingChatLoading, setTeachingChatLoading] = useState(false);

  /** 面板模式：选择 / 摸底 / 复习 */
  const [panelMode, setPanelMode] = useState<'choose' | 'probe' | 'review'>(() => {
    if (initialLSAPState?.lastPanelMode === 'review' && initialContentMap) return 'review';
    if (initialLSAPState?.lastPanelMode === 'probe' && initialContentMap) return 'probe';
    return 'choose';
  });
  /** 复习模式：当前选中的单元（学或测） */
  const [reviewSelectedKC, setReviewSelectedKC] = useState<LSAPKnowledgeComponent | null>(null);
  /** 复习模式：当前阶段 list | teaching | quiz | quizDeep */
  const [reviewPhase, setReviewPhase] = useState<'list' | 'teaching' | 'quiz' | 'quizDeep'>('list');
  /** 复习模式「我学过了」：验证题/深层题 */
  const [reviewQuizQuestion, setReviewQuizQuestion] = useState<LSAPProbeResult | null>(null);
  const [reviewQuizSourceRef, setReviewQuizSourceRef] = useState('');
  const [reviewQuizUserAnswer, setReviewQuizUserAnswer] = useState('');
  const [reviewQuizLoading, setReviewQuizLoading] = useState(false);
  const [reviewQuizEvaluating, setReviewQuizEvaluating] = useState(false);
  const [reviewQuizLevel, setReviewQuizLevel] = useState<1 | 2>(1);
  /** 复习测验答错时是否显示「进入教学」 */
  const [reviewQuizShowTeachOffer, setReviewQuizShowTeachOffer] = useState(false);
  const [reviewQuizEvalResult, setReviewQuizEvalResult] = useState<LSAPEvalResult | null>(null);

  const predictedScore = useMemo(() => {
    if (!contentMap) return 0;
    return computePredictedScore(contentMap, bktState);
  }, [contentMap, bktState]);

  /** 与备考台 `LSAPProbeDocScope` 一致：本面板始终针对当前打开的单一 PDF */
  const lsapSingleDocScope = useMemo(
    (): LSAPProbeDocScope => ({
      docIsSingleMaterial: true,
      materialDisplayName: displayFileName,
    }),
    [displayFileName]
  );

  const kcOrdered = useMemo(() => {
    if (!contentMap) return [];
    return [...contentMap.kcs].sort((a, b) => (b.examWeight || 0) - (a.examWeight || 0));
  }, [contentMap]);
  const currentKC = kcOrdered[currentKCIndex] ?? null;

  /** 是否已测过至少一轮所有考点（全部答完再显示预测分） */
  const allKCsProbedOnce = useMemo(() => {
    if (!contentMap) return false;
    const probedIds = new Set(probeHistory.map((r) => r.kcId));
    return contentMap.kcs.every((k) => probedIds.has(k.id));
  }, [contentMap, probeHistory]);

  /** 薄弱考点（pMastery < 阈值） */
  const weakKCs = useMemo(() => {
    if (!contentMap) return [];
    return contentMap.kcs.filter((k) => (bktState[k.id] ?? 0) < MASTERY_THRESHOLD);
  }, [contentMap, bktState]);

  /** 复习模式：已学单元（掌握度 ≥ 阈值） */
  const reviewMasteredKCs = useMemo(() => {
    if (!contentMap) return [];
    return contentMap.kcs.filter((k) => (bktState[k.id] ?? 0) >= MASTERY_THRESHOLD);
  }, [contentMap, bktState]);
  /** 复习模式：未学/剩余单元 */
  const reviewRemainingKCs = useMemo(() => {
    if (!contentMap) return [];
    return contentMap.kcs.filter((k) => (bktState[k.id] ?? 0) < MASTERY_THRESHOLD);
  }, [contentMap, bktState]);

  useEffect(() => {
    if (initialContentMap) {
      setContentMap(initialContentMap);
      return;
    }
    if (!pdfContent?.trim() || contentKey === '') {
      setError('暂无文档内容');
      return;
    }
    setIsLoadingMap(true);
    setError(null);
    generateLSAPContentMap(pdfContent)
      .then((map) => {
        if (map) {
          map.sourceKey = contentKey;
          setContentMap(map);
          const initialBkt: LSAPBKTState = {};
          map.kcs.forEach((k) => (initialBkt[k.id] = 0));
          setBktState((prev) => (Object.keys(prev).length ? prev : initialBkt));
        } else setError('生成考点图谱失败，请重试');
      })
      .catch(() => setError('生成考点图谱失败，请重试'))
      .finally(() => setIsLoadingMap(false));
  }, [pdfContent, contentKey, initialContentMap == null]);

  /** contentMap 加载完成后，若与已保存状态一致则根据 lastPanelMode 恢复模式 */
  useEffect(() => {
    if (!contentMap || !initialLSAPState?.lastPanelMode || initialLSAPState.contentMapId !== contentMap.id) return;
    setPanelMode((m) => (m === 'choose' ? initialLSAPState!.lastPanelMode! : m));
  }, [contentMap?.id, initialLSAPState?.contentMapId, initialLSAPState?.lastPanelMode]);

  /** Deep link：每日计划等传入的 KC id，选中并进入摸底 */
  useEffect(() => {
    if (!contentMap || !initialKCId?.trim()) return;
    const idx = kcOrdered.findIndex((k) => k.id === initialKCId);
    if (idx >= 0) {
      setCurrentKCIndex(idx);
      setPanelMode('probe');
    } else {
      console.warn('[ExamPrediction] initialKCId not found on map:', initialKCId);
    }
  }, [contentMap?.id, initialKCId, kcOrdered]);

  const persistState = useCallback(() => {
    if (!contentMap || !onSaveState) return;
    onSaveState(contentMap, {
      contentMapId: contentMap.id,
      bktState,
      probeHistory,
      lastPredictedScore: predictedScore,
      lastUpdated: Date.now(),
      lastPanelMode: panelMode === 'choose' ? undefined : panelMode
    });
  }, [contentMap, bktState, probeHistory, predictedScore, panelMode, onSaveState]);

  useEffect(() => {
    if (contentMap && bktState && Object.keys(bktState).length > 0) persistState();
  }, [contentMap, bktState, probeHistory, predictedScore]);

  const loadNextQuestion = useCallback(() => {
    if (!contentMap || !pdfContent) return;
    const kc = kcOrdered[currentKCIndex];
    if (!kc) return;
    setCurrentQuestion(null);
    setUserAnswer('');
    setError(null);
    setLastScoreDelta(null);
    generateLSAPProbeQuestion(pdfContent, contentMap, kc.id, currentBloomLevel, undefined, lsapSingleDocScope)
      .then((res) => {
        if (res) {
          setCurrentQuestion(res);
          setCurrentSourceRef(res.sourceRef);
        } else setError('出题失败，请重试');
      })
      .catch(() => setError('出题失败，请重试'));
  }, [contentMap, pdfContent, currentKCIndex, currentBloomLevel, kcOrdered, lsapSingleDocScope]);

  useEffect(() => {
    if (
      contentMap &&
      !isLoadingMap &&
      panelMode === 'probe' &&
      currentKC &&
      !currentQuestion &&
      !isEvaluating &&
      !teachingActive
    ) {
      loadNextQuestion();
    }
  }, [contentMap, isLoadingMap, panelMode, currentKC, currentQuestion, isEvaluating, teachingActive, loadNextQuestion]);

  useEffect(() => {
    if (!teachingActive || !teachingKC || !pdfContent || teachingContent !== null || teachingLoading) return;
    setTeachingLoading(true);
    generateLSAPTargetedTeaching(pdfContent, teachingKC, teachingEvidence, lsapSingleDocScope)
      .then(setTeachingContent)
      .catch(() => setTeachingContent(`请查看【${displayFileName}】第 ${teachingSourcePages.length ? teachingSourcePages.join('、') : '—'} 页复习「${teachingKC.concept}」。`))
      .finally(() => setTeachingLoading(false));
  }, [teachingActive, teachingKC, teachingEvidence, pdfContent, displayFileName, teachingSourcePages, lsapSingleDocScope]);

  const handleSubmit = () => {
    if (!currentQuestion || !currentKC || !pdfContent || !userAnswer.trim()) return;
    setIsEvaluating(true);
    setError(null);
    const prevScore = predictedScore;
    evaluateLSAPAnswer(
      pdfContent,
      currentKC.id,
      currentQuestion.question,
      userAnswer.trim(),
      currentSourceRef,
      lsapSingleDocScope
    )
      .then((evalRes: LSAPEvalResult | null) => {
        if (!evalRes) {
          setError('评判失败，请重试');
          setIsEvaluating(false);
          return;
        }
        const correctForBKT = evalRes.correct === true || evalRes.correct === 'partial';
        const record: ProbeRecord = {
          kcId: currentKC.id,
          bloomLevel: currentBloomLevel,
          question: currentQuestion.question,
          userAnswer: userAnswer.trim(),
          correct: evalRes.correct,
          evidence: evalRes.evidence,
          sourcePage: evalRes.conflictWithPage,
          timestamp: Date.now()
        };
        setProbeHistory((h) => [...h, record]);

        const prevP = bktState[currentKC.id] ?? 0;
        const newP = updateBKT(prevP, correctForBKT);
        setBktState((s) => ({ ...s, [currentKC.id]: newP }));

        const nextScore = computePredictedScore(contentMap, { ...bktState, [currentKC.id]: newP });
        const delta = nextScore - prevScore;
        if (delta > 0) setLastScoreDelta({ delta, concept: currentKC.concept });

        const fullyCorrect = evalRes.correct === true;
        if (fullyCorrect) {
          if (evalRes.nextAction === 'next_kc') {
            setCurrentKCIndex((i) => Math.min(i + 1, kcOrdered.length - 1));
            setCurrentBloomLevel(1);
            setCurrentQuestion(null);
            setUserAnswer('');
          } else if (evalRes.nextAction === 'level_up') {
            setCurrentBloomLevel((l) => Math.min(l + 1, 3));
            setCurrentQuestion(null);
            setUserAnswer('');
          } else {
            setCurrentQuestion(null);
            setUserAnswer('');
          }
          setShowTeachingOffer(false);
          setLastEvalResult(null);
        } else {
          setLastEvalResult(evalRes);
          setLastWrongKC(currentKC);
          setShowTeachingOffer(true);
          setCurrentQuestion(null);
          setUserAnswer('');
        }
      })
      .catch(() => setError('评判失败，请重试'))
      .finally(() => setIsEvaluating(false));
  };

  const handleClose = () => {
    persistState();
    onClose();
  };

  const handleBackToModeChoose = () => {
    setPanelMode('choose');
    setTeachingActive(false);
    setTeachingKC(null);
    setTeachingContent(null);
    setTeachingEvidence('');
    setTeachingSourcePages([]);
    setTeachingChatMessages([]);
    setShowTeachingOffer(false);
    setLastEvalResult(null);
    setLastWrongKC(null);
    setReviewPhase('list');
    setReviewSelectedKC(null);
    setReviewQuizQuestion(null);
    setReviewQuizUserAnswer('');
    setReviewQuizShowTeachOffer(false);
    setReviewQuizEvalResult(null);
    setError(null);
  };

  const handleEnterTeaching = () => {
    if (!lastWrongKC || !lastEvalResult) return;
    const pages = [...(lastWrongKC.sourcePages || [])];
    if (lastEvalResult.conflictWithPage != null && !pages.includes(lastEvalResult.conflictWithPage)) {
      pages.push(lastEvalResult.conflictWithPage);
      pages.sort((a, b) => a - b);
    }
    setTeachingKC(lastWrongKC);
    setTeachingEvidence(lastEvalResult.evidence);
    setTeachingSourcePages(pages);
    setTeachingContent(null);
    setTeachingChatMessages([]);
    setTeachingActive(true);
    setShowTeachingOffer(false);
    setLastEvalResult(null);
    setLastWrongKC(null);
  };

  /** 从总结页进入某考点的针对性学习 */
  const handleEnterTeachingFromSummary = (kc: LSAPKnowledgeComponent) => {
    const pages = [...(kc.sourcePages || [])];
    setTeachingKC(kc);
    setTeachingEvidence('请重点复习此考点，确保完全掌握。');
    setTeachingSourcePages(pages);
    setTeachingContent(null);
    setTeachingChatMessages([]);
    setTeachingActive(true);
  };

  /** 复习模式：开始学（进入针对性教学） */
  const handleReviewStartLearn = (kc: LSAPKnowledgeComponent) => {
    setReviewSelectedKC(kc);
    setReviewPhase('teaching');
    setTeachingKC(kc);
    setTeachingEvidence('请系统讲解此考点，确保我能完全掌握。');
    setTeachingSourcePages([...(kc.sourcePages || [])]);
    setTeachingContent(null);
    setTeachingChatMessages([]);
    setTeachingActive(true);
  };

  /** 复习模式：我学过了 - 进入验证题 */
  const loadReviewQuizQuestion = useCallback(
    (kcId: string, level: 1 | 2) => {
      if (!contentMap || !pdfContent) return;
      setReviewQuizQuestion(null);
      setReviewQuizUserAnswer('');
      setReviewQuizLoading(true);
      setError(null);
      generateLSAPProbeQuestion(pdfContent, contentMap, kcId, level, undefined, lsapSingleDocScope)
        .then((res) => {
          if (res) {
            setReviewQuizQuestion(res);
            setReviewQuizSourceRef(res.sourceRef);
          } else setError('出题失败，请重试');
        })
        .catch(() => setError('出题失败，请重试'))
        .finally(() => setReviewQuizLoading(false));
    },
    [contentMap, pdfContent, lsapSingleDocScope]
  );

  const handleReviewClaimDone = (kc: LSAPKnowledgeComponent) => {
    setReviewSelectedKC(kc);
    setReviewPhase('quiz');
    setReviewQuizLevel(1);
    setReviewQuizShowTeachOffer(false);
    setReviewQuizEvalResult(null);
    setError(null);
    loadReviewQuizQuestion(kc.id, 1);
  };

  /** 复习模式：验证题/深层题提交 */
  const handleReviewQuizSubmit = () => {
    if (!reviewSelectedKC || !reviewQuizQuestion || !pdfContent || !reviewQuizUserAnswer.trim()) return;
    setReviewQuizEvaluating(true);
    setError(null);
    const kc = reviewSelectedKC;
    const level = reviewQuizLevel;
    evaluateLSAPAnswer(
      pdfContent,
      kc.id,
      reviewQuizQuestion.question,
      reviewQuizUserAnswer.trim(),
      reviewQuizSourceRef,
      lsapSingleDocScope
    )
      .then((evalRes: LSAPEvalResult | null) => {
        if (!evalRes) {
          setError('评判失败，请重试');
          setReviewQuizEvaluating(false);
          return;
        }
        const record: ProbeRecord = {
          kcId: kc.id,
          bloomLevel: level,
          question: reviewQuizQuestion.question,
          userAnswer: reviewQuizUserAnswer.trim(),
          correct: evalRes.correct,
          evidence: evalRes.evidence,
          sourcePage: evalRes.conflictWithPage,
          timestamp: Date.now()
        };
        setProbeHistory((h) => [...h, record]);
        const prevP = bktState[kc.id] ?? 0;
        const correctForBKT = evalRes.correct === true || evalRes.correct === 'partial';
        const newP = updateBKT(prevP, correctForBKT);
        setBktState((s) => ({ ...s, [kc.id]: newP }));

        const fullyCorrect = evalRes.correct === true;
        if (fullyCorrect) {
          if (kc.bloomTargetLevel <= 1 || level === 2) {
            setReviewPhase('list');
            setReviewSelectedKC(null);
            setReviewQuizQuestion(null);
            setReviewQuizUserAnswer('');
            setReviewQuizEvalResult(null);
            setReviewQuizShowTeachOffer(false);
          } else {
            setReviewQuizLevel(2);
            setReviewQuizQuestion(null);
            setReviewQuizUserAnswer('');
            loadReviewQuizQuestion(kc.id, 2);
          }
        } else {
          setReviewQuizEvalResult(evalRes);
          setReviewQuizShowTeachOffer(true);
          setReviewQuizQuestion(null);
          setReviewQuizUserAnswer('');
        }
      })
      .catch(() => setError('评判失败，请重试'))
      .finally(() => setReviewQuizEvaluating(false));
  };

  /** 复习模式：测验答错后进入教学 */
  const handleReviewQuizEnterTeaching = () => {
    if (!reviewSelectedKC || !reviewQuizEvalResult) return;
    const pages = [...(reviewSelectedKC.sourcePages || [])];
    if (reviewQuizEvalResult.conflictWithPage != null && !pages.includes(reviewQuizEvalResult.conflictWithPage)) {
      pages.push(reviewQuizEvalResult.conflictWithPage);
      pages.sort((a, b) => a - b);
    }
    setTeachingKC(reviewSelectedKC);
    setTeachingEvidence(reviewQuizEvalResult.evidence ?? '请系统讲解此考点，确保我能完全掌握。');
    setTeachingSourcePages(pages);
    setTeachingContent(null);
    setTeachingChatMessages([]);
    setTeachingActive(true);
    setReviewQuizShowTeachOffer(false);
    setReviewQuizEvalResult(null);
    setReviewPhase('teaching');
  };

  /** 复习模式：测验答错后返回清单（不学） */
  const handleReviewQuizBackToList = () => {
    setReviewPhase('list');
    setReviewSelectedKC(null);
    setReviewQuizQuestion(null);
    setReviewQuizUserAnswer('');
    setReviewQuizShowTeachOffer(false);
    setReviewQuizEvalResult(null);
  };

  const handleSendTeachingQuestion = () => {
    if (!teachingKC || !teachingContent || !pdfContent?.trim() || !teachingChatInput.trim()) return;
    const q = teachingChatInput.trim();
    setTeachingChatInput('');
    setTeachingChatMessages((m) => [...m, { role: 'user', text: q }]);
    setTeachingChatLoading(true);
    answerLSAPTeachingQuestion(pdfContent, teachingKC, teachingContent, teachingChatMessages, q, lsapSingleDocScope)
      .then((reply) => {
        setTeachingChatMessages((m) => [...m, { role: 'model', text: reply }]);
      })
      .catch(() => {
        setTeachingChatMessages((m) => [...m, { role: 'model', text: '回答失败，请重试。' }]);
      })
      .finally(() => setTeachingChatLoading(false));
  };

  const handleSkipToNext = () => {
    if (!lastEvalResult) return;
    if (lastEvalResult.nextAction === 'next_kc') {
      setCurrentKCIndex((i) => Math.min(i + 1, kcOrdered.length - 1));
      setCurrentBloomLevel(1);
    } else {
      setCurrentBloomLevel((l) => Math.min(l + 1, 3));
    }
    setCurrentQuestion(null);
    setUserAnswer('');
    setShowTeachingOffer(false);
    setLastEvalResult(null);
    setLastWrongKC(null);
  };

  const handleRetestAfterTeaching = () => {
    const kc = teachingKC;
    if (panelMode === 'review' && kc) {
      setTeachingActive(false);
      setTeachingKC(null);
      setTeachingContent(null);
      setTeachingEvidence('');
      setTeachingSourcePages([]);
      setTeachingChatMessages([]);
      setReviewPhase('quiz');
      setReviewSelectedKC(kc);
      setReviewQuizLevel(2);
      setReviewQuizShowTeachOffer(false);
      setReviewQuizEvalResult(null);
      setError(null);
      loadReviewQuizQuestion(kc.id, 2);
      return;
    }
    setTeachingActive(false);
    setTeachingKC(null);
    setTeachingContent(null);
    setTeachingEvidence('');
    setTeachingSourcePages([]);
    setTeachingChatMessages([]);
    setCurrentBloomLevel((l) => Math.min(l + 1, 3));
    setCurrentQuestion(null);
    setUserAnswer('');
    if (kc) {
      const idx = kcOrdered.findIndex((k) => k.id === kc.id);
      if (idx >= 0) setCurrentKCIndex(idx);
    }
  };

  if (!pdfContent?.trim()) {
    return (
      <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-stone-100">
            <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-500" />
              考前预测
            </h2>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 text-slate-500 text-center">暂无文档内容，请先选择或打开文档。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            考前预测
          </h2>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 min-h-0">
          {isLoadingMap && (
            <div className="flex flex-col items-center justify-center py-16 text-amber-600">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p className="text-sm font-bold">正在生成考点图谱...</p>
            </div>
          )}

          {contentMap && !isLoadingMap && panelMode === 'choose' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-4">
              <p className="text-amber-900 font-medium">
                共 {contentMap.kcs.length} 个知识点单元，选一种方式开始：
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setPanelMode('probe')}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-400 transition-colors text-left"
                >
                  <Target className="w-8 h-8 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800 block">摸底模式</span>
                    <span className="text-sm text-slate-600">先按考点出题摸底，再针对性教学与预测分</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode('review')}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-sky-200 bg-white hover:bg-sky-50 hover:border-sky-400 transition-colors text-left"
                >
                  <ListChecks className="w-8 h-8 text-sky-500 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800 block">复习模式</span>
                    <span className="text-sm text-slate-600">先看单元清单，学一个少一个，再测</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {contentMap && !isLoadingMap && panelMode !== 'choose' && (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToModeChoose}
                  className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-slate-700 hover:bg-stone-200"
                >
                  返回模式选择
                </button>
              </div>

              {panelMode === 'probe' && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                  {allKCsProbedOnce ? (
                    <>
                      <div className="text-2xl font-bold text-amber-800">当前预测得分：{predictedScore} 分</div>
                      {lastScoreDelta && lastScoreDelta.delta > 0 && (
                        <p className="text-sm text-amber-700 mt-1">+{lastScoreDelta.delta} 分 · 刚掌握：{lastScoreDelta.concept}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-amber-800 font-medium">
                      已测 {new Set(probeHistory.map((r) => r.kcId)).size}/{contentMap.kcs.length} 个考点，全部答完后显示预测分
                    </p>
                  )}
                </div>
              )}

              {isEvaluating && (
                <div className="flex items-center gap-2 py-2 text-amber-600 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在校准你的知识图谱...
                </div>
              )}

              {error && <p className="text-rose-600 text-sm">{error}</p>}

              {panelMode === 'probe' && showTeachingOffer && lastEvalResult && lastWrongKC && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-amber-900">这道题未完全掌握，可以针对性补一补再测</p>
                  <p className="text-xs text-slate-600">考点：{lastWrongKC.concept}</p>
                  <p className="text-sm text-slate-700">{lastEvalResult.evidence}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleEnterTeaching}
                      className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600"
                    >
                      <BookOpen className="w-4 h-4" />
                      进入针对性教学
                    </button>
                    <button
                      onClick={handleSkipToNext}
                      className="py-2.5 px-4 rounded-xl bg-stone-200 text-slate-700 text-sm font-bold hover:bg-stone-300"
                    >
                      下一题
                    </button>
                  </div>
                </div>
              )}

              {teachingActive && teachingKC && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4">
                  <h3 className="font-bold text-sky-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    针对性教学：{teachingKC.concept}
                  </h3>
                  <p className="text-[11px] text-sky-800/90 leading-snug">
                    讲解与追问仅依据当前打开的「{displayFileName}」全文，页码均为该文档内页码。
                  </p>
                  <p className="text-sm text-slate-700">
                    对应材料：<strong>{displayFileName}</strong> 第 {teachingSourcePages.length ? teachingSourcePages.join('、') : '—'} 页
                  </p>
                  {onJumpToPage && teachingSourcePages.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-slate-500">查看讲义：</span>
                      {teachingSourcePages.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onJumpToPage(p)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-sky-700 text-sm hover:bg-sky-100"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          第 {p} 页
                        </button>
                      ))}
                      <span className="text-xs text-slate-400">（跳转后可暂时关闭弹窗看 slide）</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-600">你的问题：{teachingEvidence}</p>
                  {teachingLoading && (
                    <div className="flex items-center gap-2 text-sky-600 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在生成针对性讲解...
                    </div>
                  )}
                  {teachingContent && !teachingLoading && (
                    <div className="prose prose-sm max-w-none text-slate-700" style={TeachingMarkdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {teachingContent}
                      </ReactMarkdown>
                    </div>
                  )}
                  {teachingContent && (
                    <div className="border-t border-sky-100 pt-3 space-y-2">
                      <p className="text-xs font-medium text-sky-800">还有不懂？继续问，直到理解为止</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {teachingChatMessages.map((m, i) => (
                          <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                            <span className={`inline-block px-3 py-1.5 rounded-lg ${m.role === 'user' ? 'bg-sky-200 text-sky-900' : 'bg-white border border-sky-100 text-slate-700'}`}>
                              {m.text}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={teachingChatInput}
                          onChange={(e) => setTeachingChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendTeachingQuestion()}
                          placeholder="输入你的问题..."
                          className="flex-1 px-3 py-2 rounded-lg border border-sky-200 text-sm"
                          disabled={teachingChatLoading}
                        />
                        <button
                          type="button"
                          onClick={handleSendTeachingQuestion}
                          disabled={!teachingChatInput.trim() || teachingChatLoading}
                          className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
                        >
                          {teachingChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          发送
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={handleRetestAfterTeaching}
                    className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600"
                  >
                    <RotateCcw className="w-4 h-4" />
                    学完了，再测一次
                  </button>
                </div>
              )}

              {panelMode === 'review' && reviewPhase === 'list' && !teachingActive && contentMap && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4">
                  <p className="text-sky-900 font-medium">
                    共 {contentMap.kcs.length} 个知识点单元，学完且学一个少一个即可基本完全掌握本 PDF。
                  </p>
                  <p className="text-sm text-slate-600">剩余 {reviewRemainingKCs.length} 个</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reviewRemainingKCs.length === 0}
                      onClick={() => {
                        const target = reviewRemainingKCs[0];
                        if (!target) return;
                        handleReviewClaimDone(target);
                      }}
                      className="flex items-center gap-1 py-2 px-3 rounded-lg bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
                    >
                      我准备好了！可以测试了！
                    </button>
                  </div>
                  <ul className="space-y-3 max-h-64 overflow-y-auto">
                    {reviewRemainingKCs.map((kc) => (
                      <li
                        key={kc.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl bg-white border border-sky-100"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800">{kc.concept}</span>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {(kc.reviewFocus || kc.definition).trim()}
                          </p>
                          <span className="text-xs text-slate-400">第 {kc.sourcePages?.length ? kc.sourcePages.join('、') : '—'} 页</span>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleReviewStartLearn(kc)}
                            className="flex items-center gap-1 py-2 px-3 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            开始学
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewClaimDone(kc)}
                            className="flex items-center gap-1 py-2 px-3 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            我学过了
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {reviewMasteredKCs.length > 0 && (
                    <details className="border border-sky-100 rounded-xl bg-white/80 overflow-hidden">
                      <summary className="p-3 text-sm font-medium text-slate-600 cursor-pointer list-none flex items-center justify-between">
                        <span>已完成（{reviewMasteredKCs.length} 个）</span>
                        <ChevronRight className="w-4 h-4 open:rotate-90" />
                      </summary>
                      <ul className="divide-y divide-sky-50 p-2 max-h-32 overflow-y-auto">
                        {reviewMasteredKCs.map((kc) => (
                          <li key={kc.id} className="py-2 px-2 text-sm text-slate-500 flex items-center gap-2">
                            <span className="text-emerald-600">✓</span>
                            {kc.concept}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {panelMode === 'review' && reviewPhase === 'quiz' && reviewSelectedKC && !teachingActive && (
                <>
                  {reviewQuizShowTeachOffer && reviewQuizEvalResult && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-sm font-medium text-amber-900">这道题未完全掌握，建议先学再测</p>
                      <p className="text-xs text-slate-600">考点：{reviewSelectedKC.concept}</p>
                      <p className="text-sm text-slate-700">{reviewQuizEvalResult.evidence}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleReviewQuizEnterTeaching}
                          className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600"
                        >
                          <BookOpen className="w-4 h-4" />
                          开始学
                        </button>
                        <button
                          onClick={handleReviewQuizBackToList}
                          className="py-2.5 px-4 rounded-xl bg-stone-200 text-slate-700 text-sm font-bold hover:bg-stone-300"
                        >
                          返回清单
                        </button>
                      </div>
                    </div>
                  )}
                  {(reviewQuizQuestion || reviewQuizLoading) && !reviewQuizShowTeachOffer && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
                      <p className="text-[11px] leading-snug text-sky-900/80 bg-white/80 border border-sky-100 rounded-lg px-2.5 py-1.5">
                        测验题目基于当前打开的「{displayFileName}」，与摸底探测使用同一材料范围。
                      </p>
                      <p className="text-xs text-slate-500">
                        考点：{reviewSelectedKC.concept}（{reviewQuizLevel === 1 ? '验证' : '深层'}题）
                      </p>
                      {reviewQuizLoading && (
                        <div className="flex items-center gap-2 text-sky-600 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          正在出题...
                        </div>
                      )}
                      {reviewQuizQuestion && !reviewQuizLoading && (
                        <>
                          <p className="font-medium text-slate-800">{reviewQuizQuestion.question}</p>
                          <textarea
                            value={reviewQuizUserAnswer}
                            onChange={(e) => setReviewQuizUserAnswer(e.target.value)}
                            placeholder="用你自己的话回答..."
                            className="w-full min-h-[80px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
                            disabled={reviewQuizEvaluating}
                          />
                          <button
                            onClick={handleReviewQuizSubmit}
                            disabled={!reviewQuizUserAnswer.trim() || reviewQuizEvaluating}
                            className="py-2.5 px-4 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600 disabled:opacity-50"
                          >
                            {reviewQuizEvaluating ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                评判中...
                              </span>
                            ) : (
                              '提交并评判'
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {allKCsProbedOnce && !teachingActive && !showTeachingOffer && contentMap && panelMode === 'probe' && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-4">
                  <h3 className="font-bold text-slate-800">本 PDF 知识点与弱点</h3>
                  <p className="text-sm text-slate-600">以下为全部考点，可针对薄弱项逐个学习。</p>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {contentMap.kcs.map((kc) => {
                      const p = bktState[kc.id] ?? 0;
                      const isWeak = p < MASTERY_THRESHOLD;
                      return (
                        <li key={kc.id} className="flex items-start justify-between gap-2 py-2 border-b border-stone-100 last:border-0">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-slate-800">{kc.concept}</span>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{kc.definition}</p>
                            <span className={`text-xs ${isWeak ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {isWeak ? '薄弱' : '已掌握'}
                            </span>
                          </div>
                          {isWeak && (
                            <button
                              type="button"
                              onClick={() => handleEnterTeachingFromSummary(kc)}
                              className="shrink-0 py-1.5 px-3 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200"
                            >
                              针对性学习
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {weakKCs.length > 0 && (
                    <p className="text-sm text-rose-700">
                      你的弱点（{weakKCs.length} 个）：{weakKCs.map((k) => k.concept).join('、')}
                    </p>
                  )}
                </div>
              )}

              {panelMode === 'probe' && currentKC && currentQuestion && !isEvaluating && !showTeachingOffer && !teachingActive && (
                <div className="space-y-3">
                  <p className="text-[11px] leading-snug text-amber-900/85 bg-amber-50/90 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    本题基于当前打开的讲义「{displayFileName}」出题；出处与阅卷均约束在该文档内。
                  </p>
                  <p className="text-xs text-slate-500">考点：{currentKC.concept}（层级 {currentBloomLevel}）</p>
                  <p className="font-medium text-slate-800">{currentQuestion.question}</p>
                  <textarea
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="用你自己的话回答..."
                    className="w-full min-h-[80px] p-3 rounded-xl border border-stone-200 text-slate-700 text-sm resize-y focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                    disabled={isEvaluating}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!userAnswer.trim() || isEvaluating}
                    className="py-2.5 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
                  >
                    提交并评判
                  </button>
                </div>
              )}

              {panelMode === 'probe' && contentMap && probeHistory.length > 0 && (
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setEvidenceExpanded((e) => !e)}
                    className="w-full flex items-center justify-between p-3 bg-stone-50 text-slate-700 text-sm font-medium"
                  >
                    <span>分数依据（证据链）</span>
                    {evidenceExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {evidenceExpanded && (
                    <ul className="divide-y divide-stone-100 p-3 max-h-48 overflow-y-auto">
                      {probeHistory.slice(-10).reverse().map((r, i) => {
                        const kc = contentMap.kcs.find((k) => k.id === r.kcId);
                        return (
                          <li key={`${r.timestamp}-${i}`} className="py-2 text-xs text-slate-600">
                            <span className="font-medium text-slate-700">{kc?.concept ?? r.kcId}</span>
                            <span className="mx-1">·</span>
                            <span>{r.correct === true ? '正确' : r.correct === 'partial' ? '部分正确' : '错误'}</span>
                            {r.evidence && <span className="block mt-0.5 text-slate-500">{r.evidence}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {panelMode === 'probe' && (
                <p className="text-xs text-slate-400">
                  已测 {probeHistory.length} 轮 · 共 {contentMap.kcs.length} 个考点
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
