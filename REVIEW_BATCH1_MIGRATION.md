# P2 第 10 次搬迁报告：review/ 第 1 批（12 文件，1 批搬完）

> P2 阶段 3 · Batch 2/2 · **review 区域一次性收官**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

### 容器（1 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ReviewPage.tsx`（393 行） | [`features/review/ReviewPage.tsx`](features/review/ReviewPage.tsx) |

### 独立工具（8 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/QuizReviewPanel.tsx`（309 行） | [`features/review/tools/QuizReviewPanel.tsx`](features/review/tools/QuizReviewPanel.tsx) |
| `git mv` | `components/FlashCardReviewPanel.tsx`（213 行） | [`features/review/tools/FlashCardReviewPanel.tsx`](features/review/tools/FlashCardReviewPanel.tsx) |
| `git mv` | `components/StudyGuidePanel.tsx`（205 行） | [`features/review/tools/StudyGuidePanel.tsx`](features/review/tools/StudyGuidePanel.tsx) |
| `git mv` | `components/TerminologyPanel.tsx`（120 行） | [`features/review/tools/TerminologyPanel.tsx`](features/review/tools/TerminologyPanel.tsx) |
| `git mv` | `components/FeynmanPanel.tsx`（363 行） | [`features/review/tools/FeynmanPanel.tsx`](features/review/tools/FeynmanPanel.tsx) |
| `git mv` | `components/TrickyProfessorPanel.tsx`（114 行） | [`features/review/tools/TrickyProfessorPanel.tsx`](features/review/tools/TrickyProfessorPanel.tsx) |
| `git mv` | `components/TrapListPanel.tsx`（78 行） | [`features/review/tools/TrapListPanel.tsx`](features/review/tools/TrapListPanel.tsx) |
| `git mv` | `components/MultiDocQAPanel.tsx`（208 行，含 storage 工具函数） | [`features/review/tools/MultiDocQAPanel.tsx`](features/review/tools/MultiDocQAPanel.tsx) |

### mindMap 三件套（3 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/MindMapPanel.tsx`（589 行） | [`features/review/tools/mindMap/MindMapPanel.tsx`](features/review/tools/mindMap/MindMapPanel.tsx) |
| `git mv` | `components/MindMapFlowCanvas.tsx`（206 行） | [`features/review/tools/mindMap/MindMapFlowCanvas.tsx`](features/review/tools/mindMap/MindMapFlowCanvas.tsx) |
| `git mv` | `components/MindMapFlowNode.tsx`（155 行） | [`features/review/tools/mindMap/MindMapFlowNode.tsx`](features/review/tools/mindMap/MindMapFlowNode.tsx) |

新建目录：`features/review/`、`features/review/tools/`、`features/review/tools/mindMap/`。
git status 中 10 条为 `R`（纯 rename），2 条 mindMap 的为 `RM`——M 的部分对应 §2.1 的 2 处内部 import 更新，符合预期。

---

## 2. 修改的引用

### 2.1 mindMap 三件套的内部 import（2 处）

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| [features/review/tools/mindMap/MindMapPanel.tsx](features/review/tools/mindMap/MindMapPanel.tsx) | 5 | `import { MindMapFlowCanvas, type MindMapFlowCanvasRef, type TreePart } from '@/components/MindMapFlowCanvas';` | 同名从 `@/features/review/tools/mindMap/MindMapFlowCanvas` |
| [features/review/tools/mindMap/MindMapFlowCanvas.tsx](features/review/tools/mindMap/MindMapFlowCanvas.tsx) | 19 | `import { MindMapFlowNode } from '@/components/MindMapFlowNode';` | `import { MindMapFlowNode } from '@/features/review/tools/mindMap/MindMapFlowNode';` |

> 注：mindMap 三件套对 `@/utils/mindMap{ElkLayout,FlowAdapter,Label,Layout}` 的 import 路径**不变**（按 Q2 决策，utils 留原位等阶段 4）。

### 2.2 外部代码引用（10 行，全在 App.tsx）

