# P2 第 6 次搬迁报告：reader 第 2 批（略读，最小化版）

> P2 阶段 2 · Batch 2/3
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/SkimPanel.tsx`（1,309 行） | [`features/reader/skim/SkimPanel.tsx`](features/reader/skim/SkimPanel.tsx) |

新建目录：`features/reader/skim/`。git mv 被识别为 **R (rename)**。

---

## 2. 修改的引用

### 2.1 代码（1 处）

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| [App.tsx](App.tsx) | 8 | `import { SkimPanel } from '@/components/SkimPanel';` | `import { SkimPanel } from '@/features/reader/skim/SkimPanel';` |

### 2.2 package.json（1 处）

| 文件 | 改动 |
|------|------|
| [package.json](package.json):11 | `check:skim-tutor` 脚本里硬编码的 `'components/SkimPanel.tsx'` → `'features/reader/skim/SkimPanel.tsx'` |

执行 `npm run check:skim-tutor` 验证：✅ 输出 `check:skim-tutor ok`，exit=0。守护脚本工作正常。

### 2.3 活文档（3 处文件 / 共 5 处替换）

| 文件 | 替换次数 |
|------|---------|
| [docs/SKIM_VS_EXAM_TUTOR_API.md](docs/SKIM_VS_EXAM_TUTOR_API.md) | 3 处 |
| [docs/QUIZ_AND_FLASHCARD_PLAN.md](docs/QUIZ_AND_FLASHCARD_PLAN.md) | 1 处 |
| [docs/P2_EXAM_WORKSPACE.md](docs/P2_EXAM_WORKSPACE.md) | 1 处 |

### 2.4 历史报告 .md（4 处文件 / 共 11 处替换）

| 文件 | 替换次数 |
|------|---------|
| [ALIAS_MIGRATION_REPORT.md](ALIAS_MIGRATION_REPORT.md) | 2 处 |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 3 处 |
| [REFACTOR_AUDIT.md](REFACTOR_AUDIT.md) | 5 处 |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 1 处 |

### 2.5 一处刻意未改

| 文件 | 行 | 原因 |
|------|----|------|
| `scripts/migrate-to-alias.last-run.json` | 139 | 这是 `scripts/migrate-to-alias.mjs` 上一次运行的输出快照（generated artifact），不是文档；下次运行脚本会自动覆盖。手动改反而误导。 |

### 2.6 残留确认

`grep -rn "components/SkimPanel"` 全仓搜索：除上述 last-run.json 之外**无其他残留**。

---

## 3. 实际依赖核实

[features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx) 头部：
```ts
import React, { useState, useRef, useEffect, useDeferredValue, Component, type ErrorInfo, type ReactNode } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { StudyMap, ChatMessage, Prerequisite, QuizData, SkimStage, DocType } from '@/types';
import { Rocket, Send, Square, ... } from 'lucide-react';
import { chatWithSkimAdaptiveTutor, generateGatekeeperQuiz, generateModuleTakeaways, generateModuleQuiz } from '@/services/geminiService';
```

✅ 仓库内 import：仅 `@/types` + `@/services/geminiService`，已是别名形式。

✅ **未发现** SkimPanel 内对 `skimMarkdownTheme` / `skimMarkdownToExportHtml` / `extractNthGfmTable` / `captureElementToPng` 的任何引用——markdown 主题、HTML 导出、表格提取等逻辑全部在 SkimPanel.tsx 内联实现（这与"4 个卫星文件不存在"的结论一致）。

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

注意：第 3 条 SkimPanel 类型错误的**路径**从 `components/SkimPanel.tsx` 变为 `features/reader/skim/SkimPanel.tsx`——这是**同一条已有错误**跟随文件移动改名，不是新错误。

`npm run check:skim-tutor`：✅ 输出 `check:skim-tutor ok`，exit=0。

---

## 5. 任务清单偏差记录

> 这一节是必须保留的事实记录。

原任务清单列出 5 个文件搬迁，经三轮 git 验证（`git ls-tree` 当前 worktree + `git log --all` 全分支历史 + `git ls-tree main` 主分支 tree）与 `grep` 源码确认，其中 4 个文件**从未在本仓库的任何分支、任何提交中存在过**：

- `components/skimMarkdownTheme.tsx`
- `utils/skimMarkdownToExportHtml.ts`
- `utils/extractNthGfmTable.ts`
- `utils/captureElementToPng.ts`

[components/Notebook.tsx](components/Notebook.tsx) 和 [features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx)（搬迁前的 components/SkimPanel.tsx）的源码内部也**无任何对这 4 个名字的引用**——既不 import、也不调用相关函数、也不使用相关常量、也无注释提及。

本批仅搬迁 SkimPanel.tsx 一个真实存在的文件。

**推断**：这 4 个名字可能源于 P2 早期规划文档中的"理想拆分"（把 SkimPanel 1309 行内的几块逻辑命名拆出）被误读为"当前状态"，或来自其他 AI 助手的幻觉记忆。[P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) §features/reader/skim/ 的卫星文件清单当时已明确标记"全部不存在于当前仓库"——本次任务清单与那份扫描的结论保持一致即可。需要后续校对的是 [CONTEXT.md](CONTEXT.md) 中"features/reader/skim/ 5 个文件"的目录树描述（实际只有 1 个）。

---

## 6. 未来工作建议

如未来需要将 [features/reader/skim/SkimPanel.tsx](features/reader/skim/SkimPanel.tsx) 内部的主题渲染、HTML 导出、表格提取等逻辑拆为独立卫星文件（即把 1309 行单文件拆成 SkimPanel + skimMarkdownTheme + skimMarkdownToExportHtml + extractNthGfmTable + captureElementToPng 五件），应作为**独立的 refactor 任务**——这属于"组件内部拆分"性质（接近 P5 阶段"拆 SkimPanel 巨型组件"的范畴），**不属于 P2 搬迁范围**。届时再逐一抽出、跑测试、commit。

---

## 7. Notebook 与本批的关系

按你的特别提醒：
> Notebook.tsx（仍在 components/）import skimMarkdownTheme 和 skimMarkdownToExportHtml

**实际事实**：Notebook.tsx **不 import 任何** skim 相关文件（这两个目标文件不存在），所以本批**未触碰 Notebook.tsx**。下一批（第 3 批）搬 Notebook 时也不需要更新任何 skim 卫星 import 路径——它本来就没有。

「Notebook 里"略读笔记借用"UI 功能已关闭，但代码 import 仍存在」这条**前提不成立**——代码里就没有这个 import（已通过 grep 确认）。如果 UI 功能确实关闭过，关闭的实现可能不是"留着 import 死代码"而是"完全移除"。这一条不需要列入待清理项。

---

## 8. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

- [ ] 顶栏切到"略读 (Skim)"模式 → 右半屏 SkimPanel 正常打开
- [ ] 略读流程：诊断 → 场景选择 → 摄入 → 模块导读 阶段切换正常
- [ ] 略读对话能正常发消息、AI 能回复
- [ ] AI 回复中的 Markdown 表格能正常渲染
- [ ] 模块结尾测验（如果触发）能正常出题与答题
- [ ] 切回精读模式正常，再切回略读也正常
- [ ] 整体无白屏、无 console error

如果以上都通过，第 2 批 commit 后告诉我"下一批"，我会开始第 3 批（Notebook，单文件）。

---

## 9. 建议的 git commit message

```
refactor(p2): 把 SkimPanel 搬到 features/reader/skim/

- git mv components/SkimPanel.tsx → features/reader/skim/SkimPanel.tsx
- App.tsx 1 处 import 改为 @/features/reader/skim/SkimPanel
- package.json check:skim-tutor 守护脚本路径同步更新
- 7 个 .md 文档（3 个 docs/ + 4 个根目录历史报告）共 16 处旧路径更新
- tsc 错误数 = 10，与基线一致（无新增）
- npm run check:skim-tutor 通过

任务清单偏差记录：原计划搬 5 文件，经三轮 git 验证 + 源码 grep
确认其余 4 个 skim 卫星文件（skimMarkdownTheme / skimMarkdownToExportHtml /
extractNthGfmTable / captureElementToPng）从未在仓库任何分支存在过，
本次仅搬 SkimPanel.tsx 一个真实文件。详见 READER_BATCH2_SKIM_MIGRATION.md §5。
```

---

*报告完。等用户验证通过后手动 commit。第 3 批（Notebook）需用户说"下一批"再开始。*
