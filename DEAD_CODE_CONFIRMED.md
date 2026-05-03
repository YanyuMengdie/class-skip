# 死代码确认报告

> 阶段 1 补充：根据 Criss 反馈，对三个候选死代码做引用链路二次核查。
> 配套文档：[REFACTOR_AUDIT.md](REFACTOR_AUDIT.md)、[REFACTOR_PLAN.md](REFACTOR_PLAN.md)
> 生成时间：2026-05-02
> 本步骤：**只读分析，未改任何代码**

---

## 1. components/BreakPanel.tsx —— 复核结论

### 1.1 结论

> **🔴 BreakPanel.tsx 仍然是死代码**——但你说的"休息一下"按钮**确实存在并能用**，只是它的实现**不是 BreakPanel.tsx**，而是被 [components/Header.tsx](components/Header.tsx) 内联重写了一份等价的弹层。

也就是说：
- **产品层面**："学累了/休息 → 休息一下"按钮存在、能用、不能删功能。✓ 你的记忆是对的。
- **代码层面**：那个按钮的实现 **不在 BreakPanel.tsx**，而在 Header.tsx 自己的 `restPopover` 弹层里。BreakPanel.tsx 是被取代的旧版本。

### 1.2 全仓库 grep 证据

我对以下关键字做了全仓库扫描（`*.{ts,tsx}`）：

```
BreakPanel | 休息一下 | 学累了 | break-panel | breakPanel
takeBreak | takeABreak | onBreak | isBreak | showBreak
```

**`BreakPanel` 这个标识符的全部出现位置**：

