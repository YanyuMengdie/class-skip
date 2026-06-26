# Dashboard 重构变更报告

> 范围说明：本报告记录目前在 Codex 副本中的改动。没有推送、没有合并、没有触碰本体目录。

## 1. 总体新增内容

这次主要把原来“封面之后直接进入学习页”的结构，改成了更接近产品构思里的三层结构：

1. 封面：一个极简温柔的进入页。
2. Dashboard：作为进入学习前的玄关，承载资料库、日历、便签、成长和画像入口。
3. 学习页：保留原来的 PDF 左侧 + AI 右侧主学习体验。

## 2. 新增 Dashboard 页面

新增文件：

- `shared/layout/DashboardScreen.tsx`

新增能力：

- 资料库作为 dashboard 主内容。
- 日历作为 dashboard 侧边入口。
- 便签作为 dashboard 侧边入口。
- “我的成长”入口，先展示当前可从本地/云端数据推出来的基础统计。
- “关于我”入口，作为长期画像笔记本的编辑入口。
- 迎接者区域：显示“未来的你”、一句迎接话、最近状态描述。
- 迎接话和画像字段可在本地编辑，并保存到 `localStorage`。

现在“关于我”已经接入长期画像笔记本；未登录时本地保存，登录后会同步到 Firestore。

## 3. 资料库卡片改动

位置：

- `shared/layout/DashboardScreen.tsx`
- `lib/pdf/pdfUtils.ts`

改动：

- 每个资料库卡片对应一个 PDF。
- 卡片封面现在使用 PDF 第一页渲染出来的图片。
- 封面渲染改走和“打开 PDF”一致的取文件通路，避免直接用远程 URL 渲染失败后一直显示占位图。
- 第一页预览失败时，才退回占位封面。
- 点击卡片时会显示“打开中”的转圈反馈。
- 点击卡片后会立即切到学习页，不再让用户留在 dashboard 等待整份 PDF 解析完成。

新增 PDF 工具：

- `renderPdfFirstPagePreview`
- `renderPdfFirstPagePreviewFromUrl`

用途是只渲染 PDF 第一页，用于 dashboard 卡片封面。

## 4. 封面页改动

位置：

- `shared/layout/WelcomeScreen.tsx`

改动：

- 替换原来的英文 quote 和橙色按钮风格。
- 改成中文、温柔、低门槛的“玄关”视觉。
- 保留时钟 + 一句话 + “进入”按钮。
- 点击“进入”后进入 dashboard，而不是直接进入学习页。

## 5. App 入口与页面流转改动

位置：

- `App.tsx`

新增状态：

- `shellMode: 'dashboard' | 'study'`

页面流转现在是：

- 首次打开：封面。
- 点“进入”：dashboard。
- dashboard 点 PDF 卡片：进入学习页并恢复/加载 PDF。
- 本地上传 PDF：处理成功后进入学习页。
- 学习页 header 点 dashboard 图标：回 dashboard。

另外：

- 云端 PDF 恢复失败时，会退回 dashboard，并提示恢复失败。
- 云端 PDF 恢复成功后，会停留在学习页。

## 6. 学习页 Header 改动

位置：

- `shared/layout/Header.tsx`

改动：

- 增加一个返回 dashboard 的图标按钮。
- 这个按钮只负责在学习页和 dashboard 之间切换。
- 原有上传、学习工具、考试复习、背景音、更多菜单等功能保留。
- 修复右上角“更多”菜单被学习区浮层遮挡的问题：Header 和菜单层级已提高，菜单会盖在“导出笔记版 PDF”等学习区浮层上方。

## 7. 学习页左侧栏改动

位置：

- `shared/layout/Sidebar.tsx`

改动：

- 删除左侧栏顶部的“页面 / 云端 / 日历 / 便签”标签栏。
- 学习页左侧现在直接显示当前 PDF 的页面缩略图。
- 云端、日历、便签已经迁移到 dashboard，不再在学习页左侧重复出现。

保留内容：

