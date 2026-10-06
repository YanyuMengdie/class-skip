import type { CloudSession, PersistedSkimSession } from '@/types';

function uploadedAt(value: CloudSession['createdAt']): number {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The upload window is fixed before checking progress; never refill with older PDFs. */
export function recentStudyPdfs(sessions: CloudSession[]): CloudSession[] {
  return sessions
    .filter((session) => session.type === 'file' && /\.pdf$/i.test(session.fileName.trim()))
    .sort((a, b) => uploadedAt(b.createdAt) - uploadedAt(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, 10);
}

function finishedSession(session: PersistedSkimSession): boolean {
  if (session.studyStyle === 'records') {
    const deck = session.recordDeck;
    return (
      !!deck?.orderedCardIds.length &&
      deck.orderedCardIds.every((id) => deck.cards[id]?.status === 'completed')
    );
  }
  if (session.studyStyle === 'case') {
    const episodes = session.caseLearning?.plan?.episodes;
    return !!episodes?.length && episodes.every((episode) => episode.status === 'completed');
  }
  // Continuous and legacy reading do not have an explicit document completion marker.
  // Visiting the last page or receiving a closing AI message is not evidence of completion.
  return false;
}

export function isStudyPdfFinished(file: CloudSession): boolean {
  return (file.skimSessions ?? []).some(
    (session) =>
      session.pageRangeStart == null && session.pageRangeEnd == null && finishedSession(session),
  );
}

/** Resume a saved session by copying only navigation fields; retain every message and other session. */
export function prepareQuickStudy(file: CloudSession, blank: PersistedSkimSession): CloudSession {
  const sessions = file.skimSessions?.length
    ? [...file.skimSessions]
    : [
        {
          ...blank,
          studyMap: file.studyMap ?? null,
          messages: file.skimMessages ?? [],
          stage: file.skimStage ?? 'diagnosis',
          quizData: file.quizData ?? null,
          topHeight: file.skimTopHeight ?? blank.topHeight,
          focusMode: file.skimFocusMode ?? false,
        },
      ];
  let index = file.activeSkimIndex ?? 0;
  if (!sessions[index]) index = 0;
  if (finishedSession(sessions[index])) {
    const unfinished = sessions.findIndex((session) => !finishedSession(session));
    if (unfinished >= 0) index = unfinished;
  }
  let session = { ...sessions[index], skipDiagnosis: true };
  let page = file.currentIndex ?? 0;
  const deck = session.recordDeck;
  if (session.studyStyle === 'records' && deck?.orderedCardIds.length) {
    const unfinished = deck.orderedCardIds
      .map((id) => deck.cards[id])
      .filter((card) => card && card.status !== 'completed');
    const active = unfinished.find((card) => card.id === deck.activeCardId);
    const card =
      active ?? [...unfinished].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
    if (card) {
      page = Math.max(card.pageStart, Math.min(card.lastPage || card.pageStart, card.pageEnd)) - 1;
      session = {
        ...session,
        stage: 'reading',
        recordDeck: {
          ...deck,
          view: 'reader',
          activeCardId: card.id,
          selectedModuleIndex: card.moduleIndex,
          cards: {
            ...deck.cards,
            [card.id]: { ...card, status: 'in_progress', lastOpenedAt: Date.now() },
          },
        },
      };
    }
  } else if (session.studyStyle === 'case' && session.caseLearning?.plan) {
    const learning = session.caseLearning;
    const unfinished = learning.plan!.episodes.filter((episode) => episode.status !== 'completed');
    const episode =
      unfinished.find((item) => item.id === learning.activeEpisodeId) ??
      unfinished.find((item) => item.status === 'in_progress') ??
      unfinished[0];
    if (episode) {
      session = { ...session, caseLearning: { ...learning, activeEpisodeId: episode.id } };
      page = Math.max(0, (episode.lastPage || episode.pageRefs[0] || learning.pageStart) - 1);
    }
  } else if (session.studyStyle !== 'case' && session.messages.length > 0) {
    session = { ...session, stage: 'reading' };
    page = session.continuousLastPage != null ? Math.max(0, session.continuousLastPage - 1) : page;
  }
  sessions[index] = session;
  return {
    ...file,
    skimSessions: sessions,
    activeSkimIndex: index,
    currentIndex: page,
    viewMode: 'skim',
  };
}
