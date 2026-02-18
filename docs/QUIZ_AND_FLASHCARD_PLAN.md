# Quiz 与 Flash Card 功能实现方案

## 一、现状简述

- **Quiz**：已在「略读模式」的智能导读流程中存在，作为**单题门控测验**（diagnosis → tutoring → **quiz** → reading），用 `generateGatekeeperQuiz(content, topic)` 生成一道选择题，答对后进入正式导读。数据为单题 `QuizData`，已持久化到本地/云端。
- **Flash Card**：当前无此功能，需要从零加入。

---

## 二、目标与范围

| 功能 | 目标 |
|------|------|
| **Quiz 扩展** | 除现有「导读门控单题」外，支持**多题测验**与**独立入口**（如按页/按全书测验），并保留与现有略读流程兼容。 |
| **Flash Card** | 支持基于**当前文档/当前页/笔记**生成正反面卡片，翻面、上一张/下一张、按文件持久化（含云端）。 |

---

## 三、Quiz 扩展方案

### 3.1 数据模型扩展

在 `types.ts` 中：

- **保留**现有 `QuizData`（单题），继续用于略读门控。
- **新增**「测验集」类型，用于多题测验：

```ts
// 单题（已有）
export interface QuizData {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// 新增：测验集（多题）
export interface QuizSet {
  id: string;
  title: string;           // 如 "第 3 页测验" / "全书总测"
  source: 'page' | 'full';  // 按页 or 全书
  pageNumber?: number;     // 若 source='page'
  items: QuizData[];
  createdAt: number;
}
```

- 在 `FilePersistedState` 中增加可选字段：`quizSets?: QuizSet[]`（按文件存多套测验）。

### 3.2 入口设计

- **入口 1（已有）**：略读模式 → 知识准备 → 「开始挑战」→ 单题门控 Quiz，逻辑不变。
- **入口 2（新增）**：
  - **本页测验**：在精读模式右侧讲解区，或 Header/SlideViewer 增加按钮「本页测验」→ 用当前页图片/文本生成一套 3–5 题，进入「测验模式」。
  - **全书测验**：在侧边栏或 Header 增加「全书测验」→ 用全文（或摘要+关键页）生成一套 5–10 题。

两种新入口都使用「测验集」`QuizSet`，与现有单题 `quizData` 并存（略读仍用 `quizData`）。

### 3.3 后端能力（geminiService）

- **保留** `generateGatekeeperQuiz(docContent, topic)`，供略读门控使用。
- **新增** `generateQuizSet(content: string, options: { type: 'page' | 'full'; pageNumber?: number; count: number })`：
  - 入参：文档内容（或当前页 base64/文本）、类型（本页/全书）、题目数量。
  - 返回：`QuizData[]`（或直接返回 `QuizSet` 所需字段），用 `responseSchema` 约束 JSON（题目 + options + correctIndex + explanation）。

### 3.4 UI 与状态

- **测验模式**：可复用 SkimPanel 里 quiz 的 UI 风格（题干 + 选项 + 提交 + 解析），改为「多题」：
  - 状态：当前题索引、已选答案列表、是否已提交整份测验。
  - 交互：下一题/上一题、提交后显示正确与否与解析，全部做完显示总分/小结。
- **入口**：
  - 精读右侧：在 `ExplanationPanel` 顶部或底部加「本页测验」按钮。
  - 侧边栏或 Header：加「全书测验」按钮，与「本页测验」共用同一套「测验集」展示与做题 UI。

### 3.5 持久化

- 将 `quizSets` 写入 `FilePersistedState` 和云端 session（与现有 `quizData` 一样），这样换设备或下次打开同一文件可继续/回顾测验。

---

## 四、Flash Card 方案

### 4.1 数据模型

在 `types.ts` 中新增：

```ts
export interface FlashCard {
  id: string;
  front: string;   // 正面（如概念名、问题）
  back: string;    // 背面（如定义、答案）
  sourcePage?: number;  // 可选：来自第几页
  createdAt: number;
}

export interface FlashCardDeck {
  id: string;
  fileName: string;  // 关联文件名
  title: string;     // 如 "第 1–5 页 概念卡"
  cards: FlashCard[];
  createdAt: number;
}
```

- 在 `FilePersistedState` 中增加：`flashCardDecks?: FlashCardDeck[]`（按文件存多个牌组）。

### 4.2 生成方式

- **方式 A（推荐先做）**：**AI 根据当前文档生成一整副牌组**
  - 入口：侧边栏或 Header「生成闪卡」→ 用全文（或 pdfDataUrl + 全文）调用 Gemini，要求输出 N 张「正面-背面」对（概念-定义、术语-解释等）。
  - 服务：`generateFlashCardDeck(content: string, options?: { count?: number })`，返回 `FlashCard[]` 或 `FlashCardDeck`，用 JSON schema 约束。
- **方式 B（后续增强）**：**仅基于当前页生成**
  - 入口：在精读某页时，按钮「本页生成闪卡」→ 只传当前页图片/文本，生成 3–8 张，可合并到当前文件的默认牌组或新建「第 X 页」牌组。
- **方式 C（可选）**：**从笔记生成**
  - 把 `NotebookData` 中某页/某文件的笔记条目转为「正面=标题/首句，背面=整条笔记」的闪卡，可不用 AI，或让 AI 再润色成问答对。

