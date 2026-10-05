/**
 * 零交互探针：只启动隔离实例、建一个主题，收集控制台报错。
 * 用于判断 TypeError reading 'length' 是否为既有问题（与本任务改动无关）。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'console-probe')
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
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
console.log('阶段1: 启动后静置 20s')
await sleeps(20000)
let errs = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
console.log('启动静置报错数:', errs.length, errs.slice(0, 2).map(e => JSON.stringify(e.params).slice(0, 160)))

console.log('阶段2: 建主题+打字+建引用+方向键进入')
for (let i = 0; i < 60; i++) {
  const ok = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic('探针甲')) return false; t.route('探针甲'); return true })()`).catch(() => false)
  if (ok) break
  await sleeps(1000)
}
await ev(`(async () => { await window.__notekitApp.addons.topic.route('探针乙'); return true })()`).catch(() => {})
await ev(`(async () => { await window.__notekitApp.addons.topic.route('探针甲'); return true })()`).catch(() => {})
await sleeps(2000)
for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }
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
await cdp.call('Input.insertText', { text: '探针乙 后' })
await sleeps(500)
await ev(`(() => {
  const n = [...document.querySelectorAll('.editor-view.editor-from-router .node')].find(x => (x.innerText || '').includes('探针乙'))
  const ce = n.closest('[contenteditable="true"]') || n.querySelector('[contenteditable="true"]')
  ce.focus()
  const span = [...n.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('探针乙'))
  const tn = span.firstChild
  const i = span.textContent.indexOf('探针乙')
  const range = document.createRange()
  range.setStart(tn, i); range.setEnd(tn, i + 3)
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range)
  return window.__notekitApp.addons.refer.linkSelection(n.$editor)
})()`)
await sleeps(500)
for (const k of [{ windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' }, { windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' }]) {
  for (const t of ['rawKeyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { ...k, type: t })
  await sleeps(300)
}
await sleeps(3000)
errs = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
console.log('交互后总报错数:', errs.length)
console.log(errs.slice(0, 4).map(e => JSON.stringify(e.params).slice(0, 220)).join('\n'))

await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
process.exit(0)
