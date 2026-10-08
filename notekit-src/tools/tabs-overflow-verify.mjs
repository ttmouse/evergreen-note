/** 修复验证：窄窗口下滚动到末尾 Tab 可达 + wheel 转横向 + 截图存证。 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
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
const profile = path.join(outDir, 'profile3')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', '--window-size=900,700', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }

await ev(`(() => { const m = window.__notekitApp.addons.main; ['懂云平台框架','思维模型','知识体系总论','全域营销链路','豆爸的知识体系','设计知识体系','产品知识体系','感悟与复盘'].forEach((t, i) => m.openWorkspaceTab('probe-' + i, t)); return m.workspaceTabs.length })()`)
await sleeps(600)

const shot = async name => {
  const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, name), Buffer.from(data, 'base64'))
}

const visibleLast = `(() => {
  const strip = document.querySelector('.main-area .workspace-tabs')
  const tabs = [...strip.querySelectorAll('.workspace-tab')]
  const last = tabs[tabs.length - 1]
  const sr = strip.getBoundingClientRect(); const lr = last.getBoundingClientRect()
  return { scrollLeft: Math.round(strip.scrollLeft), maxScroll: strip.scrollWidth - strip.clientWidth, lastVisible: lr.right <= sr.right + 1 && lr.left >= sr.left - 1, iconsInWindow: [...document.querySelectorAll('.main-area .workspace-header-actions > *')].every(n => { const r = n.getBoundingClientRect(); return r.right <= window.innerWidth && r.width > 0 }) }
})()`

const result = {}
// 主区：初始状态截图（左侧 Tab 可见，图标完整）
result.fixedBefore = await ev(visibleLast)
await shot('fixed-before.png')

// 滚到最末（模拟用户把 Tab 滚到底）
result.fixedScrolled = await ev(`(() => { const s = document.querySelector('.main-area .workspace-tabs'); s.scrollLeft = s.scrollWidth; return true })()`)
await sleeps(300)
result.fixedAfter = await ev(visibleLast)
await shot('fixed-end.png')

// wheel 事件转横向滚动
result.wheelTest = await ev(`(() => {
  const s = document.querySelector('.main-area .workspace-tabs')
  s.scrollLeft = 0
  const r = s.getBoundingClientRect()
  s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 240, clientX: r.x + 50, clientY: r.y + 10 }))
  return { scrollLeftAfter: Math.round(s.scrollLeft) }
})()`)
await sleeps(200)

// 选中第一个 Tab，验证 active 自动滚回可见
await ev(`(() => { window.__notekitApp.addons.main.selectWorkspaceTab('probe-0'); return true })()`)
await sleeps(400)
result.autoScrollBack = await ev(`(() => { const s = document.querySelector('.main-area .workspace-tabs'); return { scrollLeft: Math.round(s.scrollLeft), firstTabLeft: Math.round(s.querySelector('.workspace-tab').getBoundingClientRect().left) } })()`)
await shot('fixed-back-to-active.png')

// Andy 模式同样验证
await ev(`(() => { window.__notekitApp.addons.floatViewer.setModeAll('andy'); return true })()`)
await sleeps(1500)
result.andy = await ev(`(() => {
  const strip = document.querySelector('.andy-header-content .workspace-tabs')
  if (!strip) return { strip: false }
  strip.scrollLeft = strip.scrollWidth
  const tabs = [...strip.querySelectorAll('.workspace-tab')]
  const last = tabs[tabs.length - 1]
  const sr = strip.getBoundingClientRect(); const lr = last.getBoundingClientRect()
  return { strip: true, scrollable: strip.scrollWidth > strip.clientWidth, lastVisibleAfterScroll: lr.right <= sr.right + 2, iconsInWindow: [...document.querySelectorAll('.andy-header-actions > *')].every(n => { const r = n.getBoundingClientRect(); return r.right <= window.innerWidth && r.width > 0 }) }
})()`)
await shot('andy-end.png')

console.log(JSON.stringify(result, null, 1))
cdp.close()
child.kill('SIGTERM')
process.exit(0)
