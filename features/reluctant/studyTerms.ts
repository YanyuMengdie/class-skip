import { Type, type Schema } from '@google/genai';
import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export interface StudyTerm {
  term: string;
  english: string;
  explanation: string;
  aliases?: string[];
}

export const studyTermsSchema: Schema = { type: Type.ARRAY, items: {
  type: Type.OBJECT, required: ['term', 'english', 'explanation', 'aliases'], properties: {
    term: { type: Type.STRING }, english: { type: Type.STRING }, explanation: { type: Type.STRING },
    aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
} };

export const STUDY_TERMS_INSTRUCTION = `Return a terms array covering ALL technical concepts actually named in the teaching prose, tables, callouts and optional visual (not just bold words or a few key terms). Each entry has term (exact phrase used in the prose, preferably Chinese for Chinese output), english (standard English name, not an invented translation), explanation (1–3 short everyday-language sentences in the requested output language), aliases (other exact names/abbreviations used for this same concept, or []). Distinguish different concepts and ambiguous acronyms using the source context. Explain what it means HERE, with a tiny example if helpful; preserve qualifications and do not add unsupported findings. Use source terminology first; if the English name or meaning cannot be reliably established, explicitly say it is uncertain instead of guessing. Never treat ordinary phrases or entire sentences as technical terms. Keep definitions in metadata, not a glossary appended to the prose. The UI adds the English name beside each matching term, so do not redundantly append parenthetical translations in new prose. Existing prose must never be rewritten when only annotating it. Before returning, check every named technical concept in your output has its own entry; do not truncate this to a top-N list.`;

/** Optional metadata must not prevent an otherwise valid saved lesson from opening. */
export function parseStudyTerms(value: unknown): StudyTerm[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: StudyTerm[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { term, english, explanation, aliases } = entry;
    if (![term, english, explanation].every(v => typeof v === 'string' && v.trim())
      || term.length > 180 || english.length > 240 || explanation.length > 2400) continue;
    const key = term.trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ term: term.trim(), english: english.trim(), explanation: explanation.trim(),
      aliases: Array.isArray(aliases) ? [...new Set<string>(aliases.filter(a => typeof a === 'string' && a.trim() && a.length <= 180).map(a => a.trim()))] : [] });
  }
  return result;
}

export interface TermFragment { text: string; index?: number; showEnglish?: boolean }
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const latinWord = /[\p{Script=Latin}\p{N}_]/u;

export function splitStudyTerms(value: string, terms: StudyTerm[], following = ''): TermFragment[] {
  const names = new Map<string, number>();
  terms.forEach((term, i) => [term.term, term.english, ...(term.aliases ?? [])].forEach(name => {
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), i);
  }));
  if (!names.size) return [{ text: value }];
  const pattern = new RegExp([...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'giu');
  const result: TermFragment[] = [];
  let from = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index!; const end = start + match[0].length;
    // English abbreviations must not turn pieces of other words into buttons.
    if ((latinWord.test(match[0][0]) && latinWord.test(value[start - 1] ?? ''))
      || (latinWord.test(match[0].at(-1)!) && latinWord.test(value[end] ?? following[0] ?? ''))) continue;
    const index = names.get(match[0].toLowerCase())!;
    const term = terms[index];
    if (start > from) result.push({ text: value.slice(from, start) });
    const suffix = value.slice(end) + following;
    const alreadyTranslated = new RegExp(`^\\s*[（(]\\s*${escapeRegex(term.english)}\\s*[）)]`, 'iu').test(suffix);
    result.push({ text: match[0], index, showEnglish: !alreadyTranslated && match[0].toLowerCase() !== term.english.toLowerCase() });
    from = end;
  }
  if (from < value.length) result.push({ text: value.slice(from) });
  return result.length ? result : [{ text: value }];
}

interface Node { type: string; value?: string; children?: Node[]; data?: unknown }
/** Annotate parsed Markdown, including emphasis, highlights and table cells; never code/links. */
export const remarkStudyTerms: Plugin<[StudyTerm[]], Root> = (terms = []) => tree => {
  const leaves: Node[] = [];
  const collect = (node: Node) => {
    if (['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(node.type)) return;
    if (node.type === 'text') leaves.push(node);
    else node.children?.forEach(collect);
  };
  collect(tree);
  const following = new Map(leaves.map((node, i) => [node, leaves[i + 1]?.value ?? '']));
  const visit = (node: Node) => {
    if (!node.children || ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(node.type)) return;
    node.children = node.children.flatMap(child => {
      if (child.type !== 'text' || !child.value) { visit(child); return [child]; }
      return splitStudyTerms(child.value, terms, following.get(child)).map(fragment => fragment.index === undefined
        ? { type: 'text', value: fragment.text }
        : { type: 'emphasis', data: { hName: 'span', hProperties: { 'data-study-term': fragment.index, 'data-show-english': fragment.showEnglish ? 'yes' : 'no' } }, children: [{ type: 'text', value: fragment.text }] });
    });
  };
  visit(tree);
};
