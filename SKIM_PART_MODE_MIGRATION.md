# SKIM_PART_MODE_MIGRATION

> 略读模式新增"节奏"选项(一次一个 module / 一次一个 part)。
> 严格按任务包 A1–A4 + B1–B4 执行,不抽常量、不动 system prompt、不改其他 readingOptions 字段。
> 未 commit,等用户验证。

---

## 一、实际改动文件 + 行号

### `services/geminiService.ts`(8 增 / 2 删)

| 标签 | 行号(改后) | 改动 |
|---|---|---|
| A4 注释 | line 1997(新增) | `// 注:skimPace 仅由略读路径...` |
| A1 类型 | line 2000 | `appendReadingModeUserMessageSuffix` 签名加 `skimPace?: 'module' \| 'part'` |
| A2 追加 | line 2026-2028(新增) | `if (readingOptions.skimPace === 'part') { out += "\n\n【节奏要求】..."; }` |
| A3 类型 | line 2138 | `chatWithSkimAdaptiveTutor` 签名加 `skimPace?: 'module' \| 'part'` |

#### A2 实际追加文本(原话照搬,任务包要求)

```ts
if (readingOptions.skimPace === 'part') {
  out += "\n\n【节奏要求】我需要你一次只生成一个 part，从 module1 开始。不需要你按照既定的格式，目的是讲的很详细就好。";
}
```

#### 未改动的关联点(明确放弃,等以后单做)

- `chatWithAdaptiveTutor` (line 2032+) 的 `readingOptions` 类型签名**未加 `skimPace`** —— 任务包 A3 字面只要求加到 `chatWithSkimAdaptiveTutor`。备考路径调用方不传该字段,结构性子类型兼容,tsc 不报错。**与预扫描报告中"为类型对称建议同加"的提议不一致** —— 用户决策为"按任务包字面执行"。

### `features/reader/skim/SkimPanel.tsx`(63 增 / 7 删)

| 标签 | 行号(改后) | 改动 |
|---|---|---|
| B1 state | line 155 | `const [skimPace, setSkimPace] = useState<'module' \| 'part'>('module');` |
| B3 透传 | line 356 | `startFormalReading` 传 `{ ..., skimPace }` |
| B4 签名 | line 426 | `handleSend` 第 3 参数类型加 `skimPace?` |
| B2a radio(quiz 内嵌入口) | line 864-891(新增 28 行) | `name="skim-pace-quiz"` radio 组,插在 select 与"开始领读"button 之间 |
| B2b radio(modal 入口) | line 1316-1343(新增 28 行) | `name="skim-pace-modal"` radio 组,插在 select 与 button 之间 |

#### 两处 radio 的 name 隔离

按任务包指示,两处用不同的 `name` 属性,防止同时渲染时 radio 选中冲突(`name` 相同会被浏览器视作同一组):

- 入口 A(quiz 内嵌):`name="skim-pace-quiz"`
- 入口 B(modal):`name="skim-pace-modal"`

state 是同一个 `skimPace`,所以两处 radio 选中状态是同步的(任一处切换,另一处也切换),这是预期行为(模块数 select 也是同一行为)。

---

## 二、自检结果

### 自检 1 · `npx tsc --noEmit`

**errors = 10**,与重构前基线完全一致,**0 new**。所有 10 条错误都是与本次改动无关的历史遗留(App.tsx StudyGuideContent / ImportMeta.env / SkimPanel quiz 类型 / firebase / transcriptionService Web Speech API)。

### 自检 2 · 全仓 grep `skimPace`

仅命中 **2 个文件**(符合预期):

```
services/geminiService.ts:1997   // 注释
services/geminiService.ts:2000   appendReadingModeUserMessageSuffix 类型签名
services/geminiService.ts:2026   if 追加逻辑
services/geminiService.ts:2138   chatWithSkimAdaptiveTutor 类型签名
features/reader/skim/SkimPanel.tsx:155     useState 声明
features/reader/skim/SkimPanel.tsx:356     startFormalReading 透传
features/reader/skim/SkimPanel.tsx:426     handleSend 类型签名
features/reader/skim/SkimPanel.tsx:873-884 quiz 入口 radio checked
features/reader/skim/SkimPanel.tsx:1323-1334 modal 入口 radio checked
```

未污染其它任何文件。

### 自检 3 · 全仓 grep `appendReadingModeUserMessageSuffix`

调用方仍是**恰好 2 处**(与预扫描报告一致):

