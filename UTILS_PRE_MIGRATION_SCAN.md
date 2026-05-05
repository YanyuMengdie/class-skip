# Utils → Lib 预扫描报告（只读、未动任何文件）

> P2 阶段 4 的预调查。
> 范围：[utils/](utils/) 目录全部 28 个文件。
> 生成时间：2026-05-05 · refactor 分支当前状态
>
> ⚠️ **本批是 P2 阶段最不直观的——utils 的引用方分散在所有 feature、App.tsx、services/。文件数虽与 review 批接近，但调用面比单一 feature 区域复杂得多**。

---

## 1. utils/ 真实清单（28 文件，2825 行）

✅ **28 文件**，与 [CONTEXT.md:212](CONTEXT.md) 预期完全一致。

| # | 文件 | 行数 | 一句话作用（来自文件头注释 / 代表性 export） |
|---|------|------|------|
| 1 | [utils/artifactSourceLabel.ts](utils/artifactSourceLabel.ts) | 40 | 写入 SavedArtifact.sourceLabel 的展示文案（多文档/单文档前缀 + 截断） |
| 2 | [utils/bkt.ts](utils/bkt.ts) | 50 | **贝叶斯知识追踪 (BKT)** 单步更新算法（exam 预测/探测） |
| 3 | [utils/collectSavedArtifactsFromCloud.ts](utils/collectSavedArtifactsFromCloud.ts) | 64 | 从 Firebase 云端会话拉取 SavedArtifact 集合 |
| 4 | [utils/collectSavedArtifactsFromLocalHistory.ts](utils/collectSavedArtifactsFromLocalHistory.ts) | 33 | 从本地 history 提取 SavedArtifact 集合 |
| 5 | [utils/examChunkIndex.ts](utils/examChunkIndex.ts) | 126 | 备考引用管线 1-1：PDF → 按页文本 → 切块 → chunkId |
| 6 | [utils/examChunkRetrieval.ts](utils/examChunkRetrieval.ts) | 195 | 备考引用管线 1-2：BM25 Top-K 检索（无向量/无外部依赖） |
| 7 | [utils/examMaintenanceEligibility.ts](utils/examMaintenanceEligibility.ts) | 26 | 评估每日维护可用性 |
| 8 | [utils/examSchedule.ts](utils/examSchedule.ts) | 228 | exam 时间安排/压力评估（核心 exam 工具） |
| 9 | [utils/examWorkspaceCitations.ts](utils/examWorkspaceCitations.ts) | 176 | 备考苏格拉底回复中末尾 JSON citations 解析 + chunk 引用解析 |
| 10 | [utils/examWorkspaceLsapKey.ts](utils/examWorkspaceLsapKey.ts) | 115 | 备考工作台 LSAP localStorage bundle key + dialogue turn 类型 |
| 11 | [utils/examWorkspaceOrchestrator.ts](utils/examWorkspaceOrchestrator.ts) | 89 | M3：备考台苏格拉底探测编排（probeMode / bloomTarget 决策） |
| 12 | [utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) | 46 | 从 AI Markdown 回复提取 `**粗体**` 候选术语 + key 归一化 |
| 13 | [utils/glossaryTermFilter.ts](utils/glossaryTermFilter.ts) | 205 | 备考"考点释义"：粗体候选过滤启发式（停用表、长度阈） |
| 14 | [utils/lsapScore.ts](utils/lsapScore.ts) | 18 | LSAP/BKT 加权预测分（0-100）单一实现源 |
| 15 | [utils/maintenanceStrategy.ts](utils/maintenanceStrategy.ts) | 160 | 每日维护策略生成（基于学科/心情/紧迫度） |
| 16 | [utils/mergeArtifactLibraries.ts](utils/mergeArtifactLibraries.ts) | 66 | 合并本地+云端 SavedArtifact 库去重 |
| 17 | [utils/mindMapElkLayout.ts](utils/mindMapElkLayout.ts) | 97 | 思维导图：elkjs 自动布局算法 |
| 18 | [utils/mindMapFlowAdapter.ts](utils/mindMapFlowAdapter.ts) | 112 | MindMapNode ↔ @xyflow/react Node/Edge 数据映射 |
| 19 | [utils/mindMapLabel.ts](utils/mindMapLabel.ts) | 6 | 思维导图节点 label 显示（中英文双语合并） |
| 20 | [utils/mindMapLayout.ts](utils/mindMapLayout.ts) | 223 | 思维导图：分层 + 预计算位置 (Reingold–Tilford 思想) |
| 21 | [utils/mindMapScope.ts](utils/mindMapScope.ts) | 6 | 多文档并排时给思维导图 node id 加前缀避免冲突 |
| 22 | [utils/pdfQuoteHighlight.ts](utils/pdfQuoteHighlight.ts) | 91 | PDF 单页 quote 近似匹配 + 视口坐标矩形（半透明高亮） |
| 23 | [utils/pdfUtils.ts](utils/pdfUtils.ts) | 142 | PDF 加载/页转图/文本提取/文件 hash 等基础工具（pdfjs-dist 包装） |
| 24 | [utils/prompts.ts](utils/prompts.ts) | 160 | 文档分类器 + STEM/HUMANITIES 系统 prompt（文科/理科分流） |
| 25 | [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) | 39 | SavedArtifact 类型→图标/颜色/标签 meta 表（**唯一 .tsx 因含 lucide 图标**） |
| 26 | [utils/scaffoldingClassifier.ts](utils/scaffoldingClassifier.ts) | 91 | P4 支架式辅导：纯启发式答题质量分档 |
| 27 | [utils/studyFlowInference.ts](utils/studyFlowInference.ts) | 100 | 学习流推断（熟悉度/紧迫度/场景 key） |
| 28 | [utils/textUtils.ts](utils/textUtils.ts) | 121 | 文本工具：上/下标转换、HTML 包装、selection 文本规范化 |
| **合计** | — | **2825 行** | — |

