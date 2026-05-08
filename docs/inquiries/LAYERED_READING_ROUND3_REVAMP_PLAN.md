# 递进阅读模式 · Round 3 改造 PLAN

> **依据 INQUIRY:** `docs/inquiries/LAYERED_READING_ROUND3_REVAMP_INQUIRY.md`(commit `a13cecb`)
> **现状底本:** `docs/inquiries/LAYERED_READING_ROUND3_RECON.md`(commit `20fec12`)
> **基线分支:** `refactor`(`ea0e5b1` 阶段 4 + `aad85cf` 持久化补丁 + `19ad9c9` 文档补记 + `20fec12` RECON + `a13cecb` INQUIRY)
> **撰写日期:** 2026-05-08
> **施工对象:** Claude Code

---

## §0 · 给施工方的总规则

### 0.1 工作模式

本 PLAN 分 **3 个阶段(5.1 / 5.2 / 5.3)**,**必须串行执行**。每个阶段:

1. 严格按本 PLAN 列出的 file:line:operation 执行
2. 阶段结束时跑该阶段的"验收清单"
3. 验收通过 → commit(message 见每阶段末尾)
4. 不要 push,等项目主确认
5. **不要预先动后续阶段的代码**(例如阶段 5.1 不许写 UI 组件)

### 0.2 何时停下来问

遇到以下情况立即停下报告项目主,**不要自行决定**:

- 任何文件实际行号与 PLAN 标注的行号差超过 5 行
- 任何已有函数签名与 RECON 描述不一致
- 跑 `tsc` 出现新增 errors(只允许保持基线 10 errors,不允许增加)
- prompt 里的中文需要翻成英文(项目所有 prompt 都是中文,严禁擅自翻译)

### 0.3 不允许的事

- ❌ 修改 `LayeredReadingRound3Detail` 类型(旧类型一字不改)
- ❌ 修改阶段 4 application 题相关代码(`questions[]`、批改逻辑、`LayeredReadingQuestionBox`)
- ❌ 修改 `App.tsx` 持久化层(filePersistedSnapshot / IndexedDB / Firestore 写入)
- ❌ 重命名 `round3Details` 字段(向后兼容必须)
- ❌ 引入新依赖(markdown 渲染用项目内既有的)
- ❌ 把第 7 块"小题"写进 `LayeredReadingState.questions[]`(详见 INQUIRY §8.B)

### 0.4 校验基线

每个阶段开始前先跑:

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

记下数字(预期 10)。阶段末再跑,数字不能增加。

---

## §A · 阶段 5.1 — 类型 + Prompt + AI 函数

### A.0 阶段目标

让 `generateLayeredRound3Unit` 函数在 console 里独立可调,返回合法 `LayeredReadingRound3Unit`。**UI 完全不变**——这一阶段后用户看不到任何变化,只有底层骨架就位。

### A.1 改动文件清单

| # | 文件 | 操作 |
|---|---|---|
| A1 | `types.ts` | 新增 `LayeredReadingRound3Unit` interface;给 `LayeredReadingRound2Branch` 加 `round3Unit?` 字段 |
| A2 | `lib/prompts/layeredReadingPrompts.ts` | 新增 `BILINGUAL_TERMINOLOGY_RULE` 常量;新增 `buildLayeredRound3UnitPrompt` 函数 |
| A3 | `services/geminiService.ts` | 新增 `generateLayeredRound3Unit` 函数 |

### A.2 操作 A1 — types.ts

#### A.2.1 新增 `LayeredReadingRound3Unit` interface

**位置:** 紧跟在现有 `LayeredReadingRound3Detail` interface **之后**(根据 RECON §1,`Round3Detail` 在 types.ts:266 附近,新 interface 加在该 interface 闭合 `}` 的下一行)。

**精确指令:**

1. 用 `view` 工具看 `types.ts:260-295`,找到 `LayeredReadingRound3Detail` interface 的闭合 `}`
2. 在闭合 `}` 后空一行,粘贴以下完整代码:

```ts
/**
 * 阶段 5 新增:Round 3 结构化学习单元(7 块固定结构)。
 *
 * 与旧 LayeredReadingRound3Detail[] 共存:
 * - 旧数据(round3Details)保留显示,不强制迁移
 * - 新生成的 branch 走 round3Unit
 * - 渲染层根据 branch 上哪个字段有值决定走哪条路径(round3Unit 优先)
 *
 * 7 块顺序固定不可重排,与 buildLayeredRound3UnitPrompt 输出顺序一致。
 * 第 4 块(figureGuide)按需省略——讲义无图时 AI 不输出该字段。
 *
 * 第 7 块 miniQuestion 是纯展示文本,不进 LayeredReadingState.questions[]。
 * 阶段 4 的 application 题独立保留,与本 unit 无任何耦合。
 */
export interface LayeredReadingRound3Unit {
  /** 块 1:这一小节在回答什么问题(一句话,问句形式) */
  coreQuestion: string;
  /** 块 2:机制 / 逻辑链条(step-by-step,markdown 编号列表) */
  mechanismChain: string;
  /** 块 3:关键术语挂载(每条说明在机制中的角色,markdown 列表) */
  keyTerms: string;
  /** 块 4:图 / 表 / 实验怎么读(可选——讲义无图时省略) */
  figureGuide?: string;
  /** 块 5:考试最低答案骨架(中英对照) */
  answerSkeleton: string;
  /** 块 6:易混点("不要把 A 理解成 B" 格式) */
  confusionPoints: string;
  /** 块 7:小题(题面 + 参考答案,纯展示文本) */
  miniQuestion: string;
  /** 阶段 3 溯源延续:整块 unit 的主要溯源页码(>= 1) */
  sourcePage: number;
  /** 阶段 3 溯源延续:位置描述(如"第 12 页中部图示") */
  sourceLocation: string;
  /** 生成时间(Unix ms) */
  generatedAt: number;
}
```

