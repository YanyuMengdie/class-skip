import React from 'react';
import { ArrowRight, CalendarDays, Link2 } from 'lucide-react';
import type { CourseBriefReport } from './types';
import { briefHasGaps, groupBriefItems, selectMajorAssessments } from './CanvasWeeklyBrief';
import './brief.css';

/** Only pass a report after the current Canvas origin and user ID have been verified. */
export const CanvasBriefSummary: React.FC<{ report?: CourseBriefReport | null; onOpen: () => void }> = ({ report, onOpen }) => {
  const groups = report ? groupBriefItems(report) : null;
  const lectures = groups?.thisWeek.filter((item) => item.kind === 'lecture').length || 0;
  const tasks = groups?.thisWeek.filter((item) => !['lecture', 'reading'].includes(item.kind) && item.status !== 'submitted' && item.status !== 'excused').length || 0;
  const majors = report ? selectMajorAssessments(report).length : 0;
  return <button type="button" className="canvas-brief-summary" onClick={onOpen}>
    <span className="cb-summary-icon" aria-hidden="true"><CalendarDays size={23} /></span>
    <span className="cb-summary-copy"><span className="cb-eyebrow">CANVAS · 课程安排</span><strong>本周课程简报</strong><span>{report && groups
      ? `${report.weekStart} 起的一周 · ${lectures} 项讲次 · ${tasks} 项待办 · ${majors} 项大作业提前准备${briefHasGaps(report) ? ' · 有读取缺口' : ''}`
      : '本周学什么、交什么，哪些大作业该开始准备。'}</span><small><Link2 size={12} />{report ? report.scopeVersion === 3 && report.digestVersion === 1 ? '已保存的周报摘要 · 打开后可手动更新' : '旧版简报已保留 · 同步后生成中文摘要与本周导读' : '选择课程，手动同步；每条安排保留原文依据'}</small></span>
    <span className="cb-summary-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
  </button>;
};
