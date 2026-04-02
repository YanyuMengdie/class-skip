import { FileHistoryItem, SavedArtifact } from '../types';

export interface GlobalArtifactEntry {
  provenance: 'local';
  artifact: SavedArtifact;
  sourceHash: string;
  sourceFileName: string;
}

/**
 * 聚合本地历史中所有档案的 savedArtifacts。
 * 去重：同一 artifact.id 出现多次时保留 createdAt 更大的一条（较新写入优先）。
 */
export function collectSavedArtifactsFromLocalHistory(items: FileHistoryItem[]): GlobalArtifactEntry[] {
  const byId = new Map<string, GlobalArtifactEntry>();

  for (const item of items) {
    const arts = item.state?.savedArtifacts ?? [];
    for (const artifact of arts) {
      const prev = byId.get(artifact.id);
      if (!prev || artifact.createdAt > prev.artifact.createdAt) {
        byId.set(artifact.id, {
          provenance: 'local',
          artifact,
          sourceHash: item.hash,
          sourceFileName: item.name
        });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.artifact.createdAt - a.artifact.createdAt);
}
