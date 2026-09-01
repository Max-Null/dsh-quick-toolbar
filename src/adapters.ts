/**
 * @max-null/dsh-quick-toolbar — 适配器定义（v1.2）
 *
 * 适配器 = 对「已知插件按钮」的建模（数据优先，声明式）：
 * 引擎按适配器收集分散按钮 → 聚合呈现（标题栏/悬浮球）→ 点击时执行行为。
 * 三方插件无需配合（适配外包：引擎提供 schema + 黄金内置集，用户 LLM 按模板
 * 生成适配写入配置——见 doc/设计）。
 */

/** 二次点击事件的关闭通道（v0.8.0 用户命名：LLM 注册"再点一次时如何关闭"，
 *  而非脆弱的 CSS 选择器）——字符串 = 点击关闭按钮选择器（简写）；
 *  {kind:'mask'} = 点遮罩关闭（DSH 弹窗通用交互，推荐优先探测）；
 *  {kind:'click', selector} 显式形式。 */
export type SecondClickChannel =
  | string
  | { kind: 'mask' }
  | { kind: 'click'; selector: string }

/** 行为枚举（v1 声明式；引擎行为库实现） */
export type ActDef =
  | { kind: 'click' }
  /** 二次点击事件：弹窗开着时（引擎按通道可见性判定）执行 secondClick 关闭动作；
   *  关着时点击原按钮打开。 */
  | { kind: 'toggle-panel'; secondClick?: SecondClickChannel; close?: string }
  | { kind: 'dispatch-event'; event: string; detail?: string }
  | { kind: 'open-settings'; path?: string }
  | { kind: 'command'; name: string }

/** 图标来源：from-button（扣原按钮）/ custom（emoji 或 svg data-uri） */
export type IconDef = { source: 'from-button' } | { source: 'custom'; value: string }

/** 一条适配器（zod 校验对象；用户配置同构）
 *  最小注册（「换位置」）：仅 id+button——图标/文字/点击缺省推导。 */
export interface AdapterDef {
  /** 插件标识（去重/开关） */
  id: string
  /** 分散按钮定位（CSS 选择器） */
  button: string
  /**
   * 目标按钮文本兜底（探测/定位用）：选择器依赖 CSS module 哈希类，
   * 上层升级类名变化即失效——aria-label/textContent 是稳定语义。
   * 提供后 adapterVisible/隐藏定位可随文本命中（任一即命中）。
   */
  buttonTexts?: readonly string[]
  /** 图标来源（缺省 from-button——扣取原按钮视觉） */
  icon?: IconDef
  /** 工具栏显示名（缺省扣原按钮文案） */
  label?: string
  /** 点击行为（缺省 click——点击原按钮） */
  act?: ActDef
  /** 点击后隐藏原按钮（默认 true） */
  hide?: boolean
  /** 用户可单独关闭（默认 true） */
  enabled?: boolean
}

/**
 * 内置适配器集（黄金示例 = few-shot 语料 + 兜底；2026-08-30 现状按钮）。
 * 注意：v0.1.x 时代这些按钮经「标题栏事件」驱动（ssid:titlebar），本表的
 * act 描述同一行为的适配器形态；引擎执行器接入后逐步切换为适配器消费。
 */
export const BUILTIN_ADAPTERS: readonly AdapterDef[] = [
  {
    id: 'dsh-plugin-center',
    button: '[class*="pc-headerbtn"]',
    // 2026-09-02 实证：alpha.2 页面插件中心入口已是侧栏导航项（CSS module
    // 哈希类，无 pc-headerbtn）——文本兜底保证悬浮球按钮不丢。
    buttonTexts: ['插件中心', 'Plugin center'],
    icon: { source: 'from-button' },
    label: '插件中心',
    act: { kind: 'dispatch-event', event: 'ssid:titlebar', detail: 'plugin-center' },
    hide: true,
  },
  {
    id: 'dsh-better-sidebar.sidebar',
    button: '[class*="toggleCluster"]',
    // custom 图标（与 better-sidebar 官方 toggle 同款）：from-button 抓取
    // 会拿到 Cluster 第一个 svg（底栏按钮的 PanelBottom），侧栏/底栏同图
    // ——2026-08-31 用户反馈「侧栏图标错了」实证后改确定性内建图标。
    icon: { source: 'custom', value: 'sidebar' },
    label: '侧栏',
    act: { kind: 'dispatch-event', event: 'ssid:titlebar', detail: 'sidebar' },
    hide: true,
  },
  {
    id: 'dsh-better-sidebar.bottom',
    button: '[class*="toggleCluster"]',
    icon: { source: 'custom', value: 'bottom' },
    label: '底栏',
    act: { kind: 'dispatch-event', event: 'ssid:titlebar', detail: 'bottom' },
    hide: true,
  },
  {
    id: 'dsh-session-manager',
    button: '.sm-footerBtn',
    icon: { source: 'from-button' },
    label: '会话管理',
    act: { kind: 'toggle-panel', close: '.sm-modal .close' },
    hide: true,
  },
  {
    // 官方设置（v2 M1：语义锚点链——DSH 无公开 window 钩子，见 doc/设计/2026-08-30 v2 A1）。
    // button 用于展示定位（自绘入口）；面板打开经行为库 SETTINGS_ANCHORS 双 locale 点击。
    // 2026-09-02 实证：alpha.2 设置按钮无 aria-label（仅文本，footer _trigger 类）——
    // 文本兜底保证探测命中；打开仍走语义锚点链（[class$="_trigger"] 优先）。
    id: 'dsh-settings',
    button: 'button[aria-label="设置"], button[aria-label="Settings"]',
    buttonTexts: ['设置', 'Settings'],
    icon: { source: 'custom', value: 'settings' },
    label: '设置',
    act: { kind: 'open-settings' },
    hide: false,
  },
]

/** 按 id 取内置适配器（去重语义：同名后续覆盖） */
export function builtinAdapter(id: string): AdapterDef | undefined {
  return BUILTIN_ADAPTERS.find((a) => a.id === id)
}

/**
 * 目标可用性探测：选择器命中优先；未命中且声明 buttonTexts 时按
 * aria-label/textContent 文本命中兜底（CSS module 哈希类变化后语义文本
 * 仍稳定）。任一命中 = 对应入口存在，悬浮球才渲染其聚合按钮。
 * @param a - 适配器。
 * @param root - 探测根（DOM 环境 = document；测试可注入 stub）。
 */
export function adapterVisible(a: AdapterDef, root: ParentNode): boolean {
  try {
    if (root.querySelector(a.button) !== null) return true
  } catch { /* 选择器不合法（含未知伪类）→ 走文本兜底 */ }
  const wants = a.buttonTexts ?? []
  if (wants.length === 0) return false
  const nodes = root.querySelectorAll('button, [role="button"], a')
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as Element
    const label = (el.getAttribute('aria-label') ?? '').trim()
    const text = (el.textContent ?? '').trim()
    for (const want of wants) {
      if (label === want || text === want) return true
    }
  }
  return false
}
