# 递进阅读模式 — 实施计划（PLAN）

> **文档性质**：给 Claude Code 的实施计划。具体动手指南。
> **配套文档**：`LAYERED_READING_INQUIRY.md`（诊断过程，了解为什么这样做）。
> **实施前置**：读完 INQUIRY §5 七条铁律 + §5.5 阶段 2 后需求加码 + §6 风险评估 + §7 用户体验最终规格 + §10 代码索引。
> **方法论**：沿用 `MULTISELECT_KC_PLAN.md` 的分阶段 + 守卫规则 + 阶段间用户介入 + 给 Claude Code 的执行指令模板。
> **修订历史**：第一版（阶段 1-4 原计划）→ 第二版（阶段 2 完成后扩展，加溯源 + 提问到阶段 3）。

---

## 1. 九条铁律（绝对不能违反）

> 这些铁律来自 INQUIRY 阶段用户钉死的产品哲学。违反任何一条 = PLAN 失败。
> 铁律 1-7 来自 INQUIRY §5（其中 6/7 是阶段 2 后新增的产品哲学）；铁律 8/9 是 PLAN 实施层钉死。

1. **API 边界铁律**：新建独立 `chatWithLayeredReadingTutor`；递进阅读组件**绝不**调 `chatWithAdaptiveTutor` 或 `chatWithSkimAdaptiveTutor`。

2. **module 数据完全独立**：递进阅读**不读、不写** `FilePersistedState.studyMap`；自带 `layeredReadingState.modules` 字段；同一 PDF 两套 module 列表合法共存，互不影响。

3. **不做 Silent Coverage Guard**：本 PLAN 完全不涉及 page-level coverage map / A-D 风险标签 / 自动补洞等机制。

4. **不继承前置门控**：递进阅读没有 diagnosis / tutoring / quiz 三阶段，进入直接 Round 1。

5. **不分 STEM / HUMANITIES prompt**：递进阅读统一一套 prompt。新 prompt **不继承**现有 STEM_SYSTEM_PROMPT / HUMANITIES_SYSTEM_PROMPT 里的"必须沿用学习地图"全局约束。

6. **AI 解读不取代原始 slides（阶段 2 后新增）**：Round 2/3 内容必须含溯源（页码 + 位置描述）；用户能从任意 module 节点跳回 PDF 对应位置；**AI 不许编造页码**——如果 PDF 没有相关内容，宁可少给细节。

7. **Module 提问视觉独立、数据全局（阶段 2 后新增）**：每 module chat 框只显示该 module 的 Q&A（视觉过滤）；但每次调用 `chatWithLayeredReadingTutor` 都把**完整 globalChatHistory** 发给 AI（数据全局共享）；持久化在 `layeredReadingState.globalChatHistory`。

8. **绝不动现有代码**：现有 `SkimPanel.tsx` (1309 行)、`chatWithSkimAdaptiveTutor`、`STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT` 内容、`FilePersistedState.studyMap` 字段、备考工作台所有代码——**完全不动**。

9. **AI 不自动推进三轮**：必须用户点"展开到 Round X"按钮才推进。AI 不能在回复末尾说"我接下来给你讲 Round 2"自动推进。

---

## 2. 全局技术约束

### 2.1 数据流约束

```
SkimPanel ←→ FilePersistedState.studyMap        （现状不动）
                        ⊥（绝对独立，无连线）
LayeredReadingPanel ←→ FilePersistedState.layeredReadingState  （新增）
```

**关键**：两条数据流之间**没有任何引用、读取、转换、参考**关系。读 layeredReadingState 时不可顺手读 studyMap 作 fallback；写 layeredReadingState 时不可同步更新 studyMap。

### 2.2 viewMode 状态机改造

现状（types.ts）：
```ts
export type ViewMode = 'deep' | 'skim';
```

改造为：
```ts
export type ViewMode = 'deep' | 'skim' | 'layered';
```

切换逻辑（App.tsx 当前的 `onToggleViewMode`）：
- 现状：`() => setViewMode(prev => prev === 'deep' ? 'skim' : 'deep')`
- 改造为：拆成两个独立回调
  - `onToggleSkim()`：在 'skim' 时回 'deep'，否则切到 'skim'（**包括从 'layered' 直切到 'skim'**）
  - `onToggleLayered()`：在 'layered' 时回 'deep'，否则切到 'layered'（**包括从 'skim' 直切到 'layered'**）

### 2.3 类型定义骨架（PLAN 草稿，阶段 1 实施时 Claude Code 可微调）

