# P2 组件清单 —— 产品语言版

> 用普通话描述每个组件**用户角度**的形态、入口、功能、依赖。
> 范围：[components/](components/) 下当前所有 .tsx 文件（已排除 `_archived/` 和已删除的 BreakPanel / DailyExamStudyPanel）。
> 本文档**只描述、不修改任何代码**。
> 配套：[REFACTOR_AUDIT.md](REFACTOR_AUDIT.md)、[REFACTOR_P2_PLAN.md](REFACTOR_P2_PLAN.md)、[P2_ENTRY_POINTS.md](P2_ENTRY_POINTS.md)
> 生成时间：2026-05-03

---

## 阅读说明

每条记录回答四个问题：
1. **是什么** —— 用户屏幕上看到的形态（弹窗 / 抽屉 / 整页 / 顶栏 / 侧栏 / 嵌入式区块）
2. **从哪进** —— 用户点哪里 / 走什么流程能见到
3. **能做什么** —— 一句话产品功能
4. **依赖谁** —— 这个组件后台用到的其他组件 / 服务（仅产品角度提一下，不深入技术细节）

⚠️ 本文档刻意不写"props / state / hook / useEffect"，名词都是产品语言。

---

## 一、外壳与全局壳层

### Header.tsx —— 顶部导航栏
- **是什么**：屏幕最顶上一条横栏，永久可见。
- **从哪进**：登录后任何页面都能看到。
- **能做什么**：放着 Logo、当前文件名、"学习工具"按钮（蓝）、"考试复习"按钮（青）、"更多"菜单（含上课、休息、重点标记、沉浸、上课录音、计时器、白噪音）、上传 PDF、登录/退出。
- **依赖谁**：内嵌"白噪音播放器"（MusicPlayer）、内联实现"休息一下倒计时"。"考试复习"按钮负责把整页切到考试备考工作台。

### Sidebar.tsx —— 左侧栏（云端会话 / 文件夹 / 日历 / 备忘录）
- **是什么**：屏幕左边一条可折叠的抽屉，列出 4 个东西：云端历史会话、文件夹（OneNote 风树）、日历事件、便签。
- **从哪进**：登录后默认在主界面左边显示。
- **能做什么**：恢复以前打开过的 PDF、新建/重命名/移动文件夹、添加日历事件、添加便签。
- **依赖谁**：直接调 Firebase 的会话/文件夹/日历/备忘录接口。是项目里耦合最严重的组件之一（一个文件 4 套数据流）。

### WelcomeScreen.tsx —— 欢迎页
- **是什么**：还没上传 PDF / 还没开始时看到的全屏起始页。
- **从哪进**：刚打开应用 / 退出当前 PDF 后看到。
- **能做什么**：引导上传第一份 PDF 或选择历史会话。
- **依赖谁**：仅一个开始按钮。

### LoginModal.tsx —— 登录弹窗
- **是什么**：全屏遮罩 + 中央卡片的登录对话框。
- **从哪进**：点未登录状态下的"考试复习"按钮、Header 右上角云图标，或主动触发同步。
- **能做什么**：Google 一键登录或邮箱魔法链接登录。
- **依赖谁**：Firebase Auth。

### HistoryModal.tsx —— 历史记录弹窗
- **是什么**：列出本地历史 PDF 的中央弹窗。
- **从哪进**：暂未在 Header 当前菜单里看到直接入口；可能由 Sidebar 或某个"历史"按钮触发。**功能定位偏弱，可能是早期版本残留入口**——保留但优先级低。
- **能做什么**：浏览/恢复以前在本机打开过的文件。
- **依赖谁**：本机历史记录数据。

### MusicPlayer.tsx —— 白噪音播放器
- **是什么**：嵌在 Header 右侧的小弹层，含播放/暂停、音量、曲目下拉。
- **从哪进**：Header → "更多" → "白噪音"，或 Header 右侧背景音图标。
- **能做什么**：播放雨声 / 咖啡馆白噪音等。
- **依赖谁**：仅被 Header 使用，相当于 Header 的子件。

