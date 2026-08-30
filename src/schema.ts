/**
 * @max-null/dsh-quick-toolbar — 用户适配器配置 schema（zod）
 *
 * 用户配置（~/.dsh/quick-toolbar-adapters.json）与内置适配器同构；
 * zod 校验是「LLM 生成输出」的第一道防线：非法条目丢弃并报 detail
 * （不吞全表——其余合法条目继续生效）。
 */
import { z } from 'zod'

export const adapterSchema = z.object({
  id: z.string().min(1),
  button: z.string().min(1),
  icon: z.discriminatedUnion('source', [
    z.object({ source: z.literal('from-button') }),
    z.object({ source: z.literal('custom'), value: z.string().min(1) }),
  ]),
  label: z.string().optional(),
  act: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('click') }),
    z.object({ kind: z.literal('toggle-panel'), close: z.string().optional() }),
    z.object({ kind: z.literal('dispatch-event'), event: z.string(), detail: z.string().optional() }),
    z.object({ kind: z.literal('open-settings'), path: z.string().optional() }),
    z.object({ kind: z.literal('command'), name: z.string() }),
    z.object({ kind: z.literal('scan') }),
  ]),
  hide: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

export const adaptersFileSchema = z.object({
  adapters: z.array(adapterSchema),
})

export type UserAdaptersFile = z.infer<typeof adaptersFileSchema>

/** 解析用户配置文件：返回 { ok, value } 或 { ok: false, issues } */
export function parseUserAdapters(raw: string): { ok: true; value: UserAdaptersFile } | { ok: false; issues: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, issues: ['invalid-json'] }
  }
  const result = adaptersFileSchema.safeParse(parsed)
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  }
  return { ok: true, value: result.data }
}
