import { ExplanationText } from '@/shared/i18n/ExplanationMarkdown';
import React, { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Clock3, Plus } from 'lucide-react';
import ReactMarkdown from '@/shared/i18n/ExplanationMarkdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { cramId, eligibleRecheck, topicQueue, type CramSession, type CramSource, type CramTopic, type Familiarity } from './cramState';
const Prose = ({ children }: { children: string }) => <div className="cram-prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown></div>;
const useLabels = () => {
  const { text: t } = useAppLanguage();
  return { t, status: (topic: CramTopic) => ({ unchecked: t('未检查', 'Unchecked'), explained: t('已讲解', 'Explained'), immediate: t('当场独立答对', 'Answered independently'), revisit: t('待复查', 'Revisit needed'), checked: t('隔开后检查通过', 'Delayed check passed'), unclear: t('仍有疑问', 'Still unclear') })[topic.status],
    group: (group: CramTopic['group']) => ({ focus: t('重点补习', 'Focus'), quick: t('快速检查', 'Quick check'), deferred: t('暂缓处理', 'Deferred') })[group] };
};
const sourceName = (s: CramSession, topic: CramTopic) => s.sources.find(x => x.material.id === topic.materialId)?.material.fileName || '';
function SourceButton({ session, topic, onSource }: { session: CramSession; topic: CramTopic; onSource: (t: CramTopic, page?: number) => void }) {
  const { text: t } = useAppLanguage();
  return <div className="cram-source-links"><span>{sourceName(session, topic)}</span>{topic.pages.map(page => <button key={page} onClick={() => onSource(topic, page)}><BookOpen size={13} />{t('第', 'p. ')} {page} {t('页', '')}</button>)}{!topic.pages.length && <span>{t('缺少有效原文页码，请补充。', 'Source pages are missing. Please add them.')}</span>}</div>;
}
function reason(s: CramSession, topic: CramTopic, t: (zh: string, en: string) => string) {
  if (topic.group === 'deferred') return t('由你暂缓，仍保留在未完成范围中。', 'Deferred by you; still part of the unfinished scope.');
  if (eligibleRecheck(s, topic)) return t('已经隔开其他内容或到了回看时间，现在检查能否独立回答。', 'Other work or time has intervened. Check independent recall now.');
  const recent = s.attempts.filter(a => a.topicId === topic.id && a.feedback && !a.evaluationDisputed).slice(-2);
  if (recent.length === 2 && recent.every(a => a.feedback?.verdict === 'incorrect')) return t('最近两次仍有较大缺口。可以先补基础、换个例子，或暂缓；不会自动删除这个主题。', 'The last two answers still had major gaps. Try prerequisites, another example, or defer; this objective is not removed automatically.');
  if (topic.priorityNote) return t('你标记的优先依据：', 'Your priority evidence: ') + topic.priorityNote;
  if (topic.status === 'revisit' || topic.status === 'unclear') return topic.note || t('上次回答有缺口，需要补讲或重新检查。', 'The last answer showed a gap. Explain or recheck.');
  if (topic.familiarity === 'new') return t('你标记为没学过，先从基础开始。', 'Marked as new; begin with the basics.');
  return t('尚未充分检查，先了解你能独立回答多少。', 'Not yet sufficiently checked; establish what you can answer unaided.');
}