#### A.2.2 修改 `LayeredReadingRound2Branch` interface

**位置:** RECON §1 显示 `LayeredReadingRound2Branch` 在 types.ts:296-307 附近。

**精确指令:**

1. 找到 `LayeredReadingRound2Branch` interface
2. 找到现有的 `round3Details?: LayeredReadingRound3Detail[];` 字段
3. 在该字段**正下方**追加一行新字段:

```ts
  /** Round 3 新数据:结构化 7 块学习单元(阶段 5 新增,优先级高于 round3Details) */
  round3Unit?: LayeredReadingRound3Unit;
```

#### A.2.3 验证 A1

跑:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```
数字必须 == 基线值(预期 10),不能增加。

### A.3 操作 A2 — layeredReadingPrompts.ts

#### A.3.1 新增 `BILINGUAL_TERMINOLOGY_RULE` 常量

**位置:** 文件顶部 import 块之后,任何函数定义之前。

**精确指令:**

1. 用 `view` 工具看 `lib/prompts/layeredReadingPrompts.ts` 前 30 行
2. 找到最后一个 import 语句之后的空行
3. 在该位置粘贴以下常量(用 export const,以便其他 prompt 函数也能 import):

```ts
/**
 * 阶段 5 通用规则:中英对照术语括注。
 * Round 1 / Round 2 / Round 3 unit 三处 prompt 共用,改动时三处同步。
 */
export const BILINGUAL_TERMINOLOGY_RULE = `【中英对照规则】
- **专业术语首次出现时**,在括号里附英文(原文是中文)或中文(原文是英文)
- 例: "放射状胶质细胞 (radial glial cells) 引导神经元..."
- 例: "outside-in manner(由外向内的方式)发生迁移..."
- **同一术语在同一段内容内重复出现时**,只在第一次括注,后续不重复
- **非专业术语的普通中文表达不需要附英文**
- 判断"是否专业术语"的标准:学生在考试里需要写出英文原词的,就是专业术语`;
```

#### A.3.2 新增 `buildLayeredRound3UnitPrompt` 函数

**位置:** 文件末尾(在所有现有 build* 函数之后)。

**精确指令:**

1. 用 `view` 工具看 `lib/prompts/layeredReadingPrompts.ts` 末尾,找到最后一个 build* 函数的闭合 `}`
2. 在闭合 `}` 后空一行,粘贴以下完整函数:

```ts
/**
 * 阶段 5 新增:生成 Round 3 结构化学习单元 prompt。
 *
 * 与旧 buildLayeredRound3DetailsPrompt 完全独立,不共享任何辅助函数。
 * 输出严格 JSON,字段对齐 LayeredReadingRound3Unit。
 *
 * 关键钉死:
 * - figureGuide 在 schema required 之外,讲义无图时 AI 直接省略此 key
 * - 中英对照通过 BILINGUAL_TERMINOLOGY_RULE 注入
 * - 7 块顺序与 LayeredReadingRound3Unit 字段顺序一致
 */
