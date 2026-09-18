import type { User } from 'firebase/auth';
import type { CloudSession, Exam, ExamMaterialLink, CalendarEvent, Memo, JointReviewPack, TutorSession, TinyStudyEntrySession } from '@/types';
import { auth, createCloudFolder, uploadPDF, createCloudSession, updateCloudSessionState, createExam, addExamMaterialLink, addCalendarEvent, addMemo, createJointReviewPack, updateJointReviewPack, saveTutorSessionToCloud, saveTinyStudyEntrySessionToCloud } from './firebase';
import { localGet, localPut, localList, readLocalFile } from './localWorkspace';
import { createLectureReviewMaterial } from '@/features/exam/lib/lectureReviewScope';
import { computeExamWorkspaceLsapKey, loadWorkspaceLsapBundle } from '@/features/exam/lib/examWorkspaceLsapKey';
import { allReviewCaches, saveReviewCache, loadReviewCache } from '@/features/review/lib/reviewCache';

/** Explicit, resumable copy. Local originals remain; existing imported records are never overwritten. */
export async function syncLocalWorkspace(user: User, progress: (message: string) => void): Promise<void> {
  const map = await localGet<Record<string, string>>('cloudCopies', user.uid) ?? {};
  const assertOwner = () => { if (auth.currentUser?.uid !== user.uid) throw new Error('账号已变化，同步已停止；本机资料仍然保留。'); };
  const remember = async (from: string, to: string) => { map[from] = to; await localPut('cloudCopies', user.uid, map); };
  const remapString = (s: string): string => {
    for (const [from, to] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) s = s.split(from).join(to).split(encodeURIComponent(from)).join(encodeURIComponent(to));
    return s;
  };
  const remap = (value: any): any => {
    if (typeof value === 'string') return value === 'local' ? user.uid : remapString(value);
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [remapString(k), remap(v)]));
    return value;
  };
  const sessions = await localList<CloudSession>('sessions');
  const visiting = new Set<string>();
  const copySession = async (row: CloudSession): Promise<string> => {
    assertOwner();
    if (map[row.id]) return map[row.id];
    if (visiting.has(row.id)) throw new Error('文件夹层级异常，请先整理本机文件夹。');
    visiting.add(row.id);
    const parent = sessions.find(s => s.id === row.parentId && s.type === 'folder');
    const parentId = parent ? await copySession(parent) : null;
    progress(`正在同步：${row.customTitle || row.fileName}`);
    let fileUrl = '';
    if (row.type !== 'folder') {
      fileUrl = map[row.fileUrl] || await uploadPDF(user, await readLocalFile(row.fileUrl, row.fileName));
      await remember(row.fileUrl, fileUrl);
    }
    const id = row.type === 'folder'
      ? await createCloudFolder(user, row.customTitle || row.fileName, parentId)
      : await createCloudSession(user, row.fileName, fileUrl, parentId);
    assertOwner();
    await remember(row.id, id); visiting.delete(row.id);
    return id;
  };
  for (const row of sessions) await copySession(row);
  // Save references only after every file/folder has its cloud identity. A failed detail
  // save can be resumed; a completed import is not allowed to replace newer cloud work.
  for (const row of sessions) {
    const detailKey = `details:${row.id}`;
    if (map[detailKey] === map[row.id]) continue;
    assertOwner();
    const { id, userId, fileUrl, createdAt, updatedAt, parentId, type, ...details } = row;
    await updateCloudSessionState(map[row.id], remap(details), true);
    await remember(detailKey, map[row.id]);
  }
  const exams = await localList<Exam>('exams');
  const links = await localList<ExamMaterialLink>('examMaterials');
  for (const exam of exams) if (!map[exam.id]) {
    assertOwner(); progress(`正在同步复习记录：${exam.title}`);
    await remember(exam.id, (await createExam(user, exam)).id);
  }
  for (const link of links) if (!map[link.id]) {
    assertOwner();
    if (!map[link.examId]) continue;
    const input = { ...remap(link), sortIndex: link.sortIndex ?? link.addedAt };
    await remember(link.id, (await addExamMaterialLink(user, input)).id);
  }
  for (const event of await localList<CalendarEvent>('events')) if (!map[event.id]) {
    assertOwner(); const { id, userId, ...data } = event;
    await remember(id, (await addCalendarEvent(user, data)).id);
  }
  for (const memo of await localList<Memo>('memos')) if (!map[memo.id]) {
    assertOwner(); await remember(memo.id, (await addMemo(user, memo.content)).id);
  }
  for (const pack of await localList<JointReviewPack>('joint')) {
    assertOwner(); const copy = remap(pack);
    if (!map[pack.id]) await remember(pack.id, (await createJointReviewPack(user, copy)).id);
    if (map[`details:${pack.id}`]) continue;
    await updateJointReviewPack(user, map[pack.id], { materials: copy.materials, summaryMarkdown: pack.summaryMarkdown, guideMessages: copy.guideMessages, examPrepMarkdown: pack.examPrepMarkdown, generatedAt: pack.generatedAt, examPrepGeneratedAt: pack.examPrepGeneratedAt });
    await remember(`details:${pack.id}`, map[pack.id]);
  }
  for (const session of await localList<TutorSession>('tutors')) if (!map[`tutor:${session.id}`]) {
    assertOwner(); const copy = remap(session); copy.id = `import-${session.id}`;
    await saveTutorSessionToCloud(user, copy); await remember(`tutor:${session.id}`, copy.id);
  }
  for (const session of await localList<TinyStudyEntrySession>('tiny')) if (!map[`tiny:${session.cloudSessionId}`]) {
    assertOwner(); await saveTinyStudyEntrySessionToCloud(user, remap(session)); await remember(`tiny:${session.cloudSessionId}`, 'done');
  }
  // Workspace bundle keys are hashes, so rebuild them from both old and new scopes.
  const copyBundle = (scope: string, materials: ExamMaterialLink[]) => {
    const before = computeExamWorkspaceLsapKey('local', scope, materials);
    const after = computeExamWorkspaceLsapKey(user.uid, remapString(scope), remap(materials));
    const bundle = loadWorkspaceLsapBundle(before);
    if (bundle && !loadWorkspaceLsapBundle(after))
      localStorage.setItem(`lsap_workspace_bundle_${after}`, JSON.stringify(remap(bundle)));
  };
  for (const exam of exams) copyBundle(exam.id, links.filter(link => link.examId === exam.id));
  for (const row of sessions.filter(row => row.type === 'file')) {
    const material = createLectureReviewMaterial('local', { cloudSessionId: row.id, fileName: row.fileName });
    if (material) copyBundle(material.examId, [material]);
  }
  // Per-browser study caches remain local (also for signed-in users). Copy them into
  // the account namespace without removing the originals or replacing account records.
  for (const cache of await allReviewCaches('local')) {
    const key = user.uid + remapString(cache.key.slice('local'.length));
    if (!await loadReviewCache(key)) await saveReviewCache({ ...remap(cache), key });
  }
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (!/^(exam-study-rounds-|lsap_workspace_bundle_|classSkip_examWorkspace|classskip.*theme|exam-theme)/i.test(key)) continue;
    let next = remapString(key).replace(/([_:])local([_:]|$)/g, `$1${user.uid}$2`);
    if (next === key || localStorage.getItem(next) !== null) continue;
    const raw = localStorage.getItem(key);
    if (raw) { try { localStorage.setItem(next, JSON.stringify(remap(JSON.parse(raw)))); } catch { /* Keep original if format is not JSON. */ } }
  }
  progress('复制完成；本机原件仍然保留。已复制的资料不会覆盖账号中的后续修改。');
}
