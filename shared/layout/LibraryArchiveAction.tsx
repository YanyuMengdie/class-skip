import React, { useState } from 'react';
import { Archive, ArchiveRestore, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
import './libraryArchive.css';
export function LibraryArchiveAction({ name, archived, disabled, onChange, onRename, onDelete }: {
  name: string; archived: boolean; disabled?: boolean; onRename?: () => void; onDelete?: () => void; onChange: () => Promise<unknown>;
}) {
  const { text } = useAppLanguage();
  const [error, setError] = useState(false);
  return <details className="library-archive-action">
    <summary aria-label={text(`管理 ${name}`, `Manage ${name}`)}><MoreHorizontal size={18}/></summary>
    <div><button type="button" disabled={disabled} onClick={async event => {
      const details = event.currentTarget.closest('details');
      setError(false);
      try { await onChange(); details?.removeAttribute('open'); } catch { setError(true); }
    }}>{archived ? <ArchiveRestore size={16}/> : <Archive size={16}/>}{archived ? text('恢复到原位置', 'Restore to original location') : text('归档', 'Archive')}</button>
    {onRename && <button disabled={disabled} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onRename(); }}><PencilLine size={16}/>{text('重命名', 'Rename')}</button>}
    {onDelete && <button disabled={disabled} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(); }}><Trash2 size={16}/>{text('删除文件夹', 'Delete folder')}</button>}
    {error && <small role="alert">{text('未能保存，请重试。', 'Could not save. Please retry.')}</small>}</div>
  </details>;
}
