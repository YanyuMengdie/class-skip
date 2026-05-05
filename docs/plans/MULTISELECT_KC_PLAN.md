# 多选 KC 对话功能 — 实施计划（PLAN.md）

> **文档性质**：给 Claude Code 干活用的实施指令。
> **配套文档**：`docs/inquiries/MULTISELECT_KC_INQUIRY.md`（为什么这样做）+ `docs/inquiries/EXAMPREP_RECON.md`（代码事实依据）
> **使用方式**：把本文档完整内容贴给 Claude Code，它会按 §3 三个阶段顺序执行。

---

## 1. 三条铁律（用户产品哲学，不可违背）

实施过程中如果出现任何冲突，**这三条优先级高于一切**：

1. **对话机制不动** —— 仍用 `chatWithAdaptiveTutor`（教学型对话），AI 是辅导员不是考官。**不引入"答对/答错"判断到对话路径**。
2. **BKT 不动** —— 不接通到对话模式，不改更新条件，不动 `WorkspaceKcProbeModal`（结业探测模式 C）。
3. **唯一变化：atom coverage 的分发更新逻辑** —— 从单 KC 扩展到多 KC。

---

## 2. 全局技术约束

实施过程中必须遵守：

### 约束 A：单 KC 路径完全不动

- 现有函数 `analyzeKcUtteranceForAtoms`、`mergeCoverageForKc` 的**签名和实现都不改**
- 现有 state 字段 `selectedKcId` **保留**（用于单 KC 路径），新增 `selectedKcIds` 与之并存
- 单 KC 模式（selectedKcIds.length === 1）的**视觉、对话、coverage 更新行为应与现状完全一致**
- 测试时必须验证：单 KC 模式行为零变化

### 约束 B：禁止字符串解析推 kcId

- atom id 格式虽然是 `atom-${kc.id}-${index}`，但**禁止**通过 split/正则等方式从 atomId 字符串解析 kcId
- 必须通过 LogicAtom 对象的 `kcId` 字段获取归属
- 理由：保持"atom 归属看 kcId 字段"的统一约定，未来 atom id 格式若调整不会破坏

### 约束 C：白名单守卫不可省略

- AI 返回的 `coveredAtomIds` 可能包含**幻觉 atom id**（不在传入 atoms 列表里的 id）
- 多选模式下白名单 = **所有选中 KC 的 atoms 合集**
- 任何不在白名单内的 atomId 必须被丢弃，不得调用更新

### 约束 D：每步独立 commit

- §3 的三个阶段每个阶段一个独立 commit
- 每个 commit 都必须能**单独通过基础冒烟测试**（见 §5）
- 任何阶段失败，能通过 `git revert` 单独回滚

### 约束 E：所有改动局限在备考工作台模块

- 不动 reader/、skim/、notebook/、flashcard/ 等其他模块
- 不动 BKT 相关代码
- 不动 firebase schema 或 localStorage 持久化结构（除非阶段 1 明确允许）

---

## 3. 三阶段实施计划

### 阶段 1：state 结构改造（数据层）

**目标**：引入 `selectedKcIds: string[]` 状态，与现有 `selectedKcId` 并存；构建 atom→kc 反查工具。

**改动清单**：

#### 1.1 `ExamWorkspacePage.tsx` 附近的 state 增补

- 现状（line 201）：`const [selectedKcId, setSelectedKcId] = useState<string | null>(null)`
- 新增：`const [selectedKcIds, setSelectedKcIds] = useState<string[]>([])`
- 派生：`const isMultiSelectMode = selectedKcIds.length >= 1`（暂时仅声明，本阶段不使用）
- **不删除** `selectedKcId`、`wholeBookMode`、`probeKc` ——这些字段保留

#### 1.2 `features/exam/lib/examWorkspaceLsapKey.ts` 添加工具函数

参考 EXAMPREP_RECON.md 第三次侦察问题 4 给出的位置建议。新增工具函数：