export function CramSettings({ session: s, onChange }: { session: CramSession; onChange: (patch: Partial<CramSession>) => void }) {
  const { t } = useLabels();
  return <section className="cram-card"><h2>{t('这次考试与可用时间', 'Exam and available time')}</h2><p>{t('可以随时补充。考试日期不等于实际学习时间。', 'Update anytime. Time until the exam is not the same as study time.')}</p>
    <div className="cram-form-grid"><label>{t('冲刺名称', 'Sprint name')}<input value={s.title} placeholder={t('例如：心理学期中', 'e.g. Psychology midterm')} onChange={e => onChange({ title: e.target.value })} maxLength={150} /></label>
      <label>{t('考试时间（可以不确定）', 'Exam time (may be unknown)')}<input type="datetime-local" value={s.examAt} onChange={e => onChange({ examAt: e.target.value })} /></label>
      <label>{t('本次计划学习分钟数（可选）', 'Planned study minutes (optional)')}<input type="number" min={1} max={1440} value={s.minutes} placeholder={t('不确定', 'Not sure')} onChange={e => onChange({ minutes: e.target.value })} /></label>
      <label>{t('考试题型', 'Exam format')}<select value={s.format} onChange={e => onChange({ format: e.target.value as CramSession['format'] })}><option value="mixed">{t('不确定', 'Not sure')}</option><option value="choice">{t('选择题', 'Multiple choice')}</option><option value="short">{t('简答题', 'Short answer')}</option><option value="application">{t('应用与推理', 'Application & reasoning')}</option></select></label>
    </div><label>{t('老师要求、样题或往年题摘录（可选）', 'Teacher requirements or sample/past questions (optional)')}<textarea rows={5} value={s.requirements} maxLength={6000} onChange={e => onChange({ requirements: e.target.value })} placeholder={t('没有就留空。有的话填写原话或来源，AI 会据此调整后续内容和深度。', 'Leave blank if unavailable. Add wording or sources to help AI adjust subsequent content and depth.')} /></label>
    <p className="cram-muted">{t('修改后会重新评估后续的补充与回想安排，已完成的学习记录保留。不会自动删除其他内容。', 'Changes trigger reassessment of upcoming supplements and recall while retaining completed work. Other material is not silently removed.')}</p>
    <details><summary>{t('方法依据与安排说明', 'Research principles & scheduling')}</summary><p>{t('先建立主线，再用自己的话复述。学过其他讲或几块细节后回来回想；只有一讲时，也会在隔开一段时间后提供回想入口。有更多时间可在之后再回来。具体内容、深度和回访安排随学习情况调整，间隔是产品安排，不是研究给出的最优数字。', 'Establish the main thread, then retell it. Return after other lectures, supplements or elapsed time. With more time, revisit later. Content, depth and revisits adapt to learning; intervals are product defaults, not experimentally optimal values.')}</p><ul><li><a href="https://onlinelibrary.wiley.com/doi/10.1111/cogs.13136" target="_blank" rel="noreferrer">Schuetze & Yan (2022)</a></li><li><a href="https://sites.williams.edu/nk2/files/2011/08/Metcalfe.Kornell.2003.pdf" target="_blank" rel="noreferrer">Metcalfe & Kornell (2003)</a></li><li><a href="https://learninglab.psych.purdue.edu/downloads/2006/2006_Roediger_Karpicke_PsychSci.pdf" target="_blank" rel="noreferrer">Roediger & Karpicke (2006)</a></li><li><a href="https://sites.williams.edu/nk2/files/2011/08/Kornell.2009b.pdf" target="_blank" rel="noreferrer">Kornell (2009)</a></li></ul></details>
    <details><summary>{t('本次 AI 请求记录', 'AI request log')} ({s.requests.length})</summary>{s.requests.map((r, i) => <p key={i}>{new Date(r.at).toLocaleString()} · {r.kind} · {r.outcome} · {r.inputTokens === undefined ? t('用量未知', 'Usage unknown') : `${r.inputTokens} input / ${r.outputTokens ?? '?'} output tokens`}</p>)}<p>{t('请求失败或取消不代表免费。费用取决于服务端实际用量。', 'Failed or cancelled requests are not necessarily free. Billing depends on actual provider usage.')}</p></details>
  </section>;
}

