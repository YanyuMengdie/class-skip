import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db, currentStudyRevision, withCurrentStudyRevision } from './firebase';
import { isLocalId } from './localWorkspace';
import { ReadingSyncError } from './readingSyncStatus';

const writer = crypto.randomUUID();
const leaseMs = 180_000;
const lockRef = (id: string) => doc(db, 'sessions', id, 'data', 'reading-generation-lock');
export type ReadingLease = { assert: () => Promise<void>; release: () => Promise<void> };

/** Document-wide lease also protects whole-document snapshots when different tabs generate. */
export async function acquireReadingLease(id: string): Promise<ReadingLease> {
  if (!navigator.onLine) throw new ReadingSyncError('offline');
  if (isLocalId(id)) return { assert: async () => {}, release: async () => {} };
  const owner = auth.currentUser?.uid;
  if (!owner) throw new ReadingSyncError('signed-out');
  const token = crypto.randomUUID();
  let lost = false;
  const guard = () => {
    if (auth.currentUser?.uid !== owner || lost)
      throw new ReadingSyncError('lease-lost');
  };
  const claim = async (renew = false, expectedRevision: string | null = null) =>
    runTransaction(db, async (tx) => {
      guard();
      const ref = lockRef(id);
      const lock = (await tx.get(ref)).data();
      const now = Date.now();
      if (renew) {
        if (lock?.token !== token || lock.expiresAt <= now)
          throw new ReadingSyncError('lease-lost');
      } else {
        const head = (await tx.get(doc(db, 'sessions', id, 'data', 'state-v2'))).data();
        if ((head?.revision ?? null) !== expectedRevision)
          throw new ReadingSyncError('cloud-updated');
        if (lock?.expiresAt > now) throw new ReadingSyncError('reader-busy');
      }
      tx.set(ref, { writer, token, expiresAt: now + leaseMs });
    });
  await withCurrentStudyRevision(id, revision => claim(false, revision));
  const heartbeat = window.setInterval(() => {
    void claim(true).catch(() => {
      lost = true;
    });
  }, 30_000);
  return {
    assert: async () => {
      guard();
      await claim(true);
    },
    release: async () => {
      window.clearInterval(heartbeat);
      if (auth.currentUser?.uid !== owner) return;
      await runTransaction(db, async (tx) => {
        const ref = lockRef(id);
        if ((await tx.get(ref)).data()?.token === token) tx.delete(ref);
      }).catch(() => {
        /* A disconnected writer's lease expires without deleting another writer's lock. */
      });
    },
  };
}

export function observeReading(
  id: string,
  changed: () => void,
  busy: (value: boolean) => void,
  failed: (error: unknown) => void,
) {
  if (isLocalId(id)) return () => {};
  let expiresAt = 0;
  let isOther = false;
  let wasBusy = false;
  const publish = () => {
    const next = isOther && expiresAt > Date.now();
    busy(next);
    if (wasBusy && !next) changed();
    wasBusy = next;
  };
  const head = onSnapshot(
    doc(db, 'sessions', id, 'data', 'state-v2'),
    (snapshot) => {
      if (
        !snapshot.metadata.fromCache &&
        (snapshot.data()?.revision ?? null) !== currentStudyRevision(id)
      )
        changed();
    },
    failed,
  );
  const lock = onSnapshot(
    lockRef(id),
    (snapshot) => {
      const data = snapshot.data();
      isOther = !!data && data.writer !== writer;
      expiresAt = data?.expiresAt ?? 0;
      publish();
    },
    failed,
  );
  const timer = window.setInterval(publish, 10_000);
  return () => {
    head();
    lock();
    window.clearInterval(timer);
  };
}
