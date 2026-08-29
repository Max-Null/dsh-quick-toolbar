/**
 * tsdown build for @max-null/dsh-quick-toolbar:
 * - lib/index.mjs  (host half: ESM node, no-op apply)
 * - lib/client.js  (browser client bundle: window.__ModuleLoader__ CJS closure,
 *                   the standard DSH client-registration protocol)
 *
 * The client is vanilla (no React/官方 client 注入)——独立插件保持轻量；
 * 行为库/适配器数据化（v1.2）后，客户端仅内联数据与逻辑，平台模块表零耦合。
 */
import type { UserConfig } from 'tsdown'

export default {
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm'],
  outDir: 'lib',
  clean: true,
  platform: 'browser',
} satisfies UserConfig
