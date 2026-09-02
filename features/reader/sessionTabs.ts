export function getNextDefaultSessionSequence(
  titles: Iterable<string>,
  prefix: string,
): number {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`);
  let maximum = 0;
  for (const title of titles) {
    const match = title.trim().match(pattern);
    if (!match) continue;
    maximum = Math.max(maximum, Number(match[1]) || 0);
  }
  return maximum + 1;
}

export function getActiveIndexAfterDeletion<T extends { id: string }>(
  sessions: T[],
  activeIndex: number,
  deletedId: string,
): number {
  const activeId = sessions[activeIndex]?.id;
  const deletedIndex = sessions.findIndex((session) => session.id === deletedId);
  const remaining = sessions.filter((session) => session.id !== deletedId);
  if (remaining.length === 0) return 0;
  if (activeId && activeId !== deletedId) {
    const preservedIndex = remaining.findIndex((session) => session.id === activeId);
    if (preservedIndex >= 0) return preservedIndex;
  }
  return Math.min(Math.max(0, deletedIndex), remaining.length - 1);
}
