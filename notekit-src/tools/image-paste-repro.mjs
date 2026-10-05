/**
 * 图片粘贴失败路径复现探针（task-1）
 *
 * 隔离运行：独立 NOTEKIT_USER_DATA profile + 独立端口，绝不触碰真实库。
 * 只读 src/，本文件是唯一新增的生产目录文件（tools/ 下探针）。
 *
 * 三条证据线：
 *  A) React 合成事件路径  —— 真实 canvas PNG File + DataTransfer + dispatchEvent('paste')
 *  B) 真实系统粘贴路径    —— CDP Input.dispatchKeyEvent Cmd+V（Electron 主进程剪贴板预置图片）
 *  C) 后端独立验证        —— 页面内直接 fetch /api/saveB64Image，绕开前端
 *
 * 输出：test-runs/image-paste-repro/image-paste-repro.json
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from './cdp-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(root, '..', 'test-runs', 'image-paste-repro')
const report = { task: 'task-1', startedAt: new Date().toISOString(), steps: {}, console: [], exceptions: [], network: [] }
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
await mkdir(outDir, { recursive: true })

const dataDir = path.join(profile, 'serverdata')
report.isolation = { appPort: APP_PORT, debugPort: DEBUG_PORT, profile, dataDir, realProfileTouched: false }
console.log(`[iso] port=${APP_PORT} debugPort=${DEBUG_PORT} profile=${profile}`)

const ELECTRON_BIN = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
const child = spawn(ELECTRON_BIN, ['desktop/main.cjs', `--remote-debugging-port=${DEBUG_PORT}`], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    NOTEKIT_PORT: String(APP_PORT),
    NOTEKIT_USER_DATA: profile,
    NOTEKIT_DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let childOut = ''
child.stdout.on('data', d => { childOut += d })
child.stderr.on('data', d => { childOut += d })
report.childSpawn = { pid: child.pid, bin: ELECTRON_BIN }

let cdp = null
for (let i = 0; i < 120 && !cdp; i++) { try { cdp = await connect(DEBUG_PORT) } catch { await sleeps(500) } }
if (!cdp) {
  report.fatal = 'CDP 连接失败，Electron 未起来'
  report.childOut = childOut.slice(-4000)
  await writeFile(path.join(outDir, 'image-paste-repro.json'), JSON.stringify(report, null, 2))
  child.kill('SIGKILL'); process.exit(1)
}

// 开 Network 域，抓 /api/saveB64Image 是否发出
await cdp.call('Network.enable').catch(e => { report.networkEnableError = String(e) })
const ev = e => cdp.evaluate(e)
const evalT = async (expr, ms = 20000) => {
  const r = await Promise.race([ev(expr), sleeps(ms).then(() => { throw new Error('evaluate 超时') })])
  return r
}
const callT = (m, p = {}) => cdp.call(m, p)

// ---- 等应用起来 ----
for (let i = 0; i < 120; i++) {
  const ok = await evalT(`!!window.__notekitApp`, 5000).catch(() => false)
  if (ok) break
  await sleeps(1000)
}
report.appBooted = await evalT(`!!window.__notekitApp`).catch(() => false)
report.appName = await evalT(`window.__notekitApp && window.__notekitApp.appName`).catch(() => null)
report.appmark = await evalT(`typeof window.__notekitApp?.states?.appStarted`).catch(() => null)

// ---- 等 addonRun 全部跑完（Img.addonRun 的 cover 发生在这里）----
// app.ready() -> execAddonRunAll()。用 addons.img 上是否有 inlinesBar items / 直接看 cover 结果判断
for (let i = 0; i < 90; i++) {
  const done = await evalT(`(() => {
    const a = window.__notekitApp
    if (!a || !a.addons || !a.addons.img || !a.addons.paste) return false
    // appStarted 之后 execAddonRunAll 才开始；这里再额外等 paste.onPaste 有 addon 绑定
    return !!(a.addons.paste.onPaste && a.addons.paste.onPaste.addon) && !!a.addons.img.inlinesBarAddItems
  })()`, 5000).catch(() => false)
  if (done) break
  await sleeps(1000)
}

/* ============================ 1. cover 是否生效 ============================ */
report.steps.coverState = await evalT(`(() => {
  const a = window.__notekitApp
  const paste = a?.addons?.paste
  const img = a?.addons?.img
  const fn = paste?.onPaste
  const src = typeof fn === 'function' ? String(fn) : ''
  const orig = fn?.original
  const origSrc = typeof orig === 'function' ? String(orig) : ''
  return {
    imgAddonExists: !!img,
    imgEnabled: a.isAddonEnabled('img'),
    imgAddonInfo: typeof img?.addonInfo === 'function' ? img.addonInfo() : null,
    pasteOnPasteType: typeof fn,
    pasteOnPasteFnName: fn?.fnName ?? null,
    pasteOnPasteHasAddon: typeof fn?.addon === 'object',
    pasteOnPasteDisplayName: fn?.displayName ?? null,
    pasteOnPasteSourceLen: src.length,
    pasteOnPasteSourceHead: src.slice(0, 400),
    pasteOnPasteHasImageBranch: src.includes('image'),
    hasOriginal: typeof orig === 'function',
    originalSourceLen: origSrc.length,
    originalHasImageBranch: origSrc.includes('image'),
    originalHead: origSrc.slice(0, 300),
    // Img.onPaste 自己有没有被 cover 过
    imgOnPasteHasAddon: typeof img?.onPaste?.addon === 'object',
    imgOnPasteFnName: img?.onPaste?.fnName ?? null,
    imgAddonRunHasAddon: typeof img?.addonRun?.addon === 'object',
  }
})()`)
console.log('[1] cover 状态:', JSON.stringify(report.steps.coverState, null, 2).slice(0, 1600))

