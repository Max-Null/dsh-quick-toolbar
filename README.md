# @max-null/dsh-quick-toolbar — 插件按钮聚合器

把三方插件散乱的按钮（插件中心/侧栏/底栏/会话管理…）聚合到**统一入口**：
SSiD 壳 → 标题栏按钮组；DSH web → **iOS 小白点式悬浮球**（拖拽/吸附边缘/半透明）。
适配器驱动：内置适配集开箱即识；**用户环境下 LLM 按模板生成适配**（驻场工程师模式）——不要求三方插件配合。

## 截图

| SSiD 标题栏（壳） | web 悬浮球 | 聚合面板 |
|---|---|---|
| 待补（L2 环境实测截图） | 待补（L2 环境实测截图） | 待补（L2 环境实测截图） |

## 安装

```sh
# 走 DSH 插件安装（或 SSiD 预制 vendor）
dsh plugin --profile web add @max-null/dsh-quick-toolbar
```

## 使用

- **聚合按钮**：标题栏/悬浮球点开面板 → 一键触发各插件功能（再点关闭——会话管理探测弹窗关闭按钮）。
- **用户适配器**：复制 `adapters.prompt.md` + 环境描述 → 让 LLM 生成 `{ "adapters": [...] }` → 写入 `~/.dsh/quick-toolbar-adapters.json` → 重启/热载生效（schema 校验，非法条目丢弃并报明细）。
- 定位失败/插件未装/被禁用 → 静默跳过（绝不误伤、绝不误点）。

## 架构

- `src/adapters.ts`：适配器 schema + 内置适配器集（黄金示例）
- `src/behaviors.ts`：行为库（click / toggle-panel / dispatch-event / open-settings / command）
- `src/engine.ts`：执行器（防御执行）
- `src/schema.ts`：用户配置 zod 校验（LLM 产物防线）
- `src/index.ts`：host 半 `GET /quick-toolbar/api/adapters`
- 设计文档：`doc/设计/2026-08-30-quick-toolbar-独立化设计方案.md`

## 开发

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build   # L1 门槛（20+ 用例）
```

## SSID 系列

SSiD 全家桶（[max-null-plugins](https://github.com/Max-Null)）的一员；SSiD 壳内与标题栏桥接协作（`__SSID_SHELL__` 分支）。