---

## 二、PDF 阅读 + 笔记主战场

### SlideViewer.tsx —— PDF 主阅读区
- **是什么**：屏幕主体大区域里的 PDF 翻页器，带左右翻页按钮、缩放、标注画笔、导出。
- **从哪进**：上传 PDF 后默认占据主区域。
- **能做什么**：翻页、做手写/划线/文字标注、把当前 PDF（含标注）导出。
- **依赖谁**：PDF 处理工具（pdfUtils）、文本工具。

### SlidePageComments.tsx —— 页面评论区
- **是什么**：当前页面下方的"本页注释"区，可折叠（默认收起）。
- **从哪进**：在 PDF 阅读页底部。
- **能做什么**：给"这一页"写一段说明，会跟着 PDF 一起保存。
- **依赖谁**：本机/云端的页面评论缓存。

### PageMarkPanel.tsx —— 重点标记面板
- **是什么**：一个右侧抽屉/面板，列出当前 PDF 各页"打过星"的位置。
- **从哪进**：Header → "更多" → "重点标记"。
- **能做什么**：把某页标重点（带分类、优先级、备注）；后续再回看时可一键跳转。
- **依赖谁**：本机存储的 pageMarks 数据。

### Notebook.tsx —— 笔记本
- **是什么**：与 PDF 关联的笔记区（按页归类，可输入富文本）。
- **从哪进**：阅读页面侧边或专门 tab 切换。
- **能做什么**：写笔记，支持上下标、HTML 显示。
- **依赖谁**：文本工具（textUtils）。

### ExplanationPanel.tsx —— 深读讲解面板
- **是什么**：屏幕右半侧（深读模式）的讲解区，能选中文字 + AI 解释；含"加载中互动"动画。
- **从哪进**：阅读模式默认是"深读"时，右半屏显示；用户在 PDF 上选词或选段后弹出讲解。
- **能做什么**：把选中的内容拿给 AI 解释、生成讲解、和讲解对话。
- **依赖谁**：geminiService 的 chatWithSlide / generateSlideExplanation；textUtils；内嵌 LoadingInteractiveContent 动画。

### LoadingInteractiveContent.tsx —— "讲解生成中"互动动画
- **是什么**：一个"AI 正在思考"占位区，不是简单转圈，而是显示几条小贴士提示让用户不无聊。
- **从哪进**：仅在 ExplanationPanel 等待 AI 返回时显示。
- **能做什么**：等待时娱乐用户、提示等待预期。
- **依赖谁**：仅被 ExplanationPanel 内嵌使用。

### SkimPanel.tsx —— 略读模式面板
- **是什么**：右半屏（略读模式下）的多阶段交互页，分诊断 / 场景选择 / 摄入 / 模块导读 / 测验等阶段。
- **从哪进**：阅读模式切到"略读 (Skim)"。
- **能做什么**：以"5 个阶段引导"的方式带用户用更少时间扫完一份 PDF；含 AI 对话和模块结尾测验。
- **依赖谁**：geminiService 中专属的 chatWithSkimAdaptiveTutor / generateGatekeeperQuiz / generateModuleTakeaways / generateModuleQuiz。⚠️ 项目里最大的单组件之一（1300+ 行）。

---

## 三、九宫格"学习工具"面板（Header 右上"学习工具"按钮 → ReviewPage 内点击触发）

> 详细按钮 ↔ 组件映射见 [P2_ENTRY_POINTS.md §3](P2_ENTRY_POINTS.md)。

### QuizReviewPanel.tsx —— 测验面板
- **是什么**：全屏遮罩 + 居中题卡的测验对话框，按"一轮一组题"做。
- **从哪进**：学习工具九宫格 → "测验"。
- **能做什么**：从当前 PDF 自动出题、做选择题、给反馈、记录历轮成绩。
- **依赖谁**：geminiService 的 generateQuizSet。

