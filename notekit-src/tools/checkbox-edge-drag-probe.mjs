/**
 * 聚焦探测：拖选端点落在勾选框上时，修复后的 outline 是否仍会漏出
 * （隔离实例，只读验证，输出各场景 outline 状态）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'checkbox-edge-probe')
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

const TOPIC = '勾选框端点探测'
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
const cdp = await (async () => { let c = null; for (let i = 0; i < 120 && !c; i++) { try { c = await connect(debugPort) } catch { await sleeps(500) } } if (!c) throw new Error('CDP 未就绪'); return c })()
const ev = expression => Promise.race([cdp.evaluate(expression), sleeps(15000).then(() => { throw new Error('evaluate 超时') })]).catch(e => 'ERR:' + String(e).slice(0, 100))
const call = (m, p) => cdp.call(m, p)

const keyEvent = k => ({ modifiers: k.modifiers ?? 0, key: k.key, code: k.code ?? k.key, windowsVirtualKeyCode: k.vk ?? 0, nativeVirtualKeyCode: k.vk ?? 0 })
const pressReal = async (k, ms = 180) => {
  await call('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'rawKeyDown' })
  await call('Input.dispatchKeyEvent', { ...keyEvent(k), type: 'keyUp' })
  await sleeps(ms)
}
const typeText = async text => { await call('Input.insertText', { text }); await sleeps(250) }
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  await sleeps(250)
}
const drag = async (from, to) => {
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 })
  for (let i = 1; i <= 6; i++) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(from.x + ((to.x - from.x) * i) / 6), y: Math.round(from.y + ((to.y - from.y) * i) / 6), button: 'left' })
    await sleeps(25)
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 })
  await sleeps(500)
}

// 自动接受 JS 对话框，避免渲染进程被冻结
setInterval(() => {
  const ds = cdp.events.filter(e => e.method === 'Page.javascriptDialogOpening')
  if (ds.length) cdp.call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
}, 1500)

const outline = () => ev(`(() => {
  const box = document.querySelector('.element-checkbox .inline-rect > *')
  if (!box) return 'no-box'
  const cs = getComputedStyle(box)
  return cs.outlineStyle
})()`)

// waitReady
for (let i = 0; i < 90; i++) { if (await ev(`!!window.__notekitApp`) === true) break; await sleeps(1000) }
let routed = false
for (let i = 0; i < 60 && !routed; i++) {
  routed = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(TOPIC)})) return false; t.route(${JSON.stringify(TOPIC)}); return true })()`)
  if (routed !== true) { routed = false; await sleeps(1000) }
}
if (routed !== true) await ev(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(TOPIC)}); return true })()`)
for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`) === true) break; await sleeps(1000) }

// 构造行：hello world ☑ more（勾选框夹在文本中间，已勾选）
const p0 = await ev(`(() => { const el = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]'); const r = el.getBoundingClientRect(); return { x: r.left + 30, y: r.top + Math.min(20, r.height / 2) } })()`)
await clickAt(p0.x, p0.y)
await typeText('first line')
await pressReal({ modifiers: 0, key: 'Enter', code: 'Enter', vk: 13 })
await typeText('hello world')
await pressReal({ modifiers: 4 | 8, key: 'd', code: 'KeyD', vk: 68 })
await sleeps(400)
await ev(`(() => {
  const node = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
  const ed = node.$editor
  let cbPath = null
  const walk = (children, prefix) => children.forEach((c, i) => { const p = [...prefix, i]; if (c.blockType === 'checkbox' && cbPath === null) cbPath = p; if (c.children) walk(c.children, p) })
  walk(ed.children, [])
  if (!cbPath) return false
  const trailing = [...cbPath.slice(0, -1), cbPath[cbPath.length - 1] + 1]
  let cur = { children: ed.children }
  for (const idx of trailing) cur = cur.children ? cur.children[idx] : undefined
  if (!cur || typeof cur.text !== 'string') return false
  ed.apply({ type: 'insert_text', path: trailing, offset: cur.text.length, text: ' more' })
  return true
})()`)
await sleeps(400)
// 点击勾选框勾上
const cbPt = await ev(`(() => { const i = document.querySelector('.element-checkbox input'); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
await clickAt(cbPt.x, cbPt.y)
await sleeps(300)

console.log('== V-A 中段拖选（预期 none）==')
{
  const pts = await ev(`(() => {
    const first = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('first line'))
    const second = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const fspan = [...first.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('first'))
    const mspan = [...second.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('more'))
    fspan.scrollIntoView({ block: 'center' })
    const fr = fspan.getBoundingClientRect(), mr = mspan.getBoundingClientRect()
    return { from: { x: fr.left + 4, y: fr.top + fr.height / 2 }, to: { x: mr.left + mr.width / 2, y: mr.top + mr.height / 2 } }
  })()`)
  await drag(pts.from, pts.to)
  console.log('  outline =', await outline())
  const sel = await ev(`(() => { const n = [...document.querySelectorAll('.editor-view .node')].find(x => x.innerText.includes('hello')); const s = n.$editor.selection; return s.anchor.path.join(',') + '->' + s.focus.path.join(',') })()`)
  console.log('  slate 选区 =', sel)
  await clickAt(pts.from.x, pts.from.y + 60)
}

console.log('== V-B 从勾选框上起手拖到文本（预期 none）==')
{
  const to = await ev(`(() => {
    const second = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const mspan = [...second.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('more'))
    const r = mspan.getBoundingClientRect()
    return { x: r.left + 4, y: r.top + r.height / 2 }
  })()`)
  await drag(cbPt, to)
  console.log('  outline =', await outline())
  const sel = await ev(`(() => { const n = [...document.querySelectorAll('.editor-view .node')].find(x => x.innerText.includes('hello')); const s = n.$editor.selection; return s.anchor.path.join(',') + '->' + s.focus.path.join(',') })()`)
  console.log('  slate 选区 =', sel)
  await clickAt(to.x, to.y + 60)
}

console.log('== V-C 拖选释放在勾选框上（预期 none）==')
{
  const from = await ev(`(() => {
    const first = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('first line'))
    const fspan = [...first.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('first'))
    fspan.scrollIntoView({ block: 'center' })
    const r = fspan.getBoundingClientRect()
    return { x: r.left + 4, y: r.top + r.height / 2 }
  })()`)
  await drag(from, { x: cbPt.x - 2, y: cbPt.y })
  console.log('  outline =', await outline())
  const sel = await ev(`(() => { const n = [...document.querySelectorAll('.editor-view .node')].find(x => x.innerText.includes('hello')); const s = n.$editor.selection; return s.anchor.path.join(',') + '->' + s.focus.path.join(',') })()`)
  console.log('  slate 选区 =', sel)
  await clickAt(from.x, from.y + 60)
}

console.log('== V-D 键盘方向键移到勾选框（预期 solid，保留）==')
{
  const e = await ev(`(() => {
    const second = [...document.querySelectorAll('.editor-view .node')].find(n => (n.innerText || '').includes('hello world'))
    const span = [...second.querySelectorAll('[data-slate-string]')].find(s => (s.textContent || '').includes('hello world'))
    span.scrollIntoView({ block: 'center' })
    const r = span.getBoundingClientRect()
    return { x: r.right - 2, y: r.top + r.height / 2 }
  })()`)
  await clickAt(e.x, e.y)
  let got = 'none'
  for (let i = 0; i < 8; i++) {
    await pressReal({ modifiers: 0, key: 'ArrowRight', code: 'ArrowRight', vk: 39 })
    got = await outline()
    if (got === 'solid') break
  }
  console.log('  outline =', got)
}

console.log('== V-E 点击勾选框（塌缩选中，预期 solid——保留的点击反馈）==')
{
  await clickAt(cbPt.x, cbPt.y)
  await sleeps(300)
  console.log('  outline =', await outline())
}

await ev('window.close(); true').catch(() => {})
cdp.close()
child.kill('SIGTERM')
await sleeps(1000)
try { child.kill('SIGKILL') } catch {}
process.exit(0)
