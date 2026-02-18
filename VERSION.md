# 当前版本信息

**版本日期**: 2026-02-18

**版本号**: v1.1.0

## 主要更新

### ✅ 已完成功能

1. **页面标记系统** - 完整的重点标记功能
2. **Quiz复习系统** - 多轮测验，智能去重
3. **Flash Card复习系统** - 预估+生成+翻面复习
4. **便签格式修复** - HTML格式保留，KaTeX公式支持
5. **便签编辑修复** - 编辑内容不再被重置

## 文件变更清单

### 新增文件
- `components/PageMarkPanel.tsx` - 页面标记面板
- `components/QuizReviewPanel.tsx` - Quiz复习面板
- `components/FlashCardReviewPanel.tsx` - Flash Card复习面板
- `docs/QUIZ_AND_FLASHCARD_PLAN.md` - 功能规划文档
- `CHANGELOG.md` - 更新日志
- `VERSION.md` - 版本信息（本文件）

### 修改文件
- `types.ts` - 新增PageMark、QuizRound、FlashCard类型
- `services/geminiService.ts` - 新增generateQuizSet、estimateFlashCardCount、generateFlashCards
- `components/Header.tsx` - 添加"重点"按钮
- `components/Sidebar.tsx` - 添加"复习"入口和标记页筛选
- `components/ExplanationPanel.tsx` - 优化文本选择，支持HTML格式拖拽
- `components/SlideViewer.tsx` - 修复便签编辑问题
- `App.tsx` - 添加状态管理和持久化逻辑

## 测试建议

1. **页面标记**：标记几页不同类型，测试筛选功能
2. **Quiz**：生成一轮题目，做完后继续出题，测试去重和回顾
3. **Flash Card**：生成闪卡，测试翻面和追加功能
4. **便签格式**：拖拽包含公式的文本，检查格式是否正确
5. **便签编辑**：双击便签，测试选中、输入、删除是否正常

## 已知问题

- 无

## 下一步计划

- 根据用户反馈继续优化
