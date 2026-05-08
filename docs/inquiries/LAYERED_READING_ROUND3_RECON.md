# 递进阅读模式 · Round 3 改造前现状盘点报告

> **范围:** 当前 `refactor` 分支(阶段 4 主体 `ea0e5b1` + 持久化补丁 `aad85cf`)
> **目的:** 给即将写"Round 3 改造 INQUIRY"的 chat AI 一份事实底本——所有代码原文逐字搬,不做总结、不做评价。
> **生成日期:** 2026-05-08
> **生成方式:** 只读 grep + Read,未改任何源代码。

---

## 第 1 节 · LayeredReadingState 类型定义现状

```ts
// types.ts:276-277(模式入口)
export type ViewMode = 'deep' | 'skim' | 'layered';
export type SkimStage = 'diagnosis' | 'tutoring' | 'quiz' | 'reading';
```

```ts
// types.ts:279-294(Round 1 = module)
// --- 递进阅读模式（layered reading）---
// 数据完全独立于 studyMap，详见 docs/inquiries/LAYERED_READING_INQUIRY.md §8.G
export interface LayeredReadingModule {
  id: string;
  index: number;
  storyTitle: string;
  pageRange?: string;
  /** Round 1 内容（大白话故事）；按需填充，未生成时为 null */
  round1Content?: string | null;
  /** Round 2 子枝干列表；按需填充 */
  round2Branches?: LayeredReadingRound2Branch[];
  /** 各 Round 完成状态 */
  round1Done?: boolean;
  round2Done?: boolean;
  round3Done?: boolean;
}
```

```ts
// types.ts:296-307(Round 2 = branch)
export interface LayeredReadingRound2Branch {
  id: string;
  index: number;
  title: string;
  content?: string | null;
  /** 阶段 3 新增：溯源页码（铁律 6）。子枝干可能跨页，故为可选；若 AI 生成时给出则按"最关键页"填。 */
  sourcePage?: number;
  /** 阶段 3 新增：位置描述（铁律 6）。 */
  sourceLocation?: string;
  /** Round 3 细节挂载 */
  round3Details?: LayeredReadingRound3Detail[];
}
```

```ts
// types.ts:309-319(Round 3 = detail —— 最关键)
export interface LayeredReadingRound3Detail {
  id: string;
  /** "term" | "experiment" | "figure" | "evidence" | "comparison" 等自由文本类型 */
  kind: string;
  label: string;
  description: string;
  /** 阶段 3 新增：溯源页码（铁律 6，必填——细节就是钉到具体一页一处） */
  sourcePage: number;
  /** 阶段 3 新增：位置描述（铁律 6，必填） */
  sourceLocation: string;
}
```

```ts
// types.ts:321-335(全局 chat 消息,铁律 7)
/**
 * 阶段 3 新增：递进阅读模式独立的对话消息类型（铁律 7：视觉独立、数据全局）。
 *
 * - 视觉过滤：每 module chat 框只渲染 askedInModuleId === currentModuleId 的消息
 * - 数据全局：调用 chatWithLayeredReadingTutor 时传完整 globalChatHistory(不过滤)
 *   所有消息标记 askedInModuleId 让 AI 看到跨 module 的对话脉络
 */
export interface LayeredReadingChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  /** 用户提问时所在的 module id；视觉过滤的关键字段 */
  askedInModuleId: string;
  timestamp: number;
}
```

