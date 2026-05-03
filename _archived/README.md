# `_archived/` —— 归档代码

## 这个文件夹的用途

存放**当前产品里暂时不用、但未来可能恢复**的代码。和"死代码"不同：死代码是无人引用且产品也不需要的代码，应该直接删除；归档代码是产品方明确表示"功能可能回来"的代码，删除会丢失历史心血与设计意图，因此原样保留在这里。

**约定**：

- 这个文件夹**不参与 TypeScript 编译**（已在 [tsconfig.json](../tsconfig.json) 的 `exclude` 中排除），不会进入 `dist/`。
- 这个文件夹**不应被项目源码 import**——一旦发现 `import ... from '_archived/...'`，说明该模块其实还在用，应该搬回主源码。
- 文件夹内按主题分子目录（例如 `prompts/`、`components/`、`features/`），便于将来定位。
- 想恢复某段功能时：把对应文件搬回原位置，恢复必要的 import，删 README 中对应条目，重新跑 `npx tsc --noEmit` 验证。

---

## 已归档条目

### `prompts/galgame.ts` —— Galgame 角色化剧本 prompts

- **归档日期**：2026-05-02
- **归档原因**：产品的 galgame 入口已关闭，相关 prompt 当前无人引用；但产品方明确未来可能重新启用。
- **包含内容**：
  - `GALGAME_SYSTEM_PROMPT`（Atri 角色，将 PDF 转为线性 galgame 剧本）
  - `REM_STORYTELLER_PROMPT`（Rem 角色，将文档转为蕾姆口吻的独白）
- **从哪里搬来**：原位置在 [utils/prompts.ts](../utils/prompts.ts) 文件末尾。同文件中的 `CLASSIFIER_PROMPT`、`STEM_SYSTEM_PROMPT`、`HUMANITIES_SYSTEM_PROMPT` 仍在使用，**未归档**。
- **运行行为影响**：当前 galgame 模式（如果重启）实际走的是 [services/geminiService.ts](../services/geminiService.ts) 中内联的 `getPersonaSystemPrompt` + `generatePersonaStoryScript`。这两个常量在归档前就已经没人 import，归档**不改变任何运行时行为**。
- **恢复指引**：把 `_archived/prompts/galgame.ts` 中的两个常量搬回 [utils/prompts.ts](../utils/prompts.ts)，并按需在 geminiService 或 galgame 相关组件中 import 使用。
