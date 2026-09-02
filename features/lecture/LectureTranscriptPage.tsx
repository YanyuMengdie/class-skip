import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Edit2,
  FileAudio,
  FileDown,
  FileText,
  Loader2,
  Mic,
  Trash2,
  Upload,
  X,
  X as XIcon,
} from 'lucide-react';
import { LectureNoteEvidence, LectureRecord } from '@/types';
import { lectureAudioStorage } from '@/services/lectureAudioStorage';
import type { LectureTranscriptionOptions } from '@/services/elevenLabsTranscriptionService';
import { LectureStructuredNotesView } from './LectureStructuredNotes';
import {
  buildLectureReviewMarkdown,
  getLecturePageAtElapsedMs,
  getLectureReviewFileName,
} from './lectureReviewExport';

const formatLectureTime = (start: number, end?: number) => {
  const d = new Date(start);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  if (end != null) {
    const dur = Math.round((end - start) / 60000);
    return `${dateStr} · ${dur} 分钟`;
  }
  return dateStr;
};

const getLectureDisplayName = (lecture: LectureRecord) => {
  return lecture.name || formatLectureTime(lecture.startedAt, lecture.endedAt);
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getAudioExtension = (mimeType?: string) => {
  const normalized = mimeType?.toLowerCase() || '';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('flac')) return 'flac';
  if (normalized.includes('aac')) return 'aac';
  return 'webm';
};

const getAudioStatus = (lecture: LectureRecord) => {
  if (!lecture.audioRecordingId) return null;
  if (lecture.audioStatus === 'recording') {
    return { label: '正在保存', className: 'bg-rose-50 text-rose-600' };
  }
  if (lecture.audioStatus === 'interrupted') {
    return { label: '未正常结束', className: 'bg-amber-50 text-amber-700' };
  }
  if (lecture.audioStatus === 'error') {
    return { label: '保存异常', className: 'bg-rose-50 text-rose-700' };
  }
  return { label: '音频已保存', className: 'bg-emerald-50 text-emerald-700' };
};

interface LectureTranscriptPageProps {
  lectureHistory: LectureRecord[];
  onClose: () => void;
  onOrganize?: (lecture: LectureRecord) => void;
  organizingId?: string | null;
  onDelete?: (lectureId: string) => void;
  onRename?: (lectureId: string, newName: string) => void;
  onImportAudio?: (file: File) => Promise<void>;
  onTranscribe?: (
    lecture: LectureRecord,
    options: LectureTranscriptionOptions
  ) => Promise<void>;
  transcribingId?: string | null;
  onOpenSourcePage?: (lecture: LectureRecord, pageNumber: number) => void;
}

