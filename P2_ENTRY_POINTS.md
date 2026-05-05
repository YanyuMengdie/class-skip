# P2 入口排查 —— 学习工具 / 考试复习 / 九宫格 / TurtleSoup-Header 关系

> 仅做代码静态调查，**未修改任何文件**。
> 配套文档：[REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md)
> 生成时间：2026-05-03（refactor 分支）

---

## 问题 1：右上角"学习工具"按钮

| 项 | 答案 |
|----|------|
| **按钮所在文件 / 行** | [shared/layout/Header.tsx:308](shared/layout/Header.tsx) |
| **按钮 JSX** | `<button onClick={onOpenReview} ...>学习工具</button>`（line 308-311，蓝色 `bg-indigo-500`） |
| **包裹条件** | line 307 `{onOpenReview && (...)}` —— 父组件不传 `onOpenReview` 则不渲染该按钮 |
| **`onOpenReview` 在 App.tsx 怎么连接** | [App.tsx:2035](App.tsx) `onOpenReview={() => setReviewPageOpen(true)}` |
| **触发的 state** | `setReviewPageOpen(true)`（开启的是**ReviewPage**而非"学习工具九宫格"，见下方"重要勘误"） |
| **点击后渲染哪个组件** | [components/ReviewPage.tsx](components/ReviewPage.tsx)（393 行） |

> 🟡 **重要勘误**：网页右上角"学习工具"按钮 → 触发 `setReviewPageOpen(true)` → 进入 **ReviewPage 整页**（不是 ReviewModeChooser 九宫格弹窗）。下面问题 3 列出的"九宫格"与 ReviewPage 内九宫格按钮**布局相同、功能等价**，但实际渲染逻辑分属两处：
> - **ReviewPage 内的九宫格**：[components/ReviewPage.tsx:246-269](components/ReviewPage.tsx) —— 用 `handleStart('quiz' | 'flashcard' | ...)` 切换 `currentMode` 然后渲染对应面板
> - **App.tsx 内 `reviewModeChooserOpen` 弹窗的九宫格**：[App.tsx:2267-2316](App.tsx) —— 由别的入口触发（如 [App.tsx:851](App.tsx)、[App.tsx:2212](App.tsx)），不是 Header"学习工具"按钮触发
>
> 问题 3 你列出的按钮文字（闪卡 / 学习指南 / ... / 多文档问答）在两处都存在。下方表格按 **App.tsx 内 reviewModeChooserOpen 弹窗** 解析 onClick → state → 组件，因为这是项目主版本入口；ReviewPage 内的等价按钮另列一栏供你对照。

---

## 问题 2：右上角"考试复习"按钮

| 项 | 答案 |
|----|------|
| **按钮所在文件 / 行** | [shared/layout/Header.tsx:313-323](shared/layout/Header.tsx)（青色 `bg-teal-600`） |
| **按钮 JSX** | `<button onClick={onOpenExamWorkspace} ...>考试复习</button>` |
| **包裹条件** | line 313 `{onOpenExamWorkspace && (...)}` |
| **`onOpenExamWorkspace` 在 App.tsx 怎么连接** | [App.tsx:2036-2042](App.tsx)：`onOpenExamWorkspace={() => { if (!user) { setLoginModalOpen(true); return; } setAppMode('examWorkspace'); }}` |
| **触发的 state** | 未登录：`setLoginModalOpen(true)`；已登录：`setAppMode('examWorkspace')` |
| **点击后渲染哪个组件** | [components/ExamWorkspacePage.tsx](components/ExamWorkspacePage.tsx)（1492 行）—— 当 `appMode === 'examWorkspace' && user` 时由 [App.tsx:2660-2661](App.tsx) 渲染 |
| **页面内显示的标题** | "考试复习 · 备考工作台"（[ExamWorkspacePage.tsx:1109](components/ExamWorkspacePage.tsx)） |
| **附属说明** | 它**不是 modal**，而是切换 `appMode` 的**整页路由**——和"学习工具"完全是不同的展开方式 |

---

## 问题 3：九宫格里所有按钮 → 组件映射

