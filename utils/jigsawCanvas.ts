/**
 * 将一张图片切成 N 块，每块随机旋转，可加马赛克。返回每块的 dataURL 和旋转角度。
 */
export async function sliceImageIntoPieces(
  imageUrl: string,
  pieceCount: number
): Promise<{ pieceImages: string[]; rotations: number[] }> {
  const img = await loadImage(imageUrl);
  const cols = Math.ceil(Math.sqrt(pieceCount));
  const rows = Math.ceil(pieceCount / cols);
  const pieceWidth = Math.floor(img.width / cols);
  const pieceHeight = Math.floor(img.height / rows);
  const pieceImages: string[] = [];
  const rotations: number[] = [];
  const angles = [0, 90, 180, 270];

  for (let i = 0; i < pieceCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const sx = col * pieceWidth;
    const sy = row * pieceHeight;
    const w = col === cols - 1 ? img.width - sx : pieceWidth;
    const h = row === rows - 1 ? img.height - sy : pieceHeight;
    const rot = angles[Math.floor(Math.random() * angles.length)];
    rotations.push(rot);

    const canvas = document.createElement('canvas');
    const size = Math.max(w, h);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-size / 2, -size / 2);
    ctx.drawImage(img, sx, sy, w, h, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();

    pieceImages.push(canvas.toDataURL('image/jpeg', 0.85));
  }

  return { pieceImages, rotations };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image: ' + url));
    img.src = url;
  });
}