/* ============================ 2. 准备一个可编辑的节点 ============================ */
const routeOk = await evalT(`(async () => {
  const a = window.__notekitApp
  const t = a.addons.topic
  const title = 'image-paste-probe'
  if (typeof t.route === 'function') { try { await t.route(title) } catch (e) { return 'route-error:' + e.message } }
  return 'routed'
})()`, 15000).catch(e => 'eval-error:' + String(e))
report.steps.route = routeOk
await sleeps(1500)

const editorReady = await (async () => {
  for (let i = 0; i < 60; i++) {
    const ok = await evalT(`(() => {
      const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
             || document.querySelector('.editor-view [contenteditable="true"]')
             || document.querySelector('[contenteditable="true"]')
      return !!ce
    })()`, 5000).catch(() => false)
    if (ok) return true
    await sleeps(1000)
  }
  return false
})()
report.steps.editorReady = editorReady
report.steps.domSnapshot = await evalT(`(() => ({
  contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
  editorViews: document.querySelectorAll('.editor-view').length,
  nodes: document.querySelectorAll('.editor-view .node').length,
  bodyTextHead: document.body.innerText.slice(0, 300),
}))()`)

/* ============ 3. 安装 fetch 计数 + 监听 error/unhandledrejection（页面侧） ============ */
await evalT(`(() => {
  window.__probe = { fetchCalls: [], errors: [], rejections: [], pasteEvents: [], imgPasteCalls: 0 }
  const of = window.fetch
  window.fetch = function(...args) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '')
      window.__probe.fetchCalls.push({ url: String(url).slice(0, 120), t: Date.now() })
    } catch {}
    return of.apply(this, args)
  }
  window.addEventListener('error', e => window.__probe.errors.push({ message: e.message, stack: String(e.error && e.error.stack || '').slice(0, 600) }), true)
  window.addEventListener('unhandledrejection', e => window.__probe.rejections.push({ reason: String(e.reason && e.reason.stack || e.reason).slice(0, 800) }))
  window.addEventListener('paste', e => {
    const items = e.clipboardData ? [...e.clipboardData.items].map(i => i.type) : []
    window.__probe.pasteEvents.push({ items, files: e.clipboardData ? e.clipboardData.files.length : -1, target: (e.target && e.target.className) ? String(e.target.className).slice(0,80) : String(e.target && e.target.tagName) })
  }, true)
  // 包装 img.onPaste 记录是否被调用（只在探针里，不改源码）
  const img = window.__notekitApp.addons.img
  if (!img.__probeWrapped) {
    const origPaste = img.onPaste
    img.onPaste = function(...a) { window.__probe.imgPasteCalls++; return origPaste.apply(this, a) }
    img.__probeWrapped = true
  }
  return 'probe-installed'
})()`)

