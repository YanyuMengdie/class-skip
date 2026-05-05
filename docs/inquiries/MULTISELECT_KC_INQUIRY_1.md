# 多选 KC 对话功能 — 诊断过程文档（v2 修订版）

> **文档性质**：这不是实施计划（Plan），是诊断过程的记录（Inquiry）。
> **目标读者**：未来的 Criss、给 Dr. Woodruff 展示研究方法的素材、其他可能接手这个项目的人。
> **配套文档**：`MULTISELECT_KC_PLAN.md`（具体实施计划，给 Claude Code 看，待 atomId→kcId 反查侦察后生成）。
>
> **核心价值**：记录"用户表层抱怨 → 代码事实侦察 → 痛点重新定位 → 反复对齐画面 → 产品决策"这条完整链路。这条链路本身就是 EdTech learner-centered design 的一个研究案例。
>
> **v2 修订**：补充了"方案对齐"过程中用户三次踩刹车的关键节点，钉死了"对话机制和 BKT 不变"两条铁律。

---

## 1. 用户原始反馈（未经处理）

> "首先，对于备考工作台有一个我觉得需要的功能，就是现在只能单选一个 KC 进行对话，或者针对全局 KC 进行对话。但是，我有时候就是需要选择多个 KC 但不是全部 KC 进行对话和考察。而且，进行全局 KC 的时候，对话的过程中不会让 KC 右上角的分数增加，这样我甚至都不知道我的掌握度怎么样了。"

**表面包含 2 个诉求**：
- A. 需要多选 KC 但不是全选
- B. 全卷模式下右上角的"分数"不增加，不知道掌握度

**事后回看**：这两个诉求看起来独立，实际是**同一个根本问题的两面**——见 §5。

---

## 2. 第一轮分析：跑偏的猜测

在没有任何代码事实的情况下，最初的分析方向是：
- 假设"分数不更新"是 BKT 更新逻辑的 bug
- 假设要给全卷模式接通 BKT 更新
- 假设多选 KC 的核心难题是"AI 怎么知道考的哪个 KC"

**关键认知错误**：把"分数"默认理解为"BKT 掌握度预测分"。

**这条假设链如果直接交给 Claude Code 实现，会破坏一个学术上正确的设计**——见 §3 事实揭示。

**用户在这一步的关键贡献（第一次踩刹车）**：主动要求"先问代码现状，再决定方案"。

---

## 3. 第一轮 RECON 报告（EXAMPREP_RECON.md，485 行）

### 揭示的关键事实

**事实 1**：备考工作台有 **3 种**对话模式，不是 2 种

| 模式 | 入口 | 对应 state | 是否更新 BKT |
|---|---|---|---|
| A. 单 KC 锚定对话 | 点 KC 卡片 | `selectedKcId` | ❌ 不更新 |
| B. 全卷对话 | 勾选"全卷对话" | `wholeBookMode` | ❌ 不更新 |
| C. 结业探测弹窗 | 点"结业探测"按钮 | `probeKc` | ✅ 更新 |

**事实 2**：A/B 模式不更新 BKT 是**显式设计**，不是 bug。证据：
- "结业探测"按钮 disabled title 写明 "请先生成本场考点图谱以启用 BKT"
- A/B 调用 `chatWithAdaptiveTutor`，AI 返回纯 Markdown，客户端只判"质量"（weak/partial/strong），不判对错
- C 调用 `generateLSAPProbeQuestion + evaluateLSAPAnswer`，AI 返回结构化 JSON 含 `correct: true/'partial'/false`

**事实 3**：BKT 是贝叶斯更新，需要明确"对/错"信号。对话模式的"质量评估"信号塞进 BKT 会让分数失真。**做这个设计的人懂 BKT**——这是有意识的产品哲学：**对话归对话、测试归测试，BKT 严肃严谨**。

**事实 4**：KC 选择逻辑是工作台**私有**——reader/review/skim 系列 0 处引用。改这部分不会波及精读、Notebook、闪卡等模块。

### 关键术语澄清（用户第二次踩刹车）

报告里有一句 "对话只推进 atom coverage 而非预测分"，最初被忽略。用户主动澄清："我说的分数不是掌握度的分数，而是逻辑原子的覆盖进度。"

这次澄清触发第二轮 RECON。

---

## 4. 第二轮 RECON 报告（atom coverage 专项，897 行）