```typescript
/**
 * 从 atomId 反查 kcId。基于 LogicAtom.kcId 字段，禁止字符串解析。
 * @param atomId 待反查的 atom id
 * @param contentMap workspaceLsapContentMap（KC 列表数据源）
 * @returns kcId 字符串，若 atom 不存在则返回 null
 */
export function lookupKcIdByAtomId(
  atomId: string,
  contentMap: WorkspaceLsapContentMap
): string | null {
  for (const kc of contentMap.kcs) {
    if (kc.atoms?.some(a => a.id === atomId)) {
      return kc.id;
    }
  }
  return null;
}
```

实现要点：
- 不解析 atomId 字符串
- 通过遍历 KC.atoms 查找
- 命中即返回；遍历完未命中返回 null（让调用方决定如何处理"野生 atom"）

#### 1.3 `App.tsx` 添加派生 memo（可选，本阶段先不强制）

如果阶段 3 性能测试发现遍历开销不可接受，再回来加：
```typescript
const atomIdToKcIdMap = useMemo(() => {
  const map: Record<string, string> = {};
  workspaceLsapContentMap?.kcs?.forEach(kc => {
    kc.atoms?.forEach(atom => { map[atom.id] = kc.id; });
  });
  return map;
}, [workspaceLsapContentMap]);
```
**本阶段先不加**——30 KC × 5 atom 的遍历成本是 microsecond 级，YAGNI。

#### 1.4 测试要求

阶段 1 commit 前必须通过：
- 编译无 TypeScript 错误
- 启动 dev 服务器无报错
- 进入备考工作台、点 KC 卡片、对话、关闭——全程行为与现状完全一致（因为 selectedKcIds 还没被任何地方读取）
- 单 KC 模式 atom coverage 更新仍然正常

#### 1.5 阶段 1 commit message

```
feat(exam): add multi-select KC state field and atom→kc lookup utility

- Add selectedKcIds state alongside existing selectedKcId
- Add lookupKcIdByAtomId utility (uses LogicAtom.kcId field, no string parsing)
- No behavior change yet; state and utility unused in this commit
- Phase 1/3 of multi-select KC feature (see docs/inquiries/MULTISELECT_KC_INQUIRY.md)
```

---

### 阶段 2：UI 交互层改造（视觉层）

**目标**：实现 toggle 多选交互、移除"全卷对话"按钮、添加"全选"按钮、0 选禁用输入框。**对话和 coverage 逻辑暂不接通——本阶段允许多选不影响对话**。

**改动清单**：

#### 2.1 KC 卡片点击逻辑（toggle）

- 现状：点 KC 卡片 → setSelectedKcId(kc.id)（单选，新选取消旧选）
- 改造：
  ```typescript
  function handleKcCardClick(kcId: string) {
    setSelectedKcIds(prev =>
      prev.includes(kcId)
        ? prev.filter(id => id !== kcId)  // 已选 → 取消
        : [...prev, kcId]                  // 未选 → 加入
    );
    // 同步维护 selectedKcId 用于单 KC 路径兼容（取最后一个选中的）
    setSelectedKcId(/* 计算逻辑见下 */);
  }
  ```
- 兼容策略：当 selectedKcIds.length === 1 时，selectedKcId 同步等于该 id（让现有单 KC 路径继续工作）；length === 0 或 >= 2 时，selectedKcId 设为 null

#### 2.2 视觉状态

- 已选中状态：复用现有"激活态"样式（不需要新设计）
- 多选时多个 KC 卡片**同时呈现激活态**——这是关键视觉变化
- 不引入"次级激活态"或"最近选中"等额外视觉

#### 2.3 移除"全卷对话"按钮

- 删除现有"全卷对话"勾选框/按钮
- 删除 `wholeBookMode` state（**注意**：要确认没有任何其他模块依赖此字段，先 grep 整个 features/exam/ 范围确认零引用再删）
- 删除 `wholeBookMode` 相关的 prompt 拼接分支（如果有）

#### 2.4 新增"全选"按钮

- 位置：原"全卷对话"按钮的位置
- 行为：`setSelectedKcIds(workspaceLsapContentMap.kcs.map(k => k.id))`
- 视觉：与现有按钮风格一致（不要新设计）
- 标签文案：「全选」

