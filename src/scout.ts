/**
 * @max-null/dsh-quick-toolbar — scout：未识别按钮扫描（v2 M2 最小闭环）
 *
 * 哲学（用户定稿）：载体（工具栏插槽）精致由我们做；整合（环境按钮注册）
 * 由环境 LLM 做——scout 是整合链路的**半自动**第一环：
 * 扫描挂载点 → 与既有适配器（内置 + 用户）比对 → 产出生提示词（含候选
 * DOM 摘要）→ 用户粘贴给 LLM → LLM 产出适配 JSON → 写入 → 生效。
 * 建议制（V2-2）：只发现+提示词，绝不自动生成/写入/触发。
 */

/** 挂载点语义锚点（扫描基域；DSH 官方 slot 名——调研点③（2026-08-30 查证）：
 *  sidebar.settings（设置区）→ 已含于用户描述；扩展随 M2 全量做。 */
export const SCOUT_ANCHORS = [
  'button, [role="button"]',
] as const

/** 一个未识别候选（DOM 摘要，供 LLM 出选择器/文案）。 */
export interface ScoutCandidate {
  tag: string
  ariaLabel: string | null
  title: string | null
  text: string
  /** 选择器定位提示：标签+类段（模块哈希前缀剥离后的稳定段） */
  hint: string
  /** 是否可见（可见性过滤） */
  visible: boolean
}

/** 既有适配器的 button 选择器（用于"已收编"判定）。 */
export type MatchedButtonQuery = (el: unknown) => boolean

/**
 * 扫描：给定 DOM 枚举回调 + 已适配判定，产出未识别候选。
 * @param enumerate - 枚举候选元素（浏览器：~所有 button/[role=button]；测试注入桩）
 * @param isAdapted - 该元素是否已被既有适配器覆盖（选择器命中则 true）
 * @param extract - 从元素提取摘要（浏览器：DOM → ScoutCandidate；测试注入桩）
 */
export function scanCandidates(
  enumerate: () => unknown[],
  isAdapted: (el: unknown) => boolean,
  extract: (el: unknown) => ScoutCandidate,
): ScoutCandidate[] {
  const out: ScoutCandidate[] = []
  const seen = new Set<string>()
  for (const el of enumerate()) {
    if (isAdapted(el)) continue
    const c = extract(el)
    // 去重（同 text+aria 视为同候选）；不可见候选保留但标记（防止误报输入）
    const key = `${c.tag}|${c.ariaLabel ?? ''}|${c.text.slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out.sort((a, b) => Number(b.visible) - Number(a.visible) || a.text.localeCompare(b.text))
}

/** 候选 → 生成提示词（组合 adapters.prompt.md 头 + 候选 DOM 摘要表）。 */
export function buildPrompt(candidates: readonly ScoutCandidate[], promptTemplate: string): string {
  const rows = candidates
    .map((c) => `- \`<${c.tag.toLowerCase()}>\` ${c.ariaLabel !== null ? `aria="${c.ariaLabel}" ` : ''}${c.title !== null ? `title="${c.title}" ` : ''}文本="${c.text || '（图标按钮）'}" ${c.visible ? '' : '（不可见，忽略）'}`)
    .join('\n')
  return [
    '## 扫描到的未识别候选（quick-toolbar scout）',
    '',
    rows === '' ? '（无候选——当前环境所有按钮已被收编）' : rows,
    '',
    '请为上述候选按下方模板生成适配 JSON（只写数据，选择器必须真实存在）；',
    '一次 1-2 条，验证后扩展。',
    '',
    '--- 模板 ---',
    promptTemplate,
  ].join('\n')
}
