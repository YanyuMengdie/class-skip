# P2 第 12 次搬迁报告：utils → lib/ 第 1 批（12 文件 + 1 改名）

> P2 阶段 4 · Batch 1/2 · **utils 重组小试牛刀**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

### 1.1 A 组：reader/app/service/shared 独占（4 文件）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/textUtils.ts`（121 行） | [`features/reader/lib/textUtils.ts`](features/reader/lib/textUtils.ts) |
| `git mv` | `utils/artifactSourceLabel.ts`（40 行） | [`shared/lib/artifactSourceLabel.ts`](shared/lib/artifactSourceLabel.ts) |
| `git mv` | `utils/savedArtifactMeta.tsx`（39 行） | [`shared/lib/savedArtifactMeta.tsx`](shared/lib/savedArtifactMeta.tsx) |
| `git mv` + **rename** | `utils/prompts.ts`（160 行） | [`lib/prompts/systemPrompts.ts`](lib/prompts/systemPrompts.ts) |

### 1.2 B 组：review 独占 - artifact 簇（3 文件）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/collectSavedArtifactsFromCloud.ts`（64 行） | [`features/review/lib/artifacts/collectSavedArtifactsFromCloud.ts`](features/review/lib/artifacts/collectSavedArtifactsFromCloud.ts) |
| `git mv` | `utils/collectSavedArtifactsFromLocalHistory.ts`（33 行） | [`features/review/lib/artifacts/collectSavedArtifactsFromLocalHistory.ts`](features/review/lib/artifacts/collectSavedArtifactsFromLocalHistory.ts) |
| `git mv` | `utils/mergeArtifactLibraries.ts`（66 行） | [`features/review/lib/artifacts/mergeArtifactLibraries.ts`](features/review/lib/artifacts/mergeArtifactLibraries.ts) |

### 1.3 C 组：review 独占 - mindMap 簇（5 文件）

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `utils/mindMapElkLayout.ts`（97 行） | [`features/review/lib/mindMap/mindMapElkLayout.ts`](features/review/lib/mindMap/mindMapElkLayout.ts) |
| `git mv` | `utils/mindMapFlowAdapter.ts`（112 行） | [`features/review/lib/mindMap/mindMapFlowAdapter.ts`](features/review/lib/mindMap/mindMapFlowAdapter.ts) |
| `git mv` | `utils/mindMapLabel.ts`（6 行） | [`features/review/lib/mindMap/mindMapLabel.ts`](features/review/lib/mindMap/mindMapLabel.ts) |
| `git mv` | `utils/mindMapLayout.ts`（223 行） | [`features/review/lib/mindMap/mindMapLayout.ts`](features/review/lib/mindMap/mindMapLayout.ts) |
| `git mv` | `utils/mindMapScope.ts`（6 行） | [`features/review/lib/mindMap/mindMapScope.ts`](features/review/lib/mindMap/mindMapScope.ts) |

新建目录：`features/reader/lib/`、`shared/lib/`、`lib/prompts/`、`features/review/lib/`、`features/review/lib/artifacts/`、`features/review/lib/mindMap/`。

合计 **12 个 git mv**（含 1 个 rename：`prompts.ts` → `systemPrompts.ts`）。git status 12 条全部识别为 R/RM。

---

## 2. 修改的引用

### 2.1 utils 内部依赖更新（3 处）

mindMap 簇 + artifact 簇内部依赖按扫描报告 §4 的依赖图全部更新到新子目录路径：

| 文件 | 改动 |
|------|------|
| [features/review/lib/mindMap/mindMapFlowAdapter.ts](features/review/lib/mindMap/mindMapFlowAdapter.ts) | 2 行：`@/utils/mindMapLayout` + `@/utils/mindMapScope` → `@/features/review/lib/mindMap/...` |
| [features/review/lib/mindMap/mindMapElkLayout.ts](features/review/lib/mindMap/mindMapElkLayout.ts) | 1 行：`@/utils/mindMapFlowAdapter` → `@/features/review/lib/mindMap/mindMapFlowAdapter` |
| [features/review/lib/artifacts/mergeArtifactLibraries.ts](features/review/lib/artifacts/mergeArtifactLibraries.ts) | 2 行：2 个 `@/utils/collectSavedArtifactsFrom...` → `@/features/review/lib/artifacts/...` |

### 2.2 外部引用方更新（10 处文件 / 14 行 import）

