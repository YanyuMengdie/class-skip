# Review 预搬迁扫描报告（只读、未动任何文件）

> P2 阶段 3 第 2 批的预调查。
> 范围：[CONTEXT.md](CONTEXT.md) "components/ 仍剩" 的 review 系列 12 文件。
> 生成时间：2026-05-05 · refactor 分支当前状态

---

## 1. 每个文件的当前真实状态

✅ **12 个文件全部真实存在**（已 ls 实测）。

| 文件 | 行数 | 是否存在 |
|------|------|---------|
| [components/ReviewPage.tsx](components/ReviewPage.tsx) | 393 | ✓ |
| [components/QuizReviewPanel.tsx](components/QuizReviewPanel.tsx) | 309 | ✓ |
| [components/FlashCardReviewPanel.tsx](components/FlashCardReviewPanel.tsx) | 213 | ✓ |
| [components/StudyGuidePanel.tsx](components/StudyGuidePanel.tsx) | 205 | ✓ |
| [components/TerminologyPanel.tsx](components/TerminologyPanel.tsx) | 120 | ✓ |
| [components/FeynmanPanel.tsx](components/FeynmanPanel.tsx) | 363 | ✓ |
| [components/TrickyProfessorPanel.tsx](components/TrickyProfessorPanel.tsx) | 114 | ✓ |
| [components/TrapListPanel.tsx](components/TrapListPanel.tsx) | 78 | ✓ |
| [components/MultiDocQAPanel.tsx](components/MultiDocQAPanel.tsx) | 208 | ✓ |
| [components/MindMapPanel.tsx](components/MindMapPanel.tsx) | 589 | ✓ |
| [components/MindMapFlowCanvas.tsx](components/MindMapFlowCanvas.tsx) | 206 | ✓ |
| [components/MindMapFlowNode.tsx](components/MindMapFlowNode.tsx) | 155 | ✓ |
| **合计** | **2953 行** | — |

### 1.1 各文件 import 头部清单

#### ReviewPage.tsx
```ts
import React, { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, FileText, Loader2, ... } from 'lucide-react';
import { User } from 'firebase/auth';
import { getUserSessions, fetchSessionDetails, updateCloudSessionState } from '@/services/firebase';
import { CloudSession } from '@/types';
import { storageService } from '@/services/storageService';
import { collectSavedArtifactsFromLocalHistory } from '@/utils/collectSavedArtifactsFromLocalHistory';
import { collectSavedArtifactsFromCloudSessions } from '@/utils/collectSavedArtifactsFromCloud';
import { mergeLocalAndCloudArtifacts, type MergedLibraryEntry } from '@/utils/mergeArtifactLibraries';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META, formatSavedArtifactTime as formatTime } from '@/utils/savedArtifactMeta';
import { ArtifactFullView } from '@/shared/studio/SavedArtifactPreview';
```
**关键：ReviewPage 不 import 其余 11 个 tools 中任何一个**——它本身是个**独立的"学习产物总库"页面**，仅依赖 shared/studio/ 的 ArtifactFullView。

#### QuizReviewPanel.tsx
```ts
import React, { useState, useMemo } from 'react';
import { X, ChevronLeft, ... } from 'lucide-react';
import { QuizData, QuizRound } from '@/types';
import { generateQuizSet } from '@/services/geminiService';
```

#### FlashCardReviewPanel.tsx
```ts
import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ... } from 'lucide-react';
import { FlashCard } from '@/types';
import { estimateFlashCardCount, generateFlashCards } from '@/services/geminiService';
```

#### StudyGuidePanel.tsx
```ts
import React, { useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { X, FileText, ... } from 'lucide-react';
import { StudyGuide, StudyGuideFormat, StudyGuideContent } from '@/types';
import { generateStudyGuide } from '@/services/geminiService';
```

#### TerminologyPanel.tsx
```ts
import React, { useState, useEffect } from 'react';
import { X, Loader2, BookMarked, ... } from 'lucide-react';
import { extractTerminology, TerminologyItem } from '@/services/geminiService';
```
**仅 react + lucide-react + geminiService 一服务**，不引 @/types。

