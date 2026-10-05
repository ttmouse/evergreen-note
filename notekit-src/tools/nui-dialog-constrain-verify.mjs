/** NUI Dialog 拖动约束修复（P1-3）隔离 Electron 真实拖拽验收。
 *
 * 修复内容：notekit-src/src/slate-item/notekit-ui/components/Dialog/Dialog.tsx
 *   的 movable constrain 由"允许窗口半尺寸出视口"改为
 *   dialogConstrain.computeDialogMoveConstrainBox（实时约束）：
 *   - 顶部：标题栏（含 pin/fold/close）始终完整在视口内（top ≥ 0）
 *   - 左侧：至少保留 120px 可操作标题栏在视口内
 *   - 右侧/底部：窗口边缘与视口对齐，resize 手柄始终可达
 *   helper.tsx：constrain 支持函数（实时求值）、夹取 min 优先、onEnd 回传夹取后位置。
 *
 * 本脚本全部使用 CDP Input.dispatchMouseEvent 合成真实鼠标事件：
 *   1) 拖过视口四边 → 边界被约束，标题栏仍有可命中区域、三控件可命中
 *   2) 从边缘拖回 → 位置恢复
 *   3) 约束状态下 pin/fold/close 可点击
 *   4) 视口内自由拖动位移精确、双击最大化/还原不回归
 *   5) 视口 resize 后约束随之更新
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const srcRoot = root
// 截图/profile/结果都放临时目录，任务结束后整体清理，不污染工作区
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
const outDir = await mkdtemp(path.join(tmpdir(), 'nui-dialog-constrain-verify-'))
await rm(path.join(outDir, 'profile'), { recursive: true, force: true })
await mkdir(path.join(outDir, 'profile'), { recursive: true })
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const TOPIC = '浮层验收'
// 优先用本 worktree 的 Electron 二进制；被 pnpm 脚本拦截未安装时，
// 可通过环境变量借用主工作区的二进制（只读使用，cwd 仍指向本 worktree 的 dist）。
const ELECTRON_BIN = process.env.ELECTRON_BIN || path.join(srcRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const debugPort = await freePort()
let child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${debugPort}`], {
  cwd: srcRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: path.join(outDir, 'profile') }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', d => { logs += d })
child.stderr.on('data', d => { logs += d })
let cdp = null
for (let i = 0; i < 150 && !cdp; i++) { try { cdp = await connect(debugPort) } catch { await sleeps(500) } }
if (!cdp) { console.error('CDP 未就绪', logs.slice(-500)); process.exit(1) }
const evalT = (expression, ms = 20000) => Promise.race([
  cdp.evaluate(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时: ${expression.slice(0, 60)}`) }),
])
const results = []
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id} ${name} :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const clickAt = async (x, y, wait = 350) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
  }
  await sleeps(wait)
}
const dblclickAt = async (x, y, wait = 450) => {
  for (const clickCount of [1, 2]) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount })
    }
    await sleeps(60)
  }
  await sleeps(wait)
}
const drag = async (from, to, steps = 12) => {
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(from.x), y: Math.round(from.y), button: 'left', clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(from.x + (to.x - from.x) * i / steps), y: Math.round(from.y + (to.y - from.y) * i / steps), button: 'left', buttons: 1 })
    await sleeps(16)
  }
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(to.x), y: Math.round(to.y), button: 'left', clickCount: 1 })
  await sleeps(350)
}

// ---- 页面内的测量/命中辅助（在浏览器里执行）----
const JS = {
  win: id => `(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } })()`,
  // cx 夹取进视口内可见的标题栏区域：左缘约束后窗口只有右侧 ~120px 可见，
  // 负坐标/视口外点 CDP 鼠标事件无法命中
  headPoint: id => `(() => { const h = document.getElementById(${JSON.stringify(id)})?.querySelector('.nui-dialog-head'); if (!h) return null; const r = h.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, cx: Math.min(Math.max(r.left + Math.min(80, r.width / 2), 60), innerWidth - 60), cy: Math.min(Math.max(r.top + r.height / 2, 12), innerHeight - 12) } })()`,
  headInViewport: id => `(() => { const h = document.getElementById(${JSON.stringify(id)})?.querySelector('.nui-dialog-head'); if (!h) return null; const r = h.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, fullyVisibleVertically: r.top >= 0 && r.bottom <= innerHeight } })()`,
  // 命中测试：pin=0 fold=1 close=2（SymbolList 顺序），以及标题栏可抓取点（夹到视口内）
  hits: id => `(() => {
    const el = document.getElementById(${JSON.stringify(id)}); if (!el) return null
    const syms = [...el.querySelectorAll('.nui-symbol-list .nui-symbol')]
    const hitTest = elx => {
      const r = elx.getBoundingClientRect()
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1)
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1)
      const hit = document.elementFromPoint(x, y)
      return { x, y, ok: !!hit && (hit === elx || elx.contains(hit)) }
    }
    const head = el.querySelector('.nui-dialog-head')
    const hr = head.getBoundingClientRect()
    const gx = Math.min(Math.max(hr.left + Math.min(60, hr.width / 2), 1), innerWidth - 1)
    const gy = Math.min(Math.max(hr.top + hr.height / 2, 1), innerHeight - 1)
    const gHit = document.elementFromPoint(gx, gy)
    return {
      pin: syms[0] ? hitTest(syms[0]) : null,
      fold: syms[1] ? hitTest(syms[1]) : null,
      close: syms[2] ? hitTest(syms[2]) : null,
      headGrab: { x: gx, y: gy, ok: !!gHit && (gHit === head || head.contains(gHit)) },
    }
  })()`,
  resizeHandle: id => `(() => {
    const el = document.getElementById(${JSON.stringify(id)}); if (!el) return null
    const h = el.querySelector('.nui-resize-handle'); if (!h) return null
    const r = h.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1)
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1)
    const hit = document.elementFromPoint(x, y)
    return { x, y, inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, ok: !!hit && (hit === h || h.contains(hit)) }
  })()`,
}

// ---- 启动应用并打开浮窗 ----
for (let i = 0; i < 90 && !(await evalT(`!!window.__notekitApp`).catch(() => false)); i++) { await sleeps(1000) }
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  ready = await evalT(`(() => { const t = window.__notekitApp.addons.topic; if (!t?.getTopic) return false; if (!t.getTopic(${JSON.stringify(TOPIC)})) return false; return true })()`).catch(() => false)
  if (!ready) await sleeps(1000)
}
if (!ready) await evalT(`(async () => { await window.__notekitApp.addons.topic.route(${JSON.stringify(TOPIC)}); return true })()`, 10000).catch(() => {})
for (let i = 0; i < 30; i++) { if (await evalT(`!!document.querySelector('.editor-view [contenteditable="true"]')`).catch(() => false)) break; await sleeps(1000) }

const winId = await evalT(`(() => { const $ = window.__notekitApp.addons; const item = $.dbMemory.getItem($.topic.getTopic(${JSON.stringify(TOPIC)}).ky, { isRecur: true }); return $.floatViewer.show({ item, isPin: true }) })()`)
await sleeps(1000)
console.log('浮窗 dialogId =', winId)
if (!winId) { console.error('浮窗未打开'); process.exit(1) }

// 先把窗口拖到一个确定的视口内位置 (200, 100)
{
  const vp = await evalT(`({ vw: innerWidth, vh: innerHeight })`)
  console.log('视口:', JSON.stringify(vp))
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx + (200 - head.left), y: head.cy + (100 - head.top) })
}

// ---- T0 基线：视口内自由拖动位移精确（回归）----
{
  const before = await evalT(JS.win(winId))
  const head = await evalT(JS.headPoint(winId))
  // 纵向余量受窗口高度限制（floatview 高度≈视口高-40px），向上拖避免撞下缘约束
  const dx = 120, dy = -30
  await drag({ x: head.cx, y: head.cy }, { x: head.cx + dx, y: head.cy + dy })
  const after = await evalT(JS.win(winId))
  const ok = Math.abs(after.left - before.left - dx) <= 2 && Math.abs(after.top - before.top - dy) <= 2
  record('T0', '视口内自由拖动位移精确（回归）', ok, { delta: { dx: after.left - before.left, dy: after.top - before.top } })
}

// ---- T1 拖出顶部 → 约束在 top>=0，标题栏完整可见、三控件可命中、松手后不回弹 ----
{
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx, y: head.cy - 300 })
  const win1 = await evalT(JS.win(winId))
  await sleeps(500)
  const win2 = await evalT(JS.win(winId)) // 松手 500ms 后再量一次，验证 onEnd 未把窗口写回越界位置
  const headPos = await evalT(JS.headInViewport(winId))
  const hits = await evalT(JS.hits(winId))
  const clamped = win2.top >= 0
  const stable = Math.abs(win2.top - win1.top) < 1 && Math.abs(win2.left - win1.left) < 1
  const headOk = headPos.fullyVisibleVertically
  const ctrlsOk = hits.pin?.ok && hits.fold?.ok && hits.close?.ok && hits.headGrab.ok
  record('T1', '拖出顶部：top 被约束 ≥0', clamped, { finalTop: win2.top })
  record('T1b', '拖出顶部：松手后位置稳定（无回弹越界）', stable, { atRelease: win1.top, after500ms: win2.top })
  record('T1c', '拖出顶部：标题栏完整在视口内', headOk, headPos)
  record('T1d', '拖出顶部：head/pin/fold/close 均可命中', ctrlsOk, hits)
}

// ---- T2 顶部约束下 pin/fold/close 可点击 + 从顶边拖回 ----
{
  const hits = await evalT(JS.hits(winId))
  if (!hits.pin?.ok || !hits.fold?.ok) {
    record('T2a', '顶边约束下控件可点击（前置：控件不可命中）', false, hits)
  } else {
  // pin 切换
  const before = await evalT(`document.getElementById(${JSON.stringify(winId)}).classList.contains('is-pin')`)
  await clickAt(hits.pin.x, hits.pin.y)
  const after = await evalT(`document.getElementById(${JSON.stringify(winId)}).classList.contains('is-pin')`)
  await clickAt(hits.pin.x, hits.pin.y)
  const restored = await evalT(`document.getElementById(${JSON.stringify(winId)}).classList.contains('is-pin')`)
  record('T2a', '顶边约束下 pin 可点击（状态切换并复原）', before !== after && restored === before, { before, after, restored })
  // fold → 隐藏 + 标签出现，点标签恢复
  await clickAt(hits.fold.x, hits.fold.y, 600)
  const hidden = await evalT(`(() => { const el = document.getElementById(${JSON.stringify(winId)}); return !el || getComputedStyle(el).display === 'none' })()`)
  const tabTxt = await evalT(`document.querySelector('#tab-${winId}')?.textContent?.trim() ?? null`)
  const tabBox = await evalT(`(() => { const t = document.querySelector('#tab-${winId}'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  let restored2 = false
  if (hidden && tabBox) {
    await clickAt(tabBox.x, tabBox.y, 700)
    restored2 = await evalT(`(() => { const el = document.getElementById(${JSON.stringify(winId)}); return !!el && getComputedStyle(el).display !== 'none' })()`)
  }
  record('T2b', '顶边约束下 fold 可点击（折叠→标签恢复）', hidden && !!tabTxt && restored2, { hidden, tabPrefix: tabTxt?.slice(0, 1), restored: restored2 })
  }
  // 从顶边拖回（窗口高≈视口高，向下拖到下缘约束处即最大位移）
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx + 100, y: head.cy + 220 })
  const win = await evalT(JS.win(winId))
  const vh = await evalT(`innerHeight`)
  const expectedTop = Math.min(220, vh - win.height)
  record('T2c', '从顶边约束位置拖回（向下拖生效且不越下缘）', win.top > 0 && Math.abs(win.top - expectedTop) <= 2, { top: win.top, expectedTop, vh, h: win.height })
}

// ---- T3 拖出左缘 → 保留 ≥120px 标题栏（含控件）→ 从左缘拖回 ----
{
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx - 1600, y: head.cy })
  const win = await evalT(JS.win(winId))
  const hits = await evalT(JS.hits(winId))
  const strip = win.right // 窗口右缘 x = 视口内保留的宽度
  const okStrip = strip >= 118 // 允许 2px 误差
  const ctrlsOk = hits.pin?.ok && hits.fold?.ok && hits.close?.ok && hits.headGrab.ok
  record('T3', '拖出左缘：保留 ≥120px 标题栏且控件可命中', okStrip && ctrlsOk, { visibleStrip: strip, hits })
  // 从左缘拖回（释放点向下离开标题栏：pin/fold/close 随窗口移动，
  // 释放点落在标题栏上会误点 fold/close 中断后续用例）
  const head2 = await evalT(JS.headPoint(winId))
  await drag({ x: head2.cx, y: head2.cy }, { x: head2.cx + 420, y: head2.cy + 200 })
  const win2 = await evalT(JS.win(winId))
  record('T3b', '从左缘约束位置拖回（向右 420px 生效）', win2.left > win.left + 300, { leftBefore: win.left, leftAfter: win2.left })
}

// ---- T4 拖出右缘 → 右缘与视口对齐（resize 手柄可达）----
{
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx + 2000, y: head.cy })
  const win = await evalT(JS.win(winId))
  const handle = await evalT(JS.resizeHandle(winId))
  const hits = await evalT(JS.hits(winId))
  const vw = await evalT(`innerWidth`)
  const flush = Math.abs(win.right - vw) <= 2
  record('T4', '拖出右缘：右缘与视口对齐、resize 手柄可命中', flush && handle.ok && handle.inViewport && hits.headGrab.ok, { right: win.right, vw, handle, headGrab: hits.headGrab })
}

// ---- T5 拖出下缘 → 下缘与视口对齐（resize 手柄可达）----
{
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx, y: head.cy + 2000 })
  const win = await evalT(JS.win(winId))
  const handle = await evalT(JS.resizeHandle(winId))
  const vh = await evalT(`innerHeight`)
  const flush = Math.abs(win.bottom - vh) <= 2
  record('T5', '拖出下缘：下缘与视口对齐、resize 手柄可命中', flush && handle.ok && handle.inViewport, { bottom: win.bottom, vh, handle })
}

// ---- T6 约束位置（右下角贴边）真实 resize ----
{
  const before = await evalT(JS.win(winId))
  const handle = await evalT(JS.resizeHandle(winId))
  await drag({ x: handle.x, y: handle.y }, { x: handle.x + 100, y: handle.y + 40 })
  const after = await evalT(JS.win(winId))
  const ok = after.width >= before.width + 80
  record('T6', '贴边位置 resize 手柄真实拖拽生效', ok, { w: before.width, wAfter: after.width })
  // 拖回视口内，避免影响后续测试
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx - 200, y: head.cy - 200 })
}

// ---- T7 双击最大化 / 还原（回归）----
{
  const head = await evalT(JS.headPoint(winId))
  const beforeSize = await evalT(JS.win(winId))
  await dblclickAt(head.cx, head.cy)
  const maxed = await evalT(JS.win(winId))
  const vp = await evalT(`({ vw: innerWidth, vh: innerHeight, em: parseFloat(getComputedStyle(document.body).fontSize) })`)
  const maxOk = maxed.left === 0 && maxed.top === 0 && Math.abs(maxed.width - vp.vw) <= 2 && Math.abs(maxed.height - (vp.vh - vp.em * 2.5)) <= 4
  const head2 = await evalT(JS.headPoint(winId))
  await dblclickAt(head2.cx, head2.cy)
  const restored = await evalT(JS.win(winId))
  const restoreOk = Math.abs(restored.width - beforeSize.width) <= 2 && Math.abs(restored.height - beforeSize.height) <= 2
  record('T7a', '双击标题栏最大化', maxOk, { maxed, expect: { w: vp.vw, h: vp.vh - vp.em * 2.5 } })
  record('T7b', '再次双击还原尺寸', restoreOk, { before: { w: beforeSize.width, h: beforeSize.height }, after: { w: restored.width, h: restored.height } })
}

// ---- T8 视口 resize 后约束随之更新 ----
{
  const NEW_W = 1100, NEW_H = 700
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: NEW_W, height: NEW_H, deviceScaleFactor: 1, mobile: false })
  await sleeps(1200) // 等待 resize 事件 → 重新 snap / 重绑约束
  const head = await evalT(JS.headPoint(winId))
  await drag({ x: head.cx, y: head.cy }, { x: head.cx + 3000, y: head.cy + 2000 })
  const win = await evalT(JS.win(winId))
  const handle = await evalT(JS.resizeHandle(winId))
  const flushRight = Math.abs(win.right - NEW_W) <= 2
  const flushBottom = Math.abs(win.bottom - NEW_H) <= 2
  record('T8', '视口 resize 后：拖拽约束按新视口生效', flushRight && flushBottom && handle.inViewport, { right: win.right, bottom: win.bottom, newVw: NEW_W, newVh: NEW_H })
  await cdp.call('Emulation.clearDeviceMetricsOverride', {})
  await sleeps(1200)
}

// ---- T9 close 可点击（正常位置收尾）----
{
  const hits = await evalT(JS.hits(winId))
  if (!hits.close?.ok) {
    record('T9', 'close 控件点击关闭浮窗', false, hits)
  } else {
    await clickAt(hits.close.x, hits.close.y, 600)
    const gone = await evalT(`!document.getElementById(${JSON.stringify(winId)})`)
    record('T9', 'close 控件点击关闭浮窗', gone, { gone })
  }
}

// ---- 汇总 ----
const failed = results.filter(r => !r.pass)
const summary = {
  total: results.length,
  pass: results.length - failed.length,
  fail: failed.length,
  failedIds: failed.map(f => f.id),
}
await writeFile(path.join(outDir, 'constrain-result.json'), JSON.stringify({ summary, results }, null, 2))
console.log('\n==== 汇总 ====', JSON.stringify(summary))

await cdp.evaluate('window.close(); true').catch(() => {})
cdp.close()
child.kill('SIGTERM'); await sleeps(1500); try { child.kill('SIGKILL') } catch {}
process.exit(failed.length ? 1 : 0)
