/**
 * tsdown build for @max-null/dsh-quick-toolbar:
 * - lib/index.js   (host half: ESM node — webServer 路由 + 状态/收藏文件读写)
 * - lib/client.js  (browser client bundle: 自包含 IIFE + exports.apply，
 *                   the standard DSH client-registration protocol)
 *
 * **两个入口必须分别构建**（数组配置 = 两次独立 build）。放在同一个 entry
 * 数组里时，两边共享的模块（src/favorites.ts）会被提成 `favorites-<hash>.js`
 * 共享 chunk，client.js 顶部就多出一条 `import ... from './favorites-<hash>.js'`
 * —— 而 DSH 的 client 模块加载器按**单文件**取 `/plugins/<pkg>/client.js`
 * （见合并 bundle 的 `??pkg/client.js,...` 协议），不会去拉那个相对 chunk，
 * 于是整个 client 半静默失效（2026-09-14 实测：工具栏连同功能按钮一起消失，
 * 页面无报错）。分开构建后每个产物各自内联共享模块。
 *
 * clean 只在第一次构建里开：第二次构建 clean 会把刚写出的 index.js 删掉。
 */
import type { UserConfig } from 'tsdown'

export default [
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'lib',
    clean: true,
    platform: 'node',
    // platform: node + ESM 默认输出 `.mjs`，而 package.json 的 main/exports 指向
    // `lib/index.js`（已发布的 0.8.7 也是这个名字）——钉死扩展名，别让产物名漂移。
    outExtensions: () => ({ js: '.js' }),
  },
  {
    entry: ['src/client.ts'],
    format: ['esm'],
    outDir: 'lib',
    clean: false,
    platform: 'browser',
  },
] satisfies UserConfig[]
