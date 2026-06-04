# SKIM_MULTISESSION_IMPL — 略读多会话 · 阶段一（纯前端内存版）

> 基于 `SKIM_MULTISESSION_RECON.md`。本阶段把「一个文件 = 一份略读状态」改成
> 「一个文件 = 一个略读会话列表 + 激活索引」，**纯内存，刷新即丢，未碰任何持久化结构 /
> 文件**（IndexedDB / 云 / `firebase.ts` / `storageService.ts` / `types.ts` 一律未动）。
> 未做 commit。`npx tsc --noEmit` 错误数维持基线 **10**，无新增。

---

## 一、改了哪些文件

只动了两个文件：

| 文件 | 改动 |
|---|---|
| `App.tsx` | 新增 `SkimSession` 类型 + 工厂 + 上限常量；4 个略读单值 + 2 个 UI 单值 + 原 SkimPanel 内部态全部提升进「会话列表 + 激活索引」；派生激活切片 + 包装 setter；`processFile` 两条恢复路径就地包成单段；后台诊断 / `handleRegenerateStudyMap` 改按 id 写入；新增 `handleAddSkimSession`；略读区顶部新增标签栏 UI；SkimPanel 喂入新 props。 |
| `features/reader/skim/SkimPanel.tsx` | 原 4 个内部态（`selectedModuleCount` / `skimPace` / `pageRangeStart` / `pageRangeEnd`）改为受控 props（别名回旧内部名，业务逻辑零改动）；新增 `onLoadingChange` 上抛「生成中」。 |

**未动**：`types.ts`（`FilePersistedState` / `CloudSession` 原样）、`services/firebase.ts`、
`services/storageService.ts`、SkimPanel 的略读业务逻辑（开场 / 测验 / 重算 / 编辑重发等）。

---

## 二、SkimSession 结构（内存，定义在 App.tsx 顶部）

```ts
interface SkimSession {
  id: string;                       // `skim-${Date.now()}-${random}`，沿用本仓库 id 风格
  studyMap: StudyMap | null;
  messages: ChatMessage[];
  stage: SkimStage;
  quizData: QuizData | null;
  moduleCount: number;              // 原 SkimPanel.selectedModuleCount，默认 4
  skimPace: 'module' | 'part';      // 默认 'module'
  pageRangeStart: number | null;    // 原 SkimPanel 内部态
  pageRangeEnd: number | null;
  studyMapModuleCount: number | null;
  topHeight: number;                // 默认 60（见决策 2）
  focusMode: boolean;               // 默认 false（见决策 2）
}
```

App state：
```ts
const [skimSessions, setSkimSessions] = useState<SkimSession[]>(() => [createEmptySkimSession()]);
const [activeSkimIndex, setActiveSkimIndex] = useState(0);
const [skimActiveLoading, setSkimActiveLoading] = useState(false); // SkimPanel 上抛的「生成中」
const activeIdRef = useRef<string | null>(null);                   // 始终指向激活会话 id
```

---

## 三、包装 setter 怎么按 id 定位（核心细活）

派生激活切片（每渲染重算），喂给 SkimPanel 现有 props，**props 形状不变**：
```ts
const activeSkim = skimSessions[activeSkimIndex] ?? skimSessions[0];
activeIdRef.current = activeSkim?.id ?? null;          // 渲染期同步「最新激活 id」
const skimMessages = activeSkim.messages;              // studyMap / skimStage / quizData / ... 同理
```

统一入口按 id 定位单段更新（**调用时**读 `activeIdRef.current`，不吃 `activeSkimIndex` 闭包）：
```ts
const updateActiveSkimSession = useCallback((updater) => {
  const id = activeIdRef.current;
  if (id == null) return;
  setSkimSessions(prev => prev.map(s => (s.id === id ? updater(s) : s)));
}, []);
```

