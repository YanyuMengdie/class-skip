# EXPORT_PDF_STEP2_IMMERSIVE_FIX · 只读诊断

> 用户澄清:导出 PDF 需按沉浸模式可滚动布局,捕获所有便签(含幻灯片下方溢出便签)。
> 本报告**只读 + 列证据**,不改任何代码。

---

## Q1 · 沉浸模式的容器实现

### `isImmersive` 在 SlideViewer.tsx 的所有引用(行号)

```
14   isImmersive?: boolean;                    ← props 类型
33   isImmersive = false,                       ← 默认值
57   }, [slide, isImmersive]);                  ← useEffect 依赖
325  const containerClasses = isImmersive       ← 最外层容器 className 三元
342  {!isImmersive && <div ... 网格背景 />}     ← 只在普通模式显示点状背景
346  ${isImmersive ? 'bottom-6 left-1/2 ...'    ← zoom 控制位置
348  {isImmersive && (...)}                     ← 沉浸模式才显示的 zoom 按钮组
361  ${isImmersive ? 'text-slate-600 ...'        ← 导出按钮样式
365  {!isImmersive && <span>导出笔记版 PDF</span>}← 普通模式按钮带文字
381  ${isImmersive ? 'mt-4 mb-20' : 'w-full h-full flex items-center justify-center p-4'}  ← 内层 wrapper className
384  ${isImmersive ? '' : 'max-w-full max-h-full rounded-xl border-[6px] border-white'}    ← 幻灯片容器 className
386  width: isImmersive ? `${zoom * 100}%` : 'auto',  ← 幻灯片容器 width
393  ${isImmersive ? 'w-full h-auto' : 'max-w-full max-h-[calc(100vh-160px)]'}  ← <img> className
```

### 沉浸模式的 3 层 DOM 结构(从外到内)

```tsx
// 1. 最外层 — viewport 容器(SlideViewer.tsx:325-327)
<div className="bg-[#E5E7EB] w-full h-full overflow-auto flex items-start justify-center p-8 relative">
  ↑ overflow-auto:允许出滚动条
  ↑ items-start:顶部对齐(不强制居中,允许内容比容器高)

  // 2. 内层 wrapper — transform 容器(SlideViewer.tsx:381)
  <div className="relative transition-transform duration-100 ease-out origin-top mt-4 mb-20">
    ↑ mt-4 mb-20:上 1rem / 下 5rem 留白
    ↑ 沉浸模式没有 flex items-center / no padding-flex / 不强制居中
    ↑ 注意:这一层没有 height 约束,自然撑开

    // 3. 幻灯片容器 — containerRef(SlideViewer.tsx:382-389)
    <div ref={containerRef} className="relative shadow-2xl bg-white"
         style={{ width: `${zoom * 100}%` }}>
      ↑ position: relative(便签 absolute 的参照系)
      ↑ 沉浸模式去掉了 max-w-full max-h-full
      ↑ 只设 width(zoom 控制),no height 设定 → 高度由内部内容撑开

      <img className="w-full h-auto" />   ← w-full 100% / h-auto 按比例
      {annotations.map(...)}              ← position: absolute,top: ${y}%
    </div>
  </div>
</div>
```

### 三个关键问题逐项回答

#### A. 沉浸模式下,slide 容器(containerRef)的关键样式

| 属性 | 沉浸模式值 |
|---|---|
| `width` | `${zoom * 100}%`(默认 100%,可缩放) |
| `height` | **没有显式设置** → 由内部内容撑开 |
| `overflow` | **没有显式设置** → 默认 `visible` |
| `position` | `relative`(便签 absolute 定位参照系) |

#### B. 沉浸模式下容器高度是固定的还是按内容撑开

**按内容撑开,但仅由 `<img>` 撑高,因为便签是 `position: absolute`,不参与父高度计算**。

具体地:
- `<img>` 用 `w-full h-auto`,实际渲染高度 = (img naturalHeight / naturalWidth) × containerRef.width
- 便签是 `position: absolute`,**不撑高 containerRef**
- 所以 **containerRef.height = img 实际渲染高度**,不管便签有多少、伸到哪里

#### C. 沉浸模式下便签的 `position: absolute` 相对谁定位 + y 可以超过 100% 吗

**便签 absolute 相对的是 containerRef**(SlideViewer.tsx:382 那个 div,它是 `position: relative` 的最近祖先)。

