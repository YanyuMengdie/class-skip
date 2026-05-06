# 递进阅读模式 — 诊断过程文档

> **文档性质**：这不是实施计划（Plan），是诊断过程的记录（Inquiry）。
> **目标读者**：未来的 Criss、给 Dr. Woodruff 展示研究方法的素材、其他可能接手这个项目的人。
> **配套文档**：`LAYERED_READING_PLAN.md`（具体实施计划，给 Claude Code 看，待画面终审后生成）。
>
> **核心价值**：记录"外部输入（GPT 文档）→ 与现有产品对齐 → 范围收敛 → 形态决策 → 交互维度选定"这条完整链路。这次的特殊价值在于：**stakeholder 主动用代价/价值比砍掉了一块大功能（Silent Coverage Guard），并明确选择"不预设产品定位，用真实使用反馈区分两个模块"**——这是产品哲学层面的成熟决策，值得记录。
>
> **方法论沿袭**：本文档沿用 `MULTISELECT_KC_INQUIRY.md` 的工作流——**画面对齐 → 代码侦察 → 诊断文档 → 分阶段 PLAN → Claude Code 实施**，并继承 §9 元反思总结的几条原则（先侦察后决策、术语警觉、捍卫产品哲学、人类踩刹车不可替代）。

---

## 1. 用户原始输入（未经处理）

用户带着一份外部 GPT 文档进入对话，文档定义了一个新功能"Lecture 三轮递进解读系统"，包含：
- 三轮递进（故事线 → 结构展开 → 细节挂载）
- 共用同一棵树
- 自适应 module 数量
- 分层题目（故事题 / 结构题 / 细节应用题）
- Silent Coverage Guard（后台对每页 slide 建 coverage map，A/B/C/D 风险标签，自动温和补洞）

用户的原始问题：

> "我在纠结要不要直接放在略读模式里，然后作为略读的另一个方式。你是否可以帮我把这个跟现有的略读模式进行比较看看区别以及会不会有不同的应用场景。"

**表面是个比较请求**，但实际触发的链路是：**外部输入 → 与现有产品对齐 → 范围决策 → 形态决策 → 交互维度选定 → 铁律钉死**。

---

## 2. 第一轮抑制：不立刻给方案

接到 GPT 文档后，研究者（chat AI）的本能反应是开始评估方案。但根据 `MULTISELECT_KC_INQUIRY.md` §9 的教训，**先侦察后决策**——不在没看代码事实前判断。

研究者主动列出了 5 个画面对齐问题（Q1-Q4）：
- Q1 形态：a 全新独立模块 / b 替换 SkimPanel / c 升级 reader 深度领读 / d 跟备考工作台融合 / e 还在想
- Q2 术语警觉：GPT 文档里"module / coverage map / exam risk / Round 3 题目"是不是跟现有项目的同名词同概念？
- Q3 节奏警觉：CONTEXT.md 写明 SkimPanel (1309 行) 是阶段 4 拆候选，新功能要不要等阶段 4 之后？
- Q4 哲学冲突自检：跟现有铁律有没有冲突？

**用户的第一次回应**："我在纠结要不要直接放在略读模式里"——这等于把 Q1 的 a-e 收窄到 a/b/c 三选项的方向。

---

## 3. 第一轮 RECON 报告（侦察现有略读模式）

研究者主动发起代码侦察，重点确认四个事实：

### 揭示的关键事实

**事实 1**：现有略读模式有 4 stage 状态机
| Stage | 干什么 | 调用 |
|---|---|---|
| `diagnosis` | 全书扫描中（生成 studyMap，含 prerequisites 前置知识） | `generateStudyMap` |
| `tutoring` | 递归补习中（用户对前置知识不懂时反复讲清） | `chatWithSkimAdaptiveTutor(mode='tutoring')` |
| `quiz` | 知识点确认（**单题**门控） | `generateGatekeeperQuiz` |
| `reading` | 正在领读（核心阶段） | `chatWithSkimAdaptiveTutor(mode='reading')` |

**事实 2**：studyMap 已经有"模块化拆分"——2-7 个模块自适应，用户可强制改 (`onRegenerateStudyMap`)

