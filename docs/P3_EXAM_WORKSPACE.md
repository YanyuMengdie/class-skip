# 备考工作台 P3 — 交付说明

## 完成档位

| 档位 | 内容 | 状态 |
|------|------|------|
| **A** | `citations` 可选 `paragraphIndex` / `quote`（向后兼容 P1）；Prompt 附录说明；按块级元素编号渲染，有索引时链钮在段落旁，无索引回退底部链钮 | ✅ |
| **B** | 文本型 PDF：`quote` → `getTextContent` 近似匹配 → 半透明覆盖层；匹配失败 → 顶部提示条 + 摘录；扫描/无文本层 → 短提示 | ✅ |
| **C** | 侧栏「回到本段引用」→ `scrollIntoView` 到 `data-exam-block-index` | ✅ |

## B 档降级策略

1. **无法匹配** `quote` 与文本层：显示黄色提示条「请在下方讲义中自行查找：…」（B2）。
2. **疑似扫描件**（极少或无文本项）：toast 风格短句「该页可能为扫描件…」（B3），不做整页弱高亮。

## 块级编号约定（与模型对齐）

顺序为 Markdown 渲染 **深度优先**：根级 `p`、`h1`–`h6`、`li`（每项）、`blockquote`、`pre` 各占用一个 **0-based** `paragraphIndex`。`li` 内层 `p` 因 `SkipBlockIndexContext` **不**单独编号。

## 涉及文件

- `features/exam/lib/examWorkspaceCitations.ts` — 解析可选字段
- `services/geminiService.ts` — `buildExamWorkspaceCitationInstruction`
- `features/exam/workspace/ExamWorkspaceAssistantMarkdown.tsx` — 分块 + 底部未索引回退
- `features/exam/workspace/ExamWorkspaceSocraticChat.tsx` — `forwardRef` + `scrollToParagraphBlock`
- `features/exam/workspace/ExamWorkspaceMaterialPreview.tsx` — 高亮层 + 回到段落
- `features/exam/workspace/ExamWorkspacePage.tsx` — 跳转 state 与回调
- `features/exam/lib/pdfQuoteHighlight.ts` — 文本匹配与矩形
