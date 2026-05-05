# P2 第 11 次搬迁报告：exam/ 第 1 批（19 文件，1 批搬完，含 2 文件归类修正）

> P2 阶段 3 · Batch 3/3 · **exam 区域整体收官 + review 归类错误修复**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

### 1.1 修复 review 归类错误（2 → features/review/tools/）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ExamSummaryPanel.tsx`（192 行） | [`features/review/tools/ExamSummaryPanel.tsx`](features/review/tools/ExamSummaryPanel.tsx) |
| `git mv` | `components/ExamTrapsPanel.tsx`（98 行） | [`features/review/tools/ExamTrapsPanel.tsx`](features/review/tools/ExamTrapsPanel.tsx) |

### 1.2 exam 顶层（2 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ExamHubModal.tsx`（130 行） | [`features/exam/ExamHubModal.tsx`](features/exam/ExamHubModal.tsx) |
| `git mv` | `components/ExamPredictionPanel.tsx`（1035 行） | [`features/exam/ExamPredictionPanel.tsx`](features/exam/ExamPredictionPanel.tsx) |

### 1.3 exam/hub/（6 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ExamCenterPanel.tsx`（321 行） | [`features/exam/hub/ExamCenterPanel.tsx`](features/exam/hub/ExamCenterPanel.tsx) |
| `git mv` | `components/ExamLinkModal.tsx`（565 行） | [`features/exam/hub/ExamLinkModal.tsx`](features/exam/hub/ExamLinkModal.tsx) |
| `git mv` | `components/ExamDailyMaintenancePanel.tsx`（641 行） | [`features/exam/hub/ExamDailyMaintenancePanel.tsx`](features/exam/hub/ExamDailyMaintenancePanel.tsx) |
| `git mv` | `components/MaintenanceFlashcardDeck.tsx`（67 行） | [`features/exam/hub/MaintenanceFlashcardDeck.tsx`](features/exam/hub/MaintenanceFlashcardDeck.tsx) |
| `git mv` | `components/MaintenanceFeedbackCelebration.tsx`（44 行） | [`features/exam/hub/MaintenanceFeedbackCelebration.tsx`](features/exam/hub/MaintenanceFeedbackCelebration.tsx) |
| `git mv` | `components/StudyFlowPanel.tsx`（260 行） | [`features/exam/hub/StudyFlowPanel.tsx`](features/exam/hub/StudyFlowPanel.tsx) |

### 1.4 exam/workspace/（9 个）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ExamWorkspacePage.tsx`（**1492 行**） | [`features/exam/workspace/ExamWorkspacePage.tsx`](features/exam/workspace/ExamWorkspacePage.tsx) |
| `git mv` | `components/ExamWorkspaceSocraticChat.tsx`（780 行） | [`features/exam/workspace/ExamWorkspaceSocraticChat.tsx`](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) |
| `git mv` | `components/ExamWorkspaceAssistantMarkdown.tsx`（261 行） | [`features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx`](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx) |
| `git mv` | `components/ExamWorkspaceCitationBlock.tsx`（273 行） | [`features/exam/workspace/ExamWorkspaceCitationBlock.tsx`](features/exam/workspace/ExamWorkspaceCitationBlock.tsx) |
| `git mv` | `components/ExamWorkspaceMaterialPreview.tsx`（**996 行**） | [`features/exam/workspace/ExamWorkspaceMaterialPreview.tsx`](features/exam/workspace/ExamWorkspaceMaterialPreview.tsx) |
| `git mv` | `components/KcGlossarySidebar.tsx`（92 行） | [`features/exam/workspace/KcGlossarySidebar.tsx`](features/exam/workspace/KcGlossarySidebar.tsx) |
| `git mv` | `components/KnowledgePointInspectPanel.tsx`（95 行） | [`features/exam/workspace/KnowledgePointInspectPanel.tsx`](features/exam/workspace/KnowledgePointInspectPanel.tsx) |
| `git mv` | `components/WorkspaceKcProbeModal.tsx`（362 行） | [`features/exam/workspace/WorkspaceKcProbeModal.tsx`](features/exam/workspace/WorkspaceKcProbeModal.tsx) |
| `git mv` | `components/WorkspaceEvidenceReportModal.tsx`（321 行，含 ConflictPageHint 子组件） | [`features/exam/workspace/WorkspaceEvidenceReportModal.tsx`](features/exam/workspace/WorkspaceEvidenceReportModal.tsx) |

