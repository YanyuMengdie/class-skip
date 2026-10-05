import { moduleReviewCloudRecord } from '@/services/firebase';
import { isLocalId, localGet, localPut } from '@/services/localWorkspace';
import type { ModuleReviewRecord } from './types';
import { validateStoredRecord } from './model';

/** Isolated from old reading/practice state; cloud records use independent chunk manifests. */
export function reviewStorage(userId: string, sessionId: string | undefined, key: string) {
  const cloud =
    userId !== 'local' && sessionId && !isLocalId(sessionId)
      ? moduleReviewCloudRecord(sessionId, key)
      : null;
  const bucket = `moduleReview/${userId}`;
  let queue: Promise<unknown> = Promise.resolve();
  let ready = false;
  return {
    cloud: !!cloud,
    async load(): Promise<ModuleReviewRecord | null> {
      const raw = cloud ? (await cloud.read()).review : await localGet(bucket, key);
      const value = raw == null ? null : validateStoredRecord(raw, key);
      ready = true;
      return value;
    },
    save(value: ModuleReviewRecord): Promise<void> {
      if (!ready)
        return Promise.reject(
          new Error('Load review records before saving. / 请先成功读取复习记录。'),
        );
      const snapshot = structuredClone(value);
      const next = queue
        .catch(() => {})
        .then(async () => {
          if (cloud) await cloud.save({ review: snapshot });
          else await localPut(bucket, key, snapshot);
        });
      queue = next;
      return next;
    },
  };
}
