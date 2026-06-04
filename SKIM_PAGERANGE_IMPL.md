# SKIM_PAGERANGE_IMPL — 略读模式「页码范围选择」实现报告

> 基于 `SKIM_PAGERANGE_RECON.md` 的侦察结论实施。走 **PDF 原件裁剪路**：用户填「第 X–Y 页」时，把原 PDF 的这几页用 pdf-lib 抽出来另存为小 PDF，替代整本喂给略读 AI；module 切分、节奏、studyMap 重算逻辑一字未动。
> 全程加法、未重写既有逻辑。未做任何 git 操作、未 commit。

---

## 一、改了哪些文件

| 文件 | 改动性质 | 摘要 |
|---|---|---|
| `package.json` / `package-lock.json` | 新增依赖 | `npm install pdf-lib`（原本没有，见岔路①） |
| `lib/pdf/pdfUtils.ts` | 新增函数 | `extractPdfPageRange(input, start, end)` 按页裁 PDF |
| `features/reader/skim/SkimPanel.tsx` | 新增 state / 子组件 / 接线 | 页码输入 UI（两处复用）+ 启动时裁剪 |
| `App.tsx` | 新增 1 个 prop | `totalPages={slides.length}` 传给 SkimPanel |

---

## 二、逐处改动

### 1. `lib/pdf/pdfUtils.ts`（阶段 1）
- 顶部新增 `import { PDFDocument } from 'pdf-lib';`。
- 新增 `extractPdfPageRange(input: string, startPage: number, endPage: number): Promise<string>`：
  - **输入**：base64 data URL（即现有 `pdfDataUrl` 格式）或纯 base64 字符串。`atob` 解码 → `Uint8Array` → `PDFDocument.load`。
  - **裁剪**：`copyPages` 取 1-based 含两端的页（转 0-based 给 pdf-lib），`addPage` 进新文档。
  - **输出**：`outDoc.save()` → 分块 `btoa` → 返回 `data:application/pdf;base64,...`，与现有 `pdfDataUrl` **完全同格式**，下游 `getContentPart` 的 PDF 分支零改动即可识别（[geminiService.ts:40-55]）。
  - **边界**：`start<1`→取 1；`end>总页数`→取总页数；`start>end`→**交换**（不抛错）；起点也越界→收敛到末页。

### 2. `features/reader/skim/SkimPanel.tsx`（阶段 2 + 3）
- **import**：`readFileAsDataURL` 旁加 `extractPdfPageRange`。
- **Props**：新增可选 `totalPages?: number`（= `slides.length`），用于页码上限校验。
- **新增模块级纯函数 `getPageRangeError(start, end, totalPages)`**：返回错误文案或 `null`。规则：两端皆空＝全本（合法）；只填一个→报错；非整数 / <1 →报错；有 `totalPages` 时超上限→报错；`start>end`→报错。
- **新增模块级子组件 `PageRangeInput`**（阶段 2 要求的共用子组件）：两个 number 输入 + 行内错误提示，靠 `idPrefix` 隔离 input id，在两处复用。
- **新增 state**：`pageRangeStart` / `pageRangeEnd`（`number|null`，默认 `null`＝全本）；派生 `pageRangeError`。**不持久化**，与 `selectedModuleCount`/`skimPace` 同待遇（不进 `filePersistedSnapshot`、不进 App）。
- **`handleSend`**：新增第 5 个可选参数 `contentOverride?: string`；内部 `const content = contentOverride ?? (pdfDataUrl || fullText);`。无 override 时与原行为逐字一致。
- **`startFormalReading`**：启动前若 `pageRangeStart/End` 都填、无校验错、且 `pdfDataUrl` 是 PDF，则 `await extractPdfPageRange(pdfDataUrl, start, end)` 得到小 PDF 作 `contentOverride` 传给 `handleSend`；裁剪抛错则静默回退整本。两端为空→`contentOverride` 为 `undefined`→走原全本逻辑。
- **`handleStartWithModuleCount`**：顶部加 `if (pageRangeError) return;` 双保险。
- **两处配置区 UI**：Quiz 内联块、跳过弹窗各插入一个 `<PageRangeInput>`（`idPrefix` 分别为 `skim-quiz` / `skim-modal`），并给「开始领读」按钮加 `disabled={!!pageRangeError}` + 灰显样式。

### 3. `App.tsx`（阶段 2 支撑）
- SkimPanel 渲染处新增一行 `totalPages={slides.length}`（加法，未动其它 prop）。

---

## 三、岔路与决策（要求专门留痕）

**岔路①：pdf-lib 是否已有？**
→ `package.json` 检查：**没有**。按任务授权直接 `npm install pdf-lib`（added 5 packages）。**新增了 pdf-lib 依赖。** 选 pdf-lib 而非用 pdf.js 重新渲染：pdf.js 没有「重组/另存 PDF」能力，只能渲染成图片（会丢矢量文字、体积大、且偏离「PDF 原件路」的抗幻觉初衷）；pdf-lib 是按页 copy 的标准做法，输出仍是真 PDF。