### FlashCardReviewPanel.tsx —— 闪卡复习面板
- **是什么**：全屏遮罩，正反翻面闪卡。
- **从哪进**：学习工具九宫格 → "闪卡"。
- **能做什么**：根据 PDF 自动生成卡片、用户翻面 + 标记是否记得。
- **依赖谁**：geminiService 的 generateFlashCards / estimateFlashCardCount。

### StudyGuidePanel.tsx —— 学习指南面板
- **是什么**：全屏遮罩 + Markdown 长文显示。
- **从哪进**：学习工具九宫格 → "学习指南"。
- **能做什么**：根据 PDF 生成一份完整的学习指南 Markdown（含章节、概念、复习路径）。
- **依赖谁**：geminiService 的 generateStudyGuide。

### TerminologyPanel.tsx —— 术语精确定义面板
- **是什么**：全屏遮罩 + 术语表卡片列表。
- **从哪进**：学习工具九宫格 → "术语精确定义"。
- **能做什么**：从 PDF 抽出关键术语 + 通俗定义。
- **依赖谁**：geminiService 的 extractTerminology。

### MindMapPanel.tsx —— 思维导图面板
- **是什么**：全屏遮罩 + 大画布（基于 React Flow），可缩放/拖拽。
- **从哪进**：学习工具九宫格 → "思维导图"。
- **能做什么**：让 AI 生成思维导图、自己手动建、让 AI 评判和补充、用对话修改。支持单文档和多文档。
- **依赖谁**：内含 MindMapFlowCanvas（画布壳）+ MindMapFlowNode（节点样式）；geminiService 的 4 个 mindMap 函数；ELK 布局算法。

### MindMapFlowCanvas.tsx —— 思维导图画布
- **是什么**：MindMapPanel 内部的 React Flow 画布壳子。
- **从哪进**：跟随 MindMapPanel 出现。
- **能做什么**：把树形数据画成可视化的连线图、自动布局。
- **依赖谁**：被 MindMapPanel 使用，内含 MindMapFlowNode；ELK 布局；多文档 id 加前缀。

### MindMapFlowNode.tsx —— 思维导图单个节点
- **是什么**：思维导图画布里的每个"小药丸"形节点。
- **从哪进**：跟随画布出现。
- **能做什么**：渲染一个节点（中英对照标签 + 颜色 + 操作按钮）。
- **依赖谁**：仅供 MindMapFlowCanvas 用，相当于内部实现细节。

### FeynmanPanel.tsx —— 费曼检验面板
- **是什么**：全屏遮罩 + 对话式问答区。
- **从哪进**：学习工具九宫格 → "费曼检验"。
- **能做什么**：让用户用大白话向 AI 解释知识点，AI 反过来评判 + 补缺，逼用户暴露未懂之处。
- **依赖谁**：geminiService 的 4 个 feynman 函数。

### TrickyProfessorPanel.tsx —— 刁钻教授面板
- **是什么**：全屏遮罩 + Markdown 题目区。
- **从哪进**：学习工具九宫格 → "刁钻教授"。
- **能做什么**：让 AI 以"刁钻教授"口吻出 3-5 道易错易混淆题。
- **依赖谁**：geminiService 的 generateTrickyQuestions。

### TrapListPanel.tsx —— 陷阱清单面板
- **是什么**：全屏遮罩 + 陷阱条目列表。
- **从哪进**：学习工具九宫格 → "我的陷阱清单"。
- **能做什么**：积累用户在测验/学习中标记过的"易踩坑"条目，可删除、可保存到 Studio。
- **依赖谁**：本机历史中的陷阱数据。

### ExamSummaryPanel.tsx —— 考前速览面板
- **是什么**：全屏遮罩 + Markdown 长文。
- **从哪进**：学习工具九宫格 → "考前速览"。
- **能做什么**：根据 PDF 生成 Markdown 格式的考前要点提要；可用对话方式让 AI 修改。
- **依赖谁**：geminiService 的 generateExamSummary / updateExamSummary。

