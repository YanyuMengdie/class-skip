import React, { useMemo, useState } from 'react';
import { X, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  CachedMaintenanceBundle,
  Exam,
  ExamMaterialLink,
  MaintenanceFlashCard,
  QuizData,
} from '../types';
import { getDailyPlanCache, setDailyPlanCache } from '../services/firebase';
import { generateMaintenanceFlashCards, generateQuizSet } from '../services/geminiService';
import { evaluateMaintenanceEligibility } from '../utils/examMaintenanceEligibility';
import { MaintenanceFlashcardDeck } from './MaintenanceFlashcardDeck';
import { MaintenanceFeedbackCelebration } from './MaintenanceFeedbackCelebration';
import { buildFeedbackExitCopy, buildFeedbackStrongCopy } from '../data/maintenanceFeedbackCopy';
import type { FilePlanMeta } from '../utils/examSchedule';

type Phase =
  | 'idle'
  | 'blocked_sprint'
  | 'loading_cards'
  | 'cards'
  | 'continue_menu'
  | 'quiz_setup'
  | 'quiz_doing'
  | 'feedback_exit'
  | 'feedback_strong';

function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function keyForMaterial(m: ExamMaterialLink): string {
  return m.sourceType === 'fileHash' ? `fh:${m.fileHash}` : `sid:${m.cloudSessionId}`;
}

interface Props {
  user: User;
  exams: Exam[];
  materials: ExamMaterialLink[];
  onClose: () => void;
  onOpenTool: (tool: 'examPrediction' | 'examSummary' | 'examTraps' | 'feynman' | 'flashcard' | 'quiz') => void;
  onBuildMergedContent: (links: ExamMaterialLink[]) => Promise<string>;
  fileMeta?: Map<string, FilePlanMeta>;
}