### 揭示的关键事实

**事实 5**：`atom coverage` 是独立的数据维度
- 类型：`AtomCoverageByKc = Record<string, Record<string, boolean>>`（types.ts:169）
- 含义：KC id → atom id → 是否覆盖
- LogicAtom 结构：每个 atom 含 `id / kcId / label / description`（types.ts:160）
- state 在 `App.tsx:234`，无 context/store——纯 props drilling

**事实 6**：atom coverage 更新机制
- 更新函数：`mergeCoverageForKc`（Socratic.ts:94），**只能加不能减**（温和设计）
- 调用点：`Socratic.ts:565-581`，被 `if (activeKc?.atoms?.length)` 守卫
- 更新依据：AI 返回结构化 JSON `{coveredAtomIds: [], gapAtomIds: []}`（geminiService.ts:2515-2564）

**事实 7**：三种模式下的调用情况
- 模式 A（单 KC）：✅ 调用
- 模式 B（全卷）：❌ 不调用（`activeKc=null` 短路守卫）—— **显式分支跳过，不是漏写**
- 模式 C（结业探测）：❌ 完全不涉及 atom 概念

**事实 8**：UI 显示位置
- KC 卡片**右上角**显示的就是 atom coverage，格式 `{covered}/{total}`（如 `3/7`），10px 灰色小字（ExamWorkspacePage.tsx:705-712）
- 顶部圆环 `<PredictedScoreDisplay>` 显示的是 BKT 预测分——**与 atom coverage 不是同一数据源，在不同位置**

**事实 9**：反馈强度对比（暂不涉及本次方案，记录为长期 backlog）
- BKT 预测分上升时：4 秒 toast + 动画 + 颜色变化（ExamWorkspacePage.tsx:787-790）
- atom coverage 更新时：只有 10px 灰色小字默默变化，无动画无颜色无 toast
- 用户经追问后表示单 KC 模式下能感知到现有反馈，**当前不是痛点**

**事实 10**："全卷模式右上角不变"在代码层面的真相
- 卡片角标：全卷模式下 `activeKc=null`，Socratic line 565 守卫短路，不调 `mergeCoverageForKc`，state 完全不变
- 顶部圆环（BKT）：A/B 模式都不更新 BKT，只有模式 C 才动

---

## 5. 痛点重新定位 + 用户真实需求

### 用户经追问澄清的真实画面

> 1. **单选 KC**：效果不变（保持现状）
> 2. **多选 KC**：AI 同时结合几个 KC 进行问答检验，目的是**加速推进度**（验证"我都会了"）。"答对了"相关 atom 上涨。
> 3. **全选 KC**：对所有 lecture 的所有知识点进行问答检验，对话会持续较久但用户接受。

### 真实根需求

**用户想要的不是修 bug、不是改 UI 反馈样式、不是新设计反馈系统，而是：**

> **把单 KC 的对话/atom-coverage 机制扩展到多 KC 范围，让"一次对话同时推进多个 KC 的覆盖率"，从而加速复习进度。**

### 反馈 A 和反馈 B 的真实关系

它们是同一根需求的两面：
- "想多选" = 单 KC 太窄，复习太慢
- "全卷无反馈让我心里没底" = 全卷虽然范围够广，但**因为 atom coverage 不更新**，看不到推进，等于白聊

---

## 6. 方案选定（含三条铁律）

### 三条铁律（用户第三次踩刹车后钉死）

用户在方案讨论后期主动澄清：

> "对话模式绝对不能变，对话模式当然还是教学型对话，保持现在的对话模式，绝对不能变。而且 BKT 也绝对不变，只是逻辑原子变化。"

由此钉死三条产品哲学约束：

1. **对话机制不动** —— 仍用 `chatWithAdaptiveTutor`，AI 是辅导员不是考官
2. **BKT 不动** —— 不接通到对话模式，不改更新条件
3. **唯一变化：atom coverage 的分发更新逻辑** —— 从单 KC 扩展到多 KC

**这三条铁律的产品意义**：保护"对话归对话、测试归测试"的清晰边界，不让"用户体验改进"侵蚀已有的产品设计哲学。

**关于"答对了 atom 上涨"的精确翻译**：用户口语中说的"答对"不是产品意义上的"判对错"，而是日常意义上的"AI 判定我说的内容质量足够 = 我所触及的 atom 被收录到 coveredAtomIds"。这个机制现状已存在，本方案只扩展其范围，不改其判定逻辑。

