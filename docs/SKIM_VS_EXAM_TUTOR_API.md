# 略读 vs 备考 vs 递进阅读：对话 / 题目 API 分离（步骤 C 校验）

## 引用校验表（以仓库 `grep` 为准，随迭代更新）

| 符号 | 期望出现位置 |
|------|----------------|
| `chatWithAdaptiveTutor` | `services/geminiService.ts`（定义与注释）、`features/exam/workspace/ExamWorkspaceSocraticChat.tsx`（备考苏格拉底）、`types.ts`（类型注释）、本文档与 `docs/P2_EXAM_WORKSPACE.md` / `README.md` 等说明 |
| `chatWithSkimAdaptiveTutor` | `services/geminiService.ts`（导出）、`features/reader/skim/SkimPanel.tsx`（略读对话） |
| `chatLayeredReadingModule` | `services/geminiService.ts`（递进阅读模块对话）、`features/reader/layered/ModuleChatBox.tsx`（铁律 7 数据全局/视觉过滤） |
| `generateLayeredReadingModules` / `generateLayeredRound1Content` / `generateLayeredRound2Branches` / `generateLayeredRound3Details` | `services/geminiService.ts`、`features/reader/layered/LayeredReadingPanel.tsx` 与 `LayeredReadingTree.tsx`（按需懒加载，铁律 11 不自动推进 Round） |
| `generateLayeredQuestionForRound1` / `generateLayeredQuestionForRound2` / `generateLayeredQuestionForRound3` / `gradeLayeredQuestion` | `services/geminiService.ts`、`features/reader/layered/LayeredReadingPanel.tsx`（阶段 4 题目系统;铁律 8 软门槛 + 铁律 9 按题型分维度） |

**不应**：
- `SkimPanel.tsx` 出现 `chatWithAdaptiveTutor`。
- `LayeredReadingPanel.tsx` / `LayeredReadingTree.tsx` / `ModuleChatBox.tsx` / `LayeredReadingQuestionBox.tsx` 出现 `chatWithAdaptiveTutor` 或 `chatWithSkimAdaptiveTutor`（铁律 1）。
- 递进阅读题目数据(`LayeredReadingQuestion`)写入 `globalChatHistory`（铁律 8:题目独立持久化于 `LayeredReadingState.questions`）。
- 递进阅读模式读 / 写 `FilePersistedState.studyMap`（铁律 2:与 SkimPanel 数据完全独立）。

## 职责划分

| API | 用途 | system / 附录 |
|-----|------|----------------|
| `chatWithAdaptiveTutor` | 备考工作台苏格拉底等 | 教学法 `buildDialogueTeachingSystemPrompt` + 可选 citations、chunk、KC、支架 |
| `chatWithSkimAdaptiveTutor` | 仅略读 / 智能导读（`SkimPanel`） | `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`（`lib/prompts/systemPrompts.ts`），无备考附录 |
| `chatLayeredReadingModule` | 递进阅读模式逐 module chat box（`ModuleChatBox`） | `buildLayeredReadingChatSystemPrompt`（`lib/prompts/layeredReadingPrompts.ts`），无 STEM/HUMANITIES 分支(铁律 5)、无备考教学法附录、无 chunk/citations |
| `generateLayeredQuestionForRound1` / `…Round2` / `…Round3` | 递进阅读题目生成(按 Round 分函数,铁律 9 维度对应) | `buildLayeredQuestionRound1/2/3Prompt`,`responseSchema` 强约束 `{ questionText, referenceAnswer }`,prompt 含禁推进语段(铁律 11) |
| `gradeLayeredQuestion` | 递进阅读 AI 批改(2 维度 ★1-5 + comment) | `buildLayeredQuestionGradingPrompt`,**不接收 fullText**(批改基于参考答案 + 用户答案就够),客户端二次过滤合法 stars / 非空 label/comment |

共享逻辑：`appendReadingModeUserMessageSuffix` 用于 reading 模式对用户句的追加（`chatWithAdaptiveTutor` 与 `chatWithSkimAdaptiveTutor` 的 reading 分支一致）。**递进阅读模式的 4 个题目函数与 chatLayeredReadingModule 不共享此 suffix**(它们不走 reading/tutoring 二态)。

