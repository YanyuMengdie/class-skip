# P1：学科带 + 学习者心态（保温流）

## Firestore 变更

- 集合 `exams` 文档新增可选字段 **`disciplineBand`**：`humanities_social` | `business_mgmt` | `stem` | `arts_creative` | `unspecified`（默认未设置视为 `unspecified`）。
- 今日计划缓存文档中的 `maintenance`（`CachedMaintenanceBundle`）新增可选字段：
  - **`disciplineBand`**、**`mood`**（`LearnerMood`）、**`urgency`**（`UrgencyBand`），用于与 `cacheKey` 一致校验；旧缓存无这些字段时会因 `cacheKey` 变化而自然失效。

## 缓存 key（保温闪卡）

`cacheKey` 现已包含：`考试 id 列表`、`材料 key`、`flashCount`、**`disciplineBand`**、**`learnerMood`**、**`aggregatedUrgency`**。切换学科带或心态后不应错误命中旧结果。

## 学科教学法（一句话）

见 `data/disciplineTeachingProfiles.ts`：四类学科 + `unspecified` 通用，注入 `generateMaintenanceFlashCards` 的 Prompt。

## 心态与旧 Study Flow「状态」映射

| `LearnerMood`（P1） | 旧 `AffectState` / UI |
|---------------------|------------------------|
| `normal` | `good`（正常） |
| `dont_want` | 接近 `tired`（疲惫）：减量、短句、可先呼吸 |
| `want_anxious` | `anxious`（焦虑）：小步可控、不评价 |

情境模板键：`buildExtendedScenarioKey(familiarity, urgency, mood)`；无专用模板时回退到旧 `_good/_tired/_anxious` 模板（见 `getTemplateForScenario`）。

## 材料 `docTypeHint`（可选）

`FilePlanMeta.docTypeHint`（`STEM` / `HUMANITIES`）若由上层写入，则在考试 **`disciplineBand === unspecified`** 时用于回退映射：`STEM`→`stem`，`HUMANITIES`→`humanities_social`。

## 开发调试

- `generateMaintenanceFlashCards`：在 **`import.meta.env.DEV`** 下 `console.debug('[generateMaintenanceFlashCards] P1 prompt context', { disciplineBand, mood, urgency })`。
