# P2 第 8 次搬迁报告：shared/ 第 1 批（8 文件，1 批搬完）

> P2 阶段 3 · Batch 1/1 · **shared 区域一次性收官**
> 本步骤**已写入 / 已 git mv，但未 commit、未 push**。

---

## 1. 移动的文件清单

| 操作 | 旧路径 | 新路径 |
|------|--------|--------|
| `git mv` | `components/Header.tsx`（523 行） | [`shared/layout/Header.tsx`](shared/layout/Header.tsx) |
| `git mv` | `components/MusicPlayer.tsx`（116 行） | [`shared/layout/MusicPlayer.tsx`](shared/layout/MusicPlayer.tsx) |
| `git mv` | `components/Sidebar.tsx`（972 行） | [`shared/layout/Sidebar.tsx`](shared/layout/Sidebar.tsx) |
| `git mv` | `components/WelcomeScreen.tsx`（83 行） | [`shared/layout/WelcomeScreen.tsx`](shared/layout/WelcomeScreen.tsx) |
| `git mv` | `components/LoginModal.tsx`（150 行） | [`shared/auth/LoginModal.tsx`](shared/auth/LoginModal.tsx) |
| `git mv` | `components/HistoryModal.tsx`（104 行） | [`shared/history/HistoryModal.tsx`](shared/history/HistoryModal.tsx) |
| `git mv` | `components/StudioPanel.tsx`（110 行） | [`shared/studio/StudioPanel.tsx`](shared/studio/StudioPanel.tsx) |
| `git mv` | `components/SavedArtifactPreview.tsx`（284 行） | [`shared/studio/SavedArtifactPreview.tsx`](shared/studio/SavedArtifactPreview.tsx) |

新建目录：`shared/layout/`、`shared/auth/`、`shared/history/`、`shared/studio/`。

git status 中 6 条为 `R`（纯 rename），2 条 Header 和 StudioPanel 为 `RM`——
M 的部分对应 §2.1 的 2 处内部 import 更新，符合预期。

---

## 2. 修改的引用

### 2.1 8 个组件的内部 import（2 处）

| 文件 | 行 | 旧 | 新 |
|------|----|----|----|
| [shared/layout/Header.tsx](shared/layout/Header.tsx) | 4 | `import { MusicPlayer } from '@/components/MusicPlayer';` | `import { MusicPlayer } from '@/shared/layout/MusicPlayer';` |
| [shared/studio/StudioPanel.tsx](shared/studio/StudioPanel.tsx) | 6-7 | `export { ArtifactFullView } from '@/components/SavedArtifactPreview';`<br>`export type { ArtifactFullViewProps } from '@/components/SavedArtifactPreview';` | 两处 `@/components/SavedArtifactPreview` → `@/shared/studio/SavedArtifactPreview` |

### 2.2 外部代码引用（7 行）

| 文件 | 行 | 改动 |
|------|----|------|
| [App.tsx](App.tsx) | 4 | `'@/components/Header'` → `'@/shared/layout/Header'` |
| [App.tsx](App.tsx) | 9 | `'@/components/Sidebar'` → `'@/shared/layout/Sidebar'` |
| [App.tsx](App.tsx) | 13 | `'@/components/HistoryModal'` → `'@/shared/history/HistoryModal'` |
| [App.tsx](App.tsx) | 16 | `'@/components/WelcomeScreen'` → `'@/shared/layout/WelcomeScreen'` |
| [App.tsx](App.tsx) | 30 | `'@/components/StudioPanel'` → `'@/shared/studio/StudioPanel'` |
| [App.tsx](App.tsx) | 32 | `'@/components/LoginModal'` → `'@/shared/auth/LoginModal'` |
| [components/ReviewPage.tsx](components/ReviewPage.tsx) | 11 | `'@/components/SavedArtifactPreview'` → `'@/shared/studio/SavedArtifactPreview'` |

App.tsx 通过 `import { StudioPanel, ArtifactFullView } from '@/shared/studio/StudioPanel';` 同时拿 ArtifactFullView（StudioPanel re-export 自 SavedArtifactPreview），所以 App.tsx 不直接 import SavedArtifactPreview——与扫描报告一致。