#### FeynmanPanel.tsx
```ts
import React, { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, ... } from 'lucide-react';
import {
  generateFeynmanExplanation,
  generateFeynmanExplanationForTopics,
  generateFeynmanQuestion,
  evaluateFeynmanAnswer,
  FeynmanQuestionResult,
  FeynmanAnswerFeedback
} from '@/services/geminiService';
```

#### TrickyProfessorPanel.tsx
```ts
import React, { useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, GraduationCap } from 'lucide-react';
import { generateTrickyQuestions } from '@/services/geminiService';
```

#### TrapListPanel.tsx
```ts
import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { TrapItem } from '@/types';
```
**最干净——0 个项目内服务依赖**（纯展示组件，靠 props 拿数据）。

#### MultiDocQAPanel.tsx
```ts
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Loader2, Send, MessageCircle } from 'lucide-react';
import { ChatMessage } from '@/types';
import { multiDocQAReply } from '@/services/geminiService';
```
⚠️ 这个文件除了 `MultiDocQAPanel` 还导出 3 个工具函数：`getMultiDocQAConversationKey` / `loadMultiDocQAMessages` / `saveMultiDocQAMessages`（被 App.tsx:29 一同 import）。详见 §9 风险提示。

#### MindMapPanel.tsx
```ts
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, GitBranch, ... } from 'lucide-react';
import { MindMapNode, MindMapMultiResult } from '@/types';
import { generateMindMap, generateMindMapMulti, evaluateAndSupplementMindMap, modifyMindMap } from '@/services/geminiService';
import { MindMapFlowCanvas, type MindMapFlowCanvasRef, type TreePart } from '@/components/MindMapFlowCanvas';   // ← 内部依赖
import type { MindMapFlowNodeHandlers } from '@/utils/mindMapFlowAdapter';
```

#### MindMapFlowCanvas.tsx
```ts
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, ... } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MindMapNode } from '@/types';
import { MIND_MAP_FLOW_NODE_TYPE, mindMapNodeToFlow, type MindMapFlowNodeData, type MindMapFlowNodeHandlers } from '@/utils/mindMapFlowAdapter';
import { layoutFlowForest } from '@/utils/mindMapElkLayout';
import { MindMapFlowNode } from '@/components/MindMapFlowNode';   // ← 内部依赖
```

#### MindMapFlowNode.tsx
```ts
import React, { useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import { Plus, PenLine, Trash2, Check } from 'lucide-react';
import type { MindMapFlowNodeData } from '@/utils/mindMapFlowAdapter';
import { mindMapFlowNodeId } from '@/utils/mindMapFlowAdapter';
import { getMindMapNodeLabel } from '@/utils/mindMapLabel';
import type { MindMapNode } from '@/types';
```

---

## 2. 谁在 import 这 12 个文件

| 被 import 的文件 | 调用方 | 调用类型 |
|---|---|---|
| [ReviewPage.tsx](components/ReviewPage.tsx) | [App.tsx:36](App.tsx) | 全局壳，仅 1 处 |
| [QuizReviewPanel.tsx](components/QuizReviewPanel.tsx) | [App.tsx:18](App.tsx) | 仅 1 处 |
| [FlashCardReviewPanel.tsx](components/FlashCardReviewPanel.tsx) | [App.tsx:19](App.tsx) | 仅 1 处 |
| [StudyGuidePanel.tsx](components/StudyGuidePanel.tsx) | [App.tsx:21](App.tsx) | 仅 1 处 |
| [FeynmanPanel.tsx](components/FeynmanPanel.tsx) | [App.tsx:23](App.tsx) | 仅 1 处 |
| [TerminologyPanel.tsx](components/TerminologyPanel.tsx) | [App.tsx:25](App.tsx) | 仅 1 处 |
| [TrapListPanel.tsx](components/TrapListPanel.tsx) | [App.tsx:26](App.tsx) | 仅 1 处 |
| [TrickyProfessorPanel.tsx](components/TrickyProfessorPanel.tsx) | [App.tsx:27](App.tsx) | 仅 1 处 |
| [MindMapPanel.tsx](components/MindMapPanel.tsx) | [App.tsx:28](App.tsx) | 仅 1 处 |
| [MultiDocQAPanel.tsx](components/MultiDocQAPanel.tsx) | [App.tsx:29](App.tsx) `import { MultiDocQAPanel, getMultiDocQAConversationKey, loadMultiDocQAMessages, saveMultiDocQAMessages }` | 仅 1 处但 4 个 export |
| [MindMapFlowCanvas.tsx](components/MindMapFlowCanvas.tsx) | [components/MindMapPanel.tsx:5](components/MindMapPanel.tsx) | **仅 MindMapPanel 一家** |
| [MindMapFlowNode.tsx](components/MindMapFlowNode.tsx) | [components/MindMapFlowCanvas.tsx:19](components/MindMapFlowCanvas.tsx) | **仅 MindMapFlowCanvas 一家** |

