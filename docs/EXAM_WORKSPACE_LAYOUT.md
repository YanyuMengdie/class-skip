# 备考工作台布局（宽屏优化）

## 变更摘要（`features/exam/workspace/ExamWorkspacePage.tsx`）

| 区域 | 改前 | 改后 |
|------|------|------|
| **主内容 `main`** | `max-w-7xl` + `p-4 sm:p-6 lg:p-8` | `max-w-[min(100%,1600px)]` + `p-4 sm:p-5 lg:p-6 xl:p-8 2xl:px-10` |
| **左栏 `aside`** | `lg:w-[min(100%,320px)]` | `lg:w-[min(100%,280px)]` |
| **左栏与中间区** | `lg:gap-8` | `lg:gap-6 xl:gap-8` |
| **对话列** | `flex-1 min-w-0` | 同上 + **`xl:min-w-[min(100%,360px)]`**（避免 `lg` 1024px 三栏过宽时撑破） |
| **讲义预览列** | `max-w-[420px]` 等 | `lg:flex-none lg:w-[min(100%,380px)] lg:min-w-[260px] lg:max-w-[380px]` |
| **考点释义列** | `lg:w-[260px] min-w-[260px]` | `lg:w-[min(100%,240px)] lg:min-w-[220px] lg:max-w-[240px]` + `min-w-0` |
| **中间三栏行** | `gap-3`（列内） | `lg:gap-3` |
| **预测分** | 88px 圆环 + `py-3` | **紧凑横条**：56px 圆环（`h-14 w-14`）、`py-2`、`line-clamp-2` + `title` 全文 |
| **预测分 +Δ** | `absolute` 叠在卡片角 | 独立一行 `self-end`，避免与压缩后卡片重叠 |

## 理由

- **1600px**：在 1920px 视口下明显加宽主内容，仍保留左右边距，避免「全铺满」难读。
- **左栏 280px**：释放约 40px 给中间；KC/材料列表仍可滚动。
- **对话 `xl` 最小宽度**：`lg` 时三栏 + 左栏总宽易触顶，最小宽度放在 `xl` 更稳妥。
- **预览 max 380px**：略窄于原 420px，减少与对话抢宽；`flex-none` 保证对话 `flex-1` 吃剩余空间。

## 截图（可选）

宽屏三栏全开前后对比请在本机 DevTools 响应式模式下截取。
