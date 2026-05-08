/**
 * 递进阅读模式 — 树状 UI(三轮 zoom in 共用一棵树)。
 *
 * 设计原则(来自 LAYERED_READING_PLAN.md §3.2 + §3.4 阶段 4):
 * - module → branch → detail 三层 zoom in,同一棵树越长越深(交互维度 a)
 * - 用户主动点「展开到 Round X」按钮才推进(交互维度 c,铁律 11)
 * - Round 2/3 内容含溯源标签可跳转 PDF(铁律 6)
 * - Round 2/3 内容**按需生成**——不点不调 AI(避免一次性把 1×N×M 全生成)
 * - 每 module 节点下挂 ModuleChatBox(铁律 7)
 * - 每 module Round 1 末 / 每 branch Round 2 末 / 每 branch Round 3 末挂 QuestionBox(铁律 8/9)
 *
 * 事件驱动 lastVisited(澄清 D 6 条):
 * - toggleModule(展开)→ {round: 1}
 * - 展开到 Round 2 成功 → {round: 2, branchId}
 * - toggleBranch(展开)→ {round: 2, branchId}
 * - 展开到 Round 3 成功 → {round: 3, branchId}
 * - 答题/跳过完成 → 按题型挂载点
 * - 点溯源跳 PDF → 不更新(澄清 D)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type {
  LayeredReadingChatMessage,
  LayeredReadingLastVisited,
  LayeredReadingModule,
  LayeredReadingQuestion,
  LayeredReadingQuestionType,
  LayeredReadingRound2Branch,
  LayeredReadingRound3Detail,
} from '@/types';
import {
  generateLayeredRound2Branches,
  generateLayeredRound3Details,
  generateLayeredRound3Unit,
} from '@/services/geminiService';
import { RoundContentWithSource } from '@/features/reader/layered/RoundContentWithSource';
import { ModuleChatBox } from '@/features/reader/layered/ModuleChatBox';
import { LayeredReadingQuestionBox } from '@/features/reader/layered/LayeredReadingQuestionBox';
import Round3UnitView from '@/features/reader/layered/Round3UnitView';
import LegacyRound3DetailsView from '@/features/reader/layered/LegacyRound3DetailsView';

export interface LayeredReadingTreeProps {
  modules: LayeredReadingModule[];
  fullText: string | null;
  pdfDataUrl: string | null;
  globalChatHistory: LayeredReadingChatMessage[];
  /** 阶段 4:题目数据(铁律 8 独立持久化) */
  questions: LayeredReadingQuestion[];
  /** 写入单个 module 的 immutable updater */
  onUpdateModule: (
    moduleId: string,
    updater: (m: LayeredReadingModule) => LayeredReadingModule
  ) => void;
  /** 追加 chat 消息到 globalChatHistory */
  onAppendChatMessage: (msg: LayeredReadingChatMessage) => void;
  /** 跳转 PDF 到指定页(1-based);未传时溯源标签只显示不可点击 */
  onJumpToPage?: (page1Based: number) => void;
  /** 阶段 4:题目动作 5 个 callbacks(由 Panel 实现) */
  onGenerateQuestion: (
    questionType: LayeredReadingQuestionType,
    parentModule: LayeredReadingModule,
    branch?: LayeredReadingRound2Branch
  ) => void;
  onSubmitQuestion: (questionId: string, userAnswer: string) => void;
  onSkipQuestion: (questionId: string) => void;
  onResetQuestion: (questionId: string) => void;
  /** 阶段 4:in-flight 状态(由 Panel 维护) */
  generatingQuestionIds: Set<string>;
  gradingQuestionIds: Set<string>;
  /** 阶段 4:lastVisited 触发回调(澄清 D 6 条事件) */
  onUpdateLastVisited: (lv: LayeredReadingLastVisited) => void;
  /** 阶段 4:从 banner"继续阅读"传入的展开目标(Tree 据此自动展开 + scroll) */
  expandTarget?: LayeredReadingLastVisited | null;
}

const KIND_LABELS: Record<string, string> = {
  term: '术语',
  experiment: '实验',
  figure: '图表',
  evidence: '证据',
  comparison: '对比',
};

