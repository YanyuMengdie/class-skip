# 分支盘点

> 只读侦察。零 git 写操作、零分支切换。生成于当前分支 `refactor`。

## 当前位置

- **当前分支:** `refactor`
- **工作区状态:** 有 **1 个未提交改动**(untracked)
  - 文件列表(只列名,不贴 diff):
    - `EXPORT_PDF_RECON.md`(任务前一轮"导出 PDF 只读侦察"生成的报告,untracked,未追加进 git)

## 分支清单

| 分支名 | 本地 | 远程 | 最后 commit | 相对 main 领先/落后 | 与远程同步 | 用途推测 |
|---|---|---|---|---|---|---|
| `main` | ✅ | ✅ origin/main | `ea63069` "docs: 添加重构计划文档" | -(主分支) | 0/0 同步 | 主分支(稳定基线,**停留在 P2 重构计划阶段,没有动过**) |
| `refactor` | ✅ **(当前)** | ✅ origin/refactor | `d27fe7e` "fix(skim): 修复领读总输出 4 个 module 的 bug——moduleCount 与 brief 同时注入" | **+50 / -0** | 0/0 同步 | 主开发分支(P2 重构 + 递进阅读 + 略读改进等近期所有功能都在这) |
| `feature/multiselect-kc` | ✅ | ✅ origin/feature/multiselect-kc | `34f235c` "docs: add atom analysis input semantics recon (round 4)" | **+32 / -0** | 未查(非当前焦点) | 特性分支:exam 模块的"KC 多选"功能开发 |

**远程仓库地址:** `https://github.com/YanyuMengdie/class-skip.git`(fetch + push 一致)

## 主分支判断

- **结论:** `main` 是主分支。
- **依据:**
  - `git symbolic-ref refs/remotes/origin/HEAD` = `refs/remotes/origin/main`(GitHub 仓库设置的默认分支就是 main)
  - 命名约定也指向 `main`(无 `master` 分支)
  - 两个非主分支(`refactor` / `feature/multiselect-kc`)的 `merge-base main` 都是 `ea63069e2bdcaaff104cfdf4e26a1e07c6c19813`,即 main 当前的 HEAD —— main 本身没有任何独立提交超出这个点,**完全停在"重构起点"**

## P2 refactor 分支

- **名字:** `refactor`(本地)/ `origin/refactor`(远程)
- **状态:** **未合并回 main**(main 仍停在分叉点 `ea63069`,P2 重构未回流)
- **与 main 的 diff 量级:** **158 个文件改动,+18917 行 / -521 行**
  - 内容跨越多个阶段:
    - P2 模块化重构(目录搬迁 9 个 commit:`a795f76`/`038298e`/`7234b14`/`8f42e6f`/`f08f4fc`/`d86954b`/`f4cb52d`/`8e7c8ce`/`7b9c8a6`)
    - 递进阅读模式阶段 1-5(`cc2c0af` 起约 14 个 commit)
    - 略读模式 STEM prompt 三段强化 + 模块数 bug 修复(`f2f3a27` / `d27fe7e`)

`REFACTOR_P2_PLAN.md` 在 9 个 P2 重构 commit 中被反复修改([7b9c8a6](commit/7b9c8a6) 是最后修改它的 commit)。`git branch --contains 7b9c8a6` 显示该 commit 同时存在于 **`refactor` 和 `feature/multiselect-kc`** —— 说明 P2 重构成果在两个非主分支上都有,但 **main 不知道**。

## 最近活动

