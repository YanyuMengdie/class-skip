import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Folder, FolderInput, FolderOutput, Loader2, MoreHorizontal, Search, X } from 'lucide-react';
import type { CloudSession } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { getFolderPath } from './libraryFolders';
import './libraryFileActions.css';

interface LibraryFileActionsProps {
  file: CloudSession;
  folders: CloudSession[];
  inFolder: boolean;
  disabled?: boolean;
  onMove: (fileId: string, parentId: string | null) => Promise<void>;
}

export function LibraryFileActions({ file, folders, inFolder, disabled, onMove }: LibraryFileActionsProps) {
  const { text } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef(false);
  const id = useId();
  const folderPaths = new Map(folders.map(folder => [
    folder.id,
    getFolderPath(folder.id, folders).map(part => part.customTitle || part.fileName).join(' / '),
  ]));
  const currentPath = file.parentId ? folderPaths.get(file.parentId) : undefined;
  const searchPath = search.trim().toLocaleLowerCase().replace(/\s*\/\s*/g, '/');
  const destinations = folders.filter(folder => folder.id !== file.parentId && (folderPaths.get(folder.id) || '').toLocaleLowerCase().replace(/\s*\/\s*/g, '/').includes(searchPath));
  const selectedFolder = folders.find(folder => folder.id === selected && folder.id !== file.parentId);
  const closeMenu = () => { setOpen(false); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!requestRef.current && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); if (!requestRef.current) closeMenu(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (choosing && dialog && !dialog.open) dialog.showModal();
    if (!choosing && dialog?.open) { dialog.close(); triggerRef.current?.focus(); }
  }, [choosing]);

  const move = async (parentId: string | null) => {
    if (requestRef.current || disabled || (file.parentId ?? null) === parentId) return;
    requestRef.current = true;
    setPending(true); setError('');
    try {
      await onMove(file.id, parentId);
      setChoosing(false); setOpen(false);
      triggerRef.current?.focus();
    } catch {
      setError(text('移动失败，资料还在原位置，请重试。', 'Could not move this PDF. It is still in its original folder. Please retry.'));
    } finally { requestRef.current = false; setPending(false); }
  };

  return <div className={`library-file-actions${open ? ' is-open' : ''}`} ref={menuRef}>
    <button ref={triggerRef} type="button" className="library-file-actions-trigger" aria-label={text(`管理资料 ${file.customTitle || file.fileName}`, `Manage ${file.customTitle || file.fileName}`)}
      title={text('管理资料', 'Manage PDF')} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} disabled={disabled || pending}
      onClick={() => { setError(''); setOpen(value => !value); }}>
      {pending ? <Loader2 size={18} className="library-file-spin" /> : <MoreHorizontal size={20} />}
    </button>
    {open && <div id={`${id}-menu`} className="library-file-menu" role="menu" aria-label={text('资料操作', 'PDF actions')}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <button type="button" role="menuitem" disabled={disabled || pending} onClick={() => { setSelected(null); setSearch(''); setError(''); setOpen(false); setChoosing(true); }}>
        <FolderInput size={17} /><span>{text('移动到其他文件夹', 'Move to another folder')}</span>
      </button>
      {file.parentId && <button type="button" role="menuitem" disabled={disabled || pending} onClick={() => void move(null)}>
        <FolderOutput size={17} /><span>{inFolder ? text('移出当前文件夹', 'Remove from this folder') : text('移出所属文件夹', 'Remove from its folder')}</span>
      </button>}
      {error && <p className="library-file-error" role="alert">{error}</p>}
    </div>}

    <dialog ref={dialogRef} className="library-move-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); if (!pending) setChoosing(false); }}
      onClick={event => { if (event.target === event.currentTarget && !pending) setChoosing(false); }}>
      <div className="library-move-content">
        <header><span className="library-move-icon"><FolderInput size={22} /></span><button type="button" aria-label={text('关闭', 'Close')} disabled={pending} onClick={() => setChoosing(false)}><X size={20} /></button></header>
        <h2 id={`${id}-title`}>{text('把资料放到哪里？', 'Where should this PDF go?')}</h2>
        <p className="library-move-filename" title={file.fileName}>{file.customTitle || file.fileName}</p>
        <p id={`${id}-description`} className="library-move-description">{text('移动后，学习记录和笔记都会保留。', 'Your learning history and notes stay with this PDF.')}</p>
        <p className="library-move-current" title={currentPath}>{text('当前位置：', 'Current location: ')}{currentPath || (file.parentId ? text('所属文件夹', 'Its current folder') : text('未分类 · 全部资料', 'Unfiled · All materials'))}</p>
        <label className="library-move-search"><Search size={16} /><input autoFocus value={search} disabled={pending} onChange={event => setSearch(event.target.value)} placeholder={text('找一个文件夹', 'Find a folder')} aria-label={text('搜索目标文件夹', 'Search destination folders')} /></label>
        <div className="library-move-destinations" role="group" aria-label={text('选择目标文件夹', 'Choose destination folder')}>
          {destinations.map(folder => <button type="button" key={folder.id} disabled={pending} aria-pressed={selected === folder.id} className={selected === folder.id ? 'is-selected' : ''} onClick={() => setSelected(folder.id)}>
            <Folder size={19} /><span title={folderPaths.get(folder.id)}>{folderPaths.get(folder.id)}</span>{selected === folder.id && <Check size={18} />}
          </button>)}
          {!destinations.length && <p className="library-move-empty">{search.trim() ? text('没有找到这个文件夹。', 'No matching folder.') : text('还没有其他文件夹，可以先在资料库新建一个。', 'Create another folder in the library first.')}</p>}
        </div>
        {error && <p className="library-file-error" role="alert">{error}</p>}
        <footer><button type="button" disabled={pending} onClick={() => setChoosing(false)}>{text('取消', 'Cancel')}</button><button type="button" className="library-move-confirm" disabled={pending || disabled || !selectedFolder} onClick={() => selectedFolder && void move(selectedFolder.id)}>
          {pending ? <Loader2 size={16} className="library-file-spin" /> : <FolderInput size={16} />}{pending ? text('正在移动', 'Moving…') : text('移动到这里', 'Move here')}
        </button></footer>
      </div>
    </dialog>
  </div>;
}