```ts
// types.ts 新增
export interface LayeredReadingModule {
  id: string;                  // module-1, module-2 ...
  index: number;               // 1-based
  storyTitle: string;          // Round 1 大白话标题
  pageRange?: string;          // "1-5" 等
  /** Round 1 内容（大白话故事）；按需填充，未生成时为 null */
  round1Content?: string | null;
  /** Round 2 子枝干列表；按需填充 */
  round2Branches?: LayeredReadingRound2Branch[];
  /** 各 Round 完成状态 */
  round1Done?: boolean;
  round2Done?: boolean;
  round3Done?: boolean;
}

export interface LayeredReadingRound2Branch {
  id: string;                  // module-1.1
  index: number;               // 1.1, 1.2 ...
  title: string;               // Round 2 子枝干标题
  content?: string | null;     // Round 2 内容
  /** Round 3 细节挂载 */
  round3Details?: LayeredReadingRound3Detail[];
}

export interface LayeredReadingRound3Detail {
  id: string;
  /** "term" | "experiment" | "figure" | "evidence" | "comparison" 等自由文本类型 */
  kind: string;
  label: string;               // 术语名 / 实验名 / 图编号 ...
  description: string;         // 它服务哪个观点
}

export interface LayeredReadingQuestion {
  id: string;
  /** 题目所属轮次：1/2/3，对应故事题/结构题/细节题 */
  roundLevel: 1 | 2 | 3;
  /** 题目挂在哪个节点下 */
  attachedTo: { moduleId: string; branchId?: string; detailId?: string };
  question: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  /** 用户作答记录 */
  userAnswerIndex?: number;
  answeredAt?: number;
}

export interface LayeredReadingState {
  /** 本模式独立 module 列表，与 studyMap 无关 */
  modules: LayeredReadingModule[];
  /** 用户上次浏览到的位置（学习状态记忆 (g)） */
  lastVisited?: { moduleId: string; round: 1 | 2 | 3; branchId?: string };
  /** 题目作答记录 */
  questions: LayeredReadingQuestion[];
  /** 进度统计快照（避免每次都从 modules 计算） */
  progressSnapshot?: {
    round1: { done: number; total: number };
    round2: { done: number; total: number };
    round3: { done: number; total: number };
  };
  /** 创建时间 */
  createdAt: number;
}

// FilePersistedState 增加
layeredReadingState?: LayeredReadingState;

// CloudSession 同步增加同名字段
```

---

## 3. 分阶段实施计划

### 总览

| 阶段 | 范围 | 是否调 AI | 验收要点 | 状态 |
|---|---|---|---|---|
| 阶段 1 | viewMode 状态机扩展 + 入口按钮 + 空壳 panel + 持久化结构 | ❌ | 三态切换通过；空壳显示 | ✅ 已完成（commit `767dff3`）|
| 阶段 2 | Round 1 module 列表生成 + 大白话故事 | ✅ | 能生成 module、能展开看 Round 1 内容 | ✅ 已完成（待用户提供 commit hash）|
| **阶段 3（范围扩展）** | Round 2/3 + 树状 UI + 进度条 + 主动推进 + **溯源 + 提问** | ✅ | 完整画面终审场景 + 溯源准确性 + chat 跨 module 上下文连贯 | ⏳ 待开工（5-7h）|
| 阶段 4 | 分层题目 + 学习状态记忆 + CHANGELOG / 边界文档更新 | ✅ | 题目能答、关页面再进能续上 | ⏳ 待开工 |

---

### 阶段 1：viewMode 三态扩展 + 空壳

**目标**：让"递进阅读"按钮能显示、能点、能切换到一个空白的递进阅读 panel；不调任何 AI；不做任何 module 生成；持久化结构定义好但暂时为空。

#### 1.1 修改 `types.ts`

- 扩展 `ViewMode`：`'deep' | 'skim' | 'layered'`
- 新增 `LayeredReadingModule` / `LayeredReadingRound2Branch` / `LayeredReadingRound3Detail` / `LayeredReadingQuestion` / `LayeredReadingState` 接口（按 §2.3 骨架）
- `FilePersistedState` 增加 `layeredReadingState?: LayeredReadingState;`
- `CloudSession` 同步增加同名字段

#### 1.2 修改 `App.tsx`

- 把现有 `onToggleViewMode` 拆成 `onToggleSkim` / `onToggleLayered` 两个回调
  - `onToggleSkim()`：viewMode === 'skim' ? setViewMode('deep') : setViewMode('skim')
  - `onToggleLayered()`：viewMode === 'layered' ? setViewMode('deep') : setViewMode('layered')
  - **重要**：从 'skim' 直接切 'layered' 也走 onToggleLayered（不必先回 deep）
- 在 viewMode === 'skim' 渲染分支下方平行加 viewMode === 'layered' 分支，渲染 `<LayeredReadingPanel />` 空壳
- `layeredReadingState` 状态变量 + 持久化恢复 + 云同步逻辑（参考 `studyMap` 现状的处理方式）

#### 1.3 修改 `shared/layout/Header.tsx`

