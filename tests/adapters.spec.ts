/**
 * 适配器数据校验单测（内置集结构化校验 + 覆盖现状按钮）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_ADAPTERS, builtinAdapter, type AdapterDef } from '../src/adapters.ts'

function validate(a: AdapterDef): void {
  assert.equal(typeof a.id, 'string')
  assert.ok(a.id.length > 0)
  assert.equal(typeof a.button, 'string')
  assert.ok(a.button.length > 0)
  assert.ok(['click', 'toggle-panel', 'dispatch-event', 'open-settings', 'command', 'scan'].includes(a.act.kind))
  assert.equal(typeof a.icon.source, 'string')
}

test('内置适配器集：全部结构化合法', () => {
  assert.equal(BUILTIN_ADAPTERS.length, 6)
  for (const a of BUILTIN_ADAPTERS) validate(a)
})

test('内置适配器集：覆盖现状按钮（插件中心/侧栏/底栏/会话管理/设置）', () => {
  const ids = BUILTIN_ADAPTERS.map((a) => a.id)
  assert.ok(ids.includes('dsh-plugin-center'))
  assert.ok(ids.includes('dsh-better-sidebar.sidebar'))
  assert.ok(ids.includes('dsh-better-sidebar.bottom'))
  assert.ok(ids.includes('dsh-session-manager'))
  assert.ok(ids.includes('dsh-settings'))
})

test('设置适配：open-settings 行为（语义锚点链——DSH 无公开 window 钩子）', () => {
  const st = builtinAdapter('dsh-settings')
  assert.ok(st)
  assert.equal(st.act.kind, 'open-settings')
  assert.equal(st.icon.source, 'custom')
})

test('会话管理适配：toggle-panel 行为（再点关闭——原生不支持）', () => {
  const sm = builtinAdapter('dsh-session-manager')
  assert.ok(sm)
  assert.equal(sm.act.kind, 'toggle-panel')
  assert.equal((sm.act as { close?: string }).close, '.sm-modal .close')
})

test('builtinAdapter: 未知 id 返回 undefined（防御）', () => {
  assert.equal(builtinAdapter('not-a-plugin'), undefined)
})
