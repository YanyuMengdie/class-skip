import type { CloudSession } from '@/types';

/** Returns the known folder ancestry from parent to child, stopping at missing or repeated IDs. */
export function getFolderPath(
  folderId: string | null | undefined,
  folders: CloudSession[],
): CloudSession[] {
  const foldersById = new Map(folders.filter(folder => folder.type === 'folder').map(folder => [folder.id, folder]));
  const path: CloudSession[] = [];
  const visited = new Set<string>();
  let currentId = folderId;

  while (currentId && !visited.has(currentId)) {
    const folder = foldersById.get(currentId);
    if (!folder) break;
    visited.add(currentId);
    path.push(folder);
    currentId = folder.parentId;
  }

  return path.reverse();
}
