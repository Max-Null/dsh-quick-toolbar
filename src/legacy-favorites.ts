/**
 * @max-null/dsh-quick-toolbar — 旧收藏文件的解析（已退役功能的遗留面）。
 *
 * 收藏会话已并入内核置顶（`WorkspaceSnapshot.pinnedSessionIds`），插件不再自管收藏，
 * 也不再提供新增 / 删除 / 上限这些规则。本模块只剩一件事：**解析旧文件**，供一次性
 * 迁移把历史条目灌进内核置顶集合。
 *
 * 生命周期是有限的：host 半读到旧文件就把它改名为 `.migrated`，之后这条路径再也
 * 不会产生内容。所以这里刻意只保留容错解析，不再维护任何写入侧契约。
 */

/** 会话不属于任何工作区时的分组键，与 DSH 的 `UNGROUPED_KEY` 同值。 */
export const UNGROUPED_KEY = ''

/** 一条旧收藏。迁移只用到 `id`，其余字段保留供诊断与人工核对。 */
export interface FavoriteSession {
  /** 会话 id（迁移时 `pinSession` 的目标）。 */
  id: string
  /** 收藏当时的显示名。 */
  title: string
  /** 归属工作区 id（`WorkspaceView.workspaceId`）；空串 = 未归入任何工作区。 */
  workspaceId: string
  /** 收藏当时的工作目录。 */
  cwd: string
  /** 收藏时间戳（毫秒）。 */
  at: number
}

/**
 * 从文件内容里取出收藏数组，兼容两种形态：裸数组，或 `{ favorites: [...] }`。
 *
 * 这个兼容不是过度设计：历史版本里读写两侧曾各提取一次，只在一侧提取会让
 * 「写进去却读不出来」（2026-09-14 实测）。旧文件可能出自任一版本，所以两种都收。
 *
 * @param raw - 解析后的 JSON（任意形状）。
 * @returns 候选值（不保证合法，交由 `normalizeFavorites` 校验）。
 */
export function extractFavorites(raw: unknown): unknown {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { favorites?: unknown }).favorites
    : raw
}

/**
 * 归一化旧收藏列表：逐条字段级校验，坏条目丢弃而不拖垮整份；同 id 去重（保留靠前的
 * 一条）；按 `at` 倒序。
 *
 * **不按任何上限截断**——旧文件里可能存在跨工作区累计的、超过当年 8 个上限的条目，
 * 迁移时应当全部保留（置顶集合本身无上限）。
 *
 * @param raw - 解析后的文件内容（任意形状）。
 * @returns 规整过的收藏列表。
 */
export function normalizeFavorites(raw: unknown): FavoriteSession[] {
  const rows = Array.isArray(raw) ? raw : []
  const out: FavoriteSession[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    const title = typeof r.title === 'string' && r.title.trim() !== '' ? r.title.trim() : id
    out.push({
      id,
      title,
      workspaceId: typeof r.workspaceId === 'string' ? r.workspaceId : UNGROUPED_KEY,
      cwd: typeof r.cwd === 'string' ? r.cwd : '',
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    })
  }
  return out.sort((a, b) => b.at - a.at)
}
