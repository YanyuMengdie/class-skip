import type { LSAPContentMap } from '@/types';
import type {
  WorkspaceDialogueTurn,
  WorkspaceEvidenceAnnotation,
} from '@/features/exam/lib/examWorkspaceLsapKey';

export function makeWorkspaceTurnId(timestamp: number): string {
  return `workspace-turn-${timestamp}-${Math.random().toString(36).slice(2, 9)}`;
}

export function fallbackWorkspaceTurnId(
  turn: WorkspaceDialogueTurn,
  _index: number,
): string {
  return turn.id ?? `${turn.sessionKey ?? turn.kcId ?? 'workspace'}:${turn.timestamp}:${turn.role}`;
}

export function filterEvidenceAnnotationsForMap(
  annotations: WorkspaceEvidenceAnnotation[] | undefined,
  contentMap: LSAPContentMap,
): WorkspaceEvidenceAnnotation[] {
  const valid = new Map(contentMap.kcs.map((kc) => [kc.id, new Set((kc.atoms ?? []).map((atom) => atom.id))]));
  return (annotations ?? []).filter((annotation) => valid.get(annotation.kcId)?.has(annotation.atomId));
}

export function pendingRevisitCount(
  annotations: WorkspaceEvidenceAnnotation[],
  kcIds: Iterable<string>,
): number {
  const allowed = new Set(kcIds);
  return annotations.filter((annotation) => (
    annotation.kind === 'needs_review' &&
    annotation.revisitStatus !== 'resolved' &&
    allowed.has(annotation.kcId)
  )).length;
}

export function findDueRevisit(
  annotations: WorkspaceEvidenceAnnotation[],
  kcIds: Iterable<string>,
  currentUserTurnCount: number,
): WorkspaceEvidenceAnnotation | null {
  const allowed = new Set(kcIds);
  return [...annotations]
    .filter((annotation) => (
      annotation.kind === 'needs_review' &&
      annotation.revisitStatus === 'pending' &&
      allowed.has(annotation.kcId) &&
      currentUserTurnCount >= (annotation.deferUntilUserTurnCount ?? Number.MAX_SAFE_INTEGER)
    ))
    .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

export function upsertEvidenceAnnotation(
  annotations: WorkspaceEvidenceAnnotation[],
  next: WorkspaceEvidenceAnnotation,
): WorkspaceEvidenceAnnotation[] {
  const sameIndex = annotations.findIndex((annotation) => (
    annotation.kind === next.kind &&
    annotation.kcId === next.kcId &&
    annotation.atomId === next.atomId &&
    (annotation.turnId ?? '') === (next.turnId ?? '')
  ));
  if (sameIndex < 0) return [...annotations, next];
  return annotations.map((annotation, index) => index === sameIndex
    ? { ...annotation, ...next, id: annotation.id, createdAt: annotation.createdAt }
    : annotation);
}

export function resolveRevisit(
  annotations: WorkspaceEvidenceAnnotation[],
  annotationId: string,
  now = Date.now(),
): WorkspaceEvidenceAnnotation[] {
  return annotations.map((annotation) => annotation.id === annotationId
    ? { ...annotation, revisitStatus: 'resolved', updatedAt: now }
    : annotation);
}

export function deferRevisit(
  annotations: WorkspaceEvidenceAnnotation[],
  annotationId: string,
  currentUserTurnCount: number,
  now = Date.now(),
): WorkspaceEvidenceAnnotation[] {
  return annotations.map((annotation) => annotation.id === annotationId
    ? {
        ...annotation,
        revisitStatus: 'pending',
        deferUntilUserTurnCount: currentUserTurnCount + 2,
        updatedAt: now,
      }
    : annotation);
}