| 文件 | 行 | 改动 |
|------|----|------|
| [features/reader/notebook/Notebook.tsx](features/reader/notebook/Notebook.tsx) | 4 | `@/utils/textUtils` → `@/features/reader/lib/textUtils` |
| [features/reader/slide-viewer/SlideViewer.tsx](features/reader/slide-viewer/SlideViewer.tsx) | 4 | `@/utils/textUtils` → `@/features/reader/lib/textUtils` |
| [features/reader/deep-read/ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx) | 9 | `@/utils/textUtils` → `@/features/reader/lib/textUtils` |
| [App.tsx](App.tsx) | 42 | `@/utils/artifactSourceLabel` → `@/shared/lib/artifactSourceLabel` |
| [shared/studio/StudioPanel.tsx](shared/studio/StudioPanel.tsx) | 4 | `@/utils/savedArtifactMeta` → `@/shared/lib/savedArtifactMeta` |
| [shared/studio/SavedArtifactPreview.tsx](shared/studio/SavedArtifactPreview.tsx) | 8 | `@/utils/savedArtifactMeta` → `@/shared/lib/savedArtifactMeta` |
| [features/review/ReviewPage.tsx](features/review/ReviewPage.tsx) | 7-10 | 4 行：`@/utils/{collectSavedArtifactsFromLocalHistory, collectSavedArtifactsFromCloud, mergeArtifactLibraries}` → `@/features/review/lib/artifacts/...`；`@/utils/savedArtifactMeta` → `@/shared/lib/savedArtifactMeta` |
| [services/geminiService.ts](services/geminiService.ts) | 7 | `@/utils/prompts` → `@/lib/prompts/systemPrompts`（**含改名**） |
| [features/review/tools/mindMap/MindMapFlowCanvas.tsx](features/review/tools/mindMap/MindMapFlowCanvas.tsx) | 17-18 | 2 行：`@/utils/mindMapFlowAdapter` + `@/utils/mindMapElkLayout` → `@/features/review/lib/mindMap/...` |
| [features/review/tools/mindMap/MindMapPanel.tsx](features/review/tools/mindMap/MindMapPanel.tsx) | 6 | `@/utils/mindMapFlowAdapter` → `@/features/review/lib/mindMap/mindMapFlowAdapter` |
| [features/review/tools/mindMap/MindMapFlowNode.tsx](features/review/tools/mindMap/MindMapFlowNode.tsx) | 5-7 | 3 行：`@/utils/mindMapFlowAdapter` × 2 + `@/utils/mindMapLabel` → `@/features/review/lib/mindMap/...` |

合计**外部 14 行 + 内部 3 处 = 17 行改动**，覆盖扫描报告 §2 全部引用方，无遗漏。

### 2.3 改名特殊处理：prompts.ts → systemPrompts.ts

- 文件名通过 `git mv utils/prompts.ts lib/prompts/systemPrompts.ts` 完成改名（git 识别为 R）
- 文件**内部 export 名保持不动**：`CLASSIFIER_PROMPT` / `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`（按 Q6 决策）
- 唯一调用方 [services/geminiService.ts:7](services/geminiService.ts) 同步更新：路径 + named imports 不变，仅改 specifier
- 检查文件内部无 self-reference（不引用 `@/utils/prompts`）✅

### 2.4 活文档路径更新

| 文件 | 改动 |
|------|------|
| [CONTEXT.md](CONTEXT.md) | shared/ 树新增 lib/、新增顶层 lib/、features/reader/ 新增 lib/、features/review/ 新增 lib/{artifacts,mindMap}/；文件计数 shared 8→10 / features 46→55；utils 28→16 + 已搬清单；阶段 4 进度 ✅ 第 1 批；当前下一步重写；最后更新日期同步；待 commit 行加入；引用文档表新增 UTILS_PRE_MIGRATION_SCAN + UTILS_BATCH1_MIGRATION |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 12 处旧路径替换 |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 多处旧路径替换 |
| [docs/SKIM_VS_EXAM_TUTOR_API.md](docs/SKIM_VS_EXAM_TUTOR_API.md) | 旧路径替换 |
| [docs/MINDMAP_STEP5.md](docs/MINDMAP_STEP5.md) | 旧路径替换 |
| [docs/P2_EXAM_WORKSPACE.md](docs/P2_EXAM_WORKSPACE.md) | 旧路径替换 |
| [_archived/README.md](_archived/README.md) | 旧路径替换 |
| [CHANGELOG.md](CHANGELOG.md) | 旧路径替换 |
| [README.md](README.md) | 旧路径替换 |

### 2.5 刻意未改（快照型/历史报告）