#### 2.5 0 选状态

- 当 `selectedKcIds.length === 0`：
   - 输入框 `disabled={true}`
   - placeholder 改为「请先选择 KC」
   - 发送按钮也禁用
- 当 `selectedKcIds.length >= 1`：恢复正常状态

#### 2.6 阶段 2 暂不改的部分

**重要**：本阶段对话仍然只考虑 `selectedKcId`（即多选时只用最后一个 KC 跑对话）。这是中间态，下阶段会改。**测试时这一行为是预期的**，不算 bug。

#### 2.7 测试要求

- 编译无错
- KC 卡片可以多选 / 取消选中
- 0 选时输入框禁用
- "全选"按钮工作
- 单选 1 个 KC 时对话和 coverage 行为与现状一致
- 多选 N 个 KC 时对话仍只覆盖 selectedKcId（中间态，预期行为）
- 现有单 KC 测试场景全部不退化

#### 2.8 阶段 2 commit message

```
feat(exam): replace whole-book button with multi-select KC interaction

- KC card now toggles selection (click to add, click again to remove)
- Multiple KCs can be active simultaneously
- "全卷对话" button removed; "全选" button added in same position
- Input disabled with placeholder when 0 KCs selected
- Dialog/coverage logic still uses selectedKcId only (intermediate state)
- Phase 2/3 of multi-select KC feature
```

---

### 阶段 3：对话调用与 atom 分发（逻辑层）

**目标**：让多选状态真正影响对话 prompt 和 atom coverage 更新。**新增多选版本函数，不改原单选函数**。

**改动清单**：

#### 3.1 新增 prompt 拼接多选版本

定位：`buildKCScopedTutorAppendix` 所在位置（参见 EXAMPREP_RECON.md）。

新增函数 `buildMultiKCScopedTutorAppendix(kcs: KnowledgeComponent[]) → string`：
- 输入是 KC 数组（不是单个 KC）
- 输出是给 AI 的 appendix 文本，明确告知"本场锚定考点是这几个 KC"
- 文本结构示例：
  ```
  ## 本场锚定考点（共 N 个）
  
  ### KC 1：[label]
  [description]
  
  - [atom 1 label]: [atom 1 desc]
  - [atom 2 label]: [atom 2 desc]
  ...
  
  ### KC 2：[label]
  ...
  ```
- 单 KC 时（数组长度 1）的输出应与原 `buildKCScopedTutorAppendix(kc)` 输出**等价**（可以略有格式差异，但语义等价，AI 应表现一致）

#### 3.2 新增 atom 分析多选版本

定位：`analyzeKcUtteranceForAtoms` 所在文件。

新增函数 `analyzeMultiKcUtteranceForAtoms(kcs: KnowledgeComponent[], ...其他参数) → Promise<...>`：
- 内部仍调用同一个 AI 接口，仅 prompt 改用多 KC 版本
- 返回结构与原函数一致（`{coveredAtomIds, gapAtomIds}`）
- **不修改** `analyzeKcUtteranceForAtoms` 原函数

#### 3.3 新增 coverage 更新多选版本

定位：`Socratic.ts:94` 附近。

新增函数 `mergeCoverageForKcs(coveredAtomIds: string[], selectedKcs: KnowledgeComponent[], contentMap: WorkspaceLsapContentMap) → AtomCoverageByKc`：

实现步骤：
1. 构造白名单：`allowedAtomIds = new Set(selectedKcs.flatMap(kc => kc.atoms?.map(a => a.id) ?? []))`
2. 过滤 coveredAtomIds：`validAtomIds = coveredAtomIds.filter(id => allowedAtomIds.has(id))`
3. 按 kcId 分组：用 `lookupKcIdByAtomId`（阶段 1 新增的工具函数）
4. 对每个分组调用一次原 `mergeCoverageForKc`
5. **不修改** `mergeCoverageForKc` 原函数

