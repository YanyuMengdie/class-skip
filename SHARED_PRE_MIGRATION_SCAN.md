# Shared 预搬迁扫描报告（只读、未动任何文件）

> P2 阶段 3 第 1 批的预调查。
> 范围：[CONTEXT.md](CONTEXT.md) "候选 shared/（9 文件）" 清单。
> 生成时间：2026-05-04 · refactor 分支当前状态

---

## 1. 每个文件的当前真实状态

✅ **9 个文件全部真实存在**（已 ls 实测）。

| 文件 | 行数 | 是否存在 |
|------|------|---------|
| [components/Header.tsx](components/Header.tsx) | 523 | ✓ |
| [components/Sidebar.tsx](components/Sidebar.tsx) | 972 | ✓ |
| [components/WelcomeScreen.tsx](components/WelcomeScreen.tsx) | 83 | ✓ |
| [components/LoginModal.tsx](components/LoginModal.tsx) | 150 | ✓ |
| [components/HistoryModal.tsx](components/HistoryModal.tsx) | 104 | ✓ |
| [components/MusicPlayer.tsx](components/MusicPlayer.tsx) | 116 | ✓ |
| [components/LoadingInteractiveContent.tsx](components/LoadingInteractiveContent.tsx) | 233 | ✓ |
| [components/StudioPanel.tsx](components/StudioPanel.tsx) | 110 | ✓ |
| [components/SavedArtifactPreview.tsx](components/SavedArtifactPreview.tsx) | 284 | ✓ |
| **合计** | **2575 行** | — |

### 1.1 各文件 import 头部清单

#### Header.tsx
```ts
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, ChevronLeft, ... } from 'lucide-react';
import { MusicPlayer } from '@/components/MusicPlayer';     // ← 内部依赖
import { ViewMode } from '@/types';
import { User } from 'firebase/auth';
```

#### Sidebar.tsx
```ts
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutGrid, Cloud, ... } from 'lucide-react';
import { User } from 'firebase/auth';
import { getUserSessions, renameCloudSession, moveSession, createCloudFolder,
         addCalendarEvent, getCalendarEvents, deleteCalendarEvent,
         addMemo, getMemos, deleteMemo } from '@/services/firebase';   // ← 10 个函数
import { CloudSession, CalendarEvent, Memo, PageMarks, PageMark, MarkType } from '@/types';
```

#### WelcomeScreen.tsx
```ts
import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
```
**仓库内 import：0**（最干净）。

#### LoginModal.tsx
```ts
import React, { useState } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { loginWithGoogle, sendEmailLoginLink } from '@/services/firebase';
```

#### HistoryModal.tsx
```ts
import React from 'react';
import { X, Clock, FileText, Trash2, ExternalLink } from 'lucide-react';
import { FileHistoryItem } from '@/types';
```

#### MusicPlayer.tsx
```ts
import React, { useState } from 'react';
import { Music, Play, Pause, Volume2, X } from 'lucide-react';
```
**仓库内 import：0**。

#### LoadingInteractiveContent.tsx
```ts
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
```
**仓库内 import：0**。

#### StudioPanel.tsx
```ts
import React from 'react';
import { BookOpen, Trash2, ChevronRight } from 'lucide-react';
import { SavedArtifact } from '@/types';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META, formatSavedArtifactTime as formatTime } from '@/utils/savedArtifactMeta';

// 关键：line 6-7 是 re-export
export { ArtifactFullView } from '@/components/SavedArtifactPreview';                  // ← 内部依赖
export type { ArtifactFullViewProps } from '@/components/SavedArtifactPreview';        // ← 内部依赖
```

#### SavedArtifactPreview.tsx
```ts
import React, { useState, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ZoomIn, ZoomOut, X } from 'lucide-react';
import { SavedArtifact, MindMapNode, TerminologyItemForArtifact } from '@/types';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META } from '@/utils/savedArtifactMeta';
```

---

## 2. 谁在 import 这 9 个文件

逐文件全仓 grep 后整理。表中"调用方"仅指**真正引入路径**的位置（排除注释中提到名字、JSX 标签使用、变量名等噪音）。