**事实 3**：现有 module 钉死哲学已存在
- `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT` 在 `lib/prompts/systemPrompts.ts`（P2 阶段 4 第 1 批改名搬迁）
- 全局约束："必须沿用用户给定的学习地图模块划分（数量、标题、页码范围）；禁止合并/删减"——这是用户**早期就钉过的铁律**

**事实 4**：module 内部已有结构
- STEM：Module → Part → 4 种解析工具（角色化 / 隐藏逻辑 / 对比表格 / Visual Flow）
- HUMANITIES：3-Step（深度略读报告 / 逐段领读 / 逻辑检查）
- 已有 module 级辅助：`generateModuleTakeaways` + `generateModuleQuiz`

**事实 5**：API 边界铁律已钉死
- 略读用 `chatWithSkimAdaptiveTutor`、备考用 `chatWithAdaptiveTutor`
- `docs/SKIM_VS_EXAM_TUTOR_API.md` 明文规定 SkimPanel 出现 `chatWithAdaptiveTutor` 视为违规
- 共享只在 `appendReadingModeUserMessageSuffix`（reading 模式用户句追加，两侧已对齐）

**事实 6**：reading 阶段是"按需推进"——用户说"继续"AI 才推下一个 module，不是一次性输出

### 真实重叠 vs 真实新增（对比表）

| 维度 | 现有略读 | GPT 三轮递进 | 关系 |
|---|---|---|---|
| 模块化 + 自适应数量 | ✅ studyMap 2-7 | ✅ 自适应 | **重叠** |
| 用户可强制 module 数 | ✅ `onRegenerateStudyMap` | 文档没禁止 | **可继承** |
| Module 内部分层 | ✅ STEM 的 Part / HUMANITIES 的 Step | Round 2 子枝干 | **形似但不同** |
| Module 级题目 | ✅ `generateModuleQuiz` | Round 1/2/3 各自题目 | **现状题目层数浅** |
| **大白话独立故事层（Round 1）** | ❌ studyMap.initialBriefing 是简短地图 | ✅ 显式独立一轮 | **真正新增** |
| **三轮共用同一棵树（zoom in）** | ❌ reading 一次性推完结构 | ✅ 三遍回头 zoom in | **真正新增** |
| **Silent Coverage Guard** | ❌ 无 | ✅ page-level coverage map | **真正新增** |
| 学科分流 | ✅ STEM / HUMANITIES | 文档没明说 | 待用户决定 |

**关键发现**：GPT 文档里的"三轮"中，Round 2 / Round 3 跟现有 STEM 的 Module → Part 在功能上有**实质重叠**；真正全新的是 **Round 1 大白话独立故事层** + **三轮共用一棵树的 zoom in 视觉感** + **Silent Coverage Guard**。

---

## 4. 痛点重新定位 + 用户真实需求收敛

### 用户的关键拍板（按时间顺序）

**第 1 次**："module 就是同一个概念。"
- 含义：沿用现有 module 的所有约束（2-7、有标题、有页码、用户可改）
- 价值：**避免概念分裂**——不让用户脑子里同时存在两种"module"

**第 2 次**："算了，我觉得没必要一直保持后台的 silent coverage guard，用处似乎没有我想的那么大，而且代价太大了。"
- 含义：主动砍掉 Silent Coverage Guard
- 这是**用户主动用代价/价值比做的范围决策**——研究者只是把代价摆出来（"这是从 0 开始的能力，要做后端基础设施"），用户自己做的判断
- 价值：避免 GPT 文档"轻描淡写"的隐藏大工程拖死整个 plan

**第 3 次**："我觉得还是独立出来变成单独的功能吧，但是还是要保留在主页面。不像考试复习按钮，按下就进入了另一个页面。"
- 含义：形态收窄到"主界面第三种阅读模式"——不是二级页面、不是替换略读、不是升级 reader
- 价值：**避免与现有略读功能争夺同一片产品空间**

### 用户真实需求

**用户想要的不是替换略读，也不是给略读加个开关，而是：**

> **在主界面增加一个"递进阅读"模式入口（与精读、略读并列），它用三轮递进（故事 → 结构 → 细节）+ 树状可视化 + 用户主动推进的方式提供一种与现有略读完全不同的解读体验。两者并存，不预设谁取代谁，让用户用真实使用反馈来区分各自适用的场景。**

