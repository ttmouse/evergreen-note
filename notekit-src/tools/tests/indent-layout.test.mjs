import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { compile, serialize, stringify } from 'stylis'
import { chromium } from 'playwright'

// Use the production layout declarations, not a second copy of their CSS.
const source = readFileSync(new URL('../../src/slate-item/addons/LayoutFactory/default.style.ts', import.meta.url), 'utf8')
const exports = {}
const cls = (strings, ...values) => strings.reduce((css, part, i) => css + part + (values[i] ?? ''), '')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports, require: name => name.endsWith('/atom') ? { cls } : name.endsWith('/colors') ? { colors: {} } : { colorBase: {} },
})
const style = exports.layoutStyleDefault[0]
const css = ['outer', 'head', 'tools', 'body', 'child'].map(key => serialize(compile(`.${key}{${style[key]}}`), stringify)).join('\n')
const row = (id, text, children = '') => `<section id="${id}" class="outer node note-block"><div class="tools node-tools"></div><div class="head node-head"><span>${text}</span></div><div class="body node-body"><div class="child node-child">${children}</div></div></section>`

test('indent and outdent preserve text Y positions and following row spacing', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const text of ['普通文本', '☐ 待办事项', '第一行<br>第二行<br>第三行']) {
      await page.setContent(`<style>*{box-sizing:border-box}body{font-family:sans-serif;width:500px}${css}</style><main>${row('parent', '父节点')}${row('target', text)}${row('following', '下一行')}</main>`)
      const measure = () => page.evaluate(() => Object.fromEntries(['parent', 'target', 'following'].map(id => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector(`#${id} > .head > span`))
        return [id, range.getBoundingClientRect().y]
      })))
      const before = await measure()
      await page.evaluate(() => document.querySelector('#parent > .body > .child').append(document.querySelector('#target')))
      const indented = await measure()
      assert.equal(indented.target, before.target, `indenting ${text.slice(0, 12)} shifts text`)
      assert.equal(indented.following, before.following, 'indent shifts following row')
      await page.evaluate(() => document.querySelector('main').insertBefore(document.querySelector('#target'), document.querySelector('#following')))
      assert.deepEqual(await measure(), before, 'outdent restores original positions')
    }
  } finally { await browser.close() }
})
