import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { AnnotationCache, PageCommentsCache, Slide, SlideAnnotation, SlidePageComment } from '@/types';

interface ExportStudyHandoutPdfOptions {
  slides: Slide[];
  annotations: AnnotationCache;
  pageComments: PageCommentsCache;
  fileName?: string | null;
}

const EXPORT_WIDTH = 1280;
const PAGE_PADDING = 48;
const SLIDE_MAX_WIDTH = 1060;
const SLIDE_MAX_HEIGHT = 720;
const MIN_PAGE_HEIGHT = 900;
const RENDER_SCALE = 1.5;

const sanitizeFileName = (name: string): string => (
  name.replace(/\.[Pp][Dd][Ff]$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'study-handout'
);

const normalizeAnnotationHtml = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/&lt;br\s*\/?&gt;/gi, '<br />')
    .replace(/<br\s*\/?>/gi, '<br />');
};

type HandoutInlineKind = 'text' | 'strong' | 'term' | 'code';

interface HandoutInlineChunk {
  text: string;
  kind: HandoutInlineKind;
}

type HandoutBlock =
  | { type: 'paragraph'; chunks: HandoutInlineChunk[]; tone?: 'heading' | 'quote' }
  | { type: 'list'; ordered: boolean; items: HandoutInlineChunk[][] }
  | { type: 'table'; rows: HandoutInlineChunk[][][] };

const getCompactText = (text: string | null | undefined): string => (
  (text || '').replace(/\s+/g, ' ').trim()
);

const isShortTermHighlight = (text: string): boolean => (
  text.length > 0 &&
  text.length <= 24 &&
  !/[。！？.!?；;，,：:()[\]{}（）【】]/.test(text)
);

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl',
  'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'header', 'hr',
  'main', 'nav', 'p', 'pre', 'section',
]);

const isElementNode = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;

const normalizeTextRun = (text: string): string => (
  text.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ')
);

const pushInlineChunk = (
  chunks: HandoutInlineChunk[],
  text: string,
  kind: HandoutInlineKind,
) => {
  if (!text.trim()) return;

  const previous = chunks[chunks.length - 1];
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }

  chunks.push({ text, kind });
};

const appendInlineChunk = (
  chunks: HandoutInlineChunk[],
  text: string,
  kind: HandoutInlineKind = 'text',
) => {
  const normalized = normalizeTextRun(text);
  if (!normalized.trim()) return;

  if (kind !== 'text') {
    pushInlineChunk(chunks, normalized.replace(/\*\*(.*?)\*\*/g, '$1'), kind);
    return;
  }

  const boldPattern = /\*\*(.*?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(normalized)) !== null) {
    if (match.index > cursor) {
      pushInlineChunk(chunks, normalized.slice(cursor, match.index), 'text');
    }
    pushInlineChunk(chunks, match[1], 'strong');
    cursor = match.index + match[0].length;
  }

  if (cursor < normalized.length) {
    pushInlineChunk(chunks, normalized.slice(cursor), 'text');
  }
};

const trimInlineChunks = (chunks: HandoutInlineChunk[]): HandoutInlineChunk[] => {
  const normalized = chunks
    .map((chunk) => ({ ...chunk }))
    .filter((chunk) => chunk.text.trim().length > 0);

  if (normalized.length === 0) return [];

  normalized[0].text = normalized[0].text.trimStart();
  normalized[normalized.length - 1].text = normalized[normalized.length - 1].text.trimEnd();

  return normalized.reduce<HandoutInlineChunk[]>((acc, chunk) => {
    if (!chunk.text) return acc;
    const previous = acc[acc.length - 1];
    if (previous?.kind === chunk.kind) {
      previous.text += chunk.text;
    } else {
      acc.push(chunk);
    }
    return acc;
  }, []);
};