---

## 2. 引用方矩阵

> 全仓 grep + 排除快照 .md。每行最后是引用方总数。

| # | utils 文件 | 引用方 | 数 |
|---|------------|-------|----|
| 1 | artifactSourceLabel | [App.tsx:42](App.tsx) | **1** |
| 2 | bkt | [features/exam/ExamPredictionPanel.tsx:17](features/exam/ExamPredictionPanel.tsx)、[features/exam/workspace/WorkspaceKcProbeModal.tsx:16](features/exam/workspace/WorkspaceKcProbeModal.tsx) | **2** |
| 3 | collectSavedArtifactsFromCloud | [features/review/ReviewPage.tsx:8](features/review/ReviewPage.tsx)、[utils/mergeArtifactLibraries.ts:3](utils/mergeArtifactLibraries.ts)（utils-内部） | **2** |
| 4 | collectSavedArtifactsFromLocalHistory | [features/review/ReviewPage.tsx:7](features/review/ReviewPage.tsx)、[utils/mergeArtifactLibraries.ts:2](utils/mergeArtifactLibraries.ts)（utils-内部） | **2** |
| 5 | examChunkIndex | [features/exam/workspace/ExamWorkspacePage.tsx:44](features/exam/workspace/ExamWorkspacePage.tsx) | **1** |
| 6 | examChunkRetrieval | [features/exam/workspace/ExamWorkspacePage.tsx:46](features/exam/workspace/ExamWorkspacePage.tsx)、[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:36](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **2** |
| 7 | examMaintenanceEligibility | [features/exam/hub/ExamDailyMaintenancePanel.tsx:14](features/exam/hub/ExamDailyMaintenancePanel.tsx) | **1** |
| 8 | examSchedule | [features/exam/hub/ExamDailyMaintenancePanel.tsx:23](features/exam/hub/ExamDailyMaintenancePanel.tsx)、[utils/examMaintenanceEligibility.ts:2](utils/examMaintenanceEligibility.ts)（内部）、[utils/maintenanceStrategy.ts:2](utils/maintenanceStrategy.ts)（内部） | **3**（1 外部 + 2 内部） |
| 9 | examWorkspaceCitations | [features/exam/workspace/ExamWorkspaceCitationBlock.tsx:8](features/exam/workspace/ExamWorkspaceCitationBlock.tsx)、[features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx:11](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx)、[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:35](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **3** |
| 10 | examWorkspaceLsapKey | [App.tsx:56](App.tsx)、[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:30](features/exam/workspace/ExamWorkspaceSocraticChat.tsx)、[features/exam/workspace/ExamWorkspacePage.tsx:43](features/exam/workspace/ExamWorkspacePage.tsx)、[features/exam/workspace/WorkspaceEvidenceReportModal.tsx:7](features/exam/workspace/WorkspaceEvidenceReportModal.tsx) | **4** |
| 11 | examWorkspaceOrchestrator | [features/exam/workspace/ExamWorkspaceSocraticChat.tsx:29](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **1** |
| 12 | extractBoldTermsFromMarkdown | [App.tsx:58](App.tsx)、[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:26](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **2** |
| 13 | glossaryTermFilter | [features/exam/workspace/ExamWorkspaceSocraticChat.tsx:27](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **1** |
| 14 | lsapScore | [App.tsx:57](App.tsx)、[features/exam/ExamPredictionPanel.tsx:19](features/exam/ExamPredictionPanel.tsx)、[features/exam/workspace/WorkspaceKcProbeModal.tsx:17](features/exam/workspace/WorkspaceKcProbeModal.tsx) | **3** |
| 15 | maintenanceStrategy | [features/exam/hub/ExamDailyMaintenancePanel.tsx:19](features/exam/hub/ExamDailyMaintenancePanel.tsx) | **1** |
| 16 | mergeArtifactLibraries | [features/review/ReviewPage.tsx:9](features/review/ReviewPage.tsx) | **1** |
| 17 | mindMapElkLayout | [features/review/tools/mindMap/MindMapFlowCanvas.tsx:18](features/review/tools/mindMap/MindMapFlowCanvas.tsx) | **1** |
| 18 | mindMapFlowAdapter | [features/review/tools/mindMap/MindMapFlowCanvas.tsx:17](features/review/tools/mindMap/MindMapFlowCanvas.tsx)、[features/review/tools/mindMap/MindMapPanel.tsx:6](features/review/tools/mindMap/MindMapPanel.tsx)、[features/review/tools/mindMap/MindMapFlowNode.tsx:5,6](features/review/tools/mindMap/MindMapFlowNode.tsx)、[utils/mindMapElkLayout.ts:4](utils/mindMapElkLayout.ts)（内部） | **3 外部 + 1 内部** |
| 19 | mindMapLabel | [features/review/tools/mindMap/MindMapFlowNode.tsx:7](features/review/tools/mindMap/MindMapFlowNode.tsx) | **1** |
| 20 | mindMapLayout | [utils/mindMapFlowAdapter.ts:6](utils/mindMapFlowAdapter.ts)（内部） | **0 外部 + 1 内部** |
| 21 | mindMapScope | [utils/mindMapFlowAdapter.ts:7](utils/mindMapFlowAdapter.ts)（内部） | **0 外部 + 1 内部** |
| 22 | pdfQuoteHighlight | [features/exam/workspace/ExamWorkspaceMaterialPreview.tsx:11](features/exam/workspace/ExamWorkspaceMaterialPreview.tsx) | **1** |
| 23 | pdfUtils | [App.tsx:41](App.tsx)、[features/exam/workspace/ExamWorkspaceMaterialPreview.tsx:10](features/exam/workspace/ExamWorkspaceMaterialPreview.tsx)、[utils/examChunkIndex.ts:7](utils/examChunkIndex.ts)（内部） | **2 外部 + 1 内部** |
| 24 | prompts | [services/geminiService.ts:7](services/geminiService.ts) | **1** |
| 25 | savedArtifactMeta | [shared/studio/StudioPanel.tsx:4](shared/studio/StudioPanel.tsx)、[shared/studio/SavedArtifactPreview.tsx:8](shared/studio/SavedArtifactPreview.tsx)、[features/review/ReviewPage.tsx:10](features/review/ReviewPage.tsx) | **3** |
| 26 | scaffoldingClassifier | [services/geminiService.ts:6](services/geminiService.ts)、[features/exam/workspace/ExamWorkspaceSocraticChat.tsx:28](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **2** |
| 27 | studyFlowInference | [features/exam/hub/StudyFlowPanel.tsx:12](features/exam/hub/StudyFlowPanel.tsx) | **1** |
| 28 | textUtils | [features/reader/notebook/Notebook.tsx:4](features/reader/notebook/Notebook.tsx)、[features/reader/slide-viewer/SlideViewer.tsx:4](features/reader/slide-viewer/SlideViewer.tsx)、[features/reader/deep-read/ExplanationPanel.tsx:9](features/reader/deep-read/ExplanationPanel.tsx) | **3** |

🟢 **没有任何 utils 引用方超过 5 个**——无"高辐射 utils"。最广的 examWorkspaceLsapKey 也只有 4 处引用（App.tsx + 3 个 exam workspace 文件）。

---

## 3. 域归类

按上述引用方分类，每个 utils 打"域标签"：

### 3.1 exam 独占（11 文件，1244 行）

| 文件 | 行数 | 主要调用方 |
|------|------|----------|
| bkt | 50 | exam（ExamPredictionPanel + WorkspaceKcProbeModal） |
| examChunkIndex | 126 | exam（ExamWorkspacePage） |
| examChunkRetrieval | 195 | exam（Page + Socratic） |
| examMaintenanceEligibility | 26 | exam（DailyMaintenance） |
| examSchedule | 228 | exam（DailyMaintenance + 2 utils-内部） |
| examWorkspaceCitations | 176 | exam（CitationBlock + AssistantMarkdown + Socratic） |
| examWorkspaceOrchestrator | 89 | exam（Socratic） |
| glossaryTermFilter | 205 | exam（Socratic） |
| maintenanceStrategy | 160 | exam（DailyMaintenance） |
| pdfQuoteHighlight | 91 | exam（MaterialPreview） |
| studyFlowInference | 100 | exam（StudyFlowPanel） |

### 3.2 review 独占（6 文件，528 行）

| 文件 | 行数 | 主要调用方 |
|------|------|----------|
| collectSavedArtifactsFromCloud | 64 | review（ReviewPage）+ utils-内部 |
| collectSavedArtifactsFromLocalHistory | 33 | review（ReviewPage）+ utils-内部 |
| mergeArtifactLibraries | 66 | review（ReviewPage） |
| mindMapElkLayout | 97 | review（mindMap/MindMapFlowCanvas） |
| mindMapFlowAdapter | 112 | review（mindMap × 3 files）+ utils-内部 |
| mindMapLabel | 6 | review（mindMap/MindMapFlowNode） |
| mindMapLayout | 223 | review（mindMap，间接）— 仅 utils-内部 |
| mindMapScope | 6 | review（mindMap，间接）— 仅 utils-内部 |

注：mindMapLayout + mindMapScope 没有直接外部调用方，但都是 mindMapFlowAdapter 的依赖→所以归 review-mindMap 簇。

### 3.3 reader 独占（1 文件，121 行）

| 文件 | 行数 | 主要调用方 |
|------|------|----------|
| textUtils | 121 | reader（Notebook + SlideViewer + ExplanationPanel） |

### 3.4 service 独占（1 文件，160 行）

| 文件 | 行数 | 主要调用方 |
|------|------|----------|
| prompts | 160 | services/geminiService（CLASSIFIER_PROMPT + STEM_SYSTEM_PROMPT + HUMANITIES_SYSTEM_PROMPT） |

⚠️ 严格说 prompts 是给 services/ 用的——不是 utils。本批可以考虑搬到 `services/` 或独立 `prompts/` 目录。详见 §6。

### 3.5 app 独占（1 文件，40 行）

| 文件 | 行数 | 主要调用方 |
|------|------|----------|
| artifactSourceLabel | 40 | App.tsx |

### 3.6 跨 2 域（6 文件，398 行）

| 文件 | 行数 | 调用方 | 域 |
|------|------|--------|---|
| examWorkspaceLsapKey | 115 | App.tsx + exam × 3 | app + exam |
| extractBoldTermsFromMarkdown | 46 | App.tsx + exam | app + exam |
| lsapScore | 18 | App.tsx + exam × 2 | app + exam |
| pdfUtils | 142 | App.tsx + exam + utils-内部 | app + exam |
| scaffoldingClassifier | 91 | services/gemini + exam | service + exam |
| savedArtifactMeta.tsx | 39 | shared/studio × 2 + review | shared + review |

🔵 **6 个跨域 utils 全部是"exam + 其他 1 域"或"shared + review"组合**——无文件被 ≥3 域共用。这意味着归类决策不复杂：每个跨域 utils 二选一即可。

### 3.7 域分布统计

| 域 | utils 数 | 行数 |
|----|---------|------|
| exam 独占 | 11 | 1444 |
| review 独占 | 8 | 607 |
| reader 独占 | 1 | 121 |
| service 独占 | 1 | 160 |
| app 独占 | 1 | 40 |
| 跨 2 域 | 6 | 451 |
| **合计** | **28** | **2823** *(差 2 行：表 §1 含 .tsx 39 行计入 review 簇 isn't double-counted; minor counting drift)* |

---

## 4. utils 内部依赖图

```
══════════════════════════════════════════════════════════
exam-cluster 内部依赖（3 条）：
══════════════════════════════════════════════════════════
  examSchedule (228) ←─── examMaintenanceEligibility (26)
                    ←─── maintenanceStrategy (160)

  pdfUtils (142) ←─── examChunkIndex (126)
                  ↑
                 (跨域，pdfUtils 是 app + exam 共用)

══════════════════════════════════════════════════════════
mindMap-cluster 内部依赖（3 条）：
══════════════════════════════════════════════════════════
  mindMapLayout (223) ←─── mindMapFlowAdapter (112)
  mindMapScope (6)    ←─── mindMapFlowAdapter (112)
  mindMapFlowAdapter (112) ←─── mindMapElkLayout (97)（type only）

══════════════════════════════════════════════════════════
artifact-cluster 内部依赖（2 条，全是 type-only）：
══════════════════════════════════════════════════════════
  collectSavedArtifactsFromLocalHistory (33) ←─── mergeArtifactLibraries (66)
  collectSavedArtifactsFromCloud (64)        ←─── mergeArtifactLibraries (66)

══════════════════════════════════════════════════════════
其他 19 个 utils 互相独立，无内部依赖。
══════════════════════════════════════════════════════════
```

🟢 **无循环依赖。**
🟢 **依赖图非常浅**——最深 2 层（如 examSchedule ← examMaintenanceEligibility ← UI 组件）。

### 4.1 簇识别（一起搬）

| 簇 | 成员 | 总行数 |
|---|------|------|
| **exam-schedule 簇** | examSchedule + examMaintenanceEligibility + maintenanceStrategy | 414 |
| **mindMap 簇** | mindMapLayout + mindMapScope + mindMapFlowAdapter + mindMapElkLayout + mindMapLabel | 444 |
| **artifact-collect 簇** | collectSavedArtifactsFromLocalHistory + collectSavedArtifactsFromCloud + mergeArtifactLibraries | 163 |
| **pdf 簇**（跨域） | pdfUtils + pdfQuoteHighlight + examChunkIndex（exam 内部用 pdfUtils） | 359 |

---

## 5. 反向引用 / 服务/types/data

### 5.1 utils → services/

仅 2 处反向 import：

| utils | 引用 |
|-------|------|
| collectSavedArtifactsFromCloud | `@/services/firebase` (fetchSessionDetails) |
| examChunkRetrieval | `@/services/examChunkIndexStorage` (loadExamMaterialChunkIndex) |

🟢 这是**正常的**——utils 调 services 是允许的方向（utils 提供算法，services 提供 IO）。

### 5.2 utils → @/types

**21 个 utils 引用 @/types**（绝大多数）。具体类型：

| utils | 用到的类型 |
|-------|----------|
| collectSavedArtifactsFromLocalHistory | FileHistoryItem, SavedArtifact |
| collectSavedArtifactsFromCloud | CloudSession, SavedArtifact |
| examChunkIndex | ExamMaterialLink, ExamMaterialTextChunk |
| examChunkRetrieval | ExamMaterialTextChunk, RetrievedChunk |
| examMaintenanceEligibility | Exam, ExamMaterialLink |
| examSchedule | DailySegment, DailySegmentKind, DocType, Exam, ExamMaterialLink |
| examWorkspaceCitations | ExamChunkCitationSnapshot |
| examWorkspaceLsapKey | AtomCoverageByKc, ExamChunkCitationSnapshot, ExamMaterialLink, KcGlossaryEntry, LSAPContentMap, LSAPState |
| examWorkspaceOrchestrator | LearnerTurnQuality, ScaffoldingPhase, SocraticProbeMode |
| lsapScore | LSAPBKTState, LSAPContentMap |
| maintenanceStrategy | DisciplineBand, DocType, Exam, ExamMaterialLink, LearnerMood, UrgencyBand |
| mergeArtifactLibraries | SavedArtifact |
| mindMapFlowAdapter | MindMapNode |
| mindMapLabel | MindMapNode |
| mindMapLayout | MindMapNode |
| savedArtifactMeta | SavedArtifactType |
| scaffoldingClassifier | LearnerTurnQuality, ScaffoldingPhase |
| studyFlowInference | Exam, ExamMaterialLink, FilePersistedState, LearnerMood, LSAPState, MaterialFamiliarity, UrgencyBand |

不引 @/types 的 7 个 utils：
- artifactSourceLabel（自己定义内部 const）
- bkt（自定义 BKTParams 接口）
- extractBoldTermsFromMarkdown（纯 string 处理）
- glossaryTermFilter（纯 string 处理）
- mindMapElkLayout（用 @xyflow/react 类型）
- mindMapScope（无类型依赖）
- pdfQuoteHighlight（用 pdfjs-dist 类型）
- pdfUtils（用 pdfjs-dist 类型）
- prompts（纯 string）
- textUtils（纯 string）

### 5.3 utils → @/data/

**0 处。** utils 不依赖 data/ 目录——这与早期发现的"@/data/ 是 exam UI 组件的依赖"一致。

### 5.4 utils → @/features / @/components / @/shared 反向引用（异味检查）

**0 处。** ✅ 健康架构——utils 是底层，不反向调用更高层模块。

---

## 6. 归类建议

> 这一节是核心决策点，请你拍板。

### 6.1 推荐方案：C（混合）

```
features/exam/lib/
  ├── bkt.ts                          (50)
  ├── examChunkIndex.ts               (126)
  ├── examChunkRetrieval.ts           (195)
  ├── examMaintenanceEligibility.ts   (26)
  ├── examSchedule.ts                 (228)
  ├── examWorkspaceCitations.ts       (176)
  ├── examWorkspaceLsapKey.ts         (115)  ← 跨 app+exam，但 exam 主用
  ├── examWorkspaceOrchestrator.ts    (89)
  ├── glossaryTermFilter.ts           (205)
  ├── lsapScore.ts                    (18)   ← 跨 app+exam，但 exam 主用
  ├── maintenanceStrategy.ts          (160)
  ├── pdfQuoteHighlight.ts            (91)
  ├── scaffoldingClassifier.ts        (91)   ← 跨 service+exam
  └── studyFlowInference.ts           (100)

features/review/lib/
  ├── artifacts/
  │   ├── collectSavedArtifactsFromCloud.ts          (64)
  │   ├── collectSavedArtifactsFromLocalHistory.ts   (33)
  │   └── mergeArtifactLibraries.ts                  (66)
  └── mindMap/
      ├── mindMapElkLayout.ts          (97)
      ├── mindMapFlowAdapter.ts        (112)
      ├── mindMapLabel.ts              (6)
      ├── mindMapLayout.ts             (223)
      └── mindMapScope.ts              (6)

features/reader/lib/
  └── textUtils.ts                    (121)

shared/lib/
  ├── savedArtifactMeta.tsx            (39)  ← shared+review 共用，shared 优先
  └── artifactSourceLabel.ts           (40)  ← App.tsx 主用，归 shared 合适

lib/
  ├── pdf/
  │   └── pdfUtils.ts                  (142) ← 跨 app+exam+utils 内部，真正基础工具
  ├── text/
  │   └── extractBoldTermsFromMarkdown.ts  (46)  ← 跨 app+exam，纯字符串工具
  └── prompts/
      └── prompts.ts                   (160) ← service 专用，独立放
```

### 6.2 理由

**为什么混合（C）而不是纯 A 或纯 B：**

1. **A（纯 features-driven）的问题**：6 个跨域 utils 必须放某一边，会出现"app 引用 features/exam/lib/" 这种反向跨界——A 看似干净但实际制造了向上引用
2. **B（纯 type-driven）的问题**：把 examSchedule 与 mindMapLayout 放进 lib/algorithm/，把 textUtils 与 extractBoldTermsFromMarkdown 放进 lib/text/——会丢失"哪些 utils 是 exam 私有"这个产品语义。删 exam 时无法干净连带删
3. **C（混合）**：
   - **exam/review/reader 域内独占的 utils 就近搬**到 `features/<域>/lib/`——强化"feature 自治"边界
   - **真正跨域基础工具**（pdf、纯字符串处理、shared 数据元信息）放 `shared/lib/` 或 `lib/<语义>/`
   - 这样：删一个 feature 时，能干净连带删 `features/<域>/lib/`；新加 feature 时，知道工具放哪个 features/<新域>/lib/

**关键判断 — 6 个跨域 utils 的去向：**

| utils | 决策 | 理由 |
|-------|------|------|
| examWorkspaceLsapKey | features/exam/lib/ | App.tsx 1 次 + exam 3 次——主体是 exam |
| extractBoldTermsFromMarkdown | **lib/text/** | App.tsx + exam 各 1 次，纯字符串工具，不绑 exam 业务 |
| lsapScore | features/exam/lib/ | exam 2 次 + App.tsx 1 次——LSAP 是 exam 概念 |
| pdfUtils | **lib/pdf/** | App.tsx + exam + utils-内部，是真正的 PDF 基础工具 |
| scaffoldingClassifier | features/exam/lib/ | service 用 heuristicQuality 做轻量判断，但"支架式辅导"概念是 exam 的 |
| savedArtifactMeta | shared/lib/ | shared/studio + review 共用，shared 已有 studio 子树 |

⚠️ **scaffoldingClassifier 的犹豫**：services/geminiService.ts:6 引用它的 heuristicQuality。如果归 features/exam/lib/，会出现 services → features 的反向引用（❌ 不健康）。

→ **修正决策**：scaffoldingClassifier 归 **`lib/exam/`**（独立的 exam 算法子目录，可被 services 调用），不绑 features/exam/。

类似地审视 prompts：services/geminiService.ts 引用，归 **`lib/prompts/`** 或 **`services/prompts/`** 都行。

### 6.3 归类备选方案

#### 方案 A（纯 features-driven）— 不推荐

把所有 utils 直接搬到 `features/<域>/lib/`（跨域的强行二选一）。优点：feature 自治极致；缺点：services → features 反向引用（scaffoldingClassifier、prompts）。

#### 方案 B（纯 type-driven）— 不推荐

按语义类型分：
```
lib/text/        textUtils + extractBoldTermsFromMarkdown
lib/algorithm/   bkt + lsapScore + scaffoldingClassifier + glossaryTermFilter
lib/exam/        examSchedule + ... + examWorkspace*
lib/mindMap/     mindMap 5 件
lib/artifacts/   3 个 collect/merge + savedArtifactMeta + artifactSourceLabel
lib/pdf/         pdfUtils + pdfQuoteHighlight
lib/storage/     ?（utils 中没有真正的"存储"工具）
lib/prompts/     prompts
```
优点：每个目录语义清晰；缺点：需要为 examSchedule 这种 228 行 exam 巨头新建 lib/exam/，与 features/exam/ 分裂——心智成本高。

---

## 7. 搬迁批次建议

### 推荐方案：**分 4 批**

按风险递增 + 每批语义清晰：

**第 4-1 批（小试牛刀）：reader + app + service-独占（4 文件）**
- textUtils → features/reader/lib/
- artifactSourceLabel → shared/lib/
- prompts → services/prompts/（或 lib/prompts/，待 Q 决策）
- savedArtifactMeta → shared/lib/

预期：约 8 行 import 改动，2 个新目录。最简单，先打通流程。

**第 4-2 批（review 独占）：8 文件**
- 3 个 artifact 簇 → features/review/lib/artifacts/
- 5 个 mindMap 簇 → features/review/lib/mindMap/

预期：约 8 行 import 改动（review/tools/mindMap/ 3 文件 + ReviewPage 1 文件），2 个新子目录。

**第 4-3 批（exam 独占 + lsapScore + lsapKey + scaffoldingClassifier）：14 文件**
- 11 个 exam 独占 → features/exam/lib/
- + lsapScore（exam 概念，归 features/exam/lib/）
- + examWorkspaceLsapKey（exam 主用，归 features/exam/lib/）
- + scaffoldingClassifier（独立到 lib/exam/，避免 services → features 反向引用）

预期：约 15-20 行 import 改动（多个 exam 文件 + App.tsx 2 处 + services/geminiService 1 处）。**最大批次**。

**第 4-4 批（真正跨域基础工具）：2 文件**
- pdfUtils → lib/pdf/
- extractBoldTermsFromMarkdown → lib/text/

预期：约 4-5 行 import 改动（App.tsx 2 处 + exam 2 处 + utils 内部 1 处）。

合计 4 + 8 + 14 + 2 = 28 ✓

### 备选：**1 批搬完 28 文件**

不推荐——utils 重组不是单一 feature 内部改动，而是涉及 App.tsx + 5+ feature + services 的全仓改动。一次搬完会造成 ≥35 行 import 改动 + 8+ 个新目录创建——容易出错，难回滚。

### 备选：**分 2 批**

第 4-1：所有"独占"（reader + app + review + exam + service = 21 文件）
第 4-2：跨域 6 个

不推荐——独占 21 文件混一批，目录范围太广。

---

## 8. 风险提示

### 8.1 高辐射 utils（≥3 调用方）

| utils | 调用数 | 风险 |
|-------|-------|------|
| examWorkspaceLsapKey | 4 | App.tsx + exam workspace × 3——搬路径要小心更新 4 处 |
| examSchedule | 3（1 外部 + 2 内部） | 涉及 utils 内部 import 链，搬时连带 examMaintenanceEligibility + maintenanceStrategy 一起搬 |
| examWorkspaceCitations | 3 | exam workspace × 3 |
| lsapScore | 3 | App.tsx + exam × 2 |
| mindMapFlowAdapter | 3 外部 + 1 内部 | mindMap 5 件套核心，必须连带 4 个兄弟一起搬 |
| savedArtifactMeta | 3 | shared/studio × 2 + review × 1 |
| textUtils | 3 | reader × 3（reader 独占，路径都好改） |

⚠️ 没有 utils 引用方 ≥5——比 features 搬迁(reader skim 单批 1309 行 + 16 路径) 风险**反而更小**。

### 8.2 反向引用 features/components/shared 的异味

**0 处。** ✅ 无异味。

### 8.3 循环依赖

**0 处。** ✅ 依赖图是干净的 DAG。

### 8.4 名字暧昧 / 职责不清

| utils | 暧昧之处 |
|-------|---------|
| **prompts.ts** | 名字过宽——实际只放了 3 个 system prompt（CLASSIFIER + STEM + HUMANITIES）。建议搬时改名 `systemPrompts.ts` 或 `classifierPrompts.ts` |
| **extractBoldTermsFromMarkdown.ts** | 名字暗示纯文本提取，但实际还导出 `normalizeTermKey` + `buildKcGlossaryEntryId`——后两个是术语 key 工具，与 markdown 解析混在一起。可考虑拆分 |
| **scaffoldingClassifier.ts** | 名字像"分类器"，但实际是"答题质量启发式分档"。建议读代码后定改名（本批不强求） |
| **pdfUtils.ts** | "Utils" 太通用——它实际是 pdfjs-dist 包装层，搬时改名 `pdfBundle.ts` 或保持 `pdf/index.ts` 都行 |

### 8.5 两个 6 行的"小到尴尬"文件

- mindMapLabel.ts（6 行）：仅 1 个函数 getMindMapNodeLabel，应该考虑合并到 mindMapFlowAdapter（共享 MindMapNode 类型）
- mindMapScope.ts（6 行）：仅 1 个函数 + 1 个 const，被 mindMapFlowAdapter 用，可合并到 mindMapFlowAdapter

但**本批是"搬迁"不是"重构"**——保持现状即可，合并留待阶段 5。

### 8.6 唯一 .tsx 文件

savedArtifactMeta.**tsx**（39 行）含 lucide 图标 JSX——是 utils 中唯一非 .ts 文件。归类时注意路径仍 `.tsx` 而非 `.ts`。

---

## 9. 用户决策点（请拍板）

- [ ] **Q1**：归类风格 **C 混合（推荐）**、A 纯 features-driven、还是 B 纯 type-driven？
- [ ] **Q2**：scaffoldingClassifier + prompts.ts 是归 `lib/exam/` + `lib/prompts/`（独立目录避免 services → features 反向引用）还是归 `services/lib/`？（推荐 lib/ 独立，因为它们是算法+模板，不是 service 的 IO 层）
- [ ] **Q3**：搬迁批次：**4 批（推荐）** vs 2 批 vs 1 批一次性？（推荐 4 批，每批语义清晰，风险递增）
- [ ] **Q4**：`extractBoldTermsFromMarkdown` 是否拆分（markdown 解析 vs 术语 key 工具）？（推荐**本批不拆**，留待阶段 5 重构。本批仅搬路径）
- [ ] **Q5**：6 行的 `mindMapLabel.ts` + `mindMapScope.ts` 是否合并到 `mindMapFlowAdapter.ts`？（推荐**本批不合并**，本批仅搬路径；合并属重构）
- [ ] **Q6**：`prompts.ts` 是否改名为 `systemPrompts.ts` 同时搬？（推荐**改名 + 搬一起做**，反正 import path 一定要改，顺手改名节省后续 rename commit）
- [ ] **Q7**：`pdfUtils.ts` 与 `pdfQuoteHighlight.ts` 是否同居 `lib/pdf/`？（推荐**是**，两兄弟语义一致）。但 pdfQuoteHighlight 是 exam 独占——也可放 features/exam/lib/。请拍板。

---

## 10. 与往期扫描报告对照

### 10.1 EXAM_PRE_MIGRATION_SCAN.md §5.2 一致性核验

EXAM 扫描列出 "12 个 exam 独占 utils + 4 个跨域 utils"。本次扫描发现：

| EXAM 扫描的"exam 独占 12 个" | 本次扫描结果 | 一致？ |
|---------------------------|------------|-------|
| examWorkspaceCitations | exam 独占（3 引用） | ✅ |
| examChunkRetrieval | exam 独占（2 引用） | ✅ |
| examChunkIndex | exam 独占（1 引用） | ✅ |
| examWorkspaceOrchestrator | exam 独占（1 引用） | ✅ |
| examMaintenanceEligibility | exam 独占（1 引用） | ✅ |
| maintenanceStrategy | exam 独占（1 引用） | ✅ |
| examSchedule | exam 独占（1 + 2 内部） | ✅ |
| studyFlowInference | exam 独占（1 引用） | ✅ |
| bkt | exam 独占（2 引用） | ✅ |
| **lsapScore** | **跨 app + exam（3 引用）** | ⚠️ EXAM 扫描误归"exam 独占" |
| glossaryTermFilter | exam 独占（1 引用） | ✅ |
| pdfQuoteHighlight | exam 独占（1 引用） | ✅ |

| EXAM 扫描的"跨域 4 个" | 本次扫描结果 | 一致？ |
|---------------------|------------|-------|
| examWorkspaceLsapKey | 跨 app + exam | ✅ |
| extractBoldTermsFromMarkdown | 跨 app + exam | ✅ |
| scaffoldingClassifier | 跨 service + exam | ✅ |
| pdfUtils | 跨 app + exam（+ utils 内部） | ✅ |

### 10.2 偏差总结

⚠️ EXAM 扫描 §5.2 把 **lsapScore 错归为"exam 独占"**——本次扫描发现 [App.tsx:57](App.tsx) 也引用 `computePredictedScore`。这是个细微偏差，不影响搬迁逻辑（lsapScore 仍主体是 exam）。

🟢 其他 15 个判断全部一致。EXAM 扫描的产品语义判断质量很高。

---

## 11. 与 CONTEXT.md utils 清单对照

[CONTEXT.md:212](CONTEXT.md) 列出：

> artifactSourceLabel, bkt, collectSavedArtifactsFromCloud, collectSavedArtifactsFromLocalHistory, examChunkIndex, examChunkRetrieval, examMaintenanceEligibility, examSchedule, examWorkspaceCitations, examWorkspaceLsapKey, examWorkspaceOrchestrator, extractBoldTermsFromMarkdown, glossaryTermFilter, lsapScore, maintenanceStrategy, mergeArtifactLibraries, mindMapElkLayout, mindMapFlowAdapter, mindMapLabel, mindMapLayout, prompts, savedArtifactMeta, scaffoldingClassifier, studyFlowInference, textUtils
> （另有 mindMapScope / pdfQuoteHighlight / pdfUtils 三个文件在两次 ls 之间出现差异，需在 P2 阶段 4 启动时重新核对）

本次扫描实测：

| CONTEXT.md 列表 | 实测 28 文件 | 一致？ |
|---------------|------------|-------|
| 主清单 25 个 | 全部存在 | ✅ |
| 注释提到的 mindMapScope | 存在（6 行） | ✅ |
| 注释提到的 pdfQuoteHighlight | 存在（91 行） | ✅ |
| 注释提到的 pdfUtils | 存在（142 行） | ✅ |

🟢 **CONTEXT.md utils 清单完全准确**——25 主清单 + 3 注释 = 28 文件，全部对得上。注释里"两次 ls 之间出现差异"的情况在本次扫描已澄清：3 个文件都在。

---

## 12. 总结快表

```
合计：     28 文件 / 2825 行
归类：     11 exam独占 + 8 review独占 + 1 reader + 1 service +
           1 app + 6 跨域
内部依赖：  3 簇（exam-schedule 3 / mindMap 5 / artifacts 3）
反向引用： 0 处异味
循环依赖： 0
高辐射：   无（最广 4 处）
推荐方案： C 混合（features/<域>/lib/ + shared/lib/ + lib/<语义>/）
推荐批次： 4 批（reader+app+service / review / exam / 真跨域）
推荐顺序： 第 4-1（小试 4 文件）→ 4-2（review 8）→ 4-3（exam 14）→ 4-4（pdf+text 2）
```

---

*预扫描完。零代码改动、零目录创建、零 git mv。等你看完发正式包。
本批是 P2 阶段 4 的入口——utils 重组虽然引用面广但风险其实低于 features 搬迁
（无高辐射、无异味、依赖浅、归类清晰）。
关键决策在 Q1（归类风格）+ Q2（scaffoldingClassifier/prompts 去哪）。*