⚠️ **关键观察**：
- **App.tsx 一家在挂载这 10 个 review 工具**（不算 MindMapFlowCanvas / Node）。每个 panel 都通过 App.tsx 的状态机控制弹层显隐。
- **ReviewPage 与其余 11 个 tools 完全无 import 关系**——ReviewPage 只是"学习产物总库页面"，根本不挂载这些工具。这意味着搬到 features/review/ 后 ReviewPage 不会形成 "review 容器→tools" 的层级。
- features/、shared/、components/Exam* 全部**没有 import 这 12 个文件**——review 集群是独立的、只被 App.tsx 用的。
- **MindMap 是个 3 文件单链**：MindMapPanel → MindMapFlowCanvas → MindMapFlowNode，调用方均指唯一的上游。

---

## 3. 12 个文件之间的内部依赖

| 依赖方 | 被依赖方 | 类型 |
|--------|---------|------|
| MindMapPanel | MindMapFlowCanvas | 直接 import（值 + 类型） |
| MindMapFlowCanvas | MindMapFlowNode | 直接 import |

**仅有这两条**。其余 10 个文件之间**没有任何 import 关系**——这意味着：
- ReviewPage 与 11 个工具均独立
- 8 个非-MindMap 工具（Quiz / FlashCard / StudyGuide / Feynman / TrickyProfessor / Trap / Terminology / MultiDocQA）彼此独立
- MindMap 三件套是个干净的链

可视化（精简）：
```
ReviewPage      ──independent──
QuizReviewPanel ──independent──
FlashCardPanel  ──independent──
StudyGuidePanel ──independent──
TerminologyPanel ──independent──
FeynmanPanel    ──independent──
TrickyProfessor ──independent──
TrapListPanel   ──independent──
MultiDocQAPanel ──independent──
MindMapPanel ──→ MindMapFlowCanvas ──→ MindMapFlowNode  (单链)
```

🟢 **无循环依赖。**

---

## 4. 跨模块借用

### 4.1 引用 @/features/...

逐一 grep 后：**0 处**。这 12 个文件都不依赖 features/ 下任何模块。

### 4.2 引用 @/shared/...

| 文件 | 引用 |
|------|------|
| [ReviewPage.tsx:11](components/ReviewPage.tsx) | `@/shared/studio/SavedArtifactPreview` 取 ArtifactFullView |

仅此 1 处。其余 11 个均不依赖 shared/。

### 4.3 引用 @/components/...

| 文件 | 引用 |
|------|------|
| MindMapPanel | `@/components/MindMapFlowCanvas`（review 内部依赖） |
| MindMapFlowCanvas | `@/components/MindMapFlowNode`（review 内部依赖） |

**全部都是 review 集群内部的引用**——没有跨 review-exam 借用，也没有引用 components/ 下其他 panel。这是搬迁最理想的状态。

---

## 5. 每个文件依赖的 utils/

