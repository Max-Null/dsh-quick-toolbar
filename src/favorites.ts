/**
 * @max-null/dsh-quick-toolbar — 收藏会话（纯逻辑，client/host 两半共用）。
 *
 * 收藏 = 用户把常去的会话钉进悬浮球，点一下即切过去（`sessions.open`）。
 * 作用域按 **工作区归属** 划分：悬浮球里只列「与当前会话同属一个工作区」的收藏，
 * 上限也按工作区计。
 *
 * 判据是 `WorkspaceView.workspaceId`，不是会话的 `cwd`。DSH 的「工作区」是注册过的
 * 项目目录（`~/.dsh/storages/workspace.json` 的 `workspaces` 表，每行带 `sessionIds`），
 * 归属靠 `sessionIds.includes(sessionId)` 反查——`ui-workspace/tree.ts` 的
 * `owningGroupKey` 就是这么做的。会话的 `cwd` 只是它自己的工作目录，两者不是一回事
 * （同一工作区下可以有多个 cwd，且 cwd 可能缺失），拿它当分组键会让不同工作区的收藏
 * 混在一起（2026-09-14 用户实测反馈）。
 */

/** 会话不属于任何工作区时的分组键，与 DSH 的 `UNGROUPED_KEY` 同值。 */
export const UNGROUPED_KEY = ''

/** 一条收藏。 */
export interface FavoriteSession {
  /** 会话 id（`sessions.open` 的目标）。 */
  id: string
  /** 收藏当时的显示名（`SessionSummary.displayTitle` 的快照，列表读不到时兜底显示）。 */
  title: string
  /** 归属工作区 id（`WorkspaceView.workspaceId`）；空串 = 未归入任何工作区。 */
  workspaceId: string
  /** 收藏当时的工作目录。**不参与分组**，只作展示与排查线索。 */
  cwd: string
  /** 收藏时间戳（毫秒）；列表按它倒序，新收藏的排在前面。 */
  at: number
}

/** 每个工作区的收藏上限。 */
export const FAVORITE_LIMIT = 8

/**
 * 从文件/请求体里取出收藏数组，兼容两种形态：裸数组，或 `{ favorites: [...] }`。
 * 读写两侧必须走同一个提取步骤——只在一侧提取会让「写进去却读不出来」
 * （2026-09-14 实测：POST 提取了 `.favorites`、GET 把整个 `{favorites}` 交给
 * `normalizeFavorites`，而它只认数组，于是落盘成功却始终读回空列表）。
 * @param raw - 解析后的 JSON（任意形状）。
 * @returns 候选值（不保证合法，交由 `normalizeFavorites` 校验）。
 */
export function extractFavorites(raw: unknown): unknown {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { favorites?: unknown }).favorites
    : raw
}

/**
 * 归一化收藏列表（防御非法文件：逐条字段级校验，坏条目丢弃而不拖垮整份）。
 * 同 id 去重（保留靠前的一条）。不按上限截断——上限是「新增」时的准入规则，
 * 已有数据（例如早期版本写入的、或跨工作区累计的）不因规则变化被静默删除。
 * @param raw - 解析后的文件内容（任意形状）。
 * @returns 规整过的收藏列表（按 `at` 倒序）。
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

/**
 * 取某个工作区的收藏（悬浮球实际展示的那一份）。
 * @param list - 全量收藏。
 * @param workspaceId - 当前会话所属工作区 id；`undefined` 与空串等价（都表示未分组）。
 */
export function favoritesForWorkspace(
  list: readonly FavoriteSession[],
  workspaceId: string | undefined,
): FavoriteSession[] {
  const key = workspaceId === undefined ? UNGROUPED_KEY : workspaceId
  return list.filter((f) => f.workspaceId === key)
}

/** 新增收藏的结果。`reason` 仅在 `ok: false` 时有值。 */
export interface AddFavoriteResult {
  ok: boolean
  list: FavoriteSession[]
  reason?: 'limit' | 'duplicate'
}

/**
 * 新增一条收藏（列表已含同 id → duplicate；该 cwd 已达上限 → limit）。
 * 返回**新数组**，调用方负责持久化。
 * @param list - 全量收藏。
 * @param item - 待收藏的会话（`at` 由调用方给，便于测试注入固定时钟）。
 */
export function addFavorite(list: readonly FavoriteSession[], item: FavoriteSession): AddFavoriteResult {
  if (list.some((f) => f.id === item.id)) return { ok: false, list: [...list], reason: 'duplicate' }
  if (favoritesForWorkspace(list, item.workspaceId).length >= FAVORITE_LIMIT) {
    return { ok: false, list: [...list], reason: 'limit' }
  }
  const next = [item, ...list].sort((a, b) => b.at - a.at)
  return { ok: true, list: next }
}

/**
 * 移除一条收藏（不存在则原样返回新数组）。
 * @param list - 全量收藏。
 * @param id - 目标会话 id。
 */
export function removeFavorite(list: readonly FavoriteSession[], id: string): FavoriteSession[] {
  return list.filter((f) => f.id !== id)
}

/**
 * 悬浮球里显示用的短标签：`displayTitle` 可能很长（首条提问全文），截到 12 字
 * 与内置适配器按钮的取字规则一致，完整名走 `title` 提示。
 * @param title - 会话显示名。
 */
export function favoriteLabel(title: string): string {
  const t = title.trim()
  return t.length > 12 ? t.slice(0, 12) + '…' : t
}
