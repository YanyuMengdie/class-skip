/**
 * 备考台「考点释义」：从粗体候选中过滤非术语文本。
 *
 * 依据：侧栏原先把所有 **...** 都送释义，模型常用粗体做句内强调；此处用启发式减少「稳定」「不参与」类噪声，
 * 保留明显专名/缩写/符号。停用表宜保守，避免误杀真术语。
 */

/** 术语一般为短语；过长多为半句/整句被误加粗 */
export const GLOSSARY_TERM_MAX_CHARS = 28;

/** 强术语信号：命中则放宽否定规则（仍排除明显整句） */
function hasStrongTermSignal(s: string): boolean {
  if (/[A-Z]{2,}/.test(s)) return true;
  if (/[Α-Ωα-ω]/.test(s)) return true;
  if (/[0-9]/.test(s) && /[a-zA-Z\u4e00-\u9fff]/.test(s)) return true;
  if (/[Ⅰ-ⅹⅰ-ⅿ]/.test(s)) return true;
  return false;
}

/** 明显为整句/从句或列举过长 */
function looksLikeSentenceOrClause(s: string): boolean {
  if (/[。；！？]/.test(s)) return true;
  if (s.includes('\n')) return true;
  const commas = (s.match(/[，,]/g) ?? []).length;
  if (commas >= 3) return true;
  if (s.includes(';')) return true;
  return false;
}

/**
 * 保守停用：仅整串完全匹配（小写归一）时排除，多为双字形容词/功能词误加粗。
 * 不含学科专名易混词（如「抗原」「免疫」）。
 */
const STOP_EXACT = new Set(
  [
    '的',
    '是',
    '了',
    '不',
    '与',
    '及',
    '和',
    '或',
    '但',
    '而',
    '所',
    '其',
    '该',
    '此',
    '有',
    '为',
    '在',
    '从',
    '对',
    '将',
    '被',
    '把',
    '由',
    '可',
    '能',
    '会',
    '要',
    '需',
    '应',
    '须',
    '都',
    '也',
    '还',
    '又',
    '仅',
    '只',
    '很',
    '更',
    '最',
    '非常',
    '所有',
    '以及',
    '参与',
    '不参与',
    '稳定',
    '重要',
    '主要',
    '一般',
    '通常',
    '这种',
    '这样',
    '可以',
    '不能',
    '没有',
    '不是',
    '但是',
    '如果',
    '因为',
    '所以',
    '而且',
    '或者',
    '等等',
    '之一',
    '部分',
    '例如',
    '注意',
    '说明',
    '以下',
    '上述',
    '其中',
    '其他',
    '整个',
    '各种',
    '某些',
    '一些',
    '许多',
    '大量',
    '相关',
    '包括',
    '涉及',
    '影响',
    '作用',
    '过程',
    '结果',
    '进行',
    '发生',
    '产生',
    '形成',
    '认为',
    '表示',
    '具有',
    '属于',
    '存在',
    '处于',
    '通过',
    '基于',
    '根据',
    '关于',
    '对于',
    '而言',
    'the',
    'and',
    'or',
    'not',
    'all',
    'any',
    'but',
    'can',
    'may',
    'for',
    'with',
    'from',
    'this',
    'that',
    'these',
    'those',
    'very',
    'only',
    'also',
    'such',
    'both',
    'each',
    'some',
    'many',
    'much',
    'more',
    'most',
    'than',
    'then',
    'when',
    'where',
    'which',
    'while',
    'will',
    'would',
    'could',
    'should',
  ].map((x) => x.toLowerCase())
);

function normalizeForStop(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 在 extractBoldTermsFromMarkdown 之后调用：过滤非术语粗体，保留顺序与去重由上游完成。
 */
export function filterGlossaryTermCandidates(terms: string[]): string[] {
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) continue;

    if (t.length > GLOSSARY_TERM_MAX_CHARS) continue;

    const strong = hasStrongTermSignal(t);

    if (looksLikeSentenceOrClause(t)) {
      if (!strong) continue;
    }

    if (!strong) {
      const nk = normalizeForStop(t);
      if (STOP_EXACT.has(nk)) continue;
    }

    out.push(t);
  }
  return out;
}
