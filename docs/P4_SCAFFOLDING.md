# P4：支架式动态辅导

## 类型

- `LearnerTurnQuality` / `ScaffoldingPhase` / `TutorScaffoldingContext`：`types.ts`
- 启发式：`utils/scaffoldingClassifier.ts`（文件头注释含阈值说明）
- 强规则 Prompt：`data/scaffoldingPrompt.ts`

## `consecutiveWeakStreak` 规则

- 用户每发一轮，若质量为 **weak / empty / partial**：`streak = 前序 streak + 1`
- 若为 **strong**：**归零**（`streak = 0`）
- 传给模型的 `consecutiveWeakStreak` 为 **本轮更新后的值**

## LLM 分类

- `classifyLearnerTurn`：`gemini-3-flash-preview` + JSON，失败回退 `heuristicQuality`
- 备考台：仅在 `heuristic === partial` 且 `mergedContent.length < 50000` 且用户消息 `length > 8` 时调用，用于消歧

## 未传 `scaffolding`

- **`chatWithAdaptiveTutor`（备考）** / **`chatWithSlide`**：未传 `scaffolding` 时不追加 A 档 system 与元指令，行为与 P2 接近。
- **略读 `SkimPanel`** 使用 **`chatWithSkimAdaptiveTutor`**，不走备考支架参数；模块要点/小题等仍由 `generateModuleTakeaways`、`generateModuleQuiz` 等**基于对话历史**单独生成。

## 与 `chatWithAdaptiveTutor` 的 history 约定

- `history`：**不含本轮**用户句；本轮正文只出现在参数 `newMessage`（服务内再拼接 `【本轮辅导元指令】`）。
- 若把本轮 `userMsg` 再塞进 `history`，会与 `newMessage` **重复**，故备考台传入 `messages`（已发轮次）即可。
- **`chatWithSkimAdaptiveTutor`** 采用相同 history / `newMessage` 约定（略读侧）。

## 调试

- URL 加 `?debug=1` 可在备考台对话标题下看到 `quality / phase / streak`。
