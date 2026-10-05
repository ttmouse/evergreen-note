/**
 * 结构探针：确认路由页的节点树（主题标题 vs 正文 bullet）、
 * Enter 在标题上是否创建正文子行、以及 console 报错触发点。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'struct-probe')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)
const errs = () => cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))

for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
const routeWhenReady = async title => {
  for (let i = 0; i < 60; i++) {
    const ok = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(title)})) return false; t.route(${JSON.stringify(title)}); return true })()`).catch(() => false)
    if (ok) { await sleeps(600); return }
    await sleeps(1000)
  }
  await ev(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return true })()`).catch(() => {})
  await sleeps(600)
}
await routeWhenReady('结构探针页')
for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }

const dumpTree = label => ev(`(() => {
  const nodes = [...document.querySelectorAll('.editor-view.editor-from-router .node')]
  return JSON.stringify({ label: ${JSON.stringify(label)}, count: nodes.length, nodes: nodes.map(n => ({
    cls: (n.className || '').match(/node-topic|node-[a-z]+/g)?.slice(0,3).join(','),
    depth: n.getAttribute('depth'),
    hasChildNode: !!n.querySelector('.node'),
    isLeaf: !n.querySelector('.node'),
    hasEditable: !!n.querySelector('[contenteditable="true"]'),
    selfEditable: n.querySelector(':scope > * > [contenteditable="true"]') ? true : false,
    text: (n.innerText || '').slice(0, 24).replace(/\\n/g, '|'),
    hasEd: !!n.$editor,
  })) })
})()`)

console.log(await dumpTree('路由后'))

// 聚焦第一个 contenteditable（可能就是主题标题），打印它的归属
console.log(await ev(`(() => {
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
  const node = ce.closest('.node')
  return JSON.stringify({ firstEditableInNode: node ? { isTopic: node.className.includes('node-topic'), text: (node.innerText||'').slice(0,20) } : null })
})()`))

// 聚焦标题并按 Enter，看是否生成正文子行
await ev(`(() => {
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
  ce.focus()
  const sel = getSelection()
  const range = document.createRange()
  range.selectNodeContents(ce)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  return 'ok'
})()`)
await sleeps(500)
for (const t of ['rawKeyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { type: t, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleeps(600)
console.log(await dumpTree('标题按 Enter 后'))
console.log(await ev(`(() => {
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const active = eds.find(e => e.selection)
  return JSON.stringify({ activeSel: active && active.selection ? { path: active.selection.anchor.path, offset: active.selection.anchor.offset } : null, errCount: ${'`${'}errs().length${'}'}.replace?.() ?? errs().length })
})()`).catch(async () => ev(`(() => { const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean); const active = eds.find(e => e.selection); return JSON.stringify({ activeSel: active && active.selection ? { path: active.selection.anchor.path } : null, errCount: errsLen() }) })()`)))

console.log('报错数:', errs().length, errs().slice(0, 3).map(e => JSON.stringify(e.params).slice(0, 160)))

await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
process.exit(0)
