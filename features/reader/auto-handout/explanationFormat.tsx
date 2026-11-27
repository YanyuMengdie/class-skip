import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';

// Share the same safe formatting between the preview and export. Model text
// cannot embed HTML, remote images or executable links in the handout.
export function HandoutExplanation({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} unwrapDisallowed
    allowedElements={['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'blockquote']}>
    {text}
  </ReactMarkdown>;
}

export function explanationHtml(text: string): string {
  return renderToStaticMarkup(<HandoutExplanation text={text}/>);
}