### 2.3 活文档路径更新

| 文件 | 改动 |
|------|------|
| [CONTEXT.md](CONTEXT.md) | "当前真实目录结构" 增 shared/ 树；"已搬迁阶段" 更新；"候选 shared/" 节删除；"下一步"重写；"重要参考文档" 加 SHARED_PRE_MIGRATION_SCAN.md + SHARED_BATCH1_MIGRATION.md；最后更新日期同步；待 commit 行加入 git 历史段 |
| [REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md) | 8 处旧路径替换（含分类表的引用） |
| [P2_DEPENDENCY_SCAN.md](P2_DEPENDENCY_SCAN.md) | 全部 8 个旧路径 → 新路径 |
| [P2_COMPONENT_GLOSSARY.md](P2_COMPONENT_GLOSSARY.md) | 旧路径替换 |
| [P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md) | 旧路径替换 |
| [VERSION.md](VERSION.md) | 旧路径替换 |
| [docs/QUIZ_AND_FLASHCARD_PLAN.md](docs/QUIZ_AND_FLASHCARD_PLAN.md) | 旧路径替换 |
| [docs/EXAM_AND_STUDY_FLOW.md](docs/EXAM_AND_STUDY_FLOW.md) | 旧路径替换 |

### 2.4 刻意未改（快照型/历史报告）

| 文件 | 原因 |
|------|------|
| `SHARED_PRE_MIGRATION_SCAN.md` | 本批的预扫描，描述"那一时刻的事实"，改它会破坏报告时态语义 |
| `NOTEBOOK_PRE_MIGRATION_SCAN.md` | 上一批的预扫描快照 |
| 所有 `*_MIGRATION.md`（TURTLESOUP / LECTURE / ENERGYREFUEL / SESSIONSTART / READER_BATCH1-3 等） | 历次搬迁完工报告，时态语义保持 |
| `REFACTOR_AUDIT.md` | 阶段 1 审计快照 |
| `DEAD_CODE_CONFIRMED.md` | 死代码核查快照 |
| `ALIAS_MIGRATION_REPORT.md` | 别名迁移快照 |
| `scripts/migrate-to-alias.last-run.json` | 脚本运行快照（下次跑会自动覆盖） |

---

## 3. TypeScript 检查结果

```bash
$ npx tsc --noEmit
... 10 errors, exit 2
```

| 指标 | 值 |
|------|------|
| 错误总数 | **10** |
| 与基线比对 | **0 新增 / 0 减少** |
| `Cannot find module` 错误 | **0** ✅ |

10 个错误均历史遗留（App.tsx StudyGuideContent.trim、ExamWorkspacePage import.meta.env、SkimPanel 比较类型、firebase Omit、geminiService import.meta.env / boolean string 比较 / inlineData 类型、transcriptionService SpeechRecognition 三件套），与本次搬迁无关。

---

## 4. 残留扫描

```bash
$ grep "@/components/(Header|Sidebar|WelcomeScreen|LoginModal|HistoryModal|MusicPlayer|StudioPanel|SavedArtifactPreview)" --include="*.{ts,tsx,js,jsx,mjs,json}"
# 0 matches
```

代码层（.ts/.tsx）中已完全无 8 个旧路径残留。.md 中残留的全部位于刻意保留的快照报告（§2.4）。

---

## 5. 是否有意外发现

**无**。本批与扫描预测完全一致：
- ✅ 内部依赖 2 条（Header→MusicPlayer、StudioPanel re-export SavedArtifactPreview），与扫描一致
- ✅ 外部 import 7 行（App.tsx 6 + ReviewPage 1），与扫描一致
- ✅ 8 个 git mv 全部识别为 R 或 RM（带内部修改）
- ✅ tsc 通过基线
- ✅ 无新增 "Cannot find module"

---

## 6. 本批决策记录（用户已拍板）

