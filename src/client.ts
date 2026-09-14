/**
 * @max-null/dsh-quick-toolbar — browser half.
 *
 * SSiD 标题栏统一按钮组的 DSH 侧执行器（v0.4.0）：
 *
 * 1. 隐藏 DSH 内的原按钮（插件中心 header 按钮 + better-sidebar 的
 *    toggleCluster），消除双入口与错位——统一由自绘标题栏按钮组接管。
 *    （v0.19.0 起 better-sidebar 不再自绘右侧面板：右列归 DSH 原生右侧栏，
 *    其会话头开关保留；只隐藏它自绘的底栏开关——2026-09-14 用户拍板。）
 * 2. 监听 main 进程经 `mainView.webContents.executeJavaScript` 派发的
 *    `ssid:titlebar` CustomEvent：
 *      detail = 'plugin-center' → win.__pluginCenterToggle?.()
 *                                （plugin-center v0.1.7+ 全局控制器：再点关闭；
 *                                  老版回退 __pluginCenterOpen）
 *      detail = 'sidebar'       → 先 __pluginCenterClose?.()（互斥：模态让位
 *                                工具面板），再切换侧栏/底栏（见 panelButtons：
 *                                官方右侧边栏的会话头按钮 / 底栏自绘开关）
 *      detail = 'bottom'        → 同上，click 第一个按钮（窄屏无底栏则跳过）
 *      detail = 'session-manager' → 打开会话管理面板（桥接 click footer 按钮）
 * 3. 会话管理入口统一：隐藏 dsh-session-manager 的 footer 按钮
 *    （.sm-footerBtn，display:none 后 JS .click() 仍触发 React onClick），
 *    在会话 header（.sm-header，归档/移动按钮行）内嵌「会话管理」按钮；
 *    shell 标题栏按钮组经 ssid:titlebar 事件也可打开（web 无标题栏时
 *    内嵌按钮兜底）。
 * 4. 悬浮快捷工具栏（v0.4.0）：被屏蔽/接管按钮（插件中心、侧栏、底栏、
 *    会话管理）的常驻出口——可拖拽移动（localStorage 持久化）、可展开/
 *    收起；壳环境与无壳 web 均显示（与标题栏按钮组互为冗余，用户可收起）。
 * 5. i18n（v0.4.2）：全部用户可见文案（工具栏标题/按钮/aria/title）跟随
 *    document.documentElement.lang（zh* → 中文，其余 → 英文），并监听
 *    lang 变化动态切换（DSH 异步设置语言，初始可能为静态 HTML 的 en）。
 *
 * 选择器只用 CSS Modules 的原始段或宿主/插件给出的稳定属性，
 * 与哈希前缀无关：better-sidebar 升级只要不改类名或 data 属性即有效
 * （v0.19.0 的 toggleCluster → 会话头按钮 + nArs4W_toggleButton 即一例）。
 * 隐藏元素仍可被 JS 的 .click() 触发（无需可见），与壳已有的
 * 「侧边栏自动诊断」同模式。
 */

import { BUILTIN_ADAPTERS, builtinAdapter, adapterVisible, type AdapterDef } from './adapters.ts'
import { runAdapter, type ActEnv } from './engine.ts'
import {
  FAVORITE_LIMIT,
  addFavorite,
  favoriteLabel,
  favoritesForCwd,
  normalizeFavorites,
  removeFavorite,
  type FavoriteSession,
} from './favorites.ts'
import { REGISTER_BRIEF } from './register-brief.ts'

