# 文章模式 RECON —— 略读现状只读侦察报告

> 任务：为"文章模式"（与现有 lecture 略读并列、走顺序陪读逻辑）做设计前侦察。
> 性质：**只读**，零代码/配置/git 改动。
> 日期：2026-06-20　分支：refactor
> 所有引用 = 文件路径 + 符号名（component / interface / function / state 变量）+ 行号（辅助锚点）。

---

## A. 略读入口与分流

### A1. "配置这段略读"modal 是哪个组件？

**结论：它不是独立 modal 组件，而是 [`SkimPanel`](features/reader/skim/SkimPanel.tsx) 内部直接渲染的两段条件 JSX。**

- 文件：[features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx)，导出组件 `SkimPanel`（约 L222）。
- 含 "用几个模块解读本文""一次一个 module/part""页码范围""开始领读""私教模式（纯对话）"等文案的 UI 出现在 **两处**：
  - **内联配置块**：`stage === 'diagnosis' && !studyMap && skipDiagnosis && onRegenerateStudyMap` 条件下渲染（约 L877–954）。"开始领读"按钮、"私教模式（纯对话）"按钮都在这里。
  - **弹层 modal**：受 state `showGranularityModal` 控制（约 L1662–1722），结构与内联块基本一致（module 数 select / 节奏 radio / 页码范围 / 开始领读）。
- 页码范围 UI 由本文件内的辅助组件 `PageRangeInput`（约 L94）承担。

> 注意：没有名为 `SkimConfigModal` / `SmartGuideModal` 之类的独立组件文件。配置 UI 与领读 UI 同住 `SkimPanel` 一个 1735 行的大组件里（见 B1）。

### A2. 谁、在什么条件下唤起这个配置 modal？

- 唤起方都是 **`SkimPanel` 自身**（自唤起，不是外部组件传入）。
- 弹层 modal 由 handler `handleSkipToReading`（约 L521–527）打开：当 `onRegenerateStudyMap` 存在时，`setShowGranularityModal(true)`。
- 内联配置块不需要"打开"，它是 diagnosis 阶段在"跳过诊断"路径下的直接渲染分支。
- 真正执行配置→领读的 handler 是 `handleStartWithModuleCount`（约 L489–519）。
- 关键 state：`showGranularityModal`（约 L265，`useState(false)`）。

### A3. "点击进入略读"→"开始领读生成学习地图"的调用链

