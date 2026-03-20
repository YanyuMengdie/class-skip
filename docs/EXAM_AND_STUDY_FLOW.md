# 考试中心 + 情境化复习（交付说明）

## 新增 / 修改文件

| 文件 | 说明 |
|------|------|
| `types.ts` | `Exam`、`ExamMaterialLink`、`DailySegment`、`DailyPlanCacheDoc`、Study Flow 相关类型；`CalendarEvent.linkedExamId` |
| `services/firebase.ts` | `exams` / `examMaterials` / `dailyPlanCache` CRUD |
| `utils/examSchedule.ts` | `buildDailyPlan` |
| `utils/studyFlowInference.ts` | `inferFamiliarity`、`inferUrgencyForFile`、`buildScenarioKey` |
| `data/studyFlowTemplates.ts` | 预置 ≥8 套情境模板 |
| `components/ExamHubModal.tsx` | 考试 / 今日学习 / 情境流程 三标签壳 |
| `components/ExamCenterPanel.tsx` | 考试 CRUD、材料列表、关联入口 |
| `components/ExamLinkModal.tsx` | 当前文件挂到多场考试 |
| `components/DailyExamStudyPanel.tsx` | 今日 segment、预算、缓存 |
| `components/StudyFlowPanel.tsx` | 情境选择与步骤执行 |
| `components/ExamPredictionPanel.tsx` | `initialKCId` 深链 |
| `components/Header.tsx` | 「考试」入口 |
| `App.tsx` | `navigateToSegment`、`navigateStudyFlowStep`、挂载 `ExamHubModal` |
| `firestore.rules` | 示例规则（部署时需合并到现有项目规则） |

## 手动测试（中文）

1. **登录** Firebase 账号 → 顶栏点 **考试** → 打开「考试管理」。
2. **新建考试**（填标题、可选日期）→ 展开考试卡片，编辑标题/日期并保存。
3. 打开一份 **本地 PDF** → 在考试中心点 **关联当前文件** → 勾选考试保存；或「新建考试并关联」。
4. 切到 **今日学习** → 勾选要纳入的考试 → 设预算分钟 → **重新生成今日计划** → 得到若干「开始」按钮。
5. 点某片段 **开始**：
   - 若当前已是该文件：应跳转页码/打开对应面板。
   - 若为另一本地 hash：提示重新选同一文件，选完后应自动执行导航。
   - 若为云端 session：应拉取会话并随后执行导航。
6. **情境流程** 标签：改熟悉度/紧迫度，观察步骤变化；点「执行本步」应打开对应功能（未接入 target 会 alert）。
7. **考前预测**：从今日计划生成含 `lsap_probe` 且本地有 LSAP 时，打开面板后应自动选中薄弱 KC（若 id 匹配图谱）。

## 已知限制

- Firestore **复合索引**：若改为 `examMaterials` 的 `userId + examId` 组合查询，需在控制台建索引；当前删除考试时按 `userId` 拉取后客户端过滤。
- **LSAP deep link**：若考点图谱尚未生成或 `kcId` 不在当前 `contentMap`，仅控制台 warning，需用户手动选单元。
- **`firestore.rules`** 为增量示例，若项目已有规则需手工合并，避免覆盖 `sessions` 等已有 match。

## 映射说明（与任务书）

- 材料集合名：`examMaterials`（文档内字段 `examId`，非子集合）。
- 今日缓存：`dailyPlanCache/{userId_YYYY-MM-DD}`，与任务书 `docId` 形式一致。
