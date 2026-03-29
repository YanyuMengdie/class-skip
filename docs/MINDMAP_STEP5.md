# 思维导图第五步（档 B → 档 A）

## 档 B（已合并入历史）

- 自研 SVG 画布上的「适应画布」、动态 `minWidth/minHeight`、`React.memo`、Esc 关闭弹层等曾落在 `MindMapPanel` + `utils/mindMapFitView.ts`。
- **档 A 合并后**：上述自研视口与 SVG 连线已由 **React Flow** 替代；`mindMapFitView.ts` 已删除。

## 档 A（当前实现）

### 依赖与体积（约）

| 包 | 作用 |
|----|------|
| `@xyflow/react` (~12) | 画布视口、节点/边、MiniMap、Controls |
| `elkjs` | 分层布局（`layered` + `RIGHT`） |

构建后主 bundle 增大（含 elk 与 flow 样式）；后续可按路由 `import()` 懒加载思维导图面板以减小首屏。

### 架构

- **数据契约**：仍为 `MindMapNode` / `MindMapMultiResult`；`geminiService` 未改。
- **映射**：`utils/mindMapFlowAdapter.ts` 中 `mindMapNodeToFlow` → `nodes` + `edges`；Flow id 与 `scopeMindMapNodeId` 一致（`utils/mindMapScope.ts`）。
- **布局**：`utils/mindMapElkLayout.ts` — `layoutFlowForest` 对多棵文档树分别 ELK 后纵向堆叠。
- **UI**：`components/MindMapFlowCanvas.tsx` + `components/MindMapFlowNode.tsx`；`MindMapPanel` 仅负责模式、生成、Studio 保存、AI 修改等，并通过 `flowParts` 为每棵树注入独立 `handlers`（多文档更新对应 `perDoc`）。

### 被档 A 替代 / 删除的代码路径（PR 说明用）

- `components/MindMapPanel.tsx` 内原 **自研 transform**、**SVG 贝塞尔**、**MindMapForest / MindMapNodeRow / NodeBox** 整段已移除。
- `utils/mindMapFitView.ts`：**已删除**（由 `fitView` / `setViewport` / `zoomIn` / `zoomOut` 替代）。

### 编辑回写

- 节点双击编辑、增删子/同级：在 **自定义 Flow 节点** `MindMapFlowNode` 内调用各 `TreePart.handlers`，直接 `updateNodeInTree` / `setMultiResult` 等；**未**使用 `onNodesChange` 拖拽改位置（`nodesDraggable={false}`），避免与 ELK 坐标冲突。

### 工具栏

- **适应画布** → `fitView({ padding })`  
- **重置** → `setViewport({ x:0,y:0,zoom:1 })`  
- **放大/缩小** → `zoomIn` / `zoomOut`  