在此之上定义**同名同形**的包装 setter（含函数式更新），所以 SkimPanel 既有调用点
（如 `setMessages(prev => [...prev, msg])`、`setFocusMode(v => !v)`）一字未改：
- `setSkimMessages` / `setSkimTopHeight` / `setSkimFocusMode` —— `Dispatch<SetStateAction<...>>`，支持函数式；
- `setSkimStage` / `setQuizData` —— 值式；
- `setSkimModuleCount` / `setSkimPaceValue` / `setSkimPageRangeStart` / `setSkimPageRangeEnd` —— 值式（喂新 props）。

**studyMap 的写入不走通用包装 setter**，而是三处各自「捕获 id 后直接 `setSkimSessions(...map)`」，
做到真正的 id 锁定（见决策 5）：
1. 文件打开后台诊断（`processFile`）：进 if/else 前 `const diagTargetSkimId = activeIdRef.current`，
   `.then` 里 `prev.map(s => s.id === diagTargetSkimId ? {...s, studyMap, studyMapModuleCount:4} : s)`；
2. 新建会话后台诊断（`handleAddSkimSession`）：捕获 `newSession.id` 后写入；
3. `handleRegenerateStudyMap`：入口 `const targetSkimId = activeIdRef.current`，
   写进发起重算那段（解决 RECON Q5「多段重算互相覆盖」）。

`processFile` 两条恢复路径（本地 / 云端都汇入此处）就地把「旧扁平单份」包成「列表第一段」：
```ts
const restoredSkimSession: SkimSession = { ...createEmptySkimSession(),
  studyMap: stateToRestore.studyMap||null, messages: stateToRestore.skimMessages||[], ... };
setSkimSessions([restoredSkimSession]); setActiveSkimIndex(0); activeIdRef.current = restoredSkimSession.id;
```

---

## 四、标签栏 + 锁怎么接的

- **标签栏在 App**（不在 SkimPanel）：略读分支用 `<div className="flex flex-col h-full">` 包裹，
  顶部一行标签栏（`略读 N` 高亮激活 + 右侧「+」），下面 `flex-1 min-h-0` 装 **始终挂载** 的 SkimPanel。
  切标签只改 `activeSkimIndex` → 喂进去的激活切片变化，**SkimPanel 不卸载重挂**（满足 RECON Q3 警示）。
- **「+」**：`handleAddSkimSession` —— `< 10` 则 push 空白段并切过去，且为新段**各自**后台诊断生成
  自己的 studyMap（按 newSession.id 写入）；`>= 10` 时「+」禁用（灰显 + tooltip「最多 10 段」）。
- **锁**：SkimPanel 用 `useEffect` 把 `isChatLoading || isRegeneratingMap` 经 `onLoadingChange`
  上抛到 App 的 `skimActiveLoading`；为 true 时标签按钮 + 「+」全部 `disabled` + 灰显，转圈结束自动恢复。
  样式取自项目现有 indigo/stone 配色，无新硬编码配色。

---

## 五、停下报告 / 决策的岔路

1. **【已问用户并获批】把 module 数 / 节奏 / 页码范围提升进 SkimSession（加 props）。**
   任务 #1 要求提升它们，但 #2/#5 又说「SkimPanel props 形状不变 / 只加 onLoadingChange」——二者冲突
   （#5 禁止重挂 SkimPanel，则这三项要真正每段独立，只能提升为 props）。已用 AskUserQuestion 询问，
   用户选「提升进 SkimSession（加 props）」。故 SkimPanel 新增了 4 对受控 props（`moduleCount` /
   `skimPace` / `pageRangeStart` / `pageRangeEnd`）+ `onLoadingChange`，**超出**「仅 onLoadingChange」。
   做法是受控 props 别名回旧内部名，SkimPanel 内部 7 处用法零改动。

2. **topHeight / focusMode 也放进了 SkimSession。** 任务给的 SkimSession 接口未列这两项，但 #2 的 setter
   清单明确要求 `setTopHeight` / `setFocusMode`「按 id 定位会话更新」。为两者一致，按「偏好加法」把它们
   加进会话（每段各记各的分隔高度 / 专注态）。纯加法、与持久化无关。