| 文件 | 原因 |
|------|------|
| [UTILS_PRE_MIGRATION_SCAN.md](UTILS_PRE_MIGRATION_SCAN.md) | 本批的预扫描 |
| 所有 `*_MIGRATION.md`（TURTLESOUP / READER_BATCH3_NOTEBOOK / REVIEW_BATCH1 / EXAM_BATCH1 等） | 历次完工报告，时态保留 |
| 所有 `*_PRE_MIGRATION_SCAN.md` | 历次预扫描快照 |
| [REFACTOR_AUDIT.md](REFACTOR_AUDIT.md) / [DEAD_CODE_CONFIRMED.md](DEAD_CODE_CONFIRMED.md) / [ALIAS_MIGRATION_REPORT.md](ALIAS_MIGRATION_REPORT.md) | 各阶段历史快照 |
| `scripts/migrate-to-alias.last-run.json` | 脚本运行快照 |

---

## 3. 改名说明（prompts → systemPrompts）

按扫描报告 §9 Q6 决策，本批一并改名 `utils/prompts.ts` → `lib/prompts/systemPrompts.ts`。

**理由**：
- 原名 `prompts.ts` 过于宽泛——文件实际只放 3 个 system prompt（CLASSIFIER + STEM + HUMANITIES）
- 反正 import path 必须改（搬目录），顺手改名节省后续单独的 rename commit
- 改名后文件名直接告诉读者用途："系统级 prompt 模板"
- 唯一调用方是 `services/geminiService.ts`，同步改 1 处即可

**未改的部分**：
- 3 个 named export 名称保持不动（`CLASSIFIER_PROMPT` / `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`）
- geminiService.ts 内部使用方式不变

git 已正确识别为 rename（同一 R 操作中含路径 + 文件名变化）。

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
$ grep "@/utils/(textUtils|artifactSourceLabel|savedArtifactMeta|prompts|collectSavedArtifactsFromCloud|collectSavedArtifactsFromLocalHistory|mergeArtifactLibraries|mindMapElkLayout|mindMapFlowAdapter|mindMapLabel|mindMapLayout|mindMapScope)" \
       --include="*.{ts,tsx,js,jsx,mjs,json}"
# 0 matches
```

代码层（.ts/.tsx）中已完全无 12 个旧路径残留。.md 中残留全部位于刻意保留的快照报告（§2.5）。

---

## 6. 是否有意外发现

**无**。完全按扫描预测执行：
- ✅ 内部依赖 3 条（mindMap 2 条 + artifact 1 条）正确更新
- ✅ 外部 import 14 行覆盖全部引用方
- ✅ 12 个 git mv 全部识别为 R（含 1 个 rename）
- ✅ tsc 通过基线
- ✅ 0 跨域反向引用
- ✅ services → lib/prompts 路径替代旧 services → utils（架构方向健康）

---

## 7. 未触碰内容（留待第 2 批）

按 Q3 决策本批先搬"轻量批"。utils/ 余 16 文件留待第 2 批：

### 7.1 exam 独占（11 文件）

| 文件 | 行数 | 第 2 批目标 |
|------|------|----------|
| bkt | 50 | features/exam/lib/ |
| examChunkIndex | 126 | features/exam/lib/ |
| examChunkRetrieval | 195 | features/exam/lib/ |
| examMaintenanceEligibility | 26 | features/exam/lib/ |
| examSchedule | 228 | features/exam/lib/ |
| examWorkspaceCitations | 176 | features/exam/lib/ |
| examWorkspaceOrchestrator | 89 | features/exam/lib/ |
| glossaryTermFilter | 205 | features/exam/lib/ |
| maintenanceStrategy | 160 | features/exam/lib/ |
| pdfQuoteHighlight | 91 | features/exam/lib/ |
| studyFlowInference | 100 | features/exam/lib/ |

### 7.2 跨域 / 半独占（5 文件，含决策点）

| 文件 | 行数 | 第 2 批目标 | 备注 |
|------|------|----------|------|
| lsapScore | 18 | features/exam/lib/ | exam 主用 + App.tsx 1 处 |
| examWorkspaceLsapKey | 115 | features/exam/lib/ | exam 主用 + App.tsx 1 处 |
| scaffoldingClassifier | 91 | **lib/exam/**（独立目录） | services + exam 跨用，避免反向引用 |
| extractBoldTermsFromMarkdown | 46 | **lib/text/** | App + exam 跨用，纯字符串工具 |
| pdfUtils | 142 | **lib/pdf/** | App + exam 跨用 + utils 内部，真正基础工具 |

### 7.3 第 2 批批量预估

- 16 个 git mv
- 约 18-22 行 import 改动（exam workspace 9 文件 + ExamPredictionPanel + App.tsx 5 处 + services/geminiService 1 处 + utils 内部 1 处）
- 新建目录：features/exam/lib/、lib/exam/、lib/text/、lib/pdf/

---

## 8. P2 阶段 4 进度更新

```
utils/ 28 → 16 文件
本批搬：       12 文件 + 1 改名
新建目录：     6 个（reader/lib + shared/lib + lib/prompts + review/lib + review/lib/artifacts + review/lib/mindMap）
import 改动：  17 行（外部 14 + 内部 3）
tsc：          10 错误，与基线一致

