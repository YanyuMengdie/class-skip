import React, { useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Folder, Loader2, Search, X } from 'lucide-react';
import type { CloudSession } from '@/types';
import { getFolderPath } from '@/shared/layout/libraryFolders';

export function ReviewMaterialPicker({ sessions, loading, error, signedIn, toolLabel, hasCurrentDoc, currentDocName, currentSessionId,
  selectedIds, useCurrentDoc, onToggleFile, onToggleCurrent, onBack, onStart, onRetry, onLogin, onLibrary }: {
  sessions: CloudSession[]; loading: boolean; error: string; signedIn: boolean; toolLabel: string;
  hasCurrentDoc: boolean; currentDocName: string | null; currentSessionId?: string | null;
  selectedIds: Set<string>; useCurrentDoc: boolean;
  onToggleFile: (id: string) => void; onToggleCurrent: () => void; onBack: () => void; onStart: () => void;
  onRetry: () => void; onLogin?: () => void; onLibrary?: () => void;
}) {
  const [location, setLocation] = useState<{ kind: 'root' } | { kind: 'folder'; id: string } | { kind: 'other' }>({ kind: 'root' });
  const [query, setQuery] = useState('');
  const folders = sessions.filter(s => s.type === 'folder');
  const files = sessions.filter(s => s.type === 'file');
  const ids = new Set(folders.map(f => f.id));
  const currentFolder = location.kind === 'folder' ? folders.find(f => f.id === location.id) : undefined;
  const inOther = location.kind === 'other';
  const atRoot = !currentFolder && !inOther;
  const search = query.trim().toLocaleLowerCase();
  const name = (s: CloudSession) => s.customTitle || s.fileName;
  const path = getFolderPath(currentFolder?.id, folders);
  const otherFiles = files.filter(f => !f.parentId || !ids.has(f.parentId));
  const visibleFolders = (inOther ? [] : folders.filter(f => search ? name(f).toLocaleLowerCase().includes(search) : currentFolder ? f.parentId === currentFolder.id : !f.parentId || !ids.has(f.parentId))).sort((a, b) => name(a).localeCompare(name(b)));
  const visibleFiles = (search ? files.filter(f => name(f).toLocaleLowerCase().includes(search)) : inOther ? otherFiles : currentFolder ? files.filter(f => f.parentId === currentFolder.id) : []).sort((a, b) => name(a).localeCompare(name(b)));
  const showLocalFile = hasCurrentDoc && !files.some(f => f.id === currentSessionId) && (inOther || !!search && (currentDocName || '').toLocaleLowerCase().includes(search));
  const hasLocalFile = hasCurrentDoc && !files.some(f => f.id === currentSessionId);
  const selected = files.filter(f => selectedIds.has(f.id));
  const count = useCurrentDoc && hasCurrentDoc ? 1 : selected.length;
  const navigate = (next: typeof location) => { setLocation(next); setQuery(''); };
  const folderCount = (folder: CloudSession) => files.filter(f => getFolderPath(f.parentId, folders).some(p => p.id === folder.id)).length;
  const filePath = (file: CloudSession) => getFolderPath(file.parentId, folders).map(name).join(' / ') || '其他';
  return <section className="review-picker">
    <button type="button" onClick={onBack} className="review-back"><ChevronLeft size={16} />换一个工具</button>
    <div className="review-intro"><span className="review-eyebrow">{toolLabel} · 选择资料</span><h2>这次想用哪份资料？</h2><p>打开文件夹，再选择文件。也可以跨文件夹选择多份资料一起使用。</p></div>
    <div className="review-picker-toolbar"><label className="review-search"><Search size={18} /><input aria-label="搜索资料或文件夹" placeholder="找一份资料或文件夹" value={query} onChange={e => setQuery(e.target.value)} /></label>{onLibrary && <button type="button" className="review-back" onClick={onLibrary}>去资料库上传 <ArrowRight size={16} /></button>}</div>
    <nav className="review-breadcrumb" aria-label="资料位置"><button type="button" aria-current={atRoot ? 'page' : undefined} onClick={() => navigate({ kind: 'root' })}>全部文件夹</button>{path.map(f => <React.Fragment key={f.id}><ChevronRight size={14} /><button type="button" aria-current={f.id === currentFolder?.id ? 'page' : undefined} onClick={() => navigate({ kind: 'folder', id: f.id })}>{name(f)}</button></React.Fragment>)}{inOther && <><ChevronRight size={14} /><span>其他</span></>}{search && <span className="review-search-note">搜索全部资料</span>}</nav>
    {error && <div role="alert" className="review-notice">{error}<button type="button" onClick={onRetry}>重新读取</button></div>}
    {!signedIn && <div className="review-notice">登录后可查看云端文件夹。{hasCurrentDoc ? '当前打开的资料在“其他”里。' : ''}{onLogin && <button type="button" onClick={onLogin}>登录</button>}</div>}
    {loading ? <div className="review-empty"><Loader2 className="animate-spin" size={24} />正在读取文件夹…</div> : <>
      <div className="review-material-grid">
        {visibleFolders.map(f => <button type="button" className="review-material-card" key={f.id} onClick={() => navigate({ kind: 'folder', id: f.id })}><span className="review-folder-icon"><Folder size={24} strokeWidth={1.5} /></span><span className="review-material-copy"><strong>{name(f)}</strong><small>{folderCount(f)} 份资料{search ? ` · ${getFolderPath(f.parentId, folders).map(name).join(' / ') || '根目录'}` : ''}</small></span><ChevronRight size={17} /></button>)}
        {atRoot && !search && <button type="button" className="review-material-card" onClick={() => navigate({ kind: 'other' })}><span className="review-folder-icon"><Folder size={24} strokeWidth={1.5} /></span><span className="review-material-copy"><strong>其他</strong><small>{otherFiles.length + (hasLocalFile ? 1 : 0)} 份资料 · 未放入文件夹</small></span><ChevronRight size={17} /></button>}
        {visibleFiles.map(f => <button type="button" className={`review-material-card ${selectedIds.has(f.id) ? 'is-selected' : ''}`} aria-pressed={selectedIds.has(f.id)} key={f.id} onClick={() => onToggleFile(f.id)}><span className="review-file-icon"><FileText size={24} strokeWidth={1.5} /></span><span className="review-material-copy"><strong>{name(f)}</strong><small>{search ? filePath(f) : 'PDF 资料'}{f.id === currentSessionId ? ' · 当前已打开' : ''}</small></span><span className="review-selection-mark">{selectedIds.has(f.id) && <Check size={15} />}</span></button>)}
        {showLocalFile && <button type="button" className={`review-material-card ${useCurrentDoc ? 'is-selected' : ''}`} aria-pressed={useCurrentDoc} onClick={onToggleCurrent}><span className="review-file-icon"><FileText size={24} /></span><span className="review-material-copy"><strong>{currentDocName || '当前资料'}</strong><small>当前已打开</small></span><span className="review-selection-mark">{useCurrentDoc && <Check size={15} />}</span></button>}
      </div>
      {!visibleFolders.length && !visibleFiles.length && !showLocalFile && !(atRoot && !search) && <div className="review-empty">{search ? '没有找到匹配的资料或文件夹。' : '这个文件夹里还没有资料。'}</div>}
    </>}
    <footer className="review-picker-footer"><div className="review-selection-summary"><strong>已选 {count} 份资料</strong><div className="review-selection-chips">{useCurrentDoc ? <button type="button" onClick={onToggleCurrent}>{currentDocName || '当前资料'}<X size={13} /></button> : selected.map(f => <button type="button" key={f.id} onClick={() => onToggleFile(f.id)}>{name(f)}<X size={13} /></button>)}</div>{!count && <p>尚未选中资料，请先打开文件夹并选择文件。</p>}</div><button type="button" disabled={!count || loading} onClick={onStart} className="review-primary">使用所选资料 <ArrowRight size={17} /></button></footer>
  </section>;
}