export const ExamDailyMaintenancePanel: React.FC<Props> = ({
  user,
  exams,
  materials,
  onClose,
  onOpenTool,
  onBuildMergedContent,
  fileMeta,
}) => {
  // 产品定位：今日学习=低压记忆维持，不做课表式整天任务；默认短会话闪卡，可随时结束并得到正反馈。
  const dateStr = useMemo(() => localDateStr(), []);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>(() =>
    exams.filter((e) => e.examAt != null).map((e) => e.id)
  );
  const [flashCount, setFlashCount] = useState<number>(15);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cards, setCards] = useState<MaintenanceFlashCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quizCount, setQuizCount] = useState(8);
  const [quizItems, setQuizItems] = useState<QuizData[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Array<number | null>>([]);
  const [quizSubmitted, setQuizSubmitted] = useState<boolean[]>([]);
  const [mergedContent, setMergedContent] = useState('');
  const [examTitlesInSession, setExamTitlesInSession] = useState<string[]>([]);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedMsg, setBlockedMsg] = useState<string>('');

  const materialsByExam = useMemo(() => {
    const m = new Map<string, ExamMaterialLink[]>();
    materials.forEach((x) => {
      const arr = m.get(x.examId) || [];
      arr.push(x);
      m.set(x.examId, arr);
    });
    return m;
  }, [materials]);

  const daysToNearest = useMemo(() => {
    const now = Date.now();
    let nearest = Number.POSITIVE_INFINITY;
    exams.forEach((e) => {
      if (!selectedExamIds.includes(e.id) || e.examAt == null || e.examAt <= now) return;
      nearest = Math.min(nearest, e.examAt);
    });
    if (!Number.isFinite(nearest)) return null;
    return Math.max(1, Math.ceil((nearest - now) / 86400000));
  }, [exams, selectedExamIds]);

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const collectLinks = (examIds: string[]) => {
    return examIds.flatMap((id) => materialsByExam.get(id) || []);
  };

  const weakConceptsFromMeta = (links: ExamMaterialLink[]) => {
    const out: string[] = [];
    links.forEach((l) => {
      const metaKey = l.sourceType === 'fileHash' ? l.fileHash! : `session:${l.cloudSessionId}`;
      const weak = fileMeta?.get(metaKey)?.weakKcId;
      if (weak) out.push(weak);
    });
    return Array.from(new Set(out));
  };

  const runGenerateCards = async () => {
    setError(null);
    if (selectedExamIds.length === 0) {
      setError('请先勾选至少一场考试');
      return;
    }
    const eligibility = evaluateMaintenanceEligibility({
      now: new Date(),
      exams,
      selectedExamIds,
      materialsByExamId: materialsByExam,
      fileMeta,
    });
    if (eligibility.allowedExamIds.length === 0) {
      setBlockedMsg('目前你勾选的考试都进入冲刺阶段，今日保温暂停。建议去考前预测/速览集中突击。');
      setPhase('blocked_sprint');
      return;
    }
    if (eligibility.blockedSprint.length > 0) {
      setBlockedMsg('你勾选的考试中有冲刺场次，已自动忽略这些场次，仅对可保温场次生成闪卡。');
    } else {
      setBlockedMsg('');
    }

    const allowedLinks = collectLinks(eligibility.allowedExamIds);
    if (allowedLinks.length === 0) {
      setError('所选考试暂未关联材料，请先在考试管理里关联。');
      return;
    }

    setPhase('loading_cards');
    setLoadingText('正在整理材料并生成闪卡…');
    const examTitles = exams.filter((e) => eligibility.allowedExamIds.includes(e.id)).map((e) => e.title);

    const materialKeys = Array.from(new Set(allowedLinks.map(keyForMaterial))).sort();
    const cacheKey = `${user.uid}_${dateStr}_${eligibility.allowedExamIds.slice().sort().join(',')}_${materialKeys.join('|')}_${flashCount}`;
    const existing = await getDailyPlanCache(user.uid, dateStr);
    const cached = existing?.maintenance;
    if (cached && cached.cacheKey === cacheKey && cached.cards.length > 0) {
      setCards(cached.cards);
      setMergedContent(cached.mergedContent);
      setExamTitlesInSession(cached.examTitles);
      setCardIndex(0);
      setFlipped(false);
      setPhase('cards');
      return;
    }

    const merged = await onBuildMergedContent(allowedLinks);
    if (!merged.trim()) {
      setPhase('idle');
      setError('无法读取考试关联材料内容，请检查云端文件权限或文档可读性。');
      return;
    }
    const weakConcepts = weakConceptsFromMeta(allowedLinks);
    const generated = await generateMaintenanceFlashCards(merged, {
      count: flashCount,
      examTitles,
      weakConcepts: weakConcepts.length > 0 ? weakConcepts : undefined,
    });
    if (generated.length === 0) {
      setPhase('idle');
      setError('闪卡生成失败，请重试。');
      return;
    }
    setCards(generated);
    setMergedContent(merged);
    setExamTitlesInSession(examTitles);
    setCardIndex(0);
    setFlipped(false);
    setPhase('cards');

    const nextMaintenance: CachedMaintenanceBundle = {
      cacheKey,
      examIds: eligibility.allowedExamIds.slice(),
      examTitles,
      materialKeys,
      flashCount,
      cards: generated,
      mergedContent: merged,
      generatedAt: Date.now(),
    };
    await setDailyPlanCache(user, {
      date: dateStr,
      selectedExamIds: eligibility.allowedExamIds,
      segments: existing?.segments || [],
      generatedAt: Date.now(),
      budgetMinutes: existing?.budgetMinutes ?? 30,
      version: 2,
      maintenance: nextMaintenance,
    });
  };

  const onFinishCards = () => setPhase('continue_menu');
  const onExitToday = () => setPhase('feedback_exit');
  const onContinueStudy = () => setPhase('quiz_setup');
  const onOpenOtherTool = (tool: 'examPrediction' | 'examSummary' | 'examTraps' | 'feynman' | 'flashcard' | 'quiz') => {
    onOpenTool(tool);
    onClose();
  };

  const startQuiz = async () => {
    if (!mergedContent.trim()) return;
    setPhase('loading_cards');
    setLoadingText('正在生成测验题…');
    const items = await generateQuizSet(mergedContent, { count: quizCount });
    if (items.length === 0) {
      setError('测验生成失败，请重试。');
      setPhase('quiz_setup');
      return;
    }
    setQuizItems(items);
    setQuizIndex(0);
    setQuizAnswers(items.map(() => null));
    setQuizSubmitted(items.map(() => false));
    setPhase('quiz_doing');
  };

  const submitCurrent = () => {
    if (quizAnswers[quizIndex] == null) return;
    setQuizSubmitted((prev) => {
      const n = [...prev];
      n[quizIndex] = true;
      return n;
    });
  };

  const nextQuiz = () => {
    if (quizIndex < quizItems.length - 1) {
      setQuizIndex((i) => i + 1);
      return;
    }
    setPhase('feedback_strong');
  };

  const setAnswer = (idx: number) => {
    setQuizAnswers((prev) => {
      const n = [...prev];
      n[quizIndex] = idx;
      return n;
    });
  };

  const exitCopy = buildFeedbackExitCopy({
    examTitles: examTitlesInSession,
    cardCount: cards.length,
    daysToNearest,
  });
  const strongCopy = buildFeedbackStrongCopy({
    examTitles: examTitlesInSession,
    cardCount: cards.length,
    quizCount: quizItems.length,
  });

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">今日保温学习</h2>
          <p className="text-xs text-slate-500">低压记忆维持流：先刷 10~20 张闪卡，之后可选加码</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-stone-100">
          <X className="w-5 h-5 text-stone-500" />
        </button>
      </div>

      {(phase === 'idle' || phase === 'blocked_sprint') && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-700">目标闪卡数量</span>
            {[10, 15, 20].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFlashCount(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${flashCount === n ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">选择今天要维持手感的考试</p>
            <div className="flex flex-wrap gap-2">
              {exams.map((e) => (
                <label key={e.id} className="text-xs bg-stone-50 rounded-lg px-2 py-1 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedExamIds.includes(e.id)}
                    onChange={() => toggleExam(e.id)}
                  />
                  {e.title}
                </label>
              ))}
            </div>
          </div>
          {phase === 'blocked_sprint' && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 space-y-2">
              <p className="text-sm text-rose-700">{blockedMsg}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => onOpenOtherTool('examPrediction')} className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 text-white">去考前预测</button>
                <button type="button" onClick={() => onOpenOtherTool('examSummary')} className="px-3 py-1.5 text-xs rounded-lg border border-rose-300 text-rose-700">去考前速览</button>
              </div>
            </div>
          )}
          {blockedMsg && phase !== 'blocked_sprint' && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">{blockedMsg}</p>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <button
            type="button"
            onClick={runGenerateCards}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            <Sparkles className="w-4 h-4" /> 生成今日保温闪卡
          </button>
        </div>
      )}

      {phase === 'loading_cards' && (
        <div className="rounded-xl border border-stone-200 bg-white p-6 flex flex-col items-center gap-3 text-indigo-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">{loadingText || '处理中…'}</p>
        </div>
      )}

      {phase === 'cards' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-4">
          <MaintenanceFlashcardDeck
            cards={cards}
            index={cardIndex}
            flipped={flipped}
            onFlip={() => setFlipped((v) => !v)}
            onPrev={() => {
              setCardIndex((i) => Math.max(0, i - 1));
              setFlipped(false);
            }}
            onNext={() => {
              if (cardIndex >= cards.length - 1) return;
              setCardIndex((i) => Math.min(cards.length - 1, i + 1));
              setFlipped(false);
            }}
          />
          <div className="flex flex-wrap gap-2">
            {cardIndex >= cards.length - 1 ? (
              <>
                <button type="button" onClick={onExitToday} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">
                  今天先到这里
                </button>
                <button type="button" onClick={onFinishCards} className="px-4 py-2 rounded-xl border border-indigo-300 text-indigo-700 text-sm font-medium">
                  继续学一会儿
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setCardIndex(cards.length - 1)} className="px-4 py-2 rounded-xl border border-stone-300 text-slate-700 text-sm">
                跳到最后一张
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'continue_menu' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-700 font-medium">闪卡已完成。接下来你想：</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPhase('quiz_setup')} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold inline-flex items-center gap-1">
              来几道测验 <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={onExitToday} className="px-4 py-2 rounded-xl border border-stone-300 text-slate-700 text-sm">
              今天先到这里
            </button>
          </div>
          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs text-slate-500 mb-2">或者用其他方式继续：</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenOtherTool('examPrediction')} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">考前预测</button>
              <button type="button" onClick={() => onOpenOtherTool('examSummary')} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">考前速览</button>
              <button type="button" onClick={() => onOpenOtherTool('feynman')} className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-800 text-xs font-bold">费曼</button>
              <button type="button" onClick={() => onOpenOtherTool('flashcard')} className="px-3 py-1.5 rounded-lg bg-violet-100 text-violet-800 text-xs font-bold">闪卡复习（全量）</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'quiz_setup' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-700">设定测验题数（3-20）：</p>
          <div className="flex items-center gap-2">
            {[5, 10, 15].map((n) => (
              <button key={n} type="button" onClick={() => setQuizCount(n)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${quizCount === n ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-slate-600'}`}>{n}</button>
            ))}
            <input
              type="number"
              min={3}
              max={20}
              value={quizCount}
              onChange={(e) => setQuizCount(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
              className="w-16 border border-stone-200 rounded-lg px-2 py-1 text-sm"
            />
            <button type="button" onClick={startQuiz} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">开始测验</button>
          </div>
        </div>
      )}

      {phase === 'quiz_doing' && quizItems.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
          <p className="text-xs text-slate-500">第 {quizIndex + 1} / {quizItems.length} 题</p>
          <p className="font-semibold text-slate-800">{quizItems[quizIndex].question}</p>
          <div className="space-y-2">
            {quizItems[quizIndex].options.map((opt, idx) => {
              const selected = quizAnswers[quizIndex] === idx;
              const submitted = quizSubmitted[quizIndex];
              const correct = quizItems[quizIndex].correctIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAnswer(idx)}
                  disabled={submitted}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${
                    submitted
                      ? correct
                        ? 'bg-emerald-50 border-emerald-300'
                        : selected
                          ? 'bg-rose-50 border-rose-300'
                          : 'bg-stone-50 border-stone-200'
                      : selected
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-stone-200'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {quizSubmitted[quizIndex] && (
            <p className="text-xs text-slate-600 bg-stone-50 rounded-lg p-2">{quizItems[quizIndex].explanation}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={submitCurrent} disabled={quizAnswers[quizIndex] == null || quizSubmitted[quizIndex]} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">提交</button>
            <button type="button" onClick={nextQuiz} disabled={!quizSubmitted[quizIndex]} className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs">下一题</button>
          </div>
        </div>
      )}

      {phase === 'feedback_exit' && (
        <MaintenanceFeedbackCelebration
          title={exitCopy.title}
          body={exitCopy.body}
          primaryLabel="完成"
          secondaryLabel="返回继续刷卡"
          onPrimary={onClose}
          onSecondary={() => setPhase('cards')}
        />
      )}
      {phase === 'feedback_strong' && (
        <MaintenanceFeedbackCelebration
          title={strongCopy.title}
          body={strongCopy.body}
          primaryLabel="完成"
          secondaryLabel="回到今日保温"
          onPrimary={onClose}
          onSecondary={() => setPhase('idle')}
        />
      )}
    </div>
  );
};
