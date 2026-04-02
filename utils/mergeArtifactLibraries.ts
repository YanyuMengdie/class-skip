import type { SavedArtifact } from '../types';
import type { GlobalArtifactEntry } from './collectSavedArtifactsFromLocalHistory';
import type { CloudArtifactEntry } from './collectSavedArtifactsFromCloud';

export type LocalArtifactLibraryEntry = GlobalArtifactEntry;

export type MergedLibraryEntry =
  | {
      provenance: 'local';
      artifact: SavedArtifact;
      sourceHash: string;
      sourceFileName: string;
    }
  | {
      provenance: 'cloud';
      artifact: SavedArtifact;
      cloudSessionId: string;
      sourceDisplayName: string;
    };

/**
 * 合并本地与云端条目后按 artifact.createdAt 降序。
 * 去重主键：artifact.id。若同一 id 在本地与云端均存在：
 * —— 保留 createdAt 较大者；若 createdAt 相同，优先保留云端（便于与 Firestore 权威一致）。
 */
function pickById(a: MergedLibraryEntry, b: MergedLibraryEntry): MergedLibraryEntry {
  const ta = a.artifact.createdAt;
  const tb = b.artifact.createdAt;
  if (tb > ta) return b;
  if (ta > tb) return a;
  return b.provenance === 'cloud' ? b : a;
}

export function mergeLocalAndCloudArtifacts(
  local: LocalArtifactLibraryEntry[],
  cloud: CloudArtifactEntry[]
): MergedLibraryEntry[] {
  const byId = new Map<string, MergedLibraryEntry>();

  for (const e of local) {
    const row: MergedLibraryEntry = {
      provenance: 'local',
      artifact: e.artifact,
      sourceHash: e.sourceHash,
      sourceFileName: e.sourceFileName
    };
    byId.set(e.artifact.id, row);
  }

  for (const c of cloud) {
    const row: MergedLibraryEntry = {
      provenance: 'cloud',
      artifact: c.artifact,
      cloudSessionId: c.cloudSessionId,
      sourceDisplayName: c.sourceDisplayName
    };
    const prev = byId.get(c.artifact.id);
    if (!prev) {
      byId.set(c.artifact.id, row);
    } else {
      byId.set(c.artifact.id, pickById(prev, row));
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.artifact.createdAt - a.artifact.createdAt);
}
