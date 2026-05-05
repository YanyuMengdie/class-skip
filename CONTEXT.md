# class-skip 项目状态文档（CONTEXT.md）

此文档记录 class-skip 项目的当前状态、决策、流程。
任何 AI 助手（外部 Claude / Claude Code / Cursor）打开此文档都能立即接续工作。
每次重大进度后请更新本文档。

最后更新：2026-05-04 · P2 阶段 3 第 1 批（shared/）搬迁后

================================================================
项目基本信息
================================================================

- 项目名：class-skip
- 技术栈：React + TypeScript + Vite + Firebase
- GitHub：github.com/YanyuMengdie/class-skip
- 项目位置（Windows）：D:\Projects\class-skip\
- 当前分支：refactor（重构干活分支）
- 主分支：main（不动，永远保持稳定）
- 还原点 tag：before-refactor

================================================================
用户信息
================================================================

- 姓名：Criss（YanyuMengdie）
- 背景：UofT 大四学生（细胞分子生物学 + 健康疾病）
- 角色：独立开发者 + 产品负责人
- 代码经验：不会写代码，依赖 AI 辅助
- 沟通风格偏好：情景化比喻、通俗讲解、不要堆术语
- 工作风格：警觉性高，习惯打断 AI 错误判断；遇到意外让 AI 立即停下报告

================================================================
项目背景与目标
================================================================

class-skip 是 AI 学习平台,核心解决"学习初始化"问题(多数 EdTech 假设用户已经愿意学,
class-skip 关注"如何启动学习")。

当前重构阶段(P0-P4)的目的:把屎山代码整理为可维护的模块化结构,为后续功能更新打基础。

================================================================
重构总体路径（REFACTOR_PLAN.md 五阶段视角）
================================================================

- ✅ 阶段 1：审计（REFACTOR_AUDIT.md）
- ✅ 阶段 2：清理死代码（DEAD_CODE_CONFIRMED.md）
- 🔵 阶段 3：重组目录结构（components/ → features/ + shared/）← 当前在此
- ⏳ 阶段 4：拆巨型组件（App.tsx 2856 行、SkimPanel.tsx 1309 行等）
- ⏳ 阶段 5：类型严格化 + 测试

注：项目内部还有"P0/P1/P2/P3/P4"的阶段命名（来自更早期的规划），
P2 即对应 REFACTOR_PLAN 的阶段 3。这里以 REFACTOR_PLAN 的命名为准。

================================================================
P2（阶段 3）内部子阶段进度
================================================================

✅ 阶段 0：准备工作
   - @/ 路径别名迁移（80 文件 232 处自动改写）
   - vite.config.ts + tsconfig.json baseUrl 已配
   - scripts/migrate-to-alias.mjs 幂等脚本已就位
   - TypeScript 错误基线确定为 10 个（历史遗留）

✅ 阶段 1：4 个独立小模块（共 7 文件）
   - features/turtleSoup/  TurtleSoupPanel.tsx
   - features/lecture/     ClassroomPanel.tsx, LectureTranscriptPage.tsx
   - features/energyRefuel/ ChatHug.tsx, TaskHug.tsx
   - features/sessionStart/ MoodDialog.tsx, FiveMinFlowPanel.tsx

✅ 阶段 2：reader/ 区域（共 7 文件，分 3 批完成）
   - 第 1 批：5 个独立组件（SlideViewer + SlidePageComments + PageMarkPanel
                           + ExplanationPanel + SideQuestPanel）
   - 第 2 批：SkimPanel（最小化版，4 个"卫星文件"经三轮 git 验证 + 源码 grep
                       证实从未存在，详见 §产品事实修正）
   - 第 3 批：Notebook（与 Skim 完全独立，详见 §产品事实修正）

