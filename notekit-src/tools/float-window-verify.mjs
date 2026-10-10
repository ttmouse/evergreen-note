/**
 * 「浮层 → 独立窗口」验收（隔离实例，不动用户数据）
 *
 * 用法：先 pnpm build，再 node tools/float-window-verify.mjs
 * 输出：test-runs/float-window-verify/*.png + result.json
 *
 * 覆盖：
 *   S0 应用就绪，拿到当前笔记 ky
 *   S1 浮层卡片标题栏出现「↗ 弹出为独立窗口」按钮（.nk-popout-btn）
 *   S2 点它 → 主进程开出第二个原生窗口（CDP 出现 ?pop=<ky> 的 page target）
 *   S3 新窗口里 body.nk-float-window 生效、主界面 .app-root-node 收起、
 *      浮层卡片铺满窗口、正文渲染出来、窗口标题=笔记标题
 *   S4 同一 ky 再点一次不新增窗口（去重）
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'float-window-verify')
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

async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`)
  return res.json()
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

/** 等到出现满足条件的 CDP page target（浮窗是另一个 target，必须按 URL 挑） */
async function connectTarget(port, predicate, label, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try {
      const target = (await listTargets(port)).find((t) => t.type === 'page' && !t.url.startsWith('devtools:') && predicate(t))
      if (target) return openWs(target.webSocketDebuggerUrl)
    } catch {}
    await sleep(500)
  }
  throw new Error(`找不到 CDP 目标：${label}`)
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