状态机阶段类型：`SkimStage = 'diagnosis' | 'tutoring' | 'quiz' | 'reading'`（[types.ts:280](types.ts#L280)）。

调用链（组件/handler → 函数）：

```
App.tsx (viewMode === 'skim')                     // 路由到略读，types.ts:279 ViewMode
   → <SkimPanel> 渲染 (features/reader/skim/SkimPanel.tsx)
       → 用户点 "开始领读" 按钮 (L934 内联 / L1717 modal)
       → handleStartWithModuleCount()  (SkimPanel L489–519)
            · setShowGranularityModal(false)
            · extractPdfPageRange() 取页码范围 (若有 PDF)
            · 判断是否需重算 studyMap：
              needRegenerate = onRegenerateStudyMap && (studyMapModuleCount == null
                               || studyMapModuleCount !== selectedModuleCount)
            · 若需要 → onRegenerateStudyMap?.(selectedModuleCount, contentOverride)
                       ↑ App 级回调 handleRegenerateStudyMap (App.tsx 约 L2135)
                          → performPreFlightDiagnosis(docContent, {skimGranularity, moduleCount})
                            ↑ services/geminiService.ts:816 → 返回 StudyMap
            · startFormalReading(contentOverride, freshMap) (SkimPanel 约 L518)
                 · stage → 'reading'
                 · handleSend(...) 发首条领读消息
                     → chatWithSkimAdaptiveTutor(...)  (geminiService.ts:2136) 流式返回
```

涉及的核心 state / prop：`selectedModuleCount`、`skimPace`、`pageRangeStart/End`、`stage`、`isRegeneratingMap`（L264）、`showGranularityModal`（L265）。

> 学习地图 = `StudyMap`（[types.ts:97](types.ts#L97)，仅 `topic / prerequisites / initialBriefing` 三字段），由 `performPreFlightDiagnosis` 生成，不在 `SkimPanel` 本地生成。

### A4. 代码里是否已有"内容类型选择"（lecture vs 文章）？

**结论：无 lecture/article 这一维度的内容类型概念。** grep `contentType`/`ContentType`/`article`/`文章`/`paper`/`essay` 在 reader/skim 相关代码中无命中。

唯一近似但**不是**这件事的概念：

- `DocType = 'STEM' | 'HUMANITIES'`（[types.ts:34](types.ts#L34)）——这是**教学口吻/学科模式**（理科逻辑 vs 社科叙事），不是"文档来源类型"。`SkimPanel` 内有 `onToggleDocType` 按钮（约 L860–871）切换它。
- [features/lecture/LectureTranscriptPage.tsx](features/lecture/LectureTranscriptPage.tsx) 是**课堂录音转写**的独立功能（`LectureRecord`），与略读 PDF 流程不打通，**不是**"略读里选 lecture 类型"的意思。

→ **现状：略读完全不区分内容类型，所有输入一律当作通用 PDF/讲义处理。** 这是文章模式要新引入的维度。

---

## B. 略读核心组件

### B1. SkimPanel 真实路径、行数、核心职责

- 路径：[features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx)
- 行数：**1735 行**（实测 `wc -l`）。
- 核心职责（6 条）：
  1. **诊断阶段 UI**：前置知识掌握度清单、自适应学习路径、跳过诊断/开始测验按钮（约 L877–1050）。
  2. **略读配置**：module 数（2–7）、节奏（module/part）、页码范围 `PageRangeInput`（约 L877–954 与 L1662–1722）。
  3. **领读阶段对话**：AI 领读消息渲染、用户输入与发送、`isChatLoading` 加载态（约 L1100+）。
  4. **模块级产物**：`moduleTakeaways`（模块要点）渲染与用户草稿编辑、`moduleQuiz` 互动测验。
  5. **选区→笔记本**：文本选区检测、"加入笔记本"浮窗、`'skim'` 笔记分类（约 L338–385）。
  6. **阶段状态机**：diagnosis → tutoring → quiz → reading 的条件渲染与切换（`stage` prop 受控）。

### B2. 领读 / 学习地图 / 模块相关核心状态变量

| 变量名 | 类型 | 作用 |
|---|---|---|
| `selectedModuleCount` | `number`(2–7) | 当前模块粒度选择 |
| `skimPace` | `'module' \| 'part'` | 领读节奏：一次一个 module 还是 part |
| `pageRangeStart` / `pageRangeEnd` | `number \| null` | PDF 页码范围（prop 传入） |
| `stage` | `SkimStage` | 当前阶段（diagnosis/tutoring/quiz/reading），受控 prop |
| `studyMap`（prop） | `StudyMap \| null` | 学习地图（topic+prerequisites+briefing） |
| `studyMapModuleCount` | `number \| null` | 已生成地图所用的模块数，用于判断是否需重算 |
| `moduleTakeaways` | `string[] \| null` | 当前模块生成的要点 |
| `moduleQuiz` | `QuizData[] \| null` | 当前模块生成的测验题 |
| `isRegeneratingMap` | `boolean`(L264) | `onRegenerateStudyMap` 执行中的 loading 态 |
| `showGranularityModal` | `boolean`(L265) | 配置弹层可见性 |

> 行号以实际文件为准；上表变量名为语义锚点。部分（如 `stage`/`skimPace`/`pageRange*`/`studyMap`）以 prop 形式由 App 受控传入，而非组件内 `useState`。

### B3. "私教模式（纯对话）"如何实现？同组件分支还是两套独立逻辑？

**结论：两套独立逻辑（独立组件 + 独立数据结构），分流在 App 级的 `viewMode`。**

- 分流点 1（SkimPanel 内）：当 `onStartTutorMode` prop 存在时渲染"私教模式（纯对话）"按钮（约 L944），点击仅调用 `onStartTutorMode()`，把控制权交还 App。
- 分流点 2（App 级，真正分流）：`viewMode` 路由（[types.ts:279](types.ts#L279) `ViewMode = 'deep' | 'skim' | 'layered' | 'tutor'`）。
  - `viewMode === 'skim'` → 渲染 `<SkimPanel>`（App.tsx 约 L2450）。
  - `viewMode === 'tutor'` → 渲染 `<TutorChat>`（App.tsx 约 L2491）。
  - 切换函数 `handleStartTutorMode`（App.tsx 约 L306–309）：`setViewMode('tutor')`。
- 私教组件：[features/tutor/TutorChat.tsx](features/tutor/TutorChat.tsx)（332 行），是**独立组件**，无 stage 状态机、无 studyMap、无模块/测验/页码，只是纯对话。
- 数据层也物理隔离：私教用 `TutorSession`（[types.ts:604](types.ts#L604)），注释明确写"与略读 SkimSession 物理隔离，不含 study map / stage / quiz / page range 等略读包袱"。

> **对文章模式很关键**：现有"私教纯对话"已经是一条"无模块/无进度/无检验"的轻量链路，其数据形 `TutorSession` 恰恰是为"甩掉略读包袱"而设计的。见 F2。

---

## C. 略读 Prompt

### C1. 略读 prompt 定义在哪？

两个文件（grep 全仓确认无第三处藏 prompt）：

- [lib/prompts/systemPrompts.ts](lib/prompts/systemPrompts.ts)
  - `CLASSIFIER_PROMPT`（L2，文档 STEM/HUMANITIES 分类）
  - `STEM_SYSTEM_PROMPT`（L10）
  - `HUMANITIES_SYSTEM_PROMPT`（L84）
- [lib/prompts/layeredReadingPrompts.ts](lib/prompts/layeredReadingPrompts.ts)（**递进阅读**模式，与略读并列的另一模式）
  - `LAYERED_READING_SYSTEM_PROMPT`（L42）、`BILINGUAL_TERMINOLOGY_RULE`（L24）
  - 一组 builder 函数：`buildLayeredModuleGenPrompt` / `buildLayeredRound1Prompt` / `buildLayeredRound2Prompt` / `buildLayeredRound3Prompt` / `buildLayeredRound3UnitPrompt` / `buildLayeredQuestionRound1~3Prompt` / `buildLayeredQuestionGradingPrompt`。

### C2. 略读 prompt 是一个大字符串还是拼接的多段？

- **略读主链路（智能导读 + 私教）**：用 **一个大字符串**——按 `docType` 整段选 `STEM_SYSTEM_PROMPT` 或 `HUMANITIES_SYSTEM_PROMPT`（geminiService.ts 约 L2150：`docType === 'HUMANITIES' ? HUMANITIES_SYSTEM_PROMPT : STEM_SYSTEM_PROMPT`）。无运行时拼接。
- **递进阅读（layered，另一模式）**：是**按场景拼接的多段**——`LAYERED_READING_SYSTEM_PROMPT` 基座 + 各 Round/Question 的 builder 函数 + 共享的 `BILINGUAL_TERMINOLOGY_RULE`。

### C3. "智能导读生成学习地图" vs "私教纯对话"用同一 prompt 吗？

**用同一套 prompt。** 二者都走 `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`（按 docType 选），都经 `chatWithSkimAdaptiveTutor`，**仅 `mode` 参数与 UI 表层不同**（略读 mode='reading' 带 studyMap；私教 mode='tutoring' 纯对话）。

> 注：学习地图的"生成"本身另由 `performPreFlightDiagnosis` 负责（它内部也用 pro 模型 + 自己的 prompt 段落生成 `StudyMap`）；首条领读对话则用上述系统 prompt。

### C4. prompt 是否区分文本类型（lecture/paper/essay/章节/文章）？

**无，prompt 不区分文本类型。** 两个 prompt 文件中没有任何 `if (type === ...)` 之类分支；措辞统一以"PDF / 讲义"泛指输入，未对 lecture / paper / essay / 文章作差异化表述。

---

## D. 略读数据结构与持久化

### D1. "略读 session"的数据结构

`PersistedSkimSession`（[types.ts:583](types.ts#L583)）：

```ts
interface PersistedSkimSession {
  id: string;
  studyMap: StudyMap | null;          // 学习地图
  messages: ChatMessage[];            // 对话历史
  stage: SkimStage;                   // diagnosis|tutoring|quiz|reading
  quizData: QuizData | null;          // 测验
  moduleCount: number;                // 模块数
  skimPace: 'module' | 'part';        // 节奏
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  studyMapModuleCount: number | null;
  topHeight: number;
  focusMode: boolean;
  skipDiagnosis: boolean;
}
```

并列的两个相关结构：私教 `TutorSession`（[types.ts:604](types.ts#L604)）、递进阅读 `LayeredReadingState`（[types.ts:459](types.ts#L459)）。

### D2. 略读 session 存在哪？读写函数

- **本地 IndexedDB**：store `fileHistory`（keyPath `hash`）下 `FilePersistedState.skimSessions: PersistedSkimSession[]`（[types.ts:643](types.ts#L643)）。
  - 写：`storageService.saveFileState(...)`；读：`storageService.getFileState(hash)`（[services/storageService.ts](services/storageService.ts)）。
- **云端 Firestore**：子集合 `sessions/{sessionId}/skims/{skimId}`，**每个 skim session 一文档**（新模型，绕开单文档 1MB 上限；见 firebase.ts L296–307 注释）。
  - 写：`writeSkimSessions(sessionId, skimSessions)`（[services/firebase.ts:300](services/firebase.ts#L300)）。
  - 读：`readSkimSessions(sessionId)`（[services/firebase.ts:283](services/firebase.ts#L283)），并在 `fetchSessionDetails`（L309）里做兼容读取：**新子集合优先，空时回退老数组 `data/main.skimSessions`**（L314–315）。
  - `updateCloudSessionState`（L326）把 skimSessions 改走子集合（L328、L349 `writeSkimSessions`）。
- 私教 session 另存：本地 store `tutorSessions`、云端 `users/{uid}/tutorSessions/{id}`（见 firebase.ts L524 `deleteTutorSessionFromCloud`）。

### D3. 略读 session 云端写入是否带 fileHash / 按文件隔离？（只记录，不修）

- **略读 `PersistedSkimSession` 本身没有 `fileHash` 字段。** 它的隔离靠**父级 `sessionId`**——即 `sessions/{sessionId}/skims/...` 这个路径前缀；`sessionId` 与具体文件挂钩。
- **私教 `TutorSession` 才有 `fileHash?`**（[types.ts:621-622](types.ts#L621)，注释"该私教会话所属 PDF 的 fileHash；旧数据无此字段"）；`storageService` 按 `fileHash` 过滤私教会话，旧数据无此字段会被自动排除。
- 现状如实记录：略读靠 `sessionId` 路径隔离、私教靠 `fileHash` 字段隔离，**两条链路的隔离机制不一致**。本任务不修，仅标注（与历史串台 Bug 相关，见近期 commit `2387df2 fix(tutor): 私教会话按 fileHash 隔离`）。

### D4. 未来加"内容类型"+"结构型/叙事型判断结果"两字段，最自然落点？

**最自然落点 = `PersistedSkimSession`（[types.ts:583](types.ts#L583)）。** 理由：内容类型与结构/叙事判断是"这一段略读"的会话级属性，与 `moduleCount`/`skimPace`/`pageRange*` 同级，放这里最贴合现有读写链路（saveFileState / writeSkimSessions 自动带上，无需新表）。

次选/补充：判断结果若想随"学习地图"一起生成，也可挂到 `StudyMap`（[types.ts:97](types.ts#L97)），因为它就是 `performPreFlightDiagnosis` 的产物、天然是"分析一篇文本后得到的结构"。

> 纠偏：仅就"略读 session"而言，**不建议**落到 `LayeredReadingModule`——那是另一条**递进阅读**模式的 per-module 结构，与略读 session 不同链路。（指出即可，不改。）

---

## E. 模型调用层

### E1. 略读调 Gemini 的入口函数 + model 字符串

- 入口：`chatWithSkimAdaptiveTutor`（[services/geminiService.ts:2136](services/geminiService.ts#L2136)）。
- 当前 model：**`gemini-3.1-pro-preview`**（该函数内约 L2189）。
- 配置方式：**硬编码字符串字面量**，散落在各 `ai.models.generateContent({ model: ... })` 调用里；全仓几乎所有略读相关函数都直接写 `'gemini-3.1-pro-preview'`。唯一被抽成常量的是 `MULTI_DOC_QA_MODEL = 'gemini-3.1-pro-preview'`（L493，仅多文档问答用）。轻量任务（分类/转写）用 `'gemini-3-flash-preview'`（L133/164/226）。**没有集中化 model 配置或环境变量。**

### E2. "生成学习地图" vs "私教对话" 各调哪个 service 函数？

- 生成学习地图：`performPreFlightDiagnosis(docContent, options?: { skimGranularity?, moduleCount? }): Promise<StudyMap | null>`（[geminiService.ts:816](services/geminiService.ts#L816)）。由 App `handleRegenerateStudyMap` 调用。
- 私教对话：`chatWithSkimAdaptiveTutor(docContent, history, newMessage, mode, docType?, readingOptions?, abortSignal?, userImagesBase64?)`（[geminiService.ts:2136](services/geminiService.ts#L2136)），私教侧以 `mode='tutoring'` 调用（[TutorChat.tsx](features/tutor/TutorChat.tsx) 约 L166）。
- 即：学习地图与私教对话**是两个不同函数**，但略读领读对话与私教对话**共用** `chatWithSkimAdaptiveTutor`（仅 mode 不同）。

### E3. geminiService 里与略读/领读/私教相关的函数清单

- `performPreFlightDiagnosis`（L816）— 非流式，生成 `StudyMap`
- `generateGatekeeperQuiz`（L887）— 非流式，生成把关测验
- `generateModuleTakeaways`（L924）— 非流式，模块要点
- `generateModuleQuiz`（L967）— 非流式，模块测验
- `chatWithSkimAdaptiveTutor`（L2136）— **流式**，略读领读 + 私教共用
- `chatWithAdaptiveTutor`（L2040）— 流式，考试备考链路（**非**略读）
- `chatWithLayeredReadingTutor`（L3162）— 流式，递进阅读模式
- `generateLayeredReadingModules`（L3206）— 非流式，递进阅读模块生成
- 辅助分类：`classifyDocument`（L133）、`classifyLearnerTurn`（L164）

---

## F. 风险与意外

### F1. 与"新增并列模式"冲突的硬编码假设

1. **`PersistedSkimSession` 强制带模块/进度/测验包袱**：`stage`、`quizData`、`moduleCount`、`skimPace`、`studyMapModuleCount` 都是**非可选**字段。文章模式"无模块/无进度条/不检验"，若复用此结构会被迫塞无意义的 `stage`/`quizData`。设计时要决定：文章模式是复用 `PersistedSkimSession`（容忍冗余字段）还是另起结构。
2. **`viewMode` 是固定四值联合** `'deep' | 'skim' | 'layered' | 'tutor'`（types.ts:279）。新增并列模式要么新增第五值，要么在 `'skim'` 内部再分内容类型——两条路成本不同，需产品先定。
3. **领读链路硬绑 `studyMap` + 阶段机**：A3 调用链里 `handleStartWithModuleCount` → `onRegenerateStudyMap` → `performPreFlightDiagnosis` → `stage='reading'` 是一条"必生成模块化学习地图"的流水线，没有"跳过地图、直接顺序陪读"的旁路。文章模式的"顺序陪读"需要一条不经过 `performPreFlightDiagnosis` 的新链路。
4. **prompt 不分文本类型**（C4），文章模式需要新增 prompt 或在现有大字符串里加分支——而现有略读 prompt 是整段大字符串、非拼接，加条件分支不如 layered 那套 builder 方便。
5. **配置 UI 与领读 UI 同住 `SkimPanel`（1735 行）**：入口处要"先选内容类型"，意味着要在这个已超大的组件前面再插一层选择，或把入口上提到 App 级。组件已偏大，是改动热点。

### F2. 产品负责人设计前必须知道的现状事实

1. **已经存在一条"无模块/无进度/纯顺序对话"的链路 = 私教模式（`TutorChat` + `TutorSession`）。** 它的数据形被刻意设计为"甩掉 study map / stage / quiz / page range 包袱"（types.ts:600-602 注释）。文章模式的"顺序陪读"在形态上更接近私教，而非模块化略读——**值得评估：文章模式是该长在私教链路上，还是长在略读链路上。** 这会直接决定数据结构与组件复用方向。
2. **还有第三条模式"递进阅读"（layered，`viewMode='layered'`）**：它本身就是"顺着文本结构 Story→Structure→Details 一段段走"的顺序逻辑，prompt 用 builder 拼接、有独立 `LayeredReadingState`。文章模式的"AI 顺着文本结构一段段陪读"与 layered 概念高度重叠——**设计前务必确认文章模式与 layered 的边界**，否则可能造重复轮子。
3. **隔离机制不统一**：略读靠 `sessionId` 路径、私教靠 `fileHash` 字段（D3）。文章模式若复用任一链路，要明确走哪套隔离，避免重蹈近期"私教跨 PDF 串台"那类 Bug。
4. **model 全硬编码** `gemini-3.1-pro-preview`，无集中配置（E1）。文章模式若想用不同模型/温度，需要逐处加，没有现成开关。
5. **`DocType`（STEM/HUMANITIES）已占用"内容分类"的直觉位置但语义不同**——它是教学口吻，不是文档类型。新引入的"内容类型（lecture/文章）"是**正交的新维度**，不要和 `DocType` 混用一个字段。

### F3. 与清单不符的意外发现

1. 仓库根目录已堆积大量历史侦察/迁移文档（`SKIM_*.md`、`REFACTOR_*.md`、`READER_BATCH*_*.md` 等数十份）。其中 `SKIM_MULTISESSION_RECON.md`、`SKIM_PART_MODE_*.md`、`SKIM_PAGERANGE_*.md`、`SKIM_SKIP_ENTRY_TRACE.md` 与本次主题强相关，**可作为补充背景**，但本报告所有结论均以**当前代码实测**为准，未直接采信旧文档（旧文档可能滞后）。
2. 当前工作区有未提交改动：`CONTEXT.md`、`.claude/settings.local.json`（git status 快照）。**本任务未触碰、未提交任何文件**（除新建本报告）。
3. `chatWithAdaptiveTutor`（L2040，考试备考）与 `chatWithSkimAdaptiveTutor`（L2136，略读）名字极近、易混淆——前者**不属于**略读链路，引用时勿弄错。

---

## 附：关键抓手速查

| 主题 | 符号 | 位置 |
|---|---|---|
| 略读主组件 | `SkimPanel` | features/reader/skim/SkimPanel.tsx（1735 行） |
| 私教组件 | `TutorChat` | features/tutor/TutorChat.tsx（332 行） |
| 模式路由 | `ViewMode` / `viewMode` | types.ts:279 / App.tsx |
| 略读阶段机 | `SkimStage` / `stage` | types.ts:280 |
| 略读 session | `PersistedSkimSession` | types.ts:583 |
| 私教 session | `TutorSession` | types.ts:604 |
| 学习地图 | `StudyMap` | types.ts:97 |
| 递进阅读 state | `LayeredReadingState` | types.ts:459 |
| 学科口吻 | `DocType` | types.ts:34 |
| 略读 prompt | `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT` | lib/prompts/systemPrompts.ts:10 / 84 |
| 递进阅读 prompt | `LAYERED_READING_SYSTEM_PROMPT` + builders | lib/prompts/layeredReadingPrompts.ts:42 |
| 领读/私教对话入口 | `chatWithSkimAdaptiveTutor` | services/geminiService.ts:2136 |
| 生成学习地图 | `performPreFlightDiagnosis` | services/geminiService.ts:816 |
| 云端读/写略读 | `readSkimSessions` / `writeSkimSessions` | services/firebase.ts:283 / 300 |
| 当前模型 | `gemini-3.1-pro-preview`（硬编码） | services/geminiService.ts 多处 |

— 报告完。未改任何代码 / 配置 / git。