```
services/geminiService.ts:1998   export function (定义)
services/geminiService.ts:2081   chatWithAdaptiveTutor 内调用(备考路径)
services/geminiService.ts:2160   chatWithSkimAdaptiveTutor 内调用(略读路径)
```

(预扫描时是 2077 / 2156,因加了注释 + if 块,行号偏移 +4 仍是同两处函数)

### 自检 4 · git status

```
 M features/reader/skim/SkimPanel.tsx
 M services/geminiService.ts
?? SKIM_PART_MODE_PRE_SCAN.md
?? SKIM_PART_MODE_MIGRATION.md
```

仅 **2 个源文件 modified**,2 个 .md 报告 untracked。

### 自检 5 · diff stat

```
 features/reader/skim/SkimPanel.tsx | 63 ++++++++++++++++++++++++++-----
 services/geminiService.ts          |  8 +++--
 2 files changed, 65 insertions(+), 6 deletions(-)
```

总改动量 **65 增 / 6 删**,符合任务包预期(类型签名 4 处 + UI 2 段 28 行 × 2 + state + 透传 + 注释 + if 块)。

---

## 三、已知风险点

### 风险 1 · 备考路径污染(已隔离)

- `appendReadingModeUserMessageSuffix` 现在签名含 `skimPace?` 字段
- 备考路径调用点(line 2081)的 `readingOptions` 类型签名(`chatWithAdaptiveTutor` line 2042 附近)**未加 `skimPace`** —— 它的 readingOptions 类型是父类型的子集
- TypeScript 结构性子类型兼容,tsc 无报错
- 备考调用方不会(也无法在不改类型的情况下)传 `skimPace`,所以 `if (readingOptions.skimPace === 'part')` 永不在备考路径触发
- **运行期零污染**

### 风险 2 · 用户验证清单 #5(备考工作台对话)需重点测

任务包验证清单 #5 明确要测:"在备考工作台开一轮苏格拉底对话 → 期望:完全不受影响"。
本次代码层已经做到零污染保证,但仍建议在测试时跑一遍备考通路,确认尾巴无任何"节奏要求"追加文本。

### 风险 3 · 两处 radio 状态同步(预期行为)

quiz 入口和 modal 入口共享同一个 `skimPace` state,任一处切换两处同步。
- 这与现状的 `selectedModuleCount` 完全一致(也是两处共享一个 state)
- 任务包 B2 字面就是这样设计("两处都加一段 radio UI")
- 不算 bug

### 风险 4 · code smell:内联类型 4 处重复(已记录,本次不动)

`readingOptions` 类型字面量内联在 4 个函数签名里,加字段需要逐个改。
**用户决策:本次按字面执行,以后单独抽 `interface ReadingOptions` 重构。** 不在本任务范围。

---

## 四、用户验证清单(任务包原版,直接 copy)

1. **回归:选"一次一个 module" + 4 模块 + 跳过测验入口**
   - 期望:行为与现状完全一致,AI 一次生成一个完整 module

2. **新功能:选"一次一个 part" + 4 模块 + 跳过测验入口**
   - 期望:AI 第一轮只讲 module 1 的 part 1,结尾会引导"继续"或类似话

3. **延续性:在 part 模式下回复"继续"**
   - 期望:AI 推进到下一个 part

4. **入口二:从门控 quiz 答对路径进入**
   - 答对 quiz → 内嵌 select 出现 → 选"一次一个 part" → 验证行为同 #2

5. **回归:备考工作台对话**(强烈建议测)
   - 在备考工作台开一轮苏格拉底对话
   - 期望:完全不受影响,没有节奏相关追加内容混入

### 额外观察项(建议测但非强制)

- modal 与 quiz 两个入口都试一遍 radio 切换,确认视觉与逻辑都正常
- part 模式 + 不同 module count(2/4/7)组合,确认 part 节奏文本不依赖具体 module 数

---

## 五、回滚

如果验证失败:

```bash
# 完全丢弃本次未提交改动
git checkout services/geminiService.ts features/reader/skim/SkimPanel.tsx

# 或者整体扔掉分支(子分支隔离的好处)
git checkout refactor
git branch -D feature/skim-pace-option
```

---

## 六、git 状态

```
 M features/reader/skim/SkimPanel.tsx
 M services/geminiService.ts
?? SKIM_PART_MODE_PRE_SCAN.md
?? SKIM_PART_MODE_MIGRATION.md
```

**未 git add、未 commit、未 push**(按任务包红线)。

等用户在 Windows 跑 `npm run dev` 验证。