export function CramScope({ session: s, busy, onPatch, onRead, onExtract, onSettings, onStart, onSource, onAdd, onSessionPatch }: {
  session: CramSession; onSessionPatch: (patch: Partial<CramSession>) => void; busy: boolean; onPatch: (id: string, p: Partial<CramTopic>) => void; onRead: () => void;
  onExtract: (id: string) => void; onSettings: () => void; onStart: (diagnostic: boolean) => void;
  onSource: (topic: CramTopic, page?: number) => void; onAdd: (t: CramTopic) => void;
}) {
  const { t, status } = useLabels();
  const [addSource, setAddSource] = useState(s.sources[0]?.material.id || '');
  const [title, setTitle] = useState(''); const [page, setPage] = useState('');
  const [search, setSearch] = useState('');
  const active = s.topics.filter(x => x.included);
  const usable = active.some(topic => topic.pages.length && s.sources.find(x => x.material.id === topic.materialId)?.pages.length);
  const add = () => {
    const source = s.sources.find(x => x.material.id === addSource); const p = Number(page);
    if (!title.trim() || !source || !Number.isInteger(p) || p < 1 || p > source.pages.length) return;
    onAdd({ id: cramId(), title: title.trim(), summary: title.trim(), materialId: addSource, pages: [p], quote: '', origin: 'manual', included: true,
      familiarity: 'unknown', group: 'quick', status: 'unchecked', priorityNote: '', note: '', order: s.topics.length, attempts: 0, independentPasses: 0 });
    setTitle(''); setPage('');
  };
  return <>
    <div className="review-intro"><span className="review-eyebrow">01 · SCOPE</span><h2>{t('先看清要复习的范围。', 'Make the scope visible first.')}</h2><p>{t('点击一次整理全部资料。按实际文字量分批，尽量沿章节划分；每批保存后自动继续，可随时取消。中断后接着处理未完成的页，不自动重试失败请求。', 'One click processes all materials. Batches follow text volume and chapter boundaries where possible, save progress, then continue automatically. Cancel anytime and resume unfinished pages later. Failed requests are not retried automatically.')}</p><p className="cram-muted">{t('较长资料可能产生多次 AI 请求；不会重做已保存的批次。每轮最长 20 分钟，到时保留进度。', 'Long sources may require multiple AI requests. Saved batches are reused. Each run lasts at most 20 minutes and retains progress.')}</p><div className="cram-actions"><button disabled={busy} onClick={onRead} className="review-primary">{t('读取并整理知识点', 'Read and extract objectives')}</button><button onClick={onSettings}>{t('填写考试时间与要求', 'Set exam time and requirements')}</button></div></div>
    <div className="cram-card"><label>{t('什么时候考试？（不确定可以留空）', 'When is the exam? (leave blank if unsure)')}<input type="datetime-local" value={s.examAt} onChange={e => onSessionPatch({ examAt: e.target.value })} disabled={busy} /></label><p className="cram-muted">{t('可用时间、题型和老师要求可以稍后补充。', 'Available time, question format and teacher requirements can be added later.')}</p></div>
    {s.sources.map(source => {
      const textPages = source.pages.map((p, i) => p.trim().length >= 30 ? i + 1 : 0).filter(Boolean);
      const empty = source.pages.map((p, i) => p.trim().length < 30 ? i + 1 : 0).filter(Boolean);
      const missing = textPages.filter(p => !source.processedPages.includes(p));
      const topics = s.topics.filter(t => t.materialId === source.material.id);
      return <section key={source.material.id} className="cram-card cram-source"><h3>{source.material.fileName}</h3><p>{t('已读取页数', 'Pages read')}: {source.pages.length} · {t('已处理文字页数', 'Text pages processed')}: {source.processedPages.length} · {t('知识点', 'Objectives')}: {topics.length}</p>
        {source.readError && <p role="alert" className="review-notice">{source.readError}</p>}
        {!!source.extractionNotes.length && <p className="review-notice">{t('整理中有待核实或可能遗漏的内容，请展开下方缺口详情。已核实的知识点已保留。', 'Some extracted content needs verification or may be missing. Open the gaps below; verified objectives are retained.')}</p>}
        {topics.some(t => t.origin === 'cached') && <p>{t('已复用旧清单和已有处理进度；没有页码处理记录的内容仍需整理。以前的掌握判断不会导入。', 'Existing objectives and page checkpoints are reused. Pages without processing records still need extraction. Earlier mastery judgments are not imported.')}</p>}
        {empty.length > 0 && <p className="review-notice">{t('文字不足的页，图表与扫描内容尚未核实', 'Insufficient-text pages; figures/scans are unverified')}: {empty.join(', ')}</p>}
        <details><summary>{t('查看处理页码与缺口', 'Processed pages and gaps')}</summary><p>{t('已提交', 'Submitted')}: {source.processedPages.join(', ') || '—'}</p><p>{t('尚未提交', 'Not submitted')}: {missing.join(', ') || '—'}</p><p>{t('已提交只代表整理过这些文字，不代表没有遗漏。请对照原文检查。', 'Submitted means the text was processed, not that every objective was found. Check the source.')}</p>{source.extractionNotes.map((n, i) => <p key={i}>{n.includes('item-limit') ? t('这批输出达到条目上限，可能遗漏；请对照原文补充知识点。', 'This batch hit its item limit; compare the source and add omitted objectives.') : n}</p>)}</details>
        {source.pages.length > 0 && <><p>{missing.length ? `${t('待整理文字页', 'Text pages remaining')}: ${missing.length}` : t('全部可提取文字页已处理。仍请核对图表和缺口提示。', 'All extractable text pages processed. Check figures and reported gaps.')} · {t('待核实文字不足页', 'Insufficient-text pages to verify')}: {empty.length}</p><progress aria-label={t('文字页处理进度', 'Text-page processing progress')} value={textPages.length - missing.length} max={textPages.length || 1} /><button disabled={busy || !missing.length} onClick={() => onExtract(source.material.id)}>{t('继续整理全部剩余内容', 'Process all remaining content')}</button></>}
      </section>;
    })}
    <div className="cram-card"><h3>{t('核对主题与起点', 'Check objectives and starting points')}</h3><p>{t('取消不考的内容；“觉得会”仍需要检查。“暂缓”不等于已经学会。', 'Exclude out-of-scope content. “Confident” still needs a check; deferred is not learned.')}</p><input aria-label={t('搜索知识点', 'Search objectives')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('查找一个知识点', 'Find an objective')} />
      <div className="cram-topic-list">{s.topics.filter(x => x.title.toLowerCase().includes(search.toLowerCase())).map(topic => <article className={`cram-topic ${!topic.included ? 'is-excluded' : ''}`} key={topic.id}>
        <label className="cram-check"><input type="checkbox" checked={topic.included} disabled={busy} onChange={e => onPatch(topic.id, { included: e.target.checked })} /><strong><ExplanationText>{topic.title}</ExplanationText></strong></label><SourceButton session={s} topic={topic} onSource={onSource} /><p className="cram-muted">{status(topic)}</p>
        <div className="cram-actions">{(['new', 'familiar', 'confident'] as Familiarity[]).map((f, i) => <button key={f} disabled={busy} aria-pressed={topic.familiarity === f} onClick={() => onPatch(topic.id, { familiarity: f, group: f === 'new' ? 'focus' : 'quick' })}>{[t('没学过', 'New to me'), t('有印象', 'Some familiarity'), t('觉得会', 'Feel confident')][i]}</button>)}<button disabled={busy} aria-pressed={topic.group === 'deferred'} onClick={() => onPatch(topic.id, { group: topic.group === 'deferred' ? 'quick' : 'deferred' })}>{t('暂缓', 'Defer')}</button></div>
        <details><summary>{t('优先依据、原文页码与备注', 'Priority evidence, source pages & notes')}</summary><label>{t('明确的优先依据（老师原话、样题对应或必要基础）', 'Priority evidence (teacher wording, sample question, prerequisite)')}<input maxLength={1000} value={topic.priorityNote} onChange={e => onPatch(topic.id, { priorityNote: e.target.value })} /></label>
          <PageEditor topic={topic} max={s.sources.find(x => x.material.id === topic.materialId)?.pages.length || 0} onSave={pages => onPatch(topic.id, { pages })} />
          <label>{t('我的疑问或缺口', 'My question or gap')}<textarea value={topic.note === 'deferred-by-user' ? '' : topic.note} maxLength={3000} onChange={e => onPatch(topic.id, { note: e.target.value })} /></label><p><ExplanationText>{topic.summary}</ExplanationText></p>{topic.quote && <blockquote>{topic.quote}</blockquote>}
        </details>
      </article>)}</div>
      {!s.topics.length && <p className="review-empty">{t('点击“读取并整理知识点”，读完后会接着整理。', 'Choose “Read and extract objectives” to read and organize sources in one step.')}</p>}
      <details><summary><Plus size={14} />{t('补充遗漏的知识点', 'Add an omitted objective')}</summary><label>{t('来源', 'Source')}<select value={addSource} onChange={e => setAddSource(e.target.value)}>{s.sources.map(x => <option key={x.material.id} value={x.material.id}>{x.material.fileName}</option>)}</select></label><label>{t('知识点标题', 'Objective title')}<input value={title} maxLength={300} onChange={e => setTitle(e.target.value)} /></label><label>{t('原 PDF 页码', 'Physical PDF page')}<input type="number" min={1} max={s.sources.find(x => x.material.id === addSource)?.pages.length || 1} value={page} onChange={e => setPage(e.target.value)} /></label><button onClick={add} disabled={busy || !title.trim() || !Number.isInteger(Number(page)) || Number(page) < 1 || Number(page) > (s.sources.find(x => x.material.id === addSource)?.pages.length || 0)}>{t('加入清单', 'Add to list')}</button></details>
    </div>
    <div className="cram-sticky-actions"><span>{active.length} {t('个知识点在范围内', 'objectives in scope')}</span><button disabled={busy || !usable} onClick={() => onStart(true)}>{t('先做简短摸底（最多三个主题）', 'Short diagnosis (up to three objectives)')}</button><button className="review-primary" disabled={busy || !usable} onClick={() => onStart(false)}>{t('直接进入复习队列', 'Go straight to the queue')}<ArrowRight size={16} /></button></div>
  </>;
}
function PageEditor({ topic, max, onSave }: { topic: CramTopic; max: number; onSave: (p: number[]) => void }) {
  const { t } = useLabels(); const [draft, setDraft] = useState(topic.pages.join(', '));
  const pages = draft.split(/[,，\s]+/).filter(Boolean).map(Number);
  const valid = pages.length > 0 && pages.every(p => Number.isInteger(p) && p > 0 && p <= max);
  return <label>{t('原文页码（逗号分隔，仅限这个知识点）', 'Source pages (comma-separated, only for this objective)')}<input value={draft} onChange={e => setDraft(e.target.value)} /><button disabled={!valid} onClick={() => onSave([...new Set(pages)].sort((a,b) => a-b))}>{t('保存页码', 'Save pages')}</button></label>;
}

