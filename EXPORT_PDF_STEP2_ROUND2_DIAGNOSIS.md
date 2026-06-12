# EXPORT_PDF_STEP2_ROUND2_DIAGNOSIS · 只读诊断(二轮)

> 用户反馈:Step 2 修复后 slideBox 撑高生效,长条 PDF 出来了,但仍有 2 个问题:
> - 问题 1:**便签底部仍被截断**(文字多的便签)
> - 问题 2:**便签内部排版错乱**(诡异换行 / 右对齐)
>
> 本报告**只读 + 列证据**,不改任何代码。

---

## Q1 · 实际渲染高度 vs `a.height` 字段

### 当前 wrapper 高度处理

[exportNotebookPdf.ts:40](features/reader/lib/exportNotebookPdf.ts#L40):
```ts
wrapper.style.height = `${a.height ?? 120}px`;
```
**固定值,基于 `a.height` 字段**(SlideAnnotation.height 由用户拖拽 resize 写入,默认 120)。

### 当前 wrapper overflow

[exportNotebookPdf.ts:46](features/reader/lib/exportNotebookPdf.ts#L46):
```ts
wrapper.style.overflow = 'visible';
```
**显式 `visible`**——意味着 `innerHTML` 内的长文本会**溢出 wrapper 的 `height` 边界,向下/向上延伸**到 wrapper 框外,**仍然在视觉上可见**。

### 内部 HTML 是否会撑破 wrapper

**会撑破**。证据链:

| 字段 | 值 | 含义 |
|---|---|---|
| `wrapper.style.height` | `${a.height ?? 120}px`(固定) | wrapper 的"box height" 不变 |
| `wrapper.style.overflow` | `visible` | 不裁剪溢出文字 |
| `wrapper.innerHTML` | `note.text`(整段 HTML) | 真实内容长度由用户决定 |
| 浏览器布局结果 | wrapper `offsetHeight = a.height`, 但文字视觉延伸到 `box bottom + N px` 之外 | **视觉高度 ≠ offsetHeight** |

### Step 2 修复公式漏洞

[exportNotebookPdf.ts:140](features/reader/lib/exportNotebookPdf.ts#L140) 算 maxBottom 用的是:
```ts
const heightPx = a.height ?? 120;
```

**用了字段值,不是实际渲染高度**。当某条便签文字多到撑破 `a.height` 时:
- 字段 `a.height` = 100(用户设置)
- 实际文字撑出 wrapper 200px,视觉高度 ≈ 300px
- maxBottom 公式只算 100,**漏掉 200px 溢出**
- slideBox.height 被低估,**html2canvas 不捕获那 200px 文字**

这就是问题 1 根因:**`a.height` 是 box 高度,不是 content 高度;wrapper `overflow:visible` 让 content 视觉上溢出,但 maxBottom 公式没识别这种溢出**。

### SlideViewer 对应方:用 overflow-auto 自带裁剪 + 滚动

[SlideViewer.tsx:466-512](features/reader/slide-viewer/SlideViewer.tsx#L466) 的内层 div 是 `overflow-auto`(`overflow: auto`):
- 当文字超出 wrapper 高度,**内层 div 出现内部滚动条**,文字**不**视觉溢出
- 所以 SlideViewer 上看,wrapper 永远是 `a.height` 那么高,文字多了内部滚动

**SlideViewer 与 exportNotebookPdf 在这一点上是相反的行为:**
- SlideViewer:`overflow: auto` → 文字被 wrapper 裁掉,但有滚动条可滑
- exportNotebookPdf:`overflow: visible` → 文字延伸到 wrapper 外,但**截图捕获不到**

### overflow 完整对照(Q1 表)

| 层级 | SlideViewer | exportNotebookPdf | 影响 |
|---|---|---|---|
| 最外层 wrapper | 未设置(默认 `visible`) | `visible`(显式) | 一致 |
| 中间内容 div(SlideViewer 才有,见 Q3) | className `overflow-auto`(line 467) | (不存在) | 不一致 |
| 最内层 innerHTML 容器 | inline `overflow: auto`(line 507) | (不存在,innerHTML 直接挂 wrapper) | 不一致 |

**关键:SlideViewer 有 2 层 overflow-auto 卡控文字,exportNotebookPdf 直接让文字溢出但又不撑高 box**。

---

## Q2 · 便签 wrapper 完整 CSS 对照

### A. SlideViewer 便签 outer wrapper

[SlideViewer.tsx:404-422](features/reader/slide-viewer/SlideViewer.tsx#L404):

```jsx
<div
  key={note.id}
  className={`absolute rounded-lg shadow-lg border backdrop-blur-sm flex flex-col group transition-all ${
      isActive 
          ? 'z-50 shadow-2xl ring-2 ring-blue-400 border-amber-300' 
          : 'z-20 hover:z-30 border-amber-200/50'
  }`}
  style={{
      left: `${note.x}%`,
      top: `${note.y}%`,
      width: `${note.width || 240}px`, 
      height: `${note.height || 100}px`,        // ← 注意 fallback 是 100,不是 120
      backgroundColor: 'rgba(255, 252, 235, 0.95)',
      transform: 'translate(-5px, -5px)',
      cursor: isEditing ? 'text' : 'grab'
  }}
  ...
>
```

Tailwind 展开(导出态 = 非 active):
- `absolute` → `position: absolute`
- `rounded-lg` → `border-radius: 0.5rem`(8px)
- `shadow-lg` → `box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`
- `border` → `border-width: 1px; border-style: solid`
- `backdrop-blur-sm` → `backdrop-filter: blur(4px)`
- **`flex flex-col`** → **`display: flex; flex-direction: column`** ← 容易漏!
- `border-amber-200/50` → `border-color: rgb(253 230 138 / 0.5)`
- `group transition-all` → 不影响视觉

### B. exportNotebookPdf wrapper

[exportNotebookPdf.ts:44-67](features/reader/lib/exportNotebookPdf.ts#L44):

```ts
const wrapper = document.createElement('div');
wrapper.style.position = 'absolute';
wrapper.style.left = `${a.x}%`;
wrapper.style.top = `${a.y}%`;
wrapper.style.width = `${a.width ?? 240}px`;
wrapper.style.height = `${a.height ?? 120}px`;       // ← fallback 是 120
wrapper.style.backgroundColor = 'rgba(255, 252, 235, 0.95)';
wrapper.style.border = '1px solid rgba(251, 191, 36, 0.5)';
wrapper.style.borderRadius = '8px';
wrapper.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';
wrapper.style.transform = 'translate(-5px, -5px)';
wrapper.style.overflow = 'visible';
wrapper.style.padding = '12px';
wrapper.style.boxSizing = 'border-box';
wrapper.style.fontSize = `${a.fontSize ?? 14}px`;
wrapper.style.color = a.color ?? '#111827';
wrapper.style.fontWeight = a.isBold ? 'bold' : 'normal';
wrapper.style.lineHeight = '1.5';
wrapper.style.wordBreak = 'break-word';
wrapper.style.overflowWrap = 'break-word';
wrapper.style.whiteSpace = 'normal';                  // ← 关键差异
wrapper.innerHTML = a.text || '';                     // ← innerHTML 直接挂 wrapper
```

### 逐项对照表

| CSS 属性 | SlideViewer | exportNotebookPdf | 是否一致 |
|---|---|---|---|
| `position` | `absolute` | `absolute` | ✅ |
| `left` | `${note.x}%` | `${a.x}%` | ✅ |
| `top` | `${note.y}%` | `${a.y}%` | ✅ |
| `width` | `${note.width \|\| 240}px` | `${a.width ?? 240}px` | ✅ |
| `height` | `${note.height \|\| 100}px`(**fallback 100**) | `${a.height ?? 120}px`(**fallback 120**) | ⚠️ fallback 差 20px,但仅在 height 字段缺失时触发(创建时已写 120,极少触发) |
| `overflow` | 未设(默认 `visible`) | `visible`(显式) | ✅ 等效 |
| `padding` | **未设(0)** | **`12px`** | ❌ **关键差异**——SlideViewer 在内层中间 div 设 `p-3`,我直接设到 wrapper |
| `background-color` | `rgba(255, 252, 235, 0.95)` | `rgba(255, 252, 235, 0.95)` | ✅ |
| `border` | className `border` + `border-amber-200/50` = `1px solid rgb(253 230 138 / 0.5)` | `1px solid rgba(251, 191, 36, 0.5)`(琥珀色更饱和) | ⚠️ 颜色略不同,视觉差异微小 |
| `border-radius` | `0.5rem`(8px) | `8px` | ✅ |
| `box-shadow` | `shadow-lg` = `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)`(这是 `shadow-md`) | ⚠️ 我用了 `shadow-md` 的值,视觉影子稍轻 |
| `backdrop-filter` | `blur(4px)`(`backdrop-blur-sm`) | **未设** | ❌ 缺失,视觉差异极小(因背景已 95% 不透明) |
| `font-family` | 未设,继承 body = `'Nunito', sans-serif` | 通过 stage 继承 = `'Nunito', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif` | ⚠️ stack 不同,见 Q4 |
| `font-size` | 内层 middle div 设 `${note.fontSize \|\| 14}px` | wrapper 直接设 `${a.fontSize ?? 14}px` | ✅ 数值一致,作用层不同 |
| `font-weight` | 内层 middle div className `font-medium`(500),style 覆盖为 `bold` 或 `normal` | wrapper 设 `'bold' or 'normal'` | ⚠️ **当 `isBold = false` 时:SlideViewer 走 `normal`(注:className `font-medium`=500 被 style `fontWeight: 'normal'`=400 覆盖)→ 实际 400;我也设 400 → 一致** |
| `color` | 内层 middle div 设 `${note.color \|\| '#111827'}` | wrapper 直接设 `${a.color ?? '#111827'}` | ✅ |
| **`text-align`** | **未设** (默认 left) | **未设** (默认 left) | ✅ **一致——右对齐不源自这里** |
| `line-height` | className `leading-relaxed`(1.625),style 覆盖 `'1.5'` → 实际 1.5 | `'1.5'` | ✅ |
| `word-break` | `'break-word'` | `'break-word'` | ✅ |
| `overflow-wrap` | `'break-word'` | `'break-word'` | ✅ |
| **`white-space`** | **`'pre-wrap'`**(在最内层 div,见 Q3) | **`'normal'`**(在 wrapper 上) | ❌ **关键差异** |
| `display` | **`flex`**(因 `flex flex-col`) | 未设(默认 `block`) | ❌ **关键差异** |
| `flex-direction` | **`column`**(因 `flex flex-col`) | 未设 | ❌ |
| `transform` | `translate(-5px, -5px)` | `translate(-5px, -5px)` | ✅ |
| `box-sizing` | 未设(默认 `content-box`) | `'border-box'`(显式) | ❌ **关键差异**——影响 `width/height` 是否包含 padding+border |
| `z-index` | className `z-20`(非 active)= `20` | 未设 | ⚠️ 导出场景下不影响顺序(slideBox 内 DOM 顺序定层) |

### 关键问题集中点

1. **结构性差异:`flex flex-col` + 子 div 套娃 vs 单层 wrapper**
2. **`padding` 位置:SlideViewer 在中间 div 设 `p-3`,我设在 wrapper**
3. **`box-sizing` 不同:SlideViewer 默认 `content-box`(width/height 不含 padding),我显式 `border-box`(含 padding)**
4. **`white-space`:SlideViewer 内层显式 `pre-wrap`(保留换行+空格);我设 `normal`(折叠空白)**

`box-sizing` 差异会让我的 wrapper **内部可用空间比 SlideViewer 小 24px(padding 12px × 2)**——这可能压缩文字宽度,导致**早期换行**(挤到下一行的字数变少),视觉上看像"诡异换行"。

`white-space: normal` 对应 SlideViewer 的 `pre-wrap`:如果 `note.text` 的 HTML 里包含字面 `\n` 字符(从 ExplanationPanel 拖拽得来的纯文本会被 `plainTextToHtmlWithSupSub` 转 `<br>`,但如果是 contentEditable 内自由编辑的内容,可能含字面 `\n`),`normal` 会**把多个空白塞成一个空格**,**字面 `\n` 不换行**。结果:原本该多行的文字挤成一行,然后被 word-break 强行换行 → 视觉怪异。

---

## Q3 · 内层 div 对照

### SlideViewer 的 3 层嵌套结构

[SlideViewer.tsx:404-512](features/reader/slide-viewer/SlideViewer.tsx#L404) 拆解:

```jsx
{/* 层 1: 外层 wrapper (定位 + 视觉外壳 + flex flex-col) */}
<div className="absolute rounded-lg shadow-lg border backdrop-blur-sm flex flex-col ..."
     style={{ left, top, width, height, backgroundColor, transform, cursor }}>

  {/* 工具栏(active 时才显示,导出态没有,可忽略) */}

  {/* 层 2: 中间内容容器(p-3 padding + 字体设置 + h-full overflow-auto) */}
  <div className="p-3 w-full h-full font-medium leading-relaxed overflow-auto"
       style={{ fontSize, color, fontWeight, lineHeight: '1.5', overflowWrap, wordBreak }}>
    
    {/* 层 3: 内层渲染容器(white-space: pre-wrap + overflow: auto + dangerouslySetInnerHTML) */}
    <div className="w-full h-full select-none pointer-events-none"
         style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  overflowWrap: 'break-word', overflow: 'auto' }}
         dangerouslySetInnerHTML={{ __html: note.text }} />
  </div>
</div>
```

### exportNotebookPdf 的扁平 1 层结构

[exportNotebookPdf.ts:44-67](features/reader/lib/exportNotebookPdf.ts#L44):

```ts
// 层 1(也是唯一一层):wrapper
const wrapper = document.createElement('div');
// ...18 行 style 设置...
wrapper.innerHTML = a.text || '';                    // ← innerHTML 直接挂 wrapper
return wrapper;
```

**没有创建对应的中间 / 内层 div。**

### 3 层 vs 1 层差异表

| 层 | SlideViewer | exportNotebookPdf | 影响 |
|---|---|---|---|
| **外层 wrapper** | `position: absolute` + 固定 width/height + 视觉外壳 + **`display: flex; flex-direction: column`** | `position: absolute` + 固定 width/height + 视觉外壳 + padding 12px 直接挂 wrapper | 缺少 flex,但因只有一层子元素,影响主要在 padding 算位置 |
| **中间内容** | **存在**(`p-3 w-full h-full overflow-auto font-medium leading-relaxed` + fontSize/color/lineHeight/wordBreak inline) | **不存在**(这些样式直接合到 wrapper) | 视觉差异不大,但 padding 在不同层级影响 box-sizing 计算 |
| **内层渲染** | **存在**(`w-full h-full select-none pointer-events-none` + **`whiteSpace: 'pre-wrap'`** + `overflow: 'auto'` + dangerouslySetInnerHTML) | **不存在**(innerHTML 设在 wrapper) | **`pre-wrap` 缺失是问题 2 主要嫌疑**——保留 contentEditable 输入的字面换行 |

### 结论:结构性差异极可能就是问题 2 的根因

SlideViewer 显式用 `white-space: pre-wrap`,意思是:
- **保留 HTML 中的字面 `\n` 当换行**
- **保留连续空格**
- 文字到达容器边界时自动换行

我的 wrapper 用 `white-space: normal`(显式):
- **字面 `\n` 当空格**
- **连续空格合并为一个**
- 文字到达容器边界时自动换行

当 `note.text` 是 contentEditable 直接编辑的产物(用户手敲文字),HTML 通常带 `<div>` 或 `<br>` 而非字面 `\n`,这种情况下 `normal` 和 `pre-wrap` 行为接近。

但当 `note.text` 含 `<div align="right">` / `<p style="text-align:right">` / 各种从外部粘贴 / drag-from-ExplanationPanel 时,**HTML 内部样式会原样生效**——这一条不受 white-space 影响,**但右对齐结果会从 HTML 内嵌样式来**。

需要看用户实际有问题那条便签的 HTML(从 IndexedDB 拿)才能确认右对齐是 white-space 还是内嵌 style 引起。

---

## Q4 · 字体相关

### Body 全局字体(`index.html:49-51`)

```css
body {
  font-family: 'Nunito', sans-serif;
}
```

### SlideViewer 便签的字体

**未显式设置 font-family**——继承自 body → `'Nunito', sans-serif`。

中文字符走 Nunito → Nunito 无中文 glyph → 浏览器 fallback 到系统默认 sans-serif。
- Windows:系统默认 sans-serif 通常是 `Microsoft YaHei UI` / `微软雅黑`
- macOS:`PingFang SC`
- 这是**浏览器引擎的默认中文兜底**

### exportNotebookPdf 的 fontFamily

[exportNotebookPdf.ts:82](features/reader/lib/exportNotebookPdf.ts#L82):
```ts
stage.style.fontFamily = `'Nunito', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif`;
```

显式列了 PingFang SC / Microsoft YaHei / Hiragino Sans GB。

### 关键风险

| 字符类型 | SlideViewer 路径 | exportNotebookPdf 路径 | 结果 |
|---|---|---|---|
| ASCII 拉丁(英文 / 数字 / 标点) | Nunito ✅ | Nunito ✅ | 一致 |
| 中文 | Nunito 无 glyph → 浏览器系统兜底(Windows 用 YaHei,macOS 用 PingFang) | Nunito 无 glyph → **显式 PingFang SC**(Windows 无此字体)→ **显式 Microsoft YaHei**(macOS 无此字体)→ Hiragino Sans GB(macOS 有,Windows 无)→ sans-serif | **Windows 上:导出走 YaHei(第三选项),SlideViewer 走 YaHei(默认兜底);macOS 上:导出走 PingFang(第一选项),SlideViewer 走 PingFang(默认兜底)。理论一致,但具体字重/紧排可能因字体加载层级不同而微差** |

### 这是问题 2 的根因吗?

**不太可能**。字体差异最多导致**字形细微不同**(同一汉字字体重不同的笔画粗细差),不会导致**段落右对齐**或**字宽变窄**这种排版异常。

**最可能的问题 2 根因(综合 Q2 + Q3 + Q4):**

1. **首要嫌疑**:`note.text` 字符串内部含右对齐的 inline style(`<div align="right">` 或 `<p style="text-align: right">`)—— 这来自 ExplanationPanel 拖拽时若选中区原本含右对齐样式
2. **次要嫌疑**:`box-sizing: border-box` 让 wrapper 内容宽度比 SlideViewer 窄 24px(被 padding 吃掉),触发**早换行**
3. **三号嫌疑**:`white-space: normal`(我) vs `pre-wrap`(SlideViewer) 在某些含字面 `\n` 的 HTML 下渲染不同
4. **基本排除**:字体差异不会导致右对齐 / 段右对齐

---

## 汇总:问题 1 vs 问题 2 根因判断

### 问题 1(底部仍截断)的核心根因

**`maxBottom` 公式用字段 `a.height` 代替实际渲染高度**:
- wrapper `overflow: visible` + `innerHTML` 长文字 → 文字撑出 wrapper box
- maxBottom 用 box 高度(`a.height`),不识别溢出文字
- slideBox 高度被低估 → html2canvas 截不到底部文字

**修法方向**(只列,不施工):
- 方案 A:`wrapper.scrollHeight` 测量实际内容高度,代替 `a.height` 进 maxBottom 公式
- 方案 B:wrapper 改 `min-height: ${a.height}px` + 不设 `height`,让 wrapper 自然撑高,再用 `getBoundingClientRect()` 拿实际 wrapper 高度
- 方案 C:wrapper 改 `overflow: hidden` 保持 box 不撑大(与 SlideViewer 行为一致——内部文字看到的就是被截的),与 Q2 排版问题一并修
- (注:方案 C 是"对齐 SlideViewer 视觉"的方向,但用户的诉求是"沉浸模式完整捕获便签",这意味着需要在导出时**故意比 SlideViewer 显示更多内容**,所以 C 不符合用户意图,A/B 更合适)

### 问题 2(排版错乱 / 右对齐)的最可能根因

按嫌疑度排序:
1. **HTML 内嵌 style/属性**:`note.text` 含 `text-align: right` 或类似(需用户提供出问题那条便签的 HTML 才能确认,可在 DevTools IndexedDB 看)
2. **`box-sizing: border-box`**(我)vs 默认 `content-box`(SlideViewer):wrapper 内容宽度差 24px,文字早换行
3. **`white-space: normal`**(我)vs `'pre-wrap'`(SlideViewer 内层):折叠字面换行/空格,与原版行为不同
4. **缺少 3 层嵌套结构**:padding / overflow / 字体设置作用层级混到一层,边缘 case 下渲染差异
5. **(基本排除)字体差异**:不会导致段落右对齐

**修法方向**(只列,不施工):
- 方案 A:照 SlideViewer 三层结构原样复刻,而不是扁平到一层 wrapper
- 方案 B:保留扁平结构,但调整 `box-sizing: content-box` + `white-space: pre-wrap`,贴近 SlideViewer 渲染
- 方案 C:不动 wrapper,先在 `note.text` 注入前用 DOMPurify / 手动剥离 right-align / 危险 style 属性
- (Q2 问题大概率需要 A+C 组合,因为 inline style 是 HTML 字面值,不靠 wrapper 修)

---

## 给修复阶段的诊断清单(用户拍板用)

| 现象 | 根因层级 | 修法层级 | 工程量 |
|---|---|---|---|
| 底部仍截断(问题 1) | maxBottom 用了 box 高度而非内容高度 | exportNotebookPdf 改测量逻辑(wrapper.scrollHeight 或 wrapper 不设 height) | 小,5-10 行 |
| 排版错乱(问题 2)| 结构扁平 + box-sizing + white-space + 可能的内嵌 HTML 样式 | exportNotebookPdf 改 3 层结构 + 对齐 SlideViewer 所有 CSS | 中,30-40 行 |

> 报告完毕。零代码改动。等用户拍板。
