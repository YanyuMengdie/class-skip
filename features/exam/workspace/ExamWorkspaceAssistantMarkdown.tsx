/**
 * P3 A 档：助手 Markdown 按块级顺序编号（根级 p / h1–h6 / li / blockquote / pre），与 citation.paragraphIndex 对齐；无索引回退 P1 底部链钮。
 * 列表项内层 p、blockquote 内层 p 不计独立编号（避免与容器重复）。
 */
import React, { createContext, useContext, useMemo, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ExamMaterialLink } from '@/types';
import type { ExamWorkspaceCitation } from '@/utils/examWorkspaceCitations';
import { ExamWorkspaceCitationBlock, type OpenMaterialPageOptions } from '@/features/exam/workspace/ExamWorkspaceCitationBlock';

const SkipBlockIndexContext = createContext(false);

export interface ExamWorkspaceAssistantMarkdownProps {
  displayText: string;
  citations: ExamWorkspaceCitation[];
  materials: ExamMaterialLink[];
  onOpenMaterialPage: (materialId: string, page: number, opts?: OpenMaterialPageOptions) => void;
  msgAnchor: string;
}

export const ExamWorkspaceAssistantMarkdown: React.FC<ExamWorkspaceAssistantMarkdownProps> = ({
  displayText,
  citations,
  materials,
  onOpenMaterialPage,
  msgAnchor,
}) => {
  const { citationsByParagraph, unindexed } = useMemo(() => {
    const map = new Map<number, ExamWorkspaceCitation[]>();
    const un: ExamWorkspaceCitation[] = [];
    for (const c of citations) {
      if (typeof c.paragraphIndex === 'number' && c.paragraphIndex >= 0 && Number.isFinite(c.paragraphIndex)) {
        const k = Math.floor(c.paragraphIndex);
        const arr = map.get(k) ?? [];
        arr.push(c);
        map.set(k, arr);
      } else {
        un.push(c);
      }
    }
    return { citationsByParagraph: map, unindexed: un };
  }, [citations]);

  const blockIndexRef = useRef(0);
  blockIndexRef.current = 0;

  const by = citationsByParagraph;

  const wrapIndexedBlock = (blockIndex: number, inner: React.ReactNode, mbClass = 'mb-2 last:mb-0') => {
    const cites = by.get(blockIndex) ?? [];
    if (!cites.length) {
      return (
        <div className={mbClass} data-exam-msg={msgAnchor} data-exam-block-index={String(blockIndex)}>
          {inner}
        </div>
      );
    }
    return (
      <div className={`flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2 ${mbClass}`}>
        <div className="min-w-0 flex-1" data-exam-msg={msgAnchor} data-exam-block-index={String(blockIndex)}>
          {inner}
        </div>
        <div className="shrink-0 flex flex-wrap justify-end sm:justify-start">
          <ExamWorkspaceCitationBlock
            compact
            showTopBorder={false}
            citations={cites}
            materials={materials}
            onOpenMaterialPage={onOpenMaterialPage}
          />
        </div>
      </div>
    );
  };

  const components: Components = {
    p: ({ children, ...props }) => {
      const skip = useContext(SkipBlockIndexContext);
      if (skip) {
        return (
          <p className="mb-2 last:mb-0 leading-relaxed text-slate-800 text-sm" {...props}>
            {children}
          </p>
        );
      }
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <p className="mb-2 last:mb-0 leading-relaxed text-slate-800 text-sm" {...props}>
          {children}
        </p>
      );
    },
    h1: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h1 className="text-base font-bold text-slate-900 mt-4 mb-2 pb-1.5 border-b border-stone-200 first:mt-0" {...props}>
          {children}
        </h1>
      );
    },
    h2: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h2 className="text-sm font-bold text-slate-800 mt-3 mb-1.5 px-2 py-1 rounded-md bg-stone-200/50" {...props}>
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1" {...props}>
          {children}
        </h3>
      );
    },
    h4: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h4 className="text-sm font-bold text-slate-800 mt-2 mb-1" {...props}>
          {children}
        </h4>
      );
    },
    h5: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h5 className="text-sm font-bold text-slate-800 mt-2 mb-1" {...props}>
          {children}
        </h5>
      );
    },
    h6: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <h6 className="text-sm font-bold text-slate-800 mt-2 mb-1" {...props}>
          {children}
        </h6>
      );
    },
    li: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      const cites = by.get(i) ?? [];
      const body = <SkipBlockIndexContext.Provider value={true}>{children}</SkipBlockIndexContext.Provider>;
      if (!cites.length) {
        return (
          <li className="leading-relaxed" {...props} data-exam-msg={msgAnchor} data-exam-block-index={String(i)}>
            {body}
          </li>
        );
      }
      return (
        <li className="leading-relaxed" {...props}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2 w-full">
            <div className="min-w-0 flex-1" data-exam-msg={msgAnchor} data-exam-block-index={String(i)}>
              {body}
            </div>
            <div className="shrink-0 flex flex-wrap justify-end sm:justify-start">
              <ExamWorkspaceCitationBlock
                compact
                showTopBorder={false}
                citations={cites}
                materials={materials}
                onOpenMaterialPage={onOpenMaterialPage}
              />
            </div>
          </div>
        </li>
      );
    },
    blockquote: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <blockquote
          className="border-l-2 border-stone-300 pl-3 py-0.5 my-2 text-slate-600 text-sm"
          {...props}
        >
          <SkipBlockIndexContext.Provider value={true}>{children}</SkipBlockIndexContext.Provider>
        </blockquote>
      );
    },
    pre: ({ children, ...props }) => {
      const i = blockIndexRef.current++;
      return wrapIndexedBlock(
        i,
        <pre
          className="bg-stone-200/70 text-slate-800 p-2 rounded-lg overflow-x-auto text-xs my-2 font-mono border border-stone-200/80"
          {...props}
        >
          {children}
        </pre>
      );
    },
    ul: ({ children, ...props }) => (
      <ul className="list-disc list-outside ml-4 space-y-0.5 my-2 text-slate-800 text-sm" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal list-outside ml-4 space-y-0.5 my-2 text-slate-800 text-sm" {...props}>
        {children}
      </ol>
    ),
    hr: ({ ...props }) => <hr className="my-3 border-stone-200" {...props} />,
    strong: ({ ...props }) => <strong className="font-bold text-slate-900" {...props} />,
    em: ({ ...props }) => <em className="italic text-slate-800" {...props} />,
    a: ({ ...props }) => (
      <a className="text-indigo-600 underline underline-offset-2 break-all" target="_blank" rel="noopener noreferrer" {...props} />
    ),
    del: ({ ...props }) => <del className="line-through text-slate-500" {...props} />,
    code: ({ className, children, ...props }) => {
      const isBlock = Boolean(className);
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="bg-stone-200/80 text-slate-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    },
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-2 -mx-0.5">
        <table className="min-w-full text-xs border-collapse border border-stone-300 rounded-md overflow-hidden" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ ...props }) => <thead className="bg-stone-200/60" {...props} />,
    tbody: ({ ...props }) => <tbody {...props} />,
    tr: ({ ...props }) => <tr className="border-b border-stone-200 last:border-0" {...props} />,
    th: ({ ...props }) => <th className="border border-stone-200 px-2 py-1 text-left font-semibold text-slate-800" {...props} />,
    td: ({ ...props }) => <td className="border border-stone-200 px-2 py-1 text-slate-800" {...props} />,
  };

  return (
    <div className="prose prose-sm max-w-none prose-slate [&_.katex]:text-inherit [&_.katex-display]:my-2">
      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={components}>
        {displayText}
      </ReactMarkdown>
      {unindexed.length > 0 && (
        <ExamWorkspaceCitationBlock citations={unindexed} materials={materials} onOpenMaterialPage={onOpenMaterialPage} />
      )}
    </div>
  );
};