const getElementInlineKind = (
  element: HTMLElement,
  inherited: HandoutInlineKind,
): HandoutInlineKind => {
  const tag = element.tagName.toLowerCase();
  const className = element.getAttribute('class') || '';
  const style = element.getAttribute('style') || '';
  const text = getCompactText(element.textContent);
  const looksLikeHighlight = /(bg-|text-indigo|font-bold|font-semibold|font-extrabold|background|font-weight|color:)/i
    .test(`${className} ${style}`);

  if ((looksLikeHighlight || tag === 'mark') && isShortTermHighlight(text)) {
    return 'term';
  }

  if (tag === 'strong' || tag === 'b') return 'strong';
  if (tag === 'code' || tag === 'kbd') return 'code';
  if (tag === 'em' || tag === 'i') return 'strong';

  return inherited;
};

const collectInlineChunks = (
  node: Node,
  inherited: HandoutInlineKind = 'text',
): HandoutInlineChunk[] => {
  const chunks: HandoutInlineChunk[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    appendInlineChunk(chunks, node.textContent || '', inherited);
    return trimInlineChunks(chunks);
  }

  if (!isElementNode(node)) return chunks;

  const tag = node.tagName.toLowerCase();
  if (tag === 'br') {
    appendInlineChunk(chunks, ' ', inherited);
    return trimInlineChunks(chunks);
  }

  const nextKind = getElementInlineKind(node, inherited);
  node.childNodes.forEach((child) => {
    collectInlineChunks(child, nextKind).forEach((chunk) => appendInlineChunk(chunks, chunk.text, chunk.kind));
  });

  return trimInlineChunks(chunks);
};

const pushParagraphBlock = (
  blocks: HandoutBlock[],
  chunks: HandoutInlineChunk[],
  tone?: 'heading' | 'quote',
) => {
  const trimmed = trimInlineChunks(chunks);
  if (trimmed.length > 0) blocks.push({ type: 'paragraph', chunks: trimmed, tone });
};

const getDirectListItems = (element: HTMLElement): HTMLElement[] => (
  Array.from(element.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement && child.tagName.toLowerCase() === 'li'
  ))
);

const parseListBlock = (element: HTMLElement, ordered: boolean): HandoutBlock | null => {
  const items = getDirectListItems(element)
    .map((item) => trimInlineChunks(collectInlineChunks(item)))
    .filter((item) => item.length > 0);

  return items.length > 0 ? { type: 'list', ordered, items } : null;
};

const parseTableBlock = (element: HTMLElement): HandoutBlock | null => {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map((row) => (
      Array.from(row.children)
        .filter((cell): cell is HTMLElement => cell instanceof HTMLElement && ['td', 'th'].includes(cell.tagName.toLowerCase()))
        .map((cell) => trimInlineChunks(collectInlineChunks(cell)))
    ))
    .filter((row) => row.length > 0);

  return rows.length > 0 ? { type: 'table', rows } : null;
};

const parseBlocksFromNodes = (nodes: NodeListOf<ChildNode> | ChildNode[]): HandoutBlock[] => {
  const blocks: HandoutBlock[] = [];
  const paragraph: HandoutInlineChunk[] = [];

  const flushParagraph = () => {
    pushParagraphBlock(blocks, paragraph);
    paragraph.splice(0, paragraph.length);
  };

  Array.from(nodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        appendInlineChunk(paragraph, line);
        if (index < lines.length - 1) flushParagraph();
      });
      return;
    }

    if (!isElementNode(node)) return;

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') {
      flushParagraph();
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      flushParagraph();
      const list = parseListBlock(node, tag === 'ol');
      if (list) blocks.push(list);
      return;
    }

    if (tag === 'table') {
      flushParagraph();
      const table = parseTableBlock(node);
      if (table) blocks.push(table);
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      flushParagraph();
      pushParagraphBlock(blocks, collectInlineChunks(node), 'heading');
      return;
    }

    if (tag === 'blockquote') {
      flushParagraph();
      const quoteChunks = trimInlineChunks(collectInlineChunks(node));
      if (quoteChunks.length > 0) blocks.push({ type: 'paragraph', chunks: quoteChunks, tone: 'quote' });
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      flushParagraph();
      parseBlocksFromNodes(Array.from(node.childNodes)).forEach((block) => blocks.push(block));
      return;
    }

    collectInlineChunks(node).forEach((chunk) => appendInlineChunk(paragraph, chunk.text, chunk.kind));
  });

  flushParagraph();
  return blocks;
};

