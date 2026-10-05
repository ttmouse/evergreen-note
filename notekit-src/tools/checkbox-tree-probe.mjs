/**
 * 快速探测：插入 checkbox 后的真实 Slate 树结构（隔离实例）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'checkbox-probe')
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

const TOPIC = '复选框树探测'
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
const cdp = await (async () => { let c = null; for (let i = 0; i < 120 && !c; i++) { try { c = await connect(debugPort) } catch { await sleeps(500) } } return c })()
const ev = expression => cdp.evaluate(expression)
const call = (m, p) => cdp.call(m, p)

const keyEvent = k => ({ modifiers: k.modifiers ?? 0, key: k.key, code: k.code ?? k.key, windowsVirtualKeyCode: k.vk ?? 0, nativeVirtualKeyCode: k.vk ?? 0 })
const pressReal = async (k, ms = 200) => {
  await call('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'rawKeyDown' })
  await call('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'keyUp' })
  await sleeps(ms)
}
const typeText = async text => { await call('Input.insertText', { text }); await sleeps(250) }
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  await sleeps(250)
}

// waitReady
for (let i = 0; i < 90; i++) { if (await ev(`!!window.__notekitApp`).catch(() => false)) break; await sleeps(1000) }
let routed = false
for (let i = 0; i < 60 && !routed; i++) {
  routed = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(TOPIC)})) return false; t.route(${JSON.stringify(TOPIC)}); return true })()`).catch(() => false)
  if (!routed) await sleeps(1000)
}
if (!routed) await ev(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(TOPIC)}); return true })()`, 8000).catch(() => {})
for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }

// 内容构造
const point = await ev(`(() => { const el = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]'); const r = el.getBoundingClientRect(); return { x: r.left + 30, y: r.top + Math.min(20, r.height / 2) } })()`)
await clickAt(point.x, point.y)
await typeText('first line')
await pressReal({ modifiers: 0, key: 'Enter', code: 'Enter', vk: 13 })
await typeText('hello world')
await pressReal({ modifiers: 4 | 8, key: 'd', code: 'KeyD', vk: 68 })
await sleeps(500)

const dump = await ev(`(() => {
  const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
  const ed = node.$editor
  const top = ed.children
  // 找到 checkbox element 的路径
  let cbPath = null
  const walk = (children, prefix) => children.forEach((c, i) => {
    const p = [...prefix, i]
    if (c.blockType === 'checkbox' && cbPath === null) cbPath = p
    if (c.children) walk(c.children, p)
  })
  walk(top, [])
  // 读取 DOM 结构
  const wrap = document.querySelector('.element-checkbox')
  const chain = []
  let el = wrap
  while (el && !el.classList.contains('node')) { chain.push(el.tagName + '.' + [...el.classList].slice(0, 3).join('.')); el = el.parentElement }
  return JSON.stringify({ cbPath, top: top, domChain: chain }, null, 1).slice(0, 6000)
})()`)
console.log(dump)

await ev('window.close(); true').catch(() => {})
cdp.close()
child.kill('SIGTERM')
await sleeps(1000)
try { child.kill('SIGKILL') } catch {}
process.exit(0)
