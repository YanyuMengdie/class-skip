// 猎奇盲盒：偏有趣、治愈、或有点意外的图（Unsplash，可替换）
export const JIGSAW_IMAGE_URLS: string[] = [
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600',  // 猫
  'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600',  // 猫2
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600',  // 狗
  'https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=600',   // 狐狸
  'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600',   // 浣熊
  'https://images.unsplash.com/photo-1610717154250-475b421776c1?w=600',   // 刺猬
  'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600',   // 星空
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600',   // 银河
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600',   // 日落
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600',   // 雪山
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600',   // 早餐
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600',   // 松饼
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600',     // 盆栽
  'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=600',   // 猫+键盘
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=600',     // 猫眼镜
];

export function getRandomJigsawImageUrl(): string {
  return JIGSAW_IMAGE_URLS[Math.floor(Math.random() * JIGSAW_IMAGE_URLS.length)];
}
