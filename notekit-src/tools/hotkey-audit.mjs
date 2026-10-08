/**
 * 快捷键系统实测审计（隔离实例，不动用户数据）
 *
 * 用法：node tools/hotkey-audit.mjs
 * 输出：test-runs/hotkey-audit/result.json（每条命令 × 焦点状态的派发次数矩阵）+ 终端汇总
 * 需要 dist 构建产物（npm run build）。为避开前一条命令把编辑器状态搞脏，每条命令前会
 * 重载一次页面，因此整轮约 8 分钟。
 *
 * 起因：快捷键面板列了 63 条命令，但「按了没反应」时无法分辨是没派发、派发了两次、
 * 还是只在特定焦点状态下才生效。这里把每条命令放在四种焦点状态下真按键，数派发次数。
 *
 * 四种焦点状态：
 *   A 焦点在编辑器外（侧栏/对话框等）
 *   B 光标点进笔记、一个字都没打
 *   D 光标在笔记里且打过字（Slate 建立了自己的选区）
 *   C 按键落在 .editor-view 内、但目标不可编辑（笔记图标/空白等）
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'hotkey-audit')
const sleeps = ms => new Promise(r => setTimeout(r, ms))
async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res, rej) => s.close(e => e ? rej(e) : res()))
  return port
}
const PORT = await freePort(), DEBUG_PORT = await freePort()
await mkdir(outDir, { recursive: true })
const profile = await mkdtemp(path.join(outDir, 'profile-'))

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

const consoleTail = () => cdp.events.filter(e => e.method === 'Runtime.consoleAPICalled').slice(-4)
  .map(e => (e.params.args || []).map(a => String(a.value ?? a.description ?? '')).join(' ').slice(0, 160))
const die = where => {
  console.error(`\n[诊断] ${where}`)
  console.error('[诊断] 控制台尾部:', JSON.stringify(consoleTail()))
  console.error('[诊断] 应用输出尾部:', logs.split('\n').slice(-20).join('\n'))
  console.error('[诊断] 已完成结果:', JSON.stringify(results, null, 2))
  child.kill('SIGTERM')
  process.exit(0)
}
const evalWithTimeout = (expression, ms = 12000) => Promise.race([
  cdp.evaluate(expression),
  sleeps(ms).then(() => { throw new Error(`evaluate 超时 ${ms}ms`) }),
])
const callWithTimeout = (method, params = {}, ms = 12000) => Promise.race([
  cdp.call(method, params),
  sleeps(ms).then(() => { throw new Error(`${method} 超时 ${ms}ms`) }),
])

for (let i = 0; i < 90; i++) {
  if (await evalWithTimeout(`!!document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')`).catch(() => false)) break
  await sleeps(1000)
}

const installProbes = `(() => {
  const app = window.__notekitApp
  const hk = app.addons.hotkey
  window.__audit = { hits: [], listen: [], keydowns: [] }
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
  document.addEventListener('keydown', e => window.__audit.keydowns.push({ key: e.key, meta: e.metaKey, target: (e.target.className || '').toString().slice(0, 30) }), true)
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
console.log(`命令数：${commands.length}`)

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
  await sleeps(700)
}

const keyEvent = press => ({ modifiers: press.modifiers, key: press.key, code: press.code, windowsVirtualKeyCode: press.vk, nativeVirtualKeyCode: press.vk })
const pressReal = async (press, ms = 180) => {
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(press), type: 'rawKeyDown' })
  await callWithTimeout('Input.dispatchKeyEvent', { ...keyEvent(press), type: 'keyUp' })
  await sleeps(ms)
}

const stateA = async () => {
  await evalWithTimeout(`(() => { document.activeElement?.blur?.(); document.body.setAttribute('tabindex','-1'); document.body.focus(); return true })()`)
  await sleeps(150)
  return (await evalWithTimeout(`!document.activeElement?.matches?.('.editor-view *')`)) ? true : '焦点仍在意内'
}

const stateB = async (type = false) => {
  const point = await evalWithTimeout(`(() => {
    const el = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 10) return null
    return { x: Math.round(r.left + 30), y: Math.round(r.top + Math.min(20, r.height / 2)) }
  })()`)
  if (!point) return '找不到可编辑笔记'
  for (const type of ['mousePressed', 'mouseReleased']) await callWithTimeout('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await sleeps(250)
  const focused = await evalWithTimeout(`(() => { const el = document.activeElement; return !!(el && el.isContentEditable && el.closest('.editor-view')) })()`)
  if (!focused) return '焦点不在编辑器'
  if (type) {
    // 用户打字后 Slate 才会建立自己的选区
    await callWithTimeout('Input.insertText', { text: 'x' }, 8000)
    await sleeps(250)
    await pressReal({ modifiers: 0, key: 'Backspace', code: 'Backspace', vk: 8 })
  }
  await sleeps(200)
  const probe = { modifiers: 0, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 }
  await pressReal(probe, 120)
  await evalWithTimeout(`window.__audit = { hits: [], listen: [], keydowns: [] }`)
  return true
}

const stateC = async () => (await evalWithTimeout(`!!(document.querySelector('.editor-view .node-head') || document.querySelector('.editor-view'))`)) ? true : '不可达'

const fireC = async press => {
  await evalWithTimeout(`(() => {
    const target = document.querySelector('.editor-view .node-head') || document.querySelector('.editor-view')
    const event = new KeyboardEvent('keydown', { key: ${JSON.stringify(press.key)}, code: ${JSON.stringify(press.code)}, bubbles: true, cancelable: true,
      metaKey: ${(press.modifiers & 4) !== 0}, ctrlKey: ${(press.modifiers & 2) !== 0}, altKey: ${(press.modifiers & 1) !== 0}, shiftKey: ${(press.modifiers & 8) !== 0} })
    target.dispatchEvent(event)
    return true
  })()`)
  await sleeps(180)
}

for (const cmd of commands) {
  const row = { id: cmd.id, title: cmd.title, hotkey: cmd.hotkey, context: cmd.context, A: null, B: null, D: null, C: null, skips: [] }
  // 每条命令前重载一次：上一条命令按过的 Enter/Backspace/Tab 等会把编辑器状态搞脏，
  // 不重载的话后面的命令会测到退化状态（上一次就是这么误判 ⌘↑ 的）
  await reset(true).catch(() => {})
  for (const state of ['A', 'B', 'D', 'C']) {
    try {
      const ready = state === 'A' ? await stateA() : state === 'B' ? await stateB(false) : state === 'D' ? await stateB(true) : await stateC()
      if (ready !== true) { row.skips.push(`${state}:${ready}`); continue }
      await evalWithTimeout(`window.__audit = { hits: [], listen: [], keydowns: [] }`)
      if (state === 'C') await fireC(cmd.press); else await pressReal(cmd.press)
      const [hits, listen, keydowns] = await evalWithTimeout(`[window.__audit.hits, window.__audit.listen, window.__audit.keydowns]`)
      row[state] = { hits: hits.filter(h => h === cmd.id).length, listenCalls: listen.length, selection: listen.some(l => l.hasSelection), reached: keydowns.length }
    } catch (error) {
      row.skips.push(`${state}:${String(error).slice(0, 50)}`)
      try { await reset(true) } catch (reloadError) { die(`重载失败：${String(reloadError).slice(0, 120)}`) }
    }
  }
  results.push(row)
  const mark = s => row[s] ? (row[s].hits ? `✅${row[s].hits > 1 ? row[s].hits + 'x' : ''}` : '❌') : '·'
  console.log(`${mark('A')}A ${mark('B')}B ${mark('D')}D ${mark('C')}C  ${String(row.context).padEnd(10)} ${String(row.hotkey).padEnd(16)} ${row.id}${row.skips.length ? '  ' + row.skips.join(',') : ''}`)
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2))
}

const dead = results.filter(r => !(r.A?.hits) && !(r.B?.hits) && !(r.D?.hits) && !(r.C?.hits))
const editorOnly = results.filter(r => !(r.A?.hits) && !(r.C?.hits) && (r.B?.hits))
const doubleFire = results.filter(r => (r.A?.hits ?? 0) > 1 || (r.B?.hits ?? 0) > 1 || (r.D?.hits ?? 0) > 1 || (r.C?.hits ?? 0) > 1)
const clickOnlyBroken = results.filter(r => !(r.B?.hits) && (r.D?.hits))
console.log('\n=== 三种状态都不触发 ===')
for (const r of dead) console.log(`  ${r.id} [${r.context}] ${r.hotkey} ${JSON.stringify(r.skips)}`)
console.log('\n=== 只有光标在笔记里（打字建立选区后）才有效 ===')
for (const r of editorOnly) console.log(`  ${r.id} [${r.context}] ${r.hotkey}`)
console.log('\n=== 点进笔记（不打字）时仍不触发、打字后才触发 ===')
for (const r of clickOnlyBroken) console.log(`  ${r.id} [${r.context}] ${r.hotkey}`)
console.log('\n=== 一次按键触发多次 ===')
for (const r of doubleFire) console.log(`  ${r.id} A=${r.A?.hits} B=${r.B?.hits} C=${r.C?.hits}`)
child.kill('SIGTERM')
process.exit(0)
