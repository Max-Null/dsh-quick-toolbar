/**
 * @max-null/dsh-quick-toolbar — 适配器执行器（DOM 绑定层）
 *
 * 引擎运行时：按适配器定位目标元素 → 调行为库 → 防御执行。
 * 行为库保持窄接口（可测）；本层唯一负责 DOM 绑定（browser 环境，
 * 不在 node:test 的范围里——DOM 交互留给 L2 环境验证）。
 */
import { actClick, actTogglePanel, actDispatchEvent, type Clickable } from './behaviors.ts'
import type { AdapterDef } from './adapters.ts'

/** 执行环境（浏览器 window 绑定） */
export interface ActEnv {
  /** 按选择器定位元素（可空） */
  find(selector: string): HTMLElement | null
  /** 按选择器定位「可关闭的面板容器」（用于 toggle 探测；无则 null） */
  findPanel(selector: string): { isOpen(): boolean; open(): void; close(): void } | null
  /** 事件派发（CustomEvent） */
  dispatch(event: string, detail?: unknown): boolean
}

/** 选择器转义（不依赖 CSS 全局——node:test 无 DOM/CSS，行为库测试可用） */
function cssEscape(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

/** 按内置定义执行一条适配器（防御执行：定位失败/禁用 → false，绝不误伤） */
export function runAdapter(adapter: AdapterDef, env: ActEnv): boolean {
  const target = env.find(adapter.button)
  switch (adapter.act.kind) {
    case 'click':
      return actClick(target as Clickable | null)
    case 'dispatch-event':
      return env.dispatch(adapter.act.event, adapter.act.detail)
    case 'toggle-panel': {
      // 面板定位（默认取本插件按钮所在的面板容器；close 目标按选择器探测）
      const panel = env.findPanel(`#${cssEscape(adapter.id)}-panel`)
      if (panel !== null) {
        const closeEl = adapter.act.close !== undefined
          ? (env.find(adapter.act.close) as Clickable | null)
          : null
        return actTogglePanel(panel, closeEl)
      }
      // 面板容器缺失（插件未装/未激活）→ 静默跳过
      return false
    }
    case 'open-settings':
    case 'command':
      // v1 未实现行为：明确报不支持（不吞；也不假装成功）
      console.warn(`quick-toolbar: act kind '${adapter.act.kind}' 未实现（v1）`)
      return false
  }
}