| 行 | 改动 |
|----|------|
| [App.tsx](App.tsx) 18 | `'@/components/QuizReviewPanel'` → `'@/features/review/tools/QuizReviewPanel'` |
| [App.tsx](App.tsx) 19 | `'@/components/FlashCardReviewPanel'` → `'@/features/review/tools/FlashCardReviewPanel'` |
| [App.tsx](App.tsx) 21 | `'@/components/StudyGuidePanel'` → `'@/features/review/tools/StudyGuidePanel'` |
| [App.tsx](App.tsx) 23 | `'@/components/FeynmanPanel'` → `'@/features/review/tools/FeynmanPanel'` |
| [App.tsx](App.tsx) 25 | `'@/components/TerminologyPanel'` → `'@/features/review/tools/TerminologyPanel'` |
| [App.tsx](App.tsx) 26 | `'@/components/TrapListPanel'` → `'@/features/review/tools/TrapListPanel'` |
| [App.tsx](App.tsx) 27 | `'@/components/TrickyProfessorPanel'` → `'@/features/review/tools/TrickyProfessorPanel'` |
| [App.tsx](App.tsx) 28 | `'@/components/MindMapPanel'` → `'@/features/review/tools/mindMap/MindMapPanel'` |
| [App.tsx](App.tsx) 29 | `'@/components/MultiDocQAPanel'` → `'@/features/review/tools/MultiDocQAPanel'`（4 个名字 import：MultiDocQAPanel + getMultiDocQAConversationKey + loadMultiDocQAMessages + saveMultiDocQAMessages，specifier 一处即可） |
| [App.tsx](App.tsx) 36 | `'@/components/ReviewPage'` → `'@/features/review/ReviewPage'` |

