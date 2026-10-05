/**
 * 聚焦探针：linkSelection 之后 Slate 选区到底在哪（refer vs bilink 对照）
 * 用后即删的诊断脚本，不属于交付物。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'refer-probe')
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
const evalT = (e, ms = 15000) => Promise.race([ev(e), sleeps(ms).then(() => { throw new Error('超时') })])
const callT = (m, p = {}) => cdp.call(m, p)

for (let i = 0; i < 90; i++) { try { if (await evalT(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }
const routeWhenReady = async title => {
  for (let i = 0; i < 60; i++) {
    const ok = await evalT(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(title)})) return false; t.route(${JSON.stringify(title)}); return true })()`).catch(() => false)
    if (ok) { await sleeps(600); return }
    await sleeps(1000)
  }
  await evalT(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(title)}); return true })()`, 8000).catch(() => {})
  await sleeps(600)
}
await routeWhenReady('探针目标')
await routeWhenReady('探针源')
for (let i = 0; i < 30; i++) { if (await evalT(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }

const dumpSel = label => evalT(`(() => {
  const editors = [...document.querySelectorAll('.editor-view .node')].map((n, i) => ({ i, ky: n.getAttribute('data-ky'), ed: n.$editor }))
  const sels = editors.map(({i, ky, ed}) => ({ i, ky: (ky||'').slice(0,10), sel: ed && ed.selection ? { path: ed.selection.anchor.path, offset: ed.selection.anchor.offset, focusPath: ed.selection.focus.path, focusOffset: ed.selection.focus.offset } : null }))
  const ds = window.getSelection()
  return JSON.stringify({ label: ${JSON.stringify(label)}, editors: sels, domSel: ds && ds.rangeCount ? { collapsed: ds.isCollapsed, text: ds.toString().slice(0, 20) } : null })
})()`)

const focusFirst = async () => {
  await evalT(`(() => {
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
}
const selectSpanText = async substr => {
  await evalT(`(() => {
    const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes(${JSON.stringify(substr)}))
    const ce = n.closest('[contenteditable="true"]') || n.querySelector('[contenteditable="true"]')
    ce.focus()
    const spans = [...n.querySelectorAll('[data-slate-string]')]
    const span = spans.find(s => (s.textContent || '').includes(${JSON.stringify(substr)}))
    const tn = span.firstChild
    const i = (span.textContent || '').indexOf(${JSON.stringify(substr)})
    const range = document.createRange()
    range.setStart(tn, i)
    range.setEnd(tn, i + ${JSON.stringify(substr)}.length)
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return 'ok'
  })()`)
  await sleeps(500)
}
const typeText = async text => { await callT('Input.insertText', { text }); await sleeps(400) }

console.log('--- 参照：创建后选区状态 ---')
await focusFirst()
await typeText('探针目标 后缀')
await selectSpanText('探针目标')
const ret = await evalT(`(() => {
  const n = [...document.querySelectorAll('.editor-view .node')].find(x => (x.innerText || '').includes('探针目标'))
  return String(window.__notekitApp.addons.refer.linkSelection(n.$editor))
})()`)
console.log('linkSelection 返回:', ret)
console.log(await dumpSel('refer 创建后立即'))
await sleeps(600)
console.log(await dumpSel('refer 创建后 600ms'))
console.log(await evalT(`(() => {
  const ref = document.querySelector('.editor-view .refer-text')
  return JSON.stringify({ html: ref ? ref.outerHTML.slice(0, 600) : null })
})()`))

console.log('--- 修完选区后直接打字 ---')
await evalT(`(() => {
  const ref = document.querySelector('.editor-view .refer-text')
  const label = ref && ref.querySelector('.refer-editing [data-slate-string]')
  return label ? 'has-editing-span' : 'no-editing-span'
})()`)

await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(800); try { child.kill('SIGKILL') } catch {}
process.exit(0)