| 被 import 的文件 | 调用方 | 调用类型 |
|---|---|---|
| [Header.tsx](components/Header.tsx) | [App.tsx:4](App.tsx) | 全局壳，仅 1 处 |
| [Sidebar.tsx](components/Sidebar.tsx) | [App.tsx:9](App.tsx) | 全局壳，仅 1 处 |
| [WelcomeScreen.tsx](components/WelcomeScreen.tsx) | [App.tsx:16](App.tsx) | 仅 1 处 |
| [LoginModal.tsx](components/LoginModal.tsx) | [App.tsx:32](App.tsx) | 仅 1 处 |
| [HistoryModal.tsx](components/HistoryModal.tsx) | [App.tsx:13](App.tsx) | 仅 1 处 |
| [MusicPlayer.tsx](components/MusicPlayer.tsx) | [Header.tsx:4](components/Header.tsx) | **仅 Header 一家** |
| [LoadingInteractiveContent.tsx](components/LoadingInteractiveContent.tsx) | [features/reader/deep-read/ExplanationPanel.tsx:10](features/reader/deep-read/ExplanationPanel.tsx) | **仅 ExplanationPanel 一家** |
| [StudioPanel.tsx](components/StudioPanel.tsx) | [App.tsx:30](App.tsx) `import { StudioPanel, ArtifactFullView } from '@/components/StudioPanel';` | 仅 1 处 |
| [SavedArtifactPreview.tsx](components/SavedArtifactPreview.tsx) | [StudioPanel.tsx:6-7](components/StudioPanel.tsx)（re-export ArtifactFullView 和类型）<br>[components/ReviewPage.tsx:11](components/ReviewPage.tsx)（`import { ArtifactFullView }`） | 直接 2 处 + 1 处通过 StudioPanel 间接 |

⚠️ **关键观察**：
- `App.tsx:30` 通过 `import { StudioPanel, ArtifactFullView }` 同时拿到 StudioPanel 和 ArtifactFullView（后者由 StudioPanel re-export 自 SavedArtifactPreview）。这意味着搬迁时：
  - 如果 StudioPanel 和 SavedArtifactPreview 一起搬到 shared/，App.tsx 的 import 路径只需改 1 处
  - 如果分开搬（例如 SavedArtifactPreview 进 features/review/，StudioPanel 进 shared/），re-export 链跨模块仍可工作但语义乱
- ReviewPage 直接 import SavedArtifactPreview 也是事实——这两个组件**同时被 shared 区（App.tsx）和 review 区（ReviewPage）使用**，归 shared 是合理的。

---

## 3. 9 个文件之间的内部依赖

| 依赖方 | 被依赖方 | 类型 |
|--------|---------|------|
| Header | MusicPlayer | 直接 import（[Header.tsx:4](components/Header.tsx)） |
| StudioPanel | SavedArtifactPreview | 透明 re-export（[StudioPanel.tsx:6-7](components/StudioPanel.tsx) `export { ArtifactFullView } from '@/components/SavedArtifactPreview';`） |

**仅有这两条**。其余 7 个文件之间两两均**无任何 import**。

可视化（精简）：
```
Header  ──→ MusicPlayer
StudioPanel  ──re-export──→ SavedArtifactPreview
其他 5 个互相独立。
```

🟢 **无循环依赖**。

---

## 4. 每个文件依赖的 utils/

| 文件 | 引用的 utils |
|------|-----------|
| Header | 无 |
| Sidebar | 无 |
| WelcomeScreen | 无 |
| LoginModal | 无 |
| HistoryModal | 无 |
| MusicPlayer | 无 |
| LoadingInteractiveContent | 无 |
| StudioPanel | `@/utils/savedArtifactMeta` |
| SavedArtifactPreview | `@/utils/savedArtifactMeta` |

`@/utils/savedArtifactMeta` 是 9 个文件中唯一被引用的 utils，被 StudioPanel + SavedArtifactPreview 两兄弟共用。该文件还被 [components/ReviewPage.tsx](components/ReviewPage.tsx)（review 候选）用，所以是**跨 shared + review 共用**——按已确定方案应留在 `utils/`，等 P2 阶段 4 统一搬到 `lib/` 或就近合并。

---

## 5. 每个文件依赖的 services/ 与 @/types

### services/ 依赖
| 文件 | 服务调用 |
|------|---------|
| Sidebar | `@/services/firebase`（10 个函数：getUserSessions / renameCloudSession / moveSession / createCloudFolder / addCalendarEvent / getCalendarEvents / deleteCalendarEvent / addMemo / getMemos / deleteMemo） |
| LoginModal | `@/services/firebase`（loginWithGoogle / sendEmailLoginLink） |
| 其他 7 个 | 无 |

