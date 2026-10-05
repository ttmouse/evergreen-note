/**
 * 独立验证：Hotkey addon 文档级 keydown 监听从冒泡阶段改到捕获阶段
 *
 * 用法：node tools/hotkey-capture-verify.mjs <label>
 * 产出：test-runs/verify-hotkey-hotkey-verifier/<label>.json（原始矩阵）+ 终端汇总
 *
 * 用法方：先在「修复版」dist 上跑一次 label=after，再把监听临时改回冒泡、重新构建，
 * 跑 label=before，最后恢复源码并重建。两次跑的是同一份脚本，唯一变量是源码那一行。
 *
 * 测什么：
 *   1) 有对话框开着时，each 全局/任意位置快捷键是否被派发（⌘Esc 设置面板等）
 *   2) 无对话框时的基线行为（有没有把原本能用的搞坏）
 *   3) 双击回归：编辑器聚焦（A 不打字 / D 打字建立 Slate 选区）时，同一次按键派发次数
 *   4) 普通字符输入是否被捕获阶段监听吞掉
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const label = process.argv[2] || 'run'
const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'verify-hotkey-hotkey-verifier')
await mkdir(outDir, { recursive: true })
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const PORT = await freePort(), DEBUG_PORT = await freePort()
const profile = path.join(outDir, 'profile')
await rm(profile, { recursive: true, force: true })
await mkdir(profile, { recursive: true })

const child = spawn(path.join(root, 'node_modules', '.bin', 'electron'), ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(PORT), NOTEKIT_USER_DATA: profile }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', d => { logs += d })
child.stderr.on('data', d => { logs += d })

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) { console.error('CDP 未就绪', logs.slice(-1500)); child.kill(); process.exit(1) }
const results = []

const consoleTail = () => cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled').slice(-6)
  .map(e => (e.params.args || []).map(a => String(a.value ?? a.description ?? '')).join(' ').slice(0, 200))
const die = where => {
  console.error(`\n[诊断] ${where}`)
  console.error('[诊断] 控制台尾部:', JSON.stringify(consoleTail(), null, 2))
  console.error('[诊断] 应用输出尾部:', logs.split('\n').slice(-20).join('\n'))
  console.error('[诊断] 已完成结果:', JSON.stringify(results, null, 2))
  writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ label, runtimeError: where, results }, null, 2)).catch(() => {})
  child.kill('SIGTERM')
  process.exit(0)
}
const evalWithTimeout = (expression, ms = 15000) => Promise.race([
  cdp.evaluate(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
])
const callWithTimeout = (method, params = {}, ms = 15000) => Promise.race([
  cdp.call(method, params),
  sleeps(ms).then(() => { throw new Error(`${method} 超时 ${ms}ms`) }),
])

for (let i = 0; i < 90; i++) {
  if (await evalWithTimeout(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break
  await sleeps(1000)
}

// 探针：拦截 execCommand 记派发；拦截 hotkey.listen 记编辑器路径派发；再挂一个捕获监听数到达次数
const installProbes = `(() => {
  const app = window.__notekitApp
  const hk = app.addons.hotkey
  window.__audit = { hits: [], listen: [], keydowns: [], docPhase: null }
  app.execCommand = cmd => {
    const key = Object.keys(hk.commands).find(k => hk.commands[k] === cmd)
    window.__audit.hits.push(key ?? cmd?.id ?? '(未知)')
    return false
  }
  const origListen = hk.listen.bind(hk)
  hk.listen = params => {
    window.__audit.listen.push({ key: params?.event?.key, hasSelection: !!params?.editor?.selection })
    return origListen(params)
  }
  document.addEventListener('keydown', e => window.__audit.keydowns.push({ key: e.key, meta: e.metaKey, target: (e.target.className || '').toString().slice(0, 40) }), true)
  // 探测 Hotkey addon 的监听器挂在哪个阶段：在 window 捕获与冒泡各埋一个探针，比较顺序
  window.__audit.docPhase = 'unknown'
  return true
})()`
await evalWithTimeout(installProbes)

const commands = await evalWithTimeout(`(() => {
  const hk = window.__notekitApp.addons.hotkey
  const ALIAS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', esc: 'Escape', escape: 'Escape', space: ' ', spacebar: ' ', enter: 'Enter', return: 'Enter', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', del: 'Delete' }
  const MOD = { mod: 4, cmd: 4, command: 4, meta: 4, ctrl: 2, control: 2, alt: 1, option: 1, opt: 1, shift: 8 }
  const VK = { arrowup: 38, arrowdown: 40, arrowleft: 37, arrowright: 39, escape: 27, enter: 13, tab: 9, backspace: 8, delete: 46, ' ': 32,
    '[': 219, ']': 221, ';': 186, '=': 187, ',': 188, '-': 189, '.': 190, '/': 191, "'": 222 }
  for (let f = 1; f <= 19; f++) VK['f' + f] = 111 + f
  const KEYNAME = { arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', escape: 'Escape', enter: 'Enter', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', ' ': ' ' }
  const parse = raw => {
    const parts = String(Array.isArray(raw) ? raw[0] : raw).toLowerCase().split('+').filter(Boolean)
    let modifiers = 0, key = ''
    for (const part of parts) {
      if (part in MOD) { modifiers |= MOD[part]; continue }
      key = ALIAS[part] ?? KEYNAME[part] ?? part
    }
    if (!key) return null
    const isFn = /^f([1-9]|1[0-9])$/.test(key)
    if (isFn) key = key.toUpperCase()
    const upper = key.length === 1 ? key.toUpperCase() : ''
    const code = isFn ? key
      : key.length === 1 ? (/[a-z]/i.test(key) ? 'Key' + upper : /[0-9]/.test(key) ? 'Digit' + key : key === ' ' ? 'Space' : key)
        : key
    return { modifiers, key, code, vk: VK[key.toLowerCase()] ?? (key.length === 1 ? upper.charCodeAt(0) : 0) }
  }
  return Object.entries(hk.commands).map(([id, cmd]) => ({ id, title: cmd.title, hotkey: cmd.hotkey, context: cmd.context ?? '(未设置)', press: parse(hk.getKey(id) ?? cmd.hotkey) }))
})()`)
const nonEditor = commands.filter(c => c.context === 'global' || c.context === 'everywhere')
console.log(`命令总数：${commands.length}  其中 global/everywhere：${nonEditor.length}`)
console.log(`  ${nonEditor.map(c => `${c.id}[${c.context}] ${JSON.stringify(c.hotkey)}`).join('\n  ')}`)

const reloadAndInstall = async () => {
  await callWithTimeout('Page.reload', {}, 10000).catch(() => {})
  await sleeps(6000)
  for (let i = 0; i < 60; i++) {
    if (await evalWithTimeout(`!!window.__notekitApp?.addons?.hotkey && !!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break
    await sleeps(1000)
  }
  await evalWithTimeout(installProbes)
}
const reset = async reload => {
  if (reload) await reloadAndInstall()
  await evalWithTimeout(`(() => {
    const app = window.__notekitApp
    if (location.pathname !== '/static/diaries') app.addons.router.to('/diaries')
    try { app.addons.dialog?.closeAll?.() } catch {}
    return true
  })()`)
  await sleeps(900)
}

const keyEvent = press => ({ modifiers: press.modifiers, key: press.key, code: press.code, windowsVirtualKeyCode: press.vk, nativeVirtualKeyCode: press.vk })
const pressReal = async (press, ms = 500) => {
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(press), type: 'rawKeyDown' })
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(press), type: 'keyUp' })
  await sleeps(ms)
}

const stateOutside = async () => {
  await evalWithTimeout(`(() => { document.activeElement?.blur?.(); document.body.setAttribute('tabindex','-1'); document.body.focus(); return true })()`)
  await sleeps(150)
  return (await evalWithTimeout(`!document.activeElement?.matches?.('.editor-view *')`)) ? true : '焦点仍在意内'
}
const stateInEditor = async (type = false) => {
  const point = await evalWithTimeout(`(() => {
    const el = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 10) return null
    return { x: Math.round(r.left + 30), y: Math.round(r.top + Math.min(20, r.height / 2)) }
  })()`)
  if (!point) return '找不到可编辑笔记'
  for (const t of ['mousePressed', 'mouseReleased']) await callWithTimeout('Input.dispatchMouseEvent', { type: t, x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleeps(300)
  const focused = await evalWithTimeout(`(() => { const el = document.activeElement; return !!(el && el.isContentEditable && el.closest('.editor-view')) })()`)
  if (!focused) return '焦点不在编辑器'
  if (type) {
    await callWithTimeout('Input.insertText', { text: 'x' }, 8000)
    await sleeps(300)
    await pressReal({ modifiers: 0, key: 'Backspace', code: 'Backspace', vk: 8 })
  }
  await sleeps(250)
  await pressReal({ modifiers: 0, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 }, 150)
  return true
}

/** 打开一个真实 MUI 对话框（设置面板），返回是否真的开了 */
const openModal = async () => {
  const opened = await evalWithTimeout(`(async () => {
    const app = window.__notekitApp
    const cmd = Object.values(app.addons.hotkey.commands).find(c => c.title && /Preferences|偏好|设置/.test(c.title))
    if (!cmd) return 'no-command'
    try { app.execCommand(cmd, { app, event: null }) } catch (e) { return 'throw:' + e.message }
    return true
  })()`)
  await sleeps(1200)
  const modal = await evalWithTimeout(`(() => {
    const m = document.querySelector('.MuiModal-root, .MuiDialog-root, [role="dialog"]')
    if (!m) return null
    const focusables = m.querySelectorAll('input, textarea, [contenteditable="true"], button, [role="combobox"]')
    return { cls: (m.className||'').toString().slice(0,60), focusables: focusables.length, active: (document.activeElement?.tagName||'') + '.' + (document.activeElement?.className||'').toString().slice(0,30) }
  })()`)
  return { opened, modal }
}
const modalOpen = () => evalWithTimeout(`!!document.querySelector('.MuiModal-root, .MuiDialog-root, [role="dialog"]')`)
const activeModalIsTop = () => evalWithTimeout(`(() => {
  const ms = document.querySelectorAll('.MuiModal-root')
  if (!ms.length) return 0
  const last = ms[ms.length - 1]
  const style = getComputedStyle(last)
  return { count: ms.length, zIndex: style.zIndex, visibility: style.visibility, hidden: last.getAttribute('aria-hidden') }
})()`)