### 4.3 后端能力（geminiService）

- **新增** `generateFlashCardDeck(docContent: string, options?: { count?: number })`：
  - 使用 `getContentPart(docContent)` 支持 PDF 图或文本。
  - Prompt：要求根据文档内容生成若干张闪卡，正面为概念/问题，背面为解释/答案，中文，结构清晰。
  - 返回：`{ cards: Array<{ front: string, back: string }> }`，再在前端加上 `id`、`createdAt`、可选 `sourcePage`。

### 4.4 UI 设计

- **牌组列表**：在侧边栏增加「闪卡」区块，或单独一个「闪卡」面板/弹窗，列出当前文件的牌组（如「全书概念卡」「第 3 页」），点击进入该牌组的复习界面。
- **单牌组复习**：
  - 一张大卡片：正面显示 `front`，点击或按钮「翻转」显示 `back`。
  - 底部：上一张 / 下一张，可选「已掌握/未掌握」简单标记（后续可做间隔重复）。
  - 顶部：当前进度（如 3/10），牌组标题。
- **与现有布局融合**：可用全屏浮层（类似 GalgameOverlay）做「闪卡模式」，不破坏现有左右分栏；关闭后回到原界面。

### 4.5 持久化

- `flashCardDecks` 按文件名存在 `FilePersistedState` 中，并与云端 session 同步（与 `quizData`/`quizSets` 一致），这样同一文件在不同设备上也有同一批牌组。

---

## 五、与现有结构的整合

| 项目 | 说明 |
|------|------|
| **状态** | Quiz 扩展：`quizSets` + 当前测验模式（当前 set、当前题索引、答案列表）。Flash Card：`flashCardDecks` + 当前打开的 deck、当前卡索引、是否翻转。 |
| **入口** | Quiz：ExplanationPanel「本页测验」+ 侧边栏/Header「全书测验」。Flash Card：侧边栏「闪卡」入口 + 可选「本页生成闪卡」「从笔记生成」。 |
| **持久化** | 两者都进 `FilePersistedState` 与 CloudSession，恢复文件时一并恢复。 |
| **AI** | 复用 `getContentPart`、现有 model 与 config 风格；新增 `generateQuizSet`、`generateFlashCardDeck`。 |

---

## 六、实现优先级建议

1. **Phase 1（最小可用）**
   - 扩展 `types`：`QuizSet`、`FlashCard`、`FlashCardDeck`，以及 `FilePersistedState` 的对应字段。
   - 实现 `generateFlashCardDeck`，只做「全书生成一副牌」+ 一个简单闪卡复习 UI（翻面、上一张/下一张），入口放在侧边栏。
   - 闪卡数据仅本地持久化（IndexedDB 已有，只需序列化进 state）。

2. **Phase 2**
   - 实现 `generateQuizSet`（本页 + 全书两种），以及多题测验 UI（复用现有 quiz 样式）。
   - 在 ExplanationPanel 加「本页测验」、在 Header/侧边栏加「全书测验」，测验结果写入 `quizSets` 并持久化。

3. **Phase 3**
   - 云端同步：把 `quizSets`、`flashCardDecks` 纳入 `updateCloudSessionState` 与 `fetchSessionDetails`，恢复时一并恢复。
   - 闪卡「本页生成」、从笔记生成（可选）。

---

## 七、文件改动清单（参考）

| 文件 | 改动 |
|------|------|
| `types.ts` | 新增 `QuizSet`、`FlashCard`、`FlashCardDeck`；`FilePersistedState`、`CloudSession` 增加 `quizSets?`、`flashCardDecks?`。 |
| `services/geminiService.ts` | 新增 `generateQuizSet`、`generateFlashCardDeck`。 |
| `components/SkimPanel.tsx` | 无改动（继续用现有 `quizData` 门控）。 |
| 新建 `components/QuizSetPanel.tsx`（或类似） | 多题测验 UI：题目列表、选项、提交、解析、上一题/下一题、总分。 |
| 新建 `components/FlashCardPanel.tsx` | 牌组列表 + 单牌组复习（翻面、前后导航）。 |
| `components/ExplanationPanel.tsx` | 增加「本页测验」按钮，触发生成 `QuizSet` 并打开 QuizSetPanel。 |
| `components/Sidebar.tsx` 或 `Header.tsx` | 增加「全书测验」「闪卡」入口。 |
| `App.tsx` | 状态：`quizSets`、`flashCardDecks`、当前测验/闪卡模式；持久化与恢复逻辑；渲染 QuizSetPanel/FlashCardPanel（弹层或内嵌）。 |
| `services/storageService.ts` / `firebase.ts` | 若 state 结构已通过 `FilePersistedState` 传递，则只需保证序列化/反序列化包含新字段。 |

---

## 八、小结

- **Quiz**：在保留现有「略读门控单题」的前提下，通过 `QuizSet` + `generateQuizSet` 支持「本页测验」和「全书测验」，多题 UI 与持久化、云端同步一并考虑。
- **Flash Card**：通过 `FlashCard`/`FlashCardDeck` + `generateFlashCardDeck` 实现由 AI 生成牌组，侧边栏入口 + 翻面复习 UI，按文件持久化并同步到云端。

按上述 Phase 1 → 2 → 3 推进，即可在现有架构内落地 Quiz 扩展与 Flash Card 功能，且不破坏已有导读与精读流程。
