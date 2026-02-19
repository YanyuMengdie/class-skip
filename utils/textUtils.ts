/**
 * 将纯文本中的 Unicode 上标/下标字符转为 <sup>/<sub> 标签，
 * 并保留换行为 <br>，使拖拽便签与「选中平移」后的内容格式一致（如 Ton⁺、Lac⁺ 正确显示）。
 * 用于拖拽便签时仅拿到 text/plain 的 fallback，以及 ExplanationPanel 的 fallback HTML。
 */
const SUPER_MAP: Record<string, string> = {
  '⁺': '+', '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁼': '=', '⁽': '(', '⁾': ')'
};
const SUB_MAP: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6',
  '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')'
};

export function plainTextToHtmlWithSupSub(plainText: string): string {
  if (!plainText) return '';
  let s = plainText;
  Object.entries(SUPER_MAP).forEach(([uni, ch]) => {
    s = s.split(uni).join('<sup>' + ch + '</sup>');
  });
  Object.entries(SUB_MAP).forEach(([uni, ch]) => {
    s = s.split(uni).join('<sub>' + ch + '</sub>');
  });
  return s.replace(/\n/g, '<br>');
}

/**
 * 合并选区文本中「夹在非空白字符之间的换行与空白」，避免从 DOM 多节点选区得到的
 * 字符串变成逐字换行；并去掉因 DOM/选区导致的连续重复片段（如 Ton+→A+→D+Ton+→A+→D+ → 只保留一段）。
 */
export function normalizeSelectionText(text: string): string {
  if (!text) return '';
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (s.includes('\n')) {
    for (let i = 0; i < 3; i++) {
      s = s.replace(/(?<=[^\s])\s*\n{1,2}\s*(?=[^\s])/g, '');
    }
    s = s.trim();
  }
  // 去掉连续重复：仅因选区/DOM 导致的重复（如 "Ton+→A+→D+Ton+→A+→D+"、"Lac+Lac+"）
  s = s.replace(/(Ton\+→A\+→D\+)+/g, 'Ton+→A+→D+');
  s = s.replace(/(Lac\+)+/g, 'Lac+');
  // 「同内容两种写法」：选区跨多块 DOM 时同一段会以两种符号各出现一次（如 ⁺ 和 *），保留第二次写法、去掉第一次
  s = s.replace(/Ton[⁺+]→A[⁺+]→D[⁺+]→(Ton[*]→A[*]→D[*])/g, '$1');
  s = s.replace(/Ton\+→A\+→D\+→(Ton\*→A\*→D\*)/g, '$1');
  if (s.includes('Lac⁺+Lac⁺') || s.includes('Lac+Lac+') || s.includes('Lac+Lac⁺')) {
    s = s.replace(/Lac[⁺+]\+Lac\*/g, '');
  }
  // 小写 lac+lac+ 与正确写法 Lac+Lac⁺ 同时出现时，去掉第一次的小写写法
  if (s.includes('Lac+Lac⁺') || s.includes('Lac⁺+Lac⁺')) {
    s = s.replace(/lac\+lac\+/g, '');
  }
  // 常见 DOM 重复：F'LacF'Lac → F'Lac；LacZ, Y, ALacZ,Y,A → LacZ, Y, A；基因型 a-,ton-lac-,d-a-,ton-, lac-,d- → a-,ton-, lac-,d-
  s = s.replace(/(F'Lac)+/g, "F'Lac");
  s = s.replace(/LacZ, Y, ALacZ,Y,A/g, 'LacZ, Y, A');
  s = s.replace(/a-,ton-lac-,d-a-,ton-, lac-,d-/g, 'a-,ton-, lac-,d-');
  // 通用：任意连续重复短语只保留一次（如 "abcabc" → "abc"）
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/(.+?)\1+/g, '$1');
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 笔记展示时把遗传学里的 + 显示为上标（Ton+ → Ton⁺），仅用于展示，不改存储内容。
 */
export function noteDisplayWithSuperscript(text: string): string {
  if (!text) return '';
  return text
    .replace(/Lac\+/g, 'Lac⁺')
    .replace(/lac\+/g, 'lac⁺')
    .replace(/Ton\+/g, 'Ton⁺')
    .replace(/D\+/g, 'D⁺')
    .replace(/A\+/g, 'A⁺');
}

/**
 * 从 HTML 中剥掉标签得到纯文本（用于编辑时展示）。
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * 对「记笔记」得到的 HTML 做去重：保留与 AI 讲解一致的格式，去掉 DOM/选区导致的各类重复。
 * 支持标签中间夹着的重复（如 <span>Ton⁺→A⁺</span><span>Ton*→A*</span>）。
 */
export function dedupeHtml(html: string): string {
  if (!html || !html.includes('<')) return html;
  let s = html;
  // 同内容两种写法：保留第二次（* 或正确写法），去掉第一次（⁺ 等），允许中间有标签
  const allowBetween = '[\\s\\S]{0,120}?';
  s = s.replace(new RegExp(`Ton[⁺+]→A[⁺+]→D[⁺+]${allowBetween}(Ton[*]→A[*]→D[*])`, 'g'), '$1');
  s = s.replace(new RegExp(`Ton\\+→A\\+→D\\+${allowBetween}(Ton\\*→A\\*→D\\*)`, 'g'), '$1');
  if (/Lac⁺\+Lac⁺|Lac\+Lac\+|Lac\+Lac⁺/.test(s)) {
    s = s.replace(new RegExp(`Lac[⁺+]\\+Lac[*]`, 'g'), '');
  }
  if (/Lac\+Lac⁺|Lac⁺\+Lac⁺/.test(s)) {
    s = s.replace(/lac\+lac\+/g, '');
  }
  // 常见 DOM 重复（允许中间有标签）
  s = s.replace(new RegExp(`(F'Lac)${allowBetween}\\1`, 'g'), "$1");
  s = s.replace(/LacZ, Y, ALacZ,Y,A/g, 'LacZ, Y, A');
  s = s.replace(/a-,ton-lac-,d-a-,ton-, lac-,d-/g, 'a-,ton-, lac-,d-');
  // 通用：连续两段相同正文（>长文本<...>长文本<）只保留一段，避免任意格式相关重复
  for (let i = 0; i < 3; i++) {
    s = s.replace(/>([^<]{12,})<([\s\S]*?)>\1</g, (_, text, mid) => mid + '>' + text + '<');
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}