| 文件 | 引用的 utils |
|------|-----------|
| ReviewPage | `collectSavedArtifactsFromLocalHistory`、`collectSavedArtifactsFromCloud`、`mergeArtifactLibraries`、`savedArtifactMeta` |
| QuizReviewPanel | 无 |
| FlashCardReviewPanel | 无 |
| StudyGuidePanel | 无 |
| TerminologyPanel | 无 |
| FeynmanPanel | 无 |
| TrickyProfessorPanel | 无 |
| TrapListPanel | 无 |
| MultiDocQAPanel | 无 |
| MindMapPanel | `mindMapFlowAdapter`（仅类型 `MindMapFlowNodeHandlers`） |
| MindMapFlowCanvas | `mindMapFlowAdapter`（值 + 类型）、`mindMapElkLayout`（layoutFlowForest） |
| MindMapFlowNode | `mindMapFlowAdapter`（值 + 类型）、`mindMapLabel`（getMindMapNodeLabel） |

### 5.1 utils/ 共享性分析

| utils 文件 | review 内引用 | 其他模块引用 | 是否 review 独占 |
|-----------|--------------|------------|----------------|
| `mindMapFlowAdapter.ts` | MindMapPanel + MindMapFlowCanvas + MindMapFlowNode | utils/mindMapLayout（仅 utils 间内部依赖） | ✅ MindMap 独占 |
| `mindMapElkLayout.ts` | MindMapFlowCanvas | — | ✅ MindMap 独占 |
| `mindMapLabel.ts` | MindMapFlowNode | — | ✅ MindMap 独占 |
| `mindMapLayout.ts` | （间接经 mindMapFlowAdapter） | mindMapFlowAdapter | ✅ MindMap 独占 |
| `collectSavedArtifactsFromLocalHistory.ts` | ReviewPage | — | ✅ ReviewPage 独占 |
| `collectSavedArtifactsFromCloud.ts` | ReviewPage | — | ✅ ReviewPage 独占 |
| `mergeArtifactLibraries.ts` | ReviewPage | — | ✅ ReviewPage 独占 |
| `savedArtifactMeta.ts` | ReviewPage | shared/studio/StudioPanel + shared/studio/SavedArtifactPreview | ❌ **跨 review + shared 共用** |

🔵 **`savedArtifactMeta.ts` 是唯一的跨域 utils**——按已确定方案应留在 `utils/`，等 P2 阶段 4 统一搬到 `lib/` 或就近合并。其他 7 个均严格独占。

---

## 6. services / @/types / 第三方

### services/ 依赖

| 文件 | 服务调用 |
|------|---------|
| ReviewPage | `@/services/firebase`（getUserSessions / fetchSessionDetails / updateCloudSessionState）、`@/services/storageService` |
| QuizReviewPanel | `@/services/geminiService`（generateQuizSet） |
| FlashCardReviewPanel | `@/services/geminiService`（estimateFlashCardCount / generateFlashCards） |
| StudyGuidePanel | `@/services/geminiService`（generateStudyGuide） |
| TerminologyPanel | `@/services/geminiService`（extractTerminology + 类型 TerminologyItem） |
| FeynmanPanel | `@/services/geminiService`（4 函数 + 2 类型 FeynmanQuestionResult / FeynmanAnswerFeedback） |
| TrickyProfessorPanel | `@/services/geminiService`（generateTrickyQuestions） |
| TrapListPanel | 无 |
| MultiDocQAPanel | `@/services/geminiService`（multiDocQAReply） |
| MindMapPanel | `@/services/geminiService`（4 函数） |
| MindMapFlowCanvas | 无 |
| MindMapFlowNode | 无 |

### @/types 依赖

| 文件 | 用到的类型 |
|------|----------|
| ReviewPage | CloudSession |
| QuizReviewPanel | QuizData, QuizRound |
| FlashCardReviewPanel | FlashCard |
| StudyGuidePanel | StudyGuide, StudyGuideFormat, StudyGuideContent |
| TerminologyPanel | 无（类型从 geminiService 取） |
| FeynmanPanel | 无（类型从 geminiService 取） |
| TrickyProfessorPanel | 无 |
| TrapListPanel | TrapItem |
| MultiDocQAPanel | ChatMessage |
| MindMapPanel | MindMapNode, MindMapMultiResult |
| MindMapFlowCanvas | MindMapNode |
| MindMapFlowNode | MindMapNode |

