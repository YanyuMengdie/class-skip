# P2 第 2 次搬迁报告：lecture → features/lecture/

> P2 阶段 1 第 1/3 个模块。
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/ClassroomPanel.tsx`（52 行） | [`features/lecture/ClassroomPanel.tsx`](features/lecture/ClassroomPanel.tsx) |
| `git mv` | `components/LectureTranscriptPage.tsx`（296 行） | [`features/lecture/LectureTranscriptPage.tsx`](features/lecture/LectureTranscriptPage.tsx) |

新建目录：`features/lecture/`。两次 git mv 均被 git 识别为 **R (rename)**，历史完整保留。

---

## 2. 修改的引用

仅 [App.tsx](App.tsx) 一处文件、2 行改动。**与依赖扫描预期完全一致**（[P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) §features/lecture/）。

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| App.tsx | 34 | `import { ClassroomPanel } from '@/components/ClassroomPanel';` | `import { ClassroomPanel } from '@/features/lecture/ClassroomPanel';` |
| App.tsx | 35 | `import { LectureTranscriptPage } from '@/components/LectureTranscriptPage';` | `import { LectureTranscriptPage } from '@/features/lecture/LectureTranscriptPage';` |

App.tsx 内其他出现位置（line 283 state 名、line 1763/2031 回调、line 2072/2164 JSX）只用名字不引路径，**无需改动**。

---

## 3. 搬过去文件的内部 import 检查

**ClassroomPanel.tsx** 头部：
```ts
import React, { useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { LectureRecord } from '@/types';
```

**LectureTranscriptPage.tsx** 头部：
```ts
import React, { useState, useEffect } from 'react';
import { X, Mic, FileText, Trash2, Edit2, Check, X as XIcon } from 'lucide-react';
import { LectureRecord } from '@/types';
```

✅ 两个文件本仓库 import 都已是 `@/types` 别名形式，无需任何改动。两个组件**都不直接调 transcriptionService**——录音控制由 App.tsx 调用 `services/transcriptionService` 完成（与依赖扫描预期一致）。

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

10 个错误全部历史遗留，与本次搬迁无关。

---

## 5. 是否有意外发现

**无**。
- ✅ 仅 App.tsx 一处 import lecture 系列（如预期）
- ✅ 两个文件内部 import 已是 `@/` 别名
- ✅ git mv 双双被识别为 rename
- ✅ tsc 通过
- ✅ transcriptionService 仍留在 services/（按 P2_DEPENDENCY_SCAN.md 推荐，"它可服务未来语音输入场景，保持在 lib 候选位置"，本轮不动）

---

## 6. 用户手动验证清单

请跑 `npm run dev`，打开浏览器后：

- [ ] **ClassroomPanel（实时上课）**：进入主界面（已上传过 PDF 的状态），Header → "更多"菜单 → "上课"按钮 → 录音状态显示器应正常出现在右半屏，点击"开始录音"能进入录音中状态，点击结束能退出
- [ ] **LectureTranscriptPage（历史回看）**：Header → "更多"菜单 → "上课录音文本"按钮 → 历史课堂列表整页应正常打开，能看到之前录过的课堂；如果没录过，应显示"暂无录音"提示（界面不报错）
- [ ] 两条路径打开 / 关闭，不出现白屏、不出现 console error

如果以上 3 点都通过，说明搬迁完全成功，可以 commit。

---

## 7. 建议的 git commit message

```
refactor(p2): 把 ClassroomPanel + LectureTranscriptPage 搬到 features/lecture/

- git mv components/ClassroomPanel.tsx → features/lecture/ClassroomPanel.tsx
- git mv components/LectureTranscriptPage.tsx → features/lecture/LectureTranscriptPage.tsx
- App.tsx 两处 import 路径改为 @/features/lecture/...
- 组件内部 import 已是 @/ 别名，无需改动
- transcriptionService 保留在 services/（按依赖扫描建议）
- tsc 错误数 = 10，与基线一致（无新增）
```

---

*报告完。等用户验证通过后手动 commit。下一个模块需用户说"下一个"再开始。*
