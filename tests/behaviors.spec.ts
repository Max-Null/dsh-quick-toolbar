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

test('actTogglePanel: 弹窗开着（close 可见）→ 点关闭按钮', () => {
  const closeBtn = makeClickable()
  const openBtn = makeClickable()
  assert.equal(actTogglePanel(openBtn, closeBtn, () => true), true)
  assert.equal(closeBtn.clicked, 1) // 关闭按钮被点
  assert.equal(openBtn.clicked, 0)
})

test('actTogglePanel: 弹窗关着（close 不可见/缺失）→ 点原按钮打开', () => {
  const openBtn = makeClickable()
  assert.equal(actTogglePanel(openBtn, null, () => false), true)
  assert.equal(openBtn.clicked, 1)
  // close 目标存在但不可见 → 同样走打开
  const closeBtn = makeClickable()
  assert.equal(actTogglePanel(openBtn, closeBtn, () => false), true)
  assert.equal(openBtn.clicked, 2)
  assert.equal(closeBtn.clicked, 0)
})

test('actTogglePanel: 弹窗关着但原按钮缺失/禁用 → false（不误点）', () => {
  assert.equal(actTogglePanel(null, null, () => false), false)
  const disabled = makeClickable({ disabled: true })
  assert.equal(actTogglePanel(disabled, null, () => false), false)
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
  assert.equal(hits[0], '[class$="_mask"]') // 首探 = 面板开状态（mask）
  assert.equal(hits[1], '[class$="_trigger"]') // 关态 → 锚点链首位 = footer trigger 类
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

test('actOpenSettings: 面板开着（mask 存在）→ 点关闭按钮（再点关闭）', () => {
  const closeBtn = makeClickable()
  const mask = makeClickable()
  const env = {
    find: (sel: string) =>
      sel === '[class$="_mask"]' ? mask : sel === 'button[class$="_close"]' ? closeBtn : null,
  }
  assert.equal(actOpenSettings(env), true)
  assert.equal(closeBtn.clicked, 1)
  assert.equal(mask.clicked, 0)
})

test('actOpenSettings: 面板开着但关闭按钮缺失 → mask 兜底点（onClick=onClose）', () => {
  const mask = makeClickable()
  const env = { find: (sel: string) => (sel === '[class$="_mask"]' ? mask : null) }
  assert.equal(actOpenSettings(env), true)
  assert.equal(mask.clicked, 1)
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