- 找到现有"略读"切换按钮（在 Mode Toggle Button 区块）
- **挨在右侧**新增"递进阅读"按钮：
  - **不依赖 `hasStudyMap`**——只要文档加载完就显示
  - 样式与略读按钮一致但配色独立（建议绿色或橙色系，与略读 indigo 区分）
  - 标题文案：viewMode === 'layered' ? '返回精读' : '进入递进阅读'
  - onClick = onToggleLayered
- props 添加：`onToggleLayered: () => void`

#### 1.4 新建 `features/reader/layered/LayeredReadingPanel.tsx`

- 暂时只是空壳：
  ```tsx
  export const LayeredReadingPanel: React.FC<Props> = (props) => {
    return (
      <div className="h-full flex flex-col items-center justify-center text-stone-400">
        <h2 className="text-base font-bold">递进阅读模式</h2>
        <p className="text-xs mt-2">阶段 2 实施后会显示 Round 1 故事树</p>
      </div>
    );
  };
  ```
- props 接口先定义骨架，包含：fullText / pdfDataUrl / fileName / layeredReadingState / setLayeredReadingState 等（实际实施可微调）

#### 1.5 阶段 1 不做的事

- ❌ 不调 AI、不生成 module、不写 prompt
- ❌ 不做树状 UI、不做进度条、不做题目
- ❌ 不更新 `docs/SKIM_VS_EXAM_TUTOR_API.md`（还没有 chatWithLayeredReadingTutor）
- ❌ 不更新 CHANGELOG（功能未上线）

#### 1.6 阶段 1 commit message

```
feat(layered-reading): viewMode 三态扩展 + 入口按钮 + 空壳 panel

- types.ts: ViewMode 加 'layered'，新增 LayeredReadingState 等接口
- App.tsx: onToggleViewMode 拆成 onToggleSkim/onToggleLayered；viewMode 三态切换
- Header.tsx: 略读按钮旁加"递进阅读"独立按钮，不依赖 hasStudyMap
- 新建 features/reader/layered/LayeredReadingPanel.tsx（空壳）
- layeredReadingState 持久化结构就位，待阶段 2 填充
- 阶段 1/4 of 递进阅读模式
```

---

### 阶段 2：Round 1 大白话故事线（最小可用）

**目标**：用户进入递进阅读 → 调 AI 生成本模式独立 module 列表 → 显示 Round 1 大白话故事树 → 用户点 module 可展开看内容；只做 Round 1，不做 Round 2/3，不做树状 UI、不做题目。

#### 2.1 新建 `lib/prompts/layeredReadingPrompts.ts`

- 新建文件（**不在** `systemPrompts.ts` 里追加，避免污染现有 STEM/HUMANITIES）
- 导出：
  - `LAYERED_READING_SYSTEM_PROMPT`（递进阅读对话主 prompt，统一一套不分学科）
  - `LAYERED_MODULE_GEN_PROMPT`（生成 module 列表的 prompt）
  - `LAYERED_ROUND1_PROMPT`（Round 1 大白话故事 prompt）
- **绝对不能**包含"必须沿用学习地图"这条全局约束（铁律 5）
- prompt 里钉死："module 数量在 2-7 之间；用户传入指定数量时严格遵守；标题用大白话不堆术语"

#### 2.2 修改 `services/geminiService.ts`

- 新建 `chatWithLayeredReadingTutor` 导出函数
  - 不复用 `chatWithAdaptiveTutor` / `chatWithSkimAdaptiveTutor` 任何代码逻辑
  - systemInstruction 用 LAYERED_READING_SYSTEM_PROMPT
  - 不接收 scaffolding / KC / chunk / citations 任何附录参数
  - reading 模式 user 消息追加可参考 `appendReadingModeUserMessageSuffix` 的模式但**独立写一个新的**，不共享
- 新建 `generateLayeredReadingModules(fullText, options: { moduleCount: number })` 函数
  - 输入：PDF 全文（或 pdfDataUrl）、用户指定的 module 数（2-7）
  - 输出：`LayeredReadingModule[]`（只填 `id` / `index` / `storyTitle` / `pageRange`，其他字段留空）
  - 使用 `responseSchema` 约束 JSON 结构
- 新建 `generateLayeredRound1Content(fullText, module: LayeredReadingModule)` 函数
  - 为指定 module 生成 Round 1 大白话故事内容
  - 输出：纯文本或 markdown 字符串

#### 2.3 修改 `LayeredReadingPanel.tsx`

- 替换空壳：
  - 进入 panel 时检查 `layeredReadingState`，如果不存在或 `modules.length === 0` → 显示"开始递进阅读"按钮
  - 用户点按钮 → 弹出"选择 module 数量"对话框（2-7，默认 4）
  - 选完后调 `generateLayeredReadingModules` → 把结果存入 `layeredReadingState.modules`
  - 显示 module 列表：每行一个 module 标题（先简单列表，不做树状 UI）
  - 点 module → 如果 round1Content 为空，调 `generateLayeredRound1Content` 填充 → 展开显示