✅ 阶段 3：shared/（8 文件，1 批完成）
   - shared/layout/  Header, MusicPlayer, Sidebar, WelcomeScreen
   - shared/auth/    LoginModal
   - shared/history/ HistoryModal
   - shared/studio/  StudioPanel, SavedArtifactPreview
   - 剔除：LoadingInteractiveContent（属 features/reader/deep-read/ 私有，
                                    将作为下一个 mini commit 单独搬）

🔵 阶段 3：剩余大模块（待做）
   - LoadingInteractiveContent → features/reader/deep-read/（mini commit）
   - features/review/ + tools/（13 文件）
   - features/exam/（17+ 文件）

⏳ 阶段 4：utils → lib/ 重组（28 文件）

================================================================
当前真实目录结构（基于 git ls-tree 实测）
================================================================

shared/ 已搬迁 8 个文件，分布在 4 个子目录：

shared/
├── layout/
│   ├── Header.tsx
│   ├── MusicPlayer.tsx
│   ├── Sidebar.tsx
│   └── WelcomeScreen.tsx
├── auth/
│   └── LoginModal.tsx
├── history/
│   └── HistoryModal.tsx
└── studio/
    ├── StudioPanel.tsx
    └── SavedArtifactPreview.tsx

features/ 已搬迁 14 个文件，分布在 7 个子目录：

features/
├── energyRefuel/
│   ├── ChatHug.tsx
│   └── TaskHug.tsx
├── lecture/
│   ├── ClassroomPanel.tsx
│   └── LectureTranscriptPage.tsx
├── reader/
│   ├── deep-read/
│   │   └── ExplanationPanel.tsx
│   ├── marks/
│   │   └── PageMarkPanel.tsx
│   ├── notebook/
│   │   └── Notebook.tsx
│   ├── page-notes/
│   │   └── SlidePageComments.tsx
│   ├── side-quest/
│   │   └── SideQuestPanel.tsx
│   ├── skim/
│   │   └── SkimPanel.tsx          (1309 行内联实现，无独立卫星文件)
│   └── slide-viewer/
│       └── SlideViewer.tsx
├── sessionStart/
│   ├── FiveMinFlowPanel.tsx
│   └── MoodDialog.tsx
└── turtleSoup/
    └── TurtleSoupPanel.tsx

components/ 仍剩 34 个文件，按归类候选分类：

候选 features/exam/（17 文件）：
  ExamCenterPanel, ExamDailyMaintenancePanel, ExamHubModal, ExamLinkModal,
  ExamPredictionPanel, ExamSummaryPanel, ExamTrapsPanel,
  ExamWorkspaceAssistantMarkdown, ExamWorkspaceCitationBlock,
  ExamWorkspaceMaterialPreview, ExamWorkspacePage, ExamWorkspaceSocraticChat,
  KcGlossarySidebar, KnowledgePointInspectPanel, MaintenanceFeedbackCelebration,
  MaintenanceFlashcardDeck, StudyFlowPanel, WorkspaceEvidenceReportModal,
  WorkspaceKcProbeModal

候选 features/review/tools/（11 文件）：
  FeynmanPanel, FlashCardReviewPanel, MultiDocQAPanel, QuizReviewPanel,
  ReviewPage, StudyGuidePanel, TerminologyPanel, TrapListPanel,
  TrickyProfessorPanel, MindMapPanel, MindMapFlowCanvas, MindMapFlowNode

残留待单独处理（1 文件）：
  LoadingInteractiveContent（仅 ExplanationPanel 使用，下一个 mini commit
                             搬到 features/reader/deep-read/）

待归档或单独处理（2 文件）：
  GalgameOverlay, GalgameSettings（之前规划为已归档，实际仍在 components/，
  本批不动）

