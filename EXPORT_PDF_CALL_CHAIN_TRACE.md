# EXPORT_PDF_CALL_CHAIN_TRACE · 只读侦察

> 用户报告:exportNotebookPdf.ts 已改但运行时仍是修复前样子。
> 强烈怀疑新代码未被调用。本报告逐节核验调用链。

---

## Q1 · `handleExportPDF` 当前完整代码

**文件位置:** `App.tsx:1900-1918`(经 grep 确认仅此一处定义)

```ts
const handleExportPDF = async () => {
  // TEMP: Step 2 验证单页流程,Step 4 改回全量
  if (slides.length === 0) return;
  const slide = slides[currentIndex];
  if (!slide) return;
  const slideAnnos = annotations[slide.id] || [];
  const displayName = fileName || 'study-notes';
  try {
    await exportSingleSlideToPdf(
      slide,
      slideAnnos,
      displayName,
      { current: currentIndex + 1, total: slides.length, fileName: displayName }
    );
  } catch (e) {
    console.error('exportSingleSlideToPdf failed:', e);
    alert('导出 PDF 失败,请查看控制台。');
  }
};
```

### 关键判断逐项

| 判断点 | 结果 |
|---|---|
| 是否调用 `exportSingleSlideToPdf`? | ✅ 是(line 1908) |
| 是否仍用旧的 `jsPDF.text()` + `cleanHtmlToText`? | ❌ 否 — 旧逻辑代码全部已替换,函数体内**零 jsPDF / cleanHtmlToText 引用** |
| 是否有 `// TEMP: Step 2 验证单页流程,Step 4 改回全量` 注释? | ✅ 是(line 1901) |

→ **App.tsx 磁盘上确实是 Step 2 修复后的新代码,函数体已不再走旧 jsPDF.text() 路径**。

---

## Q2 · 全仓搜 `handleExportPDF` 定义点

grep 全仓结果(只列代码文件,忽略 .md 报告引用):

```
App.tsx:1900    const handleExportPDF = async () => {     ← 唯一定义
App.tsx:2088    onExportPDF={handleExportPDF}              ← 唯一使用
```

**App.tsx 仅 1 处定义,1 处使用。无其它代码文件命中,无重复定义。**

---

## Q3 · SlideViewer 导出按钮 onClick 接谁

### Step A · 按钮 onClick

