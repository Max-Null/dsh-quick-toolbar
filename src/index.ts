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
import { readFileSync } from 'node:fs'
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
    req: { method?: string },
    res: { writeHead: (n: number, h: Record<string, string>) => void; end: (s: string) => void },
  ): Promise<void> => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
      return
    }
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
  },
}

function apply(ctx: { inject: (deps: string[], fn: (c: never) => void) => void }): void {
  ctx.inject(['webServer'] as never, ((wsCtx: { webServer: { register: (d: unknown) => void } }) => {
    wsCtx.webServer.register(adaptersRouteDefinition)
  }) as never)
}

export { apply }
