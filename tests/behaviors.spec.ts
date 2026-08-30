/**
 * behaviors 行为库单测（node:test + 窄接口 stub——DOM 无关可测）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actClick,
  actTogglePanel,
  actDispatchEvent,
  actOpenSettings,
  actCommand,
  type Clickable,
  type PanelLike,
  type DispatchEnv,
} from '../src/behaviors.ts'

function makeClickable(overrides: Partial<Clickable> = {}): Clickable & { clicked: number } {
  let clicks = 0
  return {
    click() {
      clicks++
    },
    get clicked() {
      return clicks
    },
    ...overrides,
  }
}

test('actClick: 正常点击', () => {
  const btn = makeClickable()
  assert.equal(actClick(btn), true)
  assert.equal(btn.clicked, 1)
})

test('actClick: 定位失败（null/undefined）静默跳过，不报错', () => {
  assert.equal(actClick(null), false)
  assert.equal(actClick(undefined), false)
})

test('actClick: 禁用按钮不点击（空指针对策：目标缺失/禁用均防御）', () => {
  const btn = makeClickable({ disabled: true })
  assert.equal(actClick(btn), false)
  assert.equal(btn.clicked, 0)
})

test('actTogglePanel: 面板开着 → 点关闭按钮（原生无再点关闭的适配）', () => {
  let open = true
  const panel: PanelLike = {
    isOpen: () => open,
    open: () => {
      open = true
    },
    close: () => {
      open = false
    },
  }
  const closeBtn = makeClickable()
  assert.equal(actTogglePanel(panel, closeBtn), true)
  assert.equal(closeBtn.clicked, 1) // 关闭按钮被点
})

test('actTogglePanel: 面板关着 → open()', () => {
  let open = false
  const panel: PanelLike = {
    isOpen: () => open,
    open: () => {
      open = true
    },
    close: () => {
      open = false
    },
  }
  assert.equal(actTogglePanel(panel, null), true)
  assert.equal(open, true)
})

test('actTogglePanel: 开着但关闭目标缺失 → 不误点其他，返回 false', () => {
  const panel: PanelLike = { isOpen: () => true, open: () => {}, close: () => {} }
  assert.equal(actTogglePanel(panel, null), false)
})

test('actDispatchEvent: 派发 CustomEvent 携带 detail', () => {
  const sent: Array<{ event: string; detail: unknown }> = []
  const env: DispatchEnv = {
    dispatchEvent: (e) => {
      sent.push({ event: e.type, detail: (e as CustomEvent).detail })
      return true
    },
  }
  assert.equal(actDispatchEvent(env, 'ssid:titlebar', 'plugin-center'), true)
  assert.deepEqual(sent, [{ event: 'ssid:titlebar', detail: 'plugin-center' }])
})

test('actOpenSettings: 锚点链命中（中文 aria-local）先命中即点', () => {
  const hits: string[] = []
  const btn = makeClickable()
  const env = {
    find: (sel: string) => {
      hits.push(sel)
      return sel === 'button[aria-label="设置"]' ? btn : null
    },
  }
  assert.equal(actOpenSettings(env), true)
  assert.equal(btn.clicked, 1)
  assert.equal(hits[0], '[class$="_trigger"]') // 锚点链首位 = footer trigger 类
})

test('actOpenSettings: findByText 语义定位优先（footer trigger 无 aria）', () => {
  const byText = makeClickable()
  const bySelector = makeClickable()
  const env = {
    find: (sel: string) => (sel === '[class$="_trigger"]' ? bySelector : null),
    findByText: (texts: readonly string[]) => (texts.includes('设置') ? byText : null),
  }
  assert.equal(actOpenSettings(env), true)
  assert.equal(byText.clicked, 1)
  assert.equal(bySelector.clicked, 0)
})

test('actOpenSettings: findByText 未命中 → 锚点链兜底', () => {
  const bySelector = makeClickable()
  const env = {
    find: (sel: string) => (sel === '[class$="_trigger"]' ? bySelector : null),
    findByText: () => null,
  }
  assert.equal(actOpenSettings(env), true)
  assert.equal(bySelector.clicked, 1)
})

test('actOpenSettings: 中文未命中 → 英文锚点回退命中', () => {
  const btn = makeClickable()
  const env = { find: (sel: string) => (sel === 'button[aria-label="Settings"]' ? btn : null) }
  assert.equal(actOpenSettings(env), true)
  assert.equal(btn.clicked, 1)
})

test('actOpenSettings: 全锚点未命中 → false（插件未装/改版防御）', () => {
  const env = { find: () => null }
  assert.equal(actOpenSettings(env), false)
})

test('actOpenSettings: 首命中但 disabled → 跳过继续后续锚点', () => {
  const disabled = makeClickable({ disabled: true })
  const enabled = makeClickable()
  const env = {
    find: (sel: string) =>
      sel === 'button[aria-label="设置"]' ? disabled : sel === 'button[aria-label="Settings"]' ? enabled : null,
  }
  assert.equal(actOpenSettings(env), true)
  assert.equal(disabled.clicked, 0)
  assert.equal(enabled.clicked, 1)
})

test('actCommand: 正常执行（name 带前导空格 → trim）', () => {
  let called = ''
  const env = { execute: (name: string) => { called = name; return true } }
  assert.equal(actCommand(env, '  sessions  '), true)
  assert.equal(called, 'sessions')
})

test('actCommand: 空名/纯空白 → false', () => {
  assert.equal(actCommand({ execute: () => true }, ''), false)
  assert.equal(actCommand({ execute: () => true }, '   '), false)
})

test('actCommand: 执行器返回 false → 透传（环境不支持）', () => {
  assert.equal(actCommand({ execute: () => false }, 'compact'), false)
})
