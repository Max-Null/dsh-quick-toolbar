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

方案：**多通道探测链（provider 链）**，引擎按序尝试、命中即用（纯数据表达，无任意代码）：

1. `window` 钩子探测表（配置化）：`__dshSettingsOpen` / `__settingsOpen` 等（**调研点①**：DSH 官方 settings 打开钩子的准确清单——从 dsh 源码 `settings` 插件/`ui-slots` 处查证；探测表放 `src/channels.ts` 常量，L1 可测）
2. DOM 语义锚点：`[aria-label*="settings" i], [data-slot*="settings"]` 等（DSH token/aria 风格）→ 点击
3. 失败 → `console.warn` + false（防御语义与 v1 一致，不假装成功）

参数 `path?`：仅作 provider 1 的可选子页定位（钩子收 path 则传；否则忽略并 warn）。

### A2. command

目标：适配「触发 dsh-commands 文本命令」类按钮。v1 定义 `{ kind: 'command', name: string }`。

方案：**命令注入通道（3 级）**：

1. 插件全局 API：dsh-commands 若暴露 `window.__commandsRun(name)` 之类（**调研点②**：dsh-commands 现网 API；无 API 则本项目为 dsh-commands 提 patch/PR——三方插件配合路径）
2. 输入模拟：定位命令输入框（选择器匹配表，配置化）→ 聚焦 + 值注入 + Enter（`InputEvent` 走原生事件，尊重框架；无 headless 风险——纯 DOM）
3. 失败 → 警告 + false

**边界（重要）**：输入模拟仅在「引擎内置行为」里使用（引擎代码=可信），LLM 用户的适配器仍只写数据；此边界写入 `adapters.prompt.md` 明示——**行为=引擎能力，适配器=数据，不因 command 行为开放而放宽 v1 的不可信输入原则**。

### A3. 验收

- L1：两行为单测（含失败路径：钩子缺失/选择器缺失 → false + warn）
- L2：web/思灵 实测：设置类按钮一键打开；命令类按钮触发对应命令

## B. 「未识别按钮」半自动发现

目标：新环境里 LLM 不知有哪些按钮 → 现流程要用户截图+描述。v2 加**探测器**：扫描已知挂载点，产出候选列表 + 生成适配提示词（半自动）。

方案（三阶段）：

1. **扫描（collector）**：`src/scout.ts` —— 按「挂载点清单」（配置化域名/aria/slot 特征：设置区、会话头、工具栏、底栏等；**调研点③**：DSH 官方挂载点/`ui-slots` slot 名清单）扫出 + 去重可点击元素（`button, [role=button], [data-slot]` 等，含可见性过滤）
2. **匹配（matcher）**：与既有适配器（内置 + 用户配置）的 `button` 选择器比对 → 剩余为「未识别候选」（内建去重：同插件多个候选合并成组）
3. **产出**：候选列表 UI（设置页/工具栏 badge）→ 「生成提示词」按钮 → 组合 `adapters.prompt.md` + 候选 DOM 摘要（选择器/文案/树）→ 用户复制喂 LLM → 回来粘贴 JSON 写入 → 重载生效

**闭环价值**：从头到尾不用截图/手写 DOM 快照——把"用户调研环境"这步自动化。

边界：候选仅供建议，绝不自动启用（LLM 产物/自动触发=不可信输入，守住 v1 原则）；扫描频率=设置页按钮手动触发 + 工具栏 badge 懒触发（不常驻轮询）。

验收：L2 环境点「扫描」→ 候选里出现当前插件未知按钮 → 生成提示词可粘贴给 LLM 产出合法 JSON。

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

## G. 调研点汇总（落地前查证，不凭记忆）

1. DSH 官方 settings 打开钩子（`window.__*Settings*`？）
2. dsh-commands 的命令触发 API（全局钩子/无 API 需 patch）
3. DSH 官方挂载点清单（settings 区/会话头/工具栏……）与 ui-slots slot 名
4. 插件中心第三方适配器包安装/更新协议（vendor/registry）
5. ui-slots 公开 slot 挂载 API

## H. 里程碑

- M1：A（行为补齐）→ README/提示词同步
- M2：B（半自动发现）→ 驻场闭环演示
- M3：E（壳拆分）→ 独立发版准备
- M4：C/D（生态与官方整合，视调研结果取舍）
