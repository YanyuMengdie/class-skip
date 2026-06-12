# RECON 报告：略读多 session 云端存档保存问题

> 档位：RECON（只读侦察）。本文件只陈述事实，不下结论、不提修改建议。

## 1. session 数据结构

### 运行时类型 `SkimSession`（App.tsx:100-115）

```typescript
interface SkimSession {
  id: string;
  studyMap: StudyMap | null;
  messages: ChatMessage[];
  stage: SkimStage;
  quizData: QuizData | null;
  moduleCount: number;
  skimPace: 'module' | 'part';
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  studyMapModuleCount: number | null;
  topHeight: number;
  focusMode: boolean;
  /** 方案 A：true = 跳过诊断开场，直接进配置区（仅「+」新建段）；首段/恢复段为 false，走完整诊断 */
  skipDiagnosis: boolean;
}
```

### 持久化镜像 `PersistedSkimSession`（types.ts:583-597）

与运行时同形（注释明确写「与 App 运行时的 SkimSession 同形」），字段完全一致。

### `ChatMessage`（types.ts:17-28）

```typescript
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  /** @deprecated 用 images 数组,本字段仅为历史数据兼容保留;读取请走 getMessageImages() */
  image?: string;
  /** 新写入路径只填这个字段;读取请走 getMessageImages() 兼容旧 image */
  images?: string[];
  timestamp: number;
  isQuiz?: boolean;
  examChunkCitationSnapshot?: ExamChunkCitationSnapshot;
}
```

### `StudyMap`（types.ts:97-101）

```typescript
export interface StudyMap {
  topic: string;
  prerequisites: Prerequisite[];
  initialBriefing: string;
}
```

### PDF 原始数据 / base64 / 图片的存放位置（标注）

- **PDF 原文件**：不在 session 结构里。运行时存于 `pdfDataUrl` state（App.tsx:206），云端只存引用 `fileUrl`（types.ts:674，注释 `// Empty string if type is 'folder'`）。`CloudSession` 的 heavy 数据里**没有** `pdfDataUrl` 字段。
- **聊天图片（base64）**：**直接内联存在 session 里**。`ChatMessage.images?: string[]` 装的是 base64 data URL。来源链路：粘贴图片 → `readFileAsDataURL(file)` → `setPendingImages`（SkimPanel.tsx:602-603）→ 发送时写入 `userMsg.images = pendingImages`（SkimPanel.tsx:634-640）→ 进入 `messages[]`，随 session 一起持久化。

```typescript
// SkimPanel.tsx:602-603
Promise.all(imageFiles.map((file) => readFileAsDataURL(file)))
    .then((dataUrls) => setPendingImages((prev) => [...prev, ...dataUrls]))

// SkimPanel.tsx:634-640
const userMsg: ChatMessage = {
    role: 'user',
    text: trimmed,
    ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
    timestamp: Date.now(),
};
setMessages(prev => [...prev, userMsg]);
```

---

## 2. 写入 Firestore 的路径

### 云端文档结构：meta 文档 + 单个 heavy 子文档

会话被拆成两份文档（firebase.ts:201-251 `createCloudSession`）：
- meta 根文档：`sessions/{sessionId}`
- heavy 子文档：`sessions/{sessionId}/data/main`（路径见 firebase.ts:237）

### 字段路由 `splitUpdateData`（firebase.ts:173-197）

```typescript
const META_KEYS = new Set([
    'id', 'userId', 'fileName', 'customTitle', 'fileUrl', 'downloadUrl',
    'createdAt', 'updatedAt', 'sortIndex', 'type', 'parentId'
]);

const splitUpdateData = (data: Partial<CloudSession>) => {
    const metaUpdates: any = {};
    const heavyUpdates: any = {};
    Object.entries(data).forEach(([key, value]) => {
        if (value === undefined) return;
        if (META_KEYS.has(key)) {
            metaUpdates[key] = value;
        } else {
            heavyUpdates[key] = value;   // 其余全部进 heavy 子文档
        }
    });
    return { metaUpdates, heavyUpdates };
};
```

**关键事实**：`skimSessions` 不在 `META_KEYS` 里，连同 `chatCache / explanations / annotations / notebookData / pageComments / skimMessages / studyMap / savedArtifacts / reviewFlashCards` 等所有重字段，**全部写进同一个 heavy 子文档 `data/main`**。整个 `skimSessions` 数组（含所有 session 的所有 messages 及内联 base64 图片）是**一份文档里的一个字段**，没有按 session 再拆分。