const snapshot = `[window.__audit.hits, window.__audit.listen, window.__audit.keydowns]`
const clearAudit = `window.__audit = { hits: [], listen: [], keydowns: [], docPhase: null }`

// ---------- 阶段 1：无对话框基线 ----------
const baseline = []
for (const cmd of nonEditor) {
  const row = { id: cmd.id, hotkey: cmd.hotkey, context: cmd.context, state: 'no-modal', hits: null, reached: null, skips: [] }
  if (!cmd.press) { row.skips.push('无法解析按键'); baseline.push(row); continue }
  try {
    await reset(true)
    const ready = await stateOutside()
    if (ready !== true) { row.skips.push(String(ready)) } else {
      await evalWithTimeout(clearAudit)
      await pressReal(cmd.press)
      const [hits, , keydowns] = await evalWithTimeout(snapshot)
      row.hits = hits.filter(h => h === cmd.id).length
      row.totalHits = hits.length
      row.reached = keydowns.length
      // 若命令会开对话框，关掉，避免影响下一条
      await evalWithTimeout(`(() => { try { window.__notekitApp.addons.dialog?.closeAll?.() } catch {} return true })()`)
      await sleeps(300)
    }
  } catch (e) { row.skips.push(String(e).slice(0, 60)) }
  baseline.push(row)
  console.log(`[baseline/no-modal] ${cmd.context.padEnd(10)} ${String(cmd.hotkey).padEnd(16)} hits=${row.hits} ${row.skips.join(',')}`)
  await writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ label, stage: 'baseline', results, baseline }, null, 2))
}

