/**
 * 旧收藏文件解析的单测：两种形态的提取、坏条目丢弃、去重、排序、无上限截断。
 *
 * 这些规则只服务一次性迁移，所以断言集中在「历史数据能被完整、正确地读出来」，
 * 不涉及任何新增 / 删除 / 限额行为（那些已随功能退役）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UNGROUPED_KEY,
  extractFavorites,
  normalizeFavorites,
  type FavoriteSession,
} from '../src/legacy-favorites.ts'

/** 造一条旧收藏。 */
const fav = (id: string, at: number, over: Partial<FavoriteSession> = {}): FavoriteSession =>
  ({ id, title: id, workspaceId: 'ws-1', cwd: '', at, ...over })

test('extractFavorites: 裸数组与 { favorites } 两种形态都收', () => {
  const list = [fav('a', 1)]
  assert.deepEqual(extractFavorites(list), list)
  assert.deepEqual(extractFavorites({ favorites: list }), list)
})

test('extractFavorites: 对象取 .favorites，其余形态原样透传', () => {
  assert.equal(extractFavorites({ other: 1 }), undefined)
  // 非对象原样返回——兜底交给 normalizeFavorites 的 Array.isArray 判定
  assert.equal(extractFavorites(null), null)
  assert.equal(extractFavorites(42), 42)
  assert.deepEqual(normalizeFavorites(extractFavorites(null)), [])
  assert.deepEqual(normalizeFavorites(extractFavorites(42)), [])
})

test('normalizeFavorites: 非数组 → 空列表', () => {
  assert.deepEqual(normalizeFavorites(null), [])
  assert.deepEqual(normalizeFavorites({ a: 1 }), [])
  assert.deepEqual(normalizeFavorites('nope'), [])
})

test('normalizeFavorites: 坏条目逐条丢弃，不拖垮整份', () => {
  const out = normalizeFavorites([
    null,
    'nope',
    { title: '没有 id' },
    { id: '   ' },
    { id: 'ok' },
  ])
  assert.deepEqual(out.map((f) => f.id), ['ok'])
})

test('normalizeFavorites: 同 id 去重，保留靠前的一条', () => {
  const out = normalizeFavorites([
    fav('dup', 10, { title: '先出现的' }),
    fav('dup', 20, { title: '后出现的' }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].title, '先出现的')
})

test('normalizeFavorites: 按 at 倒序（迁移顺序 = 最近收藏在前）', () => {
  const out = normalizeFavorites([fav('old', 100), fav('new', 300), fav('mid', 200)])
  assert.deepEqual(out.map((f) => f.id), ['new', 'mid', 'old'])
})

test('normalizeFavorites: 字段缺失或越界时回落到安全值', () => {
  const out = normalizeFavorites([{ id: 's1' }])
  assert.deepEqual(out[0], { id: 's1', title: 's1', workspaceId: UNGROUPED_KEY, cwd: '', at: 0 })
})

test('normalizeFavorites: 不按上限截断（历史文件可能超过当年的每工作区 8 个）', () => {
  const many = Array.from({ length: 30 }, (_, i) => fav('s' + String(i), i))
  assert.equal(normalizeFavorites(many).length, 30)
})
