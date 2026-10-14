/** Archive is inherited through folders; it never changes identity, location or study data. */
export interface ArchiveItem { id?: string; parentId?: string | null; type: string; archived?: boolean; }
export function archivedAncestor(item: ArchiveItem, items: ArchiveItem[]): ArchiveItem | undefined {
  const folders = new Map(items.filter(i => i.type === 'folder' && i.id).map(i => [i.id!, i]));
  const visited = new Set<string>();
  let current: ArchiveItem | undefined = item;
  while (current) {
    if (current.archived === true) return current;
    if (!current.parentId || visited.has(current.parentId)) return undefined;
    visited.add(current.parentId);
    current = folders.get(current.parentId);
  }
}
export const isArchived = (item: ArchiveItem, items: ArchiveItem[]): boolean => !!archivedAncestor(item, items);
export function activeLibraryItems<T extends ArchiveItem>(items: T[]): T[] {
  return items.filter(item => !isArchived(item, items));
}
/** Archive root shows folders once, with their contents inside, and individually archived PDFs. */
export function archiveRoots<T extends ArchiveItem>(items: T[]): T[] {
  return items.filter(item => item.archived === true && !isArchived({ ...item, archived: false }, items));
}
export function restoreArchiveIds(item: ArchiveItem, items: ArchiveItem[]): string[] {
  const map = new Map(items.filter(i => i.id).map(i => [i.id!, i]));
  const ids: string[] = [], visited = new Set<string>();
  let current: ArchiveItem | undefined = item;
  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.archived) ids.push(current.id);
    current = current.parentId ? map.get(current.parentId) : undefined;
    if (current?.type !== 'folder') break;
  }
  return ids;
}
/** Selecting a folder and its contents must not create separate archive flags on every child. */
export function archiveBatchTargets(ids: string[], items: ArchiveItem[]): Map<string, string> {
  const selected = new Set(ids), map = new Map(items.filter(i => i.id).map(i => [i.id!, i]));
  return new Map([...selected].map(id => {
    let target = id, row = map.get(id), seen = new Set<string>();
    while (row?.parentId && !seen.has(row.parentId)) {
      seen.add(row.parentId); row = map.get(row.parentId);
      if (row?.type !== 'folder') break;
      if (row.id && selected.has(row.id)) target = row.id;
    }
    return [id, target];
  }));
}