const clickSelector = async (cdp, selector) => {
  const box = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!box) throw new Error(`点不到元素：${selector}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.call('Input.dispatchMouseEvent', { type, x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 })
  }
  return box
}

let main = null
let pop = null
try {
  main = await connectTarget(DEBUG_PORT, (t) => !t.url.includes('pop='), '主窗口')
  // 应用就绪：知识库加载完成且正文编辑器已挂载
  let ready = null
  for (let i = 0; i < 240; i++) {
    ready = await main.evaluate(`(() => {
      const $ = window.__notekitApp?.addons
      return {
        db: !!$?.dbMemory?.initFinished,
        editor: !!document.querySelector('.item-editor[contenteditable=true]'),
        ky: $?.main?.workspaceActiveKey || '',
      }
    })()`).catch(() => null)
    if (ready?.db && ready?.editor) break
    await sleep(500)
  }
  if (!ready?.db || !ready?.editor) throw new Error('应用未就绪，日志尾部：' + logs.slice(-1200))

  // 空白库里工作区落在虚拟页（diaries）上，它没有可被第二个窗口读到的 ky。
  // 用应用自己的 createTopic 建一篇真主题，并 flush 落库——独立窗口是另一个
  // renderer，只能看到服务端 SQLite 里的数据，草稿/未落库的节点它读不到。
  const ky = await main.evaluate(`(() => {
    const $ = window.__notekitApp.addons
    const topic = $.topic.createTopic('独立窗口验收笔记 ' + Date.now())
    return topic?.ky || ''
  })()`)
  await main.evaluate(`window.__notekitApp.addons.dbDisk.flush()`)
  check('S0 应用就绪并建好验收笔记（已落库）', !!ky, { ky })
  if (!ky) throw new Error('没能建出验收笔记')

  // ── S1 浮层卡片带「↗」按钮 ─────────────────────────────────────────────
  await main.evaluate(`window.__notekitApp.addons.floatViewer.show({ item: ${JSON.stringify(ky)}, isPin: true })`)
  let btn = null
  for (let i = 0; i < 60; i++) {
    btn = await main.evaluate(`(() => {
      const el = document.querySelector('.nk-popout-btn')
      const dlg = document.querySelector('.nui-dialog.dialog-float-viewer')
      return el && dlg ? { btn: !!el, dlg: true } : null
    })()`).catch(() => null)
    if (btn) break
    await sleep(300)
  }
  check('S1 浮层卡片标题栏出现「弹出为独立窗口」按钮', !!btn, btn)
  await shot(main, '01-float-layer-main-window.png')
  // 标题栏局部放大图（CDP clip 直接抓，不靠事后裁剪坐标猜位置），
  // 证据图里用它把 ↗ 摆到用户眼前。
  const headClip = await main.evaluate(`(() => {
    const head = document.querySelector('.nui-dialog.dialog-float-viewer .nui-dialog-head')
    if (!head) return null
    const r = head.getBoundingClientRect()
    return { x: Math.max(0, r.x - 210), y: Math.max(0, r.y - 6), width: r.width + 220, height: r.height + 12 }
  })()`)
  if (headClip) {
    const zoom = await main.call('Page.captureScreenshot', { format: 'png', clip: { ...headClip, scale: 2 } })
    await writeFile(path.join(outDir, '01b-card-head-zoom.png'), Buffer.from(zoom.data, 'base64'))
    console.log('   ↳ 截图 01b-card-head-zoom.png')
  }

  // ── S2 点按钮 → 开出第二个原生窗口 ─────────────────────────────────────
  const popoutBox = await clickSelector(main, '.nk-popout-btn')
  pop = await connectTarget(DEBUG_PORT, (t) => t.url.includes('pop='), '独立窗口')
  const popUrl = (await listTargets(DEBUG_PORT)).find((t) => t.type === 'page' && t.url.includes('pop='))?.url ?? ''
  check('S2 点「↗」后开出第二个原生窗口（?pop=<ky>）', popUrl.includes(`pop=${encodeURIComponent(ky)}`), { popUrl })

  // ── S3 浮窗里只渲染那篇笔记 ────────────────────────────────────────────
  let state = null
  for (let i = 0; i < 120; i++) {
    state = await pop.evaluate(`(() => {
      const root = document.querySelector('.app-root-node')
      const dlg = document.querySelector('.nui-dialog.dialog-float-viewer')
      const head = document.querySelector('.nui-dialog-head')
      const editor = document.querySelector('.nui-dialog-body .editor-view')
      const r = dlg?.getBoundingClientRect()
      return {
        klass: document.body.classList.contains('nk-float-window'),
        rootHidden: root ? getComputedStyle(root).display === 'none' : null,
        hasDialog: !!dlg,
        headHidden: head ? getComputedStyle(head).display === 'none' : null,
        hasEditor: !!editor,
        title: document.title,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        client: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight },
      }
    })()`).catch(() => null)
    if (state?.hasDialog && state?.hasEditor) break
    await sleep(500)
  }
  check('S3a body 带 nk-float-window 且主界面收起', !!state?.klass && state?.rootHidden === true, state)
  check('S3b 浮层卡片铺满窗口', !!state?.rect && Math.abs(state.rect.w - state.client.w) <= 2 && Math.abs(state.rect.h - state.client.h) <= 2, state)
  check('S3c 卡片标题栏在浮窗内隐藏（交给原生标题栏）', state?.headHidden === true, state)
  check('S3d 正文编辑器渲染出来', state?.hasEditor === true, state)
  check('S3e 窗口标题取到笔记标题', !!state?.title && state.title !== 'Evergreen note', { title: state?.title })
  await shot(pop, '02-independent-window.png')

  // ── S4 去重：同一 ky 再点一次不新增窗口 ────────────────────────────────
  const before = (await listTargets(DEBUG_PORT)).filter((t) => t.type === 'page' && t.url.includes('pop=')).length
  await clickSelector(main, '.nk-popout-btn')
  await sleep(1500)
  const after = (await listTargets(DEBUG_PORT)).filter((t) => t.type === 'page' && t.url.includes('pop=')).length
  check('S4 同一笔记重复点「↗」不新增窗口', before === 1 && after === 1, { before, after })

  // ── S5 浮窗启动不触发「只有主窗口能调」的主进程报错 ─────────────────────
  const bootErrors = logs.split('\n').filter((line) => line.includes('仅允许应用主窗口'))
  check('S5 浮窗启动无越权 IPC 报错', bootErrors.length === 0, { bootErrors, tail: logs.slice(-400) })

  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ ky, popoutBox, results, failures }, null, 2))
  console.log(`\n结果：${results.length - failures.length}/${results.length} 通过`)
  if (failures.length) console.log('失败：' + failures.join('、'))
} catch (error) {
  console.error('❌ 验收中断：', error?.message ?? error)
  console.error('应用日志尾部：\n' + logs.slice(-2000))
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ results, failures, fatal: String(error?.message ?? error) }, null, 2))
  process.exitCode = 1
} finally {
  try { pop?.close() } catch {}
  try { main?.close() } catch {}
  child.kill('SIGKILL')
}