export function buildLayeredRound3UnitPrompt(
  parentModule: LayeredReadingModule,
  branch: LayeredReadingRound2Branch
): string {
  const moduleStoryTitle = parentModule.storyTitle;
  const modulePageRange = parentModule.pageRange ?? '?';
  const branchTitle = branch.title;
  const branchSourcePage = branch.sourcePage ?? '?';

  return `你是 class-skip 的「递进阅读模式」Round 3 深度学习单元生成助手。

学生现在想深度掌握 module:「${moduleStoryTitle}」(对应 PDF 第 ${modulePageRange} 页)的子枝干:「${branchTitle}」(主要在 PDF 第 ${branchSourcePage} 页)。

【你要做的】
为这个子枝干生成**一份完整学习单元**,严格按以下 7 块顺序输出。这一份单元的目标是:学生看完后能在考试里把这一节的题答出来。

═══════════════════════════════════════════════════════
全 7 块通用要求(必读)
═══════════════════════════════════════════════════════
**长度不预设具体字数**——以学生能看懂为准。该长就长,该短就短,但每块都必须**饱满**(不允许敷衍一句带过)。判断标准:学生看完这块,能不能在脑子里复现 / 在试卷上写出关键内容。

═══════════════════════════════════════════════════════
块 1: coreQuestion(这一小节在回答什么问题?)
═══════════════════════════════════════════════════════
用一句话说明该子枝干在解决的核心问题。
必须是问题形式("如何...?" / "为什么...?" / "...是怎么发生的?"),不要写成陈述句。

═══════════════════════════════════════════════════════
块 2: mechanismChain(机制链条 / 逻辑链条)
═══════════════════════════════════════════════════════
用 step-by-step 方式解释过程:
- 若为机制类: 起点 → 中间机制 → 结果
- 若为实验类: 实验设置 → 观察结果 → 说明什么

要求:
- 用 markdown 编号列表(1. / 2. / 3. ...)
- 步数由内容决定(2 步可以,7 步也可以),关键是因果关系完整
- 每步告诉学生"这一步在干什么、为什么是这样"
- 步骤之间用 "→" 或文字明确表达因果

═══════════════════════════════════════════════════════
块 3: keyTerms(关键术语挂载)
═══════════════════════════════════════════════════════
列出本子枝干中的重要术语。条数由讲义实际术语量决定,不强求最少最多。

要求:
- 每条格式: **术语原词 (English term)**: 这个术语在机制链条第 X 步起的作用
- **不要只写孤立定义**——必须说明它在块 2 机制链条中的角色
- 中英对照: 如果原词是中文,在括号里给英文;如果原词是英文,在括号里给中文
- 用 markdown 列表

═══════════════════════════════════════════════════════
块 4: figureGuide(图 / 表 / 实验怎么读 —— 可选块)
═══════════════════════════════════════════════════════
**只有当 PDF 该 branch 对应的 slide(第 ${branchSourcePage} 页附近)真的有图、表或实验图示时**,才生成此块。否则**直接省略 figureGuide 字段**(JSON 输出中不出现这个 key)。

若生成,说明清楚:
- 图中主要元素代表什么(蓝色细胞 / 红色箭头 / 坐标轴 X 是什么)
- 图的方向、颜色、箭头或坐标轴代表什么
- 这张图想支持机制链条中的哪个观点
- 考试如果给图,学生应该抓什么(关键观察点)

═══════════════════════════════════════════════════════
块 5: answerSkeleton(考试最低答案骨架)
═══════════════════════════════════════════════════════
生成 short-answer minimum answer skeleton(假设这一节会以 short-answer 形式考)。

要求:
- **中英对照**:每句中文答案后括号附英文,如 "线粒体是细胞的能量工厂 (Mitochondria are the energy factory of the cell)"
- 必须覆盖块 2 机制链条的核心步骤,**关键步骤一个不漏**
- 长度以"答出能拿满分"为准——不需要凑字数,也别遗漏要点
- 用 markdown 编号列表

═══════════════════════════════════════════════════════
块 6: confusionPoints(易混点)
═══════════════════════════════════════════════════════
指出学生最可能混淆的点。条数由该子枝干的真实易混程度决定(可能就 1 个,也可能有 3-4 个)。

要求:
- 必须用 "不要把 A 理解成 B" 的格式
- 每条说清"为什么会混"和"实际区别是什么"
- 用 markdown 列表
- **如果该 branch 真的没有易混点,可以输出"本节内容直接清晰,无典型易混点。"——不要硬造**

═══════════════════════════════════════════════════════
块 7: miniQuestion(小题)
═══════════════════════════════════════════════════════
生成 1 道与该子枝干匹配的**细节应用题**。

要求:
- **不是认知层题**(不要"什么是 X?"这种背术语题)
- **必须是应用题**(给一个新场景/反例/数据,让学生用机制解释)
- 输出格式: **题目**: <题面>\\n\\n**参考答案**: <答案要点>
- 题面长度以题目能讲清楚情境为准;参考答案以"覆盖踩分点"为准

═══════════════════════════════════════════════════════
${BILINGUAL_TERMINOLOGY_RULE}
═══════════════════════════════════════════════════════
【铁律·关于溯源(必读)】
═══════════════════════════════════════════════════════
1. **绝对不许编造页码**——sourcePage 必须是该 branch 在 PDF 中的真实主要页码
2. sourceLocation 必须有意义("第 12 页中部图示" / "第 11 页顶部要点段")
3. 整份 unit 共享一个 sourcePage / sourceLocation,代表本 unit 内容的主要锚点

═══════════════════════════════════════════════════════
【严格禁令】
═══════════════════════════════════════════════════════
1. 不要在末尾说"接下来""下一步"等推进语
2. 不要在 miniQuestion 之外的块里出题
3. 不要凑数——某块如果讲义内容不足以支撑高质量输出,**返回空字符串让客户端 reject**,不要硬凑
4. 不要把 markdown 代码围栏包在 JSON 输出外

【输出 JSON 严格格式】
{
  "coreQuestion": "...",
  "mechanismChain": "...",
  "keyTerms": "...",
  "figureGuide": "..." (可选,无图时省略此 key),
  "answerSkeleton": "...",
  "confusionPoints": "...",
  "miniQuestion": "**题目**: ... \\n\\n**参考答案**: ...",
  "sourcePage": <number>,
  "sourceLocation": "..."
}

不要输出额外字段;不要包含 markdown 代码围栏。`;
}
```

#### A.3.3 验证 A2

跑:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```
数字必须 == 基线值。

