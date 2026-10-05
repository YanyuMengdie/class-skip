import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Loader2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ExamMaterialLink } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import ExplanationMarkdown, { ExplanationText } from '@/shared/i18n/ExplanationMarkdown';
import { extractPdfPageRange, extractPdfText, readFileAsDataURL } from '@/lib/pdf/pdfUtils';
import { ExamWorkspaceMaterialPreview } from '../workspace/ExamWorkspaceMaterialPreview';
import {
  auditAssignment,
  assessWrittenBatch,
  extractModulePlan,
  supplement,
  teachModule,
  writeQuestionBatch,
  type ModuleAIContext,
} from './ai';
import { digest, makeSlots, readingModules, selectedPages, submitAttempt } from './model';
import { reviewStorage } from './storage';
import type {
  Attempt,
  ModuleReviewRecord,
  ModuleReviewSource,
  ReviewModule,
  ReviewQuestion,
} from './types';
import './moduleReview.css';

interface Props {
  userId: string;
  material: ExamMaterialLink;
  loadSource: (material: ExamMaterialLink) => Promise<ModuleReviewSource>;
  onBack: () => void;
  onStudy: () => void;
}
const Markdown = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
    {children}
  </ReactMarkdown>
);
type Repository = ReturnType<typeof reviewStorage>;
export function ModuleReviewPage({ userId, material, loadSource, onBack, onStudy }: Props) {
  const { language: appLanguage, text: t } = useAppLanguage();
  const language = appLanguage === 'en' ? 'en' : 'zh';
  const [source, setSource] = useState<ModuleReviewSource | null>(null),
    [allPages, setAllPages] = useState<string[]>([]);
  const [modules, setModules] = useState<ReviewModule[]>([]),
    [selected, setSelected] = useState(''),
    [sessionId, setSessionId] = useState('');
  const [records, setRecords] = useState<Record<string, ModuleReviewRecord>>({});
  const recordsRef = useRef(records);
  const repos = useRef(new Map<string, Repository>()),
    timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const writes = useRef(new Map<string, Promise<void>>());
  const saveFailures = useRef(new Map<string, string>());
  const pageRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [saveError, setSaveError] = useState(''),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState('');
  const [reload, setReload] = useState(0),
    [historyId, setHistoryId] = useState(''),
    [previewPage, setPreviewPage] = useState<number | null>(null);
  const live = useRef(true),
    controller = useRef<AbortController | null>(null),
    sourceLoader = useRef(loadSource);
  sourceLoader.current = loadSource;
  const cropCache = useRef(new Map<string, Promise<string>>());
  const current = records[selected],
    currentRef = useRef(current);
  currentRef.current = current;
  const persist = useCallback((moduleId: string) => {
    const timer = timers.current.get(moduleId);
    if (timer) clearTimeout(timer);
    timers.current.delete(moduleId);
    const record = recordsRef.current[moduleId],
      repo = repos.current.get(moduleId);
    if (!record || !repo) return Promise.resolve();
    if (live.current) setSaving(true);
    const promise = repo
      .save(record)
      .then(() => {
        saveFailures.current.delete(moduleId);
      })
      .catch((e) => {
        saveFailures.current.set(moduleId, e instanceof Error ? e.message : String(e));
        throw e;
      })
      .finally(() => {
        if (writes.current.get(moduleId) === promise) writes.current.delete(moduleId);
        if (live.current) {
          setSaveError([...saveFailures.current.values()].join(' · '));
          setSaving(writes.current.size > 0 || timers.current.size > 0);
        }
      });
    writes.current.set(moduleId, promise);
    void promise.catch(() => {});
    return promise;
  }, []);
  const commit = (next: ModuleReviewRecord, immediate = false) => {
    if (!live.current) throw Object.assign(new Error('Review closed'), { name: 'AbortError' });
    const updated = { ...next, updatedAt: Date.now() };
    const map = { ...recordsRef.current, [next.module.id]: updated };
    recordsRef.current = map;
    currentRef.current = updated;
    setRecords(map);
    if (immediate) return persist(next.module.id);
    const old = timers.current.get(next.module.id);
    if (old) clearTimeout(old);
    setSaving(true);
    timers.current.set(
      next.module.id,
      setTimeout(() => {
        void persist(next.module.id).catch(() => {});
      }, 700),
    );
    return Promise.resolve();
  };
  const patch = (change: Partial<ModuleReviewRecord>, immediate = false) =>
    currentRef.current
      ? commit({ ...currentRef.current, ...change }, immediate)
      : Promise.resolve();
  useEffect(() => {
    live.current = true;
    return () => {
      for (const id of timers.current.keys()) void persist(id).catch(() => {});
      live.current = false;
      controller.current?.abort();
    };
  }, [persist]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timers.current.size || saving || saveError) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving, saveError]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      const src = await sourceLoader.current(material);
      const [pages, fingerprint] = await Promise.all([
        extractPdfText(src.pdf),
        src.pdf.arrayBuffer().then(digest),
      ]);
      const ms = readingModules(src.sessions, pages.length),
        loaded: Record<string, ModuleReviewRecord> = {};
      const newRepos = new Map<string, Repository>();
      for (const m of ms) {
        const key = await digest(JSON.stringify([fingerprint, m.id, m.start, m.end]));
        const repo = reviewStorage(userId, material.cloudSessionId, key);
        const old = await repo.load();
        if (old && (old.module.id !== m.id || old.sourceFingerprint !== fingerprint))
          throw new Error(
            'Review source mismatch; existing records retained. / 复习记录与资料不匹配，原记录已保留。',
          );
        loaded[m.id] = old ?? {
          version: 1,
          id: key,
          module: m,
          sourceFingerprint: fingerprint,
          lessons: {},
          lessonRead: false,
          questionCount: 16,
          questions: [],
          draft: {},
          attempts: [],
          supplements: {},
          stage: 'prepare',
          showChinese: true,
          updatedAt: 0,
        };
        newRepos.set(m.id, repo);
      }
      if (cancelled) return;
      repos.current = newRepos;
      recordsRef.current = loaded;
      setRecords(loaded);
      setSource(src);
      setAllPages(pages);
      setModules(ms);
      const latest = Object.values(loaded)
        .filter((r) => r.updatedAt > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.module;
      const preferred = latest ?? ms.find((m) => m.sessionId === src.preferredSessionId) ?? ms[0];
      setSessionId(preferred?.sessionId ?? '');
      setSelected(preferred?.id ?? '');
    })()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, material.id, reload]);
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [selected, current?.stage]);
  const resolvePdf = useCallback(async () => source?.pdf ?? null, [source]);
  const leave = async (action: () => void) => {
    controller.current?.abort();
    try {
      for (const id of timers.current.keys()) await persist(id);
      await Promise.all(writes.current.values());
      if (saveFailures.current.size) return;
      action();
    } catch {
      /* visible save error, keep answers on screen */
    }
  };
  const move = (stage: ModuleReviewRecord['stage']) => {
    void patch({
      stage,
      ...(stage === 'lesson' && current?.stage === 'assignment' ? { draftAssisted: true } : {}),
    });
    setHistoryId('');
  };
  const run = async (label: string, operation: (ctx: ModuleAIContext) => Promise<void>) => {
    if (controller.current || !currentRef.current || !source) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(label);
    setError('');
    try {
      const record = currentRef.current;
      let crop = cropCache.current.get(record.module.id);
      if (!crop) {
        crop = readFileAsDataURL(source.pdf).then((data) =>
          extractPdfPageRange(data, record.module.start, record.module.end),
        );
        cropCache.current.set(record.module.id, crop);
        crop.catch(() => cropCache.current.delete(record.module.id));
      }
      const pdf = await crop;
      if (abort.signal.aborted) return;
      await operation({
        module: record.module,
        pages: selectedPages(allPages, record.module),
        pdf,
        language,
        signal: abort.signal,
      });
    } catch (e) {
      if (live.current && (e as Error).name !== 'AbortError')
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      controller.current = null;
      if (live.current) setBusy('');
    }
  };
  const prepare = () =>
    run(
      t('正在整理本 module 的知识与原文依据…', 'Organizing this module’s knowledge and evidence…'),
      async (ctx) => {
        let r = currentRef.current!;
        if (!r.plan) {
          const knowledge = source!.knowledge.filter((k) =>
            k.sourcePages?.some((p) => p >= ctx.module.start && p <= ctx.module.end),
          );
          const plan = await extractModulePlan(ctx, knowledge);
          await patch({ plan }, true);
          r = currentRef.current!;
        }
        if (!r.lessons[language]) {
          setBusy(t('正在完整讲授这一块…', 'Writing the complete lesson…'));
          const lesson = await teachModule(ctx, r.plan!);
          await patch(
            { lessons: { ...currentRef.current!.lessons, [language]: lesson }, stage: 'lesson' },
            true,
          );
        } else await patch({ stage: 'lesson' }, true);
      },
    );
  const generateAssignment = () =>
    run(t('正在准备整组英文题…', 'Preparing the English assignment…'), async (ctx) => {
      const record = currentRef.current!;
      if (!record.plan || !Object.keys(record.lessons).length)
        throw new Error(t('请先准备本 module 的讲解。', 'Prepare the lesson first.'));
      await patch({ lessonRead: true, stage: 'assignment' }, true);
      const slots = makeSlots(record.plan, record.questionCount);
      const taughtLesson = record.lessons[language] ?? record.lessons.zh ?? record.lessons.en!;
      while (currentRef.current!.questions.length < slots.length) {
        ctx.signal?.throwIfAborted();
        const old = currentRef.current!.questions;
        const next = slots.slice(old.length, old.length + 4);
        setBusy(
          t(
            `正在出题 ${old.length + 1}–${old.length + next.length} / ${slots.length}…`,
            `Writing questions ${old.length + 1}–${old.length + next.length} / ${slots.length}…`,
          ),
        );
        const batch = await writeQuestionBatch(ctx, record.plan, next, old, taughtLesson);
        await patch({ questions: [...old, ...batch] }, true);
      }
      if (currentRef.current!.assignmentReviewed) return;
      // One automatic repair cycle per run; failed checks retain drafts and can be resumed.
      for (let pass = 0; pass < 2; pass++) {
        while (currentRef.current!.pendingRepairs?.length) {
          ctx.signal?.throwIfAborted();
          const r = currentRef.current!,
            fixes = r.pendingRepairs!.slice(0, 4),
            ids = new Set(fixes.map((f) => f.id));
          setBusy(t('正在修订有歧义或重复的题目…', 'Revising ambiguous or repetitive questions…'));
          const batch = await writeQuestionBatch(
            ctx,
            record.plan,
            slots.filter((s) => ids.has(s.id)),
            r.questions.filter((q) => !ids.has(q.id)),
            taughtLesson,
            fixes.map((f) => ({ ...f, original: r.questions.find((q) => q.id === f.id) })),
          );
          const replacement = new Map(batch.map((q) => [q.id, q]));
          await patch(
            {
              questions: r.questions.map((q) => replacement.get(q.id) ?? q),
              pendingRepairs: r.pendingRepairs!.filter((f) => !ids.has(f.id)),
            },
            true,
          );
        }
        ctx.signal?.throwIfAborted();
        setBusy(
          t(
            '正在核对整组题的原文依据、难度与中英对应…',
            'Checking source support, difficulty and translation across the assignment…',
          ),
        );
        const issues = await auditAssignment(
          ctx,
          record.plan,
          taughtLesson,
          currentRef.current!.questions,
        );
        if (!issues.length) {
          await patch({ assignmentReviewed: true, pendingRepairs: [] }, true);
          return;
        }
        await patch({ pendingRepairs: issues }, true);
      }
      throw new Error(
        t(
          '有几道题还需要修订。已保存整组进度，点击继续准备即可接着处理。',
          'Some questions still need revision. Progress is saved; continue preparing to finish.',
        ),
      );
    });
  const grade = () =>
    run(t('正在按题目要求批改…', 'Reviewing your reasoning…'), async (ctx) => {
      let r = currentRef.current!;
      let attempt = r.attempts.at(-1);
      if (!r.assignmentReviewed)
        throw new Error(t('请先完成整组题目检查。', 'Finish the assignment check first.'));
      if (r.stage !== 'feedback' || !attempt) {
        attempt = {
          ...submitAttempt(r, language),
          assisted: r.attempts.length > 0 || !!r.draftAssisted,
        };
        await patch({ attempts: [...r.attempts, attempt], stage: 'feedback' }, true);
      }
      const attemptId = attempt.id;
      while (true) {
        ctx.signal?.throwIfAborted();
        r = currentRef.current!;
        attempt = r.attempts.find((a) => a.id === attemptId)!;
        const pending = r.questions
          .filter((q) => !attempt!.assessments.some((a) => a.questionId === q.id))
          .slice(0, 4);
        if (!pending.length) break;
        setBusy(
          t(
            `正在批改 · ${attempt.assessments.length}/${r.questions.length} 题已有结果…`,
            `Reviewing · ${attempt.assessments.length}/${r.questions.length} results ready…`,
          ),
        );
        const results = await assessWrittenBatch(ctx, pending, attempt);
        await patch(
          {
            attempts: currentRef.current!.attempts.map((a) =>
              a.id === attemptId ? { ...a, assessments: [...a.assessments, ...results] } : a,
            ),
          },
          true,
        );
      }
    });
  const latest = current?.attempts.at(-1);
  const attempt = current?.attempts.find((a) => a.id === historyId) ?? latest;
  const addSupplement = (q: ReviewQuestion) =>
    run(t('正在针对这道题补讲…', 'Explaining this specific gap…'), async (ctx) => {
      if (!attempt) return;
      const content = await supplement(ctx, q, attempt);
      await patch(
        {
          supplements: {
            ...currentRef.current!.supplements,
            [`${attempt.id}:${q.id}:${language}`]: content,
          },
        },
        true,
      );
    });
  const exportBackup = () => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recordsRef.current, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'module-review-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const PageRefs = ({ pages }: { pages: number[] }) => (
    <div className="mr-sources">
      {pages.map((p) => (
        <button
          type="button"
          key={p}
          onClick={() => {
            setPreviewPage(p);
            if (current?.stage === 'assignment') void patch({ draftAssisted: true });
          }}
        >
          PDF {p}
        </button>
      ))}
    </div>
  );
  const sessions = [...new Map(modules.map((m) => [m.sessionId, m.sessionTitle])).entries()];
  const lesson =
    current?.lessons[language] ?? (language === 'en' ? current?.lessons.zh : undefined);
  const stages = [
    ['prepare', t('准备', 'Prepare')],
    ['lesson', t('完整讲解', 'Full lesson')],
    ['assignment', t('课后练习', 'Assignment')],
    ['feedback', t('批改与补学', 'Feedback & repair')],
  ] as const;
  const status = (value: string) =>
    ({
      met: t('本题达标', 'Meets this task'),
      partial: t('部分理解', 'Partly supported'),
      not_yet: t('需要补学', 'Needs work'),
      unanswered: t('未作答', 'Unanswered'),
    })[value] || t('待批改', 'Pending review');
  return (
    <div className="module-review-page" ref={pageRef}>
      <header className="mr-header">
        <button onClick={() => void leave(onBack)}>
          <ArrowLeft size={17} />
          {t('复习方式', 'Review modes')}
        </button>
        <div>
          <h1>{t('按 module 重学', 'Relearn by module')}</h1>
          <p>{material.fileName}</p>
        </div>
        <span role="status">
          {saving
            ? t('保存中…', 'Saving…')
            : saveError
              ? t('保存未完成', 'Not saved')
              : repos.current.get(selected)?.cloud
                ? t('云端保存', 'Cloud storage')
                : t('本机保存', 'Local storage')}
        </span>
      </header>
      {loading ? (
        <div className="mr-empty">
          <Loader2 className="animate-spin" />
          {t('正在读取领读分段与复习记录…', 'Loading reading modules and review records…')}
        </div>
      ) : (
        <>
          {error && (
            <div className="mr-error" role="alert">
              {error}
              {!source && (
                <button onClick={() => setReload((n) => n + 1)}>
                  {t('重试读取', 'Retry loading')}
                </button>
              )}
            </div>
          )}
          {saveError && (
            <div className="mr-error" role="alert">
              {saveError}
              <button
                onClick={() => {
                  for (const id of saveFailures.current.keys()) void persist(id).catch(() => {});
                }}
              >
                {t('重试保存', 'Retry save')}
              </button>
              <button onClick={exportBackup}>{t('导出备份', 'Export backup')}</button>
            </div>
          )}
          {!modules.length && source ? (
            <div className="mr-empty">
              <BookOpen size={32} />
              <h2>{t('先沿用领读的 module', 'Start with the guided-reading modules')}</h2>
              <p>
                {t(
                  '这份资料还没有带有效页码的 Lecture 分段。先在领读生成 module，回来即可按原划分重学。',
                  'This lecture has no saved modules with valid page ranges. Create its modules in guided reading first, then return here.',
                )}
              </p>
              <button className="mr-primary" onClick={() => void leave(onStudy)}>
                {t('返回学习', 'Back to study')}
              </button>
            </div>
          ) : (
            current && (
              <div className="mr-layout">
                <aside className="mr-sidebar">
                  <p className="mr-eyebrow">LECTURE MODULES</p>
                  {sessions.length > 1 && (
                    <label>
                      {t('沿用哪次领读', 'Use reading session')}
                      <select
                        disabled={!!busy}
                        value={sessionId}
                        onChange={(e) => {
                          setSessionId(e.target.value);
                          setSelected(modules.find((m) => m.sessionId === e.target.value)!.id);
                          setHistoryId('');
                        }}
                      >
                        {sessions.map(([id, title]) => (
                          <option key={id} value={id}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {modules
                    .filter((m) => m.sessionId === sessionId)
                    .map((m, i) => {
                      const r = records[m.id];
                      return (
                        <button
                          disabled={!!busy}
                          className={`mr-module ${selected === m.id ? 'active' : ''}`}
                          key={m.id}
                          onClick={() => {
                            setSelected(m.id);
                            setHistoryId('');
                            setError('');
                          }}
                        >
                          <small>
                            MODULE {i + 1} · PDF {m.start}–{m.end}
                          </small>
                          <strong>
                            <ExplanationText>{m.title}</ExplanationText>
                          </strong>
                          <small>
                            {r.attempts.length
                              ? t(
                                  `${r.attempts.length} 次作答记录`,
                                  `${r.attempts.length} submissions`,
                                )
                              : r.lessonRead
                                ? t('已读讲解 · 待练习', 'Lesson read · Practice pending')
                                : r.plan
                                  ? t('继续重学', 'Continue lesson')
                                  : t('尚未重学', 'Not started')}
                          </small>
                        </button>
                      );
                    })}
                  <p className="mr-note">
                    {t(
                      '独立保存重学进度，不改变领读里的完成标记。',
                      'Review progress is independent of reading completion.',
                    )}
                  </p>
                </aside>
                <main className="mr-main">
                  <nav className="mr-stages">
                    {stages.map(([key, label]) => (
                      <button
                        key={key}
                        disabled={!!busy || (key === 'feedback' && !latest)}
                        aria-current={current.stage === key ? 'step' : undefined}
                        onClick={() => move(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {busy && (
                    <div className="mr-busy" role="status">
                      <Loader2 size={18} className="animate-spin" />
                      {busy}
                      <button onClick={() => controller.current?.abort()}>
                        {t('停止，保留已完成部分', 'Stop and keep completed work')}
                      </button>
                    </div>
                  )}
                  <article className="mr-paper">
                    <p className="mr-eyebrow">
                      PDF {current.module.start}–{current.module.end}
                    </p>
                    <h2>
                      <ExplanationText>{current.module.title}</ExplanationText>
                    </h2>
                    {current.stage === 'prepare' && (
                      <>
                        <p>
                          {t(
                            '先把整个 module 讲清楚，再做一整组英文课后题。',
                            'Learn the complete module, then work through a full English assignment.',
                          )}
                        </p>
                        <div className="mr-callout">
                          <strong>
                            {t(
                              '讲解与练习共用知识覆盖清单',
                              'Teaching and questions share a coverage plan',
                            )}
                          </strong>
                          <p>
                            {t(
                              '概念、关系、证据与局限都会回到原课件核对。简单题检查基础，复杂题检查应用和推理。',
                              'Concepts, relationships, evidence and limits are checked against the source. Basic tasks check foundations; complex tasks check application and reasoning.',
                            )}
                          </p>
                        </div>
                        <label>
                          {t('本 module 题量', 'Assignment size')}
                          <select
                            disabled={
                              !!busy || current.questions.length > 0 || current.attempts.length > 0
                            }
                            value={current.questionCount}
                            onChange={(e) =>
                              void patch({ questionCount: Number(e.target.value) as 16 | 24 })
                            }
                          >
                            <option value={16}>16 {t('题', 'questions')}</option>
                            <option value={24}>24 {t('题', 'questions')}</option>
                          </select>
                        </label>
                        <p className="mr-note">
                          {t(
                            '英文题干与选项，可开关括号中文，允许中文或英文回答。可以分次完成。',
                            'English questions and options, optional Chinese translations. Answer in Chinese or English and complete the assignment over multiple visits.',
                          )}
                        </p>
                        {current.plan && (
                          <details>
                            <summary>
                              {t('查看知识覆盖与原文范围', 'View coverage and sources')}
                            </summary>
                            {current.plan.objectives.map((o) => (
                              <div className="mr-objective" key={o.id}>
                                <strong>
                                  <ExplanationText>{o.title}</ExplanationText>
                                </strong>
                                <p>
                                  <ExplanationText>{o.explanation}</ExplanationText>
                                </p>
                                <PageRefs pages={o.pages} />
                              </div>
                            ))}
                            {current.plan.excluded.map((x, i) => (
                              <p key={i} className="mr-note">
                                <ExplanationText>{x}</ExplanationText>
                              </p>
                            ))}
                          </details>
                        )}
                        <button
                          className="mr-primary"
                          disabled={!!busy}
                          onClick={() => void prepare()}
                        >
                          {lesson
                            ? t('继续完整讲解', 'Continue lesson')
                            : t('准备完整讲解', 'Prepare full lesson')}
                          <ArrowRight size={17} />
                        </button>
                      </>
                    )}
                    {current.stage === 'lesson' &&
                      (lesson ? (
                        <>
                          <div className="mr-lesson">
                            {lesson.sections.map((section, i) => (
                              <section key={i}>
                                <h3>
                                  <ExplanationText>{section.title}</ExplanationText>
                                </h3>
                                <ExplanationMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                >
                                  {section.markdown}
                                </ExplanationMarkdown>
                                <PageRefs pages={section.pages} />
                              </section>
                            ))}
                          </div>
                          <div className="mr-footer">
                            <span>
                              {t(
                                '完整讲解结束；接下来独立完成一组题。',
                                'End of lesson. Next, complete the assignment independently.',
                              )}
                            </span>
                            <button
                              className="mr-primary"
                              disabled={!!busy}
                              onClick={() => void generateAssignment()}
                            >
                              {current.assignmentReviewed
                                ? t('进入课后练习', 'Open assignment')
                                : t(
                                    `准备 ${current.questionCount} 道英文题`,
                                    `Prepare ${current.questionCount} English questions`,
                                  )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="mr-empty">
                          <p>
                            {t(
                              '尚未生成当前语言的完整讲解。',
                              'The full lesson in this language is not ready.',
                            )}
                          </p>
                          <button
                            disabled={!!busy}
                            className="mr-primary"
                            onClick={() => void prepare()}
                          >
                            {t('生成讲解', 'Generate lesson')}
                          </button>
                        </div>
                      ))}
                    {current.stage === 'assignment' && (
                      <>
                        <h3>Module assignment</h3>
                        <p>
                          {t(
                            '先独立作答，整组提交后再看参考答案。不会的可以留空。',
                            'Work independently and view the answer key after submitting. You may leave questions unanswered.',
                          )}
                        </p>
                        <div className="mr-callout">
                          Answer in Chinese or English. Show your reasoning where requested.
                          <p>
                            {t(
                              '评价知识理解和推理，不因使用中文或不同措辞扣分。',
                              'Assessment is based on understanding and reasoning, not language choice or matching the reference wording.',
                            )}
                          </p>
                        </div>
                        <div className="mr-assignment-tools">
                          <span>
                            {Object.values(current.draft).filter((v) => v.trim()).length} /{' '}
                            {current.questionCount} {t('题已作答', 'answered')}
                          </span>
                          <label>
                            <input
                              type="checkbox"
                              checked={current.showChinese}
                              onChange={(e) => void patch({ showChinese: e.target.checked })}
                            />
                            {t('括号中文辅助', 'Chinese translation')}
                          </label>
                        </div>
                        {!current.assignmentReviewed ? (
                          <div className="mr-empty">
                            <p>
                              {t(
                                `已准备 ${current.questions.length}/${current.questionCount} 题，整组生成并检查后开始作答。`,
                                `Prepared ${current.questions.length}/${current.questionCount}. Begin once the whole assignment is generated and checked.`,
                              )}
                            </p>
                            <button
                              className="mr-primary"
                              disabled={!!busy || !current.plan}
                              onClick={() => void generateAssignment()}
                            >
                              {t('继续准备整组题', 'Continue preparing assignment')}
                            </button>
                            {!current.plan && (
                              <button onClick={() => move('prepare')}>
                                {t('先准备讲解', 'Prepare lesson first')}
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {current.questions.map((q, i) => (
                              <section className="mr-question" key={q.id}>
                                <p className="mr-eyebrow">
                                  Question {i + 1} ·{' '}
                                  {q.kind === 'choice'
                                    ? 'Multiple choice'
                                    : q.level === 'connection'
                                      ? 'Explanation & comparison'
                                      : q.level === 'application'
                                        ? 'Application'
                                        : 'Integrated reasoning'}
                                </p>
                                <div id={`mr-${q.id}`} lang="en">
                                  <Markdown>{q.promptEn}</Markdown>
                                </div>
                                {current.showChinese && (
                                  <div className="mr-translation" data-preserve-language="true">
                                    （{q.promptZh}）
                                  </div>
                                )}
                                {q.kind === 'choice' ? (
                                  <fieldset aria-labelledby={`mr-${q.id}`}>
                                    {q.optionsEn.map((option, index) => (
                                      <label className="mr-option" key={index}>
                                        <input
                                          disabled={!!busy}
                                          type="radio"
                                          name={q.id}
                                          value={index}
                                          checked={current.draft[q.id] === String(index)}
                                          onChange={() =>
                                            void patch({
                                              draft: {
                                                ...currentRef.current!.draft,
                                                [q.id]: String(index),
                                              },
                                            })
                                          }
                                        />
                                        <span>
                                          <span lang="en">
                                            {String.fromCharCode(65 + index)}. {option}
                                          </span>
                                          {current.showChinese && (
                                            <small data-preserve-language="true">
                                              （{q.optionsZh[index]}）
                                            </small>
                                          )}
                                        </span>
                                      </label>
                                    ))}
                                  </fieldset>
                                ) : (
                                  <textarea
                                    disabled={!!busy}
                                    aria-labelledby={`mr-${q.id}`}
                                    placeholder={t(
                                      '可以用中文或英文回答，写出判断与理由…',
                                      'Answer in Chinese or English. Explain your reasoning…',
                                    )}
                                    value={current.draft[q.id] || ''}
                                    onChange={(e) =>
                                      void patch({
                                        draft: {
                                          ...currentRef.current!.draft,
                                          [q.id]: e.target.value,
                                        },
                                      })
                                    }
                                  />
                                )}
                              </section>
                            ))}
                            <div className="mr-footer">
                              <span>
                                {t(
                                  `${current.questionCount - Object.values(current.draft).filter((v) => v.trim()).length} 题留空；提交后会保留此次作答快照。`,
                                  `${current.questionCount - Object.values(current.draft).filter((v) => v.trim()).length} unanswered. Submitting preserves this attempt.`,
                                )}
                              </span>
                              <button
                                className="mr-primary"
                                disabled={!!busy}
                                onClick={() => void grade()}
                              >
                                {t('提交整组作业', 'Submit assignment')}
                                <Check size={16} />
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {current.stage === 'feedback' && attempt && (
                      <>
                        <div className="mr-assignment-tools">
                          <label>
                            {t('作答记录', 'Attempt')}
                            <select
                              disabled={!!busy}
                              value={attempt.id}
                              onChange={(e) => setHistoryId(e.target.value)}
                            >
                              {current.attempts.map((a, i) => (
                                <option key={a.id} value={a.id}>
                                  {i + 1} · {new Date(a.createdAt).toLocaleString()}{' '}
                                  {a.assisted ? t('· 订正/有帮助', '· Assisted') : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <span>
                            {attempt.assessments.length}/{current.questionCount}{' '}
                            {t('题已有反馈', 'results ready')}
                          </span>
                        </div>
                        <p className="mr-note">
                          {t(
                            '本题达标只说明本次回答符合要求，不代表整个 module 已掌握。',
                            'Meeting a task means this answer meets its requirements; it does not establish mastery of the whole module.',
                          )}
                        </p>
                        {attempt === latest &&
                          attempt.assessments.length < current.questionCount && (
                            <button
                              className="mr-primary"
                              disabled={!!busy}
                              onClick={() => void grade()}
                            >
                              {t('继续批改剩余题目', 'Continue grading remaining answers')}
                            </button>
                          )}
                        {current.questions.map((q, i) => {
                          const a = attempt.assessments.find((a) => a.questionId === q.id),
                            key = `${attempt.id}:${q.id}:${language}`;
                          return (
                            <section className="mr-question" key={q.id}>
                              <p className="mr-eyebrow">
                                Question {i + 1} · {status(a?.status || 'pending')}
                              </p>
                              <div lang="en">
                                <Markdown>{q.promptEn}</Markdown>
                              </div>
                              {current.showChinese && (
                                <p className="mr-translation" data-preserve-language="true">
                                  （{q.promptZh}）
                                </p>
                              )}
                              <div className="mr-your-answer" data-preserve-language="true">
                                <strong>{t('你的作答', 'Your answer')}</strong>
                                <p>
                                  {q.kind === 'choice'
                                    ? attempt.answers[q.id]
                                      ? `${String.fromCharCode(65 + Number(attempt.answers[q.id]))}. ${q.optionsEn[Number(attempt.answers[q.id])]}`
                                      : t('未作答', 'Unanswered')
                                    : attempt.answers[q.id] || t('未作答', 'Unanswered')}
                                </p>
                              </div>
                              {a && (
                                <>
                                  <ExplanationMarkdown remarkPlugins={[remarkGfm]}>
                                    {a.feedback}
                                  </ExplanationMarkdown>
                                  {a.criteria.map((c, j) => (
                                    <p className="mr-note" key={j}>
                                      {c.status === 'met'
                                        ? '✓'
                                        : c.status === 'partial'
                                          ? '◐'
                                          : '○'}{' '}
                                      <ExplanationText>{`${c.criterion} — ${c.evidence}`}</ExplanationText>
                                    </p>
                                  ))}
                                </>
                              )}
                              <details>
                                <summary>
                                  {t('参考答案与原文依据', 'Reference answer and source')}
                                </summary>
                                <ExplanationMarkdown remarkPlugins={[remarkGfm]}>
                                  {q.reference}
                                </ExplanationMarkdown>
                                <PageRefs pages={q.pages} />
                              </details>
                              {a && a.status !== 'met' && (
                                <button disabled={!!busy} onClick={() => void addSupplement(q)}>
                                  {t('针对这道题补讲', 'Explain this gap')}
                                </button>
                              )}
                              {current.supplements[key] && (
                                <div className="mr-callout">
                                  <Markdown>{current.supplements[key]}</Markdown>
                                </div>
                              )}
                            </section>
                          );
                        })}
                        <div className="mr-footer">
                          <span>
                            {t(
                              '订正会保存为新一次作答，原答案和反馈保留。',
                              'Corrections create a new attempt. Previous answers and feedback remain.',
                            )}
                          </span>
                          <button
                            className="mr-primary"
                            disabled={!!busy}
                            onClick={() => {
                              setHistoryId('');
                              void patch({ stage: 'assignment', draft: { ...attempt.answers } });
                            }}
                          >
                            {t('开始订正', 'Start corrections')}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                </main>
              </div>
            )
          )}
        </>
      )}
      {previewPage !== null && source && (
        <div className="mr-source-backdrop">
          <section role="dialog" aria-modal="true" aria-label={t('原文', 'Original source')}>
            <button
              className="mr-close"
              aria-label={t('关闭原文', 'Close source')}
              onClick={() => setPreviewPage(null)}
            >
              <X />
            </button>
            <ExamWorkspaceMaterialPreview
              materials={[material]}
              resolveExamMaterialPdf={resolvePdf}
              previewJumpRequest={{
                linkId: material.id,
                page: previewPage,
                requestId: previewPage,
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
