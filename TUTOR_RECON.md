# TUTOR_RECON.md — 私教模式（纯对话 tutor session）可行性扫描

> 只读侦察报告。**未写任何代码、未改任何业务文件、未做任何 git 操作**（本报告文件本身是任务要求的产出）。
> 架构前提（任务方已定）：独立 tutor session（方案 B），不复用 skim session 加 type 字段。
> 扫描对象：`refactor` 分支，commit `1dbeaed`。

---

## Q1. skim session 的数据结构长什么样

**结论（一句话）：** session 类型有两份同形定义——运行时 `SkimSession`（[App.tsx:98-113](App.tsx#L98-L113)）与本地持久化 `PersistedSkimSession`（[types.ts:583-597](types.ts#L583-L597)）；13 个字段里**只有 2 个是纯对话必需**（`id` / `messages`），另 2 个 UI 字段可选，其余 9 个全是略读专属包袱。

**证据（语义锚点）：**
- 运行时模型：`interface SkimSession` @ [App.tsx:98](App.tsx#L98)；工厂 `createEmptySkimSession()` @ [App.tsx:116](App.tsx#L116)；上限 `MAX_SKIM_SESSIONS = 10` @ [App.tsx:133](App.tsx#L133)。
- 持久化模型：`export interface PersistedSkimSession` @ [types.ts:583](types.ts#L583)（注释明说「与 App 运行时的 SkimSession 同形——独立列出，避免持久化层耦合 App 内部类型」）。

**逐字段标注：**

| 字段 | 类型 | tutor 是否需要 | 说明 |
|---|---|---|---|
| `id` | string | ✅ 需要 | id 风格 `skim-${Date.now()}-${random}`（[App.tsx:117](App.tsx#L117)），创建时刻内嵌其中 |
| `messages` | ChatMessage[] | ✅ 需要 | 对话本体；多模态图片在**每条** `ChatMessage.images` 上（见 Q4），不在 session 级 |
| `studyMap` | StudyMap \| null | ❌ 略读专属 | 学习地图 |
| `stage` | SkimStage | ❌ 略读专属 | `diagnosis`/`tutoring`/`quiz`/`reading` 四阶段机 |
| `quizData` | QuizData \| null | ❌ 略读专属 | 门控测验 |
| `moduleCount` | number | ❌ 略读专属 | 模块数 |
| `skimPace` | 'module'\|'part' | ❌ 略读专属 | 领读节奏 |
| `pageRangeStart` | number \| null | ❌ 略读专属 | 页码范围 |
| `pageRangeEnd` | number \| null | ❌ 略读专属 | 页码范围 |
| `studyMapModuleCount` | number \| null | ❌ 略读专属 | 当前地图按几模块生成 |
| `topHeight` | number | ⚠️ UI、可选 | 上下分栏高度%。tutor 是纯对话单栏，**不需要**（除非沿用分栏布局） |
| `focusMode` | boolean | ⚠️ UI、可选 | 专注模式（隐藏上半块）。纯对话天然无上半块，**可不要** |
| `skipDiagnosis` | boolean | ❌ 略读专属 | 「+」新建段跳过诊断的标志位 |

**对「tutor session 该怎么落地」的影响：**
- 干净的 tutor session 实质只需 **`{ id, messages }`**。
- ⚠️ 任务 Q1 假设结构里有 `createdAt`——**实际没有独立 `createdAt` 字段**，创建时刻只藏在 id 字符串里。tutor 若要按时间排序/展示，建议显式加 `createdAt: number`。
- ⚠️ 也**没有 `title`/`name` 字段**——略读标签按下标硬编码「略读 N」（见 Q3）。tutor 若要可命名会话需新增。
- 方案 B（独立类型）下，建议**新定义干净的 `TutorSession`**，而非从 `SkimSession` 删字段——后者会拖着 9 个 optional 包袱与持久化耦合。

---

## Q2. 多 session 的持久化是怎么做的

**结论（一句话）：** skim session **不是独立存档**——它**嵌在「按文件 hash 寻址的单文件记录」里**：本地塞进 IndexedDB `fileHistory` store 的 `state.skimSessions`，云端塞进 Firestore `sessions/{id}/data/main` heavy 文档的 `skimSessions` 字段；现有逻辑**无法直接参数化复用**给「可能没有文件」的 tutor session。

**证据（语义锚点）：**

**IndexedDB**（[services/storageService.ts](services/storageService.ts)）
- DB `ReadingAssistantDB` v1，单 store `fileHistory`，`keyPath: 'hash'`（[storageService.ts:4-6](services/storageService.ts#L4-L6)、[:20](services/storageService.ts#L20)）。
- API：`saveFileState` / `getFileState` / `getAllHistory` / `deleteFileState`（[storageService.ts:36](services/storageService.ts#L36)、[:55](services/storageService.ts#L55)、[:69](services/storageService.ts#L69)、[:87](services/storageService.ts#L87)）——**全部以「整份 FileHistoryItem」为单位**，无「session 级」读写。
- `skimSessions` 存在 `FileHistoryItem.state.skimSessions`（`FilePersistedState.skimSessions?` @ [types.ts:617](types.ts#L617)），由本地自动保存 effect 组装写入 @ [App.tsx:707-743](App.tsx#L707-L743)（字段 `skimSessions, activeSkimIndex` @ [App.tsx:726](App.tsx#L726)）。

**Firestore**（[services/firebase.ts](services/firebase.ts)）
- 集合 `sessions`（meta 文档）+ 子文档 `sessions/{id}/data/main`（heavy）。拆分器 `splitUpdateData` 按 `META_KEYS` 分流，`skimSessions` 落 heavy（[firebase.ts:181-197](services/firebase.ts#L181-L197)）。
- 建档 `createCloudSession` 在 heavy 里播种 `skimSessions: []`（[firebase.ts:201-251](services/firebase.ts#L201-L251)，字段 @ [:228](services/firebase.ts#L228)）。
- 云端写入由 `updateCloudSessionState` 走，调用点在云保存 effect @ [App.tsx:750-760](App.tsx#L750-L760)（`skimSessions, activeSkimIndex` @ [App.tsx:756](App.tsx#L756)）；`CloudSession.skimSessions?` 类型 @ [types.ts:681](types.ts#L681)。

**「读旧不毁旧」迁移**（在 App.tsx，不是独立函数文件）
- baseline 引用 `migratedSkimBaselineRef` @ [App.tsx:156](App.tsx#L156)；抑制判断 `isUntouchedSkimMigration()` @ [App.tsx:195-198](App.tsx#L195-L198)。
- 本地 + 云端两条保存 effect 共用同一抑制：迁移产出列表未被用户触碰前**不写新格式**、只续写旧扁平字段（[App.tsx:726](App.tsx#L726)、[App.tsx:756](App.tsx#L756)）。
- 旧格式→单段迁移在 `processFile` 恢复路径：新格式直接恢复 @ [App.tsx:803-809](App.tsx#L803-L809)；旧扁平字段包成单段 + 记 baseline @ [App.tsx:812-824](App.tsx#L812-L824)。

**对「tutor session 该怎么落地」的影响：**
- ⚠️ **核心障碍**：现有存档是「一份文件记录 = 一份 skimSessions 列表」，**key 是文件 hash**。tutor 是「先开对话、再（可能）发材料」，开局没有文件 hash——**套不进这套寻址**。
- 因此「抄一套平行存档逻辑」更现实，而非「参数化复用」。两条可选路线：
  1. **新开独立存储**：IndexedDB 加 `tutorSessions` store（keyPath `id`），Firestore 加 `tutorSessions` 集合（或挂 `users/{uid}/tutorSessions` 子集合，参考 [firebase.ts:383](services/firebase.ts#L383) 的 events/memos 用户子集合写法）。结构最干净、与略读完全解耦，契合方案 B。
  2. 勉强复用文件记录：tutor 无文件时需造合成 key——**不推荐**，会污染文件历史 UI。
- `splitUpdateData` 的 meta/heavy 拆分模式（[firebase.ts:181](services/firebase.ts#L181)）可作 tutor 云存的参考样板。

---

## Q3. 多 session 切换 UI 在哪

**结论（一句话）：** 略读标签切换器是 **App.tsx 里内联的一段 JSX**（不是独立组件），只在 `viewMode === 'skim'` 时渲染，按 `skimSessions` 数组 + `activeSkimIndex` 画 tab、按下标硬编码标签「略读 N」。

**证据（语义锚点）：**
- 标签栏 JSX @ [App.tsx:2240-2278](App.tsx#L2240-L2278)（在 `commonRightPanel` 的 `viewMode === 'skim'` 分支内）。
- 渲染源：`skimSessions.map((s, i) => ...)` @ [App.tsx:2242](App.tsx#L2242)；标签文案直接 `略读 {i + 1}` @ [App.tsx:2255](App.tsx#L2255)。
- 切换：`onClick={() => ... setActiveSkimIndex(i)}` @ [App.tsx:2246](App.tsx#L2246)，受「生成中锁」`skimActiveLoading` 约束。
- 新建：「+」按钮 @ [App.tsx:2258-2277](App.tsx#L2258-L2277) → `handleAddSkimSession` @ [App.tsx:2023-2029](App.tsx#L2023-L2029)。
- state 来源：`skimSessions` / `activeSkimIndex` / `skimActiveLoading` 都声明在 App @ [App.tsx:147-150](App.tsx#L147-L150)；SkimPanel **始终挂载**，切 tab 只换喂进去的「激活会话切片」`activeSkim`（[App.tsx:158](App.tsx#L158)），不卸载重挂（[App.tsx:2239](App.tsx#L2239) 注释）。

**对「tutor session 该怎么落地」的影响：**
- 切换器是 App 级内联 JSX + App 级 state，没抽成可复用组件——tutor 想要标签栏得**自己再写一段平行 JSX**（或这次顺手抽个通用 `<SessionTabs>`）。
- 方案 B 下，tutor 列表应是**独立一套**（独立的 `tutorSessions` + `activeTutorIndex` state + 独立标签栏），**不要混进略读切换器**——否则又回到「加 type 字段」老路，违背方案 B。
- tutor 入口大概率需要一个**新的 `viewMode`**（如 `'tutor'`）或独立弹层/overlay，因为现有标签栏死锁在 `viewMode === 'skim'` 分支里（见 Q5 影响）。

---

## Q4. 对话能力（chat）本身能不能干净剥出来

**结论（一句话）：** 能——「发消息→调 Gemini→渲染回复」全在 SkimPanel 内，且**服务层 `tutoring` 模式对 study map / stage / page range 零依赖**；但组件层把这段和阶段机（stage→mode 判定、领读重置、地图重算）缠在一个 1628 行文件里，剥离成本=**抽一个精简纯对话组件，复用同一个 service**。

**证据（语义锚点）：**
- 发送主函数 `handleSend` @ [SkimPanel.tsx:607-688](features/reader/skim/SkimPanel.tsx#L607-L688)。
- 对话相关 state：`input` / `isChatLoading` / `pendingImages` @ [SkimPanel.tsx:254-294](features/reader/skim/SkimPanel.tsx#L254-L294)；取消用 `skimAbortControllerRef`（[:526-530](features/reader/skim/SkimPanel.tsx#L526-L530)）。
- 服务：`chatWithSkimAdaptiveTutor` @ [geminiService.ts:2136](services/geminiService.ts#L2136)。系统提示词仅按 `docType` 取 `STEM_SYSTEM_PROMPT`/`HUMANITIES_SYSTEM_PROMPT`（[geminiService.ts:2150](services/geminiService.ts#L2150)），**无备考 citations / chunk / KC / 支架附录**（函数头注释 [:2130-2134](services/geminiService.ts#L2130-L2134)）。

**对 study map / stage / page range 的依赖分析：**
- **服务层（干净）**：`readingOptions`（含 `studyMapBriefing` / `moduleCount` / `skimPace`）**只在 `mode === 'reading'` 才被用**（`appendReadingModeUserMessageSuffix`，[geminiService.ts:2004-2030](services/geminiService.ts#L2004-L2030)、调用判断 [:2175](services/geminiService.ts#L2175)）。`tutoring` 模式完全不碰这些。→ **纯对话用 `mode='tutoring'` 调它即可，天然无包袱。**
- **组件层（有耦合，但可绕开）**：
  - `handleSend` 用 `stage` 推断 mode：`forceMode || (stage === 'reading' ? 'reading' : 'tutoring')` @ [SkimPanel.tsx:658](features/reader/skim/SkimPanel.tsx#L658)——tutor 固定 `'tutoring'` 即可。
  - ⚠️ **硬门槛**：`handleSend` 开头 `if ((!trimmed && pendingImages.length===0) || !content || isChatLoading) return;` @ [SkimPanel.tsx:620](features/reader/skim/SkimPanel.tsx#L620)，其中 `content = contentOverride ?? (pdfDataUrl || fullText)` @ [:618](features/reader/skim/SkimPanel.tsx#L618)。**没有文档内容就发不出消息。** 且 `getContentPart('')` 会塞「No document content provided」占位（[geminiService.ts:40-55](services/geminiService.ts#L40-L55)）。→ tutor「开局先问候、用户后发材料」需放宽此 guard，或把首份材料作为 `images`/文本喂进去。
  - 领读专属副作用 `resetReadingModuleArtifacts` / `startFormalReading` 与 tutor 无关，剥离时不带即可。

**多模态 images 怎么用的（自洽、可整段搬走）：**
- 选图/粘贴：`handleImageSelect` @ [SkimPanel.tsx:570](features/reader/skim/SkimPanel.tsx#L570)、`handlePaste` @ [:584](features/reader/skim/SkimPanel.tsx#L584) → 填 `pendingImages`。
- 发送：快照 `imagesToSend = pendingImages` 后清空（[:645-646](features/reader/skim/SkimPanel.tsx#L645-L646)），随用户消息以 `images` 字段入库（[:637](features/reader/skim/SkimPanel.tsx#L637)），并作为第 8 参传给 service（[:670](features/reader/skim/SkimPanel.tsx#L670)）。
- 渲染：`getMessageImages(msg)`（[lib/chat/messageUtils.ts:7](lib/chat/messageUtils.ts#L7)）在气泡里 map 出图（[SkimPanel.tsx:1286](features/reader/skim/SkimPanel.tsx#L1286)）；service 侧把历史里每条 user 消息的图转 `inlineData`（[geminiService.ts:2160-2169](services/geminiService.ts#L2160-L2169)）。`ChatMessage.images?: string[]` + 兼容旧 `image` 的读取走 `getMessageImages` @ [types.ts:20-23](types.ts#L20-L23)。

**对「tutor session 该怎么落地」的影响：**
- 这是整个功能成本最低的一层：**新建一个精简 `<TutorChat>`**，复用 `chatWithSkimAdaptiveTutor(content, history, msg, 'tutoring', docType, undefined, signal, images)` + `getMessageImages` + 直接搬 `handleImageSelect`/`handlePaste`/abort 三段。
- 唯一真改点：放宽「无文档不发送」的 guard（[SkimPanel.tsx:620](features/reader/skim/SkimPanel.tsx#L620) 对应逻辑），让纯聊天/先问候后发材料成立。
- ⚠️ 不建议复用考前的 `ExamWorkspaceSocraticChat`（[features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx)）作模板——它绑死 KC / chunk 检索 / citations / 支架（imports [:20-43](features/exam/workspace/ExamWorkspaceSocraticChat.tsx#L20-L43)），比 SkimPanel 的 tutoring 路径**更重**。SkimPanel 的 tutoring 子集才是最干净的参考。

---

## Q5. 略读配置页那个入口在哪

**结论（一句话）：** 截图里「配置这段略读 / 开始领读」是 SkimPanel 内 `stage==='diagnosis' && !studyMap && skipDiagnosis` 的配置区 JSX（[SkimPanel.tsx:874-940](features/reader/skim/SkimPanel.tsx#L874-L940)），「开始领读」按钮接 `handleStartWithModuleCount`；而进入略读、新开一段的**总入口**是 App 标签栏的「+」（[App.tsx:2258](App.tsx#L2258)）。

**证据（语义锚点）：**
- 新建段配置区（方案 A）：`{stage === 'diagnosis' && !studyMap && skipDiagnosis && onRegenerateStudyMap && (...)}` @ [SkimPanel.tsx:874](features/reader/skim/SkimPanel.tsx#L874)；标题「配置这段略读」@ [:880](features/reader/skim/SkimPanel.tsx#L880)；内含 模块数 select + 节奏 radio + `<PageRangeInput>` + 「开始领读」按钮 @ [:930-936](features/reader/skim/SkimPanel.tsx#L930-L936)。
- 「开始领读」`onClick`：`handleStartWithModuleCount` @ [:931](features/reader/skim/SkimPanel.tsx#L931) → 函数体 @ [SkimPanel.tsx:486-516](features/reader/skim/SkimPanel.tsx#L486-L516)（裁页码→`onRegenerateStudyMap`→`startFormalReading`）。
- 另有两处同名「开始领读」入口：Quiz 内联 @ [:1172](features/reader/skim/SkimPanel.tsx#L1172)、跳过弹窗 @ [:1699](features/reader/skim/SkimPanel.tsx#L1699)，最终都汇到 `handleStartWithModuleCount` / `startFormalReading`。
- 略读总入口「+」：`handleAddSkimSession` @ [App.tsx:2023](App.tsx#L2023)（新建空白段、`skipDiagnosis=true`、直接进上面那个配置区）。

**对「tutor session 该怎么落地」的影响：**
- 「私教模式」入口有两个合理落点：
  1. **配置区内并列**：在 [SkimPanel.tsx:930-936](features/reader/skim/SkimPanel.tsx#L930-L936) 的「开始领读」旁加一个「私教模式」按钮——视觉上正对截图诉求，但 SkimPanel 是略读组件，在里面启动「独立 tutor session」会造成跨组件耦合。
  2. **标签栏/viewMode 级**：在 [App.tsx:2258](App.tsx#L2258) 的「+」附近加入口，或新增 `viewMode === 'tutor'` 分支——与方案 B「独立 session」最契合，启动后走独立的 tutor 标签栏 + `<TutorChat>`。
- ⚠️ 现有右栏渲染是 `isClassroomMode ? ... : viewMode==='skim' ? ... : viewMode==='layered' ? ... : ExplanationPanel` 的链（[App.tsx:2232-2341](App.tsx#L2232-L2341)）。tutor 要独立显示，最干净的是**新增一个 viewMode 分支**，而非寄生在 skim 分支内。
- 推荐：入口按钮放配置区（满足 UI 诉求）→ onClick 切到新 `viewMode='tutor'` / 开独立 tutor overlay，把「入口位置」与「会话归属」解耦。

---

## ⚠️ 意外发现（与任务假设不符 / 需决策方注意）

1. **skim session 没有独立存储，是「按文件 hash 寻址的单文件记录」的子字段。** IndexedDB 以 `fileHistory` store + `keyPath:'hash'` 存整份文件记录（[storageService.ts:20](services/storageService.ts#L20)），Firestore 以 `sessions/{id}/data/main` 存单文件 heavy 文档（[firebase.ts:237](services/firebase.ts#L237)）。tutor「开局无文件」→ **没有现成平行存档可抄、也无法直接参数化复用**，需新开独立存储（见 Q2 影响）。这是方案 B 落地最大的真实成本，而非「对话层」。

2. **Q1 假设的 `createdAt` 字段实际不存在。** `SkimSession`/`PersistedSkimSession` 都没有 `createdAt`（[App.tsx:98-113](App.tsx#L98-L113)），创建时刻只内嵌在 `id` 字符串里。tutor 若需时间排序应显式新增。

3. **session 没有 title/name，标签是按下标硬编码「略读 N」**（[App.tsx:2255](App.tsx#L2255)）。tutor 想要可命名会话需自带字段 + UI。

4. **`handleSend` 在「无文档内容」时直接 return**（[SkimPanel.tsx:620](features/reader/skim/SkimPanel.tsx#L620)，content 取自 `pdfDataUrl||fullText`）。任务设想的「先弹开场白、用户再发材料」纯对话起手式，**当前逻辑发不出消息**，必须放宽这个 guard（或把首份材料当 images/文本喂入）。

5. **切换器不是组件，是 App 级内联 JSX + App 级 state**（[App.tsx:2240-2278](App.tsx#L2240-L2278)），且死锁在 `viewMode==='skim'` 分支。tutor 标签栏需另写一套（或借机抽通用组件）；tutor 显示大概率需新增 `viewMode`。

6. **已存在大量同主题的前置 recon/impl 文档**，决策前值得先读：[docs/SKIM_VS_EXAM_TUTOR_API.md](docs/SKIM_VS_EXAM_TUTOR_API.md)、[SKIM_MULTISESSION_RECON.md](SKIM_MULTISESSION_RECON.md)、[SKIM_MULTISESSION_IMPL.md](SKIM_MULTISESSION_IMPL.md)、[SKIM_PAGERANGE_RECON.md](SKIM_PAGERANGE_RECON.md)。本报告结论与其不冲突，但它们记录了多会话/页码的既有决策脉络。

7. **考前已有一个「苏格拉底纯对话」组件 `ExamWorkspaceSocraticChat`**（[features/exam/workspace/ExamWorkspaceSocraticChat.tsx](features/exam/workspace/ExamWorkspaceSocraticChat.tsx)），乍看像 tutor 模板，但实际绑死 KC/chunk/citations/支架，**比 SkimPanel 的 tutoring 路径更重**，不宜作模板（见 Q4 影响）。

---

*报告结束。按任务要求，停在此处，等待审阅后再决定下一步。*