// ---------- 阶段 2：对话框开着 ----------
const withModal = []
for (const cmd of nonEditor) {
  const row = { id: cmd.id, hotkey: cmd.hotkey, context: cmd.context, state: 'modal-open', hits: null, reached: null, skips: [] }
  if (!cmd.press) { row.skips.push('无法解析按键'); withModal.push(row); continue }
  try {
    await reset(true)
    await stateOutside()
    const info = await openModal()
    row.modal = info.modal
    row.opened = info.opened
    if (!info.modal) { row.skips.push('对话框没开起来:' + JSON.stringify(info.opened)) } else {
      // ⌘Esc 会开设置面板，先确认当时确实开着一个（即别的）对话框——这正是报告的场景
      row.topBefore = await activeModalIsTop()
      await evalWithTimeout(clearAudit)
      await pressReal(cmd.press)
      const [hits, , keydowns] = await evalWithTimeout(snapshot)
      row.hits = hits.filter(h => h === cmd.id).length
      row.totalHits = hits.length
      row.reached = keydowns.length
      row.topAfter = await activeModalIsTop()
      await evalWithTimeout(`(() => { try { window.__notekitApp.addons.dialog?.closeAll?.() } catch {} return true })()`)
      await sleeps(300)
    }
  } catch (e) { row.skips.push(String(e).slice(0, 60)) }
  withModal.push(row)
  console.log(`[modal-open] ${cmd.context.padEnd(10)} ${String(cmd.hotkey).padEnd(16)} hits=${row.hits} reached=${row.reached} ${row.skips.join(',')}`)
  await writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ label, stage: 'withModal', results, baseline, withModal }, null, 2))
}

