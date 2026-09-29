import { CloudRecordError } from './chunks';

export function studySaveFailure(error: unknown, local: boolean): string {
  if (error instanceof CloudRecordError) return error.message;
  const code = String((error as { code?: unknown })?.code ?? '');
  if (local) return '本机保存未完成，请保留当前页面并检查浏览器存储空间。';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) return '云端保存权限验证失败，请保留当前页面并检查登录状态。';
  if (/maximum.*size|exceeds.*size|too large/i.test(String((error as Error)?.message))) return '云端拒绝了过大的记录，保存尚未完成。请保留当前页面。';
  return '云端保存未完成，请保留当前页面。网络恢复后会重试，当前进度不会标记为已同步。';
}
export function studySaveLabel(local: boolean, syncing: boolean, error: string, english = false) {
  if (error) return english ? 'Not synced' : '保存未完成';
  if (syncing) return english ? 'Saving' : '保存中';
  if (local) return english ? 'Saved locally' : '本机保存';
  return english ? 'Synced' : '已同步';
}
