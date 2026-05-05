# P2 依赖扫描报告

> 仅静态扫描，**未修改任何代码文件**。
> 配套文档：[REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md)、[P2_COMPONENT_GLOSSARY.md](P2_COMPONENT_GLOSSARY.md)、[P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md)
> 生成时间：2026-05-03 · refactor 分支

## 全局符号
- ✓ 文件存在
- ✗ 文件不存在（你列表里有但仓库里没有）
- 🟢 干净独立（被引用 ≤ 2 处）
- ⚠️ 跨模块强耦合（≥ 5 处使用）
- 🔴 循环依赖（实际未发现，下文说明）
- 「外部依赖」= node_modules（react/lucide/firebase/jspdf 等），不参与搬迁

---

## features/reader/skim/（略读）

### 预期清单核对

| 你列出的文件 | 是否存在 |
|---|---|
| [features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx) | ✓ |
| `components/skimMarkdownTheme.tsx` | ✗ **不存在** |
| `utils/skimMarkdownToExportHtml.ts` | ✗ **不存在** |
| `utils/extractNthGfmTable.ts` | ✗ **不存在** |
| `utils/captureElementToPng.ts` | ✗ **不存在** |

> ⚠️ **重要**：你列出的 4 个 skim 卫星文件**全部不存在于当前仓库**。我用 `Glob "**/*[Ss]kim*"` 全仓搜索，仅命中 `features/reader/skim/SkimPanel.tsx` 一个文件。可能性：(a) 这是你脑中"想做"的拆分目标而不是当前已有；(b) 是从某个早期分支记忆来的；(c) 在另一个 worktree 里。请确认。

### SkimPanel.tsx 的依赖

**项目内部 import（需要跟着搬或保留）**：
- `../types`（仓库根 types.ts，全局共享）
- `../services/geminiService`：`chatWithSkimAdaptiveTutor`、`generateGatekeeperQuiz`、`generateModuleTakeaways`、`generateModuleQuiz`

**外部依赖**：`react`、`react-markdown`、`remark-math`、`remark-gfm`、`rehype-katex`、`lucide-react`

### 被外部引用情况
- `SkimPanel` 仅被 [App.tsx:8](App.tsx) import 一次
- 没有任何卫星文件需要迁移

### 命名扫描
全仓库（除 node_modules）含 `skim` 字样的文件：**仅 SkimPanel.tsx**。

### 略读相关但你没列的依赖
- 与"略读阶段流"（StudyMap、SkimStage、Prerequisite、QuizData、DocType、ChatMessage）相关的全部类型在 [types.ts](types.ts)（全局，不归 skim）。
- `package.json` 里有一个**守护脚本** `check:skim-tutor`：搬迁时若改动 SkimPanel.tsx 路径，可能需要同步更新该脚本里的 `'features/reader/skim/SkimPanel.tsx'` 字面量。
- `docs/SKIM_VS_EXAM_TUTOR_API.md` 是该模块的设计文档，可考虑随同搬迁。

### 风险标记
🟢 **干净独立**。仅依赖 types + geminiService 的 4 个函数，无任何卫星文件，搬迁阻力极小。
唯一非代码的注意点是 `package.json:check:skim-tutor` 脚本中的硬编码路径。

---

## features/reader/deep-read/（精读）

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/ExplanationPanel.tsx](components/ExplanationPanel.tsx) | ✓ |

### ExplanationPanel.tsx 的依赖
- `../types`：`ChatMessage`
- `../utils/textUtils`：`plainTextToHtmlWithSupSub`、`normalizeSelectionText`、`dedupeHtml`
- `./LoadingInteractiveContent`（**精读区私有的"AI 思考中"动画组件**）

### 被外部引用情况
- ExplanationPanel 仅被 [App.tsx:7](App.tsx) import
- LoadingInteractiveContent 仅被 ExplanationPanel.tsx import

### 命名扫描
全仓库含 `explain` 字样的代码文件：**0 个**。无 deep/read 命名的卫星文件。

### 遗漏候选 ✅
- **[features/reader/deep-read/LoadingInteractiveContent.tsx](features/reader/deep-read/LoadingInteractiveContent.tsx)（233 行）必须跟着搬到 deep-read**。它只服务于精读"AI 生成中"占位动画，没有别的调用方。你列在 `shared/` 里是错位——它不是共享件。
- ⚠️ **textUtils 是跨模块**：被 ExplanationPanel + Notebook + SlideViewer 三处使用。它应该归 `lib/text/`，不能塞 deep-read 内部。

### 风险标记
🟢 **干净独立**（前提：把 LoadingInteractiveContent 也归到此模块；textUtils 留在 lib/）。

---

## features/reader/slide-viewer/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/SlideViewer.tsx](components/SlideViewer.tsx) | ✓ |