### 选定方案

| 维度 | 改动 |
|---|---|
| state 类型 | `selectedKcId: string` → `selectedKcIds: string[]` |
| KC 卡片交互 | 单选 → toggle 多选（点亮 / 再点取消） |
| "全卷对话"按钮 | **移除**，改为"全选"按钮（点一次选中所有 KC） |
| 0 选状态 | 禁用输入框，提示"请先选择 KC" |
| 对话调用 | 仍用 `chatWithAdaptiveTutor`，prompt 拼接从 1 个 KC 扩到 N 个 |
| AI 输出 | 仍是 Markdown + `{coveredAtomIds, gapAtomIds}` JSON（**格式不变**） |
| atom coverage 更新 | **核心改动**：按每个 atom 的 `kcId` 字段分发，对涉及到的每个 KC 各调用一次 `mergeCoverageForKc` |
| BKT | 完全不动 |
| 结业探测（模式 C） | 完全不动 |
| 单 KC 模式 | 行为完全不变（多选 = N 时退化为单选） |

### 方案验证场景（用户已确认贴近真实画面）

> 用户勾选 KC3 + KC5。跟 AI 说："给我讲讲这两个概念怎么联系起来"。
> AI 回 Markdown 解释，附 `{coveredAtomIds: ["a31","a32","a51"], gapAtomIds: ["a52"]}`。
> 前端：
> - 反查 `a31, a32` 属于 KC3 → `mergeCoverageForKc(KC3, [a31, a32])`
> - 反查 `a51` 属于 KC5 → `mergeCoverageForKc(KC5, [a51])`
> - KC3 角标 `2/7` → `4/7`
> - KC5 角标 `1/8` → `2/8`
> - **同一句对话推进两个 KC 的进度**——这就是"加速推进度"

### 不做的事 + 理由

- **不接通全卷模式的 atom coverage**：全卷按钮要去掉，不需要为它接通
- **不强化单 KC 模式的视觉反馈**：用户能感知现状反馈，当前不是痛点（记入长期 backlog）
- **不动 BKT 任何相关逻辑**：BKT 设计学术正确，对话不更新 BKT 是合理设计
- **不动 WorkspaceKcProbeModal（结业探测）**：独立闭环，与多选无关
- **不引入"答对/答错"判断到对话路径**：会破坏对话教学型定位（铁律 1）

---

## 7. 已识别的实施风险

### 风险 1：全选 = AI 收到全部 KC 的 prompt

代价：
- Token 消耗增加（量级：几倍到十几倍，取决于 KC 数量）
- AI 注意力分散：长 prompt 容易让 AI"看不到重点"
- atom 归属可能错报：候选 atom 池过大时 AI 可能把 atom-A 报成 atom-B

**用户原本抱怨"全卷模式聊着聊着跳舰"——全选模式很可能复现这个问题**，但用户已明确表示"对话持续较久可以接受"。

### 风险 2：atom 归属逻辑（核心实现风险）

单 KC 模式下，AI 返回的 `coveredAtomIds` 默认归属当前 KC（隐含假设）。多选模式下：
- 用户选了 KC1 + KC2 + KC3
- AI 这一轮可能聊了 KC1 的 atom 和 KC2 的 atom
- 前端必须按 atom 的 `kcId` 字段分发到对应 KC

**前置依赖**：前端需要能从 atomId 反查到 kcId。`LogicAtom` 类型本身有 `kcId` 字段，但是否能从前端 state 里反查待**第三轮侦察**确认。

### 缓解策略（PLAN.md 中需包含）

- **回退预案**：保留代码结构灵活性，将来如果"全选跑题"严重，可以快速回退到"恢复全卷按钮 + 多选并存"
- **抽象关键函数**：prompt 拼接 / atom 分发 / KC 选择逻辑应抽成独立可参数化函数
- **测试重点**：全选场景下 AI 跑题率、atom 错归属率
- **守卫错归属**：前端在调 `mergeCoverageForKc` 前过滤——只接受 `kcId` 在 selectedKcIds 中的 atom，AI 报错 KC 之外的 atom 直接丢弃

---

## 8. 用户体验最终规格

