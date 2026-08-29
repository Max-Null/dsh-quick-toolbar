/**
 * @max-null/dsh-quick-toolbar — 行为库（v1.2）
 *
 * 引擎内建的枚举行为实现。**纯函数 + 窄接口**（操作对象以可注入的
 * 元素/环境接口传入）——DOM 无关实现可被 node:test 单元测试；
 * DOM 绑定由引擎执行器（下一里程碑）负责，V2 的「函数式 act」也经
 * 此层白名单扩展。
 */

/** 可点击元素最小接口（测试可注入 stub） */
export interface Clickable {
  click(): void
  disabled?: boolean
}

/** 面板容器最小接口（toggle 探测） */
export interface PanelLike {
  isOpen(): boolean
  open(): void
  close(): void
}

/** 事件派发环境（浏览器 window / 测试 stub） */
export interface DispatchEnv {
  dispatchEvent(event: Event): boolean
}

/**
 * 直接点击目标（定位失败/禁用 → 静默跳过；称「防御执行」）。
 */
export function actClick(target: Clickable | null | undefined): boolean {
  if (target === null || target === undefined || target.disabled === true) return false
  target.click()
  return true
}

/**
 * 面板开/关：再点关闭（探测 close 选择器内的「关闭」按钮——原生无
 * 再点关闭的插件（如 dsh-session-manager 0.4.x）走此行为。
 */
export function actTogglePanel(
  panel: PanelLike,
  closeTarget: Clickable | null | undefined,
): boolean {
  if (panel.isOpen()) {
    if (closeTarget !== null && closeTarget !== undefined && closeTarget.disabled !== true) {
      closeTarget.click()
      return true
    }
    return false
  }
  panel.open()
  return true
}

/** 派发 CustomEvent（标题栏桥接 / header-unify 通道）。 */
export function actDispatchEvent(
  env: DispatchEnv,
  event: string,
  detail?: string,
): boolean {
  return env.dispatchEvent(new CustomEvent(event, { detail }))
}