utils/（28 文件，待 P2 阶段 4 重组到 lib/）：
  artifactSourceLabel, bkt, collectSavedArtifactsFromCloud,
  collectSavedArtifactsFromLocalHistory, examChunkIndex, examChunkRetrieval,
  examMaintenanceEligibility, examSchedule, examWorkspaceCitations,
  examWorkspaceLsapKey, examWorkspaceOrchestrator, extractBoldTermsFromMarkdown,
  glossaryTermFilter, lsapScore, maintenanceStrategy, mergeArtifactLibraries,
  mindMapElkLayout, mindMapFlowAdapter, mindMapLabel, mindMapLayout, prompts,
  savedArtifactMeta, scaffoldingClassifier, studyFlowInference, textUtils
  （另有 mindMapScope / pdfQuoteHighlight / pdfUtils 三个文件在两次 ls 之间
  出现差异，需在 P2 阶段 4 启动时重新核对）

================================================================
App.tsx 状态（重要）
================================================================

App.tsx 当前 2856 行，与 P2 重构开始前一致。

P2 重构期间 App.tsx 的所有改动均为搬迁带来的 import 路径更新（每次搬迁同步
修改 1-5 行 import），业务逻辑未触碰。

App.tsx 的实质性拆分属于 REFACTOR_PLAN.md 阶段 4 "拆巨型组件" 的范畴，
不在当前 P2 范围内。当前 P2（阶段 3）完成后才会进入这个工作。

下次新 AI 看到 App.tsx 2856 行不要慌着拆——这是计划内的未来工作。

================================================================
产品事实修正（避免重复犯错）
================================================================

以下事实在过去搬迁中由三轮 git 验证 + 源码 grep 证实，旧版 CONTEXT.md 与之
不符。以本节为准：

1. features/reader/skim/ 实际只有 SkimPanel.tsx 一个文件
   ────────────────────────────────────────────────────────
   旧描述："5 个卫星文件——SkimPanel + skimMarkdownTheme +
           skimMarkdownToExportHtml + extractNthGfmTable + captureElementToPng"
   实际：4 个卫星文件（skimMarkdownTheme / skimMarkdownToExportHtml /
        extractNthGfmTable / captureElementToPng）从未在任何分支、任何
        commit 中存在过。markdown 主题、HTML 导出、表格提取等逻辑全部
        在 SkimPanel.tsx 1309 行内联实现。
   证据：READER_BATCH2_SKIM_MIGRATION.md §5

2. features/reader/notebook/Notebook.tsx 与 Skim 完全独立
   ────────────────────────────────────────────────────────
   旧描述："Notebook 借用 Skim 的 markdownTheme + ExportHtml"
   实际：Notebook.tsx 只有 4 行 import（react / lucide-react / @/types /
        @/utils/textUtils），不 import 任何 skim 相关文件。
   证据：NOTEBOOK_PRE_MIGRATION_SCAN.md §1, §4

3. ExplanationPanel ≠ "展开讲讲"
   ExplanationPanel 是精读模式右侧主工作台（仅 viewMode==='deep' 挂载）。
   "展开讲讲"是 App.tsx 全局 selectionchange 监听 → SideQuestPanel。

4. MoodDialog ≠ "考试此刻心态"
   MoodDialog 是文档加载完成后弹的"开场兴致询问"。
   "此刻心态"是 ExamDailyMaintenancePanel 内的 learnerMood 按钮组。

5. 略读和精读是平行模式，由 viewMode === 'deep' | 'skim' 切换。

6. 上课模式（ClassroomPanel + LectureTranscriptPage）用户说还会完善，
   保留不动。

7. 海龟汤是独立小游戏，与 Header 无直接耦合（都从 App.tsx 读
   completedSegmentsCount）。

8. AI 能量补给站没有独立容器组件，整体是 App.tsx 里 {isEnergyMode && (...)}
   内联 JSX。

================================================================
关键归类决策
================================================================

1. 按"产品入口"归类（不是按"功能领域"）——九宫格 11 个工具全部归
   features/review/tools/