```ts
// types.ts:337-401(阶段 4 题目类型——与 Round 3 detail 完全独立,详见第 6 节)
/**
 * 阶段 4：递进阅读题目类型(铁律 8/9)。
 *
 * 题型对应:
 * - story:每 module Round 1 末出 1 道(attachedTo = moduleId)
 * - structure:每 branch Round 2 末出 1 道(attachedTo = branchId)
 * - application:每 branch Round 3 末出 1 道(attachedTo = branchId,不是每 detail 一道)
 *
 * 检索方式:复合 `(attachedTo, questionType)` 唯一定位;
 *           id 命名约定 `${attachedTo}-${questionType}`(如 module-1-story / module-1.2-structure)。
 *
 * 软门槛(铁律 8):
 * - 答 / 跳过 / 不答都不阻塞外层"展开到 Round X →"按钮
 * - 跳过后能回头答(status: 'skipped' → 'answered')
 * - 答完后能重答(✏️ 重新答题 → 清空 userAnswer + aiGrade,回到 'unanswered')
 *
 * 题目数据完全独立于 globalChatHistory(铁律 8:不混淆)——题目代码 0 处读 globalChatHistory。
 */
export type LayeredReadingQuestionType = 'story' | 'structure' | 'application';
export type LayeredReadingQuestionStatus = 'unanswered' | 'answered' | 'skipped';

/**
 * 阶段 4:批改维度(铁律 9 按题型分组)。
 * - story: 故事感 + 主旨准确
 * - structure: 步骤完整 + 步骤顺序
 * - application: 推理逻辑 + 细节抓取
 */
export interface LayeredReadingQuestionDimension {
  /** 维度名称(中文,与 prompt 输出对齐) */
  label: string;
  /** ★1-5 评分 */
  stars: 1 | 2 | 3 | 4 | 5;
  /** 一句话说明,必须指出具体好/差在哪(prompt 强约束) */
  comment: string;
}

export interface LayeredReadingQuestionGrade {
  /** 2 个维度,顺序与题型对应表一致 */
  dimensions: LayeredReadingQuestionDimension[];
  /** 批改完成时间 */
  gradedAt: number;
}

export interface LayeredReadingQuestion {
  /** 主键;命名约定 `${attachedTo}-${questionType}` 保证唯一 */
  id: string;
  /** 题型决定批改维度(铁律 9) */
  questionType: LayeredReadingQuestionType;
  /** 挂载点:story → moduleId;structure / application → branchId */
  attachedTo: string;
  /** AI 出的题(开放题) */
  questionText: string;
  /** 参考答案(150-300 字大白话) */
  referenceAnswer: string;
  /** 用户答案;null 时表示未答或跳过 */
  userAnswer?: string | null;
  /** 答题状态(软门槛三态,铁律 8) */
  status: LayeredReadingQuestionStatus;
  /** AI 批改结果(仅 status === 'answered' 时有) */
  aiGrade?: LayeredReadingQuestionGrade | null;
  /** 题目生成时间 */
  generatedAt: number;
  /** 最后一次答题/跳过时间 */
  answeredAt?: number;
}
```

```ts
// types.ts:403-415(学习状态记忆)
/**
 * 阶段 4:学习状态记忆(铁律 8 / 用户拍板交互维度 g)。
 *
 * 触发:用户每次切换/展开树节点 / 答题完成时更新。
 * 显示:进入 panel 时(距上次时间 > 1 小时)弹 banner;本次会话只显示一次。
 */
export interface LayeredReadingLastVisited {
  moduleId: string;
  round: 1 | 2 | 3;
  /** round=1 时无;round=2/3 时为当前展开的 branch.id */
  branchId?: string;
  lastUpdatedAt: number;
}
```

```ts
// types.ts:417-434(顶层 State)
export interface LayeredReadingState {
  /** 本模式独立 module 列表，与 studyMap 无关 */
  modules: LayeredReadingModule[];
  /** 用户上次浏览到的位置（学习状态记忆，阶段 4 升级为 LayeredReadingLastVisited） */
  lastVisited?: LayeredReadingLastVisited;
  /** 题目作答记录(阶段 4 钉死结构;铁律 8 不进 globalChatHistory) */
  questions: LayeredReadingQuestion[];
  /** 阶段 3 新增：全局对话历史（铁律 7：视觉独立、数据全局） */
  globalChatHistory?: LayeredReadingChatMessage[];
  /** 进度统计快照 */
  progressSnapshot?: {
    round1: { done: number; total: number };
    round2: { done: number; total: number };
    round3: { done: number; total: number };
  };
  /** 创建时间 */
  createdAt: number;
}
```