export function CramQueue({ session: s, busy, onPatch, onEnter, onResume, onScope, onWrapUp, onReorder, onAuto }: {
  session: CramSession; busy: boolean; onPatch: (id: string, p: Partial<CramTopic>) => void;
  onEnter: (id: string) => void; onResume: () => void; onScope: () => void; onWrapUp: () => void;
  onReorder: (id: string, direction: number) => void; onAuto: () => void;
}) {
  const { t, status, group } = useLabels(); const queue = topicQueue(s);
  const included = s.topics.filter(t => t.included);
  const unchecked = included.filter(t => t.attempts === 0);
  const checked = included.filter(t => t.status === 'checked');
  return <>
    <div className="review-intro"><span className="review-eyebrow">02 · QUEUE</span><h2>{s.wrapUp ? t('收尾复习：回看已学内容与缺口。', 'Final review: revisit learned material and gaps.') : t('接下来，先处理这一小块。', 'Next, work on one small objective.')}</h2><p>{t('排序会随作答变化。优先依据来自你提供的信息与实际表现，不代表命题预测。', 'Order adapts to your answers and supplied priorities, not predicted exam questions.')}</p>
      <div className="cram-stats"><span>{included.length} {t('范围内', 'in scope')}</span><span>{unchecked.length} {t('尚未检查', 'unchecked')}</span><span>{checked.length} {t('隔开后通过', 'delayed checks passed')}</span></div>
      <div className="cram-actions">{s.active && <button disabled={busy} onClick={onResume}>{t('继续刚才的学习／草稿', 'Resume current work / draft')}</button>}<button onClick={onScope}>{t('查看未覆盖范围', 'See uncovered scope')}</button><button onClick={onWrapUp}>{s.wrapUp ? t('恢复学习新内容', 'Include new material again') : t('切换到收尾复习', 'Switch to final review')}</button><button onClick={onAuto}>{t('恢复自动排序', 'Restore adaptive order')}</button></div>
    </div>
    <CramTime session={s} />
    {queue[0] && <div className="cram-card cram-recommended"><span className="review-eyebrow">{t('建议下一项', 'RECOMMENDED NEXT')}</span><h3><ExplanationText>{queue[0].title}</ExplanationText></h3><p>{reason(s, queue[0], t)}</p><button className="review-primary" disabled={busy || !!s.active} onClick={() => onEnter(queue[0].id)}>{t('开始这一项', 'Start this objective')}<ArrowRight size={16} /></button></div>}
    {!queue.length && <div className="cram-card"><h3>{t('目前没有需要立即开始的项目。', 'No item needs an immediate start.')}</h3><p>{t('可以查看考前清单、恢复暂缓内容，或稍后回来复查。这不表示整个考试范围已经掌握。', 'Open the checklist, restore deferred items, or return for a recheck. This does not mean the exam scope is mastered.')}</p></div>}
    {(['focus', 'quick', 'deferred'] as CramTopic['group'][]).map(g => {
      const items = g === 'deferred' ? included.filter(t => t.group === g) : queue.filter(t => t.group === g);
      return <section className="cram-queue-group" key={g}><h3>{group(g)} · {items.length}</h3>{items.map(topic => <article className="cram-card" key={topic.id}><div className="cram-card-heading"><h3><ExplanationText>{topic.title}</ExplanationText></h3><span className="cram-badge">{status(topic)}</span></div><p>{reason(s, topic, t)}</p><small>{sourceName(s, topic)} · {topic.pages.join(', ')}</small><div className="cram-actions"><button className="review-primary" disabled={busy || !!s.active} onClick={() => onEnter(topic.id)}>{t('从这里开始', 'Start here')}<ArrowRight size={15} /></button>{g !== 'deferred' && <><button aria-label={t('提前', 'Move earlier')} onClick={() => onReorder(topic.id, -1)}><ArrowUp size={15} /></button><button aria-label={t('稍后', 'Move later')} onClick={() => onReorder(topic.id, 1)}><ArrowDown size={15} /></button></>}<select aria-label={t('调整分组', 'Change group')} value={topic.group} onChange={e => onPatch(topic.id, { group: e.target.value as CramTopic['group'] })}>{(['focus', 'quick', 'deferred'] as CramTopic['group'][]).map(x => <option value={x} key={x}>{group(x)}</option>)}</select></div></article>)}</section>;
    })}
    <section className="cram-card"><h3>{t('稍后复查与已检查内容', 'Later rechecks and checked objectives')}</h3>{included.filter(t => ['immediate','checked'].includes(t.status) && !eligibleRecheck(s,t)).map(topic => <p key={topic.id}>{topic.title} · {status(topic)} {topic.dueAt ? `· ${t('回看时间', 'Revisit')} ${new Date(topic.dueAt).toLocaleString()}` : ''}</p>)}<p className="cram-muted">{t('当场答对的项目可在穿插其他知识点后提前回访。', 'An immediate success can be revisited after other objectives intervene.')}</p></section>
  </>;
}

