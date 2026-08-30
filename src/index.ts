/**
 * @max-null/dsh-quick-toolbar — host half.
 *
 * v1.5：暴露用户适配器配置读取 API（与 chat-rail 收藏 host 化同模式）：
 *   GET /quick-toolbar/api/adapters → 读 ~/.dsh/quick-toolbar-adapters.json
 *   + zod 校验 → { ok: true, value } 或 { ok: false, error, detail }
 * 客户端据此合并「内置适配器集 + 用户适配器」（用户配置 = 驻场 LLM 产出）。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { parseUserAdapters } from './schema.ts'

export const name = '@max-null/dsh-quick-toolbar'

/** 配置文件路径（用户级，profile 无关） */
const ADAPTERS_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'quick-toolbar-adapters.json')
const ROUTE_PATH = '/quick-toolbar/api/adapters'

function sendJson(
  res: { writeHead: (n: number, h: Record<string, string>) => void; end: (s: string) => void },
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const adaptersRouteDefinition = {
  kind: 'exact',
  path: ROUTE_PATH,
  handler: async (
    req: { method?: string; on?: (e: string, cb: (chunk: string) => void) => void },
    res: { writeHead: (n: number, h: Record<string, string>) => void; end: (s: string) => void },
  ): Promise<void> => {
    if (req.method === 'GET') {
      try {
        const raw = readFileSync(ADAPTERS_PATH, 'utf8')
        const parsed = parseUserAdapters(raw)
        if (!parsed.ok) {
          sendJson(res, 200, { ok: false, error: 'invalid-schema', detail: parsed.issues })
          return
        }
        sendJson(res, 200, { ok: true, value: parsed.value })
      } catch {
        // 配置文件不存在 = 无用户适配器（合法；客户端只用内置集）
        sendJson(res, 200, { ok: true, value: { adapters: [] as unknown[] } })
      }
      return
    }
    if (req.method === 'POST') {
      // 全量替换写回（v0.6.0 右键删除走此通道）：zod 校验 → 原子写（原样保留
      // 用户/LLM 手写格式区别于 parse 后 stringify 的紧凑化）。
      let raw = ''
      req.on?.('data', (chunk: string) => { raw += chunk })
      await new Promise<void>((resolve) => req.on?.('end', () => { resolve() }))
      try {
        const parsed = parseUserAdapters(raw)
        if (!parsed.ok) {
          sendJson(res, 200, { ok: false, error: 'invalid-schema', detail: parsed.issues })
          return
        }
        const tmp = ADAPTERS_PATH + '.tmp'
        writeFileSync(tmp, raw, 'utf8')
        renameSync(tmp, ADAPTERS_PATH)
        sendJson(res, 200, { ok: true, value: parsed.value })
      } catch {
        sendJson(res, 200, { ok: false, error: 'write-failed' })
      }
      return
    }
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
  },
}

// ── 状态 host 化（2026-08-30 用户拍板规则 §7.10：动态端口下页面 localStorage
//    跨重启必丢——持久状态存 ~/.dsh/quick-toolbar-state.json，host 半读写桥） ──
const STATE_PATH = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'quick-toolbar-state.json')
const STATE_ROUTE = '/quick-toolbar/api/state'

/** 工具栏持久状态（pos = 球位；collapsed/pinned/shellVisible 布尔）。 */
export interface QtState {
  pos: { x: number; y: number } | null
  collapsed: boolean
  pinned: boolean
  shellVisible: boolean
}

/** 默认状态（文件缺失/字段缺失时取默认，宽松向下兼容）。 */
export function defaultState(): QtState {
  return { pos: null, collapsed: true, pinned: false, shellVisible: false }
}

/** 归一化（防御非法文件：字段级回退默认，不因一条坏字段全丢）。 */
export function normalizeState(raw: unknown): QtState {
  const d = defaultState()
  const s = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pos = s.pos
  if (pos !== null && pos !== undefined && typeof pos === 'object' && pos !== null) {
    const p = pos as { x?: unknown; y?: unknown }
    if (typeof p.x === 'number' && typeof p.y === 'number') d.pos = { x: p.x, y: p.y }
  }
  if (typeof s.collapsed === 'boolean') d.collapsed = s.collapsed
  if (typeof s.pinned === 'boolean') d.pinned = s.pinned
  if (typeof s.shellVisible === 'boolean') d.shellVisible = s.shellVisible
  return d
}

/** 读状态文件（缺失/非法 → 默认；不抛）。 */
export function readStateFile(): QtState {
  try {
    return normalizeState(JSON.parse(readFileSync(STATE_PATH, 'utf8')))
  } catch {
    return defaultState()
  }
}

/** 原子写状态文件（tmp + rename，防中断半写）。 */
export function writeStateFile(state: QtState): void {
  const tmp = STATE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, STATE_PATH)
}

const stateRouteDefinition = {
  kind: 'exact',
  path: STATE_ROUTE,
  handler: async (
    req: { method?: string; on: (e: string, cb: (chunk: string) => void) => void },
    res: { writeHead: (n: number, h: Record<string, string>) => void; end: (s: string) => void },
  ): Promise<void> => {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, state: readStateFile() })
      return
    }
    if (req.method === 'POST') {
      let raw = ''
      req.on('data', (chunk: string) => { raw += chunk })
      await new Promise<void>((resolve) => req.on('end', () => { resolve() }))
      try {
        const body = JSON.parse(raw) as unknown
        writeStateFile(normalizeState(body))
        sendJson(res, 200, { ok: true })
      } catch {
        sendJson(res, 200, { ok: false, error: 'invalid-state' })
      }
      return
    }
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
  },
}

function apply(ctx: { inject: (deps: string[], fn: (c: never) => void) => void }): void {
  ctx.inject(['webServer'] as never, ((wsCtx: { webServer: { register: (d: unknown) => void } }) => {
    wsCtx.webServer.register(adaptersRouteDefinition)
    wsCtx.webServer.register(stateRouteDefinition)
  }) as never)
}

export { apply }
