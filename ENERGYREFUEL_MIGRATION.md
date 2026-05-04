# P2 第 3 次搬迁报告：energyRefuel → features/energyRefuel/

> P2 阶段 1 第 2/3 个模块。
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ChatHug.tsx`（196 行） | [`features/energyRefuel/ChatHug.tsx`](features/energyRefuel/ChatHug.tsx) |
| `git mv` | `components/TaskHug.tsx`（277 行） | [`features/energyRefuel/TaskHug.tsx`](features/energyRefuel/TaskHug.tsx) |

新建目录：`features/energyRefuel/`。两次 git mv 均被 git 识别为 **R (rename)**。

按你的特别提醒：**"AI 能量补给站"整体容器**（`{isEnergyMode && (...)}` 那段 JSX）保留在 [App.tsx](App.tsx) 不动，本次只搬两个子组件。

---

## 2. 修改的引用

仅 App.tsx 一处文件、2 行改动：

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| App.tsx | 10 | `import { TaskHug } from '@/components/TaskHug';` | `import { TaskHug } from '@/features/energyRefuel/TaskHug';` |
| App.tsx | 11 | `import { ChatHug } from '@/components/ChatHug';` | `import { ChatHug } from '@/features/energyRefuel/ChatHug';` |

App.tsx 内 line 2645/2646 的 JSX `<TaskHug />` / `<ChatHug />` 标签**不需改动**（只用名字不引路径）。

---

## 3. 搬过去文件的内部 import 检查

**ChatHug.tsx** 头部：
```ts
import React, { useState, useRef, useEffect } from 'react';
import { Send, Heart, Coffee, Cloud, Wand2, MessageCircle } from 'lucide-react';
import { ChatMessage } from '@/types';
import { runChatHugAgent } from '@/services/geminiService';
```

**TaskHug.tsx** 头部：
```ts
import React, { useState, useEffect, useRef } from 'react';
import { Zap, ArrowRight, CheckCircle2, Circle, Play, Pause, RotateCcw, Sparkles, Send } from 'lucide-react';
import { runTaskHugAgent, runTaskHugChat, TaskHugResponse } from '@/services/geminiService';
import { ChatMessage } from '@/types';
```

✅ 两个文件本仓库 import 都已是 `@/` 别名形式，无需改动。

---

## 4. ⚠️ 与你"特别提醒"的事实差异（仅作记录）

你在任务说明里提到：
> - ChatHug 内部依赖：services/geminiService 和 services/firebase（saveChatHugConversation 等）
> - TaskHug 内部依赖：services/geminiService 和 utils/taskHugStorage

**实际仓库当前状态**（搬迁前后均如此）：

| 你提到的依赖 | 实际情况 |
|--------------|----------|
| ChatHug 依赖 services/firebase（saveChatHugConversation 等） | ❌ ChatHug.tsx **不 import firebase**，全仓库也**不存在** `saveChatHugConversation` 函数。ChatHug 仅依赖 geminiService.runChatHugAgent。 |
| TaskHug 依赖 utils/taskHugStorage | ❌ 仓库**不存在** `utils/taskHugStorage.ts` 文件，TaskHug 也未 import 它。TaskHug 仅依赖 geminiService 的 runTaskHugAgent / runTaskHugChat / TaskHugResponse。 |

**判断**：这两点提示可能来自(a)未来计划的依赖、(b)其他分支/早期版本、(c)记忆错位。**不影响本次搬迁**——按当前实际依赖（仅 geminiService + types）搬完即可。如果将来要把 firebase 同步加进 ChatHug、把 taskHugStorage 加进 TaskHug，那是新加文件而不是搬迁问题。

---

## 5. TypeScript 检查结果

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

## 6. 是否有意外发现

**仅一项需记录但不影响搬迁**：你提到的 ChatHug→firebase 和 TaskHug→taskHugStorage 依赖在当前仓库**不存在**（详见 §4）。其他全部按预期：
- ✅ 仅 App.tsx 一处 import
- ✅ ChatHug 与 TaskHug **互不依赖**（grep 确认两者间无 import 关系）
- ✅ 两个组件内部 import 已是 `@/` 别名
- ✅ git mv 双双被识别为 rename
- ✅ 容器 `{isEnergyMode && (...)}` 仍留在 App.tsx，未触碰
- ✅ tsc 通过

---

## 7. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

- [ ] 点击右上角"满血复活"（能量补给）入口 → 进入"AI 能量补给站"覆盖层
- [ ] 站内左侧 **TaskHug**（"任务拥抱"）：能输入今天的任务 → AI 给出步骤化拆解 → 步骤勾选/番茄计时正常
- [ ] 站内右侧 **ChatHug**（"心情拥抱"）：能选模式（emotional / casual / mindfulness / coax 之一）→ AI 给出第一句安抚 → 来回对话正常 → 点"结束对话"能重置
- [ ] 退出能量补给站后回到正常学习界面，无白屏、无 console error

如果 4 点都通过，说明搬迁完全成功，可以 commit。

---

## 8. 建议的 git commit message

```
refactor(p2): 把 ChatHug + TaskHug 搬到 features/energyRefuel/

- git mv components/ChatHug.tsx → features/energyRefuel/ChatHug.tsx
- git mv components/TaskHug.tsx → features/energyRefuel/TaskHug.tsx
- App.tsx 两处 import 路径改为 @/features/energyRefuel/...
- "能量补给站"容器 {isEnergyMode && (...)} 仍留在 App.tsx（按计划）
- 组件内部 import 已是 @/ 别名，无需改动
- tsc 错误数 = 10，与基线一致（无新增）
```

---

*报告完。等用户验证通过后手动 commit。下一个模块（sessionStart）需用户说"下一个"再开始。*