### @/types 依赖
| 文件 | 用到的类型 |
|------|----------|
| Header | ViewMode |
| Sidebar | CloudSession, CalendarEvent, Memo, PageMarks, PageMark, MarkType |
| WelcomeScreen | 无 |
| LoginModal | 无 |
| HistoryModal | FileHistoryItem |
| MusicPlayer | 无 |
| LoadingInteractiveContent | 无 |
| StudioPanel | SavedArtifact |
| SavedArtifactPreview | SavedArtifact, MindMapNode, TerminologyItemForArtifact |

### 第三方
- 共用：react、lucide-react
- Sidebar / Header 用：firebase/auth (User type)
- Header 用：react-dom (createPortal)
- SavedArtifactPreview 用：react-markdown + remark-gfm + remark-math + rehype-katex（这是项目中第 14 个使用 ReactMarkdown 的组件——P3 阶段抽 `AppMarkdown` 共享件时它属于候选之一）

---

## 6. 归类建议

> 这一节是核心决策点，请你拍板。

### 6.1 真正"shared"的 5 个（无歧义）

这 5 个被 App.tsx 直接挂载、属于全局壳层 / 入口浮层性质，归 shared/ 毫无争议：

| 文件 | 理由 |
|------|------|
| **Header** | 顶部导航栏，永久可见 |
| **Sidebar** | 左侧抽屉，永久可见 |
| **WelcomeScreen** | 启动欢迎页 |
| **LoginModal** | 登录入口（任何 feature 触发都可能弹出） |
| **HistoryModal** | 历史记录入口 |

### 6.2 边缘归类的 4 个（需你拍板）

