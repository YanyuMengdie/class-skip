# SKIM_PAGERANGE_RECON — 略读模式「页码范围选择」可行性侦察

> 纯只读侦察。未改动任何源码。本文件为本任务唯一产出。
> 结论先行：**当前喂给略读 AI 的内容是「整本 PDF（base64）或整本拼接纯文本」，到达 AI 的那一刻已经没有可供程序切分的「页码」维度。** 真实页码只存在于另一条独立的数据通道（`slides[].pageNumber`），略读链路完全没用到它。「页码范围」要落地，缺的不是 UI，而是一条「按页保留内容 → 按页码裁剪 → 喂给略读」的数据通路。

---

## Q1. 略读模式拿到手的内容形态

### 结论（一句话）
略读启动 / 生成 module 时喂给 AI 的是 **`pdfDataUrl || fullText`**：要么是**整本 PDF 的 base64 data URL**（作为 `inlineData` 整份扔给 Gemini），要么是**整本文档拼成的一整段纯文本字符串**——两者都**不含任何按页拆分的结构**，页码维度在这一层已丢失。

### 证据

**1) 内容来源：`pdfDataUrl` 优先，否则 `fullText`** — [SkimPanel.tsx:476-477](features/reader/skim/SkimPanel.tsx#L476-L477)
```ts
// CRITICAL: Prioritize PDF Vision Data over Text to avoid hallucination on scanned docs
const content = pdfDataUrl || fullText;
```
同样的优先级在 `startFormalReading` / `triggerQuiz` / `startAdaptiveLearning` 路径反复出现（[SkimPanel.tsx:322](features/reader/skim/SkimPanel.tsx#L322)、[:340](features/reader/skim/SkimPanel.tsx#L340)）。

**2) 这两个值都是 prop，来自 App** — [SkimPanel.tsx:25-26](features/reader/skim/SkimPanel.tsx#L25-L26)
```ts
fullText: string | null;
pdfDataUrl?: string | null; // NEW: Raw PDF Data
```
App 传入：`fullText={fullPdfText}`、`pdfDataUrl={pdfDataUrl}` — [App.tsx:2097-2098](App.tsx#L2097-L2098)。

**3) `content` 一路透传到服务层，类型是单个 `string`** — [SkimPanel.tsx:521-530](features/reader/skim/SkimPanel.tsx#L521-L530) → `chatWithSkimAdaptiveTutor(docContent: string, ...)` — [geminiService.ts:2136-2137](services/geminiService.ts#L2136-L2137)。

**4) 在服务层，这个 string 被 `getContentPart` 处理** — [geminiService.ts:40-55](services/geminiService.ts#L40-L55)
```ts
const getContentPart = (docContent: string) => {
  if (docContent && docContent.startsWith('data:')) {        // → PDF 走这里
    const matches = docContent.match(/^data:([^;]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return { inlineData: { mimeType: matches[1], data: matches[2] } };  // 整份 PDF 二进制
    }
  }
  const safeText = docContent ? docContent.slice(0, 40000) : "...";       // 纯文本：整段截前 40000 字
  return { text: `DOCUMENT CONTENT:\n${safeText}` };
};
```
- **PDF 分支**：把**整本 PDF**作为 `inlineData` 一次性交给模型。页码只以「PDF 文件内部的物理排版」形式存在，**程序侧无法据此圈定「第 X–Y 页」**——除非先在前端把 PDF 拆页重组。
- **纯文本分支**：`docContent` 已是**一整段**（见 Q2 的 `join('\n')`），这里再 `slice(0, 40000)`，**没有任何页边界**。

### 意外发现 / 与文档假设不符
- 文档问「是整本纯文本？还是按页存的结构？还是 PDF 对象本身？」——答案是**前两者的二选一**（PDF 时是整份 base64，不是可遍历的 PDF 对象；非 PDF 时是整段文本），**都不是按页数组**。
- 纯文本分支有 **40000 字符硬截断**，长文档略读时本身可能已被截尾（与页码范围无关，但属于「内容完整性」隐患，记此一笔）。

---

## Q2. PDF 是怎么、什么时候被解析的

### 结论（一句话）
PDF 在**打开文件的那一刻 `processFile` 就被一次性全量解析**（同时抽全文文本 + 渲染全部页为图片），解析逻辑在 [lib/pdf/pdfUtils.ts](lib/pdf/pdfUtils.ts)；**`extractPdfText` 原本是返回「每页一段」的 `string[]`、天然带页序**，但 App 拿到后立刻 `join('\n')` 拍平成一整段，**页边界在 App 层就被丢弃**。略读用的内容与翻页视图（SlideViewer）用的内容**来自同一次解析、但是两套独立表示**。

### 证据

**1) 解析时机：打开文件即全量解析** — [App.tsx:693](App.tsx#L693)
```ts
if (file.type === 'application/pdf') {
  rawPdfData = await readFileAsDataURL(file); setPdfDataUrl(rawPdfData);
  images = await convertPdfToImages(file);      // 全部页 → 图片
  pdfText = await extractPdfText(file);          // 全部页 → 文本数组
}
```
非按需、非按页懒解析——一次把整本啃完。

**2) 解析输出**本身**是带页码的数组** — [pdfUtils.ts:78-100](lib/pdf/pdfUtils.ts#L78-L100)
```ts
export const extractPdfText = async (file: File): Promise<string[]> => {
  ...
  const numPages = pdf.numPages;
  const texts: string[] = [];
  for (let i = 1; i <= numPages; i++) {        // ← 1-based 页循环
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    texts.push(pageText);                       // ← texts[i-1] = 第 i 页文本
  }
  return texts;                                 // ← string[]：下标即页序
};
```
`convertPdfToImages` 同理逐页渲染返回 `string[]`（[pdfUtils.ts:44-76](lib/pdf/pdfUtils.ts#L44-L76)）。**「第几页」这个标记在解析输出里是存在的（数组下标 = 页序）。**

**3) 页边界在 App 被拍平** — [App.tsx:698-699](App.tsx#L698-L699)
```ts
const fullText = pdfText.join('\n');   // ← 每页之间仅用一个 '\n' 连接，无页号标记
... setFullPdfText(fullText); ...      // 存成单一 string，按页结构丢失
```
`pdfText`（`string[]`，带页序）是 `processFile` 内的**局部变量**，join 后即被丢弃，**没有任何 state 保留这份「按页文本数组」**。

**4) 图片这一路反而保留了页码** — [App.tsx:697](App.tsx#L697)
```ts
const newSlides: Slide[] = images.map((img, idx) => ({
  id: `slide-${hash}-${idx}`, imageUrl: img, pageNumber: idx + 1  // ← 真实 1-based 页码被保留
}));
... setSlides(newSlides);
```
SlideViewer 消费的就是这份带 `pageNumber` 的 `slides`（[SlideViewer.tsx:391-392](features/reader/slide-viewer/SlideViewer.tsx#L391-L392)：`src={slide.imageUrl}` / `alt={\`Slide ${slide.pageNumber}\`}`）。

**5) 略读 vs SlideViewer 是两套独立表示（同源、不同形）**
- 略读吃：`pdfDataUrl`（整份 base64）/ `fullPdfText`（整段文本）。
- SlideViewer 吃：`slides[]`（逐页图片 + `pageNumber`）。
- 三者都在同一次 `processFile` 里由同一个 `file` 产出（[App.tsx:693-699](App.tsx#L693-L699)），但**各自存在不同 state，互不引用**。

### 意外发现 / 与文档假设不符
- **关键发现**：「按页带页码」的数据其实**一度存在**（`extractPdfText` 的返回值、`slides[].pageNumber`），是 App 主动 `join` 丢掉了文本的页维度。也就是说，**做页码范围所需的最底层能力（逐页文本 + 真实页码）pdf.js 已经具备，缺的是把这份页结构保留下来并接到略读链路**——而不是从零造解析。
- `slides[].pageNumber` 与 `extractPdfText` 的数组下标**是同一套页序**（都从 PDF 第 1 页 1-based 顺序生成），天然可对齐：`slides[k].pageNumber === k+1`，对应 `pdfText[k]`。

---

## Q3. 现有配置区的代码位置与形态

### 结论（一句话）
配置区有**两个入口**：①「Quiz 答对后」的内联配置块 [SkimPanel.tsx:905-960](features/reader/skim/SkimPanel.tsx#L905-L960)；②「跳过测验直接开始」弹出的弹窗 [SkimPanel.tsx:1428-1479](features/reader/skim/SkimPanel.tsx#L1428-L1479)。两处共用同一批 state：`selectedModuleCount` / `skimPace`（外加触发弹窗的 `showGranularityModal`）。**这些配置是 SkimPanel 组件内部 `useState`，开始领读时直接读取并通过 `readingOptions` 传给服务层；它们既不落 IndexedDB 也不上云——与 `skimFocusMode` / `skimTopHeight` 的持久化路径不同。**

### 证据

**1) state 定义** — [SkimPanel.tsx:159-162](features/reader/skim/SkimPanel.tsx#L159-L162)
```ts
const [showGranularityModal, setShowGranularityModal] = useState(false);
const [selectedModuleCount, setSelectedModuleCount] = useState<number>(4);
const [skimPace, setSkimPace] = useState<'module' | 'part'>('module');
const MODULE_OPTIONS = [2, 3, 4, 5, 6, 7];
```

**2) 配置 UI（入口①：Quiz 通过后内联）** — [SkimPanel.tsx:914-958](features/reader/skim/SkimPanel.tsx#L914-L958)
- 模块数下拉：`<select value={selectedModuleCount} onChange=... >`（[:916-924](features/reader/skim/SkimPanel.tsx#L916-L924)）
- 节奏 radio（`module` / `part`，`name="skim-pace-quiz"`）（[:928-949](features/reader/skim/SkimPanel.tsx#L928-L949)）
- 开始按钮 `onClick={handleStartWithModuleCount}`（[:952-957](features/reader/skim/SkimPanel.tsx#L952-L957)）

**3) 配置 UI（入口②：跳过测验弹窗）** — [SkimPanel.tsx:1428-1479](features/reader/skim/SkimPanel.tsx#L1428-L1479)
- 同样的下拉（`selectedModuleCount`）+ 节奏 radio（`name="skim-pace-modal"`）+ `handleStartWithModuleCount` 按钮。
- 由 `handleSkipToReading` 在 `onRegenerateStudyMap` 存在时 `setShowGranularityModal(true)` 触发（[SkimPanel.tsx:379-385](features/reader/skim/SkimPanel.tsx#L379-L385)）。

**4) 「开始略读」时如何读取并下传** — [SkimPanel.tsx:369-377](features/reader/skim/SkimPanel.tsx#L369-L377) → [:359-365](features/reader/skim/SkimPanel.tsx#L359-L365)
```ts
const handleStartWithModuleCount = async () => {
  setShowGranularityModal(false);
  if (needRegenerate) { setIsRegeneratingMap(true); await onRegenerateStudyMap?.(selectedModuleCount); setIsRegeneratingMap(false); }
  startFormalReading();
};
const startFormalReading = async () => {
  setStage('reading');
  await handleSend(... , 'reading',
    { moduleCount: selectedModuleCount, studyMapBriefing: studyMap?.initialBriefing, skimPace });  // ← 在此打包
};
```
`readingOptions` 进入 `handleSend` → `chatWithSkimAdaptiveTutor(..., skimReadingOpts, ...)`（[SkimPanel.tsx:518-527](features/reader/skim/SkimPanel.tsx#L518-L527)），最终在服务层由 `appendReadingModeUserMessageSuffix(newMessage, readingOptions)` 拼进发给模型的文本（[geminiService.ts:2174-2177](services/geminiService.ts#L2174-L2177)）。
> 注：`moduleCount` 还有另一条副作用——`onRegenerateStudyMap(selectedModuleCount)` 会让 App 调 `performPreFlightDiagnosis(content, { moduleCount })` 重切 studyMap（[App.tsx:1878-1882](App.tsx#L1878-L1882)）。

**5) 持久化对比——确认这批配置「不落盘」**
- **会持久化的**那批，明确进了 `filePersistedSnapshot`：`skimTopHeight` / `skimFocusMode` / `skimStage` / `studyMap` / `quizData` …（[App.tsx:1680-1708](App.tsx#L1680-L1708)），并经 IndexedDB（[App.tsx:628-654](App.tsx#L628-L654)）与云端（[App.tsx:660-664](App.tsx#L660-L664)，`updateCloudSessionState` 路径）写出。
- **`selectedModuleCount` / `skimPace` / `showGranularityModal`**：全文检索 App.tsx **查无此名**（仅 SkimPanel 内部出现）。它们不是 props、不在 snapshot、不在任何 IndexedDB/云写出依赖数组里。→ **纯组件内部 state，重新打开文件 / 刷新即丢，不持久化。**
- 唯一与之相关、存在于 App 的是 `studyMapModuleCount`（App state），但它在 `processFile` 里**被显式重置为 `null`**（[App.tsx:704](App.tsx#L704)、[:714](App.tsx#L714)），也**未进 snapshot**，仅用于判断「当前 studyMap 是否需按新模块数重算」。

### 意外发现 / 与文档假设不符
- 配置区**不是一处而是两处**（Quiz 通过内联 + 跳过弹窗），UI/state 复用但**渲染在两个分支**——若加「页码范围」输入，需在**两个地方都加**（或抽成共用子组件），否则会出现「走测验能填、跳测验不能填」的不一致。
- 用户记忆里说的 `skimFocusMode` / `skimTopHeight` 走云持久化属实；但**本问涉及的 module 数量 / 节奏并不走那套**，是临时态。新加的「页码范围」若想被记住，需要**自己新增持久化字段**（snapshot + IndexedDB + 云），不能搭现有便车。

---

## Q4. 页码的「真实性」

### 结论（一句话）
系统里**存在**与 PDF 实际页码一一对应的编号——`slides[].pageNumber`（1-based，等于 `extractPdfText`/`convertPdfToImages` 的数组下标+1）；但它**只服务于翻页/幻灯片视图**。略读侧的「module / part」是**模型对整份内容做的语义切分，与页码之间不存在任何映射**——两套完全独立的维度，代码里没有「module ↔ 页码」的桥。

### 证据

**1) 真实页码确实存在** — [App.tsx:697](App.tsx#L697)：`pageNumber: idx + 1`（源自 PDF 逐页顺序，见 Q2）。LayeredReadingPanel 甚至有 `onJumpToPage(page1Based)` 把页码映回 `slides` 下标（[App.tsx:2122-2126](App.tsx#L2122-L2126)），佐证 `pageNumber` 就是「真实页」。

**2) module/part 与页码无映射**
- `moduleCount` / `skimPace` 仅作为**文本提示**拼进 prompt（[geminiService.ts:2174-2177](services/geminiService.ts#L2174-L2177)、`appendReadingModeUserMessageSuffix` 见 [geminiService.ts:1998-2001](services/geminiService.ts#L1998-L2001) 附近说明），由模型自行决定怎么把内容分成 N 块——**前端从不知道某 module 对应原文哪几页**。
- studyMap 的切分同样由 `performPreFlightDiagnosis(content, { moduleCount })` 在模型侧产出（[App.tsx:721](App.tsx#L721)、[:1881](App.tsx#L1881)），其结构里没有页码字段被略读链路使用。
- 全代码未见任何「module → pageNumber」或「part → page range」的数据结构或转换函数。

**3) 两套维度之间唯一潜在的对齐点**（目前未被使用）
- `slides[k].pageNumber === k+1` 且 `pdfText[k]` 是同一页文本（Q2 已证同序）。理论上「第 X–Y 页文本」= `pdfText.slice(X-1, Y)`——**但 `pdfText` 在 join 后已被丢弃**，且 PDF（`inlineData`）分支根本不走文本、无法在前端按页裁剪 base64。

### 意外发现 / 与文档假设不符
- 用户说的「第 X 到第 Y 页」**在系统里有真实对应物**（`pageNumber`），这点成立——但它**活在另一条数据通道**，略读链路够不着。
- 因此「页码范围」与「module」是**正交**的：module 是语义块、页码是物理页。即便给了页码范围，也得先决定**用谁去裁内容**：
  - 走 **PDF/inlineData** 路：前端无法按页切 base64，需要用 pdf.js 重新「抽出第 X–Y 页另存为新 PDF」或「只渲染这些页为图片」再喂——是新增工作。
  - 走 **纯文本** 路：需要**先停止 `join` 丢页结构**（或新增一份保留的 `pdfText: string[]` state），再 `slice(X-1, Y)` 拼回去喂——相对轻，但会失去 PDF Vision 抗幻觉的优势（Q1 注释明确说优先 PDF 正是为防扫描件幻觉）。

---

## 侦察小结（事实层面，不含方案）
1. 略读 AI 当前输入 = 整份 PDF（base64 inlineData）或整段拼接文本，**到达模型时无可程序化的页边界**。([Q1])
2. PDF 在打开时一次性全量解析；**逐页文本 + 真实页码曾经存在**（`extractPdfText` 返回 `string[]`、`slides[].pageNumber`），但文本的页结构被 `join('\n')` 主动丢弃，仅图片侧保留页码。([Q2])
3. 配置区在 SkimPanel **两处**（Quiz 内联 + 跳过弹窗），用 `selectedModuleCount`/`skimPace` 两个**纯组件内部、不持久化**的 state，开始领读时打包进 `readingOptions` 下传。([Q3])
4. 真实页码存在但只服务翻页视图；**module/part 与页码无任何映射**，两者正交。最底层的「逐页文本 + 页码」能力 pdf.js 已具备，缺的是「保留页结构 → 按页码裁剪 → 接入略读输入」这条通路。([Q4])

> 按指令到此停下，不提任何修改方案，等你看完报告再说。
