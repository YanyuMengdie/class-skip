import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  LearnerProfileNotebook,
  ProfileNotebookUpdateSuggestion,
  StudyWitnessSession,
} from '@/types';

const PROFILE_STORAGE_KEY = 'classSkip_dashboardLearnerProfile';
const WITNESS_STORAGE_KEY = 'classSkip_studyWitnessSessions';
const PENDING_SUGGESTION_STORAGE_KEY = 'classSkip_pendingProfileSuggestions';

export const DEFAULT_LEARNER_PROFILE_NOTEBOOK: LearnerProfileNotebook = {
  companionName: '未来的你',
  welcomeLine: '你回来了，我一直在这儿。',
  avatarTone: 'sky',
  smoothAndStuck: '例：图像、流程、已经有生活经验的主题，会更容易进入。',
  focusDuration: '例：晚上 20-30 分钟一段，比白天更稳。',
  stuckReaction: '例：卡住时会先反复看同一页，再想找人问一句。',
  bestTime: '例：晚饭后到睡前，环境安静时更容易坐下来。',
  recentTrend: '最近还没有足够记录。先把每次回来都算作重新开始。',
  updatedAt: Date.now(),
  version: 1,
};

export const normalizeProfileNotebook = (value: Partial<LearnerProfileNotebook> | null | undefined): LearnerProfileNotebook => ({
  ...DEFAULT_LEARNER_PROFILE_NOTEBOOK,
  ...(value || {}),
  updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : Date.now(),
  version: typeof value?.version === 'number' ? value.version : 1,
});

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage may be unavailable */
  }
};

export const loadLocalProfileNotebook = (): LearnerProfileNotebook => {
  return normalizeProfileNotebook(readJson<Partial<LearnerProfileNotebook>>(PROFILE_STORAGE_KEY, {}));
};

export const saveLocalProfileNotebook = (profile: LearnerProfileNotebook) => {
  writeJson(PROFILE_STORAGE_KEY, normalizeProfileNotebook(profile));
};

export const loadLocalWitnessSessions = (): StudyWitnessSession[] => {
  return readJson<StudyWitnessSession[]>(WITNESS_STORAGE_KEY, []);
};

export const appendLocalWitnessSession = (session: StudyWitnessSession) => {
  const sessions = loadLocalWitnessSessions();
  writeJson(WITNESS_STORAGE_KEY, [session, ...sessions].slice(0, 100));
};

export const loadLocalPendingSuggestions = (): ProfileNotebookUpdateSuggestion[] => {
  return readJson<ProfileNotebookUpdateSuggestion[]>(PENDING_SUGGESTION_STORAGE_KEY, []);
};

export const appendLocalPendingSuggestion = (suggestion: ProfileNotebookUpdateSuggestion) => {
  const suggestions = loadLocalPendingSuggestions();
  writeJson(PENDING_SUGGESTION_STORAGE_KEY, [suggestion, ...suggestions].slice(0, 20));
};

export const getCloudProfileNotebook = async (user: User): Promise<LearnerProfileNotebook | null> => {
  const ref = doc(db, 'users', user.uid, 'profileNotebook', 'main');
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return normalizeProfileNotebook(snapshot.data() as Partial<LearnerProfileNotebook>);
};

export const saveCloudProfileNotebook = async (user: User, profile: LearnerProfileNotebook): Promise<void> => {
  const ref = doc(db, 'users', user.uid, 'profileNotebook', 'main');
  await setDoc(ref, {
    ...normalizeProfileNotebook(profile),
    userId: user.uid,
    updatedAt: Date.now(),
  });
};

export const saveCloudWitnessSession = async (user: User, session: StudyWitnessSession): Promise<void> => {
  const ref = doc(db, 'users', user.uid, 'studyWitnessSessions', session.id);
  await setDoc(ref, { ...session, userId: user.uid });
};

export const getCloudWitnessSessions = async (user: User, maxCount = 50): Promise<StudyWitnessSession[]> => {
  const ref = collection(db, 'users', user.uid, 'studyWitnessSessions');
  const q = query(ref, orderBy('startedAt', 'desc'), limit(maxCount));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => item.data() as StudyWitnessSession);
};

export const saveCloudPendingSuggestion = async (user: User, suggestion: ProfileNotebookUpdateSuggestion): Promise<void> => {
  const ref = doc(db, 'users', user.uid, 'pendingProfileSuggestions', suggestion.id);
  await setDoc(ref, { ...suggestion, userId: user.uid });
};
