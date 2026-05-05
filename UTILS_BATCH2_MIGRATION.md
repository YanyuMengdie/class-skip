# P2 第 13 次搬迁报告：utils → lib/ 第 2 批（16 文件，阶段 4 收官）

> P2 阶段 4 · Batch 2/2 · **utils/ 目录清空 + 阶段 4 整体收官**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

### 1.1 A 组：exam 独占（11 文件 → features/exam/lib/）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/bkt.ts`（50 行） | [`features/exam/lib/bkt.ts`](features/exam/lib/bkt.ts) |
| `git mv` | `utils/examChunkIndex.ts`（126 行） | [`features/exam/lib/examChunkIndex.ts`](features/exam/lib/examChunkIndex.ts) |
| `git mv` | `utils/examChunkRetrieval.ts`（195 行） | [`features/exam/lib/examChunkRetrieval.ts`](features/exam/lib/examChunkRetrieval.ts) |
| `git mv` | `utils/examMaintenanceEligibility.ts`（26 行） | [`features/exam/lib/examMaintenanceEligibility.ts`](features/exam/lib/examMaintenanceEligibility.ts) |
| `git mv` | `utils/examSchedule.ts`（228 行） | [`features/exam/lib/examSchedule.ts`](features/exam/lib/examSchedule.ts) |
| `git mv` | `utils/examWorkspaceCitations.ts`（176 行） | [`features/exam/lib/examWorkspaceCitations.ts`](features/exam/lib/examWorkspaceCitations.ts) |
| `git mv` | `utils/examWorkspaceOrchestrator.ts`（89 行） | [`features/exam/lib/examWorkspaceOrchestrator.ts`](features/exam/lib/examWorkspaceOrchestrator.ts) |
| `git mv` | `utils/glossaryTermFilter.ts`（205 行） | [`features/exam/lib/glossaryTermFilter.ts`](features/exam/lib/glossaryTermFilter.ts) |
| `git mv` | `utils/maintenanceStrategy.ts`（160 行） | [`features/exam/lib/maintenanceStrategy.ts`](features/exam/lib/maintenanceStrategy.ts) |
| `git mv` | `utils/pdfQuoteHighlight.ts`（91 行） | [`features/exam/lib/pdfQuoteHighlight.ts`](features/exam/lib/pdfQuoteHighlight.ts) |
| `git mv` | `utils/studyFlowInference.ts`（100 行） | [`features/exam/lib/studyFlowInference.ts`](features/exam/lib/studyFlowInference.ts) |

### 1.2 B 组：exam 主用半跨域（2 文件 → features/exam/lib/）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/lsapScore.ts`（18 行） | [`features/exam/lib/lsapScore.ts`](features/exam/lib/lsapScore.ts) |
| `git mv` | `utils/examWorkspaceLsapKey.ts`（115 行） | [`features/exam/lib/examWorkspaceLsapKey.ts`](features/exam/lib/examWorkspaceLsapKey.ts) |

### 1.3 C 组：跨 service+exam（1 文件 → lib/exam/）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/scaffoldingClassifier.ts`（91 行） | [`lib/exam/scaffoldingClassifier.ts`](lib/exam/scaffoldingClassifier.ts) |

### 1.4 D 组：真跨域基础（2 文件 → lib/）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/extractBoldTermsFromMarkdown.ts`（46 行） | [`lib/text/extractBoldTermsFromMarkdown.ts`](lib/text/extractBoldTermsFromMarkdown.ts) |
| `git mv` | `utils/pdfUtils.ts`（142 行） | [`lib/pdf/pdfUtils.ts`](lib/pdf/pdfUtils.ts) |

合计 **16 个 git mv**，新建目录：`features/exam/lib/`、`lib/exam/`、`lib/text/`、`lib/pdf/`。

🎉 **utils/ 目录已清空**（28 → 0）。

---

## 2. 修改的引用

### 2.1 utils 内部依赖更新（3 处）

按扫描报告 §4 - exam-schedule 簇 + pdf 内部链：