**第 1 节事实点:**
- Round 1 内容 = 单个字符串字段 `LayeredReadingModule.round1Content: string | null`,**不是结构化对象**。
- Round 2 内容 = 单个字符串字段 `LayeredReadingRound2Branch.content: string | null` + 溯源页码字段。
- Round 3 内容 = 结构化数组 `LayeredReadingRound3Detail[]`,每个 detail 含 `kind / label / description / sourcePage / sourceLocation`。
- `kind` 字段类型为 `string`(开放),客户端在 geminiService 二次过滤白名单 `term / experiment / figure / evidence / comparison` 共 5 种(详见第 2 节)。
- 顶层 `LayeredReadingState.questions: LayeredReadingQuestion[]` 与 `Round3Detail[]` 是两个**互不嵌套**的数组。

---

## 第 2 节 · Round 3 prompt 现状

### 2.1 AI 函数本体

```ts
// services/geminiService.ts:3344-3421
export const generateLayeredRound3Details = async (
    fullText: string,
    parentModule: LayeredReadingModule,
    branch: LayeredReadingRound2Branch
): Promise<LayeredReadingRound3Detail[] | null> => {
    try {
        const contentPart = getContentPart(fullText);
        const prompt = buildLayeredRound3Prompt(parentModule, branch);
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: [{ role: 'user', parts: [contentPart, { text: prompt }] }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        details: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    kind: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    sourcePage: { type: Type.NUMBER },
                                    sourceLocation: { type: Type.STRING },
                                },
                                required: ['kind', 'label', 'description', 'sourcePage', 'sourceLocation'],
                            },
                        },
                    },
                    required: ['details'],
                },
            },
        });
        if (!response.text) return null;
        const parsed = JSON.parse(response.text) as {
            details?: Array<{
                kind?: string;
                label?: string;
                description?: string;
                sourcePage?: number;
                sourceLocation?: string;
            }>;
        };
        const rawDetails = Array.isArray(parsed.details) ? parsed.details : [];
        // 客户端二次过滤:丢弃 sourcePage 不合法的 detail(铁律 6 防御层——
        // 即使 AI 偶尔违反 prompt,前端也不展示编造页码)
        const allowedKinds = new Set(['term', 'experiment', 'figure', 'evidence', 'comparison']);
        const valid = rawDetails.filter((d) => {
            const sp = typeof d.sourcePage === 'number' ? d.sourcePage : -1;
            const sl = (d.sourceLocation ?? '').trim();
            const lbl = (d.label ?? '').trim();
            return (
                Number.isFinite(sp) &&
                sp >= 1 &&
                sl.length > 0 &&
                lbl.length > 0 &&
                typeof d.kind === 'string'
            );
        });
        if (valid.length === 0) return null;

        // 前端补 id;限定 2-6
        const details: LayeredReadingRound3Detail[] = valid.slice(0, 6).map((d, i) => ({
            id: `${branch.id}.d${i + 1}`,
            kind: allowedKinds.has(d.kind!) ? d.kind! : 'term',
            label: (d.label ?? '').trim(),
            description: (d.description ?? '').trim(),
            sourcePage: Math.floor(d.sourcePage!),
            sourceLocation: (d.sourceLocation ?? '').trim(),
        }));
        return details;
    } catch (e) {
        console.error('generateLayeredRound3Details Error:', e);
        return null;
    }
};
```

### 2.2 Prompt builder 完整文本