/* ============ 4. A) React 合成事件路径：真实 PNG File + dispatchEvent ============ */
report.steps.pathA = await evalT(`(async () => {
  const out = { phase: 'A', notes: [] }
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
          || document.querySelector('.editor-view [contenteditable="true"]')
          || document.querySelector('[contenteditable="true"]')
  if (!ce) { out.error = '找不到 contenteditable'; return out }
  ce.focus()

  // 真实 PNG：canvas.toBlob
  const canvas = document.createElement('canvas')
  canvas.width = 48; canvas.height = 32
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#3366ff'; ctx.fillRect(0, 0, 48, 32)
  ctx.fillStyle = '#ffcc00'; ctx.fillRect(8, 8, 16, 12)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  out.blob = { size: blob.size, type: blob.type }
  const file = new File([blob], 'probe-canvas.png', { type: 'image/png' })
  out.file = { name: file.name, size: file.size, type: file.type }

  // 真实的结构性验证：PNG magic
  const bytes = new Uint8Array(await blob.arrayBuffer())
  out.pngMagic = [...bytes.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join(' ')

  const dt = new DataTransfer()
  dt.items.add(file)
  out.dtItems = [...dt.items].map(i => i.type)
  out.dtFiles = dt.files.length
  out.dtTypes = [...dt.types]

  const before = {
    fetchCalls: window.__probe.fetchCalls.length,
    imgPasteCalls: window.__probe.imgPasteCalls,
    pasteEvents: window.__probe.pasteEvents.length,
    imgBlocks: document.querySelectorAll('.editor-view [data-slate-node="element"] img, .editor-view img.picture, .editor-view .element-img').length,
  }
  out.before = before

  const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  out.eventClipboardDataOk = !!evt.clipboardData
  out.eventItemsAfterConstruct = evt.clipboardData ? [...evt.clipboardData.items].map(i => i.type) : null
  const dispatched = ce.dispatchEvent(evt)
  out.dispatchReturn = dispatched
  out.defaultPrevented = evt.defaultPrevented

  await new Promise(r => setTimeout(r, 3000))

  out.after = {
    fetchCalls: window.__probe.fetchCalls.length,
    newFetchCalls: window.__probe.fetchCalls.slice(before.fetchCalls),
    imgPasteCalls: window.__probe.imgPasteCalls,
    pasteEvents: window.__probe.pasteEvents,
    imgBlocks: document.querySelectorAll('.editor-view [data-slate-node="element"] img, .editor-view img.picture, .editor-view .element-img').length,
    errors: window.__probe.errors,
    rejections: window.__probe.rejections,
  }
  return out
})()`, 40000).catch(e => ({ phase: 'A', evalError: String(e) }))
console.log('[A] React 合成事件路径:', JSON.stringify(report.steps.pathA).slice(0, 1500))

/* ============ 5. B) 真实系统粘贴：主进程剪贴板预置图片 + CDP Cmd+V ============ */
// 剪贴板注入在 BrowserWindow 之外不可行：CDP Input.insertText 只写文本，
// Electron clipboard.writeImage 需要主进程脚本。这里先尝试 CDP
// Input.dispatchKeyEvent（真实按键），并记录剪贴板是否真有图片。
report.steps.pathB = await evalT(`(async () => {
  const out = { phase: 'B', notes: [] }
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
          || document.querySelector('.editor-view [contenteditable="true"]')
          || document.querySelector('[contenteditable="true"]')
  if (!ce) { out.error = '找不到 contenteditable'; return out }
  ce.focus()
  out.focused = document.activeElement === ce || ce.contains(document.activeElement) || document.activeElement === document.body
  out.activeElement = String(document.activeElement?.tagName) + '.' + String(document.activeElement?.className || '').slice(0, 60)
  // 尝试通过 navigator.clipboard.read 探测系统剪贴板里有没有图片
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read()
      out.clipboardRead = items.map(i => i.types)
      out.clipboardHasImage = items.some(i => i.types.some(t => t.startsWith('image/')))
    } else { out.clipboardRead = 'navigator.clipboard.read 不可用' }
  } catch (e) { out.clipboardReadError = String(e) }
  return out
})()`, 20000).catch(e => ({ phase: 'B', evalError: String(e) }))
console.log('[B] 剪贴板探测:', JSON.stringify(report.steps.pathB).slice(0, 1200))