export function CramStudy({ session: s, topic, source, busy, onQuestion, onTeach, onSubmit, onNext, onSource, onDraft, onGuess, onHideLesson, onUnclear, onDispute }: {
  session: CramSession; topic: CramTopic; source: CramSource; busy: boolean;
  onQuestion: () => void; onTeach: (kind?: 'normal' | 'foundation' | 'different') => void; onSubmit: () => void;
  onNext: (defer?: boolean) => void; onSource: (topic: CramTopic, page?: number) => void; onDraft: (v: string) => void;
  onGuess: (guessed: boolean) => void; onHideLesson: () => void; onUnclear: () => void; onDispute: (id: string) => void;
}) {
  const { t, status } = useLabels(); const a = s.active!;
  const attempt = s.attempts.find(x => x.id === a.attemptId);
  const feedback = attempt?.feedback;
  const ready = topic.pages.length > 0 && topic.pages.every(p => source.pages[p - 1]?.trim());
  const nextTopic = topicQueue(s).find(x => x.id !== topic.id);
  return <section className="cram-study">
    <div className="cram-study-heading"><span className="review-eyebrow">{a.kind === 'diagnostic' ? t('简短摸底', 'SHORT DIAGNOSIS') : a.delayed ? t('隔开后复查', 'DELAYED RECHECK') : t('当前学习', 'CURRENT OBJECTIVE')}</span><h2><ExplanationText>{topic.title}</ExplanationText></h2><p>{a.question && !attempt ? t('先独立回答，再查看解析与具体缺口。', 'Answer independently before viewing explanations and gaps.') : reason(s, topic, t)}</p><SourceButton session={s} topic={topic} onSource={onSource} />{!attempt && a.question && <small>{t('查看原文或讲解后，本题记录为借助帮助作答。', 'Opening the source or an explanation marks this answer as assisted.')}</small>}</div>
    {!ready && <div className="review-notice">{t('缺少有效原文。请回到“范围与摸底”读取资料或修正页码，然后再生成。', 'Source evidence is missing. Read the file or correct pages under Scope before generating.')}</div>}
    {a.showLesson && topic.lesson ? <section className="cram-card"><span className="cram-badge">{t('先理解这一点', 'Understand this objective')}</span><Prose>{topic.lesson}</Prose><button disabled={busy} onClick={onHideLesson}>{t('收起讲解，自己试着回答', 'Hide explanation and try answering')}</button></section> : !a.question && <section className="cram-card"><h3>{a.kind === 'learn' ? t('从必要的基础开始', 'Start with the necessary basics') : t('先看看你能独立回答多少', 'Try answering independently')}</h3><p>{a.kind === 'learn' ? t('先理解一个具体目标，再收起讲解进行检查。', 'Understand one objective, then hide the explanation for a check.') : t('不确定也可以说。没学过的内容可以先讲解，不必硬答。', 'Uncertainty is fine. You can request an explanation instead of guessing.')}</p><div className="cram-actions"><button disabled={busy || !ready} className="review-primary" onClick={a.kind === 'learn' && !topic.lesson ? () => onTeach() : onQuestion}>{a.kind === 'learn' && !topic.lesson ? t('先讲解这一点', 'Explain this first') : t('准备一道题', 'Prepare a question')}</button><button disabled={busy || !ready} onClick={() => onTeach()}>{topic.lesson ? t('查看已有讲解', 'Read saved explanation') : t('没学过，先讲解', 'New to this — explain first')}</button></div></section>}
    {a.question && !a.showLesson && <section className="cram-card cram-question"><span className="cram-badge">{t('独立回答', 'YOUR ANSWER')}</span><Prose>{a.question.prompt}</Prose>
      {a.question.options.length > 0 && <div className="cram-options">{a.question.options.map((o,i) => <label className="cram-check" key={i}><input type="radio" name={a.question!.id} disabled={!!attempt || busy} checked={a.draft.startsWith(`${String.fromCharCode(65+i)}. `)} onChange={() => onDraft(`${String.fromCharCode(65+i)}. ${o}\n`)} />{String.fromCharCode(65+i)}. {o}</label>)}</div>}
      <label>{a.question.options.length ? t('选择与理由（可补充）', 'Choice and reasoning (optional)') : t('用自己的话回答', 'Answer in your own words')}<textarea rows={5} maxLength={10000} disabled={!!attempt || busy} value={a.draft} onChange={e => onDraft(e.target.value)} /></label>
      <label className="cram-check"><input type="checkbox" disabled={!!attempt || busy} checked={!!a.guessed} onChange={e => onGuess(e.target.checked)} />{t('这次主要靠猜，我还说不清理由', 'Mostly a guess; I cannot explain it yet')}</label>
      {!feedback && <button className="review-primary" disabled={busy || !a.draft.trim() || !ready} onClick={onSubmit}>{attempt ? t('重新核对已提交回答', 'Retry feedback for saved answer') : t('提交回答', 'Submit answer')}</button>}
      {attempt && !feedback && <p>{t('回答已保存；反馈失败时可以手动重试，不重复记录一次作答。', 'Answer saved. Retry feedback manually without creating a duplicate attempt.')}</p>}
    </section>}
    {feedback && attempt && <section className="cram-card cram-feedback"><span className="cram-badge">{attempt.evaluationDisputed ? t('反馈待核实', 'Feedback disputed') : feedback.verdict === 'correct' ? t('本题回答正确', 'Correct on this question') : feedback.verdict === 'partial' ? t('有部分缺口', 'Some gaps remain') : t('这里需要补一下', 'This needs another look')}</span><Prose>{feedback.feedback}</Prose><details><summary>{t('参考答案与解析', 'Reference answer and explanation')}</summary><Prose>{`${a.question!.answer}\n\n${a.question!.explanation}`}</Prose></details><SourceButton session={s} topic={{ ...topic, pages: [feedback.page] }} onSource={onSource} /><p className="cram-muted">{attempt.guessed ? t('本次主要靠猜，仍需再检查。', 'Marked as a guess; another check is needed.') : attempt.assisted ? t('本次使用过帮助，不计为独立通过。', 'Assistance was used; this is not an independent pass.') : status(topic)}</p><button disabled={busy || attempt.evaluationDisputed} onClick={() => onDispute(attempt.id)}>{t('反馈有问题，标记待核实', 'Dispute feedback')}</button></section>}
    <div className="cram-card"><div className="cram-actions"><button disabled={busy || !ready} onClick={() => onTeach('foundation')}>{t('先补基础', 'Explain prerequisites')}</button><button disabled={busy || !ready} onClick={() => onTeach('different')}>{t('换个例子讲', 'Use another example')}</button>{!a.showLesson && a.question && !feedback && <button disabled={busy || !ready} onClick={() => onTeach()}>{t('给我讲解', 'Explain this')}</button>}{feedback && <button disabled={busy || !ready} onClick={onQuestion}>{t('再试一道不同的题', 'Try a different question')}</button>}</div><div className="cram-actions"><button disabled={busy} onClick={onUnclear}>{t('这里还没懂，记下来', 'Save as unclear')}</button><button disabled={busy} onClick={() => onNext(true)}>{t('暂缓，继续下一项', 'Defer and continue')}</button><button className="review-primary" disabled={busy} onClick={() => onNext()}>{t('这一点先到这里，继续下一项', 'Continue to the next objective')}<ArrowRight size={16} /></button></div><p className="cram-muted">{t('继续不代表掌握。下一项：', 'Continuing does not mean mastery. Next: ')}{nextTopic?.title || t('查看队列与复查安排', 'Review queue and revisit schedule')}</p></div>
  </section>;
}

