import type { ExamMaterialLink, LSAPKnowledgeComponent } from '@/types';
import type { RoundContext, RoundKnowledgeTarget, RoundLanguage, RoundScope, StudyRound } from './roundTypes';
import { validateThemePlan, type ThemePlan } from './themeGrouping';

export interface StudyBlock {
  id: string;
  title: string;
  description?: string;
  materialId: string;
  materialTitle: string;
  pages: number[];
  hints: string[];
  /** Complete original KC objects, including atoms that still need their source pages completed. */
  kcs: LSAPKnowledgeComponent[];
  knowledgeTargets: RoundKnowledgeTarget[];
}

export function pageLabel(pages: number[], language: RoundLanguage = 'zh'): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const page of sorted.slice(1)) {
    if (page === end + 1) { end = page; continue; }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    start = end = page;
  }
  if (start != null) ranges.push(start === end ? String(start) : `${start}–${end}`);
  return language === 'en' ? `PDF pp. ${ranges.join(', ')}` : `PDF 第 ${ranges.join('、')} 页`;
}

function directPages(kc: LSAPKnowledgeComponent): number[] {
  return [...new Set([...(kc.anchorPages ?? []), ...(kc.sourcePages ?? []), ...(kc.atoms ?? []).flatMap((atom) => atom.sourcePages ?? [])])]
    .filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
}

/** Unbound legacy KCs cannot safely be assigned to one PDF by guessing their title. */
export function getMaterialKcs(material: ExamMaterialLink, kcs: LSAPKnowledgeComponent[]): LSAPKnowledgeComponent[] {
  return kcs.filter((kc) => kc.sourceLinkId === material.id);
}

function kcLabel(kc: LSAPKnowledgeComponent, language: RoundLanguage): string {
  return (language === 'zh' ? kc.conceptZh || kc.concept : kc.concept).trim();
}

function knowledgeFingerprint(kc: LSAPKnowledgeComponent): string {
  return fingerprint(JSON.stringify({
    id: kc.id, sourceLinkId: kc.sourceLinkId, concept: kc.concept, conceptZh: kc.conceptZh,
    definition: kc.definition, definitionZh: kc.definitionZh, sourcePages: kc.sourcePages,
    anchorPages: kc.anchorPages, atoms: kc.atoms,
  }));
}

/** An atom needs its own complete page binding. KC pages never stand in for missing atom evidence. */
function scopedKnowledgeTargets(
  materialId: string, kcs: LSAPKnowledgeComponent[], selectedPages: number[], language: RoundLanguage,
): RoundKnowledgeTarget[] {
  const selected = new Set(selectedPages);
  const targets = new Map<string, RoundKnowledgeTarget>();
  for (const kc of kcs) {
    if (kc.sourceLinkId !== materialId) continue;
    for (const atom of kc.atoms ?? []) {
      const pages = [...new Set(atom.sourcePages ?? [])].sort((a, b) => a - b);
      const description = ((language === 'zh' ? atom.descriptionZh || atom.description : atom.description) || '').trim();
      if (!atom.id || !atom.label.trim() || !description || /^[-—]+$/.test(description) || !pages.length
        || pages.some((page) => !Number.isInteger(page) || page < 1 || !selected.has(page))) continue;
      const id = `kc-atom:${encodeURIComponent(materialId)}:${encodeURIComponent(kc.id)}:${encodeURIComponent(atom.id)}`;
      targets.set(id, {
        id, kcId: kc.id, atomId: atom.id, kcLabel: kcLabel(kc, language),
        label: (language === 'zh' ? atom.labelZh || atom.label : atom.label).trim(),
        description,
        materialId, pages,
        contentKey: fingerprint(JSON.stringify({ materialId, kcId: kc.id, concept: kc.concept,
          definition: kc.definition, atom: { ...atom, sourcePages: pages } })),
      });
    }
  }
  return [...targets.values()];
}

