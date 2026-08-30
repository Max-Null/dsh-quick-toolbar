/**
 * @max-null/dsh-quick-toolbar — 适配器执行器（DOM 绑定层）
 *
 * 引擎运行时：按适配器定位目标元素 → 调行为库 → 防御执行。
 * 行为库保持窄接口（可测）；本层唯一负责 DOM 绑定（browser 环境，
 * 不在 node:test 的范围里——DOM 交互留给 L2 环境验证）。
 */
import { actClick, actTogglePanel, actDispatchEvent, actOpenSettings, actCommand, type Clickable } from './behaviors.ts'
import type { ActDef, AdapterDef } from './adapters.ts'

/** 执行环境（浏览器 window 绑定） */
export interface ActEnv {
  /** 按选择器定位元素（可空） */
  find(selector: string): HTMLElement | null
  /** 事件派发（CustomEvent） */
  dispatch(event: string, detail?: unknown): boolean
  /**
   * 文本精确匹配（footer 设置触发器无 aria——open-settings 语义定位优先）。
   */
  findByText?(texts: readonly string[]): HTMLElement | null
  /**
   * 可见性探测（toggle-panel 探测语义用——close 目标可见 = 弹窗开）。
   * 缺省 = env 内建的 rect/computedStyle 判定。
   */
  isVisible?(el: unknown): boolean
  /**
   * 执行文本命令（可选通道：DSH master 的 remote.commands.execute；旧版回退
   * composer 输入模拟——实现由 client 环境注入；缺失 = 环境不支持，警告 + false。
   */
  runCommand?(name: string): boolean
}

/** 遮罩关闭候选链（第二次点击的 mask 通道——DSH 弹窗多为遮罩交互） */
const MASK_CHAINS = [
  '[class$="_backdrop"]',
  '[class*="backdrop"]',
  '[class$="_mask"]',
  '[class*="modal-mask"]',
] as const

/**
 * 归一 secondClick 通道（v0.8.0「二次点击事件」）：secondClick 优先，close 旧字段
 * 兼容（字符串简写 = 点击关闭按钮）。
 */
function closeTargetOf(
  act: Extract<ActDef, { kind: 'toggle-panel' }>,
  env: ActEnv,
): HTMLElement | null {
  const spec = act.secondClick ?? act.close ?? null
  if (spec === null) return null
  if (typeof spec === 'string') return env.find(spec)
  if (spec.kind === 'mask') {
    const probe = env.isVisible ?? defaultIsVisible
    for (let i = 0; i < MASK_CHAINS.length; i++) {
      const el = env.find(MASK_CHAINS[i])
      if (el !== null && probe(el)) return el
    }
    return null
  }
  return env.find(spec.selector)
}

/** 缺省可见性探测（DOM：offset 尺寸优先，computedStyle 兜底） */
function defaultIsVisible(el: unknown): boolean {
  if (el === null || typeof el !== 'object') return false
  const node = el as HTMLElement
  if (typeof node.offsetWidth === 'number') {
    if (node.offsetWidth > 0 || node.offsetHeight > 0) return true
    return false
  }
  if (typeof getComputedStyle === 'function') {
    try {
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden'
    } catch {
      return false
    }
  }
  return false
}

/** 按内置定义执行一条适配器（防御执行：定位失败/禁用 → false，绝不误伤）
 *  「换位置」缺省：act 未填 → click（点击原按钮）。 */
export function runAdapter(adapter: AdapterDef, env: ActEnv): boolean {
  const act = adapter.act ?? { kind: 'click' as const }
  switch (act.kind) {
    case 'click': {
      const target = env.find(adapter.button)
      return actClick(target as Clickable | null)
    }
    case 'dispatch-event':
      return env.dispatch(act.event, act.detail)
    case 'toggle-panel': {
      // 二次点击事件（v0.8.0）：关闭通道可见 = 弹窗开 → 执行关闭；不可见 = 弹窗关
      // → 点原按钮打开。原实现依赖 findPanel/#id-panel 容器协议——从未有环境实现
      // （client 半 findPanel 恒 null；内置项走 toolbarAction 桥接不经引擎），
      // 用户适配器 toggle-panel 因此死路（「添加按钮2」LLM 源码实测发现）。
      const closeEl = closeTargetOf(act, env)
      const target = env.find(adapter.button)
      const probe = env.isVisible ?? defaultIsVisible
      return actTogglePanel(target as Clickable | null, closeEl, probe)
    }
    case 'open-settings': {
      // v2 调研点①：DSH 无公开 window 钩子——footer trigger 文本语义优先 + 锚点链兜底。
      // adapter.button 用于自绘按钮展示定位；面板打开走行为库定位点击（按钮自身 toggle）。
      if (act.path !== undefined) {
        console.warn(`quick-toolbar: open-settings path '${act.path}' 暂不支持（v2 深链待入）`)
      }
      return actOpenSettings({
        find: env.find,
        ...(env.findByText !== undefined ? { findByText: env.findByText } : {}),
      })
    }
    case 'command': {
      if (env.runCommand === undefined) {
        console.warn('quick-toolbar: command 环境无 runCommand 通道（旧版 DSH/未注入）')
        return false
      }
      return actCommand({ execute: env.runCommand }, act.name)
    }
  }
}
