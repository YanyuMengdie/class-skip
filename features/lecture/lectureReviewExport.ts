import type {
  LectureNoteEvidence,
  LectureRecord,
  LectureTeacherSignalKind,
} from '@/types';

export const formatLectureElapsedTime = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getLecturePageAtElapsedMs = (
  lecture: LectureRecord,
  elapsedMs: number
): number | undefined => {
  let pageNumber = lecture.sourceStartedPage;
  const visits = [...(lecture.pageVisits || [])].sort(
    (left, right) => left.elapsedMs - right.elapsedMs
  );

  for (const visit of visits) {
    if (visit.elapsedMs > elapsedMs) break;
    pageNumber = visit.pageNumber;
  }

  return pageNumber;
};

const getLectureDisplayName = (lecture: LectureRecord): string => {
  if (lecture.name?.trim()) return lecture.name.trim();
  return new Date(lecture.startedAt).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const renderEvidence = (
  lecture: LectureRecord,
  evidence: LectureNoteEvidence[]
): string => evidence.map((item) => {
  const pageNumber = getLecturePageAtElapsedMs(lecture, item.startMs);
  const location = [
    formatLectureElapsedTime(item.startMs),
    item.speakerLabel,
    pageNumber ? `课件第 ${pageNumber} 页` : null,
  ].filter(Boolean).join(' · ');
  return `> 证据：${location}\n>\n> 原话：${item.quote}`;
}).join('\n\n');

const renderEvidenceSection = (
  lecture: LectureRecord,
  title: string,
  body: string,
  evidence: LectureNoteEvidence[]
): string => [
  `### ${title}`,
  body,
  evidence.length > 0 ? renderEvidence(lecture, evidence) : '',
].filter(Boolean).join('\n\n');

const teacherSignalLabels: Record<LectureTeacherSignalKind, string> = {
  emphasis: '老师强调',
  assignment: '作业要求',
  exam: '明确考试信息',
  deadline: '截止日期',
  correction: '老师更正',
  limitation: '限定条件',
};

export const buildLectureReviewMarkdown = (lecture: LectureRecord): string => {
  const title = getLectureDisplayName(lecture);
  const lines: string[] = [
    `# ${title}`,
    '',
    `- 课堂时间：${new Date(lecture.startedAt).toLocaleString('zh-CN')}`,
  ];

  if (lecture.sourceFileName) {
    lines.push(
      `- 关联课件：${lecture.sourceFileName}${
        lecture.sourceStartedPage ? `（从第 ${lecture.sourceStartedPage} 页开始）` : ''
      }`
    );
  }
  if (lecture.audioQuality) {
    lines.push(
      `- 录音质量：${lecture.audioQuality.score}/100 · ${lecture.audioQuality.message}`
    );
  }

  if (lecture.structuredNotes) {
    const notes = lecture.structuredNotes;
    lines.push(
      `- 整理依据：${notes.comparedWithSlides ? '课堂转写 + 关联课件对照' : '仅课堂转写'}`
    );
    lines.push('', '## 课堂概览', '', notes.overview);

    if (notes.catchUp?.length) {
      lines.push('', '## 十分钟快速补课', '');
      notes.catchUp.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.title, item.summary, item.evidence), '');
      });
    }

    if (notes.outline.length > 0) {
      lines.push('', '## 课堂路线', '');
      notes.outline.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.title, item.summary, item.evidence), '');
      });
    }

    if (notes.keyPoints.length > 0) {
      lines.push('', '## 老师真正强调的重点', '');
      notes.keyPoints.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.title, item.explanation, item.evidence), '');
      });
    }

    if (notes.teacherAdditions?.length) {
      lines.push('', '## 老师在课件之外的补充', '');
      notes.teacherAdditions.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.title, item.explanation, item.evidence), '');
      });
    }

    if (notes.examples?.length) {
      lines.push('', '## 课堂例子', '');
      notes.examples.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.title, item.explanation, item.evidence), '');
      });
    }

    if (notes.teacherSignals?.length) {
      lines.push('', '## 老师明确信号', '');
      notes.teacherSignals.forEach((item) => {
        lines.push(
          renderEvidenceSection(
            lecture,
            `${teacherSignalLabels[item.kind]}：${item.title}`,
            item.explanation,
            item.evidence
          ),
          ''
        );
      });
    }

    if (notes.questions.length > 0) {
      lines.push('', '## 学生提问与老师回答', '');
      notes.questions.forEach((item) => {
        lines.push(
          renderEvidenceSection(
            lecture,
            item.question,
            `**回答：** ${item.answer}`,
            item.evidence
          ),
          ''
        );
      });
    }

    if (notes.terms.length > 0) {
      lines.push('', '## 专业术语', '');
      notes.terms.forEach((item) => {
        lines.push(renderEvidenceSection(lecture, item.term, item.explanation, item.evidence), '');
      });
    }

    if (notes.uncertainMoments.length > 0) {
      lines.push('', '## 建议回听确认', '');
      notes.uncertainMoments.forEach((item, index) => {
        lines.push(
          renderEvidenceSection(
            lecture,
            `待确认 ${index + 1}`,
            item.description,
            item.evidence
          ),
          ''
        );
      });
    }
  } else if (lecture.organizedSummary?.trim()) {
    lines.push('', '## 课堂整理', '', lecture.organizedSummary.trim());
  }

  const segments = lecture.transcriptSegments || [];
  if (segments.length > 0) {
    lines.push('', '## 完整转写', '');
    segments.forEach((segment) => {
      const pageNumber = getLecturePageAtElapsedMs(lecture, segment.startMs);
      lines.push(
        `**[${formatLectureElapsedTime(segment.startMs)}] ${segment.speakerLabel}${
          pageNumber ? ` · 第 ${pageNumber} 页` : ''
        }**`,
        '',
        segment.text,
        ''
      );
    });
  } else if (lecture.transcript.length > 0) {
    lines.push('', '## 临时转写', '');
    lecture.transcript.forEach((item) => {
      lines.push(`- ${item.text}`);
    });
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
};

export const getLectureReviewFileName = (lecture: LectureRecord): string => {
  const baseName = getLectureDisplayName(lecture)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${baseName || '课堂复习包'}-复习包.md`;
};