**岔路②：`extractPdfPageRange` 的 `input` 用 File 还是 base64？**
→ 选 **base64 data URL 字符串**。理由：阶段 3 决定优先复用 SkimPanel 现有的 `pdfDataUrl`（base64），不引入 File prop（见岔路④）；两阶段接口因此对齐——pdf-lib 从 `atob` 解码的 `Uint8Array` 载入，不需要 File。函数同时容忍「带 `data:` 前缀」和「纯 base64」两种入参，更健壮。

**岔路③：`start>end` 等非法边界——交换还是抛错？**
→ 底层 `extractPdfPageRange` **交换**（最宽容，永不因边界崩）；但 UI 层 `getPageRangeError` 对 `start>end` **报错并 disable 按钮**，所以正常路径根本到不了底层的交换分支。双层策略：UI 拦明显错误给用户清晰反馈，底层兜底保证即使被绕过也不崩。

**岔路④：SkimPanel 没有原始 File，怎么拿内容裁剪？**
→ 按任务「优先方案」：**直接用现有 `pdfDataUrl`（base64）喂 pdf-lib**，不新增 File prop。`startFormalReading` 里 `pdfDataUrl?.startsWith('data:application/pdf')` 守卫确保只对 PDF 生效；非 PDF（图片上传 / 纯文本）时不裁剪，走全本原逻辑。**未新增 File prop。**

**岔路⑤：总页数能否拿到、是否做上限校验？**
→ RECON 说 `slides.length`＝总页数，但它在 App、SkimPanel 原本拿不到。按「偏好加法」**新增了一个 `totalPages` prop**（`slides.length`）传入 → **做了上限校验**（覆盖测试项 3 的「超总页数」）。这是一个纯加法 prop，零风险。（备选「不做上限校验」未采用，因为加 prop 成本极低且换来更好的 UX。）

**岔路⑥：页码范围要不要影响 studyMap 重算 / module 切分？**
→ **不影响**，严格遵循任务「studyMap 重算逻辑全不动」。`handleStartWithModuleCount` 里的 `onRegenerateStudyMap(selectedModuleCount)` 仍基于整本算（App 侧用 `pdfDataUrl||fullText`）。页码范围**只改「正式领读那一轮喂给 AI 的 content」**。
→ **留痕的副作用**：因此 studyMap 的前置知识 / 模块划分是按整本生成的，而正式领读内容只覆盖选中页——两者口径可能略有出入。这是任务明确要求（module/studyMap 逻辑不动）下的预期取舍，非缺陷。若日后要让 studyMap 也只看选中页，需另把 `contentOverride` 一路接到 `onRegenerateStudyMap`/`performPreFlightDiagnosis`，属后续工作。

**岔路⑦：持久化？**
→ 不做。任务明确「不持久化，跟 selectedModuleCount/skimPace 同待遇」。`pageRangeStart/End` 是纯组件内部 state，刷新即回到「全本」。

---

## 四、校验结果（阶段 4）

- `npx tsc --noEmit`：**10 个错误，与基线持平**，无新增、无 `Cannot find module`（pdf-lib 导入解析正常）。
- 全部 10 个错误均为改动前既有的基线错误（如 `App.tsx:1142`、`SkimPanel.tsx:1166` 的 `stage !== 'quiz'` 既有比较、各处 `import.meta.env`、`transcriptionService` 的 SpeechRecognition 等），与本次改动无关。
- 安装 pdf-lib 时 npm 报告若干既有 audit 漏洞（项目原有，与本次无关）。

---

## 五、给用户的测试清单

> 前提：在略读模式走到「配置区」（Quiz 答对后的内联块，或点「跳过测验/直接开始」弹出的弹窗），用一份 PDF。

1. **全本回归**：页码两个框都留空 → 点「开始领读」，行为与改动前**完全一致**（喂整本）。
2. **正常范围**：用 80+ 页的 PDF，填 `50`–`80` → 略读只针对这 30 页（AI 看到的就是裁出来的 30 页小 PDF）。
3. **非法值不崩**：
   - 填 `80`–`50`（起>止）→ 红字「起始页不能大于结束页」，按钮灰显不可点。
   - 填 `0`（或负数）→ 红字「页码需 ≥ 1」，按钮灰显。
   - 填超过总页数（如总 80 页填 `200`）→ 红字「页码不能超过总页数（80）」，按钮灰显。
   - 只填一个框 → 红字「请同时填写起始页和结束页」，按钮灰显。
4. **两入口一致**：走测验（答对后内联配置）与跳过测验（弹窗配置）两条路都能填页码、都能生效、校验表现一致。

额外可留意：填了合法范围后，上半区「学习地图 / 前置知识」仍是按整本生成的（见岔路⑥），这是预期行为。

