/** 补充探针：fixed 模式下 .workspace-header 祖先链的宽度约束来源。 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'tabs-overflow')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const profile = path.join(outDir, 'profile2')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', '--window-size=1200,900', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }

await ev(`(() => { const m = window.__notekitApp.addons.main; for (let i = 0; i < 8; i++) m.openWorkspaceTab('probe-' + i, '很长的知识体系主题标题' + i); return m.workspaceTabs.length })()`)
await sleeps(600)

const out = await ev(`(() => {
  const h = document.querySelector('.workspace-header')
  const chain = []
  let e = h
  for (let i = 0; e && i < 8; i++) {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    chain.push({ i, tag: e.tagName, cls: String(e.className).split(' ').filter(Boolean).slice(0, 3).join('.'), x: Math.round(r.x), w: Math.round(r.width), display: cs.display, flexDir: cs.flexDirection, flex: cs.flex, minW: cs.minWidth, overflow: cs.overflow, position: cs.position })
    e = e.parentElement
  }
  return { innerW: window.innerWidth, chain }
})()`)
console.log(JSON.stringify(out, null, 1))
cdp.close()
child.kill('SIGTERM')
process.exit(0)