外部引用合计 **0 行 features/、0 行 shared/、0 行其他 components/**——review 集群与外界除 App.tsx 之外完全无耦合，符合扫描预测。

### 2.3 活文档路径更新

| 文件 | 改动 |
|------|------|
| [CONTEXT.md](CONTEXT.md) | features/ 树新增 review 子目录（含 tools/mindMap）；features/ 文件计数 15 → 27；components/ 文件计数 33 → 21（exam 19 + galgame 2）；阶段 3 第 2 批 ✅；产品事实修正新增第 9 条（ReviewPage 不是 11 工具的容器）；最后更新日期同步；待 commit 行加入；引用文档表新增本次 SCAN + MIGRATION |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 12 处旧路径替换 |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 多处旧路径替换 |
| [P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md) | 旧路径替换 |
| [VERSION.md](VERSION.md) | 旧路径替换 |
| [docs/MINDMAP_STEP5.md](docs/MINDMAP_STEP5.md) | 旧路径替换 |

> 注：P2_COMPONENT_GLOSSARY.md 中关于这 12 个组件的提及多为名称引用（如 "### MindMapPanel.tsx —— ..."），不带 `components/` 前缀，故 sed 未匹配、无需改动。

### 2.4 刻意未改（快照型/历史报告）

| 文件 | 原因 |
|------|------|
| [REVIEW_PRE_MIGRATION_SCAN.md](REVIEW_PRE_MIGRATION_SCAN.md) | 本批的预扫描，时态语义保留 |
| [SHARED_PRE_MIGRATION_SCAN.md](SHARED_PRE_MIGRATION_SCAN.md) / [NOTEBOOK_PRE_MIGRATION_SCAN.md](NOTEBOOK_PRE_MIGRATION_SCAN.md) | 历次预扫描快照 |
| 所有 `*_MIGRATION.md` | 历次搬迁完工报告，时态保留 |
| [REFACTOR_AUDIT.md](REFACTOR_AUDIT.md) / [DEAD_CODE_CONFIRMED.md](DEAD_CODE_CONFIRMED.md) / [ALIAS_MIGRATION_REPORT.md](ALIAS_MIGRATION_REPORT.md) | 各阶段历史快照 |
| `scripts/migrate-to-alias.last-run.json` | 脚本运行快照（下次跑会自动覆盖） |

### 2.5 非 mindMap 工具的内部 import

**完全未触碰**——8 个独立工具 + ReviewPage 各自仅引 react / lucide-react / react-markdown 套件 / @/types / @/services/* / @/utils/* / @/shared/studio/SavedArtifactPreview，所有引用都不需要改动。

---

## 3. TypeScript 检查结果

```bash
$ npx tsc --noEmit
... 10 errors, exit 2
```

| 指标 | 值 |
|------|------|
| 错误总数 | **10** |
| 与基线比对 | **0 新增 / 0 减少** |
| `Cannot find module` 错误 | **0** ✅ |

10 个错误均历史遗留（App.tsx StudyGuideContent.trim、ExamWorkspacePage import.meta.env、SkimPanel 比较类型、firebase Omit、geminiService import.meta.env / boolean 比较 / inlineData 类型、transcriptionService SpeechRecognition 三件套），与本次搬迁无关。

---

## 4. 残留扫描

```bash
$ grep "@/components/(ReviewPage|QuizReviewPanel|FlashCardReviewPanel|StudyGuidePanel|TerminologyPanel|FeynmanPanel|TrickyProfessorPanel|TrapListPanel|MultiDocQAPanel|MindMapPanel|MindMapFlowCanvas|MindMapFlowNode)" \
       --include="*.{ts,tsx,js,jsx,mjs,json}"
# 0 matches
```

代码层（.ts/.tsx）中已完全无 12 个旧路径残留。.md 中残留全部位于刻意保留的快照报告（§2.4）。

---

## 5. 是否有意外发现

**无**。本批与扫描预测完全一致：
- ✅ 内部依赖 2 条（MindMapPanel→Canvas→Node 单链），与扫描一致
- ✅ 外部 import 全部在 App.tsx 10 行，0 处 features/ / shared/ / 其他 components 引用
- ✅ 12 个 git mv 全部识别为 R 或 RM（带内部修改）
- ✅ tsc 通过基线
- ✅ 无新增 "Cannot find module"
- ✅ MindMap 三件套对 `@/utils/mindMap*` 的 import 路径保持不变（utils 留原位）

---

## 6. 本批决策记录（用户已拍板）

| 编号 | 决策 |
|------|------|
| Q1 | MultiDocQAPanel 内的 3 个 storage 工具函数（getMultiDocQAConversationKey 等）**保持现状不拆**，跟 panel 一起搬；待 REFACTOR_PLAN.md 阶段 4（拆巨型组件）一并处理 |
| Q2 | utils/mindMap{ElkLayout,FlowAdapter,Label,Layout}.ts (4 文件) **留在 utils/**，本批不动，等 P2 阶段 4 统一搬 lib/ |
| Q3 | ReviewPage 语义偏差**明确归档**到本报告 §7 + CONTEXT.md "产品事实修正" 第 9 条 |
| Q4 | **1 批搬完** 12 个文件（不分批） |
| Q5 | mindMap 三件套放 `features/review/tools/mindMap/` **子目录**（不平铺） |

---

## 7. ReviewPage 语义修正（重要）

> 这是本批扫描中发现的最重要的产品事实，需归档以避免后续 AI / 开发者误判。

### 旧描述

> "ReviewPage 是九宫格中枢，挂载 11 个学习工具"
> （来自 [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) / [P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md) 等早期文档）

### 实际事实

[features/review/ReviewPage.tsx](features/review/ReviewPage.tsx) **不 import** 任何 `tools/` 下的组件。它是个**独立的"学习产物库"页面**，职责是：
- 拉本地历史 + 云端会话中的所有 SavedArtifact（学习指南、思维导图、术语表等）
- 通过 [@/utils/collectSavedArtifactsFromLocalHistory](utils/collectSavedArtifactsFromLocalHistory.ts) + [@/utils/collectSavedArtifactsFromCloud](utils/collectSavedArtifactsFromCloud.ts) + [@/utils/mergeArtifactLibraries](utils/mergeArtifactLibraries.ts) 合并去重
- 用 [@/shared/studio/SavedArtifactPreview](shared/studio/SavedArtifactPreview.tsx) 的 ArtifactFullView 展示选中的产物
- **完全不挂载任何工具弹层**

11 个工具实际**全部由 [App.tsx](App.tsx) 直接挂载**（line 18-29 + 36），每个由 App.tsx 的状态机控制弹层显隐。

### 搬迁后目录结构的"误导性"

```
features/review/
├── ReviewPage.tsx              ← 独立页面，跟下面没关系
└── tools/
    ├── 8 个独立工具 .tsx       ← App.tsx 直接挂载
    └── mindMap/
        └── 3 个 mindmap .tsx   ← App.tsx 直接挂载（仅 MindMapPanel）
```

虽然看起来像"容器 + 子目录"层级，**实际上是平行关系**。后续 AI / 开发者：
- 不要在 ReviewPage 里加挂载 `tools/` 工具的代码（不是它的职责）
- 加新学习工具按钮时直接在 App.tsx 状态机和九宫格 / Header 入口加，跟 ReviewPage 无关
- ReviewPage 自身的扩展方向是"产物展示 / 过滤 / 删除 / 重新生成"，不是"工具接入"

### 证据

- [REVIEW_PRE_MIGRATION_SCAN.md §2](REVIEW_PRE_MIGRATION_SCAN.md)（grep 结果：ReviewPage 不被任何 tool import，也不 import 任何 tool）
- [REVIEW_PRE_MIGRATION_SCAN.md §7.3](REVIEW_PRE_MIGRATION_SCAN.md)（语义偏差说明）

---

## 8. 未拆分项的待办

### 8.1 MultiDocQAPanel 含 3 个 storage 工具函数（按 Q1 不拆）

[features/review/tools/MultiDocQAPanel.tsx](features/review/tools/MultiDocQAPanel.tsx) 除了 `MultiDocQAPanel` 组件，还导出：
- `getMultiDocQAConversationKey`
- `loadMultiDocQAMessages`
- `saveMultiDocQAMessages`

[App.tsx:29](App.tsx) 当前一并 import 这 4 个名字。

**架构上不干净**——组件文件兼任 storage helper。建议在 **REFACTOR_PLAN.md 阶段 4（拆巨型组件）** 时，把这 3 个工具函数抽到 `features/review/tools/multiDocQAStorage.ts`，组件文件只做 UI。本批不动以避免引入业务逻辑改动。

### 8.2 utils/mindMap*.ts (4 文件) 留 utils/（按 Q2）

`mindMapElkLayout.ts` / `mindMapFlowAdapter.ts` / `mindMapLabel.ts` / `mindMapLayout.ts` 是 mindmap 三件套独占的 utils，理论上可就近搬到 `features/review/tools/mindMap/` 形成 7 文件子目录。

但按已确定方案：**utils/ 留待 P2 阶段 4 统一搬到 lib/**——届时再决定是否就近合并。本批 mindMap 三件套对它们的 import 路径**保持原样**（仍是 `@/utils/mindMap*`），别名能正常解析。

⚠️ 这是**计划内的过渡状态**——后续看 features/ 下还引哪些 utils 时，会发现 mindMap 这一组耦合在 utils/，等阶段 4 一并处理即可。

### 8.3 ReactMarkdown 重复主题（StudyGuide / Feynman / TrickyProfessor / MultiDocQA）

4 个 panel 各自实现了 `MarkdownComponents` 主题（与 SkimPanel / SavedArtifactPreview 等也类似）。本批未动，等 **P3 抽 `AppMarkdown` 共享件** 统一处理。

---

## 9. P2 阶段 3 进度更新

至此 components/ 只剩：

| 类别 | 数量 | 文件 |
|------|------|------|
| exam 系列 | 19 | ExamCenterPanel / ExamDailyMaintenancePanel / ExamHubModal / ExamLinkModal / ExamPredictionPanel / ExamSummaryPanel / ExamTrapsPanel / ExamWorkspaceAssistantMarkdown / ExamWorkspaceCitationBlock / ExamWorkspaceMaterialPreview / ExamWorkspacePage / ExamWorkspaceSocraticChat / KcGlossarySidebar / KnowledgePointInspectPanel / MaintenanceFeedbackCelebration / MaintenanceFlashcardDeck / StudyFlowPanel / WorkspaceEvidenceReportModal / WorkspaceKcProbeModal |
| galgame 系列 | 2 | GalgameOverlay, GalgameSettings |
| **合计** | **21** | — |

下一批将处理 **`features/exam/`**（19 文件，是 P2 阶段 3 最后一个大模块、也是整个 P2 阶段 3 最大的一批）。`galgame` 2 文件可以并入 exam 批次后续做归档收尾，或者独立 mini commit 处理。

阶段 3 进度：
- ✅ shared/（8 文件，1 批完成）
- ✅ LoadingInteractiveContent → features/reader/deep-read/（mini）
- ✅ features/review/（12 文件，本批完成）
- ⏳ features/exam/（下一批，最后一个大模块）
- ⏳ galgame 归档/迁移收尾

---

## 10. 用户测试清单（定向 2-5 分钟）

请跑 `npm run dev`，然后核对这 5 项：

- [ ] **9 个学习工具弹层正常打开**：从九宫格或对应入口依次打开 Quiz / FlashCard / StudyGuide / Terminology / Feynman / TrickyProfessor / TrapList / MultiDocQA / MindMap 中的至少 3-4 个，应弹出对应 panel，无白屏、无 console "Cannot find module"
- [ ] **思维导图三件套联动**：MindMap 弹出后，应正常渲染 ReactFlow 画布（MindMapFlowCanvas）和节点（MindMapFlowNode），可缩放/平移/重置
- [ ] **MultiDocQA 多文档问答 + 对话存储**：打开 MultiDocQAPanel 发一条消息 → 收到回复 → 关闭再打开（同一组文档），应能恢复历史对话（验证 storage 工具函数 getMultiDocQAConversationKey / loadMultiDocQAMessages / saveMultiDocQAMessages 仍工作）
- [ ] **学习产物库 ReviewPage**：从入口打开 ReviewPage（"复习"/"产物库"按钮），应展示历史生成的产物列表（学习指南、思维导图等卡片），点击其一能打开 ArtifactFullView 全屏预览
- [ ] **整体无白屏 / 无 console 红字**（"Cannot find module" / "X is not exported" / "Cannot read property" 类）；"ERR_CONNECTION_REFUSED / 404 / CORS" 类是接口问题，忽略

---

## 11. 建议的 git commit message

```
refactor(p2): 把 12 个 review 组件搬到 features/review/ + tools/ + tools/mindMap/

- features/review/             ReviewPage（独立学习产物库页面）
- features/review/tools/       Quiz, FlashCard, StudyGuide, Terminology,
                               Feynman, TrickyProfessor, TrapList, MultiDocQA
- features/review/tools/mindMap/ MindMapPanel, MindMapFlowCanvas, MindMapFlowNode
- App.tsx 10 行 import 改 @/features/review/...
- mindMap 三件套内部 2 行 import 改为同子目录的 @/features/review/tools/mindMap/...
- utils/mindMap*.ts (4 文件) 留 utils/ 不动，等阶段 4 统一搬 lib/
- MultiDocQAPanel 含 3 个 storage 工具函数保留现状，待阶段 4 拆 UI
- 6 个活文档（CONTEXT/REFACTOR_P2_PLAN/P2_DEPENDENCY_SCAN/P2_ENTRY_POINTS/
  VERSION/docs/MINDMAP_STEP5）旧路径同步更新
- CONTEXT.md "产品事实修正" 新增第 9 条：ReviewPage 不是 11 工具的容器
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 3 第 2 批完工——review/ 区域 12 文件归位。
components/ 只剩 exam(19) + galgame(2) = 21 文件。
```

---

*报告完。等用户验证通过后手动 commit。
本批共 12 个 git mv + 12 处代码 import 改动 + 6 处活文档路径同步 + 1 条产品事实修正归档，无任何业务逻辑改动。
是 P2 阶段至今体量最大的一批，但内部结构最干净。*
