/**
 * 导出笔记版 PDF — 屏幕外 html2canvas 渲染 + jsPDF 嵌图。
 *
 * 设计要点(基于 EXPORT_PDF_RECON 侦察):
 * - 旧实现用 jsPDF.text() 直接画文字 → 中文 mojibake + HTML 格式全丢。新实现走"截图路线"。
 * - 屏幕外创建一个 stage div(position: fixed; left: -10000px),内部完整复刻
 *   SlideViewer 的视觉:顶部横幅 + 幻灯片图 + position:absolute 便签
 * - 等图片加载 + document.fonts.ready + 50ms 缓冲,确保 KaTeX webfont 稳定
 * - html2canvas → JPEG dataURL → jsPDF addImage
 * - 单位:CSS 像素 → PT(1px = 0.75pt at 96dpi)
 *
 * Step 2 阶段:仅实现 exportSingleSlideToPdf(单页);Step 3 起扩到 exportFullDeck。
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { Slide, SlideAnnotation } from '@/types';

console.log('🎯 NEW_EXPORT_CODE_LOADED', new Date().toISOString());

interface PageInfo {
  /** 1-based 当前页码 */
  current: number;
  /** 幻灯片总数 */
  total: number;
  /** 显示在横幅里的文件名(不带扩展名也可) */
  fileName: string;
}

const STAGE_WIDTH = 1280;
const CANVAS_SCALE = 1.5;
const JPEG_QUALITY = 0.85;
const PX_TO_PT = 0.75; // 1 CSS px = 0.75 pt at 96dpi

/**
 * 便签底部呼吸空间(px) — 沉浸模式 mb-20 = 5rem ≈ 80px,这里取 40 偏紧凑
 */
const BOTTOM_PADDING = 40;
/**
 * 便签 wrapper 上的 transform: translate(-5px, -5px) 偏移(px)
 * 算最大底部时减掉这个,避免高估
 */
const TRANSFORM_Y_OFFSET = 5;

/**
 * 用 SlideAnnotation 字段构造与 SlideViewer 视觉一致的便签 div。
 * 三层结构精确对齐 SlideViewer.tsx:404-512 的非编辑态便签:
 *   层 1 wrapper(SlideViewer:404-422)定位+视觉外壳+flex column
 *   层 2 middle(SlideViewer:466-476)padding+字体设置
 *   层 3 inner(SlideViewer:500-510)white-space: pre-wrap + innerHTML
 *
 * 与 SlideViewer 的两处刻意偏离(导出场景所必需):
 *   - wrapper 用 min-height 而非固定 height,让长文便签自然撑高
 *   - middle/inner 用 overflow: visible 而非 SlideViewer 的 overflow-auto
 *     (SlideViewer 用 auto 是为了让 box 不变形+内部滚动;
 *      导出场景需要文字完整渲染,html2canvas 才能截到)
 *
 * box-sizing 统一 border-box —— SlideViewer 通过 Tailwind preflight 全局 border-box,
 * 这里显式声明以保证 html2canvas clone iframe 内行为一致(iframe 不继承 preflight)。
 */
function buildAnnotationElement(a: SlideAnnotation): HTMLElement {
  // ─── 层 1:外层 wrapper(SlideViewer.tsx:404-422 对齐) ───
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = `${a.x}%`;
  wrapper.style.top = `${a.y}%`;
  wrapper.style.width = `${a.width ?? 240}px`;
  wrapper.style.minHeight = `${a.height ?? 120}px`; // ← min-height 替代固定 height
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.backgroundColor = 'rgba(255, 252, 235, 0.95)';
  wrapper.style.border = '1px solid rgba(253, 230, 138, 0.5)'; // amber-200/50
  wrapper.style.borderRadius = '0.5rem'; // rounded-lg
  wrapper.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)'; // shadow-lg
  wrapper.style.backdropFilter = 'blur(4px)'; // backdrop-blur-sm(html2canvas 可能忽略,可接受)
  wrapper.style.transform = 'translate(-5px, -5px)';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.overflow = 'visible';

  // ─── 层 2:middle 内容(SlideViewer.tsx:466-476 对齐) ───
  const middle = document.createElement('div');
  middle.style.width = '100%';
  middle.style.padding = '12px'; // p-3
  middle.style.boxSizing = 'border-box';
  middle.style.fontSize = `${a.fontSize ?? 14}px`;
  middle.style.color = a.color ?? '#111827';
  middle.style.fontWeight = a.isBold ? 'bold' : 'normal';
  middle.style.lineHeight = '1.5';
  middle.style.overflowWrap = 'break-word';
  middle.style.wordBreak = 'break-word';
  middle.style.overflow = 'visible'; // 导出偏离:SlideViewer 用 overflow-auto
  wrapper.appendChild(middle);

  // ─── 层 3:inner innerHTML 渲染(SlideViewer.tsx:500-510 对齐) ───
  const inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.boxSizing = 'border-box';
  inner.style.whiteSpace = 'pre-wrap'; // 关键:保留字面 \n 与连续空格
  inner.style.wordBreak = 'break-word';
  inner.style.overflowWrap = 'break-word';
  inner.style.overflow = 'visible'; // 导出偏离:SlideViewer 用 overflow: auto
  inner.innerHTML = a.text || '';
  middle.appendChild(inner);

  return wrapper;
}