| 文件 | 当前调用方 | 归类候选 | 我的建议 |
|------|----------|----------|----------|
| **MusicPlayer** | 仅 Header 一家 | (a) `shared/MusicPlayer.tsx` 平铺；(b) `shared/Header/MusicPlayer.tsx` 与 Header 同居 | (a) 平铺。理由：未来如果有"番茄钟弹层" / "上课模式" / "海龟汤" 等也想嵌音乐，复用更顺；与 Header 同居反而锁死成 Header 私有件 |
| **LoadingInteractiveContent** | 仅 ExplanationPanel 一家（在 features/reader/deep-read/） | (a) 跟着归 `features/reader/deep-read/LoadingInteractiveContent.tsx`；(b) 留 shared 公共动画 | **(a) 归 features/reader/deep-read/**。理由：单一调用方且业务紧贴精读场景（"AI 思考动画"内容里的提示词都是关于学习的）。这不是真正的 shared。建议从本批 shared 移除，单独搬到 features/reader/deep-read/ 下 |
| **StudioPanel** | App.tsx 一家（同时通过它拿 ArtifactFullView） | (a) `shared/`；(b) `features/review/` | (a) shared/。理由：App.tsx 直接挂载 + 是"已生成产物" 的展示容器，跨多个 feature 性质 |
| **SavedArtifactPreview** | StudioPanel + ReviewPage 两家 | (a) `shared/`；(b) `features/review/`（与 ReviewPage 同居）；(c) `features/artifacts/` 独立 feature | **(a) shared/**。理由：与 StudioPanel 是兄弟 + 跨 review/App 共用 + 体量小（284 行） |

### 6.3 最终建议清单

按上述决策，本次正式搬迁应是 **8 个文件**（不是 9 个）：

- ✅ 8 个进 shared/：Header、MusicPlayer、Sidebar、WelcomeScreen、LoginModal、HistoryModal、StudioPanel、SavedArtifactPreview
- ❌ LoadingInteractiveContent **从本批移除**——单独走一个 mini commit 搬到 features/reader/deep-read/

如果你不同意"LoadingInteractiveContent 应归 deep-read"这个建议，告诉我即可，把它留在 shared 也能跑通（只是语义稍弱）。

---

## 7. shared/ 子目录结构建议

两种风格，请你选：

### 风格 A：扁平
```
shared/
├── Header.tsx
├── MusicPlayer.tsx
├── Sidebar.tsx
├── WelcomeScreen.tsx
├── LoginModal.tsx
├── HistoryModal.tsx
├── StudioPanel.tsx
└── SavedArtifactPreview.tsx
```
✅ 简单、改 import 路径短（`@/shared/Header`）
❌ 8 个文件平铺没有分组语义

### 风格 B：按功能分子目录
```
shared/
├── layout/
│   ├── Header.tsx
│   ├── MusicPlayer.tsx
│   ├── Sidebar.tsx
│   └── WelcomeScreen.tsx
├── auth/
│   └── LoginModal.tsx
├── history/
│   └── HistoryModal.tsx
└── studio/
    ├── StudioPanel.tsx
    └── SavedArtifactPreview.tsx
```
✅ 与 [REFACTOR_P2_PLAN.md §1.21-1.22](REFACTOR_P2_PLAN.md) 中早期分类一致
✅ 有清晰语义（"全局壳层" vs "入口弹窗" vs "产物展示"）
❌ 路径稍长（`@/shared/layout/Header`）

**我的建议：风格 B**，理由：与 reader/ 已经采用的"按子功能分目录"一致（`features/reader/skim/`、`features/reader/notebook/` 等），目录心智统一；且 8 个文件分 4 组的颗粒度刚好。

---

## 8. 搬迁批次建议

### 方案 A：1 批搬完 8 个（推荐）

理由：
- 8 个文件之间只有 2 条内部依赖（Header→MusicPlayer，StudioPanel→SavedArtifactPreview），都是 shared 内部，一次搬完后内部 import 路径全部直接更新到 `@/shared/...` 就能解析
- 外部 import 改动 = App.tsx 6 行（Header / Sidebar / WelcomeScreen / LoginModal / HistoryModal / StudioPanel）+ ReviewPage 1 行（SavedArtifactPreview）= 共 7 行，比 reader 第 1 批的 5 行多一点
- LoadingInteractiveContent 单独走另一个 mini commit（features/reader/deep-read/，仅 1 文件 1 行 ExplanationPanel import 改）

### 方案 B：分 2 批

第 1a 批：5 个无歧义（Header + MusicPlayer + Sidebar + WelcomeScreen + LoginModal + HistoryModal = 6 文件含 MusicPlayer）
第 1b 批：StudioPanel + SavedArtifactPreview（产物两件套，需要协调 ReviewPage import）

如果你想稳一些（每个验证后再继续），选 B。如果你信心 OK 选 A，因为 reader 第 1 批 5 文件一次搬已经验证此体量没问题。

---

## 9. 搬迁后预期影响

按方案 A + 风格 B 估算：

```
git mv 操作：     8 个
新增目录：        shared/ + 4 个子目录（layout、auth、history、studio）
本批改动 import 行数：
  - 8 个组件内部：Header→MusicPlayer 1 行 + StudioPanel→SavedArtifactPreview 2 行（re-export 两条）= 3 行
  - App.tsx：     6 行
  - ReviewPage：  1 行
  合计：          ~10 行
预计 tsc 错误数：  10（与基线一致）
预计搬迁时间：    单批一次完成
```

---

## 10. 用户决策点（请拍板这几条）

- [ ] **Q1**：LoadingInteractiveContent 归 shared 还是搬去 features/reader/deep-read/？（推荐后者）
- [ ] **Q2**：MusicPlayer 平铺 shared/ 还是与 Header 同居 shared/layout/？（推荐与 Header 同居 shared/layout/）
- [ ] **Q3**：StudioPanel + SavedArtifactPreview 归 shared/studio/、features/review/、features/artifacts/ 哪个？（推荐 shared/studio/）
- [ ] **Q4**：子目录风格选 A（扁平）还是 B（按功能分组 layout/auth/history/studio）？（推荐 B）
- [ ] **Q5**：1 批搬完 8 个，还是分 2 批？（推荐 1 批）

---

## 11. 与历史报告的一致性核验

[P2_DEPENDENCY_SCAN.md §1.21-1.22 + §3](P2_DEPENDENCY_SCAN.md) 的早期判断：
- ✅ Header / Sidebar / WelcomeScreen → shared/layout/（与本扫描一致）
- ✅ LoginModal → shared/auth/、HistoryModal → shared/history/（与本扫描一致）
- ✅ MusicPlayer → 与 Header 同居（与本扫描推荐一致）
- ⚠️ LoadingInteractiveContent：当时建议归 features/reader/deep-read/（与本扫描一致——CONTEXT.md 当前误把它列入 shared 候选）
- ⚠️ StudioPanel + SavedArtifactPreview：当时建议归 features/studio/；本扫描建议 shared/studio/——两者目录树位置略有不同但都聚拢两兄弟。是否独立成一级 feature 由你定。

---

*预扫描完。零代码改动、零目录创建、零 git mv。等你看完发正式包。*
