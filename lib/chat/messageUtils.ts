import type { ChatMessage } from '@/types';

/**
 * 统一获取消息上的图片数组。
 * 兼容旧数据:优先读 images(新字段),fallback 到 image(deprecated 单图字段)。
 */
export function getMessageImages(msg: ChatMessage): string[] {
  if (msg.images && msg.images.length > 0) return msg.images;
  if (msg.image) return [msg.image];
  return [];
}