export const LectureTranscriptPage: React.FC<LectureTranscriptPageProps> = ({
  lectureHistory,
  onClose,
  onOrganize,
  organizingId,
  onDelete,
  onRename,
  onImportAudio,
  onTranscribe,
  transcribingId,
  onOpenSourcePage,
}) => {
  const [selected, setSelected] = useState<LectureRecord | null>(lectureHistory[0] ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [importing, setImporting] = useState(false);
  const [transcriptionSettingsOpen, setTranscriptionSettingsOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState<LectureTranscriptionOptions['languageCode']>('auto');
  const [numSpeakers, setNumSpeakers] = useState('');
  const [keyterms, setKeyterms] = useState('');
  const [rawTranscriptOpen, setRawTranscriptOpen] = useState(
    !lectureHistory[0]?.structuredNotes
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const segmentElementRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (selected && lectureHistory.length > 0) {
      const updated = lectureHistory.find((l) => l.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [lectureHistory, selected?.id]);

  useEffect(() => {
    if (!selected && lectureHistory[0]) setSelected(lectureHistory[0]);
  }, [lectureHistory, selected]);

  useEffect(() => {
    if (!selected) return;
    setLanguageCode(
      selected.transcriptionLanguageCode === 'en' || selected.transcriptionLanguageCode === 'zh'
        ? selected.transcriptionLanguageCode
        : 'auto'
    );
    setNumSpeakers(selected.transcriptionSpeakerCount ? String(selected.transcriptionSpeakerCount) : '');
    setKeyterms((selected.transcriptionKeyterms || []).join(', '));
    setTranscriptionSettingsOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    setRawTranscriptOpen(!selected?.structuredNotes);
  }, [selected?.id]);

  useEffect(() => {
    if (selected?.structuredNotes) setRawTranscriptOpen(false);
  }, [selected?.structuredNotes?.generatedAt]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setAudioUrl(null);
    setAudioError('');
    if (!selected?.audioRecordingId || selected.audioStatus === 'error') {
      return () => undefined;
    }

    setAudioLoading(true);
    lectureAudioStorage.getRecordingBlob(selected.audioRecordingId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch((error) => {
        if (!cancelled) {
          setAudioError(error instanceof Error ? error.message : '音频读取失败');
        }
      })
      .finally(() => {
        if (!cancelled) setAudioLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.audioRecordingId, selected?.audioStatus, selected?.audioChunkCount]);

  const handleStartEdit = (lecture: LectureRecord) => {
    setEditingId(lecture.id);
    setEditingName(lecture.name || formatLectureTime(lecture.startedAt, lecture.endedAt));
  };

  const handleSaveEdit = () => {
    if (editingId && onRename && editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = (lectureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm('确定要删除这堂课吗？删除后无法恢复。')) {
      onDelete(lectureId);
      if (selected?.id === lectureId) {
        const remaining = lectureHistory.filter(l => l.id !== lectureId);
        setSelected(remaining[0] || null);
      }
    }
  };

  const handleImport = async (file?: File) => {
    if (!file || !onImportAudio) return;
    if (!file.type.startsWith('audio/') && !/\.(m4a|mp3|wav|webm|mp4|aac|ogg|flac)$/i.test(file.name)) {
      alert('请选择课堂录音文件，例如 M4A、MP3、WAV 或 WebM。');
      return;
    }
    setImporting(true);
    try {
      await onImportAudio(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : '录音上传失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    if (!audioUrl || !selected) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `${getLectureDisplayName(selected).replace(/[\\/:*?"<>|]+/g, '-')}.${getAudioExtension(selected.audioMimeType)}`;
    link.click();
  };

  const handleExportReview = () => {
    if (!selected) return;
    const markdown = buildLectureReviewMarkdown(selected);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = getLectureReviewFileName(selected);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const handleTranscribe = async () => {
    if (!selected || !onTranscribe) return;
    const parsedKeyterms = keyterms
      .split(/[\n,，]+/)
      .map((term) => term.trim())
      .filter(Boolean);
    await onTranscribe(selected, {
      languageCode,
      numSpeakers: numSpeakers ? Number(numSpeakers) : undefined,
      keyterms: parsedKeyterms,
    });
  };

  const handleSeekEvidence = (evidence: LectureNoteEvidence) => {
    const audioElement = audioElementRef.current;
    if (audioElement) {
      audioElement.currentTime = Math.max(0, evidence.startMs / 1000);
      void audioElement.play().catch(() => undefined);
    }
    setRawTranscriptOpen(true);
    window.setTimeout(() => {
      segmentElementRefs.current[evidence.segmentId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);
  };

  const formatSegmentTime = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const displaySummary = selected?.organizedSummary;
  const isTranscribing = Boolean(
    selected && (transcribingId === selected.id || selected.transcriptionStatus === 'transcribing')
  );
  const canExportReview = Boolean(
    selected && (
      selected.structuredNotes ||
      selected.organizedSummary?.trim() ||
      selected.transcriptSegments?.length ||
      selected.transcript.length
    )
  );

  return (
    <div className="fixed inset-0 z-[200] bg-[#FFFBF7] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white/90 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-100 text-rose-500">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">课堂录音</h2>
            <p className="text-xs text-slate-400">原始音频与课堂记录</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected && canExportReview && (
            <button
              type="button"
              onClick={handleExportReview}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm font-semibold text-slate-700 hover:bg-stone-50"
            >
              <FileDown className="w-4 h-4" />
              导出复习包
            </button>
          )}
          {onImportAudio && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.m4a,.mp3,.wav,.webm,.mp4,.aac,.ogg,.flac"
                className="hidden"
                onChange={(event) => handleImport(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm font-semibold text-slate-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? '正在保存音频' : '导入课堂录音'}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 text-slate-500 hover:text-slate-800 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 左侧：课堂列表 */}
        <div className="w-64 border-r border-stone-200 bg-white/50 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">课堂记录</div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {lectureHistory.length === 0 ? (
              <p className="text-sm text-slate-400 px-2">暂无记录，上课并下课后会出现在这里</p>
            ) : (
              lectureHistory.map((lecture) => (
                <div
                  key={lecture.id}
                  onMouseEnter={() => setHoveredId(lecture.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`group relative w-full px-3 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                    selected?.id === lecture.id
                      ? 'bg-rose-100 text-rose-800 font-medium'
                      : 'hover:bg-stone-100 text-slate-700'
                  }`}
                >
                  {editingId === lecture.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1 text-sm bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                        autoFocus
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit();
                        }}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="保存"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="p-1 text-slate-400 hover:bg-stone-100 rounded"
                        title="取消"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelected(lecture)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        {lecture.audioSource === 'upload'
                          ? <FileAudio className="w-4 h-4 shrink-0 text-slate-400" />
                          : <Mic className="w-4 h-4 shrink-0 text-slate-400" />}
                        <span className="min-w-0">
                          <span className="block text-sm truncate">{getLectureDisplayName(lecture)}</span>
                          {lecture.audioRecordingId && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              {formatBytes(lecture.audioSizeBytes)}
                              {lecture.audioStatus === 'interrupted' ? ' · 未正常结束' : ' · 音频已保存'}
                            </span>
                          )}
                        </span>
                      </button>
                      {(hoveredId === lecture.id || selected?.id === lecture.id) && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onRename && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(lecture);
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="重命名"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={(e) => handleDelete(lecture.id, e)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：转写全文 + 整理区 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selected ? (
            <>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {selected.sourceFileName && (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <BookOpen className="h-4 w-4 shrink-0 text-sky-600" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-sky-800">关联课件</p>
                          <p className="mt-0.5 truncate text-sm text-slate-700">
                            {selected.sourceFileName}
                            {selected.sourceStartedPage
                              ? ` · 从第 ${selected.sourceStartedPage} 页开始`
                              : ''}
                          </p>
                        </div>
                      </div>
                      {selected.sourceStartedPage && onOpenSourcePage && (
                        <button
                          type="button"
                          onClick={() => onOpenSourcePage(selected, selected.sourceStartedPage!)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          打开开始页
                        </button>
                      )}
                    </section>
                  )}

                  {selected.audioRecordingId && (
                    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileAudio className="w-4 h-4 text-rose-500" />
                            <h3 className="text-sm font-bold text-slate-800">原始课堂音频</h3>
                            {getAudioStatus(selected) && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getAudioStatus(selected)?.className}`}>
                                {getAudioStatus(selected)?.label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatBytes(selected.audioSizeBytes)}
                            {selected.audioChunkCount ? ` · ${selected.audioChunkCount} 个安全分段` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownload}
                          disabled={!audioUrl}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-stone-100 disabled:opacity-30"
                          title="下载原始录音"
                          aria-label="下载原始录音"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>

                      {audioLoading ? (
                        <div className="h-10 flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" /> 正在读取本地音频
                        </div>
                      ) : audioError ? (
                        <div className="flex items-center gap-2 text-sm text-rose-600">
                          <AlertTriangle className="w-4 h-4" /> {audioError}
                        </div>
                      ) : audioUrl ? (
                        <audio
                          ref={audioElementRef}
                          controls
                          preload="metadata"
                          src={audioUrl}
                          className="w-full h-10"
                        />
                      ) : null}

                      {selected.audioStatus === 'interrupted' && (
                        <p className="mt-3 text-xs leading-5 text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          这堂课没有正常点“下课”，但此前已保存的音频分段仍然可以播放和下载。
                        </p>
                      )}
                    </section>
                  )}

                  {selected.audioRecordingId && onTranscribe && (
                    <section className="rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                      <div className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                              <AudioLines className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-800">高精度课堂转写</h3>
                              <p className="mt-1 text-xs leading-5 text-slate-400">
                                识别课堂专业术语，并按讲者和时间分段。
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setTranscriptionSettingsOpen((open) => !open)}
                            disabled={isTranscribing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-stone-50 disabled:opacity-40"
                          >
                            转写设置
                            {transcriptionSettingsOpen
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {transcriptionSettingsOpen && (
                          <div className="mt-4 pt-4 border-t border-stone-100 grid gap-4 md:grid-cols-2">
                            <label className="block">
                              <span className="block text-xs font-bold text-slate-600 mb-1.5">课堂语言</span>
                              <select
                                value={languageCode}
                                onChange={(event) => setLanguageCode(event.target.value as LectureTranscriptionOptions['languageCode'])}
                                className="w-full h-10 px-3 rounded-lg border border-stone-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              >
                                <option value="auto">自动识别</option>
                                <option value="en">英语</option>
                                <option value="zh">中文</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="block text-xs font-bold text-slate-600 mb-1.5">预期讲者数</span>
                              <select
                                value={numSpeakers}
                                onChange={(event) => setNumSpeakers(event.target.value)}
                                className="w-full h-10 px-3 rounded-lg border border-stone-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              >
                                <option value="">自动判断</option>
                                <option value="1">1 位</option>
                                <option value="2">2 位</option>
                                <option value="3">3 位</option>
                                <option value="4">4 位</option>
                              </select>
                            </label>
                            <label className="block md:col-span-2">
                              <span className="block text-xs font-bold text-slate-600 mb-1.5">专业术语（可选）</span>
                              <textarea
                                value={keyterms}
                                onChange={(event) => setKeyterms(event.target.value)}
                                rows={3}
                                placeholder="例如：Cognitive Appraisal, James-Lange, amygdala"
                                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                                用逗号或换行分隔。专业术语会提高识别针对性，也会增加转写用量。
                              </span>
                            </label>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleTranscribe}
                            disabled={isTranscribing || !audioUrl}
                            className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isTranscribing
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <AudioLines className="w-4 h-4" />}
                            {isTranscribing
                              ? '正在高精度转写'
                              : selected.transcriptionStatus === 'ready'
                                ? '重新转写'
                                : selected.transcriptionStatus === 'error'
                                  ? '重试转写'
                                  : '开始高精度转写'}
                          </button>
                          {isTranscribing && (
                            <span className="text-xs text-slate-400">
                              长录音需要一些时间，完成前请保持本页开启。
                            </span>
                          )}
                        </div>

                        {selected.transcriptionStatus === 'error' && selected.transcriptionError && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{selected.transcriptionError}</span>
                          </div>
                        )}

                        {selected.transcriptionStatus === 'ready' && selected.audioQuality && (
                          <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                            selected.audioQuality.rating === 'good'
                              ? 'bg-emerald-50 text-emerald-700'
                              : selected.audioQuality.rating === 'fair'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                          }`}>
                            {selected.audioQuality.rating === 'good'
                              ? <Check className="w-4 h-4 mt-0.5 shrink-0" />
                              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <span>
                              <strong>录音质量估计 {selected.audioQuality.score}/100：</strong>
                              {selected.audioQuality.message}
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {selected.structuredNotes && (
                    <LectureStructuredNotesView
                      notes={selected.structuredNotes}
                      onSeekEvidence={handleSeekEvidence}
                      getEvidencePage={(evidence) =>
                        getLecturePageAtElapsedMs(selected, evidence.startMs)
                      }
                      onOpenEvidencePage={
                        onOpenSourcePage
                          ? (_evidence, pageNumber) =>
                              onOpenSourcePage(selected, pageNumber)
                          : undefined
                      }
                    />
                  )}

                  <div className={selected.structuredNotes ? 'border-t border-stone-200 pt-5' : ''}>
                    <div className="flex items-center justify-between mb-1">
                      {editingId === selected.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="保存"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 text-slate-400 hover:bg-stone-100 rounded"
                            title="取消"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-slate-400">
                            {getLectureDisplayName(selected)}
                          </p>
                          {onRename && (
                            <button
                              onClick={() => handleStartEdit(selected)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                              title="重命名"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRawTranscriptOpen((current) => !current)}
                      className="mt-2 flex w-full items-center justify-between gap-4 border-y border-stone-200 py-3 text-left transition-colors hover:bg-stone-50/70"
                      aria-expanded={rawTranscriptOpen}
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-700">
                          {selected.transcriptSegments?.length ? '原始课堂转写' : selected.audioRecordingId ? '临时文字预览' : '课堂转写'}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          证据底稿不会被 AI 整理覆盖，可随时展开核对原话。
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500">
                        {selected.transcriptSegments?.length
                          ? `${selected.transcriptSegments.length} 段`
                          : selected.transcript.length
                            ? `${selected.transcript.length} 条`
                            : '暂无内容'}
                        {rawTranscriptOpen
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </button>

                    {rawTranscriptOpen && (
                      <div className="mt-4">
                        {selected.transcriptSegments?.length ? (
                          <div className="space-y-3">
                            {selected.transcriptSegments.map((segment) => (
                              <article
                                key={segment.id}
                                ref={(element) => {
                                  segmentElementRefs.current[segment.id] = element;
                                }}
                                className="rounded-xl border border-stone-100 bg-white px-4 py-3 scroll-mt-6"
                              >
                                <div className="mb-2 flex items-center gap-2 text-xs">
                                  <span className="rounded-md bg-indigo-50 px-2 py-1 font-bold text-indigo-700">
                                    {segment.speakerLabel}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-slate-400">
                                    <Clock3 className="w-3.5 h-3.5" />
                                    {formatSegmentTime(segment.startMs)}
                                  </span>
                                </div>
                                <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{segment.text}</p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {selected.transcript.length === 0
                              ? selected.audioRecordingId
                                ? '音频已保存。点击上方“开始高精度转写”后，会在这里显示讲者、时间戳和转写正文。'
                                : '（本堂课暂无转写内容）'
                              : selected.transcript.map((t) => t.text).join('')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!selected.structuredNotes && ((displaySummary != null && displaySummary !== '') || (onOrganize && organizingId === selected.id)) ? (
                    <div className="pt-4 border-t border-stone-200">
                      <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-rose-500" />
                        AI 整理
                      </h3>
                      {organizingId === selected.id && !displaySummary ? (
                        <p className="text-slate-500 text-sm">正在整理...</p>
                      ) : (
                        <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed bg-rose-50/50 rounded-xl p-4">
                          {displaySummary}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {onOrganize && (
                <div className="shrink-0 px-6 py-4 border-t border-stone-200 bg-white/80">
                  <button
                    onClick={() => onOrganize(selected)}
                    disabled={
                      organizingId === selected.id
                      || (selected.transcript.length === 0 && !selected.transcriptSegments?.length)
                    }
                    className="px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 disabled:opacity-50 transition-colors"
                  >
                    {organizingId === selected.id
                      ? '正在生成课堂复习包...'
                      : selected.structuredNotes
                        ? '重新生成课堂复习包'
                        : selected.transcriptSegments?.length
                          ? '生成课堂复习包'
                          : '用 AI 生成课堂复习包'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              左侧选择一堂课查看转写
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
