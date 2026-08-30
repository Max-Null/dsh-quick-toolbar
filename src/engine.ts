/**
 * @max-null/dsh-quick-toolbar — 适配器执行器（DOM 绑定层）
 *
 * 引擎运行时：按适配器定位目标元素 → 调行为库 → 防御执行。
 * 行为库保持窄接口（可测）；本层唯一负责 DOM 绑定（browser 环境，
 * 不在 node:test 的范围里——DOM 交互留给 L2 环境验证）。
 */
import { actClick, actTogglePanel, actDispatchEvent, actOpenSettings, actCommand, actScan, type Clickable } from './behaviors.ts'
import type { AdapterDef } from './adapters.ts'
import type { ScoutCandidate } from './scout.ts'

/** 执行环境（浏览器 window 绑定） */
export interface ActEnv {
  /** 按选择器定位元素（可空） */
  find(selector: string): HTMLElement | null
  /** 按选择器定位「可关闭的面板容器」（用于 toggle 探测；无则 null） */
  findPanel(selector: string): { isOpen(): boolean; open(): void; close(): void } | null
  /** 事件派发（CustomEvent） */
  dispatch(event: string, detail?: unknown): boolean
  /**
   * 文本精确匹配（footer 设置触发器无 aria——open-settings 语义定位优先）。
   */
  findByText?(texts: readonly string[]): HTMLElement | null
  /**
   * 执行文本命令（可选通道：DSH master 的 remote.commands.execute；旧版回退
   * composer 输入模拟——实现由 client 环境注入；缺失 = 环境不支持，警告 + false。
   */
  runCommand?(name: string): boolean
  /** 扫描未识别按钮（v2 M2：建议制——只发现+提示词）。 */
  scan?(): readonly ScoutCandidate[]
  /** 适配模板（scout 提示词拼装）。 */
  template?(): string
  /** 呈现扫描结果（复制/提示条——环境实现）。 */
  report?(text: string): void
}

/** 选择器转义（不依赖 CSS 全局——node:test 无 DOM/CSS，行为库测试可用） */
function cssEscape(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

/** 按内置定义执行一条适配器（防御执行：定位失败/禁用 → false，绝不误伤） */
export function runAdapter(adapter: AdapterDef, env: ActEnv): boolean {
  switch (adapter.act.kind) {
    case 'click': {
      const target = env.find(adapter.button)
      return actClick(target as Clickable | null)
    }
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
    case 'open-settings': {
      // v2 调研点①：DSH 无公开 window 钩子——footer trigger 文本语义优先 + 锚点链兜底。
      // adapter.button 用于自绘按钮展示定位；面板打开走行为库定位点击（按钮自身 toggle）。
      if (adapter.act.path !== undefined) {
        console.warn(`quick-toolbar: open-settings path '${adapter.act.path}' 暂不支持（v2 深链待入）`)
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
      return actCommand({ execute: env.runCommand }, adapter.act.name)
    }
    case 'scan': {
      if (env.scan === undefined || env.report === undefined) {
        console.warn('quick-toolbar: scan 环境不可用（无 scan/report 通道）')
        return false
      }
      return actScan({
        scan: env.scan,
        template: env.template !== undefined ? env.template : () => '',
        report: env.report,
      })
    }
  }
}
