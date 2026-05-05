# 略读 vs 备考：对话 API 分离（步骤 C 校验）

## 引用校验表（以仓库 `grep` 为准，随迭代更新）

| 符号 | 期望出现位置 |
|------|----------------|
| `chatWithAdaptiveTutor` | `services/geminiService.ts`（定义与注释）、`features/exam/workspace/ExamWorkspaceSocraticChat.tsx`（备考苏格拉底）、`types.ts`（类型注释）、本文档与 `docs/P2_EXAM_WORKSPACE.md` / `README.md` 等说明 |
| `chatWithSkimAdaptiveTutor` | `services/geminiService.ts`（导出）、`features/reader/skim/SkimPanel.tsx`（略读对话） |

**不应**：`SkimPanel.tsx` 出现 `chatWithAdaptiveTutor`。

## 职责划分

| API | 用途 | system / 附录 |
|-----|------|----------------|
| `chatWithAdaptiveTutor` | 备考工作台苏格拉底等 | 教学法 `buildDialogueTeachingSystemPrompt` + 可选 citations、chunk、KC、支架 |
| `chatWithSkimAdaptiveTutor` | 仅略读 / 智能导读（`SkimPanel`） | `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`（`utils/prompts.ts`），无备考附录 |

共享逻辑：`appendReadingModeUserMessageSuffix` 用于 reading 模式对用户句的追加（`chatWithAdaptiveTutor` 与 `chatWithSkimAdaptiveTutor` 的 reading 分支一致）。

## 略读辅助函数（非主对话 API）

`generateGatekeeperQuiz`、`generateModuleTakeaways`、`generateModuleQuiz` 等仍为略读辅助能力，基于历史或独立 prompt 调用，**不是** `chatWithSkimAdaptiveTutor` 的替代。

## 手动回归清单

- **略读**：`viewMode === 'skim'` 下切换 STEM/社科；进入深度领读（reading）；多轮发消息；前置知识补习（tutoring）能正常回复。
- **备考**：备考台苏格拉底一轮；有索引时 chunk 白名单、无索引时文末 citations JSON 等行为与预期一致（依环境是否有索引）。

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