```ts
// lib/prompts/layeredReadingPrompts.ts:175-238
/**
 * 生成 Round 3 细节挂载列表 + 溯源(generateLayeredRound3Details 用)。
 *
 * 设计要点(铁律 6):
 * - 每个 detail 必须含 sourcePage(必填,真实页码)+ sourceLocation(必填,有意义位置)
 * - 严格禁令:宁可只给 2 个少而准的细节也不要凑数 6 个含编造
 * - label 必须用讲义原词(防止学生跳页后搜不到)
 */
export function buildLayeredRound3Prompt(
  parentModule: LayeredReadingModule,
  branch: LayeredReadingRound2Branch
): string {
  const moduleStoryTitle = parentModule.storyTitle;
  const modulePageRange = parentModule.pageRange ?? '?';
  const branchTitle = branch.title;
  const branchSourcePage = branch.sourcePage ?? '?';
  return `你是 class-skip 的「递进阅读模式」Round 3 细节挂载助手。

学生现在想了解 module:「${moduleStoryTitle}」(对应 PDF 第 ${modulePageRange} 页)的子枝干:「${branchTitle}」(主要在 PDF 第 ${branchSourcePage} 页)。

【你要做的】
为这个子枝干挂载 3-6 个**具体细节**——这些是讲义里能"挂得住"的真实材料:
- term:专有名词、术语
- experiment:实验、例子、案例
- figure:图、表、流程图
- evidence:数据、引用、文献支撑
- comparison:对比、反例、特例

每个细节含:
1. kind:上述五选一(term / experiment / figure / evidence / comparison)
2. label:细节的名字(术语原词、实验名、图编号等)
3. description:30-100 字解释——这个细节服务哪个观点、为什么作者放在这里
4. sourcePage:必须真实页码(1-based)
5. sourceLocation:必须有意义的位置描述

【铁律·关于溯源(必读)】
1. **绝对不许编造页码**——如果该 PDF 真的没有相关细节,**宁可只给 2 个少而准的细节,也不要凑数 6 个含编造页码**。错误溯源比无溯源更糟糕。
2. sourcePage 必须 PDF 真实存在;sourceLocation 必须告诉学生具体怎么找。
3. label 要用讲义里的**原词**——别用你自己造的同义词。学生跳到该页要能搜到这个词。
4. 例子(✅ vs ❌):
   - ✅ kind: "term", label: "T 细胞", sourcePage: 23,
        sourceLocation: "右上方流程图的第三个箭头标签"
   - ✅ kind: "figure", label: "Figure 4.2", sourcePage: 25,
        sourceLocation: "页面中部"
   - ❌ sourcePage: 0 / 999 / "?",sourceLocation: "某段"        ← 一律不许
   - ❌ label: "T 淋巴细胞激活机制",而讲义原词是 "T cell activation" ← 不许翻译/同义改写

【严格禁令】
1. **绝不在末尾说"接下来""下一步"等推进语**(铁律 9)。
2. 不要给学生出题。
3. 不要把同一个细节重复挂载(同一术语只挂一次)。
4. 不要凑数——如果只有 2 个高质量细节,就给 2 个;不要为了凑 6 个降低质量。

【输出 JSON 严格格式】
{
  "details": [
    { "kind": "term"|"experiment"|"figure"|"evidence"|"comparison",
      "label": "...", "description": "...",
      "sourcePage": <number>, "sourceLocation": "..." }
  ]
}

不要输出额外字段;不要包含 markdown 代码围栏。`;
}
```

**第 2 节事实点:**
- 模型:`gemini-3-pro-preview`(同 Round 1/2)。
- responseSchema 强制 5 个字段全部 required。
- 客户端 `allowedKinds` 集合写死 5 种,不在白名单的 `kind` 强制改为 `'term'`。
- 数量限制有 3 个数字交叉:prompt 写 "3-6 个"、函数注释写 "2-6 个"、客户端 `slice(0, 6)` 上限 6 + `valid.length === 0` return null 下限 1(无 2 的强校验)。改造时要选定一个统一数字。
- prompt 里 `label` 严格要求"讲义原词、不许翻译/同义改写"——**与"中英对照"功能存在直接冲突**(详见第 5 节)。

