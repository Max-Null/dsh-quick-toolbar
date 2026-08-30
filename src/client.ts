/**
 * @max-null/dsh-quick-toolbar — browser half.
 *
 * SSiD 标题栏统一按钮组的 DSH 侧执行器（v0.4.0）：
 *
 * 1. 隐藏 DSH 内的原按钮（插件中心 header 按钮 + better-sidebar 的
 *    toggleCluster），消除双入口与错位——统一由自绘标题栏按钮组接管。
 * 2. 监听 main 进程经 `mainView.webContents.executeJavaScript` 派发的
 *    `ssid:titlebar` CustomEvent：
 *      detail = 'plugin-center' → win.__pluginCenterToggle?.()
 *                                （plugin-center v0.1.7+ 全局控制器：再点关闭；
 *                                  老版回退 __pluginCenterOpen）
 *      detail = 'sidebar'       → 先 __pluginCenterClose?.()（互斥：模态让位
 *                                工具面板），再 click toggleCluster 最后一个按钮
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
 * 选择器只用 CSS Modules 的原始段（编译后如 nArs4W_toggleCluster），
 * 与哈希前缀无关：better-sidebar / plugin-center 升级只要不改类名即有效。
 * 隐藏元素仍可被 JS 的 .click() 触发（无需可见），与壳已有的
 * 「侧边栏自动诊断」同模式。
 */