2. 笔记数据流：
   - 生产端：features/reader/deep-read/ExplanationPanel + 
            features/reader/skim/SkimPanel 各自有 onNotebookAdd 回调
   - 消费端：features/reader/notebook/Notebook
   - 数据流向：App.tsx 注入 handleAddNote → 上述两个面板调用 → 
              通过 props 链路回到 Notebook 渲染
   - 这是 props 链路，不是 import 关系

3. utils/textUtils.ts 是 reader 多个子模块共用的"通用文本工具"，
   留在 utils/，等 P2 阶段 4 统一迁至 lib/text/

================================================================
P2 搬迁标准流程（基于 7 次成功搬迁沉淀）
================================================================

每个模块按以下 6 步执行：

1. mkdir -p features/<feature>/
2. git mv components/X.tsx features/<feature>/X.tsx
3. 全仓 grep 找出所有外部 import → 改 specifier 为 @/ 别名新路径
4. 检查搬过去文件自身的 import 是否已是 @/（别名迁移完成后这步几乎不需手改）
5. npx tsc --noEmit → 错误数应保持 10，无 "Cannot find module"
6. 写 <Module>_MIGRATION.md 报告 → 等用户跑 npm run dev 测试 → 用户手动 commit

每批搬迁前必做预扫描（基于第 2 批教训）：
- 让 Claude Code 先做只读扫描，输出 PRE_MIGRATION_SCAN.md
- 内容：实际文件清单、每个文件被谁 import、跨模块依赖、独占/共享 utils 判断
- 用户看完扫描结果再发正式搬迁任务包
- 这一步能避免"任务清单与实际仓库不符"导致的踩坑

================================================================
工作流约定
================================================================

三个 AI 助手分工：
- 外部 Claude（claude.ai 网页）：策略判断、教学、决策歧义时调用、写任务包
- Claude Code（VS Code 扩展）：实际执行——读改文件、跑命令、自动化搬迁
- Cursor（Mac）：业务语义最熟，归类有歧义时调用确认

外部 Claude 与用户互动风格（基于 REFACTOR_PLAN.md §6 沉淀）：
- 复杂决策点列 Q1/Q2/Q3 让用户拍板，不直接给单一方案
- 每次重构前明确告知"这次改动影响范围是 X、Y、Z"
- 测试清单按"定向测试 2-5 分钟"标准给（3-5 项核心功能），不要堆 11 项
- 完整冒烟测试只在每个大阶段收官时做一次（用 §必测功能清单）

用户验证节奏：
- Claude Code 完成一个模块后停下来等用户验证
- 用户在 Windows 跑 npm run dev，浏览器测试该模块的功能
- 用户测试通过后手动 git add . && git commit && git push
- Claude Code 不自动 commit，commit 控制权在用户

console 红字快速判断：
- "Cannot find module / X is not exported / Cannot read property" → 是搬迁问题
- "ERR_CONNECTION_REFUSED / Failed to fetch / 404 / CORS" → 不是搬迁问题，忽略

错误时的回退：
- git status                看现状
- git restore .             撤销未 commit 的改动
- git reset --hard <hash>   回到某个之前的 commit

安全网完整：refactor 分支干活、main 不动、有 before-refactor tag。

================================================================
重要参考文档（项目根目录）
================================================================

