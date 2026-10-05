import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [new URL('../../src/slate-item/addons/AddonCenter/selectAddonList.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm',
})
const { selectAddonList } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const body = [
  { addonName: 'css', title: '自定义 CSS', quote: '界面样式', updated: 1 },
  { addonName: 'ai', title: 'AI Assistant', quote: 'ChatGPT', updated: 5 },
  { addonName: 'hidden', title: '隐藏插件', hidden: true },
]
const enabled = name => name === 'css'

test('search supports Chinese descriptions, trimmed text, case and internal names', () => {
  for (const keyword of [' CSS ', '自定义', '样式', 'css']) {
    assert.deepEqual(selectAddonList(body, keyword, 'all', enabled).map(i => i.addonName), ['css'])
  }
  assert.equal(selectAddonList(body, 'chatgpt', 'all', enabled)[0].addonName, 'ai')
  assert.deepEqual(selectAddonList(body, '[', 'all', enabled), [])
})
test('status filters combine with search; sorting does not mutate the source', () => {
  assert.equal(selectAddonList(body, 'css', 'enabled', enabled).length, 1)
  assert.equal(selectAddonList(body, 'css', 'disabled', enabled).length, 0)
  assert.deepEqual(selectAddonList(body, '', 'updated', enabled).map(i => i.addonName), ['ai', 'css'])
  assert.equal(body[0].addonName, 'css')
})
test('hidden plugins appear only with an exact title match', () => {
  assert.equal(selectAddonList(body, '', 'all', enabled).length, 2)
  assert.equal(selectAddonList(body, '隐藏', 'all', enabled).length, 0)
  assert.equal(selectAddonList(body, '隐藏插件', 'all', enabled).length, 1)
})
