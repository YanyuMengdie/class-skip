# class-skip 屎山审计报告

> 阶段 1 产出：只读分析，未改任何代码。
> 配套文档：[REFACTOR_PLAN.md](REFACTOR_PLAN.md)
> 生成时间：2026-05-02
> 分支：refactor

---

## 总览

| 指标 | 数值 |
|------|------|
| 源文件总数（.ts/.tsx） | **95** |
| 总行数（不含 node_modules/dist） | **29,962 行** |
| 超过 500 行的"屎山组件" | **15 个** |
| `useState`/`useRef` 出现总次数（仅 App.tsx） | **138** |
| `services/geminiService.ts` 导出函数数 | **50+** |
| 文档（.md）数量 | 13 个（根目录 5 + docs/ 8） |

诊断结论一句话：**"两座山 + 一片镇" 的格局——`App.tsx`（2856 行）和 `services/geminiService.ts`（2945 行）是两座屎山主峰，`components/Exam*` 是绵延的山脉，其余是平原。优先级最高的两个动作是：(a) 拆 App.tsx 和 geminiService.ts；(b) 把 Exam 系列收拢成一个 feature 文件夹**。

---

## 一、项目结构统计

### 1.1 文件分布

| 目录 | 文件数 | 总行数 | 说明 |
|------|--------|--------|------|
| 根目录（App.tsx, index.tsx, types.ts 等） | 3 个 .tsx/.ts | 3,612 | App.tsx 一家独大 |
| [components/](components/) | 58 个 .tsx | ~19,500 | 屎山主战场 |
| [services/](services/) | 6 个 .ts | 3,942 | geminiService 一家独大 |
| [utils/](utils/) | 30 个 .ts/.tsx | ~2,500 | 整体颗粒度合理，少数过大 |
| [data/](data/) | 5 个 .ts | 435 | 静态数据/模板，正常 |
| [docs/](docs/) | 8 个 .md | — | 历史阶段说明文档 |

### 1.2 代码量最大的 15 个文件（按行数）

