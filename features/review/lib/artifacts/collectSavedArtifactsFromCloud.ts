import type { User } from 'firebase/auth';
import { fetchSessionDetails } from '@/services/firebase';
import type { CloudSession, SavedArtifact } from '@/types';

export interface CloudArtifactEntry {
  artifact: SavedArtifact;
  cloudSessionId: string;
  sourceDisplayName: string;
  provenance: 'cloud';
}

const DEFAULT_BATCH = 6;

function isFileSession(s: CloudSession): boolean {
  if (!s.id) return false;
  if (s.type === 'folder') return false;
  return s.type === 'file' || s.type == null;
}

/**
 * 从各云端会话的 data/main 拉取 savedArtifacts。
 * user 预留用于权限/审计；拉取范围由调用方传入的 sessions 决定。
 * 分批并发（默认每批 6 个 session），避免一次性 Promise.all 上百请求。
 * 单个 session 失败则 console.warn 并跳过。
 */
export async function collectSavedArtifactsFromCloudSessions(
  user: User,
  sessions: CloudSession[],
  options?: { signal?: AbortSignal; batchSize?: number }
): Promise<CloudArtifactEntry[]> {
  void user;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const candidates = sessions.filter(isFileSession);
  const out: CloudArtifactEntry[] = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    if (options?.signal?.aborted) break;
    const slice = candidates.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      slice.map(async (session) => {
        try {
          const detail = await fetchSessionDetails(session.id);
          if (options?.signal?.aborted) return [] as CloudArtifactEntry[];
          const arts = detail.savedArtifacts ?? [];
          const display = session.customTitle || session.fileName || '未命名';
          return arts.map(
            (artifact): CloudArtifactEntry => ({
              artifact,
              cloudSessionId: session.id,
              sourceDisplayName: display,
              provenance: 'cloud'
            })
          );
        } catch (e) {
          console.warn('[collectSavedArtifactsFromCloud] fetch failed for session', session.id, e);
          return [];
        }
      })
    );
    for (const arr of batchResults) out.push(...arr);
  }

  return out;
}
