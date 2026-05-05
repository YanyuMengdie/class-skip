# P2 第 7 次搬迁报告：reader 第 3 批（Notebook，最终批）

> P2 阶段 2 · Batch 3/3 · **reader 区域收官**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/Notebook.tsx`（269 行） | [`features/reader/notebook/Notebook.tsx`](features/reader/notebook/Notebook.tsx) |

新建目录：`features/reader/notebook/`。git mv 被识别为 **R (rename)**。

---

## 2. 修改的引用

### 2.1 代码（1 处）

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| [App.tsx](App.tsx) | 12 | `import { Notebook } from '@/components/Notebook';` | `import { Notebook } from '@/features/reader/notebook/Notebook';` |

App.tsx 内其他 Notebook 相关位置（line 2845 `<Notebook .../>` JSX、line 1897-1899 三个 handler 回调、line 301/696 `notebookData` state、line 2094/2106 `onNotebookAdd` props）只用名字不引路径，**无需改动**。

### 2.2 活文档（2 处文件，各 1 处替换）

| 文件 | 改动 |
|------|------|
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 1 处 `components/Notebook.tsx` → `features/reader/notebook/Notebook.tsx` |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 1 处 `components/Notebook.tsx` → `features/reader/notebook/Notebook.tsx` |

### 2.3 刻意未改

| 文件 | 原因 |
|------|------|
| `scripts/migrate-to-alias.last-run.json:123` | 脚本生成的运行快照，下次跑脚本会自动覆盖 |
| `NOTEBOOK_PRE_MIGRATION_SCAN.md`（5 处旧路径） | 这是**搬迁前**的扫描报告，其旧路径描述的是"那一时刻的事实"，改它会破坏报告自身的时态语义 |
| `READER_BATCH2_SKIM_MIGRATION.md`（1 处旁证引用） | 同上，是第 2 批结束时的快照报告 |

如你希望两份历史快照报告也统一更新为新路径，告诉我即可，逻辑上仅是文档美化。

### 2.4 Notebook.tsx 内部 import

**完全未触碰**——预扫描已确认 4 行 import 全部独立于 components/ 和 features/：
```ts
import React, { useState } from 'react';                                         // npm
import { Book, ChevronDown, ... } from 'lucide-react';                           // npm
import { PageNotes, Note } from '@/types';                                       // 全局类型，未变
import { normalizeSelectionText, noteDisplayWithSuperscript, stripHtml } from '@/utils/textUtils';  // 通用 lib，未变
```

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

10 个错误均历史遗留，与本次搬迁无关。

---

## 4. 是否有意外发现

**无**。本批是 P2 阶段 2 最干净的一次搬迁——比第 1 批（5 文件）和第 2 批（1 文件 + 全仓文档更新）都简单。
- ✅ 仅 App.tsx 一处外部 import（与扫描预测一致）
- ✅ Notebook 不依赖任何 features/ 下文件，不依赖任何 components/ 下兄弟（与扫描预测一致）
- ✅ 无独占卫星文件需跟着搬
- ✅ 没有"略读笔记借用"死代码（与扫描结论一致——这部分代码本就不存在）
- ✅ git mv 被识别为 rename
- ✅ tsc 通过

---

## 5. P2 阶段 2 完工总结

至此 P2 阶段 2（reader 区域）全部完成：

- **第 1 批**：5 个独立组件
  - SlideViewer → `features/reader/slide-viewer/`
  - SlidePageComments → `features/reader/page-notes/`
  - PageMarkPanel → `features/reader/marks/`
  - ExplanationPanel → `features/reader/deep-read/`
  - SideQuestPanel → `features/reader/side-quest/`
- **第 2 批**：SkimPanel（最小化版，4 个卫星文件经三轮 git 验证 + 源码 grep 证伪）
  - SkimPanel → `features/reader/skim/`
- **第 3 批**：Notebook（本批）
  - Notebook → `features/reader/notebook/`

**reader 区域共搬迁 7 个文件**，分布到 `features/reader/` 下的 **7 个子目录**：

```
features/reader/
├── slide-viewer/       SlideViewer.tsx
├── page-notes/         SlidePageComments.tsx
├── marks/              PageMarkPanel.tsx
├── deep-read/          ExplanationPanel.tsx
├── side-quest/         SideQuestPanel.tsx
├── skim/               SkimPanel.tsx
└── notebook/           Notebook.tsx
```

### 未搬迁的相关文件（按计划保留）

- [utils/textUtils.ts](utils/textUtils.ts) 保留在 `utils/`：因被 reader 多个子模块共用（SlideViewer、ExplanationPanel、Notebook 三处 import），属于通用 lib 性质，待 P2 阶段 4 / P3 统一迁至 `lib/text/`。
- [components/LoadingInteractiveContent.tsx](components/LoadingInteractiveContent.tsx) 仍在 `components/`：仅被 ExplanationPanel 使用，本次未列入任何批次清单——属于"deep-read 的 AI 等待动画"，将来若把它归入 `features/reader/deep-read/` 也合理。当前 ExplanationPanel 通过 `@/components/LoadingInteractiveContent` 别名能正常解析。

### 跨 reader 子目录的 props 关系（搬迁后未变，仅供记录）

- 笔记从两个入口流入 Notebook：
  - `features/reader/deep-read/ExplanationPanel.tsx` 的 `onNotebookAdd` 回调（line 19、416-424）
  - `features/reader/skim/SkimPanel.tsx` 的 `onNotebookAdd` 回调（line 41、274-275、544）
- 这是 props 链路（不是 import），App.tsx 在 line 2094/2106 把 `handleAddNote` 注入这两个面板，最终回到 `features/reader/notebook/Notebook.tsx` 渲染。**搬迁不影响这个数据流**。

---

## 6. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

### 基础打开
- [ ] 上传一份 PDF（或选历史文档），主界面正常
- [ ] 找到 Notebook 入口（侧边或某个按钮，按你的产品布局），能正常打开 Notebook 面板

### 增删笔记（直接在 Notebook 内）
- [ ] 删除某条已存在的笔记 → 列表实时更新，刷新后仍删除（持久化正常）
- [ ] 编辑某条笔记内容 → 修改保存正常，显示带上下标转换正确（`noteDisplayWithSuperscript` 工作）

### 与精读联动（验证 ExplanationPanel.onNotebookAdd → Notebook 链路）
- [ ] 在精读模式下选中页面文字 / AI 讲解中的内容 → 出现"加入笔记本"或类似按钮 → 点击 → 笔记按当前页码追加到 Notebook
- [ ] 切到 Notebook 面板能看到刚才那条笔记，并标记为"deep"分类

### 与略读联动（验证 SkimPanel.onNotebookAdd → Notebook 链路）
- [ ] 在略读模式下，从对话或模块要点处把内容"加入笔记" → 笔记追加到 Notebook
- [ ] 切到 Notebook 面板能看到，并标记为"skim"分类

### 切换与持久化
- [ ] 切换 PDF（恢复另一份历史会话）→ Notebook 自动切到那份 PDF 的笔记
- [ ] 关闭浏览器再打开 → 笔记仍在（云端会话同步正常）
- [ ] 整体无白屏、无 console error

如果以上都通过，第 3 批 commit 后即 P2 阶段 2（reader 区域）完工。

---

## 7. 建议的 git commit message

```
refactor(p2): 把 Notebook 搬到 features/reader/notebook/

- git mv components/Notebook.tsx → features/reader/notebook/Notebook.tsx
- App.tsx 1 处 import 改为 @/features/reader/notebook/Notebook
- P2_DEPENDENCY_SCAN.md + REFACTOR_P2_PLAN.md 共 2 处旧路径更新
- Notebook 内部 4 行 import 全部独立，无需改动
- tsc 错误数 = 10，与基线一致（无新增）

P2 阶段 2（reader 区域）收官——7 个组件全部归位 features/reader/。
```

---

*报告完。等用户验证通过后手动 commit。P2 阶段 2 全部 3 批均已完成，下一阶段（P2 阶段 3 大模块或阶段 4 utils → lib/）需用户拍板时再发任务包。*