---

## 六、未 commit

按要求未做任何 git 操作、未 commit。改动文件：`package.json`、`package-lock.json`、`lib/pdf/pdfUtils.ts`、`features/reader/skim/SkimPanel.tsx`、`App.tsx`，以及本报告 `SKIM_PAGERANGE_IMPL.md`。

---

## 七、修复记录（方案 A — 地图只覆盖选中页）

基于 `SKIM_SKIP_ENTRY_TRACE.md` 的三个断点修复「页码范围 + module 数量未生效」。用户决策：设了页码范围时，学习地图也只覆盖选中页，旧的整本/默认模块数地图不参与本次略读。

### 改了哪几处

**1. `features/reader/skim/SkimPanel.tsx`**
- **prop 签名**（根因 1）：`onRegenerateStudyMap` 新增第二参数接裁剪内容、返回新 map：
  ```ts
  // 旧：onRegenerateStudyMap?: (moduleCount: number) => Promise<void>;
  onRegenerateStudyMap?: (moduleCount: number, contentOverride?: string) => Promise<StudyMap | null>;
  ```
- **`handleStartWithModuleCount`**（根因 1）：调整顺序——**先裁剪**得到 `contentOverride`，再把它**同时**用于地图重算和领读；重算结果直接拿回 `freshMap`，不依赖 setState 后的闭包：
  ```ts
  // 先 extractPdfPageRange(...) → contentOverride
  freshMap = (await onRegenerateStudyMap?.(selectedModuleCount, contentOverride)) ?? studyMap;
  startFormalReading(contentOverride, freshMap);
  ```
- **`startFormalReading`**（根因 2）：改为接收参数，不再读组件 state 里可能过期的 `studyMap`：
  ```ts
  const startFormalReading = async (contentOverride?: string, effectiveMap?: StudyMap | null) => {
      setStage('reading');
      const mapToUse = effectiveMap ?? studyMap;   // 优先用传入的新 map
      await handleSend(..., 'reading',
        { moduleCount: selectedModuleCount, studyMapBriefing: mapToUse?.initialBriefing, skimPace },
        undefined, contentOverride);
  };
  ```
  这样 `studyMapBriefing`（新 7 模块、只覆盖选中页）、`moduleCount=7`、裁剪 PDF 三者一致，不再自相矛盾。
- **Quiz 回退按钮调用点**（根因 3 / 防回归）：`onClick={startFormalReading}` → `onClick={() => startFormalReading()}`。否则 `startFormalReading` 现在第一参是 `contentOverride`，原写法会把 `MouseEvent` 当裁剪内容传进去。
  - 另一调用点 `handleSkipToReading` 的 `startFormalReading()`（无 `onRegenerateStudyMap` 时）保持无参调用，参数可选、行为不变（回退当前 `studyMap`）。

**2. `App.tsx`**
- **`handleRegenerateStudyMap`**（根因 1）：新增 `contentOverride` 参数（优先于整本），并**返回新 map**：
  ```ts
  const handleRegenerateStudyMap = async (moduleCount: number, contentOverride?: string) => {
      const content = contentOverride || pdfDataUrl || fullPdfText;
      if (!content) return null;
      const map = await performPreFlightDiagnosis(content, { moduleCount });
      if (map) { setStudyMap(map); setStudyMapModuleCount(moduleCount); }
      return map;
  };
  ```

### 调用点对齐（全文 grep 核对）
- `startFormalReading`：3 处 —— `handleStartWithModuleCount`（传 `contentOverride, freshMap`）、`handleSkipToReading`（无参，合法）、Quiz 回退按钮（已包成 `() => startFormalReading()`）。
- `onRegenerateStudyMap` / `handleRegenerateStudyMap`：定义 + App 传 prop + `handleStartWithModuleCount` 调用，签名均已对齐（第二参 + 返回 `StudyMap | null`）。

### 走测验入口
两条入口（走测验 / 跳过测验）共用 `handleStartWithModuleCount` → `startFormalReading`，本次修复改的就是这两个共用函数，故一并修好；自测项 2/3 分别覆盖。

### 校验
- `npx tsc --noEmit`：**10 个错误，与基线持平**，无新增、无 `Cannot find module`。

### 自测清单（请用户跑）
1. 不填页码、用默认模块数 → 与修复前正常行为一致（回归）。
2. 233 页 PDF，跳过测验入口，填 148–188 + 7 模块 → 学习地图只列覆盖 148–188 的内容、模块页码在该区间、模块数=7、领读只讲这段。
3. 走测验入口，同样填 148–188 + 7 模块 → 同上。
4. 填了页码但模块数没变（`needRegenerate=false`）→ 领读内容仍是裁剪后的（`contentOverride` 在重算之外也照样传给 `startFormalReading`）。
5. `npx tsc --noEmit` 错误数维持基线 10。
