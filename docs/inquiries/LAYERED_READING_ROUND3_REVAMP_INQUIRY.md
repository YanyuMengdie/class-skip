# 递进阅读模式 · Round 3 内容改造 INQUIRY

> **范围:** Round 3 从"扁平 detail 卡片列表" → "结构化 7 块学习单元"
> **附带改动:** Round 1 / 2 / 3 全程中英对照(行内括注式)
> **基线分支:** `refactor`(`ea0e5b1` 阶段 4 + `aad85cf` 持久化补丁 + `19ad9c9` 文档补记)
> **现状底本:** `docs/inquiries/LAYERED_READING_ROUND3_RECON.md`(必读)
> **撰写日期:** 2026-05-08

---

## §1 · 问题陈述

### 1.1 现状(从 RECON §3)

Round 3 当前形态是**扁平 detail 卡片列表**:

- 每个 branch 下 2-6 张小卡片
- 每张卡片 = 一句话标签(术语/实验/图表/证据/对比) + 30-100 字描述 + 溯源页码
- 卡片之间**没有逻辑关系**,只是平铺
- 5 种 `kind` 用同一个灰色 chip + 同一种渲染模板,**视觉上无区分**

### 1.2 问题(产品自查)

用户(项目主)在产品上线后,通过实际使用 IMM250 Week 1 PDF 进入 Round 3,发现:

> "Round 3 太简单了,就只是讲解专业词汇。"

诊断:Round 3 当前的内容设计在三轮递进中**深度断层**:

- Round 1(故事)→ Round 2(子枝干概要)→ Round 3(术语词典)
- 第三层退化成了**词汇表 + 图表 caption**,没有真正展开"为什么、怎么发生、和什么对照"
- "粗 → 中 → 细"的设计意图在第 3 层失效

### 1.3 目标

Round 3 从"术语词典"升级为**完整学习单元**——每个 branch 下挂**一份固定 7 块结构的内容**,达到"学生看完这块就能在考试里写出答案"的水平。

---

## §2 · 新规格:Round 3 单元 7 块结构

每个 Round 2 子枝干生成**一个 Round3Unit**,固定包含以下 7 块,顺序固定不可重排:

| # | 块名 | 内容 | 长度建议 |
|---|---|---|---|
| 1 | **这一小节在回答什么问题?** | 一句话说明该子枝干解决的核心问题 | 1 句 |
| 2 | **机制链条 / 逻辑链条** | step-by-step 解释过程:起点 → 中间 → 结果。若是实验则:实验设置 → 观察结果 → 说明什么 | 3-6 步 |
| 3 | **关键术语挂载** | 列出本子枝干中的重要术语,每个术语必须说明它在机制链条中的**角色**(不只是孤立定义) | 2-5 条 |
| 4 | **图 / 表 / 实验怎么读**(可选) | 仅当对应 slide 有图表/实验时生成。说明:图中元素代表什么 / 方向颜色箭头坐标轴含义 / 想支持哪个观点 / 学生看图该抓什么 | 2-4 句 |
| 5 | **考试最低答案骨架** | short-answer minimum answer skeleton。要求**中英对照**,3-5 句即可,不要太长 | 3-5 句 |
| 6 | **易混点** | 用"不要把 A 理解成 B"形式,指出学生最可能混淆的 1-3 个点 | 1-3 条 |
| 7 | **小题** | 1 道与该子枝干匹配的细节应用题。题目必须能检测学生**是否真的能输出**,不只是认识术语 | 1 道,题面 + 参考答案 |

### 2.1 关于第 7 块"小题"的关键钉死

**第 7 块小题是 Round 3 内容文本的一部分,不是阶段 4 的 LayeredReadingQuestion。**

- 它**不进入** `LayeredReadingState.questions[]` 数组
- 它**没有** userAnswer / status / aiGrade 概念
- 它就是 Round 3 unit 里的一段文字(题面 + 参考答案),纯展示
- 学生看完知道"这块知识点要这样考",但不在这里答题
- 阶段 4 的 application 题(挂在 branch 上的真正可答题)**完全独立保留**,行为不变

→ 这条边界由项目主明确拍板:Q2 答案 = "两道独立的题。Round3 第七块的小题只是生成的 round3 文字出现了一道题,本质上是 round3 的一些文字而已。"

---

## §3 · 数据模型设计

