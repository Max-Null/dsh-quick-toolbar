/**
 * 收藏会话纯逻辑单测：归一化防御、按工作区过滤、上限准入、去重、标签截断。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAVORITE_LIMIT,
  UNGROUPED_KEY,
  addFavorite,
  extractFavorites,
  favoriteLabel,
  favoritesForWorkspace,
  normalizeFavorites,
  removeFavorite,
  type FavoriteSession,
} from '../src/favorites.ts'

/** 造一条收藏；第二参数是**工作区归属**（不是目录）。 */
const fav = (id: string, workspaceId: string, at: number, title = id): FavoriteSession =>
  ({ id, title, workspaceId, cwd: '', at })

test('normalizeFavorites: 非数组 → 空列表', () => {
  assert.deepEqual(normalizeFavorites(null), [])
  assert.deepEqual(normalizeFavorites({ a: 1 }), [])
  assert.deepEqual(normalizeFavorites('nope'), [])
})

test('normalizeFavorites: 坏条目逐条丢弃，不拖垮整份', () => {
  const out = normalizeFavorites([
    null,
    42,
    { id: '' },
    { id: '   ' },
    { title: '只有标题没有 id' },
    { id: 'good-1', title: '好会话', workspaceId: 'ws-1', at: 100 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'good-1')
})

test('normalizeFavorites: 字段级兜底（title 缺→id、workspaceId/cwd 非串→空串、at 非数→0）', () => {
  const out = normalizeFavorites([{ id: 's1' }, { id: 's2', title: '  ', workspaceId: 7, cwd: 7, at: 'x' }])
  assert.deepEqual(out.map((f) => [f.id, f.title, f.workspaceId, f.cwd, f.at]), [
    ['s1', 's1', '', '', 0],
    ['s2', 's2', '', '', 0],
  ])
})

test('normalizeFavorites: 同 id 去重（保留靠前一条）', () => {
  const out = normalizeFavorites([
    { id: 'dup', title: '先来的', workspaceId: '', at: 2 },
    { id: 'dup', title: '后来的', workspaceId: '', at: 1 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].title, '先来的')
})

test('normalizeFavorites: 按 at 倒序（新收藏在前）', () => {
  const out = normalizeFavorites([fav('a', '', 10), fav('b', '', 30), fav('c', '', 20)])
  assert.deepEqual(out.map((f) => f.id), ['b', 'c', 'a'])
})

test('normalizeFavorites: 不按上限截断（已有数据不因规则变化被静默删除）', () => {
  const many = Array.from({ length: FAVORITE_LIMIT + 5 }, (_, i) => fav('s' + String(i), 'ws-alpha', i))
  assert.equal(normalizeFavorites(many).length, FAVORITE_LIMIT + 5)
})

test('favoritesForWorkspace: 只取同工作区的收藏；undefined 与空串等价（都表示未分组）', () => {
  const list = [fav('a', 'ws-alpha', 3), fav('b', 'ws-beta', 2), fav('c', UNGROUPED_KEY, 1)]
  assert.deepEqual(favoritesForWorkspace(list, 'ws-alpha').map((f) => f.id), ['a'])
  assert.deepEqual(favoritesForWorkspace(list, 'ws-beta').map((f) => f.id), ['b'])
  assert.deepEqual(favoritesForWorkspace(list, UNGROUPED_KEY).map((f) => f.id), ['c'])
  assert.deepEqual(favoritesForWorkspace(list, undefined).map((f) => f.id), ['c'])
})

test('favoritesForWorkspace: 未分组自成一档，不与其他工作区混同（跨工作区串台的回归）', () => {
  // 2026-09-14 用户实测反馈：早先用会话 cwd 当分组键时，cwd 缺失的收藏全部落进同一个
  // 「空」组，表现为「当前工作区里显示了别的会话」。改用工作区归属后，未分组只与未分组同组。
  const list = [
    fav('in-ws', 'ws-alpha', 3),
    fav('ungrouped-1', UNGROUPED_KEY, 2),
    fav('ungrouped-2', UNGROUPED_KEY, 1),
  ]
  assert.deepEqual(favoritesForWorkspace(list, 'ws-alpha').map((f) => f.id), ['in-ws'])
  assert.deepEqual(favoritesForWorkspace(list, UNGROUPED_KEY).map((f) => f.id), ['ungrouped-1', 'ungrouped-2'])
  assert.deepEqual(favoritesForWorkspace(list, 'ws-beta'), [])
})

test('addFavorite: 正常添加并保持倒序', () => {
  const r = addFavorite([fav('old', 'H:\\ws', 1)], fav('new', 'H:\\ws', 9))
  assert.equal(r.ok, true)
  assert.deepEqual(r.list.map((f) => f.id), ['new', 'old'])
})

test('addFavorite: 同 id → duplicate，列表不变', () => {
  const before = [fav('a', 'H:\\ws', 1)]
  const r = addFavorite(before, fav('a', 'H:\\ws', 2, '换个名字'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'duplicate')
  assert.deepEqual(r.list.map((f) => f.id), ['a'])
  assert.equal(r.list[0].title, 'a')
})

test('addFavorite: 该工作区满 8 个 → limit', () => {
  const full = Array.from({ length: FAVORITE_LIMIT }, (_, i) => fav('s' + String(i), 'H:\\ws', i))
  const r = addFavorite(full, fav('extra', 'H:\\ws', 999))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'limit')
  assert.equal(r.list.length, FAVORITE_LIMIT)
})

test('addFavorite: 上限按工作区独立计（A 满不影响 B）', () => {
  const fullA = Array.from({ length: FAVORITE_LIMIT }, (_, i) => fav('a' + String(i), 'ws-A', i))
  const r = addFavorite(fullA, fav('b1', 'ws-B', 999))
  assert.equal(r.ok, true)
  assert.equal(favoritesForWorkspace(r.list, 'ws-B').length, 1)
  assert.equal(favoritesForWorkspace(r.list, 'ws-A').length, FAVORITE_LIMIT)
})

test('addFavorite/removeFavorite: 返回新数组，不改原数组', () => {
  const before = [fav('a', 'H:\\ws', 1)]
  const added = addFavorite(before, fav('b', 'H:\\ws', 2))
  const removed = removeFavorite(before, 'a')
  assert.deepEqual(before.map((f) => f.id), ['a'])
  assert.deepEqual(added.list.map((f) => f.id), ['b', 'a'])
  assert.deepEqual(removed, [])
})

test('removeFavorite: 移除不存在 id → 原样（仍是新数组）', () => {
  const before = [fav('a', 'H:\\ws', 1)]
  const after = removeFavorite(before, 'nope')
  assert.deepEqual(after.map((f) => f.id), ['a'])
  assert.notEqual(after, before)
})

test('favoriteLabel: 12 字以内原样，超出截断加省略号', () => {
  assert.equal(favoriteLabel('短标题'), '短标题')
  assert.equal(favoriteLabel('正好十二个字的标题内容啊'), '正好十二个字的标题内容啊')
  assert.equal(favoriteLabel('这是一个非常非常长的会话标题需要被截断'), '这是一个非常非常长的会话…')
  assert.equal(favoriteLabel('  留白  '), '留白')
})

test('往返一致：normalize(add(x)) 保留该条（写入→读出闭环）', () => {
  const r = addFavorite([], fav('s1', 'ws-alpha', 1234, '我的会话'))
  const round = normalizeFavorites(JSON.parse(JSON.stringify(r.list)))
  assert.deepEqual(round, [{ id: 's1', title: '我的会话', workspaceId: 'ws-alpha', cwd: '', at: 1234 }])
})

test('extractFavorites: 裸数组原样返回、{favorites} 取内层、其余形状交回原值', () => {
  const arr = [fav('a', 'H:\\ws', 1)]
  assert.equal(extractFavorites(arr), arr)
  assert.deepEqual(extractFavorites({ favorites: arr }), arr)
  assert.equal(extractFavorites(null), null)
  assert.equal(extractFavorites({}), undefined)
  assert.equal(extractFavorites('nope'), 'nope')
})

test('往返一致：落盘的 {favorites:[...]} 经同一提取步骤读回（读写对称）', () => {
  // 校准正例：2026-09-14 实测「POST 成功、GET 恒空」——文件里是 {favorites:[...]}，
  // GET 没做提取就直接归一化，而 normalizeFavorites 只认数组 → 读回空列表。
  const stored = { favorites: [fav('s1', 'H:\\ws', 7, '会话一')] }
  assert.deepEqual(normalizeFavorites(extractFavorites(stored)).map((f) => f.id), ['s1'])
  // 反例即 bug 形态：不做提取必然读空（证明这条测试确实在校验提取步骤）
  assert.deepEqual(normalizeFavorites(stored), [])
})
