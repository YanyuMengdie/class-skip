import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Folder, FolderInput, Loader2, Trash2, X } from 'lucide-react';
import type { CloudSession } from '@/types';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import { getFolderPath } from './libraryFolders';
import type { LibraryBatchResult } from './libraryBatch';
import './libraryFileActions.css';

interface Props {
  active: boolean;
  files: CloudSession[];
  folders: CloudSession[];
  total: number;
  disabled: boolean;
  onToggle: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: (ids: string[], action: 'move' | 'delete', parentId: string | null) => Promise<LibraryBatchResult>;
}

export function LibraryBulkActions({ active, files, folders, total, disabled, onToggle, onSelectAll, onClear, onApply }: Props) {
  const { text } = useAppLanguage();
  const [mode, setMode] = useState<'move' | 'delete' | null>(null);
  const [destination, setDestination] = useState<string | null | undefined>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const close = () => { if (!busy.current) setMode(null); };
  useEffect(() => {
    const dialog = dialogRef.current;
    if (mode && dialog && !dialog.open) dialog.showModal();
    if (!mode && dialog?.open) { dialog.close(); triggerRef.current?.focus(); }
  }, [mode]);
  useEffect(() => { if (!active && !busy.current) setMode(null); }, [active]);
  const open = (action: 'move' | 'delete', target: HTMLButtonElement) => {
    triggerRef.current = target; setDestination(undefined); setSearch(''); setError(''); setMode(action);
  };
  const destinations = [{ id: null, name: text('未分类 · 全部资料', 'Unfiled · All materials') }, ...folders.map(folder => ({
    id: folder.id, name: getFolderPath(folder.id, folders).map(item => item.customTitle || item.fileName).join(' / '),
  }))].filter(folder => folder.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const validDestination = destination !== undefined && (destination === null || folders.some(folder => folder.id === destination));
  const hasMoves = validDestination && files.some(file => (file.parentId ?? null) !== destination);
  const apply = async () => {
    if (busy.current || disabled || !mode || !files.length || (mode === 'move' && !hasMoves)) return;
    busy.current = true; setPending(true); setError('');
    try {
      const result = await onApply(files.map(file => file.id), mode, destination ?? null);
      if (result.failedIds.length) setError(text(
        `已完成 ${result.completedIds.length} 份，${result.failedIds.length} 份未完成。下方只保留未完成的资料，可以重试。`,
        `${result.completedIds.length} completed; ${result.failedIds.length} could not be completed. Only unfinished PDFs remain below for retry.`));
      else setMode(null);
    } catch {
      setError(text('操作未完成，请稍后重试。', 'Could not complete this action. Please retry.'));
    } finally { busy.current = false; setPending(false); }
  };
  return <>
    <div className="library-bulk-bar" aria-label={text('批量管理资料', 'Manage multiple PDFs')}>
      <button type="button" disabled={disabled || pending || (!active && !total)} aria-pressed={active} onClick={onToggle}>{active ? text('完成多选', 'Done selecting') : text('多选', 'Select multiple')}</button>
      {active && <>
        <strong role="status">{text(`已选 ${files.length} 份`, `${files.length} selected`)}</strong>
        <button type="button" disabled={disabled || pending || !total || files.length === total} onClick={onSelectAll}>{text('全选当前列表', 'Select all in this list')}</button>
        <button type="button" disabled={disabled || pending || !files.length} onClick={onClear}>{text('取消选择', 'Clear selection')}</button>
        <span className="library-bulk-spacer" />
        <button type="button" disabled={disabled || pending || !files.length} onClick={event => open('move', event.currentTarget)}><FolderInput size={16} />{text('移动所选', 'Move selected')}</button>
        <button type="button" className="library-bulk-delete" disabled={disabled || pending || !files.length} onClick={event => open('delete', event.currentTarget)}><Trash2 size={16} />{text('删除所选', 'Delete selected')}</button>
        <small>{text('只选择当前列表中的讲义；切换文件夹或搜索时会清空选择。', 'Select PDFs in this list. Changing folders or search clears the selection.')}</small>
      </>}
    </div>
    <dialog ref={dialogRef} className="library-move-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="library-move-content">
        <header><span className="library-move-icon">{mode === 'delete' ? <Trash2 size={22} /> : <FolderInput size={22} />}</span><button type="button" aria-label={text('关闭', 'Close')} disabled={pending} onClick={close}><X size={20} /></button></header>
        <h2 id={`${id}-title`}>{mode === 'delete' ? text(`删除这 ${files.length} 份资料？`, `Delete these ${files.length} PDFs?`) : text(`移动 ${files.length} 份资料`, `Move ${files.length} PDFs`)}</h2>
        <p id={`${id}-description`} className="library-move-description">{mode === 'delete'
          ? text('所选资料会从当前资料库删除，其下的学习记录将无法从这里恢复。电脑里的原始文件、其他资料和独立保存的复习记录会保留；关联的复习可能需要重新选择原文。此操作不可撤销。', 'Selected PDFs will be removed from this library, and their study history will no longer be recoverable here. Original computer files, other PDFs, and separate review records are kept. Linked reviews may need their sources selected again. This cannot be undone.')
          : text('统一移到下面选择的位置，学习记录和笔记都会保留。已在目标位置的资料保持原位。', 'Move these PDFs together. Learning history and notes are kept. PDFs already in the destination stay there.')}</p>
        {error && <p className="library-file-error" role="alert">{error}</p>}
        <ul className="library-bulk-files" aria-label={text('所选资料', 'Selected PDFs')}>{files.map(file => <li key={file.id}>{file.customTitle || file.fileName}</li>)}</ul>
        {mode === 'move' && <>
          <label className="library-move-search"><input autoFocus disabled={pending} value={search} onChange={event => setSearch(event.target.value)} placeholder={text('找一个文件夹', 'Find a folder')} aria-label={text('搜索目标文件夹', 'Search destination folders')} /></label>
          <div className="library-move-destinations" role="group" aria-label={text('选择目标文件夹', 'Choose destination folder')}>
            {destinations.map(folder => <button type="button" key={folder.id ?? 'root'} disabled={pending} aria-pressed={destination === folder.id} className={destination === folder.id ? 'is-selected' : ''} onClick={() => setDestination(folder.id)}><Folder size={18} /><span>{folder.name}</span>{destination === folder.id && <Check size={18} />}</button>)}
            {!destinations.length && <p className="library-move-empty">{text('没有找到这个文件夹。', 'No matching folder.')}</p>}
          </div>
        </>}
        <footer><button type="button" autoFocus={mode === 'delete'} disabled={pending} onClick={close}>{text('取消', 'Cancel')}</button><button type="button" className={mode === 'delete' ? 'library-delete-confirm' : 'library-move-confirm'} disabled={pending || disabled || !files.length || (mode === 'move' && !hasMoves)} onClick={() => void apply()}>
          {pending && <Loader2 size={16} className="library-file-spin" />}{pending ? text('正在处理…', 'Working…') : mode === 'delete' ? text('确认删除所选', 'Delete selected PDFs') : text('移动到这里', 'Move here')}
        </button></footer>
      </div>
    </dialog>
  </>;
}
