import { StudyTermText } from '@/features/reluctant/StudyTermPopover';
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Brain, Check, CircleDot, Eye, FlaskConical, HeartPulse, Highlighter, Lightbulb, Microscope, PersonStanding, RotateCcw } from 'lucide-react';
import type { AppLanguage } from '@/types';
import { parseStudyVisual, type StudyVisual, type StudyVisualNode } from '@/features/reluctant/studyVisuals';

const icons = { idea: Lightbulb, person: PersonStanding, eye: Eye, heart: HeartPulse, brain: Brain, experiment: FlaskConical, cell: Microscope };

/** Local diagram controls never call AI, change lesson progress, or mark a topic mastered. */
export function SprintVisual({ visual, language }: { visual: StudyVisual; language: AppLanguage }) {
  const parsed = useMemo(() => parseStudyVisual(visual), [visual]);
  if (!parsed) return null;
  return <VisualContent key={JSON.stringify(parsed)} visual={parsed} language={language} />;
}

function VisualContent({ visual: v, language }: { visual: StudyVisual; language: AppLanguage }) {
  const en = language === 'en';
  const t = (zh: string, english: string) => en ? english : zh;
  const [step, setStep] = useState<number | null>(null);
  const [markedRow, setMarkedRow] = useState<number | null>(null);
  const kind = { scene: t('情境速写', 'A quick scene'), flow: t('关系示意', 'Follow the relationship'), branches: t('分支示意', 'See the branches'), compare: t('放在一起比较', 'Compare side by side') }[v.kind];
  const node = (n: StudyVisualNode, index: number) => {
    const Icon = n.icon ? icons[n.icon] : CircleDot;
    return <div className="sprint-visual-node">
      <span className="sprint-visual-node-icon"><Icon size={23} aria-hidden="true" /><span>{String(index + 1).padStart(2, '0')}</span></span>
      <h4>{<StudyTermText value={n.label} />}</h4>{n.detail && <p>{<StudyTermText value={n.detail} />}</p>}
    </div>;
  };
  const targetCount = v.kind === 'compare' ? 0 : v.nodes.length;
  const count = step ?? targetCount;
  return <figure className={`sprint-visual sprint-visual--${v.kind}`} data-preserve-language="true">
    <figcaption><span className="sprint-visual-kind">{kind}</span><h3>{<StudyTermText value={v.title} />}</h3></figcaption>
    {v.kind === 'compare' ? <>
      <p className="sprint-visual-help">{t('点标记按钮，留下你想记住的区别；术语可以点开解释。', 'Highlight a distinction with the marker; select a term for its meaning.')}</p>
      <div className="sprint-visual-table" tabIndex={0} role="region" aria-label={v.title}>
        <table><thead><tr><th scope="col">{t('比较什么', 'Dimension')}</th>{v.columns.map((column, i) => <th key={i} scope="col">{<StudyTermText value={column} />}</th>)}</tr></thead>
          <tbody>{v.rows.map((row, i) => <tr key={i} className={markedRow === i ? 'is-marked' : undefined}>
            <th scope="row"><button type="button" className="sprint-visual-row-marker" aria-label={`${t('标记：', 'Highlight: ')}${row.label}`} aria-pressed={markedRow === i} onClick={() => setMarkedRow(markedRow === i ? null : i)}><Highlighter size={14} aria-hidden="true" /></button> <StudyTermText value={row.label} /></th>
            {row.cells.map((cell, j) => <td key={j}>{<StudyTermText value={cell} />}</td>)}
          </tr>)}</tbody></table>
      </div>
    </> : <>
      <div className="sprint-visual-controls">
        {step === null ? <button type="button" onClick={() => setStep(1)}>{t('逐步看', 'Step through')}<ArrowRight size={14} aria-hidden="true" /></button> : <>
          <span aria-live="polite">{count} / {targetCount}</span>
          {count < targetCount ? <button type="button" onClick={() => setStep(count + 1)}>{t('展开下一步', 'Reveal next')}<ArrowRight size={14} aria-hidden="true" /></button>
            : <button type="button" onClick={() => setStep(1)}><RotateCcw size={14} aria-hidden="true" />{t('再走一遍', 'Walk through again')}</button>}
          <button type="button" onClick={() => setStep(null)}>{t('显示完整关系', 'Show all')}</button>
        </>}
      </div>
      {v.kind === 'branches' ? <div className="sprint-visual-branches">
        <div className="sprint-visual-origin">{node(v.nodes[0], 0)}</div>
        {count > 1 && <div className="sprint-visual-targets">{v.nodes.slice(1, count).map((n, i) => <div className="sprint-visual-branch" key={i}>
          <div className="sprint-visual-edge"><ArrowDown size={18} aria-hidden="true" /><span>{<StudyTermText value={n.link} />}</span></div>{node(n, i + 1)}
        </div>)}</div>}
      </div> : <div className="sprint-visual-nodes">{v.nodes.slice(0, count).map((n, i) => <div className="sprint-visual-step" key={i}>
        {v.kind === 'flow' && i > 0 && <div className="sprint-visual-edge"><ArrowDown size={18} aria-hidden="true" /><span>{<StudyTermText value={n.link} />}</span></div>}{node(n, i)}
      </div>)}</div>}
    </>}
    {v.caption && <p className="sprint-visual-caption">{<StudyTermText value={v.caption} />}</p>}
    {v.kind === 'compare' && markedRow !== null && <p className="sprint-visual-selection" aria-live="polite"><Check size={14} aria-hidden="true" />{t('已标记：', 'Highlighted: ')}{v.rows[markedRow].label}</p>}
  </figure>;
}
