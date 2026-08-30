/**
 * @max-null/dsh-quick-toolbar — 适配器定义（v1.2）
 *
 * 适配器 = 对「已知插件按钮」的建模（数据优先，声明式）：
 * 引擎按适配器收集分散按钮 → 聚合呈现（标题栏/悬浮球）→ 点击时执行行为。
 * 三方插件无需配合（适配外包：引擎提供 schema + 黄金内置集，用户 LLM 按模板
 * 生成适配写入配置——见 doc/设计）。
 */

/** 行为枚举（v1 声明式；引擎行为库实现） */
export type ActDef =
  | { kind: 'click' }
  | { kind: 'toggle-panel'; close?: string }
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
    icon: { source: 'from-button' },
    label: '插件中心',
    act: { kind: 'dispatch-event', event: 'ssid:titlebar', detail: 'plugin-center' },
    hide: true,
  },
  {
    id: 'dsh-better-sidebar.sidebar',
    button: '[class*="toggleCluster"]',
    icon: { source: 'from-button' },
    label: '侧栏',
    act: { kind: 'dispatch-event', event: 'ssid:titlebar', detail: 'sidebar' },
    hide: true,
  },
  {
    id: 'dsh-better-sidebar.bottom',
    button: '[class*="toggleCluster"]',
    icon: { source: 'from-button' },
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
    id: 'dsh-settings',
    button: 'button[aria-label="设置"], button[aria-label="Settings"]',
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
