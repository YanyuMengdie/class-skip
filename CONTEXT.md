# class-skip 项目状态文档（CONTEXT.md）

此文档记录 class-skip 项目的当前状态、决策、流程。
任何 AI 助手（外部 Claude / Claude Code / Cursor）打开此文档都能立即接续工作。
每次重大进度后请更新本文档。

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

================================================================
项目背景与目标
================================================================

class-skip 是 AI 学习平台,核心解决"学习初始化"问题(多数 EdTech 假设用户已经愿意学,class-skip 关注"如何启动学习")。

当前重构阶段(P0-P4)的目的:把屎山代码整理为可维护的模块化结构,为后续功能更新打基础。

================================================================
重构总体路径
================================================================

- P0 已完成：删除死代码、归档无用 prompts
- P1 已完成（融入 P0）：清理重复别名
- P2 进行中：目录重构（components/ → features/ + shared/）
- P3 未开始：拆 services/geminiService.ts 大文件
- P4 未开始：拆 App.tsx（2856 行）

================================================================
P2 目录重构方案（已敲定）
================================================================

最终目录结构：

features/
├── reader/                          阅读会话
│   ├── slide-viewer/SlideViewer.tsx
│   ├── page-notes/SlidePageComments.tsx
│   ├── marks/PageMarkPanel.tsx
│   ├── skim/                        略读模式 + 5 个卫星文件
│   │   ├── SkimPanel.tsx
│   │   ├── skimMarkdownTheme.tsx
│   │   ├── skimMarkdownToExportHtml.ts
│   │   ├── extractNthGfmTable.ts
│   │   └── captureElementToPng.ts
│   ├── deep-read/ExplanationPanel.tsx     仅精读用
│   ├── notebook/Notebook.tsx              借用 Skim 的 markdownTheme + ExportHtml
│   └── side-quest/SideQuestPanel.tsx      全局选词追问
├── review/                          "学习工具"按钮（九宫格中枢）
│   ├── ReviewPage.tsx
│   └── tools/                       11 个学习工具
│       ├── QuizReviewPanel.tsx
│       ├── FlashCardReviewPanel.tsx
│       ├── StudyGuidePanel.tsx
│       ├── TerminologyPanel.tsx
│       ├── FeynmanPanel.tsx
│       ├── TrickyProfessorPanel.tsx
│       ├── TrapListPanel.tsx
│       ├── MultiDocQAPanel.tsx
│       ├── ExamSummaryPanel.tsx
│       ├── ExamTrapsPanel.tsx
│       └── mindMap/
│           ├── MindMapPanel.tsx
│           ├── MindMapFlowCanvas.tsx
│           └── MindMapFlowNode.tsx
├── exam/                            "考试复习"按钮 + 考试中心（17+ 文件）
│   ├── ExamWorkspacePage.tsx
│   ├── ExamWorkspaceSocraticChat.tsx
│   ├── ExamWorkspaceMaterialPreview.tsx
│   ├── ExamWorkspaceCitationBlock.tsx
│   ├── ExamWorkspaceAssistantMarkdown.tsx
│   ├── ExamHubModal.tsx
│   ├── ExamCenterPanel.tsx
│   ├── ExamLinkModal.tsx
│   ├── ExamPredictionPanel.tsx
│   ├── ExamDailyMaintenancePanel.tsx
│   ├── MaintenanceFlashcardDeck.tsx
│   ├── MaintenanceFeedbackCelebration.tsx
│   ├── StudyFlowPanel.tsx
│   ├── WorkspaceEvidenceReportModal.tsx
│   ├── WorkspaceKcProbeModal.tsx
│   ├── KnowledgePointInspectPanel.tsx
│   └── KcGlossarySidebar.tsx
├── sessionStart/                    文档加载后的开场流
│   ├── MoodDialog.tsx
│   └── FiveMinFlowPanel.tsx
├── energyRefuel/                    AI 能量补给站（容器在 App.tsx 内联）
│   ├── ChatHug.tsx
│   └── TaskHug.tsx
├── lecture/                         上课模式
│   ├── ClassroomPanel.tsx
│   └── LectureTranscriptPage.tsx
└── turtleSoup/
    └── TurtleSoupPanel.tsx          已搬完

shared/                              多处共用的基础设施
├── Header.tsx
├── Sidebar.tsx
├── WelcomeScreen.tsx
├── LoginModal.tsx
├── HistoryModal.tsx
├── MusicPlayer.tsx
├── LoadingInteractiveContent.tsx
├── StudioPanel.tsx
└── SavedArtifactPreview.tsx

_archived/components/galgame/        已归档（不参与构建）
├── GalgameOverlay.tsx
└── GalgameSettings.tsx

================================================================
关键归类决策
================================================================

1. 按"产品入口"归类（不是按"功能领域"）——九宫格 11 个工具全部归 features/review/tools/
2. MoodDialog 不是"考试此刻心态"——是文档加载后的"开场兴致询问"
3. ExplanationPanel 不是"展开讲讲"——是精读模式右侧主工作台（仅 viewMode==='deep' 时挂载）
4. "展开讲讲"——是 App.tsx 全局 selectionchange 监听 → SideQuestPanel
5. Notebook 借用 Skim 卫星——搬 Skim 时 Notebook 的 import 要跟着改
6. TurtleSoup 与 Header 无直接耦合——可独立搬

