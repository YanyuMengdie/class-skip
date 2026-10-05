import { doc, getDocFromServer, runTransaction, writeBatch, type Firestore } from 'firebase/firestore';
import { localList, localPut } from '../localWorkspace';
import { byteLength, CloudRecordError, validateManifest } from './chunks';
import { CloudStudyRecord, type RecordBackend, type StudyDraft } from './recordStore';

export function createFirestoreStudyRecord(db: Firestore, owner: string, sessionId: string,
  assertOwner: () => void, readLegacy: RecordBackend['readLegacy'], namespace = '') {
  if (namespace && !/^module-review-[a-f0-9]{64}-$/.test(namespace)) throw new Error('Invalid review namespace.');
  const at = (name: string) => doc(db, 'sessions', sessionId, 'data', `${namespace}${name}`);
  const draftBucket = `cloudStudyDrafts/${owner}/${sessionId}${namespace ? `/${namespace}` : ''}`;
  const backend: RecordBackend = {
    async readHead() {
      assertOwner();
      const snapshot = await getDocFromServer(at('state-v2'));
      return snapshot.exists() ? snapshot.data() : null;
    },
    async readLegacy() { assertOwner(); return readLegacy(); },
    async readChunk(hash) {
      assertOwner();
      const snapshot = await getDocFromServer(at(`chunk-${hash}`));
      if (!snapshot.exists()) return null;
      try { return JSON.parse(snapshot.data().payload); }
      catch { throw new CloudRecordError('incomplete', '云端分块无法读取，原记录未改动。'); }
    },
    async writeChunks(nodes) {
      const entries = [...nodes];
      // At most ~4 MiB per request, below Firestore's 10 MiB request limit.
      for (let offset = 0; offset < entries.length; offset += 8) {
        assertOwner(); const batch = writeBatch(db);
        for (const [hash, chunk] of entries.slice(offset, offset + 8)) {
          const payload = JSON.stringify(chunk);
          if (byteLength(payload) > 600_000) throw new CloudRecordError('incomplete', '分块大小异常，已停止保存。');
          batch.set(at(`chunk-${hash}`), { payload });
        }
        await batch.commit();
      }
    },
    async commit(manifest, expectedRevision, meta) {
      assertOwner();
      await runTransaction(db, async tx => {
        assertOwner();
        const root = doc(db, 'sessions', sessionId);
        const rootSnapshot = await tx.get(root);
        const current = await tx.get(at('state-v2'));
        if (!rootSnapshot.exists() || rootSnapshot.data().userId !== owner) throw new Error('资料已删除或当前账号无权保存。');
        const actualRevision = current.exists() ? validateManifest(current.data()).revision : null;
        if (actualRevision !== expectedRevision) throw new CloudRecordError('conflict', '另一处刚保存了新进度。本机副本已保留，已暂停覆盖云端记录。');
        tx.set(at(`revision-${manifest.revision}`), manifest);
        tx.set(at('state-v2'), manifest);
        if (Object.keys(meta).length) tx.update(root, meta);
      });
    },
    drafts: () => localList<StudyDraft>(draftBucket),
    backup: draft => localPut(draftBucket, draft.id, draft),
  };
  return new CloudStudyRecord(backend);
}
