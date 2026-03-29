/**
 * M5：学习证据 / 本场报告（探测链 + 对话摘录 + Markdown 复制）
 */
import React, { useMemo, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { LSAPContentMap, LSAPState } from '../types';
import type { WorkspaceDialogueTurn } from '../utils/examWorkspaceLsapKey';

export function conflictPageHintText(page: number): string {
  return `可能与讲义第 ${page} 页不一致，请核对（非像素级 OCR，以原 PDF 为准）。`;
}

export function ConflictPageHint({
  page,
  variant = 'default',
}: {
  page: number;
  variant?: 'default' | 'strong';
}) {
  return (
    <p
      className={`text-[13px] rounded-xl px-3 py-2 border leading-relaxed ${
        variant === 'strong'
          ? 'bg-rose-50 border-rose-200 text-rose-900 font-medium'
          : 'bg-amber-50/90 border-amber-200/80 text-amber-950'
      }`}
    >
      {conflictPageHintText(page)}
    </p>
  );
}

function kcName(map: LSAPContentMap, kcId: string): string {
  return map.kcs.find((k) => k.id === kcId)?.concept ?? kcId;
}

function correctLabel(c: boolean | 'partial'): string {
  if (c === true) return '正确';
  if (c === 'partial') return '部分正确';
  return '错误';
}

export function buildWorkspaceEvidenceMarkdown(params: {
  examTitle: string;
  workspaceKeyShort: string;
  contentMap: LSAPContentMap;
  state: LSAPState;
  predictedScoreNow: number | null;
  dialogueTranscript: WorkspaceDialogueTurn[];
}): string {
  const { examTitle, workspaceKeyShort, contentMap, state, predictedScoreNow, dialogueTranscript } = params;
  const lines: string[] = [];
  lines.push(`# 备考工作台 · 学习证据报告`);
  lines.push('');
  lines.push(`- **考试**：${examTitle || '—'}`);
  lines.push(`- **本场存档标识（摘要）**：\`${workspaceKeyShort}\``);
  lines.push(`- **最后更新时间**：${new Date(state.lastUpdated).toLocaleString()}`);
  lines.push(`- **预测分（当前加权）**：${predictedScoreNow ?? '—'}`);
  lines.push(`- **上次保存的预测分**：${state.lastPredictedScore}`);
  lines.push('');

  lines.push(`## 结业探测记录`);
  const probes = [...state.probeHistory].sort((a, b) => b.timestamp - a.timestamp);
  if (probes.length === 0) {
    lines.push('（暂无）');
  } else {
    probes.forEach((p, i) => {
      lines.push(`### ${i + 1}. ${kcName(contentMap, p.kcId)}`);
      lines.push(`- **时间**：${new Date(p.timestamp).toLocaleString()}`);
      lines.push(`- **结果**：${correctLabel(p.correct)}`);
      lines.push(`- **题目**：${p.question.replace(/\n/g, ' ')}`);
      lines.push(`- **作答摘要**：${p.userAnswer.replace(/\n/g, ' ').slice(0, 500)}${p.userAnswer.length > 500 ? '…' : ''}`);
      if (p.evidence) lines.push(`- **依据**：${p.evidence}`);
      if (p.sourcePage != null) lines.push(`- **讲义核对**：${conflictPageHintText(p.sourcePage)}`);
      lines.push('');
    });
  }

  lines.push(`## 对话摘录`);
  const turns = dialogueTranscript ?? [];
  if (turns.length === 0) {
    lines.push('（暂无；对话留痕在发送后写入 bundle）');
  } else {
    const sorted = [...turns].sort((a, b) => a.timestamp - b.timestamp);
    sorted.forEach((t, i) => {
      const who = t.role === 'user' ? '学生' : '助教';
      const kc = t.kcId ? ` · KC=${t.kcId}` : '';
      lines.push(`### ${i + 1}. ${who}${kc} · ${new Date(t.timestamp).toLocaleString()}`);
      lines.push(t.text);
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('*本报告由客户端生成，不含 API 密钥；请勿向不可信方粘贴含个人隐私的内容。*');
  return lines.join('\n');
}

export interface WorkspaceEvidenceReportModalProps {
  open: boolean;
  onClose: () => void;
  examTitle: string;
  /** workspaceLsapKey 的短展示（如后 12 位） */
  workspaceKeyShort: string;
  contentMap: LSAPContentMap;
  state: LSAPState;
  predictedScore: number | null;
  dialogueTranscript: WorkspaceDialogueTurn[];
}

export const WorkspaceEvidenceReportModal: React.FC<WorkspaceEvidenceReportModalProps> = ({
  open,
  onClose,
  examTitle,
  workspaceKeyShort,
  contentMap,
  state,
  predictedScore,
  dialogueTranscript,
}) => {
  const [copied, setCopied] = useState(false);

  const md = useMemo(
    () =>
      buildWorkspaceEvidenceMarkdown({
        examTitle,
        workspaceKeyShort,
        contentMap,
        state,
        predictedScoreNow: predictedScore,
        dialogueTranscript,
      }),
    [examTitle, workspaceKeyShort, contentMap, state, predictedScore, dialogueTranscript]
  );

  const probesSorted = useMemo(
    () => [...state.probeHistory].sort((a, b) => b.timestamp - a.timestamp),
    [state.probeHistory]
  );

  const dialogueSorted = useMemo(
    () => [...dialogueTranscript].sort((a, b) => a.timestamp - b.timestamp),
    [dialogueTranscript]
  );

  const empty = probesSorted.length === 0 && dialogueSorted.length === 0;

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert('复制失败，请手动全选复制。');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 font-sans antialiased">
      <button type="button" className="absolute inset-0 bg-slate-900/45" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        className="relative w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl border border-stone-200/90 bg-[#FFFBF7] shadow-2xl flex flex-col text-slate-800"
      >
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight font-sans">学习证据</h2>
            <p className="text-sm text-slate-500 mt-0.5 leading-snug">本场报告 · 探测与对话留痕</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-100 text-slate-600 hover:bg-stone-200 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 text-[15px] leading-relaxed">
          <section className="rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 shadow-sm">
            <dl className="space-y-2.5 text-[15px]">
              <div className="flex flex-col sm:flex-row sm:gap-3 sm:items-baseline">
                <dt className="text-slate-500 shrink-0 sm:w-36">考试名称</dt>
                <dd className="text-slate-900 font-medium">{examTitle || '—'}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-3 sm:items-baseline">
                <dt className="text-slate-500 shrink-0 sm:w-36">存档标识</dt>
                <dd>
                  <code className="text-[13px] bg-stone-100 text-slate-800 px-2 py-0.5 rounded-md font-mono">
                    {workspaceKeyShort}
                  </code>
                </dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-3 sm:items-baseline">
                <dt className="text-slate-500 shrink-0 sm:w-36">最后更新</dt>
                <dd className="text-slate-800 tabular-nums">{new Date(state.lastUpdated).toLocaleString()}</dd>
              </div>
              <div className="flex flex-col sm:flex-row sm:gap-3 sm:items-baseline pt-1 border-t border-stone-100">
                <dt className="text-slate-500 shrink-0 sm:w-36">预测分</dt>
                <dd className="text-slate-800">
                  当前（加权）{' '}
                  <span className="font-semibold text-indigo-700 tabular-nums">{predictedScore ?? '—'}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  上次保存 <span className="font-medium tabular-nums">{state.lastPredictedScore}</span>
                </dd>
              </div>
            </dl>
          </section>

          {empty && (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-10 text-center">
              <p className="text-slate-600 text-[15px] leading-relaxed max-w-sm mx-auto">
                完成一次「结业探测」或在下方对话后，证据会自动汇总到这里；刷新页面后仍可从本场存档读取。
              </p>
            </div>
          )}

          {probesSorted.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-stone-200 pb-2">结业探测记录</h3>
              <ul className="space-y-3">
                {probesSorted.map((p) => (
                  <li
                    key={`${p.timestamp}-${p.question.slice(0, 20)}`}
                    className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2 shadow-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2 items-start">
                      <span className="text-[13px] text-slate-500 tabular-nums">
                        {new Date(p.timestamp).toLocaleString()}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{kcName(contentMap, p.kcId)}</span>
                    </div>
                    <p className="text-[15px]">
                      <span className="text-slate-500">结果</span>{' '}
                      <span className="font-medium text-slate-900">{correctLabel(p.correct)}</span>
                    </p>
                    <details className="text-[15px] text-slate-700">
                      <summary className="cursor-pointer text-indigo-700 font-medium marker:text-indigo-400">
                        题目
                      </summary>
                      <p className="mt-2 pl-3 border-l-2 border-indigo-100 whitespace-pre-wrap text-slate-700">
                        {p.question}
                      </p>
                    </details>
                    <details className="text-[15px] text-slate-700">
                      <summary className="cursor-pointer text-slate-700 font-medium marker:text-slate-400">你的作答</summary>
                      <p className="mt-2 pl-3 border-l-2 border-stone-200 whitespace-pre-wrap text-slate-600">
                        {p.userAnswer}
                      </p>
                    </details>
                    {p.evidence && (
                      <p className="text-[14px] text-slate-600 pt-1">
                        <span className="text-slate-500">阅卷依据：</span>
                        {p.evidence}
                      </p>
                    )}
                    {p.sourcePage != null && (
                      <ConflictPageHint page={p.sourcePage} variant={p.correct === false ? 'strong' : 'default'} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dialogueSorted.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-stone-200 pb-2">对话摘录</h3>
              <ul className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                {dialogueSorted.map((t, i) => (
                  <li
                    key={`${t.timestamp}-${i}`}
                    className={`rounded-2xl px-4 py-3 text-[15px] border ${
                      t.role === 'user'
                        ? 'bg-indigo-50/90 border-indigo-100/80'
                        : 'bg-stone-50 border-stone-100'
                    }`}
                  >
                    <p className="text-[13px] text-slate-500 mb-1.5 leading-normal">
                      <span className="font-medium text-slate-600">{t.role === 'user' ? '你' : '助教'}</span>
                      {t.kcId ? (
                        <>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <span>{kcName(contentMap, t.kcId)}</span>
                        </>
                      ) : null}
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span className="tabular-nums">{new Date(t.timestamp).toLocaleString()}</span>
                    </p>
                    <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{t.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="shrink-0 border-t border-stone-200 px-4 py-3 bg-white flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copyMd()}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white font-medium text-[15px] hover:bg-indigo-700 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : '复制 Markdown 报告'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl bg-stone-100 text-slate-800 font-medium text-[15px] hover:bg-stone-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
