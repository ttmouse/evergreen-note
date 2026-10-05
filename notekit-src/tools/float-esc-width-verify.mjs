/**
 * 浮层预览窗 Esc 关闭 + 默认宽度验收（隔离实例，不动用户数据）
 *
 * 背景：2026-10-06 用户拍板——浮层默认 625px（Andy 列宽）、可拖拽调宽、Esc 关闭当前浮层。
 * 用户反馈「Esc 收掉没有测试出来」，本脚本在隔离实例里用真实 CDP 按键复现。
 *
 * 用法：node tools/float-esc-width-verify.mjs（dist 需为最新构建）
 * 输出：stdout 检查结果
 */
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'float-esc-width-verify')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
let cdp = null
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) { console.error('❌ 无法连接 CDP'); child.kill('SIGKILL'); process.exit(1) }
const ev = e => cdp.evaluate(e)
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}
const failures = []
const evalWithTimeout = (expression, ms = 15000) => Promise.race([
  ev(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
])

// 等应用与数据库就绪
let ready = false
for (let i = 0; i < 60; i++) {
  try { ready = await ev(`!!window.__notekitApp && !!window.__notekitApp.addons.dbMemory`) } catch { ready = false }
  if (ready) break
  await sleeps(1000)
}
if (!ready) { console.error('❌ 应用未就绪'); child.kill('SIGKILL'); process.exit(1) }

// 找一篇已有笔记，用 openInDialog 开浮层（与 Cmd+点击同一入口）
const openResult = await evalWithTimeout(`(async () => {
  const app = window.__notekitApp
  if (!app) return { error: 'no __notekitApp' }
  const $ = app.addons
  let ky = null
  try { ky = ($.main.workspaceTabs?.[0]?.key) || 'diaries' } catch { ky = 'diaries' }
  $.keyClick.openInDialog({ item: ky, isPin: true })
  await new Promise(r => setTimeout(r, 800))
  const list = app.states.floatViewerList || []
  const dlg = list.length ? document.getElementById(list[0].dialogId) : null
  return { ky, dialogId: list[0]?.dialogId, width: dlg ? Math.round(dlg.getBoundingClientRect().width) : null, listLen: list.length }
})()`)

check('S1 浮层已打开且已注册到 floatViewerList', openResult?.dialogId && openResult.listLen > 0, openResult)
check('S2 浮层默认宽度 = 625', openResult?.width === 625, openResult?.width)
const diag = await evalWithTimeout(`(() => {
  const app = window.__notekitApp
  const id = (app.states.floatViewerList || [])[0]?.dialogId
  const el = id ? document.getElementById(id) : null
  const store = id ? app.addons.dialog.store.get(id) : null
  const cmd = Object.values(app.addons.hotkey.commands || {}).find(c => (c.title || '').includes('Esc'))
  return {
    inlineStyle: el ? el.getAttribute('style') : null,
    storeSize: store ? JSON.stringify({ size: store.size, position: store.position }) : null,
    cmdFound: !!cmd, cmdHotkey: cmd?.hotkey, cmdCtx: cmd?.context,
    mode: app.states.floatViewerMode,
  }
})()`)
console.log('diag:', JSON.stringify(diag))
// 直接调用命令处理体，验证 handler 本身是否有效
const directCall = await evalWithTimeout(`(async () => {
  const app = window.__notekitApp
  const cmd = Object.values(app.addons.hotkey.commands || {}).find(c => (c.title || '').includes('Esc'))
  if (!cmd) return 'cmd missing'
  try {
    const r = cmd.handle({ event: { nativeEvent: { repeat: false, target: document.body } } })
    await new Promise(r2 => setTimeout(r2, 500))
    const id = (app.states.floatViewerList || [])[0]?.dialogId
    const e = id ? app.addons.dialog.store.get(id) : null
    return { ret: r, stillVisible: !!(e && e.visible && !e.folded) }
  } catch (err) { return 'throw: ' + err.message }
})()`)
console.log('directCall:', JSON.stringify(directCall))

// 真实 Escape 按键（CDP 输入事件，非 JS 合成）
await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
await sleeps(600)

const afterEsc = await evalWithTimeout(`(() => {
  const app = window.__notekitApp
  const list = app.states.floatViewerList || []
  const visible = list.filter(d => { const e = app.addons.dialog.store.get(d.dialogId); return e && e.visible && !e.folded })
  const dom = list.length ? document.getElementById(list[0].dialogId) : null
  return { listLen: list.length, visibleLen: visible.length, domGone: !dom || dom.style.display === 'none' || !document.contains(dom) }
})()`)
check('S3 按 Esc 后浮层关闭', afterEsc?.visibleLen === 0 || afterEsc?.domGone, afterEsc)

const errs = cdp.events
  .filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
  .map(e => JSON.stringify(e.params).slice(0, 200))
check('S4 无 console 错误', errs.length === 0, errs.slice(0, 3))

console.log(failures.length ? `\n❌ ${failures.length} 项失败` : '\n✅ 全部通过')
child.kill('SIGKILL')
process.exit(failures.length ? 1 : 0)
