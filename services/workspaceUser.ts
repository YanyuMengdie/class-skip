import type { User } from 'firebase/auth';

/** A local workspace identity is not a Firebase account and never carries credentials. */
export interface LocalWorkspaceUser {
  uid: 'local';
  displayName: string;
  email: null;
  photoURL: null;
  isLocal: true;
}
export type WorkspaceUser = User | LocalWorkspaceUser;
export const LOCAL_WORKSPACE_USER: LocalWorkspaceUser = Object.freeze({
  uid: 'local', displayName: '本机学习', email: null, photoURL: null, isLocal: true,
});
export const isLocalUser = (user: WorkspaceUser | null | undefined): user is LocalWorkspaceUser => user?.uid === 'local';
export const isCloudUser = (user: WorkspaceUser | null | undefined): user is User => !!user && !isLocalUser(user);
