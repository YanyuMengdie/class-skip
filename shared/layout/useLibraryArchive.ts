import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CloudSession } from '@/types';
import type { WorkspaceUser } from '@/services/workspaceUser';
import { changeSessionArchive, undoSessionArchive, type ArchiveChange, type ArchivePatch } from '@/services/libraryArchiveService';
import { archiveBatchTargets } from '@/features/library/archive';
import { runLibraryBatch } from './libraryBatch';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
export function useLibraryArchive(user: WorkspaceUser | null, sessions: CloudSession[], setSessions: Dispatch<SetStateAction<CloudSession[]>>) {
  const { text } = useAppLanguage();
  const owner = useRef(user?.uid); owner.current = user?.uid;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<{ owner: string; changes: ArchiveChange[] } | null>(null);
  useEffect(() => { setNotice(''); setUndo(null); }, [user?.uid]);
  const apply = (patches: ArchivePatch[]) => setSessions(rows => rows.map(row => {
    const patch = patches.find(p => p.id === row.id); return patch ? { ...row, ...patch } : row;
  }));
  const change = async (ids: string[], archived: boolean) => {
    if (!user || lock.current) throw new Error('Please wait.');
    const uid = user.uid; lock.current = true; setBusy(true); setNotice('');
    const changes: ArchiveChange[] = [];
    const targets = archived ? archiveBatchTargets(ids, sessions) : new Map(ids.map(id => [id, id]));
    try {
      const saved = await runLibraryBatch([...new Set(targets.values())], async id => {
        const patches = await changeSessionArchive(user, id, archived);
        if (owner.current === uid) { apply(patches); changes.push(...patches); }
      }, () => owner.current === uid);
      const result = {
        completedIds: ids.filter(id => saved.completedIds.includes(targets.get(id)!)),
        failedIds: ids.filter(id => !saved.completedIds.includes(targets.get(id)!)),
      };
      if (owner.current === uid) {
        setUndo(changes.length ? { owner: uid, changes } : null);
        setNotice(text(`${archived ? '已归档' : '已恢复'} ${result.completedIds.length} 项${result.failedIds.length ? `，${result.failedIds.length} 项未完成，请重试` : ''}。`,
          `${result.completedIds.length} items ${archived ? 'archived' : 'restored'}${result.failedIds.length ? `; ${result.failedIds.length} failed. Please retry` : ''}.`));
      }
      return result;
    } finally { lock.current = false; setBusy(false); }
  };
  const undoLast = async () => {
    if (!user || lock.current || undo?.owner !== user.uid) return;
    const uid = user.uid; lock.current = true; setBusy(true);
    try {
      const changes = [...undo.changes].reverse();
      const result = await runLibraryBatch(changes.map(c => c.id), async id => {
        const patch = await undoSessionArchive(user, changes.find(c => c.id === id)!);
        if (owner.current === uid) apply(patch);
      }, () => owner.current === uid);
      if (owner.current === uid) {
        setUndo(null);
        setNotice(result.failedIds.length ? text('部分归档状态已变化，未覆盖新的操作。请刷新资料库查看。', 'Some archive states have changed. Newer actions were kept. Refresh your library.') : text('已撤销，资料和记录都还在。', 'Undone. Your material and history are kept.'));
      }
    } finally { lock.current = false; setBusy(false); }
  };
  return { busy, notice, canUndo: undo?.owner === user?.uid && !!undo, change, undoLast, dismiss: () => setNotice('') };
}