- 状态管理走 props 链路（`layeredReadingState` / `setLayeredReadingState` 由 App.tsx 注入）

#### 2.4 验收要点

- 第一次进入递进阅读 → 看到"开始递进阅读"+ module 数选择
- 选 4 → AI 返回 4 个 module 标题
- 点 module 1 → 看到 Round 1 大白话内容
- 关页面再开 → 状态恢复，不重复调 AI
- **关键回归测试**：在 SkimPanel 改 module 数 → LayeredReadingPanel 的 module 数不变；反之亦然（**互不影响**）

#### 2.5 阶段 2 commit message

```
feat(layered-reading): Round 1 大白话故事线 + 独立 prompt

- lib/prompts/layeredReadingPrompts.ts: 新建独立 prompt（不继承现有 STEM/HUMANITIES）
- services/geminiService.ts: 新建 chatWithLayeredReadingTutor / generateLayeredReadingModules / generateLayeredRound1Content
- LayeredReadingPanel: module 选数 → AI 生成 → 展开 Round 1
- module 数据完全独立于 studyMap，验证互不影响
- 阶段 2/4 of 递进阅读模式
```

---

### 阶段 3：Round 2/3 + 树状 UI + 进度条 + 主动推进 + 溯源 + 提问

**⚠️ 范围扩展提示**：本阶段在阶段 2 完成后扩展了范围（详见 INQUIRY §5.5）。包含原 4 项 + 溯源 + 提问 = 6 项，预估工程量 5-7 小时。

**目标**：完整画面终审场景跑通——树状结构可视化、三轮 zoom in、用户主动点按钮推进、顶部进度条、Round 2/3 内容含溯源、每 module 提问。

#### 3.1 类型定义扩展（先做这步）

修改 `types.ts`：

- `LayeredReadingRound3Detail` 加溯源字段：`sourcePage: number` + `sourceLocation: string`（铁律 6）
- `LayeredReadingRound2Branch` 加溯源字段：`sourcePage?: number` + `sourceLocation?: string`（铁律 6）
- 新增 `LayeredReadingChatMessage` 类型：包含 `id` / `role` / `content` / `askedInModuleId` / `timestamp`（铁律 7 关键字段）
- `LayeredReadingState` 加 `globalChatHistory: LayeredReadingChatMessage[]`（铁律 7）

#### 3.2 树状 UI 实现

- 新建 `features/reader/layered/LayeredReadingTree.tsx`（如果太大可继续拆）
- 树节点结构：
  - module 节点（Round 1）→ 展开后里面有 Round 1 内容 + "展开到 Round 2" 按钮 + "💬 提问" 按钮
  - 点 "展开到 Round 2" → 调 AI 生成 round2Branches → module 节点下长出子枝干
  - 子枝干节点（Round 2）→ 展开后里面有 Round 2 内容 + 溯源标签 + "展开到 Round 3" 按钮
  - 点 "展开到 Round 3" → 调 AI 生成 round3Details → 子枝干下长出细节列表（每个细节带溯源标签）
- 折叠展开行为：
  - 默认每个新生成的层级**自动展开** + 滚动到位置
  - 用户可手动收起
  - 已答题的节点用打勾标记
  - chat 框默认折叠

#### 3.3 顶部进度条

- 三条独立进度（Round 1 X/N · Round 2 Y/N · Round 3 Z/N）
- 数据源：`layeredReadingState.progressSnapshot`
- 每次 Round X 节点状态变化时更新 snapshot
- 不要 toast、不要动画——只是静态显示（按你跟现有 atom coverage 一致的"温和反馈"风格）

#### 3.4 新增 AI 调用 + Prompt 改造（含溯源指令）

修改 `lib/prompts/layeredReadingPrompts.ts`，新增：

- **`buildLayeredRound2Prompt(module)`**：生成 Round 2 子枝干列表 + 内容 + **溯源信息**（铁律 6）
  - prompt 里明文要求：每个子枝干必须含 `sourcePage`（来自 PDF 真实页码，**不许编造**）+ `sourceLocation`（"右上方"、"流程图下方"等位置描述）
  - JSON Schema 强约束 sourcePage 是数字、sourceLocation 是字符串
  - 给 1-2 个示例：good vs bad（"page: 23, location: '关于细胞膜的图示下方'" vs "page: 999, location: '某处'"）
  
- **`buildLayeredRound3Prompt(branch)`**：为某个子枝干生成 Round 3 细节 + **溯源信息**（铁律 6）
  - 同上，每个细节含 sourcePage + sourceLocation
  - 严格禁令："如果该 PDF 没有相关内容，宁可少给细节也不要编造页码"

