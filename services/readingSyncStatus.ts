import { CloudRecordError } from './cloudStudy/chunks';

type ReadingSyncCode = 'refreshing' | 'cloud-updated' | 'reader-busy' | 'signed-out' | 'offline' | 'lease-lost' | 'scope-changed';
const messages: Record<ReadingSyncCode, [string, string]> = {
  refreshing: ['当前资料正在同步，请稍后再试。', 'This material is syncing. Please try again shortly.'],
  'cloud-updated': ['云端领读记录已更新，请查看最新内容后再继续。', 'The cloud reading record has changed. Check the latest content before continuing.'],
  'reader-busy': ['这份资料已有生成请求尚未结束，可能来自其他页面或刷新前的请求，请稍后再试。', 'A generation request for this material is still active, possibly in another tab or from before a refresh. Please wait.'],
  'signed-out': ['登录状态已失效，请重新登录后继续。', 'Your sign-in has expired. Please sign in again.'],
  offline: ['当前离线，输入草稿已保留。联网后再发送。', 'You are offline. Your draft is kept. Send it when reconnected.'],
  'lease-lost': ['本次生成状态检查未通过，原记录已保留，请重新打开资料后继续。', 'The generation state check failed. Your existing records are kept. Reopen the material to continue.'],
  'scope-changed': ['当前领读已切换，这次请求没有发送。', 'The reading selection changed. This request was not sent.'],
};

export class ReadingSyncError extends Error {
  constructor(readonly code: ReadingSyncCode) {
    super(messages[code][0]);
    this.name = 'ReadingSyncError';
  }
}

export function isReadingStateFailure(error: unknown): boolean {
  return error instanceof ReadingSyncError || error instanceof CloudRecordError
    || (error instanceof Error && ['FirebaseError', 'QuotaExceededError'].includes(error.name));
}

/** Only report another request when the actual lease check says one exists. */
export function readingStateFailure(error: unknown, english = false): string {
  if (error instanceof ReadingSyncError) return messages[error.code][english ? 1 : 0];
  if (error instanceof CloudRecordError) {
    if (!english) return error.message;
    if (error.code === 'conflict') return 'The cloud and local records differ. Both copies are kept; cloud overwriting is paused.';
    if (error.code === 'local-backup') return 'The local backup could not be saved. Keep this page open and check browser storage.';
    return 'The cloud record could not be read or saved completely. Your existing records are kept.';
  }
  const code = String((error as { code?: unknown })?.code ?? '');
  if (/permission-denied|unauthenticated/.test(code)) return english
    ? 'The cloud permission check failed. Check your sign-in; your draft is kept.'
    : '云端权限检查失败，请检查登录状态。输入草稿仍然保留。';
  if (/unavailable|deadline-exceeded|network-request-failed/.test(code)) return english
    ? 'Could not finish the cloud connection check. Check your network and retry; your draft is kept.'
    : '云端连接检查没有完成，请检查网络后重试。输入草稿仍然保留。';
  if (error instanceof Error && error.name === 'QuotaExceededError') return english
    ? 'Browser storage is full. Keep this page open and free some storage before retrying.'
    : '浏览器存储空间不足，请保留当前页面，释放空间后重试。';
  return english
    ? 'The save or state check before starting did not finish. Please retry; your draft is kept.'
    : '领读启动前的保存或状态检查没有完成，请重试。输入草稿仍然保留。';
}