### SlideViewer.tsx 的依赖
- `../types`：`Slide`、`SlideAnnotation`
- `../utils/textUtils`：`plainTextToHtmlWithSupSub`

### 被外部引用情况
- 仅被 [App.tsx:5](App.tsx) import

### 命名扫描
全仓库含 `slide` 字样的代码文件：
- `components/SlideViewer.tsx` ✓
- `components/SlidePageComments.tsx` ← 这是页面评论，归 page-notes（你已经分开了）

### 遗漏候选
无。SlideViewer 不依赖 page-notes、不依赖 marks、不依赖 notebook，三者都是 App.tsx 平行编排。

### 风险标记
🟢 **干净独立**。

---

## features/reader/page-notes/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/SlidePageComments.tsx](components/SlidePageComments.tsx) | ✓ |

### SlidePageComments.tsx 的依赖
- `../types`：`SlidePageComment`
- 仅 React + lucide-react

### 被外部引用情况
- 仅被 [App.tsx:6](App.tsx) import

### 命名扫描 / 遗漏候选
无其他相关文件。所有"本页评论"业务数据（PageCommentsCache 类型、保存逻辑）都在 App.tsx 内部状态里。

### 风险标记
🟢 **极简组件**（215 行），无业务依赖。

---

## features/reader/marks/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/PageMarkPanel.tsx](components/PageMarkPanel.tsx) | ✓ |

### PageMarkPanel.tsx 的依赖
- `../types`：`MarkType`、`MarkPriority`、`PageMark`
- 仅 React + lucide-react

### 被外部引用情况
- 仅被 [App.tsx:20](App.tsx) import
- 但 `MarkType` / `PageMark` 类型还被 [Sidebar.tsx](shared/layout/Sidebar.tsx) 用（Sidebar 显示带星标的页面），所以**类型不要搬走**，留在 types.ts。

### 命名扫描
- `components/PageMarkPanel.tsx` ✓
- `components/ExamWorkspaceAssistantMarkdown.tsx`（与 marks 无关，只是 markdown）
- `utils/extractBoldTermsFromMarkdown.ts`（与 marks 无关）

### 风险标记
🟢 干净，但**类型字段被 Sidebar 共用**，搬迁时只搬组件即可，不搬类型。

---

## features/reader/notebook/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [features/reader/notebook/Notebook.tsx](features/reader/notebook/Notebook.tsx) | ✓ |

### Notebook.tsx 的依赖
- `../types`：`PageNotes`、`Note`
- `../utils/textUtils`：`normalizeSelectionText`、`noteDisplayWithSuperscript`、`stripHtml`

### 被外部引用情况
- 仅被 [App.tsx:12](App.tsx) import

### 跨模块特别检查（你的关切：是否跨用了略读的东西？）
**否**。Notebook 只 import 了 types + textUtils。**完全不依赖 SkimPanel、SlideViewer、ExplanationPanel 中的任何东西**。
反过来，SkimPanel 等也不 import Notebook。Notebook 是阅读区的"独立侧栏"，业务上和略读/精读并行而非嵌套。

### 风险标记
🟢 **干净独立**。

---

## features/reader/side-quest/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/SideQuestPanel.tsx](components/SideQuestPanel.tsx) | ✓ |

### SideQuestPanel.tsx 的依赖
- `../types`：`ChatMessage`
- 仅 React + lucide-react + react-markdown 套件
- **本组件自己不调 geminiService**——AI 调用在 App.tsx 完成，结果通过 props 传入

### 被外部引用情况
- 仅被 [App.tsx:17](App.tsx) import

### 你的核心问题：全局选区监听代码在哪？

**位置**：[App.tsx:330](App.tsx) 起，到 [App.tsx:524](App.tsx) 止，是一段**~190 行的内联逻辑**，不是单独的 hook。关键点：

| 行号 | 内容 |
|------|------|
| [App.tsx:330](App.tsx) | `selectionTimeoutRef = useRef<number \| null>(null);`（防抖 ref） |
| [App.tsx:451-505](App.tsx) | `handleSelectionChange` 函数体：listen `selectionchange` → `window.getSelection()` → 计算选区位置 → 设置 `triggerPosition` 等 state |
| [App.tsx:514](App.tsx) | `document.addEventListener('selectionchange', handleSelectionChange);` |
| [App.tsx:519](App.tsx) | `document.removeEventListener('selectionchange', handleSelectionChange);` |
| [App.tsx:1925-1959](App.tsx) | `handleTriggerSideQuest` + `handleSideQuestSend` 两个回调，在用户点 SideQuest 触发按钮 / 发消息时调 `runSideQuestAgent`（geminiService）|
| [App.tsx:2244-2263](App.tsx) | 渲染：选区出现时显示触发按钮 + 渲染 `<SideQuestPanel>` |

