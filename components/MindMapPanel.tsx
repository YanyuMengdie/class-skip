import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, GitBranch, ZoomIn, ZoomOut, RotateCcw, Sparkles, Maximize2, MessageSquare } from 'lucide-react';
import { MindMapNode, MindMapMultiResult } from '@/types';
import { generateMindMap, generateMindMapMulti, evaluateAndSupplementMindMap, modifyMindMap } from '@/services/geminiService';
import { MindMapFlowCanvas, type MindMapFlowCanvasRef, type TreePart } from '@/components/MindMapFlowCanvas';
import type { MindMapFlowNodeHandlers } from '@/utils/mindMapFlowAdapter';

interface MindMapPanelProps {
  onClose: () => void;
  pdfContent: string | null;
  fileNames: string[] | null;
  displayName: string | null;
  onSaveToStudio?: (payload: { tree: MindMapNode } | { multiResult: MindMapMultiResult }) => void;
}

const newId = () => `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** 在树中查找节点并更新 */
function updateNodeInTree(root: MindMapNode, targetId: string, updater: (n: MindMapNode) => MindMapNode): MindMapNode {
  if (root.id === targetId) return updater(root);
  if (root.children) {
    return { ...root, children: root.children.map((c) => updateNodeInTree(c, targetId, updater)) };
  }
  return root;
}

/** 在树中查找父节点 id（用于添加同级） */
function findParentId(root: MindMapNode, nodeId: string, parentId: string | null): string | null {
  if (root.id === nodeId) return parentId;
  if (root.children) {
    for (const c of root.children) {
      const found = findParentId(c, nodeId, root.id);
      if (found !== undefined) return found;
    }
  }
  return undefined as unknown as null;
}

/** 在树中删除节点 */
function deleteNodeInTree(root: MindMapNode, targetId: string): MindMapNode {
  if (root.id === targetId) return root;
  if (root.children) {
    return {
      ...root,
      children: root.children.filter((c) => c.id !== targetId).map((c) => deleteNodeInTree(c, targetId))
    };
  }
  return root;
}

export const MindMapPanel: React.FC<MindMapPanelProps> = ({ onClose, pdfContent, fileNames, displayName, onSaveToStudio }) => {
  const [mode, setMode] = useState<'ai' | 'build'>('ai');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [singleTree, setSingleTree] = useState<MindMapNode | null>(null);
  const [multiResult, setMultiResult] = useState<{
    perDoc: Array<{ fileName: string; tree: MindMapNode }>;
    crossDoc: Array<{ docA: string; docB: string; similarities: string[] }>;
  } | null>(null);

  const [userTree, setUserTree] = useState<MindMapNode>(() => ({ id: 'root', label: '中心主题', children: [] }));
  const [evaluateResult, setEvaluateResult] = useState<{
    feedback: string;
    suggestedNodes: Array<{ parentId: string; node: MindMapNode }>;
  } | null>(null);

  const isMulti = fileNames && fileNames.length > 1;

  const flowRef = useRef<MindMapFlowCanvasRef | null>(null);

  const handleGenerate = useCallback(() => {
    if (!pdfContent?.trim()) {
      setError('暂无内容');
      return;
    }
    setError(null);
    setLoading(true);
    setSingleTree(null);
    setMultiResult(null);
    if (isMulti && fileNames && fileNames.length > 0) {
      generateMindMapMulti(pdfContent, fileNames)
        .then((res) => {
          if (res) setMultiResult(res);
          else setError('生成失败，请重试');
        })
        .catch(() => setError('生成失败，请重试'))
        .finally(() => setLoading(false));
    } else {
      generateMindMap(pdfContent)
        .then((tree) => {
          if (tree) setSingleTree(tree);
          else setError('生成失败，请重试');
        })
        .catch(() => setError('生成失败，请重试'))
        .finally(() => setLoading(false));
    }
  }, [pdfContent, isMulti, fileNames]);

  const handleUpdateNode = useCallback((id: string, updater: (n: MindMapNode) => MindMapNode) => {
    setUserTree((prev) => updateNodeInTree(prev, id, updater));
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    const child: MindMapNode = { id: newId(), label: '新节点', children: [] };
    setUserTree((prev) => updateNodeInTree(prev, parentId, (n) => ({ ...n, children: [...(n.children || []), child] })));
  }, []);

  const handleAddSibling = useCallback(
    (nodeId: string) => {
      const parentId = findParentId(userTree, nodeId, null);
      if (parentId === null && nodeId === 'root') {
        setUserTree((prev) => ({ ...prev, children: [...(prev.children || []), { id: newId(), label: '新节点', children: [] }] }));
        return;
      }
      if (parentId != null) {
        const sibling: MindMapNode = { id: newId(), label: '新节点', children: [] };
        setUserTree((prev) => updateNodeInTree(prev, parentId, (n) => ({ ...n, children: [...(n.children || []), sibling] })));
      }
    },
    [userTree]
  );

  const handleDelete = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    setUserTree((prev) => deleteNodeInTree(prev, nodeId));
  }, []);

  const handleEvaluate = useCallback(() => {
    if (!pdfContent?.trim()) {
      setError('暂无内容');
      return;
    }
    setError(null);
    setLoading(true);
    setEvaluateResult(null);
    evaluateAndSupplementMindMap(pdfContent, userTree)
      .then((res) => {
        if (res) setEvaluateResult(res);
        else setError('评判失败，请重试');
      })
      .catch(() => setError('评判失败，请重试'))
      .finally(() => setLoading(false));
  }, [pdfContent, userTree]);

  const handleApplySuggestion = useCallback((parentId: string, node: MindMapNode) => {
    const toAdd = { ...node, id: node.id.startsWith('new-') ? newId() : node.id };
    setUserTree((prev) => updateNodeInTree(prev, parentId, (n) => ({ ...n, children: [...(n.children || []), toAdd] })));
    setEvaluateResult((prev) =>
      prev ? { ...prev, suggestedNodes: prev.suggestedNodes.filter((s) => s.parentId !== parentId || s.node.id !== node.id) } : null
    );
  }, []);

  const suggestedByParent = useMemo(
    () =>
      evaluateResult?.suggestedNodes?.reduce((acc, { parentId, node: n }) => {
        if (!acc[parentId]) acc[parentId] = [];
        acc[parentId].push(n);
        return acc;
      }, {} as Record<string, MindMapNode[]>) || {},
    [evaluateResult]
  );

  const handleUpdateNodeForDoc = useCallback((fileName: string) => (id: string, updater: (n: MindMapNode) => MindMapNode) => {
    setMultiResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        perDoc: prev.perDoc.map((d) => (d.fileName === fileName ? { ...d, tree: updateNodeInTree(d.tree, id, updater) } : d))
      };
    });
  }, []);

  const noopEdgeHover = useCallback((_k: string | null) => {}, []);

  const flowParts = useMemo((): TreePart[] => {
    if (mode === 'build') {
      const handlers: MindMapFlowNodeHandlers = {
        onUpdate: handleUpdateNode,
        onAddChild: handleAddChild,
        onAddSibling: handleAddSibling,
        onDelete: handleDelete,
        onApplySuggestion: handleApplySuggestion,
        onEdgeHover: noopEdgeHover
      };
      return [{ scope: 'build', tree: userTree, suggestedByParent, handlers }];
    }

    const parts: TreePart[] = [];
    if (singleTree) {
      const handlers: MindMapFlowNodeHandlers = {
        onUpdate: (id, updater) => setSingleTree((prev) => (prev ? updateNodeInTree(prev, id, updater) : null)),
        onAddChild: (parentId) => {
          const child: MindMapNode = { id: newId(), label: '新节点', children: [] };
          setSingleTree((prev) => (prev ? updateNodeInTree(prev, parentId, (n) => ({ ...n, children: [...(n.children || []), child] })) : null));
        },
        onAddSibling: (nodeId) => {
          setSingleTree((prev) => {
            if (!prev) return null;
            const parentId = findParentId(prev, nodeId, null);
            if (parentId === null && nodeId === 'root') {
              return { ...prev, children: [...(prev.children || []), { id: newId(), label: '新节点', children: [] }] };
            }
            if (parentId != null) {
              const sibling: MindMapNode = { id: newId(), label: '新节点', children: [] };
              return updateNodeInTree(prev, parentId, (n) => ({ ...n, children: [...(n.children || []), sibling] }));
            }
            return prev;
          });
        },
        onDelete: (nodeId) => {
          if (nodeId !== 'root') setSingleTree((prev) => (prev ? deleteNodeInTree(prev, nodeId) : null));
        },
        onEdgeHover: noopEdgeHover
      };
      parts.push({ scope: 'ai-single', tree: singleTree, handlers });
    }

    if (multiResult?.perDoc?.length) {
      multiResult.perDoc.forEach((d, i) => {
        const handlers: MindMapFlowNodeHandlers = {
          onUpdate: handleUpdateNodeForDoc(d.fileName),
          onAddChild: (parentId) => {
            const child: MindMapNode = { id: newId(), label: '新节点', children: [] };
            setMultiResult((prev) =>
              prev
                ? {
                    ...prev,
                    perDoc: prev.perDoc.map((x) =>
                      x.fileName === d.fileName ? { ...x, tree: updateNodeInTree(x.tree, parentId, (n) => ({ ...n, children: [...(n.children || []), child] })) } : x
                    )
                  }
                : null
            );
          },
          onAddSibling: (nodeId) => {
            const parentId = findParentId(d.tree, nodeId, null);
            if (parentId === null && nodeId === 'root') {
              setMultiResult((prev) =>
                prev
                  ? {
                      ...prev,
                      perDoc: prev.perDoc.map((x) =>
                        x.fileName === d.fileName ? { ...x, tree: { ...x.tree, children: [...(x.tree.children || []), { id: newId(), label: '新节点', children: [] }] } } : x
                      )
                    }
                  : null
              );
              return;
            }
            if (parentId != null) {
              const sibling: MindMapNode = { id: newId(), label: '新节点', children: [] };
              setMultiResult((prev) =>
                prev
                  ? {
                      ...prev,
                      perDoc: prev.perDoc.map((x) =>
                        x.fileName === d.fileName ? { ...x, tree: updateNodeInTree(x.tree, parentId, (n) => ({ ...n, children: [...(n.children || []), sibling] })) } : x
                      )
                    }
                  : null
              );
            }
          },
          onDelete: (nodeId) => {
            if (nodeId !== 'root') {
              setMultiResult((prev) =>
                prev
                  ? {
                      ...prev,
                      perDoc: prev.perDoc.map((x) =>
                        x.fileName === d.fileName ? { ...x, tree: deleteNodeInTree(x.tree, nodeId) } : x
                      )
                    }
                  : null
              );
            }
          },
          onEdgeHover: noopEdgeHover
        };
        parts.push({ scope: `ai-doc-${i}`, tree: d.tree, handlers });
      });
    }

    return parts;
  }, [
    mode,
    userTree,
    suggestedByParent,
    handleUpdateNode,
    handleAddChild,
    handleAddSibling,
    handleDelete,
    handleApplySuggestion,
    singleTree,
    multiResult,
    handleUpdateNodeForDoc,
    noopEdgeHover
  ]);

  const hasFlowContent = flowParts.length > 0;
  const hasAnyTree = singleTree != null || (multiResult?.perDoc?.length ?? 0) > 0 || mode === 'build';

  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyTarget, setModifyTarget] = useState<{ tree: MindMapNode; onApply: (t: MindMapNode) => void } | null>(null);
  const [modifyLoading, setModifyLoading] = useState(false);
  const openModifyDialog = useCallback((tree: MindMapNode, onApply: (t: MindMapNode) => void) => {
    setModifyTarget({ tree, onApply });
    setModifyInstruction('');
    setModifyDialogOpen(true);
  }, []);
  const handleModifySubmit = useCallback(() => {
    if (!modifyTarget?.tree || !modifyInstruction.trim()) return;
    setModifyLoading(true);
    modifyMindMap(modifyTarget.tree, modifyInstruction.trim(), pdfContent ?? undefined)
      .then((newTree) => {
        if (newTree) modifyTarget.onApply(newTree);
        setModifyDialogOpen(false);
        setModifyTarget(null);
      })
      .finally(() => setModifyLoading(false));
  }, [modifyTarget, modifyInstruction, pdfContent]);

  useEffect(() => {
    if (!modifyDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modifyLoading) return;
      e.preventDefault();
      setModifyDialogOpen(false);
      setModifyTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modifyDialogOpen, modifyLoading]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-stone-50 animate-in fade-in duration-200">
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-stone-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 text-stone-500 hover:text-slate-700 shrink-0"
            title="关闭"
            aria-label="关闭思维导图"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-slate-800 text-lg flex items-center gap-2 min-w-0 truncate">
            <GitBranch className="w-5 h-5 text-teal-500 shrink-0" />
            思维导图
            {displayName && <span className="text-sm font-normal text-stone-500 truncate">{displayName}</span>}
          </h1>
          <div className="flex rounded-xl border border-stone-200 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => {
                setMode('ai');
                setError(null);
              }}
              className={`py-2 px-4 text-sm font-bold ${mode === 'ai' ? 'bg-teal-100 text-teal-800' : 'text-stone-500 hover:bg-stone-50'}`}
            >
              AI 生成
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('build');
                setError(null);
                setEvaluateResult(null);
              }}
              className={`py-2 px-4 text-sm font-bold ${mode === 'build' ? 'bg-teal-100 text-teal-800' : 'text-stone-500 hover:bg-stone-50'}`}
            >
              自己构建
            </button>
          </div>
        </div>
        {hasAnyTree && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
              <button
                type="button"
                onClick={() => flowRef.current?.zoomOut?.()}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-200"
                title="缩小"
                aria-label="缩小画布"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => flowRef.current?.resetViewport?.()}
                className="px-2 py-1 text-xs font-mono text-stone-600 min-w-[2.5rem] flex items-center justify-center"
                title="重置视口到 100% 与左上角"
                aria-label="重置视口"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => flowRef.current?.zoomIn?.()}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-200"
                title="放大"
                aria-label="放大画布"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => flowRef.current?.fitView?.()}
                className="p-1.5 rounded text-stone-600 hover:bg-stone-200 border-l border-stone-200 ml-0.5 pl-1.5"
                title="适应画布：缩放到整图可见"
                aria-label="适应画布"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <span className="hidden md:inline text-[11px] text-stone-500 max-w-[260px] leading-tight text-right" title="画布操作">
                滚轮缩放 · 拖移平移 · 右下角小地图
              </span>
            </div>
            {onSaveToStudio && (
              <button
                type="button"
                onClick={() => {
                  if (mode === 'build') onSaveToStudio({ tree: userTree });
                  else if (singleTree) onSaveToStudio({ tree: singleTree });
                  else if (multiResult?.perDoc?.length) onSaveToStudio({ multiResult });
                }}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-teal-100 text-teal-800 text-sm font-bold hover:bg-teal-200"
              >
                保存到 Studio
              </button>
            )}
            {(singleTree || (multiResult?.perDoc?.length ?? 0) > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (singleTree) openModifyDialog(singleTree, setSingleTree);
                  else if (multiResult?.perDoc?.length) {
                    openModifyDialog(multiResult.perDoc[0].tree, (t) =>
                      setMultiResult((prev) => (prev ? { ...prev, perDoc: prev.perDoc.map((d, i) => (i === 0 ? { ...d, tree: t } : d)) } : null))
                    );
                  }
                }}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600"
              >
                <Sparkles className="w-4 h-4" /> 让 AI 修改
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 overflow-auto max-h-[min(50vh,480px)] border-b border-stone-200 bg-white px-4 py-3">
          <div className="max-w-4xl">
            {error && <p className="text-rose-600 text-sm mb-2">{error}</p>}

            {mode === 'ai' && (
              <>
                <p className="text-slate-600 text-sm mb-3">
                  {isMulti
                    ? `已选 ${fileNames?.length || 0} 个文档，将生成每份的思维导图并分析文档间关联。节点为中文+英文对照。`
                    : '根据当前文档生成思维导图，节点为中文+英文对照。'}
                </p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!pdfContent?.trim() || loading}
                  className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600 disabled:opacity-50 mb-4"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                  {loading ? '生成中...' : '生成思维导图'}
                </button>
                {multiResult && !loading && multiResult.crossDoc.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 max-w-2xl mb-4">
                    <h3 className="text-sm font-bold text-amber-800 mb-2">文档间关联</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {multiResult.crossDoc.map((link, i) => (
                        <li key={i}>
                          <span className="font-medium">{link.docA}</span> – <span className="font-medium">{link.docB}</span>
                          <ul className="list-disc list-inside ml-2 mt-1 text-slate-600">{link.similarities.map((s, j) => <li key={j}>{s}</li>)}</ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {multiResult && !loading && (
                  <div className="space-y-2 text-sm text-slate-600 mb-2">
                    {multiResult.perDoc.map((d, i) => (
                      <div key={d.fileName} className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-teal-800">文档：{d.fileName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            openModifyDialog(d.tree, (t) =>
                              setMultiResult((prev) => (prev ? { ...prev, perDoc: prev.perDoc.map((x) => (x.fileName === d.fileName ? { ...x, tree: t } : x)) } : null))
                            )
                          }
                          className="flex items-center gap-1 py-1 px-2 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold hover:bg-amber-200"
                        >
                          <Sparkles className="w-3 h-3" /> 让 AI 修改此导图
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === 'build' && (
              <>
                <p className="text-slate-600 text-sm mb-3">自己构建思维导图，双击节点可编辑；完成后可请 AI 评判与补充。</p>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={!pdfContent?.trim() || loading}
                  className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50 mb-4"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  {loading ? '评判中...' : '请 AI 评判与补充'}
                </button>
                {evaluateResult && !loading && (
                  <div className="mt-2 p-4 rounded-xl bg-stone-100 border border-stone-200 text-sm max-w-2xl">
                    <p className="font-bold text-slate-800 mb-1">AI 评语</p>
                    <p className="text-slate-700">{evaluateResult.feedback}</p>
                    {evaluateResult.suggestedNodes.length > 0 && (
                      <p className="mt-2 text-slate-600">建议补充的节点已显示在对应父节点下方，点击「应用」可加入导图。</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <main className="flex-1 min-h-0 relative bg-slate-100">
          {hasFlowContent ? <MindMapFlowCanvas ref={flowRef} parts={flowParts} /> : <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">生成或构建导图后，将在此显示（ELK + React Flow）</div>}
        </main>
      </div>

      {modifyDialogOpen && (
        <div className="fixed inset-0 z-[400] bg-black/40 flex items-center justify-center p-4" role="presentation" onClick={() => !modifyLoading && setModifyDialogOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mindmap-modify-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="mindmap-modify-dialog-title" className="font-bold text-slate-800 text-lg mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" /> 让 AI 修改思维导图
            </h3>
            <p className="text-slate-600 text-sm mb-3">描述你希望的修改，例如：增加一节关于 XX、删掉某分支、简化、或翻译成英文。</p>
            <textarea
              value={modifyInstruction}
              onChange={(e) => setModifyInstruction(e.target.value)}
              placeholder="例如：在「膜结构」下增加「磷脂运动类型」并补充横向扩散与翻转"
              className="w-full min-h-[100px] px-3 py-2 text-sm border border-stone-200 rounded-xl resize-y mb-4"
              disabled={modifyLoading}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !modifyLoading && setModifyDialogOpen(false)}
                className="py-2 px-4 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
                aria-label="取消修改"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleModifySubmit}
                disabled={!modifyInstruction.trim() || modifyLoading}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50"
                aria-label="提交 AI 修改请求"
              >
                {modifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {modifyLoading ? '修改中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