### 关键产品哲学决策（用户主动表态）

> "我觉得这两个模块只是两个不同的方式，具体区别还是得等我用过再说吧。"

**这句话值得专门记录**。它意味着用户**主动放弃了"上线前必须把产品定位想清楚"这条传统产品逻辑**，选择**让两个模块用真实使用反馈来定位自己**。这是 EdTech 产品在面对教学法不确定性时的成熟选择——避免过早抽象、避免预设用户画像、避免用研究者归纳代替真实用户行为。

---

## 5. 方案选定（含五条铁律）

### 五条铁律（钉死）

1. **API 边界铁律**：新建独立 `chatWithLayeredReadingTutor`，新建独立 prompt。**不复用、不污染**任何现有 tutor。继承 `docs/SKIM_VS_EXAM_TUTOR_API.md` 的产品哲学。

2. **module 概念相同但数据完全独立**（重要：本条曾被误解，最终钉死如下）：
   - **概念上相同**：递进阅读和略读都使用 "module" 概念——都有标题、有页码范围、遵循"用户可强制 module 数"的哲学。
   - **数据上完全独立**：递进阅读**不读、不写、不依赖、不参考** `FilePersistedState.studyMap`。递进阅读自己生成自己的 module 列表（独立 AI 调用），存在自己的持久化字段里。
   - **拆法可以不同**：同一份 PDF，SkimPanel 可能拆成 5 个 module，递进阅读可能拆成 4 个不同标题的 module——两套互不影响、互不参考。
   - **诊断历史**：研究者最初把"概念相同"误解为"数据共享"，写在 RECON 阶段的画面对齐里。用户在 RECON 后明确踩刹车："递进阅读和略读模式两者毫不关联"——这才是正确画面。这条误解被 §8.G 专门记录作为元反思素材。

3. **不做 Silent Coverage Guard**：本次实施完全不涉及。如果将来要做，作为完全独立的功能立项，不污染递进阅读 plan。

4. **不继承前置门控**：递进阅读没有 diagnosis / tutoring / quiz 三阶段。用户进入就直接 Round 1。理由：被术语吓到的学生再加一道门控反而增加压力。

5. **不做学科分流**：递进阅读统一一套 prompt（不做 STEM/HUMANITIES 二分）。理由：**轻盈起步、用真实使用反馈再决定**——跟"产品定位等用过再说"的哲学一致。

### 选定方案

| 维度 | 决策 |
|---|---|
| 形态 | 主界面第三种阅读模式 = 递进阅读模式 |
| viewMode 状态 | `'deep' \| 'skim' \| 'layered'`（新增 `'layered'`） |
| 切换模型 | 默认精读；略读和递进阅读各自"按一下进入、再按一下回精读"；**两个非默认模式之间可以直接互切**（在略读时点递进阅读 = 直切到递进，不必先回精读） |
| 入口位置 | **独立按钮，挨在 Header 现有"略读"按钮右侧**（同区域同样式，独立点击） |
| 入口前置条件 | **不依赖 `hasStudyMap`**——递进阅读有自己的 module 生成路径，按钮显示条件独立 |
| Module 数据 | **完全独立**——递进阅读不读、不写 `studyMap`，自己生成自己的 module 列表 |
| Module 拆法 | 可以与略读完全不同（同一 PDF，两套不同 module 列表合法共存） |
| API | 新建 `chatWithLayeredReadingTutor`，独立 prompt（不继承"必须沿用学习地图"全局约束） |
| 学科分流 | 不做 |
| 前置门控 | 不做 |
| Silent Coverage Guard | 不做 |
| 节奏纪律 | 直接改 App.tsx 的 viewMode（承认会有几十行改动落在阶段 4 拆 App.tsx 之前） |

### 用户勾选的 6 条交互维度

