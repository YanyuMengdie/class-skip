const legacyMirrors = new Set(['skimMessages', 'studyMap', 'skimStage', 'quizData', 'skimTopHeight', 'skimFocusMode']);

/** Keep old flat backups; a complete structured session list owns the current reading state. */
export function readingCloudPatch<T extends object>(data: T): Partial<T> {
  const sessions = (data as { skimSessions?: unknown }).skimSessions;
  if (!Array.isArray(sessions) || !sessions.length) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !legacyMirrors.has(key))) as Partial<T>;
}