// 真实 Cmd+V
const focusForB = await evalT(`(() => {
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]')
          || document.querySelector('.editor-view [contenteditable="true"]')
          || document.querySelector('[contenteditable="true"]')
  if (!ce) return 'no-ce'
  ce.focus()
  const sel = getSelection(); const r = document.createRange()
  r.selectNodeContents(ce); r.collapse(true); sel.removeAllRanges(); sel.addRange(r)
  return 'focused'
})()`).catch(e => 'err:' + String(e))
report.steps.pathBFocus = focusForB
const beforeBFetch = await evalT(`window.__probe.fetchCalls.length`).catch(() => -1)
await callT('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, text: 'v', unmodifiedText: 'v' }).catch(e => { report.steps.pathBKeyError = String(e) })
await sleeps(200)
await callT('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 }).catch(() => {})
await sleeps(2500)
report.steps.pathBResult = await evalT(`(() => ({
  pasteEvents: window.__probe.pasteEvents,
  fetchCalls: window.__probe.fetchCalls.length,
  imgPasteCalls: window.__probe.imgPasteCalls,
  errors: window.__probe.errors,
  rejections: window.__probe.rejections,
  editorText: (document.querySelector('.editor-view.editor-from-router [contenteditable="true"]') || document.querySelector('[contenteditable="true"]'))?.innerText?.slice(0, 200) ?? null,
}))()`).catch(e => ({ evalError: String(e) }))
report.steps.pathBBeforeFetchCount = beforeBFetch
console.log('[B] 真实 Cmd+V 结果:', JSON.stringify(report.steps.pathBResult).slice(0, 1200))

/* ============ 6. 直接调用 Img.onPaste / 直接调 cover 过的 $.paste.onPaste ============ */
// 用一个真实 ClipboardEvent 直接调 $.paste.onPaste（绕开 React），看覆盖版是否把图片交给 Img
report.steps.directCall = await evalT(`(async () => {
  const out = {}
  const a = window.__notekitApp
  const ce = document.querySelector('.editor-view.editor-from-router [contenteditable="true"]') || document.querySelector('[contenteditable="true"]')
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0f0'; ctx.fillRect(0, 0, 16, 16)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  const file = new File([blob], 'direct.png', { type: 'image/png' })
  const dt = new DataTransfer(); dt.items.add(file)
  const nativeEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  out.nativeItems = [...nativeEvent.clipboardData.items].map(i => i.type)
  // React 合成事件 shim
  const reactEvent = { nativeEvent, preventDefault() { this.__pd = true }, __pd: false }
  // 找 editor：从 DOM 上的 $editor 拿
  const node = document.querySelector('.editor-view .node')
  const editor = node && node.$editor
  out.editorFound = !!editor
  const before = { fetch: window.__probe.fetchCalls.length, imgPasteCalls: window.__probe.imgPasteCalls }
  let ret, err = null
  try {
    ret = a.addons.paste.onPaste(reactEvent, editor)
  } catch (e) { err = String(e && e.stack || e).slice(0, 800) }
  out.returnValue = (() => { try { return JSON.stringify(ret) } catch { return String(ret) } })()
  out.threw = err
  out.preventDefaultCalled = reactEvent.__pd
  await new Promise(r => setTimeout(r, 2500))
  out.after = {
    fetchCalls: window.__probe.fetchCalls.slice(before.fetch),
    imgPasteCalls: window.__probe.imgPasteCalls - before.imgPasteCalls,
    errors: window.__probe.errors,
    rejections: window.__probe.rejections,
  }
  return out
})()`, 40000).catch(e => ({ evalError: String(e) }))
console.log('[6] 直接调用 $.paste.onPaste:', JSON.stringify(report.steps.directCall).slice(0, 1500))

/* ============ 7. C) 后端独立验证：页面内直接 fetch /api/saveB64Image ============ */
report.steps.pathC = await evalT(`(async () => {
  const out = { phase: 'C', notes: [] }
  const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 24
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e91e63'; ctx.fillRect(0, 0, 40, 24)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  const dataURL = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })
  out.dataURLHead = String(dataURL).slice(0, 40)
  out.dataURLLen = String(dataURL).length

  // 用 FormData（任务要求）打一次
  const fd = new FormData()
  fd.append('uri', dataURL)
  fd.append('filename', 'probe-backend-formdata.png')
  out.formDataSent = true
  try {
    const r = await fetch('/api/saveB64Image', { method: 'POST', body: fd })
    const j = await r.json()
    out.formDataResponse = { status: r.status, body: j }
  } catch (e) { out.formDataError = String(e) }

  // 再用纯 base64 重试一次，确认服务端逻辑
  try {
    const r2 = await fetch('/api/saveB64Image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: dataURL, filename: 'probe-backend-json.png' })
    })
    const j2 = await r2.json()
    out.jsonResponse = { status: r2.status, body: j2 }
  } catch (e) { out.jsonError = String(e) }
  return out
})()`, 40000).catch(e => ({ phase: 'C', evalError: String(e) }))
console.log('[C] 后端直连:', JSON.stringify(report.steps.pathC).slice(0, 1500))

/* ============ 8. 磁盘验证 + network 事件 + 日志 ============ */
report.network = (cdp.events || [])
  .filter(e => e.method === 'Network.requestWillBeSent' || e.method === 'Network.loadingFailed')
  .map(e => e.method === 'Network.requestWillBeSent'
    ? { method: e.method, url: e.params.request.url, postData: String(e.params.request.postData || '').slice(0, 200) }
    : { method: e.method, error: e.params.errorText, url: e.params.requestId })
  .filter(x => x.url && (x.url.includes('/api/') || x.method === 'Network.loadingFailed'))

report.networkApiRequests = report.network.filter(n => n.url && n.url.includes('/api/'))

// 后端直连后，检查磁盘
const expectFiles = ['probe-backend-formdata.png', 'probe-backend-json.png']
report.disk = {}
for (const f of expectFiles) {
  const p = path.join(dataDir, 'images', f)
  try {
    const st = await stat(p)
    report.disk[f] = { exists: true, path: p, size: st.size }
  } catch (e) { report.disk[f] = { exists: false, path: p, error: String(e.code) } }
}
// 目录内容
try {
  const { readdir } = await import('node:fs/promises')
  report.imagesDir = { path: path.join(dataDir, 'images'), listing: await readdir(path.join(dataDir, 'images')) }
} catch (e) { report.imagesDir = { error: String(e) } }

/* ============ 9. CDP 侧控制台/异常 ============ */
report.console = (cdp.events || [])
  .filter(e => e.method === 'Runtime.consoleAPICalled')
  .map(e => ({ type: e.params.type, args: (e.params.args || []).map(a => String(a.value ?? a.description ?? a.type).slice(0, 300)) }))
  .filter(c => c.type === 'error' || c.type === 'warning')
  .slice(-40)
report.exceptions = (cdp.events || [])
  .filter(e => e.method === 'Runtime.exceptionThrown')
  .map(e => ({
    text: e.params.exceptionDetails?.text,
    description: String(e.params.exceptionDetails?.exception?.description || '').slice(0, 1200),
  }))

/* ============ 10. 最终页面状态 ============ */
report.steps.finalState = await evalT(`(() => {
  const a = window.__notekitApp
  return {
    fetchCalls: window.__probe?.fetchCalls ?? [],
    imgPasteCalls: window.__probe?.imgPasteCalls ?? null,
    pasteEvents: window.__probe?.pasteEvents ?? [],
    errors: window.__probe?.errors ?? [],
    rejections: window.__probe?.rejections ?? [],
    imgElements: document.querySelectorAll('.editor-view .element-img').length,
    editorInnerText: (document.querySelector('.editor-view')?.innerText || '').slice(0, 400),
  }
})()`).catch(e => ({ evalError: String(e) }))

report.childOut = childOut.slice(-6000)
report.finishedAt = new Date().toISOString()

await writeFile(path.join(outDir, 'image-paste-repro.json'), JSON.stringify(report, null, 2))
console.log('\n=== 报告已写入', path.join(outDir, 'image-paste-repro.json'), '===')

// 关闭
await ev(`window.close(); true`).catch(() => {})
await sleeps(800)
child.kill('SIGTERM'); await sleeps(1000)
try { child.kill('SIGKILL') } catch {}
process.exit(0)
