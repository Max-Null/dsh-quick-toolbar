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
    findPanel: (sel) => {
      calls.push(`findPanel:${sel}`)
      return null
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

test('runAdapter: toggle-panel 面板缺失 → 静默（不假装成功）', () => {
  const env = makeEnv()
  const adapter = builtinAdapter('dsh-session-manager')
  assert.ok(adapter)
  assert.equal(runAdapter(adapter!, env), false)
  assert.ok(env.calls.some((c) => c.startsWith('findPanel:')))
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

test('runAdapter: scan 走 scan/template/report 通道（建议制，只发现+提示词）', () => {
  let scanned: readonly { text: string; visible: boolean }[] = []
  let reported = ''
  const env = makeEnv({
    scan: () => {
      scanned = [{ text: '候选一', visible: true, tag: 'BUTTON', ariaLabel: null, title: null, hint: '.btn' } as never]
      return scanned
    },
    template: () => '{"act":{"kind":"click"}}',
    report: (t) => { reported = t },
  })
  const adapter = builtinAdapter('dsh-scout')!
  assert.ok(adapter)
  assert.equal(runAdapter(adapter!, env), true)
  assert.ok(reported.includes('候选一'))
  assert.ok(reported.includes('{"act":{"kind":"click"}}'))
})

test('runAdapter: scan 无通道 → 警告 + false', () => {
  const env = makeEnv()
  const warn = console.warn
  let warned = 0
  console.warn = () => { warned++ }
  try {
    const adapter = builtinAdapter('dsh-scout')!
    assert.equal(runAdapter(adapter!, env), false)
    assert.equal(warned, 1)
  } finally {
    console.warn = warn
  }
})