| 场景 | 行为 |
|---|---|
| 点 KC 卡片（首次） | 选中（同现状） |
| 点 KC 卡片（已选中） | 取消选中（**新增 toggle 行为**） |
| 选中第二个 KC | 第一个保持选中（**关键变化**） |
| 选中状态视觉 | 同现状的"激活态"，可同时多个亮 |
| 点"全选"按钮 | 选中全部 KC |
| 0 选状态 | **禁用输入框，提示"请先选择 KC"** |
| 对话 prompt | 告诉 AI"本场锚定考点是 KC1 + KC2 + KC3"，AI 围绕这几个聊 |
| atom coverage 更新 | 按 atom.kcId 分发，对涉及的每个 KC 各调用 `mergeCoverageForKc` |
| 全卷按钮 | 移除 |
| BKT 逻辑 | 完全不动 |
| 结业探测（模式 C） | 完全不动 |
| 单选退化场景 | selectedKcIds.length === 1 时行为完全等同现单 KC 模式 |

---

## 9. 元反思（meta-reflection）

这次诊断过程展示了几个值得记录的研究方法点：

### A. 用户表层抱怨 vs 真实需求的距离

最初的"分数不更新"听起来像 bug。实际上：
- "分数"是术语混淆（atom coverage vs BKT predicted score）
- "不更新"在某种模式下是设计而非 bug
- 真实痛点是"加速跨 KC 推进度"

### B. 先侦察后决策的价值

两次 RECON 报告（共 1300+ 行代码事实）改变了方案方向。如果跳过侦察直接改 BKT 接通逻辑，会破坏一个学术上正确的设计。

### C. 反复对齐画面的必要性 ——本次最大的方法论收获

整个对齐过程出现了 4 次研究者（chat AI）和 stakeholder（用户）画面不一致的节点：

| 时机 | 研究者预设 | 用户实际意图 | 用户如何踩刹车 |
|---|---|---|---|
| 一开始 | 把"分数"理解为 BKT 预测分 | 是 atom coverage 角标 | 主动澄清术语 |
| 第一轮 RECON 后 | 推断根需求是"对话边界精准 + 即时反馈" | 实际是"加速跨 KC 推进度" | 主动描述真实画面 |
| 方案讨论中 | 把"考我/答对"理解成考官式机制 | 实际是日常口语，机制完全不变 | 主动钉死铁律 |
| 文档生成前 | 假设"用户体验改进"高于"已有设计哲学" | 用户哲学是"对话归对话、测试归测试" | 主动捍卫边界 |

**关键教训**：研究者的"逻辑自洽的归纳"不能替代 stakeholder 的"真实画面描述"。每次锁定方案前，应主动让 stakeholder 用自己的话描述目标体验流程，而不是用研究者归纳的"根需求"代替。

### D. 对术语保持警觉

"分数 = BKT 预测分"这个隐含假设差点让整个分析跑偏。用户主动追问"我说的不是 BKT 分"是关键拐点。这种警觉性是研究者的基本功。

### E. 捍卫产品设计哲学的能力

用户在最后阶段钉死"对话机制和 BKT 绝对不变"——这不是技术约束，是**产品哲学约束**。stakeholder 对自己产品哲学的清晰认知是产品负责人最稀缺的品质，研究者的责任是**识别并尊重这种哲学**，而不是用"优化"的名义稀释它。

### F. AI 协作的分层

- chat AI（产品分析、风险评估、决策协助）
- coding AI（代码侦察、实施、测试）
- 人类（最终决策、术语澄清、踩刹车、画面对齐）

三者各司其职，AI 不能直接对话，必须人类做信使。**人类的"踩刹车"职能是这套协作中最关键、最不可替代的角色**。

---

## 附：相关代码文件索引

- 主组件：`ExamWorkspacePage.tsx`（state 定义 line 201-208；KC 卡片 line 705-712；BKT toast line 787-790）
- 对话核心：`Socratic.ts`（mergeCoverageForKc line 94；调用守卫 line 565-581）
- 类型定义：`types.ts`（LogicAtom line 160；AtomCoverageByKc line 169）
- AI 服务：`geminiService.ts`（atom 解析 line 2515-2564）
- App state：`App.tsx`（atomCoverageByKc line 234；workspaceLsap line 216-217；localStorage 恢复 line 382）
- 探测弹窗：`WorkspaceKcProbeModal.tsx`（BKT 调用 line 186）
- 完整侦察报告：`EXAMPREP_RECON.md`（897 行）