| 文件 | 改动 |
|------|------|
| [features/exam/lib/examMaintenanceEligibility.ts](features/exam/lib/examMaintenanceEligibility.ts) | `@/utils/examSchedule` → `@/features/exam/lib/examSchedule` |
| [features/exam/lib/maintenanceStrategy.ts](features/exam/lib/maintenanceStrategy.ts) | `@/utils/examSchedule` → `@/features/exam/lib/examSchedule` |
| [features/exam/lib/examChunkIndex.ts](features/exam/lib/examChunkIndex.ts) | `@/utils/pdfUtils` → `@/lib/pdf/pdfUtils`（**注意**：pdfUtils 不在 features/exam/lib/ 而在 lib/pdf/） |

### 2.2 外部引用方更新

#### 2.2.1 exam UI 组件（features/exam/* 内部，9 文件，22 行）

| 文件 | 改动数 | 内容 |
|------|------|------|
| [features/exam/ExamPredictionPanel.tsx](features/exam/ExamPredictionPanel.tsx) | 2 | bkt + lsapScore → @/features/exam/lib/ |
| [features/exam/workspace/WorkspaceKcProbeModal.tsx](features/exam/workspace/WorkspaceKcProbeModal.tsx) | 2 | bkt + lsapScore → @/features/exam/lib/ |
| [features/exam/workspace/ExamWorkspacePage.tsx](features/exam/workspace/ExamWorkspacePage.tsx) | 3 | examChunkIndex + examChunkRetrieval + examWorkspaceLsapKey → @/features/exam/lib/ |
| [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) | **7** | extractBoldTerms→**@/lib/text/**、glossaryTermFilter→@/features/exam/lib/、scaffoldingClassifier→**@/lib/exam/**、examWorkspaceOrchestrator+examWorkspaceLsapKey+examWorkspaceCitations+examChunkRetrieval→@/features/exam/lib/ |
| [features/exam/workspace/ExamWorkspaceCitationBlock.tsx](features/exam/workspace/ExamWorkspaceCitationBlock.tsx) | 1 | examWorkspaceCitations → @/features/exam/lib/ |
| [features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx](features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx) | 1 | examWorkspaceCitations → @/features/exam/lib/ |
| [features/exam/workspace/ExamWorkspaceMaterialPreview.tsx](features/exam/workspace/ExamWorkspaceMaterialPreview.tsx) | 2 | pdfUtils→**@/lib/pdf/**、pdfQuoteHighlight→@/features/exam/lib/ |
| [features/exam/workspace/WorkspaceEvidenceReportModal.tsx](features/exam/workspace/WorkspaceEvidenceReportModal.tsx) | 1 | examWorkspaceLsapKey → @/features/exam/lib/ |
| [features/exam/hub/ExamDailyMaintenancePanel.tsx](features/exam/hub/ExamDailyMaintenancePanel.tsx) | 3 | examMaintenanceEligibility + maintenanceStrategy + examSchedule → @/features/exam/lib/ |
| [features/exam/hub/StudyFlowPanel.tsx](features/exam/hub/StudyFlowPanel.tsx) | 1 | studyFlowInference → @/features/exam/lib/ |

#### 2.2.2 App.tsx（4 行）

| 行 | 改动 |
|----|------|
| [App.tsx:41](App.tsx) | `@/utils/pdfUtils` → `@/lib/pdf/pdfUtils` |
| [App.tsx:56](App.tsx) | `@/utils/examWorkspaceLsapKey` → `@/features/exam/lib/examWorkspaceLsapKey` |
| [App.tsx:57](App.tsx) | `@/utils/lsapScore` → `@/features/exam/lib/lsapScore` |
| [App.tsx:58](App.tsx) | `@/utils/extractBoldTermsFromMarkdown` → `@/lib/text/extractBoldTermsFromMarkdown` |

#### 2.2.3 services/ 引用（1 行）

| 文件 | 改动 |
|------|------|
| [services/geminiService.ts:6](services/geminiService.ts) | `@/utils/scaffoldingClassifier` → `@/lib/exam/scaffoldingClassifier` |

合计**外部 27 行 + 内部 3 处 = 30 行 import 改动**。覆盖扫描 §2 + UTILS_BATCH1 §7 全部引用方。

### 2.3 活文档路径更新

| 文件 | 改动 |
|------|------|
| [CONTEXT.md](CONTEXT.md) | features/exam/ 树新增 lib/ 13 文件；lib/ 顶层 4 子目录全列；features 文件计数 55→68；utils/ 清单 16→0 + 全 28 文件分布索引；阶段 4 全部 ✅；当前下一步重写为 P2 主体完工；最后更新日期同步；待 commit 行加入；引用文档表新增 UTILS_BATCH2_MIGRATION |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 16 处旧路径替换 |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 多处旧路径替换 |
| [docs/P3_EXAM_WORKSPACE.md](docs/P3_EXAM_WORKSPACE.md) | 旧路径替换 |
| [docs/EXAM_AND_STUDY_FLOW.md](docs/EXAM_AND_STUDY_FLOW.md) | 旧路径替换 |
| [docs/P4_SCAFFOLDING.md](docs/P4_SCAFFOLDING.md) | 旧路径替换 |
| [README.md](README.md) | 旧路径替换 |

### 2.4 刻意未改（快照型/历史报告）

| 文件 | 原因 |
|------|------|
| [UTILS_PRE_MIGRATION_SCAN.md](UTILS_PRE_MIGRATION_SCAN.md) / [UTILS_BATCH1_MIGRATION.md](UTILS_BATCH1_MIGRATION.md) | 阶段 4 第 1 批的扫描 + 完工报告 |
| [EXAM_PRE_MIGRATION_SCAN.md](EXAM_PRE_MIGRATION_SCAN.md) | 历次预扫描快照 |
| 所有 `*_MIGRATION.md` | 历次完工报告，时态保留 |
| [REFACTOR_AUDIT.md](REFACTOR_AUDIT.md) / [DEAD_CODE_CONFIRMED.md](DEAD_CODE_CONFIRMED.md) / [ALIAS_MIGRATION_REPORT.md](ALIAS_MIGRATION_REPORT.md) | 各阶段历史快照 |
| `scripts/migrate-to-alias.last-run.json` | 脚本运行快照 |

---

## 3. 本批决策记录（用户已拍板）

| 编号 | 决策 |
|------|------|
| Q1 | 归类风格 **C 混合**：exam 独占归 features/exam/lib/，跨域基础工具归 lib/<语义>/ |
| **Q2 关键** | **scaffoldingClassifier 归 lib/exam/ 独立目录**——避免 services/geminiService → features/exam/lib/ 反向引用。这是架构层面重要的"feature 自治 + 上下层分离"决策 |
| Q3 | 整体分 2 批，本批是收官 |
| Q4 | extractBoldTermsFromMarkdown **不拆分**（只搬路径），其内含 markdown 解析 + 术语 key 工具混合留待阶段 5 |
| Q5 | 不合并任何小文件 |
| Q6 | 第 1 批已完成（prompts → systemPrompts） |
| Q7 | **pdfQuoteHighlight 归 features/exam/lib/**（exam 独占），不和 pdfUtils 同居 lib/pdf/。理由：pdfQuoteHighlight 仅 ExamWorkspaceMaterialPreview 一家用，是 exam 私有；pdfUtils 是真跨域 |

### 关于 scaffoldingClassifier 归 lib/exam/ 的反向引用规避

**问题**：scaffoldingClassifier 同时被 [services/geminiService.ts](services/geminiService.ts) 和 [features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx) 调用。

**如果归 features/exam/lib/scaffoldingClassifier.ts**：
- ❌ services/ 会 import features/——违反"上层(feature) 调用下层(service)"的方向
- ❌ 删 exam feature 时 services/ 会编译失败

**归 lib/exam/scaffoldingClassifier.ts**：
- ✅ services/ 和 features/exam/ 都向"下"调用 lib/——架构方向正确
- ✅ lib/exam/ 是"exam 域的纯算法层",和 features/exam/ (UI) 解耦
- ✅ 未来 services 还想用 exam 算法时,直接放 lib/exam/ 即可

`lib/exam/` 与 `features/exam/lib/` 看似重复,实则**层级不同**:
- `features/exam/lib/`: exam **私有** utils,只服务 exam UI 组件
- `lib/exam/`: exam **共享** 算法,可被 services 等下游模块调用

---

## 4. TypeScript 检查结果

```bash
$ npx tsc --noEmit
... 10 errors, exit 2
```

| 指标 | 值 |
|------|------|
| 错误总数 | **10** |
| 与基线比对 | **0 新增 / 0 减少** |
| `Cannot find module` 错误 | **0** ✅ |

10 个错误均历史遗留（同前几批），与本次搬迁无关。

---

## 5. 残留扫描

```bash
$ grep "@/utils/" --include="*.{ts,tsx,js,jsx,mjs,json}"
# 0 matches
```

代码层中**完全无任何 `@/utils/` 残留**——utils/ 别名彻底退役。

```bash
$ ls utils/
# (empty)
```

utils/ 目录已物理清空。

---

## 6. 是否有意外发现

**无**。完全按扫描预测执行：
- ✅ 内部依赖 3 条（exam-schedule 簇 2 + pdf 链 1）正确更新
- ✅ 外部 import 27 行（exam UI 22 + App.tsx 4 + services 1）覆盖全部引用方
- ✅ 16 个 git mv 全部识别为 R/RM
- ✅ tsc 通过基线
- ✅ Q2 关键决策（scaffoldingClassifier 归 lib/exam/）的反向引用规避正确生效——
  services/geminiService 现在从 lib/exam/ 取 heuristicQuality,无 service→feature 反向

---

## 7. P2 阶段 4 收官公告

至此 **utils/ 目录已清空（28 → 0）**。

P2 阶段 4 全部完成。

剩余待办：
- **galgame 2 文件**（推迟到 REFACTOR_PLAN.md 阶段 4 拆 App.tsx 时一并处理；详见
  [CONTEXT.md "产品事实修正"](CONTEXT.md) 第 11 条）

### P2 主体完工总结

P2 阶段 3（components/ 重组）+ 阶段 4（utils/ 重组）合并战果：

| 起点 | 终点 |
|------|------|
| `components/` 51 文件散落（含 review/exam/galgame 等混杂） | `features/<domain>/` 9 feature 子目录 + `shared/` 5 子目录 |
| `utils/` 28 文件平铺（含 exam 算法 + reader 文本 + review 数据合并 + mindMap + 共享元信息混杂） | `features/<domain>/lib/` 域私有 + `shared/lib/` 共享元信息 + `lib/<语义>/` 4 真跨域语义子目录 |
| `components/` 51 + `utils/` 28 = **79 个目录散落文件** | 全部归位 ✅，仅剩 galgame 2 文件待 future 处理 |

整个 P2 重构旅程：
- ✅ 阶段 0：路径别名（80 文件 232 处自动改写）
- ✅ 阶段 3：13 批搬迁（components/ 7 reader + 8 shared + LoadingInteractiveContent mini + 12 review + 19 exam）
- ✅ 阶段 4：2 批搬迁（utils/ 12 文件 + 16 文件）
- ⏳ 阶段 5：拆巨型组件 + 类型严格化 + 测试（不属于 P2，属 future REFACTOR_PLAN）

---

## 8. 用户测试清单（定向 5-7 项核心，本批是 P2 最后一批，需全面覆盖）

请跑 `npm run dev`，然后核对这 7 项：

- [ ] **备考工作台主链路（影响最大）**：进入 ExamWorkspacePage → 选定考试 + 关联 PDF → 苏格拉底对话能发问 → 收到 AI 回复（验证 examWorkspaceCitations + extractBoldTermsFromMarkdown + glossaryTermFilter + scaffoldingClassifier + examWorkspaceOrchestrator 链路）→ 引用块解析正确（点击能跳转到 PDF 页）
- [ ] **考前预测 BKT 算法**：开 ExamPredictionPanel → 摸底模式答题 → BKT 评分能更新（验证 bkt + lsapScore 跨多文件协同）→ 切到复习模式选学某 KC → 教学子流程正常
- [ ] **KC 探测**：在备考工作台里点 KC 探测按钮 → WorkspaceKcProbeModal 弹层 → 答题 → 看到分数与 ConflictPageHint 提示（验证 lsapScore + bkt + ConflictPageHint 跨文件链）
- [ ] **每日维护流程（exam-schedule 簇）**：开 ExamDailyMaintenancePanel → 维护策略生成 → 翻 MaintenanceFlashcardDeck 卡片 → 完成后看 MaintenanceFeedbackCelebration（验证 examMaintenanceEligibility + maintenanceStrategy + examSchedule 三 utils 内部链 + UI 链路）
- [ ] **AI 服务（scaffoldingClassifier 跨 service+exam 影响）**：触发任意 AI 评判（如苏格拉底回答） → AI 能正常分档为 weak/partial/strong → 备考台 phase 推进正常（验证 lib/exam/scaffoldingClassifier 同时被 services 和 exam 引用都能解析）
- [ ] **PDF 加载（pdfUtils 真跨域影响）**：上传 PDF → App.tsx 读取（generateFileHash + extractPdfText）→ 备考材料预览 ExamWorkspaceMaterialPreview 中 PDF 渲染正常（loadPdfDocumentFromFile + renderPdfPageToCanvas）→ 引用 quote 高亮正确（pdfQuoteHighlight）
- [ ] **整体无白屏 / 无 console 红字**：打开 console 跑一遍主功能；不应看到任何 "Cannot find module" / "X is not exported" / "Cannot read property" 类红字。"ERR_CONNECTION_REFUSED / 404 / CORS" 类是接口问题，忽略

如以上都通过，本批 commit 后即 P2 阶段 4 + 整个 P2 主体收官 🎉

---

## 9. 建议的 git commit message

```
refactor(p2): utils → lib/ 第 2 批（16 文件，utils/ 清空，阶段 4 收官）

- features/exam/lib/  bkt, examChunkIndex, examChunkRetrieval,
                      examMaintenanceEligibility, examSchedule,
                      examWorkspaceCitations, examWorkspaceLsapKey,
                      examWorkspaceOrchestrator, glossaryTermFilter,
                      lsapScore, maintenanceStrategy, pdfQuoteHighlight,
                      studyFlowInference (13 文件)
- lib/exam/           scaffoldingClassifier（services + exam 跨用，避免反向引用）
- lib/text/           extractBoldTermsFromMarkdown（App + exam 真跨域纯字符串）
- lib/pdf/            pdfUtils（App + exam 真跨域基础工具）

- App.tsx 4 行 + services/geminiService 1 行 + exam UI 9 文件 22 行 = 27 行 import 改动
- utils 内部 3 处依赖（examMaintenanceEligibility/maintenanceStrategy → examSchedule
  + examChunkIndex → pdfUtils）已改新路径
- 7 个活文档（CONTEXT/REFACTOR_P2_PLAN/P2_DEPENDENCY_SCAN/3 个 docs/ + README）旧路径同步
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 4 收官——utils/ 28 → 0，全部归位 features/<domain>/lib/ + shared/lib/ + lib/<语义>/。
P2 主体（阶段 3 + 4）全部完工，原 components 51 + utils 28 = 79 个目录散落文件归位完成。
剩余 galgame 2 文件留待 REFACTOR_PLAN 阶段 4 一并处理。
```

---

*报告完。等用户验证通过后手动 commit。
本批 16 个 git mv + 30 处代码 import 改动（外部 27 + 内部 3）+ 7 处活文档同步，无任何业务逻辑改动。
是 P2 阶段 4 的收官批次，搬完 utils/ 目录正式清空 — 这也是整个 P2 主体重构的终点。*

🎉 **utils/ 28 → 0，P2 主体完工。**
