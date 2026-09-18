import type { ExamMaterialLink } from '@/types';

/** Stable, local-only scope. These descriptors are never written to exams/examMaterials. */
export function createLectureReviewMaterial(userId: string, source: {
  cloudSessionId?: string | null;
  fileHash?: string | null;
  fileName: string;
}): ExamMaterialLink | null {
  const identity = source.cloudSessionId ? `cloud:${source.cloudSessionId}` : source.fileHash ? `local:${source.fileHash}` : '';
  if (!identity) return null;
  const scopeId = `lecture-review:${identity}`;
  return {
    id: scopeId,
    examId: scopeId, // Compatibility with the shared practice engine; not a Firebase exam ID.
    userId,
    sourceType: source.cloudSessionId ? 'sessionId' : 'fileHash',
    ...(source.cloudSessionId ? { cloudSessionId: source.cloudSessionId } : { fileHash: source.fileHash! }),
    fileName: source.fileName,
    addedAt: 0,
  };
}
