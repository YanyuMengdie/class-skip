# Exam 预搬迁扫描报告（只读、未动任何文件）

> P2 阶段 3 第 3 批的预调查。
> 范围：[CONTEXT.md](CONTEXT.md) "components/ 仍剩" 的 exam 系列 19 文件。
> 生成时间：2026-05-05 · refactor 分支当前状态
>
> ⚠️ **本批是 P2 阶段至今体量最大的——19 个文件、8025 行、内部依赖比 review 复杂得多**。

---

## 1. 每个文件的当前真实状态

✅ **19 个文件全部真实存在**（已 ls 实测）。

| 文件 | 行数 | 是否存在 |
|------|------|---------|
| [components/ExamCenterPanel.tsx](components/ExamCenterPanel.tsx) | 321 | ✓ |
| [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | 641 | ✓ |
| [components/ExamHubModal.tsx](components/ExamHubModal.tsx) | 130 | ✓ |
| [components/ExamLinkModal.tsx](components/ExamLinkModal.tsx) | 565 | ✓ |
| [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | **1035** | ✓ |
| [components/ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx) | 192 | ✓ |
| [components/ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) | 98 | ✓ |
| [components/ExamWorkspaceAssistantMarkdown.tsx](components/ExamWorkspaceAssistantMarkdown.tsx) | 261 | ✓ |
| [components/ExamWorkspaceCitationBlock.tsx](components/ExamWorkspaceCitationBlock.tsx) | 273 | ✓ |
| [components/ExamWorkspaceMaterialPreview.tsx](components/ExamWorkspaceMaterialPreview.tsx) | **996** | ✓ |
| [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | **1492** | ✓ |
| [components/ExamWorkspaceSocraticChat.tsx](components/ExamWorkspaceSocraticChat.tsx) | **780** | ✓ |
| [components/KcGlossarySidebar.tsx](components/KcGlossarySidebar.tsx) | 92 | ✓ |
| [components/KnowledgePointInspectPanel.tsx](components/KnowledgePointInspectPanel.tsx) | 95 | ✓ |
| [components/MaintenanceFeedbackCelebration.tsx](components/MaintenanceFeedbackCelebration.tsx) | 44 | ✓ |
| [components/MaintenanceFlashcardDeck.tsx](components/MaintenanceFlashcardDeck.tsx) | 67 | ✓ |
| [components/StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) | 260 | ✓ |
| [components/WorkspaceEvidenceReportModal.tsx](components/WorkspaceEvidenceReportModal.tsx) | 321 | ✓ |
| [components/WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx) | 362 | ✓ |
| **合计** | **8025 行** | — |

📌 **Top-3 巨型文件**：ExamWorkspacePage 1492 行、ExamPredictionPanel 1035 行、ExamWorkspaceMaterialPreview 996 行。这 3 个是 REFACTOR_PLAN.md 阶段 4"拆巨型组件"的潜在候选——本批仅搬路径不拆 UI。

### 1.1 各文件 import 头部清单（精简，仅项目内 import）

#### Hub 集群

**ExamHubModal.tsx**
```ts
import type { Exam, ExamMaterialLink, FilePersistedState, StudyFlowStep } from '@/types';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { ExamCenterPanel } from '@/components/ExamCenterPanel';                  // ← 内部
import { ExamDailyMaintenancePanel } from '@/components/ExamDailyMaintenancePanel'; // ← 内部
import { StudyFlowPanel } from '@/components/StudyFlowPanel';                    // ← 内部
```

**ExamCenterPanel.tsx**
```ts
import type { DisciplineBand, Exam, ExamMaterialLink } from '@/types';
import { createExam, deleteExam, removeExamMaterialLink, updateExam, addCalendarEvent } from '@/services/firebase';
import { ExamLinkModal } from '@/components/ExamLinkModal';   // ← 内部
```

**ExamLinkModal.tsx**
```ts
import type { CloudSession, Exam, ExamMaterialLink, FileHistoryItem } from '@/types';
import { ... } from '@/services/firebase';
import { storageService } from '@/services/storageService';
```

**ExamDailyMaintenancePanel.tsx**
```ts
import type { ... } from '@/types';
import { getDailyPlanCache, setDailyPlanCache } from '@/services/firebase';
import { generateMaintenanceFlashCards, generateQuizSet } from '@/services/geminiService';
import { evaluateMaintenanceEligibility } from '@/utils/examMaintenanceEligibility';
import { ... } from '@/utils/maintenanceStrategy';
import { MaintenanceFlashcardDeck } from '@/components/MaintenanceFlashcardDeck';        // ← 内部
import { MaintenanceFeedbackCelebration } from '@/components/MaintenanceFeedbackCelebration'; // ← 内部
import { buildFeedbackExitCopy, buildFeedbackStrongCopy } from '@/data/maintenanceFeedbackCopy'; // ← @/data/ 数据文件
import type { FilePlanMeta } from '@/utils/examSchedule';
```

**MaintenanceFlashcardDeck.tsx**
```ts
import type { MaintenanceFlashCard } from '@/types';
```
**最干净——0 项目内服务/utils 依赖**。

**MaintenanceFeedbackCelebration.tsx**
```ts
import React from 'react';
```
**完全 0 项目内 import**——只有 React 一个。

**StudyFlowPanel.tsx**
```ts
import type { ... } from '@/types';
import { buildExtendedScenarioKey, inferFamiliarity, inferUrgencyForFile } from '@/utils/studyFlowInference';
import { getTemplateForScenario } from '@/data/studyFlowTemplates';   // ← @/data/ 数据文件
```

#### Workspace 集群

**ExamWorkspacePage.tsx**
```ts
import type { ... } from '@/types';
import { listExams, listExamMaterialLinks } from '@/services/firebase';
import { ExamWorkspaceSocraticChat, type ExamWorkspaceSocraticChatHandle } from '@/components/ExamWorkspaceSocraticChat'; // ← 内部
import { KcGlossarySidebar } from '@/components/KcGlossarySidebar';                            // ← 内部
import { KnowledgePointInspectPanel } from '@/components/KnowledgePointInspectPanel';          // ← 内部
import { WorkspaceKcProbeModal } from '@/components/WorkspaceKcProbeModal';                    // ← 内部
import { WorkspaceEvidenceReportModal } from '@/components/WorkspaceEvidenceReportModal';      // ← 内部
import { ExamWorkspaceMaterialPreview } from '@/components/ExamWorkspaceMaterialPreview';      // ← 内部
import type { WorkspaceDialogueTurn } from '@/utils/examWorkspaceLsapKey';
import { buildExamMaterialChunkIndexForLinks, findChunkById } from '@/utils/examChunkIndex';
import { getExamChunkIndexStats, loadExamMaterialChunkIndex, saveExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import { DEFAULT_TOP_K, retrieveCandidateChunks } from '@/utils/examChunkRetrieval';
```

**ExamWorkspaceSocraticChat.tsx**
```ts
import type { ... } from '@/types';
import { ... } from '@/services/geminiService';
import { buildKcGlossaryEntryId, extractBoldTermsFromMarkdown, normalizeTermKey } from '@/utils/extractBoldTermsFromMarkdown';
import { filterGlossaryTermCandidates } from '@/utils/glossaryTermFilter';
import { computeScaffoldingPhase, heuristicQuality } from '@/utils/scaffoldingClassifier';
import { computeNextProbeState } from '@/utils/examWorkspaceOrchestrator';
import type { WorkspaceDialogueTurn } from '@/utils/examWorkspaceLsapKey';
import { ... } from '@/utils/examWorkspaceCitations';
import { DEFAULT_TOP_K, EXAM_CHUNK_QUERY_ASSISTANT_TAIL_CHARS, retrieveCandidateChunks } from '@/utils/examChunkRetrieval';
import { loadExamMaterialChunkIndex } from '@/services/examChunkIndexStorage';
import type { OpenMaterialPageOptions } from '@/components/ExamWorkspaceCitationBlock';        // ← 内部（仅类型）
import { ExamWorkspaceAssistantMarkdown } from '@/components/ExamWorkspaceAssistantMarkdown';  // ← 内部
```
**这是 review/exam 全场最 import 重的文件——14 个项目内 import。**

**ExamWorkspaceAssistantMarkdown.tsx**
```ts
import type { ExamMaterialLink } from '@/types';
import type { ExamWorkspaceCitation } from '@/utils/examWorkspaceCitations';
import { ExamWorkspaceCitationBlock, type OpenMaterialPageOptions } from '@/components/ExamWorkspaceCitationBlock'; // ← 内部
```

**ExamWorkspaceCitationBlock.tsx**
```ts
import type { ExamMaterialLink } from '@/types';
import type { ExamWorkspaceCitation } from '@/utils/examWorkspaceCitations';
```

**ExamWorkspaceMaterialPreview.tsx**
```ts
import type { ExamMaterialLink } from '@/types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfDocumentFromFile, renderPdfPageToCanvas } from '@/utils/pdfUtils';
import { computeQuoteHighlightRects } from '@/utils/pdfQuoteHighlight';
```

**KcGlossarySidebar.tsx**
```ts
import type { KcGlossaryEntry, LSAPKnowledgeComponent } from '@/types';
```

**KnowledgePointInspectPanel.tsx**
```ts
import type { LSAPKnowledgeComponent } from '@/types';
```

**WorkspaceKcProbeModal.tsx**
```ts
import type { LSAPContentMap, LSAPKnowledgeComponent, LSAPState, ProbeRecord } from '@/types';
import { ... } from '@/services/geminiService';
import { updateBKT } from '@/utils/bkt';
import { computePredictedScore } from '@/utils/lsapScore';
import { ConflictPageHint } from '@/components/WorkspaceEvidenceReportModal';   // ← 内部（仅 ConflictPageHint 子组件）
```

**WorkspaceEvidenceReportModal.tsx**
```ts
import type { LSAPContentMap, LSAPState } from '@/types';
import type { WorkspaceDialogueTurn } from '@/utils/examWorkspaceLsapKey';
```

#### 独立面板

**ExamPredictionPanel.tsx**
```ts
import { ... } from '@/services/geminiService';
import { updateBKT } from '@/utils/bkt';
import type { LSAPContentMap, LSAPState, ProbeRecord, LSAPBKTState, LSAPKnowledgeComponent } from '@/types';
import { computePredictedScore } from '@/utils/lsapScore';
```

**ExamSummaryPanel.tsx**
```ts
import { generateExamSummary, updateExamSummary } from '@/services/geminiService';
```

**ExamTrapsPanel.tsx**
```ts
import { generateExamTraps } from '@/services/geminiService';
```

---

## 2. 谁在 import 这 19 个文件

### 2.1 外部引用（仅 App.tsx，共 5 个入口）

| 被 import 的文件 | 调用方 | 调用类型 |
|---|---|---|
| [ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx) | [App.tsx:22](App.tsx) | 入口（独立面板） |
| [ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx) | [App.tsx:24](App.tsx) | 入口（独立面板） |
| [ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx) | [App.tsx:38](App.tsx) | 入口（独立面板） |
| [ExamHubModal.tsx](components/ExamHubModal.tsx) | [App.tsx:39](App.tsx) | 入口（hub 集群顶点） |
| [ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx) | [App.tsx:40](App.tsx) | 入口（workspace 集群顶点） |

### 2.2 内部引用（exam 自身的 16 条）

| 调用方 | 被 import |
|--------|-----------|
| ExamHubModal | ExamCenterPanel, ExamDailyMaintenancePanel, StudyFlowPanel |
| ExamCenterPanel | ExamLinkModal |
| ExamDailyMaintenancePanel | MaintenanceFlashcardDeck, MaintenanceFeedbackCelebration |
| ExamWorkspacePage | ExamWorkspaceSocraticChat, KcGlossarySidebar, KnowledgePointInspectPanel, WorkspaceKcProbeModal, WorkspaceEvidenceReportModal, ExamWorkspaceMaterialPreview |
| ExamWorkspaceSocraticChat | ExamWorkspaceAssistantMarkdown, ExamWorkspaceCitationBlock（仅类型） |
| ExamWorkspaceAssistantMarkdown | ExamWorkspaceCitationBlock |
| WorkspaceKcProbeModal | WorkspaceEvidenceReportModal（仅 ConflictPageHint 子组件） |

⚠️ **关键观察**：
- features/、shared/、其他 components/ **0 处** 引用这 19 文件——exam 集群与外界完全无耦合。
- 5 个 App.tsx 入口分布：3 个独立面板（Summary / Traps / Prediction）+ 2 个集群顶点（HubModal / WorkspacePage）。
- 14 个文件**没有被 App.tsx 直接引用**——它们全部被 hub 或 workspace 集群内部消费。

---

## 3. 19 文件之间的内部依赖（依赖图）

### 3.1 ASCII 依赖图

```
══════════════════════════════════════════════════════════════════
入口（App.tsx 直接挂载，5 个）：
══════════════════════════════════════════════════════════════════

App.tsx
├── (line 22) ExamSummaryPanel ────────────── [独立]
├── (line 24) ExamTrapsPanel ──────────────── [独立]
├── (line 38) ExamPredictionPanel ─────────── [独立]
├── (line 39) ExamHubModal
│              ├── ExamCenterPanel
│              │     └── ExamLinkModal
│              ├── ExamDailyMaintenancePanel
│              │     ├── MaintenanceFlashcardDeck
│              │     └── MaintenanceFeedbackCelebration
│              └── StudyFlowPanel
└── (line 40) ExamWorkspacePage
              ├── ExamWorkspaceSocraticChat
              │     ├── ExamWorkspaceAssistantMarkdown
              │     │     └── ExamWorkspaceCitationBlock
              │     └── ExamWorkspaceCitationBlock (仅类型 OpenMaterialPageOptions)
              ├── ExamWorkspaceMaterialPreview
              ├── KcGlossarySidebar
              ├── KnowledgePointInspectPanel
              ├── WorkspaceKcProbeModal
              │     └── WorkspaceEvidenceReportModal (仅 ConflictPageHint 子组件)
              └── WorkspaceEvidenceReportModal
```

🟢 **无循环依赖。**
🟢 **结构是干净的树**（除 WorkspaceKcProbeModal → WorkspaceEvidenceReportModal 这一条交叉边外，其余完全是 DAG）。

### 3.2 依赖簇识别（cluster）

按依赖图自然形成 **3 个独立簇 + 3 个独立面板**：

| 簇 | 文件数 | 顶点（App.tsx 入口） | 成员 |
|----|-------|--------------------|------|
| **Hub 集群** | 6 | ExamHubModal | ExamHubModal, ExamCenterPanel, ExamLinkModal, ExamDailyMaintenancePanel, MaintenanceFlashcardDeck, MaintenanceFeedbackCelebration |
| **Hub 衍生 - StudyFlow** | 1 | （经 ExamHubModal 间接） | StudyFlowPanel |
| **Workspace 集群** | 9 | ExamWorkspacePage | ExamWorkspacePage, ExamWorkspaceSocraticChat, ExamWorkspaceAssistantMarkdown, ExamWorkspaceCitationBlock, ExamWorkspaceMaterialPreview, KcGlossarySidebar, KnowledgePointInspectPanel, WorkspaceKcProbeModal, WorkspaceEvidenceReportModal |
| **独立面板** | 3 | App.tsx 直接挂载 | ExamPredictionPanel, ExamSummaryPanel, ExamTrapsPanel |

合计：6 + 1 + 9 + 3 = **19 ✓**

### 3.3 簇内子团

- **Maintenance 子团**（ExamDailyMaintenancePanel + 2 卡片）依赖图清晰，可作为 hub 内的独立子目录
- **Workspace Citation 链**：Socratic → AssistantMarkdown → CitationBlock 是个 3 层链
- **Workspace Evidence/Probe 对**：WorkspaceKcProbeModal 借用 WorkspaceEvidenceReportModal 的 ConflictPageHint 子组件——它俩有"产出/分析"的语义对应

---

## 4. 跨模块借用（features/ / shared/ / 其他 components/）

### 4.1 引用 @/features/...

逐一 grep 后：**0 处**。这 19 个文件均不依赖任何 features/ 下模块。

### 4.2 引用 @/shared/...

逐一 grep 后：**0 处**。完全不依赖 shared/。

### 4.3 引用 @/components/...

| 文件 | 引用 |
|------|------|
| ExamHubModal | `@/components/{ExamCenterPanel, ExamDailyMaintenancePanel, StudyFlowPanel}` |
| ExamCenterPanel | `@/components/ExamLinkModal` |
| ExamDailyMaintenancePanel | `@/components/{MaintenanceFlashcardDeck, MaintenanceFeedbackCelebration}` |
| ExamWorkspacePage | `@/components/{ExamWorkspaceSocraticChat, KcGlossarySidebar, KnowledgePointInspectPanel, WorkspaceKcProbeModal, WorkspaceEvidenceReportModal, ExamWorkspaceMaterialPreview}` |
| ExamWorkspaceSocraticChat | `@/components/{ExamWorkspaceCitationBlock, ExamWorkspaceAssistantMarkdown}` |
| ExamWorkspaceAssistantMarkdown | `@/components/ExamWorkspaceCitationBlock` |
| WorkspaceKcProbeModal | `@/components/WorkspaceEvidenceReportModal`（仅 ConflictPageHint） |

**全部都是 exam 集群内部的引用**——没有跨 review-exam 借用，也没有引用 components/ 下其他 panel。这是搬迁最理想的状态（与 review 批一致）。

---

## 5. utils/ 依赖

### 5.1 每文件依赖的 utils

| 文件 | 引用的 utils |
|------|-----------|
| ExamCenterPanel | 无 |
| ExamHubModal | 无 |
| ExamLinkModal | 无 |
| ExamDailyMaintenancePanel | examMaintenanceEligibility, maintenanceStrategy, examSchedule |
| MaintenanceFlashcardDeck | 无 |
| MaintenanceFeedbackCelebration | 无 |
| StudyFlowPanel | studyFlowInference |
| ExamPredictionPanel | bkt, lsapScore |
| ExamSummaryPanel | 无 |
| ExamTrapsPanel | 无 |
| ExamWorkspacePage | examWorkspaceLsapKey, examChunkIndex, examChunkRetrieval |
| ExamWorkspaceSocraticChat | extractBoldTermsFromMarkdown, glossaryTermFilter, scaffoldingClassifier, examWorkspaceOrchestrator, examWorkspaceLsapKey, examWorkspaceCitations, examChunkRetrieval |
| ExamWorkspaceAssistantMarkdown | examWorkspaceCitations |
| ExamWorkspaceCitationBlock | examWorkspaceCitations |
| ExamWorkspaceMaterialPreview | pdfUtils, pdfQuoteHighlight |
| KcGlossarySidebar | 无 |
| KnowledgePointInspectPanel | 无 |
| WorkspaceKcProbeModal | bkt, lsapScore |
| WorkspaceEvidenceReportModal | examWorkspaceLsapKey |

### 5.2 exam-相关 utils 跨域分析

> 关键：exam 集群引用的 utils 中，**有 4 个并非 exam 独占**。

| utils 文件 | exam 内引用 | 其他模块也引用 | 是否 exam 独占 |
|-----------|-----------|---------------|----------------|
| `examWorkspaceCitations` | AssistantMarkdown, CitationBlock, Socratic（3 处） | — | ✅ exam 独占 |
| `examWorkspaceLsapKey` | Page, Socratic, EvidenceReport（3 处） | **App.tsx:56** | ❌ 跨用 |
| `examChunkRetrieval` | Page, Socratic（2 处） | — | ✅ exam 独占 |
| `examChunkIndex` | Page（1 处） | utils/ 内部（自引） | ✅ exam 独占 |
| `examWorkspaceOrchestrator` | Socratic（1 处） | — | ✅ exam 独占 |
| `examMaintenanceEligibility` | DailyMaintenance（1 处） | — | ✅ exam 独占 |
| `maintenanceStrategy` | DailyMaintenance（1 处） | — | ✅ exam 独占（但⚠️ 在 CONTEXT.md 的 utils/ 清单中**没列**——见 §10） |
| `examSchedule` | DailyMaintenance（1 处） | utils 内部（被 examMaintenanceEligibility + maintenanceStrategy 用） | ✅ exam 独占 |
| `studyFlowInference` | StudyFlowPanel（1 处） | — | ✅ exam 独占 |
| `bkt` | Prediction, KcProbe（2 处） | — | ✅ exam 独占 |
| `lsapScore` | Prediction, KcProbe（2 处） | — | ✅ exam 独占 |
| `extractBoldTermsFromMarkdown` | Socratic（1 处） | **App.tsx:58** | ❌ 跨用 |
| `glossaryTermFilter` | Socratic（1 处） | — | ✅ exam 独占 |
| `scaffoldingClassifier` | Socratic（1 处） | **services/geminiService.ts:6** | ❌ 跨用 |
| `pdfUtils` | MaterialPreview（1 处） | **App.tsx:41**（reader 体系也用）+ utils/examChunkIndex.ts | ❌ 跨用（reader-side 共用） |
| `pdfQuoteHighlight` | MaterialPreview（1 处） | — | ✅ exam 独占 |

🟢 **12 个 exam 独占 utils**：examWorkspaceCitations, examChunkRetrieval, examChunkIndex, examWorkspaceOrchestrator, examMaintenanceEligibility, maintenanceStrategy, examSchedule, studyFlowInference, bkt, lsapScore, glossaryTermFilter, pdfQuoteHighlight
🔵 **4 个跨域 utils**：examWorkspaceLsapKey（与 App.tsx 共用）, extractBoldTermsFromMarkdown（与 App.tsx 共用）, scaffoldingClassifier（与 geminiService 共用）, pdfUtils（与 App.tsx + reader 共用）

按已确定方案：**所有 utils/ 文件本批不动，留待 P2 阶段 4 统一搬到 lib/**。届时跨域 4 个明显归 lib/，独占的 12 个可以选择：(a) 也归 lib/ 统一管理；(b) 就近搬到 features/exam/lib/ 或类似。本批不需做这个决策。

### 5.3 @/data/ 数据文件依赖（新发现）

之前的扫描没出现过 `@/data/`。本批发现 2 处：
- [ExamDailyMaintenancePanel.tsx:22](components/ExamDailyMaintenancePanel.tsx) → `@/data/maintenanceFeedbackCopy`
- [StudyFlowPanel.tsx:13](components/StudyFlowPanel.tsx) → `@/data/studyFlowTemplates`

这两个是文案/模板数据文件。本批 **不动 data/**，也不影响搬迁——别名能正常解析。是否将 `@/data/` 整体重组（合并到 lib/data/ 或 features/exam/data/）属于阶段 4 议题。

---

## 6. services/ 与 @/types 与 第三方

### services/ 依赖

| 文件 | 服务调用 |
|------|---------|
| ExamCenterPanel | `@/services/firebase`（5 函数：createExam / deleteExam / removeExamMaterialLink / updateExam / addCalendarEvent） |
| ExamHubModal | `@/services/firebase`（listExams / listExamMaterialLinks） |
| ExamLinkModal | `@/services/firebase`（多函数）+ `@/services/storageService` |
| ExamDailyMaintenancePanel | `@/services/firebase`（getDailyPlanCache / setDailyPlanCache）+ `@/services/geminiService`（generateMaintenanceFlashCards / generateQuizSet） |
| ExamPredictionPanel | `@/services/geminiService`（多函数） |
| ExamSummaryPanel | `@/services/geminiService`（generateExamSummary / updateExamSummary） |
| ExamTrapsPanel | `@/services/geminiService`（generateExamTraps） |
| ExamWorkspacePage | `@/services/firebase`（listExams / listExamMaterialLinks）+ `@/services/examChunkIndexStorage`（3 函数） |
| ExamWorkspaceSocraticChat | `@/services/geminiService`（多函数）+ `@/services/examChunkIndexStorage`（loadExamMaterialChunkIndex） |
| WorkspaceKcProbeModal | `@/services/geminiService` |
| 其他 8 个（Maintenance 卡片 / Workspace UI 件 / KcGlossary / KnowledgePointInspect / StudyFlow / Markdown / CitationBlock / EvidenceReport / MaterialPreview） | 无 |

📌 注意 **`@/services/examChunkIndexStorage`** 是 exam-private service（只有 ExamWorkspacePage + ExamWorkspaceSocraticChat 用）。如果 P3 拆 services/ 时它也是候选独立模块。

### @/types 依赖（仅列代表性类型）

- 全 19 个文件均不同程度从 `@/types` 导入类型：Exam / ExamMaterialLink / DisciplineBand / FilePersistedState / StudyFlowStep / LSAPState / LSAPContentMap / LSAPKnowledgeComponent / ProbeRecord / LSAPBKTState / KcGlossaryEntry / MaintenanceFlashCard / FileHistoryItem / CloudSession 等。
- 类型分散在 types.ts 中——属于全局共享类型，本批不影响。

### @/data/ 依赖

如 §5.3 — DailyMaintenance + StudyFlowPanel 各 1 处。

### 第三方库

- 共用：react、lucide-react
- `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`：4 个 panel 用（ExamPredictionPanel, ExamSummaryPanel, ExamTrapsPanel, ExamWorkspaceAssistantMarkdown）——继续延续 P3 抽 `AppMarkdown` 共享件的话，候选名单更长了
- `firebase/auth`：5 个文件用 User 类型（ExamCenterPanel, ExamDailyMaintenancePanel, ExamHubModal, ExamLinkModal, ExamWorkspacePage）
- `pdfjs-dist`：仅 ExamWorkspaceMaterialPreview 用（PDFDocumentProxy 类型）
- `react-dom`：仅 ExamWorkspaceMaterialPreview 用（createPortal）

---

## 7. 归类建议

> 这一节是核心决策点，请你拍板。

### 7.1 关键问题：是否分子目录？

**强烈建议：分子目录（方案 B）**。理由：
1. **19 文件/8025 行**比 review 第 2 批（12 文件/2953 行）多近 2 倍，扁平在一个目录下心智过载
2. 依赖图天然形成 **3 个清晰簇**，分子目录后每个簇内 6-9 文件，颗粒度刚好
3. 与 [features/reader/](features/reader/) 已采用的"按子功能分目录"风格一致
4. 未来 REFACTOR_PLAN.md 阶段 4 拆 ExamWorkspacePage 1492 行时，子目录方便容纳拆出来的子组件

### 7.2 推荐方案 B：3 个子目录

```
features/exam/
├── ExamHubModal.tsx                            (Hub 集群顶点)
├── ExamPredictionPanel.tsx                     (独立面板，App.tsx 直接挂载)
├── ExamSummaryPanel.tsx                        (独立面板，App.tsx 直接挂载)
├── ExamTrapsPanel.tsx                          (独立面板，App.tsx 直接挂载)
├── hub/
│   ├── ExamCenterPanel.tsx
│   ├── ExamLinkModal.tsx
│   ├── ExamDailyMaintenancePanel.tsx
│   ├── MaintenanceFlashcardDeck.tsx
│   ├── MaintenanceFeedbackCelebration.tsx
│   └── StudyFlowPanel.tsx                      (Hub 内的"学习流程引导"，hub 顶点的子项)
└── workspace/
    ├── ExamWorkspacePage.tsx                   (Workspace 集群顶点)
    ├── ExamWorkspaceSocraticChat.tsx
    ├── ExamWorkspaceAssistantMarkdown.tsx
    ├── ExamWorkspaceCitationBlock.tsx
    ├── ExamWorkspaceMaterialPreview.tsx
    ├── KcGlossarySidebar.tsx
    ├── KnowledgePointInspectPanel.tsx
    ├── WorkspaceKcProbeModal.tsx
    └── WorkspaceEvidenceReportModal.tsx
```

合计：4 顶层 + 6 hub + 9 workspace = **19 ✓**

✅ **优点**：
- 每个子目录 6-9 文件，颗粒适中
- 顶层 4 个入口（HubModal + 3 独立面板）+ 集群顶点（WorkspacePage 在 workspace/）共 5 个 App.tsx 直接挂载点都易找
- 簇内文件互相 import 时路径短（同子目录）
- ExamHubModal 在顶层、其子项在 hub/ 子目录，符合"顶点放外、子项内嵌"的层级直觉

⚠️ **小瑕疵**：
- **HubModal 是 hub/ 的顶点但 ExamWorkspacePage 是 workspace/ 的顶点**——一致的话两个都在子目录里。如果你更看重一致性，可以把 ExamHubModal 也放进 hub/，那顶层只剩 3 个独立面板。但这样 App.tsx 的 import 路径就成了 `'@/features/exam/hub/ExamHubModal'`，跟 WorkspacePage 同样深度——是另一种合理风格。
- 推荐保留我现在的方案：**ExamHubModal 在顶层、ExamWorkspacePage 在 workspace/ 内**，理由是 HubModal 只是个轻 wrapper（130 行），把它埋深一层不划算；而 WorkspacePage 1492 行并是 9 文件的顶点，跟兄弟们呆在 workspace/ 反而更清楚。两个都可接受，看你偏好。

### 7.3 候选方案 A（扁平 19 文件）

```
features/exam/
├── 19 个 .tsx 平铺
```

✅ 简单、改 import 路径短（`@/features/exam/Foo`）
❌ 19 文件平铺没有分组语义；ls 一屏看不完；与 reader/、review/ 已采用的子目录风格不一致

**不推荐**——除非你强烈偏好扁平。

### 7.4 候选方案 B'（更细分子目录）

```
features/exam/
├── ExamHubModal.tsx, ExamPredictionPanel.tsx, ExamSummaryPanel.tsx, ExamTrapsPanel.tsx
├── center/        ExamCenterPanel.tsx + ExamLinkModal.tsx
├── maintenance/   ExamDailyMaintenancePanel.tsx + MaintenanceFlashcardDeck.tsx + MaintenanceFeedbackCelebration.tsx
├── studyFlow/     StudyFlowPanel.tsx
└── workspace/     9 个 workspace 文件
```

把 hub/ 进一步拆成 center/ + maintenance/ + studyFlow/ 3 个子目录。

✅ 簇内更细，每个子目录 1-3 文件
❌ studyFlow/ 只 1 文件就单建目录有点过头；center/maintenance/ 也很小
❌ App.tsx 改路径增加心智，且依赖跨子目录 import 路径变长

**不推荐**——B 已经够了。

### 7.5 与 [CONTEXT.md](CONTEXT.md) / [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) 预设的一致性

| 项 | 预设 | 本扫描发现 | 一致？ |
|----|------|-----------|-------|
| candidate features/exam/ 列出 17+ 文件 | "17+" | 实际 **19** 文件 | ⚠️ 数量微差（详见 §10） |
| 全部归 features/exam/ 扁平 | ✓ | 推荐分子目录 B | ⚠️ 子目录化是新建议 |
| ExamHubModal、ExamWorkspacePage 是关键集群顶点 | ✓ | 实测确实如此 | ✅ |

---

## 8. 搬迁批次建议

### 推荐方案：**方案 A — 1 批搬完 19 个**

理由：
- 19 文件之间内部依赖只有 16 条，且都是干净的 DAG（无循环）
- 跨域引用 0 处（不引 features/ / shared/ / 其他 components/）
- 外部引用只有 5 处（全在 App.tsx）
- 一次搬完后 components/ 只剩 galgame 2 文件，目录心智收敛非常彻底
- 之前已成功搬过 12 文件（review 批）和 8 文件（shared 批），19 在数量上仅多 7 文件，搬迁机制并未变化
- 按方案 B（子目录），每个子目录的内部 import 同时完成更新，一次到位

预计影响（按方案 B + 1 批搬完）：
```
git mv 操作：       19 个
新增目录：          features/exam/ + hub/ + workspace/（3 个目录）
本批改动 import 行数：
  - exam 内部互引：    16 行（按子目录拆分后的新路径）
  - App.tsx：           5 行
  - 其他外部：           0 行
  合计：                ~21 行（比 review 批的 12 行多约 75%）
预计 tsc 错误数：    10（与基线一致）
预计搬迁时间：       单批一次完成，约 15 分钟（更新 import 是最耗时的，但都是机械活）
```

### 备选方案：**方案 B — 分 2 批**

- **第 3a 批（hub + 独立面板）**：ExamHubModal + 4 hub 子项 + StudyFlowPanel + 3 独立面板 = 10 文件（顶层 ExamHubModal/Prediction/Summary/Traps + hub/ 6 文件）
- **第 3b 批（workspace）**：ExamWorkspacePage + 8 workspace 子项 = 9 文件

如果你想稳一些（每批中间用户验证一次），选 B。但 exam 集群两簇之间无 import 关系，分批不会避免任何风险。**推荐 A**。

### 备选方案：**方案 C — 分 4 批（按子目录分批）**

- 第 3a：4 个顶层入口（ExamHubModal + 3 独立面板）
- 第 3b：6 个 hub/ 文件
- 第 3c：9 个 workspace/ 文件
- 第 3d：（无）

这样最稳，但搬迁机械成本高（4 个 commit，4 次用户验证）。**不推荐**——除非你特别担心。

---

## 9. 风险提示

### 9.1 体量与巨型组件（提醒，不是阻塞）

3 个文件 ≥ 996 行：[ExamWorkspacePage 1492](components/ExamWorkspacePage.tsx)、[ExamPredictionPanel 1035](components/ExamPredictionPanel.tsx)、[ExamWorkspaceMaterialPreview 996](components/ExamWorkspaceMaterialPreview.tsx)。

⚠️ **本批不拆 UI**——只搬路径。这 3 个候选会进入 REFACTOR_PLAN.md 阶段 4"拆巨型组件"清单（与 [App.tsx 2856](App.tsx) 和 [SkimPanel.tsx 1309](features/reader/skim/SkimPanel.tsx) 一起）。

### 9.2 "组件文件兼任 helper 函数" 模式（类似 review 批的 MultiDocQAPanel）

发现 **2 个类似情况**：

**(a) [WorkspaceEvidenceReportModal.tsx](components/WorkspaceEvidenceReportModal.tsx)** 导出：
- `conflictPageHintText`（函数）— 仅文件内自用
- `ConflictPageHint`（子组件）— **被 [WorkspaceKcProbeModal](components/WorkspaceKcProbeModal.tsx) import**
- `buildWorkspaceEvidenceMarkdown`（函数）— 仅文件内自用
- `WorkspaceEvidenceReportModal`（主组件）— 被 ExamWorkspacePage import

→ ConflictPageHint 是个**跨文件复用的子组件**，但宿主在 EvidenceReportModal。这是 exam 内部约定，本批保留即可。后续若要拆：把 ConflictPageHint 抽到 `features/exam/workspace/ConflictPageHint.tsx`，再清理两边。

**(b) [WorkspaceKcProbeModal.tsx](components/WorkspaceKcProbeModal.tsx)** 导出 `bloomLevelForWorkspaceProbe`（函数）— 仅文件内自用

这种"export 但只有文件内用"的死 export 不影响搬迁，但应在阶段 4 清理时一并审视。

→ **本批保留现状不拆，跟 review 批 MultiDocQAPanel 同样处理思路**。

### 9.3 `data/` 目录新发现（前所未见）

[ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) 引 `@/data/maintenanceFeedbackCopy`、[StudyFlowPanel.tsx](components/StudyFlowPanel.tsx) 引 `@/data/studyFlowTemplates`。

之前的批次未涉及 `data/`。本批**不动 data/ 目录**——别名仍能正常解析。如果未来要重组 data/（合并到 lib/data/ 或就近搬入 features/exam/data/），属于阶段 4 议题，本批不做决策。

📌 但应记一笔：**`maintenanceFeedbackCopy` + `studyFlowTemplates` 是 exam 独占数据**——后续重组时建议跟搬到 `features/exam/data/`。

### 9.4 跨域 utils 的隐患（重申 §5.2）

4 个 exam 引用的 utils 与 App.tsx 或 geminiService 共用：
- `examWorkspaceLsapKey`（与 App.tsx）
- `extractBoldTermsFromMarkdown`（与 App.tsx）
- `scaffoldingClassifier`（与 geminiService）
- `pdfUtils`（与 App.tsx + reader）

本批**不动 utils**——这些 import 路径保持原样能解析。但 P2 阶段 4 把 utils 重组到 lib/ 时，这 4 个会被识别为"真正的 lib"（vs 12 个 exam 独占的 utils 是"feature 私有 lib"——届时再决定就近搬还是统一 lib/）。

### 9.5 services/examChunkIndexStorage.ts

[services/examChunkIndexStorage.ts](services/examChunkIndexStorage.ts) 是 exam-private service（只有 ExamWorkspacePage 和 ExamWorkspaceSocraticChat 用）。本批**不动 services/**——但提醒一笔：这是 P3 阶段考虑就近迁到 `features/exam/services/` 的候选。

### 9.6 ReactMarkdown 重复主题（再次出现）

ExamPredictionPanel / ExamSummaryPanel / ExamTrapsPanel / ExamWorkspaceAssistantMarkdown 共 4 个 panel 各自实现 MarkdownComponents。加上之前的 SkimPanel / SavedArtifactPreview / StudyGuide / Feynman / TrickyProfessor / MultiDocQA，整个项目至少 **10 个文件** 重复实现同样的 react-markdown 套件。

→ 本批不动。等 P3 抽 `AppMarkdown` 共享件统一处理。

### 9.7 [App.tsx](App.tsx) 5 行 import 改动

注意 App.tsx 的 import 行号（line 22, 24, 38, 39, 40）是**不连续的**（散布在 ~40 行 import 块中）——搬迁时小心改对位置。建议用 grep 定位、Edit 工具逐行改而非批量 sed，避免误改。

---

## 10. 与 CONTEXT.md / REFACTOR_P2_PLAN.md 预设的一致性核验

### 10.1 数量差异：预设 17+ vs 实际 19

[CONTEXT.md](CONTEXT.md) 中"候选 features/exam/" 的预设清单列了 17 文件。但**实际有 19 个文件**——多出 2 个：

| 文件 | 预设清单中 | 实际存在 |
|------|-----------|---------|
| ExamHubModal | ✓ | ✓ |
| ExamCenterPanel | ✓ | ✓ |
| ExamLinkModal | ✓ | ✓ |
| ExamDailyMaintenancePanel | ✓ | ✓ |
| ExamPredictionPanel | ✓ | ✓ |
| ExamSummaryPanel | ✓ | ✓ |
| ExamTrapsPanel | ✓ | ✓ |
| ExamWorkspacePage | ✓ | ✓ |
| ExamWorkspaceSocraticChat | ✓ | ✓ |
| ExamWorkspaceAssistantMarkdown | ✓ | ✓ |
| ExamWorkspaceCitationBlock | ✓ | ✓ |
| ExamWorkspaceMaterialPreview | ✓ | ✓ |
| KcGlossarySidebar | ✓ | ✓ |
| KnowledgePointInspectPanel | ✓ | ✓ |
| MaintenanceFeedbackCelebration | ✓ | ✓ |
| MaintenanceFlashcardDeck | ✓ | ✓ |
| StudyFlowPanel | ✓ | ✓ |
| WorkspaceEvidenceReportModal | ✓ | ✓ |
| WorkspaceKcProbeModal | ✓ | ✓ |

🟢 实际数完是 **19**，预设清单也是 19——所以"17+"是早期文档的口算偏差，不是真有差异。CONTEXT.md 在最近一次 review 批更新时已改为"exam(19) + galgame(2) = 21 文件"，是准确的。

### 10.2 utils/ 清单对比

[CONTEXT.md utils/ 清单](CONTEXT.md) 列了 28 个 utils，但实际有 1 个未列：**`maintenanceStrategy.ts`**（被 ExamDailyMaintenancePanel 用，本扫描发现）。

如果要严格对账，CONTEXT.md utils/ 清单可能漏统计——不影响本批搬迁，但 P2 阶段 4 重组 utils 时需要一次实际 ls 重新核对。

### 10.3 扁平方案是否仍合理

CONTEXT.md / REFACTOR_P2_PLAN.md 早期"全部归 features/exam/ 扁平"建议。

**本扫描建议改为分子目录（方案 B）**——理由见 §7.1。这是 19 文件天然形成的 3 簇结构 vs 之前预设的 6-12 文件扁平的对比下，子目录划分更合适。

如果你坚持扁平方案 A，搬迁也能跑通——只是 19 文件挤一个目录心智重一些。**推荐 B**。

---

## 11. 用户决策点（请拍板这几条）

- [ ] **Q1**：归类风格选 **B（推荐：子目录化，3 簇分 hub/workspace/ + 顶层）** 还是 A（扁平 19 文件）还是 B'（更细分 4 子目录）？
- [ ] **Q2**：方案 B 中，**ExamHubModal 放顶层**（推荐）还是放 `hub/` 内（与 ExamWorkspacePage 在 workspace/ 风格一致）？
- [ ] **Q3**：批次方案选 A（**推荐：1 批搬完 19 个**）、B（分 2 批：hub+独立面板 / workspace）、还是 C（分 4 批按子目录分别搬）？
- [ ] **Q4**：[WorkspaceEvidenceReportModal](components/WorkspaceEvidenceReportModal.tsx) 中 `ConflictPageHint` 跨文件被 WorkspaceKcProbeModal import 的子组件，本批是**保持现状**（推荐，与 review 批 MultiDocQAPanel 处理思路一致）还是**拆出独立文件** `ConflictPageHint.tsx`？
- [ ] **Q5**：utils/maintenanceStrategy.ts 漏列在 [CONTEXT.md](CONTEXT.md) 的 utils/ 清单中——本批是否一并修正？（推荐：是，作为本批活文档更新的一部分）

---

## 12. 与历史报告的一致性核验

| 早期判断（来自 [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) / [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md)） | 本扫描发现 | 一致？ |
|------|---------|-------|
| ExamHubModal 是 hub 集群顶点 | ✓ | ✅ |
| ExamWorkspacePage 是 workspace 集群顶点 | ✓ | ✅ |
| 19 文件归 `features/exam/` 扁平 | 推荐改为子目录 | ⚠️ 子目录化是新建议（详见 §7） |
| utils/ 中 7 个 exam 前缀文件 | 实测 7 个 + 漏列的 maintenanceStrategy = 8 个 exam 相关 utils | 🆕 新发现 |
| 跨域 utils 的具体清单 | 4 个跨用（lsapKey / extractBoldTerms / scaffoldingClassifier / pdfUtils） | 🆕 新发现 |
| `@/data/` 目录依赖 | 2 处（maintenanceFeedbackCopy + studyFlowTemplates） | 🆕 新发现（前所未见） |
| 组件文件兼任 helper 函数 | 2 处（WorkspaceEvidenceReportModal 4 export + WorkspaceKcProbeModal 1 死 export） | 🆕 新发现 |

---

*预扫描完。零代码改动、零目录创建、零 git mv。等你看完发正式包。
本批是 P2 阶段最大、依赖图最复杂的一批：19 文件、8025 行、16 条内部依赖、3 个簇、5 个 App.tsx 入口。
但 exam 集群与外界 0 耦合（features/ / shared/ / 其他 components/ 都不引），是搬迁理想状态。
推荐方案：B（3 子目录）+ A（1 批搬完）+ Q4 保持 ConflictPageHint 现状 + Q5 一并修正 CONTEXT.md utils 清单。*
