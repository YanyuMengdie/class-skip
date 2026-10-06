import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db, currentStudyRevision } from './firebase';
import { isLocalId } from './localWorkspace';

const writer = crypto.randomUUID();
const leaseMs = 180_000;
const lockRef = (id: string) => doc(db, 'sessions', id, 'data', 'reading-generation-lock');
export type ReadingLease = { assert: () => Promise<void>; release: () => Promise<void> };

/** Document-wide lease also protects whole-document snapshots when different tabs generate. */
export async function acquireReadingLease(id: string): Promise<ReadingLease> {
  if (!navigator.onLine) throw new Error('当前离线，问题草稿已保留。请联网后再发送。');
  if (isLocalId(id)) return { assert: async () => {}, release: async () => {} };
  const owner = auth.currentUser?.uid;
  if (!owner) throw new Error('请先登录。');
  const token = crypto.randomUUID();
  let lost = false;
  const guard = () => {
    if (auth.currentUser?.uid !== owner || lost)
      throw new Error('生成状态已中断，原记录仍然保留。请重新打开这份资料后继续。');
  };
  const claim = async (renew = false) =>
    runTransaction(db, async (tx) => {
      guard();
      const ref = lockRef(id);
      const lock = (await tx.get(ref)).data();
      const now = Date.now();
      if (renew) {
        if (lock?.token !== token || lock.expiresAt <= now)
          throw new Error('领读生成锁已失效，请重试。');
      } else {
        const head = (await tx.get(doc(db, 'sessions', id, 'data', 'state-v2'))).data();
        if ((head?.revision ?? null) !== (currentStudyRevision(id) ?? null))
          throw new Error('另一端有新的领读记录，正在同步，请稍后再试。');
        if (lock?.expiresAt > now) throw new Error('另一端正在生成这份资料的解析，请等它完成。');
      }
      tx.set(ref, { writer, token, expiresAt: now + leaseMs });
    });
  await claim();
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
  const publish = () => busy(isOther && expiresAt > Date.now());
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
      if (!isOther) changed();
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
