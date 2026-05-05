# P2 阶段：目录结构重组——侦察清单

> 阶段 2 已完成（死代码清理 + galgame 归档 + search 别名删除）。
> 本文档是 **P2 搬迁前的侦察图**：只规划，不动码。
> 配套文档：[REFACTOR_PLAN.md](REFACTOR_PLAN.md)、[REFACTOR_AUDIT.md](REFACTOR_AUDIT.md)
> 生成时间：2026-05-03（基线：refactor 分支当前状态）

---

## 0. 总体目录设想

```
class-skip/
├── App.tsx, index.tsx, types.ts          # 阶段 5/6 再处理
├── _archived/                            # 已建
├── data/                                 # 教学法常量与文案，原位保留（见 §3.5）
├── docs/                                 # 历史文档，原位保留
├── features/                             # 🆕 按业务功能聚合
│   ├── exam/                             #   考试领域（最大）
│   │   ├── center/                       #     考试管理 + 弹窗 hub
│   │   ├── workspace/                    #     备考工作台（含 socratic 子域）
│   │   ├── maintenance/                  #     今日保温学习
│   │   ├── prediction/                   #     LSAP 预测
│   │   ├── tools/                        #     summary / traps / terminology / studyGuide / trickyProfessor 单工具面板
│   │   ├── studyFlow/                    #     情境流程
│   │   └── lib/                          #     考试领域算法
│   ├── skim/                             #   略读
│   ├── explanation/                      #   深读讲解（PDF 单页讲解）
│   ├── mindmap/                          #   思维导图
│   ├── feynman/                          #   费曼
│   ├── flashcard/                        #   闪卡
│   ├── quiz/                             #   测验
│   ├── fiveMinFlow/                      #   5 分钟启动流
│   ├── multiDocQA/                       #   多文档问答
│   ├── mood/                             #   心情对话 / 任务拥抱
│   ├── galgame/                          #   恋爱模式（产品已关，但代码还在）
│   ├── classroom/                        #   上课录音
│   ├── turtleSoup/                       #   海龟汤（番茄钟奖励）
│   ├── sideQuest/                        #   支线任务
│   ├── pdfReader/                        #   PDF 翻页 / 标注 / 评论
│   ├── notebook/                         #   笔记本
│   ├── studio/                           #   "工坊"：保存的产物预览/列表
│   ├── review/                           #   复习页（跨产物聚合）
│   └── lectureTranscript/                #   上课文字稿
├── shared/                               # 🆕 跨 feature 共用
│   ├── layout/                           #   Header、Sidebar、WelcomeScreen
│   ├── auth/                             #   LoginModal
│   ├── history/                          #   HistoryModal
│   ├── audio/                            #   MusicPlayer
│   └── ui/                               #   预留：未来 AppMarkdown、Modal 等
├── lib/                                  # 🆕 通用算法/IO，与业务无关或弱相关
│   ├── firebase/                         #   firebase.ts 拆分后归此（P6 再细拆）
│   ├── gemini/                           #   geminiService.ts 拆分后归此（P4 再细拆）
│   ├── pdf/                              #   pdfUtils + pdfQuoteHighlight
│   ├── text/                             #   textUtils + extractBoldTerms + glossaryTermFilter
│   ├── retrieval/                        #   examChunkIndex + examChunkRetrieval + examChunkIndexStorage
│   ├── bkt/                              #   bkt + lsapScore
│   └── storage/                          #   storageService（IndexedDB 通用层）
└── services/                             # 仅保留薄"出口" services 文件（imageGen、transcriptionService）
```

> 规则约定：
> - **`features/*`**：UI + 该功能特有的 hook、prompt、子组件、纯领域算法（如 examSchedule）。一切只服务于该功能的代码都在此。
> - **`shared/*`**：被 ≥2 个 feature 使用的纯 UI / Modal / 全局壳。
> - **`lib/*`**：与业务无关的纯算法 / IO 封装。能在另一个项目里直接复用的就归这里。
> - **`services/`**：保留少数"外部 SDK 浅封装"（imageGen、transcriptionService），不再放 50+ 函数的胖文件。

---

## 1. components/ 重组建议（55 个文件）

> "定位"列含义：**主**（feature 主入口）/ **子**（仅服务于父组件）/ **模态**（Modal/Drawer）/ **共享**（跨 feature）。

### 1.1 features/exam/center/

| 当前路径 | 行 | 定位 | 内部依赖（同模块） | 跨模块依赖 |
|---|---|---|---|---|
| [components/ExamHubModal.tsx](components/ExamHubModal.tsx) | 130 | 模态（带 tab 路由） | ExamCenterPanel、ExamDailyMaintenancePanel、StudyFlowPanel | services/firebase |
| [components/ExamCenterPanel.tsx](components/ExamCenterPanel.tsx) | 321 | 主 | ExamLinkModal | services/firebase |
| [components/ExamLinkModal.tsx](components/ExamLinkModal.tsx) | 565 | 模态 | — | services/firebase、services/storageService |