const parseAnnotationBlocks = (html: string): HandoutBlock[] => {
  const container = document.createElement('div');
  container.innerHTML = normalizeAnnotationHtml(html);

  const blocks = parseBlocksFromNodes(Array.from(container.childNodes));
  if (blocks.length > 0) return blocks;

  const fallback = getCompactText(container.textContent);
  return fallback ? [{ type: 'paragraph', chunks: [{ text: fallback, kind: 'text' }] }] : [];
};

const appendInlineChunksToElement = (root: HTMLElement, chunks: HandoutInlineChunk[]) => {
  chunks.forEach((chunk) => {
    const tag = chunk.kind === 'strong' ? 'strong' : chunk.kind === 'code' ? 'code' : 'span';
    const el = document.createElement(tag);
    el.textContent = chunk.text;
    if (chunk.kind === 'term') el.className = 'study-handout-term';
    root.appendChild(el);
  });
};

const appendHandoutBlocks = (root: HTMLElement, blocks: HandoutBlock[]) => {
  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      paragraph.className = block.tone ? `study-handout-note-paragraph study-handout-note-${block.tone}` : 'study-handout-note-paragraph';
      appendInlineChunksToElement(paragraph, block.chunks);
      root.appendChild(paragraph);
      return;
    }

    if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      list.className = 'study-handout-note-list';
      block.items.forEach((item) => {
        const listItem = document.createElement('li');
        appendInlineChunksToElement(listItem, item);
        list.appendChild(listItem);
      });
      root.appendChild(list);
      return;
    }

    const tableWrap = document.createElement('div');
    tableWrap.className = 'study-handout-table-wrap';
    const table = document.createElement('table');
    table.className = 'study-handout-note-table';
    block.rows.forEach((row, rowIndex) => {
      const tableRow = document.createElement('tr');
      row.forEach((cell) => {
        const tag = rowIndex === 0 ? 'th' : 'td';
        const tableCell = document.createElement(tag);
        appendInlineChunksToElement(tableCell, cell);
        tableRow.appendChild(tableCell);
      });
      table.appendChild(tableRow);
    });
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);
  });
};

const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const loadImageSize = (src: string): Promise<{ width: number; height: number }> => (
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('Slide image failed to load'));
    img.src = src;
  })
);

const createText = (tag: keyof HTMLElementTagNameMap, text: string, className?: string) => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};