export function CramChecklist({ session: s, onEnter, onSource, onResumeAttempt }: { session: CramSession; onEnter: (id: string) => void; onSource: (topic: CramTopic, page?: number) => void; onResumeAttempt: (id: string) => void }) {
  const { t, status } = useLabels(); const topics = s.topics.filter(t => t.included);
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const gaps = topics.filter(t => t.status === 'unclear' || t.status === 'revisit' || t.group === 'deferred' || t.attempts === 0);
  const exportList = () => {
    const content = [`# ${s.title || t('考前清单', 'Final checklist')}`, ...topics.map(topic => `\n## ${topic.title}\n${status(topic)}\n${sourceName(s,topic)} · PDF ${topic.pages.join(', ')}\n${topic.summary}\n${topic.note || ''}`)].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'exam-sprint-checklist.md'; a.click(); URL.revokeObjectURL(url);
  };
  return <><div className="review-intro"><span className="review-eyebrow">FINAL CHECKLIST</span><h2>{t('随时收尾，也能从这里继续。', 'Review anytime, and continue from here.')}</h2><p>{t('根据本次范围、实际作答与疑问整理，不代表考点预测或全篇无遗漏。', 'Based on selected scope, actual answers and gaps—not exam predictions or guaranteed coverage.')}</p><button onClick={exportList}>{t('导出考前清单', 'Export checklist')}</button></div>
    <section className="cram-card"><h3>{t('未解决与尚未检查', 'Unresolved and unchecked')}</h3>{gaps.map(topic => <div className="cram-checklist-row" key={topic.id}><strong><ExplanationText>{topic.title}</ExplanationText></strong><span>{topic.group === 'deferred' ? t('暂缓', 'Deferred') : status(topic)}</span><p>{topic.note && topic.note !== 'deferred-by-user' ? topic.note : t('尚未取得足够的独立作答证据。', 'Not enough independent-answer evidence yet.')}</p><SourceButton session={s} topic={topic} onSource={onSource} /><button disabled={!!s.active} onClick={() => onEnter(topic.id)}>{t('继续这一点', 'Work on this objective')}</button></div>)}</section>
    <section className="cram-card"><h3>{t('我实际错过或有争议的内容', 'Actual errors and disputed feedback')}</h3>{s.attempts.filter(a => a.evaluationDisputed || a.feedback && a.feedback.verdict !== 'correct').map(a => <details key={a.id}><summary>{s.topics.find(t => t.id === a.topicId)?.title} · {new Date(a.submittedAt).toLocaleDateString()}</summary><Prose>{a.question.prompt}</Prose><p>{t('我的回答：', 'My answer: ')}{a.answer}</p>{a.feedback && <Prose>{a.feedback.feedback}</Prose>}<Prose>{a.question.explanation}</Prose></details>)}</section>
    <section className="cram-card"><h3>{t('概念、公式与步骤：先回忆，再展开', 'Concepts, formulas and steps: recall before revealing')}</h3>{topics.map(topic => <article className="cram-checklist-row" key={topic.id}><h3><ExplanationText>{topic.title}</ExplanationText></h3><button aria-expanded={reveal.has(topic.id)} onClick={() => setReveal(old => { const next = new Set(old); next.has(topic.id) ? next.delete(topic.id) : next.add(topic.id); return next; })}>{reveal.has(topic.id) ? t('收起', 'Hide') : t('展开要点', 'Reveal notes')}</button>{reveal.has(topic.id) && <Prose>{topic.lesson || topic.summary}</Prose>}<SourceButton session={s} topic={topic} onSource={onSource} /></article>)}</section>
    <section className="cram-card"><details><summary>{t('全部作答记录与保留的草稿', 'All answers and saved drafts')}</summary>{s.attempts.map(a => <details key={a.id}><summary>{s.topics.find(t => t.id === a.topicId)?.title} · {new Date(a.submittedAt).toLocaleString()}</summary><Prose>{a.question.prompt}</Prose><p>{a.answer}</p>{a.feedback ? <Prose>{a.feedback.feedback}</Prose> : <p>{t('反馈尚未完成', 'Feedback is pending')} <button disabled={!!s.active} onClick={() => onResumeAttempt(a.id)}>{t('返回这次作答', 'Resume this answer')}</button></p>}<p>{a.assisted ? t('使用过帮助', 'Assisted') : t('未使用帮助', 'Unaided')} · {a.delayed ? t('隔开后检查', 'Delayed check') : t('当次检查', 'Immediate check')}</p></details>)}{(s.archivedWork ?? []).filter(a => a.draft && !a.attemptId).map((a,i) => <details key={i}><summary>{t('未提交草稿', 'Unsubmitted draft')} · {s.topics.find(t => t.id === a.topicId)?.title}</summary>{a.question && <Prose>{a.question.prompt}</Prose>}<p>{a.draft}</p></details>)}</details></section>
    <section className="cram-card"><h3>{t('范围之外与资料缺口', 'Excluded scope and source gaps')}</h3>{s.topics.filter(t => !t.included).map(topic => <p key={topic.id}>{topic.title} · {t('由你排除', 'Excluded by you')}</p>)}{s.sources.map(source => <p key={source.material.id}>{source.material.fileName} · {source.readError || `${t('读取', 'Read')} ${source.pages.length} / ${t('交给本次提取', 'Submitted')} ${source.processedPages.length}`} · {t('请对照原文核对遗漏', 'Compare with source for omissions')}</p>)}</section>
  </>;
}