### ExamTrapsPanel.tsx —— 考点与陷阱面板
- **是什么**：全屏遮罩 + Markdown 长文。
- **从哪进**：学习工具九宫格 → "考点与陷阱"。
- **能做什么**：从 PDF 抽出考点列表 + 陷阱描述。
- **依赖谁**：geminiService 的 generateExamTraps。

### MultiDocQAPanel.tsx —— 多文档问答面板
- **是什么**：全屏遮罩 + 对话区。
- **从哪进**：学习工具九宫格 → "多文档问答"。
- **能做什么**：把多份 PDF 一起喂给 AI，跨文档提问。
- **依赖谁**：geminiService 的 multiDocQAReply。

### ReviewPage.tsx —— "学习工具"整页
- **是什么**：一整页（不是 modal），上半是文档选择列表，下半是九宫格按钮 + 已生成内容（Studio）。
- **从哪进**：Header 右上"学习工具"按钮（蓝色）。
- **能做什么**：先选一份或多份文档作为复习目标，再选九宫格里要哪个工具（测验、闪卡、学习指南、思维导图、费曼……），打开对应的面板。同时显示之前生成过的产物。
- **依赖谁**：上面所有"九宫格面板"组件、StudioPanel、SavedArtifactPreview；以及 Firebase 的会话获取。

---

## 四、考试复习路线（Header 右上"考试复习"青色按钮 → ExamWorkspacePage 整页）

### ExamWorkspacePage.tsx —— 备考工作台主页
- **是什么**：占满全屏的整页（不是弹窗），页内布局含选材料栏、Socratic 对话、KC 玻璃柜、底部预测分横条等多个分区。
- **从哪进**：Header 右上"考试复习"按钮（青色）。
- **能做什么**：选一场考试 → 看关联材料 → 进对话学 → 探针 KC → 看预测分。是项目里第二复杂的页面。
- **依赖谁**：内含 ExamWorkspaceSocraticChat、ExamWorkspaceMaterialPreview、KcGlossarySidebar、KnowledgePointInspectPanel、WorkspaceKcProbeModal、WorkspaceEvidenceReportModal；调 Firebase 拿考试和材料关联；BM25 检索；本地块索引存储。

### ExamWorkspaceSocraticChat.tsx —— 工作台内的 Socratic 对话
- **是什么**：工作台中央的对话区（消息流 + 输入框）。
- **从哪进**：进入备考工作台后，对话区即可使用。
- **能做什么**：以苏格拉底教学法和用户对话；对话中识别黑板术语、做检索、解析引文。
- **依赖谁**：内含 ExamWorkspaceAssistantMarkdown 渲染助手回复；geminiService 的 chatWithAdaptiveTutor + 多个 LSAP 探针函数；学科支架分类器；BM25 检索；术语过滤。

### ExamWorkspaceAssistantMarkdown.tsx —— 助手回复 Markdown 渲染器
- **是什么**：对话气泡内部的 Markdown + 引文渲染插件。
- **从哪进**：用户看不到独立入口，仅作为对话气泡的内容渲染器出现。
- **能做什么**：把 AI 回复的 Markdown 渲染成排版精美的内容，特别处理"引文卡片"块。
- **依赖谁**：内含 ExamWorkspaceCitationBlock；引文解析工具。

### ExamWorkspaceCitationBlock.tsx —— 引文卡片块
- **是什么**：对话气泡里嵌的"引用了第 N 页第 X 段"小卡片。
- **从哪进**：助手回复包含引用时显示。
- **能做什么**：点击后跳到 PDF 对应页 + 高亮原文。
- **依赖谁**：被 ExamWorkspaceSocraticChat 和 ExamWorkspaceAssistantMarkdown 使用。

