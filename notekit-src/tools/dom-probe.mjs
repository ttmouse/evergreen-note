/**
 * DOM 归属探针：第一个 contenteditable 的祖先链、data-slate-string 的分布、
 * 新建正文行后正文编辑器的 DOM 位置。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'dom-probe')
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
for (let i = 0; i < 60; i++) {
  const ok = await ev(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic('DOM探针页')) return false; t.route('DOM探针页'); return true })()`).catch(() => false)
  if (ok) break
  await sleeps(1000)
}
await ev(`(async () => { await window.__notekitApp.addons.topic.route('DOM探针页'); return true })()`).catch(() => {})
await sleeps(1500)
for (let i = 0; i < 30; i++) { if (await ev(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }

console.log(await ev(`(() => {
  const ces = [...document.querySelectorAll('.editor-view.editor-from-router [contenteditable="true"]')]
  const chain = el => { const out = []; let e = el; for (let i = 0; e && i < 8; i++) { out.push(e.tagName + '.' + String(e.className||'').split(' ').filter(c=>c&&!c.startsWith('css-')).slice(0,4).join('.')); e = e.parentElement } return out }
  return JSON.stringify({ count: ces.length, first: chain(ces[0]), spansInFirstEditable: ces[0].querySelectorAll('[data-slate-string]').length, totalSpans: document.querySelectorAll('.editor-view.editor-from-router [data-slate-string]').length })
})()`))

// 标题里打字，看 span 出现在哪
await ev(`(() => {
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
  ce.focus()
  const sel = getSelection(); const range = document.createRange()
  range.selectNodeContents(ce); range.collapse(true)
  sel.removeAllRanges(); sel.addRange(range)
  return 'ok'
})()`)
await sleeps(400)
await cdp.call('Input.insertText', { text: '标题行文字' })
await sleeps(500)
console.log(await ev(`(() => {
  const spans = [...document.querySelectorAll('.editor-view.editor-from-router [data-slate-string]')]
  const hit = spans.find(s => (s.textContent||'').includes('标题行文字'))
  const chain = el => { const out = []; let e = el; for (let i = 0; e && i < 10; i++) { out.push(e.tagName + '.' + String(e.className||'').split(' ').filter(c=>c&&!c.startsWith('css-')).slice(0,3).join('.')); e = e.parentElement } return out }
  return JSON.stringify({ found: !!hit, chain: hit ? chain(hit) : null })
})()`))

// 回车建正文行，打字，再看正文 span 归属
for (const t of ['rawKeyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { type: t, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleeps(600)
await cdp.call('Input.insertText', { text: '正文行文字' })
await sleeps(500)
console.log(await ev(`(() => {
  const spans = [...document.querySelectorAll('.editor-view.editor-from-router [data-slate-string]')]
  const title = spans.find(s => (s.textContent||'').includes('标题行文字'))
  const body = spans.find(s => (s.textContent||'').includes('正文行文字'))
  const chain = el => { const out = []; let e = el; for (let i = 0; e && i < 10; i++) { out.push(e.tagName + '.' + String(e.className||'').split(' ').filter(c=>c&&!c.startsWith('css-')).slice(0,3).join('.')); e = e.parentElement } return out }
  const leafNodeOf = el => { let e = el; while (e) { const n = e.closest && e.closest('.node'); if (n && !n.querySelector('.node')) return n; e = e.parentElement } return null }
  return JSON.stringify({
    bodyFound: !!body,
    bodyChain: body ? chain(body) : null,
    bodyLeafNode: body ? (leafNodeOf(body) ? { text: leafNodeOf(body).innerText.slice(0,16), hasEd: !!leafNodeOf(body).$editor } : 'no-leaf-node') : null,
    titleLeafNode: title ? (leafNodeOf(title) ? 'leaf' : 'no-leaf') : null,
  })
})()`))

// 正文行里建引用 + 方向键进入（正文场景快验）
await ev(`(() => {
  const spans = [...document.querySelectorAll('.editor-view.editor-from-router [data-slate-string]')]
  const body = spans.find(s => (s.textContent||'').includes('正文行文字'))
  const ce = body.closest('[contenteditable="true"]')
  const tn = body.firstChild
  const sel = getSelection(); const range = document.createRange()
  range.setStart(tn, 0); range.setEnd(tn, 5)
  sel.removeAllRanges(); sel.addRange(range)
  const ed = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n=>n.$editor).filter(Boolean).find(e => e.selection)
  return String(window.__notekitApp.addons.refer.linkSelection(ed))
})()`)
await sleeps(500)
for (let i = 0; i < 3; i++) {
  for (const t of ['rawKeyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { type: t, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 })
  await sleeps(350)
}
console.log(await ev(`(() => {
  const editing = document.querySelector('.editor-view.editor-from-router .refer-text.refer-editing')
  const eds = [...document.querySelectorAll('.editor-view.editor-from-router .node')].map(n => n.$editor).filter(Boolean)
  const active = eds.find(e => e.selection)
  let selInsideRefer = false
  if (active?.selection) { try { const pe = active.parent(active.selection.anchor.path); selInsideRefer = (Array.isArray(pe)?pe[0]:pe).blockType === 'refer' } catch {} }
  return JSON.stringify({ editing: !!editing, text: editing && editing.textContent, selInsideRefer })
})()`))

await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
process.exit(0)
