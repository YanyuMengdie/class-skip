# Notebook 预搬迁扫描报告（只读、未动任何文件）

> P2 阶段 2 第 3 批的预调查。
> 唯一任务：搞清楚 [components/Notebook.tsx](components/Notebook.tsx) 真实依赖关系。
> 生成时间：refactor 分支当前状态

---

## 1. Notebook.tsx 全部 import 清单

文件共 4 行 import 语句：

| 行 | 完整 import | 来源分类 |
|----|-------------|----------|
| 1 | `import React, { useState } from 'react';` | 第三方库（npm） |
| 2 | `import { Book, ChevronDown, ChevronRight, Download, Trash2, StickyNote, PenLine, Layers, Rocket } from 'lucide-react';` | 第三方库（npm） |
| 3 | `import { PageNotes, Note } from '@/types';` | `@/types`（项目根 types.ts，全局类型） |
| 4 | `import { normalizeSelectionText, noteDisplayWithSuperscript, stripHtml } from '@/utils/textUtils';` | `@/utils`（仓库 utils 文件夹） |

**分组小结**：

| 分组 | 数量 | 内容 |
|------|------|------|
| 第三方库 | 2 | `react`、`lucide-react` |
| `@/types` | 1 | 用类型 `PageNotes` 和 `Note` |
| `@/services` | **0** | ✅ Notebook **不调任何 services**（不调 firebase、不调 geminiService、不调 storageService） |
| `@/components` | **0** | ✅ Notebook **不引用任何其他 components/** 下的组件 |
| `@/utils` | 1 | `@/utils/textUtils` 的 3 个函数 |
| `@/features/...` | **0** | ✅ Notebook **不依赖任何已搬到 features/ 下的内容** |
| 相对路径 import | **0** | ✅ 全部已是 `@/` 别名 |

---

## 2. 谁在 import Notebook

全仓库 grep `Notebook` 命中后逐条筛掉非 import 项（types 字段名、变量名、文档注释、其他 *Notebook 派生组件名等），**真正 import `Notebook` 组件本身的仅 1 处**：

| 文件 | 行 | 内容 |
|------|----|------|
| [App.tsx](App.tsx) | 12 | `import { Notebook } from '@/components/Notebook';` |

App.tsx 内其他出现位置不需改：
- line 2845：JSX 标签 `<Notebook fileName=... notes=... onUpdateNote=... onDeleteNote=... />`（仅用名字）
- line 1897-1899：`handleAddNote / handleUpdateNote / handleDeleteNote` 三个回调（不引路径，与 Notebook 文件无关）
- line 301、696：`notebookData` state 与恢复（这是数据，不是组件）
- line 2094、2106：`onNotebookAdd` props 传给 ExplanationPanel/SkimPanel 的回调（不是 import）
- line 177：注释中提到 NotebookLM

其他文件中"Notebook"字样（[types.ts](types.ts)、[services/firebase.ts](services/firebase.ts)、[features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx)、[features/reader/deep-read/ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx)、[components/SavedArtifactPreview.tsx](components/SavedArtifactPreview.tsx)）全部是：
- `NotebookData` 类型（不是组件）
- `onNotebookAdd` prop 名（回调名）
- `notebookDraftHint` 等局部变量
- "NotebookLM 式" 注释

——**无任何额外 import**。

---

## 3. Notebook.tsx 当前文件大小

**269 行**（`wc -l` 实测）。

---

## 4. 是否跨模块借用 features/ 下的文件

**完全没有**。

逐一核查目标关键字：

| 候选跨模块 import | 结果 |
|-------------------|------|
| `@/features/reader/skim/skimMarkdownTheme` | ❌ 无 |
| `@/features/reader/skim/skimMarkdownToExportHtml` | ❌ 无（且这个文件本来也不存在，见上一份 [READER_BATCH2_SKIM_MIGRATION.md §5](READER_BATCH2_SKIM_MIGRATION.md)） |
| `@/features/reader/skim/...`（任何文件） | ❌ 无 |
| `@/features/reader/slide-viewer/...` | ❌ 无 |
| `@/features/reader/deep-read/...` | ❌ 无 |
| `@/features/reader/...`（任何） | ❌ 无 |
| `@/features/turtleSoup/...` | ❌ 无 |
| `@/features/lecture/...` | ❌ 无 |
| `@/features/energyRefuel/...` | ❌ 无 |
| `@/features/sessionStart/...` | ❌ 无 |

✅ **Notebook 完全独立于其他 feature**——不存在"借用 Skim 卫星"或任何跨 feature 引用。CONTEXT.md 中"Notebook 借用 Skim 的 markdownTheme + ExportHtml"以及 P2_DEPENDENCY_SCAN.md 早期版本中"Notebook 跨用了哪些其他模块"的判断与当前实际状态不符（与上一批扫描的结论一致：那 4 个 skim 卫星从未存在过）。

---

## 5. 依赖的 utils 文件 + 是否独占

Notebook 仅依赖一个 utils 文件：[utils/textUtils.ts](utils/textUtils.ts)（121 行），从中导入 3 个函数：

```ts
import { normalizeSelectionText, noteDisplayWithSuperscript, stripHtml } from '@/utils/textUtils';
```

### textUtils.ts 是 Notebook 独占吗？❌ **不是独占，被 3 个不同 feature 共用**

| 调用方 | 引用内容 |
|--------|----------|
| [components/Notebook.tsx](components/Notebook.tsx):4 | `normalizeSelectionText`、`noteDisplayWithSuperscript`、`stripHtml` |
| [features/reader/slide-viewer/SlideViewer.tsx](features/reader/slide-viewer/SlideViewer.tsx):4 | `plainTextToHtmlWithSupSub` |
| [features/reader/deep-read/ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx):9 | `plainTextToHtmlWithSupSub`、`normalizeSelectionText`、`dedupeHtml` |

[utils/textUtils.ts](utils/textUtils.ts) 当前导出 5 个函数：`plainTextToHtmlWithSupSub`、`normalizeSelectionText`、`noteDisplayWithSuperscript`、`stripHtml`、`dedupeHtml`。其中：
- `normalizeSelectionText` 同时被 Notebook、ExplanationPanel 用
- `plainTextToHtmlWithSupSub` 同时被 SlideViewer、ExplanationPanel 用
- `noteDisplayWithSuperscript`、`stripHtml`、`dedupeHtml` 各只有一处使用，但所属于"通用文本处理"性质（去 HTML 标签、上下标转换等）

**结论**：textUtils 是**通用 lib**性质（reader 区域的 3 个核心组件都在用），不应作为 Notebook 卫星跟着搬。它属于将来 P2 阶段 4（utils → lib/）会处理的 `lib/text/` 范畴。

### Notebook 自己有"独占卫星"吗？❌ **没有**

Notebook 的所有逻辑都内联在自己 269 行里，没有抽出任何辅助文件、没有任何 `notebookXxx.ts` 卫星。

---

## 6. 放置位置建议

### 推荐：候选 A —— `features/reader/notebook/Notebook.tsx`

**理由**：

1. **业务上紧贴阅读区域**：Notebook 是按"PDF 文件 + 页码"组织的笔记本，每条笔记天然挂在某个 PDF 页面下；它和 SlideViewer / SlidePageComments / ExplanationPanel / SkimPanel 共同构成阅读体验，不是独立功能。
2. **数据上耦合阅读流**：notes 来自两个入口——精读的 `ExplanationPanel.onNotebookAdd`（line 19、416-424）和略读的 `SkimPanel.onNotebookAdd`（line 41、274-275、544）。也就是说**笔记的产生**完全发生在 `features/reader/` 内的两个组件，Notebook 是它们的"接收容器"。把它放在 `features/reader/` 之外会让数据流跨越目录边界，反而违反"按业务入口归类"的原则。
3. **与 CONTEXT.md 已确定的方案一致**：[CONTEXT.md](CONTEXT.md) 的 P2 目录树明确把 Notebook 列在 `features/reader/notebook/` 下。把它放到 `features/notebook/`（顶层）会与已敲定方案产生第二处偏离（第一处是 4 个 skim 卫星不存在）。
4. **文件大小（269 行）属于阅读区子模块的常规体量**：和兄弟模块对照——SlideViewer 547、SlidePageComments 215、PageMarkPanel 208、ExplanationPanel 674、SideQuestPanel 149、SkimPanel 1309。Notebook 269 行天然适配 reader 子目录粒度。

### 不推荐：候选 B —— `features/notebook/`（独立功能）

理由：会让笔记的"产生方"（ExplanationPanel / SkimPanel 在 `features/reader/`）和"消费方"（Notebook）跨越根级 feature 目录边界，且与 CONTEXT.md 不符。除非未来计划把 Notebook 拓展为完全独立于 PDF 的"全局笔记应用"（带搜索、标签、跨文档归档等），否则没有理由独立。

### 卫星文件归位建议

- ❌ Notebook **没有独占卫星文件**——什么都不需要跟着搬。
- ⚠️ 唯一依赖 `utils/textUtils.ts` 是 reader 三件共用的"通用文本处理"，**不要**作为 Notebook 卫星塞进 `features/reader/notebook/` 内部。它应保持在 `utils/`，留待将来 P2 阶段 4 / P3 把整个 utils → lib/ 重组时统一迁到 `lib/text/`。届时所有 reader 子模块的 `@/utils/textUtils` 一起更新为 `@/lib/text/...`，是一次干净的统一动作。

---

## 7. 第 3 批搬迁的预期工作量

基于以上扫描结果，正式搬迁会非常干净：

```
1. mkdir -p features/reader/notebook/
2. git mv components/Notebook.tsx → features/reader/notebook/Notebook.tsx
3. App.tsx line 12 一行 import 路径更新
4. Notebook 内部 import 不需任何修改（已全部 @/ 别名，依赖项不动）
5. 跑 tsc → 应保持 10 错误
6. 写 READER_BATCH3_NOTEBOOK_MIGRATION.md
```

**预期改动**：仅 1 个 git mv + 1 行 App.tsx import + 1 份报告。**没有 package.json 更改**，**没有跨模块 import 路径需改**，**没有死代码待清理**——本以为会有的"略读笔记借用"死代码也不存在（与第 2 批末尾结论一致）。

可能需要的额外动作（仍是文档级，不影响代码）：
- 若你想保持 .md 文档完全干净，可顺便把以下 .md 中的旧路径 `components/Notebook` 全部更新（届时 grep 一次确认）
- 这一步可以放到第 3 批正式搬迁时一并处理，也可以单独做

---

## 8. 用户决策点

请在发正式搬迁任务包前确认以下两点：

- [ ] 同意候选 A（`features/reader/notebook/`）？
- [ ] 同意把 `utils/textUtils.ts` 留在 `utils/` 不动（后续 P2 阶段 4 / P3 统一搬到 `lib/text/`）？

如果两点都同意，正式搬迁包可以非常简短——参照 [TURTLESOUP_MIGRATION.md](TURTLESOUP_MIGRATION.md) 的体量即可（单文件、单引用、零卫星）。

---

*预扫描完。零代码改动，零目录创建，零 git mv。等你看完发正式包。*