伪代码：
```typescript
export function mergeCoverageForKcs(
  coveredAtomIds: string[],
  selectedKcs: KnowledgeComponent[],
  contentMap: WorkspaceLsapContentMap,
  prevCoverage: AtomCoverageByKc
): AtomCoverageByKc {
  // 1. 白名单
  const allowedAtomIds = new Set(
    selectedKcs.flatMap(kc => kc.atoms?.map(a => a.id) ?? [])
  );
  
  // 2. 过滤幻觉 atom
  const validAtomIds = coveredAtomIds.filter(id => allowedAtomIds.has(id));
  
  // 3. 按 kcId 分组
  const groupedByKc: Record<string, string[]> = {};
  for (const atomId of validAtomIds) {
    const kcId = lookupKcIdByAtomId(atomId, contentMap);
    if (!kcId) continue;  // 防御性：理论上白名单已过滤掉
    if (!groupedByKc[kcId]) groupedByKc[kcId] = [];
    groupedByKc[kcId].push(atomId);
  }
  
  // 4. 对每个 KC 调用原 mergeCoverageForKc
  let updatedCoverage = prevCoverage;
  for (const [kcId, atomIds] of Object.entries(groupedByKc)) {
    updatedCoverage = mergeCoverageForKc(updatedCoverage, kcId, atomIds);
  }
  
  return updatedCoverage;
}
```

#### 3.4 接通对话路径

在 ExamWorkspaceSocraticChat 提交对话的位置：
- 判断 `selectedKcIds.length`：
   - **0**：理论上 UI 已禁用输入框，不应到达此处；防御性 throw 或直接 return
   - **1**：走原单 KC 路径（调原函数）—— **保持现有逻辑不变**
   - **>= 2**：走新多选路径（调多选版本函数）

#### 3.5 测试要求（重点）

**关键回归测试**：
- 单选 1 个 KC：行为完全等同改造前（视觉、对话、coverage 更新）
- 多选 2 个 KC，跟 AI 聊一句涉及两个 KC 的话题：
   - AI 回复正常
   - 两个 KC 卡片角标都增加（如 KC1 从 2/7 → 3/7，KC2 从 1/8 → 2/8）
   - 不涉及的 KC 不变
- 全选所有 KC：可以正常对话；预期对话可能跑题（这是已知风险）；coverage 推进正常
- 0 选：输入框禁用
- atom 错归属测试（手工验证）：观察控制台或 debug 信息，确认幻觉 atom 被白名单过滤
- BKT 完全不动：`<PredictedScoreDisplay>` 圆环数字保持不变（A/B 模式下从来不变）
- 结业探测（模式 C）功能完全正常

#### 3.6 阶段 3 commit message

```
feat(exam): wire multi-select KC to dialog and atom coverage

- Add buildMultiKCScopedTutorAppendix for N-KC prompt context
- Add analyzeMultiKcUtteranceForAtoms (multi-KC AI analysis)
- Add mergeCoverageForKcs (whitelist-guarded distribution to multiple KCs)
- Single-select path unchanged; route by selectedKcIds.length
- BKT and probe modal completely untouched
- Phase 3/3 of multi-select KC feature
```

---

## 4. 守卫规则汇总（实施时反复检查）

| 规则 | 来源 | 违反后果 |
|---|---|---|
| 不修改 `mergeCoverageForKc` 原函数 | 约束 A | 单 KC 路径回归 bug |
| 不修改 `analyzeKcUtteranceForAtoms` 原函数 | 约束 A | 单 KC 路径回归 bug |
| 不解析 atomId 字符串推 kcId | 约束 B | 未来 atomId 格式变更崩溃 |
| 多选模式必须用白名单过滤 AI 输出 | 约束 C | atom 错归属 / 幻觉 atom 污染 |
| 不动任何 BKT 相关代码 | 铁律 2 | 破坏学术正确的设计 |
| 不动 WorkspaceKcProbeModal（模式 C） | 铁律 2 | 破坏结业探测闭环 |
| 不引入"答对/答错"到对话路径 | 铁律 1 | 破坏对话教学型定位 |
| 不动 reader/skim/notebook 等其他模块 | 约束 E | 重构刚完成不能再震荡 |