### A.4 操作 A3 — geminiService.ts

#### A.4.1 新增 `generateLayeredRound3Unit` 函数

**位置:** 紧跟在现有 `generateLayeredRound3Details` 函数**之后**(RECON §2 显示该函数在文件中段)。

**精确指令:**

1. 用 `view` 工具找到 `generateLayeredRound3Details` 函数的闭合 `}`
2. 在闭合 `}` 后空一行,粘贴以下完整函数:

```ts
/**
 * 阶段 5 新增:为指定 branch 生成 Round 3 结构化学习单元。
 *
 * 与 generateLayeredRound3Details 完全独立函数,不共享代码。
 *
 * 客户端校验铁律(对齐铁律 6):
 * - 7 块必填字段缺一返回 null(figureGuide 不参与校验)
 * - sourcePage 必须 >= 1
 * - 所有字符串字段 trim 后长度 > 0
 */
export const generateLayeredRound3Unit = async (
  fullText: string,
  parentModule: LayeredReadingModule,
  branch: LayeredReadingRound2Branch
): Promise<LayeredReadingRound3Unit | null> => {
  try {
    const prompt = buildLayeredRound3UnitPrompt(parentModule, branch);
    const fullPrompt = `${prompt}\n\n讲义全文如下:\n\n${fullText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coreQuestion: { type: Type.STRING },
            mechanismChain: { type: Type.STRING },
            keyTerms: { type: Type.STRING },
            figureGuide: { type: Type.STRING },
            answerSkeleton: { type: Type.STRING },
            confusionPoints: { type: Type.STRING },
            miniQuestion: { type: Type.STRING },
            sourcePage: { type: Type.NUMBER },
            sourceLocation: { type: Type.STRING },
          },
          required: [
            'coreQuestion',
            'mechanismChain',
            'keyTerms',
            'answerSkeleton',
            'confusionPoints',
            'miniQuestion',
            'sourcePage',
            'sourceLocation',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);

    // 客户端校验:7 必填块 + 溯源
    const valid =
      typeof parsed.coreQuestion === 'string' && parsed.coreQuestion.trim().length > 0 &&
      typeof parsed.mechanismChain === 'string' && parsed.mechanismChain.trim().length > 0 &&
      typeof parsed.keyTerms === 'string' && parsed.keyTerms.trim().length > 0 &&
      typeof parsed.answerSkeleton === 'string' && parsed.answerSkeleton.trim().length > 0 &&
      typeof parsed.confusionPoints === 'string' && parsed.confusionPoints.trim().length > 0 &&
      typeof parsed.miniQuestion === 'string' && parsed.miniQuestion.trim().length > 0 &&
      typeof parsed.sourcePage === 'number' && parsed.sourcePage >= 1 &&
      typeof parsed.sourceLocation === 'string' && parsed.sourceLocation.trim().length > 0;

    if (!valid) return null;

    return {
      coreQuestion: parsed.coreQuestion,
      mechanismChain: parsed.mechanismChain,
      keyTerms: parsed.keyTerms,
      figureGuide:
        typeof parsed.figureGuide === 'string' && parsed.figureGuide.trim().length > 0
          ? parsed.figureGuide
          : undefined,
      answerSkeleton: parsed.answerSkeleton,
      confusionPoints: parsed.confusionPoints,
      miniQuestion: parsed.miniQuestion,
      sourcePage: parsed.sourcePage,
      sourceLocation: parsed.sourceLocation,
      generatedAt: Date.now(),
    };
  } catch (e) {
    console.error('[generateLayeredRound3Unit] failed:', e);
    return null;
  }
};
```

#### A.4.2 添加必要的 import

**精确指令:**

1. 看 `geminiService.ts` 顶部 import 块
2. 确认以下 import 已在或需添加:
   - `LayeredReadingRound3Unit` (从 `../types`)
   - `buildLayeredRound3UnitPrompt` (从 prompt 模块)
3. 如果 `LayeredReadingRound3Detail` 已经从 `../types` import,在同一行追加 `LayeredReadingRound3Unit`
4. 如果 `buildLayeredRound3DetailsPrompt` 已经从 prompt 模块 import,在同一行追加 `buildLayeredRound3UnitPrompt`

#### A.4.3 验证 A3

跑:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```
数字必须 == 基线值。

### A.5 阶段 5.1 验收清单

- [ ] `tsc` 0 new errors(基线 10 → 仍是 10)
- [ ] `types.ts` 增加约 30 行(`LayeredReadingRound3Unit` interface + `LayeredReadingRound2Branch` 加 1 字段)
- [ ] `lib/prompts/layeredReadingPrompts.ts` 增加约 200 行(常量 + 函数)
- [ ] `services/geminiService.ts` 增加约 80 行(新函数)
- [ ] **完全没改的文件**:`App.tsx`、`LayeredReadingPanel.tsx`、`LayeredReadingTree.tsx`、所有持久化层文件
- [ ] 旧 `generateLayeredRound3Details` / `LayeredReadingRound3Detail` / `buildLayeredRound3DetailsPrompt` **一字未改**
- [ ] 用户进入 Round 3 行为完全不变(因为 UI 还没接新函数)