> 解析对象：[App.tsx:2267-2316](App.tsx) 的 `reviewModeChooserOpen` 弹窗。
> ReviewPage 内对应位置：[components/ReviewPage.tsx:240-270](components/ReviewPage.tsx)（行号不同但行为一致，最右一栏标注）。

### 3.1 主映射表（按 App.tsx 弹窗的顺序）

| # | 按钮中文 | App.tsx 行 | onClick 触发的 state | 渲染面板组件 | ReviewPage 等价 onClick |
|---|----------|-----------|----------------------|--------------|-------------------------|
| 1 | **测验** | [App.tsx:2277](App.tsx)（小屏） / [App.tsx:2296](App.tsx)（大屏） | `setReviewModeChooserOpen(false); setReviewPanel('quiz');` | [components/QuizReviewPanel.tsx](components/QuizReviewPanel.tsx)（309 行） | `handleStart('quiz')` ([ReviewPage.tsx:241](components/ReviewPage.tsx)) |
| 2 | **闪卡** | [App.tsx:2278](App.tsx)（小屏） / [App.tsx:2286](App.tsx)（大屏） | `setReviewModeChooserOpen(false); setReviewPanel('flashcard');` | [components/FlashCardReviewPanel.tsx](components/FlashCardReviewPanel.tsx)（213 行） | `handleStart('flashcard')` ([ReviewPage.tsx:240](components/ReviewPage.tsx)) |
| 3 | **学习指南** | [App.tsx:2279](App.tsx) / [App.tsx:2287](App.tsx) | `setReviewModeChooserOpen(false); setStudyGuidePanel(true);` | [components/StudyGuidePanel.tsx](components/StudyGuidePanel.tsx)（205 行） | `handleStart('studyGuide')` ([ReviewPage.tsx:246](components/ReviewPage.tsx)) |
| 4 | **术语精确定义** | [App.tsx:2288](App.tsx) | `setReviewModeChooserOpen(false); setTerminologyPanelOpen(true);` | [components/TerminologyPanel.tsx](components/TerminologyPanel.tsx)（120 行） | `handleStart('terminology')` ([ReviewPage.tsx:247](components/ReviewPage.tsx)) |
| 5 | **思维导图** | [App.tsx:2289](App.tsx) | `setReviewModeChooserOpen(false); setMindMapPanelOpen(true);` | [components/MindMapPanel.tsx](components/MindMapPanel.tsx)（589 行） | `handleStart('mindMap')` ([ReviewPage.tsx:248](components/ReviewPage.tsx)) |
| 6 | **费曼检验** | [App.tsx:2297](App.tsx) | `setReviewModeChooserOpen(false); setFeynmanPanelOpen(true);` | [components/FeynmanPanel.tsx](components/FeynmanPanel.tsx)（363 行） | `handleStart('feynman')` ([ReviewPage.tsx:255](components/ReviewPage.tsx)) |
| 7 | **刁钻教授** | [App.tsx:2298](App.tsx) | `setReviewModeChooserOpen(false); setTrickyProfessorPanelOpen(true);` | [components/TrickyProfessorPanel.tsx](components/TrickyProfessorPanel.tsx)（114 行） | `handleStart('trickyProfessor')` ([ReviewPage.tsx:256](components/ReviewPage.tsx)) |
| 8 | **我的陷阱清单** | [App.tsx:2299](App.tsx) | `setReviewModeChooserOpen(false); setTrapListPanelOpen(true);` | [components/TrapListPanel.tsx](components/TrapListPanel.tsx)（78 行） | `handleStart('trapList')` ([ReviewPage.tsx:257](components/ReviewPage.tsx)) |
| 9 | **考前速览** | [App.tsx:2306](App.tsx) | `setReviewModeChooserOpen(false); setExamSummaryPanelOpen(true);` | [components/ExamSummaryPanel.tsx](components/ExamSummaryPanel.tsx)（192 行） | `handleStart('examSummary')` ([ReviewPage.tsx:263](components/ReviewPage.tsx)) |
| 10 | **考点与陷阱** | [App.tsx:2307](App.tsx) | `setReviewModeChooserOpen(false); setExamTrapsPanelOpen(true);` | [components/ExamTrapsPanel.tsx](components/ExamTrapsPanel.tsx)（98 行） | `handleStart('examTraps')` ([ReviewPage.tsx:264](components/ReviewPage.tsx)) |
| 11 | **多文档问答** | [App.tsx:2314](App.tsx) | `setReviewModeChooserOpen(false); setMultiDocQAConversationKey(getMultiDocQAConversationKey(...)); setMultiDocQAPanelOpen(true);` | [components/MultiDocQAPanel.tsx](components/MultiDocQAPanel.tsx)（208 行） | `handleStart('multiDocQA')` ([ReviewPage.tsx:269](components/ReviewPage.tsx)) |
| ➕ | **考前预测**（仅 App.tsx 弹窗有） | [App.tsx:2308](App.tsx) | `setReviewModeChooserOpen(false); setExamPredictionInitialKCId(null); setExamPredictionPanelOpen(true);` | [components/ExamPredictionPanel.tsx](components/ExamPredictionPanel.tsx)（1035 行） | （ReviewPage 没有此按钮） |