---

## 第 3 节 · Round 3 渲染组件现状

**文件路径:** [`features/reader/layered/LayeredReadingTree.tsx`](../../features/reader/layered/LayeredReadingTree.tsx)
**没有专门的 `Round3DetailCard` 子组件**——所有 Round 3 卡片都是 inline JSX,直接写在 `LayeredReadingTree` 内的 `branches.map(...)` 里。

### 3.1 kind → 中文标签映射(唯一区分点)

```tsx
// features/reader/layered/LayeredReadingTree.tsx:74-80
const KIND_LABELS: Record<string, string> = {
  term: '术语',
  experiment: '实验',
  figure: '图表',
  evidence: '证据',
  comparison: '对比',
};
```

### 3.2 Round 3 details 列表渲染 JSX

```tsx
// features/reader/layered/LayeredReadingTree.tsx:469-489
{/* Round 3 细节列表 */}
{hasDetails && (
  <div className="space-y-1.5 ml-2 border-l-2 border-stone-100 pl-2.5">
    {(b.round3Details ?? []).map((d: LayeredReadingRound3Detail) => (
      <div key={d.id} className="text-xs text-slate-700 space-y-1">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10px] px-1 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
            {KIND_LABELS[d.kind] ?? d.kind}
          </span>
          <span className="font-bold text-slate-800">{d.label}</span>
        </div>
        <RoundContentWithSource
          content={d.description}
          sourcePage={d.sourcePage}
          sourceLocation={d.sourceLocation}
          onJumpToPage={onJumpToPage}
        />
      </div>
    ))}
  </div>
)}
```

### 3.3 Round 3 加载触发 + onUpdateModule 写入路径

```tsx
// features/reader/layered/LayeredReadingTree.tsx:238-289
const handleExpandToRound3 = useCallback(
  async (parentModule: LayeredReadingModule, branch: LayeredReadingRound2Branch) => {
    if (branch.round3Details && branch.round3Details.length > 0) {
      setExpandedBranchIds((prev) => new Set(prev).add(branch.id));
      return;
    }
    if (!hasDoc) {
      setRound3Errors((prev) => ({ ...prev, [branch.id]: '未加载 PDF 内容。' }));
      return;
    }
    setGeneratingRound3For((prev) => new Set(prev).add(branch.id));
    setRound3Errors((prev) => {
      const next = { ...prev };
      delete next[branch.id];
      return next;
    });
    try {
      const details = await generateLayeredRound3Details(docSource, parentModule, branch);
      if (!details || details.length === 0) {
        setRound3Errors((prev) => ({
          ...prev,
          [branch.id]: 'AI 生成 Round 3 失败,或讲义中无明确细节(铁律 6:AI 选择不编造)。',
        }));
        return;
      }
      onUpdateModule(parentModule.id, (mod) => ({
        ...mod,
        round2Branches: (mod.round2Branches ?? []).map((b) =>
          b.id === branch.id ? { ...b, round3Details: details } : b
        ),
      }));
      setExpandedBranchIds((prev) => new Set(prev).add(branch.id));
      // lastVisited:展开到 Round 3 成功(澄清 D)
      onUpdateLastVisited({
        moduleId: parentModule.id,
        round: 3,
        branchId: branch.id,
        lastUpdatedAt: Date.now(),
      });
    } catch (e) {
      console.error('handleExpandToRound3', e);
      setRound3Errors((prev) => ({ ...prev, [branch.id]: 'AI 调用异常,请重试。' }));
    } finally {
      setGeneratingRound3For((prev) => {
        const next = new Set(prev);
        next.delete(branch.id);
        return next;
      });
    }
  },
  [hasDoc, docSource, onUpdateModule, onUpdateLastVisited]
);
```

