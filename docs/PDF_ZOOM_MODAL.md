# 备考台讲义预览 · 放大弹窗

## 行为

- **入口**：slide（`canvasWrapRef`）右下角 **`ZoomIn`** 按钮，`absolute bottom-2 right-2 z-20`。
- **弹窗**：`createPortal(..., document.body)`，`z-[130]`，避免被侧栏/Sheet（约 `z-100`）挡住。
- **渲染**：`pdfCacheRef.get(selectedLink.id)` + `renderPdfPageToCanvas(pdf, effectivePage, modalCanvas, scale)`，**不** 重复 `loadPdfDocumentFromFile`。
- **`modalScale`**：`computeModalPdfScale` — 取 `page.getViewport({ scale: 1 })` 的页宽，目标宽度 `min(92vw, 1200)`，`scale = maxW / pageW`，再夹在 **[2.2, 3]**。
- **同步**：弹窗打开时若侧栏 **改页 / 换材料**，`useEffect` 依赖 `effectivePage`、`selectedLink` 等会 **重绘弹窗 canvas**。
- **P3**：弹窗内 **不** 绘制 quote 高亮（侧栏仍保留）；代码内已注释 TODO。

## 关闭

遮罩、`×`、`Esc`；`keydown` 在 `zoomModalOpen` 为 true 时注册，关闭时移除。

## 截图

请在宽屏侧栏打开预览后点击放大，自截「侧栏 + 弹窗」对比。