| 维度 | 含义 | 含义钉死 |
|---|---|---|
| (a) 三轮共用同一棵树的 zoom in 视觉连续性 | 三轮不是并列三页/三 tab，是同一棵树越长越深 | ✅ |
| (b) 进度可视化 | 三轮各自 N 个 module 的完成进度（不是 toast） | ✅ |
| (c) 用户主动触发推进 | 点"展开到 Round 2"按钮，不是聊天里说"继续" | ✅ |
| (d) 题目嵌入对话流 | 故事题/结构题/细节题穿插在解读过程里 | ✅ |
| (e) 树状结构可视化 | 真的画一棵可点击折叠的树 | ✅ |
| (g) 学习状态记忆 | "上次看到 Round 2 的 module 3，要继续吗？" | ✅ |
| ~~(f) 多 panel 协同~~ | 用户主动否决：理由"树和 module 详情同时出现会显得很挤" | ❌ |

### 目标体验画面（用户终审通过）

> 用户点了"递进阅读"按钮，进来后看到：
>
> **一棵 lecture 树**（e）。最初只展开到 Round 1——每个 module 一行大白话标题，可点击。
> **顶部一条进度条**（b）：Round 1 ▓▓▓▓░░ 4/6 modules · Round 2 ░░░░░░ 0/6 · Round 3 ░░░░░░ 0/6
>
> 用户点 Round 1 的 module 3 → **当前那个 module 的详情区域**展开（不是另开一栏，是树节点本身展开内容；f 被否决，所以没有右侧详情栏）。
> 看完 module 3 → 区域底部出现一道 **故事题**（d）+ "展开到 Round 2" 按钮（c）。
> 用户点"展开到 Round 2" → 这个 module 在树里**继续往下生根**，长出 2.1、2.2、2.3 子枝干。点子枝干又能展开内容、答结构题、再点"展开到 Round 3"挂细节、答细节题。
>
> 用户随时可以关页面下次回来——再进入时（g）："上次你在 Round 2 的 module 3 子枝干 2.1，要继续吗？"

**关键画面感受**（用户终审确认的）：
- 三轮不是切 tab，是**同一棵树越长越深**——(a)
- 进度有视觉感不是 toast——(b)
- 推进权在用户手里不是 AI 自动跑——(c)
- 题目跟解读混在一起不是事后测试——(d)

---

## 6. 已识别的实施风险

### 风险 1：树状数据结构 + UI 工程量较重

(a) 三轮共用同一棵树 + (e) 树状可视化 + (c) 用户主动推进——这三条交互维度合在一起意味着：

需要一个新数据结构：每个 module 节点包含 Round 1 内容、Round 2 子枝干列表（每个子枝干又含内容）、Round 3 细节列表、各级题目、各级完成状态。这跟现有 studyMap 的扁平 module 列表**不是同一个数据结构**。

**估计**：这部分工程量比单纯写 prompt 重。但这是用户终审通过的画面要兑现的代价。

**缓解**：
- PLAN 阶段把数据结构设计清楚，先于 UI
- 三轮内容采用"按需生成"——用户不点 Round 2 不调 Round 2 的 AI（避免一次性把 1×N×M 的内容全生成）
- 持久化结构与 viewMode 切换解耦，避免数据/视图状态状态机交叉污染

### 风险 2：节奏纪律风险

直接改 App.tsx 的 viewMode 状态机会落在 P2 阶段 4（拆 App.tsx 2856 行）之前。这与"业务逻辑改动不要污染纯搬迁的 commit"的纪律有摩擦。

**缓解（PLAN.md 中需包含）**：
- viewMode 改动尽量集中在 App.tsx 的某一区块
- 加注释标记"递进阅读模式相关，阶段 4 拆分时作为独立 sub-component 提取"
- commit message 明确标注"feature, not migration"——避免跟搬迁 commit 混淆

### 风险 3：与略读功能的产品定位重叠

用户主动选择"产品定位等用过再说"——这是合法的产品决策，但意味着**上线后用户可能产生困惑**："略读和递进阅读什么时候用哪个？"

**缓解**：
- 入口按钮命名要清晰区分（具体命名等 RECON 确认现有"略读"按钮的视觉与文案）
- 首次使用递进阅读时给一句话引导（"这是另一种解读方式，先看大白话故事再逐层深入"）
- 上线后观察使用数据，3-6 个月后再决策是否调整

**重要**：本风险**不在 PLAN 中通过加复杂逻辑来缓解**——这是产品定位风险，不是工程风险，应靠真实使用反馈而非工程预设来解决。

### 风险 4：树状 UI 在 module 数量大时的视觉拥挤

