import type {
  AtomCoverageByKc,
  ExamChunkCitationSnapshot,
  ExamMaterialLink,
  KcGlossaryEntry,
  LSAPContentMap,
  LSAPState,
} from '@/types';

/** localStorage：`lsap_workspace_bundle_${key}` → JSON */
const STORAGE_PREFIX = 'lsap_workspace_bundle_';

/** 备考台苏格拉底对话留痕（仅消息级，用于证据与复盘） */
export interface WorkspaceDialogueTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  /** M3：若当轮绑定了 KC，可记下，便于报告分组 */
  kcId?: string;
  /** M5：合并多段会话（换 KC / 全卷切换）时用于替换该段，不写入旧版 bundle 亦可 */
  sessionKey?: string;
  /** 1-3：与 ChatMessage.examChunkCitationSnapshot 对齐，供 bundle 恢复链钮 */
  examChunkCitationSnapshot?: ExamChunkCitationSnapshot;
}

export interface WorkspaceLsapBundle {
  contentMap: LSAPContentMap;
  state: LSAPState;
  /** 逻辑原子覆盖；旧 bundle 无此字段时视为 {} */
  atomCoverage?: AtomCoverageByKc;
  /** M5：对话留痕 */
  dialogueTranscript?: WorkspaceDialogueTurn[];
  dialogueUpdatedAt?: number;
  /** 按 KC 分组的术语侧栏；旧 bundle 无此字段视为 {} */
  kcGlossary?: Record<string, KcGlossaryEntry[]>;
  savedAt: number;
}

/**
 * 限长：最多保留最近 200 条；总字符约 200k（超出从最早删）。避免 localStorage 过大。
 */
export function truncateWorkspaceDialogue(turns: WorkspaceDialogueTurn[]): WorkspaceDialogueTurn[] {
  const MAX_TURNS = 200;
  const MAX_CHARS = 200_000;
  let t = [...turns];
  while (t.length > MAX_TURNS) t.shift();
  let total = t.reduce((s, x) => s + x.text.length, 0);
  while (total > MAX_CHARS && t.length > 0) {
    total -= t[0].text.length;
    t.shift();
  }
  return t;
}

/**
 * 根据当前图谱中的原子列表合并覆盖度：保留仍存在的 atomId 的 true，新原子为 false。
 */
export function mergeAtomCoverageForMap(
  prev: AtomCoverageByKc | undefined,
  contentMap: LSAPContentMap
): AtomCoverageByKc {
  const next: AtomCoverageByKc = {};
  for (const kc of contentMap.kcs) {
    next[kc.id] = {};
    for (const atom of kc.atoms ?? []) {
      const was = prev?.[kc.id]?.[atom.id];
      next[kc.id][atom.id] = was === true;
    }
  }
  return next;
}

/**
 * 从 atomId 反查所属 kcId。
 *
 * 实现约定：仅基于 LogicAtom 在 KC 内的物理归属（即遍历 `kc.atoms` 查 `atom.id === atomId`），
 * **禁止**通过 atomId 字符串解析（如 split/正则/前缀切分）推断 kcId——atomId 格式
 * `atom-${kc.id}-${index}` 是生成约定，不可作为反查依据，未来格式调整不应破坏调用方。
 *
 * 命中即返回 KC.id；遍历完所有 KC 仍未命中返回 null（让调用方决定如何处理"野生 atom"）。
 *
 * 用途（阶段 1 仅声明，阶段 3 才被多选 coverage 分发逻辑消费）：
 * 多选 KC 对话路径下，AI 一次返回的 coveredAtomIds 可能横跨多个 KC，
 * 客户端需按本函数把每个 atomId 归到正确的 KC 行（再交给原 mergeCoverageForKc 写入）。
 *
 * 时间复杂度 O(K × A)，K=KC 数，A=平均 atom 数；
 * 30 KC × 5 atom 量级下 microsecond 级，无需引入派生反向索引（YAGNI）。
 *
 * @param atomId 待反查的 atom id
 * @param contentMap workspaceLsapContentMap（KC 列表数据源）
 * @returns 所属 kc.id；若 atom 不存在于任何 KC 则返回 null
 */
export function lookupKcIdByAtomId(
  atomId: string,
  contentMap: LSAPContentMap
): string | null {
  for (const kc of contentMap.kcs) {
    if (kc.atoms?.some((a) => a.id === atomId)) {
      return kc.id;
    }
  }
  return null;
}

/**
 * 本场备考工作台 LSAP 稳定键（与合并材料顺序一致；材料 link 集合变化则键变）。
 * 格式：`workspace-lsap-<hash>`
 */
export function computeExamWorkspaceLsapKey(
  userId: string,
  examId: string,
  materialLinks: ExamMaterialLink[]
): string {
  const sorted = [...materialLinks].sort((a, b) => (a.sortIndex ?? a.addedAt) - (b.sortIndex ?? b.addedAt));
  const sig = sorted.map((l) => `${l.id}:${l.sourceType}:${l.fileHash ?? ''}:${l.cloudSessionId ?? ''}`).join('|');
  const raw = `${userId}|${examId}|${sig}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 33) ^ raw.charCodeAt(i);
  }
  return `workspace-lsap-${(h >>> 0).toString(36)}`;
}

export function loadWorkspaceLsapBundle(key: string): WorkspaceLsapBundle | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceLsapBundle;
    if (!parsed?.contentMap?.kcs?.length || !parsed?.state) return null;
    if (!parsed.atomCoverage) parsed.atomCoverage = {};
    if (!parsed.dialogueTranscript) parsed.dialogueTranscript = [];
    if (!parsed.kcGlossary) parsed.kcGlossary = {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorkspaceLsapBundle(key: string, bundle: WorkspaceLsapBundle): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(bundle));
  } catch (e) {
    console.warn('saveWorkspaceLsapBundle', e);
  }
}
