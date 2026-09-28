/**
 * 置顶会话显示折叠单测：组内外顺序、未分组那一档、失效条目不静默隐藏、标签截断。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UNGROUPED_KEY,
  UNGROUPED_TITLE,
  UNRESOLVED_TITLE,
  groupPinned,
  sessionLabel,
  type PinnedLookup,
} from '../src/pinned.ts'

/** 造查询器：表里没有的 id 一律返回 null（模拟会话与工作区都查不到）。 */
const lookup = (table: Record<string, PinnedLookup>) => (id: string): PinnedLookup | null =>
  Object.hasOwn(table, id) ? table[id] : null

/** 造工作区标题查询器：表里没有的返回 null。 */
const titles = (table: Record<string, string>) => (workspaceId: string): string | null =>
  Object.hasOwn(table, workspaceId) ? table[workspaceId] : null

/** 一条存活的置顶。 */
const live = (workspaceId: string, title = 'T-' + workspaceId): PinnedLookup =>
  ({ workspaceId, title, alive: true })

test('groupPinned: 空集合 → 空数组', () => {
  assert.deepEqual(groupPinned([], () => null, () => null), [])
})

test('groupPinned: 组内顺序跟着 pinnedIds 走（内核的「最近置顶优先」）', () => {
  const out = groupPinned(
    ['c', 'a', 'b'],
    lookup({ a: live('ws-1'), b: live('ws-1'), c: live('ws-1') }),
    titles({ 'ws-1': '一号' }),
  )
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].entries.map((e) => e.id), ['c', 'a', 'b'])
})

test('groupPinned: 组间顺序按各组首个成员在 pinnedIds 中的位置，不是字典序', () => {
  const out = groupPinned(
    ['z1', 'a1', 'z2', 'b1'],
    lookup({ z1: live('ws-z'), z2: live('ws-z'), a1: live('ws-a'), b1: live('ws-b') }),
    titles({ 'ws-z': 'Z 组', 'ws-a': 'A 组', 'ws-b': 'B 组' }),
  )
  assert.deepEqual(out.map((g) => g.workspaceId), ['ws-z', 'ws-a', 'ws-b'])
  assert.deepEqual(out.map((g) => g.entries.map((e) => e.id)), [['z1', 'z2'], ['a1'], ['b1']])
})

test('groupPinned: 未分组自成一档，不与真实工作区混同', () => {
  const out = groupPinned(
    ['u1', 'w1', 'u2'],
    lookup({ u1: live(UNGROUPED_KEY), u2: live(UNGROUPED_KEY), w1: live('ws-1') }),
    titles({ 'ws-1': '一号' }),
  )
  const ungrouped = out.find((g) => g.kind === 'ungrouped')
  assert.ok(ungrouped !== undefined, '未分组档存在')
  assert.equal(ungrouped.title, UNGROUPED_TITLE)
  assert.equal(ungrouped.workspaceId, UNGROUPED_KEY)
  assert.deepEqual(ungrouped.entries.map((e) => e.id), ['u1', 'u2'])
  assert.equal(out.find((g) => g.kind === 'workspace')?.title, '一号')
})

test('groupPinned: 工作区标题查不到时回落到 id，不隐藏整个分组', () => {
  const out = groupPinned(['a'], lookup({ a: live('ws-unknown') }), () => null)
  assert.equal(out.length, 1)
  assert.equal(out[0].title, 'ws-unknown')
  assert.equal(out[0].entries.length, 1)
})

test('groupPinned: 查不到归属的失效条目集中成一档，并恒定排在最后', () => {
  const out = groupPinned(
    ['dead', 'live1'],
    lookup({ live1: live('ws-1') }),
    titles({ 'ws-1': '一号' }),
  )
  assert.equal(out.length, 2)
  const last = out[out.length - 1]
  assert.equal(last.kind, 'unresolved')
  assert.equal(last.title, UNRESOLVED_TITLE)
  assert.deepEqual(last.entries.map((e) => e.id), ['dead'])
  assert.equal(last.entries[0].alive, false)
})

test('groupPinned: 归属查得到但会话已消失时，留在自己的工作区分组', () => {
  const out = groupPinned(
    ['gone', 'here'],
    lookup({ gone: { workspaceId: 'ws-1', title: '没了', alive: false }, here: live('ws-1') }),
    titles({ 'ws-1': '一号' }),
  )
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].entries.map((e) => [e.id, e.alive]), [['gone', false], ['here', true]])
})

test('groupPinned: 失效条目不被丢弃（数量守恒）', () => {
  const ids = ['a', 'dead1', 'b', 'dead2', 'dead3']
  const out = groupPinned(ids, lookup({ a: live('ws-1'), b: live('ws-1') }), titles({ 'ws-1': '一号' }))
  const total = out.reduce((sum, g) => sum + g.entries.length, 0)
  assert.equal(total, ids.length)
})

test('groupPinned: 显示名为空串时回落到 id', () => {
  const out = groupPinned(['s1'], lookup({ s1: { workspaceId: 'ws-1', title: '', alive: true } }), titles({ 'ws-1': '一号' }))
  assert.equal(out[0].entries[0].title, 's1')
})

test('sessionLabel: 12 字以内原样，超出截断加省略号', () => {
  assert.equal(sessionLabel('短标题'), '短标题')
  assert.equal(sessionLabel('正好十二个字的标题内容啊'), '正好十二个字的标题内容啊')
  assert.equal(sessionLabel('这是一个非常非常长的会话标题需要被截断'), '这是一个非常非常长的会话…')
  assert.equal(sessionLabel('  留白  '), '留白')
  assert.equal(sessionLabel(''), '')
})