如果用户选了 7 个 module，每个 module 又展开 2-3 个 Round 2 子枝干，每个子枝干又挂 5-8 个 Round 3 细节——树会变得很大。

**缓解**：
- Round 2/3 默认折叠，用户点击才展开
- 已答题的节点用打勾标记，未触达的节点保持折叠
- 进度条始终显示在顶部（不依赖树展开状态）

### 风险 5："统一一套 prompt"会不会导致跨学科水土不服

砍掉学科分流是用户的主动决策（"轻盈起步"）。但**理科 lecture 和文科 lecture 的"故事感"差异很大**——理科适合机制隐喻、文科适合论证脉络。

**缓解**：
- prompt 设计时不强调学科特征，只钉"三轮递进"和"大白话故事"原则
- 让 AI 根据 lecture 自适应——理科 PDF 自然偏机制，文科 PDF 自然偏论证
- 上线后如反馈不佳，再决策是否加学科分流

---

## 7. 用户体验最终规格

| 场景 | 行为 |
|---|---|
| 默认状态 | viewMode = 'deep'（精读模式） |
| "略读"按钮显示条件 | `hasStudyMap === true`（现状不变，需先生成 studyMap） |
| **"递进阅读"按钮显示条件** | **不依赖 `hasStudyMap`，文档加载完即可显示**（独立路径） |
| 点"略读"按钮（精读时） | viewMode → 'skim' |
| 点"略读"按钮（已在略读） | viewMode → 'deep' |
| 点"递进阅读"按钮（精读时） | viewMode → 'layered' |
| 点"递进阅读"按钮（已在递进） | viewMode → 'deep' |
| **点"递进阅读"按钮（在略读时）** | viewMode → 'layered'（**直接切**，不必回精读） |
| **点"略读"按钮（在递进时）** | viewMode → 'skim'（**直接切**，不必回精读） |
| 进入递进阅读首次 | 调用**独立 module 生成 API**（不读 studyMap），生成本模式的 module 列表，显示 Round 1 大白话故事树（无前置门控） |
| Module 数据 | 存在 `FilePersistedState.layeredReadingState.modules`，**与 `studyMap.modules` 完全独立**——一方修改不影响另一方 |
| Round 1 操作 | 点 module 标题展开内容；看完底部出故事题 + "展开到 Round 2"按钮 |
| Round 2 操作 | module 树往下长子枝干；点子枝干展开内容；底部出结构题 + "展开到 Round 3"按钮 |
| Round 3 操作 | 子枝干下挂术语/实验/图/证据；可答细节应用题 |
| 进度可视化 | 顶部进度条三条：Round 1 X/N · Round 2 Y/N · Round 3 Z/N |
| 关闭后再进入 | 提示"上次你在 Round X 的 module Y 子枝干 Z.W，要继续吗？" |
| API | 调用 `chatWithLayeredReadingTutor`，统一 prompt（不分学科） |
| 持久化 | 三轮树状态 + 进度 + 题目作答记录，按文件存（与 SkimPanel 持久化模式类似） |

---

## 8. 元反思（meta-reflection）

这次诊断过程的特殊价值：**它不是从用户痛点出发，而是从外部输入（GPT 文档）出发**。这跟 `MULTISELECT_KC_INQUIRY` 的"用户表层抱怨 → 真实需求"链路不同，是**"外部方案 → 与现有产品对齐 → 范围收敛 → 形态决策"**链路。

### A. 外部方案如何与现有产品对齐

GPT 文档是脱离 class-skip 现状写的。直接照搬会导致：
- 概念分裂（"module"两套含义）
- 功能重复（Round 2 与 STEM Part 实质重叠）
- 隐藏大工程（Silent Coverage Guard）
- 哲学冲突（前置门控 vs 三轮直入）

**关键动作**：先用代码侦察列出"真实重叠 vs 真实新增"对照表，让 stakeholder 用代价/价值比做范围决策。这一步把 GPT 文档"看起来 5 个新功能"压缩成"实际 3 个新增点"，再让 stakeholder 砍掉其中代价最大的一个。

### B. 范围收敛的两次刹车

