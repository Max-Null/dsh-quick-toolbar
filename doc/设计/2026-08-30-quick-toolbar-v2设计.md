# quick-toolbar v2 设计（open-settings/command 行为 · 半自动发现 · 扩展包 · ui-slots · 壳适配器拆分）

- 日期：2026-08-30
- 前置：v1 独立化设计方案（`doc/设计/2026-08-30-quick-toolbar-独立化设计方案.md`）§9 开放问题 + v1.7→v1.11 交互迭代（见 `doc/决策/2026-08-30-v1悬浮球交互与定位模型.md`）
- 现状锚点：v1.11（`src/adapters.ts` 4 条内置适配器；`src/engine.ts` 已实现 click/toggle-panel/dispatch-event，open-settings/command 警告+false；`src/client.ts` morph 壳 + invert 定位闭环；host `/quick-toolbar/api/adapters`；`adapters.prompt.md`）

## 0. v2 目标与排序

按「对用户价值 / 实现复杂度 / 对 LLM-驻场工作流的增益」排序：

| # | 方向 | 价值 | 复杂度 | 依赖 |
|---|---|---|---|---|
| A | 行为库补齐（open-settings / command） | 高（设置/命令类按钮占现网 1/3） | 中 | 调研 DSH 官方入口 |
| B | 未识别按钮半自动发现 | 高（驻场工作流闭环关键一步） | 中 | A 部分成果（功能探测） |
| C | 适配器扩展包下发 | 中（多机同步/生态分发） | 低-中 | schema 稳定 |
| D | ui-slots 深整合 | 中（官方渲染语义） | 中 | 调研 ui-slots API |
| E | shell 适配器拆分 | 中（解耦、可独立发版） | 低 | — |

## A. 行为库补齐：open-settings / command

### A1. open-settings

目标：适配「打开设置/配置页」类按钮。v1 只定义了 schema（`{ kind: 'open-settings', path?: string }`），执行器报未实现。

**调研点① 结论（2026-08-30 已查证 DSH master 源码）**：设置面板的打开状态由**应用 shell 的 React 组件私有持有**（`packages/client/ui-settings/src/client/contract/slots.ts`：…"The shell owns modal visibility and navigation"），**无公开 window 级钩子**（grep 全量无 `__settingsOpen` 类全局）；`ctx.remote.settings` 仅两个 RPC：`openSettingsDocument`（宿主打开 provider 文档）与 `openAgentPresetDirectory`，均非「打开面板」。公开语义入口 = `sidebar.settings` 槽的**触发按钮**（ui-settings-general 的 SettingsTrigger，按钮文案走 locale（设置/Settings），面板 = dialog，开=DOM 存在、关=移除）。

方案：**语义锚点点击链**（纯数据，无任意代码）：

1. aria/文案语义锚点：`[aria-label="设置"], [aria-label="Settings"]` + `:text-matches("设置|Settings")` 定位触发按钮（双 locale 探测，复用现有 lang 跟踪）→ click
2. 「再点关闭」探测（可选）：`[role="dialog"][aria-labelledby*="settings" i]` 存在 = 开着 → 点击触发按钮即关（**调研注**：dialog 关闭后 DOM 移除与否待 L2 验证；若关闭仅改样式，则改为样式判定)
3. 失败 → `console.warn` + false（防御语义与 v1 一致，不假装成功）

参数 `path?`：v1 schema 保留，语义=面板内目标 section 的锚（`openSection(id)` 属 shell 私有，跨包不可达）——**本阶段忽略 path 并 warn**（不承诺未达成的深链）。

### A2. command

目标：为「收藏常用命令」提供轻入口（**2026-08-30 用户定位确认**：非聚合核心——哲学是收编**按钮**；command 是场景有限的侧翼功能，类似"收藏特定 command 到悬浮球"；保留但不作为宣传重点）。

**实现（2026-08-30 实证决策）**：**composer 草稿注入**——写入 `/name` 到 composer（InputEvent + focus），**不自动提交**（用户确认后发送，避免误发；与 V2-2「建议制」一致）。
- **execute 主通道不可达（已实证）**：`ctx.remote.commands.execute(sessionId, line)` 需完整 client ctx（cordis 服务面），而 **V0 协议 apply 收到的 ctx 仅 `{ fiber }`**（2026-08-30 运行时日志实证；无 remote）——主通道在 V0 协议下不可达；迁移 clientBundle 协议（M3 壳拆分范畴）前维持草稿注入。
- 语义：行为 = 引擎能力（注入草稿），适配器 = 数据（`{ kind: 'command', name }`）——不变。历史记录见 M1-rec（偏差 1 关闭于本决策）。

**调研点② 结论（2026-08-30 已查证 DSH master 源码）**：`dsh-commands` 是**官方包** `@deepseek-ai/dsh-commands`（`packages/interaction/commands`），命令经 `packages/client/ui-commands`（`CommandUiRuntime`）暴露 client 面：