注意：**这段逻辑既服务于 SideQuest 触发，也可能服务于其他选区操作**——需要你看一眼 App.tsx:451-505 的 `handleSelectionChange` 内部分支，确认它有没有给精读/笔记/标注用的别的 case。如果只服务 SideQuest，就可以独立成 hook。

### 选区监听是否应该抽 hook？

**建议**：✅ 抽出来。这段 ~190 行的"全局选区监听 + 触发按钮位置计算 + SideQuest 状态管理"完全可以做成 `features/reader/side-quest/hooks/useTextSelection.ts`，而 App.tsx 只保留 `<SideQuestPanel {...sideQuest} />` 一个 JSX。但⚠️：**抽 hook 是 P5 阶段（拆 App.tsx）的工作，不属于 P2 范围**。P2 阶段只搬文件、不重构内部逻辑。

### 风险标记
🟢 SideQuestPanel 本身简单（149 行）；但与 App.tsx 的"选区监听"逻辑耦合极重，**搬完文件后该选区监听仍然留在 App.tsx**，只是把"被调用的面板组件"挪了位置。

---

## features/review/（学习工具中枢）

### 预期清单核对（你的"ReviewPage + tools/ 13 个"）

| 文件 | 状态 |
|---|---|
| [features/review/ReviewPage.tsx](features/review/ReviewPage.tsx) | ✓ |
| 13 个工具组件 | 见下表 |

> ⚠️ "13 个组件"未明指——根据 [P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md) 九宫格映射 + 一个保存产物面板，能凑出 11 个面板 + StudioPanel + SavedArtifactPreview = 13 个。下面以这 13 个枚举：

| # | 组件 | 状态 |
|---|------|------|
| 1 | [QuizReviewPanel.tsx](features/review/tools/QuizReviewPanel.tsx) | ✓ |
| 2 | [FlashCardReviewPanel.tsx](features/review/tools/FlashCardReviewPanel.tsx) | ✓ |
| 3 | [StudyGuidePanel.tsx](features/review/tools/StudyGuidePanel.tsx) | ✓ |
| 4 | [TerminologyPanel.tsx](features/review/tools/TerminologyPanel.tsx) | ✓ |
| 5 | [MindMapPanel.tsx](features/review/tools/mindMap/MindMapPanel.tsx) | ✓（带子件 MindMapFlowCanvas + MindMapFlowNode） |
| 6 | [FeynmanPanel.tsx](features/review/tools/FeynmanPanel.tsx) | ✓ |
| 7 | [TrickyProfessorPanel.tsx](features/review/tools/TrickyProfessorPanel.tsx) | ✓ |
| 8 | [TrapListPanel.tsx](features/review/tools/TrapListPanel.tsx) | ✓ |
| 9 | [ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx) | ✓ |
| 10 | [ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) | ✓ |
| 11 | [MultiDocQAPanel.tsx](features/review/tools/MultiDocQAPanel.tsx) | ✓ |
| 12 | [StudioPanel.tsx](shared/studio/StudioPanel.tsx) | ✓ |
| 13 | [SavedArtifactPreview.tsx](shared/studio/SavedArtifactPreview.tsx) | ✓ |

### ReviewPage.tsx 的依赖
- `../services/firebase`：`getUserSessions`、`fetchSessionDetails`、`updateCloudSessionState`
- `../services/storageService`：`storageService`
- `../utils/collectSavedArtifactsFromLocalHistory`、`../utils/collectSavedArtifactsFromCloud`、`../utils/mergeArtifactLibraries`、`../utils/savedArtifactMeta`
- `./SavedArtifactPreview`：`ArtifactFullView`
- `../types`：`CloudSession`
- 外部：`react`、`firebase/auth`、`lucide-react`

### 卫星文件 / 各工具的私有 utils
我对每个面板的 import 做了完整核对：

| 面板 | 私有 utils（仅它用） | 共享 utils |
|------|-----------------|------------|
| QuizReviewPanel | — | services/geminiService（generateQuizSet） |
| FlashCardReviewPanel | — | services/geminiService（generateFlashCards、estimateFlashCardCount） |
| StudyGuidePanel | — | services/geminiService（generateStudyGuide） |
| TerminologyPanel | — | services/geminiService（extractTerminology） |
| MindMapPanel | utils/mindMapFlowAdapter（仅 mindmap 用）+ MindMapFlowCanvas/MindMapFlowNode 子件 + utils/mindMapElkLayout + utils/mindMapLabel + utils/mindMapLayout + utils/mindMapScope | services/geminiService（4 个 mindMap 函数） |
| FeynmanPanel | — | services/geminiService（4 个 feynman 函数） |
| TrickyProfessorPanel | — | services/geminiService |
| TrapListPanel | — | — |
| ExamSummaryPanel | — | services/geminiService |
| ExamTrapsPanel | — | services/geminiService |
| MultiDocQAPanel | — | services/geminiService |
| StudioPanel | utils/savedArtifactMeta（也被 ReviewPage、SavedArtifactPreview 用） | — |
| SavedArtifactPreview | utils/savedArtifactMeta（同上） | — |

