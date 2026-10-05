import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { connect } from './cdp-client.mjs'

// Run against a disposable profile: node tools/codeblock-render-verify.mjs <CDP port> <output directory>
const [port, outDir] = process.argv.slice(2)
if (!port || !outDir) throw new Error('CDP port and output directory are required')
mkdirSync(outDir, { recursive: true })
const c = await connect(port)
const code = '# 入口（桌面版维护的 shim；建议 alias 到 ~/.zshrc）\nnode ~/.zcode/cli-shim/zcode.cjs -p "<任务提示词>" --cwd <项目目录> --mode yolo'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await c.evaluate(expression).catch(() => false)) return
    await sleep(100)
  }
  throw new Error('Timed out: ' + expression)
}
async function reload() {
  const eventStart = c.events.length
  await c.call('Page.reload')
  for (let i = 0; i < 100 && !c.events.slice(eventStart).some(e => e.method === 'Page.loadEventFired'); i++) await sleep(100)
  await waitFor('!!window.__notekitApp?.addons?.dbMemory?.initFinished')
  await c.evaluate("window.__notekitApp.addons.topic.route('Code block rendering')")
}
const report = {}
try {
  await reload()
  // Runtime.enable can replay exceptions from the previous page before reload.
  c.events.length = 0
  await c.evaluate(`(() => {
    const a = window.__notekitApp.addons
    const pky = a.topic.getTopic('Code block rendering').ky
    const values = [
      ['verify-shell', 'shell', 'Shell', ${JSON.stringify(code)}],
      ['verify-js', 'javascript', 'JavaScript', 'const message = "still renders";'],
      ['verify-unknown', 'unbundled-mode', 'Unknown', '<literal> & "quotes" remain visible'],
      ['verify-legacy', 'shell', 'Shell', 'echo legacy']
    ]
    values.forEach(([ky, mode, langName, value], index) => {
      const el = a.codeblock.createElement({mode, langName, value})
      if (ky === 'verify-legacy') Object.assign(el, {codeBlockText:value, codeBlockMode:mode, codeBlockName:langName})
      a.dbMemory.saveItem({ky, pky, status:1, weight:index+1, ori:value, leaves:[{text:''}, el, {text:''}]})
    })
    return true
  })()`)
  await c.evaluate('window.__notekitApp.addons.dbDisk.flush()')
  await reload()
  await waitFor("document.querySelectorAll('.CodeMirror').length === 4")
  const values = await c.evaluate("[...document.querySelectorAll('.CodeMirror')].map(el=>el.CodeMirror.getValue())")
  assert.equal(values[0], code)
  assert.equal(values[1], 'const message = "still renders";')
  assert.equal(values[2], '<literal> & "quotes" remain visible')
  report.rendered = values
  report.shellMode = await c.evaluate("document.querySelector('.CodeMirror').CodeMirror.getOption('mode')")
  assert.equal(report.shellMode, 'text/x-sh')
  await c.evaluate(`(() => {
    const blocks = [...document.querySelectorAll('.CodeMirror')]
    for (const index of [0, 3]) blocks[index].CodeMirror.setValue(blocks[index].CodeMirror.getValue()+${JSON.stringify('\n# saved edit')})
    return true
  })()`)
  await waitFor("window.__notekitApp.addons.dbMemory.getItem('verify-legacy').leaves.some(x=>x.codeBlockText?.includes('# saved edit'))")
  await c.evaluate('window.__notekitApp.addons.dbDisk.flush()')
  await reload()
  await waitFor("document.querySelectorAll('.CodeMirror').length === 4")
  report.reloaded = await c.evaluate("[...document.querySelectorAll('.CodeMirror')].map(el=>el.CodeMirror.getValue())")
  assert.equal(report.reloaded[0], code+'\n# saved edit')
  assert.equal(report.reloaded[3], 'echo legacy\n# saved edit')
  report.theme = await c.evaluate("document.querySelector('.CodeMirror').CodeMirror.getOption('theme')")
  const screenshot = await c.call('Page.captureScreenshot')
  writeFileSync(path.join(outDir, 'render.png'), Buffer.from(screenshot.data, 'base64'))
  await c.call('Network.enable')
  await c.call('Network.setBlockedURLs', {urls:['*codemirror.min.js*']})
  await reload()
  await waitFor("document.querySelectorAll('.codeblock-source').length === 4")
  report.engineFailureSource = await c.evaluate("[...document.querySelectorAll('.codeblock-source')].map(el=>el.textContent)")
  assert.deepEqual(report.engineFailureSource, report.reloaded)
  await c.call('Network.setBlockedURLs', {urls:[]})
  await reload()
  await waitFor("document.querySelectorAll('.CodeMirror').length === 4")
  report.uncaughtExceptions = c.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params)
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  assert.equal(report.uncaughtExceptions.length, 0)
  report.pass = true
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  c.close()
}
