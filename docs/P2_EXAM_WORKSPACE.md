# P2：备考工作台页内苏格拉底对话 + 教学法引擎

## 布局

- `ExamWorkspacePage`：`max-w-7xl`，大屏 **左栏**（考试选择、材料列表、考前预测），**右栏**大块对话（`ExamWorkspaceSocraticChat`）。
- 小屏：上下堆叠，对话区仍 `min-h-[min(70vh,720px)]` 量级。

## 合并材料

- `App.tsx` 中 `getMergedDocContentForExamLinks` 与 `buildMaintenanceMergedContent` 为同一实现；单链最大 **60000** 字符（与保温流一致）。
- 备考台对话：`classifyDocument` 对合并文本做一次 **STEM/HUMANITIES** 分类；**同日同材料前缀** 缓存在组件内 `Map`（key 含 `toDateString()` + 文本前 4000 字），避免重复请求。

## 教学法

- `data/pedagogyCore.ts`：核心四条（苏格拉底、支架、主动阐述、锚定课程）。
- `buildDialogueTeachingSystemPrompt`：`pedagogyCore` + `getDisciplinePromptSnippet` + 输出约束。
- **`chatWithAdaptiveTutor`（备考苏格拉底等）**：`systemInstruction` 为上述教学法拼接 + **docType 辅助** + **模式**（非 `utils/prompts.ts` 整段 STEM/HUMANITIES 长文）；可叠加 citations / chunk / KC / 支架等备考附录。
- **略读 / 智能导读**：`features/reader/skim/SkimPanel.tsx` 使用 **`chatWithSkimAdaptiveTutor`**，`systemInstruction` 来自 **`utils/prompts.ts`** 的 **`STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`**（按 `docType`），与备考路径分离。
- `chatWithSlide`：`standard` = 教学法 + 视觉协议；`galgame` = 角色 + 短锚定句。

## 保温闪卡

- `generateMaintenanceFlashCards`：**记忆向**；已去掉与苏格拉底「同级」的学科长块；深度教学在对话层。

## PR 截图

请在 PR 中附 **备考工作台左右分栏** 截图（本文件可随 PR 更新）。