================================================================
P2 搬迁标准流程（基于 TURTLESOUP_MIGRATION.md 沉淀）
================================================================

每个模块按以下 6 步执行：

1. mkdir -p features/<feature>/
2. git mv components/X.tsx features/<feature>/X.tsx
3. 全仓 grep "X" 找出所有外部 import → 改 specifier 为新路径
4. 检查搬过去文件自身的 import 是否已是 @/（别名迁移完成后这步几乎不需手改）
5. npx tsc --noEmit → 错误数应保持 10，无 "Cannot find module"
6. 写 <Module>_MIGRATION.md 报告 → 等用户跑 npm run dev 测试 → 用户手动 commit

工程基础设施（已就位）：
- 路径别名：@/ 指向项目根（vite.config.ts 已配 + tsconfig.json baseUrl="."）
- 别名迁移脚本：scripts/migrate-to-alias.mjs（幂等可重复运行）
- TypeScript 错误基线：10 个（历史遗留，与本次重构无关）

================================================================
已完成的搬迁
================================================================

| 模块                  | 文件数 | 状态         | 报告                       |
|----------------------|------|-------------|---------------------------|
| features/turtleSoup/ | 1    | Day 2 完成  | TURTLESOUP_MIGRATION.md   |

================================================================
待完成的搬迁（按建议顺序）
================================================================

阶段 1：独立小模块（约 1 小时）
- features/lecture/（2 文件）
- features/energyRefuel/（2 文件）
- features/sessionStart/（2 文件）

阶段 2：阅读区域（约 2 小时，必须连续做完）
- features/reader/skim/（5 文件，含卫星）
- features/reader/deep-read/（1 文件）
- features/reader/slide-viewer/（1 文件）
- features/reader/page-notes/（1 文件）
- features/reader/marks/（1 文件）
- features/reader/side-quest/（1 文件）
- features/reader/notebook/（1 文件，注意要更新 import 略读卫星的路径）

阶段 3：大模块（约 4-5 小时）
- features/review/（含 tools/，13 文件）
- features/exam/（17+ 文件）
- shared/（9 文件）

阶段 4（可选，可推到 P3）
- utils → lib/ 重组

================================================================
重要参考文档（项目根目录）
================================================================

| 文档                          | 用途                              |
|------------------------------|----------------------------------|
| REFACTOR_PLAN.md             | 重构总计划                         |
| REFACTOR_AUDIT.md            | 阶段 1 审计报告                    |
| DEAD_CODE_CONFIRMED.md       | 死代码二次核查                     |
| REFACTOR_P2_PLAN.md          | P2 总方案                         |
| P2_ENTRY_POINTS.md           | 入口排查                          |
| P2_COMPONENT_GLOSSARY.md     | 组件功能清单                       |
| P2_DEPENDENCY_SCAN.md        | 完整依赖扫描                       |
| ALIAS_MIGRATION_REPORT.md    | 路径别名迁移报告                   |
| TURTLESOUP_MIGRATION.md      | 第一次搬迁报告（标准流程范本）       |
| docs/SKIM_VS_EXAM_TUTOR_API.md | 略读 vs 备考 API 契约            |

================================================================
工作流约定
================================================================

三个 AI 助手分工：
- 外部 Claude（claude.ai 网页）：策略判断、教学、决策歧义时调用
- Claude Code（VS Code 扩展）：实际执行——读改文件、跑命令、自动化搬迁
- Cursor（Mac）：业务语义最熟，归类有歧义时调用确认

用户验证节奏：
- Claude Code 完成一个模块后停下来等用户验证
- 用户在 Windows 跑 npm run dev，浏览器测试该模块的功能
- 用户测试通过后手动 git add . && git commit && git push
- 不要 Claude Code 自动 commit，commit 控制权在用户

错误时的回退：
- git status                看现状
- git restore .             撤销未 commit 的改动
- git reset --hard <hash>   回到某个之前的 commit

安全网完整：refactor 分支干活、main 不动、有 before-refactor tag。

================================================================
Git 历史关键节点
================================================================

e702db4 refactor(p2): 把 TurtleSoupPanel 搬到 features/turtleSoup/
a795f76 refactor(imports): rewrite all relative imports to @/ alias (80 files, 232 imports)
7181698 chore(scripts): add migrate-to-alias.mjs
c86b2f2 chore(tsconfig): add baseUrl to enable @/ path alias
9498a4a refactor(cleanup): 删除 examChunkRetrieval search 重复别名
3ad6766 refactor(archive): 归档 galgame 相关 prompts
ec9aa59 chore(cleanup): 删除两个无引用的死代码文件
ea63069 (tag: before-refactor) docs: 添加重构计划文档
aff6f3e 迁移到Windows，准备开始屎山重构

================================================================
本文档应在每次重大进度后更新。
下一步：Day 3 - 完成 P2 阶段 1 三个模块（lecture / energyRefuel / sessionStart）。
================================================================
