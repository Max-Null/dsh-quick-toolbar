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

test('runAdapter: v1 未实现行为（open-settings/command）→ 警告 + false，不吞不假装', () => {
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
