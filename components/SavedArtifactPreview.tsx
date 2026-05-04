import React, { useState, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ZoomIn, ZoomOut, X } from 'lucide-react';
import { SavedArtifact, MindMapNode, TerminologyItemForArtifact } from '@/types';
import { SAVED_ARTIFACT_TYPE_META as TYPE_META } from '@/utils/savedArtifactMeta';

const MarkdownComponents: Components = {
  h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-2 border-b border-stone-200 first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-base font-bold text-slate-800 mt-3 mb-2 px-2 py-1.5 rounded-lg bg-stone-100" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-slate-700 mt-2 mb-1" {...props} />,
  p: ({ node, ...props }) => <p className="mb-2 leading-6 text-slate-700 text-sm" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-4 space-y-1 my-2 text-slate-700 text-sm" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-slate-800" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-stone-300 pl-3 py-1 my-2 text-slate-600 text-sm" {...props} />,
  code: ({ node, ...props }) => <code className="bg-stone-100 text-slate-700 px-1 py-0.5 rounded text-xs font-mono" {...props} />
};

const MarkdownComponentsLarge: Components = {
  h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-slate-900 mt-8 mb-4 pb-2 border-b border-stone-200 first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3 px-3 py-2 rounded-lg bg-stone-100" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-lg font-bold text-slate-700 mt-4 mb-2" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-7 text-slate-700 text-base" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc list-outside ml-6 space-y-2 my-4 text-slate-700 text-base" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal list-outside ml-6 space-y-2 my-4 text-slate-700 text-base" {...props} />,
  li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-bold text-slate-800" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-stone-300 pl-4 py-2 my-4 text-slate-600 text-base" {...props} />,
  code: ({ node, ...props }) => <code className="bg-stone-100 text-slate-700 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />
};