| 时机 | 研究者预设 | 用户实际意图 | 用户如何踩刹车 |
|---|---|---|---|
| GPT 文档刚到 | 倾向把 Silent Coverage Guard 作为核心特色保留 | 用户用代价/价值比主动砍掉 | "用处似乎没有我想的那么大，代价太大" |
| 形态选择时 | 提了 a/b/c 三选项，倾向 a（独立模块） | 用户选 a 但加了"保留在主页面"约束 | 主动定位"不像考试复习按钮按下进二级页面" |

**关键教训**：研究者列代价时要诚实。把 Silent Coverage Guard 写成"轻描淡写的后台守护"会让用户低估代价；写成"从 0 开始的后端基础设施"会让用户做出更好决策。**披露代价 ≠ 反对功能，而是给 stakeholder 完整决策素材**。

### C. "产品定位等用过再说"是成熟的产品决策

用户主动表态："这两个模块只是两个不同的方式，具体区别还是得等我用过再说吧。"

这句话在传统产品方法论里是**反模式**——"上线前应该把产品定位想清楚"。但在 EdTech 产品中，**教学法的有效性高度依赖真实使用情境**，过早抽象用户画像往往把产品做窄。

研究者的责任：**识别这种克制并尊重它**。不要用"我们应该把定位想清楚"的名义反复追问，让 stakeholder 觉得自己的克制是问题。

这条与 `MULTISELECT_KC_INQUIRY.md §9.E`（捍卫产品哲学）一致——但形态不同：
- MULTISELECT 案例：stakeholder 钉死"对话归对话、测试归测试"
- LAYERED_READING 案例：stakeholder 钉死"不预设产品定位，让真实使用反馈来区分"

两条都是产品哲学约束，研究者只识别和尊重，不评价。

### D. 交互维度的"勾选式收敛"

当 stakeholder 说"想更有交互一点，我也没有画面"时，研究者的本能反应是猜测。**这是 §9.D 警告的"用研究者归纳代替 stakeholder 画面"的危险信号**。

本案例的处理：研究者不猜，而是把"交互"这个模糊词拆成 8 个具体维度（a-h），让 stakeholder 勾选。结果：用户勾了 6 条、否了 1 条（多 panel 协同）、留了 1 条（其他）作为开放空间。

**关键教训**：当 stakeholder 表达模糊时，**研究者的工作不是替 ta 想清楚，而是把可能的维度拆出来让 ta 选**。这避免了"研究者归纳"侵蚀真实画面。

### E. 铁律的双重作用

本次钉死了 5 条铁律，跟 MULTISELECT 的 3 条铁律对比，铁律承担的功能：

1. **保护现有产品哲学不被新功能稀释**（API 边界、不分裂 module 概念）
2. **保护新功能不被 scope creep**（不做 Coverage Guard、不继承门控、不分学科）

第二种是这次新增的——铁律不只是"保护已有"，也可以**保护新功能本身的克制**，避免在 PLAN 阶段被加进各种"既然都做了不如顺便做"的功能。

### F. AI 协作的分层（沿袭 MULTISELECT §9.F）

- chat AI（产品分析、风险评估、决策协助、画面对齐、写文档）
- coding AI（代码侦察、实施、测试）
- 人类（最终决策、术语澄清、踩刹车、画面终审、范围决策）

本次特别突出的是人类的两个职能：
- **范围决策**：主动砍 Silent Coverage Guard
- **画面终审**：研究者描述的目标体验画面，用户拍板"对/不对"

这两个职能 AI 都做不了——AI 可以列代价、可以提画面，但**最后是不是这样做、是不是这个画面**只能人类拍。

### G. "概念相同 ≠ 数据共享" —— RECON 阶段才浮现的误读

本案例最值得记录的元反思素材：研究者在 INQUIRY 阶段把"module 是同一概念"翻译成了"共享同一份 module 数据"——这是隐蔽的术语滑坡。

**滑坡过程**：

1. 用户拍板："module 是同一概念"
2. 研究者的隐式翻译：概念相同 → 应该共享同一个 studyMap → 递进阅读读 `FilePersistedState.studyMap`
3. 这个翻译被写进 INQUIRY 第一版 §5 选定方案表，**用户没立刻看出来**
4. RECON 阶段研究者暴露了这个翻译（"事实 1：略读按钮依赖 hasStudyMap，递进阅读要不要也依赖"）
5. 用户立刻踩刹车："递进阅读和略读模式两者毫不关联"——主动**反对**共享