- **host 执行（推荐）**：`ctx.remote.commands.execute(sessionId, line, images?)`（line = `/name args`；命令目录 `ctx.remote.commands.list(sessionId)`）。execute 直接 admit host 命令、durable 记录 `command/run`/`command/done` 生命周期（渲染为持久 flow node，无需额外 UI）；**命令按会话寻址**（sessionId 必填）
- client 命令贡献：`ctx.commandUi.register(contribution)`（popupSelect 型）/ `decorate(decoration)` —— 属商务包集成面，quick-toolbar 不消费（只 execute）
- **依赖面**：`remote.commands` 是注入服务（ui-commands 的 `inject = ['inputTriggers','sessions','remote','remote.commands']`）；quick-toolbar 的 client 非静态装配（ModuleLoader 协议），须从 apply ctx 探测 `remote` 面——**实现期验证 ctx 探测路径**（sessionId 取当前激活会话：`sessions.scopeOf`/activeSession）

方案：**三级通道**：

1. `ctx.remote.commands.execute(sessionId, '/name')`（master；fire-and-forget，durable 记录）
2. 输入模拟（rc.2/无 remote.commands 兜底）：定位 composer 输入（DSH 语义锚点拟 selected）→ 写入 `/name` + Enter（原生事件链；适配器只用内置行为，不加宽不可信输入）
3. 失败 → 警告 + false

**边界（重要）**：输入模拟仅在「引擎内置行为」里使用（引擎代码=可信），LLM 用户的适配器仍只写数据；此边界写入 `adapters.prompt.md` 明示——**行为=引擎能力，适配器=数据，不因 command 行为开放而放宽 v1 的不可信输入原则**。

### A3. 验收

- L1：两行为单测（含失败路径：钩子缺失/选择器缺失 → false + warn）
- L2：web/思灵 实测：设置类按钮一键打开；命令类按钮触发对应命令

## B. 按钮注册 = 驻场 LLM 自主探查（2026-08-30 理念修正，替代原"内置扫描器"路线）

**理念（用户定稿）**：插件是**载体平台**（提供注册协议 = schema + 渲染执行器）；
**适配场景交给当场的 LLM**——它自建探查环境（浏览器/代码能力）并注册按钮（= 子插件，
DSH「一切皆插件」落地）。**不存在"完美脚本"能预适配所有场景**——这正是驻场 LLM 存在的
原因；任何把"发现/适配"固化进插件代码的尝试（如原 scout 扫描器）都是传统插件思维
（要预写兼容代码），应避免。家族旁证：dsh-better-sidebar 同构——官方不内置、由生态通过
同一套 API 注册（其注册者是插件，我们更抽象：注册者 = LLM 数据注册）。

**实现重心**：
- 载体：注册协议（`adapters.prompt.md` 图纸 + schema + host 配置读取/校验 + 渲染执行）
- **不在插件内做任何"扫描/发现"**（无 scout/候选枚举/提示词生成——v0.4.0 已回撤）
- `adapters.prompt.md` 职责写明："自主探查（用你的浏览器/code 能力验证选择器）→ 注册"

**验收**：任意环境里 LLM 按图纸自主探查并注册按钮 → 写入 → 生效。插件零发现逻辑。

## C. 适配器扩展包（adapter pack）

目标：适配成果可沉淀/分发（多机同步；社区共享；插件中心更新流）。

方案：

- **打包格式**：`{ "pack": "quick-toolbar-adapters", "version": "1.0.0", "target": "dsh-quick-toolbar >= 1.0", "adapters": [...] }`（zod 校验，复用 `adaptersFileSchema` 的 `adapters` 部分 + pack 元数据）
- **载体**：npm 包（`@max-null/qt-adapters-*` 命名空间约定，README 模板）→ 插件中心安装流作为分发点（**调研点④**：插件中心第三方包安装/更新协议——chat-rail 等先例的 vendor/registry 路径）
- **合流**：host 侧读取时「内置 < 用户配置 < 扩展包」优先级合并（同 id 覆盖，警告日志）；启停随包
- **v1 不动**：单文件 `~/.dsh/quick-toolbar-adapters.json` 仍是首选形态（个人快速路径）

验收：一个测试扩展包三处环境导入一致；共享包在插件中心可安装。

## D. ui-slots 深整合

目标：优先渲染在官方 slot（而非纯 DOM 注入注入），语义更稳、与主题/布局系统一致。

方案：

- 探测：DSH `ui-slots` 有无官方「工具栏/命令入口」slot（**调研点⑤**：ui-slots 公开 slot 名与挂载 API——dsh 源码 + dsh-ui-slots 文档）
- 有 → 载体注册进官方 slot（行为引擎不变，仅呈现载体变化）；无公开 slot → 维持现 DOM 载体（悬浮球/标题栏），并记录「已查证：官方无按钮注册表」（v1 §1 结论重申）
- UI 双载体逻辑不变（`ssid-tb-*` 承载在自定义 DOM），仅容器换 slot