const appendStyles = (root: HTMLElement) => {
  const style = document.createElement('style');
  style.textContent = `
    .study-handout-page {
      width: ${EXPORT_WIDTH}px;
      min-height: ${MIN_PAGE_HEIGHT}px;
      padding: ${PAGE_PADDING}px;
      box-sizing: border-box;
      background: #fffaf2;
      color: #172033;
      font-family: "Nunito", "Quicksand", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .study-handout-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 22px;
      border-bottom: 2px solid #e7edf5;
      margin-bottom: 26px;
    }
    .study-handout-eyebrow {
      font-size: 18px;
      font-weight: 900;
      color: #5d6d85;
      margin-bottom: 8px;
    }
    .study-handout-title {
      font-size: 34px;
      line-height: 1.18;
      font-weight: 950;
      color: #0f172a;
      max-width: 840px;
      word-break: break-word;
    }
    .study-handout-page-badge {
      flex: 0 0 auto;
      border-radius: 999px;
      border: 2px solid #d8e1ee;
      background: #ffffff;
      padding: 12px 18px;
      font-size: 18px;
      font-weight: 900;
      color: #53647d;
    }
    .study-handout-slide-wrap {
      border-radius: 22px;
      border: 2px solid #e1e8f2;
      background: #e8ebf0;
      padding: 28px;
      display: flex;
      justify-content: center;
      align-items: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }
    .study-handout-slide {
      display: block;
      background: #ffffff;
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
    }
    .study-handout-section {
      margin-top: 28px;
    }
    .study-handout-section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 22px;
      font-weight: 950;
      color: #111827;
      margin-bottom: 16px;
    }
    .study-handout-note-card {
      border-radius: 18px;
      border: 2px solid #fde68a;
      background: #fffbeb;
      padding: 22px 24px;
      margin-bottom: 18px;
      box-shadow: 0 12px 26px rgba(180, 83, 9, 0.10);
      overflow: visible;
    }
    .study-handout-comment-card {
      border-color: #dbe4ef;
      background: #ffffff;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
    }
    .study-handout-card-label {
      font-size: 15px;
      line-height: 1;
      font-weight: 950;
      color: #b45309;
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }
    .study-handout-comment-card .study-handout-card-label {
      color: #64748b;
    }
    .study-handout-note-body {
      font-size: 20px;
      line-height: 1.7;
      font-weight: 700;
      color: #27364d;
      white-space: normal;
      overflow-wrap: break-word;
      word-break: normal;
      line-break: auto;
    }
    .study-handout-note-body b,
    .study-handout-note-body strong {
      display: inline;
      color: #312e81;
      background: transparent;
      border-radius: 0;
      padding: 0;
      font-weight: 950;
      white-space: normal;
    }
    .study-handout-note-body .study-handout-term {
      display: inline;
      color: #312e81;
      background: linear-gradient(to top, rgba(253, 224, 71, 0.56) 0 38%, transparent 38%);
      border-radius: 0;
      padding: 0 2px;
      font-weight: 950;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      white-space: normal;
    }
    .study-handout-note-body code {
      border-radius: 6px;
      background: rgba(226, 232, 240, 0.85);
      padding: 0 5px;
      color: #334155;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }
    .study-handout-note-paragraph {
      margin: 0 0 14px;
    }
    .study-handout-note-paragraph:last-child {
      margin-bottom: 0;
    }
    .study-handout-note-heading {
      color: #1e1b4b;
      font-size: 1.08em;
      font-weight: 950;
      margin-top: 6px;
    }
    .study-handout-note-quote {
      border-left: 5px solid #c4b5fd;
      padding-left: 14px;
      color: #475569;
    }
    .study-handout-note-list {
      margin: 12px 0 12px 30px;
      padding: 0;
    }
    .study-handout-note-list li {
      margin: 8px 0;
    }
    .study-handout-table-wrap {
      max-width: 100%;
      overflow: hidden;
      border-radius: 12px;
      margin: 12px 0;
      background: rgba(255,255,255,0.72);
    }
    .study-handout-note-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 0.9em;
      line-height: 1.55;
    }
    .study-handout-note-table th,
    .study-handout-note-table td {
      border-bottom: 1px solid #e7d9a9;
      padding: 14px 16px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .study-handout-note-table th {
      background: rgba(248, 250, 252, 0.92);
      color: #3f3f46;
      font-weight: 950;
    }
    .study-handout-note-table tr:last-child td {
      border-bottom: 0;
    }
    .study-handout-empty {
      border-radius: 16px;
      border: 2px dashed #d8e1ee;
      background: rgba(255,255,255,0.6);
      padding: 24px;
      color: #8390a3;
      font-size: 18px;
      font-weight: 800;
      text-align: center;
    }
    .study-handout-comment-card .study-handout-note-body {
      white-space: pre-line;
    }
  `;
  root.appendChild(style);
};

const appendAnnotationCard = (root: HTMLElement, annotation: SlideAnnotation, index: number) => {
  const card = document.createElement('section');
  card.className = 'study-handout-note-card';

  card.appendChild(createText('div', `便签 ${index + 1}`, 'study-handout-card-label'));

  const body = document.createElement('div');
  body.className = 'study-handout-note-body';
  body.style.fontSize = `${Math.max(17, Math.min(23, (annotation.fontSize || 14) + 4))}px`;
  body.style.fontWeight = annotation.isBold ? '850' : '700';
  appendHandoutBlocks(body, parseAnnotationBlocks(annotation.text));
  card.appendChild(body);

  root.appendChild(card);
};