3. **新建会话会自动跑一次后台诊断。** 空白段 `studyMap=null` 时，SkimPanel 的诊断 / 模块 / 页码 UI
   （`stage==='diagnosis' && studyMap` 才渲染）整片不显示 → 新段无任何可操作入口，自测 #3「略读 2 填
   页码 + 模块开始」无从谈起。故 `handleAddSkimSession` 镜像文件打开的后台诊断，为新段生成它**自己的**
   map（按 id 写入，不串别段）。这是让「新建段可用」的必要动作，不是范围蔓延。

4. **锁不止 isChatLoading，连 isRegeneratingMap 一起锁。** 「开始领读」会先 `onRegenerateStudyMap`
   重算地图（数秒）**再**发首条消息；这段窗口只有 `isRegeneratingMap=true`、`isChatLoading` 仍是 false。
   若只锁 isChatLoading，用户可在重算期间切走，导致随后的 `setStage('reading')` / `setMessages`
   落到切换后的会话 → 串台。故 `onLoadingChange` 上抛 `isChatLoading || isRegeneratingMap`，
   才真正满足「切换不串台」。

5. **未定义通用 `setStudyMap` / `setStudyMapModuleCount` 包装器。** 它们不是 SkimPanel 的 prop，
   仅 App 内部三处写 studyMap，且都需要写到「发起操作的那段」而非「当前激活段」（异步回包可能晚到）。
   故改为各处「捕获 id 后直接 `setSkimSessions`」，比通用包装器更严格地 id 锁定，也避免了未用变量。

---

## 六、与持久化的关系（重要：本阶段未增强持久化）

- 两条自动保存 effect（IndexedDB 2s / 云 3s）与 `processFile` 恢复，现在读 / 写的是**激活会话**的
  那几个扁平字段（`skimMessages` / `studyMap` / `skimStage` / `quizData` / `skimTopHeight` /
  `skimFocusMode`）—— 仍塞进**既有**的 `FilePersistedState` / `CloudSession` 结构，**结构与类型零改动**。
- 即：**保留了原有的「单段」持久化行为**（激活段照常存 / 恢复），但**没有**持久化「会话列表」。
  因此刷新 / 重开文件 = 回到单段（自测 #6 的预期，不是 bug）。多段持久化 / 迁移 / 云同步留给阶段二~三。

---

## 七、自测（纯内存版，请逐条跑）

1. 打开 PDF，默认即「略读 1」，行为与原单段一致（回归）。
2. 点「+」→ 出现「略读 2」并切过去，干净空白段（无略读 1 的对话 / 地图）；新段会自跑一次诊断生成自己的地图。
3. 略读 1 填 50–80 + 5 模块开始领读；切到略读 2 填 100–130 + 3 模块开始；来回切 → 页码 / 模块数 / 对话 / 地图各自独立，不串。
4. 略读 1 生成回复转圈时（含「开始领读」重算地图阶段）→ 标签切换 + 「+」点不动（灰显），转圈完恢复。
5. 连开到 10 段 → 「+」禁用（tooltip「最多 10 段」）。
6. 刷新页面 → 回到单段空白（本阶段不持久化，预期）。
7. `npx tsc --noEmit` 错误数维持基线 10，无新增（已核对：新增 0，10 条均为既有基线错误）。

---

# 追加 · 方案 A：新建段跳过诊断，直接进配置区

> 在阶段一基础上的增量改动。仍未 commit，`npx tsc --noEmit` 维持基线 **10**，零新增。

## 背景
阶段一决策 3 让「+」新建段也跑完整诊断开场（阅读前准备 / 勾选概念）。用户决策：
首段（第一次略读）保留完整诊断开场；**只有「+」新建的段跳过诊断，直接落到「选模块数 / 节奏 /
页码范围 / 开始领读」配置区**。

