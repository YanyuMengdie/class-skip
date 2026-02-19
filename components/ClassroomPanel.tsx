import React, { useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { LectureRecord } from '../types';

interface ClassroomPanelProps {
  currentLecture: LectureRecord | null;
  onEndClass: () => void;
  transcriptLive: string;
}

export const ClassroomPanel: React.FC<ClassroomPanelProps> = ({
  currentLecture,
  onEndClass,
  transcriptLive
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcriptLive, currentLecture?.transcript?.length]);

  const fullText = currentLecture
    ? currentLecture.transcript.map((t) => t.text).join('') + (transcriptLive || '')
    : '';

  return (
    <div className="flex flex-col h-full bg-white border-l border-stone-100">
      <div className="flex items-center justify-between p-4 border-b border-stone-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-100 text-rose-500">
            <Mic className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-800">上课中</span>
        </div>
        <button
          onClick={onEndClass}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 transition-colors"
        >
          <Square className="w-4 h-4" /> 下课
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap"
      >
        {fullText || (
          <span className="text-stone-400">正在听讲，转写内容会实时出现在这里…</span>
        )}
      </div>
    </div>
  );
};