### 1.2 features/exam/workspace/

> 备考工作台是项目最深的组件树（4 层）。这里把工作台主页、Socratic 对话、引文渲染、KC 面板都收进来。

| 当前路径 | 行 | 定位 | 内部依赖 | 跨模块依赖 |
|---|---|---|---|---|
| [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | 1,492 | 主 | ExamWorkspaceSocraticChat、KcGlossarySidebar、KnowledgePointInspectPanel、WorkspaceKcProbeModal、WorkspaceEvidenceReportModal、ExamWorkspaceMaterialPreview | utils/examWorkspaceLsapKey、utils/examChunkIndex、utils/examChunkRetrieval、services/firebase、services/examChunkIndexStorage |
| [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) | 780 | 主（子页面级） | ExamWorkspaceCitationBlock、ExamWorkspaceAssistantMarkdown | utils/extractBoldTermsFromMarkdown、utils/glossaryTermFilter、utils/scaffoldingClassifier、utils/examWorkspaceOrchestrator、utils/examWorkspaceLsapKey、utils/examWorkspaceCitations、utils/examChunkRetrieval、services/examChunkIndexStorage、services/geminiService |
| [components/ExamWorkspaceAssistantMarkdown.tsx](components/ExamWorkspaceAssistantMarkdown.tsx) | 261 | 子 | ExamWorkspaceCitationBlock | utils/examWorkspaceCitations |
| [components/ExamWorkspaceCitationBlock.tsx](components/ExamWorkspaceCitationBlock.tsx) | 273 | 子 | — | utils/examWorkspaceCitations |
| [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) | 996 | 子（PDF 预览专用） | — | utils/pdfUtils、utils/pdfQuoteHighlight |
| [components/KcGlossarySidebar.tsx](components/KcGlossarySidebar.tsx) | 92 | 子 | — | — |
| [components/KnowledgePointInspectPanel.tsx](components/KnowledgePointInspectPanel.tsx) | 95 | 子（modal） | — | — |
| [components/WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx) | 362 | 模态 | WorkspaceEvidenceReportModal（其中的 ConflictPageHint） | utils/bkt、utils/lsapScore、services/geminiService |
| [components/WorkspaceEvidenceReportModal.tsx](components/WorkspaceEvidenceReportModal.tsx) | 321 | 模态 | — | utils/examWorkspaceLsapKey |

🔀 **同名相似**：`ExamWorkspaceMaterialPreview` 与 `features/pdfReader/SlideViewer` 都是 PDF 渲染，但前者带"引文高亮 + 跨材料切换"，是工作台特有；不合并，留在 workspace。

### 1.3 features/exam/maintenance/

| 当前路径 | 行 | 定位 | 内部依赖 | 跨模块依赖 |
|---|---|---|---|---|
| [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | 641 | 主 | MaintenanceFlashcardDeck、MaintenanceFeedbackCelebration | utils/examMaintenanceEligibility、utils/maintenanceStrategy、utils/examSchedule、data/maintenanceFeedbackCopy、services/firebase、services/geminiService |
| [components/MaintenanceFlashcardDeck.tsx](components/MaintenanceFlashcardDeck.tsx) | 67 | 子 | — | — |
| [components/MaintenanceFeedbackCelebration.tsx](components/MaintenanceFeedbackCelebration.tsx) | 44 | 子 | — | — |

### 1.4 features/exam/prediction/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | 1,035 | 主 | utils/bkt、utils/lsapScore、services/geminiService |

### 1.5 features/exam/tools/（"备考小工具"集合）

> ⚠️ 这五个面板都接受 docContent → 调一个 Gemini 函数 → 渲染结果。结构上同一类，物理上分开放可以让每个工具独立演化。如果你想合并成 `features/exam/tools/{Summary,Traps,Terminology,...}`，告诉我即可。

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx) | 192 | 主 | services/geminiService |
| [components/ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) | 98 | 主 | services/geminiService |
| [components/TrapListPanel.tsx](components/TrapListPanel.tsx) | 78 | 子 | — |
| [components/TerminologyPanel.tsx](components/TerminologyPanel.tsx) | 120 | 主 | services/geminiService |
| [components/StudyGuidePanel.tsx](components/StudyGuidePanel.tsx) | 205 | 主 | services/geminiService |
| [components/TrickyProfessorPanel.tsx](components/TrickyProfessorPanel.tsx) | 114 | 主 | services/geminiService |

### 1.6 features/exam/studyFlow/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) | 260 | 主 | utils/studyFlowInference、data/studyFlowTemplates |

### 1.7 features/skim/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx) | 1,309 | 主 | services/geminiService（chatWithSkimAdaptiveTutor 等 4 个） |

### 1.8 features/explanation/

| 当前路径 | 行 | 定位 | 内部依赖 | 跨模块依赖 |
|---|---|---|---|---|
| [components/ExplanationPanel.tsx](components/ExplanationPanel.tsx) | 674 | 主 | LoadingInteractiveContent | utils/textUtils |
| [components/LoadingInteractiveContent.tsx](components/LoadingInteractiveContent.tsx) | 233 | 子 | — | — |

### 1.9 features/mindmap/

| 当前路径 | 行 | 定位 | 内部依赖 | 跨模块依赖 |
|---|---|---|---|---|
| [components/MindMapPanel.tsx](components/MindMapPanel.tsx) | 589 | 主 | MindMapFlowCanvas | utils/mindMapFlowAdapter、services/geminiService |
| [components/MindMapFlowCanvas.tsx](components/MindMapFlowCanvas.tsx) | 206 | 子 | MindMapFlowNode | utils/mindMapFlowAdapter、utils/mindMapElkLayout |
| [components/MindMapFlowNode.tsx](components/MindMapFlowNode.tsx) | 155 | 子 | — | utils/mindMapFlowAdapter、utils/mindMapLabel |

### 1.10 features/feynman/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/FeynmanPanel.tsx](components/FeynmanPanel.tsx) | 363 | 主 | services/geminiService |

### 1.11 features/flashcard/ 与 features/quiz/

> ⚠️ 决策点：FlashCard 和 Quiz 现在是平行的两个组件，建议**分开放**（flashcard、quiz）；如果你觉得"测验和闪卡都是即时复习题，应放一起"，告诉我合并到 `features/review-tools/`。

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/FlashCardReviewPanel.tsx](components/FlashCardReviewPanel.tsx) | 213 | 主（flashcard） | services/geminiService |
| [components/QuizReviewPanel.tsx](components/QuizReviewPanel.tsx) | 309 | 主（quiz） | services/geminiService |