/** Build from actual KC evidence fragments, without manufacturing blocks for unextracted pages. */
export function buildStudyBlocks(
  material: ExamMaterialLink,
  pageCount: number,
  kcs: LSAPKnowledgeComponent[],
  language: RoundLanguage = 'zh',
  plan?: ThemePlan,
): StudyBlock[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];
  const localKcs = getMaterialKcs(material, kcs);
  if (plan) {
    const validated = validateThemePlan(plan, material, localKcs, undefined, language);
    const byId = new Map(localKcs.map(kc => [kc.id, kc]));
    return validated.groups.map(group => {
      const groupKcs = group.kcIds.map(id => byId.get(id)!);
      const pages = [...new Set(groupKcs.flatMap(directPages))].filter(page => page <= pageCount).sort((a, b) => a - b);
      const hints = [...new Set(groupKcs.map(kc => kcLabel(kc, language)).filter(Boolean))];
      return {
        id: `${material.id}:${group.id}`, title: group.title, description: group.description,
        materialId: material.id, materialTitle: material.fileName, pages, hints, kcs: groupKcs,
        knowledgeTargets: scopedKnowledgeTargets(material.id, groupKcs, pages, language),
      };
    });
  }
  type Fragment = { pages: number[]; kcs: LSAPKnowledgeComponent[] };
  const fragments: Fragment[] = [];
  const unlocated: Fragment[] = [];
  for (const kc of localKcs) {
    const pages = directPages(kc).filter((page) => page <= pageCount);
    if (!pages.length) { unlocated.push({ pages: [], kcs: [kc] }); continue; }
    let fragment: number[] = [];
    for (const page of pages) {
      if (fragment.length && page !== fragment[fragment.length - 1] + 1) {
        fragments.push({ pages: fragment, kcs: [kc] });
        fragment = [];
      }
      fragment.push(page);
    }
    fragments.push({ pages: fragment, kcs: [kc] });
  }
  fragments.sort((a, b) => a.pages[0] - b.pages[0] || a.pages[a.pages.length - 1] - b.pages[b.pages.length - 1]);
  const grouped: Fragment[] = [];
  for (const fragment of fragments) {
    const previous = grouped[grouped.length - 1];
    const sharedKcs = previous ? [...new Map([...previous.kcs, ...fragment.kcs].map((kc) => [kc.id, kc])).values()] : [];
    // Only co-located topics merge, up to three KCs. Adjacency alone does not imply a shared topic.
    if (previous && fragment.pages[0] <= previous.pages[previous.pages.length - 1] && sharedKcs.length <= 3) {
      previous.pages = [...new Set([...previous.pages, ...fragment.pages])].sort((a, b) => a - b);
      previous.kcs = sharedKcs;
    } else grouped.push({ pages: [...fragment.pages], kcs: [...fragment.kcs] });
  }
  return [...grouped, ...unlocated].map((fragment) => {
    const hints = [...new Set(fragment.kcs.map((kc) => kcLabel(kc, language)).filter(Boolean))];
    return {
      id: `${material.id}:kc:${fingerprint(fragment.kcs.map((kc) => kc.id).sort().join('|'))}:p${fragment.pages.join('-') || 'unknown'}`,
      title: hints.join(' · ') || (language === 'en' ? 'Untitled knowledge component' : '未命名知识点'),
      materialId: material.id, materialTitle: material.fileName, pages: fragment.pages, hints,
      kcs: fragment.kcs,
      knowledgeTargets: scopedKnowledgeTargets(material.id, fragment.kcs, fragment.pages, language),
    };
  });
}

function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

/** No retrieval fallback: only these page numbers can reach the question/evaluation service. */
export function createRoundContext(
  blocks: StudyBlock[],
  textsByMaterial: Record<string, string[]>,
  mode: RoundScope['mode'] = 'practice',
  language: RoundLanguage = 'zh',
): RoundContext {
  if (!blocks.length) throw new Error(language === 'en' ? 'Choose a study block first.' : '请先选择一个复习块。');
  const materials = [...new Set(blocks.map((block) => block.materialId))].map((materialId) => ({
    materialId,
    title: blocks.find((block) => block.materialId === materialId)!.materialTitle,
    pages: [...new Set(blocks.filter((block) => block.materialId === materialId).flatMap((block) => block.pages))].sort((a, b) => a - b),
  }));
  const structuralTargets = materials.flatMap((material) => scopedKnowledgeTargets(material.materialId,
    [...new Map(blocks.filter((block) => block.materialId === material.materialId).flatMap((block) => block.kcs).map((kc) => [kc.id, kc])).values()],
    material.pages, language));
  if (!structuralTargets.length) throw new Error(language === 'en'
    ? 'Complete the logic atoms and their original PDF page references before preparing a round.'
    : '请先补全逻辑原子及其原文页码，再开始这一块的复习。');
  const pages = materials.flatMap((material) => material.pages.map((page) => {
    const text = textsByMaterial[material.materialId]?.[page - 1];
    if (typeof text !== 'string') throw new Error(language === 'en' ? `PDF page ${page} is not available.` : `暂时无法读取 PDF 第 ${page} 页。`);
    return { materialId: material.materialId, materialTitle: material.title, page, text };
  }));
  if (!pages.some((page) => page.text.trim().length >= 20)) {
    throw new Error(language === 'en'
      ? 'These pages have no readable text. You can preview them, but a source-grounded round cannot be prepared yet.'
      : '这几页没有可读取的文字。可以先看原页，暂时无法据此生成可核对的题目。');
  }
  const knowledgeTargets = structuralTargets.map((target) => ({
    ...target,
    // Only this atom's evidence pages affect its revision; selecting another block does not erase its history.
    contentKey: fingerprint(JSON.stringify({ knowledge: target.contentKey,
      source: target.pages.map((page) => [page, textsByMaterial[target.materialId][page - 1]]) })),
  }));
  const title = blocks.length === 1 ? blocks[0].title : (language === 'en' ? `Combined output · ${blocks.length} blocks` : `综合输出 · ${blocks.length} 个复习块`);
  const signature = JSON.stringify({
    pages: pages.map((page) => [page.materialId, page.page, page.text]),
    knowledge: [...new Set(blocks.flatMap((block) => block.kcs.map(knowledgeFingerprint)))].sort(),
    targets: knowledgeTargets.map((target) => [target.id, target.contentKey]).sort(),
  });
  return {
    scope: {
      id: `${blocks.map((block) => block.id).sort().join('|')}:${fingerprint(signature)}`,
      title,
      materials,
      objectiveHints: [...new Set(blocks.flatMap((block) => block.hints))],
      knowledgeTargets,
      mode,
    },
    pages,
  };
}

export function roundTouchesBlock(round: StudyRound, block: StudyBlock): boolean {
  if (round.blueprint.scope.knowledgeTargets) {
    return round.blueprint.scope.knowledgeTargets.some((target) => block.knowledgeTargets.some((candidate) =>
      candidate.id === target.id));
  }
  return round.blueprint.scope.materials.some((material) => material.materialId === block.materialId && material.pages.some((page) => block.pages.includes(page)));
}

export function roundWorkspaceStorageKey(userId: string, examId: string): string {
  return `exam-study-rounds-v1:${encodeURIComponent(userId)}:${encodeURIComponent(examId)}`;
}