### A.6 阶段 5.1 commit

```bash
git add types.ts lib/prompts/layeredReadingPrompts.ts services/geminiService.ts
git diff --cached --stat  # 确认只动这 3 个文件
git commit -m "feat(layered-reading): 阶段 5.1 - Round 3 unit 类型 + prompt + AI 函数

- 新增 LayeredReadingRound3Unit interface(7 块结构)
- LayeredReadingRound2Branch 加 round3Unit? 字段(与 round3Details 共存)
- 新增 BILINGUAL_TERMINOLOGY_RULE 常量(三处 prompt 共用)
- 新增 buildLayeredRound3UnitPrompt + generateLayeredRound3Unit
- UI 不变,仅底层骨架就位

依据 docs/inquiries/LAYERED_READING_ROUND3_REVAMP_INQUIRY.md §3 §4"
```

---

## §B · 阶段 5.2 — UI 渲染 + 触发入口

### B.0 阶段目标

Round 3 展开时改用新 unit;旧数据 fallback 到旧卡片。**这一阶段后用户能看到 7 块结构化内容。**

### B.1 改动文件清单

| # | 文件 | 操作 |
|---|---|---|
| B1 | `features/reader/layered/Round3UnitView.tsx` | **新建** |
| B2 | `features/reader/layered/LegacyRound3DetailsView.tsx` | **新建**(从 LayeredReadingTree 抽出旧 JSX) |
| B3 | `features/reader/layered/LayeredReadingTree.tsx` | 改写 Round 3 渲染逻辑 + 改写 handleExpandToRound3 |

### B.2 操作 B1 — 新建 Round3UnitView.tsx

#### B.2.1 文件路径与导入

**精确指令:**

1. 在 `features/reader/layered/` 目录下新建文件 `Round3UnitView.tsx`
2. 文件完整内容如下:

```tsx
import React from 'react';
import type { LayeredReadingRound3Unit } from '../../../types';

/**
 * 阶段 5.2 新增:Round 3 结构化 7 块学习单元渲染组件。
 *
 * 渲染规则(对齐 INQUIRY §5.2):
 * - 7 块顺序固定不可重排,与 LayeredReadingRound3Unit 字段顺序一致
 * - figureGuide 缺失则整块不渲染(标题一起省)
 * - answerSkeleton 块视觉特殊(浅黄底强调),其余 6 块平视
 * - 每块标题带 emoji,emoji 是标题的一部分
 * - markdown 内容用项目内既有渲染器(如有 RoundContentMarkdown 组件就复用,
 *   否则用 dangerouslySetInnerHTML 配合 marked.parse,与 Round 1/2 保持一致)
 */

interface Props {
  unit: LayeredReadingRound3Unit;
  onJumpToPage?: (page: number) => void;
}

interface BlockProps {
  title: string;
  content: string;
  highlight?: boolean;
}

function Block({ title, content, highlight }: BlockProps) {
  // 注意:此处 markdown 渲染必须对齐项目内既有方式。
  // 实施时 Claude Code 必须先看 LayeredReadingTree.tsx 中现有 round3Detail
  // 的描述渲染用了什么(可能是直接字符串、可能是 marked、可能是自建组件),
  // 沿用同一种,不要引入新依赖。
  return (
    <div
      className={
        highlight
          ? 'rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2'
          : 'px-1'
      }
    >
      <div className="text-[13px] font-semibold text-stone-700 mb-1">{title}</div>
      <div className="text-[13px] text-stone-700 leading-relaxed whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

const Round3UnitView: React.FC<Props> = ({ unit, onJumpToPage }) => {
  return (
    <div className="space-y-3 ml-2 border-l-2 border-stone-100 pl-2.5 mt-2">
      <Block title="📍 这一节在回答什么问题?" content={unit.coreQuestion} />
      <Block title="⚙️ 机制链条" content={unit.mechanismChain} />
      <Block title="🏷️ 关键术语" content={unit.keyTerms} />
      {unit.figureGuide && (
        <Block title="📊 图/表/实验怎么读" content={unit.figureGuide} />
      )}
      <Block title="📝 考试最低答案骨架" content={unit.answerSkeleton} highlight />
      <Block title="⚠️ 易混点" content={unit.confusionPoints} />
      <Block title="✏️ 小题(细节应用)" content={unit.miniQuestion} />

      {/* 整份 unit 共享一个溯源 chip,对齐阶段 3 RoundContentWithSource pattern */}
      {unit.sourcePage > 0 && onJumpToPage && (
        <button
          type="button"
          onClick={() => onJumpToPage(unit.sourcePage)}
          className="text-[11px] text-stone-500 hover:text-stone-800 underline-offset-2 hover:underline"
        >
          📄 第 {unit.sourcePage} 页 · {unit.sourceLocation}
        </button>
      )}
    </div>
  );
};

export default Round3UnitView;
```

#### B.2.2 markdown 渲染器对齐

