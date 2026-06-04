# SKIM_MULTISESSION_RECON — 略读「多会话并存 + 云端同步」可行性侦察

> 纯只读侦察，未改任何文件、未做 git 操作。
> 结论先行：**当前「一个文件 = 一份略读状态」是写死在数据模型最底层的——略读状态不是一个可复制的对象，而是 4 个散落的 App 顶层 state（`studyMap` / `skimMessages` / `skimStage` / `quizData`），它们以扁平字段直接拼进 IndexedDB 的 `FilePersistedState` 和云端 session 的 heavy 文档里，全程没有任何「列表 / 数组 / 会话 id」维度。** 扩成多份并存的核心工作量不在 UI，而在「把这 4 个单值改成列表 + 激活索引」，并贯穿 state 定义、两条持久化写入、两条恢复读取。好消息：读取恢复有**唯一汇聚点**（`processFile` 的 restore 块），是干净的迁移切入口；坏消息：**没有任何 schema version 字段**可区分新旧格式，只能靠「新列表字段是否存在」来判断；且生成中状态（`isChatLoading` / abort controller）是 SkimPanel 组件内部、**不按会话隔离**，切换时有写错会话的隐患。

---

## Q1. 一份略读状态当前由哪些字段组成

### 结论（一句话）
「一次略读」由 **4 个会持久化的 App 顶层 state**（`studyMap`、`skimMessages`、`skimStage`、`quizData`）+ 2 个会持久化的 UI 态（`skimTopHeight`、`skimFocusMode`）构成；而 **module 数量、节奏、页码范围、"读到第几个 module" 这些都不是持久化字段**——前三者是 SkimPanel 组件内部临时 state，"进度"则根本没有独立字段，只隐含在 `skimMessages` 对话历史里。

### 证据

**会持久化的略读核心 state（定义在 App，类型见 types.ts）：**

