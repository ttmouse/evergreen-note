/**
 * 夜间批验证（2026-10-09）：四处用户实测缺陷 + 安迪模式图标。
 * 前置：先 pnpm build。隔离实例、夜间真实主题态，逐项量化：
 *   T1 主题列表勾选行删除按钮（裸 IconButton 墨色 → 期望 muted）
 *   T2 折叠圆点芯片 outline（模拟 node-foldup 类 → 期望与芯片底同色）
 *   T3 悬停竖线 node-body:hover（期望 line-strong，非 slate-300）
 *   T4 安迪模式：切换按钮图标色 / 激活芯片 / 栏纸面（用户截图疑点）
 * 产物：test-runs/night-skin-probe/batch-verify.json + batch-*.png
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'night-skin-probe')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise(res => s.close(res))
  return port
}
const APP_PORT = await freePort()
const debugPort = await freePort()
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const child = spawn(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  ['desktop/main.cjs', '--window-size=1480,940', `--remote-debugging-port=${debugPort}`],
  { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: 'ignore' })
let cdp = null
for (let i = 0; i < 90 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { child.kill(); throw new Error('CDP 连接失败') }
const ev = e => cdp.evaluate(e)
for (let i = 0; i < 90; i++) { try { if (await ev('!!window.__notekitApp').catch(() => false)) break } catch {}; await sleeps(1000) }
await ev(`localStorage.setItem('nightMode', 'on')`)
await cdp.call('Page.reload', {})
await sleeps(1500)
for (let i = 0; i < 90; i++) { try { if (await ev('!!window.__notekitApp').catch(() => false)) break } catch {}; await sleeps(1000) }
await sleeps(2000)

const shot = async name => {
  const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, `batch-${name}.png`), Buffer.from(data, 'base64'))
}

const report = {}

// T2 折叠圆点：给编辑器第一个带 node-tools 的节点挂 node-foldup 类（真实折叠即加此类，
// 情绪样式按类匹配，挂类即等效），量 .node-btn 的 outline 与背景。
report.foldChip = await ev(`(() => {
  const node = document.querySelector('.main-area .node .node-tools')?.closest('.node')
  if (!node) return { error: 'no editor node' }
  const btn = node.querySelector('.node-tools .node-btn')
  const before = btn ? getComputedStyle(btn).outlineColor : null
  node.classList.add('node-foldup')
  const after = btn ? getComputedStyle(btn) : null
  const out = after ? { outline: after.outlineColor, outlineWidth: after.outlineWidth, bg: after.backgroundColor } : { error: 'no btn' }
  node.classList.remove('node-foldup')
  return { before, ...out }
})()`)

// T3 悬停竖线：把指针移到正文某个 node-body 上再读 borderLeftColor。
{
  const rect = await ev(`(() => {
    const b = [...document.querySelectorAll('.main-area .node-body')].find(x => x.getBoundingClientRect().height > 20)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (rect) {
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(rect.x), y: Math.round(rect.y) })
    await sleeps(400)
    report.hoverRail = await ev(`(() => {
      const b = [...document.querySelectorAll('.main-area .node-body')].find(x => x.getBoundingClientRect().height > 20)
      const cs = getComputedStyle(b)
      return { borderLeft: cs.borderLeftColor, width: cs.borderLeftWidth, matches: b.matches(':hover') }
    })()`)
  } else report.hoverRail = { error: 'no node-body' }
}

// T1 删除按钮：/topics 勾选一行，量行内 Delete 按钮的 color 与 svg fill。
await ev(`window.__notekitApp.addons.router.to('/topics')`)
await sleeps(3000)
report.deleteBtn = await ev(`(async () => {
  const box = document.querySelector('.MuiTableBody-root input[type=checkbox]:not(:checked)')
  if (!box) return { error: 'no row checkbox' }
  box.click()
  await new Promise(r => setTimeout(r, 600))
  const btn = document.querySelector('button[aria-label="Delete"], button[aria-label*="删除"]')
  if (!btn) return { error: 'no delete button after check' }
  const cs = getComputedStyle(btn)
  const svg = btn.querySelector('svg')
  return { color: cs.color, svgFill: svg ? getComputedStyle(svg).fill : null,
    svgClass: svg ? (svg.getAttribute('class') || '(none)') : null }
})()`)
await shot('delete-row')

// T4 安迪模式：切模式、开一列，量切换按钮与栏纸。
report.andy = await ev(`(async () => {
  const app = window.__notekitApp
  app.addons.floatViewer.setModeAll('andy')
  await new Promise(r => setTimeout(r, 600))
  try { app.addons.keyClick.openInAndyMode('/diaries') } catch (e) { return { error: 'openInAndyMode: ' + e.message } }
  await new Promise(r => setTimeout(r, 1500))
  const btn = document.querySelector('button.andy-mode-toggle')
  const cs = btn ? getComputedStyle(btn) : null
  const svg = btn && btn.querySelector('svg')
  const col = document.querySelector(".floatview-container-subitems > .nui-dialog[dialog-list-mode='andy']")
  const sub = document.querySelector('.floatview-container-subitems')
  return {
    toggle: btn ? { color: cs.color, pressed: btn.getAttribute('aria-pressed'), bg: cs.backgroundColor } : { error: 'no toggle' },
    svgFill: svg ? getComputedStyle(svg).fill : null,
    svgClass: svg ? (svg.getAttribute('class') || '(none)') : null,
    columnPaper: col ? getComputedStyle(col).backgroundColor : '(no column)',
    subitemsBg: sub ? getComputedStyle(sub).backgroundColor : '(no subitems)',
  }
})()`)
await shot('andy-mode')

await writeFile(path.join(outDir, 'batch-verify.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
child.kill()
