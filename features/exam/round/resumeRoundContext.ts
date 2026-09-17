import { createRoundContext, type StudyBlock } from './roundScope';
import type { RoundContext, RoundLanguage, StudyRound } from './roundTypes';

/** Reconstruct the exact frozen scope. Regrouping must not silently expand a paused round. */
export function resumeRoundContext(round: StudyRound, collections: StudyBlock[][],
  texts: Record<string, string[]>, language: RoundLanguage): RoundContext | null {
  if (round.phase === 'ended') return null;
  const pages = new Map(round.blueprint.scope.materials.map(material => [material.materialId, new Set(material.pages)]));
  for (const blocks of collections) {
    const selected = blocks.filter(block => block.pages.length && block.pages.every(page => pages.get(block.materialId)?.has(page)));
    if (!selected.length) continue;
    try {
      const context = createRoundContext(selected, texts, round.blueprint.scope.mode, language);
      if (context.scope.id === round.blueprint.scope.id) return context;
    } catch { /* Missing or changed sources remain historical; never replace them with the new theme. */ }
  }
  return null;
}
