import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, GitBranch, ZoomIn, ZoomOut, RotateCcw, Sparkles, Maximize2, MoreHorizontal, ChevronDown } from 'lucide-react';
import { MindMapNode, MindMapMultiResult } from '@/types';
import { generateMindMap, generateMindMapMulti, evaluateAndSupplementMindMap, modifyMindMap } from '@/services/geminiService';
import { MindMapFlowCanvas, type MindMapFlowCanvasRef, type TreePart } from '@/features/review/tools/mindMap/MindMapFlowCanvas';
import './mindMap.css';
import type { MindMapFlowNodeHandlers } from '@/features/review/lib/mindMap/mindMapFlowAdapter';

interface MindMapPanelProps {
  initialPayload?: { tree: MindMapNode } | { multiResult: MindMapMultiResult } | null;
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

export const MindMapPanel: React.FC<MindMapPanelProps> = ({ initialPayload, onClose, pdfContent, fileNames, displayName, onSaveToStudio }) => {
  const [mode, setMode] = useState<'ai' | 'build'>('ai');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [singleTree, setSingleTree] = useState<MindMapNode | null>(initialPayload && 'tree' in initialPayload ? initialPayload.tree : null);
  const [multiResult, setMultiResult] = useState<{
    perDoc: Array<{ fileName: string; tree: MindMapNode }>;
    crossDoc: Array<{ docA: string; docB: string; similarities: string[] }>;
  } | null>(initialPayload && 'multiResult' in initialPayload ? initialPayload.multiResult : null);

  const savedPayloadRef = useRef(JSON.stringify(initialPayload ?? null));
  useEffect(() => {
    if (!initialPayload || singleTree || multiResult || loading) return;
    savedPayloadRef.current = JSON.stringify(initialPayload);
    if ('tree' in initialPayload) setSingleTree(initialPayload.tree);
    else setMultiResult(initialPayload.multiResult);
  }, [initialPayload, singleTree, multiResult, loading]);
  useEffect(() => {
    if (loading || mode !== 'ai') return;
    const payload = multiResult ? { multiResult } : singleTree ? { tree: singleTree } : null;
    if (!payload) return;
    const serialized = JSON.stringify(payload);
    if (serialized === savedPayloadRef.current) return;
    savedPayloadRef.current = serialized;
    onSaveToStudio?.(payload);
  }, [singleTree, multiResult, loading, mode, onSaveToStudio]);

  const [userTree, setUserTree] = useState<MindMapNode>(() => ({ id: 'root', label: '中心主题', children: [] }));
  const [evaluateResult, setEvaluateResult] = useState<{
    feedback: string;
    suggestedNodes: Array<{ parentId: string; node: MindMapNode }>;
  } | null>(null);

  const isMulti = !!multiResult || (!singleTree && fileNames && fileNames.length > 1);

  const flowRef = useRef<MindMapFlowCanvasRef | null>(null);

  const handleGenerate = useCallback(() => {
    if (!pdfContent?.trim()) {
      setError('暂无内容');
      return;
    }
    setError(null);
    setLoading(true);
    if (isMulti && fileNames && fileNames.length > 0) {
      generateMindMapMulti(pdfContent, fileNames)
        .then((res) => {
          if (res) { setMultiResult(res); setSingleTree(null); setActiveDocument(0); }
          else setError('生成失败，请重试');
        })
        .catch(() => setError('生成失败，请重试'))
        .finally(() => setLoading(false));
    } else {
      generateMindMap(pdfContent)
        .then((tree) => {
          if (tree) { setSingleTree(tree); setMultiResult(null); }
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
  const visiblePart = flowParts[Math.min(activeDocument, Math.max(0, flowParts.length - 1))];

  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyTarget, setModifyTarget] = useState<{ tree: MindMapNode; onApply: (t: MindMapNode) => void } | null>(null);
  const [modifyLoading, setModifyLoading] = useState(false);
  const openModifyDialog = useCallback((tree: MindMapNode, onApply: (t: MindMapNode) => void) => {
    setModifyTarget({ tree, onApply });
    setModifyInstruction('');
    setError(null);
    setModifyDialogOpen(true);
  }, []);
  const handleModifySubmit = useCallback(() => {
    if (!modifyTarget?.tree || !modifyInstruction.trim()) return;
    setModifyLoading(true);
    setError(null);
    modifyMindMap(modifyTarget.tree, modifyInstruction.trim(), pdfContent ?? undefined)
      .then((newTree) => {
        if (!newTree) { setError('修改未完成，原导图已保留。'); return; }
        modifyTarget.onApply(newTree);
        setModifyDialogOpen(false);
        setModifyTarget(null);
      })
      .catch(() => setError('修改未完成，原导图已保留。'))
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
    <div className="mm-panel">
      <header className="mm-header">
        <div className="mm-heading">
          <button type="button" className="mm-icon" onClick={onClose} aria-label="关闭思维导图"><X size={20} /></button>
          <GitBranch size={22} />
          <div><h1>思维导图</h1><p title={displayName ?? undefined}>{mode === 'build' ? '自己构建' : displayName || '从主题开始，逐层探索'}</p></div>
        </div>
        <div className="mm-header-actions">
          {hasFlowContent && <div className="mm-zoom-controls">
            <button className="mm-icon" onClick={() => flowRef.current?.zoomOut()} aria-label="缩小画布" title="缩小"><ZoomOut size={18} /></button>
            <button className="mm-icon" onClick={() => flowRef.current?.zoomIn()} aria-label="放大画布" title="放大"><ZoomIn size={18} /></button>
            <button className="mm-icon" onClick={() => flowRef.current?.resetViewport()} aria-label="收起到第一层并恢复阅读大小" title="回到第一层"><RotateCcw size={18} /></button>
            <button className="mm-icon" onClick={() => flowRef.current?.fitView()} aria-label="查看当前展开的全图" title="查看全图"><Maximize2 size={18} /></button>
          </div>}
          {mode === 'ai' && flowParts.length > 1 && <label className="mm-doc-picker"><span className="sr-only">选择文档导图</span><select value={Math.min(activeDocument, flowParts.length - 1)} onChange={e => setActiveDocument(Number(e.target.value))}>
            {flowParts.map((part, i) => <option key={part.scope} value={i}>{multiResult?.perDoc[i]?.fileName ?? part.tree.label}</option>)}
          </select></label>}
          <div className="mm-more">
            <button type="button" className="mm-button" aria-expanded={optionsOpen} aria-controls="mm-options" onClick={() => setOptionsOpen(v => !v)}><MoreHorizontal size={18} /><span>更多</span></button>
            {optionsOpen && <><button className="mm-menu-dismiss" aria-label="关闭更多选项" onClick={() => setOptionsOpen(false)} /><div className="mm-menu" id="mm-options" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOptionsOpen(false); } }}>
              <button disabled={loading || modifyLoading} onClick={() => { setMode(mode === 'ai' ? 'build' : 'ai'); setActiveDocument(0); setError(null); setOptionsOpen(false); }}>{mode === 'ai' ? '自己构建导图' : '返回资料导图'}</button>
              {hasFlowContent && onSaveToStudio && <button onClick={() => {
                if (mode === 'build') onSaveToStudio({ tree: userTree });
                else if (multiResult) onSaveToStudio({ multiResult });
                else if (singleTree) onSaveToStudio({ tree: singleTree });
                setOptionsOpen(false);
              }}>保存到已保存的内容</button>}
              {hasFlowContent && mode === 'ai' && <button disabled={!pdfContent?.trim() || loading} onClick={() => { setOptionsOpen(false); handleGenerate(); }}>重新生成导图（使用 AI）</button>}
              {visiblePart && <button disabled={loading || modifyLoading} onClick={() => {
                const part = visiblePart;
                openModifyDialog(part.tree, tree => part.handlers.onUpdate(part.tree.id, () => tree));
                setOptionsOpen(false);
              }}>修改当前导图（使用 AI）</button>}
              {mode === 'build' && <button disabled={!pdfContent?.trim() || loading} onClick={() => { setOptionsOpen(false); setInfoOpen(true); handleEvaluate(); }}>评判与补充（使用 AI）</button>}
              {(multiResult || evaluateResult) && <button onClick={() => { setInfoOpen(v => !v); setOptionsOpen(false); }}>文档关联与补充建议</button>}
            </div></>}
          </div>
        </div>
      </header>
      {error && <div className="mm-notice" role="alert">{error}<button className="mm-icon" onClick={() => setError(null)} aria-label="关闭提示"><X size={16} /></button></div>}
      {loading && <div className="mm-notice" role="status"><Loader2 size={16} className="animate-spin" />正在整理导图，请稍候…</div>}
      {infoOpen && <section className="mm-info">
        <div className="mm-details-heading"><h2>文档关联与补充建议</h2><button className="mm-icon" onClick={() => setInfoOpen(false)} aria-label="收起关联与建议"><ChevronDown size={18} /></button></div>
        {mode === 'ai' && multiResult?.crossDoc.map((link, i) => <div key={i}><h3>{link.docA} · {link.docB}</h3><ul>{link.similarities.map((s, j) => <li key={j}>{s}</li>)}</ul></div>)}
        {mode === 'build' && evaluateResult && <><p>{evaluateResult.feedback}</p>{evaluateResult.suggestedNodes.length > 0 && <><p>点击对应概念可查看并加入建议分支：</p><ul>{evaluateResult.suggestedNodes.map((s, i) => <li key={i}>{s.node.label}</li>)}</ul></>}</>}
      </section>}
      <main className="mm-main">
        {visiblePart ? <MindMapFlowCanvas key={visiblePart.scope} ref={flowRef} parts={[visiblePart]} /> : <div className="mm-empty">
          <div className="mm-empty-symbol"><GitBranch size={36} /></div>
          <span className="mm-eyebrow">MIND MAP</span>
          <h2>先看全貌，再沿着分支探索</h2>
          <p>{isMulti ? `把所选 ${fileNames?.length ?? 0} 份资料整理为各自的导图，并保留文档间的关联。` : '把这份资料的主题与概念连起来，点击分支，逐层展开。'}</p>
          <button className="mm-primary" disabled={!pdfContent?.trim() || loading} onClick={handleGenerate}>{loading ? <Loader2 size={18} className="animate-spin" /> : <GitBranch size={18} />}{loading ? '正在生成…' : '生成思维导图'}</button>
          <small>生成会使用 AI；浏览已有导图无需重新生成。</small>
          {!pdfContent?.trim() && <small>尚未取得资料正文，请返回选择资料。</small>}
        </div>}
      </main>

      {modifyDialogOpen && (
        <div className="fixed inset-0 z-[400] bg-black/40 flex items-center justify-center p-4" role="presentation" onClick={() => !modifyLoading && setModifyDialogOpen(false)}>
          <div
            className="mm-modify-dialog w-full max-w-md p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mindmap-modify-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="mindmap-modify-dialog-title" className="font-bold text-slate-800 text-lg mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> 让 AI 修改思维导图
            </h3>
            <p className="text-slate-600 text-sm mb-3">描述你希望的修改，例如：增加一节关于 XX、删掉某分支、简化、或翻译成英文。</p>
            {error && <p className="mm-modify-error" role="alert">{error}</p>}
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
                className="mm-primary"
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