## 侦察修正（与任务包描述的一处出入，已正面处理）
任务包说「配置区当前渲染条件是 `stage==='diagnosis' && studyMap`」。实际 grep 后发现 **diagnosis
阶段渲染的是「阅读前准备 / 勾选概念」的 prereqs 清单，不是模块/页码配置区**；真正的「选模块数/节奏/
页码/开始领读」配置区只出现在两处：① quiz 阶段答对后的内联块；② `showGranularityModal` 弹层。
两者都调 `handleStartWithModuleCount`。所以「放开配置区」不是放开一个已存在的 diagnosis 配置区，
而是**在 diagnosis 阶段为新建段新增一个内联配置区**（见下）。已据实处理，未脑补。

## 改了什么（仍只动 App.tsx + SkimPanel.tsx）

### 区分首段 / 新建段：SkimSession 加 `skipDiagnosis: boolean`
- `createEmptySkimSession()` 默认 `skipDiagnosis: false` → 首段、`processFile` 的空白/恢复段都走完整诊断（不变）。
- `handleAddSkimSession`：新段 `{ ...createEmptySkimSession(), skipDiagnosis: true }`，并**移除阶段一决策 3
  加的「为新段自动跑后台诊断」整段**。新段建出来即 `studyMap=null`、`stage='diagnosis'`、`skipDiagnosis=true`。
- 经 props `skipDiagnosis={activeSkim.skipDiagnosis}` 喂给 SkimPanel（又一个加法 prop）。

### 放开配置区：SkimPanel 在 diagnosis 阶段为新建段新增内联配置块
- 新增渲染分支：`{stage === 'diagnosis' && !studyMap && skipDiagnosis && onRegenerateStudyMap && (配置区)}`，
  与既有 `{stage === 'diagnosis' && studyMap && (prereqs 清单)}` 平级（**纯加法，未改既有 prereqs 块**，
  故首段诊断屏零影响）。配置区内容 = 模块数 select + 节奏 radio + `PageRangeInput` + 「开始领读」按钮，
  复用已提升为受控 props 的 `selectedModuleCount`/`skimPace`/`pageRange*`，点按钮调既有 `handleStartWithModuleCount`。
- 顶部状态徽标：`stage==='diagnosis'` 时，新建空白段显示「待配置」而非「全书扫描中...」（小幅文案，避免误导）。

### studyMap 在「开始领读」时按所选范围生成 —— 无需新代码
- 既有 `needRegenerate = onRegenerateStudyMap && (studyMapModuleCount == null || ...)`：新建段
  `studyMapModuleCount` 为 null ⇒ `needRegenerate` 恒为 true ⇒ `handleStartWithModuleCount` 本就会先按
  「页码裁剪内容 contentOverride + selectedModuleCount」调 `onRegenerateStudyMap` 生成 map，再进正式领读。
  **故任务包要求 2（map 挪到开始领读时按所选范围生成）已被既有逻辑覆盖，未改 SkimPanel 业务逻辑**。
- `onRegenerateStudyMap`（App `handleRegenerateStudyMap`）按 `activeIdRef` 捕获的 id 把 map 写进发起段，
  且生成期间 `isRegeneratingMap=true` → 经 `onLoadingChange` 锁标签（阶段一已就绪），不串台。

## 岔路 / 决策
1. **未用 `diagnosis && !studyMap && !isLoading` 隐式判断「新建段」，改用显式 `skipDiagnosis` 标记。**
   隐式判断在首段「建会话→设 isStudyMapLoading(true)」之间存在一帧 `!studyMap && !isLoading` 的窗口，
   会让首段闪一下配置区。显式标记更稳，也正合任务包「可在 SkimSession 加标记」的建议。
2. **配置区采用「内联新增」而非「复用/抽取弹层」。** 为「偏好加法 / 不改既有逻辑」，没有动 quiz 内联块
   与 `showGranularityModal` 弹层（首段流程依赖它们），代价是配置区 JSX 与弹层有少量重复。