修改 `services/geminiService.ts`，新增：

- `generateLayeredRound2Branches(fullText, module)`：为某个 module 生成 Round 2 子枝干列表 + 内容 + 溯源
- `generateLayeredRound3Details(fullText, branch)`：为某个子枝干生成 Round 3 细节挂载 + 溯源

#### 3.5 用户主动推进按钮（原 3.4，编号顺延）

- "展开到 Round 2" 按钮放在 module 节点 Round 1 内容末尾
- "展开到 Round 3" 按钮放在子枝干 Round 2 内容末尾
- AI 回复中**不允许**出现"接下来我给你讲 Round X"这类自动推进语——铁律 7（原编号铁律 7，对应阶段 2 已落地的"AI 不自动推进"——注意：阶段 2 后铁律体系扩展为 7 条，原"AI 不自动推进"是其中第 7 条之前的版本，新铁律 7 是"chat 视觉独立数据全局"——上下文按 INQUIRY §5 最新版本理解）
- prompt 里明文禁止 AI 提议推进

#### 3.6 溯源跳转 PDF（铁律 6 落地）

新建 `features/reader/layered/RoundContentWithSource.tsx`：

- 输入：Round 2/3 内容 + sourcePage + sourceLocation
- 渲染：内容文本 + 末尾 "📎 第 X 页 · {sourceLocation}" 标签
- 标签可点击：触发 `props.onJumpToPage(sourcePage)` 回调
- App.tsx 在 LayeredReadingPanel 渲染时传入 `onJumpToPage`，回调内容是滚动 PDF iframe 到指定页（**复用现有 PDF 跳转逻辑**——RECON 阶段确认 SkimPanel 已经有类似机制可参考，但**不要复用代码**，独立实现）

#### 3.7 每 module chat 框（铁律 7 落地）

新建 `features/reader/layered/ModuleChatBox.tsx`：

**视觉行为**：
- 每个 module 节点下面默认折叠的 "💬 提问" 按钮
- 点开后展开 chat 框：输入框 + 历史消息列表
- 历史消息列表**只显示** `globalChatHistory.filter(m => m.askedInModuleId === currentModuleId)` 
- 切到其他 module → 这个 module 的 chat 框只显示该 module 的 Q&A

**数据行为**：
- 用户发送消息 → 加到 `globalChatHistory`，标记 `askedInModuleId: currentModuleId`
- 调 `chatWithLayeredReadingTutor(docContent, fullGlobalChatHistory, newMessage)`：
  - **关键**：发给 AI 的是**完整 globalChatHistory**（不过滤 askedInModuleId）
  - AI 看到所有 module 的对话历史，跨 module 上下文连贯
- AI 回复 → 加到 globalChatHistory，标 `askedInModuleId: currentModuleId`

**System prompt 增强**：
- `LAYERED_READING_SYSTEM_PROMPT` 增加一段说明："对话历史中每条消息的 `askedInModuleId` 标记了用户当时在看哪个 module。请在回答时考虑这个上下文——用户可能跨 module 问问题，你应该记得之前的对话。"

#### 3.8 验收要点

- 完整画面终审场景：见 INQUIRY §5"目标体验画面"
- 关闭页面 → 重开 → 树状态 + 已展开节点 + 进度条 + globalChatHistory 全部恢复
- AI 不自动推进——用户不点按钮，AI 不会自己讲 Round 2 内容
- **溯源准确性验证**（必跑）：抽样 3 个 Round 2/3 节点 → 跳转到对应页 → 核对页码和位置描述真实
- **chat 上下文连贯性验证**（必跑）：
  - 在 module 1 chat 框问"什么是 Top Hat？"→ AI 回答
  - 切到 module 2 chat 框 → 视觉上**看不到** module 1 的对话
  - 在 module 2 chat 框问"这跟 Top Hat 有关系吗？"→ AI **应该记得** module 1 问过 Top Hat
- **chat 持久化**：关页面再开 → globalChatHistory 完整恢复，每 module chat 框正确显示自己的历史

#### 3.9 阶段 3 commit message

```
feat(layered-reading): 树状 UI + Round 2/3 + 溯源 + 提问 + 进度条

- 新建 LayeredReadingTree 组件，三轮共用同一棵树 zoom in
- 顶部三条独立进度条（Round 1/2/3 各自 N/M）
- generateLayeredRound2Branches / generateLayeredRound3Details (含溯源)
- buildLayeredRound2Prompt / buildLayeredRound3Prompt (强制溯源 + 禁编造页码)
- 新建 RoundContentWithSource 组件,溯源页码可点击跳转 PDF
- 新建 ModuleChatBox 组件,视觉独立 + 数据全局共享 (globalChatHistory)
- LayeredReadingChatMessage 加 askedInModuleId 字段
- 用户必须点"展开到 Round X"按钮才推进;AI 不自动跑
- 铁律 6 (溯源不取代 slides) + 铁律 7 (视觉独立数据全局) 全部落地
- 阶段 3/4 of 递进阅读模式
```