边界：不因整合而破坏现有 morph/定位闭环（容器换、交互模型不变）；兜底保留 DOM 注入。

## E. shell 适配器拆分

目标：`src/client.ts` 目前同时承担 web 悬浮球 + 壳标题栏桥 + SSiD 隐藏逻辑——拆「载体适配器」层，壳载体可独立演进、独立发版。

方案：

- 结构：`src/carriers/web-float.ts`（悬浮球 = 现在 client.ts 的主体）+ `src/carriers/shell-titlebar.ts`（SSiD 壳：`__SSID_SHELL__` 分支 + `ssid:titlebar` 事件桥）
- 共享：`src/carriers/shared.ts`（createToolbar 通用件：面板/适配器绑定/行为执行）
- 壳库侧：SSiD 壳库的标题栏按钮 → `dispatch-event`（维持现状通道），壳库不再 import quick-toolbar 内部；桥接细节（IPC `ssid:title:action`）留在壳库 main.mjs
- 兼容：`__SSID_SHELL__` 探测不变；web 无壳行为不变

验收：L1 全绿；思灵与 web 行为与 v1.11 完全一致（回归对照第 6 条）。

## F. 通用约束（全方向适用）

1. **v1 不可信输入原则不变**：适配器=数据（枚举+选择器）；一切新能力=引擎行为（代码，可信）。扩展包/LLM 产物照旧 zod 拦
2. **引擎可测性**：新行为全部走窄接口（`ActEnv` 注入面扩展：`findInput`/`runCommand` 等），L1 单测覆盖；DOM 绑定只在执行器
3. **防御语义**：探测失败/目标缺失/disabled → false + warn，绝不误伤、绝不假装成功
4. **样式纪律**：新 UI 用 DSH token + `data-slot`/aria 锚点（§7 规矩）；扩展包 UI 复用现有 badge/settings 组件
5. **文档同步**：每方向落地后同步 `README.md` + `adapters.prompt.md`（新增行为即新增提示词能力说明）

## G. 调研点状态（2026-08-30 已查证）

1. ✅ **settings 打开钩子**：无公开 window 钩子；面板 open 状态 shell 私有（ui-settings slotted dialog）；`remote.settings` 仅文档/预设目录两个 RPC → A1 改「语义锚点点击链」
2. ✅ **dsh-commands 触发 API**：官方包,`ctx.remote.commands.execute(sessionId, line)`（按会话寻址 + durable 生命周期）+ composer 输入模拟兜底 → A2 三级通道
3. ⬜ DSH 官方挂载点清单与 ui-slots slot 名（支撑 B/D）
4. ⬜ 插件中心第三方数据包安装/更新协议（支撑 C）
5. ⬜ ui-slots 公开挂载 API（支撑 D；B 可复用其结果）

## H. 里程碑

- M1：A（行为补齐）→ README/提示词同步
- M2：B（半自动发现）→ 驻场闭环演示
- M3：E（壳拆分）→ 独立发版准备
- M4：C/D（生态与官方整合，视调研结果取舍）

## M1-rec. M1 实际交付记录与偏航（2026-08-30 收尾）

M1 落地期间被真实 bug/需求驱动的**设计外新增**（均已拍板，记录于决策 V2-7/V2-8）：

1. **标题栏「悬浮球」开关**（用户体验后拍板）：SSiD 壳标题栏按钮（圆圈+圆点图标）→ `ssid:titlebar detail='quick-toolbar-toggle'` → 切换壳内浮球显示（默认隐藏，持久化）。`__SSID_SHELL__` 守卫从「无条件隐藏」改「默认隐藏+开关」——**本设计 D 方向（壳适配拆分）的雏形**，M3 拆分时应纳入此契约。
2. **状态 host 化**（用户规约 §7.10）：pos/collapsed/pinned/shellVisible 持久化从页面 localStorage 迁到 `~/.dsh/quick-toolbar-state.json`（host GET/POST `/quick-toolbar/api/state` 原子写）——**动态端口下 localStorage 跨重启必丢**（两次实踩）。
3. **ResizeObserver 半宽自愈**：morph 宽度测量早于文本/i18n/字体就位 → 壳宽定格过小（用户实测「钉住只有一半」）——展开态 RO 自动同步壳宽高。
4. **设置「再点关闭」**：源码查证 `SettingsRoot` trigger 只 `setOpen(true)`（原生不 toggle）——行为库 mask 探测 + close 按钮/mask 兜底（原设计 A1 的「再点关闭探测」实现为 mask 语义）。

**已知债（后续里程碑）**：
- command 主通道（execute）未接（见 A2 实现状态）
- 老 4 按钮仍走 legacy `toolbarAction`，内置集“逐步切换引擎”未完成（半接线）
- 内置「设置」按钮文案硬编码中文（`adapter.label`），未走 trackLocale —— 英文 locale 显示中文（i18n 债）
- M1 交付打乱原 §0 排序（A 完成后插入了壳集成/持久化），本记录用于对齐设计文档与现实