| # | 路径 | 行数 | 性质 |
|---|------|------|------|
| 1 | [services/geminiService.ts](services/geminiService.ts) | **2,945** | 屎山主峰 1：50+ 函数全塞一起 |
| 2 | [App.tsx](App.tsx) | **2,856** | 屎山主峰 2：138 个 useState/useRef，39 个组件 import |
| 3 | [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | **1,492** | 备考工作台主容器 |
| 4 | [components/SkimPanel.tsx](components/SkimPanel.tsx) | **1,309** | 略读模块，已有"chatWithAdaptiveTutor 禁用"守卫脚本（见 package.json） |
| 5 | [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | **1,035** | 考试预测面板 |
| 6 | [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) | **996** | 工作台 PDF 预览（含高亮） |
| 7 | [components/Sidebar.tsx](components/Sidebar.tsx) | **972** | 侧栏含日历/备忘录/会话/文件夹四套数据流 |
| 8 | [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) | **780** | 工作台对话本体 |
| 9 | [types.ts](types.ts) | **739** | 全局类型集中地，很多模块都拿 5%-10% 的字段 |
| 10 | [components/ExplanationPanel.tsx](components/ExplanationPanel.tsx) | **674** | 深读讲解面板 |
| 11 | [services/firebase.ts](services/firebase.ts) | **653** | Firestore + Auth + Storage 全在一起，30 个导出 |
| 12 | [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | **641** | 考试每日维护 |
| 13 | [components/MindMapPanel.tsx](components/MindMapPanel.tsx) | **589** | 思维导图面板 |
| 14 | [components/ExamLinkModal.tsx](components/ExamLinkModal.tsx) | **565** | 考试材料关联弹窗 |
| 15 | [components/SlideViewer.tsx](components/SlideViewer.tsx) | **547** | PDF 翻页+标注+评论触发 |

### 1.3 被引用最多的核心依赖（"最重的扁担"）

| 模块 | 被多少文件 import | 说明 |
|------|------------------|------|
| [types.ts](types.ts) | **~30+**（几乎所有组件） | 全局类型仓库，破坏会全军覆没 |
| [services/geminiService.ts](services/geminiService.ts) | **~24** | AI 调用唯一入口，但内部按功能耦合严重 |
| [services/firebase.ts](services/firebase.ts) | **~9 个组件 + 2 个 utils** | 数据持久层 |
| [utils/textUtils.ts](utils/textUtils.ts) | 3（Notebook、SlideViewer、ExplanationPanel） | 文本处理工具 |
| [utils/pdfUtils.ts](utils/pdfUtils.ts) | 3（App、ExamWorkspaceMaterialPreview、+1） | PDF 渲染工具 |
| [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) | 3（StudioPanel、ReviewPage、SavedArtifactPreview） | 产物元信息 |

**组件之间的引用关系基本是扁平的**——绝大多数组件只被 App.tsx 一个父亲引用。少数嵌套链：

- 备考工作台链：`ExamWorkspacePage → ExamWorkspaceSocraticChat → ExamWorkspaceAssistantMarkdown → ExamWorkspaceCitationBlock`（4 层，深度最深）
- 维护链：`ExamHubModal → ExamDailyMaintenancePanel → MaintenanceFlashcardDeck/MaintenanceFeedbackCelebration`
- 思维导图链：`MindMapPanel → MindMapFlowCanvas → MindMapFlowNode`
- Header 链：`Header → MusicPlayer`
- 讲解链：`ExplanationPanel → LoadingInteractiveContent`

---

## 二、死代码检测

### 2.1 已确认的死文件 / 死导出

| 类型 | 路径 | 证据 |
|------|------|------|
| 🔴 死组件 | [components/BreakPanel.tsx](components/BreakPanel.tsx)（109 行） | 全仓库 `BreakPanel` 字符串只在自己文件里出现 2 次（声明+导出），无任何 import |
| 🔴 死再导出 | [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx)（1 行） | 仅 `export { ExamDailyMaintenancePanel as DailyExamStudyPanel }`；全仓库无人 import `DailyExamStudyPanel`，调用者直接 import `ExamDailyMaintenancePanel` |
| 🔴 死常量 | `GALGAME_SYSTEM_PROMPT` in [utils/prompts.ts](utils/prompts.ts:161) | 仅在定义处出现 1 次。Galgame 模式实际用 geminiService.ts 中内联的 `getPersonaSystemPrompt`（line 357） |
| 🔴 死常量 | `REM_STORYTELLER_PROMPT` in [utils/prompts.ts](utils/prompts.ts:196) | 同上，无人 import；persona 故事用 generatePersonaStoryScript 内联 prompt |
| 🟡 重复别名 | `search()` in [utils/examChunkRetrieval.ts:159](utils/examChunkRetrieval.ts) | 仅是 `searchBm25` 的同义包装："`return searchBm25(...)`"，可删 |
| 🟡 旧名兼容 | `generateRemStoryScript` in [services/geminiService.ts:630](services/geminiService.ts) | 只是转发到 `generatePersonaStoryScript`，被 [GalgameOverlay.tsx](components/GalgameOverlay.tsx) 使用，可考虑直接改用新名 |

### 2.2 注释代码块

`services/geminiService.ts` 内部包含 **92 处块注释/JSDoc**（含 `/** ... */` 与单行 `//`）。其中相当一部分是"为什么这个函数存在 / 与某某互斥"的历史决策记录（如 line 1836「**chatWithAdaptiveTutor 不再附加旧版 buildExamWorkspaceCitationInstruction**」、line 2046「**与 chatWithAdaptiveTutor 内 reading 分支一致**」）。

这些是**有价值的注释**，不是要删的"屎"，但拆分 geminiService 时要带着这些注释一起搬，否则丢失上下文。

未发现明显的「整段被注释掉的旧代码块」——团队习惯是直接删除、靠 git 历史保存。这是好的迹象。

### 2.3 边缘可疑（需 Criss 决策）

| 路径 | 大小 | 疑点 |
|------|------|------|
| [utils/mindMapLayout.ts](utils/mindMapLayout.ts) | 223 行 | 老的自研布局 `computeMindMapLayout` 未被任何组件直接调用；只剩 `buildMindMapNodeMeta`、`estimateNodeBox`、`DEFAULT_MIND_MAP_LAYOUT` 被 [utils/mindMapFlowAdapter.ts](utils/mindMapFlowAdapter.ts) 复用。**`computeMindMapLayout` / `flattenMindMapNodes` / `layoutBoxToNodePosition` 三个导出疑似已被 ELK 取代**。需 Criss 确认是否真的退出舞台。 |
| [App.tsx:67-73](App.tsx#L67-L73) `_debugLog` | 7 行 | 上线后还在向 `http://127.0.0.1:7242/ingest/...` POST 数据。是本地开发期的调试遗留，需确认是否还需要。生产环境请求会失败但被静默吞掉（`.catch(()=>{})`），可能造成 console 噪音。 |

---

## 三、重复逻辑识别

### 3.1 Prompt 散落（**严重**）

- [utils/prompts.ts](utils/prompts.ts) 只集中了 5 个常量（其中 2 个是死代码）。
- [services/geminiService.ts](services/geminiService.ts) **直接内联**了 ~40 处 `systemPrompt` / `systemInstruction` / `prompt: \`...\``。每个 AI 函数（generateMindMap、generateFeynmanQuestion、chatWithAdaptiveTutor 等）都有自己的多段 prompt 模板。
- [data/disciplineTeachingProfiles.ts](data/disciplineTeachingProfiles.ts) + [data/scaffoldingPrompt.ts](data/scaffoldingPrompt.ts) 又有一份 prompt 数据。
- [data/maintenanceFeedbackCopy.ts](data/maintenanceFeedbackCopy.ts) 是用户面文案。

**问题**：要改一个 prompt（例如统一 Socratic 风格），可能要碰 4 个地方。
**重构动作**：把 geminiService 内联 prompt 全部抽到 `prompts/` 目录，按功能子分（`prompts/mindmap.ts`、`prompts/feynman.ts`、`prompts/socratic.ts`、`prompts/quiz.ts`...）。

### 3.2 ReactMarkdown 渲染配置（**中度**）

13 个组件（[SkimPanel](components/SkimPanel.tsx)、[ExamPredictionPanel](components/ExamPredictionPanel.tsx)、[ExamSummaryPanel](components/ExamSummaryPanel.tsx)、[ExamTrapsPanel](components/ExamTrapsPanel.tsx)、[ExamWorkspaceAssistantMarkdown](components/ExamWorkspaceAssistantMarkdown.tsx)、[ExplanationPanel](components/ExplanationPanel.tsx)、[FeynmanPanel](components/FeynmanPanel.tsx)、[FiveMinFlowPanel](components/FiveMinFlowPanel.tsx)、[MultiDocQAPanel](components/MultiDocQAPanel.tsx)、[SavedArtifactPreview](components/SavedArtifactPreview.tsx)、[SideQuestPanel](components/SideQuestPanel.tsx)、[StudyGuidePanel](components/StudyGuidePanel.tsx)、[TrickyProfessorPanel](components/TrickyProfessorPanel.tsx)）都直接 `import ReactMarkdown` 并各自配置 `remarkGfm + remarkMath + rehypeKatex` 与一套 `components` 覆盖。这是 13 份高度雷同的样板。

**重构动作**：抽 `components/shared/AppMarkdown.tsx`，统一 plugins、code 高亮、链接规则、citation hook。

### 3.3 BM25 / 检索

[utils/examChunkRetrieval.ts](utils/examChunkRetrieval.ts) 内：`searchBm25` 与 `search` 实质是同一个函数（159 行 `search` 直接 `return searchBm25(...)`）。删一个即可。

[utils/examChunkIndex.ts](utils/examChunkIndex.ts) 与 [services/examChunkIndexStorage.ts](services/examChunkIndexStorage.ts) 的边界目前清晰（前者建索引、后者持久化），不必合并。

### 3.4 BKT / LSAP 分布

| 文件 | 职责 |
|------|------|
| [utils/bkt.ts](utils/bkt.ts) | `updateBKT()` 单算法（50 行） |
| [utils/lsapScore.ts](utils/lsapScore.ts) | `computePredictedScore()`（18 行） |
| [utils/examWorkspaceLsapKey.ts](utils/examWorkspaceLsapKey.ts) | LSAP key 计算 + 工作台对话存储（115 行） |
| [utils/examWorkspaceOrchestrator.ts](utils/examWorkspaceOrchestrator.ts) | LSAP 探针下一步状态机（89 行） |
| [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | 直接 `import { updateBKT } from '../utils/bkt'`，1035 行混合 UI + BKT 更新 + LSAP 计算 + Gemini 调用 |
| [components/WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx) | 同样直接调 BKT + LSAP + Gemini，362 行 |

**问题**：BKT/LSAP 算法本身已经分模块（好），但**调用方把状态更新逻辑写在了 UI 组件里**。重构时应该提供 `useBKTState` / `useLSAPProbe` 之类的 hook，把状态机搬出 UI。

### 3.5 Firebase 调用

总体收敛得不错——`collection/doc/setDoc/getDoc` 在 [services/firebase.ts](services/firebase.ts) 里 68 处（合理），其余文件零星调用主要是间接通过 firebase.ts 的导出函数。这块**不是重灾区**。

### 3.6 Saved Artifacts 收集

- [utils/collectSavedArtifactsFromCloud.ts](utils/collectSavedArtifactsFromCloud.ts) 64 行
- [utils/collectSavedArtifactsFromLocalHistory.ts](utils/collectSavedArtifactsFromLocalHistory.ts) 33 行
- [utils/mergeArtifactLibraries.ts](utils/mergeArtifactLibraries.ts) 66 行
- [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) 39 行

四个独立小文件干同一件事，**结构其实合理**（拆分得当），无需合并。可以加个 [utils/artifacts/index.ts](utils/) 桶文件方便引用。

### 3.7 Mind Map 五兄弟

| 文件 | 行数 | 职责 |
|------|------|------|
| [utils/mindMapLayout.ts](utils/mindMapLayout.ts) | 223 | 老式自研布局（部分死代码） |
| [utils/mindMapElkLayout.ts](utils/mindMapElkLayout.ts) | 97 | ELK 布局（在用） |
| [utils/mindMapFlowAdapter.ts](utils/mindMapFlowAdapter.ts) | 112 | 转 React Flow 节点 |
| [utils/mindMapLabel.ts](utils/mindMapLabel.ts) | 6 | 取节点标签（一个函数） |
| [utils/mindMapScope.ts](utils/mindMapScope.ts) | 6 | 多文档 id 加前缀 |

**重构动作**：拆/合并的核心问题是确认 `mindMapLayout.ts` 中老布局是否真退役。如果是，文件能瘦到 <80 行，五兄弟可以并入 `features/mindmap/lib/` 一个目录。

---

## 四、架构问题

### 4.1 超过 500 行的"屎山组件"

按重构难度排序：

| 文件 | 行数 | useState/useRef 数 | 痛点 |
|------|------|------------------|------|
| **🔴 [App.tsx](App.tsx)** | **2,856** | **138** | 39 个组件 import + 138 个 hook + 业务流程编排 + 鉴权 + 导航 + 持久化全在这里 |
| **🔴 [services/geminiService.ts](services/geminiService.ts)** | **2,945** | 0 | 50+ AI 函数 + 40 处内联 prompt 全在一起；不是组件但同等屎 |
| 🔴 [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | 1,492 | 35 | 工作台 5 区栏布局 + chunk 索引构建 + KC 玻璃柜 + 多个 modal 编排 |
| 🔴 [components/SkimPanel.tsx](components/SkimPanel.tsx) | 1,309 | 34 | 略读 5 阶段（diagnosis/scenario/intake/...）状态机 + UI |
| 🔴 [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | 1,035 | 37 | KC 网格 + BKT 更新 + Gemini 调用 + 题目编辑 |
| 🟠 [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) | 996 | 38 | PDF 渲染 + 引文高亮 + 缩放 + 键盘快捷键 |
| 🟠 [components/Sidebar.tsx](components/Sidebar.tsx) | 972 | 23 | 4 套数据流（会话/文件夹/日历/备忘录） |
| 🟠 [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) | 780 | 25 | 对话循环 + chunk 检索 + 引文解析 + 黑板术语提取 |
| 🟠 [components/ExplanationPanel.tsx](components/ExplanationPanel.tsx) | 674 | 13 | 深读讲解 + 选区交互 |
| 🟠 [services/firebase.ts](services/firebase.ts) | 653 | — | 30 个导出（auth + sessions + folders + calendar + memos + exams + materialLinks + dailyPlanCache） |
| 🟡 [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | 641 | 18 | 维护流程编排 |
| 🟡 [components/MindMapPanel.tsx](components/MindMapPanel.tsx) | 589 | 13 | 多文档 mindmap + 节点 handler 三处构建 |
| 🟡 [components/ExamLinkModal.tsx](components/ExamLinkModal.tsx) | 565 | — | 上传 + 关联 + 删除 |
| 🟡 [components/SlideViewer.tsx](components/SlideViewer.tsx) | 547 | — | 翻页 + 标注 + 缩放 |
| 🟡 [components/Header.tsx](components/Header.tsx) | 523 | 10 | 顶栏 + 多个按钮 + 下拉 + MusicPlayer |

### 4.2 UI 与业务严重耦合的组件（"上帝组件"）

按耦合严重程度（同时 useState 多 + 同时 import 多种业务依赖）：

#### 🔴 **App.tsx**（终极上帝）
- 138 个 useState/useRef
- 39 个组件 import
- 11 处 JSON.parse/stringify（直接做持久化）
- 同时管理：鉴权、文件上传、PDF 处理、Galgame 设置、5 分钟流程、ViewMode 切换、Skim 阶段机、笔记本、聊天缓存、考试工作台 active id、…

#### 🔴 **ExamPredictionPanel.tsx**
- 37 个 useState
- 同时调 `geminiService` (`generateExamPrediction` 等)、`utils/bkt`、`utils/lsapScore`
- BKT 状态更新 + LSAP 预测分计算 + UI 渲染全混

#### 🔴 **SkimPanel.tsx**
- 34 个 useState
- 调 4 个 Gemini 函数 + 大量阶段切换 + 内嵌选项卡组件
- "略读 5 阶段流程"是个状态机，但写成了大组件

#### 🔴 **ExamWorkspaceSocraticChat.tsx**
- 25 个 useState
- 同时调 7 个 utils + 4 个 Gemini 函数 + Firestore 索引存储
- 对话编排 + 检索 + 引文解析 + 术语黑板提取全在一起

#### 🟠 **Sidebar.tsx**
- 4 套独立数据流（会话/文件夹/日历/备忘录）写在一个组件里
- 每套都有自己的 CRUD UI

### 4.3 services / utils 命名 & 职责评估

整体来说**utils 命名相当清晰**（按算法/功能命名，单一职责），是项目里相对干净的部分。少数问题：

| 问题 | 文件 |
|------|------|
| 命名相似但实际职责不同 | [examChunkIndex.ts](utils/examChunkIndex.ts)（构建）vs [examChunkRetrieval.ts](utils/examChunkRetrieval.ts)（搜索）vs [services/examChunkIndexStorage.ts](services/examChunkIndexStorage.ts)（IDB 存储）——**OK，名字其实正确反映了三件事**，只是初次看会困惑 |
| utils 里混了 .tsx | [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx)（含 JSX 图标） | utils 不应有 .tsx；应迁到 `components/shared/` 或 `features/artifacts/` |
| 单文件单函数（小到不必独立） | [utils/lsapScore.ts](utils/lsapScore.ts) (18 行)、[utils/mindMapLabel.ts](utils/mindMapLabel.ts) (6)、[utils/mindMapScope.ts](utils/mindMapScope.ts) (6)、[utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) (46) | 重组目录时可并入对应 feature 的 lib/ |
| services 里混业务逻辑 | [services/geminiService.ts](services/geminiService.ts) 在算法（heuristicQuality 调用、prompt 构造）和 IO（Gemini SDK 调用）之间不分层 | 拆成 `services/gemini/client.ts`（薄封装）+ 各 feature 的 `prompts/*.ts`（prompt） + 各 feature 的 `*Service.ts`（业务） |

---

## 五、模块边界分析（核心：feature → 文件分布）

> 这是为阶段 3「目录重组」准备的素材。✓ 表示文件已较好聚焦该功能；⚠ 表示分散在多处。

### 5.1 Socratic 对话（备考工作台对话）

文件：
- [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) ⚠ 780 行
- [components/ExamWorkspaceAssistantMarkdown.tsx](components/ExamWorkspaceAssistantMarkdown.tsx) ✓
- [components/ExamWorkspaceCitationBlock.tsx](components/ExamWorkspaceCitationBlock.tsx) ✓
- [utils/examWorkspaceCitations.ts](utils/examWorkspaceCitations.ts) ✓
- [utils/examWorkspaceLsapKey.ts](utils/examWorkspaceLsapKey.ts) ✓
- [utils/examWorkspaceOrchestrator.ts](utils/examWorkspaceOrchestrator.ts) ✓
- [utils/scaffoldingClassifier.ts](utils/scaffoldingClassifier.ts) ✓
- [utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) ✓
- [utils/glossaryTermFilter.ts](utils/glossaryTermFilter.ts) ✓
- [data/scaffoldingPrompt.ts](data/scaffoldingPrompt.ts) ✓
- [data/disciplineTeachingProfiles.ts](data/disciplineTeachingProfiles.ts) ✓
- 在 [services/geminiService.ts](services/geminiService.ts) 中：`chatWithAdaptiveTutor`、`buildExamWorkspaceCitationInstruction`、`buildExamChunkCitationAppendix`、`appendReadingModeUserMessageSuffix`、`defineTermInLectureContext`、`analyzeKcUtteranceForAtoms`、`markAtomsCoveredByUtterance`、`detectReasoningGaps`、`generateLSAPProbeQuestion`、`evaluateLSAPAnswer`、`generateLSAPTargetedTeaching`、`answerLSAPTeachingQuestion`（**12 个函数**）⚠

**评价**：utils 已经分得不错，但**主组件太大**+**Gemini 函数没分文件**。
**目标**：`features/exam-workspace/socratic/` 下放主组件、useSocraticDialogue hook、prompts、services。

### 5.2 Feynman 模块

文件：
- [components/FeynmanPanel.tsx](components/FeynmanPanel.tsx) ✓ 363 行
- 在 [services/geminiService.ts](services/geminiService.ts) 中：`generateFeynmanExplanation`、`generateFeynmanExplanationForTopics`、`generateFeynmanQuestion`、`evaluateFeynmanAnswer`（4 个函数）⚠

**评价**：UI 干净；只需把 4 个 Gemini 函数搬到 `features/feynman/feynmanService.ts`。

### 5.3 闪卡 / 测验

文件：
- [components/FlashCardReviewPanel.tsx](components/FlashCardReviewPanel.tsx) ✓ 213 行
- [components/QuizReviewPanel.tsx](components/QuizReviewPanel.tsx) ✓ 309 行
- [components/MaintenanceFlashcardDeck.tsx](components/MaintenanceFlashcardDeck.tsx) ✓ 67 行
- 在 geminiService 中：`generateGatekeeperQuiz`、`generateModuleQuiz`、`generateQuizSet`、`estimateFlashCardCount`、`generateFlashCards`、`generateMaintenanceFlashCards`（6 个）⚠
- [docs/QUIZ_AND_FLASHCARD_PLAN.md](docs/QUIZ_AND_FLASHCARD_PLAN.md) - 历史规划文档

**评价**：UI 各自清晰，但 **3 个 UI 组件 + 6 个生成函数散落两地**。

### 5.4 5 分钟启动流

文件：
- [components/FiveMinFlowPanel.tsx](components/FiveMinFlowPanel.tsx) ✓ 370 行
- 在 geminiService 中：`generateFiveMinGuide`（1 个）

**评价**：边界清晰，几乎不用动。

### 5.5 略读（Skim）

文件：
- [components/SkimPanel.tsx](components/SkimPanel.tsx) 🔴 1,309 行
- 在 geminiService 中：`chatWithSkimAdaptiveTutor`、`generateGatekeeperQuiz`（共享）、`generateModuleTakeaways`、`generateModuleQuiz`、`performPreFlightDiagnosis`（5+）
- [docs/SKIM_VS_EXAM_TUTOR_API.md](docs/SKIM_VS_EXAM_TUTOR_API.md) - 与考试 tutor 的边界文档
- package.json 有 `check:skim-tutor` 守护脚本

**评价**：**重灾区**——SkimPanel 必须拆。建议拆成阶段子组件 + `useSkimStateMachine` hook。

### 5.6 思维导图

文件：见 §3.7。
- [components/MindMapPanel.tsx](components/MindMapPanel.tsx) 589 行
- [components/MindMapFlowCanvas.tsx](components/MindMapFlowCanvas.tsx) 206 行
- [components/MindMapFlowNode.tsx](components/MindMapFlowNode.tsx) 155 行
- 5 个 utils
- 在 geminiService 中：`generateMindMap`、`generateMindMapMulti`、`evaluateAndSupplementMindMap`、`modifyMindMap`（4 个）⚠
- [docs/MINDMAP_STEP5.md](docs/MINDMAP_STEP5.md)

**评价**：层次已经分得不错，主要工作是清理 `mindMapLayout.ts` 老布局 + 把 4 个 Gemini 函数搬出。

### 5.7 考试中心 / 考试工作台（**最复杂**）

文件：
- [components/ExamCenterPanel.tsx](components/ExamCenterPanel.tsx) 321 行
- [components/ExamHubModal.tsx](components/ExamHubModal.tsx) 130 行
- [components/ExamLinkModal.tsx](components/ExamLinkModal.tsx) 565 行
- [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) 🔴 1,035 行
- [components/ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx) 192 行
- [components/ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) 98 行
- [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) 641 行
- [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) 🔴 1,492 行
- [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) 780 行
- [components/ExamWorkspaceAssistantMarkdown.tsx](components/ExamWorkspaceAssistantMarkdown.tsx) 261 行
- [components/ExamWorkspaceCitationBlock.tsx](components/ExamWorkspaceCitationBlock.tsx) 273 行
- [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) 996 行
- [components/KcGlossarySidebar.tsx](components/KcGlossarySidebar.tsx) 92 行
- [components/KnowledgePointInspectPanel.tsx](components/KnowledgePointInspectPanel.tsx) 95 行
- [components/MaintenanceFlashcardDeck.tsx](components/MaintenanceFlashcardDeck.tsx) 67 行
- [components/MaintenanceFeedbackCelebration.tsx](components/MaintenanceFeedbackCelebration.tsx) 44 行
- [components/StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) 260 行
- [components/TrapListPanel.tsx](components/TrapListPanel.tsx) 78 行
- [components/WorkspaceEvidenceReportModal.tsx](components/WorkspaceEvidenceReportModal.tsx) 321 行
- [components/WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx) 362 行
- [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx) 1 行（死）
- 8 个相关 utils（exam* 系列）
- 4 个文档（[docs/EXAM_AND_STUDY_FLOW.md](docs/EXAM_AND_STUDY_FLOW.md)、[docs/EXAM_WORKSPACE_*](docs/)、[docs/P*_EXAM_*](docs/)）

**总计：~20 个组件 + 8 个 utils**。

**评价**：考试领域占了项目至少 **40% 的代码**。强烈建议**整个迁到 `features/exam/`** 一个目录，并按 `center/`、`workspace/`、`maintenance/`、`prediction/`、`shared/` 分子目录。这一步本身就能让 components/ 文件夹瘦身一半。

### 5.8 心情对话 / 拥抱

文件：
- [components/MoodDialog.tsx](components/MoodDialog.tsx) 48 行
- [components/TaskHug.tsx](components/TaskHug.tsx) 277 行
- [components/ChatHug.tsx](components/ChatHug.tsx) 196 行
- 在 geminiService 中：`runTaskHugAgent`、`runTaskHugChat`、`runChatHugAgent`（3 个）

**评价**：边界清晰，搬到 `features/mood/` 即可。

### 5.9 多文档问答

文件：
- [components/MultiDocQAPanel.tsx](components/MultiDocQAPanel.tsx) 208 行
- 在 geminiService 中：`multiDocQAReply`（1 个）

**评价**：边界清晰。

### 5.10 PDF / 讲义处理

文件：
- [utils/pdfUtils.ts](utils/pdfUtils.ts) ✓ 142 行（loadPdfDocumentFromFile / convertPdfToImages / extractPdfText / generateFileHash 等）
- [utils/pdfQuoteHighlight.ts](utils/pdfQuoteHighlight.ts) ✓ 91 行
- [components/SlideViewer.tsx](components/SlideViewer.tsx) 547 行（PDF UI + 标注）
- [components/SlidePageComments.tsx](components/SlidePageComments.tsx) 215 行
- [components/PageMarkPanel.tsx](components/PageMarkPanel.tsx) 208 行
- [components/LectureTranscriptPage.tsx](components/LectureTranscriptPage.tsx) 296 行
- [services/transcriptionService.ts](services/transcriptionService.ts) ✓ 66 行
- 在 geminiService 中：`organizeLectureFromTranscript`（1 个）

**评价**：utils 部分非常好，组件部分需要拆 SlideViewer。

### 5.11 BKT 知识追踪 / LSAP

见 §3.4。utils 良好，UI 端混合严重。

### 5.12 游戏化 / 音乐

文件：
- [components/GalgameOverlay.tsx](components/GalgameOverlay.tsx) 327 行
- [components/GalgameSettings.tsx](components/GalgameSettings.tsx) 245 行
- [components/MusicPlayer.tsx](components/MusicPlayer.tsx) 116 行
- [services/imageGen.ts](services/imageGen.ts) ✓ 111 行
- 在 geminiService 中：`generatePersonaStoryScript`、`generateRemStoryScript`(deprecated alias)、内联 `getPersonaSystemPrompt`

**评价**：边界清晰，且 GALGAME_SYSTEM_PROMPT/REM_STORYTELLER_PROMPT 在 prompts.ts 里是死代码（见 §2.1）。

---

## 六、重构优先级清单（按"收益最大、风险最小"排序）

> 原则：先做风险最小且能立刻把"找文件 / 看代码 / 改 prompt"成本压下来的事。屎山主峰（App.tsx、geminiService.ts）放后面，因为它们风险最大、需要前面的清理打底。

### 优先级 P0：清理死代码（**先做这个**）

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P0.1 | 删除 [components/BreakPanel.tsx](components/BreakPanel.tsx)（109 行，无人引用） | 小 | 低 |
| P0.2 | 删除 [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx) 死再导出（1 行） | 极小 | 低 |
| P0.3 | 删除 [utils/prompts.ts](utils/prompts.ts) 中 `GALGAME_SYSTEM_PROMPT` 和 `REM_STORYTELLER_PROMPT` 两个死常量 | 小 | 低 |
| P0.4 | 删除 [utils/examChunkRetrieval.ts:159 `search`](utils/examChunkRetrieval.ts) 重复别名（仅是 searchBm25 的转发） | 小 | 低 |
| P0.5 | 与 Criss 确认后，删除 [utils/mindMapLayout.ts](utils/mindMapLayout.ts) 中已被 ELK 取代的 `computeMindMapLayout`、`flattenMindMapNodes`、`layoutBoxToNodePosition`（**需 Criss 确认**） | 小 | 中（要确认是否真退役） |
| P0.6 | 与 Criss 确认 [App.tsx:67-73 `_debugLog`](App.tsx#L67-L73) 是否还要保留（生产环境会打错误日志） | 极小 | 低 |

**收益**：减少 ~150-300 行噪音，让后续所有 grep / 阅读都更准。
**总工作量**：1-2 小时。
**做完即一次 commit**。

### 优先级 P1：抽 Markdown 共享组件（速效）

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P1.1 | 抽 `components/shared/AppMarkdown.tsx` 统一 13 个 ReactMarkdown 用法 | 中 | 低（行为应保持一致，可逐个迁移并 diff 检查） |

**收益**：13 个组件共减少 ~20 行/个 = ~250 行重复样板；之后改 markdown 渲染规则只需改一处。
**做完一次 commit**。

### 优先级 P2：目录按 feature 重组（最大收益）

> 这是计划文档里"想改什么 3 秒内能找到"的核心。先重组**不**碰文件内容，只移动文件。

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P2.1 | 创建 `features/exam/` 把 ~20 个 Exam* 组件 + 8 个 exam 相关 utils 全迁过去 | 中（IDE 自动改 import） | 中（import 路径改动多，但 tsc 会捕获） |
| P2.2 | 创建 `features/skim/`、`features/feynman/`、`features/mindmap/`、`features/socratic/`、`features/quiz-flashcard/`、`features/mood/`、`features/galgame/`、`features/multi-doc-qa/`、`features/pdf/` 等 | 中 | 中 |
| P2.3 | 创建 `components/shared/` 收纳 Header、Sidebar、MusicPlayer、AppMarkdown、Modal 通用件 | 小 | 低 |
| P2.4 | utils/ 中只保留真正跨 feature 的（textUtils 等），其余下沉到对应 feature/lib | 小 | 低 |

**收益**：
- 现在打开 components/ 看到 58 个文件平铺，重组后 components/ 主要是 shared/，其他都按业务分类；
- 加新模块有清晰位置；
- Claude Code 改东西时上下文范围明确缩小；
- 阶段 4 拆大组件时，相关文件已经在一个目录里。

**完成总工作量**：3-5 小时（每个 feature 单独 commit）。

### 优先级 P3：Prompt 集中（中等收益）

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P3.1 | 把 [services/geminiService.ts](services/geminiService.ts) 内 ~40 处内联 prompt 抽到各 feature 的 `prompts/*.ts` | 中 | 中（每抽一个 prompt 要确认没改字符）|
| P3.2 | 删除 [utils/prompts.ts](utils/prompts.ts) 残留，分发到对应 feature | 小 | 低 |

**收益**：改 prompt 不用滚 2945 行；prompt 单元化后未来可以做 A/B、版本化、缓存。
**做完一次 commit / 一个 feature**。

### 优先级 P4：拆 geminiService.ts（前置条件 = P2 完成）

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P4.1 | 抽 `services/gemini/client.ts` 薄客户端（API key、common config、retry） | 中 | 中 |
| P4.2 | 把 50+ 函数按 feature 散到 `features/*/aiService.ts` | 大 | 中 |

**收益**：单文件从 2945 → ~50 行客户端 + 各 feature 200-400 行 service。
**完成工作量**：4-6 小时。

### 优先级 P5：拆超过 1000 行的"屎山主峰"

| 项 | 文件 | 工作量 | 风险 |
|----|------|--------|------|
| P5.1 | [App.tsx](App.tsx) 2856 行 → 拆出 useAuthState、useFileLifecycle、useGalgameState、useExamWorkspaceActiveExam 等 hook，App.tsx 目标 < 600 行 | **大** | **中-高**（重构核心组件，需要 Criss 频繁测试） |
| P5.2 | [components/SkimPanel.tsx](components/SkimPanel.tsx) 1309 行 → 按阶段拆 + useSkimStateMachine hook | 大 | 中 |
| P5.3 | [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) 1492 行 → 按面板拆 + useExamWorkspaceContext provider | 大 | 中 |
| P5.4 | [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) 1035 行 → 抽 useBKTState + usePredictionLoader | 中-大 | 中 |
| P5.5 | [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) 996 行 → PDF 渲染 + 高亮 + 工具栏分离 | 中-大 | 中 |
| P5.6 | [components/Sidebar.tsx](components/Sidebar.tsx) 972 行 → 4 套数据流分别下放（SessionList、FolderTree、CalendarPane、MemoPane） | 中 | 中 |
| P5.7 | [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) 780 行 → useSocraticDialogue + useChunkRetrieval hooks | 中 | 中 |

**完成工作量**：8-15 小时（按计划文档预估即可）。

### 优先级 P6：其他

| 项 | 内容 | 工作量 | 风险 |
|----|------|--------|------|
| P6.1 | 拆 [services/firebase.ts](services/firebase.ts) 30 个导出按 entity 分（auth/sessions/folders/calendar/memos/exams/dailyPlan） | 中 | 中 |
| P6.2 | 拆 [types.ts](types.ts) 739 行下沉到对应 feature | 中 | 中 |
| P6.3 | TypeScript 严格模式 + 修类型 | 中-大 | 低（但工作量大）|

---

## 七、重构推荐路线（一句话总结）

按"先扫地 → 再分柜 → 再拆家具"的顺序：

```
P0 死代码（1-2h）
   ↓
P1 抽 AppMarkdown（1-2h）
   ↓
P2 目录 feature 重组（3-5h，每个 feature 一次 commit）
   ↓
P3 Prompt 集中（每个 feature 跟着 P2 一起做更顺）
   ↓
P4 拆 geminiService.ts
   ↓
P5 拆 App.tsx + 三大屎山组件（核心战役）
   ↓
P6 firebase.ts / types.ts / TS 严格模式
```

---

## 八、给 Criss 的快速决策清单

阶段 1 结束后，请就这几件事拍板（决策完才能进阶段 2）：

1. **死代码 P0**
   - [ ] 同意删除 BreakPanel.tsx？（无人引用）
   - [ ] 同意删除 DailyExamStudyPanel.tsx 死再导出？
   - [ ] 同意删除 prompts.ts 里两个 GALGAME 死常量？
   - [ ] 同意删除 examChunkRetrieval 里 `search` 重复别名？

2. **mindMapLayout.ts 老布局**
   - [ ] 老的 `computeMindMapLayout` 是已经被 ELK 完全取代了吗？还是某些场景还在用？

3. **App.tsx 调试代码**
   - [ ] [App.tsx:72 那个 fetch 到 localhost:7242](App.tsx#L72) 还需要吗？

4. **mindMapScope.ts vs mindMapFlowAdapter**
   - mindMapScope.ts 只 6 行，mindMapFlowAdapter.ts 在用它。要保留独立文件还是合并？（轻微决策）

5. **重构起点**
   - [ ] 同意按 P0 → P1 → P2 → P3 → P4 → P5 顺序？
   - [ ] 还是想先动某个特定组件（例如 SkimPanel）解燃眉之急？

---

*报告完。下次 Criss 决定后，进入阶段 2：清理死代码。*