**关键教训**：

- 概念抽象层的"相同"和数据具象层的"共享"是两件事。术语警觉不只在词的层面，**还在概念→数据的翻译层面**。
- INQUIRY 阶段的画面对齐**不能在抽象层封顶**——必须下沉到"这个数据从哪里读、写到哪里、谁可以改"这种数据层细节。
- RECON 不只是侦察现状，**还能反向暴露 INQUIRY 阶段的翻译错误**。"侦察现有代码 → 提出'要不要复用'问题 → 用户在被迫面对具体共享场景时拍板真正的画面"——这是 RECON 阶段独有的认知功能，不能跳过。
- 文档要勇于自我修订。INQUIRY 不是石头碑，发现误读了就改并写明改了什么、为什么——这跟代码 commit 历史保留误读痕迹的逻辑一样：**承认认知演进过程比假装一开始就懂更诚实**。

这条教训沿用 §9.A（"概念→数据"翻译层警觉）和 §9.D（术语警觉）的方向，但在更深的层面：**当用户用抽象词描述时，研究者要主动把抽象词翻译成数据层的多个候选画面，让用户挑而不是替用户翻译**。本次研究者犯的错就是替用户做了翻译，没让用户挑。

---

## 9. 给 PLAN.md 的指引

PLAN 阶段需要覆盖：

### 9.1 阶段划分建议（待 PLAN 阶段细化）

考虑分 3-4 个阶段，每阶段独立可 commit：

1. **阶段 1**：viewMode 状态机扩展 + 入口按钮 + 空壳页面 + 持久化结构
   - 不调 AI、不生成 prompt、不画树
   - 验收：能切换到递进模式、能切回精读、空壳显示

2. **阶段 2**：Round 1 大白话故事线（最小可用）
   - 新建 prompt + `chatWithLayeredReadingTutor`
   - module 列表生成 + 简单展开（不做完整树状 UI）
   - 验收：能生成 Round 1 内容、能切换 module、能持久化

3. **阶段 3**：Round 2 / Round 3 + 树状 UI + 进度条
   - 三轮共用一棵树的数据结构
   - 用户主动推进按钮
   - 验收：完整画面终审场景能跑通

4. **阶段 4**：分层题目 + 学习状态记忆
   - 故事题/结构题/细节题
   - "上次看到哪里"提示
   - 验收：题目能答、状态能恢复

### 9.2 守卫规则（PLAN 必含）

| 规则 | 来源 | 违反后果 |
|---|---|---|
| 不复用 `chatWithSkimAdaptiveTutor` 或 `chatWithAdaptiveTutor` | 铁律 1 | 破坏 API 分离，污染既有 tutor |
| 不引入新的 "module" 概念，沿用 studyMap 的 module 含义 | 铁律 2 | 概念分裂，用户认知混乱 |
| 不做 page-level coverage map 或类似机制 | 铁律 3 | scope creep |
| 不在递进模式入口前加 quiz / tutoring / diagnosis | 铁律 4 | 破坏"轻盈直入"画面 |
| 不分 STEM / HUMANITIES prompt | 铁律 5 | 破坏"轻盈起步"哲学 |
| **递进阅读不读、不写 `FilePersistedState.studyMap`** | 铁律 2（修订后） | 数据共享 = 概念分裂的反面，违反"两者毫不关联" |
| **递进阅读按钮显示条件不依赖 `hasStudyMap`** | 铁律 2（修订后） | 数据独立 → 触发条件也独立 |
| 不做右侧 panel 详情区 | 用户否决 (f) | 违反终审画面 |
| 不让 AI 自动推进三轮，必须用户点按钮触发 | 用户勾选 (c) | 破坏"用户主动推进"画面 |

### 9.3 测试重点（PLAN 必含）

- viewMode 三态切换（精读 ↔ 略读 ↔ 递进，包括两个非默认模式直切）
- 现有略读、精读、备考工作台、Notebook 完全不受影响
- 三轮内容按需生成（不点不调 AI）
- 持久化恢复：关页面再进入能从断点续上
- **关键回归**：在 SkimPanel 改 module 数 → 不影响递进阅读的 module 列表
- **关键回归**：在递进阅读改 module 数 → 不影响 SkimPanel 的 studyMap
- **关键回归**：未生成 studyMap 的文档，递进阅读按钮也能显示并工作

