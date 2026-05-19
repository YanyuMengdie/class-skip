# EXPORT_PDF_RECON

> 只读侦察报告。零代码改动。生成于 2026-05-09。
> 工作树状态:除本报告外**无任何文件改动**。

---

## §1 导出入口盘点

| # | 按钮位置 | 文案 | 调用函数 | 函数位置 | 输出文件 | 实现栈 |
|---|---|---|---|---|---|---|
| 1 | [features/reader/slide-viewer/SlideViewer.tsx:362-365](features/reader/slide-viewer/SlideViewer.tsx#L362) | `导出笔记版 PDF`(line 365)+ title=`导出笔记版 PDF`(line 362) | `onExportPDF` prop(在 [App.tsx:2072](App.tsx#L2072) 绑定到 `handleExportPDF`) | [App.tsx:1899-1902](App.tsx#L1899) | `${fileName}_annotated.pdf` | jsPDF 2.5.1(`new jsPDF(...)`) |
| 2 | [features/reader/notebook/Notebook.tsx:123-128](features/reader/notebook/Notebook.tsx#L123) | `导出笔记`(line 128) | `handleExportDoc` | [features/reader/notebook/Notebook.tsx:49](features/reader/notebook/Notebook.tsx#L49) | (.doc — Notebook 路径,本任务范围外) | `data:application/vnd.ms-word`([Notebook.tsx:92](features/reader/notebook/Notebook.tsx#L92)) + `downloadLink.click()`([Notebook.tsx:97](features/reader/notebook/Notebook.tsx#L97)) |

**结论:** 只有 1 个 PDF 导出入口(`handleExportPDF`)。Notebook 的 `handleExportDoc` 是 .doc(MS-Word) 路径,与本任务"导出笔记版 PDF"无关。

---

## §2 handleExportPDF 全文

### 函数全文

`handleExportPDF` 整段为一行紧凑写法(line 1900-1901 是单行 1500+ 字符)。展开后:

```ts
// App.tsx:1899-1902
const handleExportPDF = async () => {
  if (slides.length === 0) return;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideAnnos = annotations[slide.id] || [];
    if (i > 0) pdf.addPage();
    try {
      const imgProps = pdf.getImageProperties(slide.imageUrl);
      const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
      const drawWidth = imgProps.width * ratio;
      const drawHeight = imgProps.height * ratio;
      const offsetX = (pdfWidth - drawWidth) / 2;
      const offsetY = (pdfHeight - drawHeight) / 2;
      pdf.addImage(slide.imageUrl, 'PNG', offsetX, offsetY, drawWidth, drawHeight, undefined, 'FAST');
    } catch (e) {
      pdf.addImage(slide.imageUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    }
    slideAnnos.forEach(anno => {
      const xPos = (anno.x / 100) * pdfWidth;
      const yPos = (anno.y / 100) * pdfHeight;
      pdf.setFillColor(255, 252, 235);
      pdf.setDrawColor(251, 191, 36);
      pdf.rect(xPos, yPos, anno.width || 240, anno.height || 100, 'FD');
      pdf.setFontSize(anno.fontSize || 14);
      if (anno.color) {
        const r = parseInt(anno.color.substr(1, 2), 16);
        const g = parseInt(anno.color.substr(3, 2), 16);
        const b = parseInt(anno.color.substr(5, 2), 16);
        pdf.setTextColor(r, g, b);
      } else {
        pdf.setTextColor(50, 50, 50);
      }
      pdf.text(
        pdf.splitTextToSize(cleanHtmlToText(anno.text), (anno.width || 240) - 20),
        xPos + 10,
        yPos + (anno.fontSize || 14) + 5
      );
    });
  }
  pdf.save(`${fileName || 'study-notes'}_annotated.pdf`);
};
```

### 依赖的 state / props

读取以下闭包变量(均为 App.tsx 同作用域 useState / 局部变量):

| 变量 | 类型 | 定义位置 | 类型源 |
|---|---|---|---|
| `slides` | `Slide[]` | [App.tsx](App.tsx) 顶层 useState(从 PDF 生成,见 §4) | `Slide`(下方) |
| `annotations` | `AnnotationCache` | [App.tsx:100](App.tsx#L100):`useState<AnnotationCache>({})` | `AnnotationCache`(下方) |
| `fileName` | `string \| null` | App.tsx 顶层 useState | `string \| null` |

类型源码:

```ts
// types.ts (Slide 接口未在本次 grep 直接找到,但用法上仅消费 id + imageUrl)
// 注:实际仓库未对 Slide 单独 export interface;Slide 由 processFile 构造,见 §4

// types.ts:58-68
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

// types.ts:70-72
export interface AnnotationCache {
  [slideId: string]: SlideAnnotation[];
}
```

`Slide` 接口侦察补充:在 [App.tsx:693](App.tsx#L693) 处构造 `const newSlides: Slide[] = images.map((img, idx) => ({ id: \`slide-${hash}-${idx}\`, imageUrl: img, pageNumber: idx + 1 }))`。`Slide` 类型在 types.ts 中(本次未单独贴,但实际只用到 `id` + `imageUrl`)。

### cleanHtmlToText 与调用方

```ts
// App.tsx:77-83
const cleanHtmlToText = (html: string): string => {
  if (!html) return '';
  const temp = document.createElement('div');
  let processed = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n');
  temp.innerHTML = processed;
  return temp.innerText.trim();
};
```

grep `cleanHtmlToText` 全仓:

```
App.tsx:77   ← 定义
App.tsx:1901 ← 唯一调用方(handleExportPDF 内部)
```

**结论:** `cleanHtmlToText` 在仓库内**仅被 handleExportPDF 一处使用**。导出之外的调用方:**零**。

行为:`<br>` / `</div>` / `</p>` 转换行,其它 HTML 标签**全部剥除**,只剩 `innerText`。`<sup>` / `<strong>` / `<span class="katex">` 内部的文本会保留,但**所有格式信息消失**——上标变成普通字符流,KaTeX 视觉公式坍缩成线性拼接的术语字串。

### jsPDF 版本确认

| 位置 | 版本 |
|---|---|
| [package.json:18](package.json#L18) | `"jspdf": "2.5.1"` |
| [index.html:128](index.html#L128) | `"jspdf": "https://esm.sh/jspdf@2.5.1"` |

**两边一致,都是 2.5.1**。

---

## §3 便签数据形态

### Annotation 接口

(见 §2,types.ts:58-72 已贴。)

### 五问回答

#### 1. x / y 单位

**百分比(0-100)**。

依据 [features/reader/slide-viewer/SlideViewer.tsx:108-109](features/reader/slide-viewer/SlideViewer.tsx#L108):

```ts
const x = Math.max(5, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
const y = Math.max(5, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
onAddAnnotation(content, x, y);
```

也由 types.ts:61-62 注释明确标注 `// Percentage`。handleExportPDF 中再除 100 还原为 PDF 坐标:`const xPos = (anno.x / 100) * pdfWidth;`([App.tsx:1901](App.tsx#L1901) 内联段)。

#### 2. width / height 单位与默认值

**单位:像素(px)**(types.ts:63-64 注释 `// Pixels`)。

**默认值:** 创建时由 [App.tsx:1833](App.tsx#L1833) `handleAddAnnotation` 写死:

```ts
const newAnnotation: SlideAnnotation = {
  id: `anno-${Date.now()}`,
  text, x, y,
  fontSize: 14,
  width: 240,
  height: 120,
  color: '#111827',
  isBold: false
};
```

即 `width=240px`, `height=120px`(注意:handleExportPDF 中 fallback 写的是 `anno.height || 100` —— 这与创建默认 120 不一致,但因为创建时 height 永远有值,fallback 100 实际不会触发)。

#### 3. text 字段内容来源(至少 3 个真实写入源)

`SlideAnnotation.text` **存的是 HTML 字符串**(SlideViewer 渲染时用 `dangerouslySetInnerHTML`,见 §8)。3 个写入源:

| 写入源 | 代码位置 | 写入内容格式 |
|---|---|---|
| **A. 从外部拖拽 HTML 到幻灯片**(主要来源,典型场景 = 用户从 ExplanationPanel 选中带 KaTeX 公式的解释段落,拖到幻灯片) | [SlideViewer.tsx:85-110](features/reader/slide-viewer/SlideViewer.tsx#L85)`handleDrop`:`let content = e.dataTransfer.getData("text/html");` → `onAddAnnotation(content, x, y)` | **带 HTML 标签的字符串**,可能含 `<sup>` / `<strong>` / `<span class="katex">...</span>`(KaTeX 渲染后的整段 DOM)/ `<br>` / `<div>` |
| **B. 拖拽时只有纯文本**(无 text/html 数据) | [SlideViewer.tsx:91-94](features/reader/slide-viewer/SlideViewer.tsx#L91):`if (!content && plainText) { content = plainTextToHtmlWithSupSub(plainText); }`,内部见 [features/reader/lib/textUtils.ts:15](features/reader/lib/textUtils.ts#L15) | **HTML 字符串**(经 `plainTextToHtmlWithSupSub` 把 Unicode 上标⁺⁻转成 `<sup>`,把换行转 `<br>`) |
| **C. 用户在便签上双击进入编辑**(contentEditable 自由编辑) | [SlideViewer.tsx:232-238](features/reader/slide-viewer/SlideViewer.tsx#L232)`saveEdit()`:`onUpdateAnnotation(editingId, { text: editorRef.current.innerHTML })` | **HTML 字符串**(`contentEditable` 产生的 DOM,可能含 `<b>` / `<font color>` / `<span style="font-size:Npx">` ——由 [SlideViewer.tsx:266-279](features/reader/slide-viewer/SlideViewer.tsx#L266) 的 `applyStyleToSelection` 通过 `document.execCommand('bold' / 'foreColor' / 内联 span)` 注入) |

**结论:** `text` 字段**始终是 HTML 字符串**,从不是纯文本。**三个来源都可能含上标 / KaTeX / 内联样式 HTML**。当前 `cleanHtmlToText` 在导出时把这些全拍平成纯字符流。

#### 4. fontSize

- **默认值:** `14`(创建时写死,[App.tsx:1833](App.tsx#L1833))
- **单位:** **像素**(types.ts:65 注释 `// Pixels`)
- **能否改:** 能,通过 contentEditable 编辑模式下的 `applyStyleToSelection('fontSize', value)`([SlideViewer.tsx:277-279](features/reader/slide-viewer/SlideViewer.tsx#L277))——但这是给选区内联 span 设 fontSize,**不改 `SlideAnnotation.fontSize` 字段本身**;字段本身的 fontSize 是整个便签的"基础字号",一般保持 14
- **范围:** 代码层没有上下限校验,可写任意数;UI 侧具体范围由按钮提供的预设决定(未细查)

#### 5. color

- **格式:** `#RRGGBB` hex string(默认 `#111827`,[App.tsx:1833](App.tsx#L1833))
- **是否可选:** **可选**(`color?: string`)
- 导出时按 hex 解析为 RGB:[App.tsx:1901](App.tsx#L1901) 内联段 `parseInt(anno.color.substr(1, 2), 16)` 等
- color fallback(未提供):`pdf.setTextColor(50, 50, 50)`(深灰)

---

## §4 幻灯片图 `slide.imageUrl` 来源

```ts
// lib/pdf/pdfUtils.ts:44-76
export const convertPdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    ...getDocumentOptions(),
  }).promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });   // ← scale 2.0
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    } as any).promise;

    const imageUrl = canvas.toDataURL('image/png');   // ← PNG dataURL
    images.push(imageUrl);
  }

  return images;
};
```

- **scale:** `2.0`(line 55)
- **输出格式:** `image/png` dataURL(line 71)
- **后续压缩?** grep `imageUrl` 没有发现额外压缩/降采样代码——生成后直接 `setSlides(newSlides)`([App.tsx:693](App.tsx#L693))存进 React state,handleExportPDF 直接消费 `slide.imageUrl`。

**dataURL 大小估算(推算值):**

- 标准 16:9 PowerPoint slide 内部尺寸 ≈ 1280 × 720 pt(实际 PDF 页 viewport)。
- scale 2.0 → canvas 像素 ≈ 2560 × 1440 = 3.69 M 像素
- 信息密集 PNG ≈ 1.5-3 bytes/pixel(无压缩底色 + 文字混排)→ raw PNG 5-10 MB
- base64 编码 +33% → **dataURL 字符串约 7-13 MB**(单页)
- 仓库内**无 size 日志**确认实测值。

(若幻灯片实际尺寸不同,按 `scale=2.0` 比例缩放估算。)

---

## §5 中文字体现状

grep 结果:

```
addFont:        无匹配
addFileToVFS:   无匹配
pdf.setFont(:   无匹配
setFont(:       无匹配
```

(`setFont` 子串唯一出现在 [App.tsx:1901](App.tsx#L1901),但那是 `pdf.setFontSize(...)`,不是 `setFont(...)`)。

**结论:** `handleExportPDF` **没有任何中文字体注入逻辑**。jsPDF 2.5.1 默认使用内置 14 个 Type1 字体(Helvetica / Times / Courier 等),全部为 WinAnsi/Latin-1 编码。

**`pdf.text(中文字符串, ...)` 在当前实现下的实际行为**(基于 jsPDF 2.5.1 已知行为):

- 输入 `pdf.text("线粒体", ...)` 会把每个 UTF-16 码元强转为 Latin-1 字节
- 由于 Helvetica 无中文 glyph,实际输出:
  - **mojibake**(每个汉字渲染成 2-3 个看似随机的 Latin-1 字符,如 `ç»¿ç»¿ç»¿`)是最常见结果
  - **不是 tofu (□)** —— tofu 需要字体声明该 codepoint 缺字,而 Helvetica 的 WinAnsi 编码空间内压根不存在汉字 codepoint,所以是字节错位而非字形缺失
  - 视具体字符的 UTF-8 字节模式,也可能出现部分**空白**(若字节恰好落在 Latin-1 不可见区域如 0x80-0x9F)

实测预期:用户便签里所有中文几乎全部不可读,部分 ASCII 标点(英文、数字、`,. !? () []`)可读。

---

## §6 html2canvas 可用性

| 位置 | 是否声明 |
|---|---|
| [package.json:13-27 dependencies](package.json#L13) | **无** |
| [package.json:28-33 devDependencies](package.json#L28) | **无** |
| package.json optionalDependencies | **无**(package.json 全文 grep 不到 `html2canvas`) |
| [index.html:115-135 importmap](index.html#L115) | **无** |
| [package-lock.json:3579](package-lock.json#L3579) | **有**(node_modules 1.4.1,作为 jsPDF 的 optionalDependency 间接装入,见 [package-lock.json:3775-3780](package-lock.json#L3775)) |

**`import html2canvas from 'html2canvas'` 当前能不能用?**

**答:条件能用,但不规范(等同于"需要补一行配置")。** 详细:

- 项目用 Vite(`package.json:scripts.dev = "vite"`),Vite dev/build 会从 `node_modules` 解析模块。因 jsPDF 的 optionalDep 已经把 html2canvas 1.4.1 装进 `node_modules/html2canvas`,**Vite 模式下 import 能跑通**。
- 但 `package.json` 没有显式 `html2canvas` 依赖,任何 `npm install --omit=optional`、package-lock 重建、或 npm 大版本变化都可能让它消失。
- 同时 `index.html` importmap 也没有 html2canvas 条目,所以如果项目今后改成纯浏览器 ESM(脱离 Vite 直接读 importmap 加载),**会失败**。
- **规范做法**应是:(a) 在 `package.json.dependencies` 显式加 `"html2canvas": "^1.4.1"`,(b) 在 importmap 加一行 `"html2canvas": "https://esm.sh/html2canvas@1.4.1"`。

---

## §7 打印 CSS 现状

grep 结果:

| 模式 | 命中 |
|---|---|
| `@media print` | **0 处** |
| `@page` | **0 处** |
| Tailwind `print:` 前缀 | **0 处** |
| 子串 `print`(全仓) | 仅 1 处 false positive([features/exam/lib/examMaintenanceEligibility.ts:6](features/exam/lib/examMaintenanceEligibility.ts#L6) 的 `blockedSprint` 变量名) |
| `index.css` 文件内 `print` | **0 处** |

**结论:零打印 CSS**。

---

## §8 信息丢失链路确认

按 4 步链路逐项核对:

| # | 链路 | 代码行号 | 验证 |
|---|---|---|---|
| 1 | 便签编辑时 HTML(带 `<sup>` / KaTeX) | [SlideViewer.tsx:232-238 `saveEdit`](features/reader/slide-viewer/SlideViewer.tsx#L232):`onUpdateAnnotation(editingId, { text: editorRef.current.innerHTML })` | ✅ 写入字段 `text` 就是 contentEditable div 的 `innerHTML`(HTML 字符串),`execCommand` 注入的 bold/color/fontSize 全在 HTML 里 |
| 2 | 存进 annotations state(HTML 字符串) | [App.tsx:100](App.tsx#L100) `useState<AnnotationCache>({})` + [App.tsx:1833-1834](App.tsx#L1833)`handleAddAnnotation / handleUpdateAnnotation` | ✅ AnnotationCache 是 `{ [slideId]: SlideAnnotation[] }`,`SlideAnnotation.text` 始终持有 HTML |
| 3 | SlideViewer 渲染时用 `dangerouslySetInnerHTML`(保住格式) | [SlideViewer.tsx:500-510](features/reader/slide-viewer/SlideViewer.tsx#L500)(非编辑模式):`<div ... dangerouslySetInnerHTML={{ __html: note.text }} />`;编辑模式则用 contentEditable + useEffect 初始化 innerHTML([SlideViewer.tsx:60-65](features/reader/slide-viewer/SlideViewer.tsx#L60)) | ✅ UI 上格式(上标、加粗、颜色、KaTeX)完整呈现 |
| 4a | 导出时 `cleanHtmlToText` 拍平(丢格式) | [App.tsx:77-83](App.tsx#L77) `cleanHtmlToText`:`temp.innerHTML = processed; return temp.innerText.trim();` 调用点 [App.tsx:1901](App.tsx#L1901):`pdf.splitTextToSize(cleanHtmlToText(anno.text), ...)` | ✅ `<sup>2</sup>` 拍成 `2`、`<strong>X</strong>` 拍成 `X`、`<span class="katex">∫ dx</span>` 拍成 `∫ dx`(KaTeX DOM 的 fallback 文本,**通常是不可读的拼接而非数学表达式原貌**) |
| 4b | jsPDF.text() 写入(中文再丢一次) | [App.tsx:1901](App.tsx#L1901):`pdf.text(pdf.splitTextToSize(cleanHtmlToText(anno.text), ...), xPos + 10, yPos + ...)` + §5 结论(无中文字体) | ✅ 拍平后的纯文本字符串若含中文,WinAnsi 编码导致 mojibake |

**链路与任务包描述完全一致。** 无异常发现。

---

## §9 异常发现

**无。** 全部 8 节侦察按任务清单顺利完成,代码与任务包预期一致,无须停下报告。

唯一边角观察(不算异常):

- handleExportPDF 整段写成单行紧凑 JS(line 1900-1901 共 1500+ 字符),阅读性极差,但功能逻辑与任务包描述一致——此为代码风格问题,与本任务 bug 因果链无关。
- `SlideAnnotation.height` 创建默认 120([App.tsx:1833](App.tsx#L1833))与导出 fallback 100([App.tsx:1901](App.tsx#L1901))不一致,但因为创建路径永远会写入 120,fallback 100 在实际执行中不会触发,**非 bug**。

---

> 报告完毕。零代码改动、零 git 操作、零构建。等待外部 Claude 与用户拍板修复策略。