---

### 阶段 4：分层题目 + 学习状态记忆 + 边界文档更新

**目标**：题目能答、上次看到哪里能续上、CHANGELOG 和 API 边界文档更新。

#### 4.1 分层题目

- Round 1 末尾：故事题（lecture 整体流程理解）
- Round 2 末尾：结构题（module 内部逻辑递进）
- Round 3 末尾：细节应用题（术语 / 实验 / 应用）
- 题目数据：`LayeredReadingQuestion`，按 attachedTo 挂在树节点上
- 新增 AI 调用：`generateLayeredRoundQuestion(fullText, context, roundLevel)`
- 题目作答 UI 复用现有 SkimPanel 单题样式（参考但不复用代码）

#### 4.2 学习状态记忆

- 每次用户切换树节点 / 答题 → 更新 `layeredReadingState.lastVisited`
- 重新进入 panel 时 → 顶部显示 banner："上次你看到 [module 标题] 的 Round X，要继续吗？" + "继续" / "重新开始" 按钮

#### 4.3 边界文档更新

- 修改 `docs/SKIM_VS_EXAM_TUTOR_API.md`：
  - 引用校验表加一行：
    ```
    | `chatWithLayeredReadingTutor` | `services/geminiService.ts`、`features/reader/layered/LayeredReadingPanel.tsx` |
    ```
  - "不应"段落加一行：
    ```
    **不应**：`LayeredReadingPanel.tsx` 出现 `chatWithSkimAdaptiveTutor` 或 `chatWithAdaptiveTutor`。
    ```
  - 职责划分表加一行：
    ```
    | `chatWithLayeredReadingTutor` | 仅递进阅读（`LayeredReadingPanel`） | `LAYERED_READING_SYSTEM_PROMPT`，无任何附录 |
    ```

- 修改 `CHANGELOG.md`：在 Unreleased 段加：
  ```
  ### 🌳 递进阅读模式（新增第三种阅读模式）

  - **入口**：Header 略读按钮旁新增"递进阅读"按钮，不依赖 studyMap
  - **三轮递进**：Round 1 大白话故事线 → Round 2 结构展开 → Round 3 细节挂载
  - **树状 UI**：三轮共用同一棵树 zoom in，用户主动点按钮推进
  - **数据独立**：与略读模式 module 完全独立（独立的 layeredReadingState）
  - **API 隔离**：新建 chatWithLayeredReadingTutor，不复用现有 tutor
  ```

#### 4.4 阶段 4 commit message

```
feat(layered-reading): 分层题目 + 学习状态记忆 + 边界文档

- generateLayeredRoundQuestion: 故事题/结构题/细节题
- 学习状态记忆 banner（lastVisited 持久化）
- 更新 docs/SKIM_VS_EXAM_TUTOR_API.md（API 边界守卫）
- 更新 CHANGELOG.md
- 阶段 4/4 of 递进阅读模式（功能完整）
```

---

## 4. 守卫规则汇总（实施时反复检查）

| 规则 | 来源 | 违反后果 |
|---|---|---|
| LayeredReadingPanel.tsx 不出现 `chatWithSkimAdaptiveTutor` 或 `chatWithAdaptiveTutor` | 铁律 1 | 破坏 API 分离 |
| LayeredReadingPanel.tsx / 相关代码不读 `FilePersistedState.studyMap` | 铁律 2 | 数据共享 = 概念分裂的反面 |
| 新 prompt 不引用"学习地图"或"必须沿用"等术语 | 铁律 5 | 隐式继承全局约束 |
| **Round 2/3 内容必须含 sourcePage（非空、真实页码）+ sourceLocation（非空、有意义描述）** | 铁律 6 | 违反"AI 不取代原始 slides"哲学 |
| **AI prompt 明文禁止编造页码——"如果 PDF 没有相关内容，宁可少给细节"** | 铁律 6 | 错误溯源比无溯源更糟 |
| **每 module chat 框只渲染 `globalChatHistory.filter(m => m.askedInModuleId === currentModuleId)`** | 铁律 7 | 违反"视觉简洁"用户拍板 |
| **`chatWithLayeredReadingTutor` 调用时 history 参数必须是完整 globalChatHistory（不过滤）** | 铁律 7 | AI 跨 module 失忆，违反用户拍板 |
| **`globalChatHistory` 持久化到 `FilePersistedState.layeredReadingState`** | 铁律 7 | 关页面对话历史丢失 |
| **每条 LayeredReadingChatMessage 必须有 askedInModuleId 字段** | 铁律 7 | 视觉过滤无法工作 |
| 不修改 `STEM_SYSTEM_PROMPT` / `HUMANITIES_SYSTEM_PROMPT` 内容 | 铁律 8 | 污染略读模式 |
| 不修改 `SkimPanel.tsx` | 铁律 8 | 破坏现有略读 |
| 不修改 `chatWithSkimAdaptiveTutor` / `chatWithAdaptiveTutor` | 铁律 8 | 污染既有 API |
| 递进阅读按钮显示条件不抄 `hasStudyMap` | INQUIRY 风险/RECON | 破坏"独立路径"画面 |
| AI prompt 明文禁止"接下来我给你讲 Round X"自动推进语 | 铁律 9 | 破坏"用户主动推进"画面 |
| 不做 page-level coverage map / A-D 风险标签 / 自动补洞 | 铁律 3 | scope creep |
| 不做 STEM/HUMANITIES 分流的递进阅读 prompt | 铁律 5 | 违反"轻盈起步" |
| 不做 diagnosis/tutoring/quiz 三阶段前置门控 | 铁律 4 | 违反"轻盈直入" |
| 不做右侧 panel 详情区 | 用户否决 (f) | 违反终审画面 |
| 不动备考工作台 / KC / atom coverage / BKT | 铁律 8 | 越界 |

