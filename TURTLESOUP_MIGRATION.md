# P2 第 1 次搬迁报告：TurtleSoup → features/turtleSoup/

> P2 目录重构的首次实战，作为后续模块的标准流程范本。
> 配套文档：[REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md)、[P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md)
> 生成时间：refactor 分支当前状态
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/TurtleSoupPanel.tsx`（237 行） | [`features/turtleSoup/TurtleSoupPanel.tsx`](features/turtleSoup/TurtleSoupPanel.tsx) |

新建目录：`features/`、`features/turtleSoup/`。

`git status` 中此文件状态为 **R (rename)**，git 已正确追踪文件移动历史。

---

## 2. 修改的引用

仅 1 处。**与依赖扫描预期完全一致**（[P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) §features/turtleSoup/ 报告"仅被 App.tsx:37 import 一次"）。

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| [App.tsx](App.tsx) | 37 | `import { TurtleSoupPanel } from '@/components/TurtleSoupPanel';` | `import { TurtleSoupPanel } from '@/features/turtleSoup/TurtleSoupPanel';` |

App.tsx 内 line 2616 处的 JSX 使用 `<TurtleSoupPanel ... />` 不需要改动（只用名字，不引路径）。

---

## 3. TurtleSoupPanel.tsx 自身的 import（前 15 行）

```ts
import React, { useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { TurtleSoupState } from '@/types';
import { generateTurtleSoupPuzzle, answerTurtleSoupQuestion, generateTurtleSoupHint } from '@/services/geminiService';

interface TurtleSoupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: TurtleSoupState | null;
  onUpdateState: (state: TurtleSoupState) => void;
  completedSegmentsCount?: number;
  onConsumeSegment?: () => void;
}

const QUESTIONS_PER_ROUND = 5;
```

✅ **2 处本仓库 import 都已是 `@/` 别名形式**（`@/types` 和 `@/services/geminiService`），上一轮别名迁移的成果在此次搬迁中**自动生效**——文件物理位置变了但 specifier 一字不改仍能正确解析。这正是引入 `@/` 别名的核心价值。

---

## 4. TypeScript 检查结果

```bash
$ npx tsc --noEmit
... 10 errors, exit 2
```

| 指标 | 值 |
|------|------|
| 错误总数 | **10** |
| 与基线（搬迁前）比对 | **0 新增 / 0 减少**，完全一致 |
| `Cannot find module` 错误 | **0** ✅ |

10 个错误全部是历史遗留（`StudyGuideContent.trim`、`import.meta.env` 类型缺失、Speech API 类型缺失等），与本次搬迁无关。**不存在任何 "Cannot find module '@/components/TurtleSoupPanel'" 之类的引用断裂**。

---

## 5. 是否发现意外

**无**。本次搬迁与依赖扫描预测**完全吻合**：
- ✅ 仅 App.tsx 一处外部 import（如预期）
- ✅ 组件内部 import 已是 `@/` 别名（如预期，不需修改）
- ✅ `git mv` 后 git 正确识别为 rename
- ✅ tsc 通过（错误数与基线相同）
- ✅ 没有其它隐藏调用方（包括 type-only import、动态 import、字符串字面量引用等都已 grep 排除）

---

## 6. P2 标准流程沉淀（可作为后续模块搬迁的模板）

```
1. mkdir -p features/<feature>/
2. git mv components/X.tsx features/<feature>/X.tsx
3. 全仓 grep "X" → 找出所有外部 import → 改 specifier
4. 检查搬过去文件自身的 import 是否已是 @/（别名迁移完成后这步几乎不需手改）
5. npx tsc --noEmit → 错误数应与基线一致，无 "Cannot find module"
6. 报告 → 等用户跑 npm run dev 手动验证 → 用户 commit
```

本次只触动了 2 个文件（一个 git mv、一个 import 改 1 行），是 P2 阶段最干净的一次搬迁。后续文件较多的模块（review、exam）会按此模板重复，但需逐个面板拆 commit。

---

## 7. 建议的 git commit message

```
refactor(p2): 把 TurtleSoupPanel 搬到 features/turtleSoup/

- git mv components/TurtleSoupPanel.tsx → features/turtleSoup/TurtleSoupPanel.tsx
- App.tsx 唯一引用从 @/components/TurtleSoupPanel 改为 @/features/turtleSoup/TurtleSoupPanel
- 组件内部 import 已是 @/ 别名，无需改动
- tsc 错误数 = 10，与基线一致（无新增）

P2 第 1 次搬迁，建立目录重构标准流程。
```

---

## 8. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

- [ ] 进入主界面，点击 Header → "更多"（三横线菜单）→ "学累了/休息" → "海龟汤" 按钮
- [ ] 海龟汤面板能正常打开（应该看到 AI 生成的"汤面"）
- [ ] 在输入框打几句问题、点提示按钮、关闭面板，行为正常
- [ ] 完成一局后 Header 顶部"已完成 N 段 · 海龟汤可用 N 次"的计数应该 -1（这一步验证 App.tsx 与新位置的 TurtleSoupPanel 之间的 props 通讯没断）

如果以上 4 点都通过，说明搬迁完全成功，可以 commit。

---

*报告完。`components/` 目录保留（按你的要求，后续模块继续搬走时再统一处理）。*