### 第三方库

- 共用：react、lucide-react
- `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`：StudyGuide、Feynman、TrickyProfessor、MultiDocQA 4 个面板共用（与已搬迁的 SkimPanel、SavedArtifactPreview 等一起，将来 P3 抽 `AppMarkdown` 共享件时它们都是候选）
- `@xyflow/react`：MindMapFlowCanvas + MindMapFlowNode（mindmap 独占第三方依赖）
- `firebase/auth`：仅 ReviewPage 用到（User 类型）

---

## 7. 归类建议

> 这一节是核心决策点，请你拍板。

### 7.1 12 个文件按预设方案归位（推荐）

| 文件 | 推荐目标路径 | 理由 |
|------|------------|------|
| ReviewPage.tsx | `features/review/ReviewPage.tsx` | 容器/入口性质（虽然实际不容纳 11 个工具，但产品语义是"复习总入口/产物库"） |
| QuizReviewPanel.tsx | `features/review/tools/QuizReviewPanel.tsx` | 学习工具 |
| FlashCardReviewPanel.tsx | `features/review/tools/FlashCardReviewPanel.tsx` | 学习工具 |
| StudyGuidePanel.tsx | `features/review/tools/StudyGuidePanel.tsx` | 学习工具 |
| TerminologyPanel.tsx | `features/review/tools/TerminologyPanel.tsx` | 学习工具 |
| FeynmanPanel.tsx | `features/review/tools/FeynmanPanel.tsx` | 学习工具 |
| TrickyProfessorPanel.tsx | `features/review/tools/TrickyProfessorPanel.tsx` | 学习工具 |
| TrapListPanel.tsx | `features/review/tools/TrapListPanel.tsx` | 学习工具 |
| MultiDocQAPanel.tsx | `features/review/tools/MultiDocQAPanel.tsx` | 学习工具（注意 §9 关于其工具函数的讨论） |
| MindMapPanel.tsx | `features/review/tools/mindMap/MindMapPanel.tsx` | mindmap 三件套 |
| MindMapFlowCanvas.tsx | `features/review/tools/mindMap/MindMapFlowCanvas.tsx` | mindmap 三件套 |
| MindMapFlowNode.tsx | `features/review/tools/mindMap/MindMapFlowNode.tsx` | mindmap 三件套 |

### 7.2 看起来"不该归 review"的文件

**没有**。12 个文件均符合 review 范畴，无误归。

### 7.3 与 CONTEXT.md / REFACTOR_P2_PLAN.md 预设方案的一致性

| 项 | CONTEXT.md 预设 | 本扫描发现 | 一致？ |
|----|---------------|-----------|-------|
| 候选 features/review/tools/ 列出 11 文件 | 11 文件 | 实际 12 文件（计 ReviewPage + 11 工具，CONTEXT 把 ReviewPage 也列在 review 系列里） | ✅ 一致 |
| ReviewPage 作容器 | ✓ | 但 ReviewPage 实际**不挂载** 11 个工具——它是独立的"学习产物库"页面 | ⚠️ 语义偏差（不影响搬迁路径） |
| MindMap 三件套放子目录 | ✓ | 三件套确实是干净的单链 | ✅ 一致 |

⚠️ **语义偏差说明**：CONTEXT.md / REFACTOR_P2_PLAN.md 里把 ReviewPage 描述为"review 容器"。实际它是个**独立页面**（产物总库），与其余 11 个工具完全无 import 关系。搬迁路径依然合理（`features/review/ReviewPage.tsx`），但搬完后**不要写代码注释说"它是 11 个 tools 的容器"**——这是错的。

### 7.4 相互依赖紧密、应该作为子目录的

仅 **MindMap 三件套**（MindMapPanel + MindMapFlowCanvas + MindMapFlowNode）符合这个标准。其余 9 个文件之间没有任何 import 关系，扁平化在 `tools/` 下即可。

---

## 8. 搬迁批次建议

