/**
 * 状态 host 化单测（手册 §7.10 规则落地）：normalizeState/defaultState 纯函数。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeState, defaultState } from '../src/index.ts'

test('defaultState: 默认值（pos null / collapsed true / pinned false / shellVisible false）', () => {
  const d = defaultState()
  assert.deepEqual(d, { pos: null, collapsed: true, pinned: false, shellVisible: false })
})

test('normalizeState: 全字段合法 → 原样', () => {
  const s = normalizeState({ pos: { x: 100, y: 200 }, collapsed: false, pinned: true, shellVisible: true })
  assert.deepEqual(s, { pos: { x: 100, y: 200 }, collapsed: false, pinned: true, shellVisible: true })
})

test('normalizeState: null/非对象 → 默认', () => {
  assert.deepEqual(normalizeState(null), defaultState())
  assert.deepEqual(normalizeState('bad'), defaultState())
  assert.deepEqual(normalizeState(42), defaultState())
})

test('normalizeState: 坏字段回退默认（不吞全）', () => {
  const s = normalizeState({ pos: { x: 'x', y: null }, collapsed: 'yes', pinned: true, shellVisible: false })
  assert.deepEqual(s, { pos: null, collapsed: true, pinned: true, shellVisible: false })
})

test('normalizeState: pos 数字校验（x 数值 y 数值才收）', () => {
  assert.equal(normalizeState({ pos: { x: 10, y: 'bad' } }).pos, null)
  assert.deepEqual(normalizeState({ pos: { x: 10, y: 20 } }).pos, { x: 10, y: 20 })
})
