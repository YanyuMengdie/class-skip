import type { MindMapNode, StudyGuide, SavedArtifact } from '@/types';

// Full input fingerprint, not the old first-30k-character summary cache key.
export function reviewSourceKey(content: string, label: string): string {
  let a = 2166136261, b = 5381;
  const input = `${label}\n${content}`;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ input.charCodeAt(i);
  }
  return `review-v1-${input.length}-${a >>> 0}-${b >>> 0}`;
}

export function notesToTree(guide: StudyGuide | null): MindMapNode | null {
  if (!guide) return null;
  const tree = guide.content.knowledgeTree;
  if (tree?.branches?.length) return {
    id: 'notes-root', label: tree.root || guide.fileName,
    children: tree.branches.map((branch, i) => ({
      id: `notes-${i}`, label: branch.concept,
      children: branch.children?.map((child, j) => ({
        id: `notes-${i}-${j}`, label: child.concept,
        children: child.details?.map((label, k) => ({ id: `notes-${i}-${j}-${k}`, label })),
      })),
    })),
  };
  // An old outline has no explicit relationships: do not invent them.
  return null;
}

export function legacyNoteMarkdown(artifact: SavedArtifact): string | null {
  if (artifact.type === 'examSummary' || artifact.type === 'examTraps') return artifact.payload.markdown;
  if (artifact.type === 'studyGuide') return artifact.payload.content.markdownContent;
  if (artifact.type === 'terminology') return artifact.payload.terms.map(t => `### ${t.term}\n\n${t.definition}`).join('\n\n');
  return null;
}
