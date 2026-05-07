/**
 * 递进阅读模式 — 树状 UI(三轮 zoom in 共用一棵树)。
 *
 * 设计原则(来自 LAYERED_READING_PLAN.md §3.2):
 * - module → branch → detail 三层 zoom in,同一棵树越长越深(交互维度 a)
 * - 用户主动点「展开到 Round X」按钮才推进(交互维度 c,铁律 9)
 * - Round 2/3 内容含溯源标签可跳转 PDF(铁律 6)
 * - Round 2/3 内容**按需生成**——不点不调 AI(避免一次性把 1×N×M 全生成)
 * - 每 module 节点下挂 ModuleChatBox(铁律 7)
 */

import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type {
  LayeredReadingChatMessage,
  LayeredReadingModule,
  LayeredReadingRound2Branch,
  LayeredReadingRound3Detail,
} from '@/types';
import {
  generateLayeredRound2Branches,
  generateLayeredRound3Details,
} from '@/services/geminiService';
import { RoundContentWithSource } from '@/features/reader/layered/RoundContentWithSource';
import { ModuleChatBox } from '@/features/reader/layered/ModuleChatBox';

export interface LayeredReadingTreeProps {
  modules: LayeredReadingModule[];
  fullText: string | null;
  pdfDataUrl: string | null;
  globalChatHistory: LayeredReadingChatMessage[];
  /** 写入单个 module 的 immutable updater */
  onUpdateModule: (
    moduleId: string,
    updater: (m: LayeredReadingModule) => LayeredReadingModule
  ) => void;
  /** 追加 chat 消息到 globalChatHistory */
  onAppendChatMessage: (msg: LayeredReadingChatMessage) => void;
  /** 跳转 PDF 到指定页(1-based);未传时溯源标签只显示不可点击 */
  onJumpToPage?: (page1Based: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  term: '术语',
  experiment: '实验',
  figure: '图表',
  evidence: '证据',
  comparison: '对比',
};

export const LayeredReadingTree: React.FC<LayeredReadingTreeProps> = ({
  modules,
  fullText,
  pdfDataUrl,
  globalChatHistory,
  onUpdateModule,
  onAppendChatMessage,
  onJumpToPage,
}) => {
  // 本地 UI 态:展开/折叠(不持久化,刷新页面会折叠回)
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(new Set());
  const [expandedBranchIds, setExpandedBranchIds] = useState<Set<string>>(new Set());
  // AI 调用中态
  const [generatingRound2For, setGeneratingRound2For] = useState<Set<string>>(new Set());
  const [generatingRound3For, setGeneratingRound3For] = useState<Set<string>>(new Set());
  // 错误态
  const [round2Errors, setRound2Errors] = useState<Record<string, string>>({});
  const [round3Errors, setRound3Errors] = useState<Record<string, string>>({});

  const docSource = pdfDataUrl ?? fullText ?? '';
  const hasDoc = docSource.length > 0;

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  const toggleBranch = useCallback((branchId: string) => {
    setExpandedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }, []);

  const handleExpandToRound2 = useCallback(
    async (m: LayeredReadingModule) => {
      // 已有 branches → 仅展开,不重复调 AI
      if (m.round2Branches && m.round2Branches.length > 0) {
        setExpandedModuleIds((prev) => new Set(prev).add(m.id));
        return;
      }
      if (!hasDoc) {
        setRound2Errors((prev) => ({ ...prev, [m.id]: '未加载 PDF 内容。' }));
        return;
      }
      setGeneratingRound2For((prev) => new Set(prev).add(m.id));
      setRound2Errors((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      try {
        const branches = await generateLayeredRound2Branches(docSource, m);
        if (!branches || branches.length === 0) {
          setRound2Errors((prev) => ({
            ...prev,
            [m.id]: 'AI 生成 Round 2 失败,请重试。',
          }));
          return;
        }
        onUpdateModule(m.id, (mod) => ({ ...mod, round2Branches: branches }));
        // 自动展开 module 让用户立即看到子枝干
        setExpandedModuleIds((prev) => new Set(prev).add(m.id));
      } catch (e) {
        console.error('handleExpandToRound2', e);
        setRound2Errors((prev) => ({ ...prev, [m.id]: 'AI 调用异常,请重试。' }));
      } finally {
        setGeneratingRound2For((prev) => {
          const next = new Set(prev);
          next.delete(m.id);
          return next;
        });
      }
    },
    [hasDoc, docSource, onUpdateModule]
  );

  const handleExpandToRound3 = useCallback(
    async (parentModule: LayeredReadingModule, branch: LayeredReadingRound2Branch) => {
      // 已有 details → 仅展开
      if (branch.round3Details && branch.round3Details.length > 0) {
        setExpandedBranchIds((prev) => new Set(prev).add(branch.id));
        return;
      }
      if (!hasDoc) {
        setRound3Errors((prev) => ({ ...prev, [branch.id]: '未加载 PDF 内容。' }));
        return;
      }
      setGeneratingRound3For((prev) => new Set(prev).add(branch.id));
      setRound3Errors((prev) => {
        const next = { ...prev };
        delete next[branch.id];
        return next;
      });
      try {
        const details = await generateLayeredRound3Details(docSource, parentModule, branch);
        if (!details || details.length === 0) {
          setRound3Errors((prev) => ({
            ...prev,
            [branch.id]: 'AI 生成 Round 3 失败,或讲义中无明确细节(铁律 6:AI 选择不编造)。',
          }));
          return;
        }
        onUpdateModule(parentModule.id, (mod) => ({
          ...mod,
          round2Branches: (mod.round2Branches ?? []).map((b) =>
            b.id === branch.id ? { ...b, round3Details: details } : b
          ),
        }));
        setExpandedBranchIds((prev) => new Set(prev).add(branch.id));
      } catch (e) {
        console.error('handleExpandToRound3', e);
        setRound3Errors((prev) => ({ ...prev, [branch.id]: 'AI 调用异常,请重试。' }));
      } finally {
        setGeneratingRound3For((prev) => {
          const next = new Set(prev);
          next.delete(branch.id);
          return next;
        });
      }
    },
    [hasDoc, docSource, onUpdateModule]
  );

  return (
    <div className="space-y-2">
      {modules.map((m) => {
        const isModuleExpanded = expandedModuleIds.has(m.id);
        const round2Generating = generatingRound2For.has(m.id);
        const round2Error = round2Errors[m.id];
        const hasBranches = (m.round2Branches?.length ?? 0) > 0;
        return (
          <div key={m.id} className="rounded-md border border-stone-200 bg-white">
            {/* === Module 头(Round 1) === */}
            <button
              type="button"
              onClick={() => toggleModule(m.id)}
              className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-stone-50"
            >
              <span className="text-stone-400 text-sm shrink-0 mt-0.5">
                {isModuleExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800">
                  {m.index}. {m.storyTitle}
                </div>
                {m.pageRange && (
                  <div className="text-[10px] text-stone-400 mt-0.5">第 {m.pageRange} 页</div>
                )}
              </div>
            </button>
            {isModuleExpanded && (
              <div className="border-t border-stone-100">
                {/* Round 1 内容 */}
                <div className="px-3 py-2">
                  {m.round1Content ? (
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {m.round1Content}
                    </div>
                  ) : (
                    <div className="text-xs text-stone-400">(未生成 Round 1 内容,请回到 module 列表点开后等待自动生成)</div>
                  )}
                </div>

                {/* === Round 2 操作 === */}
                <div className="px-3 pb-2 border-t border-stone-100 pt-2">
                  {!hasBranches && !round2Generating && !round2Error && (
                    <button
                      type="button"
                      onClick={() => void handleExpandToRound2(m)}
                      disabled={!hasDoc}
                      className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      展开到 Round 2 →
                    </button>
                  )}
                  {round2Generating && (
                    <div className="text-xs text-stone-500 inline-flex items-center gap-2 py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AI 正在生成 Round 2 子枝干…
                    </div>
                  )}
                  {round2Error && (
                    <div className="space-y-1">
                      <p className="text-xs text-rose-600">{round2Error}</p>
                      <button
                        type="button"
                        onClick={() => void handleExpandToRound2(m)}
                        className="text-xs px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        重试
                      </button>
                    </div>
                  )}

                  {/* Round 2 子枝干列表 */}
                  {hasBranches && (
                    <div className="space-y-1.5 ml-2 border-l-2 border-stone-100 pl-3">
                      {(m.round2Branches ?? []).map((b) => {
                        const isBranchExpanded = expandedBranchIds.has(b.id);
                        const round3Generating = generatingRound3For.has(b.id);
                        const round3Error = round3Errors[b.id];
                        const hasDetails = (b.round3Details?.length ?? 0) > 0;
                        return (
                          <div key={b.id} className="rounded border border-stone-100 bg-stone-50/40">
                            {/* === Branch 头(Round 2) === */}
                            <button
                              type="button"
                              onClick={() => toggleBranch(b.id)}
                              className="w-full text-left px-2.5 py-1.5 flex items-start gap-1.5 hover:bg-white"
                            >
                              <span className="text-stone-400 text-xs shrink-0 mt-0.5">
                                {isBranchExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-700">
                                  {m.index}.{b.index} {b.title}
                                </div>
                              </div>
                            </button>
                            {isBranchExpanded && (
                              <div className="border-t border-stone-100 px-2.5 py-2 space-y-2">
                                {/* Round 2 内容 + 溯源 */}
                                {b.content && (
                                  <RoundContentWithSource
                                    content={b.content}
                                    sourcePage={b.sourcePage}
                                    sourceLocation={b.sourceLocation}
                                    onJumpToPage={onJumpToPage}
                                  />
                                )}

                                {/* === Round 3 操作 === */}
                                {!hasDetails && !round3Generating && !round3Error && (
                                  <button
                                    type="button"
                                    onClick={() => void handleExpandToRound3(m, b)}
                                    disabled={!hasDoc}
                                    className="text-[11px] px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    展开到 Round 3 →
                                  </button>
                                )}
                                {round3Generating && (
                                  <div className="text-[11px] text-stone-500 inline-flex items-center gap-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    AI 正在挂载细节…
                                  </div>
                                )}
                                {round3Error && (
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-rose-600">{round3Error}</p>
                                    <button
                                      type="button"
                                      onClick={() => void handleExpandToRound3(m, b)}
                                      className="text-[11px] px-1.5 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                                    >
                                      重试
                                    </button>
                                  </div>
                                )}

                                {/* Round 3 细节列表 */}
                                {hasDetails && (
                                  <div className="space-y-1.5 ml-2 border-l-2 border-stone-100 pl-2.5">
                                    {(b.round3Details ?? []).map((d: LayeredReadingRound3Detail) => (
                                      <div key={d.id} className="text-xs text-slate-700 space-y-1">
                                        <div className="inline-flex items-center gap-1.5">
                                          <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                                            {KIND_LABELS[d.kind] ?? d.kind}
                                          </span>
                                          <span className="font-bold text-slate-800">{d.label}</span>
                                        </div>
                                        <RoundContentWithSource
                                          content={d.description}
                                          sourcePage={d.sourcePage}
                                          sourceLocation={d.sourceLocation}
                                          onJumpToPage={onJumpToPage}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* === ModuleChatBox(铁律 7) === */}
                <ModuleChatBox
                  moduleId={m.id}
                  modules={modules}
                  globalChatHistory={globalChatHistory}
                  onAppendChatMessage={onAppendChatMessage}
                  fullText={fullText}
                  pdfDataUrl={pdfDataUrl}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
