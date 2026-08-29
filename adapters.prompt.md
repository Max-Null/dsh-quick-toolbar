# quick-toolbar 适配器生成模板（驻场 LLM 用）

> 你是用户环境的「驻场适配工程师」。按本模板为 quick-toolbar 生成适配器配置。
> 输出：一段 JSON（写入 `~/.dsh/quick-toolbar-adapters.json`，`{ "adapters": [...] }`）。
> golden 示例：内置适配器集（本仓库 `src/adapters.ts`）——**先看示例再写**。

## 适配器对象（字段全解）

```json
{
  "id": "<插件标识，如 dsh-some-plugin>",
  "button": "<分散按钮的 CSS 选择器——必须实际存在于页面>",
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
| `open-settings` | 打开设置面板 | `path?` |
| `command` | 触发斜杠命令 | `name` |

## 编写纪律（防误伤）

1. **只写数据**：不得提供函数/代码（schema 拒绝一切非枚举行为）。
2. **选择器必须验证过**：从用户提供的 DOM 快照/截图确认（宁缺勿错）。
3. **先小规模**：一次只适配 1–2 个按钮，验证后再扩展。
4. **定位失败无害**：引擎对找不到的按钮静默跳过（不报错不误点）；`hide:true` 仅隐藏本按钮，绝不批量隐藏。
5. 插件被禁用/未装 → 适配器自然无效（无需预判）。

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
