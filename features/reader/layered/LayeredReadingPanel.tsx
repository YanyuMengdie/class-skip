/**
 * 递进阅读模式(layered reading)—— 阶段 3 容器版
 *
 * 设计原则:
 * - 与 SkimPanel 数据完全独立(铁律 2):不读 / 不写 FilePersistedState.studyMap
 * - 与 chatWithSkimAdaptiveTutor / chatWithAdaptiveTutor 完全隔离(铁律 1)
 * - 不分 STEM / HUMANITIES(铁律 5)
 *
 * 阶段 3 改造:
 * - 本组件从"渲染整棵 module 列表"下放到 LayeredReadingTree
 * - 本组件保留:空状态(选数 + 开始)、Round 1 懒加载、顶部进度条、state 写入 helper
 * - 新增 props:onJumpToPage(铁律 6 溯源跳转)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  LayeredReadingChatMessage,
  LayeredReadingModule,
  LayeredReadingState,
} from '@/types';
import {
  generateLayeredReadingModules,
  generateLayeredRound1Content,
} from '@/services/geminiService';
import { LayeredReadingTree } from '@/features/reader/layered/LayeredReadingTree';

export interface LayeredReadingPanelProps {
  fullText: string | null;
  pdfDataUrl: string | null;
  fileName: string | null;
  layeredReadingState: LayeredReadingState | null;
  setLayeredReadingState: React.Dispatch<React.SetStateAction<LayeredReadingState | null>>;
  /** 阶段 3 新增(铁律 6):溯源标签点击跳转 PDF 的回调 */
  onJumpToPage?: (page1Based: number) => void;
}

const MODULE_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7] as const;
const DEFAULT_MODULE_COUNT = 4;