### 1.12 features/fiveMinFlow/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/FiveMinFlowPanel.tsx](components/FiveMinFlowPanel.tsx) | 370 | 主 | services/geminiService |

### 1.13 features/multiDocQA/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/MultiDocQAPanel.tsx](components/MultiDocQAPanel.tsx) | 208 | 主（同时 export `getMultiDocQAConversationKey`、`loadMultiDocQAMessages`、`saveMultiDocQAMessages`） | services/geminiService |

### 1.14 features/mood/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/MoodDialog.tsx](components/MoodDialog.tsx) | 48 | 主（dialog） | — |
| [components/TaskHug.tsx](components/TaskHug.tsx) | 277 | 主 | services/geminiService |
| [components/ChatHug.tsx](components/ChatHug.tsx) | 196 | 主 | services/geminiService |

### 1.15 features/galgame/

> 产品入口已关闭（见 [_archived/README.md](_archived/README.md)）。代码仍在使用中（`generatePersonaStoryScript` 走 geminiService 内联 prompt）。**保留为正常 feature**，不归档。

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/GalgameOverlay.tsx](components/GalgameOverlay.tsx) | 327 | 主（覆盖层） | services/geminiService |
| [components/GalgameSettings.tsx](components/GalgameSettings.tsx) | 245 | 主（设置 dialog） | services/imageGen、services/firebase |

### 1.16 features/classroom/ + features/lectureTranscript/

> ⚠️ **职责接近，需你确认是否合并**。`ClassroomPanel` 是上课中的录音控制（依赖 transcriptionService）；`LectureTranscriptPage` 是录音结束后的文字稿展示。建议拆成两个 feature 但相邻。

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/ClassroomPanel.tsx](components/ClassroomPanel.tsx) | 52 | 主 | — |
| [components/LectureTranscriptPage.tsx](components/LectureTranscriptPage.tsx) | 296 | 主 | — |

### 1.17 features/turtleSoup/ + features/sideQuest/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/TurtleSoupPanel.tsx](components/TurtleSoupPanel.tsx) | 237 | 主 | services/geminiService |
| [components/SideQuestPanel.tsx](components/SideQuestPanel.tsx) | 149 | 主 | — |

### 1.18 features/pdfReader/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/SlideViewer.tsx](components/SlideViewer.tsx) | 547 | 主 | utils/textUtils |
| [components/SlidePageComments.tsx](components/SlidePageComments.tsx) | 215 | 主（页面评论） | — |
| [components/PageMarkPanel.tsx](components/PageMarkPanel.tsx) | 208 | 主（重点标记） | — |

### 1.19 features/notebook/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [features/reader/notebook/Notebook.tsx](features/reader/notebook/Notebook.tsx) | 269 | 主 | utils/textUtils |

### 1.20 features/studio/ + features/review/