---

## 5. 基础冒烟测试清单（每阶段必跑）

每个阶段 commit 前，跑一遍这个清单：

1. ✅ 项目编译无 TypeScript 错误
2. ✅ dev 服务器启动无报错
3. ✅ 5 分钟启动流走完，进入精读模式 → 略读模式 → 备考工作台
4. ✅ 备考工作台基础交互正常（KC 卡片显示、对话窗口加载）
5. ✅ 单 KC 模式：点 1 个 KC，发一句话，AI 正常回复，KC 角标可能更新
6. ✅ 结业探测：可以正常打开弹窗、答题、看到 BKT 圆环更新
7. ✅ 切回精读模式 → Notebook 正常打开
8. ✅ 海龟汤、AI 能量站等无关模块未损坏

---

## 6. 回退预案

### 单步回退

每个阶段独立 commit。任何阶段出问题：
```bash
git revert HEAD       # 回退最近一个 commit
git push              # 推回退到远程
```

### 全功能回退

如果三阶段全做完后发现"全选模式跑题严重不可用"：

**方案 A（最快）**：禁用全选按钮
- 在 ExamWorkspacePage.tsx 注释掉"全选"按钮渲染
- 用户依然可以多选 1-N 个 KC，只是不能一键全选
- 1 行注释即可回退，不需 git revert

**方案 B（折中）**：恢复全卷按钮 + 多选并存
- 把"全选"按钮改回"全卷对话"
- wholeBookMode 走原 chatWithAdaptiveTutor（不走 atom coverage）
- 多选 KC 路径保留
- 这是阶段 2 的局部回退，相对干净

**方案 C（彻底）**：三阶段全 revert
- `git revert <commit-3> <commit-2> <commit-1>` 按倒序
- 回到改造前状态
- 文档（inquiry / recon）保留作为研究素材

### 触发回退的指标

满足以下任一条件，认真考虑回退：
- 全选模式下 AI 跑题率超过单 KC 模式 2 倍以上
- atom 错归属率超过 5%（手工抽样）
- 单 KC 模式行为出现任何回归
- 编译错误无法 5 分钟内定位

---

## 7. 给 Claude Code 的执行指令模板

把下面这段贴给 Claude Code，让它从阶段 1 开始：

```
请按 docs/inquiries/MULTISELECT_KC_PLAN.md 实施"多选 KC 对话"功能。

要求：
1. 严格遵守 §1 三条铁律和 §2 全局技术约束
2. 严格按 §3 三个阶段顺序执行，每阶段一个独立 commit
3. 每阶段 commit 前必须通过 §5 基础冒烟测试清单
4. 阶段间停下来等我确认测试通过，再开始下一阶段
5. 任何不确定时停下来问，不要自作主张

现在开始阶段 1。开始前请先：
- 阅读 docs/inquiries/MULTISELECT_KC_INQUIRY.md（了解为什么这样做）
- 阅读 docs/inquiries/EXAMPREP_RECON.md（了解代码现状事实）
- 列出阶段 1 你计划修改的所有文件和具体行号，先给我看，等我确认后再实际改动
```

**重要**：让 Claude Code 在每阶段开始前**列计划，等你确认**再动手。这样你能在每一刀切下去之前看一眼。

---

## 8. 备注：阶段间用户介入清单

### 阶段 1 完成后

- 测试单 KC 模式行为 100% 不变
- 检查 git diff 确认未改 mergeCoverageForKc / analyzeKcUtteranceForAtoms 原函数

### 阶段 2 完成后

- 测试 KC 卡片 toggle 多选交互
- 测试"全选"按钮
- 测试 0 选输入框禁用
- 注意：此时多选不影响对话（中间态预期）

### 阶段 3 完成后

- 重点测试多选 2 个 KC 的对话和 coverage 分发
- 测试全选模式（关注是否跑题严重）
- 完整跑一遍 §5 冒烟测试
- 决定是否触发 §6 回退预案