### 主要写入函数 `updateCloudSessionState`（firebase.ts:293-317）

```typescript
export const updateCloudSessionState = async (sessionId: string, data: Partial<CloudSession>) => {
  try {
    const { metaUpdates, heavyUpdates } = splitUpdateData(data);
    const promises = [];
    if (Object.keys(metaUpdates).length > 0) {
        metaUpdates.updatedAt = Timestamp.now();
        const rootRef = doc(db, "sessions", sessionId);
        const cleanMeta = JSON.parse(JSON.stringify(metaUpdates));
        promises.push(updateDoc(rootRef, cleanMeta));
    }
    if (Object.keys(heavyUpdates).length > 0) {
        const heavyRef = doc(db, "sessions", sessionId, "data", "main");
        const cleanHeavy = JSON.parse(JSON.stringify(heavyUpdates));
        promises.push(updateDoc(heavyRef, cleanHeavy));   // ← skimSessions 走这里，整包覆盖
    }
    if (promises.length > 0) {
        await Promise.all(promises);
    }
  } catch (error) {
    console.error("[Sync] Update Failed:", error);   // ← 错误只 console.error，被吞掉，不抛出、不回传调用方
  }
};
```

**错误处理（原样）**：唯一的 `catch` 仅 `console.error("[Sync] Update Failed:", error)`。**错误被吞掉**——不 re-throw、不返回失败状态、无任何 UI 提示。调用方（App.tsx:756-762 的 `setTimeout` 里）`updateCloudSessionState(...)` 调用时**未 await、未 .catch**，因此即便函数内部不吞，调用点也不接收结果。

其它 Firestore 写入位置：`setDoc`/`updateDoc`/`addDoc` 均集中在 services/firebase.ts（grep 命中行：16-18 import；239-240 createCloudSession；271 createCloudFolder；302/308 updateCloudSessionState；322/332 rename/move；384/423/462/556/576/624/676 等为 events/memos/tutorSessions/exams 子集合，与略读 session 无关）。

---

## 3. 保存触发时机

### 云端保存 effect（App.tsx:754-765）

```typescript
useEffect(() => {
  if (!currentSessionId || !user) return;
  const cloudSaveTimeout = setTimeout(() => {
    updateCloudSessionState(currentSessionId, {
      // 阶段三：把完整 skimSessions + activeSkimIndex 一并写云端（整包覆盖，冲突走「后写覆盖」策略 A）。
      ...(isUntouchedSkimMigration() ? {} : { skimSessions, activeSkimIndex }),
      explanations, chatCache, annotations, notebookData, pageComments, skimMessages, viewMode,
      studyMap: studyMap ? JSON.parse(JSON.stringify(studyMap)) : null,
      layeredReadingState: layeredReadingState ? JSON.parse(JSON.stringify(layeredReadingState)) : null,
      skimStage, quizData, docType, skimTopHeight, skimFocusMode, currentIndex,
      /* ...其余字段... */
    });
  }, 3000);
  return () => clearTimeout(cloudSaveTimeout);
}, [currentSessionId, user, explanations, chatCache, annotations, skimMessages, /* ... */ skimSessions, activeSkimIndex, isUntouchedSkimMigration, /* ... */]);
```

- 触发方式：debounce `setTimeout` 3000ms；依赖数组含 `skimSessions / activeSkimIndex / skimMessages` 等，任一变化重排 timer。
- 本地保存 effect 同形，debounce 2000ms（App.tsx:705-752），写 IndexedDB。

### snapshot / 闭包定位情况（重点核查，原样）

**写入 effect 内未对 `skimSessions` 做额外 snapshot**——它直接闭包捕获 effect 渲染时的 `skimSessions` / `activeSkimIndex` 值，3 秒后整包写出。`activeSkimIndex` 作为 effect 闭包值被直接写入云端字段（`{ skimSessions, activeSkimIndex }`）。

**单段更新的定位机制（与上面不同的路径）**：所有 session 内容修改走包装 setter `updateActiveSkimSession`，它**按 id 定位、明确避开 `activeSkimIndex` 闭包**（App.tsx:155-176）：

```typescript
/** 始终指向当前激活会话 id；所有包装 setter 按此 id 定位，绝不用 activeSkimIndex 闭包，异步回包也只写自己那段 */
const activeIdRef = useRef<string | null>(null);
// ...
const activeSkim = skimSessions[activeSkimIndex] ?? skimSessions[0];
activeIdRef.current = activeSkim?.id ?? null;   // 每次渲染同步刷新
// ...
const updateActiveSkimSession = useCallback((updater: (s: SkimSession) => SkimSession) => {
    const id = activeIdRef.current;
    if (id == null) return;
    setSkimSessions(prev => prev.map(s => (s.id === id ? updater(s) : s)));   // 按 id 精准定位
}, []);
```