### 3.1 新类型:`LayeredReadingRound3Unit`

```ts
// types.ts:新增(放在 LayeredReadingRound3Detail 定义后)

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
 */
export interface LayeredReadingRound3Unit {
  /** 块 1:这一小节在回答什么问题(一句话) */
  coreQuestion: string;
  /** 块 2:机制 / 逻辑链条(step-by-step,markdown 字符串,允许换行) */
  mechanismChain: string;
  /** 块 3:关键术语挂载(每条说明在机制中的角色,markdown 字符串) */
  keyTerms: string;
  /** 块 4:图 / 表 / 实验怎么读(可选——讲义无图时省略) */
  figureGuide?: string;
  /** 块 5:考试最低答案骨架(中英对照,3-5 句) */
  answerSkeleton: string;
  /** 块 6:易混点("不要把 A 理解成 B" 格式) */
  confusionPoints: string;
  /** 块 7:小题(题面 + 参考答案,纯文本不进 questions 数组) */
  miniQuestion: string;
  /** 阶段 3 溯源延续:整块 unit 的主要溯源页码 */
  sourcePage: number;
  /** 阶段 3 溯源延续:位置描述 */
  sourceLocation: string;
  /** 生成时间 */
  generatedAt: number;
}
```

**字段类型说明:**
- 7 块全是 `string`,不是结构化对象。每块内部用 markdown 换行/列表自由组织
- 仅 `figureGuide` 是 `?` 可选,其余 6 块必填
- 溯源字段(sourcePage / sourceLocation)沿用阶段 3 铁律 6,unit 整体绑定一个主要溯源点,而不是每块各自溯源

### 3.2 修改类型:`LayeredReadingRound2Branch`

```ts
// types.ts:296-307(修改后)
export interface LayeredReadingRound2Branch {
  id: string;
  index: number;
  title: string;
  content?: string | null;
  sourcePage?: number;
  sourceLocation?: string;
  /** Round 3 旧数据:扁平 detail 卡片列表(阶段 3 设计,保留向后兼容) */
  round3Details?: LayeredReadingRound3Detail[];
  /** Round 3 新数据:结构化 7 块学习单元(阶段 5 新增) */
  round3Unit?: LayeredReadingRound3Unit;
}
```

**钉死规则:**

1. `round3Details` 字段**保留**,旧 PDF 已生成的数据原样显示
2. `round3Unit` 字段**新增**,新触发的 Round 3 展开生成它
3. **互斥渲染**:同一 branch 优先渲染 `round3Unit`,若无则 fallback 到 `round3Details`
4. **不做迁移**:旧数据不自动转新格式,旧数据要变新数据需用户主动重新生成(本期不实现 UI 入口,留 P1)

### 3.3 LayeredReadingRound3Detail 不动

旧类型保留原字段、原行号、原注释,**一个字符不改**。降低耦合风险。

---

## §4 · Prompt 设计

### 4.1 新函数:`generateLayeredRound3Unit`

签名:

```ts
// services/geminiService.ts:新增
export const generateLayeredRound3Unit = async (
  fullText: string,
  parentModule: LayeredReadingModule,
  branch: LayeredReadingRound2Branch
): Promise<LayeredReadingRound3Unit | null>
```

**与 `generateLayeredRound3Details` 共存**——后者保留以备旧数据再生成时仍可走老路径(本期不调用,留备份)。

### 4.2 responseSchema(JSON 严格模式)

```ts
{
  type: Type.OBJECT,
  properties: {
    coreQuestion: { type: Type.STRING },
    mechanismChain: { type: Type.STRING },
    keyTerms: { type: Type.STRING },
    figureGuide: { type: Type.STRING },        // 注意:schema 层 required 中带它
    answerSkeleton: { type: Type.STRING },
    confusionPoints: { type: Type.STRING },
    miniQuestion: { type: Type.STRING },
    sourcePage: { type: Type.NUMBER },
    sourceLocation: { type: Type.STRING },
  },
  required: [
    'coreQuestion', 'mechanismChain', 'keyTerms',
    'answerSkeleton', 'confusionPoints', 'miniQuestion',
    'sourcePage', 'sourceLocation'
  ],
  // figureGuide 不在 required —— 讲义无图时 AI 直接省略
}
```