### 方案 A：1 批搬完 12 个（推荐）

理由：
- 12 个文件之间只有 2 条内部依赖（MindMapPanel→Canvas→Node），都在 mindMap 三件套内部，一次搬完后内部 import 路径直接更新到 `@/features/review/tools/mindMap/...` 就能解析
- 外部 import 改动 = App.tsx **10 行**（涵盖 10 个 panel；其中 line 29 的 MultiDocQAPanel 含 4 个名称，但 specifier 只改 1 处） + **0 行其他文件**（features/、shared/、其他 components 都不引用） = 共 10 行
- LoadingInteractiveContent 已搬完证明此体量没问题
- review 集群本身就是独立的、与外界无紧密耦合的——一次切干净心智轻

预计影响：
```
git mv 操作：       12 个
新增目录：          features/review/ + tools/ + tools/mindMap/
本批改动 import 行数：
  - 12 个组件内部：MindMapPanel→Canvas 1 行 + Canvas→Node 1 行 = 2 行
  - App.tsx：       10 行
  - 其他外部：       0 行
  合计：             ~12 行
预计 tsc 错误数：    10（与基线一致）
预计搬迁时间：       单批一次完成
```

### 方案 B：分 2 批

- **第 2a 批**：8 个独立工具 + ReviewPage = 9 文件
- **第 2b 批**：MindMap 三件套（3 文件）

如果你想每批小一些更稳，选 B。但 mindmap 三件套很干净（依赖图明确），分批反而拉长流程。**推荐 A。**

### 方案 C：分 3 批

- **第 2a 批**：ReviewPage 独立搬到 `features/review/`
- **第 2b 批**：8 个 tools 搬到 `features/review/tools/`
- **第 2c 批**：MindMap 三件套搬到 `features/review/tools/mindMap/`

理由是 ReviewPage 与其余 11 个工具其实没耦合，可以视为独立。但搬迁机械成本（3 个 commit）vs 节省心智，性价比偏低。**不推荐**。

---

## 9. 风险提示

### 9.1 `MultiDocQAPanel.tsx` 含工具函数（需用户拍板）

[App.tsx:29](App.tsx) 当前是：
```ts
import { MultiDocQAPanel, getMultiDocQAConversationKey, loadMultiDocQAMessages, saveMultiDocQAMessages } from '@/components/MultiDocQAPanel';
```

`MultiDocQAPanel.tsx` 除了 React 组件，还**导出 3 个工具函数**（管理对话存储 key 与读写）。这是个**职责混合**：组件文件不该兼任 storage helper。

**两种处理**：
- (a) 本批不动，maintain 现状——组件搬到 `features/review/tools/MultiDocQAPanel.tsx` 后 3 个工具函数也跟着搬，**导出同样保留**。App.tsx 改路径即可。
- (b) 本批拆分——把 3 个工具函数抽到 `features/review/tools/multiDocQAStorage.ts`，组件文件只做 UI，App.tsx 拆成 2 行 import。

⚠️ (b) 是更干净的架构改动，但已超出"搬迁"范畴，引入业务逻辑改动风险。**推荐 (a) 不动**，留到 REFACTOR_PLAN.md 阶段 4（拆巨型组件）时一并处理。

### 9.2 utils/mindMap*.ts（4 文件）（需用户拍板）

`mindMapElkLayout` / `mindMapFlowAdapter` / `mindMapLabel` / `mindMapLayout` 这 4 个 utils **完全是 mindmap 三件套独占**（彼此互引一次，外部 0 引用）。

按理可以**就近搬**到 `features/review/tools/mindMap/` 下，与三件套同居（变成 7 文件子目录）。