| 文档                                | 用途                              |
|------------------------------------|----------------------------------|
| REFACTOR_PLAN.md                   | 重构总计划                         |
| REFACTOR_AUDIT.md                  | 阶段 1 审计报告                    |
| DEAD_CODE_CONFIRMED.md             | 死代码二次核查                     |
| REFACTOR_P2_PLAN.md                | P2 总方案                         |
| P2_ENTRY_POINTS.md                 | 入口排查                          |
| P2_COMPONENT_GLOSSARY.md           | 组件功能清单                       |
| P2_DEPENDENCY_SCAN.md              | 完整依赖扫描（卫星文件清单已证伪）   |
| ALIAS_MIGRATION_REPORT.md          | 路径别名迁移报告                   |
| TURTLESOUP_MIGRATION.md            | 第一次搬迁（标准流程范本）          |
| LECTURE_MIGRATION.md               | 阶段 1                           |
| ENERGYREFUEL_MIGRATION.md          | 阶段 1                           |
| SESSIONSTART_MIGRATION.md          | 阶段 1                           |
| READER_BATCH1_MIGRATION.md         | 阶段 2 第 1 批（5 文件）           |
| READER_BATCH2_SKIM_MIGRATION.md    | 阶段 2 第 2 批（含卫星文件证伪）    |
| NOTEBOOK_PRE_MIGRATION_SCAN.md     | 阶段 2 第 3 批的预扫描            |
| READER_BATCH3_NOTEBOOK_MIGRATION.md| 阶段 2 第 3 批                   |
| SHARED_PRE_MIGRATION_SCAN.md       | 阶段 3 第 1 批的预扫描            |
| SHARED_BATCH1_MIGRATION.md         | 阶段 3 第 1 批                   |
| docs/SKIM_VS_EXAM_TUTOR_API.md     | 略读 vs 备考 API 契约            |

================================================================
Git 历史关键节点
================================================================

(待 commit) refactor(p2): 把 8 个 shared 组件搬到 shared/{layout,auth,history,studio}/
7234b14 refactor(p2): 把 Notebook 搬到 features/reader/notebook/
038298e refactor(p2): 把 SkimPanel 搬到 features/reader/skim/
3147ecb refactor(p2): 把 5 个独立阅读组件搬到 features/reader/
a8cd46e refactor(p2): 把 MoodDialog + FiveMinFlowPanel 搬到 features/sessionStart/
bacf1f4 refactor(p2): 把 ChatHug + TaskHug 搬到 features/energyRefuel/
6b092cb refactor(p2): 把 ClassroomPanel + LectureTranscriptPage 搬到 features/lecture/
00e77db docs: add CONTEXT.md for AI handoff
e702db4 refactor(p2): 把 TurtleSoupPanel 搬到 features/turtleSoup/
a795f76 refactor(imports): rewrite all relative imports to @/ alias (80 files, 232 imports)
7181698 chore(scripts): add migrate-to-alias.mjs for automated import rewrite
c86b2f2 chore(tsconfig): add baseUrl to enable @/ path alias
9498a4a refactor(cleanup): 删除 examChunkRetrieval 中的 search 重复别名
3ad6766 refactor(archive): 归档 galgame 相关 prompts
ec9aa59 chore(cleanup): 删除两个无引用的死代码文件
c848967 docs: 死代码确认报告
3666fa4 docs: 阶段 1 审计报告
ea63069 (tag: before-refactor) docs: 添加重构计划文档
aff6f3e 迁移到 Windows，准备开始屎山重构

================================================================
当前下一步
================================================================

P2 阶段 3 第 1 批（shared/）已搬完 8 个文件，等用户验证 + commit。

接下来按顺序：

1. mini commit：LoadingInteractiveContent → features/reader/deep-read/
   （仅 1 文件 + ExplanationPanel.tsx 1 行 import 改动）

2. P2 阶段 3 第 2 批：features/review/ + tools/（13 文件）
   - 候选：FeynmanPanel, FlashCardReviewPanel, MultiDocQAPanel, QuizReviewPanel,
           ReviewPage, StudyGuidePanel, TerminologyPanel, TrapListPanel,
           TrickyProfessorPanel, MindMapPanel, MindMapFlowCanvas, MindMapFlowNode

3. P2 阶段 3 第 3 批：features/exam/（17+ 文件）

4. P2 阶段 4：utils → lib/ 重组（28 文件）

5. REFACTOR_PLAN.md 阶段 4：拆 App.tsx + SkimPanel.tsx 巨型组件

================================================================
本文档应在每次重大进度后更新。
当前阶段：P2 阶段 3 第 1 批（shared/）已搬完，待用户验证 + commit。
================================================================