| 文件 | 行 | 内容 |
|------|----|------|
| [components/BreakPanel.tsx:4](components/BreakPanel.tsx#L4) | 4 | `interface BreakPanelProps {`（自己） |
| [components/BreakPanel.tsx:9](components/BreakPanel.tsx#L9) | 9 | `export const BreakPanel: ...`（自己） |

**没有其他任何文件 import 或引用 `BreakPanel`**。

### 1.3 你问到的三种可能性，逐一排除

| 可能性 | 排查结论 |
|--------|----------|
| (a) 父组件中通过动态 import / 条件渲染 | ❌ 不存在。全仓库 `BreakPanel` 只出现在自己文件里 2 次。没有任何 `import('./BreakPanel')`、`React.lazy`、`<BreakPanel`、`{BreakPanel}` 形式的引用。 |
| (b) 被某个 modal/dialog 包装后使用 | ❌ 不存在。BreakPanel 自己已经包了 modal 外壳（`fixed inset-0 z-[150]` 遮罩 + 右滑抽屉），不需要再被包一层。但即便如此，仍没有任何父组件用它。 |
| (c) "休息一下"按钮的点击在哪个文件？ | **✓ 在 [components/Header.tsx](components/Header.tsx)，但走的是 Header 自己的状态，不是 BreakPanel。** |

### 1.4 "休息一下"按钮真正的引用链路

完整调用链如下：

**入口按钮**（Header.tsx:370-372）：

```tsx
// components/Header.tsx:370
<button type="button" onClick={() => { setRestPopoverOpen(true); setMoreMenuOpen(false); setRestSubmenuOpen(false); }} className="...">
  <Timer className="w-3.5 h-3.5" /> 休息一下
</button>
```

**点击后打开的弹层**（Header.tsx:481-499，Portal 到 body）：

```tsx
// components/Header.tsx:481
{/* 休息一下弹层（Portal 到 body） */}
{restPopoverOpen && createPortal(
  <div ref={restPopoverRef} className="fixed w-72 bg-white rounded-xl shadow-xl border border-stone-200 p-3 z-[200]" ...>
    ...
    <p className="font-semibold text-slate-800 ..."><Timer .../>休息一下</p>
    {restCountdownSec === null ? (
      <>
        <select value={restMinutes} onChange={...}>
          {[3, 5, 10, 15].map((m) => (<option key={m} value={m}>{m} 分钟</option>))}
        </select>
        <button onClick={() => setRestCountdownSec(restMinutes * 60)}>开始休息</button>
      </>
    ) : ( /* 倒计时显示 */ )}
  </div>,
  document.body
)}
```

**Header 内部用到的状态**（同文件内 `useState`）：

- `restPopoverOpen`
- `restMinutes`
- `restCountdownSec`
- `restPopoverRef`

### 1.5 BreakPanel.tsx 与 Header 内联实现的对比

把两份代码摆在一起看，几乎是 1:1 的克隆：

| 功能点 | [BreakPanel.tsx](components/BreakPanel.tsx) | [Header.tsx 内联](components/Header.tsx#L481) |
|--------|---------------------------------------------|--------------------------------------------------|
| 选择休息时长 | `[3, 5, 10, 15]` 分钟下拉 | `[3, 5, 10, 15]` 分钟下拉 ← **一模一样** |
| "开始休息"按钮样式 | `bg-emerald-500 text-white ...` | `bg-emerald-500 text-white ...` ← **一模一样** |
| 倒计时显示 | `Math.floor(s/60)}:{(s%60).padStart(2,'0')` | 同样的格式（Header.tsx 内）← **一模一样** |
| Portal 到 body | ❌ 直接 `fixed`，不用 Portal | ✓ 用 `createPortal(..., document.body)` |
| 倒计时结束行为 | `alert('该回去学啦～')` | （Header 内有 useEffect，行为见同文件） |
| 父组件 props 接口 | `{ isOpen, onClose }` | 不需要——状态完全自闭包 |

**判断**：Header 在重写"休息一下"时把 BreakPanel 的逻辑搬进来直接内联了一份（可能是为了 Portal 定位、和番茄钟弹层共用 anchor），然后**忘记删 BreakPanel.tsx**。这是典型的"新版本上线后老版本没清理"。

### 1.6 处理建议（待你拍板）

| 选项 | 内容 |
|------|------|
| ✅ **推荐：删除 BreakPanel.tsx** | 真功能在 Header 里；BreakPanel 109 行没人使用；删除不会影响任何用户行为。 |
| ⚪ 可选：抽 `RestTimerPopover` 共享件 | 把 Header 内联的休息弹层抽成独立组件，让 BreakPanel.tsx 复活作为新的实现。这是"重构 Header"的活儿，应该归到阶段 4，**不是阶段 2 死代码清理**。 |
| ❌ 不建议：保留 BreakPanel.tsx 不动 | 没意义，徒增重构噪音。 |

---

## 2. components/DailyExamStudyPanel.tsx vs ExamDailyMaintenancePanel.tsx

### 2.1 结论

> **"今日保温学习"界面由 [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) 渲染。**
> **[components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx) 是一行 re-export 别名（旧名），没人引用，可归档。**

### 2.2 你提到的 4 个关键字定位

我搜了 `今日保温学习 | 此刻心态 | 目标闪卡数量 | 手感的考试 | 生成今日保温`，**全部 4 个关键字都命中同一个文件**：

| 关键字 | 位置 |
|--------|------|
| 「**今日保温学习**」标题 | [ExamDailyMaintenancePanel.tsx:358](components/ExamDailyMaintenancePanel.tsx#L358)：`<h2 className="...">今日保温学习</h2>` |
| 「**此刻心态**」标签 | [ExamDailyMaintenancePanel.tsx:369](components/ExamDailyMaintenancePanel.tsx#L369)：`此刻心态（影响默认张数、语气与是否先呼吸）` |
| 「**目标闪卡数量**」选项 | [ExamDailyMaintenancePanel.tsx:398](components/ExamDailyMaintenancePanel.tsx#L398)：`<span ...>目标闪卡数量</span>` |
| 「**要维持手感的考试**」 | [ExamDailyMaintenancePanel.tsx:411](components/ExamDailyMaintenancePanel.tsx#L411)：`选择今天要维持手感的考试` |
| 「**生成今日保温闪卡**」按钮 | [ExamDailyMaintenancePanel.tsx:443](components/ExamDailyMaintenancePanel.tsx#L443)：`<Sparkles ... /> 生成今日保温闪卡` |

→ 你描述的整个界面 **100% 在 ExamDailyMaintenancePanel.tsx 里**。

### 2.3 入口路径

```
App.tsx
  └─ ExamHubModal（"考试中心"弹窗，含「考试管理 / 今日学习 / 情境流程」三 tab）
       └─ tab === 'daily'
            └─ <ExamDailyMaintenancePanel />   ← 你看到的"今日保温学习"界面
```

证据：[components/ExamHubModal.tsx:7](components/ExamHubModal.tsx#L7)

```ts
import { ExamDailyMaintenancePanel } from './ExamDailyMaintenancePanel';
```

并在 [components/ExamHubModal.tsx:103](components/ExamHubModal.tsx#L103) 直接渲染：

```tsx
{tab === 'daily' && (
  <ExamDailyMaintenancePanel
    user={user}
    exams={exams}
    materials={materials}
    onClose={onClose}
    onOpenTool={onOpenReviewTool}
    onBuildMergedContent={onBuildMaintenanceContent}
  />
)}
```

注意 ExamHubModal 中那个 tab 的标签文字是 **"今日学习"**，但点进去后真正的 `<h2>` 标题是 **"今日保温学习"**（在 ExamDailyMaintenancePanel.tsx:358）。所以你看到的入口 → 界面 → 组件文件 三者关系是：

| 你看到的 | 在哪里 |
|----------|--------|
| 顶栏入口 → "考试中心" | [Header.tsx](components/Header.tsx) 触发 ExamHubModal 打开 |
| Tab 标签"今日学习" | [ExamHubModal.tsx:65](components/ExamHubModal.tsx#L65)（`['daily', '今日学习']`） |
| 页内 `<h2>` 标题"今日保温学习" + 心态/张数/考试/按钮 | [ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) |

### 2.4 DailyExamStudyPanel.tsx 的真实情况

```ts
// components/DailyExamStudyPanel.tsx 全部内容（1 行）：
export { ExamDailyMaintenancePanel as DailyExamStudyPanel } from './ExamDailyMaintenancePanel';
```

**全仓库 grep 字符串 `DailyExamStudyPanel` 的所有命中**：

| 文件 | 行 | 内容 |
|------|----|------|
| [components/DailyExamStudyPanel.tsx:1](components/DailyExamStudyPanel.tsx#L1) | 1 | `export { ExamDailyMaintenancePanel as DailyExamStudyPanel } from './ExamDailyMaintenancePanel';` |

**只有 1 处，就是它自己**。没有任何 `import { DailyExamStudyPanel }` 调用方。

### 2.5 结论与处理建议

| 文件 | 状态 | 建议 |
|------|------|------|
| [components/ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) | ✅ **当前在用** | **保留**。它就是"今日保温学习"界面。 |
| [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx) | 🔴 **死再导出** | **可删**。是旧名 → 新名的过渡别名，已经没人用旧名了。 |

按你的标准——"如果是 ExamDailyMaintenancePanel 渲染的，那 DailyExamStudyPanel 就是老版本可以归档"——**符合归档/删除条件**。

---

## 3. utils/prompts.ts 中 GALGAME_SYSTEM_PROMPT / REM_STORYTELLER_PROMPT

### 3.1 决策记录

按你的指示：
- 这两个常量**保留，归档到 `_archived/` 文件夹**。
- **本步骤不动它们**，等你后面单独处理。

### 3.2 当前事实记录（供你后续归档参考）

| 项 | 信息 |
|----|------|
| 定义位置 | [utils/prompts.ts:161](utils/prompts.ts#L161)（`GALGAME_SYSTEM_PROMPT`）、[utils/prompts.ts:196](utils/prompts.ts#L196)（`REM_STORYTELLER_PROMPT`） |
| 当前 import 数 | 0（除自己 export 外没有任何文件 import 这两个常量） |
| 产品状态 | Galgame 入口当前已关闭，未来可能重启 |
| 与运行代码的关系 | 当前 galgame 模式实际用的是 [services/geminiService.ts:357 `getPersonaSystemPrompt`](services/geminiService.ts) 内联函数，与 prompts.ts 里这两个常量**无引用关系**。归档不会影响当前运行行为。 |
| 同文件其他常量 | `CLASSIFIER_PROMPT`、`STEM_SYSTEM_PROMPT`、`HUMANITIES_SYSTEM_PROMPT` 这 3 个**仍在使用**（被 geminiService.ts 在 line 1-10 import），归档时**不要带上它们**。 |

### 3.3 后续归档时的注意事项（备忘）

当你单独做归档时：

1. 创建 `_archived/prompts/galgame.ts`，把 `GALGAME_SYSTEM_PROMPT` + `REM_STORYTELLER_PROMPT` 两个常量原样搬过去。
2. 从 [utils/prompts.ts](utils/prompts.ts) 中删除这两段（保留 `CLASSIFIER_PROMPT`、`STEM_SYSTEM_PROMPT`、`HUMANITIES_SYSTEM_PROMPT`）。
3. 加一个 `_archived/README.md` 说明归档原因（"galgame 入口暂关，prompt 备查"）。
4. 跑 `npx tsc --noEmit` 确认没人引用断裂——应该 0 错误，因为本来就没人 import。

---

## 4. 三个问题的最终决策矩阵

| 文件 / 常量 | 你之前的怀疑 | 调查结论 | 建议动作（待你拍板） |
|------------|--------------|----------|---------------------|
| [components/BreakPanel.tsx](components/BreakPanel.tsx) | "还在用" | **代码层面 0 引用**；功能被 [Header.tsx](components/Header.tsx) 重新内联实现了一份；用户看到的"休息一下"是 Header 的实现，不是 BreakPanel | ✅ **可以删**（功能不丢失） |
| [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx) | "界面是哪个组件渲染的？" | "今日保温学习"由 [ExamDailyMaintenancePanel.tsx](components/ExamDailyMaintenancePanel.tsx) 渲染（关键字全部命中）；DailyExamStudyPanel 是无人使用的旧名别名 | ✅ **可以删/归档** |
| [utils/prompts.ts](utils/prompts.ts) GALGAME / REM | "保留，等后面归档" | 0 引用；归档不会影响运行 | ⏸ **本步不动**，等你后续操作 |

---

## 5. 最终请你确认

请就以下两项给一个明确答复，决定后我们才进入阶段 2 的实际删除操作：

- [ ] 同意删除 [components/BreakPanel.tsx](components/BreakPanel.tsx)（109 行）？
  - 用户体验**不变**：休息按钮、倒计时、3/5/10/15 分钟下拉全在 Header.tsx 中独立运作。
- [ ] 同意删除 [components/DailyExamStudyPanel.tsx](components/DailyExamStudyPanel.tsx)（1 行死再导出）？
  - 用户体验**不变**：直接 import `ExamDailyMaintenancePanel` 的所有调用方都不受影响（[ExamHubModal.tsx](components/ExamHubModal.tsx) 已经用新名）。

如同意，下次 commit 信息建议：

```
chore(cleanup): 删除两个无引用的死代码文件

- BreakPanel.tsx：功能已被 Header.tsx 的 restPopover 内联实现取代
- DailyExamStudyPanel.tsx：仅是 ExamDailyMaintenancePanel 的旧名别名，无人使用
```

---

*报告完。等你确认后进入阶段 2 第一次 commit。*