**重要:** 上述代码中 `Block` 用的是 `whitespace-pre-wrap` 简单换行渲染。

**实施前 Claude Code 必须做的事:**

1. 用 `view` 工具看 `LayeredReadingTree.tsx` 中现有 round3Detail 的 description 字段是怎么渲染的(RECON §3 应有线索)
2. 如果项目内有共用的 markdown 渲染组件(比如 `<RoundContentMarkdown />` 或类似),把 `Block` 内的渲染替换成同一组件
3. 如果项目内 round3Detail 也是用 `whitespace-pre-wrap` 直接渲染,保留现状即可

**禁止引入 react-markdown / remark / 新的 markdown 库**——必须用项目内已有方式。

### B.3 操作 B2 — 新建 LegacyRound3DetailsView.tsx

#### B.3.1 抽出旧 JSX

**精确指令:**

1. 用 `view` 工具看 `features/reader/layered/LayeredReadingTree.tsx`,找到现在渲染 `b.round3Details.map(...)` 的那一段 JSX(RECON §3 显示在 line 491 附近)
2. 把那一整段 JSX(包括 KIND_LABELS 的引用、kind chip 渲染、description 渲染、溯源 chip)**完整复制**到新文件 `LegacyRound3DetailsView.tsx`
3. 包成函数组件,接收 `details: LayeredReadingRound3Detail[]` 和 `onJumpToPage` 等必要 props
4. **不要修改任何 JSX 结构、class 名、文案**——这是平移,不是重写

文件骨架:

```tsx
import React from 'react';
import type { LayeredReadingRound3Detail } from '../../../types';

/**
 * 阶段 5.2 新增:旧 round3Details 数据的 fallback 渲染组件。
 *
 * 这是从 LayeredReadingTree.tsx 中抽出的旧渲染逻辑,JSX 完全一致,
 * 只在 branch.round3Unit 不存在且 branch.round3Details 存在时渲染。
 *
 * 不要修改这个组件——任何修改都可能破坏旧数据用户的体验。
 * 旧 round3Details 类型 / KIND_LABELS / kind chip 视觉一字不改。
 */

interface Props {
  details: LayeredReadingRound3Detail[];
  onJumpToPage?: (page: number) => void;
  // 实施时根据 LayeredReadingTree 现有 props 补齐(可能还有溯源回调等)
}

const LegacyRound3DetailsView: React.FC<Props> = ({ details, onJumpToPage }) => {
  // [此处粘贴从 LayeredReadingTree.tsx 抽出的完整 JSX]
  return (
    <div>{/* 平移自 LayeredReadingTree.tsx round3Details 渲染段 */}</div>
  );
};

export default LegacyRound3DetailsView;
```

**强制要求:** 抽出后必须**视觉完全一致**——不调任何 class、不改任何文案。

### B.4 操作 B3 — 改写 LayeredReadingTree.tsx

#### B.4.1 改写 Round 3 渲染逻辑

**位置:** RECON §3 显示 round3Details 渲染在 line 491 附近。

**精确指令:**

1. 找到现在 `expandedBranchIds.has(b.id) && b.round3Details && (...)` 这块 JSX
2. 替换成以下结构:

```tsx
{expandedBranchIds.has(b.id) && (
  <>
    {/* 优先渲染新 7 块 unit */}
    {b.round3Unit && (
      <Round3UnitView
        unit={b.round3Unit}
        onJumpToPage={onJumpToPage}
      />
    )}

    {/* fallback:旧扁平 details(仅当无 unit 但有 details 时) */}
    {!b.round3Unit && b.round3Details && b.round3Details.length > 0 && (
      <LegacyRound3DetailsView
        details={b.round3Details}
        onJumpToPage={onJumpToPage}
      />
    )}

    {/* 阶段 4 application 题:画在 unit / details 之后,行为完全不变 */}
    {(b.round3Unit || (b.round3Details && b.round3Details.length > 0)) && (
      // [保留原本 application 题渲染的 JSX,一字不改]
    )}
  </>
)}
```

3. 添加 import:
```tsx
import Round3UnitView from './Round3UnitView';
import LegacyRound3DetailsView from './LegacyRound3DetailsView';
```

4. **删除**原本内联的 round3Details map JSX(因为已抽到 LegacyRound3DetailsView)
5. **保留**原本 application 题的所有渲染逻辑,只是把它的"何时显示"改成"unit 或 details 任一存在时"

#### B.4.2 改写 handleExpandToRound3 函数

**位置:** RECON §3 / §4 应有线索,大概率是某个 onClick handler。

**精确指令:**

1. 找到当前调用 `generateLayeredRound3Details` 的地方
2. 把调用替换成 `generateLayeredRound3Unit`
3. 把回填 `round3Details` 字段改成回填 `round3Unit`
4. **如果旧 branch 已经有 round3Details,新生成时仍然回填到 round3Unit 字段,不动 round3Details**(避免覆盖旧数据)

伪代码:

