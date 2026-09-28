import { StudyTerms } from '@/features/reluctant/StudyTermPopover';
import type { StudyTerm } from '@/features/reluctant/studyTerms';
import type { StudyVisual } from '@/features/reluctant/studyVisuals';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, RotateCcw } from 'lucide-react';
import type { ExamMaterialLink } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { readFileAsDataURL } from '@/lib/pdf/pdfUtils';
import { generateReluctantOverviewExplanation, generateReluctantOverviewOutline } from '@/services/geminiService';
import { OverviewProse } from '@/features/reluctant/OverviewProse';
import '@/features/reluctant/overviewReader.css';
import { CramSettings } from './CramViews';
import { SprintVisual } from './SprintVisual';
import { cramId, type CramSession, type CramTopic } from './cramState';
import { nextSourcePages } from './cramAI';
import { dueLectures, firstRoundDone, markSprintAssisted, remainingMinutes, sprintPlanKey, sprintState,
  type GuidedSprint, type SprintChat, type SprintLecture, type SprintPlanItem, type SprintRecall } from './sprintState';
import { annotateSprintTerms, explainSprintDetail, feedbackSprint, lectureHint, planSprint, replySprint, type SprintRun } from './sprintAI';

type Tab = 'study' | 'scope' | 'recap' | 'settings';
interface Props {
  session: CramSession; getSession: () => CramSession; busy: boolean; run: SprintRun;
  commit: (update: (s: CramSession) => CramSession) => void;
  readSources: () => Promise<boolean>; extract: (materialId: string) => void;
  resolvePdf: (material: ExamMaterialLink) => Promise<File | null>;
  onSource: (materialId: string, page: number) => void;
}
export function GuidedSprintPanel({ session: s, getSession, busy, run, commit, readSources, extract, resolvePdf, onSource }: Props) {
  const { text: t, language } = useAppLanguage();
  const [tab, setTab] = useState<Tab>('study');
  const [search, setSearch] = useState('');
  const [showOld, setShowOld] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const g = sprintState(s);
  const update = (fn: (g: GuidedSprint) => GuidedSprint) => commit(s => ({ ...s, guided: fn(sprintState(s)) }));
  const patchLecture = (id: string, patch: Partial<SprintLecture>) => update(g => ({ ...g, lectures: g.lectures.map(l => l.materialId === id ? { ...l, ...patch } : l) }));
  const patchRecall = (id: string, patch: Partial<SprintRecall>) => update(g => ({ ...g, recalls: g.recalls.map(r => r.id === id ? { ...r, ...patch } : r) }));
  const patchItem = (id: string, patch: Partial<SprintPlanItem>) => update(g => ({ ...g, plan: g.plan.map(i => i.id === id ? { ...i, ...patch } : i) }));
  const name = (id: string) => s.sources.find(x => x.material.id === id)?.material.fileName || '';
  const prose = (value: string, terms?: StudyTerm[]) => <StudyTerms terms={terms} language={language}><OverviewProse value={value} caveats={[]} language={language} /></StudyTerms>;
  const visual = (value: StudyVisual, terms?: StudyTerm[]) => <StudyTerms terms={terms} language={language}><SprintVisual visual={value} language={language} /></StudyTerms>;
  const active = g.active;
  const lecture = active?.kind === 'lecture' ? g.lectures.find(l => l.materialId === active.materialId) : undefined;
  const recall = active?.kind === 'recall' ? g.recalls.find(r => r.id === active.id) : undefined;
  const item = active?.kind === 'detail' ? g.plan.find(i => i.id === active.id) : undefined;
  const due = dueLectures(s);
  const first = g.lectures.find(l => !l.readAt || !l.immediateDone);
  const completed = g.lectures.filter(l => l.readAt && l.immediateDone).length;
  const roundDone = firstRoundDone(g);
  const pending = g.plan.filter(i => i.status === 'pending');
  const stale = !!g.planKey && g.planKey !== sprintPlanKey(s);
  const remaining = remainingMinutes(s);
  const allReady = s.sources.every(source => source.pages.length > 0);
  const extractionPending = s.sources.some(source => !source.pages.length || nextSourcePagesSafe(source));
  const scroll = () => window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
  const changeTab = (next: Tab) => {
    if (busy) return;
    if (next === 'scope' || next === 'recap') commit(markSprintAssisted);
    setTab(next);
    if (next === 'study' && tab === 'settings' && firstRoundDone(sprintState(getSession())) && !sprintState(getSession()).active
      && sprintState(getSession()).planKey !== sprintPlanKey(getSession()) && remainingMinutes(getSession()) !== 0) generatePlan();
  };
  const source = (id: string, page: number) => { commit(markSprintAssisted); onSource(id, page); };
  const pages = (id: string, values: number[]) => <div className="cram-source-links"><BookOpen size={14} /><span>{t('原文', 'Source')}</span>{[...new Set(values)].sort((a,b) => a-b).map(p => <button key={p} onClick={() => source(id,p)}>{p}</button>)}</div>;
  const pdf = async (id: string, signal: AbortSignal) => {
    const material = getSession().sources.find(x => x.material.id === id)?.material;
    if (!material) throw new Error(t('找不到这份资料。', 'Source not found.'));
    const file = await resolvePdf(material); signal.throwIfAborted();
    if (!file) throw new Error(t('暂时无法打开 PDF，请先在资料库重新打开它。', 'PDF unavailable. Reopen it in the library first.'));
    const content = await readFileAsDataURL(file); signal.throwIfAborted(); return content;
  };
  const prepareLecture = async (id: string) => {
    if (busy) return;
    setTab('study');
    update(g => ({ ...g, active: { kind: 'lecture', materialId: id } }));
    if (!getSession().sources.find(x => x.material.id === id)?.pages.length && !await readSources()) return;
    if (!mounted.current) return;
    if (!getSession().sources.find(x => x.material.id === id)?.pages.length) return;
    let l = sprintState(getSession()).lectures.find(x => x.materialId === id)!;
    if (!l.outline && !await run(t('读完整份讲义，整理主线', 'Reading the full lecture for its main thread'), async (signal, usage) => {
      const data = await pdf(id, signal);
      const source = getSession().sources.find(x => x.material.id === id)!;
      const outline = await generateReluctantOverviewOutline(data, { fileName: source.material.fileName, pageCount: source.pages.length, language, signal, onUsage: usage });
      signal.throwIfAborted(); patchLecture(id, { outline });
    })) return;
    if (!mounted.current) return;
    l = sprintState(getSession()).lectures.find(x => x.materialId === id)!;
    if (!l.outline || l.explanation) return;
    await run(t('用大白话串起这一讲', 'Explaining this lecture in everyday language'), async (signal, usage) => {
      const explanation = await generateReluctantOverviewExplanation(l.outline!, 'plain', { language, signal, onUsage: usage, lightweightVisuals: true, clickableTerms: true });
      signal.throwIfAborted(); patchLecture(id, { explanation, visible: 1 });
    });
  };
  const startRecall = (materialId: string, kind: SprintRecall['kind'], topicIds: string[] = []) => {
    if (busy) return;
    const existing = sprintState(getSession()).recalls.find(r => r.materialId === materialId && r.kind === kind && !r.finishedAt);
    const record: SprintRecall = existing ?? { id: cramId(), materialId, kind, topicIds, startedAt: Date.now(), draft: '', assisted: false };
    update(g => ({ ...g, active: { kind: 'recall', id: record.id }, recalls: existing ? g.recalls : [...g.recalls, record] }));
    setShowOld(false); setTab('study');
  };
  const finishLecture = (id: string) => {
    const now = Date.now();
    update(g => ({ ...g, lectures: g.lectures.map(l => l.materialId === id ? { ...l, readAt: l.readAt ?? now } : l),
      events: g.lectures.find(l => l.materialId === id)?.readAt ? g.events : [...g.events, { at: now, kind: 'lecture', materialId: id, topicIds: [] }] }));
    startRecall(id, 'immediate');
  };
  const finishRecall = (r: SprintRecall, skipped = false) => {
    const now = Date.now();
    update(g => ({ ...g, active: undefined,
      recalls: g.recalls.map(x => x.id === r.id ? { ...x, finishedAt: now, skipped } : x),
      lectures: g.lectures.map(l => l.materialId === r.materialId && r.kind === 'immediate' ? { ...l, immediateDone: true } : l),
      events: skipped ? g.events : [...g.events, { at: now, kind: 'recall', materialId: r.materialId, topicIds: r.topicIds }],
      snoozed: r.kind === 'delayed' && skipped ? { ...g.snoozed, [r.materialId]: { at: now, eventCount: g.events.length } } : g.snoozed,
      plan: g.plan.map(i => i.kind === 'recall' && i.materialId === r.materialId && i.status === 'pending' ? { ...i, status: skipped ? 'deferred' : 'done' } : i),
    })); setShowOld(false);
    if (firstRoundDone(sprintState(getSession())) && remainingMinutes(getSession()) !== 0) generatePlan();
  };
  const submitRecall = (r: SprintRecall) => {
    if (busy || !r.draft.trim() || r.feedback) return;
    patchRecall(r.id, { submittedAt: r.submittedAt ?? Date.now() });
    void run(t('看看这次复述讲清楚了什么', 'Reviewing your retelling'), async (signal, usage) => {
      const latest = getSession(); const saved = sprintState(latest).recalls.find(x => x.id === r.id)!;
      const feedback = await feedbackSprint(latest, saved, signal, usage); signal.throwIfAborted();
      patchRecall(r.id, { feedback }); scroll();
    });
  };
  const generatePlan = () => void run(t('安排接下来的深入学习与回想', 'Planning further learning and delayed recall'), async (signal, usage) => {
    const result = await planSprint(getSession(), signal, usage); signal.throwIfAborted();
    commit(s => {
      const g = sprintState(s); const next = { ...s, guided: { ...g, plan: [...g.plan.map(i => i.status === 'pending' ? { ...i, status: 'replaced' as const } : i), ...result.items], planNote: result.note } };
      next.guided.planKey = sprintPlanKey(next); return next;
    });
  });
  const startItem = (i: SprintPlanItem) => {
    if (busy) return;
    if (i.kind === 'recall') {
      if (!dueLectures(getSession()).some(l => l.materialId === i.materialId)) { generatePlan(); return; }
      startRecall(i.materialId, 'delayed', i.topicIds); return;
    }
    update(g => ({ ...g, active: { kind: 'detail', id: i.id } })); setTab('study');
    if (i.lesson) return;
    void run(t('讲清这一块细节', 'Explaining this supplement'), async (signal, usage) => {
      const data = await pdf(i.materialId, signal);
      const lesson = await explainSprintDetail(getSession(), i, data, signal, usage); signal.throwIfAborted();
      patchItem(i.id, lesson);
    });
  };
  const finishDetail = (i: SprintPlanItem) => {
    if (sprintState(getSession()).events.some(e => e.kind === 'detail' && e.topicIds.length === i.topicIds.length && i.topicIds.every(id => e.topicIds.includes(id))) && i.status === 'done') { update(g => ({ ...g,active:undefined }));return; }
    update(g => ({ ...g, active: undefined,
    plan: g.plan.map(p => p.id === i.id ? { ...p, status: 'done' } : p),
    events: [...g.events, { at: Date.now(), kind: 'detail', materialId: i.materialId, topicIds: i.topicIds }],
  }));
    if (remainingMinutes(getSession()) !== 0) generatePlan();
  };
  const followup = (target: SprintLecture | SprintPlanItem, question: string, retryId?: string) => {
    if (busy || !question.trim()) return;
    const isLecture = 'visible' in target;
    const entry: SprintChat = retryId ? target.chats.find(c => c.id === retryId)! : { id: cramId(), question: question.trim(), ...(isLecture ? { section: target.visible - 1 } : {}) };
    if (!entry) return;
    const patch = (p: Partial<SprintLecture & SprintPlanItem>) => isLecture ? patchLecture(target.materialId, p) : patchItem(target.id, p);
    if (!retryId) patch({ chats: [...target.chats, entry], draft: '' });
    const delivered = isLecture ? target.explanation?.sections.slice(0, target.visible).map(s => s.text).join('\n\n') || '' : target.lesson || '';
    void run(t('接着解释你的问题', 'Explaining your question'), async (signal, usage) => {
      const data = await pdf(target.materialId, signal);
      const reply = await replySprint(getSession(), target.materialId, entry.question, delivered, target.chats, data, signal, usage);
      signal.throwIfAborted();
      const state = sprintState(getSession());
      const chats = isLecture ? state.lectures.find(l => l.materialId === target.materialId)!.chats : state.plan.find(p => p.id === target.id)!.chats;
      patch({ chats: chats.map(c => c.id === entry.id ? { ...c, ...reply } : c) }); scroll();
    });
  };
  const termsControl = (target: SprintLecture | SprintPlanItem) => {
    const isLecture = 'visible' in target;
    const terms = isLecture ? target.explanation?.terms : target.terms;
    if (terms !== undefined) return terms.length ? <p className="cram-muted">{t('带虚线的词可以点开，查看大白话释义。', 'Select an underlined term for a plain-language definition.')}</p> : null;
    return <button disabled={busy} onClick={() => void run(t('补充英文和大白话释义', 'Adding English names and plain-language definitions'), async (signal, usage) => {
      const data = await pdf(target.materialId, signal);
      const terms = await annotateSprintTerms({ teaching: isLecture ? target.explanation?.sections : { lesson: target.lesson, visual: target.visual }, answers: target.chats.map(c => c.answer).filter(Boolean) }, data, signal, usage);
      signal.throwIfAborted();
      // Merge only metadata into the latest state; never replace prose, drafts or progress.
      update(g => isLecture ? { ...g, lectures: g.lectures.map(l => l.materialId === target.materialId && l.explanation ? { ...l, explanation: { ...l.explanation, terms }, chats: l.chats.map(c => c.answer && c.terms === undefined ? { ...c, terms } : c) } : l) }
        : { ...g, plan: g.plan.map(p => p.id === target.id ? { ...p, terms, chats: p.chats.map(c => c.answer && c.terms === undefined ? { ...c, terms } : c) } : p) });
    })}>{t('补充术语释义', 'Add term definitions')}</button>;
  };
  const chatRows = (target: SprintLecture | SprintPlanItem, section?: number) => target.chats.filter(c => section === undefined || c.section === section).map(c => <div key={c.id} className="sprint-chat-pair"><p className="sprint-user-message">{c.question}</p>{c.answer ? prose(c.answer, c.terms ?? ('visible' in target ? target.explanation?.terms : target.terms)) : <button disabled={busy} onClick={() => followup(target,c.question,c.id)}>{t('继续回答这个问题', 'Retry this reply')}</button>}</div>);
  const composer = (target: SprintLecture | SprintPlanItem) => <div className="sprint-composer"><label>{t('随时追问，不会打断原来的进度', 'Ask anytime; your place is saved')}<textarea rows={3} maxLength={6000} disabled={busy} value={target.draft} placeholder={t('这里没懂，或者想换个例子…', 'Ask about this, or request another example…')} onChange={e => 'visible' in target ? patchLecture(target.materialId, { draft: e.target.value }) : patchItem(target.id, { draft: e.target.value })} /></label><div className="cram-actions"><button disabled={busy} onClick={() => followup(target, t('把刚刚这一段换个更简单的说法，举个例子。', 'Explain the last part more simply with an example.'))}>{t('换个说法', 'Explain differently')}</button><button disabled={busy || !target.draft.trim()} onClick={() => followup(target,target.draft)}>{t('发送', 'Send')}<ArrowRight size={15} /></button></div></div>;

  // Count engaged study time, including reading and retelling, without charging idle/background time.
  const latestCommit = useRef(commit); latestCommit.current = commit;
  useEffect(() => {
    if (tab !== 'study' || !active) return;
    let touched = Date.now(); const touch = () => { touched = Date.now(); };
    window.addEventListener('pointerdown', touch); window.addEventListener('keydown',touch); window.addEventListener('scroll',touch,true);
    const timer = setInterval(() => {
      if (!busy && document.visibilityState === 'visible' && Date.now() - touched < 120000) latestCommit.current(s => ({ ...s, activeSeconds: (s.activeSeconds ?? 0) + 15 }));
    },15000);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown',touch); window.removeEventListener('keydown',touch); window.removeEventListener('scroll',touch,true); };
  },[tab, active?.kind, active && ('id' in active ? active.id : active.materialId), busy]);

  return <div className="sprint-guided">
    <nav className="sprint-tabs" aria-label={t('冲刺导航', 'Sprint navigation')}>{(['study','scope','recap'] as const).map((key,i) => <button key={key} disabled={busy} aria-current={tab === key ? 'page' : undefined} onClick={() => changeTab(key)}>{[t('继续冲刺','Continue sprint'),t('复习范围','Study scope'),t('考前回顾','Final recap')][i]}</button>)}<button className="sprint-settings-link" disabled={busy} aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => changeTab('settings')}>{t('考试与时间','Exam & time')}</button></nav>
    <div className="sprint-progress"><span>{t('第一轮主线', 'First pass')} {completed}/{g.lectures.length} {t('讲', 'lectures')}</span><span>{t('隔开回想', 'Delayed retellings')} {g.recalls.filter(r => r.kind === 'delayed' && r.finishedAt && !r.skipped).length}</span><span>{t('已补充', 'Supplements read')} {g.plan.filter(p => p.kind === 'detail' && p.status === 'done').length}</span>{remaining !== undefined && <span>{t('计划剩余约', 'About')} {Math.ceil(remaining)} {t('分钟', 'planned minutes left')}</span>}</div>
    {tab === 'settings' && <><button className="cram-actions" disabled={busy} onClick={() => changeTab('study')}><ArrowLeft size={16}/>{t('回到冲刺','Back to sprint')}</button><CramSettings session={s} onChange={patch => commit(s => ({ ...s,...patch }))}/><p className="cram-muted">{t('修改会让后续安排重新评估；已读内容、复述与草稿都会保留。', 'Changes trigger reassessment of future steps; explanations, retellings and drafts are retained.')}</p></>}
    {tab === 'study' && <div className="sprint-reading">
      {remaining === 0 && <div className="cram-card"><h3>{t('本次计划时间已用完', 'Your planned study time is up')}</h3><p>{t('可以现在收尾，也可以增加时间继续。已学内容和未展开范围都保留。', 'Wrap up now, or add time to continue. Your work and unfinished scope are saved.')}</p><div className="cram-actions"><button onClick={() => changeTab('recap')}>{t('打开考前回顾','Open recap')}</button><button onClick={() => changeTab('settings')}>{t('调整时间','Adjust time')}</button></div></div>}
      {active && <button className="sprint-back" disabled={busy} onClick={() => update(g => ({ ...g,active: undefined }))}><ArrowLeft size={16}/>{t('查看下一步（保留进度）','Next steps (save my place)')}</button>}
      {!active && <>
        <div className="review-intro"><span className="review-eyebrow">{roundDone ? t('接下来 · 深入与回想','NEXT · DEEPEN & RECALL') : t('第一轮 · 先把主线讲通','FIRST PASS · THE MAIN THREAD')}</span><h2>{roundDone ? t('主线已经过了一遍，接着学值得深入的部分。','The first pass is done. Let’s build on it.') : t('一次一讲，先听懂它在讲什么。','One lecture at a time. Start with the main idea.')}</h2><p>{roundDone ? t('根据刚刚讲过的内容、你的复述和可用时间，安排补充细节与隔开回想。','Plan supplements and delayed recall from what you read, your retellings and available time.') : t('大白话分段讲解 → 自己复述 → 继续下一讲。隔开之后，再回来串一次。每讲约十分钟是目标，可以按你的节奏继续。','Plain-language explanation → retell it → next lecture. Return after a gap. Around ten minutes per lecture is a target; move at your own pace.')}</p></div>
        {!allReady && <div className="cram-card"><h3>{t('先准备这次的讲义','Prepare your lectures')}</h3><p>{s.sources.map(x => x.material.fileName).join(' · ')}</p><button disabled={busy} className="review-primary" onClick={async () => { if (!await readSources() || !mounted.current) return; const first = sprintState(getSession()).lectures.find(l => !l.readAt); if (first && getSession().sources.find(x => x.material.id === first.materialId)?.pages.length) await prepareLecture(first.materialId); }}>{t('开始冲刺','Start sprint')}<ArrowRight size={17}/></button><p className="cram-muted">{t('读取资料、整理知识点，再开始第一讲。考试信息可以稍后补充。','Read sources, extract objectives, then begin the first lecture. Exam details can come later.')}</p></div>}
        {due[0] && <div className="cram-card sprint-recall-card"><span className="cram-badge"><RotateCcw size={13}/>{t('隔开后再回想','Recall after a gap')}</span><h3>{name(due[0].materialId)}</h3><p>{t('已经隔开其他内容或一段时间。先不翻讲解，用自己的话把这一讲重新串起来。','Other material or time has intervened. Try reconnecting this lecture in your own words before opening the explanation.')}</p><div className="cram-actions"><button className="review-primary" disabled={busy} onClick={() => startRecall(due[0].materialId,'delayed')}>{t('开始回想','Start recalling')}</button><button disabled={busy} onClick={() => update(g => ({ ...g, snoozed: { ...g.snoozed,[due[0].materialId]: { at: Date.now(),eventCount: g.events.length } } }))}>{t('稍后再来','Later')}</button></div></div>}
        {allReady && first && <div className="cram-card sprint-next"><span className="review-eyebrow">{t('接着这一讲','CONTINUE THIS LECTURE')}</span><h3>{name(first.materialId)}</h3><p>{first.readAt ? t('主线已读完，现在用自己的话讲一遍。','The main thread is read. Try retelling it now.') : t('只看讲解文字就能跟上，随时可以追问。','Follow the explanation alone and ask questions anytime.')}</p><button className="review-primary" disabled={busy} onClick={() => first.readAt ? startRecall(first.materialId,'immediate') : void prepareLecture(first.materialId)}>{first.readAt ? t('用自己的话讲一遍','Retell this lecture') : first.explanation ? t('继续这一讲','Continue lecture') : t('开始这一讲','Start this lecture')}<ArrowRight size={17}/></button></div>}
        {roundDone && <div className="cram-card"><h3>{stale ? t('接下来可以更新安排','Update your next steps') : t('接下来两三步','Your next few steps')}</h3>{stale && <p>{t('学习进度或考试信息有变化。更新后会重新考虑补什么、讲多深，以及什么时候回想。','Progress or exam details changed. Reassess what to deepen, how far to go and when to recall.')}</p>}{g.planNote && !stale && <p>{g.planNote}</p>}
          <button disabled={busy || remaining === 0} className="review-primary" onClick={generatePlan}>{!g.planKey ? t('安排下一轮','Plan the next round') : t('更新后续安排','Update next steps')}</button>
          {pending.some(i => remaining !== undefined && i.minutes > remaining) && <p>{t('部分安排超过当前剩余时间，请更新安排或调整时间。','Some steps exceed the time left. Update the plan or adjust your time.')}</p>}{pending.slice(0,3).map(i => <article className="sprint-plan-row" key={i.id}><span className="cram-badge">{i.kind === 'recall' ? t('隔开回想','Delayed recall') : t('补充细节','Go deeper')} · {t('约','~')}{i.minutes} {t('分钟','min')}</span><h3>{i.title}</h3><p>{i.reason}</p><p><strong>{t('这次讲到：','This time: ')}</strong>{i.depth}</p><small>{name(i.materialId)}</small><div className="cram-actions"><button disabled={busy || stale || (remaining !== undefined && i.minutes > remaining)} onClick={() => startItem(i)}>{t('开始这一块','Start this step')}<ArrowRight size={15}/></button><button disabled={busy} onClick={() => patchItem(i.id,{ status:'deferred' })}>{t('暂缓，换一个','Defer this step')}</button></div></article>)}
          {!pending.length && !!g.planKey && <p>{t('可以查看回顾、回来回想，或更新安排继续深入。','Open the recap, return for recall, or update the plan to go deeper.')}</p>}
        </div>}
        {extractionPending && allReady && <p className="cram-muted">{t('部分知识点还没有整理完成。可以继续主线学习，在“复习范围”续提取后再完善深入安排。','Some objectives still need extraction. Continue the main thread and resume extraction in Study scope before refining the plan.')}</p>}
      </>}
      {lecture && <>
        <div className="sprint-lecture-heading"><span className="review-eyebrow">{t('大白话从头讲','PLAIN-LANGUAGE WALKTHROUGH')}</span><p>{name(lecture.materialId)}</p><h2>{lecture.explanation?.title || lecture.outline?.title || t('准备这一讲','Prepare this lecture')}</h2>{lecture.outline && <p>{lecture.outline.overview}</p>}</div>
        {!lecture.explanation ? <div className="cram-card"><p>{t('先读完整份讲义，再把主线分段讲给你。已完成的准备会保留。','Read the full lecture, then explain its main thread in parts. Completed preparation is saved.')}</p><button disabled={busy} className="review-primary" onClick={() => void prepareLecture(lecture.materialId)}>{t('继续准备讲解','Prepare / retry explanation')}</button></div> : <>
          {termsControl(lecture)}
          {lecture.explanation.sections.slice(0,lecture.visible).map((section,index) => <section className="sprint-section" key={index}><span className="sprint-section-count">{t('这一讲', 'This lecture')} · {index+1} / {lecture.explanation!.sections.length}</span>{prose(section.text, lecture.explanation?.terms)}{section.visual && visual(section.visual, lecture.explanation?.terms)}{pages(lecture.materialId,lecture.outline!.points.filter(p => section.pointIds.includes(p.id)).flatMap(p => p.pages))}{chatRows(lecture,index)}</section>)}
          {composer(lecture)}<div className="cram-actions sprint-continue"><button disabled={busy} className="review-primary" onClick={() => lecture.visible < lecture.explanation!.sections.length ? (patchLecture(lecture.materialId,{ visible:lecture.visible+1 }),scroll()) : finishLecture(lecture.materialId)}>{lecture.visible < lecture.explanation.sections.length ? t('继续讲下一段','Continue to the next part') : t('主线读完了，自己讲一遍','I’ve read the main thread — retell it')}<ArrowRight size={17}/></button></div>
        </>}
      </>}
      {recall && <>
        <div className="sprint-lecture-heading"><span className="review-eyebrow">{recall.kind === 'delayed' ? t('隔开后再回想','RECALL AFTER A GAP') : t('当场复述','RETELL IN YOUR OWN WORDS')}</span><h2>{name(recall.materialId)}</h2><p>{t('用自己的话把这一讲重新讲一遍。主要在说什么，各部分怎么连起来？记得多少讲多少，名字忘了可以先描述作用。','Retell this lecture in your own words. What is it about, and how do its parts connect? Say what you remember; describe roles if names escape you.')}</p>{recall.topicIds.length > 0 && <p>{t('这次只围绕：','This time, focus on: ')}{s.topics.filter(t => recall.topicIds.includes(t.id)).map(t => t.title).join(' · ')}</p>}</div>
        <label>{t('我的复述','My retelling')}<textarea rows={7} maxLength={14000} value={recall.draft} disabled={busy || !!recall.submittedAt} onChange={e => patchRecall(recall.id,{draft:e.target.value})} placeholder={t('不用写成标准答案，想到哪里就从哪里开始。','No formal answer needed. Start wherever you can.')} /></label>
        <div className="cram-actions">{!recall.feedback && <button className="review-primary" disabled={busy || !recall.draft.trim()} onClick={() => submitRecall(recall)}>{recall.submittedAt ? t('重试反馈（复述已保存）','Retry feedback (retelling saved)') : t('讲完了，看看反馈','Review my retelling')}</button>}<button disabled={busy} onClick={() => patchRecall(recall.id,{ assisted:recall.submittedAt ? recall.assisted : true,hint:lectureHint(s,recall.materialId,recall.topicIds) })}>{t('给一点主线提示','Give me a hint')}</button><button disabled={busy} onClick={() => { if (!recall.submittedAt) patchRecall(recall.id,{assisted:true}); setShowOld(v => !v); }}>{showOld ? t('收起讲解','Hide explanation') : t('看看之前的讲解','Show earlier explanation')}</button></div>
        {recall.hint && <div className="cram-card">{prose(recall.hint)}</div>}{showOld && <div className="cram-card">{g.lectures.find(l => l.materialId === recall.materialId)?.explanation?.sections.map((section,i) => <section key={i}>{prose(section.text, g.lectures.find(l => l.materialId === recall.materialId)?.explanation?.terms)}{section.visual && visual(section.visual, g.lectures.find(l => l.materialId === recall.materialId)?.explanation?.terms)}</section>)}{g.plan.filter(p => p.materialId === recall.materialId && p.status === 'done' && p.lesson).map(p => <section key={p.id}><h3>{p.title}</h3>{prose(p.lesson!, p.terms)}{p.visual && visual(p.visual, p.terms)}</section>)}</div>}
        <p className="cram-muted">{recall.assisted ? t('这次使用过提示或参考；仍然会保留这次复述。','This retelling used a hint or reference; it will still be saved.') : t('先不翻资料。没有提到的内容只记为尚未确认。','Try without references first. Omitted material is unverified, not automatically wrong.')}</p>
        {recall.feedback && <section className="cram-card sprint-feedback">{prose(recall.feedback.guidance)}{(['clear','corrections','unmentioned'] as const).map((key,i) => recall.feedback![key].length > 0 && <div key={key}><h3>{[t('已经讲清楚','Explained clearly'),t('需要修正的关系','Relations to correct'),t('尚未提到，不代表不会','Not mentioned; still unverified')][i]}</h3>{recall.feedback![key].map((v,j) => <div key={j}>{prose(v)}</div>)}</div>)}<button disabled={busy || recall.disputed} onClick={() => patchRecall(recall.id,{disputed:true})}>{recall.disputed ? t('反馈已标记待核实','Feedback flagged for review') : t('这条反馈有问题','Flag this feedback')}</button></section>}
        <div className="cram-actions"><button disabled={busy || !recall.feedback} className="review-primary" onClick={() => finishRecall(recall)}>{t('这次回想到这里，继续','Finish this retelling and continue')}<ArrowRight size={17}/></button><button disabled={busy} onClick={() => finishRecall(recall,true)}>{t('先跳过，保留草稿','Skip for now, keep draft')}</button></div>
      </>}
      {item && <><div className="sprint-lecture-heading"><span className="review-eyebrow">{t('补充细节','GO DEEPER')} · {t('约','~')}{item.minutes} {t('分钟','min')}</span><h2>{item.title}</h2><p>{item.reason}</p><p>{t('这次讲到：','This time: ')}{item.depth}</p></div>{item.lesson ? <><section className="sprint-section">{termsControl(item)}{prose(item.lesson, item.terms)}{item.visual && visual(item.visual, item.terms)}{pages(item.materialId,s.topics.filter(t => item.topicIds.includes(t.id)).flatMap(t => t.pages))}{chatRows(item)}</section>{composer(item)}<div className="cram-actions"><button className="review-primary" disabled={busy} onClick={() => finishDetail(item)}>{t('这一块读完了，继续安排','I’ve read this — continue')}<ArrowRight size={17}/></button></div><p className="cram-muted">{t('记录为已补充，之后仍可隔开回想。','Recorded as supplemented; it can be recalled again after a gap.')}</p></> : <button className="review-primary" disabled={busy} onClick={() => startItem(item)}>{t('继续准备这一块','Prepare / retry this step')}</button>}</>}
      <div ref={bottom}/>
    </div>}
    {tab === 'scope' && <>
      <div className="review-intro"><h2>{t('完整范围，放在这里。','Your full scope, when you need it.')}</h2><p>{t('主线按整份讲义讲解；知识点清单用来安排深入学习和核对遗漏。取消勾选只影响后续深入安排。','The first pass follows each full lecture. Objectives guide deeper learning and coverage checks. Unchecking affects future supplements only.')}</p><button disabled={busy} onClick={() => void readSources()}>{t('读取／继续整理知识点','Read / resume objective extraction')}</button></div>
      <input aria-label={t('搜索知识点','Search objectives')} placeholder={t('找一个知识点…','Find an objective…')} value={search} onChange={e => setSearch(e.target.value)}/>
      {g.lectures.map(l => { const src = s.sources.find(x => x.material.id === l.materialId)!; const topics = s.topics.filter(t => t.materialId === l.materialId && t.title.toLowerCase().includes(search.toLowerCase())); return <details className="cram-card" key={l.materialId} open={search ? true : undefined}><summary><strong>{name(l.materialId)}</strong> · {topics.length} {t('个知识点','objectives')}</summary><Milestones session={s} lecture={l}/><div className="cram-actions"><button disabled={busy} onClick={() => void prepareLecture(l.materialId)}>{l.explanation ? t('回看主线讲解','Read main thread') : t('开始这一讲','Start lecture')}</button>{l.readAt && <button disabled={busy} onClick={() => startRecall(l.materialId,due.some(d => d.materialId === l.materialId) ? 'delayed' : 'immediate')}>{t('自己回想这一讲','Retell this lecture')}</button>}</div>
        <p>{t('文字页已处理','Text pages processed')} {src.processedPages.length}/{src.pages.filter(p => p.trim().length >= 30).length}</p>{src.readError && <p role="alert">{src.readError}</p>}{nextSourcePagesSafe(src) && <button disabled={busy} onClick={() => extract(l.materialId)}>{t('继续整理剩余知识点','Continue remaining objectives')}</button>}
        <details><summary>{t('提取范围与待核实内容','Extraction coverage and limitations')}</summary><p>{t('文字提取不足的页：','Pages with insufficient text: ')}{src.pages.flatMap((p,i) => p.trim().length < 30 ? [i+1] : []).join(', ') || '—'}</p>{src.extractionNotes.map((note,i) => <p key={i}>{note}</p>)}<p>{t('主线讲解会读取完整 PDF。知识点提取使用文字，图表或扫描页可能需要对照原文补充。','The overview reads the full PDF. Objective extraction uses text; figures and scans may need manual additions.')}</p></details>
        {topics.map(topic => <div className="cram-topic" key={topic.id}><label className="cram-check"><input type="checkbox" disabled={busy} checked={topic.included} onChange={e => commit(s => ({ ...s,topics:s.topics.map(t => t.id === topic.id ? { ...t,included:e.target.checked } : t) }))}/><strong>{topic.title}</strong></label><p>{g.plan.some(p => p.kind === 'detail' && p.status === 'done' && p.topicIds.includes(topic.id)) ? t('已补充细节','Supplement read') : t('尚未单独展开（可能已在主线提到）','Not expanded separately (may appear in the main thread)')}</p>{pages(l.materialId,topic.pages)}<details><summary>{t('要点与我的疑问','Notes and my questions')}</summary>{prose(topic.summary)}<label>{t('我的疑问／希望深入的地方','My question / what to deepen')}<textarea disabled={busy} rows={2} maxLength={3000} value={topic.note === 'deferred-by-user' ? '' : topic.note} onChange={e => commit(s => ({ ...s,topics:s.topics.map(t => t.id === topic.id ? { ...t,note:e.target.value } : t) }))}/></label><label>{t('老师要求等明确依据（可选）','Explicit priority evidence (optional)')}<input disabled={busy} maxLength={1000} value={topic.priorityNote} onChange={e => commit(s => ({ ...s,topics:s.topics.map(t => t.id === topic.id ? { ...t,priorityNote:e.target.value } : t) }))}/></label></details></div>)}<AddSprintTopic materialId={l.materialId} maxPage={src.pages.length} disabled={busy} onAdd={topic => commit(s => ({ ...s,topics:[...s.topics,topic] }))}/>
      </details>; })}
      <section className="cram-card"><h3>{t('后续安排与已完成的补充','Next steps and completed supplements')}</h3>{g.plan.map(i => <div key={i.id} className="sprint-plan-row"><h3>{i.title}</h3><p>{i.reason} · {i.depth}</p><p>{i.status === 'done' ? t('已完成本轮','Completed this round') : i.status === 'deferred' ? t('已暂缓','Deferred') : i.status === 'replaced' ? t('先前安排（内容保留）','Earlier plan (content retained)') : t('待继续','Upcoming')}</p><div className="cram-actions">{i.status === 'pending' && <button disabled={busy || stale || (remaining !== undefined && i.minutes > remaining)} onClick={() => startItem(i)}>{t('从这里继续','Continue here')}</button>}{i.lesson && <button disabled={busy} onClick={() => { update(g => ({ ...g,active:{kind:'detail',id:i.id} }));setTab('study'); }}>{t('回看已有讲解','Read saved explanation')}</button>}{i.status === 'deferred' && <button disabled={busy} onClick={() => patchItem(i.id,{status:'pending'})}>{t('恢复到待学安排','Restore to upcoming')}</button>}</div></div>)}{!g.plan.length && <p>{t('第一轮结束后，根据实际学习情况生成。','Generated after the first pass from your actual learning.')}</p>}</section>
    </>}
    {tab === 'recap' && <>
      <div className="review-intro"><h2>{t('随时收尾，也可以继续。','Wrap up anytime, or keep going.')}</h2><p>{t('把主线、已补充的内容、疑问与尚未展开的部分放在一起。阅读记录不等于掌握。','Main threads, supplements, questions and unfinished material together. Reading is not a mastery judgment.')}</p><button onClick={() => exportRecap(s,language === 'en')}>{t('导出考前回顾','Export recap')}</button></div>
      {g.lectures.map(l => <section className="cram-card" key={l.materialId}><h2>{l.outline?.title || name(l.materialId)}</h2><small>{name(l.materialId)}</small><Milestones session={s} lecture={l}/>{l.outline ? <>{prose(l.outline.overview, l.explanation?.terms)}<details><summary>{t('关键关系、术语与必要条件','Key relations, terminology and qualifications')}</summary>{l.outline.points.map(p => <div key={p.id}><h3>{p.idea}</h3>{prose(p.explanation, l.explanation?.terms)}{p.caveat && prose(p.caveat, l.explanation?.terms)}{pages(l.materialId,p.pages)}</div>)}</details></> : <p>{t('主线尚未准备。','Main thread not prepared yet.')}</p>}
        {g.plan.filter(p => p.materialId === l.materialId && p.kind === 'detail' && p.status === 'done').map(p => <details key={p.id}><summary>{t('已补充：','Supplement: ')}{p.title}</summary>{p.lesson && prose(p.lesson, p.terms)}</details>)}
        <details><summary>{t('复述与隔开回想记录','Retellings and delayed recalls')}</summary>{g.recalls.filter(r => r.materialId === l.materialId).map(r => <article className="sprint-plan-row" key={r.id}><p>{r.kind === 'delayed' ? t('隔开回想','Delayed recall') : t('当场复述','Immediate retelling')} · {new Date(r.startedAt).toLocaleString()} · {r.skipped ? t('跳过，保留草稿','Skipped; draft saved') : r.finishedAt ? t('已完成本轮','Completed this round') : t('待继续','In progress')}{r.assisted ? ` · ${t('使用过帮助','Assisted')}` : ''}</p>{r.draft && <p className="sprint-user-message">{r.draft}</p>}{(!r.finishedAt || r.skipped) && <button disabled={busy} onClick={() => { update(g => ({ ...g,active:{kind:'recall',id:r.id},recalls:g.recalls.map(x => x.id === r.id ? { ...x,finishedAt:undefined,skipped:false,assisted:x.submittedAt ? x.assisted : true } : x) }));setShowOld(false);setTab('study'); }}>{t('继续这次复述','Resume this retelling')}</button>}{r.feedback && <>{prose(r.feedback.guidance)}{r.feedback.corrections.map((v,i) => <div key={i}>{prose(v)}</div>)}{r.feedback.unmentioned.map((v,i) => <p key={i}>{t('尚未确认：','Unverified: ')}{v}</p>)}</>}{r.disputed && <p>{t('反馈待核实','Feedback disputed')}</p>}</article>)}</details>
        <details><summary>{t('疑问与尚未单独展开的内容','Questions and material not yet expanded')}</summary>{s.topics.filter(t => t.materialId === l.materialId && (t.note || !g.plan.some(p => p.status === 'done' && p.kind === 'detail' && p.topicIds.includes(t.id)))).map(topic => <div key={topic.id}><h3>{topic.title}{!topic.included ? ` · ${t('已排除深入安排','Excluded from supplements')}` : ''}</h3>{topic.note && <p>{topic.note}</p>}{pages(l.materialId,topic.pages)}</div>)}{l.chats.filter(c => !c.answer).map(c => <p key={c.id}>{t('尚未回答：','Unanswered: ')}{c.question}</p>)}</details>
      </section>)}
      {(s.attempts.length > 0 || !!s.active || !!s.archivedWork?.length) && <details className="cram-card"><summary>{t('原版冲刺的作答记录（保留）','Earlier sprint answers (preserved)')}</summary>{s.attempts.map(a => <article key={a.id}><h3>{a.question.prompt}</h3><p>{a.answer}</p>{a.feedback && prose(a.feedback.feedback)}</article>)}{s.active?.draft && <p>{s.active.draft}</p>}{s.archivedWork?.map((a,i) => a.draft && <p key={i}>{a.draft}</p>)}</details>}
    </>}
  </div>;
}