### 3.2 一句话归纳

P2 重组时，**11 个按钮 ↔ 11 个面板组件 ↔ 11 个对应的 `*PanelOpen` state** 是清晰的 1:1 关系。在 P2 把这些面板搬到 `features/quiz/`、`features/flashcard/`、`features/feynman/`、`features/mindmap/`、`features/multiDocQA/`、`features/exam/tools/`（其中包括 StudyGuide、Terminology、TrickyProfessor、TrapList、ExamSummary、ExamTraps）即可，**不需要修改 onClick 逻辑**——只需更新 import 路径。

---

## 问题 4：TurtleSoupPanel 与 Header 的关系

### 4.1 一句话结论

**TurtleSoupPanel 不直接从 Header 读任何状态**。两者通过共同的父亲 **App.tsx** 共享一个变量：`completedSegmentsCount`（已完成的番茄段数）。Header 显示它、TurtleSoupPanel 消费它。**机制是 props 下传 + 回调上提，没有 context、没有全局状态。**

### 4.2 关键状态位置

| 状态 | 声明位置 | 类型 | 含义 |
|------|----------|------|------|
| `completedSegmentsCount` | [App.tsx:318](App.tsx) `const [completedSegmentsCount, setCompletedSegmentsCount] = useState<number>(0);` | App.tsx 全局 | 已完成番茄段数（每段 = 海龟汤一次使用券） |
| `restCountdownSec` | [Header.tsx:186](shared/layout/Header.tsx) `const [restCountdownSec, setRestCountdownSec] = useState<number \| null>(null);` | **Header.tsx 内部** | 仅"休息一下"弹层用的倒计时秒数 |
| `pomodoroPhase` / `pomodoroRemainingSeconds` / `pomodoroSegmentSeconds` / `pomodoroBreakSeconds` | App.tsx 持有，下传给 Header | App.tsx 全局 | 番茄钟阶段与计时 |

### 4.3 数据流图

```
                       App.tsx
                  ┌────────────────────┐
                  │ completedSegments- │
                  │ Count: useState(0) │
                  └─────────┬──────────┘
              ┌─────────────┴──────────────┐
              ▼ props                      ▼ props
  ┌───────────────────────┐    ┌──────────────────────────┐
  │ <Header               │    │ <TurtleSoupPanel         │
  │   completedSegments-  │    │   completedSegments-     │
  │   Count={...}         │    │   Count={...}            │
  │   ... />              │    │   onConsumeSegment={     │
  │                       │    │     () => setCompleted-  │
  │ 仅显示：               │    │     SegmentsCount(c =>   │
  │ "已完成 N 段 ·         │    │     Math.max(0, c-1))} │
  │  海龟汤可用 N 次"      │    │ />                       │
  └───────────────────────┘    └──────────┬───────────────┘
                                          │ 玩家完成一局
                                          │ → onConsumeSegment()
                                          ▼
                               App.tsx 计数减 1
```

### 4.4 关键代码引用

