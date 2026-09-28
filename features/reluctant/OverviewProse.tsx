import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Lightbulb, Info, Bookmark } from 'lucide-react';
import type { Element, RootContent } from 'hast';
import type { AppLanguage } from '@/types';
import { StudyTermButton, useStudyTerms } from './StudyTermPopover';
import { remarkStudyTerms } from './studyTerms';
import { remarkOverviewReading } from './overviewMarkdown';

function plainText(node?: Element | RootContent): string {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(child => plainText(child)).join('') : '';
}

function TermSpan({ children, node }: { children?: React.ReactNode; node?: Element }) {
  return node?.properties?.['data-study-term'] !== undefined
    ? <StudyTermButton index={Number(node.properties['data-study-term'])} showEnglish={node.properties['data-show-english'] === 'yes'}>{children}</StudyTermButton>
    : <span>{children}</span>;
}

export function OverviewProse({ value, caveats, language }: { value: string; caveats: string[]; language: AppLanguage }) {
  const { terms } = useStudyTerms();
  const options = useMemo(() => ({ language, caveats }), [language, caveats]);
  const en = language === 'en';
  const components = useMemo<Components>(() => ({
    span: TermSpan,
    h2: ({ children }) => <h3>{children}</h3>,
    table: ({ children }) => <div className="overview-table" tabIndex={0} role="region" aria-label={en ? 'Comparison' : '对比'}><table>{children}</table></div>,
    blockquote: ({ children, node }) => {
      const first = node?.children.find(child => child.type === 'element');
      const firstElement = first?.type === 'element' ? first : undefined;
      const label = firstElement?.children.find(child => child.type !== 'text' || child.value.trim());
      const marker = label?.type === 'element' && label.tagName === 'strong'
        ? plainText(label).trim().replace(/[:：]$/, '').toLowerCase() : '';
      const kind = ['举个例子', '例子', 'example', '举个假想例子', 'hypothetical example'].includes(marker) ? 'example'
        : ['记住这个', '要点', 'takeaway', 'remember this'].includes(marker) ? 'takeaway'
        : ['注意', '容易混淆', 'note', 'caution'].includes(marker) ? 'note' : 'quote';
      const Icon = kind === 'example' ? Lightbulb : kind === 'takeaway' ? Bookmark : Info;
      return <blockquote className={`overview-callout overview-callout--${kind}`}>
        {kind !== 'quote' && <Icon size={17} className="overview-callout-icon" aria-hidden="true" />}
        <div>{children}</div>
      </blockquote>;
    },
  }), [en]);
  return <div className="overview-prose" data-preserve-language="true">
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, [remarkOverviewReading, options], [remarkStudyTerms, terms]]}
      allowedElements={['span', 'p', 'strong', 'em', 'mark', 'br', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre']}
      unwrapDisallowed components={components}>{value}</ReactMarkdown>
  </div>;
}
