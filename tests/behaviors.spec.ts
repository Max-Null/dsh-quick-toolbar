/**
 * behaviors 行为库单测（node:test + 窄接口 stub——DOM 无关可测）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actClick,
  actTogglePanel,
  actDispatchEvent,
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
