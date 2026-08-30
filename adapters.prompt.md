# quick-toolbar 注册模板（驻场 LLM 用）

> 你是用户环境的**驻场工程师**。本文件是「按钮注册」的图纸——你不是写插件，而是
> **探查环境并把按钮注册进工具栏载体**（DSH「一切皆插件」：每个聚合按钮 = 你注册
> 的一个子插件条目）。
> 输出：一段 JSON（写入 `~/.dsh/quick-toolbar-adapters.json`，`{ "adapters": [...] }`）。
> golden 示例：内置适配器集（本仓库 `src/adapters.ts`）——**先看示例再写**。

## 你的职责（重要的是前两步）

1. **自主探查环境**：用你的浏览器/代码能力（DOM 查询、截图、读源码）找到用户环境里
   值得聚合的按钮——**不需要用户提供 DOM 快照**，自己验证选择器（宁缺勿错）。
   工具栏载体**不内置扫描器**：探查是驻场工程师的活，不是插件的活（场景无限，
   没有"完美脚本"能预适配——这正是你在场的原因）。
2. **按模板注册**：生成适配条目（数据，不是代码）。
3. 写入配置 → 生效（刷新/重载后按钮出现在载体）。

## 适配器对象（字段全解）

```json
{
  "id": "<插件标识，如 dsh-some-plugin>",
  "button": "<分散按钮的 CSS 选择器——你自己验证过确实存在>",
  "icon": { "source": "from-button" },
  "label": "<工具栏显示名，缺省扣原按钮文案>",
  "act": { "kind": "<行为枚举，见下>", ... },
  "hide": true,
  "enabled": true
}
```

## 行为枚举（只能选这些，不许写代码）

| kind | 语义 | 参数 |
|---|---|---|
| `click` | 直接点击 | — |
| `toggle-panel` | 面板开/关（**再点关闭**：探测关闭按钮） | `close?`：关闭按钮选择器 |
| `dispatch-event` | 派发 CustomEvent | `event`（事件名）、`detail?` |
| `open-settings` | 打开设置面板（引擎语义锚点定位，再点关闭） | `path?`（暂不支持） |
| `command` | 注入斜杠命令草稿到输入框（用户确认后发送） | `name`（不含 `/`） |

## 编写纪律（防误伤）

1. **只写数据**：不得提供函数/代码（schema 拒绝一切非枚举行为）。
2. **选择器必须验证过**：你自己探查确认（动用你的能力，而不是让用户描述）。
3. **先小规模**：一次只注册 1–2 个按钮，验证后再扩展。
4. **定位失败无害**：引擎对找不到的按钮静默跳过（不报错不误点）；`hide:true` 仅隐藏本按钮，绝不批量隐藏。
5. 插件被禁用/未装 → 条目自然无效（无需预判）。

## 黄金示例（从内置集抄模式）

```json
{ "adapters": [
  { "id": "dsh-session-manager", "button": ".sm-footerBtn", "icon": { "source": "from-button" },
    "label": "会话管理", "act": { "kind": "toggle-panel", "close": ".sm-modal .close" }, "hide": true },
  { "id": "dsh-plugin-center", "button": "[class*=\"pc-headerbtn\"]", "icon": { "source": "from-button" },
    "label": "插件中心", "act": { "kind": "dispatch-event", "event": "ssid:titlebar", "detail": "plugin-center" }, "hide": true }
] }
```

（示例中 session-manager 是「原生不支持再点关闭、需要探测弹窗关闭按钮」的难办案例——学习它的模式。）
