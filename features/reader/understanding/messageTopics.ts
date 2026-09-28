import type { ChatMessage } from '@/types';
import type { UnderstandingPlan, UnderstandingTopic } from './understandingPlan';

const plain = (value: string) => value.replace(/[*_`]/g, '').trim();
const housekeeping = (value: string) => /^(?:脉络小结|小结|总结|本节小结|本段小结|本模块小结|接下来|下一步|下一部分|下一模块|准备好|是否准备好继续|是否继续|summary|recap|what next|next steps)(?:$|[\s：:·—-])/i.test(plain(value).replace(/^[>\s💡📌]+/u, ''));

/** Only explicit references in the selected excerpt; never infer pages from the reading range. */
export function messageExcerptPages(text: string, allowedPages: number[]): number[] {
  const found = new Set<number>();
  const allowed = new Set(allowedPages);
  const patterns = [
    /第\s*(\d+)\s*(?:[–—－-]|至|到)\s*(\d+)\s*页/g,
    /第\s*(\d+)\s*页/g,
    /\bpages?\s+(\d+)(?:\s*[-–—]\s*(\d+))?\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      // Iterate only the known document pages, even for a malformed range.
      for (const page of allowed) if (page >= start && page <= end) found.add(page);
    }
  }
  return [...found].sort((a, b) => a - b);
}

type Heading = { line: number; title: string; level: number; markdown: boolean };

// Only structural headings define groups. Numbered arguments and bold list labels stay inside them.
function messageHeadings(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let fence: { character: string; length: number } | undefined;
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = undefined;
      return;
    }
    if (fence || /^\s*>/.test(line)) return;
    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    const bold = line.match(/^\s{0,3}\*\*([^*]+)\*\*\s*[:：]?\s*$/);
    const step = line.match(/^\s{0,3}(第[一二三四五六七八九十百\d]+步[：:].+)$/);
    const title = atx?.[2] ?? bold?.[1] ?? step?.[1];
    if (title) headings.push({ line: index, title: plain(title), level: atx ? atx[1].length : 7, markdown: Boolean(atx) });
  });
  return headings;
}

function topicPreview(lines: string[], title: string): string {
  const labels: string[] = [];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced || /^\s*>/.test(line)) continue;
    const label = line.match(/^\s{0,3}#{1,6}\s+(.+)/)?.[1]
      ?? line.match(/^\s*(?:(?:[-*+] |\d+[.)、]\s*)?)\*\*([^*]+)\*\*/)?.[1];
    if (label) {
      const clean = plain(label).replace(/[：:]$/, '');
      if (clean !== title && !housekeeping(clean) && !labels.includes(clean)) labels.push(clean);
    }
  }
  const excerpt = labels.length ? labels.slice(0, 3).join('；') : plain(lines
    .filter(line => line.trim() && !/^\s*(?:#{1,6}\s|---+|\*\*\*+|```|~~~)/.test(line))
    .map(line => line.replace(/^\s*>\s?/, '').replace(/^\s*(?:[-*+] |\d+[.)、]\s*)/, ''))
    .join(' '));
  return excerpt.length > 110 ? `${excerpt.slice(0, 110)}…` : excerpt;
}

/** Group the clicked message by its main headings, preserving the complete argument under each. */
export function createMessageUnderstandingPlan(message: ChatMessage, sourceText: string, allowedPages: number[]): UnderstandingPlan {
  const lines = sourceText.split('\n');
  const headings = messageHeadings(lines);
  const contentHeadings = headings.filter(heading => !housekeeping(heading.title));
  const markdown = contentHeadings.filter(heading => heading.markdown);
  let primary: Heading[];
  if (markdown.length) {
    let level = Math.min(...markdown.map(heading => heading.level));
    // A single document title can wrap the actual section headings.
    if (level === 1 && markdown.filter(heading => heading.level === 1).length === 1 && markdown.some(heading => heading.level > 1)) {
      level = Math.min(...markdown.filter(heading => heading.level > 1).map(heading => heading.level));
    }
    primary = markdown.filter(heading => heading.level === level);
  } else {
    const steps = contentHeadings.filter(heading => /^第[一二三四五六七八九十百\d]+步[：:]/.test(heading.title));
    primary = steps.length ? steps : contentHeadings;
  }
  const excluded = new Set<number>();
  headings.filter(heading => housekeeping(heading.title)).forEach(heading => {
    const end = headings.find(next => next.line > heading.line && next.level <= heading.level)?.line ?? lines.length;
    for (let index = heading.line; index < end; index++) excluded.add(index);
  });
  const starts = primary.length ? primary : [{ line: 0, title: '', level: 0, markdown: false }];
  const topics: UnderstandingTopic[] = starts.flatMap((heading, index) => {
    if (excluded.has(heading.line)) return [];
    const end = starts[index + 1]?.line ?? lines.length;
    const section = lines.slice(heading.line, end).filter((_, offset) => !excluded.has(heading.line + offset));
    const body = heading.title ? section.slice(1) : section;
    // A title without any explanatory content is not an extra selectable item.
    if (!body.some(line => line.trim() && !/^\s*(?:#{1,6}\s|---+|\*\*\*+)/.test(line))) return [];
    const summary = section.join('\n').trim();
    const title = heading.title || plain(body.find(line => line.trim()) ?? '').split(/[。！？!?]/)[0].slice(0, 90);
    if (!title || housekeeping(title)) return [];
    const matchingSpine = message.skimExplanation?.spineItems.find(item =>
      plain(item.titleZh) === title || (item.titleEn && plain(item.titleEn) === title));
    const refs = messageExcerptPages(summary, allowedPages);
    return [{ id: `message-section-${heading.line}`, title, summary, preview: topicPreview(body, title),
      pageRefs: refs.length ? refs : (matchingSpine?.pageRefs ?? []).filter(page => allowedPages.includes(page)),
      ...(matchingSpine ? { kind: matchingSpine.kind } : {}),
    }];
  });
  const core = topics.filter(topic => ['concept', 'relationship', 'mechanism'].includes(topic.kind ?? ''));
  return {
    scopePolicy: 'message-topic-v1', groupingVersion: 2, scopeTitle: '', origin: 'outline', topics,
    essentialIds: (core.length ? core : topics).slice(0, 2).map(topic => topic.id), selectedIds: [],
  };
}
