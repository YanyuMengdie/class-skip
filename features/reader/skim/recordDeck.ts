import type {
  SkimReadingRoute,
  SkimReadingRouteNode,
  SkimRecordCardState,
  SkimRecordDeck,
} from '@/types';

export interface SkimRouteValidationResult {
  valid: boolean;
  errors: string[];
}

const isIntegerPage = (value: number | undefined): value is number => (
  Number.isInteger(value) && (value as number) > 0
);

const nodeLabel = (node: SkimReadingRouteNode): string => (
  `${node.kind} ${node.index} (${node.title || node.id})`
);

const validateNodeRange = (
  node: SkimReadingRouteNode,
  minPage: number,
  maxPage: number,
  errors: string[],
  parent?: SkimReadingRouteNode,
) => {
  if (!isIntegerPage(node.pageStart) || !isIntegerPage(node.pageEnd)) {
    errors.push(`${nodeLabel(node)} 缺少有效整数页码。`);
    return;
  }
  if (node.pageStart > node.pageEnd) {
    errors.push(`${nodeLabel(node)} 页码倒序。`);
  }
  if (node.pageStart < minPage || node.pageEnd > maxPage) {
    errors.push(`${nodeLabel(node)} 超出 ${minPage}-${maxPage} 页。`);
  }
  if (parent && isIntegerPage(parent.pageStart) && isIntegerPage(parent.pageEnd)) {
    if (node.pageStart < parent.pageStart || node.pageEnd > parent.pageEnd) {
      errors.push(`${nodeLabel(node)} 不在所属 Module 范围内。`);
    }
  }
};

const validateOrderedCoverage = (
  nodes: SkimReadingRouteNode[],
  expectedStart: number,
  expectedEnd: number,
  errors: string[],
  label: string,
) => {
  if (nodes.length === 0) {
    errors.push(`${label} 为空。`);
    return;
  }
  const ordered = [...nodes].sort((a, b) => (a.pageStart ?? 0) - (b.pageStart ?? 0));
  if (ordered.some((node, index) => node !== nodes[index])) {
    errors.push(`${label} 未按页码顺序排列。`);
  }
  if (ordered[0].pageStart !== expectedStart) {
    errors.push(`${label} 从第 ${ordered[0].pageStart ?? '?'} 页开始，应从第 ${expectedStart} 页开始。`);
  }
  if (ordered[ordered.length - 1].pageEnd !== expectedEnd) {
    errors.push(`${label} 在第 ${ordered[ordered.length - 1].pageEnd ?? '?'} 页结束，应到第 ${expectedEnd} 页。`);
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!isIntegerPage(previous.pageEnd) || !isIntegerPage(current.pageStart)) continue;
    if (current.pageStart <= previous.pageEnd) {
      errors.push(`${label} 中 ${nodeLabel(previous)} 与 ${nodeLabel(current)} 页码重叠。`);
    } else if (current.pageStart !== previous.pageEnd + 1) {
      errors.push(`${label} 在第 ${previous.pageEnd} 页和第 ${current.pageStart} 页之间缺页。`);
    }
  }
};

/**
 * 唱片式路线必须完整、连续且可追溯。连续领读仍可使用旧路线，不受此严格校验影响。
 */
export const validateSkimReadingRoute = (
  route: SkimReadingRoute,
  minPage: number,
  maxPage: number,
): SkimRouteValidationResult => {
  const errors: string[] = [];
  if (route.kind !== 'lecture') errors.push('唱片式学习目前只支持 Lecture。');
  if (!Number.isInteger(minPage) || !Number.isInteger(maxPage) || minPage < 1 || minPage > maxPage) {
    errors.push('选择的总页码范围无效。');
    return { valid: false, errors };
  }

  route.nodes.forEach((moduleNode) => {
    validateNodeRange(moduleNode, minPage, maxPage, errors);
    const children = moduleNode.children ?? [];
    children.forEach((child) => validateNodeRange(child, minPage, maxPage, errors, moduleNode));
    if (
      children.length > 0
      && isIntegerPage(moduleNode.pageStart)
      && isIntegerPage(moduleNode.pageEnd)
    ) {
      validateOrderedCoverage(
        children,
        moduleNode.pageStart,
        moduleNode.pageEnd,
        errors,
        `${nodeLabel(moduleNode)} 的 Part`,
      );
    }
  });
  validateOrderedCoverage(route.nodes, minPage, maxPage, errors, 'Module 路线');
  return { valid: errors.length === 0, errors };
};

const makeCard = (
  node: SkimReadingRouteNode,
  moduleNode: SkimReadingRouteNode,
  partIndex?: number,
): SkimRecordCardState => {
  const pageStart = node.pageStart as number;
  const pageEnd = node.pageEnd as number;
  return {
    id: `record-${moduleNode.index}-${partIndex ?? 'module'}-${node.id}`,
    routeNodeId: node.id,
    ...(partIndex == null ? {} : { parentRouteNodeId: moduleNode.id, partIndex }),
    moduleIndex: moduleNode.index,
    moduleTitle: moduleNode.title,
    title: node.title,
    summary: node.summary?.trim() || '打开后开始这一段领读。',
    pageStart,
    pageEnd,
    pageLabel: node.pageLabel?.trim() || `${pageStart}-${pageEnd} 页`,
    status: 'not_started',
    lastPage: pageStart,
    messages: [],
  };
};

export const buildSkimRecordDeck = (
  route: SkimReadingRoute,
  pace: 'module' | 'part',
): SkimRecordDeck => {
  const cards: Record<string, SkimRecordCardState> = {};
  const orderedCardIds: string[] = [];

  route.nodes.forEach((moduleNode) => {
    const children = moduleNode.children ?? [];
    const recordNodes = pace === 'part' && children.length > 0 ? children : [moduleNode];
    recordNodes.forEach((node, index) => {
      const card = makeCard(node, moduleNode, node === moduleNode ? undefined : (node.index || index + 1));
      cards[card.id] = card;
      orderedCardIds.push(card.id);
    });
  });

  return {
    version: 1,
    routeId: route.id,
    createdAt: Date.now(),
    orderedCardIds,
    cards,
    activeCardId: null,
    selectedModuleIndex: null,
    view: 'shelf',
  };
};

export const getNextSkimRecordCard = (
  deck: SkimRecordDeck,
  cardId: string,
): SkimRecordCardState | null => {
  const index = deck.orderedCardIds.indexOf(cardId);
  if (index < 0 || index >= deck.orderedCardIds.length - 1) return null;
  return deck.cards[deck.orderedCardIds[index + 1]] ?? null;
};

