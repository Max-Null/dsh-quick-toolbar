/**
 * @max-null/dsh-quick-toolbar — 行为库（v1.2）
 *
 * 引擎内建的枚举行为实现。**纯函数 + 窄接口**（操作对象以可注入的
 * 元素/环境接口传入）——DOM 无关实现可被 node:test 单元测试；
 * DOM 绑定由引擎执行器负责，V2 的「函数式 act」也经
 * 此层白名单扩展。
 */

/** 可点击元素最小接口（测试可注入 stub） */
export interface Clickable {
  click(): void
  disabled?: boolean
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
 * 面板开/关（v0.8.0 探测语义——替代已废弃的面板容器协议 findPanel/#id-panel，
 * 该协议从未有环境实现：client 半 findPanel 恒 null，内置项走 toolbarAction 桥接，
 * 用户适配器因此死路——「添加按钮2」会话 LLM 源码实测发现）：
 * close 目标**可见** = 弹窗开着 → 点它关闭；**不可见/不存在** = 弹窗关着 → 点原按钮打开。
 * @param openTarget 原按钮（弹窗关着时点击它打开）
 * @param closeTarget 弹窗内关闭按钮（LLM 探测、随弹窗显隐）
 * @param probeVisible 可见性探测（DOM 环境 = rect/computedStyle；测试可 stub）
 */
export function actTogglePanel(
  openTarget: Clickable | null | undefined,
  closeTarget: Clickable | null | undefined,
  probeVisible: (el: unknown) => boolean,
): boolean {
  if (closeTarget !== null && closeTarget !== undefined && closeTarget.disabled !== true && probeVisible(closeTarget)) {
    closeTarget.click()
    return true
  }
  if (openTarget === null || openTarget === undefined || openTarget.disabled === true) return false
  openTarget.click()
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

/** 官方设置触发器锚点链（v2 调研点① 结论：DSH 面板 open 状态由 shell 私有，
 *  公开语义入口 = sidebar.settings 槽的触发按钮——SettingsRoot.tsx onClick
 *  setOpen(true)，footer 触发器类后缀 `_trigger`、无 aria。 */
export const SETTINGS_ANCHORS = [
  '[class$="_trigger"]',
  'button[aria-label="设置"]',
  'button[aria-label="Settings"]',
  '[role="button"][aria-label="设置"]',
  '[role="button"][aria-label="Settings"]',
  'button[title="设置"]',
  'button[title="Settings"]',
] as const

/** 官方设置关闭目标锚点链（面板开着时二次点击应关闭——trigger onClick 只
 *  setOpen(true) 原生不 toggle，2026-08-30 用户实测「再点关闭失败」）。 */
export const SETTINGS_CLOSE_ANCHORS = [
  'button[class$="_close"]',
  'button[aria-label="关闭"]',
  'button[title="关闭"]',
] as const

/** 设置面板打开判定（modal mask；SettingsRoot.tsx：mask div onClick=onClose）。 */
export const SETTINGS_MASK_SELECTOR = '[class$="_mask"]'

/** 设置按钮定位环境（锚点链第一条命中即点；未见则 false = 插件未装/改版防御）。 */
export interface SettingsEnv {
  find(selector: string): Clickable | null
  /** 文本精确匹配（footer 触发器无 aria——语义定位优先于此）。 */
  findByText?(texts: readonly string[]): Clickable | null
}

/** 打开/关闭官方设置面板：开着（mask 存在）→ 关闭（close 按钮 → mask 兜底）；
 *  关着 → 文本语义定位优先（footer trigger）→ 锚点链兜底。 */
export function actOpenSettings(env: SettingsEnv): boolean {
  // 再点关闭路径（原生 trigger 只开不关——2026-08-30 用户实测）
  const mask = env.find(SETTINGS_MASK_SELECTOR)
  if (mask !== null && mask !== undefined) {
    for (let i = 0; i < SETTINGS_CLOSE_ANCHORS.length; i++) {
      const closeBtn = env.find(SETTINGS_CLOSE_ANCHORS[i])
      if (closeBtn !== null && closeBtn !== undefined && closeBtn.disabled !== true) {
        closeBtn.click()
        return true
      }
    }
    mask.click()
    return true
  }
  if (env.findByText !== undefined) {
    const byText = env.findByText(['设置', 'Settings'])
    if (byText !== null && byText !== undefined && byText.disabled !== true) {
      byText.click()
      return true
    }
  }
  for (let i = 0; i < SETTINGS_ANCHORS.length; i++) {
    const target = env.find(SETTINGS_ANCHORS[i])
    if (target !== null && target !== undefined && target.disabled !== true) {
      target.click()
      return true
    }
  }
  return false
}

/** 命令执行环境（DSH master：ctx.remote.commands.execute；旧版：composer 输入模拟）。 */
export interface CommandEnv {
  /**
   * 执行一条命令（name 不含前导斜杠）。
   * @returns 是否成功触发（false = 环境不支持/定位失败，静默防御）。
   */
  execute(name: string): boolean
}

/** 触发 dsh-commands 文本命令（空白名防御；执行语义由环境实现——v2 调研点②）。 */
export function actCommand(env: CommandEnv, name: string): boolean {
  if (name === undefined || name === null || name.trim() === '') return false
  return env.execute(name.trim())
}