### 工具之间是否互相引用？

逐对核查结果：
- StudioPanel **再导出** SavedArtifactPreview 中的 `ArtifactFullView`（[StudioPanel.tsx:6-7](shared/studio/StudioPanel.tsx)）
- ReviewPage 直接 import `ArtifactFullView` from SavedArtifactPreview
- MindMapPanel → MindMapFlowCanvas → MindMapFlowNode（一条单向链）
- 其他 11 个工具面板**两两之间无任何 import 关系**

✅ **无循环依赖**。

### 命名扫描
全仓库含 `review` 字样的文件：
- `ReviewPage.tsx` ✓
- `QuizReviewPanel.tsx` ✓
- `FlashCardReviewPanel.tsx` ✓
- 没有其他叫 review 但你没列出的文件。

### 遗漏候选

| 应归入 features/review/ 但你 13 个里没明列 | 说明 |
|---|---|
| [features/review/tools/mindMap/MindMapFlowCanvas.tsx](features/review/tools/mindMap/MindMapFlowCanvas.tsx)（206 行） | MindMapPanel 内部子件，必须一起搬 |
| [features/review/tools/mindMap/MindMapFlowNode.tsx](features/review/tools/mindMap/MindMapFlowNode.tsx)（155 行） | 同上 |
| [utils/mindMapFlowAdapter.ts](utils/mindMapFlowAdapter.ts) + [mindMapElkLayout.ts](utils/mindMapElkLayout.ts) + [mindMapLabel.ts](utils/mindMapLabel.ts) + [mindMapLayout.ts](utils/mindMapLayout.ts) + [mindMapScope.ts](utils/mindMapScope.ts) | 思维导图私有算法（5 文件，均仅供 MindMapPanel 使用），归 `features/review/tools/mindmap/lib/` |
| [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) | 被 ReviewPage、StudioPanel、SavedArtifactPreview 三家共用，应放 `features/review/lib/` 内部共享层 |
| [utils/collectSavedArtifactsFromLocalHistory.ts](utils/collectSavedArtifactsFromLocalHistory.ts) + [collectSavedArtifactsFromCloud.ts](utils/collectSavedArtifactsFromCloud.ts) + [mergeArtifactLibraries.ts](utils/mergeArtifactLibraries.ts) | 仅被 ReviewPage 用，归 `features/review/lib/` |
| [utils/artifactSourceLabel.ts](utils/artifactSourceLabel.ts) | 被 App.tsx 用，**不归 review**，留 `lib/` 或 App 共享层 |

### 风险标记
- ⚠️ **review 是聚合超大模块**——总计 13 主件 + 2 mindmap 子件 + 5 mindmap utils + 4 saved-artifact utils = **24 个文件**。
- ⚠️ ReviewPage 同时依赖 Firebase + storageService + 4 个 utils + 1 个内部组件，是模块的"门户"。
- 🟢 各工具面板之间无横向依赖——可以 1 个面板 1 次 commit 增量搬。

---

## features/exam/

### 预期清单核对（17 个 Exam* 系列组件）

按命名匹配 + ExamHubModal 子树 + workspace 子树：

