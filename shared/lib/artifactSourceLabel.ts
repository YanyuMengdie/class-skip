/** 单条 sourceLabel 展示上限（含前缀「多文档（n）：」） */
const MAX_LABEL_LEN = 112;

/**
 * 根据多选文件名、合并展示名、当前单文件回退名，生成写入 SavedArtifact.sourceLabel 的文案。
 * - 多文件（fileNames.length > 1）：`多文档（n）：前 2～3 个文件名`，过长截断并加「等」
 * - 单文件列表：单文档：xxx
 * - 无列表但 combinedLabel 含「多文档合并」等：沿用 combinedLabel（截断）
 * - 否则：单文档：fallbackFileName 或「1个来源」
 */
export function buildArtifactSourceLabel(
  fileNames: string[] | null | undefined,
  combinedLabel: string | null | undefined,
  fallbackFileName: string | null | undefined
): string {
  const names = (fileNames ?? []).filter((n) => n && n.trim());
  if (names.length > 1) {
    const n = names.length;
    const shown = names.slice(0, 3).join('、');
    let label = `多文档（${n}）：${shown}`;
    if (n > 3) label += ' 等';
    if (label.length > MAX_LABEL_LEN) {
      label = `多文档（${n}）：${names.slice(0, 2).join('、')} 等`;
    }
    if (label.length > MAX_LABEL_LEN) {
      label = label.slice(0, MAX_LABEL_LEN - 1) + '…';
    }
    return label;
  }
  if (names.length === 1) {
    return `单文档：${names[0]}`;
  }
  if (combinedLabel && (combinedLabel.includes('多文档') || combinedLabel.includes('合并'))) {
    return combinedLabel.length > MAX_LABEL_LEN ? combinedLabel.slice(0, MAX_LABEL_LEN - 1) + '…' : combinedLabel;
  }
  if (fallbackFileName && fallbackFileName.trim()) {
    return `单文档：${fallbackFileName}`;
  }
  return '1个来源';
}