function CramTime({ session: s }: { session: CramSession }) {
  const { t } = useLabels();
  const planned = Number(s.minutes);
  const elapsed = Math.round((s.activeSeconds ?? 0) / 60);
  const samples = s.visits.filter(v => (v.seconds ?? 0) >= 30 && s.attempts.some(a => a.topicId === v.topicId && a.feedback)).map(v => v.seconds!).slice(-8).sort((a,b) => a-b);
  const median = samples.length >= 3 ? samples[Math.floor(samples.length / 2)] / 60 : null;
  const left = planned > 0 ? Math.max(0, planned - elapsed) : null;
  return <div className="cram-card"><p><Clock3 size={15} />{t('本机记录的前台学习时间', 'Recorded active study time')}: {elapsed} {t('分钟', 'min')}{left !== null ? ` · ${t('计划剩余', 'Budget remaining')}: ${left} ${t('分钟', 'min')}` : ''}</p>
    <p className="cram-muted">{t('只累计前台且近期有操作的学习时间；闲置、AI 等待与关闭页面不计入。', 'Counts visible study with recent activity; idle time, AI waits and closed pages are excluded.')}</p>
    {left !== null && median && <p>{t('按最近的实际节奏，剩余时间约能安排', 'At your recent pace, the remaining budget may fit')} {Math.max(0, Math.floor(left / (median * 1.5)))}–{Math.floor(left / Math.max(0.5, median * 0.75))} {t('次小块练习（含复查）。仅供安排，不等于学会这些主题。', 'small practice visits (including rechecks). A planning estimate, not mastery.')}</p>}
    {left !== null && !median && <p className="cram-muted">{t('完成几次练习后再提供粗略时间估计；现在不猜能学完多少。', 'A rough pace estimate becomes available after several practice visits.')}</p>}
    {left === 0 && <p>{t('已达到本次计划时间。可以收尾或在考试信息中增加时间，不强制中断。', 'Your planned time is used. Wrap up or add time in Exam details; you will not be interrupted.')}</p>}
  </div>;
}
