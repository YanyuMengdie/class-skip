/** Local PDF cropping only. No model calls and no fallback to the whole document. */
const crops = new Map<string, { document: string; pages: string; result: Promise<string> }>();

async function cropPages(document: string, pages: number[]): Promise<string> {
  const { PDFDocument } = await import('pdf-lib');
  const encoded = document.slice(document.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const source = await PDFDocument.load(bytes);
  if (pages.some(page => page > source.getPageCount())) throw new Error('Invalid source page');
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, pages.map(page => page - 1));
  copied.forEach(page => output.addPage(page));
  return output.saveAsBase64({ dataUri: true });
}

export async function prepareUnderstandingSource(input: {
  sessionId: string; documentContent: string; pageTexts?: string[]; pageRefs: number[];
}): Promise<{ source: string; instruction: string }> {
  const pages = [...new Set(input.pageRefs.filter(page => Number.isSafeInteger(page) && page > 0))].sort((a, b) => a - b);
  if (!pages.length) return { source: '', instruction: '当前知识点未定位到可靠的原文页码。本次未附原文，仅可围绕所选领读段落解释，必须说明原文尚未核对，不得引用或猜测页码。' };
  if (input.documentContent.startsWith('data:application/pdf;')) {
    const pageKey = pages.join(',');
    let cached = crops.get(input.sessionId);
    if (!cached || cached.document !== input.documentContent || cached.pages !== pageKey) {
      const result = cropPages(input.documentContent, pages);
      cached = { document: input.documentContent, pages: pageKey, result };
      if (crops.size >= 4) crops.delete(crops.keys().next().value!);
      crops.set(input.sessionId, cached);
    }
    try {
      const source = await cached.result;
      return { source, instruction: `附件仅含当前知识点明确引用的页面，用来核对所选段落，不是扩大讲解范围。裁剪后 PDF 页码与应用内原文页码的映射：${pages.map((page, index) => `${index + 1} → ${page}`).join('；')}。引用必须用应用内页码。` };
    } catch {
      if (crops.get(input.sessionId) === cached) crops.delete(input.sessionId);
      // If PDF cropping fails, use only complete text from those same pages.
    }
  }
  if (pages.every(page => (input.pageTexts?.[page - 1]?.trim().length ?? 0) > 20)) {
    const source = pages.map(page => `[应用内第 ${page} 页]\n${input.pageTexts![page - 1]}`).join('\n\n');
    if (source.length <= 120_000) return { source, instruction: '以下只提供当前知识点对应页面的提取文字，用来核对所选段落；图表未提供，不推测缺失的图表内容，不扩展到页面中的其他知识点。' };
  }
  throw new Error('这个知识点的原文暂时无法读取，请稍后重试；未发送整份文档。');
}
