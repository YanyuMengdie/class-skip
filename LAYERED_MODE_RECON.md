# 递进阅读（Layered Reading）模式 RECON —— 只读侦察报告

> 任务：彻底搞清 layered 的真实行为与设计痛点，判断"文章模式（顺着文本天然结构 abstract→intro→method 顺序陪读，无模块/无进度/不检验）"能否复用/改造它，还是必须另起。
> 性质：**只读**，零代码/配置/git 改动。
> 日期：2026-06-20　分支：refactor
> 引用 = 文件路径 + 符号名 + 行号（辅助锚点）。所有结论以**当前代码 + 仓库内设计文档**实测为准。

---

## A. 它到底怎么工作

### A1. layered 的"轴"是什么？验证假设真伪

**假设："把 PDF 分成若干 module，然后对【同一批 module】反复讲三层——第一层最白话、第二层加细节、第三层再加细节"（三层 = 同一内容的细节深度递进，而非顺章节推进）。**

**结论：假设基本成立——三层 = 对同一批 module 的"深度 zoom-in 递进"，不是顺着文本章节往前推。** 但要补一层精确修正（见下）。

代码证据（[lib/prompts/layeredReadingPrompts.ts](lib/prompts/layeredReadingPrompts.ts)，`LAYERED_READING_SYSTEM_PROMPT` L42 起）：

- Round 1（故事线）：用大白话讲清这份讲义"在讲什么故事"
- Round 2（结构展开）：把**每个 module 的内部结构**展开成几条子枝干（"这章是怎么一步步把**那个故事**讲完的"）
- Round 3（细节挂载）：在子枝干上挂术语/实验/图/证据/对比（"这些细节服务于**哪个观点**"）

三轮都在谈"那个故事 / 哪个观点"——**同一内容越挖越深**，而非换一段新文本。系统 prompt 还有【严格禁令】"绝不自动推进三轮……三轮推进权完全在用户手里（点'展开到 Round X'按钮）"，证明三轮是**用户手动控制的同一棵树的逐层深入（zoom-in）**。

> **精确修正（重要，关系到 E1 判断）**：module 本身**是**按文档自然结构、按原序切的（见 A2）。所以 layered 在"module 横向排列"这一层是顺文本顺序的；但它的"三轮"是在**每个 module 内部纵向加深**，不是横向推进章节。即：**横向 = 顺序（一次切好），纵向 = 三轮深度递进**。文章模式想要的"abstract→intro→method 顺序陪读"是**横向逐段推进、且只走一遍**，恰好踩在 layered 横向那一维、却完全不要 layered 纵向那三轮。

### A2. module 怎么切出来？