但当前已确定方案：**utils/ 留待 P2 阶段 4 统一搬到 lib/**，不在本批拆分。所以 mindMap 三件套搬过去之后，它们 import 的 `@/utils/mindMap*` **路径不改、保持原样**——别名仍能正常解析。

⚠️ 风险：搬完 mindMap 三件套后，你会看到这 3 个文件还在 import `@/utils/mindMap*`，如果未来某次"ctrl+F 看 features/ 下还引哪些 utils"会发现这一组耦合在 utils/——这是**计划内的过渡状态**，等阶段 4 一并搬即可。

### 9.3 ReviewPage 与"review/tools 集合"无 import 关系

如 §2 / §7 强调：搬到 features/review/ 后，**目录结构看起来像 ReviewPage 容器 + tools/ 子目录**，但实际上 ReviewPage **不挂载** 11 个工具，11 个工具都由 App.tsx 直接挂载。

后续如果有新 AI 看 features/review/ 这个目录、误以为 ReviewPage 是 11 个工具的入口、去 ReviewPage 里加新工具——会犯错。建议在 commit message 或后续文档（CONTEXT.md "产品事实修正"段）里加一行说明：

> `features/review/ReviewPage.tsx` 是独立的"学习产物库页面"，不挂载 `features/review/tools/` 下的工具。11 个工具均由 App.tsx 直接挂载。

### 9.4 第三方依赖差异

`@xyflow/react` 是 mindmap 独占，建议未来若做依赖分析、按需加载等优化时，mindmap 三件套（含 utils）可以视作一个**可代码分割单元**。本批不影响。

### 9.5 ReactMarkdown 重复主题代码

StudyGuide / Feynman / TrickyProfessor / MultiDocQA 4 个 panel 各自实现了 `MarkdownComponents` 主题（与 SkimPanel 等也类似）。本批**不动**，等 P3 抽 `AppMarkdown` 共享件统一处理。提醒一下避免搬迁时被这些重复样式分心。

---

## 10. 用户决策点（请拍板这几条）

- [ ] **Q1**：MultiDocQAPanel 内的 3 个工具函数（getMultiDocQAConversationKey 等）本批保持现状还是拆出 `multiDocQAStorage.ts`？（推荐保持不动，留待阶段 4）
- [ ] **Q2**：utils/mindMap{ElkLayout,FlowAdapter,Label,Layout}.ts 本批是跟着 mindmap 一起搬到 `features/review/tools/mindMap/`，还是留在 utils/ 等阶段 4？（推荐留 utils/，与 textUtils / savedArtifactMeta 等其他独占 utils 一致策略）
- [ ] **Q3**：ReviewPage 与 11 个工具的语义偏差是否在 commit message / CONTEXT.md 中标注？（推荐：在本批 MIGRATION 报告里写一节"产品事实修正"，CONTEXT.md 加一条记录）
- [ ] **Q4**：批次方案选 A（1 批搬完 12 个）、B（分 2 批：tools + mindmap）、还是 C（分 3 批：ReviewPage + tools + mindmap）？（推荐 A）
- [ ] **Q5**：mindmap 三件套放 `tools/mindMap/` 子目录，还是平铺 `tools/`（即 `tools/MindMapPanel.tsx` + `tools/MindMapFlowCanvas.tsx` + `tools/MindMapFlowNode.tsx`）？（推荐子目录——三件套是独立可分割单元，子目录心智清晰）

---

## 11. 与历史报告的一致性核验

| 早期判断（来自 [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) / [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md)） | 本扫描发现 | 一致？ |
|------|---------|-------|
| ReviewPage 容器 + tools/ 子目录 | 路径一致；语义有偏差（ReviewPage 不挂载 tools） | ⚠️ 路径一致、语义需修正 |
| MindMap 三件套同子目录 | ✓ | ✅ |
| 11 个 tools 之间应该相互独立 | 实测均独立（仅 mindMap 三件套有内链） | ✅ |
| `features/review/` 内只引 utils + services + types | 实测无跨 features 借用 | ✅ |
| `MultiDocQAPanel` 含工具函数被一并 import | 早期文档未提及——本扫描首次发现 | 🆕 新发现 |

---

*预扫描完。零代码改动、零目录创建、零 git mv。等你看完发正式包。
本批是 review/ 区域的整体收官——12 文件、2 条内部依赖、跨域耦合 1 处（ReviewPage→shared/studio/）。
是 P2 阶段 3 至今体量最大的一批，但内部结构最干净。*