## 方案 A 自测（请逐条跑）
1. 略读 1（首段）→ 仍出现完整诊断开场（勾概念 / 自适应补习 / 我已掌握直接全文导读），与改前一致（回归，重点）。
2. 点「+」开略读 2 → **直接看到配置区**（模块数 / 节奏 / 页码范围 / 开始领读），**不再**出现「阅读前准备 / 勾选概念」屏。
3. 略读 2 配置区填页码 100–130 + 3 模块 → 开始领读 → 正常生成「只覆盖 100–130、3 模块」的地图并进入领读。
4. 略读 1 / 略读 2 来回切，各自独立不串（阶段一回归）。
5. 略读 2 点开始领读、正在生成地图 / 回复时 → 标签切换 + 「+」锁住（阶段一回归）。
6. `npx tsc --noEmit` 维持基线 10，无新增（已核对：新增 0）。

---

# 阶段二 · 本地 IndexedDB 持久化 + 老数据迁移（不碰云）

> 在阶段一 + 方案 A 基础上的增量。**只动本地**：`types.ts`(FilePersistedState) + `App.tsx`(本地保存
> effect / processFile 恢复)。**云端一律未动**（firebase.ts / 云保存 effect / createCloudSession /
> 云读取都没碰）。`npx tsc --noEmit` 维持基线 **10**，零新增。**未 commit**（git 全由你手动）。

## 目标
1. 「略读会话列表 + 激活索引」持久化到本地 IndexedDB → 刷新 / 重开文件后多段都在、激活段恢复。
2. 老数据迁移：以前读过的书（旧「单段扁平」格式）打开时，自动当作「列表里的略读 1」恢复，历史不丢。
3. **云端仍是单段行为，是预期**（多段只落本地；云留给阶段三）。

## 改了哪些文件

| 文件 | 改动 |
|---|---|
| `types.ts` | 新增 `PersistedSkimSession`；`FilePersistedState` 新增可选 `skimSessions?` + `activeSkimIndex?`。**旧扁平字段全部保留不删**（旧格式兼容）。**CloudSession 未动。** |
| `App.tsx` | 本地保存 effect 额外写 `skimSessions` + `activeSkimIndex`（迁移未触碰前抑制不写，见下）；`processFile` 恢复块按「skimSessions 是否存在」分新 / 旧格式；新增 `migratedSkimBaselineRef`；文件级诊断对新格式不再触发。 |

## 持久化字段（types.ts，仅本地）
- `PersistedSkimSession`：与运行时 `SkimSession` 同形（id / studyMap / messages / stage / quizData /
  moduleCount / skimPace / pageRange* / studyMapModuleCount / topHeight / focusMode / skipDiagnosis）。
- `FilePersistedState` 加 `skimSessions?: PersistedSkimSession[]` + `activeSkimIndex?: number`。
  **旧扁平字段（skimMessages/studyMap/skimStage/quizData/skimTopHeight/skimFocusMode）保留**——
  既作旧记录兼容，也在新格式记录里继续写「激活段」的值，万一回退旧代码仍能读到激活段（RECON Q4）。

## 写入（本地保存 effect）
- 在 `state:{...}` 里**额外**写 `...(isUntouchedMigration ? {} : { skimSessions, activeSkimIndex })`；
  扁平字段照常写「激活段」值。防抖 2s、key=fileHash 不变。云保存 effect **未碰**。

## 读取 / 恢复 + 迁移（processFile 恢复块，本地唯一汇聚点）
- **新格式**（`stateToRestore.skimSessions` 存在且非空）→ `setSkimSessions(列表)` + `setActiveSkimIndex(越界回 0)`；
  每段用 `{ ...createEmptySkimSession(), ...s }` 兜底，兼容未来字段。