阶段 4 进度：
✅ 第 1 批（本批）：reader+app+service+shared+review 域独占
⏳ 第 2 批：exam 集群 11 + 半独占 2 + 真跨域 3
```

---

## 9. 用户测试清单（定向 2-5 分钟）

请跑 `npm run dev`，然后核对这 5 项：

- [ ] **精读功能（textUtils 影响）**：上传 PDF → 切到精读模式 → 选中页面文字加入笔记 → Notebook 里能看到笔记，含正确的上/下标转换（验证 plainTextToHtmlWithSupSub / normalizeSelectionText 仍工作）
- [ ] **学习产物库（artifact 簇影响）**：从入口打开 ReviewPage → 应能列出本地+云端合并去重的产物列表 → 点开任意产物能预览（验证 collectSavedArtifactsFromLocalHistory + collectSavedArtifactsFromCloud + mergeArtifactLibraries 链路）
- [ ] **思维导图（mindMap 簇影响）**：从九宫格打开 MindMap → AI 生成思维导图 → ReactFlow 画布渲染节点和连线 → 节点 label 显示正常（验证 mindMapFlowAdapter + Layout + Scope + ElkLayout + Label 全部工作）
- [ ] **AI 服务（systemPrompts 改名影响）**：触发任意 AI 功能（如生成考前速览 / 提问任意 panel）→ AI 能正常响应 → 文档分类器（CLASSIFIER_PROMPT）能选择正确的 STEM 或 HUMANITIES 系统 prompt（验证 lib/prompts/systemPrompts 路径解析 + 3 个 named export 仍正常）
- [ ] **共享层（savedArtifactMeta + artifactSourceLabel 影响）**：生成任意产物（如学习指南）保存到产物库 → StudioPanel 右栏出现卡片显示正确图标（来自 SAVED_ARTIFACT_TYPE_META）→ 卡片"来源"标签显示正确（来自 buildArtifactSourceLabel）

整体无白屏、无 console "Cannot find module" / "X is not exported" 类红字。

---

## 10. 建议的 git commit message

```
refactor(p2): utils → lib/ 第 1 批（12 文件 + prompts→systemPrompts 改名）

- features/reader/lib/        textUtils（reader 三组件 import 更新）
- shared/lib/                 artifactSourceLabel + savedArtifactMeta
- lib/prompts/                systemPrompts.ts（改名自 utils/prompts.ts）
- features/review/lib/artifacts/  collect{Cloud,LocalHistory} + mergeArtifactLibraries
- features/review/lib/mindMap/    elkLayout + flowAdapter + label + layout + scope

- App.tsx 1 行 + ReviewPage 4 行 + shared/studio 2 行 + reader 3 文件 3 行
  + services/geminiService 1 行 + mindMap 3 文件 6 行 = 17 行 import 改动
- utils 内部 3 处依赖（mindMap 簇 2 + artifact 簇 1）已改新路径
- prompts.ts 改名 systemPrompts.ts：3 个 named export 保持不动
- 9 个活文档（CONTEXT/REFACTOR_P2_PLAN/P2_DEPENDENCY_SCAN/4 个 docs/
  + CHANGELOG + README + _archived/README）旧路径同步更新
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 4 第 1 批完工——utils 28 → 16，下一批处理 exam 集群 + 真跨域。
```

---

*报告完。等用户验证通过后手动 commit。
本批 12 个 git mv（含 1 改名）+ 17 处代码 import 改动 + 9 处活文档同步，无任何业务逻辑改动。
是 P2 阶段 4 的入口批次，风险因子全 🟢（0 高辐射、0 反向异味、0 循环依赖），实际执行非常顺畅。
下一批将是 P2 阶段 4 最后一击：exam 集群 11 + 半独占 2 + 真跨域 3 = 16 文件。*
