/**
 * @max-null/dsh-quick-toolbar — 置顶会话的显示折叠（纯逻辑，可单测）。
 *
 * 数据源是**内核的置顶集合**（`WorkspaceSnapshot.pinnedSessionIds`），不再是插件自管的
 * 收藏文件。这里只做「把一串 id 折成按工作区分组的显示结构」，不碰任何服务调用，
 * 所以可以脱离浏览器与内核单测。
 *
 * 分组键是 `WorkspaceView.workspaceId`，不是会话的 `cwd`：DSH 的工作区是注册过的项目
 * 目录，归属靠 `sessionIds.includes(sessionId)` 反查（`ui-workspace/tree.ts` 的
 * `owningGroupKey` 就是这么做的）。同一工作区下可以有多个 `cwd`，且 `cwd` 可能缺失，
 * 拿它当分组键会让不同工作区的条目混在一起（2026-09-14 用户实测反馈）。
 */

/** 会话不属于任何工作区时的分组键，与 DSH 的 `UNGROUPED_KEY` 同值。 */
export const UNGROUPED_KEY = ''

/** 未分组那一档的标题。 */
export const UNGROUPED_TITLE = '未分组'

/** 归属已不可考那一档的标题。 */
export const UNRESOLVED_TITLE = '已失效'

/** 分组的类别——调用方据此决定渲染与样式，不必解析 `workspaceId` 的取值。 */
export type PinnedGroupKind = 'workspace' | 'ungrouped' | 'unresolved'

/** 一条待显示的置顶条目。 */
export interface PinnedEntry {
  /** 会话 id（跳转的目标）。 */
  id: string
  /** 显示名；读不到时回落到 id。 */
  title: string
  /** 归属工作区 id；空串 = 未归入任何工作区。 */
  workspaceId: string
  /** 会话是否仍然存在。**失效条目照样出现在结果里**，只是带着这个标记。 */
  alive: boolean
}

/** 一个展示分组。 */
export interface PinnedGroup {
  /** 分组类别。 */
  kind: PinnedGroupKind
  /** 工作区 id；`kind` 为 `unresolved` 时是无意义的占位，不要拿来查元数据。 */
  workspaceId: string
  /** 组标题：工作区显示名、`未分组`、或 `已失效`。 */
  title: string
  /** 组内条目，顺序与传入的 `pinnedIds` 一致。 */
  entries: PinnedEntry[]
}

/**
 * 折置顶集合时对单个 id 的查询结果。
 * @property workspaceId - 归属工作区 id；空串 = 未分组。
 * @property title - 会话显示名。
 * @property alive - 会话是否仍然存在。
 */
export interface PinnedLookup {
  workspaceId: string
  title: string
  alive: boolean
}

/**
 * 把置顶集合折成按工作区分组的显示结构。
 *
 * **两个顺序都由输入决定**，不由字典序或时间决定：
 * - **组内**跟 `pinnedIds` 的顺序（内核给的「最近置顶优先」）。
 * - **组间**按各组首个成员在 `pinnedIds` 中的位置——自然且稳定，不因重渲跳动。
 *
 * **失效条目保留在结果里**（`resolve` 返回 `null`，或返回的 `alive` 为假）：静默隐藏会让
 * 用户既看不见它、也没法取消它。查得到归属的失效条目留在自己的工作区分组；查不到归属的
 * 集中到 `kind: 'unresolved'` 那一档，恒定排在最后。
 *
 * 工作区标题查不到时回落到工作区 id——**不隐藏整个分组**，那同样是静默丢东西。
 *
 * @param pinnedIds - 内核置顶集合，顺序即内核给的顺序。
 * @param resolve - 给 id 返回归属与标题；会话或工作区查不到时返回 `null`。
 * @param workspaceTitle - 给工作区 id 返回显示名；查不到时返回 `null`。
 * @returns 分组后的显示结构；`pinnedIds` 为空时返回空数组。
 */
export function groupPinned(
  pinnedIds: readonly string[],
  resolve: (id: string) => PinnedLookup | null,
  workspaceTitle: (workspaceId: string) => string | null,
): PinnedGroup[] {
  const named: PinnedGroup[] = []
  /** 键 → 在 `named` 中的下标；建组的顺序即组间顺序。 */
  const indexOf = new Map<string, number>()
  const unresolved: PinnedEntry[] = []

  for (const id of pinnedIds) {
    const hit = resolve(id)
    if (hit === null) {
      unresolved.push({ id, title: id, workspaceId: UNGROUPED_KEY, alive: false })
      continue
    }
    let index = indexOf.get(hit.workspaceId)
    if (index === undefined) {
      index = named.length
      indexOf.set(hit.workspaceId, index)
      named.push({
        kind: hit.workspaceId === UNGROUPED_KEY ? 'ungrouped' : 'workspace',
        workspaceId: hit.workspaceId,
        title: '',
        entries: [],
      })
    }
    named[index].entries.push({
      id,
      title: hit.title === '' ? id : hit.title,
      workspaceId: hit.workspaceId,
      alive: hit.alive,
    })
  }

  for (const group of named) {
    group.title = group.kind === 'ungrouped'
      ? UNGROUPED_TITLE
      : (workspaceTitle(group.workspaceId) ?? group.workspaceId)
  }
  return unresolved.length === 0
    ? named
    : [...named, { kind: 'unresolved', workspaceId: '', title: UNRESOLVED_TITLE, entries: unresolved }]
}

/**
 * 菜单与 ☆ 按钮上显示的短标签：`displayTitle` 可能很长（首条提问全文），截到 12 字，
 * 与内置适配器按钮的取字规则一致；完整名走 `title` 提示。
 * @param title - 会话显示名。
 * @returns 截断后的标签；纯空白输入返回空串。
 */
export function sessionLabel(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > 12 ? trimmed.slice(0, 12) + '…' : trimmed
}
