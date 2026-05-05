# 备考工作台代码侦察报告（EXAMPREP_RECON）

> 只读侦察。零代码改动。
> 生成时间：2026-05-05
> 范围：备考工作台（ExamPrep）相关组件 + 服务层 + utils

---

## 问题 1：备考工作台现在有几种"对话模式"？

侦察发现 **3 种独立的"对话/答题入口"**，分布在 2 个 React 组件树里。

### 模式 A：单 KC 锚定苏格拉底对话（"锚定考点对话"）

- **入口**：[features/exam/workspace/ExamWorkspacePage.tsx:700](features/exam/workspace/ExamWorkspacePage.tsx#L700) 左侧考点列表中点击 KC 卡片
  ```tsx
  onClick={() => setSelectedKcId(selected ? null : kc.id)}
  ```
- **状态变量**：[features/exam/workspace/ExamWorkspacePage.tsx:201-203](features/exam/workspace/ExamWorkspacePage.tsx#L201)
  ```tsx
  const [selectedKcId, setSelectedKcId] = useState<string | null>(null);
  /** M3：勾选后对话不锚定 KC，行为同 M3 前；默认不勾选（锚定考点，默认第一项 KC） */
  const [wholeBookMode, setWholeBookMode] = useState(false);
  ```
- **derived state**：[features/exam/workspace/ExamWorkspacePage.tsx:493-498](features/exam/workspace/ExamWorkspacePage.tsx#L493)
  ```tsx
  const activeKcForChat = useMemo(() => {
    if (wholeBookMode || !workspaceLsapContentMap?.kcs?.length) return null;
    const id = selectedKcId ?? kcsOrdered[0]?.id;
    if (!id) return null;
    return workspaceLsapContentMap.kcs.find((k) => k.id === id) ?? null;
  }, [wholeBookMode, workspaceLsapContentMap, selectedKcId, kcsOrdered]);
  ```
- **涉及组件**：
  - [features/exam/workspace/ExamWorkspacePage.tsx](features/exam/workspace/ExamWorkspacePage.tsx)（容器，提供 `activeKcForChat` prop）
  - [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx)（对话主体）
  - [features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx)（渲染 AI 回复 + 引用块）
  - [features/exam/workspace/ExamWorkspaceCitationBlock.tsx](features/exam/workspace/ExamWorkspaceCitationBlock.tsx)（引用块跳页）
  - [features/exam/workspace/KcGlossarySidebar.tsx](features/exam/workspace/KcGlossarySidebar.tsx)（右侧"考点释义"）

### 模式 B：全卷对话（"全卷模式 / 不锚定 KC"）

- **入口**：[features/exam/workspace/ExamWorkspacePage.tsx:813-817](features/exam/workspace/ExamWorkspacePage.tsx#L813) 左侧"全卷对话（不锚定 KC）"勾选框
  ```tsx
  <input
    type="checkbox"
    className="rounded border-stone-300"
    checked={wholeBookMode}
    onChange={(e) => setWholeBookMode(e.target.checked)}
    aria-label="全卷对话（不锚定 KC）"
  />
  全卷对话（不锚定 KC）
  ```
- **状态变量**：同上 `wholeBookMode`（true 时 `activeKcForChat = null`）
- **涉及组件**：与模式 A **同一个 [ExamWorkspaceSocraticChat](features/exam/workspace/ExamWorkspaceSocraticChat.tsx)**——根据 `activeKc` 是否为 `null` 走不同分支
  - [features/exam/workspace/ExamWorkspaceSocraticChat.tsx:386-411](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L386)：`if (activeKc) { ... } else { ... }`
  - 区别是：全卷模式不计算 atom coverage、不调用 `computeNextProbeState`、不附 KCScopedTutorAppendix、不抽 glossary

### 模式 C：结业探测弹窗（KC Probe Modal）

- **入口**：[features/exam/workspace/ExamWorkspacePage.tsx:732-744](features/exam/workspace/ExamWorkspacePage.tsx#L732) 每个 KC 卡片上的"结业探测"按钮
  ```tsx
  <button
    type="button"
    disabled={!workspaceLsapState || !mergedContent.trim() || mergedLoading || !!mergedError}
    title={!workspaceLsapState ? '请先生成本场考点图谱以启用 BKT' : undefined}
    onClick={(e) => {
      e.stopPropagation();
      setProbeKc(kc);
    }}
    ...
  >
    <ClipboardCheck className="w-3 h-3 shrink-0" aria-hidden />
    结业探测
  </button>
  ```
- **状态变量**：[features/exam/workspace/ExamWorkspacePage.tsx:208](features/exam/workspace/ExamWorkspacePage.tsx#L208)
  ```tsx
  /** M4：结业探测弹窗 */
  const [probeKc, setProbeKc] = useState<LSAPKnowledgeComponent | null>(null);
  ```
- **挂载点**：[features/exam/workspace/ExamWorkspacePage.tsx:1200-1206](features/exam/workspace/ExamWorkspacePage.tsx#L1200)
  ```tsx
  {probeKc && workspaceLsapContentMap && workspaceLsapState && (
    <WorkspaceKcProbeModal
      open
      onClose={() => setProbeKc(null)}
      ...
  ```
- **涉及组件**：
  - [features/exam/workspace/WorkspaceKcProbeModal.tsx](features/exam/workspace/WorkspaceKcProbeModal.tsx)（独立弹窗，单题问答 + BKT 更新）
  - [features/exam/workspace/WorkspaceEvidenceReportModal.tsx](features/exam/workspace/WorkspaceEvidenceReportModal.tsx)（取 ConflictPageHint 子组件）

### 不属于"备考工作台"但易混淆的模式

- **ExamPredictionPanel**（[features/exam/ExamPredictionPanel.tsx](features/exam/ExamPredictionPanel.tsx)，1035 行）
  - **不在工作台内**——它是从九宫格"复习模式选择器"→"考前预测"按钮触发的独立面板（[App.tsx:2462-2463](App.tsx#L2462)），与 ExamWorkspacePage 平级
  - 自身有 3 种子模式（`'choose' | 'probe' | 'review'`，[ExamPredictionPanel.tsx:87](features/exam/ExamPredictionPanel.tsx#L87)），都做 BKT 更新（[ExamPredictionPanel.tsx:284,451](features/exam/ExamPredictionPanel.tsx#L284)）
  - 与 ExamWorkspacePage **共享 BKT 状态**（都从 `App.tsx:217` 的 `workspaceLsapState` 读写）

---

## 问题 2：每种模式的完整数据流

### 模式 A：单 KC 锚定苏格拉底对话

```
[用户输入文字] → ExamWorkspaceSocraticChat.onSend
  ↓
1. 启发式分类 quality
   features/exam/workspace/ExamWorkspaceSocraticChat.tsx:348
   quality = heuristicQuality(text)  // weak/partial/strong/empty/neutral
   若 partial → 调 LLM classifyLearnerTurn 二次确认（行 351）
  ↓
2. 计算 phase（P4 支架式相位）
   行 364: phase = computeScaffoldingPhase({quality, streak, totalUserTurns})
  ↓
3. 计算 probe 编排（M3）
   行 388: orch = computeNextProbeState({prevProbeMode, prevBloomTarget, quality, ...})
   产出 probeMode ∈ {direct|stress|remediate}, bloomTarget ∈ {1|2|3}
  ↓
4. 装配 KCScopedTutorContext
   行 398-407: kcCtx = { kcId, kcConcept, kcDefinition, atoms, probeMode,
                          bloomTarget, gapAtomIds, ...baseScaffold }
  ↓
5. 检索 chunk（1-3/1-4 引用管线）
   行 423-474: 从 IndexedDB 加载 chunk 索引 → BM25 retrieve top-K →
                构造 examChunkCitationAppendix（†chunkId† 协议）或回退到文末 JSON
  ↓
6. 调 chatWithAdaptiveTutor（services/geminiService.ts:1956）
   入参：mergedContent, history, text, 'tutoring', docType, undefined,
         disciplineBand, kcCtx, materials, examChunkCitationAppendix
   ↓
   prompt 拼装（services/geminiService.ts:1973-2017）：
     systemInstruction = buildDialogueTeachingSystemPrompt(disciplineBand)
                       + docFlavor (STEM/HUMANITIES)
                       + modeHint (tutoring 苏格拉底)
                       + getScaffoldingSystemAddendum()
     finalMessage = userText
                  + buildScaffoldingTurnDirective(scaffolding) (P4 元指令)
                  + buildKCScopedTutorAppendix(kcCtx) (M3 KC 锚定)  ← 见下
                  + examChunkCitationAppendix 或 buildExamWorkspaceCitationInstruction
   model = 'gemini-3-pro-preview'
  ↓
7. AI 回答：纯 Markdown 文本（不是 JSON）
   - 模型在文本末尾按协议附 †chunkId† 或 ```json citations``` 块
   - 服务端 return response.text（行 2026）
  ↓
8. 客户端解析（行 488-553）：
   - parseExamWorkspaceModelReply / parseAssistantCitations 拆出 displayText + citations
   - extractBoldTermsFromMarkdown(displayText) → glossaryTermFilter →
     对每个新术语调 defineTermInLectureContext → onGlossaryAppend 追加 KcGlossary
   - 行 555-563: 更新 bloomTargetRef + probeModeRef + stressDoneForKcRef
   - 行 565-581: analyzeKcUtteranceForAtoms → onAtomCoverageChange 更新 atom coverage
  ↓
9. State 更新：
   - setMessages（追加 model 消息）
   - onGlossaryAppend（KC 释义侧栏）
   - onAtomCoverageChange（KC 原子覆盖率）
   - onChunkRetrievalRound（chunk 检索结果，仅 debug 用）
   - 内部 ref 更新：bloomTargetRef / probeModeRef / consecutiveWeakStreakRef / stressDoneForKcRef
   - **不更新 BKT、不更新 predictedScore**
```

#### KC 锚定 prompt 模板（buildKCScopedTutorAppendix）

[services/geminiService.ts:1880-1912](services/geminiService.ts#L1880)：

```ts
function buildKCScopedTutorAppendix(ctx: KCScopedTutorContext): string {
  ...
  return `

【M3·本场锚定考点（本轮只讨论此 KC）】
- 考点：${ctx.kcConcept}
- 定义摘要：${(ctx.kcDefinition || '').slice(0, 500)}
- 布鲁姆追问目标层级：${ctx.bloomTarget}（1=记忆/理解，2=应用，3=分析/综合）
${modeHint}                                    // direct/stress/remediate 三档
${gapPart}                                     // 待加强原子 id 列表

【本考点逻辑原子 id 清单】
${atomLines || '（暂无原子，仅围绕考点概念讨论）'}

【Markdown 与考点释义侧栏】
请使用 Markdown；双星号粗体 **...** 仅用于本学科专有名词、术语...`;
}
```

### 模式 B：全卷对话

数据流与 A **完全相同**，只是分支：

- [features/exam/workspace/ExamWorkspaceSocraticChat.tsx:386,409](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L386)：`if (activeKc)` 为 `false`
  ```tsx
  } else {
    setLastScaffoldInfo({ phase, quality, streak: newStreak });
  }
  ```
- 不调用 `computeNextProbeState`、不构造 `kcCtx` → `chatWithAdaptiveTutor` 收到的 `scaffolding` 仅含 `baseScaffold = { quality, phase, streak, totalUserTurns }`
- 服务端 [services/geminiService.ts:2006](services/geminiService.ts#L2006) 的 `if (isKCScopedTutorContext(scaffolding))` 判 false → **不附 buildKCScopedTutorAppendix**
- 不调 atom coverage 分析、不抽 glossary（[ExamWorkspaceSocraticChat.tsx:496](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L496) 的 `if (activeKc && mergedContent.trim())` 也跳过）

### 模式 C：结业探测（KC Probe Modal）

```
[打开弹窗] → useEffect 自动加载（features/exam/workspace/WorkspaceKcProbeModal.tsx:140-160）
  ↓
1. 解析探测文档（onLoadProbeMaterialText 或 mergedContent 兜底）
  ↓
2. bl = bloomLevelForWorkspaceProbe(kc)
   features/exam/workspace/WorkspaceKcProbeModal.tsx:20-30
   = Math.min(3, Math.max(1, kc.bloomTargetLevel))
  ↓
3. generateLSAPProbeQuestion(doc, contentMap, kc.id, bl, undefined, scope)
   services/geminiService.ts:2598-2651
   prompt 是固定模板（行 2621-2629），明确告诉 AI:
     "当前考点：${kc.concept}
      定义：${kc.definition}
      布鲁姆层级：${bloomLevel}
      讲义页码：${(kc.sourcePages).join(', ')}"
   responseSchema: { question: string, sourceRef: string }  ← 结构化 JSON
  ↓
4. UI 渲染单题问答界面 → 用户在 textarea 写答案 → 点提交
  ↓
5. handleSubmit（features/exam/workspace/WorkspaceKcProbeModal.tsx:167-218）
   evaluateLSAPAnswer(probeDocContent, kc.id, probe.question, userAnswer,
                       probe.sourceRef, probeScopeOpts)
   services/geminiService.ts:2663-2724
   prompt（行 2678-2691）告诉 AI：
     "题目：${question}
      学生回答：${userAnswer}
      参考（讲义出处）：${sourceRef}
      判断要求：correct (true/'partial'/false), levelReached, evidence,
                 conflictWithPage, nextAction"
   responseSchema 5 字段，全部结构化
  ↓
6. 拿到 evalRes 后（行 183-210）：
   correctForBKT = evalRes.correct === true || evalRes.correct === 'partial'
   prevP = workspaceLsapState.bktState[kc.id] ?? 0
   newP = updateBKT(prevP, correctForBKT)
   构造 ProbeRecord、新 bktState、计算 prevScore/nextScore
   onCommit(nextState)  ← 触发 App.tsx 的 setWorkspaceLsapState
  ↓
7. UI 显示 result（带 ConflictPageHint 提示）
```

---

## 问题 3：BKT 分数更新逻辑

### BKT 函数位置和签名

[features/exam/lib/bkt.ts:30-50](features/exam/lib/bkt.ts#L30)：

```ts
export function updateBKT(
  pMastery: number,
  observedCorrect: boolean,
  params?: BKTParams
): number {
  const { pL0, pT, pG, pS } = { ...DEFAULT_PARAMS, ...params };
  // P(correct | L=1) = 1 - pS; P(correct | L=0) = pG
  ...
  return Math.max(0, Math.min(1, afterLearning));
}
```

默认参数（行 17-22）：`pL0=0.5, pT=0.3, pG=0.2, pS=0.1`。

输入参数：
- `pMastery`: 当前掌握概率（0-1）
- `observedCorrect`: boolean（partial 由调用方决定）
- `params`: 可选 BKT 参数覆盖

### 各模式下的 BKT 调用情况

全仓 grep `updateBKT(` 命中 **3 处**：

| 调用点 | 模式 | 是否调用 BKT |
|--------|------|-------------|
| [features/exam/workspace/WorkspaceKcProbeModal.tsx:186](features/exam/workspace/WorkspaceKcProbeModal.tsx#L186) | 模式 C：结业探测弹窗 | ✅ 是 |
| [features/exam/ExamPredictionPanel.tsx:284](features/exam/ExamPredictionPanel.tsx#L284) | 考前预测面板（不在工作台内）摸底模式 | ✅ 是 |
| [features/exam/ExamPredictionPanel.tsx:451](features/exam/ExamPredictionPanel.tsx#L451) | 考前预测面板（不在工作台内）复习模式 quiz 子流程 | ✅ 是 |

**SocraticChat（模式 A 单 KC、模式 B 全卷）全程 0 处调用 updateBKT**——已在 [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) 全文确认。

### 没有 BKT 调用是有意还是漏了？

**看起来是有意设计，不是漏了**——证据：

1. **明确的代码分支 / 注释**：
   - 模式 C 弹窗的按钮 [ExamWorkspacePage.tsx:734-735](features/exam/workspace/ExamWorkspacePage.tsx#L734) 写明：
     ```tsx
     disabled={!workspaceLsapState || !mergedContent.trim() || mergedLoading || !!mergedError}
     title={!workspaceLsapState ? '请先生成本场考点图谱以启用 BKT' : undefined}
     ```
     即"BKT 启用"是**结业探测**这个特定动作的能力，与对话流分离。
   - [ExamWorkspacePage.tsx:746-749](features/exam/workspace/ExamWorkspacePage.tsx#L746):
     ```tsx
     {atomTotal > 0 && covered / atomTotal >= 0.85 && (
       <p className="text-[9px] text-emerald-700 mt-1 leading-snug">
         原子覆盖较高，可做结业探测巩固预测分（可选）
       </p>
     )}
     ```
     提示用户"对话推进 atom coverage 后，可去做结业探测来巩固 BKT/预测分"——意思是**对话本身不更新预测分**，结业探测才更新。

2. **数据流上对话推进的是另外两个量，不是 BKT**：
   - `workspaceAtomCoverage`（哪些逻辑原子被覆盖了）
   - `workspaceKcGlossary`（生成的考点术语释义）
   - 加上 `workspaceDialogueTranscript`（对话留痕）
   - 这些都通过 props 回调传到 [App.tsx](App.tsx) 的 `workspaceLsapState` 周边，但不动 `bktState`

3. **结业探测弹窗的注释**：
   [features/exam/workspace/ExamWorkspacePage.tsx:207-208](features/exam/workspace/ExamWorkspacePage.tsx#L207)
   ```tsx
   /** M4：结业探测弹窗 */
   const [probeKc, setProbeKc] = useState<LSAPKnowledgeComponent | null>(null);
   ```
   `M4` 是这个项目的产品阶段命名；M3 是对话锚定，M4 是结业探测——产品上分两步走。

但**是否符合产品意图**代码看不出来——可能是当前设计选择，也可能是欠缺。代码层面没有"对话也应该更新 BKT 但被注释掉了"或类似遗漏的痕迹。

### BKT 更新需要的输入参数

调用模式 C 的 [WorkspaceKcProbeModal.tsx:183-186](features/exam/workspace/WorkspaceKcProbeModal.tsx#L183) 显示：

```ts
const correctForBKT = evalRes.correct === true || evalRes.correct === 'partial';
const bloomLevel = bloomLevelForWorkspaceProbe(kc);
const prevP = workspaceLsapState.bktState[kc.id] ?? 0;
const newP = updateBKT(prevP, correctForBKT);
```

需要：
1. **某个具体 KC 的 id**（kc.id）——用来查 `bktState[kcId]`
2. **答对答错（boolean）**——partial 也算"对"（这是产品决策）
3. （bloomLevel 不喂给 updateBKT，但喂给 ProbeRecord 用于事后追溯）

签名上只要 `(pMastery, observedCorrect)` 两个参数。

---

## 问题 4：AI 是怎么知道"这一轮在考察哪个 KC"的？

### 模式 A 单 KC 锚定对话

**prompt 里明确告诉 AI 当前 KC**——通过 `buildKCScopedTutorAppendix` 在用户消息末尾追加。

[services/geminiService.ts:1897-1911](services/geminiService.ts#L1897)：

```
【M3·本场锚定考点（本轮只讨论此 KC）】
- 考点：${ctx.kcConcept}
- 定义摘要：${(ctx.kcDefinition || '').slice(0, 500)}
- 布鲁姆追问目标层级：${ctx.bloomTarget}
[direct/stress/remediate 模式提示]
[待加强原子 id 列表 if any]

【本考点逻辑原子 id 清单】
${atomLines}
```

**AI 回答里没有结构化字段返回"我刚才考的是哪个 KC"**——回答是 Markdown 文本，仅在文末按协议附 `†chunkId†` 或 ```json citations```。

那"答对答错"由谁判定？

- **代码层面：客户端不判定"对/错"**——SocraticChat 的整个回路里没有"判对判错"的代码。它判的是**学生本轮发言的"质量"**（`heuristicQuality` + 可选的 LLM `classifyLearnerTurn`），分档 `weak | partial | strong | empty | neutral`。
- 这个 quality 喂给 `computeScaffoldingPhase` 决定下轮 AI 元指令，喂给 `computeNextProbeState` 决定下一轮的 `probeMode/bloomTarget`。
- **没有"答对/答错"概念**——它不更新 BKT 也是因为根本没产生 boolean 结论。
- 倒是有"原子覆盖"这个相邻概念：[ExamWorkspaceSocraticChat.tsx:565-581](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L565) 调 `analyzeKcUtteranceForAtoms`，这个函数 prompt（[services/geminiService.ts:2528-2535](services/geminiService.ts#L2528)）让 AI 判"学生本轮发言覆盖了哪些原子 id"——但这是**语义"原子覆盖"**而不是"答对答错"，且 KC 是预先传给函数的参数（非 AI 推断）。

### 模式 B 全卷对话

**prompt 里没有 KC 信息**（不附 buildKCScopedTutorAppendix）。AI 不知道当前在讨论什么 KC——产品意图就是让 AI 在全卷范围自由对话。

### 模式 C 结业探测弹窗

**prompt 里非常明确**——出题与阅卷两次都把 KC 信息喂给 AI：

- 出题 [services/geminiService.ts:2621-2629](services/geminiService.ts#L2621)：
  ```
  当前考点：${kc.concept}
  定义：${kc.definition}
  布鲁姆层级：${bloomLevel}
  讲义页码（考点元数据，以该材料内标注为准）：${(kc.sourcePages).join(', ')}
  ```
  responseSchema：`{question, sourceRef}` — 不返回 kcId（**调用方已知 kcId，不需要 AI 回写**）。
- 阅卷 [services/geminiService.ts:2678-2691](services/geminiService.ts#L2678)：
  ```
  题目：${question}
  学生回答：${userAnswer}
  参考（讲义出处）：${sourceRef}
  判断要求：correct (true/'partial'/false), levelReached, evidence, ...
  ```
  responseSchema 包含 `correct: STRING, levelReached: INTEGER, evidence, conflictWithPage, nextAction`——这里 AI **明确返回 boolean/'partial' 结论**，由 [WorkspaceKcProbeModal.tsx:183](features/exam/workspace/WorkspaceKcProbeModal.tsx#L183) 转成 `correctForBKT` 喂给 updateBKT。

**关键**：模式 C 是**单题闭环**——每次 handleSubmit 只能围绕一个 KC，因此 kcId 在客户端是已知的，AI 只负责"判对错"，不负责"识别考的是哪个 KC"。

---

## 问题 5：备考工作台的 KC 选择逻辑跨模块共享了吗？

侦察方法：grep `selectedKc | LSAPKnowledgeComponent | activeKc | workspaceLsap | kcId`，列出所有命中文件。

### 命中文件清单

```
services/geminiService.ts                                   ← 服务层
App.tsx                                                     ← 应用根
types.ts                                                    ← 类型定义
features/exam/workspace/WorkspaceEvidenceReportModal.tsx
features/exam/workspace/ExamWorkspaceSocraticChat.tsx
features/exam/workspace/ExamWorkspacePage.tsx
features/exam/workspace/WorkspaceKcProbeModal.tsx
features/exam/workspace/KnowledgePointInspectPanel.tsx
features/exam/workspace/KcGlossarySidebar.tsx
features/exam/ExamPredictionPanel.tsx
features/exam/lib/examWorkspaceLsapKey.ts
features/exam/lib/examSchedule.ts
lib/text/extractBoldTermsFromMarkdown.ts                    ← 仅含 buildKcGlossaryEntryId 工具，无 selection 逻辑
```

### 按模块归类

- ✅ **`features/exam/*`**（11 文件）：备考工作台 + 考前预测共享 KC 概念
- ✅ **`App.tsx`**：持有 `workspaceLsapContentMap` + `workspaceLsapState` 两个 state ([App.tsx:216-217](App.tsx#L216))，作为 ExamWorkspacePage + ExamPredictionPanel 的**共同父级数据源**
- ✅ **`services/geminiService.ts`**：函数签名包含 `kcId / contentMap / KCScopedTutorContext`
- ✅ **`types.ts`**：定义 `LSAPKnowledgeComponent / LSAPContentMap / LSAPState / LSAPBKTState / KCScopedTutorContext` 等
- ❌ **`lib/text/extractBoldTermsFromMarkdown.ts`** 命中是因为含 `buildKcGlossaryEntryId(kcId, term)` 工具函数（生成术语 entry id 用），**与"KC 选择"无关**

### 与精读 / Notebook / 闪卡 / 测验等其他模块的关系

按文件清单核对：

- [features/reader/deep-read/ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx)：**未命中**
- [features/reader/notebook/Notebook.tsx](features/reader/notebook/Notebook.tsx)：**未命中**
- [features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx)：**未命中**
- [features/review/tools/QuizReviewPanel.tsx](features/review/tools/QuizReviewPanel.tsx)：**未命中**（用 QuizData/QuizRound，不是 LSAP KC）
- [features/review/tools/FlashCardReviewPanel.tsx](features/review/tools/FlashCardReviewPanel.tsx)：**未命中**（用 FlashCard）
- [features/review/tools/StudyGuidePanel.tsx](features/review/tools/StudyGuidePanel.tsx)：**未命中**
- [features/review/tools/TerminologyPanel.tsx](features/review/tools/TerminologyPanel.tsx)：**未命中**

### 共用的 hook / context / store

**没有 React context、没有 hook、没有 zustand/redux store**——全仓搜过，KC 状态的"共享"是经典的 props drilling：

- 从 [App.tsx:216-217](App.tsx#L216) 的 `useState` 出发
- 通过 props 下传到 [ExamWorkspacePage](features/exam/workspace/ExamWorkspacePage.tsx)（约 [App.tsx:2660-2668](App.tsx#L2660) 附近）和 [ExamPredictionPanel](features/exam/ExamPredictionPanel.tsx)（[App.tsx:2462](App.tsx#L2462) 附近）
- ExamWorkspacePage 内部再用本地 useState 存 `selectedKcId / wholeBookMode / probeKc`（这些是工作台**私有**的 UI 状态）

### 改备考工作台 KC 选择逻辑会影响其他模块吗？

按代码层面证据：

- **不会影响 reader/review/skim 系列**——它们既不读也不写 KC 状态
- **会影响 ExamPredictionPanel**——条件是改动涉及 `App.tsx:216-217` 的 `workspaceLsapContentMap / workspaceLsapState` 这两个 state 形状（因为 ExamPredictionPanel 也吃这两个 state）。如果只改 [ExamWorkspacePage](features/exam/workspace/ExamWorkspacePage.tsx) 内部的 `selectedKcId / wholeBookMode / probeKc` UI 状态，则 ExamPredictionPanel 不会感知
- **会影响 services/geminiService**——条件是改动涉及 `KCScopedTutorContext` 形状或 `chatWithAdaptiveTutor / generateLSAPProbeQuestion / evaluateLSAPAnswer` 签名

简言之，KC 选择**逻辑层面**仅工作台私有；KC **数据层面**（contentMap + bktState）跨工作台 + 考前预测面板共享，由 App.tsx 持有。

---

## 附录：关键文件大小（供后续设计参考）

| 文件 | 行数 |
|------|------|
| [features/exam/workspace/ExamWorkspacePage.tsx](features/exam/workspace/ExamWorkspacePage.tsx) | 1492 |
| [features/exam/ExamPredictionPanel.tsx](features/exam/ExamPredictionPanel.tsx) | 1035 |
| [features/exam/workspace/ExamWorkspaceMaterialPreview.tsx](features/exam/workspace/ExamWorkspaceMaterialPreview.tsx) | 996 |
| [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | 780 |
| [features/exam/workspace/WorkspaceKcProbeModal.tsx](features/exam/workspace/WorkspaceKcProbeModal.tsx) | 362 |
| [features/exam/workspace/WorkspaceEvidenceReportModal.tsx](features/exam/workspace/WorkspaceEvidenceReportModal.tsx) | 321 |
| [features/exam/workspace/ExamWorkspaceCitationBlock.tsx](features/exam/workspace/ExamWorkspaceCitationBlock.tsx) | 273 |
| [features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx) | 261 |
| [features/exam/lib/examWorkspaceCitations.ts](features/exam/lib/examWorkspaceCitations.ts) | 176 |
| [features/exam/lib/examWorkspaceLsapKey.ts](features/exam/lib/examWorkspaceLsapKey.ts) | 115 |
| [lib/exam/scaffoldingClassifier.ts](lib/exam/scaffoldingClassifier.ts) | 91 |
| [features/exam/lib/examWorkspaceOrchestrator.ts](features/exam/lib/examWorkspaceOrchestrator.ts) | 89 |
| [features/exam/lib/bkt.ts](features/exam/lib/bkt.ts) | 50 |
| [features/exam/lib/lsapScore.ts](features/exam/lib/lsapScore.ts) | 18 |

---

*侦察完。零代码改动。本报告只列事实与文件:行号引用，不含任何方案或建议。*

---

## 补充侦察：atom coverage 专项

### 问题 1：atom coverage 到底是什么？

#### 类型定义

[types.ts:160-169](types.ts#L160)：

```ts
/** 隶属于某一 KC 的最小逻辑单元（用于「命题密度」与覆盖统计） */
export interface LogicAtom {
  id: string;
  kcId: string;
  label: string;
  /** 一句说明，便于 UI 与后续对齐讲义 */
  description: string;
}

/** 每个 KC 下原子覆盖：atomId -> 是否已在教学对话中被判定覆盖（M2 可全 false） */
export type AtomCoverageByKc = Record<string, Record<string, boolean>>;
```

[types.ts:182-183](types.ts#L182)（LSAPKnowledgeComponent 含 atoms 字段）：
```ts
/** 备考工作台：该考点下的逻辑原子（与 bundle 一并持久化） */
atoms?: LogicAtom[];
```

数据结构嵌套：
```
AtomCoverageByKc:
  kcId_1:
    atomId_1: true
    atomId_2: false
  kcId_2:
    atomId_3: true
```

#### 一个"atom"指什么

按 `LogicAtom` 类型定义注释 + [types.ts:518-524](types.ts#L518)（`LSAPContentMap` 的 atoms 字段）：

> "隶属于某一 KC 的最小逻辑单元（用于「命题密度」与覆盖统计）"

每个 atom 有 `id / kcId / label / description`——是 KC **下面再细分**的一层。一个 KC 可能含多个 LogicAtom。

#### 状态位置

[App.tsx:234](App.tsx#L234)：

```ts
const [workspaceAtomCoverage, setWorkspaceAtomCoverage] = useState<AtomCoverageByKc>({});
```

[App.tsx:241-250](App.tsx#L241)（同时维护 ref，避免闭包过期）：
```ts
const workspaceAtomCoverageRef = useRef<AtomCoverageByKc>({});
useEffect(() => {
  workspaceAtomCoverageRef.current = workspaceAtomCoverage;
}, [workspaceAtomCoverage]);
```

**没有用 React context、hook、store**——和 KC 选择一样，是 props drilling 模式（沿 App → ExamWorkspacePage → ExamWorkspaceSocraticChat 链路传递）。

#### 初始值与创建时机

初始值固定为 `{}`（空对象）。具体创建/重置逻辑在 [App.tsx:357-392](App.tsx#L357)：

```ts
useEffect(() => {
  if (appMode !== 'examWorkspace' || !user?.uid || !activeExamId) {
    ...
    setWorkspaceAtomCoverage({});           // line 362
    ...
    return;
  }
  if (examWorkspaceMaterialsSorted.length === 0) {
    ...
    setWorkspaceAtomCoverage({});           // line 371
    ...
    return;
  }
  const key = computeExamWorkspaceLsapKey(...);
  setWorkspaceLsapKey(key);
  const bundle = loadWorkspaceLsapBundle(key);
  if (bundle) {
    ...
    setWorkspaceAtomCoverage(mergeAtomCoverageForMap(bundle.atomCoverage, bundle.contentMap));   // line 382 (从 localStorage 恢复)
    ...
  } else {
    ...
    setWorkspaceAtomCoverage({});           // line 388
    ...
  }
}, [appMode, user?.uid, activeExamId, examWorkspaceMaterialsSorted]);
```

简言之：进入备考工作台 + 选定考试 + 关联材料齐备时，要么从 localStorage `bundle.atomCoverage` 恢复（[examWorkspaceLsapKey.ts](features/exam/lib/examWorkspaceLsapKey.ts) 持久化），要么重置为 `{}`。

---

### 问题 2：atom coverage 是怎么被更新的？

#### 更新函数

`mergeCoverageForKc` 是纯函数。[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:94-100](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L94)：

```ts
function mergeCoverageForKc(prev: AtomCoverageByKc, kcId: string, coveredIds: string[]): AtomCoverageByKc {
  const row = { ...(prev[kcId] ?? {}) };
  for (const id of coveredIds) {
    if (id) row[id] = true;
  }
  return { ...prev, [kcId]: row };
}
```

它只能"加"不能"减"——把传入的 `coveredIds` 全部置为 `true`，不影响其他 atom。

最终落到 state 通过 [App.tsx:1532-1545](App.tsx#L1532) 的 `handleWorkspaceAtomCoverageChange`：

```ts
/** M3：对话中更新原子覆盖并持久化 bundle */
const handleWorkspaceAtomCoverageChange = useCallback(
  (next: AtomCoverageByKc) => {
    setWorkspaceAtomCoverage(next);
    if (!user?.uid || !workspaceLsapKey || !workspaceLsapContentMap || !workspaceLsapStateRef.current) return;
    saveWorkspaceLsapBundle(workspaceLsapKey, {
      contentMap: workspaceLsapContentMap,
      state: workspaceLsapStateRef.current,
      atomCoverage: next,
      ...
    });
  ...
```

#### 调用时机

唯一调用点：[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:565-581](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L565)（`onSend` 内部，AI 回复获取后）：

```ts
if (activeKc?.atoms?.length) {
  const dedupeKey = `${activeKc.id}:${userMsg.timestamp}:${text}`;
  if (lastAtomAnalyzeKeyRef.current !== dedupeKey) {
    lastAtomAnalyzeKeyRef.current = dedupeKey;
    try {
      const { coveredAtomIds, gapAtomIds } = await analyzeKcUtteranceForAtoms(mergedContent, activeKc, text);
      gapAtomIdsRef.current = gapAtomIds;
      if (coveredAtomIds.length > 0) {
        onAtomCoverageChange(
          mergeCoverageForKc(workspaceAtomCoverageRef.current, activeKc.id, coveredAtomIds)
        );
      }
    } catch (e) {
      console.warn('analyzeKcUtteranceForAtoms', e);
    }
  }
}
```

注意：
- 外层 `if (activeKc?.atoms?.length)` 是关键判定——决定哪些模式会触发更新
- 内层 `if (coveredAtomIds.length > 0)` 是最终落到 state 的条件——AI 没识别出 atom 也不会更新

#### 三种模式下的调用情况

| 模式 | 是否调用 atom 更新 | 证据 |
|------|------------------|------|
| **A 单 KC 锚定** | ✅ 是 | `activeKc != null`，`activeKc.atoms.length > 0` 时 [Socratic:565](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L565) 判 true |
| **B 全卷对话** | ❌ 否 | `wholeBookMode === true` → [ExamWorkspacePage.tsx:494](features/exam/workspace/ExamWorkspacePage.tsx#L494) `activeKcForChat = null` → SocraticChat 收到 `activeKc=null` → `if (activeKc?.atoms?.length)` 短路 |
| **C 结业探测弹窗** | ❌ 否 | grep [WorkspaceKcProbeModal](features/exam/workspace/WorkspaceKcProbeModal.tsx) 全文，**0 处** atomCoverage / mergeCoverage / analyzeKcUtterance 引用 |

#### 是有判断分支跳过还是漏了？

- **模式 B**：明确的判断分支跳过——`if (activeKc?.atoms?.length)` 是显式守卫。看起来是有意（全卷模式没有锚定 KC，无从把 atom 归到哪个 KC），但代码层面看不出"产品上想不想"——只能确定它**当前不更新**。
- **模式 C**：完全独立组件，其交互模型是"单题问答 → BKT 更新"，与 atom 概念正交。不存在"漏调"的代码痕迹（没有任何 atom 相关 import 或被注释的更新代码）。

#### 更新依据（AI 回答里有什么字段？）

是 AI 输出的结构化 JSON。详见 [services/geminiService.ts:2515-2564](services/geminiService.ts#L2515) 的 `analyzeKcUtteranceForAtoms`：

```ts
export async function analyzeKcUtteranceForAtoms(
  mergedDocContent: string,
  kc: LSAPKnowledgeComponent,
  userText: string
): Promise<{ coveredAtomIds: string[]; gapAtomIds: string[] }> {
  ...
  const prompt = `你是严谨评阅助手。DOCUMENT 为本场合并讲义；下列 id 为当前考点下的「逻辑原子」。

任务：阅读学生的**本轮发言**（可能很短）。判断：
1) coveredAtomIds：学生**明确、可核对地**体现了哪些原子（id 必须来自列表；无把握则不要列入；宁可少报）。
2) gapAtomIds：结合讲义，哪些原子学生**尚未覆盖**或**表述可能不足**（同样必须来自列表；可空数组）。
...`;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    ...
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          coveredAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          gapAtomIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['coveredAtomIds', 'gapAtomIds'],
      },
    },
  });
```

- AI 回答返回 `{ coveredAtomIds: string[], gapAtomIds: string[] }`
- 客户端 [服务函数 line 2554-2555](services/geminiService.ts#L2554) 还做白名单过滤——只保留 `kc.atoms` 列表中存在的 id（防 AI 编造）
- **不是前端做语义匹配**，是 AI（gemini-3-flash-preview）做的判定，前端只过滤白名单
- 这次调用与生成对话回复的 `chatWithAdaptiveTutor` 是**两个独立的 LLM 调用**，串行执行（先回复，再分析 atoms）

---

### 问题 3：atom coverage 在 UI 上显示在哪里？

#### KC 卡片右上角的数字

[features/exam/workspace/ExamWorkspacePage.tsx:687-714](features/exam/workspace/ExamWorkspacePage.tsx#L687)：

```tsx
const renderWorkspaceKcCard = (kc: LSAPKnowledgeComponent) => {
  const selected = selectedKcId === kc.id;
  const { covered, total } = atomCoverageCounts(kc, workspaceAtomCoverage);
  const atomTotal = kc.atoms?.length ?? 0;
  return (
    <div key={kc.id} role="listitem">
      <div ...>
        <button ...>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-800 line-clamp-2 flex-1 min-w-0">{kc.concept}</p>
            <span className="text-[10px] tabular-nums text-slate-500 shrink-0">
              {atomTotal === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                <>
                  {covered}/{total}
                </>
              )}
            </span>
          </div>
```

- 显示格式是 `{covered}/{total}` 形式（如 `3/7`），不是百分比
- 字号 `text-[10px]`，颜色 `text-slate-500`（灰色），无背景/边框
- 当 `atomTotal === 0`（KC 还没提取原子）时显示 `—`
- **这个数字就是 atom coverage**——不是 BKT、不是预测分

#### 计数函数

[features/exam/workspace/ExamWorkspacePage.tsx:109-118](features/exam/workspace/ExamWorkspacePage.tsx#L109)：

```ts
function atomCoverageCounts(kc: LSAPKnowledgeComponent, cov: AtomCoverageByKc): { covered: number; total: number } {
  const atoms = kc.atoms ?? [];
  const total = atoms.length;
  if (total === 0) return { covered: 0, total: 0 };
  let covered = 0;
  for (const a of atoms) {
    if (cov[kc.id]?.[a.id] === true) covered++;
  }
  return { covered, total };
}
```

`covered = 当前 KC 下被判定为 true 的 atom 数`，`total = 当前 KC 的总 atom 数`。直接计数，不做百分比换算。

#### KC 卡片上还有哪些数字 / 文字相关 UI

同一卡片内：
- [ExamWorkspacePage.tsx:715-717](features/exam/workspace/ExamWorkspacePage.tsx#L715) `kc.reviewFocus`（复习重点一句话）
- [ExamWorkspacePage.tsx:718](features/exam/workspace/ExamWorkspacePage.tsx#L718) `{atomTotal === 0 && <p className="text-[10px] text-slate-400 mt-0.5">待提取原子</p>}`
- [ExamWorkspacePage.tsx:719](features/exam/workspace/ExamWorkspacePage.tsx#L719) `<p className="text-[10px] text-slate-400 mt-1">未探测</p>` ← **此行无条件渲染**，意味着所有 KC 卡片都会显示"未探测"小字（看不出当前 BKT 是否更新过的逻辑）
- [ExamWorkspacePage.tsx:746-750](features/exam/workspace/ExamWorkspacePage.tsx#L746) 当 `covered/atomTotal >= 0.85` 时显示绿色提示："原子覆盖较高，可做结业探测巩固预测分（可选）"

#### 顶部 PredictedScoreDisplay（与 atom coverage 不是同一个）

[features/exam/workspace/ExamWorkspacePage.tsx:121-162](features/exam/workspace/ExamWorkspacePage.tsx#L121)：

```ts
function PredictedScoreDisplay({ score, hasMap }: { score: number | null; hasMap: boolean }) {
  ...
  // 圆环 + "{score} 预测分" + "本场掌握度预测"
  // desc = "基于掌握度模型加权；完成考前预测中的探测后将更新。初始未探测时分数可能偏低。"
```

- 在 KC 列表上方挂载（[ExamWorkspacePage.tsx:786](features/exam/workspace/ExamWorkspacePage.tsx#L786)）
- 显示的 `score` 是 `predictedScore` prop，来源于 [App.tsx:1219-1222](App.tsx#L1219) `computePredictedScore(workspaceLsapContentMap, workspaceLsapState.bktState)`——基于 BKT，**不是 atom coverage**
- 旁边还有 `scoreDeltaToast`（[ExamWorkspacePage.tsx:286-298](features/exam/workspace/ExamWorkspacePage.tsx#L286)）——预测分变化时显示 4 秒"预测分 +X"小气泡

#### 总结

每个 KC 卡片右上角显示 `{covered}/{total}` = **atom coverage 的"已覆盖原子数 / 总原子数"**，**不是百分比、不是 BKT、不是预测分**。
顶部那个"圆环+数字+预测分"才是 BKT 预测分。两者是**不同位置、不同数据源、不同更新触发**的两个 UI。

---

### 问题 4：用户报告"全卷对话时右上角分数不增加"——代码视角

#### 先确认"右上角"指的是哪个

代码里有两个候选都在"上方"：

1. KC 卡片**右上角**：每个 KC 卡片内显示 `{covered}/{total}`（atom coverage）
2. KC 列表**上方/顶部**：`<PredictedScoreDisplay>` 显示 BKT 预测分

代码层面无法区分用户说"右上角"具体指哪个——两个判断分别如下。

#### 假设是 KC 卡片右上角的 `{covered}/{total}`（atom coverage）

**全卷对话模式下，atom coverage 不会更新**——
- [ExamWorkspacePage.tsx:493-498](features/exam/workspace/ExamWorkspacePage.tsx#L493)：`wholeBookMode === true` → `activeKcForChat = null`
- 传给 SocraticChat 的 `activeKc = null`
- [Socratic:565](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L565) `if (activeKc?.atoms?.length)` 短路 → **不调 `analyzeKcUtteranceForAtoms`、不调 `mergeCoverageForKc`、不调 `onAtomCoverageChange`**
- 所以 `workspaceAtomCoverage` 在 React state 层面**完全不变**
- KC 卡片右上角的 `{covered}/{total}` 也**完全不变**

也就是说：**"全卷模式下 atom coverage 不归属到具体 KC，所以单个 KC 的右上角看起来'没变'"——代码就是这样实现的**。

#### 假设是顶部圆环 PredictedScoreDisplay（BKT 预测分）

无论是模式 A 还是模式 B，**对话流程都不更新 BKT**（已在主报告 §3 + 第一份补充确认）。BKT 仅由"结业探测弹窗（模式 C）"更新（[WorkspaceKcProbeModal.tsx:186](features/exam/workspace/WorkspaceKcProbeModal.tsx#L186)）。

所以这个圆环：
- 在模式 A 不增加（也是预期，对话不更新 BKT）
- 在模式 B 不增加（同上）
- 仅在模式 C 提交答题后增加

#### 综合

无论用户说的"分数"是哪个数字，**全卷模式下都不变**：
- 是 atom coverage `{covered}/{total}`：因为 SocraticChat 在 activeKc=null 时跳过 atom 分析（代码层显式分支）
- 是预测分（BKT）：因为对话流程从来不更新 BKT，无关模式 A/B（产品事实修正的延伸）

#### atom coverage 在 UI 上还有哪些显示位置（除了 KC 卡片右上角）

逐文件 grep `workspaceAtomCoverage` 在 React 组件里出现的位置，结果有限：

- [ExamWorkspacePage.tsx:689](features/exam/workspace/ExamWorkspacePage.tsx#L689) 计算每个 KC 卡片的 `{covered}/{total}` 角标（已述）
- [ExamWorkspacePage.tsx:1045](features/exam/workspace/ExamWorkspacePage.tsx#L1045) 透传给 ExamWorkspaceSocraticChat（用作 `atomProgressForKc` 计算 prevProbe 上下文）
- [ExamWorkspaceSocraticChat.tsx:387](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L387) 用于 `computeNextProbeState` 的 `covered/total` 入参（决定下一轮的 probe 编排）

UI 上**没有第二处可见的 atom coverage 显示**——没有专属进度条、没有 KC 内部展开 atom 详情列表（`KnowledgePointInspectPanel.tsx` 也未引用 atom coverage，仅显示 KC 元数据）。

---

### 问题 5：单 KC 模式下 atom coverage 怎么"可见地"反馈给用户？

按代码层面找视觉变化：

#### 视觉变化清单（按显眼程度从弱到强）

1. **KC 卡片右上角 `{covered}/{total}` 的数字递增**
   - 位置：[ExamWorkspacePage.tsx:705-712](features/exam/workspace/ExamWorkspacePage.tsx#L705)
   - 样式：`text-[10px] tabular-nums text-slate-500`（**10px 灰色小字**）
   - 无动画、无颜色变化（始终灰色）、无边框/背景

2. **当覆盖率 ≥ 0.85 时，KC 卡片下方出现绿色提示**
   - 位置：[ExamWorkspacePage.tsx:746-750](features/exam/workspace/ExamWorkspacePage.tsx#L746)
   ```tsx
   {atomTotal > 0 && covered / atomTotal >= 0.85 && (
     <p className="text-[9px] text-emerald-700 mt-1 leading-snug">
       原子覆盖较高，可做结业探测巩固预测分（可选）
     </p>
   )}
   ```
   - 样式：9px 绿色小字
   - 仅在覆盖率 ≥ 85% 才显示——前期对话推进过程中**完全看不到**这个提示

3. **KcGlossarySidebar 增加新条目**
   - 位置：[ExamWorkspacePage.tsx:1080-1084](features/exam/workspace/ExamWorkspacePage.tsx#L1080)
   - 这是一个独立的"考点释义"右侧栏（默认折叠 [ExamWorkspacePage.tsx:212](features/exam/workspace/ExamWorkspacePage.tsx#L212) `glossaryDesktopOpen=false`，需要用户手动展开）
   - 内容是 AI 提取出的粗体术语→生成的释义条目
   - 与 atom coverage **不是同一个数据流**（glossary 来自 `extractBoldTermsFromMarkdown` + `defineTermInLectureContext`，atom coverage 来自 `analyzeKcUtteranceForAtoms`），但都在同一次 `onSend` 回调里串行发生

4. **debug 信息（默认隐藏）**
   - [ExamWorkspaceSocraticChat.tsx:623-628](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L623)
   ```tsx
   {debugScaffold && lastScaffoldInfo && (
     <p className="text-[10px] text-violet-700 font-mono mt-1">
       [debug] q={lastScaffoldInfo.quality} phase={lastScaffoldInfo.phase} streak={lastScaffoldInfo.streak}
       {lastScaffoldInfo.probeMode != null ? ` probe=${lastScaffoldInfo.probeMode}` : ''}
     </p>
   )}
   ```
   - 只有 `debugScaffold` 开关打开才显示，正常用户看不到

#### 不会变化的位置（用户可能误以为应该变）

- 顶部圆环 `<PredictedScoreDisplay>` 的预测分——对话不更新 BKT
- KC 卡片下方的 `<p>未探测</p>`（[ExamWorkspacePage.tsx:719](features/exam/workspace/ExamWorkspacePage.tsx#L719)）——无条件渲染，不随 BKT 状态变化
- KC 卡片整体颜色/选中态——只与 `selectedKcId === kc.id` 有关，不与覆盖率有关

#### "明显程度"代码层面观察

代码层只能看到：
- 主反馈是 KC 卡片角的 `{covered}/{total}`，**10px 灰色小字、无动画、无颜色变化**
- 只有覆盖率达 85% 时，才出现一行 9px 绿色提示
- 没有 toast / 没有进度条 / 没有数字滚动动画 / 没有"+1 atom"飘字（与 BKT 预测分上升时的"预测分 +X"绿色 toast，[ExamWorkspacePage.tsx:787-790](features/exam/workspace/ExamWorkspacePage.tsx#L787) 有，形成对比）

**用户是否会注意到——代码看不出来**，但代码层面可以确定的是反馈样式比 BKT 预测分上升的反馈样式（动画 + 4 秒 toast）弱很多。

---

*atom coverage 专项侦察完。零代码改动。所有结论附文件:行号引用。*
