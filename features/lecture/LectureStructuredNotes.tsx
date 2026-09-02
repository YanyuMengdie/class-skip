import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  ListTree,
  MessageCircleQuestion,
  Play,
  Quote,
  Sparkles,
  Tags,
} from 'lucide-react';
import type {
  LectureNoteEvidence,
  LectureNoteKeyPoint,
  LectureNoteSection,
  LectureStructuredNotes,
  LectureTeacherSignal,
  LectureTeacherSignalKind,
} from '@/types';

interface LectureStructuredNotesProps {
  notes: LectureStructuredNotes;
  onSeekEvidence: (evidence: LectureNoteEvidence) => void;
  getEvidencePage?: (evidence: LectureNoteEvidence) => number | undefined;
  onOpenEvidencePage?: (
    evidence: LectureNoteEvidence,
    pageNumber: number
  ) => void;
}

type ReviewTab = 'catch-up' | 'route' | 'additions' | 'qa';

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const EvidenceLinks: React.FC<{
  evidence: LectureNoteEvidence[];
  onSeek: (evidence: LectureNoteEvidence) => void;
  getPage?: (evidence: LectureNoteEvidence) => number | undefined;
  onOpenPage?: (evidence: LectureNoteEvidence, pageNumber: number) => void;
}> = ({ evidence, onSeek, getPage, onOpenPage }) => (
  <div className="mt-3 flex flex-wrap gap-2">
    {evidence.map((item) => {
      const pageNumber = getPage?.(item);
      return (
        <span
          key={item.segmentId}
          className="inline-flex overflow-hidden rounded-md border border-indigo-100 bg-indigo-50"
        >
          <button
            type="button"
            onClick={() => onSeek(item)}
            title={`${item.quote}\n点击回听`}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            <Play className="h-3 w-3 fill-current" />
            {formatTime(item.startMs)}
            <span className="max-w-24 truncate text-indigo-500">{item.speakerLabel}</span>
          </button>
          {pageNumber && (
            <button
              type="button"
              onClick={() => onOpenPage?.(item, pageNumber)}
              disabled={!onOpenPage}
              title={`打开关联课件第 ${pageNumber} 页`}
              className="inline-flex items-center gap-1 border-l border-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-default"
            >
              <BookOpen className="h-3 w-3" />
              第 {pageNumber} 页
            </button>
          )}
        </span>
      );
    })}
  </div>
);

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="py-12 text-center text-sm text-slate-400">{children}</p>
);

const SectionList: React.FC<{
  items: LectureNoteSection[];
  onSeek: (evidence: LectureNoteEvidence) => void;
  getPage?: (evidence: LectureNoteEvidence) => number | undefined;
  onOpenPage?: (evidence: LectureNoteEvidence, pageNumber: number) => void;
}> = ({ items, onSeek, getPage, onOpenPage }) => (
  <div className="divide-y divide-stone-100">
    {items.map((item, index) => (
      <article key={`${item.title}-${index}`} className="py-4 first:pt-0 last:pb-0">
        <h5 className="text-sm font-bold text-slate-800">{item.title}</h5>
        <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p>
        <EvidenceLinks evidence={item.evidence} onSeek={onSeek} getPage={getPage} onOpenPage={onOpenPage} />
      </article>
    ))}
  </div>
);

const PointList: React.FC<{
  items: LectureNoteKeyPoint[];
  onSeek: (evidence: LectureNoteEvidence) => void;
  getPage?: (evidence: LectureNoteEvidence) => number | undefined;
  onOpenPage?: (evidence: LectureNoteEvidence, pageNumber: number) => void;
}> = ({ items, onSeek, getPage, onOpenPage }) => (
  <div className="divide-y divide-stone-100">
    {items.map((item, index) => (
      <article key={`${item.title}-${index}`} className="py-4 first:pt-0 last:pb-0">
        <h5 className="text-sm font-bold text-slate-800">{item.title}</h5>
        <p className="mt-1 text-sm leading-6 text-slate-600">{item.explanation}</p>
        <EvidenceLinks evidence={item.evidence} onSeek={onSeek} getPage={getPage} onOpenPage={onOpenPage} />
      </article>
    ))}
  </div>
);

