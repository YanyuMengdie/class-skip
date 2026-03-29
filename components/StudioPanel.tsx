import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useState, useCallback } from 'react';
import {
  BookOpen,
  FileText,
  AlertTriangle,
  MessageCircle,
  GraduationCap,
  BookMarked,
  GitBranch,
  HelpCircle,
  ListChecks,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import {
  SavedArtifact,
  SavedArtifactType,
  MindMapNode,
  TerminologyItemForArtifact
} from '../types';

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

const TYPE_META: Record<
  SavedArtifactType,
  { label: string; icon: React.ReactNode; bg: string }
> = {
  studyGuide: { label: '学习指南', icon: <BookOpen className="w-4 h-4" />, bg: 'bg-indigo-100 text-indigo-800' },
  examSummary: { label: '考前速览', icon: <FileText className="w-4 h-4" />, bg: 'bg-emerald-100 text-emerald-800' },
  examTraps: { label: '考点与陷阱', icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-rose-100 text-rose-800' },
  feynman: { label: '费曼检验', icon: <MessageCircle className="w-4 h-4" />, bg: 'bg-sky-100 text-sky-800' },
  trickyProfessor: { label: '刁钻教授', icon: <GraduationCap className="w-4 h-4" />, bg: 'bg-orange-100 text-orange-800' },
  terminology: { label: '术语定义', icon: <BookMarked className="w-4 h-4" />, bg: 'bg-cyan-100 text-cyan-800' },
  mindMap: { label: '思维导图', icon: <GitBranch className="w-4 h-4" />, bg: 'bg-teal-100 text-teal-800' },
  quiz: { label: '测验', icon: <HelpCircle className="w-4 h-4" />, bg: 'bg-violet-100 text-violet-800' },
  flashcard: { label: '闪卡', icon: <ListChecks className="w-4 h-4" />, bg: 'bg-amber-100 text-amber-800' },
  trapList: { label: '陷阱清单', icon: <AlertTriangle className="w-4 h-4" />, bg: 'bg-amber-100 text-amber-800' }
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface StudioPanelProps {
  artifacts: SavedArtifact[];
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
  onDelete: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenQuiz?: () => void;
  onOpenFlashcard?: () => void;
  onOpenTrapList?: () => void;
}

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

function ArtifactContent({ artifact }: { artifact: SavedArtifact }) {
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
function ArtifactContentLarge({ artifact }: { artifact: SavedArtifact }) {
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
        <div
          className="origin-top-left p-6 w-full"
          style={{ transform: `scale(${zoom})` }}
        >
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

export const StudioPanel: React.FC<StudioPanelProps> = ({
  artifacts,
  expandedId,
  onToggleExpand,
  onDelete,
  isCollapsed = false,
  onToggleCollapse,
  onOpenQuiz,
  onOpenFlashcard,
  onOpenTrapList
}) => {
  const expanded = artifacts.find((a) => a.id === expandedId);

  if (isCollapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-4 border-l border-stone-200 bg-stone-50/80 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex flex-col items-center gap-1 text-stone-500 hover:text-slate-700"
          title="展开已生成"
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-xs font-medium">{artifacts.length}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col border-l border-stone-200 bg-white shrink-0 flex-shrink-0">
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-stone-100">
        <h3 className="text-sm font-bold text-slate-800">已生成</h3>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded text-stone-400 hover:text-slate-600"
            title="收起"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {artifacts.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            生成学习指南、考前速览等后会自动出现在这里
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {artifacts.map((a) => {
              const meta = TYPE_META[a.type];
              const isViewing = expandedId === a.id;
              return (
                <li key={a.id} className={`rounded-lg border overflow-hidden ${isViewing ? 'ring-2 ring-indigo-400 border-indigo-200 bg-indigo-50/30' : 'border-stone-100'}`}>
                  <div
                    className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-stone-50"
                    onClick={() => onToggleExpand(isViewing ? null : a.id)}
                  >
                    <span className={`p-1 rounded ${meta.bg}`}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        {a.sourceLabel && `${a.sourceLabel} · `}
                        {formatTime(a.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(a.id);
                      }}
                      className="p-1 rounded text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
