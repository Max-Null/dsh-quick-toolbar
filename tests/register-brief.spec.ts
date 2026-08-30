/**
 * 注册任务书（REGISTER_BRIEF）锚点测试：任务书 = 教程闭环的核心文案，
 * 与 adapters.ts / schema.ts 的协议字段必须同步——锚点断言防止漂移
 * （漂移即「➕ 按钮」注入的引导失效）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGISTER_BRIEF } from '../src/register-brief.ts'

const anchors: [string, string[]][] = [
  ['先反问（第一步必须反问用户，不得猜）', ['反问用户', '不要猜']],
  ['最小注册路径（{id,button} 即可）', ['{ "id": "dsh-some-plugin", "button": ".some-btn" }', '换个位置']],
  ['写回路径（adapters.json 文件，host 无 POST 写入）', ['quick-toolbar-adapters.json', '刷新']],
  ['行为枚举五类（与 ActDef 同步，表含全部 kind）', ['click', 'toggle-panel', 'dispatch-event', 'open-settings', 'command']],
  ['自定义按钮需显式 icon/label/act', ['custom', 'label', 'act']],
  ['只写数据不写代码（窄接口纪律）', ['只写数据', '非枚举行为']],
  ['探查验证纪律（不得凭猜测写选择器）', ['自己验证', '不要凭猜测']],
  ['换位置默认隐藏原按钮（hide 语义）', ['原按钮自动隐藏', 'hide: false']],
  ['探测闭环（再点关闭基本承诺）', ['再点关闭', 'toggle-panel', 'close']],
  ['注册后验证清单', ['验证清单', '原按钮已隐藏']],
]

for (const [name, subs] of anchors) {
  test(`REGISTER_BRIEF 锚点: ${name}`, () => {
    for (const s of subs) {
      assert.ok(REGISTER_BRIEF.includes(s), `任务书缺少锚点: ${s}`)
    }
  })
}

test('REGISTER_BRIEF 是注入草稿形态（无 UI 标记/命令前缀）', () => {
  assert.ok(REGISTER_BRIEF.startsWith('# 任务'), '任务书应以 # 任务 开头（markdown 草稿）')
  assert.ok(!REGISTER_BRIEF.startsWith('/'), '不得是斜杠命令形态')
  assert.ok(REGISTER_BRIEF.length > 300, '任务书应足够完整（>300 字符）')
})
