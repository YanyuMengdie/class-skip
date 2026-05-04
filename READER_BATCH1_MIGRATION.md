# P2 第 5 次搬迁报告：reader 第 1 批（5 个独立组件）

> P2 阶段 2 · Batch 1/3
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/SlideViewer.tsx`（547 行） | [`features/reader/slide-viewer/SlideViewer.tsx`](features/reader/slide-viewer/SlideViewer.tsx) |
| `git mv` | `components/SlidePageComments.tsx`（215 行） | [`features/reader/page-notes/SlidePageComments.tsx`](features/reader/page-notes/SlidePageComments.tsx) |
| `git mv` | `components/PageMarkPanel.tsx`（208 行） | [`features/reader/marks/PageMarkPanel.tsx`](features/reader/marks/PageMarkPanel.tsx) |
| `git mv` | `components/ExplanationPanel.tsx`（674 行） | [`features/reader/deep-read/ExplanationPanel.tsx`](features/reader/deep-read/ExplanationPanel.tsx) |
| `git mv` | `components/SideQuestPanel.tsx`（149 行） | [`features/reader/side-quest/SideQuestPanel.tsx`](features/reader/side-quest/SideQuestPanel.tsx) |

新建目录：`features/reader/`、`slide-viewer/`、`page-notes/`、`marks/`、`deep-read/`、`side-quest/`。5 次 git mv 全部识别为 **R (rename)**。

---

## 2. 修改的引用

仅 [App.tsx](App.tsx) 一处文件、5 行改动：

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| App.tsx | 5 | `'@/components/SlideViewer'` | `'@/features/reader/slide-viewer/SlideViewer'` |
| App.tsx | 6 | `'@/components/SlidePageComments'` | `'@/features/reader/page-notes/SlidePageComments'` |
| App.tsx | 7 | `'@/components/ExplanationPanel'` | `'@/features/reader/deep-read/ExplanationPanel'` |
| App.tsx | 17 | `'@/components/SideQuestPanel'` | `'@/features/reader/side-quest/SideQuestPanel'` |
| App.tsx | 20 | `'@/components/PageMarkPanel'` | `'@/features/reader/marks/PageMarkPanel'` |

App.tsx 内其他出现位置（line 2057-2058 `commonSlideViewer`、line 2099 `<ExplanationPanel>`、line 2257 `<SideQuestPanel>`、line 2383 `<PageMarkPanel>`、line 2776 `<SlidePageComments>`）只用名字不引路径，**无需改动**。

---

## 3. 实际依赖核实（直接读源，逐个确认）

### SlideViewer.tsx
```ts
import React, { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, Coffee, X, Download, ... } from 'lucide-react';
import { Slide, SlideAnnotation } from '@/types';
import { plainTextToHtmlWithSupSub } from '@/utils/textUtils';
```
✅ 仓库内 import：`@/types` + `@/utils/textUtils`，已是别名形式。

### SlidePageComments.tsx
```ts
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical, Plus, Trash2, GripHorizontal, ChevronDown } from 'lucide-react';
import { SlidePageComment } from '@/types';
```
✅ 仓库内 import：仅 `@/types`，已是别名形式。

### PageMarkPanel.tsx
```ts
import React, { useState } from 'react';
import { X, Star, Lightbulb, FileText, AlertTriangle, ... } from 'lucide-react';
import { MarkType, MarkPriority, PageMark } from '@/types';
```
✅ 仓库内 import：仅 `@/types`，已是别名形式。

### ExplanationPanel.tsx
```ts
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Sparkles, RefreshCw, Send, ... } from 'lucide-react';
import { ChatMessage } from '@/types';
import { plainTextToHtmlWithSupSub, normalizeSelectionText, dedupeHtml } from '@/utils/textUtils';
import { LoadingInteractiveContent } from '@/components/LoadingInteractiveContent';   // ⚠️ 仍指 components/
```
✅ 仓库内 import：3 处，均已是别名形式。
**注意**：line 10 的 `@/components/LoadingInteractiveContent` 仍指向 `components/` 目录——**这是有意保留**的：
- `LoadingInteractiveContent` 不在本批搬迁清单，仍留在 `components/LoadingInteractiveContent.tsx`
- `@/` 别名是按"项目根 + 后续路径"解析的，所以这个路径仍能正确找到文件
- 后续若把 `LoadingInteractiveContent` 也搬到 `features/reader/deep-read/`（按 P2_DEPENDENCY_SCAN 推荐），再同步改这一行
- tsc 已确认无 "Cannot find module" 错误

### SideQuestPanel.tsx
```ts
import React, { useRef, useEffect, useState } from 'react';
import { X, Send, Sparkles, BookOpen, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { ChatMessage } from '@/types';
```
✅ 仓库内 import：仅 `@/types`，已是别名形式。SideQuestPanel **不直接调 geminiService**——选词监听 + AI 调用都在 App.tsx，结果通过 props 传入（与 P2_DEPENDENCY_SCAN 预期一致）。

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

10 个错误均历史遗留。

---

## 5. 是否有意外发现

**无**，全部按预期。
- ✅ 5 个组件外部 import 全部仅在 App.tsx（与依赖扫描预测一致）
- ✅ 5 个组件互不依赖（grep 确认）
- ✅ 所有内部 import 均已是 `@/` 别名形式，搬迁过程中无需手改任何 specifier
- ✅ ExplanationPanel 对 `LoadingInteractiveContent` 的引用通过 `@/` 别名仍能解析（后者未搬，留在 components/）
- ✅ tsc 通过

---

## 6. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

- [ ] **SlideViewer**：上传一份 PDF（或选历史文档），左侧 PDF 翻页器正常显示，能翻页、缩放、标注（划线/便签）
- [ ] **SlidePageComments**：当前页下方"本页注释"条能展开/折叠，能添加注释并保存
- [ ] **PageMarkPanel**：Header → "更多"菜单 → "重点标记"按钮 → 全屏弹窗能打开，能给当前页加星
- [ ] **ExplanationPanel（精读）**：默认精读模式下，右侧讲解面板正常显示。在 PDF 上选一段文字，能看到讲解流程
- [ ] **SideQuestPanel（展开讲讲）**：选中页面文字 → 出现"展开讲讲"小浮层 → 点击 → SideQuestPanel 在右侧打开 → 能正常对话
- [ ] 切到略读模式（顶栏"进入略读"按钮）后切回精读，行为正常
- [ ] 整体无白屏、无 console error

如果以上都通过，第 1 批 commit 后告诉我"下一批"，我会开始第 2 批（略读 5 文件）。

---

## 7. 建议的 git commit message

```
refactor(p2): 把 5 个独立阅读组件搬到 features/reader/

- git mv components/SlideViewer.tsx → features/reader/slide-viewer/
- git mv components/SlidePageComments.tsx → features/reader/page-notes/
- git mv components/PageMarkPanel.tsx → features/reader/marks/
- git mv components/ExplanationPanel.tsx → features/reader/deep-read/
- git mv components/SideQuestPanel.tsx → features/reader/side-quest/
- App.tsx 5 处 import 路径改为 @/features/reader/...
- ExplanationPanel 内 @/components/LoadingInteractiveContent 暂留（待后续整理）
- 组件内部其他 import 均已是 @/ 别名，无需改动
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 2 第 1 批：5 个独立 reader 组件归位。
```

---

*报告完。等用户验证通过后手动 commit。第 2 批（略读 5 文件）需用户说"下一批"再开始。*
