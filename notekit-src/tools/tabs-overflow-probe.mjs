/**
 * 顶部 Tab 溢出行为探针（D125F26FCF5E-1）：
 * 在主区（fixed）与 Andy 两种头部下，把窗口逐步缩窄，
 * 量 .workspace-tabs / 工具栏图标的几何与生效样式，找出「挤跑图标」的真实条件。
 */
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
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', '--window-size=1480,900', `--remote-debugging-port=${debugPort}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev(`!!window.__notekitApp`, 3000).catch(() => false)) break } catch {}; await sleeps(1000) }

const setWidth = async w => {
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleeps(350)
}

const MEASURE = `(() => {
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), overflowX: cs.overflowX, flex: cs.flex, minW: cs.minWidth, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollable: el.scrollWidth > el.clientWidth } }
  const tabs = [...document.querySelectorAll('.workspace-tabs')]
  const actions = [...document.querySelectorAll('.workspace-header-actions')]
  const icons = actions.flatMap(a => [...a.children]).map(n => { const r = n.getBoundingClientRect(); return { id: (n.id || n.tagName).slice(-24), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) } })
  const win = { innerW: window.innerWidth }
  const andy = document.querySelector('.andy-header-content')
  const tabTitles = [...document.querySelectorAll('.workspace-tab-title')].map(t => t.textContent)
  const firstTabRight = document.querySelector('.workspace-tab')?.getBoundingClientRect()
  const clippedRight = firstTabRight ? Math.round(firstTabRight.right) : null
  return {
    win, tabCount: tabTitles.length, tabTitles,
    mainHeader: rect(document.querySelector('.workspace-header')),
    tabs: tabs.map(rect),
    actions: actions.map(rect),
    icons,
    andyContent: rect(andy),
    andyHead: rect(document.querySelector('.floatview-container-head')),
    andyTitle: rect(document.querySelector('.floatview-container-head > .floatview-container-title')),
    lastTab: (() => { const t = [...document.querySelectorAll('.workspace-tab')].pop(); return t ? rect(t) : null })(),
  }
})()`

const openTabs = `(() => {
  const m = window.__notekitApp.addons.main
  const titles = ['懂云平台框架', '思维模型', '知识体系总论', '全域营销链路', '豆爸的知识体系', '设计知识体系', '产品知识体系', '感悟与复盘']
  titles.forEach((t, i) => m.openWorkspaceTab('probe-key-' + i, t))
  return m.workspaceTabs.length
})()`

const results = { fixed: [], andy: [] }

// ── 主区（fixed）模式 ──
await ev(`(() => { const app = window.__notekitApp; if (app.states.floatViewerMode !== 'fixed') app.addons.floatViewer.setModeAll('fixed'); return app.states.floatViewerMode })()`)
await sleeps(800)
const nTabs = await ev(openTabs)
await sleeps(500)
for (const w of [1480, 1200, 1000, 820, 640, 520]) {
  await setWidth(w)
  results.fixed.push({ width: w, snap: await ev(MEASURE) })
}

// ── Andy 模式 ──
await ev(`(() => { window.__notekitApp.addons.floatViewer.setModeAll('andy'); return true })()`)
await sleeps(1200)
for (const w of [1480, 1200, 1000, 820, 640, 520]) {
  await setWidth(w)
  results.andy.push({ width: w, snap: await ev(MEASURE) })
}

console.log(JSON.stringify({ nTabs, results }, null, 1))
cdp.close()
child.kill('SIGTERM')
process.exit(0)