- 函数：`generateLayeredReadingModules(fullText, options: { moduleCount })`（[services/geminiService.ts:3206](services/geminiService.ts#L3206)）。
- prompt：`buildLayeredModuleGenPrompt(moduleCount)`（[layeredReadingPrompts.ts:79](lib/prompts/layeredReadingPrompts.ts#L79)）。
- 切法（prompt 原文【拆分原则】）：
  1. **严格输出用户指定的 `moduleCount` 个**（2–7，不能多不能少）——**数量由用户定，不是 AI 自适应**。
  2. `pageRange` **按讲义自然结构划分，不必平均，按文档原序排列**——即"按内容结构 + 原序"，**不是按固定页数/字数均分**。
  3. `storyTitle` 必须大白话（"第 X 段大概在干什么"），8–25 汉字。
- ID 由前端补：`id: module-${i+1}`、`index`（geminiService.ts 约 L3249）。AI 只产出 `storyTitle` + `pageRange`。

→ **切分 = AI 按文档自然结构判断分界，但模块总数由用户钉死。** 这一点对文章模式部分可用（见 E2）。

### A3. 三层 / 三轮的真实含义

| 轮 | 函数（geminiService） | prompt builder | AI 要干什么 | 与上一轮关系 |
|---|---|---|---|---|
| Round 1 故事线 | `generateLayeredRound1Content`(L3273) | `buildLayeredRound1Prompt`(L106) | 200–400 字大白话讲"这个 module 在讲什么故事"，禁逐页翻译/术语堆叠 | 起点 |
| Round 2 结构展开 | `generateLayeredRound2Branches`(L3300) | `buildLayeredRound2Prompt`(L144) | 把 module 拆成 2–5 个子枝干（每个=作者推进的一个步骤），**每枝干必带溯源 sourcePage+sourceLocation** | 把 R1 那个故事**拆成内部步骤** |
| Round 3 细节挂载 | `generateLayeredRound3Details`(L3374) / `generateLayeredRound3Unit` | `buildLayeredRound3Prompt`(L203) / `buildLayeredRound3UnitPrompt`(L532) | 在某个子枝干上挂 2–6 个细节（术语/实验/图/证据/对比），或生成 7 块结构化 unit | 在 R2 某枝干上**挂具体材料** |

- Round 3 有**新旧两套**：旧 `round3Details[]`（5 类细节平铺），新 `round3Unit`（7 块：coreQuestion / mechanismChain / keyTerms / figureGuide? / answerSkeleton / confusionPoints / miniQuestion）。新版是阶段 5 改造产物（见 D1 痛点）。
- 关系本质：**Round 1→2→3 = 故事 → 步骤 → 材料，逐层加深同一内容**。

### A4. 有没有测验 / 打分 / 进度 / 完成度？

**有，而且四样都有——但题目是"软门槛、可跳过"。**

- 出题（懒加载，用户点"📝 答题"才生成）：
  - `buildLayeredQuestionRound1Prompt`(L280) 故事题（维度：故事感 + 主旨准确）
  - `buildLayeredQuestionRound2Prompt`(L328) 结构题（步骤完整 + 步骤顺序）
  - `buildLayeredQuestionRound3Prompt`(L381) 细节应用题（推理逻辑 + 细节抓取）
- 批改：`buildLayeredQuestionGradingPrompt`(L447) → `gradeLayeredQuestion`(geminiService L3687)，按题型分 2 维度打 ★1–5 + 一句话点评。
- 进度：`LayeredReadingState.progressSnapshot`（round1/2/3 各 done/total），顶部三条进度条。
- 完成度：`round1Done/round2Done/round3Done` 布尔 + `lastVisited` 续读记忆。

**必经 or 可选**：题目是**可选软门槛**——系统 prompt【严格禁令】明确"答完或跳过都能展开下一 Round"，推进不被题目阻塞；但"进度条 / Round Done / 三轮树"本身是模式的**骨架（必经）**。

> **对文章模式关键**：layered 的"无门控"只指**入口没有 diagnosis/quiz 前置**（铁律 4），但模式内部**满载进度条 + Round 完成度 + 可选题目**。文章模式要的"无进度/不检验"与 layered 的骨架直接冲突。

---

## B. 数据结构与状态

### B1. `LayeredReadingState`（[types.ts:459](types.ts#L459)）逐字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `modules` | `LayeredReadingModule[]` | 核心：module 列表，每个 module 内挂三轮内容 |
| `lastVisited?` | `LayeredReadingLastVisited` | 续读记忆（上次到哪个 module/round/branch），驱动"要继续吗"横幅 |
| `questions` | `LayeredReadingQuestion[]` | 全部题目+作答+批改记录（与 chat 解耦） |
| `globalChatHistory?` | `LayeredReadingChatMessage[]` | 跨 module 全局对话历史（视觉按 module 过滤，AI 收全量），每条带 `askedInModuleId` |
| `progressSnapshot?` | `{ round1, round2, round3 }` | 三轮各自 done/total 进度计数 |
| `createdAt` | `number` | 创建时间戳 |

### B2. `LayeredReadingModule`（[types.ts:284](types.ts#L284)）+ 子结构；三轮是分存还是追加？

**三轮内容 = 三个独立字段分存（不是一份逐步追加）：**

- `LayeredReadingModule`：`id` / `index` / `storyTitle` / `pageRange?` / **`round1Content?: string|null`** / **`round2Branches?: LayeredReadingRound2Branch[]`** / `round1Done?` / `round2Done?` / `round3Done?`
- `LayeredReadingRound2Branch`(L299)：`id` / `index` / `title` / `content?` / `sourcePage?` / `sourceLocation?` / **`round3Details?: LayeredReadingRound3Detail[]`**（旧） / **`round3Unit?: LayeredReadingRound3Unit`**（新，阶段 5）
- `LayeredReadingRound3Detail`(L314)：`kind` / `label` / `description` / `sourcePage` / `sourceLocation`
- `LayeredReadingRound3Unit`(L340)：7 块字段（coreQuestion / mechanismChain / keyTerms / figureGuide? / answerSkeleton / confusionPoints / miniQuestion） + sourcePage/sourceLocation/generatedAt

→ Round 1 = module 上一个 string 字段；Round 2 = module 上一个数组；Round 3 = 挂在每个 Round2 枝干内部。**三轮物理分存、按需各自生成填充**（不点 Round 2 就不调 Round 2 的 AI）。Round 3 新旧字段**并存**，新 `round3Unit` 优先、旧 `round3Details` 作 fallback。

### B3. layered session 持久化路径与读写函数（对照略读）

- **本地 IndexedDB**：store `fileHistory`（keyPath `hash`）下 `FilePersistedState.layeredReadingState`（[types.ts:638](types.ts#L638)）。读 `storageService.getFileState(hash)`、写 `storageService.saveFileState(item)`。
- **云端 Firestore**：`sessions/{sessionId}/data/main` 重文档里的 `CloudSession.layeredReadingState`（[types.ts:702](types.ts#L702)）。读 `fetchSessionDetails(sessionId)`、写 `updateCloudSessionState(sessionId, data)`（[services/firebase.ts](services/firebase.ts)）。
- **与略读对照**：**机制同构**——都靠 `saveFileState` / `updateCloudSessionState` 整包塞进 `FilePersistedState` / `CloudSession`。**差异**：略读 session 已被拆到云端子集合 `sessions/{id}/skims/{skimId}`（绕 1MB 限）；**layered 没拆，整块存在 `data/main` 重文档里**。这点是潜在隐患（见 D1 风险 6/12：layeredReadingState 可能膨胀到 200–300KB）。

---

## C. 入口与组件

### C1. 用户怎么进入 layered？

- 触发 UI：[shared/layout/Header.tsx](shared/layout/Header.tsx) 内"递进阅读"入口按钮（"进入递进阅读 / 返回精读"，约 L293–302），prop `onToggleLayered`（HeaderProps L46）。
- handler：App.tsx 约 L2297　`onToggleLayered={() => setViewMode(prev => prev === 'layered' ? 'deep' : 'layered')}`。
- 入口条件：**不依赖 `hasStudyMap`**——layered 有独立 module 生成路径，文档加载完即可显示（设计文档铁律/§7 明确）。
- `viewMode` 第三态 `'layered'`（types.ts:279，与 `'deep' | 'skim' | 'tutor'` 并列）。

### C2. layered 主组件（SkimPanel / TutorChat 同级）

- 文件：[features/reader/layered/LayeredReadingPanel.tsx](features/reader/layered/LayeredReadingPanel.tsx)，**578 行**。
- 核心职责：
  1. module 生成与管理（`handleStartGeneration` → `generateLayeredReadingModules`，初始化 `LayeredReadingState`）。
  2. Round 1 懒加载（`handleEnsureRound1` → `generateLayeredRound1Content`）。
  3. 树状 UI（委托子组件 `LayeredReadingTree`，含 Round 2/3 展开折叠、zoom-in、`expandTarget` 自动展开滚动）。
  4. 题目系统（`handleGenerateQuestion` → Round1/2/3 出题；`handleSubmitQuestion` → `gradeLayeredQuestion`）。
  5. 续读横幅（`LastVisitedBanner`）+ 进度条。
- 同目录配套子组件：`LayeredReadingTree` / `Round3UnitView` / `LegacyRound3DetailsView` / `ModuleChatBox` / `RoundContentWithSource` / `LayeredReadingQuestionBox` / `LastVisitedBanner`。

### C3. layered prompt/逻辑是否区分文本类型或学科（DocType）？

**无。** 设计文档铁律 5 明确"不做学科分流，统一一套 prompt"。`generateLayeredReadingModules` / `generateLayeredRound1Content` / `chatWithLayeredReadingTutor` 等函数签名**都不收 `docType`**，统一用 `LAYERED_READING_SYSTEM_PROMPT`，不分 STEM/HUMANITIES，也不分 lecture/paper/essay。

> 但措辞上**隐含 lecture 假设**：prompt 通篇以"讲义 / 这份 lecture"指代输入（见 F1）。

---

## D. 痛点考古（重点）

### D1. layered 相关设计文档清单 + 已记录的痛点/问题

**文档清单（均在 [docs/inquiries/](docs/inquiries/)，根目录无）：**

| 文档 | 性质 |
|---|---|
| `LAYERED_READING_INQUIRY.md`（928 行） | 原始诊断：外部 GPT 文档 → 与现有产品对齐 → 范围收敛 → 5+ 条铁律 |
| `LAYERED_READING_PLAN.md` | 实施计划 |
| `LAYERED_READING_ROUND3_RECON.md` | Round 3 改造前现状盘点 |
| `LAYERED_READING_ROUND3_REVAMP_INQUIRY.md` | Round 3 改造诊断（7 块结构 + 中英对照） |
| `LAYERED_READING_ROUND3_REVAMP_PLAN.md` | Round 3 改造计划 |

**提炼的已知问题 / 痛点 / 设计决策（逐条注明出处）：**

1. **Round 3 退化成"词汇表 + 图表 caption"**（最大的实测痛点）。
   出处：`LAYERED_READING_ROUND3_REVAMP_INQUIRY.md §1.2`，产品自查原话 **"Round 3 太简单了，就只是讲解专业词汇"**，"第三层退化成了词汇表 + 图表 caption，没有真正展开'为什么、怎么发生、和什么对照'"。→ 这才催生了 7 块结构化 `round3Unit`（coreQuestion/mechanismChain/...）。**对文章模式的警示**：纯"顺着讲"若不给 AI 结构约束，极易退化成逐段翻译/caption 堆叠。

2. **"统一一套 prompt"可能跨学科水土不服**。
   出处：`LAYERED_READING_INQUIRY.md §6 风险 5`："理科 lecture 和文科 lecture 的'故事感'差异很大……上线后如反馈不佳，再决策是否加学科分流"。**当前是赌"AI 自适应"，未验证。** 文章模式若也走"一套 prompt 通吃 paper/essay/lecture"，会继承同款风险。

3. **AI 溯源可能编造页码 / 归错页**（铁律 6 引入的代价）。
   出处：`§6 风险 8`。Round 2/3 强制带 sourcePage，但 AI 可能编造；缓解只能靠 prompt 加严 + 人工抽样。

4. **持久化体积膨胀风险**（globalChatHistory + 题目 + 三轮内容）。
   出处：`§6 风险 6/7/12`，估单 PDF `layeredReadingState` 可能 **200–300KB**，且每次提问把**完整 globalChatHistory** 发给 AI（context 膨胀、计费上升、haystack 抓不住重点）。注意 layered **未做云端子集合拆分**（B3），这个风险至今未缓解。

5. **题目质量参差 / 批改准确度漂移**。
   出处：`§6 风险 10/11`：题目可能脱离 Round 内容、太简单或太难；AI 按维度评分可能飘忽、宽严不一。

6. **与略读的产品定位重叠（用户主动接受、未解决）**。
   出处：`§6 风险 3` + `§4`：用户原话 **"这两个模块只是两个不同的方式，具体区别还是得等我用过再说吧"**——**明确选择不预设定位、靠真实使用反馈区分**。即 layered 上线时就埋了"它和略读到底谁用在什么场景"的悬而未决问题。**新增文章模式会让这个'三/四种阅读模式怎么选'的困惑进一步放大。**

7. **被砍掉的功能**：Silent Coverage Guard（页级覆盖度守护）被用户用"代价/价值比"主动砍掉（`§4 第 2 次拍板`、铁律 3）；学科分流、前置门控也都被刻意不做（铁律 4/5）。

8. **设计认知里程碑**：铁律 2 钉死"**module 概念相同但数据完全独立**——递进阅读不读不写 `studyMap`"。出处 `§8.G` 元反思（研究者一度把"概念相同"误读成"数据共享"，被用户踩刹车纠正）。说明 layered 的数据层是**刻意与略读完全隔离**的独立柜子。

### D2. 代码里关于 layered 的 TODO/FIXME/HACK/吐槽

grep `features/reader/layered/` 与 `layeredReadingPrompts.ts` 的 `todo|fixme|hack|临时|坑|遗留|待办` 等：**未找到**任何 TODO/FIXME/HACK 注释。已知问题都沉淀在上述设计文档里，而非代码内联注释。

### D3. git log 维护节奏——持续维护还是停更？

**结论：layered 自 2026-05-08 后停更（约 6 周未动），同期产品注意力转向 tutor 纯对话模式。**

- layered 全部 commit 集中在 **2026-05-06 ~ 05-08**（共 16 个，从 `viewMode 三态扩展` 到 `阶段 5.3 Round3 改造`，最后一笔 `edfd2c3` 2026-05-08）。
- 此后无任何 layered commit。而仓库最新活动（2026-06-04 ~ 06-19）全是 **略读多会话/页码范围、私教 tutor 纯对话模式（6-07 新建 `TutorChat`）、skim 云端子集合拆分**。
- **关键事实**：layered 在 5 月初一口气做到阶段 5 后即冻结；6 月新建的是**私教纯对话模式**——一个"无模块/无进度/无检验、顺序对话"的形态。**产品的演进方向已经从 layered 那套重型三轮结构，明显偏向 tutor 那套轻量顺序对话。** 这与文章模式的设想高度同向（见 E3、F2）。

---

## E. 与文章模式的关系判断（只陈述事实，不做产品决策）

### E1. "三层细节递进" vs "顺文本章节顺序陪读"——同一件事、部分重叠、还是正交？

**判断：主轴正交，表层部分重叠。**

- **正交的核心**：layered 的主轴是**纵向深度**（同一批 module 反复挖三层：故事→步骤→材料，A1/A3 证实）；文章模式的主轴是**横向顺序**（顺 abstract→intro→method 一段段往前，只走一遍）。一个"原地往深挖三遍"，一个"顺着往前走一遍"——**两条不同的轴**。
- **表层重叠的部分**：
  - 两者都"顺着文本结构 / 自然结构"（layered 的 module 按文档原序自然切，A2）。
  - 两者都是"AI 大白话陪读"、都**不要前置门控/诊断**（layered 铁律 4 的"不继承前置门控"与文章模式"无检验"同向）。
- **直接冲突的部分**：文章模式明确"**无模块、无进度、不检验**"，而这三样恰是 layered 的**骨架**（module 列表 + progressSnapshot 三进度条 + Round Done + 可选题目系统，B1/A4）。文章模式要的，正是 layered 刻意建起来的那套结构的**反面**。

→ 一句话：**layered 和文章模式在"顺着结构、AI 大白话陪读、无入口门控"上同源，但在"深度递进三轮 + 模块树 + 进度 + 题目"这套 layered 的灵魂结构上完全相反。**

### E2. 若文章模式复用 layered 链路，最大改造点落在哪几处（只指位置）

1. **module 切分逻辑**：[geminiService.ts:3206](services/geminiService.ts#L3206) `generateLayeredReadingModules` + `buildLayeredModuleGenPrompt`(L79)。layered 强制"用户指定 2–7 个 module"；文章模式要"按文本天然结构（abstract/intro/method…）自动分段、不限数量、不让用户选个数"——切分契约要改。
2. **三轮 prompt 超结构**：`buildLayeredRound1/2/3Prompt` + `buildLayeredRound3UnitPrompt`。文章模式不要"三轮深度递进"，这套 prompt 的**纵向三层身份**要被拆掉/重写成"单遍顺序陪读"。
3. **整个题目/批改子系统**：`buildLayeredQuestion*` + `gradeLayeredQuestion` + `LayeredReadingState.questions`。文章模式"不检验"→ 这套要整体摘除或旁路。
4. **state 结构**：`LayeredReadingState`（types.ts:459）的 `progressSnapshot` / `roundXDone` / `questions` 都是"进度+检验"包袱，与文章模式"无进度/不检验"冲突，需要删字段或换一套更瘦的 state。
5. **组件**：`LayeredReadingPanel` + `LayeredReadingTree` + `Round3UnitView` 围绕"可折叠树 + Round 展开按钮 + zoom-in"搭建；文章模式要的是"线性顺序陪读对话流"，UI 范式不同，树这套基本用不上。

（以上仅指位置，不给方案。）

### E3. 若复用私教（tutor）链路：layered 和 tutor 哪个离"顺序陪读"更近？代码层理由

**tutor 明显更近。** 代码层理由：

- **包袱对比（决定性）**：`TutorSession`（[types.ts:604](types.ts#L604)）注释明写"不含 study map / stage / quiz / page range 等略读包袱，只保留对话所需最小字段"——天然契合文章模式"无模块/无进度/不检验"。反观 `LayeredReadingState`（types.ts:459）通体是 `modules`/`progressSnapshot`/`roundXDone`/`questions`——全是文章模式要甩掉的东西。
- **组件形态**：`TutorChat`（features/tutor/TutorChat.tsx，332 行）是**纯线性对话流**，无树、无 Round 按钮、无进度条；正是"一段段顺序陪读"的形状。`LayeredReadingPanel`（578 行）是树 + zoom-in，形状相反。
- **维护方向**：tutor 是 2026-06 新建并在活跃迭代（D3），layered 自 5 月停更——复用 tutor 站在产品当前演进方向上。
- **layered 唯一比 tutor 多、而文章模式想要的**：只有"顺着文本天然结构推进"这层引导——但这是 **prompt 层的事**（给 AI 一段结构化顺序陪读指令即可），不是架构层差异。tutor 的轻量数据/组件骨架，反而是更干净的复用基底。

→ 纯代码事实：**文章模式的数据与组件包袱，和 tutor 几乎重合、和 layered 几乎相反。**

---

## F. 意外

### F1. 与上述不符 / 需补充的发现

1. **layered prompt 隐含 lecture 假设**：虽然 C3 确认"无 docType/文本类型分支"，但 `LAYERED_READING_SYSTEM_PROMPT` 与各 builder 通篇以"**讲义 / 这份 lecture**"指代输入（origin 就是外部 GPT 文档的"Lecture 三轮递进解读系统"，见 `LAYERED_READING_INQUIRY.md §1`）。也就是说 layered 在**措辞层面是 lecture-centric** 的——直接喂 paper/essay 未必水土相服（呼应 D1 痛点 2）。文章模式如果要处理 paper/essay，这层假设要正视。
2. **Round 3 新旧两套数据并存**（`round3Details` 旧 / `round3Unit` 新），代码靠 fallback 兼容（`LegacyRound3DetailsView`）。这是历史改造留下的双轨，复用时要留意。
3. **layered 云端未做子集合拆分**（B3）：略读已拆 `skims/` 子集合绕 1MB，layered 仍整块塞 `data/main`，与设计文档自己列的"体积膨胀风险 6/12"对照，是个**已知却未处理**的隐患。
4. 本任务未触碰任何文件（除新建本报告）；工作区原有未提交改动 `CONTEXT.md`、`.claude/settings.local.json` 与本任务无关。

### F2. 产品负责人决策前必须知道的 layered 现状事实

1. **layered 的灵魂 = 三轮深度 zoom-in + 模块树 + 进度条 + 软门槛题目**，这四样恰好是文章模式明确不要的。复用 layered ≈ 拆掉它的灵魂只留外壳，性价比存疑（E1/E2）。
2. **文章模式的近亲是 tutor 不是 layered**：从数据结构（TutorSession 最小包袱）到组件（TutorChat 纯线性）到维护方向（tutor 2026-06 在迭代、layered 5 月停更），tutor 都更贴"顺序陪读"（E3、D3）。
3. **"顺序讲解"有退化前科**：layered 的 Round 3 曾"退化成词汇表 + caption"，逼出 7 块结构化改造（D1 痛点 1）。文章模式的"顺着结构陪读"若不给 AI 足够结构约束，很可能重蹈——这是 layered 用一次返工换来的教训，可直接借鉴。
4. **"多种阅读模式怎么选"已是悬置问题**：layered 上线时用户就主动接受"略读 vs 递进谁用在哪等用过再说"（D1 痛点 6）。再加一个文章模式，会让"精读/略读/递进/私教/文章"的入口选择困惑进一步放大——这是产品信息架构层面要先想清楚的，不是工程问题。
5. **layered 的几个设计决策可被文章模式直接继承**：铁律 4"不做前置门控（别用门控吓到被术语吓到的学生）"、铁律 2"数据与略读完全独立的独立柜子"、铁律 6"AI 是导览员不是替代品、必须能跳回原始 slides"——这些理由对文章模式同样成立，是现成的设计资产。

---

## 附：关键抓手速查

| 主题 | 符号 | 位置 |
|---|---|---|
| 主组件 | `LayeredReadingPanel` | features/reader/layered/LayeredReadingPanel.tsx（578 行） |
| 树组件 | `LayeredReadingTree` / `Round3UnitView` | features/reader/layered/ |
| 入口 | `onToggleLayered` | shared/layout/Header.tsx L46 / App.tsx ~L2297 |
| 模式态 | `ViewMode='...|layered'` | types.ts:279 |
| state | `LayeredReadingState` | types.ts:459 |
| module | `LayeredReadingModule` + Round2Branch/Round3Detail/Round3Unit | types.ts:284 / 299 / 314 / 340 |
| 系统 prompt | `LAYERED_READING_SYSTEM_PROMPT` | lib/prompts/layeredReadingPrompts.ts:42 |
| 切 module | `generateLayeredReadingModules` / `buildLayeredModuleGenPrompt` | geminiService.ts:3206 / prompts:79 |
| 三轮 prompt | `buildLayeredRound1/2/3Prompt` / `buildLayeredRound3UnitPrompt` | layeredReadingPrompts.ts:106/144/203/532 |
| 题目 | `buildLayeredQuestionRound1/2/3Prompt` / `buildLayeredQuestionGradingPrompt` / `gradeLayeredQuestion` | layeredReadingPrompts.ts:280/328/381/447 |
| 对话 | `chatWithLayeredReadingTutor` | geminiService.ts:3162 |
| 持久化 | `saveFileState`/`getFileState`；`updateCloudSessionState`/`fetchSessionDetails` | storageService.ts / firebase.ts |
| 设计文档 | LAYERED_READING_INQUIRY / ROUND3_REVAMP_INQUIRY 等 | docs/inquiries/ |
| 最近维护 | 末次 commit `edfd2c3` | 2026-05-08（此后停更） |

— 报告完。未改任何代码 / 配置 / git。