// ---------- 阶段 3：双击回归（编辑器聚焦，无对话框）----------
const doubleFire = []
const dfCases = [
  { name: 'editor-blurred', setup: stateOutside },
  { name: 'editor-clicked-no-type', setup: () => stateInEditor(false) },
  { name: 'editor-typed-selection', setup: () => stateInEditor(true) },
]
const dfCmds = nonEditor.filter(c => c.press && /^Key[PLW]$|Escape/.test(c.press.code) || true).slice(0, 0) // 占位
const chosenIds = ['app.floatSearch', 'app.dailyNote', 'app.todayNote']
const chosen = nonEditor.filter(c => chosenIds.includes(c.id))
const dfList = [...chosen, ...nonEditor.filter(c => c.press?.key === 'Escape')]
const seen = new Set()
for (const cmd of dfList) {
  if (seen.has(cmd.id)) continue
  seen.add(cmd.id)
  for (const c of dfCases) {
    const row = { id: cmd.id, hotkey: cmd.hotkey, context: cmd.context, focus: c.name, hits: null, listenCalls: null, reached: null, skips: [] }
    try {
      await reset(true)
      const ready = await c.setup()
      if (ready !== true) { row.skips.push(String(ready)) } else {
        await evalWithTimeout(clearAudit)
        await pressReal(cmd.press)
        const [hits, listen, keydowns] = await evalWithTimeout(snapshot)
        row.hits = hits.filter(h => h === cmd.id).length
        row.totalHits = hits.length
        row.allHits = hits
        row.listenCalls = listen.length
        row.reached = keydowns.length
        await evalWithTimeout(`(() => { try { window.__notekitApp.addons.dialog?.closeAll?.() } catch {} return true })()`)
        await sleeps(300)
      }
    } catch (e) { row.skips.push(String(e).slice(0, 60)) }
    doubleFire.push(row)
    console.log(`[double-fire] ${c.name.padEnd(22)} ${String(cmd.hotkey).padEnd(14)} hits=${row.hits} listen=${row.listenCalls} reached=${row.reached} ${row.skips.join(',')}`)
    await writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ label, stage: 'doubleFire', results, baseline, withModal, doubleFire }, null, 2))
  }
}

// ---------- 阶段 4：普通输入不被吞 ----------
const typing = []
try {
  await reset(true)
  const ready = await stateInEditor(true)
  if (ready === true) {
    const before = await evalWithTimeout(`document.activeElement.textContent || ''`)
    await callWithTimeout('Input.insertText', { text: 'hello' }, 8000)
    await sleeps(300)
    let after = await evalWithTimeout(`document.activeElement.textContent || ''`)
    typing.push({ case: 'insertText-ordinary', before: before.slice(-30), after: after.slice(-40), grew: after.length > before.length })
    // 单键 rawKeyDown 路径（真实按键，不是 insertText）
    const before2 = after
    await pressReal({ modifiers: 0, key: 'A', code: 'KeyA', vk: 65 })
    after = await evalWithTimeout(`document.activeElement.textContent || ''`)
    typing.push({ case: 'rawKeyDown-KeyA', before: before2.slice(-30), after: after.slice(-40), grew: after.length > before2.length })
  } else typing.push({ case: 'setup', error: String(ready) })
} catch (e) { typing.push({ case: 'error', error: String(e).slice(0, 120) }) }
console.log('[typing]', JSON.stringify(typing))

// ---------- 阶段 5：Escape 在对话框/输入框内的行为 ----------
const escapeBehavior = []
try {
  await reset(true)
  await stateOutside()
  await openModal()
  const modalOpenNow = await modalOpen()
  const beforeCount = await evalWithTimeout(`document.querySelectorAll('.MuiModal-root').length`)
  // 纯 Escape（无 mod）应当只关对话框
  await pressReal({ modifiers: 0, key: 'Escape', code: 'Escape', vk: 27 })
  const afterCount = await evalWithTimeout(`document.querySelectorAll('.MuiModal-root').length`)
  escapeBehavior.push({ case: 'plain-Escape-with-modal', modalOpenNow, beforeCount, afterCount, closed: afterCount < beforeCount })
} catch (e) { escapeBehavior.push({ case: 'error', error: String(e).slice(0, 120) }) }
console.log('[escape]', JSON.stringify(escapeBehavior))

const summary = {
  label,
  generatedAt: new Date().toISOString(),
  commandCount: commands.length,
  nonEditorCount: nonEditor.length,
  nonEditor: nonEditor.map(c => ({ id: c.id, hotkey: c.hotkey, context: c.context })),
  baseline, withModal, doubleFire, typing, escapeBehavior,
}
await writeFile(path.join(outDir, `${label}.json`), JSON.stringify(summary, null, 2))
console.log(`\n=== ${label}: 汇总 ===`)
console.log(`无对话框可派发: ${baseline.filter(r => (r.hits ?? 0) >= 1).length}/${baseline.length}`)
console.log(`开对话框后可派发: ${withModal.filter(r => (r.hits ?? 0) >= 1).length}/${withModal.length}`)
console.log(`双击(hits>1): ${doubleFire.filter(r => (r.hits ?? 0) > 1).map(r => `${r.id}/${r.focus}=${r.hits}`).join(', ') || '无'}`)
child.kill('SIGTERM')
process.exit(0)