| 关系点 | 文件 / 行 | 内容 |
|--------|-----------|------|
| App 持有 state | [App.tsx:318](App.tsx) | `const [completedSegmentsCount, setCompletedSegmentsCount] = useState<number>(0);` |
| App → Header 下传 | [App.tsx:2051](App.tsx) | `completedSegmentsCount={completedSegmentsCount}` |
| App → Header 下传相关番茄钟 props | [App.tsx:2045-2053](App.tsx) | `pomodoroSegmentSeconds`、`pomodoroBreakSeconds`、`pomodoroPhase`、`pomodoroRemainingSeconds`、`onPomodoroStart`、`onPomodoroStop`、`onPomodoroSegmentChange`、`onPomodoroBreakChange` |
| Header 接收 prop | [Header.tsx:100, 168](shared/layout/Header.tsx) | 类型 `completedSegmentsCount?: number;`（默认 0） |
| Header 仅消费、不修改 | [Header.tsx:473](shared/layout/Header.tsx) | `已完成 {completedSegmentsCount} 段 · 海龟汤可用 {completedSegmentsCount} 次` |
| App → Header 触发海龟汤入口 | [App.tsx:2044](App.tsx) | `onOpenTurtleSoup={() => setTurtleSoupOpen(true)}` |
| Header 把海龟汤按钮挂到"学累了/休息"子菜单 | [Header.tsx:364-366](shared/layout/Header.tsx) | `<button onClick={onOpenTurtleSoup}>海龟汤</button>` |
| App → TurtleSoupPanel 下传 + 上提回调 | [App.tsx:2616-2622](App.tsx) | `completedSegmentsCount={completedSegmentsCount}`<br>`onConsumeSegment={() => setCompletedSegmentsCount((c) => Math.max(0, c - 1))}` |
| TurtleSoupPanel 接收 prop & 回调 | [TurtleSoupPanel.tsx:11-12](components/TurtleSoupPanel.tsx) | `completedSegmentsCount?: number;`<br>`onConsumeSegment?: () => void;` |

### 4.5 直接回答你的具体疑问

| 你的问题 | 答案 |
|----------|------|
| TurtleSoupPanel 是否从 Header 读取计时器状态（如 `restCountdownSec`）？ | **❌ 否**。`restCountdownSec` 是 Header 私有的休息倒计时（[Header.tsx:186](shared/layout/Header.tsx)），不下传给任何子组件，也不上提到 App。 |
| TurtleSoupPanel 是否依赖 Header？ | **❌ 不依赖**。TurtleSoupPanel 与 Header 之间没有任何直接 import / props 关系。 |
| 共享的状态机制？ | **App.tsx 充当中转**：App 持有 `completedSegmentsCount`，分别下传给 Header（仅显示）和 TurtleSoupPanel（显示+消费）。**不是 context、不是全局 store**。 |
| 涉及的 state 名字 | App.tsx: `completedSegmentsCount` / `setCompletedSegmentsCount` / `turtleSoupOpen` / `setTurtleSoupOpen` / `turtleSoupState` / `setTurtleSoupState`<br>Header.tsx 私有: `restCountdownSec`、`restMinutes`、`restPopoverOpen` 等（**与 TurtleSoup 无关**）<br>TurtleSoupPanel.tsx 私有: `questionInput`、`loading`、`hintLoading` |
| Header 里"已完成 N 段 · 海龟汤可用 N 次"那行字（[Header.tsx:473](shared/layout/Header.tsx)）和海龟汤是同一份计数吗？ | **是同一份**。两者读的都是 App.tsx 的 `completedSegmentsCount`，玩一局海龟汤会通过 `onConsumeSegment` 让计数 -1，Header 显示的"可用次数"会同步减少。 |

### 4.6 P2 搬迁时的影响

- TurtleSoupPanel 搬到 `features/turtleSoup/`：**不需要重构 props 接口**，只改 import 路径即可。
- Header 搬到 `shared/layout/`：**不影响**，因为它只通过 App.tsx 的 props 接受 `completedSegmentsCount`。
- App.tsx 中持有的 `completedSegmentsCount` 与番茄钟 state 是**典型的"父组件协调子组件"案例**——P5 拆 App.tsx 时可以抽 `usePomodoroState()` hook，但 P2 阶段**不需要动**。

---

*报告完。仅做静态调查，未修改任何代码文件。*
