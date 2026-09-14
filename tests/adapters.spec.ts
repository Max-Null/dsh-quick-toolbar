/**
 * 适配器数据校验单测（内置集结构化校验 + 覆盖现状按钮）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_ADAPTERS, builtinAdapter, adapterVisible, type AdapterDef } from '../src/adapters.ts'

function validate(a: AdapterDef): void {
  assert.equal(typeof a.id, 'string')
  assert.ok(a.id.length > 0)
  assert.equal(typeof a.button, 'string')
  assert.ok(a.button.length > 0)
  assert.ok(['click', 'toggle-panel', 'dispatch-event', 'open-settings', 'command'].includes(a.act.kind))
  assert.equal(typeof a.icon.source, 'string')
}

test('内置适配器集：全部结构化合法', () => {
  assert.equal(BUILTIN_ADAPTERS.length, 5)
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

// ── adapterVisible（目标可用性探测：选择器命中 → 文本兜底）──────────────
function fakeRoot(overrides: {
  selectorHit?: string | null
  nodes?: Array<{ label?: string | null; text?: string }>
}): ParentNode {
  return {
    // 真实 querySelector 接受逗号分隔的多选择器；这里两种写法都认：
    // 整串相等（既有用例的写法）与「命中其中任一子选择器」（v0.19.0 适配器的写法）。
    querySelector: (sel: string) => {
      const hit = overrides.selectorHit
      if (hit === undefined) return null
      if (sel === hit) return { tag: 'X' }
      return String(sel).split(',').map((s) => s.trim()).includes(hit) ? { tag: 'X' } : null
    },
    querySelectorAll: () => (overrides.nodes ?? []).map((n) => ({
      getAttribute: (name: string) => (name === 'aria-label' ? (n.label ?? null) : null),
      textContent: n.text ?? '',
    })),
  } as unknown as ParentNode
}

test('adapterVisible: 选择器命中即 true（旧锚点仍工作）', () => {
  const a = builtinAdapter('dsh-settings') as AdapterDef
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[aria-label="设置"], button[aria-label="Settings"]' })))
})

test('adapterVisible: 选择器未命中时按文本兜底（alpha.2 设置按钮无 aria，仅文本）', () => {
  const a = builtinAdapter('dsh-settings') as AdapterDef
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: null, text: '设置' }] })))
  // 英文 locale
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: null, text: 'Settings' }] })))
  // aria 通道
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: '设置', text: '' }] })))
})

test('adapterVisible: 插件中心侧栏导航项文本命中（pc-headerbtn 类已失效）', () => {
  const a = builtinAdapter('dsh-plugin-center') as AdapterDef
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: null, text: '插件中心' }] })))
})

test('adapterVisible: 两者皆不中 → false（入口确实不在）', () => {
  assert.equal(
    adapterVisible(
      { ...(builtinAdapter('dsh-settings') as AdapterDef), button: '.nope' },
      fakeRoot({ nodes: [{ label: null, text: '随便' }] }),
    ),
    false,
  )
})

// ── v0.19.0 锚点迁移：better-sidebar 的右列归 DSH 原生右侧栏 ─────────────
// 旧的 `[class*="toggleCluster"]` 开关簇已随「退役自绘右侧面板」移除，
// 两条适配器双双失效（2026-09-14 用户报告「按钮位置变了、需要重新适配」）。

test('adapterVisible: 侧栏适配器命中官方右侧边栏的新锚点', () => {
  const a = builtinAdapter('dsh-better-sidebar.sidebar') as AdapterDef
  // 收起态：ui-sidebar-right 的 ExpandButton（带 data-sidebar-right-expand）
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[data-sidebar-right-expand]' })))
  // 展开态：会话头 utilities 槽的收起按钮——两个 locale 变体各测一次
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[aria-label="收起右侧边栏"]' })))
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[aria-label="Collapse right sidebar"]' })))
  // 文本兜底：CSS module 哈希变化后仍命中
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: '打开右侧边栏', text: '' }] })))
})

test('adapterVisible: 底栏适配器改用 better-sidebar 自绘开关（toggleCluster 已移除）', () => {
  const a = builtinAdapter('dsh-better-sidebar.bottom') as AdapterDef
  // 两路选择器：CSS module 原始段（哈希前缀无关）+ locale 文案
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[class*="nArs4W_toggleButton"]' })))
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[aria-label="展开底部面板"]' })))
  assert.ok(adapterVisible(a, fakeRoot({ selectorHit: 'button[aria-label="折叠底部面板"]' })))
  // 文本兜底
  assert.ok(adapterVisible(a, fakeRoot({ nodes: [{ label: '折叠底部面板', text: '' }] })))
})

test('防回退：没有内置适配器仍指向已移除的 toggleCluster', () => {
  for (const a of BUILTIN_ADAPTERS) {
    assert.equal(a.button.includes('toggleCluster'), false, `${a.id} 仍指向已移除的 toggleCluster`)
  }
})