### ExamWorkspaceMaterialPreview.tsx —— 工作台 PDF 预览（带引文高亮）
- **是什么**：工作台右侧的 PDF 预览面板，可缩放、可换材料、引文高亮。
- **从哪进**：进入备考工作台默认显示在右侧/中部；点击引文卡片跳转。
- **能做什么**：PDF 翻页、缩放、根据引文坐标高亮某段。
- **依赖谁**：PDF 工具、引文高亮坐标计算。

### KcGlossarySidebar.tsx —— KC 玻璃柜（知识点术语侧栏）
- **是什么**：工作台右侧或抽屉里的术语+知识点（KC）侧栏。
- **从哪进**：在备考工作台界面中显示。
- **能做什么**：列出本场对话中累积的术语和 KC、可点开查看详情。
- **依赖谁**：被 ExamWorkspacePage 嵌入。

### KnowledgePointInspectPanel.tsx —— 单个知识点详情弹窗
- **是什么**：点开某个 KC 后的弹窗，显示这个知识点的详细信息。
- **从哪进**：在 KcGlossarySidebar 或对话里点击某个 KC。
- **能做什么**：查看 KC 内容、相关材料、当前掌握度。
- **依赖谁**：仅在工作台上下文中。

### WorkspaceKcProbeModal.tsx —— KC 探针弹窗
- **是什么**：弹出对某个 KC 出题的考察弹窗。
- **从哪进**：在工作台主动触发，或对话编排器自动触发。
- **能做什么**：出一道针对该 KC 的题、记答题结果、更新 BKT 知识掌握度、刷新预测分。
- **依赖谁**：geminiService 的 LSAP 探针生成与评估、BKT 算法、LSAP 预测分；嵌入 WorkspaceEvidenceReportModal 的 ConflictPageHint。

### WorkspaceEvidenceReportModal.tsx —— 工作台学习证据报告弹窗
- **是什么**：一个总结性弹窗，展示"对话证据报告 Markdown"。
- **从哪进**：在工作台某个总结/复盘按钮触发。
- **能做什么**：把整场对话整理成一份证据报告 Markdown，含 KC 覆盖、引用页码冲突提示等。
- **依赖谁**：工作台对话存档；同文件内导出工具函数 `buildWorkspaceEvidenceMarkdown` / `ConflictPageHint`。

### ExamPredictionPanel.tsx —— 考前预测面板
- **是什么**：全屏遮罩或工作台子页，显示一份"预测分 + KC 网格"。
- **从哪进**：学习工具九宫格的"考前预测"按钮，或备考工作台底部"进入考前预测"。
- **能做什么**：看每个 KC 的当前掌握度 + 总预测分，可以挑一个 KC 进入针对性出题/教学。
- **依赖谁**：geminiService 中多个预测/出题/教学函数、BKT、LSAP 预测分。⚠️ 项目第三大组件（1000+ 行）。

---

## 五、考试中心（Header → 更多 → 考试复习里 / 工作台内"考试中心"按钮）

### ExamHubModal.tsx —— 考试中心主弹窗（带 tab）
- **是什么**：中央大弹窗，顶部三个 tab："考试管理" / "今日学习" / "情境流程"。
- **从哪进**：备考工作台内点"考试中心"按钮；或某些场景的快捷入口。
- **能做什么**：作为三个面板（ExamCenterPanel / ExamDailyMaintenancePanel / StudyFlowPanel）的容器和 tab 切换。
- **依赖谁**：内含上述三个面板。

### ExamCenterPanel.tsx —— 考试管理 tab 内容
- **是什么**：弹窗内容区，列出"我的考试"，每场考试可关联 PDF 材料。
- **从哪进**：考试中心弹窗 → "考试管理" tab。
- **能做什么**：新建考试（标题/学科/日期）、给考试关联材料（本机/云端/当前打开）、删除考试、添加日历事件。
- **依赖谁**：内含 ExamLinkModal；Firebase 考试/材料链接接口。

