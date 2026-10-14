import { doc, runTransaction, collection, query, where, onSnapshot } from 'firebase/firestore';
import type { CloudSession } from '@/types';
import type { WorkspaceUser } from './workspaceUser';
import { isLocalUser } from './workspaceUser';
import { auth, db, getUserSessions } from './firebase';
import { mutateLocalSessionMetadata } from './localWorkspace';
import { restoreArchiveIds } from '@/features/library/archive';
export interface ArchiveChange { id: string; before: boolean; archived: boolean; archiveRevision: string; }
export type ArchivePatch = Pick<CloudSession, 'archived' | 'archiveRevision'> & { id: string };
/** Metadata-only transactions do not read/write the study snapshot or its version. */
async function mutate(user: WorkspaceUser, id: string, plan: (rows: CloudSession[]) => ArchivePatch[]) {
  if (isLocalUser(user)) {
    const patches = await mutateLocalSessionMetadata(plan);
    window.dispatchEvent(new Event('library-archive-changed'));
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('class-skip-library'); channel.postMessage('changed'); channel.close(); }
    return patches;
  }
  if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed.');
  return runTransaction(db, async tx => {
    const rows: CloudSession[] = [], seen = new Set<string>();
    let next: string | null = id;
    while (next && !seen.has(next)) {
      seen.add(next);
      const snap = await tx.get(doc(db, 'sessions', next));
      if (!snap.exists()) { if (!rows.length) throw new Error('Material unavailable.'); break; }
      const row = { ...snap.data(), id: next } as CloudSession;
      if (row.userId !== user.uid) throw new Error('Material unavailable.');
      rows.push(row); next = row.parentId ?? null;
      if (seen.size > 100) throw new Error('Folder hierarchy is too deep.');
    }
    const patches = plan(rows);
    if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed.');
    for (const { id, ...fields } of patches) tx.update(doc(db, 'sessions', id), fields);
    return patches;
  });
}
export async function changeSessionArchive(user: WorkspaceUser, id: string, archived: boolean): Promise<ArchiveChange[]> {
  const changes: ArchiveChange[] = [];
  await mutate(user, id, rows => {
    changes.length = 0; // Firestore can rerun this callback after a concurrent metadata update.
    const item = rows.find(row => row.id === id);
    if (!item || item.userId !== user.uid) throw new Error('Material unavailable.');
    const ids = archived ? [id] : restoreArchiveIds(item, rows);
    return ids.flatMap(id => {
      const row = rows.find(item => item.id === id)!;
      if (!!row.archived === archived) return [];
      const change = { id, before: !!row.archived, archived, archiveRevision: crypto.randomUUID() };
      changes.push(change);
      return [{ id, archived, archiveRevision: change.archiveRevision }];
    });
  });
  return changes;
}
export async function undoSessionArchive(user: WorkspaceUser, change: ArchiveChange): Promise<ArchivePatch[]> {
  return mutate(user, change.id, rows => {
    const row = rows.find(row => row.id === change.id);
    if (!row || row.userId !== user.uid || row.archiveRevision !== change.archiveRevision)
      throw new Error('Archive status has changed.');
    return [{ id: change.id, archived: change.before, archiveRevision: crypto.randomUUID() }];
  });
}

/** One account-scoped metadata listener keeps open desktop/mobile libraries in agreement. */
export function watchLibraryMetadata(user: WorkspaceUser, onRows: (rows: CloudSession[]) => void, onError: (error: Error) => void): () => void {
  if (isLocalUser(user)) {
    let active = true;
    const refresh = () => { void getUserSessions(user, { throwOnError: true }).then(rows => { if (active) onRows(rows); }).catch(error => { if (active) onError(error); }); };
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('library-archive-changed', refresh);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('class-skip-library');
    if (channel) channel.onmessage = refresh;
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('library-archive-changed', refresh); channel?.close(); };
  }
  return onSnapshot(query(collection(db, 'sessions'), where('userId', '==', user.uid)), snapshot => {
    if (auth.currentUser?.uid !== user.uid) return;
    const time = (v: any) => v?.toMillis?.() ?? (typeof v === 'number' ? v : (v?.seconds ?? 0) * 1000);
    onRows(snapshot.docs.map(snap => ({ ...snap.data(), id: snap.id, type: snap.data().type || 'file', parentId: snap.data().parentId || null } as CloudSession))
      .sort((a, b) => time(b.createdAt) - time(a.createdAt)));
  }, onError);
}