> 🤔 **跨模块**：`SavedArtifactPreview` 同时被 StudioPanel 和 ReviewPage import；`utils/savedArtifactMeta.tsx` 三处使用。两个 feature 共用，但都属于"保存产物"领域，可以放在 `features/studio/`，让 review 反向 import；或者抽 `features/artifacts/` 共享层。**决策点**：见 §3.

| 当前路径 | 行 | 定位 | 内部依赖 | 跨模块依赖 |
|---|---|---|---|---|
| [components/StudioPanel.tsx](components/StudioPanel.tsx) | 110 | 主（再导出 ArtifactFullView） | SavedArtifactPreview | utils/savedArtifactMeta |
| [components/SavedArtifactPreview.tsx](components/SavedArtifactPreview.tsx) | 284 | 子（被两人 import） | — | utils/savedArtifactMeta |
| [components/ReviewPage.tsx](components/ReviewPage.tsx) | 393 | 主 | SavedArtifactPreview | utils/collectSavedArtifactsFromCloud、utils/collectSavedArtifactsFromLocalHistory、utils/mergeArtifactLibraries、utils/savedArtifactMeta、services/firebase、services/storageService |

### 1.21 shared/layout/

| 当前路径 | 行 | 定位 | 内部依赖 |
|---|---|---|---|
| [components/Header.tsx](components/Header.tsx) | 523 | 共享（顶栏） | MusicPlayer |
| [components/Sidebar.tsx](components/Sidebar.tsx) | 972 | 共享（侧栏） | services/firebase |
| [components/WelcomeScreen.tsx](components/WelcomeScreen.tsx) | 83 | 共享（欢迎页） | — |

### 1.22 shared/auth/ + shared/history/ + shared/audio/

| 当前路径 | 行 | 定位 | 跨模块依赖 |
|---|---|---|---|
| [components/LoginModal.tsx](components/LoginModal.tsx) | 150 | 共享（登录弹窗） | services/firebase |
| [components/HistoryModal.tsx](components/HistoryModal.tsx) | 104 | 共享（历史会话） | — |
| [components/MusicPlayer.tsx](components/MusicPlayer.tsx) | 116 | 共享（仅被 Header import） | — |

> 🤔 **MusicPlayer**：当前只有 Header 一处用它。严格讲不算"共享"，可以放 `shared/layout/` 与 Header 同居，或单独留在 `shared/audio/`。建议放 `shared/layout/MusicPlayer.tsx` 与 Header 紧邻。

---

## 2. utils/ + services/ 重组建议（28 + 6 个文件）

### 2.1 lib/firebase/

| 当前路径 | 行 | 定位 | 备注 |
|---|---|---|---|
| [services/firebase.ts](services/firebase.ts) | 653 | 工具（30 个导出） | P2 阶段先整体搬到 `lib/firebase/firebase.ts`；P6 再按 entity 拆 sessions/folders/calendar/memos/exams/dailyPlan |

### 2.2 lib/gemini/

| 当前路径 | 行 | 定位 | 备注 |
|---|---|---|---|
| [services/geminiService.ts](services/geminiService.ts) | 2,945 | 工具（50+ 函数） | **P2 不拆**，先整体搬到 `lib/gemini/geminiService.ts`；P3/P4 阶段再按 feature 把 prompt 和函数下沉到各 feature |

### 2.3 lib/pdf/

| 当前路径 | 行 | 内部依赖 |
|---|---|---|
| [utils/pdfUtils.ts](utils/pdfUtils.ts) | 142 | — |
| [utils/pdfQuoteHighlight.ts](utils/pdfQuoteHighlight.ts) | 91 | — |

### 2.4 lib/text/

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/textUtils.ts](utils/textUtils.ts) | 121 | 通用 HTML/文本处理（plainTextToHtmlWithSupSub 等） |
| [utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) | 46 | 🤔 **决策**：与 KC 黑板术语高度耦合（被 ExamWorkspaceSocraticChat、App.tsx 用）。可放 `lib/text/`（通用）也可放 `features/exam/workspace/lib/`（专用）。建议放 `lib/text/`，因为它本质是 markdown 解析。 |
| [utils/glossaryTermFilter.ts](utils/glossaryTermFilter.ts) | 205 | 🤔 同上，决策点同 §3 |

### 2.5 lib/retrieval/

| 当前路径 | 行 | 内部依赖 |
|---|---|---|
| [utils/examChunkIndex.ts](utils/examChunkIndex.ts) | 126 | utils/pdfUtils（→ lib/pdf） |
| [utils/examChunkRetrieval.ts](utils/examChunkRetrieval.ts) | 195 | services/examChunkIndexStorage（→ lib/retrieval/storage） |
| [services/examChunkIndexStorage.ts](services/examChunkIndexStorage.ts) | 65 | — |