### ExamLinkModal.tsx —— 考试材料关联弹窗
- **是什么**：层叠在考试中心之上的二级弹窗，专门用来选材料。
- **从哪进**：在 ExamCenterPanel 点"关联材料"按钮。
- **能做什么**：从本地历史 / 云端 / 当前打开的 PDF 里选一个或多个，绑到指定考试。
- **依赖谁**：Firebase 和本机历史。

### ExamDailyMaintenancePanel.tsx —— 今日保温学习面板
- **是什么**：弹窗内容区，含"此刻心态、目标闪卡数量、要维持手感的考试"三段表单 + "生成今日保温闪卡"按钮 + 反馈区。
- **从哪进**：考试中心弹窗 → "今日学习" tab。
- **能做什么**：根据用户当前情绪/目标/选定考试，生成一组保温学习用的闪卡 + 测验，鼓励完成后做正反馈。
- **依赖谁**：内含 MaintenanceFlashcardDeck（闪卡呈现）、MaintenanceFeedbackCelebration（完成庆祝）；geminiService 的 generateMaintenanceFlashCards + generateQuizSet；维护策略与资格判断算法；维护文案数据。

### MaintenanceFlashcardDeck.tsx —— 保温闪卡卡组（轻量版）
- **是什么**：今日保温学习里的简化卡组浏览器。
- **从哪进**：在 ExamDailyMaintenancePanel 内自动展示。
- **能做什么**：呈现保温闪卡、用户勾选已记住/没记住。比正经"FlashCardReviewPanel"轻量得多。
- **依赖谁**：仅被 ExamDailyMaintenancePanel 嵌入。

### MaintenanceFeedbackCelebration.tsx —— 完成庆祝弹片
- **是什么**：完成一组保温学习后弹出的小庆祝/鼓励片段。
- **从哪进**：完成 ExamDailyMaintenancePanel 一轮后自动出现。
- **能做什么**：用温暖文案肯定用户、展示这次学到了什么。
- **依赖谁**：仅被 ExamDailyMaintenancePanel 嵌入。

### StudyFlowPanel.tsx —— 情境流程面板
- **是什么**：弹窗内容区，根据"用户的情境"（紧迫度/熟悉度/心情）推荐一个分步学习计划。
- **从哪进**：考试中心弹窗 → "情境流程" tab。
- **能做什么**：选择当前场景（如"还有 3 天就考试且没看过"），系统推一份步骤化清单（先 X 再 Y 再 Z），每步可"执行"打开对应工具。
- **依赖谁**：情境推断算法 + 模板库（data/studyFlowTemplates）。

---

## 六、心情对话 / 任务支持

### MoodDialog.tsx —— 心情简短弹窗
- **是什么**：一个简短的小弹窗，问用户"现在心情怎么样"。
- **从哪进**：在 5 分钟启动流程或某些过渡时刻自动弹出。
- **能做什么**：让用户选自己当前心情（几个选项），把心情传给后续个性化逻辑。
- **依赖谁**：纯 UI，无 AI 调用。

### TaskHug.tsx —— 任务拥抱
- **是什么**：一个 AI 引导的"梳理任务"对话区。
- **从哪进**：菜单/快捷键触发（具体入口需 Criss 确认；当前在 App.tsx 里有渲染）。
- **能做什么**：用户告诉它今天有哪些任务，AI 帮拆解、安排顺序、给情绪支持。
- **依赖谁**：geminiService 的 runTaskHugAgent / runTaskHugChat。

### ChatHug.tsx —— 闲聊拥抱
- **是什么**：一个无目的的安抚式对话区。
- **从哪进**：和 TaskHug 类似的入口（有"结束对话"按钮）。
- **能做什么**：让 AI 像朋友一样陪用户随便聊几句、缓解学习焦虑。
- **依赖谁**：geminiService 的 runChatHugAgent。

---

## 七、5 分钟启动流 / 上课模式 / 番茄钟奖励