**第 3 节事实点:**
- 卡片类型区分**只靠 `d.kind` 字符串 + `KIND_LABELS` 字典查表**——没有 switch、没有 type guard、没有 5 种独立子组件、没有不同图标 / 颜色 / 边框,所有 5 种 kind 渲染模板**完全相同**(灰色 chip + label 加粗 + description + 溯源)。
- Round 3 加载入口仅一处:`handleExpandToRound3`(LayeredReadingTree.tsx:238)。详情列表写入用 `onUpdateModule` 嵌套替换 `round2Branches[i].round3Details`(没有专门的"写 detail"入口)。
- `RoundContentWithSource` 是独立组件(同名文件),负责 description + 溯源 chip 跳转,与 Round 2 内容渲染共用。

---

## 第 4 节 · layeredReadingState 在 App.tsx 的使用

### 4.1 useState 初始值

```tsx
// App.tsx:128
const [layeredReadingState, setLayeredReadingState] = useState<LayeredReadingState | null>(null);
```

> 初始值 `null`——尚未启动 layered 模式;启动后由 `LayeredReadingPanel.handleStartGeneration` 第一次构造为 `{ modules, questions: [], globalChatHistory: [], createdAt: Date.now() }`。

### 4.2 setLayeredReadingState 调用位置

| # | 文件:行号 | 函数名 | 用途 |
|---|---|---|---|
| 1 | [App.tsx:701](../../App.tsx#L701) | `processFile`(恢复分支) | 从 IndexedDB / 云 restoreData 恢复 → `setLayeredReadingState(stateToRestore.layeredReadingState ?? null)` |
| 2 | [App.tsx:711](../../App.tsx#L711) | `processFile`(初始化分支) | 无历史记录时重置为 `null` |
| 3 | [App.tsx:803](../../App.tsx#L803) | `handleRestoreCloudSession` | 间接经 `restoreData.layeredReadingState = fullData.layeredReadingState` 传给 `processFile`(实际 setState 仍在 #1 触发) |
| 4 | [App.tsx:2112](../../App.tsx#L2112) | JSX 下传 prop | 把 setter 透传给 `<LayeredReadingPanel setLayeredReadingState={setLayeredReadingState} />` |
| 5 | [LayeredReadingPanel.tsx:88](../../features/reader/layered/LayeredReadingPanel.tsx#L88) | `updateModule` (useCallback) | 改单个 module(R1 内容、R2 branches 数组、R3 details 嵌套)的 immutable updater |
| 6 | [LayeredReadingPanel.tsx:101](../../features/reader/layered/LayeredReadingPanel.tsx#L101) | `appendChatMessage` (useCallback) | 追加对话消息到 `globalChatHistory` |
| 7 | [LayeredReadingPanel.tsx:115](../../features/reader/layered/LayeredReadingPanel.tsx#L115) | `upsertQuestion` (useCallback) | 题目首次生成 push;已存在 id 替换 |
| 8 | [LayeredReadingPanel.tsx:129](../../features/reader/layered/LayeredReadingPanel.tsx#L129) | `patchQuestion` (useCallback) | 题目状态/答案/批改的局部更新 |
| 9 | [LayeredReadingPanel.tsx:144](../../features/reader/layered/LayeredReadingPanel.tsx#L144) | `updateLastVisited` (useCallback) | 写 lastVisited(澄清 D 的 6 条触发事件) |
| 10 | [LayeredReadingPanel.tsx:198](../../features/reader/layered/LayeredReadingPanel.tsx#L198) | progress 同步 useEffect | 把 `progressSnapshot` 写回 state |
| 11 | [LayeredReadingPanel.tsx:226](../../features/reader/layered/LayeredReadingPanel.tsx#L226) | `handleStartGeneration` | 从空启动,构造 `nextState` 首次 set |

**第 4 节事实点:**
- 树结构改动(R1/R2/R3 内容)**全部经 `updateModule`** —— 没有专门的 `updateBranch` / `updateDetail` 入口。
- `setLayeredReadingState(null)` 只在 `processFile` 初始化分支(#2)出现一次。
- `LayeredReadingTree` **不直接持有 setter**——它接收 `onUpdateModule / onAppendChatMessage / onGenerateQuestion / ...` 等回调,由 Panel 把 setter 包装成业务 callback。

---

## 第 5 节 · 中英对照现状

### 5.1 Round 1/2/3 prompt 检查

```bash
# grep "中英|双语|bilingual|english.*chinese|chinese.*english|EN-CN|CN-EN|original.*text|原文.*翻译|translation"
# 在 lib/prompts/layeredReadingPrompts.ts 全文(含 Round 1/2/3 + 题目 prompt)
# 结果:No matches found
```

→ **Round 1 / Round 2 / Round 3 / 题目 prompt 全部无任何"中英对照"指令。**

### 5.2 渲染层检查

```bash
# grep "中英|双语|bilingual|labelEn|EnglishVersion"
# 在 features/reader/layered/*.tsx(LayeredReadingPanel/Tree/QuestionBox/LastVisitedBanner/
#                                    ModuleChatBox/RoundContentWithSource)
# 结果:No files found
```

→ **6 个 layered 渲染组件全部无任何双语 / i18n 处理。**

### 5.3 类型层检查

`LayeredReadingRound3Detail` 接口仅 5 字段(`id / kind / label / description / sourcePage / sourceLocation`),**无任何第二语种字段**。`LayeredReadingModule` / `LayeredReadingRound2Branch` 同样**无第二语种字段**。

### 5.4 可参考的项目内现有 pattern(非 layered 模块)

仅 mind map 模块用过中英对照命名:

```ts
// types.ts:135-144(仅供 INQUIRY 参考——layered 没用)
// --- MIND MAP TYPES ---
/** 思维导图树节点 */
export interface MindMapNode {
  id: string;
  /** 主标签，中文或英文均可 */
  label: string;
  /** 中英对照：另一语种标签，如 label 为中文则填英文，反之亦然 */
  labelEn?: string;
  children?: MindMapNode[];
}
```

```
// services/geminiService.ts:1581(mind map prompt 写法示例,仅供参考)
- 每个节点格式：{ "id": "唯一标识", "label": "中文标题", "labelEn": "English title", "children": [ 子节点数组 ] }。必须中英对照：label 用中文，labelEn 用英文；子节点可省略 children 表示叶子。
```

**第 5 节结论:** **完全新增,无现状。**

> Round 3 prompt 第 3 条还存在反向约束:`label 要用讲义里的**原词**——别用你自己造的同义词。学生跳到该页要能搜到这个词。` 若新功能要给 Round 3 detail 加中文翻译,**只能放在新字段**(类比 mind map 的 `labelEn` 反向 `labelZh`),不能改 `label` 现有语义。

---

## 第 6 节 · 阶段 4 分层题目(LayeredQuestion)与 Round 3 的关系

### 6.1 数据存储位置

- **题目数据存:** `LayeredReadingState.questions: LayeredReadingQuestion[]`(顶层平铺数组,types.ts:423)。
- **Round 3 细节存:** `LayeredReadingState.modules[i].round2Branches[j].round3Details: LayeredReadingRound3Detail[]`(嵌套在 module → branch 下,types.ts:306)。
- **两者无嵌套关系、无字段交叉、无 id 重叠。** `Round3Detail.id = "${branch.id}.d${i+1}"`(geminiService.ts:3409),`Question.id = "${attachedTo}-${questionType}"`(types.ts:382 命名约定)——id 命名空间不同。

### 6.2 UI 挂载点

| 题型 | attachedTo | UI 位置 | 触发条件 |
|---|---|---|---|
| `story` | `module.id` | Round 1 末(module 头展开后,Round 2 子枝干**之前**) | 任意 |
| `structure` | `branch.id` | Round 2 末(branch 内容下方,Round 3 details **之前**) | branch 已展开 |
| `application` | `branch.id` | Round 3 末(details 列表**之后**) | `hasDetails` (i.e. `b.round3Details.length > 0`) |

题目挂载代码证据(挂在 branch 而非 detail):

```tsx
// features/reader/layered/LayeredReadingTree.tsx:391-393(application 题目锚点声明)
const applicationQuestion = findQuestion(questions, b.id, 'application');
const applicationQuestionId = `${b.id}-application`;
```

```tsx
// features/reader/layered/LayeredReadingTree.tsx:491-503(application 题目渲染——在 details map 之后)
{/* === Round 3 末细节应用题(详情列表后,不是每 detail 一道) === */}
{hasDetails && (
  <LayeredReadingQuestionBox
    questionType="application"
    question={applicationQuestion}
    isGenerating={generatingQuestionIds.has(applicationQuestionId)}
    isGrading={gradingQuestionIds.has(applicationQuestionId)}
    onGenerate={() => onGenerateQuestion('application', m, b)}
    onSubmit={(ans) => onSubmitQuestion(applicationQuestionId, ans)}
    onSkip={() => onSkipQuestion(applicationQuestionId)}
    onResetAnswer={() => onResetQuestion(applicationQuestionId)}
  />
)}
```

### 6.3 题目生成的 prompt / 函数名

| 题型 | AI 函数 | Prompt builder | 文件 |
|---|---|---|---|
| story | `generateLayeredQuestionForRound1` | `buildLayeredQuestionRound1Prompt` | services/geminiService.ts:3440 / lib/prompts/layeredReadingPrompts.ts(阶段 4 段) |
| structure | `generateLayeredQuestionForRound2` | `buildLayeredQuestionRound2Prompt` | 同上:3480 |
| application | `generateLayeredQuestionForRound3` | `buildLayeredQuestionRound3Prompt` | 同上:3522 |
| 批改(共用) | `gradeLayeredQuestion` | `buildLayeredQuestionGradingPrompt` | 同上:3567 |

**第 6 节关键事实(给 INQUIRY 用):**

1. **阶段 4 application 题目挂在 `branch.id` 上,而非任何 detail.id 上**——一个 branch 只有 1 道 application 题,不是每个 detail 一道。
2. **`Round3Detail.kind` 字段(`term/experiment/figure/evidence/comparison`)与 `LayeredReadingQuestion.questionType` 字段(`story/structure/application`)是两套独立枚举**,值空间不重合。
3. **若新规格要在 Round 3 增加"第 7 块小题"** 或类似新内容块:
    - 数据上**不能**塞进 `LayeredReadingQuestion.questions[]`(那是阶段 4 三类题专用,且每 (attachedTo, questionType) 只能 1 道)。
    - 数据上**可以**新增 kind(扩展 `Round3Detail` 白名单),或新建独立字段(如 `LayeredReadingRound2Branch.round3MiniQuestions: ...[]`),或新建顶层数组类似 `questions`。
    - 持久化层若用前两种方式,**无需任何 App.tsx 改动**——`updateModule` 已经能写 `round3Details` 嵌套,IndexedDB + 云 Firestore 写入端在持久化补丁 `aad85cf` 之后已经全字段同步。
    - 持久化层若用第三种方式(新顶层数组),**需在 `LayeredReadingState` 加字段** + App.tsx 当前写入端会自动包(因为 IndexedDB 保存 `layeredReadingState,` + 云 patch `layeredReadingState: ... JSON.parse(JSON.stringify(...))`,都是整体序列化,不是字段白名单)。
4. **阶段 4 的"软门槛"+ "重答" + "跳过" + AI 批改 2 维度**(铁律 8/9)是 application 题专属机制,与 Round 3 detail 卡片**完全无关** —— Round 3 detail 没有 status / userAnswer / aiGrade 概念,detail 是只读内容。

---

> **报告生成完毕。** 任何后续 INQUIRY 应基于本报告引用的具体 file:line 证据,而非二次描述。