const signalLabels: Record<LectureTeacherSignalKind, string> = {
  emphasis: '老师强调',
  assignment: '作业要求',
  exam: '考试说明',
  deadline: '截止日期',
  correction: '课堂更正',
  limitation: '限定条件',
};

const SignalList: React.FC<{
  items: LectureTeacherSignal[];
  onSeek: (evidence: LectureNoteEvidence) => void;
  getPage?: (evidence: LectureNoteEvidence) => number | undefined;
  onOpenPage?: (evidence: LectureNoteEvidence, pageNumber: number) => void;
}> = ({ items, onSeek, getPage, onOpenPage }) => (
  <div className="divide-y divide-stone-100">
    {items.map((item, index) => (
      <article key={`${item.kind}-${item.title}-${index}`} className="py-4 first:pt-0 last:pb-0">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
            {signalLabels[item.kind]}
          </span>
          <h5 className="text-sm font-bold text-slate-800">{item.title}</h5>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{item.explanation}</p>
        <EvidenceLinks evidence={item.evidence} onSeek={onSeek} getPage={getPage} onOpenPage={onOpenPage} />
      </article>
    ))}
  </div>
);

export const LectureStructuredNotesView: React.FC<LectureStructuredNotesProps> = ({
  notes,
  onSeekEvidence,
  getEvidencePage,
  onOpenEvidencePage,
}) => {
  const [activeTab, setActiveTab] = useState<ReviewTab>('catch-up');
  const catchUp = notes.catchUp || [];
  const teacherAdditions = notes.teacherAdditions || [];
  const examples = notes.examples || [];
  const teacherSignals = notes.teacherSignals || [];
  const tabClass = (tab: ReviewTab) => (
    `flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold transition-colors ${
      activeTab === tab
        ? 'bg-slate-900 text-white'
        : 'bg-white text-slate-500 hover:bg-stone-50 hover:text-slate-800'
    }`
  );
  const evidenceProps = {
    onSeek: onSeekEvidence,
    getPage: getEvidencePage,
    onOpenPage: onOpenEvidencePage,
  };

  return (
    <section className="border-t border-stone-200 pt-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-indigo-50 p-2 text-indigo-600">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">课堂复习包</h3>
            <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              notes.comparedWithSlides
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-stone-100 text-slate-500'
            }`}>
              {notes.comparedWithSlides ? '已对照关联课件' : '仅依据课堂转写'}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{notes.overview}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Clock3 className="h-3 w-3" />
            结论均可回听原话；有页码时也可跳回课件
          </p>
        </div>
      </div>

      <div className="mb-5 flex overflow-hidden rounded-md border border-stone-200" role="tablist" aria-label="课堂复习包">
        <button type="button" role="tab" aria-selected={activeTab === 'catch-up'} onClick={() => setActiveTab('catch-up')} className={tabClass('catch-up')}>
          <Sparkles className="h-3.5 w-3.5" />
          快速补课
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'route'} onClick={() => setActiveTab('route')} className={tabClass('route')}>
          <ListTree className="h-3.5 w-3.5" />
          课堂路线
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'additions'} onClick={() => setActiveTab('additions')} className={tabClass('additions')}>
          <Quote className="h-3.5 w-3.5" />
          老师补充
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'qa'} onClick={() => setActiveTab('qa')} className={tabClass('qa')}>
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          问答与核对
        </button>
      </div>

      {activeTab === 'catch-up' && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            缺课后先读这里
          </h4>
          {catchUp.length > 0 ? (
            <SectionList items={catchUp} {...evidenceProps} />
          ) : notes.keyPoints.length > 0 ? (
            <PointList items={notes.keyPoints} {...evidenceProps} />
          ) : (
            <EmptyState>这节课暂时没有生成可核对的快速补课内容。</EmptyState>
          )}
          {catchUp.length > 0 && notes.keyPoints.length > 0 && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                这节课要带走的结论
              </h4>
              <PointList items={notes.keyPoints} {...evidenceProps} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'route' && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
            <ListTree className="h-4 w-4 text-indigo-500" />
            老师实际怎么把这节课讲下来
          </h4>
          {notes.outline.length > 0 ? (
            <SectionList items={notes.outline} {...evidenceProps} />
          ) : (
            <EmptyState>没有足够证据还原可靠的课堂路线。</EmptyState>
          )}
          {examples.length > 0 && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              <h4 className="mb-3 text-xs font-bold text-slate-500">课堂里用过的例子</h4>
              <PointList items={examples} {...evidenceProps} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'additions' && (
        <div>
          {notes.comparedWithSlides ? (
            <>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <FileText className="h-4 w-4 text-sky-600" />
                相对课件新增、修正或限定的内容
              </h4>
              {teacherAdditions.length > 0 ? (
                <PointList items={teacherAdditions} {...evidenceProps} />
              ) : (
                <EmptyState>没有找到足够可靠的课件外补充。</EmptyState>
              )}
            </>
          ) : (
            <p className="mb-5 rounded-md bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
              这份录音未能安全关联当前课件，因此不会猜测哪些内容属于“课件之外”。
            </p>
          )}
          {teacherSignals.length > 0 && (
            <div className="border-t border-stone-100 pt-5">
              <h4 className="mb-3 text-xs font-bold text-slate-500">老师明确说出的信号</h4>
              <SignalList items={teacherSignals} {...evidenceProps} />
            </div>
          )}
          {notes.terms.length > 0 && (
            <div className="mt-6 border-t border-stone-100 pt-5">
              <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <Tags className="h-4 w-4 text-sky-600" />
                课堂术语
              </h4>
              <dl className="divide-y divide-stone-100">
                {notes.terms.map((item, index) => (
                  <div key={`${item.term}-${index}`} className="py-3 first:pt-0">
                    <dt className="text-sm font-bold text-slate-800">{item.term}</dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-600">{item.explanation}</dd>
                    <EvidenceLinks evidence={item.evidence} onSeek={onSeekEvidence} getPage={getEvidencePage} onOpenPage={onOpenEvidencePage} />
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {activeTab === 'qa' && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-500">
            <MessageCircleQuestion className="h-4 w-4 text-emerald-600" />
            学生提问与老师回答
          </h4>
          {notes.questions.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {notes.questions.map((item, index) => (
                <article key={`${item.question}-${index}`} className="py-4 first:pt-0">
                  <p className="text-sm font-bold leading-6 text-slate-800">问：{item.question}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">答：{item.answer}</p>
                  <EvidenceLinks evidence={item.evidence} onSeek={onSeekEvidence} getPage={getEvidencePage} onOpenPage={onOpenEvidencePage} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>这节课没有识别到证据充分的学生问答。</EmptyState>
          )}
          {notes.uncertainMoments.length > 0 && (
            <div className="mt-6 rounded-md bg-amber-50 px-4 py-3">
              <h4 className="flex items-center gap-2 text-xs font-bold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                建议回听确认
              </h4>
              <div className="mt-2 divide-y divide-amber-100">
                {notes.uncertainMoments.map((item, index) => (
                  <article key={`${item.description}-${index}`} className="py-3 first:pt-0">
                    <p className="text-sm leading-6 text-amber-900">{item.description}</p>
                    <EvidenceLinks evidence={item.evidence} onSeek={onSeekEvidence} getPage={getEvidencePage} onOpenPage={onOpenEvidencePage} />
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
