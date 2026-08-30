/**
 * schemas 单测：用户配置解析与校验（LLM 产出的第一道防线）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUserAdapters } from '../src/schema.ts'

const valid = JSON.stringify({
  adapters: [
    {
      id: 'demo-plugin',
      button: '.demo-btn',
      icon: { source: 'from-button' },
      label: '演示',
      act: { kind: 'click' },
      hide: true,
    },
  ],
})

test('parseUserAdapters: 合法配置通过', () => {
  const r = parseUserAdapters(valid)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.adapters.length, 1)
    assert.equal(r.value.adapters[0]!.id, 'demo-plugin')
  }
})

test('parseUserAdapters: 非法 JSON → invalid-json', () => {
  const r = parseUserAdapters('{bad json')
  assert.equal(r.ok, false)
})

test('parseUserAdapters: 缺 button → 报路径问题（丢弃该条不动他条）', () => {
  const r = parseUserAdapters(JSON.stringify({ adapters: [{ id: 'x', icon: { source: 'from-button' }, act: { kind: 'click' } }] }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.issues.some((i) => i.includes('button')))
})

test('parseUserAdapters: 未实现 kind → 拒绝（enum 校验）', () => {
  const r = parseUserAdapters(JSON.stringify({ adapters: [{ id: 'x', button: '.a', icon: { source: 'from-button' }, act: { kind: 'fly' } }] }))
  assert.equal(r.ok, false)
})

test('parseUserAdapters: 空配置（无 adapters 键）→ 拒绝（结构明确）', () => {
  const r = parseUserAdapters('{}')
  assert.equal(r.ok, false)
})

test('parseUserAdapters: 「换位置」最小注册（仅 id+button）通过——图标/文字/点击缺省推导', () => {
  const r = parseUserAdapters(JSON.stringify({ adapters: [{ id: 'minimal', button: '.min-btn' }] }))
  assert.equal(r.ok, true)
  if (r.ok) {
    const a = r.value.adapters[0]!
    assert.equal(a.id, 'minimal')
    assert.equal(a.icon, undefined)
    assert.equal(a.act, undefined)
  }
})