export const LayeredReadingPanel: React.FC<LayeredReadingPanelProps> = ({
  fullText,
  pdfDataUrl,
  layeredReadingState,
  setLayeredReadingState,
  onJumpToPage,
}) => {
  const [selectedModuleCount, setSelectedModuleCount] = useState<number>(DEFAULT_MODULE_COUNT);
  const [isGeneratingModules, setIsGeneratingModules] = useState(false);
  const [moduleGenError, setModuleGenError] = useState<string | null>(null);
  /** Round 1 懒加载状态 */
  const [generatingRound1Ids, setGeneratingRound1Ids] = useState<Set<string>>(new Set());
  const [round1Errors, setRound1Errors] = useState<Record<string, string>>({});
  /** 阶段 2 沿用:Panel 自身的"已展开过 Round 1"集合(用于 panel 自动触发 Round 1 懒加载) */
  const [moduleIdsSeenForRound1, setModuleIdsSeenForRound1] = useState<Set<string>>(new Set());

  const docSource = pdfDataUrl ?? fullText ?? '';
  const hasDoc = docSource.length > 0;

  // ─── helpers:state immutable updaters ───
  const updateModule = useCallback(
    (moduleId: string, updater: (m: LayeredReadingModule) => LayeredReadingModule) => {
      setLayeredReadingState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          modules: prev.modules.map((m) => (m.id === moduleId ? updater(m) : m)),
        };
      });
    },
    [setLayeredReadingState]
  );

  const appendChatMessage = useCallback(
    (msg: LayeredReadingChatMessage) => {
      setLayeredReadingState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          globalChatHistory: [...(prev.globalChatHistory ?? []), msg],
        };
      });
    },
    [setLayeredReadingState]
  );

  // ─── 顶部进度条:三轮各自 N/M ───
  const progress = useMemo(() => {
    if (!layeredReadingState) {
      return {
        round1: { done: 0, total: 0 },
        round2: { done: 0, total: 0 },
        round3: { done: 0, total: 0 },
      };
    }
    const modules = layeredReadingState.modules;
    const round1Total = modules.length;
    const round1Done = modules.filter((m) => !!m.round1Content).length;
    const round2Total = modules.length;
    const round2Done = modules.filter(
      (m) => Array.isArray(m.round2Branches) && m.round2Branches.length > 0
    ).length;
    let round3Total = 0;
    let round3Done = 0;
    for (const m of modules) {
      for (const b of m.round2Branches ?? []) {
        round3Total += 1;
        if (Array.isArray(b.round3Details) && b.round3Details.length > 0) round3Done += 1;
      }
    }
    return {
      round1: { done: round1Done, total: round1Total },
      round2: { done: round2Done, total: round2Total },
      round3: { done: round3Done, total: round3Total },
    };
  }, [layeredReadingState]);

  /** 同步 progressSnapshot 到持久化(铁律 7 数据持久化要求) */
  useEffect(() => {
    if (!layeredReadingState) return;
    const snap = layeredReadingState.progressSnapshot;
    if (
      snap &&
      snap.round1.done === progress.round1.done &&
      snap.round1.total === progress.round1.total &&
      snap.round2.done === progress.round2.done &&
      snap.round2.total === progress.round2.total &&
      snap.round3.done === progress.round3.done &&
      snap.round3.total === progress.round3.total
    ) {
      return; // 无变化,免无谓 setState
    }
    setLayeredReadingState((prev) => {
      if (!prev) return prev;
      return { ...prev, progressSnapshot: progress };
    });
  }, [progress, layeredReadingState, setLayeredReadingState]);

  // ─── 模块列表生成 ───
  const handleStartGeneration = useCallback(async () => {
    if (!hasDoc) {
      setModuleGenError('未加载 PDF 内容,无法开始递进阅读。');
      return;
    }
    setIsGeneratingModules(true);
    setModuleGenError(null);
    try {
      const modules = await generateLayeredReadingModules(docSource, {
        moduleCount: selectedModuleCount,
      });
      if (!modules || modules.length === 0) {
        setModuleGenError('AI 拆分失败,请重试或换一个 module 数。');
        return;
      }
      const nextState: LayeredReadingState = {
        modules,
        questions: [],
        globalChatHistory: [],
        createdAt: Date.now(),
      };
      setLayeredReadingState(nextState);
    } catch (e) {
      console.error('handleStartGeneration', e);
      setModuleGenError('AI 调用异常,请重试。');
    } finally {
      setIsGeneratingModules(false);
    }
  }, [hasDoc, docSource, selectedModuleCount, setLayeredReadingState]);

  // ─── Round 1 懒加载:用户首次展开 module 时调 ───
  const handleEnsureRound1 = useCallback(
    async (m: LayeredReadingModule) => {
      if (m.round1Content) return; // 已有
      if (generatingRound1Ids.has(m.id)) return; // 正在生成
      if (moduleIdsSeenForRound1.has(m.id) && round1Errors[m.id]) return; // 已失败,等用户手动重试
      if (!hasDoc) {
        setRound1Errors((prev) => ({ ...prev, [m.id]: '未加载 PDF 内容。' }));
        return;
      }
      setModuleIdsSeenForRound1((prev) => new Set(prev).add(m.id));
      setGeneratingRound1Ids((prev) => new Set(prev).add(m.id));
      setRound1Errors((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      try {
        const content = await generateLayeredRound1Content(docSource, m);
        if (!content) {
          setRound1Errors((prev) => ({ ...prev, [m.id]: 'AI 生成失败,请重试。' }));
          return;
        }
        updateModule(m.id, (mod) => ({ ...mod, round1Content: content }));
      } catch (e) {
        console.error('handleEnsureRound1', e);
        setRound1Errors((prev) => ({ ...prev, [m.id]: 'AI 调用异常,请重试。' }));
      } finally {
        setGeneratingRound1Ids((prev) => {
          const next = new Set(prev);
          next.delete(m.id);
          return next;
        });
      }
    },
    [hasDoc, docSource, generatingRound1Ids, moduleIdsSeenForRound1, round1Errors, updateModule]
  );

  /** 自动触发未生成的 Round 1(进入 panel 时为所有 module 触发,但有 dedupe 防重复) */
  useEffect(() => {
    if (!layeredReadingState) return;
    for (const m of layeredReadingState.modules) {
      if (!m.round1Content && !generatingRound1Ids.has(m.id) && !moduleIdsSeenForRound1.has(m.id)) {
        void handleEnsureRound1(m);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layeredReadingState?.modules]);

  // ─── 状态分支 1:还没开始(无 modules)→ module 数选数器 ───
  if (!layeredReadingState || layeredReadingState.modules.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white p-6">
        <div className="max-w-md w-full">
          <h2 className="text-base font-bold text-slate-700 mb-2">递进阅读模式</h2>
          <p className="text-xs text-stone-500 leading-relaxed mb-4">
            用三轮递进的方式理解这份 lecture:Round 1 大白话故事 → Round 2 结构展开 → Round 3 细节挂载。
            阶段 3 启用全部三轮,Round 2/3 内容含 PDF 溯源跳转。
          </p>
          <p className="text-xs font-semibold text-slate-600 mb-2">先选 module 数(2-7):</p>
          <div className="flex items-center gap-1.5 mb-4">
            {MODULE_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelectedModuleCount(n)}
                disabled={isGeneratingModules}
                className={`w-9 h-9 rounded-md border text-sm font-bold transition-colors ${
                  selectedModuleCount === n
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-600 border-stone-200 hover:bg-stone-50'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleStartGeneration}
            disabled={isGeneratingModules || !hasDoc}
            className="w-full py-2 rounded-md bg-slate-700 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {isGeneratingModules ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI 正在拆分讲义…(预计 10-30 秒)
              </>
            ) : (
              '开始递进阅读'
            )}
          </button>
          {!hasDoc && (
            <p className="text-xs text-amber-700 mt-2">未加载 PDF 内容。请先在主界面打开一份 PDF。</p>
          )}
          {moduleGenError && <p className="text-xs text-rose-600 mt-2">{moduleGenError}</p>}
        </div>
      </div>
    );
  }

  // ─── 状态分支 2:已有 modules → 进度条 + 树状 UI ───
  const round1Errored = Object.keys(round1Errors).length > 0;
  const anyRound1Generating = generatingRound1Ids.size > 0;

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* 顶部进度条 + 标题 */}
      <div className="shrink-0 border-b border-stone-200 px-4 py-2 bg-stone-50/80 space-y-1">
        <p className="text-xs font-bold text-slate-600">
          递进阅读 · 共 {layeredReadingState.modules.length} 个 module
        </p>
        <div className="text-[10px] text-stone-500 space-y-0.5 font-mono">
          <ProgressLine label="Round 1" done={progress.round1.done} total={progress.round1.total} />
          <ProgressLine label="Round 2" done={progress.round2.done} total={progress.round2.total} />
          <ProgressLine label="Round 3" done={progress.round3.done} total={progress.round3.total} />
        </div>
        {anyRound1Generating && (
          <div className="text-[10px] text-stone-500 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI 正在生成 Round 1 故事({generatingRound1Ids.size} 个 module 进行中)…
          </div>
        )}
        {round1Errored && (
          <p className="text-[10px] text-rose-600">部分 module 的 Round 1 生成失败,请刷新页面或检查网络。</p>
        )}
      </div>
      {/* 树状 UI */}
      <div className="flex-1 overflow-y-auto p-3">
        <LayeredReadingTree
          modules={layeredReadingState.modules}
          fullText={fullText}
          pdfDataUrl={pdfDataUrl}
          globalChatHistory={layeredReadingState.globalChatHistory ?? []}
          onUpdateModule={updateModule}
          onAppendChatMessage={appendChatMessage}
          onJumpToPage={onJumpToPage}
        />
      </div>
    </div>
  );
};

const ProgressLine: React.FC<{ label: string; done: number; total: number }> = ({
  label,
  done,
  total,
}) => {
  const filled = total > 0 ? Math.round((done / total) * 6) : 0;
  const empty = 6 - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);
  return (
    <div>
      {label} {bar} {done}/{total}
    </div>
  );
};