新建目录：`features/exam/`、`features/exam/hub/`、`features/exam/workspace/`。
git status 中 12 条为 `R`（纯 rename），7 条为 `RM`——M 的部分对应 §2.1 的 7 处内部 import 更新，符合预期。

合计 **19 个 git mv**。

---

## 2. 修改的引用

### 2.1 内部 import（7 处）

| 文件 | 行 | 改动 |
|------|----|------|
| [features/exam/ExamHubModal.tsx](features/exam/ExamHubModal.tsx) | 6-8 | 3 个 `@/components/{ExamCenterPanel,ExamDailyMaintenancePanel,StudyFlowPanel}` → `@/features/exam/hub/...` |
| [features/exam/hub/ExamCenterPanel.tsx](features/exam/hub/ExamCenterPanel.tsx) | 6 | `@/components/ExamLinkModal` → `@/features/exam/hub/ExamLinkModal` |
| [features/exam/hub/ExamDailyMaintenancePanel.tsx](features/exam/hub/ExamDailyMaintenancePanel.tsx) | 20-21 | 2 个 `@/components/{MaintenanceFlashcardDeck,MaintenanceFeedbackCelebration}` → `@/features/exam/hub/...` |
| [features/exam/workspace/ExamWorkspacePage.tsx](features/exam/workspace/ExamWorkspacePage.tsx) | 37-42 | 6 个 `@/components/{ExamWorkspaceSocraticChat,KcGlossarySidebar,KnowledgePointInspectPanel,WorkspaceKcProbeModal,WorkspaceEvidenceReportModal,ExamWorkspaceMaterialPreview}` → `@/features/exam/workspace/...` |
| [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | 38-39 | 2 个 `@/components/{ExamWorkspaceCitationBlock,ExamWorkspaceAssistantMarkdown}` → `@/features/exam/workspace/...` |
| [features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx) | 12 | `@/components/ExamWorkspaceCitationBlock` → `@/features/exam/workspace/ExamWorkspaceCitationBlock` |
| [features/exam/workspace/WorkspaceKcProbeModal.tsx](features/exam/workspace/WorkspaceKcProbeModal.tsx) | 18 | `@/components/WorkspaceEvidenceReportModal` → `@/features/exam/workspace/WorkspaceEvidenceReportModal`（取 ConflictPageHint 子组件，按 Q4 决策保留现状） |

合计**改动 16 行 import**（7 文件 × 不等条数），覆盖 EXAM_PRE_MIGRATION_SCAN.md §3.1 列出的全部 16 条内部依赖。

> 注：所有文件对 `@/utils/*` / `@/services/*` / `@/types` / `@/data/*` 的引用**保持不变**——按 Q5 等决策，本批不动 utils/services/data 目录。

### 2.2 外部代码引用（5 行，全在 App.tsx）

| 行 | 改动 |
|----|------|
| [App.tsx](App.tsx) 22 | `'@/components/ExamSummaryPanel'` → `'@/features/review/tools/ExamSummaryPanel'`（归类修正） |
| [App.tsx](App.tsx) 24 | `'@/components/ExamTrapsPanel'` → `'@/features/review/tools/ExamTrapsPanel'`（归类修正） |
| [App.tsx](App.tsx) 38 | `'@/components/ExamPredictionPanel'` → `'@/features/exam/ExamPredictionPanel'` |
| [App.tsx](App.tsx) 39 | `'@/components/ExamHubModal'` → `'@/features/exam/ExamHubModal'` |
| [App.tsx](App.tsx) 40 | `'@/components/ExamWorkspacePage'` → `'@/features/exam/workspace/ExamWorkspacePage'` |

外部引用合计 **5 行**——仅 App.tsx，无 features/ / shared/ / 其他 components/ 引用，与扫描预测完全一致。

### 2.3 活文档路径更新

| 文件 | 改动 |
|------|------|
| [CONTEXT.md](CONTEXT.md) | features/ 树新增 exam 子目录（含 hub/ + workspace/ 共 17 文件）；review/tools/ 新增 ExamSummaryPanel + ExamTrapsPanel；features/ 计数 27 → 46；feature 数 8 → 9；components/ 计数 21 → 2；阶段 3 第 3 批 ✅；产品事实修正新增第 10 条；最后更新日期同步；待 commit 行加入；引用文档表新增 EXAM_PRE_MIGRATION_SCAN + EXAM_BATCH1_MIGRATION |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 19 处旧路径替换 |
| [P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md) | 多处旧路径替换 |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 多处旧路径替换 |
| [P2_COMPONENT_GLOSSARY.md](P2_COMPONENT_GLOSSARY.md) | 多处旧路径替换 |
| [docs/EXAM_AND_STUDY_FLOW.md](docs/EXAM_AND_STUDY_FLOW.md) | 旧路径替换 |
| [docs/SKIM_VS_EXAM_TUTOR_API.md](docs/SKIM_VS_EXAM_TUTOR_API.md) | 旧路径替换 |
| [docs/EXAM_WORKSPACE_LAYOUT.md](docs/EXAM_WORKSPACE_LAYOUT.md) | 旧路径替换 |
| [docs/P3_EXAM_WORKSPACE.md](docs/P3_EXAM_WORKSPACE.md) | 旧路径替换 |

### 2.4 刻意未改（快照型/历史报告）

| 文件 | 原因 |
|------|------|
| [EXAM_PRE_MIGRATION_SCAN.md](EXAM_PRE_MIGRATION_SCAN.md) | 本批的预扫描，时态语义保留 |
| [REVIEW_PRE_MIGRATION_SCAN.md](REVIEW_PRE_MIGRATION_SCAN.md) / [SHARED_PRE_MIGRATION_SCAN.md](SHARED_PRE_MIGRATION_SCAN.md) / [NOTEBOOK_PRE_MIGRATION_SCAN.md](NOTEBOOK_PRE_MIGRATION_SCAN.md) | 历次预扫描快照 |
| 所有 `*_MIGRATION.md` | 历次搬迁完工报告，时态保留 |
| [REFACTOR_AUDIT.md](REFACTOR_AUDIT.md) / [DEAD_CODE_CONFIRMED.md](DEAD_CODE_CONFIRMED.md) / [ALIAS_MIGRATION_REPORT.md](ALIAS_MIGRATION_REPORT.md) | 各阶段历史快照 |
| `scripts/migrate-to-alias.last-run.json` | 脚本运行快照 |

### 2.5 utils/ 清单核验（关于 Q5）

⚠️ **修正：扫描报告 §10.2 是误报**——重新核对 [CONTEXT.md](CONTEXT.md) "utils/" 清单 line 212，**maintenanceStrategy.ts 实际已经在列表里**（"...lsapScore, maintenanceStrategy, mergeArtifactLibraries..."）。28 个 utils 计数也准确。CONTEXT.md utils 清单**无需修正**。本批未对 utils 清单做改动。

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

10 个错误均历史遗留：App.tsx StudyGuideContent.trim、**features/exam/workspace/ExamWorkspacePage.tsx** import.meta.env（路径跟随文件移动改名）、SkimPanel 比较类型、firebase Omit、geminiService import.meta.env / boolean / inlineData、transcriptionService 三件套。与本次搬迁无关。

---

## 4. 残留扫描

```bash
$ grep "@/components/(ExamHubModal|ExamCenterPanel|ExamLinkModal|ExamDailyMaintenancePanel|MaintenanceFlashcardDeck|MaintenanceFeedbackCelebration|StudyFlowPanel|ExamPredictionPanel|ExamSummaryPanel|ExamTrapsPanel|ExamWorkspacePage|ExamWorkspaceSocraticChat|ExamWorkspaceAssistantMarkdown|ExamWorkspaceCitationBlock|ExamWorkspaceMaterialPreview|KcGlossarySidebar|KnowledgePointInspectPanel|WorkspaceKcProbeModal|WorkspaceEvidenceReportModal)" \
       --include="*.{ts,tsx,js,jsx,mjs,json}"
# 0 matches
```

代码层（.ts/.tsx）中已完全无 19 个旧路径残留。.md 中残留全部位于刻意保留的快照报告（§2.4）。

---

## 5. 是否有意外发现

**无搬迁层面意外**。完全按扫描预测执行：
- ✅ 内部依赖 16 条（hub 集群 6 条 + workspace 集群 10 条）全部正确更新
- ✅ 外部 import 5 行全在 App.tsx
- ✅ 19 个 git mv 全部识别为 R 或 RM
- ✅ tsc 通过基线
- ✅ 0 跨域引用（features/ / shared/ / 其他 components/）
- ✅ ConflictPageHint 跨文件引用（WorkspaceKcProbe → WorkspaceEvidenceReport）按 Q4 决策保留现状

唯一需要修正的：扫描 §10.2 的 utils 清单"漏列 maintenanceStrategy"是**误报**——已在 §2.5 澄清。

---

## 6. 本批决策记录（用户已拍板）

| 编号 | 决策 |
|------|------|
| **修正** | ExamSummaryPanel + ExamTrapsPanel **从 exam 批移除**，归 `features/review/tools/`（修复早期文档归类错误，详见 §7） |
| Q1 | 子目录化方案 **B**：`features/exam/` + `hub/` + `workspace/` 3 个目录 |
| Q2 | ExamHubModal **放 features/exam/ 顶层**（不进 hub/） |
| Q3 | **1 批搬完** 19 文件（不分批） |
| Q4 | ConflictPageHint **保留现状**（继续住在 WorkspaceEvidenceReportModal 内，不拆为独立文件） |
| Q5 | 顺手修正 CONTEXT.md utils 清单——**实际无需修正**，maintenanceStrategy 已在列表中（§2.5） |

---

## 7. 修复 review 批归类错误（重要）

> 这是本批最重要的产品事实修正——发现并归档一个早期 P2 文档的归类偏差。

### 旧描述

> "ExamSummaryPanel + ExamTrapsPanel 是考试功能组件"
> （来自 [CONTEXT.md](CONTEXT.md) 早期版本 + [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) + [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) 的"候选 features/exam/" 清单。简单地按文件名前缀 "Exam" 做了归类）

### 实际事实

这两个文件**不是考试工作台的功能组件**——它们是**九宫格里的复习工具**，与已经搬过的 8 个 review/tools 完全平级：

**触发位置**：[App.tsx:2306-2307](App.tsx)
```tsx
{/* 复习模式选择器弹窗 → "考前冲刺" 小节 */}
<button onClick={() => { setReviewModeChooserOpen(false); setExamSummaryPanelOpen(true); }}
        className="...bg-emerald-100...">考前速览</button>     // ← 绿色按钮
<button onClick={() => { setReviewModeChooserOpen(false); setExamTrapsPanelOpen(true); }}
        className="...bg-rose-100...">考点与陷阱</button>       // ← 玫红按钮
```

**用户操作链路**（大白话）：
1. 上传 PDF 后，从九宫格"复习模式"按钮 → 打开"复习模式选择器"弹窗
2. 弹窗里"考前冲刺"小节有 3 个按钮：**考前速览**（绿）、**考点与陷阱**（玫红）、**考前预测**（金，跨两列）
3. 点其中 1、2 → 对应 panel 弹层
4. ExamSummaryPanel 把 PDF 全文丢给 AI → 输出考前压缩 markdown 笔记
5. ExamTrapsPanel 把 PDF 丢给 AI → 输出可能踩的陷阱清单

**关键证据**：[features/review/ReviewPage.tsx](features/review/ReviewPage.tsx) 的 `ReviewType` 枚举本来就把它们列为 review 类型：
```ts
export type ReviewType =
  | 'quiz' | 'flashcard' | 'studyGuide'
  | 'examSummary'    // ← ExamSummaryPanel 对应
  | 'feynman' | 'examTraps'    // ← ExamTrapsPanel 对应
  | 'terminology' | 'trickyProfessor' | 'mindMap'
  | 'multiDocQA' | 'trapList';
```

[P2_ENTRY_POINTS.md:60-61](P2_ENTRY_POINTS.md) 也已记录它们为九宫格第 9、10 号工具。

### 体量对照

| 工具 | 行数 | 类别 |
|------|------|------|
| FeynmanPanel | 363 | review/tools |
| StudyGuidePanel | 205 | review/tools |
| **ExamSummaryPanel** | **192** | review/tools（本批归位） |
| TrickyProfessorPanel | 114 | review/tools |
| **ExamTrapsPanel** | **98** | review/tools（本批归位） |
| TrapListPanel | 78 | review/tools |

ExamSummaryPanel + ExamTrapsPanel 的体量与其他 review 工具完全一致——**远不是**真正 exam 工作台级（如 ExamWorkspacePage 1492 行、ExamPredictionPanel 1035 行、ExamWorkspaceMaterialPreview 996 行）的巨型组件。

### 归档到 CONTEXT.md "产品事实修正" 第 10 条

[CONTEXT.md](CONTEXT.md) 已新增第 10 条记录此归类修正——避免后续 AI / 开发者再被文件名前缀误导。

---

## 8. 未拆分项的待办（阶段 4 候选）

### 8.1 ExamPredictionPanel 1035 行（高优先级阶段 4 拆分对象）

**29 个 useState + 14 个 handler + 3 个模式 + 教学子流程**——典型的状态机臃肿。建议阶段 4 拆为：
- [features/exam/ExamPredictionPanel.tsx](features/exam/ExamPredictionPanel.tsx)（壳 + panelMode 路由，~150 行）
- `ChooseMode.tsx`（选择界面）
- `ProbeMode.tsx`（摸底）
- `ReviewMode.tsx`（复习模式）
- `Teaching.tsx`（教学 + 追问对话）
- `useLSAPState.ts`（BKT 状态管理 hook）

### 8.2 ExamWorkspacePage 1492 行 + ExamWorkspaceMaterialPreview 996 行

阶段 4 候选——ExamWorkspacePage 是整个 P2 阶段最大的文件。

### 8.3 [WorkspaceEvidenceReportModal](features/exam/workspace/WorkspaceEvidenceReportModal.tsx) 含 ConflictPageHint 子组件

按 Q4 决策保留现状。它是个 18 行的小提示条（用于备考工作台 KC 探测后"答案可能与讲义页码对不上"的橙色/玫红提示）——被 [WorkspaceKcProbeModal](features/exam/workspace/WorkspaceKcProbeModal.tsx) 跨文件 import。阶段 4 若做组件审视时，可考虑：
- (a) 抽到 `features/exam/workspace/ConflictPageHint.tsx` 独立文件
- (b) 维持现状

本批 (b)。

### 8.4 [WorkspaceKcProbeModal](features/exam/workspace/WorkspaceKcProbeModal.tsx) 死 export bloomLevelForWorkspaceProbe

仅文件内自用，无外部引用——属于"死 export"。阶段 4 清理时一并去掉 export 关键字即可（无需移动文件）。

### 8.5 `data/` 目录待重组

本批发现 `@/data/` 目录依赖（前所未见）：
- [features/exam/hub/ExamDailyMaintenancePanel.tsx:22](features/exam/hub/ExamDailyMaintenancePanel.tsx) → `@/data/maintenanceFeedbackCopy`
- [features/exam/hub/StudyFlowPanel.tsx:13](features/exam/hub/StudyFlowPanel.tsx) → `@/data/studyFlowTemplates`

两个文件都是 exam 独占数据。**本批不动**。阶段 4 重组时建议跟搬到 `features/exam/data/` 或合并到 lib/data/。

### 8.6 utils/ 中 8 个 exam 前缀工具 + 4 个跨域 utils

按已确定方案：**所有 utils/ 文件本批不动，留待 P2 阶段 4 统一搬到 lib/**。

- 12 个 exam 独占 utils（examWorkspaceCitations / examChunkRetrieval / examChunkIndex / examWorkspaceOrchestrator / examMaintenanceEligibility / maintenanceStrategy / examSchedule / studyFlowInference / bkt / lsapScore / glossaryTermFilter / pdfQuoteHighlight）：阶段 4 决定就近搬到 `features/exam/lib/` 或统一 `lib/`
- 4 个跨域 utils（examWorkspaceLsapKey / extractBoldTermsFromMarkdown / scaffoldingClassifier / pdfUtils）：阶段 4 归 `lib/` 

### 8.7 services/examChunkIndexStorage.ts

exam-private service（仅 ExamWorkspacePage + ExamWorkspaceSocraticChat 用）。本批不动。阶段 P3 服务重组时考虑就近迁到 `features/exam/services/`。

---

## 9. P2 阶段 3 进度更新

至此 components/ 只剩：

| 类别 | 数量 | 文件 |
|------|------|------|
| galgame 系列 | 2 | GalgameOverlay, GalgameSettings |
| **合计** | **2** | — |

**下一步**：
1. **galgame 2 文件归档/迁移**（mini commit）—— 此后 components/ 目录清空，**P2 阶段 3 正式收官**
2. **P2 阶段 4**：utils → lib/ 重组（28 文件）
3. **REFACTOR_PLAN.md 阶段 4**：拆 App.tsx (2856) + SkimPanel (1309) + ExamWorkspacePage (1492) + ExamPredictionPanel (1035) + ExamWorkspaceMaterialPreview (996) 等巨型组件

阶段 3 进度：
- ✅ shared/（8 文件）
- ✅ LoadingInteractiveContent → reader/deep-read/（mini）
- ✅ features/review/（12 文件）
- ✅ **features/exam/（17 文件）+ 修复 review 归类（2 文件）= 本批 19 文件，体量最大、依赖最复杂**
- ⏳ galgame 收尾（最后一击）

---

## 10. 用户测试清单（定向 2-5 分钟）

请跑 `npm run dev`，然后核对这 6 项：

- [ ] **考试中心入口（Hub）**：从 Header / Sidebar 入口打开"考试中心" → ExamHubModal 弹层 → 应能切换"考试管理（ExamCenterPanel）" / "每日维护（ExamDailyMaintenancePanel）" / "学习流（StudyFlowPanel）" 3 个标签 → 各自加载正常
- [ ] **添加/链接考试材料**：在 ExamCenterPanel 内 → 点"链接材料"→ ExamLinkModal 弹层 → 选择历史 PDF → 关联到某场考试 → 列表更新正常
- [ ] **每日维护流程**：在 ExamDailyMaintenancePanel 中触发"维护卡片"→ MaintenanceFlashcardDeck 翻卡 → 完成后看到 MaintenanceFeedbackCelebration 庆祝动画
- [ ] **备考工作台核心交互（Workspace）**：从入口进入 ExamWorkspacePage → 左侧 KcGlossarySidebar 显示考点 → 苏格拉底对话（ExamWorkspaceSocraticChat）能发问 / 收到 AI 回复（含 markdown / 引用块）→ 点引用块能跳到 ExamWorkspaceMaterialPreview 预览相应 PDF 页 → KC 探测（WorkspaceKcProbeModal）答完看到结果，含 ConflictPageHint 提示（如有页码冲突）→ WorkspaceEvidenceReportModal 能显示证据报告
- [ ] **考前预测（独立面板）**：从九宫格"考前预测"按钮 → ExamPredictionPanel 弹层 → 选择/摸底/复习 3 模式切换正常 → 出题答题 / BKT 评分 / 针对性教学子流程都能跑通
- [ ] **考前速览 + 考点与陷阱（review/tools 归位后核验）**：从九宫格"复习模式"→ "考前冲刺"小节 → 点"考前速览"（绿） → ExamSummaryPanel 弹层正常生成 markdown；点"考点与陷阱"（玫红） → ExamTrapsPanel 弹层正常生成清单。**这是验证归类修正后两个文件路径仍能解析的关键**

整体无白屏、无 console "Cannot find module" / "X is not exported" 类红字。"ERR_CONNECTION_REFUSED / 404 / CORS" 类是接口问题，忽略。

---

## 11. 建议的 git commit message

```
refactor(p2): 把 17 exam 组件搬到 features/exam/ + 修复 2 review 归类错误

- features/exam/             ExamHubModal, ExamPredictionPanel
- features/exam/hub/         ExamCenterPanel, ExamLinkModal,
                             ExamDailyMaintenancePanel, MaintenanceFlashcardDeck,
                             MaintenanceFeedbackCelebration, StudyFlowPanel
- features/exam/workspace/   ExamWorkspacePage, ExamWorkspaceSocraticChat,
                             ExamWorkspaceAssistantMarkdown, ExamWorkspaceCitationBlock,
                             ExamWorkspaceMaterialPreview, KcGlossarySidebar,
                             KnowledgePointInspectPanel, WorkspaceKcProbeModal,
                             WorkspaceEvidenceReportModal
- 归类修正：ExamSummaryPanel + ExamTrapsPanel 是九宫格复习工具
  （ReviewType 枚举包含 'examSummary' / 'examTraps'），应归
  features/review/tools/，非 features/exam/。早期文档因前缀"Exam"误归
- App.tsx 5 行 import 改 @/features/exam/* 和 @/features/review/tools/*
- exam 集群内部 16 条依赖（hub 6 + workspace 10）全部更新
- 9 个活文档（CONTEXT/REFACTOR_P2_PLAN/P2_DEPENDENCY_SCAN/P2_ENTRY_POINTS/
  P2_COMPONENT_GLOSSARY + 4 个 docs/）旧路径同步更新
- CONTEXT.md "产品事实修正" 新增第 10 条：归类修正归档
- ConflictPageHint 子组件保留现状（继续住 WorkspaceEvidenceReportModal）
- utils/services/data 本批不动，留待阶段 4 重组
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 3 第 3 批完工——exam/ 区域 17 文件归位 + review 归类修正 2 文件。
components/ 只剩 galgame(2) = 2 文件，下一步 galgame 收尾即正式收官。
```

---

*报告完。等用户验证通过后手动 commit。
本批共 19 个 git mv + 21 处代码 import 改动 + 9 处活文档路径同步 + 1 条产品事实修正归档，无任何业务逻辑改动。
是 P2 阶段最大、依赖图最复杂的一批：19 文件、8025 行（不含修复 review 归位部分）、16 条内部依赖、3 个簇、5 个 App.tsx 入口。
但 exam 集群与外界 0 耦合（features/ / shared/ / 其他 components/ 都不引），是搬迁理想状态。
P2 阶段 3 离正式收官只差 galgame 最后一击。*