### 9.4 不在 PLAN 中做的事（明确列出）

- **不做** Silent Coverage Guard
- **不做** STEM / HUMANITIES 分流
- **不做** 前置知识门控
- **不做** 多 panel 协同 UI
- **不做** 递进阅读 → studyMap 数据迁移或共享（彻底独立）
- **不动** 现有 SkimPanel / chatWithSkimAdaptiveTutor / studyMap
- **不动** 备考工作台 / chatWithAdaptiveTutor / KC / atom coverage / BKT
- **不动** Notebook / 复习九宫格 / 考试中心
- **不动** 现有 `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT` 的内容

---

## 10. 附：相关代码文件索引（RECON 已补全）

### 必须修改的文件

- **`types.ts`**：`ViewMode` 类型定义需扩展为 `'deep' | 'skim' | 'layered'`；`FilePersistedState` 增加 `layeredReadingState` 字段；`CloudSession` 同步增加该字段（云同步要求）
- **`App.tsx`**：viewMode 状态机（现位于 `commonHeader` 渲染区域）；持久化恢复逻辑；新建 `LayeredReadingPanel` 渲染分支（与 `viewMode === 'skim'` 平行）；`onToggleViewMode` 回调改造为支持三态切换
- **`shared/layout/Header.tsx`**：现"略读"切换按钮位于 Mode Toggle Button 区块，依赖 `hasStudyMap` 显示；新增"递进阅读"独立按钮，挨在略读按钮右侧，**不依赖 `hasStudyMap`**
- **`services/geminiService.ts`**：新建 `chatWithLayeredReadingTutor` 导出；新建 `generateLayeredReadingModules`（生成本模式独立 module 列表的 API）
- **`lib/prompts/systemPrompts.ts`**：新建独立 prompt（不继承 STEM_SYSTEM_PROMPT / HUMANITIES_SYSTEM_PROMPT 的全局"必须沿用学习地图"约束）
- **`docs/SKIM_VS_EXAM_TUTOR_API.md`**：更新引用校验表，加入 `chatWithLayeredReadingTutor` 一行；加入"不应：`LayeredReadingPanel.tsx` 出现 `chatWithSkimAdaptiveTutor` 或 `chatWithAdaptiveTutor`"
- **`CHANGELOG.md`**：在 Unreleased 段加入新功能条目

### 不能动的文件（铁律守卫）

- **`features/reader/skim/SkimPanel.tsx`**（1309 行）：完全不动
- **`services/geminiService.ts` 已有的 `chatWithSkimAdaptiveTutor` / `chatWithAdaptiveTutor`**：完全不动
- **`STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT`** 内容：完全不动
- 现有 `FilePersistedState.studyMap`：完全不动（递进阅读自己用 `layeredReadingState.modules` 字段）
- **备考工作台所有相关代码**：完全不动

### 新建的文件

- **`features/reader/layered/LayeredReadingPanel.tsx`**：递进阅读主组件（建议放在 `features/reader/` 下与 skim 平行）
- **`features/reader/layered/LayeredReadingTree.tsx`**（如拆分）：树状 UI 组件
- 其他子组件由 PLAN 阶段细化

### RECON 出的关键事实（PLAN 阶段需要参照）

- **viewMode 类型在 `types.ts:269` 附近**：`export type ViewMode = 'deep' | 'skim';`
- **App.tsx 当前 onToggleViewMode 回调**：`() => setViewMode(prev => prev === 'deep' ? 'skim' : 'deep')`，需改造为支持 `'layered'`
- **Header.tsx 现有 toggle 按钮**：`{hasStudyMap && (<button onClick={onToggleViewMode}>...</button>)}`——递进阅读按钮**不能**抄这个 `hasStudyMap` 守卫
- **viewMode 已经在 FilePersistedState 持久化**：`viewMode: ViewMode` 字段已存在；扩展类型后会自动持久化到本地+云端
- **CloudSession 同步**：`CloudSession` 也含 `viewMode?: ViewMode` 字段，类型扩展会自动生效

---

*文档完成于画面终审之后、PLAN 起草之前。*