| 字段 | 定义 | 类型 | 初值来源 | 性质 |
|---|---|---|---|---|
| `studyMap` | [App.tsx:126](App.tsx#L126) | `StudyMap \| null`（[types.ts:97](types.ts#L97)） | 文件打开时后台诊断 `performPreFlightDiagnosis(整本,{moduleCount:4})` 生成（[App.tsx:721](App.tsx#L721)），或 `handleRegenerateStudyMap` 重算（[App.tsx:1878](App.tsx#L1878)） | 学习地图，**要保存** |
| `skimMessages` | [App.tsx:102](App.tsx#L102) | `ChatMessage[]` | 初值 `[]`，恢复时 `setSkimMessages(stateToRestore.skimMessages)` | 领读对话全文，**要保存** |
| `skimStage` | [App.tsx:111](App.tsx#L111) | `SkimStage`＝`'diagnosis'\|'tutoring'\|'quiz'\|'reading'`（[types.ts:280](types.ts#L280)） | 初值 `'diagnosis'`，恢复时回填 | 当前阶段，**要保存** |
| `quizData` | [App.tsx:112](App.tsx#L112) | `QuizData \| null` | 初值 `null`，`triggerQuiz` 时 `generateGatekeeperQuiz` 生成 | 守门测验题，**要保存** |
| `skimTopHeight` | [App.tsx:103](App.tsx#L103) | `number`（默认 60） | UI 拖拽分隔条 | UI 态但**已纳入保存** |
| `skimFocusMode` | [App.tsx:104](App.tsx#L104) | `boolean`（默认 false） | UI 专注模式开关 | UI 态但**已纳入保存** |

辅助：`studyMapModuleCount`（[App.tsx:127](App.tsx#L127)，`number\|null`）是 App state，但**不进任何持久化结构**，文件打开时被重置（见 Q4）。`docType`（[App.tsx:110](App.tsx#L110)）是理科/社科开关，略读与深读共用、会保存。

**不持久化的略读态（SkimPanel 组件内部 useState，刷新即丢）：**
```ts
const [isChatLoading, setIsChatLoading]   = useState(false);          // SkimPanel.tsx:229
const [isRegeneratingMap, ...]            = useState(false);          // :235
const [showGranularityModal, ...]         = useState(false);          // :236
const [selectedModuleCount, ...]          = useState<number>(4);      // :237  ← module 数量
const [skimPace, ...]                     = useState<'module'|'part'>('module'); // :238 ← 节奏
const [pageRangeStart, ...]               = useState<number|null>(null);  // :240 ← 页码范围(本分支已加)
const [pageRangeEnd, ...]                 = useState<number|null>(null);  // :241
const [moduleTakeaways, ...]              = useState<string[]|null>(null);// :246 ← 本模块要点
```
（[SkimPanel.tsx:229-246](features/reader/skim/SkimPanel.tsx#L229-L246)，行内注释亦写明「不持久化」）

### 意外发现 / 与假设不符
- **「读到第几个 module / part」根本没有独立字段。** 文档假设里列了「进度」，但代码中找不到 `currentModule` / `moduleProgress` 之类的 state。进度完全隐含在 `skimMessages`（对话历史）里——略读靠对话推进，没有结构化游标。**这意味着多会话要「各自有进度」，进度天然等于「各自有 `skimMessages`」，不需要额外造进度字段。**
- 用户期望「每段有自己的页码范围 / module 数」，但这三项**当前压根不保存**（SkimPanel 内部态）。要让每段记住它们，多会话方案必须**把它们从 SkimPanel 内部提升为「每会话持久字段」**——这是新增工作，不是「把现有单值改列表」能覆盖的。
- `docType` 是略读/深读共用的单一开关，不是略读专属。若每段略读想各自有 docType，需要额外拆分。

---

## Q2. 这份状态当前如何写入云端 / 本地

### 结论（一句话）
略读状态走**两条并行的防抖自动保存**：本地 IndexedDB 一条记录/文件（key = `fileHash`，略读字段塞进 `FilePersistedState.state`），云端 Firestore 一条 session/文件（root meta 文档 + `sessions/{id}/data/main` heavy 文档，略读字段作为 **heavy 文档里的扁平顶层字段**散落存放）；**两处都没有「会话列表」结构，略读状态就是这条文件记录的一部分**。

### 证据

**本地 IndexedDB**（[services/storageService.ts](services/storageService.ts)）：
- DB `ReadingAssistantDB` / store `fileHistory` / `keyPath: 'hash'`（[storageService.ts:4-20](services/storageService.ts#L4-L20)）→ **一个文件一条记录，key 是 fileHash**。
- 记录形状 `FileHistoryItem = { hash, name, lastOpened, state: FilePersistedState }`（[types.ts:618-623](types.ts#L618-L623)）。
- 写入：防抖 2s 的 effect [App.tsx:611-654](App.tsx#L611-L654)，把 `skimMessages / studyMap / skimStage / quizData / skimTopHeight / skimFocusMode` 等**平铺**进 `state:{...}`（[App.tsx:622-643](App.tsx#L622-L643)）→ `storageService.saveFileState(item)`。

**云端 Firestore**（[services/firebase.ts](services/firebase.ts)）：
- 一条 session = **两个文档**：root meta 文档 `sessions/{id}` + heavy 子文档 `sessions/{id}/data/main`。`createCloudSession` 同时建这俩（[firebase.ts:201-243](services/firebase.ts#L201-L243)），heavy 初值含 `skimMessages:[]`、`skimTopHeight:60`、`skimFocusMode:false` 等（[firebase.ts:220-233](services/firebase.ts#L220-L233)）。
- 写入：防抖 3s 的 effect [App.tsx:656-664](App.tsx#L656-L664) → `updateCloudSessionState(currentSessionId, {...所有字段})`。
- `updateCloudSessionState` 用 `splitUpdateData` 按 `META_KEYS` 分流（[firebase.ts:291-315](services/firebase.ts#L291-L315)）：`META_KEYS = {id,userId,fileName,customTitle,fileUrl,downloadUrl,createdAt,updatedAt,sortIndex,type,parentId}`（[firebase.ts:173-176](services/firebase.ts#L173-L176)）进 root，**其余一切（含全部略读字段）进 heavy `data/main`**。

**一条云 session 的形状** = `CloudSession`（[types.ts:626-670](types.ts#L626-L670)）：
```ts
export interface CloudSession {
  id; userId; fileName; fileUrl; createdAt; type; parentId; customTitle?; sortIndex?;  // meta
  // ↓↓↓ 全部模式的状态平铺在一起，略读只是其中几个字段：
  chatCache?; explanations?; annotations?; notebookData?;
  skimMessages?: ChatMessage[];      // ← 略读对话
  viewMode?; studyMap?: StudyMap|null;// ← 略读地图
  skimStage?: SkimStage;             // ← 略读阶段
  quizData?: QuizData|null;          // ← 略读测验
  skimTopHeight?; skimFocusMode?;    // ← 略读 UI
  currentIndex?; reviewQuizRounds?; ... lsapContentMap?; lsapState?;  // 其它模式
}
```
→ **略读状态是散落的多个扁平字段，不是一个嵌套的 `skim` 对象**；和深读 / 递进 / 复习 / L-SAP 的字段混在同一个 heavy 文档里。

**读取 / 恢复路径**（两条最终都汇入 `processFile`）：
- **云端**：`handleRestoreCloudSession`（[App.tsx:790-838](App.tsx#L790-L838)）→ `fetchSessionDetails(id)` 读 heavy 文档（[firebase.ts:277-289](services/firebase.ts#L277-L289)）→ `fullData = {...session, ...heavyDetails}` → 组装 `restoreData: Partial<FilePersistedState>`（[App.tsx:798-823](App.tsx#L798-L823)，逐字段 `studyMap/skimMessages/skimStage/quizData/...`）→ `processFile(file, restoreData, ...)`。
- **本地**：`processFile` 内 `storageService.getFileState(hash)`（[App.tsx:700](App.tsx#L700)）→ `existingRecord.state`。
- **回填 state**：`processFile` 的 restore 块（[App.tsx:702-712](App.tsx#L702-L712)）：
  ```ts
  setSkimMessages(stateToRestore.skimMessages || []); ...
  setStudyMap(stateToRestore.studyMap || null); setStudyMapModuleCount(null);
  setSkimStage(stateToRestore.skimStage || 'diagnosis'); setQuizData(stateToRestore.quizData || null);
  setSkimTopHeight(stateToRestore.skimTopHeight || 60); setSkimFocusMode(stateToRestore.skimFocusMode ?? false);
  ```

### 意外发现 / 与假设不符
- **本地与云端是两套独立 schema**（`FilePersistedState` vs `CloudSession`），字段高度重叠但**各列一份**，多会话改造要**两处都改**，否则本地/云端格式会漂移。
- 云端写入是「整包覆盖式」防抖更新（每次把所有当前 state 重写进 heavy 文档），不是增量 patch 某个会话——这对「多会话只改激活那段」不友好：改一段会重写整包。
- 本地 IndexedDB `DB_VERSION = 1`（[storageService.ts:5](services/storageService.ts#L5)），`onupgradeneeded` 只建 store、**没有任何数据迁移逻辑**（[storageService.ts:17-22](services/storageService.ts#L17-L22)）。

---

## Q3. 扩成「多份并存」要动哪些地方

### 结论（一句话）
要把「单份」改成「列表 + 激活索引」，得动**七处**：①App 的 4 个略读 state 定义 ②IndexedDB 保存拼装（App.tsx:611-654）③云端保存拼装（App.tsx:656-664）④`FilePersistedState` 与 `CloudSession` 两个类型 ⑤`createCloudSession` heavy 初值 ⑥两条恢复路径（`handleRestoreCloudSession` + `processFile` restore 块）⑦SkimPanel 消费处；**但对 SkimPanel 的接口冲击可以做到很小**——只要 App 负责「从列表取激活那份」并把切片喂给现有 props，SkimPanel 本身几乎不用改。

### 证据

**SkimPanel 当前消费的「单份」props 清单**（[SkimPanel.tsx:21-53](features/reader/skim/SkimPanel.tsx#L21-L53)，App 传值见 [App.tsx:2095-2116](App.tsx#L2095-L2116)）：
```ts
studyMap: StudyMap | null;                                  // ← 单份地图
messages: ChatMessage[];                                    // ← 单份对话
setMessages: React.Dispatch<SetStateAction<ChatMessage[]>>; // ← 函数式更新器
topHeight / setTopHeight;  focusMode / setFocusMode;        // ← 单份 UI
stage: SkimStage; setStage;  quizData; setQuizData;         // ← 单份阶段/测验
pdfDataUrl; fullText; totalPages; docType; ...
onRegenerateStudyMap?: (moduleCount, contentOverride?) => Promise<StudyMap|null>;
studyMapModuleCount?: number | null;
```
→ SkimPanel **直接消费单份 props**，完全不知道「会话 / 列表」概念。

**需要改动的位置（逐项）：**
1. **App state 定义**：`studyMap`/`skimMessages`/`skimStage`/`quizData`（[App.tsx:126,102,111,112](App.tsx#L102)）四个单值 → 改为「会话数组 + activeIndex」。`studyMapModuleCount`（127）及理想中要每会话保存的 `selectedModuleCount`/`skimPace`/`pageRange`（现 SkimPanel 内部）一并纳入会话对象。
2. **IndexedDB 保存拼装**：[App.tsx:619-647](App.tsx#L619-L647) 的 `state:{...}`。
3. **云端保存拼装**：[App.tsx:660](App.tsx#L660) 的 `updateCloudSessionState({...})`。
4. **类型**：`FilePersistedState`（[types.ts:578-616](types.ts#L578-L616)）+ `CloudSession`（[types.ts:626-670](types.ts#L626-L670)）各加「略读会话列表」字段（扁平 skim 字段保留作旧格式兼容）。
5. **`createCloudSession` heavy 初值**：[firebase.ts:220-233](services/firebase.ts#L220-L233) 加列表默认值。`splitUpdateData` 无需改（新字段非 META_KEY，自动落 heavy）。
6. **恢复读取**：`handleRestoreCloudSession` 的 `restoreData` 组装（[App.tsx:798-823](App.tsx#L798-L823)）+ `processFile` 的回填块（[App.tsx:702-712](App.tsx#L702-L712)）。
7. **SkimPanel 消费**：见下。
8. **（全新）顶部标签横栏 UI**：代码里**没有**任何略读内的多标签组件——顶栏现有的是 `viewMode`（deep/skim/layered）切换，不是略读会话切换。这是纯新增。

**对 SkimPanel 接口的冲击评估：**
- **可做到接近零冲击**：App 用 `sessions[activeIndex]` 派生出 `studyMap/messages/stage/quizData/...` 喂给现有 props 即可，SkimPanel 内部逻辑不动。
- **唯一摩擦点是几个 setter**：`setMessages` 是 `Dispatch<SetStateAction<ChatMessage[]>>`，SkimPanel 里用了函数式更新 `setMessages(prev => [...prev, msg])`（如 [SkimPanel.tsx:533ish](features/reader/skim/SkimPanel.tsx) 的 handleSend）。App 要提供一个**包装 setter**，把对「单份 messages」的函数式更新映射到 `sessions[activeIndex].messages` 上。`setTopHeight`/`setFocusMode` 同理（也是 Dispatch 型）；`setStage`/`setQuizData` 是普通 `(v)=>void`，包装更简单。这些包装器是改造的主要细活，但都在 App 侧，SkimPanel 的 props 形状可保持不变。

### 意外发现 / 与假设不符
- SkimPanel 是 `viewMode === 'skim'` 时**条件渲染**（[App.tsx:2094](App.tsx#L2094)），切走再切回会**卸载/重挂**，其内部 state（module 数、页码范围、生成中状态）本就会丢。多会话「标签切换」如果靠卸载/重挂，会放大这个问题。
- `onRegenerateStudyMap` 直接 `setStudyMap`（App 单值，[App.tsx:1882](App.tsx#L1882)）。多会话下它必须改成「写进激活会话的 map」，否则重算会污染全局单值——这是 Q5 隐患的一部分。

---

## Q4. 老数据迁移

### 结论（一句话）
旧记录就是 Q2 描述的「扁平单份」：IndexedDB 的 `FilePersistedState` 和云端 heavy 文档里直接躺着 `skimMessages/studyMap/skimStage/quizData`；**全程没有任何 version / schema 字段**，只能靠「新列表字段是否存在」来区分新旧；而 `processFile` 的 restore 块（[App.tsx:702-712](App.tsx#L702-L712)）是**两条恢复路径的唯一汇聚点**，是把「旧单份」就地包成「列表第一段」的干净切入口。

### 证据

**旧格式结构**：
- 本地：`FilePersistedState`（[types.ts:578-616](types.ts#L578-L616)）—— `skimMessages: ChatMessage[]`、`studyMap: StudyMap|null`、`skimStage?`、`quizData?` 平铺。
- 云端：`CloudSession` heavy 文档（[types.ts:642-669](types.ts#L642-L669)）—— 同样平铺。

**无版本号 / schema version**：
- `FilePersistedState`（[types.ts:578-616](types.ts#L578-L616)）通读**无 `version` / `schemaVersion` 字段**。
- `CloudSession`（[types.ts:626-670](types.ts#L626-L670)）同样**无版本字段**。
- IndexedDB `DB_VERSION = 1`（[storageService.ts:5](services/storageService.ts#L5)）是数据库结构版本，不是记录内容版本，且 `onupgradeneeded` 无迁移逻辑（[storageService.ts:17-22](services/storageService.ts#L17-L22)）。
- → **区分新旧只能靠特征**：「新的略读会话列表字段 === undefined 且 `skimMessages`/`studyMap` 有值」⇒ 旧单份。

**干净的迁移切入口**：
- 云端读取经 `handleRestoreCloudSession`（[App.tsx:790-823](App.tsx#L790-L823)）→ 组装 `restoreData` → `processFile(file, restoreData,...)`。
- 本地读取经 `processFile` 内 `getFileState(hash)`（[App.tsx:700-701](App.tsx#L700-L701)）→ `existingRecord.state`。
- **两条都汇入 `processFile` 的 restore 块**（[App.tsx:702-712](App.tsx#L702-L712)），逐字段 `setStudyMap/setSkimMessages/setSkimStage/setQuizData`。这是**唯一**把持久化数据落回运行态的地方 → 在此处判断「新列表字段缺失 ⇒ 用旧的 `skimMessages/studyMap/skimStage/quizData` 包一个 `[{...}]` 列表、activeIndex=0」即可一处覆盖本地+云端两条来源。

### 意外发现 / 与假设不符
- `processFile` restore 块里有一句 `setStudyMapModuleCount(null)`（[App.tsx:704](App.tsx#L704)）——即**模块数从不从持久化恢复**，每次打开都归零。旧数据里没存过 module 数，迁移时这一段只能给默认值，无法还原用户当初选的 7。
- 因为本地/云端**两套类型**都要加列表字段且都无版本号，迁移判断逻辑虽然能集中在 `processFile`，但**类型层面**得在 `FilePersistedState` 和 `CloudSession` 同时保留「旧扁平字段（可选）+ 新列表字段（可选）」并存一段时间，不能直接删旧字段，否则旧记录读不出来。

---

## Q5. 切换 / 并发的隐患（只侦察）

### 结论（一句话）
领读对话**不是流式**（一次性 `await generateContent` 返回整段），但生成过程是异步长任务；而**「生成中」的全部状态（`isChatLoading`、abort controller、取消标志）都是 SkimPanel 组件内部、不按文件/会话隔离**，`skimMessages` 又是 App 单值——所以一段正在生成时切到另一段，回包很可能被追加到**错误的会话**；studyMap 重算也无互斥、且直接写全局单值 `studyMap`，多段并存会互相覆盖。

### 证据

**非流式**：`chatWithSkimAdaptiveTutor` 用 `await ai.models.generateContent(...)`（[geminiService.ts:2188](services/geminiService.ts#L2188)），返回 `response.text`（[geminiService.ts:2197](services/geminiService.ts#L2197)）——单次 await，无 `generateContentStream`（全仓库 grep 无 `generateContentStream`）。

**生成中状态不隔离（组件内部）**：
```ts
const [isChatLoading, setIsChatLoading] = useState(false);     // SkimPanel.tsx:229
const skimAbortControllerRef = useRef<AbortController|null>(null); // :268
skimAbortControllerRef.current = abortController;               // :626
setMessages(prev => [...prev, aiMsg]);  // 回包追加到当前 messages prop
```
（[SkimPanel.tsx:229,268,500,626,656-657](features/reader/skim/SkimPanel.tsx#L626)）
- 这些都是 SkimPanel 实例内部，**不带 fileHash / sessionId**。
- 回包通过 `setMessages`（= App 的 `setSkimMessages` 单值）写入。多会话下若切换只是改 props（不卸载），**resolve 的回包会写进切换后那段的 messages**；若切换靠卸载/重挂，则 in-flight 的 abort controller 丢失、回包落空。无论哪种，都**没有「这条回复属于哪个会话」的归属判断**。

**studyMap 重算无互斥、写全局单值**：
- `isStudyMapLoading` 是 **App 全局** state（[App.tsx:131](App.tsx#L131)），传给 SkimPanel 的 `isLoading`（[App.tsx:2097](App.tsx#L2097)）——全局一个 loading，不分会话。
- `isRegeneratingMap` 是 SkimPanel 内部（[SkimPanel.tsx:235](features/reader/skim/SkimPanel.tsx#L235)）。
- `handleRegenerateStudyMap` 直接 `setStudyMap(map); setStudyMapModuleCount(moduleCount)`（[App.tsx:1881-1882](App.tsx#L1881-L1882)）——**写全局单值，无按会话隔离、无互斥锁**。
- 文件打开时的后台诊断用 `Promise.race` + 90s 超时（[App.tsx:721-731](App.tsx#L721-L731)），也是 `setStudyMap` 全局单值。
- → 多段并存且各自重算时，谁后 resolve 谁覆盖全局 `studyMap`，会串台。

**自动保存也按单一 `currentSessionId` / `fileHash`**：两条保存 effect 的 key 是 `fileHash`（[App.tsx:612](App.tsx#L612)）和 `currentSessionId`（[App.tsx:657](App.tsx#L657)）——同一文件多段略读 = 同一 fileHash / 同一云 session，会写进同一条记录的同一个 heavy 文档；防抖（2s/3s）下快速切换会互相覆盖中间态。

### 意外发现 / 与假设不符
- 已有**双重防误追加**保险：`abortController.signal.aborted || skimGenerationCancelledRef.current` 两道判断（[SkimPanel.tsx:531,535](features/reader/skim/SkimPanel.tsx)）——但它防的是「同一组件内 abort 后 SDK 仍 resolve」，**不防「写到错误会话」**，因为这两个标志同样不带会话归属。
- `isLoading`（全局）已经是「全局一个略读 loading」，多会话 UI 上无法表达「A 段在转圈、B 段空闲」——这是现成的单值瓶颈。

---

## 事实层面小结（不含方案）

1. **略读状态 = 4 个散落的 App 单值**（`studyMap`/`skimMessages`/`skimStage`/`quizData`）+ 2 个 UI 单值（`skimTopHeight`/`skimFocusMode`）；module 数 / 节奏 / 页码范围是 SkimPanel 内部临时态、**不保存**；"进度"无独立字段，隐含在对话里。([Q1])
2. **持久化是两套并行的扁平 schema**：IndexedDB `FilePersistedState`（key=fileHash，一文件一条）+ 云端 `CloudSession`（root meta + `data/main` heavy 子文档），略读字段在两处都**平铺**、与其它模式混存，**全程无列表维度**。([Q2])
3. **扩多份要动 7+1 处**（4 个 state、2 条保存、2 个类型、heavy 初值、2 条恢复、SkimPanel 消费、全新标签栏 UI）；但**对 SkimPanel 接口可做到近零冲击**——靠 App 派生激活会话切片 + 包装 setter，唯一细活是 `setMessages` 等函数式更新器的映射。([Q3])
4. **无任何 schema version**，新旧只能靠「新列表字段是否存在」区分；`processFile` 的 restore 块（App.tsx:702-712）是本地+云端两条恢复的**唯一汇聚点**，是干净的就地迁移切入口；但 module 数等本就没存过，旧数据迁移只能补默认值。([Q4])
5. **非流式**但异步长任务；**生成中状态（isChatLoading/abort）是组件内部、不按会话隔离**，`skimMessages` 是单值，切换有「回包写错会话」隐患；studyMap 重算**无互斥、写全局单值**，多段并存会串台；自动保存按单一 fileHash/sessionId，快速切换会覆盖中间态。([Q5])

> 按要求到此停下，不提任何方案，等你看完报告再说。