---

## 5. 基础冒烟测试清单（每阶段必跑）

每个阶段 commit 前，跑一遍这个清单：

1. ✅ 项目编译无 TypeScript 错误
2. ✅ dev 服务器启动无报错
3. ✅ 5 分钟启动流走完
4. ✅ 精读模式正常（默认状态）
5. ✅ 略读模式正常（点略读按钮、再点回精读）
6. ✅ **递进阅读按钮显示**（不依赖 hasStudyMap）
7. ✅ **三态切换**：精读 ↔ 略读、精读 ↔ 递进、**略读 ↔ 递进直切**
8. ✅ 备考工作台无回归
9. ✅ Notebook、复习九宫格、考试中心、海龟汤、AI 能量站均无损坏

阶段 2/3/4 额外测试：

- ✅ 在 SkimPanel 改 module 数 → 递进阅读 module 数不变
- ✅ 在递进阅读改 module 数 → SkimPanel studyMap 不变
- ✅ 关页面再开 → 递进阅读状态完整恢复
- ✅ AI 回复中无"接下来我给你讲 Round X"自动推进语

---

## 6. 回退预案

### 单步回退

每个阶段独立 commit。任何阶段出问题：
```bash
git revert HEAD       # 回退最近一个 commit
git push              # 推回退到远程
```

### 部分回退

| 触发症状 | 回退方案 |
|---|---|
| 阶段 1 后发现 viewMode 三态切换有问题 | revert 阶段 1（用户没看到任何新功能，干净） |
| 阶段 2 后发现 AI 生成 module 不稳定 | 保留阶段 1 空壳，revert 阶段 2 的 AI 调用部分 |
| 阶段 3 后发现树状 UI 体验差 | 保留 Round 1 单层列表（阶段 2 状态），revert 阶段 3 |
| 阶段 4 后发现题目质量差 | revert 阶段 4 题目相关部分，保留阶段 3 |

### 全功能回退

如果四阶段全做完后发现"递进阅读体验不佳"：

**方案 A（最快）**：隐藏入口
- Header.tsx 注释掉"递进阅读"按钮渲染
- 用户看不到入口，但代码保留可后续修复
- 1 行注释即可回退

**方案 B（彻底）**：四阶段全 revert
- `git revert <commit-4> <commit-3> <commit-2> <commit-1>` 按倒序
- 回到改造前状态
- INQUIRY / PLAN 文档保留作为研究素材

### 触发回退的指标

满足以下任一条件，认真考虑回退：
- AI 生成 module 跑偏率超过 30%（手工抽样）
- 用户被迫等待 module 生成超过 30 秒
- 现有略读、精读、备考工作台出现任何回归
- 编译错误无法 5 分钟内定位

---

## 7. 给 Claude Code 的执行指令模板

把下面这段贴给 Claude Code，让它从阶段 1 开始：

```
请按 docs/inquiries/LAYERED_READING_PLAN.md 实施"递进阅读模式"功能。

要求：
1. 严格遵守 §1 七条铁律和 §2 全局技术约束
2. 严格按 §3 四个阶段顺序执行，每阶段一个独立 commit
3. 每阶段 commit 前必须通过 §5 基础冒烟测试清单
4. 阶段间停下来等我确认测试通过，再开始下一阶段
5. 任何不确定时停下来问，不要自作主张

特别注意（重要）：
- 铁律 2（module 数据完全独立）：递进阅读绝对不读、不写 FilePersistedState.studyMap
- 铁律 6（不动现有代码）：SkimPanel.tsx / chatWithSkimAdaptiveTutor / STEM 和 HUMANITIES prompt 内容完全不动
- 铁律 7（不自动推进）：AI prompt 明文禁止"接下来我给你讲 Round X"自动推进语

现在开始阶段 1。开始前请先：
- 阅读 docs/inquiries/LAYERED_READING_INQUIRY.md（了解为什么这样做，特别是 §8.G 关于"概念相同 ≠ 数据共享"的元反思）
- 列出阶段 1 你计划修改的所有文件和具体行号，先给我看，等我确认后再实际改动

完成阶段 1 后停下来等我测试，**不要自动开始阶段 2**。
```