function MindMapTreePreview({ node, depth = 0 }: { node: MindMapNode; depth?: number }) {
  const label = node.labelEn ? `${node.labelEn}（${node.label}）` : node.label;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div className="ml-2 border-l border-stone-200 pl-2 py-0.5">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      {hasChildren && (
        <div className="mt-0.5 space-y-0.5">
          {node.children!.map((c) => (
            <MindMapTreePreview key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ArtifactContent({ artifact }: { artifact: SavedArtifact }) {
  switch (artifact.type) {
    case 'studyGuide':
      return (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            components={MarkdownComponents}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
          >
            {artifact.payload.content.markdownContent || '内容为空'}
          </ReactMarkdown>
        </div>
      );
    case 'examSummary':
    case 'examTraps':
    case 'feynman':
    case 'trickyProfessor':
      return (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown
            components={MarkdownComponents}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
          >
            {artifact.payload.markdown}
          </ReactMarkdown>
        </div>
      );
    case 'terminology':
      return (
        <ul className="space-y-2 text-sm">
          {artifact.payload.terms.map((t: TerminologyItemForArtifact, i: number) => (
            <li key={i} className="border-b border-stone-100 pb-2 last:border-0">
              <span className="font-bold text-slate-800">{t.term}</span>
              <p className="text-slate-600 mt-0.5">{t.definition}</p>
            </li>
          ))}
        </ul>
      );
    case 'mindMap':
      if ('tree' in artifact.payload) {
        return (
          <div className="py-2">
            <MindMapTreePreview node={artifact.payload.tree} />
          </div>
        );
      }
      const multi = artifact.payload.multiResult;
      return (
        <div className="space-y-3 text-sm">
          {multi.perDoc.map((d) => (
            <div key={d.fileName}>
              <div className="font-bold text-slate-700">{d.fileName}</div>
              <MindMapTreePreview node={d.tree} />
            </div>
          ))}
        </div>
      );
    case 'quiz':
      return (
        <p className="text-sm text-slate-600">
          第 {artifact.payload.roundIndex + 1} 轮测验
          {artifact.payload.questionCount != null && `，共 ${artifact.payload.questionCount} 题`}。
        </p>
      );
    case 'flashcard':
      return (
        <p className="text-sm text-slate-600">
          共 {artifact.payload.count} 张闪卡。
        </p>
      );
    case 'trapList':
      return (
        <p className="text-sm text-slate-600">
          共 {artifact.payload.itemIds.length} 条陷阱。
        </p>
      );
    default:
      return null;
  }
}

/** 主区域全幅展示 + 可缩放（NotebookLM 风格） */
export function ArtifactContentLarge({ artifact }: { artifact: SavedArtifact }) {
  switch (artifact.type) {
    case 'studyGuide':
      return (
        <div className="prose prose-base max-w-none">
          <ReactMarkdown
            components={MarkdownComponentsLarge}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
          >
            {artifact.payload.content.markdownContent || '内容为空'}
          </ReactMarkdown>
        </div>
      );
    case 'examSummary':
    case 'examTraps':
    case 'feynman':
    case 'trickyProfessor':
      return (
        <div className="prose prose-base max-w-none">
          <ReactMarkdown
            components={MarkdownComponentsLarge}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
          >
            {artifact.payload.markdown}
          </ReactMarkdown>
        </div>
      );
    case 'terminology':
      return (
        <ul className="space-y-4 text-base">
          {artifact.payload.terms.map((t: TerminologyItemForArtifact, i: number) => (
            <li key={i} className="border-b border-stone-200 pb-4 last:border-0">
              <span className="font-bold text-slate-800 text-lg">{t.term}</span>
              <p className="text-slate-600 mt-1">{t.definition}</p>
            </li>
          ))}
        </ul>
      );
    case 'mindMap':
      if ('tree' in artifact.payload) {
        return (
          <div className="py-4">
            <MindMapTreePreview node={artifact.payload.tree} />
          </div>
        );
      }
      const multi = artifact.payload.multiResult;
      return (
        <div className="space-y-6 text-base">
          {multi.perDoc.map((d) => (
            <div key={d.fileName}>
              <div className="font-bold text-slate-700 text-lg">{d.fileName}</div>
              <MindMapTreePreview node={d.tree} />
            </div>
          ))}
        </div>
      );
    case 'quiz':
    case 'flashcard':
    case 'trapList':
      return <ArtifactContent artifact={artifact} />;
    default:
      return null;
  }
}

export interface ArtifactFullViewProps {
  artifact: SavedArtifact;
  onClose: () => void;
  onOpenQuiz?: () => void;
  onOpenFlashcard?: () => void;
  onOpenTrapList?: () => void;
}

/** 全屏/大屏预览：与侧栏展开同一套正文（ArtifactContentLarge）+ 缩放工具条 */
export const ArtifactFullView: React.FC<ArtifactFullViewProps> = ({
  artifact,
  onClose,
  onOpenQuiz,
  onOpenFlashcard,
  onOpenTrapList
}) => {
  const [zoom, setZoom] = useState(1);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(2.5, z + 0.15)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.5, z - 0.15)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  const meta = TYPE_META[artifact.type];

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`p-1.5 rounded-lg ${meta.bg} shrink-0`}>{meta.icon}</span>
          <h2 className="font-bold text-slate-800 truncate">{artifact.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5">
            <button type="button" onClick={zoomOut} className="p-2 rounded text-stone-600 hover:bg-stone-100" title="缩小">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button type="button" onClick={resetZoom} className="px-2 py-1.5 text-xs font-mono text-stone-600 min-w-[3.5rem]" title="重置">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={zoomIn} className="p-2 rounded text-stone-600 hover:bg-stone-100" title="放大">
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-stone-200 text-stone-600 font-medium text-sm flex items-center gap-1.5"
          >
            <X className="w-4 h-4" /> 关闭
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="origin-top-left p-6 w-full" style={{ transform: `scale(${zoom})` }}>
          <div className="max-w-3xl mx-auto">
            <ArtifactContentLarge artifact={artifact} />
            {(artifact.type === 'quiz' && onOpenQuiz) || (artifact.type === 'flashcard' && onOpenFlashcard) || (artifact.type === 'trapList' && onOpenTrapList) ? (
              <div className="mt-6 pt-4 border-t border-stone-200 flex gap-3">
                {artifact.type === 'quiz' && onOpenQuiz && (
                  <button type="button" onClick={onOpenQuiz} className="text-violet-600 font-medium hover:underline">
                    在测验中查看
                  </button>
                )}
                {artifact.type === 'flashcard' && onOpenFlashcard && (
                  <button type="button" onClick={onOpenFlashcard} className="text-amber-600 font-medium hover:underline">
                    在闪卡中查看
                  </button>
                )}
                {artifact.type === 'trapList' && onOpenTrapList && (
                  <button type="button" onClick={onOpenTrapList} className="text-amber-600 font-medium hover:underline">
                    在陷阱清单中查看
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
