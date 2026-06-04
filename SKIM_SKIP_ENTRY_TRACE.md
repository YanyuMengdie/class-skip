# 只读排查：跳过测验入口 — 页码范围 + module 数量未生效

> 纯只读追踪，未改任何代码。结论先行：**页码范围和 module 数量都「断」在 `handleStartWithModuleCount` → `startFormalReading` 这一段**，根因有两条相互叠加：
> 1. **裁剪后的小 PDF（`contentOverride`）从未传进 `onRegenerateStudyMap`** → study map 永远按整本 233 页重算；
> 2. **`startFormalReading` 里读到的 `studyMap` 是「重算之前」的旧闭包值**（4 模块、整本），它作为「【必须一致】以学习地图为准」的硬参考被注入领读对话，**压过了 `moduleCount=7` 的指令，也压过了已裁剪的 PDF 内容**。

---

## 环节 1：弹窗「开始领读」按钮接的是哪个函数？

**结论**：是 `handleStartWithModuleCount`。弹窗里的 `pageRangeStart/End`、`selectedModuleCount` 都正确绑定到组件 state，按钮也确实调它。这一环**没断**。

证据 — 弹窗 UI [SkimPanel.tsx:1539-1593](features/reader/skim/SkimPanel.tsx#L1539-L1593)：
```tsx
{showGranularityModal && onRegenerateStudyMap && (
  ...
  <select value={selectedModuleCount} onChange={(e) => setSelectedModuleCount(Number(e.target.value))}> ... </select>
  ...
  <PageRangeInput start={pageRangeStart} end={pageRangeEnd}
      onStartChange={setPageRangeStart} onEndChange={setPageRangeEnd}
      totalPages={totalPages} idPrefix="skim-modal" />
  <button onClick={handleStartWithModuleCount} disabled={!!pageRangeError} ...>
```
入口触发 [SkimPanel.tsx:479-485](features/reader/skim/SkimPanel.tsx#L479-L485)：`handleSkipToReading` 在 `onRegenerateStudyMap` 存在时 `setShowGranularityModal(true)`。

---

## 环节 2：`handleStartWithModuleCount` 内部的值流向

代码 [SkimPanel.tsx:468-477](features/reader/skim/SkimPanel.tsx#L468-L477)：
```ts
const handleStartWithModuleCount = async () => {
    if (pageRangeError) return;
    setShowGranularityModal(false);
    if (needRegenerate) {
        setIsRegeneratingMap(true);
        await onRegenerateStudyMap?.(selectedModuleCount);   // ← 只传 moduleCount，没有 contentOverride
        setIsRegeneratingMap(false);
    }
    startFormalReading();                                    // ← 没 await；裁剪在它内部才发生
};
```

**2a. `onRegenerateStudyMap` 传进去的 module 数量 = 用户选的 7？**
→ **是 7**（`selectedModuleCount`），module 数量在这一步本身传对了。
`needRegenerate` [SkimPanel.tsx:466](features/reader/skim/SkimPanel.tsx#L466)：
```ts
const needRegenerate = onRegenerateStudyMap && (studyMapModuleCount == null || studyMapModuleCount !== selectedModuleCount);
```
文件打开时后台诊断成功会 `setStudyMapModuleCount(4)`（见环节 4），用户选 7 → `4 !== 7` → `needRegenerate = true` → 确实会 `await onRegenerateStudyMap(7)`。

**2b.【关键】裁剪后的小 PDF（`contentOverride`）有没有传进 `onRegenerateStudyMap`？**
→ **没有，完全没传。** `onRegenerateStudyMap` 的签名只接 `moduleCount`，调用处也只给了 `selectedModuleCount`。`contentOverride` 是在 **`startFormalReading` 内部**才计算的（见 2c），`onRegenerateStudyMap` 根本拿不到它。所以 App 侧重算 study map 时用的是**原始整本** content。**页码范围在这一环断掉（study map 路径）。**

**2c. `startFormalReading` 的 `contentOverride` 与 `onRegenerateStudyMap` 用的 content 是同一份吗？**
→ **不是同一份。**
`startFormalReading` [SkimPanel.tsx:439-464](features/reader/skim/SkimPanel.tsx#L439-L464)：
```ts
const startFormalReading = async () => {
    setStage('reading');
    let contentOverride: string | undefined;
    if (pageRangeStart != null && pageRangeEnd != null && !pageRangeError && pdfDataUrl?.startsWith('data:application/pdf')) {
        contentOverride = await extractPdfPageRange(pdfDataUrl, pageRangeStart, pageRangeEnd);  // ← 裁剪只在这里
    }
    await handleSend(... ,
      'reading',
      { moduleCount: selectedModuleCount, studyMapBriefing: studyMap?.initialBriefing, skimPace },  // ← 注意 studyMap?.initialBriefing
      undefined, contentOverride);   // ← 裁剪 PDF 只喂给「领读对话」
};
```
- `onRegenerateStudyMap` 用的 content = App 侧的整本（见环节 3）。
- `startFormalReading` 的 `contentOverride` = 裁剪后的 148–188 小 PDF，且**只作为领读对话的 `inlineData` 文档**传下去。
- 两者**互不相干**：study map 按整本算，领读对话的「文档」按裁剪算 —— 但领读对话同时还被塞进了**整本的 study map 文字**（见环节 4 的根因二）。

**2d.【关键】`studyMap?.initialBriefing` 是旧值（stale closure）**
`startFormalReading` 在 `await onRegenerateStudyMap(7)` **之后**被调用，但它读的 `studyMap` 是**当前这次点击所在 render 的闭包值**——也就是重算**之前**的那份（4 模块、整本）。`onRegenerateStudyMap` 内部的 `setStudyMap(新7模块map)` 只会触发**之后**的重渲染，**不会改变正在执行的 `startFormalReading` 闭包里的 `studyMap`**。
→ 于是 `readingOptions.studyMapBriefing` = **旧的 4 模块整本简报**，连同 `moduleCount: 7` 一起发给模型。

---

## 环节 3：App 侧 `onRegenerateStudyMap` → `performPreFlightDiagnosis`

`handleRegenerateStudyMap` [App.tsx:1878-1883](App.tsx#L1878-L1883)：
```ts
const handleRegenerateStudyMap = async (moduleCount: number) => {
    const content = pdfDataUrl || fullPdfText;          // ← 永远是整本 233 页
    if (!content) return;
    const map = await performPreFlightDiagnosis(content, { moduleCount });   // ← content=整本, moduleCount=7
    if (map) { setStudyMap(map); setStudyMapModuleCount(moduleCount); }
};
```
- **content = 整本**（`pdfDataUrl || fullPdfText`），**不是裁剪后的小 PDF**。函数签名里压根没有接收裁剪内容的入口。
- `moduleCount = 7`（正确透传）。

`performPreFlightDiagnosis` [geminiService.ts:816-838](services/geminiService.ts#L816-L838)：
```ts
const contentPart = getContentPart(docContent);          // 整本 PDF inlineData
const n = options?.moduleCount;                           // 7
const moduleInstruction = (n>=2 && n<=8)
  ? `在 initialBriefing 中将文档拆解为 ${n} 个模块，每个模块写明页码范围与剧情/概要。`   // 按 7 拆
  : ...;
```
→ 它确实会生成一份**「整本 233 页、7 模块」**的新 study map，并 `setStudyMap`。但这份新 map **本次领读对话用不上**（被环节 2d 的旧闭包覆盖），白算了。

---

## 环节 4：study map 到底在哪生成、用什么 content 和 module 数

study map 有**两个生成点**，外加领读对话里的**第三处文字注入**：

**生成点 A — 文件打开时的后台诊断**（用户没点任何按钮就已跑） [App.tsx:716-731](App.tsx#L716-L731)：
```ts
const diagnosisContent = rawPdfData || fullText;                       // 整本
performPreFlightDiagnosis(diagnosisContent, { moduleCount: 4 })        // ← 默认 4 模块、整本
...
if (map) { setStudyMap(map); setStudyMapModuleCount(4); }              // ← studyMapModuleCount=4
```
这就是**那份「整本 + 4 模块」的 study map 的来源**，它在用户开弹窗之前就存在了。

**生成点 B — `handleRegenerateStudyMap`**（环节 3）：整本 + 7 模块。会跑，但结果被旧闭包废掉。

**第三处 — 领读对话里注入的「硬约束 + 必须一致」文字** `appendReadingModeUserMessageSuffix` [geminiService.ts:2002-2034](services/geminiService.ts#L2002-L2034)：
```ts
const n = readingOptions.moduleCount;                       // 7
const hasModuleCount = ...;                                 // true
const brief = readingOptions.studyMapBriefing?.trim();      // ← 旧 4 模块整本简报（环节 2d）

if (hasModuleCount) {
  out += `【领读模块数·硬约束】目标模块数 = ${n} 个 ... 若同时存在下方学习地图，以本数字为准 ...`;   // 说 7
}
if (brief) {
  out += "【必须一致】模块数量、标题与页码范围以紧接其下的学习地图为准 ... 禁止 ... 另起一套块数不同的大模块列表：\n\n" + brief;  // 贴 4 模块整本简报
}
```
→ 模型同时收到：①「模块数=7」②「必须和这份（4 模块、整本 233 页页码）地图一致，禁止另起不同块数」。两条**互相矛盾**，而 `brief` 是具体的、且措辞是「必须一致 / 禁止另起」，实际表现就是**模型跟着 4 模块整本简报走** → 用户看到「4 模块 + 整本 233 页」。

---

## 断点汇总

| 维度 | 在哪断的 | 事实 |
|---|---|---|
| **页码范围（study map）** | 环节 2b / 3 | `contentOverride` 没传进 `onRegenerateStudyMap`；App 侧 `handleRegenerateStudyMap` 写死 `content = pdfDataUrl \|\| fullPdfText`（整本）。study map 永远按整本 233 页算。 |
| **页码范围（领读对话）** | 环节 2c / 4 | 裁剪 PDF 确实作为 `inlineData` 喂给了领读对话，但同一条消息里又注入了**整本**的 `studyMapBriefing`（含 1–233 页码、全书模块），以「【必须一致】」压制，使模型按整本结构输出。 |
| **module 数量** | 环节 2d / 4 | `onRegenerateStudyMap(7)` 虽被调用且 App 侧按 7 重算，但 `startFormalReading` 读的是**重算前的旧 `studyMap`（4 模块）闭包值**，把旧的 4 模块简报当「必须一致」参考注入，压过 `moduleCount=7`。新算出的 7 模块 map 本次未被使用。 |

**两条根因（叠加）**：
1. **裁剪内容只进了「领读对话」，没进「study map 重算」**——`onRegenerateStudyMap` 既无接收裁剪内容的参数，App 侧也写死整本。
2. **`startFormalReading` 用旧闭包的 `studyMap`**——`await onRegenerateStudyMap` 改的是 App state，不会更新当前正在执行的 `startFormalReading` 闭包；旧的「4 模块 / 整本」简报被当成「必须一致」硬参考注入领读对话，同时打掉了 module 数量(7) 和页码范围(148–188)。

> 附：本次只查「跳过测验」入口。同样的 `studyMap?.initialBriefing` 旧闭包 + `onRegenerateStudyMap` 不接裁剪内容的问题，在「走测验」入口（同样走 `handleStartWithModuleCount` → `startFormalReading`）理论上也会复现，但按要求未实测。

按要求，先不提修复方案。
