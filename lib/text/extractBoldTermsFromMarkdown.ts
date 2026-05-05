/**
 * 从 AI 回复中提取 Markdown 粗体 **...** 候选术语（首版不支持 HTML <strong>）。
 */

export function normalizeTermKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function isValidTermInner(inner: string): boolean {
  const t = inner.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  if (/^[\s\p{P}\p{S}]+$/u.test(t)) return false;
  return true;
}

/**
 * 提取 **术语** 候选，去重（保留首次出现顺序）。
 */
export function extractBoldTermsFromMarkdown(assistantMessage: string): string[] {
  if (!assistantMessage?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = /\*\*((?:[^*]|\*(?!\*))+?)\*\*/gu;
  while ((m = re.exec(assistantMessage)) !== null) {
    const raw = m[1] ?? '';
    const term = raw.replace(/\s+/g, ' ').trim();
    if (!isValidTermInner(term)) continue;
    const key = normalizeTermKey(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** 稳定 id：同一 kcId + 归一化术语 → 唯一 */
export function buildKcGlossaryEntryId(kcId: string, term: string): string {
  const k = normalizeTermKey(term);
  let h = 5381;
  for (let i = 0; i < k.length; i++) {
    h = (h * 33) ^ k.charCodeAt(i);
  }
  return `gloss-${kcId}-${(h >>> 0).toString(36)}`;
}