**关键决策:**`figureGuide` 不在 `required`。Gemini 的 JSON mode 在 schema required 缺失时允许字段省略,这正是我们想要的"没图就不输出"。

### 4.3 客户端校验

参考 `generateLayeredRound3Details` 的"防御层"思路(铁律 6):

```ts
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
```

`figureGuide` 不参与校验(可缺失)。

### 4.4 Prompt builder 完整草案

```ts
// lib/prompts/layeredReadingPrompts.ts:新增
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
- 输出格式: **题目**: <题面> \\n\\n **参考答案**: <答案要点>
- 题面长度以题目能讲清楚情境为准;参考答案以"覆盖踩分点"为准

═══════════════════════════════════════════════════════
【铁律·关于溯源(必读)】
═══════════════════════════════════════════════════════
1. **绝对不许编造页码**——sourcePage 必须该 branch 在 PDF 中的真实主要页码
2. sourceLocation 必须有意义("第 12 页中部图示" / "第 11 页顶部要点段")
3. 整份 unit 共享一个 sourcePage / sourceLocation,代表本 unit 内容的主要锚点

═══════════════════════════════════════════════════════
【中英对照规则(全 7 块通用)】
═══════════════════════════════════════════════════════
- **专业术语首次出现时**,在括号里附英文(原文是中文)或中文(原文是英文)
- 例: "放射状胶质细胞 (radial glial cells) 引导神经元..."
- 例: "outside-in manner(由外向内的方式)发生迁移..."
- **同一术语在同一 unit 内重复出现时**,只在第一次括注,后续不重复
- **非专业术语的普通中文表达不需要英文**

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
  "miniQuestion": "**题目**: ... \\n\\n **参考答案**: ...",
  "sourcePage": <number>,
  "sourceLocation": "..."
}

不要输出额外字段;不要包含 markdown 代码围栏。`;
}
```

---

## §5 · UI 渲染规则

### 5.1 渲染优先级

在 `LayeredReadingTree.tsx` 中,branch 展开后的 Round 3 区域:

```tsx
{expandedBranchIds.has(b.id) && (
  <>
    {/* 优先渲染新 unit */}
    {b.round3Unit && <Round3UnitView unit={b.round3Unit} onJumpToPage={onJumpToPage} />}

    {/* fallback 旧 details */}
    {!b.round3Unit && b.round3Details && b.round3Details.length > 0 && (
      <LegacyRound3DetailsView details={b.round3Details} onJumpToPage={onJumpToPage} />
    )}

    {/* application 题独立保留(挂在 branch 上,不动)*/}
    {(b.round3Unit || (b.round3Details && b.round3Details.length > 0)) && (
      <LayeredReadingQuestionBox questionType="application" ... />
    )}
  </>
)}
```

### 5.2 新 `Round3UnitView` 组件

新建 `features/reader/layered/Round3UnitView.tsx`,负责按 7 块顺序渲染。**结构化呈现**(项目主拍板 = A 方案,带明确小标题,像考试参考书那样;**保留 emoji** 增强视觉识别)。

```tsx
function Round3UnitView({ unit, onJumpToPage }: Props) {
  return (
    <div className="space-y-3 ml-2 border-l-2 border-stone-100 pl-2.5">
      <Block title="📍 这一节在回答什么问题?" content={unit.coreQuestion} />
      <Block title="⚙️ 机制链条" content={unit.mechanismChain} markdown />
      <Block title="🏷️ 关键术语" content={unit.keyTerms} markdown />
      {unit.figureGuide && <Block title="📊 图/表/实验怎么读" content={unit.figureGuide} markdown />}
      <Block title="📝 考试最低答案骨架" content={unit.answerSkeleton} markdown highlight />
      <Block title="⚠️ 易混点" content={unit.confusionPoints} markdown />
      <Block title="✏️ 小题(细节应用)" content={unit.miniQuestion} markdown />
      <SourceChip sourcePage={unit.sourcePage} sourceLocation={unit.sourceLocation} onJump={onJumpToPage} />
    </div>
  );
}
```

**渲染层钉死规则:**

1. 7 块顺序与类型字段顺序一致,**不可重排**
2. 7 块标题各配一个 emoji(📍⚙️🏷️📊📝⚠️✏️),emoji 是标题的一部分,**不可去除**
3. `figureGuide` 缺失则整块不渲染(连标题一起省)
4. `answerSkeleton` 块给 `highlight` 视觉强调(浅黄底/边框),因为它是"考试导向"信号——这是**唯一一块视觉特殊**,其余 6 块视觉平视
5. 每块 markdown 内容用项目内既有 markdown 渲染器(对齐 chat 消息 / Round 1/2 内容渲染),**不引入新依赖**
6. 整个 unit 共享一个 `SourceChip`(对齐阶段 3 RoundContentWithSource pattern)

### 5.3 旧 `Round3Details` 渲染保留

旧的 `KIND_LABELS` + 灰色 chip + RoundContentWithSource pattern 保留不动,只在 `b.round3Unit` 缺失时 fallback 渲染。代码上抽出成 `LegacyRound3DetailsView` 子组件(从现 inline JSX 提取,无逻辑变化)。

---

## §6 · 横切附带改动:Round 1 / 2 中英对照

### 6.1 范围

Round 1 / Round 2 的现有 prompt(`buildLayeredRound1Prompt` / `buildLayeredRound2Prompt`)各自加一段**中英对照规则**,与 Round 3 unit prompt §4.4 内"中英对照规则"段落完全一致。

### 6.2 不改动的事

- **数据结构不动**: Round 1 仍是单 string `round1Content`,Round 2 仍是单 string `content`
- **客户端不解析**: 不做"提取所有英文括注"之类的后处理
- **渲染层不改**: markdown 渲染器自然显示括号内英文,不加任何额外样式

### 6.3 关键决策记录

为什么 Round 1/2 不像 Round 3 那样加结构化字段(如 `keyTermsEn`)?

理由:
- Round 1/2 内容是叙述性文字,术语散布在自然语言中,**无固定挂载点**
- 行内括注 = AI 写作时同步处理,**零结构改动,零迁移成本**
- 用户阅读体验上,行内括注比"另起一栏列英文"更流畅
- 与项目主拍板"在需要的时候有英文"对齐——AI 判断哪些是专业术语,普通中文不强加英文

---

## §7 · 持久化(确认走既有云存链路)

### 7.1 不需要新代码

`round3Unit` 字段写在 `LayeredReadingRound2Branch` 上,而 branch 写在 `LayeredReadingModule.round2Branches` 上,而 modules 写在 `LayeredReadingState.modules` 上,而 `LayeredReadingState` 已在持久化补丁 `aad85cf` 全字段接通本地 IndexedDB + 云 Firestore。

→ **新字段自动跟车**,无需改 `App.tsx` 持久化层任何一行。

### 7.2 翻译层警觉自检(参考 INQUIRY §8.G)

确认链路:

| 环节 | 现状 | round3Unit 状态 |
|---|---|---|
| ① React state | LayeredReadingPanel.updateModule 经 setLayeredReadingState | ✅ 自动跟随 |
| ② FilePersistedState 类型 | 嵌在 layeredReadingState 内 | ✅ 自动跟随 |
| ③ CloudSession 类型 | 同上 | ✅ 自动跟随 |
| ④ filePersistedSnapshot | 已含 layeredReadingState | ✅ |
| ⑤ IndexedDB 写入 deps | 已含 layeredReadingState(aad85cf 修复) | ✅ |
| ⑥ Firestore 写入 deps | 已含 layeredReadingState(aad85cf 修复) | ✅ |
| ⑦ splitUpdateData 路由 | 自动归 heavy(白名单只挑 META_KEYS) | ✅ |
| ⑧ fetchSessionDetails 返回 | 整个 heavy doc 透传 | ✅ |
| ⑨ 本地恢复 setState | App.tsx:701 setLayeredReadingState(stateToRestore.layeredReadingState ?? null) | ✅ |
| ⑩ 云恢复 restoreData | App.tsx:802 layeredReadingState: fullData.layeredReadingState | ✅ |

**结论:**全 10 环节齐备,无需新写持久化代码。

### 7.3 旧云数据兼容性

线上已有用户的 Firestore 文档里的 `layeredReadingState.modules[i].round2Branches[j]` 上**没有 round3Unit 字段**。

恢复时:
- TS 层 `round3Unit?` 是 optional → undefined 不报类型错
- 渲染层 §5.1 优先级判定 `b.round3Unit` falsy → fallback 旧 round3Details
- 用户视觉:旧 PDF 还显示旧卡片;若用户主动**重新展开**该 branch(本期无此 UI),才会触发新生成

---

## §8 · 翻译层警觉清单(参考 LAYERED_READING_INQUIRY §8.G)

### 8.A "Round 3" 这个词在新旧设计里**不是**同一个概念

- **旧 Round 3** = 多张并列的术语卡片
- **新 Round 3** = 一份带 7 块结构的学习单元

任何提到 "Round 3" 的代码、注释、文档,在改造期间必须明确**指代旧/新**。

→ 实施时:新代码用 `round3Unit` / `Round3Unit` / `Round3UnitView` 命名;旧代码保留 `round3Details` / `Round3Detail` 命名;**不复用任何变量名**。

### 8.B 第 7 块"小题"不是阶段 4 的 LayeredReadingQuestion

- **第 7 块小题**:Round 3 unit 内的字符串字段(纯展示)
- **阶段 4 application 题**:LayeredReadingState.questions[] 里的可答题

两者**值空间、字段、UI 行为完全不同**,不复用代码。

→ 实施时:严禁让 Claude Code 把第 7 块写进 `questions[]`。

### 8.C "Round 3 已生成" 状态判定

旧 = `branch.round3Details && branch.round3Details.length > 0`
新 = `Boolean(branch.round3Unit)`

凡 `LayeredReadingTree.tsx` 中判 "round3 是否已生成" 的位置(如 `hasDetails`),都要扩展为 "新或旧任一存在"。

```ts
const hasRound3 = Boolean(b.round3Unit) || (b.round3Details && b.round3Details.length > 0);
```

### 8.D 中英对照 prompt 段在 3 处出现

Round 1 / Round 2 / Round 3 unit 的 prompt 都要加中英对照规则段,但这是同一段文字的 3 处复制,不是 3 个不同规则。

→ 实施时:把规则文本抽成 `BILINGUAL_TERMINOLOGY_RULE` 常量,3 处引用。避免 3 处文案漂移。

### 8.E `application` 题已经挂在 branch 上(已确认,不冲突)

RECON §6.1 已澄清:阶段 4 的 application 题独立挂在 `LayeredReadingState.questions[]`,与 round3Detail 无任何嵌套或 id 共享。

新增 `round3Unit` 不影响 application 题的存储、生成、批改、UI 任何一处。

但 **UI 上 application 题的位置**:阶段 4 把 application 题画在 `details.map(...)` 之后(LayeredReadingTree.tsx:491)。新 UI 中,application 题画在 **`<Round3UnitView />` 之后** 还是之前?

→ **决策:画在 `<Round3UnitView />` 之后**,与旧 UI 位置语义一致("Round 3 内容讲完了,然后做一道真正的题")。

### 8.F 持久化层不改的同时要确认: round3Unit 是 plain JSON

`LayeredReadingRound3Unit` 字段全部为 `string | number | undefined`,**无 Date / Map / Set / 函数**。`generatedAt` 保持 `number` 时间戳(对齐其他字段)。

→ JSON.stringify / JSON.parse 安全。Firebase 1MB 限制下,一份 unit 估算 ~2KB(7 块 × 平均 200 字符),100 个 branch ≈ 200KB,远低于上限。

### 8.G "AI 一次输出 7 块都齐" vs "讲义内容不足以撑某块"

Prompt 已写"返回空字符串让客户端 reject",但 figureGuide 是合法可缺。其他 6 块若 AI 偷懒输出空,客户端 §4.3 会 reject 整份 unit 返回 null,UI 显示生成失败,用户可重试。

→ **不做部分接受**(不允许"6 块成功 + 1 块空白还显示给用户")。要么全成,要么全失败重试。

---

## §9 · 阶段划分草案

### 阶段 5.1 · 类型 + Prompt + AI 函数(约 1 commit)

文件改动:
- `types.ts`:新增 `LayeredReadingRound3Unit` interface;`LayeredReadingRound2Branch` 加 `round3Unit?` 字段
- `lib/prompts/layeredReadingPrompts.ts`:新增 `BILINGUAL_TERMINOLOGY_RULE` 常量;新增 `buildLayeredRound3UnitPrompt`
- `services/geminiService.ts`:新增 `generateLayeredRound3Unit`

不改:
- 现有 Round 3 detail 函数 / prompt 一字不动
- App.tsx 持久化层不动
- UI 组件不动(类型已落地但渲染不生效——`round3Unit` 还没人写)

验收:`tsc` 通过;`generateLayeredRound3Unit` 在 console 单独调可拿到合法 unit 对象。

### 阶段 5.2 · UI 渲染 + 触发入口(约 1 commit)

文件改动:
- `features/reader/layered/Round3UnitView.tsx`:新建,按 §5.2 实现
- `features/reader/layered/LayeredReadingTree.tsx`:
  - 提取旧 inline Round3 detail JSX 为 `LegacyRound3DetailsView` 子组件
  - 改写 `handleExpandToRound3` 触发 `generateLayeredRound3Unit`(替换原 `generateLayeredRound3Details`)
  - 加入 §5.1 优先级渲染逻辑
  - 修正 `hasDetails` → `hasRound3`(§8.C)

不改:
- LayeredReadingPanel.tsx 的 setLayeredReadingState 调用层
- 应用题 LayeredReadingQuestionBox 行为

验收:
- 新 PDF 进入 Round 3 → 看到 7 块 unit
- 已有 round3Details 数据的旧 PDF → 看到旧卡片(fallback 工作)
- 没图的 branch → 第 4 块自动省略
- application 题仍出现在 unit 末尾

### 阶段 5.3 · Round 1 / 2 中英对照(约 1 commit)

文件改动:
- `lib/prompts/layeredReadingPrompts.ts`:`buildLayeredRound1Prompt` / `buildLayeredRound2Prompt` 注入 `BILINGUAL_TERMINOLOGY_RULE`

不改:
- 类型不动、UI 不动、持久化不动

验收:重新展开任意 module 的 Round 1 / Round 2,专业术语首次出现处有英文括注。

---

## §10 · 风险评估

| 风险 | 程度 | 分析 |
|---|---|---|
| 影响阶段 4 application 题 | 零 | application 题数据/UI/行为完全独立(RECON §6 已确认),新代码 0 处读 questions[] |
| 影响 studyMap / reviewQuizRounds 等其他云存功能 | 零 | 只新增字段,不改 splitUpdateData / META_KEYS / 路由逻辑 |
| 旧 round3Details 数据丢失 | 零 | 字段完全保留,fallback 渲染明确 |
| Firebase 1MB 文档限制 | 低 | 新结构 ~2KB/unit,100 unit ≈ 200KB,远低限 |
| AI 输出 7 块部分缺失 | 中 | 客户端校验整份 reject + 用户重试。不允许"半份 unit"显示。已在 §4.3 / §8.G 钉死 |
| 中英对照行内括注被 AI 滥用(每个普通词都加英文)| 中 | prompt 明确"专业术语首次"+ "普通中文不需要"。如果实测发现滥用,prompt 调优,不是结构问题 |
| 用户重新生成时旧 detail 被覆盖 | 低 | 本期 UI 不开放重新生成入口,旧数据安全;P1 加入口时再考虑覆盖逻辑 |
| TypeScript 类型扩展引发编译错误 | 低 | optional 字段不会破坏现有调用点。tsc 应 0 new errors |

---

## §11 · 给 PLAN 的输入

PLAN 文档应基于本 INQUIRY,把 §9 阶段拆成具体 file:line:operation 列表,每个操作配明确验收条件。

INQUIRY 不写 PLAN 内容。

---

## §12 · 项目主已拍板的决策记录

| # | 决策点 | 拍板结果 |
|---|---|---|
| 1 | 7 块小标题样式 | **保留小标题 + emoji**(📍⚙️🏷️📊📝⚠️✏️) |
| 2 | 每块字数限制 | **不预设具体字数**。prompt 改为"以学生能看懂为准,该长就长该短就短,但每块都要饱满"。AI 自行拿捏 |
| 3 | 第 5 块 answerSkeleton 视觉 | **保留浅黄底 highlight**。这是 7 块中唯一视觉特殊的块,其余 6 块平视 |
| 4 | application 题 UI 位置 | **画在 `<Round3UnitView />` 之后**,与旧 UI"Round 3 内容讲完做题"的语义一致 |

---

> **INQUIRY 撰写完毕、决策已拍板。** 下一步:把本 INQUIRY commit 进 `docs/inquiries/`,然后撰写 PLAN(分阶段 file:line 施工图)。