- 页面缩略图。
- 页面跳转。
- 页面标记筛选。
- 当前 PDF 的复习入口。

## 8. Gemini 初始化防白屏改动

位置：

- `services/geminiService.ts`
- `services/imageGen.ts`

问题：

之前没有配置 `API_KEY` 时，应用一打开就会初始化 Gemini client，导致整页白屏。Dashboard 本身不需要 Gemini，但也会被这个初始化错误拖垮。

改动：

- Gemini client 改为懒加载。
- 只有真正调用 AI 功能时，才检查 `API_KEY`。
- 这样 dashboard、封面、基础资料库等非 AI 页面可以正常打开。

## 9. 已验证内容

已运行：

```bash
npm run build
```

结果：

- 构建通过。
- 仍有 Vite 的 chunk 体积提示，但不是错误。

已手动检查过：

- 封面能渲染。
- 点击“进入”能进入 dashboard。
- Dashboard 的资料库、日历、便签、我的成长、关于我入口能切换。
- 学习页可以从 header 回 dashboard。
- 学习页左侧标签栏已删除。

## 10. 当前未做内容

目前还没有做：

- 成长报告完整可视化。
- Live2D / 动态角色。
- 推送、合并、提交到本体。

## 11. 长期画像笔记本第一版

新增/改动位置：

- `types.ts`
- `services/profileNotebookService.ts`
- `services/geminiService.ts`
- `App.tsx`
- `shared/layout/Header.tsx`
- `shared/layout/DashboardScreen.tsx`

新增数据结构：

- `LearnerProfileNotebook`：正式长期画像笔记本。
- `StudyWitnessSession`：一次学习的原始行为录像。
- `ProfileNotebookUpdateSuggestion`：Gemini 生成、等待用户确认的画像更新建议。

画像笔记本目前包含：

- 哪里顺 / 哪里卡
- 专注能撑多久
- 卡住时的反应
- 什么时候状态最好
- 最近怎么样

实现策略：

- 未登录时画像和录像保存在本地。
- 登录后画像同步到 Firestore：`users/{uid}/profileNotebook/main`。
- 登录后行为录像保存到 Firestore：`users/{uid}/studyWitnessSessions/{sessionId}`。
- 待确认建议可保存到 Firestore：`users/{uid}/pendingProfileSuggestions/{suggestionId}`。
- 如果关闭页面时只能来得及写本地记录，下次打开/登录后会把本地记录补传到云端。

学习页新增：

- Header 下方增加明显的“本次学习”状态条，按钮靠右显示 `开始学习 / 结束本次学习`。
- 必须手动点击开始，才会记录 witness。
- 点击结束后弹出“本次学习小结”。
- 弹窗展示本次记录到的现象，以及 Gemini 给出的画像更新建议。

记录的 witness 内容只包含现象：

- 文件名
- 开始/结束时间
- 总时长
- 有效页面停留时长
- 每页停留时间
- 中途离开/回来次数和时长
- 最后停在哪一页

不会记录或推断：

- 懒
- 害怕
- 逃避原因
- 自律评价
- 用户聊天内容

Gemini 接入方式：

- Gemini 只生成“建议版笔记本”。
- 不会静默写入正式画像。
- 用户可以在小结弹窗里编辑建议内容。
- 用户点击“保存当前建议”后，才会覆盖正式画像。
- 用户也可以点“稍后再看”或“跳过这次”。

异常结束处理：

- 如果已经点了开始，但直接关闭/刷新页面，会保存为 `abandoned` witness。
- 从学习页回 dashboard 时，如果本次学习还没结束，也会保存为未正常结束。
- 未正常结束记录会先本地落盘，登录后补传到 Firestore。
- 未正常结束不会自动触发 Gemini 更新。

最近状态趋势：

- Gemini 更新第 5 栏时，按“最近 5 次学习 + 最近 21 天”窗口处理。

## 12. 安全边界

当前所有改动都发生在 Codex 副本：

```text
/Users/haoshengliu/.codex/worktrees/5bcb/class-skip-v2
```

没有对本体执行推送、合并或写入操作。
