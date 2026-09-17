import type { ExamMaterialLink, LSAPContentMap } from '@/types';

export interface PrepareLectureKnowledgeOptions {
  materialId: string;
  pageTexts: string[];
  stage: 'kc' | 'atoms';
}

interface KnowledgeGenerator {
  concepts: (source: string) => Promise<LSAPContentMap | null>;
  atoms: (source: string, map: LSAPContentMap) => Promise<LSAPContentMap | null>;
}

/** Keep physical PDF page labels, including across long-document request boundaries. */
export function lectureSourceChunks(pages: string[], limit = 110_000): string[] {
  if (!Number.isInteger(limit) || limit < 64) throw new Error('Source chunk size is too small.');
  const chunks: string[] = [];
  let chunk = '';
  pages.forEach((text, index) => {
    const label = `[PAGE ${index + 1}]\n`;
    const parts = text.trim() || '（本页没有可提取文字）';
    for (let start = 0; start < parts.length; start += limit - label.length - 2) {
      const page = `${label}${parts.slice(start, start + limit - label.length - 2)}\n\n`;
      if (chunk && chunk.length + page.length > limit) { chunks.push(chunk); chunk = ''; }
      chunk += page;
    }
  });
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Replace only this lecture's generated structure; the caller keeps all answer/BKT history. */
export async function prepareLectureKnowledge(
  current: LSAPContentMap | null,
  material: ExamMaterialLink,
  pageTexts: string[],
  stage: PrepareLectureKnowledgeOptions['stage'],
  api: KnowledgeGenerator,
  progress?: (current: number, total: number) => void,
): Promise<LSAPContentMap> {
  if (!pageTexts.length || !pageTexts.some(page => page.trim())) throw new Error('这份 PDF 没有可提取文字，暂时不能提取知识点。');
  const legalPages = (pages: number[] | undefined) => [...new Set(pages ?? [])].filter(page => Number.isInteger(page) && page > 0 && page <= pageTexts.length).sort((a, b) => a - b);
  const now = Date.now();
  if (stage === 'kc') {
    const chunks = lectureSourceChunks(pageTexts);
    const replacement: LSAPContentMap['kcs'] = [];
    const generationId = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    for (let index = 0; index < chunks.length; index++) {
      progress?.(index + 1, chunks.length);
      const generated = await api.concepts(chunks[index]);
      // A failed chunk must not silently replace a complete existing lecture with a partial map.
      if (!generated?.kcs?.length) throw new Error('这次知识点提取没有完成，原有清单已保留，请重试。');
      const chunkPages = new Set([...chunks[index].matchAll(/\[PAGE (\d+)\]/g)].map(match => Number(match[1])));
      const supportedPages = (pages: number[] | undefined) => legalPages(pages).filter(page => chunkPages.has(page));
      replacement.push(...generated.kcs.map((kc, position) => ({
        ...kc, id: `${material.id}__${generationId}__${index}-${position}`,
        sourceLinkId: material.id, sourceFileName: material.fileName,
        sourcePages: supportedPages(kc.sourcePages), anchorPages: supportedPages(kc.anchorPages), relatedPages: supportedPages(kc.relatedPages),
        atoms: undefined,
      })));
    }
    return { id: current?.id || `knowledge-${generationId}`, sourceKey: current?.sourceKey || material.id, createdAt: current?.createdAt || now,
      kcs: [...(current?.kcs ?? []).filter(kc => kc.sourceLinkId !== material.id), ...replacement] };
  }
  const subset = current?.kcs.filter(kc => kc.sourceLinkId === material.id) ?? [];
  if (!current || !subset.length) throw new Error('请先提取这份讲义的 KC 知识点。');
  const source = lectureSourceChunks(pageTexts).join('\n');
  progress?.(1, 1);
  const generated = await api.atoms(source, { ...current, kcs: subset });
  if (!generated) throw new Error('逻辑原子提取没有完成，原有清单已保留，请重试。');
  const byId = new Map(generated.kcs.map(kc => [kc.id, kc]));
  return { ...current, kcs: current.kcs.map(kc => {
    const next = kc.sourceLinkId === material.id ? byId.get(kc.id) : undefined;
    if (!next) return kc;
    const allowed = new Set(legalPages([...(kc.sourcePages ?? []), ...(kc.anchorPages ?? []), ...(kc.relatedPages ?? [])]));
    return { ...kc, conceptZh: next.conceptZh || kc.conceptZh, definitionZh: next.definitionZh || kc.definitionZh,
      atoms: (next.atoms ?? kc.atoms ?? []).map(atom => ({ ...atom, kcId: kc.id, sourcePages: legalPages(atom.sourcePages).filter(page => allowed.has(page)) })) };
  }) };
}