## 递进阅读独立数据通路(铁律 1/2/7/8)

| 数据 | 持久化字段 | 备注 |
|------|------------|------|
| 模块树(modules + round1/2/3 内容 + 溯源页) | `LayeredReadingState.modules` | 与 `studyMap` 独立(铁律 2) |
| 全局对话历史(每条消息标 sourceModuleId) | `LayeredReadingState.globalChatHistory` | 视觉按 module 过滤、数据全局(铁律 7) |
| 题目作答记录(题面 + 用户答 + 参考答 + AI 批改 + 状态) | `LayeredReadingState.questions` | **不进 `globalChatHistory`**(铁律 8) |
| 上次浏览位置 | `LayeredReadingState.lastVisited` | 触发 banner;由 toggle/expand/答题完成事件更新,溯源跳 PDF 不更新(澄清 D) |
| 三轮进度统计快照 | `LayeredReadingState.progressSnapshot` | 由 useMemo 衍生 + useEffect 同步 |

## 略读辅助函数（非主对话 API）

`generateGatekeeperQuiz`、`generateModuleTakeaways`、`generateModuleQuiz` 等仍为略读辅助能力，基于历史或独立 prompt 调用，**不是** `chatWithSkimAdaptiveTutor` 的替代。

## 手动回归清单

- **略读**：`viewMode === 'skim'` 下切换 STEM/社科；进入深度领读（reading）；多轮发消息；前置知识补习（tutoring）能正常回复。
- **备考**：备考台苏格拉底一轮；有索引时 chunk 白名单、无索引时文末 citations JSON 等行为与预期一致（依环境是否有索引）。
- **递进阅读**(阶段 4 新增):
  - `viewMode === 'layered'` 下选 module 数 → 拆分 → Round 1 自动懒加载 → 用户点"展开到 Round 2 →" / "展开到 Round 3 →" 才推进(不自动推进,铁律 11)。
  - 每 module Round 1 末"📝 答题(故事题)" / 每 branch Round 2 末"📝 答题(结构题)" / 每 branch Round 3 末"📝 答题(细节应用题)" 三类按需生成。
  - 答案提交后 AI 按题型给 2 维度 ★1-5 + 一句话 comment(铁律 9):`story → 故事感 + 主旨准确`,`structure → 步骤完整 + 步骤顺序`,`application → 推理逻辑 + 细节抓取`。
  - "✏️ 重新答题" 清空旧答案 + 旧批改回到 unanswered(覆盖式,澄清 C)。
  - "⏭ 跳过" 直接显示参考答案,题目不阻塞外层"展开到 Round X →"(软门槛,铁律 8)。
  - 离开 panel 1 小时以上再回来,顶部弹出 lastVisited banner;点"继续阅读"自动展开 + scroll 到上次位置;banner 本会话 dismiss 后不再显示,viewMode 切走再切回会重新评估。

## 回滚指引（应急）

### 触发症状

- 略读口吻/结构异常（明显偏离 STEM/HUMANITIES 预期）。
- 略读请求失败率升高，或 token 开销异常导致体验下降。

### 推荐回滚方式（优先）

- 直接回滚引入「SkimPanel 改接 `chatWithSkimAdaptiveTutor`」的提交：
  - `git revert <步骤A/B相关提交SHA>`
- 若只需快速应急，可文件级回滚（不建议长期保留）：
  - `git checkout <稳定版本SHA> -- features/reader/skim/SkimPanel.tsx services/geminiService.ts`

### 临时降级策略（仅应急）

- 将 `features/reader/skim/SkimPanel.tsx` 的调用临时改回 `chatWithAdaptiveTutor` 可快速止血，但会打破“略读/备考 API 分离”，应在后续修复后撤销。

### 数据影响

- `skimMessages` 为客户端会话状态，通常无需数据迁移。
- 新旧 API 生成消息在同一会话混排属于可接受现象。
