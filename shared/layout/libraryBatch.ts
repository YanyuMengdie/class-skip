export interface LibraryBatchResult { completedIds: string[]; failedIds: string[] }

/** Record each outcome so retrying never repeats a successful deletion or move. */
export async function runLibraryBatch(
  ids: string[],
  apply: (id: string) => Promise<void>,
  isCurrent: () => boolean,
): Promise<LibraryBatchResult> {
  const unique = [...new Set(ids)];
  const result: LibraryBatchResult = { completedIds: [], failedIds: [] };
  for (let index = 0; index < unique.length; index++) {
    if (!isCurrent()) { result.failedIds.push(...unique.slice(index)); break; }
    const id = unique[index];
    try { await apply(id); result.completedIds.push(id); }
    catch { result.failedIds.push(id); }
  }
  return result;
}