```ts
const handleExpandToRound3 = async (moduleId, branchId) => {
  // ...
  const unit = await generateLayeredRound3Unit(fullText, parentModule, branch);
  if (!unit) {
    // 错误处理对齐现有 details 失败的处理
    return;
  }
  updateModule(moduleId, m => ({
    ...m,
    round2Branches: m.round2Branches.map(b =>
      b.id === branchId ? { ...b, round3Unit: unit } : b
    ),
  }));
  // ...
};
```

#### B.4.3 修正 hasDetails 判定(INQUIRY §8.C)

**精确指令:**

1. 在 `LayeredReadingTree.tsx` 中搜索所有判 "round3 是否已生成" 的位置(可能叫 `hasDetails`、`hasRound3` 之类)
2. 把判定改为:
```ts
const hasRound3 = Boolean(b.round3Unit) || (b.round3Details && b.round3Details.length > 0);
```
3. 所有用到该变量的位置同步替换

#### B.4.4 import 添加 LayeredReadingRound3Unit 类型(如需)

如果新代码引用了 `LayeredReadingRound3Unit` 类型,在文件顶部 import。

### B.5 阶段 5.2 验收清单

- [ ] `tsc` 0 new errors
- [ ] 新文件 2 个:`Round3UnitView.tsx`、`LegacyRound3DetailsView.tsx`
- [ ] `LayeredReadingTree.tsx` 改动只集中在:Round 3 渲染段、handleExpandToRound3、hasRound3 判定
- [ ] **没改的文件**:`App.tsx`、`LayeredReadingPanel.tsx`、所有持久化层
- [ ] 阶段 4 application 题的代码 / 行为 / UI 位置 **完全不变**(只是它的"何时显示"由 hasRound3 判)

### B.6 阶段 5.2 端到端手动验证(必跑)

部署到 class-skip-v2 后,逐项验证:

1. **新 PDF 路径**:打开一个**没有任何递进阅读历史**的 PDF
   - 进入递进阅读 → Round 1 → Round 2 → 展开任意 branch 进 Round 3
   - **预期看到:7 块结构化内容**(coreQuestion 在最上,emoji 标题清晰,answerSkeleton 浅黄底)
   - figureGuide 块视讲义有图无图,可能显示也可能省略

2. **旧 PDF 路径**:打开一个**已经生成过 round3Details 的旧 PDF**(或在 Firestore 直接看一个老 session)
   - 展开旧 branch → **预期看到:旧扁平卡片**(术语/对比/图表 chip),与改造前完全一致

3. **混合 PDF 路径**:同一 module 下,旧 branch 显示旧卡片,**新展开**的 branch 显示新 unit
   - 预期看到混合状态共存,无报错

4. **application 题验证**:三种路径下,application 题都正常显示在 unit/details 之后,题目交互(答题、批改)完全正常

5. **云存验证**(对齐 INQUIRY §7):新生成的 unit 登出后换浏览器登入,unit 数据完整恢复

### B.7 阶段 5.2 commit

```bash
git add features/reader/layered/Round3UnitView.tsx \
        features/reader/layered/LegacyRound3DetailsView.tsx \
        features/reader/layered/LayeredReadingTree.tsx
git diff --cached --stat
git commit -m "feat(layered-reading): 阶段 5.2 - Round 3 UI 改造 + 旧数据 fallback

- 新增 Round3UnitView 组件(7 块结构化渲染,answerSkeleton 浅黄强调)
- 抽出 LegacyRound3DetailsView(旧 round3Details 渲染平移,JSX 不动)
- LayeredReadingTree 改 Round 3 渲染逻辑:unit 优先,details fallback
- handleExpandToRound3 改调 generateLayeredRound3Unit
- application 题位置 / 行为完全不变(在 unit / details 之后渲染)

依据 docs/inquiries/LAYERED_READING_ROUND3_REVAMP_INQUIRY.md §5 §8.E"
```

---

## §C · 阶段 5.3 — Round 1 / 2 中英对照

### C.0 阶段目标

把 `BILINGUAL_TERMINOLOGY_RULE` 注入 Round 1 / Round 2 prompt,让专业术语首次出现时附英文(原文中文)或中文(原文英文)。**类型、数据、UI 完全不动。**

### C.1 改动文件清单

| # | 文件 | 操作 |
|---|---|---|
| C1 | `lib/prompts/layeredReadingPrompts.ts` | `buildLayeredRound1Prompt` 注入规则;`buildLayeredRound2Prompt` 注入规则 |

### C.2 操作 C1 — 注入规则

#### C.2.1 buildLayeredRound1Prompt

**精确指令:**

1. 用 `view` 工具找到 `buildLayeredRound1Prompt` 函数体
2. 在 prompt 字符串中适合的位置(通常在"输出要求"段落里或"严格禁令"之前)插入:

```ts
═══════════════════════════════════════════════════════
${BILINGUAL_TERMINOLOGY_RULE}
═══════════════════════════════════════════════════════
```

3. 不删除 / 不修改任何现有 prompt 内容
4. 不动函数签名、不动 responseSchema、不动校验逻辑

#### C.2.2 buildLayeredRound2Prompt

同 C.2.1,在 `buildLayeredRound2Prompt` prompt 字符串中插入同样规则段。

### C.3 阶段 5.3 验收清单

