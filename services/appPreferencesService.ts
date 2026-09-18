import { isLocalUser } from './workspaceUser';
import type { WorkspaceUser as User } from '@/services/workspaceUser';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { AppLanguage, AppPreferences } from '@/types';

const normalizePreferences = (value: Partial<AppPreferences> | null | undefined): AppPreferences | null => {
  if (!value || (value.language !== 'zh-CN' && value.language !== 'en')) return null;
  return {
    version: 1,
    language: value.language as AppLanguage,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
};

export const getCloudAppPreferences = async (user: User): Promise<AppPreferences | null> => {
  if (isLocalUser(user)) return null;
  const snapshot = await getDoc(doc(db, 'users', user.uid, 'preferences', 'app'));
  return snapshot.exists() ? normalizePreferences(snapshot.data() as Partial<AppPreferences>) : null;
};

export const saveCloudAppPreferences = async (user: User, preferences: AppPreferences): Promise<void> => {
  if (isLocalUser(user)) return;
  await setDoc(doc(db, 'users', user.uid, 'preferences', 'app'), {
    ...preferences,
    version: 1,
    userId: user.uid,
  });
};