[SlideViewer.tsx:411-419](features/reader/slide-viewer/SlideViewer.tsx#L411):
```tsx
style={{
    left: `${note.x}%`,
    top: `${note.y}%`,
    width: `${note.width || 240}px`, 
    height: `${note.height || 100}px`,
    backgroundColor: 'rgba(255, 252, 235, 0.95)',
    transform: 'translate(-5px, -5px)',
    cursor: isEditing ? 'text' : 'grab'
}}
```

**y 可以远大于 100%**:在 [SlideViewer.tsx:160](features/reader/slide-viewer/SlideViewer.tsx#L160) 的拖拽 clamp 逻辑:
```ts
newY = Math.max(-20, Math.min(120, newY)); // 上下可以更大范围
```

→ **便签 y 合法范围:[-20%, 120%]**(只要 `leftPanelRef` 传入,这是 App 的标准用法)。便签**可以拖到幻灯片之上 20% 或之下 20%**。

### Q1 综合结论

**"沉浸模式可滚动看完整便签"这件事,不是因为 containerRef 自己变高了,而是因为祖先链 `overflow: auto` + `items-start` 让 absolute 子元素溢出 containerRef 后仍然可见**。

- containerRef 高度始终 = img 渲染高度
- 便签 y>100% 时视觉上落在 containerRef 底部之下(absolute children 不撑高父)
- 普通模式:外层 `overflow-hidden` 把溢出区裁掉 → 视觉看不到
- 沉浸模式:外层 `overflow-auto` + 内层 wrapper `mb-20` → 溢出区可滚动可见

---

## Q2 · 当前 stage 高度计算逻辑

文件:`features/reader/lib/exportNotebookPdf.ts`,函数 `buildStage`(line 68-132)。

### A. stage 容器有没有显式 height

**没有**。详见 [exportNotebookPdf.ts:75-83](features/reader/lib/exportNotebookPdf.ts#L75):

```ts
stage.style.position = 'fixed';
stage.style.left = '-10000px';
stage.style.top = '0';
stage.style.width = `${STAGE_WIDTH}px`;        // 只有 width = 1280px
stage.style.backgroundColor = '#ffffff';
stage.style.fontFamily = `...`;
stage.style.overflow = 'visible';
// ↑ NO height 设置
```

→ stage 高度 = 内部内容自然撑开 = banner + slideBox。

### B. slideBox(对应 containerRef)有没有显式 height

**没有**。详见 [exportNotebookPdf.ts:99-103](features/reader/lib/exportNotebookPdf.ts#L99):

```ts
const slideBox = document.createElement('div');
slideBox.style.position = 'relative';
slideBox.style.width = '100%';
slideBox.style.overflow = 'visible';            // 允许 absolute 子元素视觉溢出
// ↑ NO height 设置
stage.appendChild(slideBox);
```

→ slideBox 高度由内部子元素撑开,但**便签是 absolute,不撑高它**,所以 slideBox.height = img.height。

### C. 便签 div 上 `top: NN%` 的百分比相对谁

**相对 slideBox**(它是最近的 `position: relative` 祖先)。详见 [exportNotebookPdf.ts:36-40](features/reader/lib/exportNotebookPdf.ts#L36):

```ts
const wrapper = document.createElement('div');
wrapper.style.position = 'absolute';
wrapper.style.left = `${a.x}%`;
wrapper.style.top = `${a.y}%`;
wrapper.style.width = `${a.width ?? 240}px`;
wrapper.style.height = `${a.height ?? 120}px`;
```

→ 便签 `top: 120%` 意味着距 slideBox 顶部 1.2 × slideBox.height。
→ 由于 slideBox.height = img.height,便签 `top: 120%` 的视觉位置 = img.height × 1.2 = img 底部之下 20% × img.height 处。

### D. 关键漏洞:html2canvas 渲染范围 vs 便签溢出

html2canvas 默认按 **目标元素的 `getBoundingClientRect`** 渲染。我的代码([exportNotebookPdf.ts:142-147](features/reader/lib/exportNotebookPdf.ts#L142)):

```ts
const canvas = await html2canvas(stage, {
  scale: CANVAS_SCALE,
  useCORS: true,
  backgroundColor: '#ffffff',
  logging: false,
});
```

**没有显式传 `height` / `windowHeight` 参数**。

stage 的 `getBoundingClientRect.height` = banner + slideBox = banner + img.height
→ **便签 y > 100% 时,视觉位置在 stage 底部之下,html2canvas 不渲染那部分** → **便签被裁掉**。

这就是 Step 2 的核心 bug。

### Q2 综合结论:bug 根因

| 因素 | 行号 | 状态 |
|---|---|---|
| stage 无显式 height | [exportNotebookPdf.ts:75-83](features/reader/lib/exportNotebookPdf.ts#L75) | 自动取 banner + slideBox |
| slideBox 无显式 height | [exportNotebookPdf.ts:99-103](features/reader/lib/exportNotebookPdf.ts#L99) | 自动取 img.height(absolute 子元素不撑高) |
| 便签 `top: %` 相对 slideBox | [exportNotebookPdf.ts:36-40](features/reader/lib/exportNotebookPdf.ts#L36) | y=120% 视觉落在 img 之下 0.2×img.height |
| html2canvas 渲染范围 | [exportNotebookPdf.ts:142-147](features/reader/lib/exportNotebookPdf.ts#L142) | 默认 stage.getBoundingClientRect,**不含溢出便签区** |

**修法方向**(本报告只诊断,不实施):
- 方案 A:遍历 annotations 算出 `maxBottom = max(y% × img_height + height_px)`,显式给 slideBox 设 `height: maxBottom` 让它包住所有便签 → stage 自然撑高 → html2canvas 自然捕获
- 方案 B:在 slideBox 之下追加一个透明 spacer div,高度 = 最大溢出量
- 方案 C:给 html2canvas 显式传 `height: stage.scrollHeight` 参数(scrollHeight 含溢出 absolute 子元素的高度)

---

## Q3 · 真实便签数据样本

### 关键说明:我无法访问 runtime data

我作为静态代码侦察 agent,**没有 IndexedDB / Firestore 的读权限**,无法 fetch 你当前打开的 PDF 上真实保存的 annotations。

要拿真实样本,**请你**:
- 打开 DevTools → Application → IndexedDB → `ReadingAssistantDB.fileHistory`
- 找到当前文件,展开 `state.annotations`
- 把那段 JSON 贴给我

### 我能给的:基于代码的「可能值域」证据

#### `SlideAnnotation` 接口完整字段([types.ts:58-68](types.ts#L58))

```ts
export interface SlideAnnotation {
  id: string;
  text: string;
  x: number; // Percentage
  y: number; // Percentage
  width?: number;   // Pixels
  height?: number;  // Pixels
  fontSize?: number;// Pixels
  color?: string;   // Text color (hex)
  isBold?: boolean; // Is bold text
}
```

→ **没有任何字段直接标记"我在幻灯片下面"**。"溢出"完全由 `y` 的数值大小隐式表达。

#### 创建时的 y 取值范围([SlideViewer.tsx:108-109](features/reader/slide-viewer/SlideViewer.tsx#L108))

```ts
const x = Math.max(5, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
const y = Math.max(5, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
```

→ **新创建的便签 y ∈ [5, 90]**(不可能初始就溢出)。

#### 拖拽时的 y 取值范围([SlideViewer.tsx:157-165](features/reader/slide-viewer/SlideViewer.tsx#L157))

```ts
if (leftPanelRef?.current) {
  // 使用左侧面板时:左右严格限制,上下扩大范围
  newX = Math.max(0, Math.min(95, newX));
  newY = Math.max(-20, Math.min(120, newY));  // ← 上下可以更大范围
} else {
  newX = Math.max(0, Math.min(95, newX));
  newY = Math.max(0, Math.min(95, newY));
}
```

→ **拖拽后 y ∈ [-20, 120]**(当 leftPanelRef 存在,这是 App 默认场景)。

#### 持久化路径:y 是否被任何环节 clamp

grep 已确认 `SlideAnnotation` 类型在持久化层(IndexedDB / Firestore)被原样存(无任何对 x/y 字段的转换)。`handleUpdateAnnotation`([App.tsx:1834](App.tsx#L1834))也只是 `{...a, ...updates}` 浅合并,**不 clamp**。

### Q3 综合结论

**y > 100 是合法持久化值**,且**没有显式字段标记溢出**。你目前 PDF 上的便签若被拖到幻灯片下方,实际 y 应该在 (100, 120] 区间。height 字段以像素为单位,默认 120,可以更大(由 resize 操作改写)。

**完整溢出量计算公式**(给修复用):

```
单条便签的视觉最大 y(像素) = (y% / 100) × slideBox.height + height_px - 5
                                                              ↑ 减 5 因为 transform: translate(-5px, -5px)
所有便签最大溢出像素 = max(上式) over all annotations
推荐 slideBox.height = max(img.height, 最大溢出像素)
```

---

## 总结(给修复用)

| 问题 | 答案 |
|---|---|
| Q1.A containerRef 关键样式 | 沉浸模式下 width = zoom×100%,height 无设、自然 = img 高度,overflow 默认 visible,position relative |
| Q1.B 容器高度固定还是撑开 | 撑开,但只由 img 撑高(absolute 子元素不撑高父) |
| Q1.C 便签 absolute 相对谁 + y 能否 > 100 | 相对 containerRef;y 范围 [-20, 120](拖拽后) |
| Q2 stage / slideBox 谁有显式 height | **都没有**;slideBox.height = img.height,溢出便签视觉落到 stage 之外 |
| Q2 html2canvas 渲染范围 | 默认 stage.getBoundingClientRect.height,**不含溢出便签区** → 这是 Step 2 bug 根因 |
| Q3 是否有"我在幻灯片下面"的字段 | 无,完全由 y > 100 隐式表达;y 持久化无 clamp |

修复方向(只是建议,不实施):**显式给 slideBox 设 height = max(img.height, 所有便签的视觉最大 y) → stage 自然撑高 → html2canvas 自然捕获完整高度**。

---

> 报告完毕。零代码改动。等你拍板修复方向后再施工。