async function waitForImageLoad(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return;
  return new Promise((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve(); // 失败也 resolve,避免卡死(html2canvas 后续会拿到一张空白图片,导出仍能完成)
  });
}

/** 屏幕外搭 stage:返回构建好的 stage 元素(已 append 到 document.body) */
async function buildStage(
  slide: Slide,
  annotations: SlideAnnotation[],
  pageInfo: PageInfo
): Promise<HTMLElement> {
  const stage = document.createElement('div');
  stage.id = 'pdf-export-stage';
  stage.style.position = 'fixed';
  stage.style.left = '-10000px';
  stage.style.top = '0';
  stage.style.width = `${STAGE_WIDTH}px`;
  stage.style.backgroundColor = '#ffffff';
  // 用本地中文字体兜底(便签里的中文不依赖远程 webfont)
  stage.style.fontFamily = `'Nunito', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif`;
  stage.style.overflow = 'visible';

  // ─── 顶部横幅 ───
  const banner = document.createElement('div');
  banner.style.width = '100%';
  banner.style.padding = '10px 20px';
  banner.style.boxSizing = 'border-box';
  banner.style.backgroundColor = '#FDFBF9';
  banner.style.borderBottom = '1px solid #F4EFEB';
  banner.style.fontSize = '14px';
  banner.style.color = '#475569';
  banner.style.fontWeight = '600';
  banner.textContent = `Page ${pageInfo.current} / ${pageInfo.total} · ${pageInfo.fileName}`;
  stage.appendChild(banner);

  // ─── 幻灯片容器(position: relative,允许便签绝对定位) ───
  const slideBox = document.createElement('div');
  slideBox.style.position = 'relative';
  slideBox.style.width = '100%';
  slideBox.style.overflow = 'visible'; // 便签 y>100% 时允许溢出
  stage.appendChild(slideBox);

  // ─── 幻灯片图 ───
  const img = document.createElement('img');
  img.src = slide.imageUrl;
  img.style.display = 'block';
  img.style.width = '100%';
  img.style.height = 'auto';
  slideBox.appendChild(img);

  // ─── 便签(收集 wrapper 引用,后面用 offsetHeight 测真实高度) ───
  const annotationWrappers: HTMLElement[] = [];
  for (const anno of annotations) {
    const w = buildAnnotationElement(anno);
    slideBox.appendChild(w);
    annotationWrappers.push(w);
  }

  document.body.appendChild(stage);

  // 1. 等图片真正加载(失败也 resolve,避免卡死)
  await waitForImageLoad(img);

  // 2. 等 webfont(KaTeX / Nunito / Quicksand 等)就绪 — 必须在测 offsetHeight 之前
  //    否则 KaTeX 公式排版未稳定,wrapper.offsetHeight 不准
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // 3. 撑高 slideBox 包住所有便签(含 overflow-visible 撑出的长文)
  //    此前公式用 a.height 字段,但 wrapper 用了 min-height + overflow-visible,
  //    实际渲染高度可能远超 a.height → 必须读 wrapper.offsetHeight
  const imgRenderedHeight = img.offsetHeight;
  const maxAnnotationBottom = annotations.reduce((max, a, i) => {
    const wrapperEl = annotationWrappers[i];
    const topPx = (a.y / 100) * imgRenderedHeight;
    const realHeightPx = wrapperEl.offsetHeight; // ← 关键:真实渲染高度
    const bottomPx = topPx + realHeightPx - TRANSFORM_Y_OFFSET;
    return Math.max(max, bottomPx);
  }, imgRenderedHeight);
  const slideBoxHeight = Math.max(imgRenderedHeight, maxAnnotationBottom + BOTTOM_PADDING);
  slideBox.style.height = `${slideBoxHeight}px`;

  // 4. 50ms 缓冲让 layout 稳定后再交给 html2canvas
  await new Promise((r) => setTimeout(r, 50));

  return stage;
}

/**
 * 导出当前选中的单张幻灯片(含便签)为 PDF。
 * Step 2 阶段使用,Step 3 起改走 exportFullDeck。
 */
export async function exportSingleSlideToPdf(
  slide: Slide,
  annotations: SlideAnnotation[],
  fileName: string,
  pageInfo: PageInfo
): Promise<void> {
  console.log('🎯 exportSingleSlideToPdf CALLED at', new Date().toISOString());
  const stage = await buildStage(slide, annotations, pageInfo);

  try {
    const canvas = await html2canvas(stage, {
      scale: CANVAS_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

    // 逻辑像素 = canvas 像素 / scale(canvas 是 scale 后的高分图,PDF 页用逻辑尺寸)
    const logicalWidthPx = canvas.width / CANVAS_SCALE;
    const logicalHeightPx = canvas.height / CANVAS_SCALE;
    const pdfWidthPt = logicalWidthPx * PX_TO_PT;
    const pdfHeightPt = logicalHeightPx * PX_TO_PT;

    const pdf = new jsPDF({
      orientation: pdfWidthPt > pdfHeightPt ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [pdfWidthPt, pdfHeightPt],
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthPt, pdfHeightPt, undefined, 'FAST');
    pdf.save(`${fileName || 'study-notes'}_annotated.pdf`);
  } finally {
    if (stage.parentNode) {
      stage.parentNode.removeChild(stage);
    }
  }
}