- [ ] `tsc` 0 new errors
- [ ] **唯一改动文件**:`lib/prompts/layeredReadingPrompts.ts`(只在 Round 1 / Round 2 prompt 中各加一段规则文本)
- [ ] 类型 / 数据结构 / UI / 持久化全部 0 改动
- [ ] 现有 round1Content / round2Branch.content 数据保持不变(不刷新就还是旧文本)

### C.4 阶段 5.3 端到端手动验证

1. 打开一个 PDF,**重新生成** Round 1(或者打开一个新 PDF 第一次进 Round 1)
2. 检查 Round 1 内容里专业术语首次出现处:
   - 中文术语后跟 `(English term)`
   - 英文术语后跟 `(中文术语)`
3. 同样验证 Round 2
4. 普通中文表达**不应该**有英文括注(防止 AI 滥用)

### C.5 阶段 5.3 commit

```bash
git add lib/prompts/layeredReadingPrompts.ts
git diff --cached --stat
git commit -m "feat(layered-reading): 阶段 5.3 - Round 1/2 prompt 注入中英对照规则

- buildLayeredRound1Prompt / buildLayeredRound2Prompt 注入 BILINGUAL_TERMINOLOGY_RULE
- 类型 / 数据 / UI 完全不动,仅 prompt 层
- 与阶段 5.1 Round 3 unit prompt 共用同一常量,三处规则文本一致

依据 docs/inquiries/LAYERED_READING_ROUND3_REVAMP_INQUIRY.md §6"
```

---

## §D · 全阶段完成后总验收

3 个阶段全部 commit 完后,在 push 之前必须完成:

### D.1 编译与类型

- [ ] `npx tsc --noEmit` 0 new errors
- [ ] `npm run build` 成功(如果项目有 build 脚本)

### D.2 端到端手动验证(在 class-skip-v2 部署后跑)

#### D.2.1 新 PDF 完整链路
- [ ] 打开新 PDF,点入递进阅读 → Round 1 故事生成,**Round 1 内容包含中英对照**
- [ ] Round 1 → Round 2 子枝干生成,**Round 2 内容包含中英对照**
- [ ] 展开任意 branch → **Round 3 显示 7 块结构化 unit**(emoji 标题、answerSkeleton 浅黄底)
- [ ] application 题正常出现在 unit 之后,答题 / 批改正常

#### D.2.2 旧 PDF 兼容
- [ ] 打开历史 PDF(已有旧 round3Details 数据)
- [ ] 展开旧 branch → 看到旧扁平卡片(完全没变)
- [ ] application 题位置 / 行为没变

#### D.2.3 云存与跨设备
- [ ] 新 PDF 生成 unit → 登出 → 换浏览器登入 → unit 完整恢复
- [ ] 旧 PDF 旧 details → 跨设备恢复 → 仍然是旧卡片显示

#### D.2.4 边界情况
- [ ] 讲义无图的 branch,unit 第 4 块自动省略
- [ ] AI 生成失败时,UI 显示错误状态,可重试
- [ ] application 题状态(已答 / 批改 / 重答)在新旧 UI 下都正常

### D.3 push

全部验收通过后,**项目主决定 push 时机**。Claude Code 不主动 push。

```bash
# 项目主确认后:
git push origin refactor
```

---

## §E · 回滚指令

### E.1 单个阶段回滚

```bash
# 回滚阶段 5.3
git revert <阶段 5.3 commit hash>

# 回滚阶段 5.2 + 5.3
git revert <阶段 5.2 commit hash>
git revert <阶段 5.3 commit hash>

# 全回滚到阶段 4 + 持久化补丁(基线状态)
git reset --hard a13cecb  # INQUIRY commit 之后,任何代码改动之前
```

### E.2 仅回滚 UI(保留数据)

如果阶段 5.2 UI 上线后发现严重问题但不想丢数据:

1. `git revert <阶段 5.2 commit hash>`(只回 UI)
2. `round3Unit` 字段在 Firestore 已写的数据**不会消失**——只是 UI 暂时不显示
3. 修复问题后重新 push 阶段 5.2,数据自动重新可见

### E.3 紧急回滚(用户报告严重 bug)

```bash
# 立即回到阶段 4 末尾
git reset --hard 19ad9c9
git push origin refactor --force-with-lease  # 谨慎使用
```

**慎用 force push**——必须先和项目主同步。

---

## §F · 给 Claude Code 的最终提醒

1. 每个阶段开始前,**先读** INQUIRY 对应章节(§A 读 §3 §4,§B 读 §5 §8,§C 读 §6)
2. 每个阶段开始前,**先看 RECON** 验证文件实际行号
3. 行号对不上 → 停下来报告,不要自己猜
4. 每完成一个文件改动,跑 `tsc` 校验,**不积累错误到阶段末**
5. 每个阶段单独 commit,**不要合并 commit**(便于回滚)
6. 不主动 push,等项目主指令
7. 验收清单逐项打钩,不跳过

---

> **PLAN 撰写完毕。** 项目主审完后 commit 进 `docs/inquiries/`,然后 Claude Code 按本 PLAN 分阶段施工。