```
d27fe7e fix(skim): 修复领读总输出 4 个 module 的 bug——moduleCount 与 brief 同时注入
f2f3a27 feat(prompts): STEM 略读新增 A/B/C 标签 + Exam Conversion + 延伸阅读边界
edfd2c3 fix(layered-reading): Round3UnitView 接入项目 markdown 渲染 + 排版调整
f3960b4 fix(layered-reading): generateLayeredRound3Unit 对齐项目 gemini 调用惯例(multipart + model 名)
b5bd211 feat(layered-reading): 阶段 5.3 - Round 1/2 prompt 注入中英对照规则
01864ee feat(layered-reading): 阶段 5.2 - Round 3 UI 改造 + 旧数据 fallback
10e34be feat(layered-reading): 阶段 5.1 - Round 3 unit 类型 + prompt + AI 函数
8076966 docs(layered-reading): Round 3 改造 PLAN(分 3 阶段施工图)
a13cecb docs(layered-reading): Round 3 改造 INQUIRY(7 块结构 + 全程中英对照)
20fec12 docs(layered-reading): Round 3 改造前现状盘点报告
19ad9c9 docs(layered-reading): 补记阶段 4.5 持久化收尾
aad85cf fix(layered-reading): 接通 layeredReadingState 的本地+云端持久化(4 处写入字段)
ea0e5b1 feat(layered-reading): 阶段 4 - 分层题目 + lastVisited + 边界文档
f457420 docs(inquiry): 递进阅读阶段 4 范围扩展 - 题目系统
050c3bb feat(layered-reading): 阶段 2+3 合并 - Round 1/2/3 + 树状 UI + 溯源 + 提问
61d02cb docs(inquiry): 递进阅读阶段 3 范围扩展 - 溯源 + 提问
767dff3 feat(layered-reading): viewMode 三态扩展 + 入口按钮 + 空壳 panel
cc2c0af docs(inquiry): 递进阅读模式诊断 + 实施计划
34f235c docs: add atom analysis input semantics recon (round 4)
3b762cb feat(exam): wire multi-select KC to dialog and atom coverage
```

**节奏观察:**
- 最近 18 条 commit 全在 `refactor` 分支(从 `cc2c0af` 起的"递进阅读模式系列" + 末尾两条略读改造)
- `feature/multiselect-kc` 最新只到 `34f235c`(出现在第 19 位),最近**没有在它上面继续开发**
- `main` 完全静止
- 结论:**`refactor` 是当前活跃主线开发分支**

## 给外部 Claude 的建议

> 注:**只建议,不执行**。等用户/外部 Claude 拍板后再切。

**建议:从 `refactor` 拉新分支做"导出 PDF 重写",而**不是**从 `main` 拉。**

理由:

1. **代码现实在 refactor**:`features/reader/slide-viewer/SlideViewer.tsx` / `features/reader/notebook/Notebook.tsx` / `lib/pdf/pdfUtils.ts` 这些路径是 P2 重构后的位置,只存在于 `refactor`(和 `feature/multiselect-kc`)。`main` 还停在 P2 计划阶段,**目录结构对不上现实**。

2. **依据 EXPORT_PDF_RECON 的行号契约**:前一轮侦察报告里所有 `相对路径:行号` 引用(`App.tsx:1899` / `SlideViewer.tsx:362` / `lib/pdf/pdfUtils.ts:55` ...)全部基于 `refactor` HEAD = `d27fe7e`。若从 main 拉,这些行号全部失效。

3. **避开 feature/multiselect-kc 的不相关改动**:那个分支 +32 commit 含 KC 多选功能(与 PDF 导出完全无关),基于它拉会带入无关 diff,合并时增加冲突面。

4. **未来合并路径清晰**:新建分支 `<x>` 基于 `refactor` → 完成后合回 `refactor`(或直接 PR);未来 `refactor` 整体合 main 时,PDF 重写自然跟随。

**反建议(若用户认为应该回流到 main 后再开新分支):**
- 先把 `refactor` 整体 PR / merge 进 main(50 commit 一次性回流,涉及 158 文件 +18917 行,**review 工作量极大**)
- 然后基于新 main 拉 PDF 重写分支
- 这条路在工程上更"干净",但代价是先解决一个 P2 重构合并的大问题。**不推荐 PDF 重写这种小特性等这个大问题**。

**新分支名建议(不是命令,只是建议):**
- `feature/export-pdf-rewrite` 或 `refactor/export-pdf-v2`(看用户偏好的命名风格)

**待办:**
- 用户决定后由外部 Claude 或本人执行 `git checkout -b <name> refactor`(切换 + 创建)
- 本轮**不执行**任何 git 写操作

---

> 报告完毕。零 git 写、零分支切换、零构建。等用户/外部 Claude 拍板。