> 🤔 **决策**：这三个文件名都带 "exam"，但实现是通用 BM25 + IndexedDB chunk 存储，可服务任何"PDF 切块检索"场景。建议**改名脱业务**：`chunkIndex.ts` / `bm25Retrieval.ts` / `chunkIndexStorage.ts`，归入 `lib/retrieval/`。如果你想保留 "exam" 前缀以表明当前只用于备考工作台，那放 `features/exam/workspace/lib/` 也行——见 §3。

### 2.6 lib/bkt/

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/bkt.ts](utils/bkt.ts) | 50 | BKT 算法本体 |
| [utils/lsapScore.ts](utils/lsapScore.ts) | 18 | LSAP 预测分（依赖 BKT 状态） |

### 2.7 lib/storage/

| 当前路径 | 行 | 备注 |
|---|---|---|
| [services/storageService.ts](services/storageService.ts) | 102 | IndexedDB 通用层；被 App、ExamLinkModal、ReviewPage 用 |

### 2.8 features/exam/workspace/lib/（考试工作台特有算法）

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/examWorkspaceCitations.ts](utils/examWorkspaceCitations.ts) | 176 | 引文解析 |
| [utils/examWorkspaceLsapKey.ts](utils/examWorkspaceLsapKey.ts) | 115 | 工作台对话 key + LocalStorage |
| [utils/examWorkspaceOrchestrator.ts](utils/examWorkspaceOrchestrator.ts) | 89 | LSAP 探针下一步状态机 |
| [utils/scaffoldingClassifier.ts](utils/scaffoldingClassifier.ts) | 91 | 学习者发言分类 + 支架阶段（也被 geminiService 用） |

### 2.9 features/exam/lib/（考试领域算法）

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/examSchedule.ts](utils/examSchedule.ts) | 228 | 考试压力评估 + 每日规划 |
| [utils/examMaintenanceEligibility.ts](utils/examMaintenanceEligibility.ts) | 26 | 维护资格 |
| [utils/maintenanceStrategy.ts](utils/maintenanceStrategy.ts) | 160 | 维护策略 |
| [utils/studyFlowInference.ts](utils/studyFlowInference.ts) | 100 | 情境推断 |

### 2.10 features/mindmap/lib/

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/mindMapFlowAdapter.ts](utils/mindMapFlowAdapter.ts) | 112 | React Flow 适配器 |
| [utils/mindMapElkLayout.ts](utils/mindMapElkLayout.ts) | 97 | ELK 布局 |
| [utils/mindMapLayout.ts](utils/mindMapLayout.ts) | 223 | 老布局工具（部分函数已死，见审计报告 §2.3） |
| [utils/mindMapLabel.ts](utils/mindMapLabel.ts) | 6 | 节点标签 |
| [utils/mindMapScope.ts](utils/mindMapScope.ts) | 6 | 多文档 id 加前缀 |

### 2.11 features/studio/lib/（保存产物聚合）

| 当前路径 | 行 | 备注 |
|---|---|---|
| [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) | 39 | ⚠️ 含 JSX，应改为 `.tsx` 已是；放 features/studio 即可 |
| [utils/collectSavedArtifactsFromCloud.ts](utils/collectSavedArtifactsFromCloud.ts) | 64 | — |
| [utils/collectSavedArtifactsFromLocalHistory.ts](utils/collectSavedArtifactsFromLocalHistory.ts) | 33 | — |
| [utils/mergeArtifactLibraries.ts](utils/mergeArtifactLibraries.ts) | 66 | — |
| [utils/artifactSourceLabel.ts](utils/artifactSourceLabel.ts) | 40 | — |

### 2.12 services/（保留少量薄壳）

| 当前路径 | 行 | 备注 |
|---|---|---|
| [services/imageGen.ts](services/imageGen.ts) | 111 | 仅被 GalgameSettings 用，建议**搬到 features/galgame/imageGen.ts**，services/ 下不再保留。 |
| [services/transcriptionService.ts](services/transcriptionService.ts) | 66 | Web Speech API 包装；被 App、ClassroomPanel 用，建议放 `lib/transcription/`。 |

### 2.13 utils/prompts.ts 和 data/

| 当前路径 | 行 | 处理建议 |
|---|---|---|
| [utils/prompts.ts](utils/prompts.ts)（galgame 已归档后） | ~160 | 含 `CLASSIFIER_PROMPT`、`STEM_SYSTEM_PROMPT`、`HUMANITIES_SYSTEM_PROMPT`，仅被 geminiService 用。**P2 阶段先搬到 `lib/gemini/prompts/sharedSystemPrompts.ts`**；P3 再继续散到各 feature。 |
| [data/disciplineTeachingProfiles.ts](data/disciplineTeachingProfiles.ts) | 49 | 仅 geminiService 用，搬 `lib/gemini/prompts/`。 |
| [data/scaffoldingPrompt.ts](data/scaffoldingPrompt.ts) | 53 | 仅 geminiService 用，搬 `lib/gemini/prompts/`。 |
| [data/pedagogyCore.ts](data/pedagogyCore.ts) | 10 | ⚠️ 当前未发现 import，需查证是否还在用——见 §3 决策点。 |
| [data/maintenanceFeedbackCopy.ts](data/maintenanceFeedbackCopy.ts) | 75 | 仅 ExamDailyMaintenancePanel 用，搬 `features/exam/maintenance/`。 |
| [data/studyFlowTemplates.ts](data/studyFlowTemplates.ts) | 248 | 仅 StudyFlowPanel 用，搬 `features/exam/studyFlow/`。 |