### FiveMinFlowPanel.tsx —— 5 分钟启动流
- **是什么**：一个 5 分钟限时的全屏引导流程。
- **从哪进**：Header → "更多" → "只学 5 分钟"。
- **能做什么**：以低压力方式让用户先看一份超简学习指南 + 微测验，让"不想学"也能起步。
- **依赖谁**：geminiService 的 generateFiveMinGuide + extractTerminology + generateQuizSet。

### ClassroomPanel.tsx —— 上课模式录音控制台
- **是什么**：上课中右半屏的录音状态显示器（实时转写显示）。
- **从哪进**：Header → "更多" → "上课"按钮触发上课模式后显示。
- **能做什么**：开始/结束录音、显示实时转写文本、保存课堂到讲座库。
- **依赖谁**：浏览器 Web Speech 转写服务。

### LectureTranscriptPage.tsx —— 上课文字稿整页
- **是什么**：一整页（不是 modal），列出所有保存过的课堂录音文字稿。
- **从哪进**：Header → "更多" → "上课录音文本"。
- **能做什么**：浏览历史录音、把零散转写整理成结构化讲义。
- **依赖谁**：geminiService 的 organizeLectureFromTranscript。

### TurtleSoupPanel.tsx —— 海龟汤推理小游戏
- **是什么**：全屏弹窗，里面是一个"汤面 + 提问 + AI 回答是/否"的推理小游戏。
- **从哪进**：Header → "更多" → "学累了/休息" → "海龟汤"。需要先用番茄钟攒"使用券"。
- **能做什么**：玩一局海龟汤、用 AI 主持人回答用户的是/否问题、用提示推进剧情。完成一局会消耗一次番茄段奖励。
- **依赖谁**：geminiService 的 3 个 turtleSoup 函数。父组件 App.tsx 给它注入"已完成番茄段数"作为通行证。

### SideQuestPanel.tsx —— 支线任务面板
- **是什么**：全屏遮罩，呈现一个跳出当前主线的小任务/小练习。
- **从哪进**：当前入口暂未明确（在 App.tsx 中由内部触发）。**功能定位偏弱，可能是早期实验功能**——需 Criss 说明产品意图。
- **能做什么**：让 AI 抛一个偏题/支线小练习给用户做。
- **依赖谁**：geminiService 的 runSideQuestAgent。

---

## 八、Galgame（恋爱模式，产品入口已关）

### GalgameOverlay.tsx —— Galgame 剧本覆盖层
- **是什么**：占满屏幕的"角色立绘 + 对话框"二次元覆盖层。
- **从哪进**：当前**产品入口已关**（参见 [_archived/README.md](_archived/README.md)）。代码仍在仓库里。
- **能做什么**：以"蕾姆"等角色把 PDF 内容讲成 galgame 风格的台词。
- **依赖谁**：geminiService 的 generateRemStoryScript / generatePersonaStoryScript。

### GalgameSettings.tsx —— Galgame 设置弹窗
- **是什么**：弹窗，让用户设置角色名、自称、关系、性格、自定义头像和背景。
- **从哪进**：当前入口已关（同 GalgameOverlay）。
- **能做什么**：定制 galgame 角色形象、上传图片、AI 生成头像/背景。
- **依赖谁**：imageGen 服务（生成头像/背景）、Firebase 上传图片。

---

## 九、Studio（保存的产物）/ 复习历史

### StudioPanel.tsx —— Studio 抽屉/侧栏
- **是什么**：通常是一个抽屉或侧栏，列出"已生成的产物"（学习指南、考前速览、思维导图、费曼对话、术语表等）。
- **从哪进**：在 ReviewPage 内显示，或学习工具区域底部"已生成内容"。
- **能做什么**：浏览所有保存的产物 + 点开看大图。
- **依赖谁**：内含 ArtifactFullView（来自 SavedArtifactPreview）；savedArtifactMeta 元信息。

