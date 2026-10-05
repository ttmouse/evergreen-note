import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import { chromium } from 'playwright'

// Exercise the built app's real Slate editor and inline components in an empty,
// disposable library. Never edit the user's running app or database.
test('editing operations keep text baselines and unrelated rows stable', async t => {
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const data = await mkdtemp(path.join(tmpdir(), 'notekit-layout-'))
  const server = spawn(process.execPath, ['--experimental-sqlite', new URL('../../server/server.mjs', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(port), NOTEKIT_DATA_DIR: data }, stdio: 'ignore',
  })
  let browser
  try {
    const url = `http://127.0.0.1:${port}`
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'isolated server starts')
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await page.goto(url)
    await page.waitForFunction(() => window.__notekitApp?.addons?.dbDisk?.connections['db-1-v2main'])
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const $ = window.__notekitApp.addons
      $.topic.createTopic('布局回归测试', { ky: 'layout-root', subitems: [
        { ky: 'layout-parent', weight: 100, leaves: [{ text: '父节点文字' }], subitems: [{ ky: 'layout-child', weight: 100, leaves: [{ text: '子节点文字' }] }] },
        { ky: 'layout-target', weight: 200, leaves: [{ text: '编辑测试 Abc 123' }] },
        { ky: 'layout-after', weight: 300, leaves: [{ text: '后续行' }] },
      ] })
      $.topic.route('布局回归测试')
    })
    await page.waitForSelector('[data-ky="layout-target"] .node-text')
    const measure = () => page.evaluate(() => {
      const result = {}
      for (const ky of ['layout-parent', 'layout-target', 'layout-after']) {
        const node = document.querySelector(`[data-ky="${ky}"]`)
        // Measure actual text, not the union of inline widget/spacer rectangles.
        const text = node.querySelector(':scope > .node-head [data-slate-string]')
        const range = document.createRange(); range.selectNodeContents(text)
        result[ky] = { y: range.getBoundingClientRect().y, height: node.querySelector(':scope > .node-head').getBoundingClientRect().height }
      }
      return result
    })
    const operate = async op => {
      await page.evaluate(op => {
        const $ = window.__notekitApp.addons
        const editor = document.querySelector('[data-ky="layout-target"]').closest('.editor-view').editor
        editor.itemFocus('layout-target')
        if (op === 'checkbox') $.checkbox.insertNow(editor)
        else if (op === 'undo' || op === 'redo') editor[op]()
        else if (op === 'indent') editor.itemIndent()
        else if (op === 'outdent') editor.itemOutdent()
        else if (op === 'fold' || op === 'unfold') editor.itemFoldup(op === 'fold', 'layout-parent')
        else if (op === 'type') { editor.itemFocusEnd('layout-target'); editor.insertText('新增') }
        else if (op === 'bilink' || op === 'hyperlink') {
          editor.itemFocusEnd('layout-target')
          const element = op === 'bilink' ? $.bilink.createElement({ topic: '链接' }) : $.hyperlink.createElement({ url: 'https://example.com', title: '链接' })
          editor.insertFragment([element, { text: '' }])
        }
        else if (op === 'clear') { editor.itemSelect(editor.itemPathText('layout-target')); $.marks.clearFormat(editor) }
        else { editor.itemSelect(editor.itemPathText('layout-target')); $.marks.toggle(editor, op) }
      }, op)
      await page.waitForTimeout(100)
    }
    for (const night of [false, true]) {
      await page.evaluate(night => document.body.classList.toggle('night-mode', night), night)
      await t.test(`${night ? 'dark' : 'light'}: insert/toggle checkbox, undo/redo`, async () => {
        const before = await measure()
        const samples = []
        for (const op of ['checkbox', 'checkbox', 'undo', 'undo', 'redo', 'redo', 'undo', 'undo']) {
          await operate(op)
          samples.push([op, await measure()])
        }
        for (const [op, sample] of samples) assert.deepEqual(sample, before, `${op} changes row geometry`)
      })
      for (const op of ['type', 'bilink', 'hyperlink']) {
        await t.test(`${night ? 'dark' : 'light'}: ${op}, undo/redo`, async () => {
          const before = await measure()
          const samples = []
          for (const action of [op, 'undo', 'redo', 'undo']) {
            await operate(action); samples.push(await measure())
          }
          for (const sample of samples) assert.deepEqual(sample, before)
        })
      }
      await t.test(`${night ? 'dark' : 'light'}: Enter and soft break keep first line baseline`, async () => {
        for (const key of ['Shift+Enter', 'Enter']) {
          const before = await measure()
          await page.evaluate(() => document.querySelector('[data-ky="layout-target"]').closest('.editor-view').editor.itemFocus('layout-target', 3))
          await page.keyboard.press(key)
          await page.waitForTimeout(100)
          try {
            // Enter retains the original ky on the suffix and creates a new
            // preceding item for the prefix. Follow the text, not that ky.
            const firstLineY = await page.evaluate(key => {
              let node = document.querySelector('[data-ky="layout-target"]')
              if (key === 'Enter') node = node.previousElementSibling
              const range = document.createRange()
              range.selectNodeContents(node.querySelector(':scope > .node-head [data-slate-string]'))
              return range.getBoundingClientRect().y
            }, key)
            assert.equal(firstLineY, before['layout-target'].y)
          } finally { if (key !== 'Enter') await operate('undo') }
          if (key !== 'Enter') assert.deepEqual(await measure(), before)
        }
      })
      for (const mark of ['bold', 'italic', 'underline', 'strikethrough', 'highlight', 'code', 'tag']) {
        await t.test(`${night ? 'dark' : 'light'}: ${mark} and clear format`, async () => {
          const before = await measure()
          try {
            await operate(mark)
            assert.deepEqual(await measure(), before, `${mark} changes row geometry`)
          } finally {
            await operate('clear')
            // tag is managed separately from clearFormat.
            if (mark === 'tag') await operate('tag')
          }
          assert.deepEqual(await measure(), before)
        })
      }
      await t.test(`${night ? 'dark' : 'light'}: indent/outdent`, async () => {
        const before = await measure()
        await operate('indent')
        assert.deepEqual(await measure(), before)
        await operate('outdent')
        assert.deepEqual(await measure(), before)
      })
      await t.test(`${night ? 'dark' : 'light'}: fold/unfold keeps parent baseline`, async () => {
        const before = await measure()
        await operate('fold')
        assert.deepEqual((await measure())['layout-parent'], before['layout-parent'])
        await operate('unfold')
        assert.deepEqual(await measure(), before)
      })
    }
    assert.deepEqual(await page.evaluate(() => window.__errs), [], 'no runtime errors')
  } finally {
    await browser?.close()
    server.kill()
    await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve))
    await rm(data, { recursive: true, force: true })
  }
})
