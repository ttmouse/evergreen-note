/**
 * D125F26FCF5E-24「右侧AI侧边栏的输入框里不能换行」验收（隔离实例，不动用户数据）
 *
 * 用法：先 pnpm build，再 node tools/ai-input-newline-verify.mjs
 * 输出：test-runs/ai-input-newline-verify/*.png + result.json
 *
 * 覆盖：
 *   S1 应用就绪并打开 AI 面板，底部输入控件是 textarea（可承载多行）
 *   S2 Shift+Enter 真实插入换行（draft 变两行、面板未发送）
 *   S3 回车发送：draft 清空、会话用户消息包含两行文本、textarea 高度收回
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'ai-input-newline-verify')
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const profile = path.join(outDir, 'profile')
await mkdir(profile, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function freePort() {
  const s = net.createServer()
  await new Promise((res, rej) => { s.once('error', rej); s.listen(0, '127.0.0.1', res) })
  const { port } = s.address()
  await new Promise((res) => s.close(res))
  return port
}

async function openWs(wsUrl) {
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = (e) => {
    const message = JSON.parse(e.data)
    if (message.id && pending.has(message.id)) {
      const p = pending.get(message.id)
      pending.delete(message.id)
      message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result)
    }
  }
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    pending.set(key, { resolve, reject })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
  await call('Runtime.enable')
  await call('Page.enable')
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { call, evaluate, close: () => socket.close() }
}

const APP_PORT = await freePort()
const DEBUG_PORT = await freePort()
const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '', NOTEKIT_PORT: String(APP_PORT), NOTEKIT_USER_DATA: profile },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', (d) => { logs += d })
child.stderr.on('data', (d) => { logs += d })

const results = []
const failures = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ' —— ' + JSON.stringify(detail)}`)
  if (!ok) failures.push(name)
}
const shot = async (cdp, name) => {
  const img = await cdp.call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, name), Buffer.from(img.data, 'base64'))
  console.log(`   ↳ 截图 ${name}`)
}

let main = null
try {
  let target = null
  for (let i = 0; i < 240 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      target = (await res.json()).find((t) => t.type === 'page' && !t.url.startsWith('devtools:') && !t.url.includes('pop='))
    } catch {}
    if (!target) await sleep(500)
  }
  if (!target) throw new Error('找不到主窗口 CDP 目标，日志尾部：' + logs.slice(-1200))
  main = await openWs(target.webSocketDebuggerUrl)

  let ready = null
  for (let i = 0; i < 240; i++) {
    ready = await main.evaluate(`(() => {
      const $ = window.__notekitApp?.addons
      return { db: !!$?.dbMemory?.initFinished, panel: !!$?.aiPanel }
    })()`).catch(() => null)
    if (ready?.db && ready?.panel) break
    await sleep(500)
  }
  if (!ready?.db || !ready?.panel) throw new Error('应用未就绪，日志尾部：' + logs.slice(-1200))
  await main.evaluate(`window.__notekitApp.addons.aiPanel.open(); true`)
  await sleep(800)

  // S1 输入控件是 textarea
  const s1 = await main.evaluate(`(() => {
    const el = document.querySelector('.ai-panel-area textarea')
    return { isTextarea: !!el, rows: el?.rows, ph: el?.getAttribute('placeholder') }
  })()`)
  check('S1 输入控件是 textarea', s1.isTextarea, s1)

  // 聚焦并真实键入第一行
  await main.evaluate(`document.querySelector('.ai-panel-area textarea').focus(); true`)
  await main.call('Input.insertText', { text: '第一行测试' })
  await main.evaluate(`window.__keyProbe = []; document.querySelector('.ai-panel-area textarea').addEventListener('keydown', (e) => window.__keyProbe.push({ key: e.key, shift: e.shiftKey })); true`)

  // S2 Shift+Enter 换行（真实按键序列：shift按下→Enter down/up→shift抬起）
  const shiftDown = { type: 'rawKeyDown', modifiers: 8, windowsVirtualKeyCode: 16, code: 'ShiftLeft', key: 'Shift' }
  const enterDown = { type: 'keyDown', modifiers: 8, windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter', text: '\r', unmodifiedText: '\r' }
  const enterUp = { type: 'keyUp', modifiers: 8, windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' }
  const shiftUp = { type: 'keyUp', modifiers: 0, windowsVirtualKeyCode: 16, code: 'ShiftLeft', key: 'Shift' }
  for (const ev of [shiftDown, enterDown, enterUp, shiftUp]) await main.call('Input.dispatchKeyEvent', ev)
  await main.call('Input.insertText', { text: '第二行内容' })
  await sleep(300)
  const s2 = await main.evaluate(`(() => {
    const el = document.querySelector('.ai-panel-area textarea')
    return { value: el.value, lines: el.value.split('\\n').length, height: el.getBoundingClientRect().height, probe: window.__keyProbe }
  })()`)
  check('S2 Shift+Enter 插入换行（两行、未发送）', s2.lines === 2 && s2.value.includes('第一行测试\n第二行内容'), s2)
  await shot(main, 'two-lines.png')

  // S3 回车发送：清空 + 用户消息含两行
  await main.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 0, windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter', text: '\r', unmodifiedText: '\r' })
  await sleep(1500)
  const s3 = await main.evaluate(`(() => {
    const el = document.querySelector('.ai-panel-area textarea')
    return { value: el.value, height: el.getBoundingClientRect().height }
  })()`)
  check('S3 回车发送后清空并收回高度', s3.value === '' && s3.height < 40, s3)

  await main.evaluate(`(() => {
    const el = document.querySelector('.ai-panel-area textarea'); el.focus(); return true
  })()`)
  await main.call('Input.insertText', { text: '发送后重新输入多行演示：' })
  for (const ev of [shiftDown, enterDown, enterUp, shiftUp]) await main.call('Input.dispatchKeyEvent', ev)
  await main.call('Input.insertText', { text: '第二行留给你看效果' })
  await sleep(400)
  await shot(main, 'final-multiline.png')
} catch (e) {
  failures.push('EXCEPTION: ' + e.message)
  console.error('异常：', e.message, '\\n日志尾部：', logs.slice(-1500))
} finally {
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures }, null, 2))
  child.kill()
}
process.exit(failures.length ? 1 : 0)
