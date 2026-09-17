import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, PencilLine, Trash2 } from 'lucide-react';
import type { CloudSession } from '@/types';
import { getFolderPath } from './libraryFolders';

interface LibraryFolderTreeProps {
  folders: CloudSession[];
  activeFolderId: string;
  counts: Record<string, number>;
  deleting: boolean;
  onOpen: (folderId: string) => void;
  onRename: (folder: CloudSession) => void;
  onDelete: (folder: CloudSession) => void;
}

export function LibraryFolderTree({ folders, activeFolderId, counts, deleting, onOpen, onRename, onDelete }: LibraryFolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const children = useMemo(() => {
    const ids = new Set(folders.map(folder => folder.id));
    const result = new Map<string | null, CloudSession[]>();
    for (const folder of folders) {
      const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
      result.set(parent, [...(result.get(parent) ?? []), folder]);
    }
    return result;
  }, [folders]);

  useEffect(() => {
    const path = getFolderPath(activeFolderId, folders);
    setExpanded(previous => {
      const next = new Set(previous);
      path.forEach(folder => next.add(folder.id));
      return next;
    });
  }, [activeFolderId, folders]);

  const renderFolder = (folder: CloudSession, ancestors: Set<string>): React.ReactNode => {
    if (ancestors.has(folder.id)) return null;
    const path = new Set(ancestors).add(folder.id);
    const subfolders = children.get(folder.id) ?? [];
    const open = expanded.has(folder.id);
    const name = folder.customTitle || folder.fileName;
    return (
      <li key={folder.id}>
        <div className={`library-folder-row${activeFolderId === folder.id ? ' is-active' : ''}`}>
          {subfolders.length > 0 ? (
            <button type="button" className="library-folder-toggle" aria-expanded={open}
              aria-label={`${open ? '收起' : '展开'} ${name}`} onClick={() => setExpanded(previous => {
                const next = new Set(previous);
                if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
                return next;
              })}>
              <ChevronRight size={13} className={open ? 'is-expanded' : ''} />
            </button>
          ) : <span className="library-folder-toggle-spacer" />}
          <button type="button" className="library-folder-open" onClick={() => onOpen(folder.id)}
            aria-current={activeFolderId === folder.id ? 'page' : undefined}
            title={getFolderPath(folder.id, folders).map(item => item.customTitle || item.fileName).join(' / ')}>
            <Folder size={16} /><span>{name}</span>
            <small title="含子文件夹中的 PDF">{counts[folder.id] ?? 0}</small>
          </button>
          <button type="button" className="library-folder-rename" disabled={deleting}
            onClick={event => { event.stopPropagation(); onRename(folder); }}
            aria-label={`重命名文件夹 ${name}`} title={`重命名文件夹 ${name}`}>
            <PencilLine size={14} />
          </button>
          <button type="button" className="library-folder-delete" disabled={deleting}
            onClick={() => onDelete(folder)} aria-label={`删除文件夹 ${name}`} title="删除文件夹">
            <Trash2 size={13} />
          </button>
        </div>
        {open && subfolders.length > 0 && <ul>{subfolders.map(child => renderFolder(child, path))}</ul>}
      </li>
    );
  };

  return <ul className="library-folder-tree">{(children.get(null) ?? []).map(folder => renderFolder(folder, new Set()))}</ul>;
}
