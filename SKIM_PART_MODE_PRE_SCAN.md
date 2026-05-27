# SKIM_PART_MODE_PRE_SCAN

> 只读预扫描,零代码改动。等用户确认后才进 Step 2。

---

## 扫描 1 · `SkimPanel.tsx` 两处 select 的精确位置

### 共用 state

| State | 行号 | 类型/默认值 |
|---|---|---|
| `selectedModuleCount` | [SkimPanel.tsx:154](features/reader/skim/SkimPanel.tsx#L154) | `useState<number>(4)` |
| `quizSelectedOption` | [SkimPanel.tsx:150](features/reader/skim/SkimPanel.tsx#L150) | `useState<number \| null>(null)` |
| `showGranularityModal` | [SkimPanel.tsx:153](features/reader/skim/SkimPanel.tsx#L153) | `useState(false)` |

`MODULE_OPTIONS` 是 `[2,3,4,5,6,7]` 常量(未单独列出,出现在两处 `.map`)。

### 入口 A · 答对 quiz 后内嵌 select(quiz 路径)

[SkimPanel.tsx:844-872](features/reader/skim/SkimPanel.tsx#L844)(quiz 弹层结果块内,条件 `onRegenerateStudyMap && quizSelectedOption === quizData.correctIndex`):

```tsx
{onRegenerateStudyMap && quizSelectedOption === quizData.correctIndex ? (
  <>
    <p className="text-xs font-bold text-stone-500 mb-2">选择模块数</p>
    {isRegeneratingMap ? (
      <div className="flex items-center justify-center gap-2 py-4 text-stone-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>正在按所选模块数重新划分…</span>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <label className="text-xs text-stone-500 mb-1">用几个模块解读本文(2～7)</label>
        <select
          value={selectedModuleCount}
          onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
          className="w-full py-2.5 rounded-xl border-2 border-stone-200 ..."
        >
          {MODULE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} 个模块</option>
          ))}
        </select>
        <button
          onClick={handleStartWithModuleCount}
          className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold ..."
        >
          <span>{needRegenerate ? '按此模块数重新生成并开始领读' : '开始领读'}</span>
        </button>
      </div>
    )}
  </>
) : (...)}
```

**插入节奏 radio 的位置:** `<select>` 与 `<button>` 之间(line 863 后 / line 864 前)。

### 入口 B · 跳过测验的 modal(跳过路径)

[SkimPanel.tsx:1272-1296](features/reader/skim/SkimPanel.tsx#L1272)(全屏 modal,条件 `showGranularityModal && onRegenerateStudyMap`):

```tsx
{showGranularityModal && onRegenerateStudyMap && (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 p-5 w-full max-w-sm space-y-4">
      <h3 className="text-sm font-bold text-slate-800">选择模块数</h3>
      <p className="text-xs text-stone-500">用几个模块解读本文(2～7),选完后即开始领读。</p>
      <div className="flex flex-col gap-2">
        <select
          value={selectedModuleCount}
          onChange={(e) => setSelectedModuleCount(Number(e.target.value))}
          className="w-full py-2.5 rounded-xl border-2 border-stone-200 ..."
        >
          {MODULE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} 个模块</option>
          ))}
        </select>
        <button
          onClick={handleStartWithModuleCount}
          className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold ..."
        >
          {needRegenerate ? '按此模块数重新生成并开始领读' : '开始领读'}
        </button>
      </div>
    </div>
  </div>
)}
```

**插入节奏 radio 的位置:** `<select>` 与 `<button>` 之间(line 1286 后 / line 1287 前)。

### 共同触发函数

两个入口的"开始领读"按钮都 `onClick={handleStartWithModuleCount}`,最终汇流到同一个 `startFormalReading`。

---

## 扫描 2 · `startFormalReading` 调用链 & `readingOptions` 当前结构

### startFormalReading

[SkimPanel.tsx:350-356](features/reader/skim/SkimPanel.tsx#L350):

```ts
const startFormalReading = async () => {
  setStage('reading');
  await handleSend(
    docType === 'STEM'
      ? "前置知识已确认，请输出本文的【逻辑路线图】与【核心结构】，并开始正式带读。"
      : "请生成深度略读报告 (Deep Skim Report)。",
    'reading',
    { moduleCount: selectedModuleCount, studyMapBriefing: studyMap?.initialBriefing }
  );
};
```

第 3 个参数 = `readingOptions` 对象,当前只传 2 个字段:
- `moduleCount: selectedModuleCount`
- `studyMapBriefing: studyMap?.initialBriefing`

### handleSend 签名 + 透传

[SkimPanel.tsx:422-426](features/reader/skim/SkimPanel.tsx#L422):

```ts
const handleSend = async (
    textOverride?: string,
    forceMode?: 'tutoring' | 'reading',
    readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number },
    sendOpts?: { appendUserWhenOverride?: boolean; tutorUserText?: string }
) => {
```

handleSend 内部([SkimPanel.tsx:459-470](features/reader/skim/SkimPanel.tsx#L459)):

```ts
const modeToUse = forceMode || (stage === 'reading' ? 'reading' : 'tutoring');
const skimReadingOpts =
  forceMode === 'reading' && readingOptions != null ? readingOptions : undefined;
// Pass the content (PDF or Text) to the service; readingOptions only for reading mode
const response = await chatWithSkimAdaptiveTutor(
  content,
  messages,
  payloadForTutor,
  modeToUse,
  docType,
  skimReadingOpts,
  abortController.signal
);
```

**透传方式:** `skimReadingOpts = readingOptions`(整体引用透传,无解构、无重组),`chatWithSkimAdaptiveTutor` 收到的就是原 `readingOptions` 对象。

**关键:** Step 2 只要在 `readingOptions` 加 `skimPace` 字段并在 `handleSend` 签名同步类型,**整条链路自然透传,无需中间改造**。

---

## 扫描 3 · `appendReadingModeUserMessageSuffix` 全仓调用方

grep 结果(只列 .ts/.tsx,docs 略):

```
services/geminiService.ts:1997    export function appendReadingModeUserMessageSuffix(...)
services/geminiService.ts:2077    ... appendReadingModeUserMessageSuffix(newMessage, readingOptions)   ← chatWithAdaptiveTutor 内部
services/geminiService.ts:2156    finalMessage = appendReadingModeUserMessageSuffix(newMessage, readingOptions);   ← chatWithSkimAdaptiveTutor 内部
```

**调用方 = 2 处,与任务包预设一致:**

| 调用方 | 行号 | 用途 |
|---|---|---|
| `chatWithAdaptiveTutor` 的 reading 分支 | services/geminiService.ts:2075-2078 | 备考工作台路径(用 `buildDialogueTeachingSystemPrompt`) |
| `chatWithSkimAdaptiveTutor` 的 reading 分支 | services/geminiService.ts:2154-2157 | 略读路径(用 STEM/HUMANITIES_SYSTEM_PROMPT) |

### 备考路径污染风险评估

**结论:零污染风险。** 理由:

1. **`skimPace` 字段调用方只可能是 SkimPanel:** 备考工作台 [features/exam/workspace/ExamWorkspaceSocraticChat.tsx] 不会去构造含 `skimPace` 的 readingOptions(它根本不知道这个字段)。
2. **类型签名约束:** 若 Step 2 给 `chatWithAdaptiveTutor`(备考)的 `readingOptions` 类型也加 `skimPace?` 字段,备考侧调用方仍然不传它 → undefined → if 条件 `readingOptions.skimPace === 'part'` 为 false → 不追加。
3. **代码注释 + 命名约束:** 字段名带 `skim` 前缀,已在语义上声明"略读专用",备考端开发者看到不会误用。

唯一理论风险:如果未来有人**手动在备考调用点传 `skimPace`**,会触发追加。但这属于"误用"而非"自动污染",通过代码注释 + 命名 + code review 即可防御。Step 2 改完可以在 `appendReadingModeUserMessageSuffix` 上方加一行注释明确这点。

---

## 扫描 4 · `readingOptions` 类型定义

### 是否独立 TypeScript 类型

**否。无独立 `interface ReadingOptions` / `type ReadingOptions` / `type SkimReadingOptions`。**

grep `readingOptions\?:` 全仓 .ts/.tsx 结果:

```
features/reader/skim/SkimPanel.tsx:425         readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number }
services/geminiService.ts:1999                 readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number }
services/geminiService.ts:2038                 readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number }
services/geminiService.ts:2134                 readingOptions?: { skimGranularity?: 'fine' | 'standard' | 'coarse'; studyMapBriefing?: string; moduleCount?: number }
```

**4 处签名,内联结构,字面量完全一致**。

### Step 2 同步改动清单(基于这个发现)

| # | 文件:行号 | 加什么 |
|---|---|---|
| 1 | services/geminiService.ts:1999 | `appendReadingModeUserMessageSuffix` 的 options 类型加 `skimPace?: 'module' \| 'part'` |
| 2 | services/geminiService.ts:2038 | `chatWithAdaptiveTutor` 的 readingOptions 类型加 `skimPace?: 'module' \| 'part'`(无害但保持类型对称) |
| 3 | services/geminiService.ts:2134 | `chatWithSkimAdaptiveTutor` 的 readingOptions 类型加 `skimPace?: 'module' \| 'part'` |
| 4 | features/reader/skim/SkimPanel.tsx:425 | `handleSend` 的 readingOptions 类型加 `skimPace?: 'module' \| 'part'` |

**4 处类型签名都要改。** 这是内联类型的不便之处,但 Step 2 范围明确,逐个加即可。

> 备选方案(本预扫描**不**提议、留作未来重构):把内联类型抽成独立的 `interface ReadingOptions`,export 出来,4 处统一引用。**任务包红线:"不要顺手优化"**,本次不做。

---

## 扫描 5 · 门控 quiz 与 part 模式的语义判断

### 两个入口的语义差异

| 入口 | 触发场景 | 用户认知 |
|---|---|---|
| A. quiz 答对内嵌 select(line 844-872) | 用户在略读阶段答对了门控题 | "我有前置知识,愿意配置参数开始正式领读" |
| B. modal(line 1272-1296) | 用户跳过门控测验 | "我不答题,直接配置参数开始领读" |

### 节奏选项是否应同时给两个入口

**结论:应该,两个入口都给。** 理由:

1. **节奏是"AI 怎么讲"的参数,不是"是否需要门控题"的参数。** 这两件事正交——前者决定输出粒度,后者决定信任前置知识。
2. **入口 A 与入口 B 的下游完全一样:** 都走 `handleStartWithModuleCount` → `startFormalReading` → 同一份 `chatWithSkimAdaptiveTutor` 调用。如果只在一个入口给节奏选项,另一个入口的用户就被剥夺了配置权。
3. **现状对称:** 模块数选项就是两个入口都给的。节奏选项同款对待最一致。
4. **任务包明确:** "B2. **两处都加一段 radio UI**"。

### 是否存在产品语义问题?

**没有。** 两个入口语义相同(进入正式领读前配置参数),节奏选项加在两处都合理,且任务包已明确指示。**无需停下报告。**

---

## 综合结论与 Step 2 路径确认

### 改动锁定

| 文件 | 改动数 | 内容 |
|---|---|---|
| `services/geminiService.ts` | 3 处类型签名 + 1 处函数体 | 3 个函数签名加 `skimPace?`;`appendReadingModeUserMessageSuffix` 末尾加追加逻辑 |
| `features/reader/skim/SkimPanel.tsx` | 1 处 state + 1 处类型签名 + 1 处 `startFormalReading` + 2 处 UI radio | state / 类型 / 透传 / radio×2 |

### 关键保证

- ✅ `startFormalReading → handleSend → chatWithSkimAdaptiveTutor` 链路是整体引用透传,加字段后自然透传
- ✅ 备考路径 `chatWithAdaptiveTutor` 不会被污染(因为备考调用方不传 `skimPace`,if 条件不触发)
- ✅ 两处 radio 用不同 `name`(`skim-pace-modal` / `skim-pace-quiz`),避免同时渲染时 radio 冲突(虽然产品上几乎不会同时渲染——modal 通过 absolute z-50 覆盖整个 panel,但安全起见仍要用不同 name)
- ✅ 内联类型 4 处都要改,不抽常量,符合"不要顺手优化"红线

### 等用户确认

**Step 1 预扫描完成。等待你确认后开始 Step 2 实施。** 不动任何代码。