| 编号 | 决策 |
|------|------|
| Q1 | LoadingInteractiveContent **不搬到 shared/**，从本批移除 |
| Q2 | MusicPlayer 跟 Header 同居 `shared/layout/`（不平铺） |
| Q3 | StudioPanel + SavedArtifactPreview **同 commit** 搬到 `shared/studio/` |
| Q4 | 子目录**风格 B**（按功能分组：layout / auth / history / studio） |
| Q5 | **1 批搬完** 8 个文件（不分批） |

---

## 7. LoadingInteractiveContent 单独处理说明

扫描发现 `LoadingInteractiveContent.tsx` 仅被 [features/reader/deep-read/ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx) 一家 import，严格属于 `features/reader/deep-read/` 私有组件，不是真正的 shared。

本批**未处理**，建议作为下一个独立 mini commit 处理：

```
git mv components/LoadingInteractiveContent.tsx \
       features/reader/deep-read/LoadingInteractiveContent.tsx
```

仅需更新 [ExplanationPanel.tsx](features/reader/deep-read/ExplanationPanel.tsx) 1 行 import：

```diff
- import { LoadingInteractiveContent } from '@/components/LoadingInteractiveContent';
+ import { LoadingInteractiveContent } from '@/features/reader/deep-read/LoadingInteractiveContent';
```

预计耗时 < 5 分钟，搬完后 components/ 只剩 review/exam/galgame 三类。

---

## 8. P2 阶段 3 第 1 批后的 shared/ 全貌

```
shared/
├── layout/
│   ├── Header.tsx              顶部导航栏（永久挂载）
│   ├── MusicPlayer.tsx         Header 内嵌音乐播放器
│   ├── Sidebar.tsx             左侧抽屉（会话/文件夹/日历/备忘录）
│   └── WelcomeScreen.tsx       启动欢迎页
├── auth/
│   └── LoginModal.tsx          登录弹窗
├── history/
│   └── HistoryModal.tsx        历史记录弹窗
└── studio/
    ├── StudioPanel.tsx         右侧"已生成"侧栏
    └── SavedArtifactPreview.tsx 学习产物全屏/弹层预览
```

---

## 9. 用户测试清单（定向 2-5 分钟）

请跑 `npm run dev`，然后核对这 5 项：

- [ ] **登录与启动**：打开 → 看到 WelcomeScreen → 触发 LoginModal → 登录成功 → 主界面 Header + Sidebar 正常显示
- [ ] **Header 功能**：上传 PDF（顶栏入口）→ 进度/翻页按钮可用 → MusicPlayer 能展开/折叠/播放
- [ ] **Sidebar 功能**：切换历史会话 → 抽屉里的文件夹/日历/备忘录 4 套数据流正常加载
- [ ] **HistoryModal**：点开历史按钮 → 历史列表显示 → 选一份历史会话能恢复
- [ ] **StudioPanel + ArtifactFullView**：生成一份学习产物（学习指南、考前速览等任意一种）→ 右侧"已生成"侧栏出现卡片 → 点开 → 主区切到 ArtifactFullView 全屏预览（含 50%-250% 缩放工具条）→ 关闭返回正常

整体无白屏、无 console 红字（"Cannot find module" / "X is not exported" 类）。
"ERR_CONNECTION_REFUSED / 404 / CORS" 类是接口问题，不是搬迁问题，忽略。

---

## 10. 建议的 git commit message

```
refactor(p2): 把 8 个 shared 组件搬到 shared/{layout,auth,history,studio}/

- shared/layout/: Header, MusicPlayer, Sidebar, WelcomeScreen
- shared/auth/:    LoginModal
- shared/history/: HistoryModal
- shared/studio/:  StudioPanel, SavedArtifactPreview
- App.tsx 6 行 + components/ReviewPage.tsx 1 行 import 改 @/shared/...
- 内部依赖更新：Header→MusicPlayer、StudioPanel re-export SavedArtifactPreview
- LoadingInteractiveContent 不在本批，下一个 mini commit 单独搬到 deep-read/
- tsc 错误数 = 10，与基线一致（无新增）
- 8 个活文档（CONTEXT/REFACTOR_P2_PLAN/P2_DEPENDENCY_SCAN/...）旧路径同步更新

P2 阶段 3 第 1 批完工——shared/ 区域一次性归位 8 个文件。
```

---

*报告完。等用户验证通过后手动 commit。
本批共 8 个 git mv + 9 处代码 import 改动 + 1 个新 SCAN 文件入档，无任何业务逻辑改动。*