(window as unknown as { __ModuleLoader__: { load: (definition: unknown) => unknown } }).__ModuleLoader__.load({
  id: '@max-null/dsh-quick-toolbar',
  factory: (require: unknown) => {
    var module = { exports: {} as Record<string, unknown> }
    var exports = module.exports
    // 老协议插件中心的半全局控制器引用（plugin-center v0.1.7+ toggle /
    // 更老 open+close）——全局脚本内 declare global 不生效，局部打字。
    var win = window as unknown as {
      __pluginCenterToggle?: () => void
      __pluginCenterOpen?: () => void
      __pluginCenterClose?: () => void
      __SSID_SHELL__?: boolean
      __dshQuickToolbarInstalled?: boolean
    }

    var BASE_CSS = [
      '/* SSiD 标题栏统一按钮组：隐藏 DSH 内原按钮，避免双入口与错位 */',
      // 会话管理原 footer 按钮：入口统一到会话 header（.sm-header 内嵌按钮）
      // 与标题栏按钮组（ssid:titlebar 事件）。display:none 后按钮不可见，但
      // JS .click() 仍触发 React onClick——面板照常可开（见 clickSmOpenButton）。
      '.sm-footerBtn { display: none !important; }',
      // 插件中心 header 按钮：统一由标题栏按钮组/悬浮快捷工具栏接管（v0.5.0
      // 起全环境隐藏——无壳 web 靠快捷工具栏兜底，入口不切断；JS .click() 触发）。
      '[class*="pc-headerbtn"] { display: none !important; }',
      // better-sidebar 自绘的**底栏开关**：隐藏，入口统一到标题栏/悬浮球。
      // 官方右侧边栏的会话头开关**不隐藏**（用户 2026-09-14 拍板：它是 DSH
      // 自己的功能、不只服务 better-sidebar，保留更稳）；quick-toolbar 的
      // 「侧栏」按钮作为并列入口存在。
      // 注：v0.19.0 起 better-sidebar 不再自绘右侧面板，旧的 `toggleCluster`
      // 开关簇已随之移除——按 aria-label 定位底栏开关（双 locale）。
      'button[aria-label="折叠底部面板"], button[aria-label="展开底部面板"], '
        + 'button[aria-label="Collapse bottom panel"], button[aria-label="Expand bottom panel"] '
        + '{ display: none !important; }',
      // open-sea-skin 页面浮动设置按钮：标题栏已提供入口（2026-08-22）。
      // 不能用 display:none——其面板按按钮 rect 定位（2026-08-22 实测
      // display:none 后 rect 全 0、面板飞出视口）；visibility:hidden 保留
      // 布局 rect、不可见不可点，且不影响 JS .click()（标题栏入口照常
      // 开关面板）。
      '#__open-sea-skin-btn__ { visibility: hidden !important; pointer-events: none !important; }',
    ].join('\n')
    // 壳专属隐藏（v0.4.2 及以前）：由自绘标题栏接管的原按钮，仅壳环境
    // （main.mjs 注入 win.__SSID_SHELL__）隐藏。
    // v0.5.0 起改为全环境隐藏（见 BASE_CSS 末尾两条）——悬浮快捷工具栏
    // （插件中心/侧栏/底栏）在无壳 web 也接管这些入口，原按钮无需保留。
    var SHELL_CSS: string[] = []

    /**
     * 「侧栏 / 底栏」开关按钮的定位与状态判定。
     *
     * better-sidebar **v0.19.0 起不再自绘右侧面板**：右列交给 DSH 原生右侧栏
     * （插件的 tab 类型经 `ctx.sidebarRightTabs` 注册），旧的 `toggleCluster`
     * 开关簇随之移除（2026-09-14 实测：该类名已不存在 → 旧锚点双双失效）。
     * 底栏仍是它自绘的工作台（`nArs4W_*`）。
     *
     * 锚点以**实测**为准（同日 dev 实测，与源码推断不同）：
     *   侧栏：常驻按钮 `P3OORG_iconButton`（aria-label「收起右侧边栏」），开、合
     *         两态都存在且位置不变 —— 取先命中者，`[data-sidebar-right-expand]`
     *         在本版未渲染（子句保留作跨版本兜底）；
     *   底栏：开关按钮只有 aria-label（本版中文恒为「折叠底部面板」，两态同文案），
     *         `nArs4W_toggleButton` 类名子句当前不命中。
     *
     * 状态判定不再靠 aria-label 反推，改用宿主/插件自己的 DOM 状态：
     *   侧栏：`[data-sidebar-right-open]` 存在 = 展开（ui-sidebar-right 的容器属性）
     *   底栏：`[class*="nArs4W_bottomPanel"]` 带 `bottomPanelHidden` = 折叠
     */
    function panelButtons() {
      var expand = document.querySelector('button[data-sidebar-right-expand]') as HTMLButtonElement | null
      var collapse = document.querySelector(
        'button[aria-label="收起右侧边栏"], button[aria-label="Collapse right sidebar"]',
      ) as HTMLButtonElement | null
      var bottom = document.querySelector(
        'button[class*="nArs4W_toggleButton"], button[aria-label="折叠底部面板"], '
        + 'button[aria-label="展开底部面板"], button[aria-label="Collapse bottom panel"], '
        + 'button[aria-label="Expand bottom panel"]',
      ) as HTMLButtonElement | null
      // 侧栏：本版两态都只有常驻的收起按钮（expand 子句未命中）——取先命中者。
      return { sidebar: expand !== null ? expand : collapse, bottom: bottom }
    }
    /** 右侧边栏是否展开（读宿主容器属性，比 aria-label 可靠）。 */
    function isSidebarOpen() {
      return document.querySelector('[data-sidebar-right-open]') !== null
    }
    /** 底部工作台是否展开（无 `bottomPanelHidden` 即展开；面板未渲染 = 未展开）。 */
    function isBottomOpen() {
      var panel = document.querySelector('[class*="nArs4W_bottomPanel"]')
      if (panel === null) return false
      return (panel.className || '').toString().indexOf('bottomPanelHidden') === -1
    }
    function clickButton(button: HTMLButtonElement | null | undefined) {
      if (button !== null && button !== undefined && !button.disabled) button.click()
    }

    // ── 收藏会话（v0.9.0）：把常去的会话钉进悬浮球，点一下 `sessions.open` 切过去。
    //    作用域按 cwd 划分（只列当前工作区的收藏），上限 FAVORITE_LIMIT/工作区。
    //    持久化走 host 文件（动态端口下 localStorage 跨重启必丢，手册 §7 #10）。 ──

    /** i18n 取词。收藏区每次重渲都重建按钮，故**不走 `trackLocale`**
     *  （那会把失效元素累积进 LOCALE_TARGETS）；改为渲染时按当前语言直取。 */
    function favText(key: string): string {
      var pair = LOCALE_DICT[key]
      if (pair === undefined) return key
      return pair[localeIsZh() ? 0 : 1]
    }

    /** 会话列表快照（服务缺失或未就绪 → null）。 */
    function sessionsSnapshot(): {
      current?: string
      byId?: Record<string, { id?: string, title?: string, displayTitle?: string, cwd?: string, running?: boolean }>
    } | null {
      var svc = sessionsSvc
      if (svc === null || svc.list === undefined || svc.list === null) return null
      if (typeof svc.list.getSnapshot !== 'function') return null
      try {
        return svc.list.getSnapshot() ?? null
      } catch (_e) {
        // 列表服务在启动早期可能尚未接好快照；本次渲染跳过，订阅回调会再来
        return null
      }
    }

    /** 当前会话的 id / 工作目录 / 显示名；无当前会话或服务不可用 → null。 */
    function currentSession(): { id: string, cwd: string, title: string } | null {
      var snap = sessionsSnapshot()
      if (snap === null) return null
      var id = typeof snap.current === 'string' ? snap.current : ''
      if (id === '') return null
      var byId = snap.byId !== undefined && snap.byId !== null ? snap.byId : {}
      var row = byId[id]
      var title = row !== undefined && typeof row.displayTitle === 'string' && row.displayTitle !== '' ? row.displayTitle : id
      var cwd = row !== undefined && typeof row.cwd === 'string' ? row.cwd : ''
      return { id: id, cwd: cwd, title: title }
    }

    /** 会话在列表里仍存在（被删除的收藏不渲染入口，点了会 fail loud）。 */
    function sessionExists(id: string): boolean {
      var snap = sessionsSnapshot()
      if (snap === null) return false
      var byId = snap.byId !== undefined && snap.byId !== null ? snap.byId : {}
      return byId[id] !== undefined
    }

    /** 读收藏（host 文件；读不到就是空列表，不打断工具栏渲染）。 */
    function loadFavorites(done: () => void): void {
      fetch('/quick-toolbar/api/favorites')
        .then(function (r) { return r.json() })
        .then(function (d) {
          var ok = d !== null && typeof d === 'object' && (d as { ok?: unknown }).ok === true
          var value = ok ? (d as { value?: { favorites?: unknown } }).value : undefined
          var rows = value !== undefined && value !== null ? value.favorites : []
          favList = normalizeFavorites(rows)
          done()
        })
        .catch(function () { done() })
    }

    /** 写回收藏（全量替换——客户端持有全量，包含其他工作区的条目）。
     *  先更新内存再发请求：界面即时响应，写失败由下一次操作整体重写。 */
    function saveFavorites(next: FavoriteSession[]): void {
      favList = next
      fetch('/quick-toolbar/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: next }),
      }).catch(function () {})
    }

    /** 收藏/取消收藏当前会话。返回是否发生了变化（供调用方决定是否重渲）。 */
    function toggleCurrentFavorite(): boolean {
      var cur = currentSession()
      if (cur === null) return false
      // 闭包里引用会丢掉窄化，先取成局部常量（下方 some 回调用 curId）
      var curId = cur.id
      var mine = favoritesForCwd(favList, cur.cwd)
      if (favList.some(function (f) { return f.id === curId })) {
        saveFavorites(removeFavorite(favList, curId))
        return true
      }
      if (mine.length >= FAVORITE_LIMIT) return false
      var added = addFavorite(favList, { id: curId, title: cur.title, cwd: cur.cwd, at: Date.now() })
      if (!added.ok) return false
      saveFavorites(added.list)
      return true
    }

    /** 切到某个收藏的会话。 */
    function openFavorite(id: string): void {
      var svc = sessionsSvc
      if (svc === null || typeof svc.open !== 'function') return
      try {
        svc.open(id)
      } catch (_e) {
        // 会话在列表里消失后 open 会 fail loud；入口已在渲染期过滤掉这种情况，
        // 这里的兜底只为「渲染后、点击前刚好被删」的窄窗口
      }
    }

    /**
     * 反向互斥（2026-08-19 用户补充）：打开插件中心前，若侧栏/底栏
     * 开着则先收起，避免弹窗被面板遮挡。两个独立判断：右栏+底栏同时
     * 开着时都要收起（不能用 if/else if，否则短路漏掉一个——用户实测
     * 「双开时底栏保持打开」）。
     */
    function closeSidePanelsBeforePluginCenter() {
      var btns = panelButtons()
      if (isSidebarOpen()) clickButton(btns.sidebar)
      if (isBottomOpen()) clickButton(btns.bottom)
    }

    // ── i18n（v0.4.2）：跟随 document.documentElement.lang（DSH 异步设置，
    // 初始可能仍为静态 HTML 的 en——监听 lang 属性变化动态切换）─────────
    var LOCALE_TARGETS: { el: HTMLElement; key: string; attr: string }[] = []
    function localeIsZh() {
      return ((document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0)
    }
    var LOCALE_DICT: Record<string, string[]> = {
      'tb.title': ['快捷工具栏', 'Quick Toolbar'],
      'tb.pin': ['钉住', 'Pin'],
      'tb.unpin': ['取消钉住', 'Unpin'],
      'tb.pinAria': ['钉住/取消钉住', 'Pin/Unpin'],
      'tb.expandAria': ['展开快捷工具栏', 'Expand quick toolbar'],
      'tb.plugin': ['插件中心', 'Plugin center'],
      'tb.sidebar': ['侧栏', 'Sidebar'],
      'tb.bottom': ['底栏', 'Bottom panel'],
      'tb.sessions': ['会话管理', 'Sessions'],
      'tb.add': ['添加按钮', 'Add button'],
      'tb.addAria': ['添加/迁移按钮（让 LLM 来注册）', 'Add / migrate a button (let the LLM register it)'],
      'sm.open': ['会话管理', 'Sessions'],
      'sm.openTitle': ['打开会话管理面板', 'Open session manager'],
      'fav.add': ['收藏当前会话', 'Favorite current session'],
      'fav.remove': ['取消收藏', 'Unfavorite'],
      'fav.full': ['收藏已满（每工作区 8 个）', 'Favorites full (8 per workspace)'],
      'fav.open': ['打开会话', 'Open session'],
    }
    function applyLocale() {
      var zh = localeIsZh()
      for (var i = 0; i < LOCALE_TARGETS.length; i++) {
        var tgt = LOCALE_TARGETS[i]
        var pair = LOCALE_DICT[tgt.key]
        if (pair === undefined) continue
        var text = pair[zh ? 0 : 1]
        if (tgt.attr === 'text') tgt.el.textContent = text
        else if (tgt.attr === 'text-span') {
          var s = tgt.el.querySelector('span')
          if (s !== null) s.textContent = text
        } else if (tgt.attr === 'title') tgt.el.title = text
        else tgt.el.setAttribute('aria-label', text)
      }
    }
    function trackLocale(el: HTMLElement, key: string, attr: string) {
      LOCALE_TARGETS.push({ el: el, key: key, attr: attr })
    }

    /**
     * 会话管理面板开关桥（v0.4.1，支持 toggle）：dsh-session-manager 0.4.x
     * 的面板打开是单向的（footer 按钮 onClick 恒定 panelStore.set(true)，
     * store 在插件模块闭包内，外部 bundle 无法直接调用），关闭只有面板内
     * 「关闭」按钮（onClose → set(false)）。桥接按钮做成 opened → 关 /
     * closed → 开 的切换：
     *  ① 已打开（.sm-panel 可见）→ 点击面板内「关闭」按钮
     *  ② 未打开 → 按承载版本二选一：
     *     - master（dsh-session-manager 0.4.x）：footer 按钮已被 display:none，
     *       但 .click() 仍触发其 React onClick（panelStore.set(true)）；面板
     *       是 SafePanel 模态，不在按钮内，display:none 不影响其显示。
     *     - rc.2（0.2.x）：header utilities 槽的「会话管理」按钮带稳定标识
     *       [data-dsh-header-button]，click 它 → setDrawer({open:true,view:'manage'})。
     */
    function isSmPanelOpen() {
      var p = document.querySelector('.sm-panel') as HTMLElement
      return p !== null && p.offsetParent !== null
    }
    function clickSmPanelClose() {
      var p = document.querySelector('.sm-panel') as HTMLElement
      if (p === null) return false
      // 关闭按钮在 modal 头部（dialog 内、.sm-panel 外），先在 dialog 内找
      var dialog = p.closest('[role="dialog"]')
      var scopes = dialog !== null ? [dialog, p] : [p]
      for (var s = 0; s < scopes.length; s++) {
        var btns = scopes[s].querySelectorAll('button')
        for (var i = 0; i < btns.length; i++) {
          var label = btns[i].getAttribute('aria-label') || btns[i].getAttribute('title') || btns[i].textContent.trim()
          if (label === '关闭' || label === 'Close') {
            btns[i].click()
            return true
          }
        }
      }
      return false
    }
    function clickSmOpenButton() {
      if (isSmPanelOpen()) { clickSmPanelClose(); return }
      var footer = document.querySelector('.sm-footerBtn') as HTMLButtonElement | null
      if (footer !== null && !footer.disabled) {
        footer.click()
        return
      }
      var manage = document.querySelector('[data-dsh-header-button]') as HTMLButtonElement | null
      if (manage !== null && !manage.disabled) manage.click()
    }

    /**
     * 会话 header（.sm-header：归档/移动至工作区按钮行）内嵌「会话管理」
     * 按钮，web 端（无自绘标题栏）也能打开面板；React 切换会话会重渲染
     * .sm-header，靠 MutationObserver 保活（幂等：id 查重）。
     */
    function mountSmHeaderButton() {
      var header = document.querySelector('.sm-header') as HTMLElement
      if (header === null) return
      if (document.getElementById('ssid-sm-open-btn') !== null) return
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.id = 'ssid-sm-open-btn'
      btn.className = 'sm-headerBtn'
      btn.setAttribute('aria-label', '会话管理')
      btn.title = '打开会话管理面板'
      btn.addEventListener('click', clickSmOpenButton)
      trackLocale(btn, 'sm.open', 'text')
      trackLocale(btn, 'sm.open', 'aria')
      trackLocale(btn, 'sm.openTitle', 'title')
      header.appendChild(btn)
      applyLocale()
    }

    // ── 悬浮快捷工具栏（v0.4.0）─────────────────────────────────────────
    // 承载被 header-unify 屏蔽/接管的按钮（插件中心、侧栏、底栏、会话
    // 管理）：无壳 web 上这些原按钮会被隐藏（或本身无标题栏入口），此处
    // 提供常驻出口；可移动（拖拽 + localStorage 持久化）、可展开/收起。
    // 壳环境（SSiD）同样显示——与标题栏按钮组互为冗余，用户可自行收起。
    var TOOLBAR_ID = 'ssid-toolbar'
    // 本插件样式标签的 data-plugin 归属标记。DSH 的 client 模块系统会把所有
    // 「没有 data-plugin」的 <style> 认领给正在 materialize 的模块
    // （@deepseek-ai/dsh-client-modules 的 claimStyles），HMR 重载那个模块时再按
    // data-plugin === 模块 id 逐字匹配删除（@deepseek-ai/dsh-client-hmr 的
    // removeOwnedStyles）——裸注入的样式因此会被别人的重载一起删掉，而元素留存，
    // 表现为「悬浮球样式全没、刷新才恢复」。用一个独立于模块 id 的稳定值：
    // 既不进别人的账，也不会随本模块的进出被清掉。
    var QT_STYLE_OWNER = 'dsh-quick-toolbar-styles'

    /** 本插件两份样式的幂等键（各自代表一份 CSS 的角色名）。 */
    var QT_BASE_STYLE_KEY = '@max-null/dsh-quick-toolbar/base'
    var QT_TOOLBAR_STYLE_KEY = '@max-null/dsh-quick-toolbar/toolbar'

    /**
     * 注入或就地更新一个样式标签（幂等 + 内容比对）。
     *
     * 内容比对而非「已存在就跳过」：本模块在 HMR 重载后会重新执行，沿用旧标签会让
     * 旧 CSS 一直占住该键，改动看着像生效了、实际仍是旧规则（chat-rail 同款实测）。
     * 壳标志 __SSID_SHELL__ 由 main.mjs 在 dom-ready 注入、晚于 apply，SHELL_CSS
     * 正是靠这次比对补进去。
     */
    function ensureStyleTag(marker: string, key: string, text: string): void {
      var existing = document.head.querySelector('style[data-plugin-css="' + key + '"]') as HTMLStyleElement | null
      if (existing === null) {
        var tag = document.createElement('style')
        tag.setAttribute(marker, '')
        tag.setAttribute('data-plugin', QT_STYLE_OWNER)
        tag.setAttribute('data-plugin-css', key)
        tag.textContent = text
        document.head.appendChild(tag)
        return
      }
      if (existing.textContent !== text) existing.textContent = text
    }

    /** 本插件的两份样式（基础 + 悬浮工具栏），每次都按当前壳标志重算内容。 */
    function ensureStyles(): void {
      var base = BASE_CSS + (SHELL_CSS.length > 0 && win.__SSID_SHELL__ === true ? '\n' + SHELL_CSS.join('\n') : '')
      ensureStyleTag('data-dsh-quick-toolbar', QT_BASE_STYLE_KEY, base)
      ensureStyleTag('data-dsh-quick-toolbar-toolbar', QT_TOOLBAR_STYLE_KEY, TOOLBAR_CSS)
    }
    var TOOLBAR_POS_KEY = 'ssid-toolbar-pos'
    var TOOLBAR_COLLAPSED_KEY = 'ssid-toolbar-collapsed'
    var TOOLBAR_PINNED_KEY = 'ssid-toolbar-pinned'
    // 状态 host 化（2026-08-30 手册 §7.10 规则：动态端口下页面 localStorage 按
    // origin 隔离、跨重启必丢）——持久状态存 ~/.dsh/quick-toolbar-state.json，
    // 经 host 半 /quick-toolbar/api/state 桥读写；页面 localStorage 不再用于持久态。
    var qtState = {
      pos: null as { x: number; y: number } | null,
      collapsed: true,
      pinned: false,
      shellVisible: false,
    }
    var loadState = function (done: () => void) {
      fetch('/quick-toolbar/api/state')
        .then(function (r) { return r.json() })
        .then(function (data: unknown) {
          var s = data !== null && typeof data === 'object' && (data as { ok?: unknown }).ok === true
            ? (data as { state?: { pos?: { x: number; y: number } | null; collapsed?: boolean; pinned?: boolean; shellVisible?: boolean } }).state
            : undefined
          if (s !== undefined && s !== null) {
            if (s.pos !== null && s.pos !== undefined && typeof s.pos.x === 'number' && typeof s.pos.y === 'number') {
              qtState.pos = { x: s.pos.x, y: s.pos.y }
            }
            if (typeof s.collapsed === 'boolean') qtState.collapsed = s.collapsed
            if (typeof s.pinned === 'boolean') qtState.pinned = s.pinned
            if (typeof s.shellVisible === 'boolean') qtState.shellVisible = s.shellVisible
          }
          done()
        })
        .catch(function () { done() })
    }
    var saveState = function () {
      try {
        void fetch('/quick-toolbar/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(qtState),
        }).catch(function () {})
      } catch (_e) {}
    }
    var TOOLBAR_CSS = [
      // 壳 = 球↔面板一体（v1.8 morph）：收起 36px 圆、展开面板矩形，
      // width/height/left/top/border-radius 四态过渡 = 「球长宽展开成面板」，
      // 球图标钉在壳内球位，随壳移动到面板角淡出（2026-08-30 用户拍板）。
      '#ssid-toolbar{position:fixed;z-index:9999;font-family:system-ui,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;box-sizing:border-box;width:36px;height:36px;border-radius:18px;background:var(--dsw-alias-bg-layer-3,#10151f);border:1px solid var(--dsw-alias-border-l2,#1e2836);overflow:hidden;transition:width .28s cubic-bezier(.25,.8,.25,1),height .28s cubic-bezier(.25,.8,.25,1),left .28s cubic-bezier(.25,.8,.25,1),top .28s cubic-bezier(.25,.8,.25,1),border-radius .28s cubic-bezier(.25,.8,.25,1)}',
      '#ssid-toolbar *{box-sizing:border-box}',
      '#ssid-toolbar.ssid-tb-expanded{border-radius:12px}',
      // 球图标层：独立于壳（fixed 于球位、pointer-events 穿透）——morph 时
      // 图标停在原位淡出，壳从球位向面板位长开；面板位置公式保证球位 ⊂ 面板一角。
      '#ssid-toolbar-ball{position:fixed;z-index:10000;width:36px;height:36px;margin:0;padding:0;border:0;background:transparent;box-shadow:none;appearance:none;-webkit-appearance:none;pointer-events:none;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,#d8e0ea);opacity:.9;border-radius:50%;transition:opacity .18s ease,background .18s ease}',
      '#ssid-toolbar-ball svg{width:16px;height:16px}',
      // 面板内容层：壳内自然尺寸（供壳 morph 测量）；背景视觉全在壳上
      '#ssid-toolbar .ssid-tb-panel{position:absolute;left:0;top:0;display:flex;flex-direction:column;gap:4px;padding:6px;color:var(--dsw-alias-label-primary,#d8e0ea)}',
      '#ssid-toolbar .ssid-tb-panel>*{opacity:0;transform:translateY(4px);transition:opacity .16s ease,transform .16s ease}',
      '#ssid-toolbar.ssid-tb-expanded .ssid-tb-panel>*{opacity:1;transform:none}',
      '#ssid-toolbar .ssid-tb-head{position:relative;height:22px;cursor:grab}',
      '#ssid-toolbar .ssid-tb-head:active{cursor:grabbing}',
      '#ssid-toolbar .ssid-tb-pin{position:absolute;top:2px;right:2px;width:26px;height:26px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#7b8494);border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.75;transition:opacity .15s,background .15s}',
      '#ssid-toolbar .ssid-tb-pin:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}',
      '#ssid-toolbar .ssid-tb-pin svg{width:15px;height:15px}',
      '#ssid-toolbar .ssid-tb-btn{border:0;background:transparent;color:var(--dsw-alias-label-primary,#d8e0ea);border-radius:8px;height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;text-align:left}',
      '#ssid-toolbar .ssid-tb-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}',
      '#ssid-toolbar .ssid-tb-btn svg{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-secondary,#98a2b3)}',
      // ➕ 注册入口（v0.5）：载体功能（非聚合按钮）——虚线边框区分「被聚合的按钮」；
      // 点击注入注册任务书草稿到 composer，由环境 LLM 完成探查+注册（V2-9 载体哲学）。
      '#ssid-toolbar .ssid-tb-add{border:1px dashed var(--dsw-alias-border-strong,rgba(128,148,168,.45));background:transparent;color:var(--dsw-alias-label-tertiary,#7b8494);border-radius:8px;height:30px;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;text-align:left;margin-top:2px;transition:color .15s,border-color .15s,background .15s}',
      '#ssid-toolbar .ssid-tb-add:hover{color:var(--dsw-alias-label-primary,#d8e0ea);border-color:var(--dsw-alias-label-secondary,#98a2b3);background:var(--dsw-alias-interactive-bg-hover,rgba(128,148,168,.14))}',
      '#ssid-toolbar .ssid-tb-add svg{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-secondary,#98a2b3)}',
      // 滑动删除行（v0.7.4，iOS 样式）：壳 slide 宽度恒等于行宽（防面板被
      // calc(100%+56px) 自增环撑宽）；删除块 absolute right:-56 随壳平移——
      // 静止在视口外（容器裁切）、open 时随壳滑入视口右缘
      '.ssid-tb-row{position:relative;overflow:hidden;border-radius:8px}',
      '.ssid-tb-slide{display:flex;position:relative;width:100%;transition:transform .2s ease}',
      '.ssid-tb-row .ssid-tb-btn{flex:1 1 auto;min-width:0;position:relative;z-index:1;box-sizing:border-box;background:transparent}',
      '.ssid-tb-row.ssid-tb-row-open .ssid-tb-slide{transform:translateX(-56px)}',
      '.ssid-tb-del{position:absolute;right:-56px;top:0;bottom:0;width:56px;border:0;background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff;font-size:12px;cursor:pointer;font-weight:500;border-radius:8px 0 0 8px}',
      // 收藏会话区：与功能按钮同列（用户 2026-09-14 选的「平铺」形态）；容器是
      // 面板直接子元素，已吃到面板的入场动画，内部按钮需自带一份。
      '#ssid-toolbar .ssid-tb-favs{display:flex;flex-direction:column;gap:4px}',
      '#ssid-toolbar .ssid-tb-favs>*{opacity:0;transform:translateY(4px);transition:opacity .16s ease,transform .16s ease}',
      '#ssid-toolbar.ssid-tb-expanded .ssid-tb-favs>*{opacity:1;transform:none}',
      // 会话入口与「☆ 收藏」用业务色，和下面灰调的宿主功能按钮区分开
      '#ssid-toolbar .ssid-tb-fav svg{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '#ssid-toolbar .ssid-tb-favstar[data-on="1"] svg{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '#ssid-toolbar .ssid-tb-favstar[data-full="1"]{opacity:.45;cursor:not-allowed}',
    ].join('\n')

    function toolbarIcon(name: string) {
      var ICONS: Record<string, string> = {
        grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
        plugin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
        sidebar: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="3.25" width="2.75" height="9.5" rx="1" fill="currentColor" stroke="none"/></svg>',
        bottom: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" stroke-width="1.5"/><rect x="3.25" y="10" width="9.5" height="2.75" rx="1" fill="currentColor" stroke="none"/></svg>',
        sessions: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4" stroke-linecap="round"/></svg>',
        collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5.5h10M6.5 8.5h3M8 11.5h1" stroke-linecap="round"/></svg>',
        menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h10M3 8h10M3 11h10" stroke-linecap="round"/></svg>',
        pin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 2.2l4 4-2.6 1.4-1.8 1.8.4 2.6-1.4 1.4-2.6-3L3.9 13l-1-1 3-3.9-3-2.6 1.4-1.4 2.6.4 1.8-1.8z"/></svg>',
        settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4"/></svg>',
        add: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>',
        // 收藏（Lucide star；尺寸由 CSS 的 15px 规则决定，viewBox 沿用 24 格原版）
        star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        starOn: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        chat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13.6 8.4c0 2.5-2.5 4.5-5.6 4.5-.6 0-1.2-.08-1.7-.23L3 14.2l1.05-2.5C3.1 10.8 2.4 9.68 2.4 8.4c0-2.5 2.5-4.5 5.6-4.5s5.6 2 5.6 4.5z"/></svg>',
      }
      return ICONS[name] || ICONS.grid
    }

    // v2 M1 引擎环境：find/dispatch ← DOM；isVisible ← rect/computedStyle
    // （toggle-panel 探测语义：close 目标可见 = 弹窗开——v0.8.0 引擎直判，
    // 替代 findPanel/#id-panel 协议）；runCommand ← composer 草稿注入
    // （execute 通道不可达——实证决策见下注释；注入不自动提交）。
    var toolbarEnv = function (): ActEnv {
      return {
        find: function (s) { return document.querySelector(s) as HTMLElement | null },
        isVisible: function (el) {
          if (el === null || typeof el !== 'object') return false
          var node = el as HTMLElement
          if (typeof node.getBoundingClientRect === 'function') {
            var r = node.getBoundingClientRect()
            if (r.width > 0 || r.height > 0) return true
          }
          if (typeof getComputedStyle === 'function') {
            try {
              var s = getComputedStyle(node)
              return s.display !== 'none' && s.visibility !== 'hidden'
            } catch (_e) { return false }
          }
          return false
        },
        dispatch: function (event, detail) {
          window.dispatchEvent(new CustomEvent(event, { detail: detail }))
          return true
        },
        findByText: function (texts) {
          var buttons = document.querySelectorAll('button')
          for (var bi = 0; bi < buttons.length; bi++) {
            var label = (buttons[bi].textContent || '').trim()
            for (var ti = 0; ti < texts.length; ti++) {
              if (label === texts[ti]) return buttons[bi] as HTMLElement
            }
          }
          return null
        },
        runCommand: function (name) { return typeCommandIntoComposer(name) },
      }
    }
    // command 通道（2026-08-30 实证决策）：DSH master `ctx.remote.commands.execute`
    // 需完整 client ctx，而 V0 协议 apply 收到的 ctx 仅 {fiber}——execute 不可达。
    // 设计修正：command = composer 草稿注入（不自动提交——用户确认后发送，
    // 避免误发；与 V2-2「建议制」一致）。设计文档 A2 已同步。
    // command 通道（2026-08-30 实证决策）：DSH master `ctx.remote.commands.execute`
    // 需完整 client ctx，而 V0 协议 apply 收到的 ctx 仅 {fiber}——execute 不可达。
    // 设计修正：command = composer 草稿注入（不自动提交——用户确认后发送，
    // 避免误发；与 V2-2「建议制」一致）。设计文档 A2 已同步。
    // composer 草稿注入：写入 text + InputEvent + focus（**不自动提交**——
    // 用户确认后发送；定位失败 → false 静默防御）。
    function injectComposerDraft(text: string) {
      var seat = document.querySelector('[data-composer-seat]')
      var el = (seat !== null && seat !== undefined
        ? seat.querySelector('textarea, [contenteditable="true"]')
        : document.querySelector('textarea, [contenteditable="true"]')) as HTMLElement | null
      if (el === null || el === undefined) return false
      if (el instanceof HTMLTextAreaElement) {
        var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
        if (setter !== undefined && setter.set !== undefined) setter.set.call(el, text)
        else el.value = text
      } else if (el.isContentEditable) {
        el.textContent = text
      } else {
        return false
      }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
      el.focus()
      return true
    }
    function typeCommandIntoComposer(name: string) {
      return injectComposerDraft('/' + name)
    }

    function toolbarAction(kind: string) {
      if (kind === 'plugin') {
        closeSidePanelsBeforePluginCenter()
        var toggle = win.__pluginCenterToggle
        if (typeof toggle === 'function') { toggle(); return }
        var open = win.__pluginCenterOpen
        if (typeof open === 'function') open()
        return
      }
      if (kind === 'sidebar' || kind === 'bottom') {
        var close = win.__pluginCenterClose
        if (typeof close === 'function') close()
        var btns = panelButtons()
        clickButton(kind === 'sidebar' ? btns.sidebar : btns.bottom)
        return
      }
      if (kind === 'sessions') { clickSmOpenButton(); return }
    }

    function createToolbar() {
      // 壳环境（__SSID_SHELL__）：悬浮球默认隐藏（标题栏接管入口），
      // 用户可从标题栏「悬浮球」按钮开启（状态 host 化——手册 §7.10）。
      if (win.__SSID_SHELL__ === true && !qtState.shellVisible) return
      if (document.getElementById(TOOLBAR_ID) !== null) return
      // ➕ 注册入口按钮引用：**初始化必须在 renderButton 定义前**（var 提升
      // 期变量为 undefined，内置按钮同步渲染时 undefined.parentNode 抛
      // TypeError——2026-08-30 SSiD 实测 client.js:692 抓到的运行时炸点）。
      var addBtn: HTMLButtonElement | null = null
      var root = document.createElement('div')
      root.id = TOOLBAR_ID
      var panel = document.createElement('div')
      panel.className = 'ssid-tb-panel'
      var head = document.createElement('div')
      head.className = 'ssid-tb-head'
      // 通用插件：无标题（v0.4 的「思灵工具栏」标题移除——通用化）；
      // 头部仅「钉住」切换（未钉住=鼠标移出自动收起，移入悬浮球展开）。
      var pinBtn = document.createElement('button')
      pinBtn.type = 'button'
      pinBtn.className = 'ssid-tb-pin'
      pinBtn.setAttribute('aria-label', '钉住/取消钉住')
      pinBtn.title = '钉住'
      pinBtn.innerHTML = toolbarIcon('pin')
      trackLocale(pinBtn, 'tb.pinAria', 'aria')
      trackLocale(pinBtn, 'tb.pin', 'title')
      head.appendChild(pinBtn)
      panel.appendChild(head)
      // ── 收藏会话区（v0.9.0）：☆ 收藏当前会话 + 已收藏会话的跳转入口，平铺在
      //    功能按钮之上。整区每次重建（收藏集与会话列表都会变），故不走 trackLocale。
      var favBox = document.createElement('div')
      favBox.className = 'ssid-tb-favs'
      panel.appendChild(favBox)
      var renderFavs = function () {
        // 工具栏被壳移除（关闭悬浮球开关）后订阅仍在 → 自清理，避免对着已断开的
        // 节点反复重建（isConnected 为假即退订）
        if (!favBox.isConnected) {
          if (favUnsub !== null) { favUnsub(); favUnsub = null }
          return
        }
        favBox.innerHTML = ''
        // 诊断事实（排查用：为什么收藏区是空的）。放在容器上而不是控制台，
        // 便于 CDP 直接读，也不必给每次渲染加日志。
        favBox.setAttribute('data-fav-sub', favUnsub === null ? 'off' : 'on')
        var cur = currentSession()
        // 无当前会话（或会话服务尚未就绪）→ 整区不渲染，工具栏保持功能按钮原样
        if (cur === null) {
          if (sessionsSvc === null) favBox.setAttribute('data-fav-state', 'no-service')
          else if (sessionsSnapshot() === null) favBox.setAttribute('data-fav-state', 'no-list')
          else favBox.setAttribute('data-fav-state', 'no-current')
          return
        }
        favBox.setAttribute('data-fav-state', 'ok')
        // 闭包里引用丢窄化，先取局部常量
        var curId = cur.id
        var snap = sessionsSnapshot()
        var byId = snap !== null && snap.byId !== undefined && snap.byId !== null ? snap.byId : {}
        // 被删除的收藏不渲染入口（open 对未知 id 会 fail loud）
        var mine = favoritesForCwd(favList, cur.cwd).filter(function (f) { return byId[f.id] !== undefined })
        var isFav = mine.some(function (f) { return f.id === curId })
        var full = !isFav && mine.length >= FAVORITE_LIMIT
        var star = document.createElement('button')
        star.type = 'button'
        star.className = 'ssid-tb-btn ssid-tb-favstar'
        star.setAttribute('data-on', isFav ? '1' : '0')
        if (full) star.setAttribute('data-full', '1')
        star.innerHTML = toolbarIcon(isFav ? 'starOn' : 'star') + '<span></span>'
        var starLabel = isFav ? favText('fav.remove') : (full ? favText('fav.full') : favText('fav.add'))
        var starSpan = star.querySelector('span')
        if (starSpan !== null) starSpan.textContent = starLabel
        star.setAttribute('aria-label', starLabel)
        star.title = starLabel
        star.addEventListener('click', function () {
          if (full) return
          if (toggleCurrentFavorite()) renderFavs()
        })
        favBox.appendChild(star)
        for (var fi = 0; fi < mine.length; fi++) {
          var fav = mine[fi]
          // 当前会话不列入（它就在眼前，入口多余）
          if (fav.id === cur.id) continue
          var row = byId[fav.id]
          var liveTitle = row !== undefined && typeof row.displayTitle === 'string' && row.displayTitle !== '' ? row.displayTitle : fav.title
          var btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'ssid-tb-btn ssid-tb-fav'
          btn.setAttribute('data-adapter-id', 'dsh-favorites.open:' + fav.id)
          btn.innerHTML = toolbarIcon('chat') + '<span></span>'
          var label = favoriteLabel(liveTitle)
          var span = btn.querySelector('span')
          if (span !== null) span.textContent = label
          btn.setAttribute('aria-label', favText('fav.open') + '：' + liveTitle)
          btn.title = liveTitle
          // 闭包捕获该条 id（循环变量是 var，必须用 IIFE 固定）
          btn.addEventListener('click', (function (targetId: string) {
            return function () { openFavorite(targetId) }
          })(fav.id))
          favBox.appendChild(btn)
        }
      }
      // 工具栏按钮集 = 内置适配器集 + 用户适配器管线（v2 M1：host API 拉取 →
      // 同 id 覆盖内置行为、无 id 映射的条目走适配器引擎执行；kind 映射的内置
      // 走既有 toolbarAction——老按钮零回归）。
      var TOOLBAR_KIND_BY_ADAPTER: Record<string, string> = {
        'dsh-plugin-center': 'plugin',
        'dsh-better-sidebar.sidebar': 'sidebar',
        'dsh-better-sidebar.bottom': 'bottom',
        'dsh-session-manager': 'sessions',
      }
      // 「换位置」渲染（2026-08-30 用户洞察）：聚合 = 把按钮换到工具栏——
      // from-button 扣取原按钮的图标（svg/img/背景图）与文字；缺省 act = click。
      var adapterIconHtml = function (adapter: AdapterDef, kind: string | null) {
        if (adapter.icon !== undefined && adapter.icon.source === 'custom') {
          var value = adapter.icon.value
          if (value.indexOf('<') === 0) return value
          return toolbarIcon(value)
        }
        // from-button（缺省也是它）：扣取原按钮视觉（svg → img → 背景图）
        try {
          var el = document.querySelector(adapter.button) as HTMLElement | null
          if (el !== null) {
            var svg = el.querySelector('svg')
            if (svg !== null) return svg.outerHTML
            var img = el.querySelector('img')
            if (img !== null) return img.outerHTML
            var bg = getComputedStyle(el).backgroundImage
            if (bg !== null && bg !== 'none') {
              return '<span style="display:inline-block;width:15px;height:15px;background:' + bg + ';background-size:contain;background-repeat:no-repeat"></span>'
            }
          }
        } catch (_e) {}
        return kind !== null ? toolbarIcon(kind) : toolbarIcon('grid')
      }
      var adapterLabel = function (adapter: AdapterDef) {
        if (adapter.label !== undefined && adapter.label !== '') return adapter.label
        try {
          var el = document.querySelector(adapter.button)
          if (el !== null && (el.textContent || '').trim() !== '') return (el.textContent || '').trim().slice(0, 12)
        } catch (_e) {}
        return adapter.id
      }
      var renderButton = function (adapter: AdapterDef, kind: string | null) {
        var b = document.createElement('button')
        b.type = 'button'
        b.className = 'ssid-tb-btn'
        b.setAttribute('data-adapter-id', adapter.id)
        b.innerHTML = adapterIconHtml(adapter, kind) + '<span></span>'
        if (kind !== null) {
          b.setAttribute('aria-label', '')
          b.title = ''
          trackLocale(b, 'tb.' + kind, 'text-span')
          trackLocale(b, 'tb.' + kind, 'aria')
          trackLocale(b, 'tb.' + kind, 'title')
        } else {
          var label = adapterLabel(adapter)
          var textSpan = b.querySelector('span') as HTMLElement
          if (textSpan !== null) textSpan.textContent = label
          b.setAttribute('aria-label', label)
          b.title = label
        }
        b.addEventListener('click', function () {
          if (kind !== null) { toolbarAction(kind); return }
          runAdapter(adapter, toolbarEnv())
        })
        // 用户适配器（异步渲染）插到 ➕ 之前；内置（同步，addBtn 未入面板）→ 面板尾。
        // 注意：addBtn 声明在下方（var 提升为 undefined）——必须先判 null，
        // 否则内置按钮同步渲染时 undefined.parentNode 抛 TypeError（实测于 SSiD 0.5.1）。
        if (addBtn !== null && addBtn.parentNode === panel) {
          panel.insertBefore(b, addBtn)
        } else {
          panel.appendChild(b)
        }
        // hide（「换位置」语义，2026-08-30 用户反馈补齐）：缺省隐藏原按钮——
        // 聚合=换位置，双入口无意义；显式 hide:false 保留。内置项 CSS 已隐藏者
        // 再设 inline display:none 无害；定位失败静默（候选不存在=无需隐藏）。
        if (adapter.hide !== false) {
          try {
            var origBtn = document.querySelector(adapter.button) as HTMLElement | null
            if (origBtn !== null) origBtn.style.display = 'none'
          } catch (_e) {}
        }
        return b
      }
      // 渲染入口可用性：壳环境（标题栏事件通道恒在，入口与页面 DOM 无关）
      // 跳过探测恒渲染；无壳 web 按探测（选择器→文本兜底）。
      //
      // 壳标志必须**每次读取**，不能求值一次：main.mjs 在 dom-ready 才注入
      // `__SSID_SHELL__`，晚于本插件 apply —— 快照版永远拿到 false，「壳环境恒渲染」
      // 的兜底形同虚设；而探测路径下 `dsh-plugin-center` 必失败（原按钮被 BASE_CSS
      // 隐藏、文本兜底也匹配不到侧栏导航项）→ 该按钮在壳里永不渲染（2026-09-14 实测
      // 壳里面板只有 4 个内置）。函数化后，下面的 1s 补渲染轮询会在标志到达后补上。
      var isShellEnv = function () {
        return typeof window !== 'undefined' && (window as unknown as { __SSID_SHELL__?: unknown }).__SSID_SHELL__ === true
      }
      var adapterIdSelector = function (adapterId: string) {
        return '[data-adapter-id="' + adapterId.replace(/"/g, '\\"') + '"]'
      }
      var renderBuiltins = function () {
        for (var ai = 0; ai < BUILTIN_ADAPTERS.length; ai++) {
          var adapter = BUILTIN_ADAPTERS[ai]
          if (!isShellEnv() && !adapterVisible(adapter, document)) continue
          try {
            if (panel.querySelector(adapterIdSelector(adapter.id)) !== null) continue
          } catch (_e) { /* 重复渲染去重失败则继续（无害） */ }
          var kind = TOOLBAR_KIND_BY_ADAPTER[adapter.id]
          // 有 kind 映射 → 既有 toolbarAction（i18n 文案）；无映射（如 dsh-settings）
          // → 引擎执行（label/icon 直显；open-settings 语义锚点链）。
          renderButton(adapter, kind !== undefined ? kind : null)
        }
        // 补渲染的按钮在 applyLocale 之后登记 → 立即应用一次（否则 span 文字空：
        // 2026-09-02 用户截图中侧栏/底栏只剩图标无文字）。
        applyLocale()
      }
      renderBuiltins()
      // 延时兜底（2026-09-02 用户建议）：插件加载顺序不定（better-sidebar 的
      // toggleCluster、__SSID_SHELL__ 注入都晚于本工具栏首遍渲染）——每 1s
      // 重查未渲染项，条件满足即补渲染去重，直到全部内置就位或 60s 超时。
      var builtinRetries = 0
      var builtinRetryTimer = setInterval(function () {
        if (builtinRetries++ >= 60) { clearInterval(builtinRetryTimer); return }
        var pending = BUILTIN_ADAPTERS.some(function (a) {
          try { return panel.querySelector(adapterIdSelector(a.id)) === null } catch (_e) { return true }
        })
        if (!pending) { clearInterval(builtinRetryTimer); return }
        renderBuiltins()
      }, 1000)
      // ── 滑动删除（v0.7.0，仅用户适配器；iOS 样式）：右键 → 行左滑露出「删除」─
      var slideCloseAll = function () {
        var rows = panel.querySelectorAll('.ssid-tb-row.ssid-tb-row-open')
        for (var ri = 0; ri < rows.length; ri++) rows[ri].classList.remove('ssid-tb-row-open')
      }
      // 点击行外 → 回弹（一次性全局监听，挂载于 createToolbar 内）
      document.addEventListener('mousedown', function (e: MouseEvent) {
        var t = e.target as Node | null
        if (t === null) return
        var inRow = t instanceof Element ? t.closest('.ssid-tb-row') !== null : false
        if (!inRow) slideCloseAll()
      })
      function removeUserAdapter(ad: AdapterDef) {
        fetch('/quick-toolbar/api/adapters')
          .then(function (r) { return r.json() })
          .then(function (data: unknown) {
            var envelope = data !== null && typeof data === 'object' ? data as { ok?: unknown; value?: unknown } : undefined
            var rows: unknown = envelope !== undefined && envelope.ok === true && envelope.value !== null && typeof envelope.value === 'object'
              ? (envelope.value as { adapters?: unknown }).adapters
              : undefined
            if (!Array.isArray(rows)) return
            var next = (rows as AdapterDef[]).filter(function (a) { return a.id !== ad.id })
            return fetch('/quick-toolbar/api/adapters', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adapters: next }),
            }).then(function (r) { return r.json() }).then(function (res) {
              // 写回成功后才执行界面反向操作——避免「界面删了但没落盘」的不一致
              if (res === null || typeof res !== 'object' || (res as { ok?: unknown }).ok !== true) return
              try {
                var btn = panel.querySelector('[data-adapter-id="' + ad.id.replace(/"/g, '\\"') + '"]') as HTMLElement | null
                var row = btn !== null && typeof btn.closest === 'function' ? btn.closest('.ssid-tb-row') as HTMLElement | null : null
                if (row !== null && row.parentNode === panel) panel.removeChild(row)
              } catch (_e) {}
              // 恢复原按钮显示（渲染时被缺省 hide 隐藏）——删除 = 换位置的反向操作
              try {
                var orig = document.querySelector(ad.button) as HTMLElement | null
                if (orig !== null) orig.style.display = ''
              } catch (_e2) {}
            })
          })
          .catch(function () {})
      }
      // 用户适配器按钮包行容器（壳 DOM：按钮+删除块一起左右滑，iOS 滑动删除态）
      function wrapAdapterRow(btn: HTMLElement, ad: AdapterDef) {
        var row = document.createElement('div')
        row.className = 'ssid-tb-row'
        var slide = document.createElement('div')
        slide.className = 'ssid-tb-slide'
        if (btn.parentNode !== null) btn.parentNode.removeChild(btn)
        slide.appendChild(btn)
        var delBtn = document.createElement('button')
        delBtn.type = 'button'
        delBtn.className = 'ssid-tb-del'
        delBtn.textContent = '删除'
        delBtn.addEventListener('click', function () {
          // 先播放收回动画（删除块右滑出显示区域），再执行删除
          row.classList.remove('ssid-tb-row-open')
          setTimeout(function () { removeUserAdapter(ad) }, 220)
        })
        slide.appendChild(delBtn)
        row.appendChild(slide)
        panel.insertBefore(row, addBtn)
        btn.setAttribute('data-user-adapter', '1')
        // 右键提升到行容器：按钮/删除块/行内任意位置右键均 toggle（含删除块上）
        row.addEventListener('contextmenu', function (e: MouseEvent) {
          e.preventDefault()
          e.stopPropagation()
          if (row.classList.contains('ssid-tb-row-open')) {
            // 再右键（含删除块上） = 收回
            row.classList.remove('ssid-tb-row-open')
            return
          }
          slideCloseAll()
          row.classList.add('ssid-tb-row-open')
        })
        return row
      }
      // 用户适配器管线：fetch host API（zod 已校验入项——客户端信任 host 层），
      // 同 id 覆盖（重建按钮、行为按用户 act 执行），无 id 映射→引擎执行；
      // 拉取失败/旧 DSH 无路由 → 静默（仅内置）。
      var fetchUserAdapters = function () {
        fetch('/quick-toolbar/api/adapters')
          .then(function (r) { return r.json() })
          .then(function (data: unknown) {
            // host 返回 { ok, value: { adapters } }——客户端信任 host 校验（zod）
            var envelope = data !== null && typeof data === 'object' ? data as { ok?: unknown; value?: unknown } : undefined
            var rows: unknown = envelope !== undefined && envelope.ok === true && envelope.value !== null && typeof envelope.value === 'object'
              ? (envelope.value as { adapters?: unknown }).adapters
              : undefined
            if (!Array.isArray(rows)) return
            for (var ui = 0; ui < rows.length; ui++) {
              var user = rows[ui] as AdapterDef | null
              if (user === null || typeof user !== 'object') continue
              var userKind = TOOLBAR_KIND_BY_ADAPTER[user.id]
              try {
                // 旧条目（可能包在滑动行内）整行移除
                var old = panel.querySelector('[data-adapter-id="' + user.id.replace(/"/g, '\\"') + '"]') as HTMLElement | null
                var oldRow = old !== null && typeof old.closest === 'function' ? old.closest('.ssid-tb-row') as HTMLElement | null : null
                if (oldRow !== null && oldRow.parentNode === panel) panel.removeChild(oldRow)
                else if (old !== null && old.parentNode === panel) panel.removeChild(old)
              } catch (_e) {}
              var userBtn = renderButton(user, userKind !== undefined ? userKind : null)
              // 滑动删除行（v0.7.0）：用户适配器专属包裹
              wrapAdapterRow(userBtn, user)
            }
          })
          .catch(function () {})
      }
      // ➕ 注册入口（v0.5.1）：点击 → 创建「添加按钮」会话并注入注册任务书
      // （sessions/workspaces/uiWorkspace 服务经 exports.inject 声明注入——
      // cordis-client-runner 白名单门控，插件中心 LLM 更新同款机制）；
      // 服务缺失/失败 → 降级 composer 草稿注入。载体自身功能，不走适配器管线。
      addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'ssid-tb-add'
      addBtn.setAttribute('aria-label', '添加/迁移按钮')
      addBtn.title = '添加按钮'
      addBtn.innerHTML = toolbarIcon('add') + '<span></span>'
      trackLocale(addBtn, 'tb.addAria', 'aria')
      trackLocale(addBtn, 'tb.add', 'title')
      var addSpan = addBtn.querySelector('span') as HTMLElement
      if (addSpan !== null) addSpan.textContent = '添加按钮'
      trackLocale(addBtn, 'tb.add', 'text-span')
      addBtn.addEventListener('click', function () {
        // 首选：创建「添加按钮」会话并注入任务书（自动执行——LLM 收到即反问）。
        // 降级：注入 composer 草稿（用户 Enter 发送；同样完整，仅少了新会话隔离）。
        void ensureRegisterSession().then(function (ok) {
          if (!ok) {
            registerBriefWithSessionUrl().then(function (brief) { injectComposerDraft(brief) })
          }
        })
      })
      panel.appendChild(addBtn)
      var ball = document.createElement('button')
      ball.type = 'button'
      ball.id = TOOLBAR_ID + '-ball'
      ball.className = 'ssid-tb-ball'
      ball.setAttribute('aria-label', '展开快捷工具栏')
      ball.title = 'SSiD 快捷工具栏'
      ball.innerHTML = toolbarIcon('menu')
      trackLocale(ball, 'tb.expandAria', 'aria')
      trackLocale(ball, 'tb.title', 'title')
      root.appendChild(panel)
      document.body.appendChild(root)
      document.body.appendChild(ball)

      // 收藏区的首帧渲染与订阅必须等**工具栏挂上文档之后**：`renderFavs` 在容器
      // 未连上文档时会走自清理分支（工具栏被壳移除时退订），挂载前调用等于把刚
      // 建立的订阅当场退掉——2026-09-14 实测表现为 favBox 属性全空、收藏区恒为空。
      if (favUnsub !== null) { favUnsub(); favUnsub = null }
      var subSvc = sessionsSvc
      if (subSvc !== null && subSvc.list !== undefined && subSvc.list !== null && typeof subSvc.list.subscribe === 'function') {
        try {
          favUnsub = subSvc.list.subscribe(renderFavs)
        } catch (_e) {
          // 订阅失败只影响实时刷新，首帧仍由下面的 renderFavs() 渲染
          favUnsub = null
        }
      }
      renderFavs()
      favRender = renderFavs

      // ---- 球↔面板 morph（v1.9）：壳 = root，唯一锚点 = 球位（收起态左上角）----
      // 收起：36x36 圆；展开：面板位置公式保证「球位 ⊂ 面板一角」（球就是面板
      // 的角，不再斜对角相切）——球图标独立 fixed 层停在原位淡出，壳长宽展开。
      var BALL_SIZE = 36
      var BALL_R = 18
      var expanded = false
      var ballX = 0, ballY = 0 // 球壳左上角（收起态位置——唯一锚点）
      if (qtState.pos !== null) { ballX = qtState.pos.x; ballY = qtState.pos.y }
      if (ballX === 0 && ballY === 0) {
        ballX = window.innerWidth - BALL_SIZE - 16
        ballY = window.innerHeight - BALL_SIZE - 16
      }
      ballX = Math.max(4, Math.min(ballX, window.innerWidth - BALL_SIZE - 4))
      ballY = Math.max(4, Math.min(ballY, window.innerHeight - BALL_SIZE - 4))
      root.style.left = ballX + 'px'
      root.style.top = ballY + 'px'
      ball.style.left = ballX + 'px'
      ball.style.top = ballY + 'px'

      // 面板展开位置：优先朝屏幕中心方向长（球在右→面板向左；下方空间足→向下）；
      // 无论哪个方向，球位都重叠为面板的一个角（不再边缘相切对角分离）。
      var panelPlacement = function (W: number, H: number) {
        var vw = window.innerWidth, vh = window.innerHeight
        var cx = ballX + BALL_R, cy = ballY + BALL_R
        var hor = cx + BALL_R + W <= vw - 8 ? 'right' : 'left'
        var vert = cy + BALL_R + H <= vh - 8 ? 'down' : 'up'
        var left = hor === 'right' ? ballX : ballX + BALL_SIZE - W
        var top = vert === 'down' ? ballY : ballY + BALL_SIZE - H
        left = Math.max(4, Math.min(left, vw - W - 4))
        top = Math.max(4, Math.min(top, vh - H - 4))
        return { left: left, top: top }
      }

      // 逆放置：已知面板矩形 r，反解球位（收起态左上角）——球 = 面板的
      // 「屏幕外侧角」：面板在左上象限 → 球也在面板左上角侧；右下 → 球贴
      // 面板右下角侧。约束 = 自洽闭环：从该球位展开面板必须落回 r 原位
      // （方向判定与假设一致），四方向组合按优先级取第一个自洽解。
      var invertPlacement = function (r: { left: number; top: number; width: number; height: number }) {
        var vw = window.innerWidth, vh = window.innerHeight
        var W = r.width, H = r.height
        var combos = [
          { hor: 'right', vert: 'down' },
          { hor: 'left', vert: 'up' },
          { hor: 'right', vert: 'up' },
          { hor: 'left', vert: 'down' },
        ]
        for (var ci = 0; ci < combos.length; ci++) {
          var hor = combos[ci].hor
          var vert = combos[ci].vert
          var bx = hor === 'right' ? r.left : r.left + W - BALL_SIZE
          var by = vert === 'down' ? r.top : r.top + H - BALL_SIZE
          var cx2 = bx + BALL_R, cy2 = by + BALL_R
          var h2 = cx2 + BALL_R + W <= vw - 8 ? 'right' : 'left'
          var v2 = cy2 + BALL_R + H <= vh - 8 ? 'down' : 'up'
          if (h2 === hor && v2 === vert) return { bx: bx, by: by }
        }
        return { bx: r.left, by: r.top } // 兜底：球 = 面板左上角
      }

      // 收起/展开（状态持久化）：壳尺寸/位置/圆角过渡 + 子项 stagger 淡入；
      // 球图标固定于球位（展开淡出、收起淡回）。
      var setCollapsed = function (collapsed: boolean) {
        expanded = !collapsed
        ball.style.opacity = collapsed ? '' : '0'
        if (collapsed) {
          root.classList.remove('ssid-tb-expanded')
          root.style.width = BALL_SIZE + 'px'
          root.style.height = BALL_SIZE + 'px'
          root.style.left = ballX + 'px'
          root.style.top = ballY + 'px'
        } else {
          var W = panel.offsetWidth + 2 // +2 = 壳左右 border
          var H = panel.offsetHeight + 2
          var p = panelPlacement(W, H)
          root.style.width = W + 'px'
          root.style.height = H + 'px'
          root.style.left = p.left + 'px'
          root.style.top = p.top + 'px'
          root.classList.add('ssid-tb-expanded')
        }
        // 展开：面板子项按序延迟淡入（层次感）；收起延迟归零随壳整体缩回
        var kids = panel.children
        for (var ki = 0; ki < kids.length; ki++) {
          ;(kids[ki] as HTMLElement).style.transitionDelay = collapsed ? '0ms' : 40 + ki * 24 + 'ms'
        }
        qtState.collapsed = collapsed
        saveState()
      }
      // 壳尺寸自愈（2026-08-30 用户实测「钉住只显示一半」）：morph 宽度测量若
      // 发生在按钮文本/i18n/字体异步就位之前，壳宽会定格过小（文字渲染后被
      // 右缘裁切）——ResizeObserver 在展开态自动同步壳宽高（内容任何变化：
      // i18n/字体/用户适配器按钮增减均触发）。
      try {
        var panelRo = new ResizeObserver(function () {
          if (!expanded) return
          var w2 = panel.offsetWidth + 2
          var h2 = panel.offsetHeight + 2
          if (root.offsetWidth !== w2 || root.offsetHeight !== h2) {
            root.style.width = w2 + 'px'
            root.style.height = h2 + 'px'
          }
        })
        panelRo.observe(panel)
      } catch (_e) {}
      // 钉住（hover 收起优化，2026-08-30 用户拍板）：未钉住=鼠标移出自动收起、
      // 移入悬浮球展开；钉住=始终展开（状态持久化 ssid-toolbar-pinned）。
      var pinned = false
      pinned = qtState.pinned
      var applyPin = function () {
        pinBtn.style.color = pinned ? 'var(--dsw-alias-interactive-accent, #4d9fff)' : ''
        pinBtn.style.opacity = pinned ? '1' : ''
        trackLocale(pinBtn, pinned ? 'tb.unpin' : 'tb.pin', 'title')
      }
      var applyPos = function (x: number, y: number) {
        var vw = window.innerWidth, vh = window.innerHeight
        var w = root.offsetWidth || BALL_SIZE
        var h = root.offsetHeight || BALL_SIZE
        x = Math.max(4, Math.min(x, vw - w - 4))
        y = Math.max(4, Math.min(y, vh - h - 4))
        root.style.left = x + 'px'
        root.style.top = y + 'px'
      }
      // 初始：钉住 = 展开；未钉住 = 收起（hover 触发展开）
      setCollapsed(pinned ? false : true)
      applyPin()
      applyLocale()
      // 用户适配器管线（v2 M1）——拉取后追加/覆盖按钮（异步，不阻塞初始渲染）
      fetchUserAdapters()

      pinBtn.addEventListener('click', function () {
        pinned = !pinned
        qtState.pinned = pinned
        saveState()
        applyPin()
        setCollapsed(pinned ? false : true)
      })
      // hover 展开/收起（未钉住）——「鼠标点 + 壳膨胀区」几何统一判定：
      // 收起态：鼠标进入球区（壳 36x36 + 膨胀）→ 展开；展开态：鼠标在壳
      // 膨胀区内保持、移出 220ms 后收起。morph 过渡中壳边界移动、球区被
      // 面板角覆盖，全部由本判定自然兜住（2026-08-30）。
      var hideTimer: ReturnType<typeof setTimeout> | null = null
      var lastMouse = { x: -1, y: -1 }
      var inShellArea = function () {
        var r = root.getBoundingClientRect()
        var m = 18 // 膨胀半径：覆盖球/面板边缘与过渡帧
        return lastMouse.x >= r.left - m && lastMouse.x <= r.right + m &&
          lastMouse.y >= r.top - m && lastMouse.y <= r.bottom + m
      }
      var scheduleCollapse = function () {
        if (pinned || !expanded) return
        if (hideTimer !== null) clearTimeout(hideTimer)
        hideTimer = setTimeout(function () { setCollapsed(true) }, 220)
      }
      var cancelCollapse = function () {
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null }
      }
      document.addEventListener('mousemove', function (ev) {
        lastMouse = { x: ev.clientX, y: ev.clientY }
        if (pinned) return
        var inside = inShellArea()
        if (expanded) {
          if (inside) cancelCollapse()
          else scheduleCollapse()
        } else if (inside) {
          cancelCollapse()
          setCollapsed(false)
        }
      })

      // 拖拽移动（柄 = head；mousedown 后跟随指针，结束存位置）
      var dragging: { dx: number; dy: number } | null = null
      head.addEventListener('mousedown', function (ev) {
        if (ev.target === pinBtn) return
        var shellRect = root.getBoundingClientRect()
        dragging = { dx: ev.clientX - shellRect.left, dy: ev.clientY - shellRect.top }
        ev.preventDefault()
        var onMove = function (mev: MouseEvent) {
          if (!dragging) return
          applyPos(mev.clientX - dragging.dx, mev.clientY - dragging.dy)
        }
        var onUp = function () {
          dragging = null
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          // 保存球位：逆放置——球 = 面板的屏幕外侧角（面板左上象限 → 球在
          // 面板左上角侧；右下象限 → 球贴面板右下角侧），并保证「从球位展开
          // 面板落回当前面板位」的自洽闭环（2026-08-30 用户拍板语义）。
          var r = root.getBoundingClientRect()
          var sp = invertPlacement({ left: r.left, top: r.top, width: r.width, height: r.height })
          var vw = window.innerWidth, vh = window.innerHeight
          ballX = Math.max(4, Math.min(Math.round(sp.bx), vw - BALL_SIZE - 4))
          ballY = Math.max(4, Math.min(Math.round(sp.by), vh - BALL_SIZE - 4))
          ball.style.left = ballX + 'px'
          ball.style.top = ballY + 'px'
          qtState.pos = { x: ballX, y: ballY }
          saveState()
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
    }

    exports.inject = ['sessions', 'workspaces', 'uiWorkspace']

    // 会话/工作区服务引用（apply 时按 inject 声明注入；字段与插件中心
    // LlmSessionsSvc/LlmWorkspacesSvc/LlmUiWorkspaceSvc 结构对齐，只声明用到的）。
    // 收藏会话用到 `list.getSnapshot().current/cwd` 与 `list.subscribe`（会话列表
    // 一变就重渲收藏区，用户切会话后入口立刻跟着换）。
    var sessionsSvc: {
      list?: {
        getSnapshot?: () => {
          current?: string
          byId?: Record<string, { id?: string, title?: string, displayTitle?: string, cwd?: string, running?: boolean }>
        }
        subscribe?: (fn: () => void) => () => void
      }
      open?: (id: string) => void
      binding?: (id: string) => { session?: {
        prompt?: (content: Array<{ type: 'text', text: string }>, mode: 'queue' | 'steer') => Promise<{ ok?: boolean, error?: { message?: string } }>
        rename?: (title: string) => Promise<unknown>
      } } | undefined
    } | null = null
    /** 收藏会话全量（跨工作区；悬浮球只展示当前工作区那一份——`favoritesForCwd`）。 */
    var favList: FavoriteSession[] = []
    /** 会话列表订阅的退订句柄（工具栏重建时先退订，避免重复回调）。 */
    var favUnsub: (() => void) | null = null
    /** 收藏区重渲钩子（createToolbar 挂载；语言变化时由 MutationObserver 触发）。 */
    var favRender: (() => void) | null = null
    var workspacesSvc: {
      list?: { getSnapshot?: () => { items?: Array<{ workspaceId?: string }> } }
    } | null = null
    var uiWorkspaceSvc: {
      connectWorkspace?: (workspaceId: string) => Promise<string>
    } | null = null
    // 探查通道（v0.7.7）：host 半经 connection.authenticatedUrl 拼带 token 完整
    // URL（client 拿不到 token——browser-auth 的 cookie 是 HttpOnly，client
    // connection 面无 authenticatedUrl）；LLM 浏览器 navigate 首访换 cookie、
    // 303 重定向回干净根路径，之后以 cookie 认证畅通。失败兜底 = 无通道段
    //（任务书已说明"无附带 URL 时向用户要页面地址"）。
    function buildRegisterBrief(url: string): string {
      return '## 探查通道（已为你的浏览器认证好）：\n- 用浏览器打开下面这个 URL 即可直达当前 DSH 页面（首次访问会换 cookie 并自动重定向到干净根路径；token 仅本会话使用，勿写入文件/回复）:\n' + url + '\n\n' + REGISTER_BRIEF
    }
    function registerBriefWithSessionUrl(): Promise<string> {
      return fetch('/quick-toolbar/api/auth-url')
        .then(function (r) { return r.json() })
        .then(function (d) {
          var ok = d !== null && typeof d === 'object' && (d as { ok?: unknown }).ok === true
          var url = ok && typeof (d as { url?: unknown }).url === 'string' ? (d as { url: string }).url : ''
          return buildRegisterBrief(url)
        })
        .catch(function () { return buildRegisterBrief('') })
    }
    // ➕ 注册入口：创建「添加按钮」会话并注入任务书（queue 执行）。
    // 同款机制 = 插件中心 LLM 更新（ensureLlmUpdateSession）；任何一步不可用
    // → 返回 false（调用方降级 composer 草稿注入，按钮永不失能）。
    function ensureRegisterSession(): Promise<boolean> {
      var svc = sessionsSvc
      var wsvc = workspacesSvc
      var uws = uiWorkspaceSvc
      if (svc === null || wsvc === null || uws === null) return Promise.resolve(false)
      if (typeof uws.connectWorkspace !== 'function') return Promise.resolve(false)
      var snapshot = (wsvc.list !== undefined && typeof wsvc.list.getSnapshot === 'function') ? wsvc.list.getSnapshot() : undefined
      var items = snapshot !== undefined && snapshot !== null && snapshot.items !== undefined && snapshot.items !== null ? snapshot.items : []
      // 会话落点 = 最近工作区（items[0]；快照无 recentWorkspaceId——插件中心
      // 同款兜底）；专用工作区分组（create+rename）对「添加按钮」非必要。
      var wsId = items.length > 0 ? items[0].workspaceId : undefined
      if (wsId === undefined || wsId === '') return Promise.resolve(false)
      return uws.connectWorkspace(wsId)
        .then(function (sid) {
          if (typeof sid !== 'string' || sid === '') return false
          var svc3 = svc
          if (svc3 === null || svc3 === undefined) return false
          var face = typeof svc3.binding === 'function' ? svc3.binding(sid) : undefined
          var s = face !== undefined && face !== null && face.session !== undefined && face.session !== null ? face.session : undefined
          if (s === undefined || s === null || typeof s.prompt !== 'function') return false
          return registerBriefWithSessionUrl().then(function (brief) {
            // 惰性回调：窄化不保留，重新收窄
            var sess2 = s
            if (sess2 === undefined || sess2 === null || typeof sess2.prompt !== 'function') {
              return Promise.resolve({ ok: false } as { ok?: boolean })
            }
            return sess2.prompt([{ type: 'text', text: brief }], 'queue')
          }).then(function (res) {
              if (res === undefined || res === null || res.ok !== true) return false
              // 回调是惰性执行的独立流场：外层窄化不保留，这里重新收窄；
              // 重命名非关键（对话框 title 而已）——失败不降级
              var sess = s
              var svc2 = svc
              if (sess === undefined || sess === null) return false
              if (svc2 === null || svc2 === undefined) return false
              if (typeof sess.rename === 'function') { void sess.rename('添加按钮').catch(function () {}) }
              if (typeof svc2.open === 'function') svc2.open(sid)
              return true
            })
        })
        .catch(function () { return false })
    }

    exports.apply = function (ctx: unknown) {
      // 样式先于防重守卫注入：HMR 重载后的新 fiber 会被守卫直接挡回，注入若留在
      // 守卫之后，改样式就永远只能靠重启内核生效（chat-rail 同款实测，2026-09-14）。
      ensureStyles()

      // 防重守卫：DSH 插件热重载/重复加载时避免重复注册 ssid:titlebar
      // 监听器与重复注入 CSS——否则一次标题栏点击会触发多次处理
      // （toggle 被抵消、互斥按钮被点多次），2026-08-19 用户提示
      // 「事件传递导致的问题」的排查项之一。
      if (win.__dshQuickToolbarInstalled === true) return
      win.__dshQuickToolbarInstalled = true

      // 会话/工作区服务（exports.inject 声明——cordis-client-runner 按 fiber
      // inject 白名单注入 ctx；服务缺失时为 undefined，走 ➕ 的 composer 降级。
      // 实证修正（2026-08-30）：早期 inject=[] 导致 apply 只见 {fiber}——并非
      // 「无创建会话通道」，而是未声明（插件中心 LLM 更新同款机制，见其
      // client/index.tsx ensureLlmUpdateSession）。
      var svcCtx = (ctx !== null && typeof ctx === 'object' ? ctx : {}) as {
        sessions?: Record<string, unknown>
        workspaces?: Record<string, unknown>
        uiWorkspace?: Record<string, unknown>
      }
      sessionsSvc = svcCtx.sessions ?? null
      workspacesSvc = svcCtx.workspaces ?? null
      uiWorkspaceSvc = svcCtx.uiWorkspace ?? null

      // 状态 host 化加载（手册 §7.10）：网络往返（本地 <10ms）完成后创建——
      // 球位/钉住/折叠/壳开关按持久状态渲染；壳默认隐藏（开关开启才创建）。
      loadState(function () {
        if (win.__SSID_SHELL__ === true && !qtState.shellVisible) return
        // 收藏读回后再建工具栏：否则首帧先渲染出空收藏区、读回后整区跳一下
        loadFavorites(function () { createToolbar() })
      })

      // 壳标志（win.__SSID_SHELL__）由 main.mjs 在 dom-ready 注入，晚于
      // 本插件 apply——页面早期创建的元素/样式按壳环境兜底修正：
      // SSiD（壳）不显示悬浮快捷工具栏（按钮已集成标题栏，2026-08-29
      // 用户决策）；SHELL_CSS（隐藏插中心/侧栏原按钮）同样需补注。
      // 2026-08-30 修复：apply 可能晚于页面 load（load 监听错过 → 悬浮球
      // 残留壳环境），兜底 = load + 每 1.5s 轮询（≤5 次）检查标志。
      var hideIfShell = function () {
        if (win.__SSID_SHELL__ !== true) return false
        // 壳标志此刻才到：SHELL_CSS 需随标志补进基础样式（内容比对会就地更新）
        ensureStyles()
        // 标题栏「悬浮球」开关开启 → 壳中保留悬浮球（2026-08-30 用户拍板）
        if (qtState.shellVisible) return false
        var tb = document.getElementById(TOOLBAR_ID)
        if (tb !== null) tb.remove()
        var tbBall = document.getElementById(TOOLBAR_ID + '-ball')
        if (tbBall !== null) tbBall.remove()
        return true
      }
      window.addEventListener('load', hideIfShell)
      var shellTries = 0
      var shellTimer = setInterval(function () {
        shellTries++
        if (hideIfShell() || shellTries >= 5) clearInterval(shellTimer)
      }, 1500)

      // 会话管理 header 内嵌按钮（web 无标题栏时的入口；标题栏事件也可开）
      mountSmHeaderButton()

      // i18n：DSH 异步设置 documentElement.lang（初始可能为静态 en），
      // 监听到变化即刷新工具栏/内嵌按钮文案
      new MutationObserver(function () {
        applyLocale()
        // 收藏区每次重建、不走 trackLocale，语言变化需自己重渲一次
        if (favRender !== null) favRender()
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['lang'],
      })
      new MutationObserver(mountSmHeaderButton).observe(document.body, {
        childList: true,
        subtree: true,
      })

      window.addEventListener('ssid:titlebar', function (event) {
        var detail = event !== null && typeof event === 'object' ? (event as CustomEvent).detail : undefined
        // 标题栏「悬浮球」开关（2026-08-30 用户拍板）：切换壳环境浮球显示并持久化。
        // 开启 → 创建工具栏（若被壳隐藏则重建）；关闭 → 移除元素（localStorage '0'）。
        if (detail === 'quick-toolbar-toggle') {
          var nextOn = !qtState.shellVisible
          qtState.shellVisible = nextOn
          saveState()
          if (nextOn) {
            createToolbar()
          } else {
            var tbEl = document.getElementById(TOOLBAR_ID)
            if (tbEl !== null) tbEl.remove()
            var tbBallEl = document.getElementById(TOOLBAR_ID + '-ball')
            if (tbBallEl !== null) tbBallEl.remove()
          }
          return
        }
        if (detail === 'session-manager') {
          clickSmOpenButton()
          return
        }
        if (detail === 'plugin-center') {
          // 反向互斥：侧栏/底栏开着先收起，再打开插件中心
          closeSidePanelsBeforePluginCenter()
          // 优先 toggle（再点关闭）；老版 plugin-center（无 toggle）回退 open
          var toggle = win.__pluginCenterToggle
          if (typeof toggle === 'function') {
            toggle()
          } else {
            var open = win.__pluginCenterOpen
            if (typeof open === 'function') open()
          }
          return
        }
        if (detail === 'open-sea-skin') {
          // 标题栏「海洋皮肤」按钮 → 点击 open-sea-skin 自建设置按钮
          // （id=__open-sea-skin-btn__，fixed 定位，无需可见即可触发）。
          var ossBtn = document.getElementById('__open-sea-skin-btn__')
          if (ossBtn !== null && !(ossBtn as HTMLButtonElement).disabled) ossBtn.click()
          return
        }
        if (detail === 'sidebar' || detail === 'bottom') {
          // 互斥：侧栏/底栏打开时，插件中心模态让位（若开着先关闭）。
          var close = win.__pluginCenterClose
          if (typeof close === 'function') close()
          // 按钮按新锚点定位（官方右侧边栏用会话头按钮、底栏用 better-sidebar 自己的开关）
          var btns = panelButtons()
          clickButton(detail === 'sidebar' ? btns.sidebar : btns.bottom)
        }
      })
    }

    return module.exports
  },
})