**重要**：让 Claude Code 在每阶段开始前**列计划，等你确认**再动手。这样你能在每一刀切下去之前看一眼。

---

## 8. 阶段间用户介入清单

### 阶段 1 完成后

- 测试 viewMode 三态切换（包括 skim ↔ layered 直切）
- 测试递进阅读按钮在没有 studyMap 的文档上也显示
- 检查 git diff 确认未改 SkimPanel / 现有 AI / 现有 prompt 内容
- 确认空壳 panel 显示正常

### 阶段 2 完成后

- 测试 module 选数 → AI 生成 → 展开 Round 1
- **关键回归**：手工验证 SkimPanel 改 module 数和递进阅读 module 数互不影响
- 关页面再开测试持久化
- 抽样观察 AI 生成的 module 标题是否"大白话"（不堆术语）

### 阶段 3 完成后

- 完整跑一遍 INQUIRY §5 目标体验画面
- 重点测试 Round 1 → Round 2 → Round 3 三层 zoom in 视觉感
- 重点测试用户不点按钮 AI 不自动推进
- 确认进度条样式不打扰（无 toast / 无动画）

### 阶段 4 完成后

- 测试三轮各自题目能答、能持久化
- 测试 lastVisited banner 能正常出现并跳转
- 完整跑一遍 §5 冒烟测试
- 确认 docs/SKIM_VS_EXAM_TUTOR_API.md 和 CHANGELOG.md 已更新
- 决定是否触发 §6 回退预案

---

## 9. 已知风险与缓解（PLAN 阶段补充 INQUIRY §6）

### 9.1 树状数据结构与 React 渲染性能

如果 7 个 module × 平均 3 个 Round 2 子枝干 × 平均 6 个 Round 3 细节 = ~126 个节点，加题目可能 200+ 节点。

**缓解**：
- Round 2 / Round 3 默认折叠（用户点开才渲染内容）
- 树节点用 React.memo 包裹，按 id 比对
- 大量节点时虚拟滚动可作为阶段 4 后的优化（当前 PLAN 不强求）

### 9.2 AI 生成质量不稳定

module 拆分跑偏、Round 1 不够大白话、Round 3 细节归类错乱——都可能发生。

**缓解**：
- prompt 明文给出 1-2 个示例输出（few-shot）
- 用户可以"重新生成本 module"——按 module 单独重生而不是全部重来
- module 数选择阶段提供 2-7 范围，给用户挑战机会

### 9.3 阶段 4 学科分流回流压力

砍掉学科分流是哲学决策，但如果上线后理科 PDF 故事感差很大，用户可能要求加分流。

**缓解**：
- 不在本 PLAN 内做，等用户上线后看 6 周数据再说
- 如果真要加，作为独立 PLAN 起草，遵循 INQUIRY 流程

---

## 10. 文档归位

实施前：
- `LAYERED_READING_INQUIRY.md` 放到 `docs/inquiries/`（已交付）
- `LAYERED_READING_PLAN.md` 放到 `docs/inquiries/`（本文档）

实施完成后：
- 在 `CONTEXT.md` 的"重要参考文档"表格加两行：
  ```
  | LAYERED_READING_INQUIRY.md | 递进阅读模式诊断 |
  | LAYERED_READING_PLAN.md    | 递进阅读模式实施 |
  ```

---

*PLAN 完成于 INQUIRY 修订之后、Claude Code 实施之前。等你画面终审通过后开工。*

*第二次修订（阶段 2 commit 完成后）：阶段 3 范围扩展。*
*- 加入溯源（铁律 6）：Round 2/3 内容含 sourcePage + sourceLocation，可点击跳转 PDF*
*- 加入提问（铁律 7）：每 module chat 框视觉独立，数据 globalChatHistory 全局共享*
*- 铁律体系从 7 条扩展到 9 条（INQUIRY §5 七条 + PLAN §1 实施层 8/9 两条）*
*- 阶段 3 工程量从 1.5-2.5h 调整到 5-7h（用户接受工程量翻倍以换产品完整度）*
*- 阶段 3 内部分子步骤 3.1-3.9*
*- 守卫规则汇总扩展到 16 条*
*- 用户主动选择"阶段 3 一次做完"而非拆分（INQUIRY §5.5 节奏决策）*
