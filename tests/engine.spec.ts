/**
 * 适配器执行器（runAdapter）单测——stub 注入 ActEnv，DOM 无关。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAdapter, type ActEnv } from '../src/engine.ts'
import { builtinAdapter } from '../src/adapters.ts'

function makeEnv(overrides: Partial<ActEnv> = {}): ActEnv & { calls: string[] } {
  const calls: string[] = []
  return {
    find: (sel) => {
      calls.push(`find:${sel}`)
      return null // 默认无目标
    },
    dispatch: (event, detail) => {
      calls.push(`dispatch:${event}:${String(detail)}`)
      return true
    },
    ...overrides,
    calls,
  }
}

test('runAdapter: dispatch-event（插件中心适配）派发 CustomEvent', () => {
  const env = makeEnv()
  const adapter = builtinAdapter('dsh-plugin-center')
  assert.ok(adapter)
  assert.equal(runAdapter(adapter!, env), true)
  assert.ok(env.calls.includes('dispatch:ssid:titlebar:plugin-center'))
})

test('runAdapter: click 定位失败静默跳过（插件未装/改版——绝不误伤）', () => {
  const env = makeEnv()
  const adapter = builtinAdapter('dsh-better-sidebar.sidebar')
  assert.ok(adapter)
  // 该适配 act 为 dispatch-event；改用 click 型适配验证
  const clickAdapter = { ...adapter!, act: { kind: 'click' } as const }
  assert.equal(runAdapter(clickAdapter, env), false)
  assert.ok(env.calls.some((c) => c.startsWith('find:')))
})

test('runAdapter: toggle-panel close 可见 → 点 close 关闭（v0.8.0 探测语义）', () => {
  let closed = 0
  let opened = 0
  const env = makeEnv({
    find: (sel) => {
      if (sel === '.remote-close') return { click: () => { closed++ }, disabled: false } as unknown as HTMLElement
      return null
    },
    isVisible: () => true,
  })
  const adapter = { ...builtinAdapter('dsh-session-manager')!, act: { kind: 'toggle-panel', close: '.remote-close' } as const, button: '.remote-btn' }
  assert.equal(runAdapter(adapter, env), true)
  assert.equal(closed, 1)
  assert.equal(opened, 0)
})

test('runAdapter: toggle-panel close 不可见/不存在 → 点原按钮打开（探测语义）', () => {
  let opened = 0
  const env = makeEnv({
    find: (sel) =>
      sel === '.remote-btn'
        ? { click: () => { opened++ }, disabled: false } as unknown as HTMLElement
        : null,
    isVisible: () => false,
  })
  const adapter = { ...builtinAdapter('dsh-session-manager')!, act: { kind: 'toggle-panel', close: '.remote-close' } as const, button: '.remote-btn' }
  assert.equal(runAdapter(adapter, env), true)
  assert.equal(opened, 1)
})

test('runAdapter: toggle-panel 弹窗关着但原按钮定位失败 → 静默 false', () => {
  const env = makeEnv({ isVisible: () => false })
  const adapter = { ...builtinAdapter('dsh-session-manager')!, act: { kind: 'toggle-panel', close: '.remote-close' } as const, button: '.remote-btn' }
  assert.equal(runAdapter(adapter, env), false)
})

test('runAdapter: toggle-panel secondClick mask 通道 → 命中可见遮罩并点击（二次点击事件）', () => {
  let maskClicked = 0
  const env = makeEnv({
    find: (sel) => {
      if (sel === '[class$="_backdrop"]') return { click: () => { maskClicked++ }, disabled: false } as unknown as HTMLElement
      return null
    },
    isVisible: () => true,
  })
  const adapter = { ...builtinAdapter('dsh-session-manager')!, act: { kind: 'toggle-panel', secondClick: { kind: 'mask' } } as const, button: '.remote-btn' }
  assert.equal(runAdapter(adapter, env), true)
  assert.equal(maskClicked, 1)
})

test('runAdapter: toggle-panel secondClick 优先于旧 close 字段', () => {
  let closeClicked = 0
  let maskClicked = 0
  const env = makeEnv({
    find: (sel) => {
      if (sel === '.old-close') return { click: () => { closeClicked++ }, disabled: false } as unknown as HTMLElement
      if (sel === '[class$="_backdrop"]') return { click: () => { maskClicked++ }, disabled: false } as unknown as HTMLElement
      return null
    },
    isVisible: () => true,
  })
  const adapter = { ...builtinAdapter('dsh-session-manager')!, act: { kind: 'toggle-panel', secondClick: { kind: 'mask' }, close: '.old-close' } as const, button: '.remote-btn' }
  assert.equal(runAdapter(adapter, env), true)
  assert.equal(maskClicked, 1)
  assert.equal(closeClicked, 0)
})

test('runAdapter: 缺省 act → click（换位置缺省语义）', () => {
  const env = makeEnv({
    find: (sel) => (sel === '.plain-btn' ? ({ click: () => {}, disabled: false } as unknown as HTMLElement) : null),
  })
  // 内置适配器（带 act）展开后复制——构造无 act 的最小适配
  const adapter = builtinAdapter('dsh-plugin-center')!
  const minimal = { ...adapter, button: '.plain-btn', act: undefined }
  assert.equal(runAdapter(minimal, env), true)
})

test('runAdapter: command 无 runCommand 通道 → 警告 + false，不吞不假装', () => {
  const env = makeEnv()
  const warn = console.warn
  let warned = 0
  console.warn = (...args: unknown[]) => {
    warned++
    void args
  }
  try {
    const adapter = builtinAdapter('dsh-plugin-center')!
    assert.equal(runAdapter({ ...adapter, act: { kind: 'command', name: 'x' } }, env), false)
    assert.equal(warned, 1)
  } finally {
    console.warn = warn
  }
})

test('runAdapter: open-settings 锚点链命中 → 点击（v2 M1 实现）', () => {
  let clicked = 0
  const env = makeEnv({
    find: (sel) => {
      // 首个锚点命中（中文 aria）
      return sel === 'button[aria-label="设置"]'
        ? ({ click: () => { clicked++ }, disabled: false } as unknown as HTMLElement)
        : null
    },
  })
  const adapter = builtinAdapter('dsh-settings')
  assert.ok(adapter)
  assert.equal(runAdapter(adapter!, env), true)
  assert.equal(clicked, 1)
})

test('runAdapter: open-settings 全锚点未命中 → false（防御）', () => {
  const env = makeEnv()
  const adapter = builtinAdapter('dsh-settings')
  assert.ok(adapter)
  assert.equal(runAdapter(adapter!, env), false)
})

test('runAdapter: command 走 runCommand 通道（成功返真）', () => {
  let called = ''
  const env = makeEnv({ runCommand: (name) => { called = name; return true } })
  const adapter = builtinAdapter('dsh-plugin-center')!
  assert.equal(runAdapter({ ...adapter, act: { kind: 'command', name: 'compact' } }, env), true)
  assert.equal(called, 'compact')
})

test('runAdapter: command 通道返回 false → 透传（环境不支持）', () => {
  const env = makeEnv({ runCommand: () => false })
  const adapter = builtinAdapter('dsh-plugin-center')!
  assert.equal(runAdapter({ ...adapter, act: { kind: 'command', name: 'compact' } }, env), false)
})

test('runAdapter: open-settings path 暂不支持 → 警告 + 仍执行锚点链', () => {
  let clicked = 0
  const env = makeEnv({
    find: (sel) =>
      sel === 'button[aria-label="设置"]'
        ? ({ click: () => { clicked++ }, disabled: false } as unknown as HTMLElement)
        : null,
  })
  const warn = console.warn
  let warned = 0
  console.warn = () => { warned++ }
  try {
    const adapter = builtinAdapter('dsh-settings')!
    assert.equal(runAdapter({ ...adapter, act: { kind: 'open-settings', path: 'llm' } }, env), true)
    assert.equal(warned, 1)
    assert.equal(clicked, 1)
  } finally {
    console.warn = warn
  }
})