function nextSourcePagesSafe(source: CramSession['sources'][number]): boolean {
  // Oversized pages remain visible as pending; the extraction action explains the limit.
  try { return nextSourcePages(source).length > 0; } catch { return true; }
}
function Milestones({ session:s,lecture:l }: { session:CramSession; lecture:SprintLecture }) {
  const { text:t } = useAppLanguage(); const g = sprintState(s);
  const immediate = g.recalls.some(r => r.materialId === l.materialId && r.kind === 'immediate' && r.finishedAt && !r.skipped);
  const delayed = g.recalls.some(r => r.materialId === l.materialId && r.kind === 'delayed' && r.finishedAt && !r.skipped);
  return <div className="sprint-milestones">{[[t('主线已读','Main thread read'),!!l.readAt],[t('当场复述','Immediate retelling'),immediate],[t('隔开回想','Delayed recall'),delayed],[t('补充细节','Supplement read'),g.plan.some(p => p.materialId === l.materialId && p.kind === 'detail' && p.status === 'done')]].map(([label,done]) => <span key={String(label)} className={done ? 'is-done' : ''}>{done ? '✓ ' : '○ '}{label}</span>)}</div>;
}
function AddSprintTopic({ materialId,maxPage,disabled,onAdd }: { materialId:string; maxPage:number; disabled:boolean; onAdd:(topic:CramTopic) => void }) {
  const { text:t } = useAppLanguage(); const [title,setTitle] = useState(''); const [page,setPage] = useState(''); const [summary,setSummary] = useState('');
  const p = Number(page); const valid = title.trim() && summary.trim() && Number.isInteger(p) && p > 0 && p <= maxPage;
  return <details><summary>{t('补充遗漏的知识点','Add an omitted objective')}</summary><label>{t('知识点','Objective')}<input disabled={disabled} value={title} maxLength={300} onChange={e => setTitle(e.target.value)}/></label><label>{t('原文中的意思','What the source says')}<textarea disabled={disabled} value={summary} maxLength={3000} onChange={e => setSummary(e.target.value)}/></label><label>{t('PDF 页码','PDF page')}<input disabled={disabled} type="number" min={1} max={maxPage} value={page} onChange={e => setPage(e.target.value)}/></label><button disabled={disabled || !valid} onClick={() => { onAdd({ id:cramId(),materialId,title:title.trim(),summary:summary.trim(),pages:[p],quote:'',origin:'manual',included:true,familiarity:'unknown',group:'quick',status:'unchecked',priorityNote:'',note:'',order:0,attempts:0,independentPasses:0 });setTitle('');setPage('');setSummary(''); }}>{t('加入范围','Add to scope')}</button></details>;
}
function exportRecap(s:CramSession, en:boolean) {
  const g = sprintState(s);
  const lines = [`# ${s.title || (en ? 'Exam sprint recap' : '考前回顾')}`];
  for (const l of g.lectures) {
    lines.push(`\n## ${s.sources.find(x => x.material.id === l.materialId)?.material.fileName}`,l.outline?.overview || (en ? 'Main thread not prepared.' : '主线尚未准备。'));
    l.outline?.points.forEach(p => lines.push(`### ${p.idea}`,p.explanation,p.caveat,`PDF: ${p.pages.join(', ')}`));
    g.plan.filter(p => p.materialId === l.materialId && p.status === 'done' && p.lesson).forEach(p => lines.push(`### ${p.title}`,p.lesson!));
    g.recalls.filter(r => r.materialId === l.materialId).forEach(r => lines.push(`### ${en ? 'Retelling' : '复述'} (${r.kind})`,r.draft,r.feedback?.guidance || '',...(r.feedback?.corrections || []),...(r.feedback?.unmentioned || []).map(v => `${en ? 'Unverified' : '尚未确认'}: ${v}`)));
    lines.push(`### ${en ? 'Questions / not expanded separately' : '疑问／尚未单独展开'}`);
    s.topics.filter(t => t.materialId === l.materialId && (t.note || !g.plan.some(p => p.status === 'done' && p.kind === 'detail' && p.topicIds.includes(t.id)))).forEach(t => lines.push(`- ${t.title} (PDF ${t.pages.join(', ')}) ${t.note}`));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\n\n')],{type:'text/markdown;charset=utf-8'})); const a = document.createElement('a');a.href=url;a.download='exam-sprint-recap.md';a.click();URL.revokeObjectURL(url);
}
