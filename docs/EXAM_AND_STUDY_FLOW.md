# 考试中心 + 情境化复习（交付说明）

**P0 备考工作台（全屏一级入口）** 见 [`EXAM_WORKSPACE_P0.md`](./EXAM_WORKSPACE_P0.md)。

## 新增 / 修改文件

| 文件 | 说明 |
|------|------|
| `types.ts` | `Exam`、`ExamMaterialLink`、`DailySegment`、`DailyPlanCacheDoc`、Study Flow 相关类型；`CalendarEvent.linkedExamId` |
| `services/firebase.ts` | `exams` / `examMaterials` / `dailyPlanCache` CRUD |
| `features/exam/lib/examSchedule.ts` | `buildDailyPlan` |
| `features/exam/lib/studyFlowInference.ts` | `inferFamiliarity`、`inferUrgencyForFile`、`buildScenarioKey` |
| `data/studyFlowTemplates.ts` | 预置 ≥8 套情境模板 |
| `features/exam/ExamHubModal.tsx` | 考试 / 今日学习 / 情境流程 三标签壳 |
| `features/exam/hub/ExamCenterPanel.tsx` | 考试 CRUD、材料列表、关联入口 |
| `features/exam/hub/ExamLinkModal.tsx` | 当前文件挂到多场考试 |
| `features/exam/hub/ExamDailyMaintenancePanel.tsx` | 今日学习低压保温主流程（gate + 闪卡 + 分支 + Quiz + 正反馈） |
| `docs/P1_EXAM_MAINTENANCE.md` | P1：Firestore `disciplineBand`、缓存 key、`LearnerMood` 与 Study Flow 映射说明 |
| `features/exam/hub/MaintenanceFlashcardDeck.tsx` | 轻量闪卡浏览器（不跳全屏） |
| `features/exam/hub/MaintenanceFeedbackCelebration.tsx` | 分层正反馈面板 |
| `features/exam/lib/examMaintenanceEligibility.ts` | sprint / warning / daily gate 资格判定 |
| `data/maintenanceFeedbackCopy.ts` | 反馈文案常量与模板函数 |
| `features/exam/hub/StudyFlowPanel.tsx` | 情境选择与步骤执行 |
| `features/exam/ExamPredictionPanel.tsx` | `initialKCId` 深链 |
| `shared/layout/Header.tsx` | 「考试」入口 |
| `App.tsx` | `navigateToSegment`、`navigateStudyFlowStep`、挂载 `ExamHubModal` |
| `firestore.rules` | 示例规则（部署时需合并到现有项目规则） |

## 手动测试（中文）

1. **登录** Firebase 账号 → 顶栏点 **考试** → 打开「考试管理」。
2. **新建考试**（填标题、可选日期）→ 展开考试卡片，编辑标题/日期并保存。
3. 打开一份 **本地 PDF** → 在考试中心点 **关联当前文件** → 勾选考试保存；或「新建考试并关联」。
4. 切到 **今日学习（低压保温）**：
   - 勾选考试 + 选择闪卡数量（10/15/20）后生成闪卡；
   - 若命中 sprint 考试：显示替代入口，不进入保温主流程；
   - 若同日同组合再次进入：应命中缓存，不重复请求闪卡生成。
5. 闪卡流程：
   - Modal 内翻卡（显示进度）；
   - 最后一张后可选「今天先到这里」或「继续学一会儿」；
   - 继续后可设 Quiz 题数并作答，完成后进入强反馈面板。
6. **情境流程** 标签：改熟悉度/紧迫度，观察步骤变化；点「执行本步」应打开对应功能（未接入 target 会 alert）。
7. **考前预测**：从今日计划生成含 `lsap_probe` 且本地有 LSAP 时，打开面板后应自动选中薄弱 KC（若 id 匹配图谱）。

## 已知限制

- Firestore **复合索引**：若改为 `examMaterials` 的 `userId + examId` 组合查询，需在控制台建索引；当前删除考试时按 `userId` 拉取后客户端过滤。
- **LSAP deep link**：若考点图谱尚未生成或 `kcId` 不在当前 `contentMap`，仅控制台 warning，需用户手动选单元。
- **`firestore.rules`** 为增量示例，若项目已有规则需手工合并，避免覆盖 `sessions` 等已有 match。

## 今日学习定位（低压记忆维持流）

- 不是「课表式任务清单」，而是「短会话、可随时结束」。
- 默认主路径是 10-20 张闪卡，用于维持记忆提取强度。
- 看完即可结束并获得正反馈；继续加码（Quiz）则给更强反馈。
- 命中 sprint 考试时暂停保温，转向冲刺入口（考前预测/速览）。

## 映射说明（与任务书）

- 材料集合名：`examMaterials`（文档内字段 `examId`，非子集合）。
- 今日缓存：`dailyPlanCache/{userId_YYYY-MM-DD}`，与任务书 `docId` 形式一致。