`setSkimMessages` 即由此实现（App.tsx:178-181）：

```typescript
const setSkimMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
  value => updateActiveSkimSession(s => ({ ...s, messages: typeof value === 'function' ? (value as (p: ChatMessage[]) => ChatMessage[])(s.messages) : value })),
  [updateActiveSkimSession]
);
```

`SkimPanel` 写新对话即调用此 `setMessages`（SkimPanel.tsx:640、SkimPanel.tsx:674）。

**「读旧不毁旧」抑制开关**（与「新记录没保存上」直接相关，原样）——App.tsx:197-202：

```typescript
const isUntouchedSkimMigration = useCallback(
  () => migratedSkimBaselineRef.current !== null && skimSessions === migratedSkimBaselineRef.current,
  [skimSessions]
);
```

当 `isUntouchedSkimMigration()` 为 true 时，保存 effect 用 `...(isUntouchedSkimMigration() ? {} : { skimSessions, activeSkimIndex })` **不写 `skimSessions`**（App.tsx:760、本地 App.tsx:730）。该 ref 在旧格式迁移时被设为迁移列表的引用（App.tsx:828），新格式 / 全新文件时置 null（App.tsx:813、App.tsx:843）。其判定依赖 `skimSessions === migratedSkimBaselineRef.current` 的引用相等。

---

## 4. 单 session 体量估算

### 字段层面的体积来源（按存储内容）

heavy 文档 `data/main` 包含的、随对话增长的字段：
- `skimSessions[]` —— 每个 session 的 `messages[]`（`text` 纯文字 + 可选 `images: string[]` base64）、`studyMap`（`topic`/`prerequisites[]`/`initialBriefing`）、`quizData`。
- 同时**并存**的旧扁平字段 `skimMessages`、`studyMap`、`quizData`（仍在写，见 App.tsx:761），以及 deep-read 侧的 `chatCache`、`explanations`、`annotations`、`notebookData`、`pageComments`、`savedArtifacts`、`reviewFlashCards` 等——**全部在同一份文档**。

### 纯文字 JSON 体积粗算（仅供参考的事实推算）

- 纯文字对话：一条较长 model 回复 ~1–4 KB UTF-8。重度对话假设 200 条 × 平均 2 KB ≈ **400 KB**；多 session（上限 `MAX_SKIM_SESSIONS = 10`，App.tsx:135）叠加在同一文档，纯文字即可达 **数百 KB ~ 接近 1 MB**。
- `studyMap` / `quizData`：每段通常 KB 级，量小。
- **base64 图片是体积主导项**：一张图 base64 后约为原始字节的 1.33×。单张截图常见 200 KB–1 MB+ 原始 → base64 后 ~270 KB–1.4 MB。**只要某 session 的 `messages[].images` 含一两张较大截图，单字段即可逼近或越过 1 MB**。这些 base64 内联在 `skimSessions` 里，与所有其它重字段共用同一 1 MB 文档。

Firestore 单文档硬上限为 1,048,576 字节（1 MiB），含字段名、索引等开销。

### 代码里是否有序列化大小测量

**没有**。全仓搜索 services/firebase.ts 与保存路径，未发现任何 `JSON.stringify(...).length` / `byteLength` / `TextEncoder` / `Blob.size` / `1048576` 之类对写入体积的测量或阈值检查。`updateCloudSessionState` 里 `JSON.parse(JSON.stringify(...))`（firebase.ts:301、firebase.ts:307）仅用于深拷贝/去 undefined，**不读取其长度**。写入前后无任何体积判断或日志。

---

## 报告结束

以上为原样捞出的事实。两处与「新记录没保存上」直接相关、但需人工判断的现象，均已原样贴出而未下结论：

1. heavy 文档为**单文档整包覆盖**，所有 session + 内联 base64 图片共用一份，无拆分、无体积测量（对应方向 A 的事实面）。
2. `updateCloudSessionState` 的 `catch` **吞错**（仅 console.error），调用点未 await/未 catch；另有 `isUntouchedSkimMigration()` 抑制开关基于引用相等决定**是否写出 `skimSessions`**（对应方向 B 的事实面）。