const appendCommentCard = (root: HTMLElement, comment: SlidePageComment, index: number) => {
  const card = document.createElement('section');
  card.className = 'study-handout-note-card study-handout-comment-card';
  card.appendChild(createText('div', `本页注释 ${index + 1}`, 'study-handout-card-label'));

  const body = document.createElement('div');
  body.className = 'study-handout-note-body';
  body.textContent = comment.text;
  card.appendChild(body);

  root.appendChild(card);
};

const buildHandoutPage = async (
  slide: Slide,
  slideIndex: number,
  totalSlides: number,
  fileName: string,
  annotations: SlideAnnotation[],
  comments: SlidePageComment[],
): Promise<HTMLElement> => {
  const { width: imageWidth, height: imageHeight } = await loadImageSize(slide.imageUrl);
  const slideScale = Math.min(SLIDE_MAX_WIDTH / imageWidth, SLIDE_MAX_HEIGHT / imageHeight);
  const slideWidth = Math.round(imageWidth * slideScale);
  const slideHeight = Math.round(imageHeight * slideScale);

  const page = document.createElement('div');
  page.className = 'study-handout-page';
  appendStyles(page);

  const header = document.createElement('header');
  header.className = 'study-handout-header';
  const headerText = document.createElement('div');
  headerText.appendChild(createText('div', fileName, 'study-handout-eyebrow'));
  headerText.appendChild(createText('div', `第 ${slide.pageNumber || slideIndex + 1} 页复习讲义`, 'study-handout-title'));
  header.appendChild(headerText);
  header.appendChild(createText('div', `${slideIndex + 1} / ${totalSlides}`, 'study-handout-page-badge'));
  page.appendChild(header);

  const slideWrap = document.createElement('section');
  slideWrap.className = 'study-handout-slide-wrap';
  const img = document.createElement('img');
  img.className = 'study-handout-slide';
  img.src = slide.imageUrl;
  img.style.width = `${slideWidth}px`;
  img.style.height = `${slideHeight}px`;
  slideWrap.appendChild(img);
  page.appendChild(slideWrap);

  const sortedAnnotations = annotations
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const sortedComments = comments
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const section = document.createElement('section');
  section.className = 'study-handout-section';
  section.appendChild(createText('div', '本页便签 / 注释', 'study-handout-section-title'));

  if (sortedAnnotations.length === 0 && sortedComments.length === 0) {
    section.appendChild(createText('div', '这一页还没有便签。', 'study-handout-empty'));
  } else {
    sortedAnnotations.forEach((annotation, index) => appendAnnotationCard(section, annotation, index));
    sortedComments.forEach((comment, index) => appendCommentCard(section, comment, index));
  }

  page.appendChild(section);
  return page;
};

export async function exportStudyHandoutPdf({
  slides,
  annotations,
  pageComments,
  fileName,
}: ExportStudyHandoutPdfOptions) {
  if (slides.length === 0) return;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${EXPORT_WIDTH}px`;
  host.style.background = '#fffaf2';
  document.body.appendChild(host);

  let pdf: jsPDF | null = null;

  try {
    if (document.fonts?.ready) await document.fonts.ready;

    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      host.innerHTML = '';
      const page = await buildHandoutPage(
        slide,
        i,
        slides.length,
        sanitizeFileName(fileName || 'study-handout'),
        annotations[slide.id] || [],
        pageComments[slide.id] || [],
      );
      host.appendChild(page);
      await waitForFrame();

      const canvas = await html2canvas(page, {
        backgroundColor: '#fffaf2',
        scale: RENDER_SCALE,
        useCORS: true,
      });
      const pageWidth = EXPORT_WIDTH;
      const pageHeight = Math.max(MIN_PAGE_HEIGHT, Math.ceil(canvas.height / RENDER_SCALE));
      const image = canvas.toDataURL('image/jpeg', 0.94);
      const orientation = pageWidth >= pageHeight ? 'landscape' : 'portrait';

      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'px', format: [pageWidth, pageHeight] });
      } else {
        pdf.addPage([pageWidth, pageHeight], orientation);
      }
      pdf.addImage(image, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }

    pdf?.save(`${sanitizeFileName(fileName || 'study-handout')}_复习讲义版.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