| # | 文件 | 状态 |
|---|------|------|
| 1 | [ExamHubModal.tsx](components/ExamHubModal.tsx) | ✓ |
| 2 | [ExamCenterPanel.tsx](components/ExamCenterPanel.tsx) | ✓ |
| 3 | [ExamLinkModal.tsx](components/ExamLinkModal.tsx) | ✓ |
| 4 | [ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | ✓ |
| 5 | [MaintenanceFlashcardDeck.tsx](components/MaintenanceFlashcardDeck.tsx) | ✓ |
| 6 | [MaintenanceFeedbackCelebration.tsx](components/MaintenanceFeedbackCelebration.tsx) | ✓ |
| 7 | [StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) | ✓（在 ExamHubModal 第 3 个 tab） |
| 8 | [ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | ✓ |
| 9 | [ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | ✓ |
| 10 | [ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) | ✓ |
| 11 | [ExamWorkspaceAssistantMarkdown.tsx](components/ExamWorkspaceAssistantMarkdown.tsx) | ✓ |
| 12 | [ExamWorkspaceCitationBlock.tsx](components/ExamWorkspaceCitationBlock.tsx) | ✓ |
| 13 | [ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) | ✓ |
| 14 | [KcGlossarySidebar.tsx](components/KcGlossarySidebar.tsx) | ✓ |
| 15 | [KnowledgePointInspectPanel.tsx](components/KnowledgePointInspectPanel.tsx) | ✓ |
| 16 | [WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx) | ✓ |
| 17 | [WorkspaceEvidenceReportModal.tsx](components/WorkspaceEvidenceReportModal.tsx) | ✓ |
| ➕ | [ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx)、[ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) | 名字带 Exam 但**实际从九宫格触发**，归 `features/review/`。本模块**不应**包含。 |

### 17 个组件之间的依赖关系

| 关系 | 来源文件 |
|---|---|
| ExamHubModal → ExamCenterPanel + ExamDailyMaintenancePanel + StudyFlowPanel | [ExamHubModal.tsx:6-8](components/ExamHubModal.tsx) |
| ExamCenterPanel → ExamLinkModal | [ExamCenterPanel.tsx:6](components/ExamCenterPanel.tsx) |
| ExamDailyMaintenancePanel → MaintenanceFlashcardDeck + MaintenanceFeedbackCelebration | [ExamDailyMaintenancePanel.tsx:20-21](components/ExamDailyMaintenancePanel.tsx) |
| ExamWorkspacePage → ExamWorkspaceSocraticChat + KcGlossarySidebar + KnowledgePointInspectPanel + WorkspaceKcProbeModal + WorkspaceEvidenceReportModal + ExamWorkspaceMaterialPreview | [ExamWorkspacePage.tsx:37-42](components/ExamWorkspacePage.tsx) |
| ExamWorkspaceSocraticChat → ExamWorkspaceAssistantMarkdown + ExamWorkspaceCitationBlock | [ExamWorkspaceSocraticChat.tsx:38-39](components/ExamWorkspaceSocraticChat.tsx) |
| ExamWorkspaceAssistantMarkdown → ExamWorkspaceCitationBlock | [ExamWorkspaceAssistantMarkdown.tsx:12](components/ExamWorkspaceAssistantMarkdown.tsx) |
| WorkspaceKcProbeModal → 内部 import `ConflictPageHint` from WorkspaceEvidenceReportModal | [WorkspaceKcProbeModal.tsx:18](components/WorkspaceKcProbeModal.tsx) |
| ExamPredictionPanel | 与上述 17 个组件**无横向 import 关系**——它独立于 workspace + maintenance + center 子树 |

✅ **无循环依赖**。

### utils/exam* 系列

| 文件 | 行 | 用途 |
|---|---|---|
| [utils/examChunkIndex.ts](utils/examChunkIndex.ts) | 126 | 构建 PDF 切块索引 |
| [utils/examChunkRetrieval.ts](utils/examChunkRetrieval.ts) | 195 | BM25 检索 |
| [utils/examMaintenanceEligibility.ts](utils/examMaintenanceEligibility.ts) | 26 | 维护资格 |
| [utils/examSchedule.ts](utils/examSchedule.ts) | 228 | 考试压力 + 每日规划 |
| [utils/examWorkspaceCitations.ts](utils/examWorkspaceCitations.ts) | 176 | 引文解析 |
| [utils/examWorkspaceLsapKey.ts](utils/examWorkspaceLsapKey.ts) | 115 | LSAP key + 工作台对话存储 |
| [utils/examWorkspaceOrchestrator.ts](utils/examWorkspaceOrchestrator.ts) | 89 | LSAP 探针状态机 |

### utils/maintenance* 系列

| 文件 | 行 | 用途 |
|---|---|---|
| [utils/maintenanceStrategy.ts](utils/maintenanceStrategy.ts) | 160 | 维护策略 |
| [data/maintenanceFeedbackCopy.ts](data/maintenanceFeedbackCopy.ts) | 75 | 维护文案数据（不在 utils 里，但归属一致） |

### services/ 中专属考试的服务

| 文件 | 行 | 用途 |
|---|---|---|
| [services/examChunkIndexStorage.ts](services/examChunkIndexStorage.ts) | 65 | IndexedDB 持久化 chunk 索引 |
| [services/firebase.ts](services/firebase.ts) 中的考试相关函数 | 部分（不能整文件搬） | `listExams`、`createExam`、`updateExam`、`deleteExam`、`addExamMaterialLink`、`removeExamMaterialLink`、`listExamMaterialLinks`、`getDailyPlanCache`、`setDailyPlanCache`、`deleteDailyPlanCache`——这些 P6 才拆 |

### 还有什么遗漏

| 文件 | 备注 |
|---|---|
| [data/studyFlowTemplates.ts](data/studyFlowTemplates.ts)（248 行） | 仅 StudyFlowPanel 使用，归 `features/exam/study-flow/` |
| [data/maintenanceFeedbackCopy.ts](data/maintenanceFeedbackCopy.ts)（75 行） | 仅 ExamDailyMaintenancePanel 使用，归 `features/exam/maintenance/` |
| [data/disciplineTeachingProfiles.ts](data/disciplineTeachingProfiles.ts)（49 行） | 被 services/geminiService 用（不只是考试用），P3 阶段处理，**不归 features/exam/** |
| [data/scaffoldingPrompt.ts](data/scaffoldingPrompt.ts)（53 行） | 同上 |
| [utils/studyFlowInference.ts](utils/studyFlowInference.ts)（100 行） | 仅 StudyFlowPanel 用，归 `features/exam/study-flow/lib/` |
| [utils/scaffoldingClassifier.ts](utils/scaffoldingClassifier.ts)（91 行） | 被 ExamWorkspaceSocraticChat **和** services/geminiService 用——是跨 feature 的 lib/，**不归 features/exam/** |
| [utils/bkt.ts](utils/bkt.ts)、[utils/lsapScore.ts](utils/lsapScore.ts) | 被 ExamPredictionPanel + WorkspaceKcProbeModal **和** App.tsx 用，归 `lib/bkt/`，**不归 features/exam/** |
| [utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) | 被 ExamWorkspaceSocraticChat + App.tsx 用——跨 feature，归 `lib/text/` |
| [utils/glossaryTermFilter.ts](utils/glossaryTermFilter.ts) | 仅 ExamWorkspaceSocraticChat 用——但语义通用，归 `lib/text/` 或 workspace/lib/ 二选一 |
| [docs/EXAM_*.md](docs/) + [docs/P*_EXAM_*.md](docs/) | 4 个文档，归 `features/exam/docs/` 或保留在 docs/ |

### 风险标记
- ⚠️⚠️ **exam 是项目最大的模块**：17 个组件 + 7 个 exam-utils + 1 个 chunk-index-storage service + 2 个 data 文件 + 4 个文档 = **31 个待搬迁 artifact**。
- 🔴 **没有真正的循环依赖**，但 WorkspaceKcProbeModal 反向 import `ConflictPageHint` 自 WorkspaceEvidenceReportModal——两者必须在同一目录，否则会出现 `../EvidenceReportModal/ConflictPageHint` 跨子目录引用。
- ⚠️ ExamWorkspaceMaterialPreview（996 行）依赖 lib/pdf/ 的 `loadPdfDocumentFromFile`、`renderPdfPageToCanvas`、`computeQuoteHighlightRects`——必须等 lib/pdf/ 先搬完。

---

## features/sessionStart/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/MoodDialog.tsx](components/MoodDialog.tsx) | ✓ |
| [components/FiveMinFlowPanel.tsx](components/FiveMinFlowPanel.tsx) | ✓ |

### 依赖
- **MoodDialog.tsx**：仅 `react`，**无任何项目内 import**（48 行）
- **FiveMinFlowPanel.tsx**：
  - `../types`：`QuizData`
  - `../services/geminiService`：`generateFiveMinGuide`、`extractTerminology`、`TerminologyItem`、`generateQuizSet`
  - 外部：`react-markdown` 套件、`lucide-react`

### 被外部引用情况
- MoodDialog 仅被 [App.tsx:31](App.tsx) import
- FiveMinFlowPanel 仅被 [App.tsx:33](App.tsx) import
- **二者无横向 import**——它们由 App.tsx 编排在同一个"启动流"流程里，但代码上独立

### 风险标记
🟢 **极简**。

---

## features/energyRefuel/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/ChatHug.tsx](components/ChatHug.tsx) | ✓ |
| [components/TaskHug.tsx](components/TaskHug.tsx) | ✓ |

### 依赖
- **ChatHug.tsx**：`../types`（ChatMessage）+ `../services/geminiService`（runChatHugAgent）
- **TaskHug.tsx**：`../types`（ChatMessage）+ `../services/geminiService`（runTaskHugAgent、runTaskHugChat、TaskHugResponse）

### 被外部引用情况
- ChatHug 仅被 [App.tsx:11](App.tsx) import
- TaskHug 仅被 [App.tsx:10](App.tsx) import
- 二者无横向 import

### 命名扫描
全仓库含 `Hug` 字样的文件：仅 ChatHug.tsx + TaskHug.tsx。无其他卫星。
全仓库含 `energy` 字样：未发现命名为 energy 的文件。但 App.tsx 内有 `setIsEnergyMode(true)` 这条 state 切换（"能量补给"按钮），渲染的内容是 inline JSX，不是独立组件——P2 阶段不需要单独搬。

### 风险标记
🟢 干净。

---

## features/lecture/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/ClassroomPanel.tsx](components/ClassroomPanel.tsx) | ✓ |
| [components/LectureTranscriptPage.tsx](components/LectureTranscriptPage.tsx) | ✓ |

### 依赖
- **ClassroomPanel.tsx**：仅 `../types`（LectureRecord）+ React + lucide-react
- **LectureTranscriptPage.tsx**：仅 `../types`（LectureRecord）+ React + lucide-react
- **两个组件本身都不直接调 transcriptionService**

### transcriptionService 是否专属于 lecture？

✅ **是**。详情：
- [services/transcriptionService.ts](services/transcriptionService.ts)（66 行）只导出 `startRecording`、`stopRecording`、`isTranscriptionSupported`
- 全仓库 import 它的只有 [App.tsx:44](App.tsx)：`import { startRecording, stopRecording, isTranscriptionSupported } from './services/transcriptionService';`
- App.tsx 中这些函数仅用于"上课模式"的录音控制——见 `handleStartClass` / `handleEndClass`（与 ClassroomPanel 配合）

**结论**：
- transcriptionService.ts 可以归 `features/lecture/services/`，**也**可以保守地放 `lib/transcription/`（如果以后做"会议记录""问答语音输入"等场景，这个浏览器 Web Speech 包装可以复用）
- ClassroomPanel 与 LectureTranscriptPage 的录音生命周期管理（state、ref、回调）目前**全部在 App.tsx**，不是组件内部——P2 不动这个。

### 命名扫描
全仓库含 lecture 字样的文件：仅 LectureTranscriptPage.tsx。`utils/lecture*` / `services/lecture*` / `data/lecture*`：**0 个**。

### 风险标记
🟢 ClassroomPanel 与 LectureTranscriptPage 都极简（52 行 / 296 行），但**录音核心状态机在 App.tsx**——搬完文件后 App.tsx 仍是录音的"指挥中心"。

---

## features/turtleSoup/

### 预期清单核对
| 文件 | 状态 |
|---|---|
| [components/TurtleSoupPanel.tsx](components/TurtleSoupPanel.tsx) | ✓ |

### TurtleSoupPanel.tsx 的依赖
- `../types`：`TurtleSoupState`
- `../services/geminiService`：`generateTurtleSoupPuzzle`、`answerTurtleSoupQuestion`、`generateTurtleSoupHint`
- 外部：React + lucide-react

### 被外部引用情况
- 仅被 [App.tsx:37](App.tsx) import
- ✅ 不依赖 Header（已在 [P2_ENTRY_POINTS.md §4](P2_ENTRY_POINTS.md) 详细论证）

### 命名扫描 / 遗漏候选
全仓库含 turtle 字样的文件：仅 TurtleSoupPanel.tsx + types.ts 里的 `TurtleSoupPuzzle`/`TurtleSoupState` 接口 + geminiService 里的 3 个函数。无其他卫星。

### 风险标记
🟢 **最干净的 feature 之一**（237 行单文件 + 3 个 AI 函数）。

---

## shared/

### 预期清单核对（你列了 9 个）

| 文件 | 状态 | 我的归类建议 |
|---|---|---|
| [Header.tsx](shared/layout/Header.tsx) | ✓ | shared/layout/ ✅ |
| [Sidebar.tsx](shared/layout/Sidebar.tsx) | ✓ | shared/layout/ ✅ |
| [WelcomeScreen.tsx](shared/layout/WelcomeScreen.tsx) | ✓ | shared/layout/ ✅ |
| [LoginModal.tsx](shared/auth/LoginModal.tsx) | ✓ | shared/auth/ ✅ |
| [HistoryModal.tsx](shared/history/HistoryModal.tsx) | ✓ | shared/history/ ✅ |
| [MusicPlayer.tsx](shared/layout/MusicPlayer.tsx) | ✓ | ⚠️ **仅 Header 一家用**——严格说不算"shared"。建议放 shared/layout/ 与 Header 同居 |
| [LoadingInteractiveContent.tsx](features/reader/deep-read/LoadingInteractiveContent.tsx) | ✓ | ❌ **不是 shared**——仅被 ExplanationPanel 用，应归 `features/reader/deep-read/` |
| [StudioPanel.tsx](shared/studio/StudioPanel.tsx) | ✓ | ❌ **不是 shared**——仅被 ReviewPage（间接）用 + 通过 App.tsx 渲染。应归 `features/review/`（业务上是"已生成产物面板"） |
| [SavedArtifactPreview.tsx](shared/studio/SavedArtifactPreview.tsx) | ✓ | ❌ **不是 shared**——被 ReviewPage、StudioPanel 共用，归 `features/review/`（同模块内部共享） |

### 9 个文件各自的依赖
- **Header**：仅 `./MusicPlayer` + `../types`（ViewMode）
- **Sidebar**：`../services/firebase`（10 个函数）+ `../types`
- **WelcomeScreen**：仅 React + lucide-react，**0 项目内 import**
- **LoginModal**：`../services/firebase`（loginWithGoogle、sendEmailLoginLink）
- **HistoryModal**：仅 `../types`（FileHistoryItem）+ React + lucide-react
- **MusicPlayer**：仅 React + lucide-react，**0 项目内 import**
- **LoadingInteractiveContent**：仅 React + lucide-react，**0 项目内 import**
- **StudioPanel**：`../types` + `../utils/savedArtifactMeta` + `./SavedArtifactPreview`
- **SavedArtifactPreview**：`../types` + `../utils/savedArtifactMeta`

### 被外部引用情况

| 文件 | 被谁 import |
|---|---|
| Header | App.tsx 一处 |
| Sidebar | App.tsx 一处 |
| WelcomeScreen | App.tsx 一处 |
| LoginModal | App.tsx 一处 |
| HistoryModal | App.tsx 一处 |
| MusicPlayer | Header.tsx 一处 |
| LoadingInteractiveContent | ExplanationPanel.tsx 一处 |
| StudioPanel | App.tsx 一处 |
| SavedArtifactPreview | StudioPanel.tsx + ReviewPage.tsx 两处 |

### 风险标记
- ⚠️ **Sidebar.tsx (972 行) 是项目最重的"扁担"**：依赖 Firebase 10 个函数，搬迁时会触发 Firebase 路径连锁更新（如果 Firebase 也搬到 lib/）。建议 Sidebar 与 lib/firebase 在不同 commit 中搬。
- ⚠️ **Header 与 MusicPlayer 必须同 commit 搬**——否则 Header 的 import 会断。
- 🟢 其他 6 个共享件都是单一调用方、依赖极少。

---

## 总体风险评估与搬迁顺序

### 风险三档

#### 🟢 **极低风险**（独立性强、依赖少、被引用次数 ≤ 2）
- features/turtleSoup/（1 文件）
- features/sessionStart/（2 文件，无横向依赖）
- features/energyRefuel/（2 文件，无横向依赖）
- features/lecture/（2 文件 + 1 service，几乎不依赖业务）
- features/reader/page-notes/、marks/、notebook/、slide-viewer/（4 个独立小模块）
- features/reader/skim/（虽然 SkimPanel 1300+ 行，但**外部依赖极少**——仅 types + 4 个 Gemini 函数）
- features/reader/deep-read/（连带 LoadingInteractiveContent 一起搬）
- shared/auth/、shared/history/（各 1 文件）

#### ⚠️ **中等风险**（被多处使用、连带搬迁多文件）
- shared/layout/（Header + MusicPlayer + Sidebar + WelcomeScreen 同时搬，Sidebar 涉及 Firebase 10 个函数）
- features/reader/side-quest/（组件本身简单，但与 App.tsx 选区监听强耦合——P2 不动选区代码）
- features/review/ 中的 MindMapPanel 子树（含 5 个 mindmap utils + 2 子组件 + 1 个 ELK 库）

#### ⚠️⚠️ **高风险**（最大、最深、与 lib/ 强耦合）
- features/exam/（17 组件 + 7 utils + 1 service + 2 data + 4 docs = 31 文件；workspace 子树深 4 层）
- features/review/ 整体（24 文件，需多次 commit 增量搬迁）

### 建议搬迁顺序（10 批）

```
Batch  1.  lib/text/、lib/pdf/、lib/storage/、lib/bkt/、lib/scaffolding/  ← 先建 lib 地基
Batch  2.  features/turtleSoup/                                          ← 极简，单组件
Batch  3.  features/sessionStart/、features/energyRefuel/、features/lecture/ ← 三个独立小 feature
Batch  4.  features/reader/notebook/、page-notes/、marks/、slide-viewer/  ← reader 四件简单子模块
Batch  5.  features/reader/deep-read/（含 LoadingInteractiveContent）    ← 单 feature 多文件
Batch  6.  features/reader/skim/                                         ← 单文件 1300 行，但依赖极少
Batch  7.  features/reader/side-quest/                                   ← 组件搬完，选区代码留 App.tsx
Batch  8.  shared/auth/、shared/history/、shared/layout/                 ← Header+Sidebar 大件，单独 commit
Batch  9.  features/review/（按 13 个面板分多 commit，最后搬 mindmap 子树 + saved-artifact 共享层 + ReviewPage）
Batch 10.  features/exam/（按 center → maintenance → study-flow → prediction → workspace 五段，最后搬 workspace）
```

### 不在 P2 范围的强耦合点（留给后续阶段）

- App.tsx 内 selectionchange 监听（~190 行）→ P5 抽 hook
- App.tsx 内 pomodoro 状态机（影响 Header、TurtleSoupPanel）→ P5 抽 hook
- services/firebase.ts 30 个导出按 entity 拆分 → P6
- services/geminiService.ts 50+ 函数按 feature 散下沉 → P3/P4

### "整体搬不拆"的边界
- **services/firebase.ts**：P2 阶段建议**整体搬**到 `lib/firebase/firebase.ts`，不在 P2 拆。
- **services/geminiService.ts**：同上，整体搬到 `lib/gemini/geminiService.ts`，**不在 P2 阶段拆**。
- **types.ts**：**P2 阶段不动**——根目录保留，P6 阶段才下沉。

---

*报告完。零代码改动；Glob + Grep 是唯一使用过的工具。*
