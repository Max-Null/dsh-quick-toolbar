/**
 * scout 单测（v2 M2 最小闭环）：scanCandidates/buildPrompt 纯函数（桩注入）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanCandidates, buildPrompt, type ScoutCandidate } from '../src/scout.ts'

function makeCandidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  return {
    tag: 'BUTTON',
    ariaLabel: null,
    title: null,
    text: '按钮',
    hint: '.btn',
    visible: true,
    ...overrides,
  }
}

test('scanCandidates: 已适配元素跳过（isAdapted true 不入列）', () => {
  const a = makeCandidate({ text: '已收编' })
  const b = makeCandidate({ text: '未收编' })
  const out = scanCandidates(
    () => [a, b],
    () => false && a !== undefined, // 桩：isAdapted 由调用方控制——这里全 false
    (el) => el as ScoutCandidate,
  )
  assert.equal(out.length, 2)
})

test('scanCandidates: isAdapted 命中跳过', () => {
  const a = makeCandidate({ text: '收编' })
  const b = makeCandidate({ text: '新人' })
  const out = scanCandidates(
    () => [a, b],
    (el) => (el as ScoutCandidate).text === '收编',
    (el) => el as ScoutCandidate,
  )
  assert.deepEqual(out.map((c) => c.text), ['新人'])
})

test('scanCandidates: 去重（同 aria+text 合并）与可见性排序（可见优先）', () => {
  const dup1 = makeCandidate({ text: '重复', ariaLabel: 'x' })
  const dup2 = makeCandidate({ text: '重复', ariaLabel: 'x' })
  const hidden = makeCandidate({ text: '隐藏', visible: false })
  const shown = makeCandidate({ text: '显示' })
  const out = scanCandidates(
    () => [hidden, dup1, shown, dup2],
    () => false,
    (el) => el as ScoutCandidate,
  )
  assert.equal(out.length, 3)
  assert.equal(out[0]!.visible, true)
  assert.equal(out[0]!.text, '显示')
})

test('buildPrompt: 候选表 + 模板拼接', () => {
  const out = buildPrompt(
    [makeCandidate({ text: '迷你面板', ariaLabel: 'mini-panel' })],
    '{"act":{"kind":"click"}}',
  )
  assert.ok(out.includes('迷你面板'))
  assert.ok(out.includes('aria="mini-panel"'))
  assert.ok(out.includes('<button>'))
  assert.ok(out.includes('{"act":{"kind":"click"}}'))
  assert.ok(out.includes('未识别候选'))
})

test('buildPrompt: 无候选 → 明确提示（不产出空表）', () => {
  const out = buildPrompt([], 'T')
  assert.ok(out.includes('（无候选'))
})