### SavedArtifactPreview.tsx —— 产物预览组件（含全屏视图）
- **是什么**：一个**多导出**的预览组件文件，包含三种用法：(a) 卡片缩略图 ArtifactContent、(b) 主区域大图 ArtifactContentLarge、(c) 全屏可缩放视图 ArtifactFullView。
- **从哪进**：在 StudioPanel 或 ReviewPage 中点开某个保存条目时显示对应版本。
- **能做什么**：把保存过的产物（学习指南/思维导图/术语表/费曼对话等）渲染成可读形式。
- **依赖谁**：savedArtifactMeta 提供图标和标签。

---

## 十、需要 Criss 确认产品定位的组件

| 组件 | 不确定的点 |
|------|-----------|
| [HistoryModal.tsx](shared/history/HistoryModal.tsx) | 当前 Header 主菜单未发现明确入口；可能是早期版本残留入口或仅 Sidebar 内某按钮触发。请确认目前在产品哪里能见到它。 |
| [SideQuestPanel.tsx](components/SideQuestPanel.tsx) | "支线任务"具体的产品定位不清——是用户主动触发还是某条件下系统弹出？什么场景？请说明。 |
| [TaskHug.tsx](components/TaskHug.tsx) / [ChatHug.tsx](components/ChatHug.tsx) | 二者入口是不是同一个菜单？两者使用场景的产品定义差异在哪（任务规划 vs 单纯陪聊）？ |
| [ExamPredictionPanel.tsx](features/exam/ExamPredictionPanel.tsx) 的双入口 | 它既能从"学习工具九宫格"打开，也能从"备考工作台 → 进入考前预测"打开。两条路进去是同一份组件、同一份数据吗？ |
| [WelcomeScreen.tsx](shared/layout/WelcomeScreen.tsx) | 是仅"未上传时"显示，还是登出后/无文件时也显示？需 Criss 确认行为边界。 |

---

## 十一、按"用户体感"的分类视图（搬迁前的对照表）

> 这是用户在产品里的视角，不是技术视角。重组目录时可参考。

### 永久壳层（用户全程看得见）
Header.tsx · Sidebar.tsx · WelcomeScreen.tsx · MusicPlayer.tsx · LoginModal.tsx · HistoryModal.tsx

### PDF 阅读区（主战场）
SlideViewer.tsx · SlidePageComments.tsx · PageMarkPanel.tsx · Notebook.tsx · ExplanationPanel.tsx · LoadingInteractiveContent.tsx · SkimPanel.tsx

### 学习工具九宫格（11 个面板）
QuizReviewPanel · FlashCardReviewPanel · StudyGuidePanel · TerminologyPanel · MindMapPanel（含 MindMapFlowCanvas、MindMapFlowNode）· FeynmanPanel · TrickyProfessorPanel · TrapListPanel · ExamSummaryPanel · ExamTrapsPanel · MultiDocQAPanel · ReviewPage（容器）

### 考试复习（备考工作台 + 考试中心）
ExamWorkspacePage · ExamWorkspaceSocraticChat · ExamWorkspaceAssistantMarkdown · ExamWorkspaceCitationBlock · ExamWorkspaceMaterialPreview · KcGlossarySidebar · KnowledgePointInspectPanel · WorkspaceKcProbeModal · WorkspaceEvidenceReportModal · ExamPredictionPanel · ExamHubModal · ExamCenterPanel · ExamLinkModal · ExamDailyMaintenancePanel · MaintenanceFlashcardDeck · MaintenanceFeedbackCelebration · StudyFlowPanel

### 心情 / 拥抱
MoodDialog · TaskHug · ChatHug

### 启动流 / 上课 / 奖励
FiveMinFlowPanel · ClassroomPanel · LectureTranscriptPage · TurtleSoupPanel · SideQuestPanel

### Galgame（产品入口已关）
GalgameOverlay · GalgameSettings

### 产物保存与浏览
StudioPanel · SavedArtifactPreview

---

*报告完。仅做静态调查 + 产品语言归纳，未修改任何代码文件。看完后如果有"功能定位不清"的组件，请补一句产品意图，我会更新本文档。*