import { BUILTIN_ADAPTERS, builtinAdapter, type AdapterDef } from './adapters.ts'
import { runAdapter, type ActEnv } from './engine.ts'

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
      // 插件中心 header 按钮 + better-sidebar 的 toggleCluster（底栏/侧栏）
      // 原按钮：统一由标题栏按钮组/悬浮快捷工具栏接管（v0.5.0 起全环境
      // 隐藏——无壳 web 靠快捷工具栏兜底，入口不切断；JS .click() 触发）。
      '[class*="pc-headerbtn"] { display: none !important; }',
      '[class*="toggleCluster"] { display: none !important; }',
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
     * 从 toggleCluster 按钮的 aria-label 反推面板状态——不依赖 CSS 类名
     * 通配（DSH 官方 UI 也有 css.panel 类，[class*="panel"] 会误匹配，
     * 2026-08-19 用户实测「打开插件中心同时打开右栏」）。
     * better-sidebar 按钮语义（src/client/locales.ts 实证）：
     *   侧栏按钮 aria-label：开着='折叠侧边栏'(collapse) / 关着='展开侧边栏'(expand)
     *   底栏按钮 aria-label：开着='折叠底部面板'(collapseBottomPanel) / 关着='展开底部面板'(expandBottomPanel)
     * 面板开着 = 对应按钮 label 是「折叠」语义（collapse/折叠）。
     */
    function clusterSideButtons() {
      var cluster = document.querySelector('[class*="toggleCluster"]') as HTMLElement
      if (cluster === null) return { sidebar: null, bottom: null }
      var buttons = cluster.querySelectorAll('button')
      var sidebar = null, bottom = null
      for (var i = 0; i < buttons.length; i++) {
        // 底栏按钮：label 含 bottom（en）或 底部（zh）
        var label = (buttons[i].getAttribute('aria-label') || '').toLowerCase()
        if (label.indexOf('bottom') !== -1 || label.indexOf('底部') !== -1) bottom = buttons[i]
        else sidebar = buttons[i]
      }
      return { sidebar: sidebar, bottom: bottom }
    }
    function isPanelOpen(button: HTMLElement | null | undefined) {
      if (button === null || button === undefined) return false
      var label = (button.getAttribute('aria-label') || '').toLowerCase()
      return label.indexOf('collapse') !== -1 || label.indexOf('折叠') !== -1
    }
    function clickButton(button: HTMLButtonElement | null | undefined) {
      if (button !== null && button !== undefined && !button.disabled) button.click()
    }

    /**
     * 反向互斥（2026-08-19 用户补充）：打开插件中心前，若侧栏/底栏
     * 开着则先收起（点其 toggleCluster 按钮），避免弹窗被面板遮挡。
     * 两个独立判断：右栏+底栏同时开着时都要收起（不能用 if/else if，
     * 否则短路漏掉一个——用户实测「双开时底栏保持打开」）。
     */
    function closeSidePanelsBeforePluginCenter() {
      var btns = clusterSideButtons()
      if (isPanelOpen(btns.sidebar)) clickButton(btns.sidebar)
      if (isPanelOpen(btns.bottom)) clickButton(btns.bottom)
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
      'sm.open': ['会话管理', 'Sessions'],
      'sm.openTitle': ['打开会话管理面板', 'Open session manager'],
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
    var TOOLBAR_POS_KEY = 'ssid-toolbar-pos'
    var TOOLBAR_COLLAPSED_KEY = 'ssid-toolbar-collapsed'
    var TOOLBAR_PINNED_KEY = 'ssid-toolbar-pinned'
    // 壳环境悬浮球开关（2026-08-30 用户拍板：SSiD 标题栏加开关——悬浮球默认隐藏，
    // 标题栏「悬浮球」按钮开启（持久化）——ssid:titlebar detail='quick-toolbar-toggle'）。
    var TOOLBAR_SHELL_VISIBLE_KEY = 'ssid-toolbar-shell-visible'
    var shellFloatVisible = function () {
      try { return localStorage.getItem(TOOLBAR_SHELL_VISIBLE_KEY) === '1' } catch (_e) { return false }
    }
    var TOOLBAR_CSS = [
      // 壳 = 球↔面板一体（v1.8 morph）：收起 36px 圆、展开面板矩形，
      // width/height/left/top/border-radius 四态过渡 = 「球长宽展开成面板」，
      // 球图标钉在壳内球位，随壳移动到面板角淡出（2026-08-30 用户拍板）。
      '#ssid-toolbar{position:fixed;z-index:9999;font-family:system-ui,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;box-sizing:border-box;width:36px;height:36px;border-radius:18px;background:var(--dsw-alias-bg-layer-3,#10151f);border:1px solid var(--dsw-alias-border-l2,#1e2836);box-shadow:0 4px 16px rgba(0,0,0,.3);overflow:hidden;transition:width .28s cubic-bezier(.25,.8,.25,1),height .28s cubic-bezier(.25,.8,.25,1),left .28s cubic-bezier(.25,.8,.25,1),top .28s cubic-bezier(.25,.8,.25,1),border-radius .28s cubic-bezier(.25,.8,.25,1)}',
      '#ssid-toolbar *{box-sizing:border-box}',
      '#ssid-toolbar.ssid-tb-expanded{border-radius:12px}',
      // 球图标层：独立于壳（fixed 于球位、pointer-events 穿透）——morph 时
      // 图标停在原位淡出，壳从球位向面板位长开；面板位置公式保证球位 ⊂ 面板一角。
      '#ssid-toolbar-ball{position:fixed;z-index:10000;width:36px;height:36px;margin:0;padding:0;border:0;background:transparent;box-shadow:none;appearance:none;-webkit-appearance:none;pointer-events:none;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,#d8e0ea);opacity:.9;transition:opacity .18s ease}',
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
    ].join('\n')

    function toolbarIcon(name: string) {
      var ICONS: Record<string, string> = {
        grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
        plugin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
        sidebar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M10 2v12"/></svg>',
        bottom: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 10h12"/></svg>',
        sessions: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4" stroke-linecap="round"/></svg>',
        collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5.5h10M6.5 8.5h3M8 11.5h1" stroke-linecap="round"/></svg>',
        menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h10M3 8h10M3 11h10" stroke-linecap="round"/></svg>',
        pin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 2.2l4 4-2.6 1.4-1.8 1.8.4 2.6-1.4 1.4-2.6-3L3.9 13l-1-1 3-3.9-3-2.6 1.4-1.4 2.6.4 1.8-1.8z"/></svg>',
        settings: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4"/></svg>',
      }
      return ICONS[name] || ICONS.grid
    }

    // v2 M1 引擎环境：find/dispatch ← DOM；runCommand ← composer 输入模拟
    // （DSH master 的 remote.commands.execute 需会话作用域 ctx——M2 深整合时接入）。
    var toolbarEnv = function (): ActEnv {
      return {
        find: function (s) { return document.querySelector(s) as HTMLElement | null },
        findPanel: function (s) { return null },
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
    // composer 输入模拟：写入 `/name` + InputEvent + Enter（React 受控 textarea /
    // contenteditable 双形态；定位失败 → false 静默防御）。
    function typeCommandIntoComposer(name: string) {
      var seat = document.querySelector('[data-composer-seat]')
      var el = (seat !== null && seat !== undefined
        ? seat.querySelector('textarea, [contenteditable="true"]')
        : document.querySelector('textarea, [contenteditable="true"]')) as HTMLElement | null
      if (el === null || el === undefined) return false
      var text = '/' + name
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
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
      return true
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
        var btns = clusterSideButtons()
        clickButton(kind === 'sidebar' ? btns.sidebar : btns.bottom)
        return
      }
      if (kind === 'sessions') { clickSmOpenButton(); return }
    }

    function createToolbar() {
      // 壳环境（__SSID_SHELL__）：悬浮球默认隐藏（标题栏接管入口），
      // 用户可从标题栏「悬浮球」按钮开启（持久化 ssid-toolbar-shell-visible）。
      if (win.__SSID_SHELL__ === true && !shellFloatVisible()) return
      if (document.getElementById(TOOLBAR_ID) !== null) return
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
      // 工具栏按钮集 = 内置适配器集 + 用户适配器管线（v2 M1：host API 拉取 →
      // 同 id 覆盖内置行为、无 id 映射的条目走适配器引擎执行；kind 映射的内置
      // 走既有 toolbarAction——老按钮零回归）。
      var TOOLBAR_KIND_BY_ADAPTER: Record<string, string> = {
        'dsh-plugin-center': 'plugin',
        'dsh-better-sidebar.sidebar': 'sidebar',
        'dsh-better-sidebar.bottom': 'bottom',
        'dsh-session-manager': 'sessions',
      }
      var adapterIconHtml = function (adapter: AdapterDef, kind: string | null) {
        if (adapter.icon.source === 'custom') {
          var value = adapter.icon.value
          if (value.indexOf('<') === 0) return value
          return toolbarIcon(value)
        }
        return kind !== null ? toolbarIcon(kind) : toolbarIcon('grid')
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
          var label = adapter.label !== undefined ? adapter.label : adapter.id
          var textSpan = b.querySelector('span') as HTMLElement
          if (textSpan !== null) textSpan.textContent = label
          b.setAttribute('aria-label', label)
          b.title = label
        }
        b.addEventListener('click', function () {
          if (kind !== null) { toolbarAction(kind); return }
          runAdapter(adapter, toolbarEnv())
        })
        panel.appendChild(b)
      }
      for (var ai = 0; ai < BUILTIN_ADAPTERS.length; ai++) {
        var adapter = BUILTIN_ADAPTERS[ai]
        var kind = TOOLBAR_KIND_BY_ADAPTER[adapter.id]
        // 有 kind 映射 → 既有 toolbarAction（i18n 文案）；无映射（如 dsh-settings）
        // → 引擎执行（label/icon 直显；open-settings 语义锚点链）。
        renderButton(adapter, kind !== undefined ? kind : null)
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
                var old = panel.querySelector('[data-adapter-id="' + user.id.replace(/"/g, '\\"') + '"]')
                if (old !== null && old.parentNode === panel) panel.removeChild(old)
              } catch (_e) {}
              renderButton(user, userKind !== undefined ? userKind : null)
            }
          })
          .catch(function () {})
      }
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

      // ---- 球↔面板 morph（v1.9）：壳 = root，唯一锚点 = 球位（收起态左上角）----
      // 收起：36x36 圆；展开：面板位置公式保证「球位 ⊂ 面板一角」（球就是面板
      // 的角，不再斜对角相切）——球图标独立 fixed 层停在原位淡出，壳长宽展开。
      var BALL_SIZE = 36
      var BALL_R = 18
      var expanded = false
      var ballX = 0, ballY = 0 // 球壳左上角（收起态位置——唯一锚点）
      try {
        var savedPos = JSON.parse(String(localStorage.getItem(TOOLBAR_POS_KEY) || 'null'))
        if (savedPos !== null && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
          ballX = savedPos.x
          ballY = savedPos.y
        }
      } catch (_e) {}
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
        try { localStorage.setItem(TOOLBAR_COLLAPSED_KEY, collapsed ? '1' : '0') } catch (_e) {}
      }
      // 钉住（hover 收起优化，2026-08-30 用户拍板）：未钉住=鼠标移出自动收起、
      // 移入悬浮球展开；钉住=始终展开（状态持久化 ssid-toolbar-pinned）。
      var pinned = false
      try { pinned = localStorage.getItem(TOOLBAR_PINNED_KEY) === '1' } catch (_e) {}
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
        try { localStorage.setItem(TOOLBAR_PINNED_KEY, pinned ? '1' : '0') } catch (_e) {}
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
          try {
            localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify({ x: ballX, y: ballY }))
          } catch (_e) {}
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
    }

    exports.inject = []

    exports.apply = function (ctx: unknown) {
      // 防重守卫：DSH 插件热重载/重复加载时避免重复注册 ssid:titlebar
      // 监听器与重复注入 CSS——否则一次标题栏点击会触发多次处理
      // （toggle 被抵消、互斥按钮被点多次），2026-08-19 用户提示
      // 「事件传递导致的问题」的排查项之一。
      if (win.__dshQuickToolbarInstalled === true) return
      win.__dshQuickToolbarInstalled = true

      var style = document.createElement('style')
      style.setAttribute('data-dsh-quick-toolbar', '')
      style.textContent = BASE_CSS + (SHELL_CSS.length > 0 && win.__SSID_SHELL__ === true ? '\n' + SHELL_CSS.join('\n') : '')
      document.head.appendChild(style)

      // 悬浮快捷工具栏（被屏蔽/接管按钮的常驻出口）
      var tbStyle = document.createElement('style')
      tbStyle.setAttribute('data-dsh-quick-toolbar-toolbar', '')
      tbStyle.textContent = TOOLBAR_CSS
      document.head.appendChild(tbStyle)
      createToolbar()

      // 壳标志（win.__SSID_SHELL__）由 main.mjs 在 dom-ready 注入，晚于
      // 本插件 apply——页面早期创建的元素/样式按壳环境兜底修正：
      // SSiD（壳）不显示悬浮快捷工具栏（按钮已集成标题栏，2026-08-29
      // 用户决策）；SHELL_CSS（隐藏插中心/侧栏原按钮）同样需补注。
      // 2026-08-30 修复：apply 可能晚于页面 load（load 监听错过 → 悬浮球
      // 残留壳环境），兜底 = load + 每 1.5s 轮询（≤5 次）检查标志。
      var hideIfShell = function () {
        if (win.__SSID_SHELL__ !== true) return false
        // 标题栏「悬浮球」开关开启 → 壳中保留悬浮球（2026-08-30 用户拍板）
        if (shellFloatVisible()) return false
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
      new MutationObserver(function () { applyLocale() }).observe(document.documentElement, {
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
          var nextOn = !shellFloatVisible()
          try { localStorage.setItem(TOOLBAR_SHELL_VISIBLE_KEY, nextOn ? '1' : '0') } catch (_e) {}
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
          // 按钮按 aria-label 语义定位（不依赖按钮顺序）
          var btns = clusterSideButtons()
          clickButton(detail === 'sidebar' ? btns.sidebar : btns.bottom)
        }
      })
    }

    return module.exports
  },
})
