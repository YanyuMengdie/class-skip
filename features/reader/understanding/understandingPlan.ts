import type { ChatMessage } from '@/types';
import type { UnderstandingSession } from './readingUnderstanding';

export interface UnderstandingTopic {
  id: string;
  title: string;
  titleEn?: string;
  summary: string;
  /** Short excerpt from this group's own subheadings or explanation. */
  preview?: string;
  pageRefs: number[];
  kind?: string;
  handled?: boolean;
  needsReview?: boolean;
  conversation?: UnderstandingSession;
}

export interface UnderstandingPlan {
  scopePolicy?: 'message-topic-v1';
  groupingVersion?: 2;
  scopeTitle: string;
  origin: 'spine' | 'outline' | 'text';
  topics: UnderstandingTopic[];
  essentialIds: string[];
  selectedIds: string[];
  path?: 'selected' | 'essentials';
  minutes?: number;
}

const plain = (text: string) => text.replace(/[*_`]/g, '').trim();

/** Uses only saved content. Opening the picker never requests AI extraction. */
export function createUnderstandingPlan(message: ChatMessage, sourceText: string, pages: number[], scopeTitle: string): UnderstandingPlan {
  const spine = message.skimExplanation?.spineItems ?? [];
  let topics: UnderstandingTopic[] = spine.map(item => ({
    id: item.id, title: item.titleZh, ...(item.titleEn ? { titleEn: item.titleEn } : {}),
    summary: item.summary, pageRefs: item.pageRefs.filter(page => pages.includes(page)), kind: item.kind,
  }));
  let origin: UnderstandingPlan['origin'] = 'spine';
  if (!topics.length) {
    // Older messages may not have a saved spine. Preserve every numbered section,
    // including its nested bullets; do not guess a finer PDF page mapping.
    const lines = sourceText.split('\n');
    let fenced = false;
    let part = '';
    const starts: { line: number; title: string }[] = [];
    lines.forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
      if (fenced) return;
      const heading = line.match(/^\s{0,3}#{1,4}\s+(.+)/);
      if (heading) part = plain(heading[1]);
      const numbered = line.match(/^\s{0,3}\d+[.)、]\s+(.+)/);
      if (numbered) {
        const label = numbered[1].match(/^\*\*([^*]+)\*\*/)?.[1] ?? numbered[1].split(/[：:]/)[0];
        starts.push({ line: index, title: [part, plain(label).slice(0, 100)].filter(Boolean).join(' · ') });
      }
    });
    if (!starts.length) {
      fenced = false;
      lines.forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
        if (fenced) return;
        const heading = line.match(/^\s{0,3}#{1,4}\s+(.+)/);
        if (heading) starts.push({ line: index, title: plain(heading[1]) });
      });
    }
    topics = starts.map((entry, index) => ({
      id: `section-${entry.line}`, title: entry.title,
      summary: lines.slice(entry.line, starts[index + 1]?.line ?? lines.length).join('\n'), pageRefs: [],
    }));
    origin = topics.length ? 'outline' : 'text';
    if (!topics.length) topics = [{ id: 'whole-message', title: scopeTitle, summary: sourceText, pageRefs: [] }];
  }
  const core = topics.filter(topic => ['concept', 'relationship', 'mechanism'].includes(topic.kind ?? ''));
  return {
    scopeTitle, origin, topics, selectedIds: [],
    essentialIds: (core.length ? core : topics).slice(0, 2).map(topic => topic.id),
  };
}

export function createTopicConversation(parent: UnderstandingSession, topic: UnderstandingTopic, plan: UnderstandingPlan): UnderstandingSession {
  return {
    version: 1, id: crypto.randomUUID(), topic: topic.title,
    scopePolicy: 'message-topic-v1',
    sourceText: topic.summary,
    pageRefs: topic.pageRefs,
    turns: [], mode: 'acquisition', phase: 'question', createdAt: Date.now(),
    focus: { title: topic.title, summary: topic.summary, scopeTitle: plan.scopeTitle, path: plan.path ?? 'selected', roundTopicCount: plan.selectedIds.length },
  };
}