- **旧格式**（无 skimSessions、但有扁平 skimMessages/studyMap…）→ 用扁平字段在内存里包成
  `[{ ...createEmptySkimSession(), studyMap, messages, stage, quizData, topHeight, focusMode }]`，单段、激活 0。
  迁移段 `studyMapModuleCount` 保持 null（旧数据没存过 module 数，RECON Q4，不强行还原）。
- 区分新旧只靠「skimSessions 字段是否存在」（无 version 字段，RECON Q4）。
- 文件级后台诊断门槛从 `!studyMap` 改为 `!skimSessions && !studyMap`——新格式各段自带 map / skipDiagnosis，
  不再被文件级诊断覆盖。

## 「读旧不毁旧」具体怎么实现（最重要的安全点）
痛点：本地保存 effect 在**任何**打开后约 2s 都会触发——若不拦，光是打开一本旧书就会立刻把它改写成新格式，
违反「不立刻覆盖旧记录」。

做法——**引用相等抑制**（`migratedSkimBaselineRef`）：
- 迁移旧格式时，记下那份内存列表的**引用**：`migratedSkimBaselineRef.current = migratedList`。
- 保存 effect 判断 `isUntouchedMigration = ref.current !== null && skimSessions === ref.current`：
  为真（state 仍是迁移产出的同一个数组 = 用户没动过略读）⇒ **这次不写 skimSessions/activeSkimIndex**，
  只续写旧扁平字段 ⇒ 硬盘上的旧记录（略读部分）保持原样、原封不动。
- 用户一旦改动略读（任何包装 setter 都走 `setSkimSessions(prev => …新数组…)`）⇒ 引用变了 ⇒
  `isUntouchedMigration` 转假 ⇒ 下次保存即按新格式落盘。
- 新格式恢复 / 全新文件都把 ref 置 null（不抑制）。
- **好处**：即便迁移逻辑有 bug，抑制期内根本不写 skimSessions（只写来自旧记录的扁平值，本就正确），
  原始旧数据零改写；回滚代码即恢复。

## 岔路 / 决策
1. **抑制用「数组引用相等」而非「深比较 / 脏标记」**：包装 setter 一律产生新数组，引用相等天然区分
   「迁移原样」与「用户已改」，零额外状态、最省。
2. **已知小边界（已接受并记录）**：极少数旧记录「有 skimMessages 却无 studyMap」时，打开会触发文件级诊断
   自动补 map → 列表引用改变 → 会以新格式落盘（非用户操作）。但这类记录本就没有 studyMap 可丢
   （略读全流程依赖 map，无 map ≈ 没真正略读过），故无损。现实里「之前读过的书」都有 map，走抑制、不改写。
3. **云端 / handleRestoreCloudSession 未动**：云无 skimSessions，恢复时自然走旧格式迁移成单段——
   即本阶段「云端仍单段」的预期行为。

## 阶段二自测（请逐条跑，重点：迁移别毁旧数据）
1. **新功能**：开 PDF，建 2~3 段各填不同页码 / 模块、各读几句 → **刷新 / 重开该文件** → 多段都在、各自独立、激活段恢复。
2. **老数据迁移（最关键）**：找一本**阶段二之前就读过、本地有旧记录**的书 → 打开 → 作为「略读 1」正常恢复，
   旧对话 / 进度都在，不报错、不空白、不错乱。
3. **迁移无损**：迁移恢复后**先别操作**，直接关掉 / 切走 → 重开 → 旧数据仍正常读（验证读旧没毁旧）；
   再在其上加一段新略读、读几句 → 刷新 → 这本书现在以新格式存了多段。
4. **回归**：单段不串 / 锁切换 / 新建段跳过诊断 / 上限 10 等阶段一 + 方案 A 行为不受影响。
5. 云端不验（仍单段，预期）。
6. `npx tsc --noEmit` 维持基线 10，无新增（已核对：新增 0）。

## 完成后
- **未 commit、未做任何 git 操作**，等你测试通过后手动 commit。