/** 工具:根据 (attachedTo, questionType) 在 questions 数组里查找题目;约定 id = `${attachedTo}-${type}` */
function findQuestion(
  questions: LayeredReadingQuestion[],
  attachedTo: string,
  questionType: LayeredReadingQuestionType
): LayeredReadingQuestion | null {
  return (
    questions.find((q) => q.attachedTo === attachedTo && q.questionType === questionType) ?? null
  );
}

export const LayeredReadingTree: React.FC<LayeredReadingTreeProps> = ({
  modules,
  fullText,
  pdfDataUrl,
  globalChatHistory,
  questions,
  onUpdateModule,
  onAppendChatMessage,
  onJumpToPage,
  onGenerateQuestion,
  onSubmitQuestion,
  onSkipQuestion,
  onResetQuestion,
  generatingQuestionIds,
  gradingQuestionIds,
  onUpdateLastVisited,
  expandTarget,
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

  /** 阶段 4:expandTarget 由 banner 传入时自动展开 + scroll(澄清 D 继续阅读流程) */
  useEffect(() => {
    if (!expandTarget) return;
    setExpandedModuleIds((prev) => new Set(prev).add(expandTarget.moduleId));
    if (expandTarget.branchId) {
      setExpandedBranchIds((prev) => new Set(prev).add(expandTarget.branchId!));
    }
    // scroll 到对应节点
    const targetId = expandTarget.branchId ?? expandTarget.moduleId;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-layered-node-id="${targetId}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [expandTarget]);

  const toggleModule = useCallback(
    (m: LayeredReadingModule) => {
      setExpandedModuleIds((prev) => {
        const next = new Set(prev);
        if (next.has(m.id)) {
          next.delete(m.id);
          return next;
        }
        next.add(m.id);
        return next;
      });
      // lastVisited:展开 module = round 1(澄清 D)
      // 折叠时不更新(避免覆盖更精细的 round 2/3 进度)
      if (!expandedModuleIds.has(m.id)) {
        onUpdateLastVisited({
          moduleId: m.id,
          round: 1,
          lastUpdatedAt: Date.now(),
        });
      }
    },
    [expandedModuleIds, onUpdateLastVisited]
  );

  const toggleBranch = useCallback(
    (m: LayeredReadingModule, b: LayeredReadingRound2Branch) => {
      setExpandedBranchIds((prev) => {
        const next = new Set(prev);
        if (next.has(b.id)) {
          next.delete(b.id);
          return next;
        }
        next.add(b.id);
        return next;
      });
      // lastVisited:展开 branch = round 2(已有 round 3 details 时仍标 round 2,
      //  因为 toggleBranch 本身只代表"看到 branch 内容",不强制 round 3 解锁)
      if (!expandedBranchIds.has(b.id)) {
        onUpdateLastVisited({
          moduleId: m.id,
          round: 2,
          branchId: b.id,
          lastUpdatedAt: Date.now(),
        });
      }
    },
    [expandedBranchIds, onUpdateLastVisited]
  );

  const handleExpandToRound2 = useCallback(
    async (m: LayeredReadingModule) => {
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
        setExpandedModuleIds((prev) => new Set(prev).add(m.id));
        // lastVisited:展开到 Round 2 成功(澄清 D)
        onUpdateLastVisited({
          moduleId: m.id,
          round: 2,
          branchId: branches[0].id,
          lastUpdatedAt: Date.now(),
        });
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
    [hasDoc, docSource, onUpdateModule, onUpdateLastVisited]
  );

  const handleExpandToRound3 = useCallback(
    async (parentModule: LayeredReadingModule, branch: LayeredReadingRound2Branch) => {
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
        const unit = await generateLayeredRound3Unit(docSource, parentModule, branch);
        if (!unit) {
          setRound3Errors((prev) => ({
            ...prev,
            [branch.id]: 'AI 生成 Round 3 失败,或讲义中无足够内容(铁律 6:AI 选择不凑数)。',
          }));
          return;
        }
        onUpdateModule(parentModule.id, (mod) => ({
          ...mod,
          round2Branches: (mod.round2Branches ?? []).map((b) =>
            b.id === branch.id ? { ...b, round3Unit: unit } : b
          ),
        }));
        setExpandedBranchIds((prev) => new Set(prev).add(branch.id));
        // lastVisited:展开到 Round 3 成功(澄清 D)
        onUpdateLastVisited({
          moduleId: parentModule.id,
          round: 3,
          branchId: branch.id,
          lastUpdatedAt: Date.now(),
        });
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
    [hasDoc, docSource, onUpdateModule, onUpdateLastVisited]
  );

  return (
    <div className="space-y-2">
      {modules.map((m) => {
        const isModuleExpanded = expandedModuleIds.has(m.id);
        const round2Generating = generatingRound2For.has(m.id);
        const round2Error = round2Errors[m.id];
        const hasBranches = (m.round2Branches?.length ?? 0) > 0;
        const storyQuestion = findQuestion(questions, m.id, 'story');
        const storyQuestionId = `${m.id}-story`;
        return (
          <div
            key={m.id}
            data-layered-node-id={m.id}
            className="rounded-md border border-stone-200 bg-white"
          >
            {/* === Module 头(Round 1) === */}
            <button
              type="button"
              onClick={() => toggleModule(m)}
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

                {/* === Round 1 末故事题(铁律 8/9) === */}
                <div className="px-3">
                  <LayeredReadingQuestionBox
                    questionType="story"
                    question={storyQuestion}
                    isGenerating={generatingQuestionIds.has(storyQuestionId)}
                    isGrading={gradingQuestionIds.has(storyQuestionId)}
                    onGenerate={() => onGenerateQuestion('story', m)}
                    onSubmit={(ans) => onSubmitQuestion(storyQuestionId, ans)}
                    onSkip={() => onSkipQuestion(storyQuestionId)}
                    onResetAnswer={() => onResetQuestion(storyQuestionId)}
                  />
                </div>

                {/* === Round 2 操作 === */}
                <div className="px-3 pb-2 border-t border-stone-100 pt-2 mt-2">
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
                        const hasRound3 = Boolean(b.round3Unit) || (b.round3Details?.length ?? 0) > 0;
                        const structureQuestion = findQuestion(questions, b.id, 'structure');
                        const structureQuestionId = `${b.id}-structure`;
                        const applicationQuestion = findQuestion(questions, b.id, 'application');
                        const applicationQuestionId = `${b.id}-application`;
                        return (
                          <div
                            key={b.id}
                            data-layered-node-id={b.id}
                            className="rounded border border-stone-100 bg-stone-50/40"
                          >
                            {/* === Branch 头(Round 2) === */}
                            <button
                              type="button"
                              onClick={() => toggleBranch(m, b)}
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

                                {/* === Round 2 末结构题 === */}
                                <LayeredReadingQuestionBox
                                  questionType="structure"
                                  question={structureQuestion}
                                  isGenerating={generatingQuestionIds.has(structureQuestionId)}
                                  isGrading={gradingQuestionIds.has(structureQuestionId)}
                                  onGenerate={() => onGenerateQuestion('structure', m, b)}
                                  onSubmit={(ans) => onSubmitQuestion(structureQuestionId, ans)}
                                  onSkip={() => onSkipQuestion(structureQuestionId)}
                                  onResetAnswer={() => onResetQuestion(structureQuestionId)}
                                />

                                {/* === Round 3 操作 === */}
                                {!hasRound3 && !round3Generating && !round3Error && (
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
                                    AI 正在生成 Round 3 学习单元…
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

                                {/* 优先渲染新 7 块 unit */}
                                {b.round3Unit && (
                                  <Round3UnitView
                                    unit={b.round3Unit}
                                    onJumpToPage={onJumpToPage}
                                  />
                                )}

                                {/* fallback:旧扁平 details(仅当无 unit 但有 details 时) */}
                                {!b.round3Unit && b.round3Details && b.round3Details.length > 0 && (
                                  <LegacyRound3DetailsView
                                    details={b.round3Details}
                                    onJumpToPage={onJumpToPage}
                                  />
                                )}

                                {/* === Round 3 末细节应用题(unit / details 任一存在时显示) === */}
                                {hasRound3 && (
                                  <LayeredReadingQuestionBox
                                    questionType="application"
                                    question={applicationQuestion}
                                    isGenerating={generatingQuestionIds.has(applicationQuestionId)}
                                    isGrading={gradingQuestionIds.has(applicationQuestionId)}
                                    onGenerate={() => onGenerateQuestion('application', m, b)}
                                    onSubmit={(ans) => onSubmitQuestion(applicationQuestionId, ans)}
                                    onSkip={() => onSkipQuestion(applicationQuestionId)}
                                    onResetAnswer={() => onResetQuestion(applicationQuestionId)}
                                  />
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