[features/reader/slide-viewer/SlideViewer.tsx:359-366](features/reader/slide-viewer/SlideViewer.tsx#L359):

```tsx
<button 
  onClick={(e) => { e.stopPropagation(); onExportPDF(); }}
  className={...}
  title="导出笔记版 PDF"
>
    <Download className="w-4 h-4" />
    {!isImmersive && <span>导出笔记版 PDF</span>}
</button>
```

→ 按钮 onClick 调用 prop `onExportPDF()`。

### Step B · App.tsx 渲染 SlideViewer 时传的 onExportPDF

[App.tsx:2081-2093](App.tsx#L2081):

```tsx
const commonSlideViewer = (
  <SlideViewer 
    slide={currentSlide} 
    annotations={currentSlide ? (annotations[currentSlide.id] || []) : []} 
    onAddAnnotation={handleAddAnnotation} 
    onUpdateAnnotation={handleUpdateAnnotation} 
    onDeleteAnnotation={handleDeleteAnnotation} 
    onExportPDF={handleExportPDF}          // ← 这里
    onRequestUpload={() => hiddenFileInputRef.current?.click()} 
    isImmersive={isImmersive}
    leftPanelRef={leftPanelRef}
  />
);
```

→ `onExportPDF` prop = `handleExportPDF`(就是 Q1 那个新代码)。

### Step C · `commonSlideViewer` 渲染处

grep 全仓 `SlideViewer ` 标签:

```
App.tsx:5      import { SlideViewer } from '@/features/reader/slide-viewer/SlideViewer';
App.tsx:2082   <SlideViewer                      ← 唯一渲染点(commonSlideViewer 内)
```

`commonSlideViewer` 的引用:
```
App.tsx:2081   const commonSlideViewer = (...)  ← 定义
App.tsx:2781   {commonSlideViewer}              ← 唯一使用点
```

→ **整个 App 全程只有一个 `<SlideViewer>` 实例,且 `onExportPDF` 100% 接的是 `handleExportPDF` 新版**。

### 完整调用链路

```
用户点 SlideViewer 头部"导出笔记版 PDF"按钮
   ↓ SlideViewer.tsx:360 onClick
onExportPDF()  ← prop
   ↓ App.tsx:2088 prop 绑定
handleExportPDF  ← App.tsx:1900-1918 新版
   ↓ App.tsx:1908 await
exportSingleSlideToPdf(slide, slideAnnos, displayName, pageInfo)
   ↓ App.tsx:44 import
features/reader/lib/exportNotebookPdf.ts:202 export async function exportSingleSlideToPdf
```

**链路 100% 通,无断点、无歧义、无重复绑定**。

---

## Q4 · 区分 `handleExportPDF` vs `handleExportDoc`

| 函数 | 位置 | 按钮文案 | 按钮位置 | 用途 |
|---|---|---|---|---|
| `handleExportPDF` | `App.tsx:1900` | **"导出笔记版 PDF"** + Download 图标 | `SlideViewer.tsx:362-365`(头部右上角) | 导出 PDF |
| `handleExportDoc` | `Notebook.tsx:49` | **"导出笔记"** + Download 图标 | `Notebook.tsx:122-129`(Notebook 顶部) | 导出 .doc(MS-Word) |

**关键区分:**
- 按钮文案不同:"**导出笔记版 PDF**" vs "**导出笔记**"(只 4 字,无 PDF)
- 按钮位置不同:SlideViewer 头部 vs Notebook 顶部
- 触发函数完全独立,代码层面无任何混线

→ 用户截图里看到的"导出笔记版 PDF"按钮 onClick 路径是 `handleExportPDF`,**绝不可能**误接 `handleExportDoc`。

---

## Q5 · `exportSingleSlideToPdf` 是否真被 import 与调用

grep 全仓:

```
App.tsx:44                              import { exportSingleSlideToPdf } from '@/features/reader/lib/exportNotebookPdf';
App.tsx:1908                            await exportSingleSlideToPdf(...)
App.tsx:1915                            console.error('exportSingleSlideToPdf failed:', e);
features/reader/lib/exportNotebookPdf.ts:202   export async function exportSingleSlideToPdf(
```

| 检查点 | 结果 |
|---|---|
| 在 exportNotebookPdf.ts 里 export 了? | ✅(line 202) |
| 在 App.tsx 里 import 了? | ✅(line 44) |
| 在 App.tsx 里被调用了? | ✅(line 1908,await) |
| import 后无人调用的死代码? | ❌ 否 |

**Q5 链路完整。无断点。**

---

## 综合结论

### 调用链 100% 通 — 代码层无任何"未被调用"的可能

逐节核验后,从用户点击按钮到 exportSingleSlideToPdf 执行,链路完全通畅:

```
SlideViewer.tsx:360  按钮 onClick → onExportPDF()
App.tsx:2088         onExportPDF prop = handleExportPDF
App.tsx:1900-1918    handleExportPDF (新版,无旧 jsPDF.text)
App.tsx:1908         await exportSingleSlideToPdf(...)
App.tsx:44           import 自 @/features/reader/lib/exportNotebookPdf
exportNotebookPdf.ts:202   export async function exportSingleSlideToPdf
```

**磁盘代码里完全不存在"按钮按了但跑老逻辑"的路径**。

### 那为什么用户看到"修复前的样子"?

排除"代码未被调用"后,可能的真实原因(供用户排查,不能由我从静态代码确认):

#### 嫌疑 1 · Vite 缓存(强烈怀疑)

- Vite 有 `node_modules/.vite/deps` 预构建缓存,有时 import 关系变化或 export 改名会让缓存失效但 Vite 不自动重新构建
- **排查方法:**
  ```
  停掉 dev server (Ctrl+C)
  删除目录 node_modules/.vite
  重新 npm run dev
  浏览器 DevTools → Application → Storage → "Clear site data"
  浏览器硬刷(Ctrl+Shift+R)
  ```

#### 嫌疑 2 · 浏览器 Service Worker 缓存

- 若项目部署过 PWA Service Worker(看 index.html 是否注册),旧 SW 可能拦截 .tsx 加载
- **排查方法:** DevTools → Application → Service Workers → Unregister all

#### 嫌疑 3 · 浏览器 Module preload 缓存

- 即使硬刷,某些 esm.sh CDN 资源(如 html2canvas)若已缓存,可能用旧版本
- **排查方法:** DevTools → Network → 勾选 "Disable cache" → 硬刷

#### 嫌疑 4 · 用户报告的"修复前样子"可能不是真"修复前"

- "修复前样子" = 中文乱码 + 便签裁切?
- 如果用户的意思是"便签底部还是有点裁切" / "排版还有点怪",那其实是 **Step 2 第二轮修复后仍存在的次级 bug**,而不是"代码没在跑"。
- **排查方法:** 用户描述具体看到什么——是中文乱码(=老 jsPDF.text 路径,几乎不可能)还是排版还差点(=新代码但效果不够)

#### 嫌疑 5 · `<base href>` 或 路由问题(低概率)

- 如果 index.html 有 `<base>` 或 vite.config 改了 root,@/ alias 解析可能跑偏
- **排查方法:** DevTools → Sources → 看 `features/reader/lib/exportNotebookPdf.ts` 是否真出现在浏览器加载的文件列表里,内容是否最新

### 建议用户立即跑的 4 步快速验证

1. **DevTools → Console** 点导出按钮,看是否打印 `console.error('exportSingleSlideToPdf failed: ...')`?
   - 打印 → 新代码在跑但内部出错(可能 html2canvas 加载失败之类)
   - 不打印 → 检查嫌疑 1-3 缓存问题
2. **DevTools → Network** 点导出按钮,看是否新加载 `html2canvas` chunk?
   - 加载 → 走新代码
   - 不加载但有别的 chunk → 走旧代码(很可能是缓存)
3. **DevTools → Sources** 搜 `exportSingleSlideToPdf`,看代码内容是不是磁盘最新版?
4. **导出后看 PDF**:中文是否乱码?
   - 乱码 → 100% 走老 jsPDF.text 路径(应该不可能,但若发生需深入排查打包)
   - 不乱码但裁切/排版有问题 → 新代码在跑但有 bug,回到代码层修

---

> 报告完毕。代码层零 bug,问题应在运行时缓存或用户感知层。等用户跑上述快速验证回报。