---

## 3. 边界情况标记（需 Criss 决策）

### 🤔 跨模块文件

| 文件 | 被谁用 | 候选位置 | 推荐 |
|------|--------|----------|------|
| [components/SavedArtifactPreview.tsx](components/SavedArtifactPreview.tsx) | StudioPanel、ReviewPage | features/studio/ vs features/review/ vs shared/ | **features/studio/**，让 ReviewPage 反向 import |
| [utils/savedArtifactMeta.tsx](utils/savedArtifactMeta.tsx) | StudioPanel、ReviewPage、SavedArtifactPreview | 同上 | **features/studio/lib/** |
| [utils/textUtils.ts](utils/textUtils.ts) | ExplanationPanel、Notebook、SlideViewer | shared 还是 lib | **lib/text/** |
| [utils/extractBoldTermsFromMarkdown.ts](utils/extractBoldTermsFromMarkdown.ts) | App.tsx、ExamWorkspaceSocraticChat | lib/text/ vs features/exam/workspace/lib/ | **lib/text/**（通用 markdown 解析） |
| [utils/glossaryTermFilter.ts](utils/glossaryTermFilter.ts) | ExamWorkspaceSocraticChat | lib/text/ vs features/exam/workspace/lib/ | **lib/text/**（通用术语过滤；当前虽然只工作台用，但语义通用） |
| [utils/scaffoldingClassifier.ts](utils/scaffoldingClassifier.ts) | ExamWorkspaceSocraticChat、services/geminiService | lib/scaffolding/ vs features/exam/workspace/lib/ | **lib/scaffolding/**（被 geminiService 跨域用，不该绑 feature） |
| [components/MusicPlayer.tsx](components/MusicPlayer.tsx) | 仅 Header 一家 | shared/audio/ vs shared/layout/ | **shared/layout/**（与 Header 同居，单一调用方） |
| [components/StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) | 仅 ExamHubModal | features/exam/studyFlow/ vs 顶层独立 feature | **features/exam/studyFlow/**（实际是 ExamHub 第三个 tab） |
| [services/storageService.ts](services/storageService.ts) | App、ExamLinkModal、ReviewPage | lib/storage/ vs features/studio/lib/ | **lib/storage/**（IndexedDB 通用层） |

### ⚠️ 难以归类（需要你说明产品意图）

| 项目 | 不清楚的点 |
|------|-----------|
| `data/pedagogyCore.ts`（10 行） | 文件名暗示是教学法核心常量，但全仓库**未发现 import**。是死代码？还是被未提交代码 / future 使用？需你确认。 |
| `components/SideQuestPanel.tsx` | 知道是"支线任务"面板，被 App 直接 import + 用 `runSideQuestAgent`（在 geminiService）。要单独建 features/sideQuest/，还是合并到 features/turtleSoup/（同属"番茄钟奖励"）？ |
| `features/exam/tools/` 是否存在 | ExamSummaryPanel / ExamTrapsPanel / TerminologyPanel / StudyGuidePanel / TrickyProfessorPanel 五个面板：是建一个 `tools/` 子目录把它们都装进去（推荐），还是各自做独立 feature？ |
| `features/classroom/` vs `features/lectureTranscript/` | 录音控制 + 文字稿展示：合并成一个 `features/lecture/` 还是分两个？ |

### 🔀 同名相似文件

| 文件 A | 文件 B | 相似点 | 决策 |
|--------|--------|--------|------|
| ExamWorkspaceMaterialPreview | SlideViewer | 都渲染 PDF | **不合并**：前者带工作台引文高亮 + 跨材料切换，是工作台特有 |
| MaintenanceFlashcardDeck | FlashCardReviewPanel | 都展示闪卡 | **不合并**：前者是简化的"保温场景"卡组（无 SRS、轻量勾选），后者是完整闪卡复习 |
| ExamChunkIndex（构建）vs ExamChunkRetrieval（搜索）vs ExamChunkIndexStorage（持久化） | 三件事，命名相似 | **不合并**：职责其实清晰，归入 `lib/retrieval/` 后保持各自独立文件即可 |
| MindMapLayout（老）vs MindMapElkLayout（新） | 都是布局算法 | 见 [REFACTOR_AUDIT.md §2.3](REFACTOR_AUDIT.md)：MindMapLayout 中 `computeMindMapLayout` 等三个函数疑似死代码，但 `buildMindMapNodeMeta`、`estimateNodeBox`、`DEFAULT_MIND_MAP_LAYOUT` 仍被 mindMapFlowAdapter 用。**P2 阶段不动**，整体搬入 features/mindmap/lib/，死代码留到独立小步处理。 |

---

## 4. 搬迁顺序建议（风险从低到高）

> 原则：先搬"叶子"，后搬"主干"。**每个 step 单独 commit + 跑 tsc**。

### 第 1 批：纯算法 lib/（无 UI、引用方少、风险最低）

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 1.1 | `lib/bkt/` ← `utils/bkt.ts` + `utils/lsapScore.ts` | 改 3 个调用方（ExamPredictionPanel、WorkspaceKcProbeModal、App.tsx） | 小 |
| 1.2 | `lib/pdf/` ← `utils/pdfUtils.ts` + `utils/pdfQuoteHighlight.ts` | 改 3 个调用方 | 小 |
| 1.3 | `lib/text/` ← `utils/textUtils.ts` + `utils/extractBoldTermsFromMarkdown.ts` + `utils/glossaryTermFilter.ts` | 改 5+ 调用方 | 中 |
| 1.4 | `lib/storage/` ← `services/storageService.ts` | 改 3 调用方 | 小 |
| 1.5 | `lib/transcription/` ← `services/transcriptionService.ts` | 改 1 调用方（App） | 极小 |
| 1.6 | `lib/scaffolding/` ← `utils/scaffoldingClassifier.ts` | 改 2 调用方 | 极小 |
| 1.7 | `lib/retrieval/` ← `utils/examChunkIndex.ts` + `utils/examChunkRetrieval.ts` + `services/examChunkIndexStorage.ts` | 改 3 调用方 | 小 |

### 第 2 批：叶子 feature（独立性最强、依赖少）

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 2.1 | `features/turtleSoup/` ← TurtleSoupPanel | App 一处 | 极小 |
| 2.2 | `features/sideQuest/` ← SideQuestPanel | App 一处 | 极小 |
| 2.3 | `features/multiDocQA/` ← MultiDocQAPanel | App 一处（含 4 个导出） | 小 |
| 2.4 | `features/mood/` ← MoodDialog + TaskHug + ChatHug | App 三处 | 小 |
| 2.5 | `features/feynman/` ← FeynmanPanel | App 一处 | 极小 |
| 2.6 | `features/fiveMinFlow/` ← FiveMinFlowPanel | App 一处 | 极小 |
| 2.7 | `features/flashcard/` ← FlashCardReviewPanel | App 一处 | 极小 |
| 2.8 | `features/quiz/` ← QuizReviewPanel | App 一处 | 极小 |
| 2.9 | `features/notebook/` ← Notebook | App 一处 | 极小 |
| 2.10 | `features/galgame/` ← GalgameOverlay + GalgameSettings + services/imageGen | App 三处 | 小 |
| 2.11 | `features/classroom/` ← ClassroomPanel | App 一处 | 极小 |
| 2.12 | `features/lectureTranscript/` ← LectureTranscriptPage | App 一处 | 极小 |

### 第 3 批：中等复杂度 feature

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 3.1 | `features/explanation/` ← ExplanationPanel + LoadingInteractiveContent | App + ExplanationPanel 内部 | 小 |
| 3.2 | `features/pdfReader/` ← SlideViewer + SlidePageComments + PageMarkPanel | App 三处 | 小 |
| 3.3 | `features/mindmap/` ← MindMapPanel + MindMapFlowCanvas + MindMapFlowNode + 5 个 mindMap utils | App + 5 个内部 | 中 |
| 3.4 | `features/studio/` ← StudioPanel + SavedArtifactPreview + savedArtifactMeta + 4 个 collect/merge/source utils | App + ReviewPage | 中 |
| 3.5 | `features/review/` ← ReviewPage | App 一处 | 小 |
| 3.6 | `features/skim/` ← SkimPanel（1309 行单文件搬迁，**先不拆**） | App 一处 | 中 |

### 第 4 批：考试领域（最大、最复杂，最后做）

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 4.1 | `features/exam/lib/` ← examSchedule + examMaintenanceEligibility + maintenanceStrategy + studyFlowInference | 内部 | 小 |
| 4.2 | `features/exam/maintenance/` ← ExamDailyMaintenancePanel + Maintenance{FlashcardDeck,FeedbackCelebration} + data/maintenanceFeedbackCopy | ExamHubModal 一处 | 中 |
| 4.3 | `features/exam/studyFlow/` ← StudyFlowPanel + data/studyFlowTemplates | ExamHubModal 一处 | 小 |
| 4.4 | `features/exam/center/` ← ExamHubModal + ExamCenterPanel + ExamLinkModal | App 一处 | 小 |
| 4.5 | `features/exam/prediction/` ← ExamPredictionPanel | App 一处 | 小 |
| 4.6 | `features/exam/tools/` ← ExamSummaryPanel + ExamTrapsPanel + TrapListPanel + TerminologyPanel + StudyGuidePanel + TrickyProfessorPanel | App 六处 | 中 |
| 4.7 | `features/exam/workspace/lib/` ← examWorkspaceCitations + examWorkspaceLsapKey + examWorkspaceOrchestrator | 内部 | 小 |
| 4.8 | `features/exam/workspace/` ← ExamWorkspacePage + Socratic 链 4 件 + Material{Preview} + Workspace{KcProbeModal,EvidenceReportModal} + Kc{GlossarySidebar,KnowledgePointInspectPanel} | App 一处 | **大** |

### 第 5 批：shared/（被全场用，最后搬最稳）

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 5.1 | `shared/auth/` ← LoginModal | App 一处 | 极小 |
| 5.2 | `shared/history/` ← HistoryModal | App 一处 | 极小 |
| 5.3 | `shared/layout/` ← Header + MusicPlayer + Sidebar + WelcomeScreen | App 四处 | 中（Sidebar 972 行不拆，整体搬） |

### 第 6 批：lib/firebase/、lib/gemini/（最后搬，因为它们是最重的扁担）

| Step | 内容 | 影响范围 | 工作量 |
|------|------|----------|--------|
| 6.1 | `lib/firebase/firebase.ts` ← services/firebase.ts（**整体搬，不拆**） | ~9 个组件 + 2 个 utils | 中（IDE 自动改 import） |
| 6.2 | `lib/gemini/geminiService.ts` ← services/geminiService.ts（**整体搬，不拆**） | ~24 个文件 | 中 |
| 6.3 | `lib/gemini/prompts/` ← utils/prompts.ts + data/disciplineTeachingProfiles + data/scaffoldingPrompt | geminiService 内部 | 小 |

> P4 阶段才会真正把 firebase/gemini 这两个胖文件拆开。P2 只搬位置、不动结构。

---

## 5. 完成 P2 后的衡量标准

- [ ] `components/` 文件夹**消失或仅剩极少数过渡文件**
- [ ] `services/` 文件夹**消失**（出口都迁到 lib/ 或 features/）
- [ ] `utils/` 文件夹**消失**
- [ ] `data/` 文件夹**消失**（合并到 lib/gemini/prompts/ 与 features/exam/）
- [ ] `npx tsc --noEmit` 错误数 ≤ 10（与基线持平）
- [ ] 跑一遍 [REFACTOR_PLAN.md §13 必测功能清单](REFACTOR_PLAN.md)，全过

---

## 6. 给 Criss 的快速决策清单

请就以下几点拍板，决定后才进入 P2 第一次搬迁：

1. **`features/exam/tools/` 子目录**
   - [ ] 同意把 5 个考试单工具面板（Summary、Traps、Terminology、StudyGuide、TrickyProfessor）放一个 tools/ 子目录？
   - 或者 [ ] 每个单建一个 feature？

2. **`features/classroom/` vs `features/lectureTranscript/`**
   - [ ] 合并成 `features/lecture/`
   - [ ] 分两个

3. **`features/sideQuest/` vs `features/turtleSoup/`**
   - [ ] 合并成 `features/breakReward/`（番茄钟奖励集合）
   - [ ] 分两个

4. **`features/flashcard/` vs `features/quiz/`**
   - [ ] 合并成 `features/reviewTools/`（即时复习题集合）
   - [ ] 分两个

5. **lib/retrieval/ 改名脱业务**
   - [ ] 同意把 `examChunk*` 改名为 `chunk*` / `bm25*`，归入 `lib/retrieval/`？
   - 或者 [ ] 保留 exam 前缀，放 `features/exam/workspace/lib/retrieval/`？（语义更紧但通用性差）

6. **`features/studio/` 收纳产物相关**
   - [ ] 同意 SavedArtifactPreview + savedArtifactMeta + 4 个 collect/merge utils 都进 `features/studio/`，让 ReviewPage 反向 import？

7. **死代码确认**
   - [ ] [data/pedagogyCore.ts](data/pedagogyCore.ts)（10 行，0 import）是死代码可删？还是有其他用途？

8. **搬迁顺序**
   - [ ] 同意按 §4 的 1→2→3→4→5→6 六批顺序？
   - 或者 [ ] 想先搬某个特定 feature（例如 features/skim/，先把 SkimPanel 摘出来）？

---

*报告完。等你拍板后进入 P2 第 1 批：lib/bkt 搬迁。*
